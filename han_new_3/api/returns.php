<?php
// api/returns.php
// API для работы с возвратами

require_once 'config.php';
require_once 'autoload.php'; // ← ДОСТАТОЧНО ОДИН РАЗ

class ReturnsController {
    private $db;
    private $user;
    
    public function __construct() {
        $this->db = Database::getInstance();
    }
    
    // Получить список возвратов
    public function index() {
        $this->user = Middleware::requirePermission('returns.view');
        
        $page = max(1, intval($_GET['page'] ?? 1));
        $pageSize = min(intval($_GET['page_size'] ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
        $offset = ($page - 1) * $pageSize;
        
        $filters = ["r.deleted_at IS NULL"];
        $params = [];
        
        if (!empty($_GET['date_from'])) {
            $filters[] = "DATE(r.created_at) >= ?";
            $params[] = $_GET['date_from'];
        }
        
        if (!empty($_GET['date_to'])) {
            $filters[] = "DATE(r.created_at) <= ?";
            $params[] = $_GET['date_to'];
        }
        
        if (!empty($_GET['sale_id'])) {
            $filters[] = "r.sale_id = ?";
            $params[] = $_GET['sale_id'];
        }
        
        $whereClause = "WHERE " . implode(" AND ", $filters);
        
        $total = $this->db->fetchOne(
            "SELECT COUNT(*) as count FROM returns r $whereClause",
            $params
        )['count'];
        
        $returns = $this->db->fetchAll(
            "SELECT 
                r.*,
                s.receipt_number,
                c.name as client_name,
                c.phone as client_phone,
                u.name as created_by_name
             FROM returns r
             JOIN sales s ON r.sale_id = s.id
             JOIN clients c ON s.client_id = c.id
             LEFT JOIN users u ON r.user_id = u.id
             $whereClause
             ORDER BY r.created_at DESC
             LIMIT ? OFFSET ?",
            array_merge($params, [$pageSize, $offset])
        );
        
        // Добавляем позиции к каждому возврату
        foreach ($returns as &$return) {
            $return['items'] = $this->db->fetchAll(
                "SELECT ri.*, p.name as product_name
                 FROM return_items ri
                 JOIN products p ON ri.product_id = p.id
                 WHERE ri.return_id = ?",
                [$return['id']]
            );
        }
        
        Response::paginated($returns, $total, $page, $pageSize);
    }
    
    // Получить один возврат
    public function show($id) {
        $this->user = Middleware::requirePermission('returns.view');
        
        $return = $this->db->fetchOne(
            "SELECT 
                r.*,
                s.receipt_number,
                c.name as client_name,
                c.phone as client_phone,
                u.name as created_by_name
             FROM returns r
             JOIN sales s ON r.sale_id = s.id
             JOIN clients c ON s.client_id = c.id
             LEFT JOIN users u ON r.user_id = u.id
             WHERE r.id = ? AND r.deleted_at IS NULL",
            [$id]
        );
        
        if (!$return) {
            Response::notFound('Возврат не найден');
        }
        
        $return['items'] = $this->db->fetchAll(
            "SELECT ri.*, p.name as product_name
             FROM return_items ri
             JOIN products p ON ri.product_id = p.id
             WHERE ri.return_id = ?",
            [$id]
        );
        
        Response::success($return);
    }
    
    // Создать возврат
    public function create() {
        $this->user = Middleware::requirePermission('returns.create');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'sale_id' => ['required' => true, 'numeric' => true],
            'items' => ['required' => true],
            'reason' => ['required' => true, 'min' => 3],
            'refund_method' => ['required' => true, 'in' => ['cash', 'overpayment', 'debt_reduction']]
        ]);
        
        if (empty($data['items']) || !is_array($data['items'])) {
            Response::error('Не указаны товары для возврата', 400);
        }
        
        // Проверка продажи
        $sale = $this->db->fetchOne(
            "SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL",
            [$data['sale_id']]
        );
        
        if (!$sale) {
            Response::notFound('Продажа не найдена');
        }
        
        try {
            $this->db->beginTransaction();
            
            // Проверка и расчет суммы возврата
            $totalAmount = 0;
            $validatedItems = [];
            
            foreach ($data['items'] as $item) {
                if (!isset($item['sale_item_id']) || !isset($item['quantity'])) {
                    continue;
                }
                
                // Проверка позиции продажи
                $saleItem = $this->db->fetchOne(
                    "SELECT * FROM sale_items WHERE id = ? AND sale_id = ?",
                    [$item['sale_item_id'], $data['sale_id']]
                );
                
                if (!$saleItem) {
                    $this->db->rollback();
                    Response::error("Позиция продажи {$item['sale_item_id']} не найдена", 400);
                }
                
                $quantity = intval($item['quantity']);
                $availableForReturn = $saleItem['quantity'] - $saleItem['returned_quantity'];
                
                if ($quantity > $availableForReturn) {
                    $this->db->rollback();
                    Response::error(
                        "Невозможно вернуть {$quantity} шт товара. Доступно для возврата: {$availableForReturn}",
                        400
                    );
                }
                
                $itemAmount = $quantity * $saleItem['price'];
                $totalAmount += $itemAmount;
                
                $validatedItems[] = [
                    'sale_item_id' => $item['sale_item_id'],
                    'product_id' => $saleItem['product_id'],
                    'quantity' => $quantity,
                    'price' => $saleItem['price'],
                    'amount' => $itemAmount
                ];
            }
            
            if (empty($validatedItems)) {
                $this->db->rollback();
                Response::error('Нет товаров для возврата', 400);
            }
            
            // Создание возврата (триггер обновит sales)
            $returnId = $this->db->insert(
                "INSERT INTO returns (sale_id, total_amount, reason, refund_method, user_id) 
                 VALUES (?, ?, ?, ?, ?)",
                [
                    $data['sale_id'],
                    $totalAmount,
                    $data['reason'],
                    $data['refund_method'],
                    $this->user['id']
                ]
            );
            
            // Создание позиций возврата (триггер вернет товар на склад)
            foreach ($validatedItems as $item) {
                $this->db->insert(
                    "INSERT INTO return_items (return_id, sale_item_id, product_id, quantity, price) 
                     VALUES (?, ?, ?, ?, ?)",
                    [
                        $returnId,
                        $item['sale_item_id'],
                        $item['product_id'],
                        $item['quantity'],
                        $item['price']
                    ]
                );
            }
            
            $this->db->commit();
            
            $created = $this->db->fetchOne(
                "SELECT 
                    r.*,
                    s.receipt_number,
                    c.name as client_name
                 FROM returns r
                 JOIN sales s ON r.sale_id = s.id
                 JOIN clients c ON s.client_id = c.id
                 WHERE r.id = ?",
                [$returnId]
            );
            
            $created['items'] = $this->db->fetchAll(
                "SELECT ri.*, p.name as product_name
                 FROM return_items ri
                 JOIN products p ON ri.product_id = p.id
                 WHERE ri.return_id = ?",
                [$returnId]
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'create',
                'return',
                $returnId,
                "Возврат по чеку №{$sale['receipt_number']} на {$totalAmount} сом"
            );
            
            Response::success($created, 'Возврат оформлен', 201);
            
        } catch (Exception $e) {
            $this->db->rollback();
            error_log("Return creation error: " . $e->getMessage());
            Response::error('Ошибка оформления возврата: ' . $e->getMessage(), 500);
        }
    }
    
    // Статистика возвратов
    public function stats() {
        $this->user = Middleware::requirePermission('returns.view');
        
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        $stats = $this->db->fetchOne(
            "SELECT 
                COUNT(*) as total_returns,
                SUM(total_amount) as total_amount,
                AVG(total_amount) as avg_amount
             FROM returns
             WHERE deleted_at IS NULL
             AND DATE(created_at) BETWEEN ? AND ?",
            [$dateFrom, $dateTo]
        );
        
        // По товарам
        $byProduct = $this->db->fetchAll(
            "SELECT 
                p.name as product_name,
                SUM(ri.quantity) as total_quantity,
                SUM(ri.quantity * ri.price) as total_amount
             FROM return_items ri
             JOIN returns r ON ri.return_id = r.id
             JOIN products p ON ri.product_id = p.id
             WHERE r.deleted_at IS NULL
             AND DATE(r.created_at) BETWEEN ? AND ?
             GROUP BY p.id, p.name
             ORDER BY total_amount DESC",
            [$dateFrom, $dateTo]
        );
        
        Response::success([
            'overall' => $stats,
            'by_product' => $byProduct
        ]);
    }
}

// Маршрутизация
$controller = new ReturnsController();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'index';
$id = $_GET['id'] ?? null;

try {
    switch ($action) {
        case 'index':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->index();
            break;
            
        case 'show':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            if (!$id) Response::error('ID не указан', 400);
            $controller->show($id);
            break;
            
        case 'create':
            if ($method !== 'POST') Response::error('Method not allowed', 405);
            $controller->create();
            break;
            
        case 'stats':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->stats();
            break;
            
        default:
            Response::error('Unknown action', 404);
    }
} catch (Exception $e) {
    error_log("Returns API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера', 500);
}