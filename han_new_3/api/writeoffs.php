<?php
// api/writeoffs.php - Списания товаров (брак, порча, истечение срока)

require_once 'config.php';
require_once 'autoload.php';

class WriteOffsController {
    private $user;
    private $productService;
    private $db;
    
    public function __construct() {
        $this->productService = new ProductService();
        $this->db = Database::getInstance();
    }
    
    // Получить журнал списаний
    public function index() {
        $this->user = Middleware::requirePermission('writeoffs.view');
        
        $page = max(1, intval($_GET['page'] ?? 1));
        $pageSize = min(intval($_GET['page_size'] ?? 50), MAX_PAGE_SIZE);
        $offset = ($page - 1) * $pageSize;
        
        $filters = ["w.deleted_at IS NULL"];
        $params = [];
        
        if (!empty($_GET['date_from'])) {
            $filters[] = "DATE(w.created_at) >= ?";
            $params[] = $_GET['date_from'];
        }
        
        if (!empty($_GET['date_to'])) {
            $filters[] = "DATE(w.created_at) <= ?";
            $params[] = $_GET['date_to'];
        }
        
        if (!empty($_GET['product_id'])) {
            $filters[] = "w.product_id = ?";
            $params[] = $_GET['product_id'];
        }
        
        if (!empty($_GET['type'])) {
            if (!in_array($_GET['type'], ['defect', 'expired', 'damage', 'other'])) {
                Response::error('Некорректный тип списания', 400);
            }
            $filters[] = "w.type = ?";
            $params[] = $_GET['type'];
        }
        
        $whereClause = "WHERE " . implode(" AND ", $filters);
        
        try {
            // Подсчёт общего количества
            $total = $this->db->fetchOne(
                "SELECT COUNT(*) as count FROM write_offs w $whereClause",
                $params
            )['count'];
            
            // Получение записей
            $writeOffs = $this->db->fetchAll(
                "SELECT 
                    w.*,
                    p.name as product_name,
                    p.price,
                    u.name as user_name
                 FROM write_offs w
                 JOIN products p ON w.product_id = p.id
                 LEFT JOIN users u ON w.user_id = u.id
                 $whereClause
                 ORDER BY w.created_at DESC
                 LIMIT ? OFFSET ?",
                array_merge($params, [$pageSize, $offset])
            );
            
            Response::paginated($writeOffs, $total, $page, $pageSize);
        } catch (Exception $e) {
            error_log("WriteOffs index error: " . $e->getMessage());
            Response::error('Ошибка загрузки списаний', 500);
        }
    }
    
    // Получить одно списание
    public function show($id) {
        $this->user = Middleware::requirePermission('writeoffs.view');
        
        try {
            $writeOff = $this->db->fetchOne(
                "SELECT 
                    w.*,
                    p.name as product_name,
                    p.price,
                    u.name as user_name
                 FROM write_offs w
                 JOIN products p ON w.product_id = p.id
                 LEFT JOIN users u ON w.user_id = u.id
                 WHERE w.id = ? AND w.deleted_at IS NULL",
                [$id]
            );
            
            if (!$writeOff) {
                Response::notFound('Списание не найдено');
            }
            
            Response::success($writeOff);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Создать списание
    public function create() {
        $this->user = Middleware::requirePermission('writeoffs.create');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'product_id' => ['required' => true, 'numeric' => true],
            'quantity' => ['required' => true, 'numeric' => true, 'min_value' => 1],
            'type' => ['required' => true, 'in' => ['defect', 'expired', 'damage', 'other']],
            'reason' => ['required' => true, 'min' => 3, 'max' => 500]
        ]);
        
        try {
            $result = $this->productService->writeOff(
                intval($data['product_id']),
                intval($data['quantity']),
                $data['type'],
                $data['reason'],
                $this->user['id']
            );
            
            // Получаем детали для логирования
            $product = $this->db->fetchOne(
                "SELECT name FROM products WHERE id = ?",
                [$data['product_id']]
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'create',
                'writeoff',
                $result['writeoff_id'],
                "Списано: {$product['name']} ({$data['quantity']} шт.) - {$data['reason']}"
            );
            
            Response::success($result, 'Списание оформлено', 201);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Удалить списание
    public function delete($id) {
        $this->user = Middleware::requirePermission('writeoffs.delete');
        
        // Только для админов
        if ($this->user['role'] !== 'admin') {
            Response::forbidden('Только администратор может удалять списания');
        }
        
        try {
            $writeOff = $this->db->fetchOne(
                "SELECT * FROM write_offs WHERE id = ? AND deleted_at IS NULL",
                [$id]
            );
            
            if (!$writeOff) {
                Response::notFound('Списание не найдено');
            }
            
            $this->db->beginTransaction();
            
            // Возвращаем товар на склад
            $stockService = new StockService();
            $stockService->increaseStock(
                $writeOff['product_id'],
                $writeOff['quantity'],
                'adjustment',
                $id,
                $this->user['id'],
                "Отмена списания #{$id}"
            );
            
            // Soft delete списания
            $this->db->update(
                "UPDATE write_offs SET deleted_at = NOW() WHERE id = ?",
                [$id]
            );
            
            $this->db->commit();
            
            Middleware::logActivity(
                $this->user['id'],
                'delete',
                'writeoff',
                $id,
                "Отменено списание: {$writeOff['quantity']} шт."
            );
            
            Response::success(null, 'Списание отменено, товар возвращён на склад');
            
        } catch (Exception $e) {
            $this->db->rollback();
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Статистика списаний
    public function stats() {
        $this->user = Middleware::requirePermission('writeoffs.view');
        
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            // Общая статистика
            $overall = $this->db->fetchOne(
                "SELECT 
                    COUNT(*) as total_records,
                    SUM(quantity) as total_quantity,
                    COUNT(DISTINCT product_id) as unique_products
                 FROM write_offs
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?",
                [$dateFrom, $dateTo]
            );
            
            // По типам
            $byType = $this->db->fetchAll(
                "SELECT 
                    type,
                    COUNT(*) as count,
                    SUM(quantity) as total_quantity
                 FROM write_offs
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?
                 GROUP BY type
                 ORDER BY total_quantity DESC",
                [$dateFrom, $dateTo]
            );
            
            // По товарам
            $byProduct = $this->db->fetchAll(
                "SELECT 
                    p.id,
                    p.name,
                    p.price,
                    COUNT(w.id) as writeoff_count,
                    SUM(w.quantity) as total_quantity,
                    SUM(w.quantity * p.price) as total_cost
                 FROM write_offs w
                 JOIN products p ON w.product_id = p.id
                 WHERE w.deleted_at IS NULL
                 AND DATE(w.created_at) BETWEEN ? AND ?
                 GROUP BY p.id, p.name, p.price
                 ORDER BY total_quantity DESC
                 LIMIT 20",
                [$dateFrom, $dateTo]
            );
            
            // По дням
            $byDay = $this->db->fetchAll(
                "SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as count,
                    SUM(quantity) as total_quantity
                 FROM write_offs
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?
                 GROUP BY DATE(created_at)
                 ORDER BY date DESC",
                [$dateFrom, $dateTo]
            );
            
            Response::success([
                'period' => [
                    'date_from' => $dateFrom,
                    'date_to' => $dateTo
                ],
                'overall' => $overall,
                'by_type' => $byType,
                'by_product' => $byProduct,
                'by_day' => $byDay
            ]);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Экспорт списаний
    public function export() {
        $this->user = Middleware::requirePermission('writeoffs.view');
        
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            $writeOffs = $this->db->fetchAll(
                "SELECT 
                    w.id,
                    w.created_at,
                    p.name as product_name,
                    w.quantity,
                    w.type,
                    w.reason,
                    u.name as created_by
                 FROM write_offs w
                 JOIN products p ON w.product_id = p.id
                 LEFT JOIN users u ON w.user_id = u.id
                 WHERE w.deleted_at IS NULL
                 AND DATE(w.created_at) BETWEEN ? AND ?
                 ORDER BY w.created_at DESC",
                [$dateFrom, $dateTo]
            );
            
            if (empty($writeOffs)) {
                Response::error('Нет данных для экспорта', 404);
            }
            
            // Формируем CSV
            $filename = "writeoffs_{$dateFrom}_{$dateTo}.csv";
            
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            
            $output = fopen('php://output', 'w');
            
            // UTF-8 BOM
            fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
            
            // Заголовки
            fputcsv($output, [
                'ID',
                'Дата',
                'Товар',
                'Количество',
                'Тип',
                'Причина',
                'Создал'
            ]);
            
            // Данные
            foreach ($writeOffs as $row) {
                fputcsv($output, [
                    $row['id'],
                    $row['created_at'],
                    $row['product_name'],
                    $row['quantity'],
                    $row['type'],
                    $row['reason'],
                    $row['created_by']
                ]);
            }
            
            fclose($output);
            exit;
            
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Топ товаров по списаниям
    public function topProducts() {
        $this->user = Middleware::requirePermission('writeoffs.view');
        
        $limit = min(intval($_GET['limit'] ?? 10), 50);
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            $topProducts = $this->db->fetchAll(
                "SELECT 
                    p.id,
                    p.name,
                    p.price,
                    COUNT(w.id) as writeoff_count,
                    SUM(w.quantity) as total_quantity,
                    SUM(w.quantity * p.price) as total_cost
                 FROM write_offs w
                 JOIN products p ON w.product_id = p.id
                 WHERE w.deleted_at IS NULL
                 AND DATE(w.created_at) BETWEEN ? AND ?
                 GROUP BY p.id, p.name, p.price
                 ORDER BY total_quantity DESC
                 LIMIT ?",
                [$dateFrom, $dateTo, $limit]
            );
            
            Response::success([
                'period' => [
                    'date_from' => $dateFrom,
                    'date_to' => $dateTo
                ],
                'limit' => $limit,
                'products' => $topProducts
            ]);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
}

// Маршрутизация
$controller = new WriteOffsController();
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
            
        case 'delete':
            if ($method !== 'DELETE') Response::error('Method not allowed', 405);
            if (!$id) Response::error('ID не указан', 400);
            $controller->delete($id);
            break;
            
        case 'stats':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->stats();
            break;
            
        case 'export':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->export();
            break;
            
        case 'top-products':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->topProducts();
            break;
            
        default:
            Response::error('Unknown action', 404);
    }
} catch (Exception $e) {
    error_log("WriteOffs API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера', 500);
}