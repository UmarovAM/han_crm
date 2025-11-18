<?php
// api/stock.php - Управление складом и остатками

require_once 'config.php';
require_once 'autoload.php';

class StockController {
    private $user;
    private $stockService;
    private $db;
    
    public function __construct() {
        $this->stockService = new StockService();
        $this->db = Database::getInstance();
    }
    
    // Получить все остатки
    public function index() {
        $this->user = Middleware::requirePermission('products.view');
        
        try {
            $stock = $this->stockService->getAllStock();
            
            // Группируем по статусам
            $statistics = [
                'total_products' => count($stock),
                'out_of_stock' => count(array_filter($stock, fn($item) => $item['quantity'] == 0)),
                'low_stock' => count(array_filter($stock, fn($item) => $item['quantity'] > 0 && $item['quantity'] < 10)),
                'in_stock' => count(array_filter($stock, fn($item) => $item['quantity'] >= 10)),
                'total_quantity' => array_sum(array_column($stock, 'quantity'))
            ];
            
            Response::success([
                'items' => $stock,
                'statistics' => $statistics
            ]);
        } catch (Exception $e) {
            error_log("Stock index error: " . $e->getMessage());
            Response::error('Ошибка загрузки остатков', 500);
        }
    }
    
    // Получить остаток конкретного товара
    public function show($id) {
        $this->user = Middleware::requirePermission('products.view');
        
        try {
            $quantity = $this->stockService->getQuantity($id);
            
            // Получаем информацию о товаре
            $product = $this->db->fetchOne(
                "SELECT * FROM products WHERE id = ? AND deleted_at IS NULL",
                [$id]
            );
            
            if (!$product) {
                Response::notFound('Товар не найден');
            }
            
            // История движений
            $movements = $this->stockService->getMovements($id, 50);
            
            Response::success([
                'product_id' => intval($id),
                'product_name' => $product['name'],
                'quantity' => $quantity,
                'price' => floatval($product['price']),
                'movements' => $movements
            ]);
        } catch (Exception $e) {
            error_log("Stock show error: " . $e->getMessage());
            Response::error('Ошибка загрузки остатка', 500);
        }
    }
    
    // Корректировка остатка (инвентаризация)
    public function adjust($id) {
        $this->user = Middleware::requirePermission('products.edit');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'new_quantity' => ['required' => true, 'numeric' => true, 'min_value' => 0],
            'reason' => ['required' => true, 'min' => 3]
        ]);
        
        try {
            $result = $this->stockService->adjustStock(
                intval($id),
                intval($data['new_quantity']),
                $this->user['id'],
                $data['reason']
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'adjust_stock',
                'product',
                $id,
                "Корректировка: {$result['quantity_change']} → {$result['quantity_after']}"
            );
            
            Response::success($result, 'Остаток скорректирован');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Получить движения товаров
    public function movements() {
        $this->user = Middleware::requirePermission('products.view');
        
        $productId = $_GET['product_id'] ?? null;
        $limit = min(intval($_GET['limit'] ?? 100), 500);
        
        try {
            $movements = $this->stockService->getMovements($productId, $limit);
            Response::success($movements);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Статистика движений
    public function movementStats() {
        $this->user = Middleware::requirePermission('products.view');
        
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            // Движения по типам
            $byType = $this->db->fetchAll(
                "SELECT 
                    movement_type,
                    COUNT(*) as count,
                    SUM(ABS(quantity_change)) as total_quantity
                 FROM stock_movements
                 WHERE DATE(created_at) BETWEEN ? AND ?
                 GROUP BY movement_type
                 ORDER BY total_quantity DESC",
                [$dateFrom, $dateTo]
            );
            
            // Движения по товарам
            $byProduct = $this->db->fetchAll(
                "SELECT 
                    sm.product_id,
                    p.name as product_name,
                    COUNT(*) as movements_count,
                    SUM(CASE WHEN sm.quantity_change > 0 THEN sm.quantity_change ELSE 0 END) as total_increase,
                    SUM(CASE WHEN sm.quantity_change < 0 THEN ABS(sm.quantity_change) ELSE 0 END) as total_decrease
                 FROM stock_movements sm
                 JOIN products p ON sm.product_id = p.id
                 WHERE DATE(sm.created_at) BETWEEN ? AND ?
                 GROUP BY sm.product_id, p.name
                 ORDER BY movements_count DESC
                 LIMIT 20",
                [$dateFrom, $dateTo]
            );
            
            // Общая статистика
            $overall = $this->db->fetchOne(
                "SELECT 
                    COUNT(*) as total_movements,
                    SUM(CASE WHEN quantity_change > 0 THEN quantity_change ELSE 0 END) as total_increase,
                    SUM(CASE WHEN quantity_change < 0 THEN ABS(quantity_change) ELSE 0 END) as total_decrease
                 FROM stock_movements
                 WHERE DATE(created_at) BETWEEN ? AND ?",
                [$dateFrom, $dateTo]
            );
            
            Response::success([
                'period' => [
                    'date_from' => $dateFrom,
                    'date_to' => $dateTo
                ],
                'overall' => $overall,
                'by_type' => $byType,
                'by_product' => $byProduct
            ]);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Товары с низким остатком
    public function lowStock() {
        $this->user = Middleware::requirePermission('products.view');
        
        $threshold = intval($_GET['threshold'] ?? 10);
        
        try {
            $lowStock = $this->db->fetchAll(
                "SELECT 
                    p.id,
                    p.name,
                    p.price,
                    COALESCE(s.quantity, 0) as quantity
                 FROM products p
                 LEFT JOIN stock s ON p.id = s.product_id
                 WHERE p.deleted_at IS NULL
                 AND p.is_active = 1
                 AND COALESCE(s.quantity, 0) < ?
                 ORDER BY quantity ASC, p.name",
                [$threshold]
            );
            
            Response::success([
                'threshold' => $threshold,
                'count' => count($lowStock),
                'items' => $lowStock
            ]);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Товары без движения
    public function dormantProducts() {
        $this->user = Middleware::requirePermission('products.view');
        
        $days = intval($_GET['days'] ?? 30);
        
        try {
            $dormant = $this->db->fetchAll(
                "SELECT 
                    p.id,
                    p.name,
                    p.price,
                    COALESCE(s.quantity, 0) as quantity,
                    (SELECT MAX(created_at) 
                     FROM stock_movements 
                     WHERE product_id = p.id) as last_movement
                 FROM products p
                 LEFT JOIN stock s ON p.id = s.product_id
                 WHERE p.deleted_at IS NULL
                 AND p.is_active = 1
                 AND (
                     (SELECT MAX(created_at) FROM stock_movements WHERE product_id = p.id) IS NULL
                     OR
                     (SELECT MAX(created_at) FROM stock_movements WHERE product_id = p.id) < DATE_SUB(NOW(), INTERVAL ? DAY)
                 )
                 ORDER BY last_movement DESC, p.name
                 LIMIT 50",
                [$days]
            );
            
            Response::success([
                'days' => $days,
                'count' => count($dormant),
                'items' => $dormant
            ]);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Сверка остатков (проверка целостности)
    public function reconciliation() {
        $this->user = Middleware::requirePermission('products.edit');
        
        try {
            // Сравниваем stock с расчётным из stock_movements
            $discrepancies = $this->db->fetchAll(
                "SELECT 
                    p.id,
                    p.name,
                    COALESCE(s.quantity, 0) as current_stock,
                    COALESCE(
                        (SELECT SUM(quantity_change) 
                         FROM stock_movements 
                         WHERE product_id = p.id), 
                        0
                    ) as calculated_stock,
                    (COALESCE(s.quantity, 0) - COALESCE(
                        (SELECT SUM(quantity_change) 
                         FROM stock_movements 
                         WHERE product_id = p.id), 
                        0
                    )) as difference
                 FROM products p
                 LEFT JOIN stock s ON p.id = s.product_id
                 WHERE p.deleted_at IS NULL
                 HAVING difference != 0
                 ORDER BY ABS(difference) DESC"
            );
            
            Response::success([
                'discrepancies_count' => count($discrepancies),
                'discrepancies' => $discrepancies,
                'status' => empty($discrepancies) ? 'OK' : 'DISCREPANCIES_FOUND'
            ]);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Массовая корректировка (опасно!)
    public function massAdjust() {
        $this->user = Middleware::requirePermission('products.edit');
        
        // Только для админа
        if ($this->user['role'] !== 'admin') {
            Response::forbidden('Только администратор может выполнить массовую корректировку');
        }
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($data['adjustments']) || !is_array($data['adjustments'])) {
            Response::error('Некорректные данные', 400);
        }
        
        $this->db->beginTransaction();
        
        try {
            $adjusted = 0;
            $errors = [];
            
            foreach ($data['adjustments'] as $adjustment) {
                if (!isset($adjustment['product_id']) || !isset($adjustment['new_quantity'])) {
                    $errors[] = "Пропущено: некорректные данные";
                    continue;
                }
                
                try {
                    $this->stockService->adjustStock(
                        intval($adjustment['product_id']),
                        intval($adjustment['new_quantity']),
                        $this->user['id'],
                        $adjustment['reason'] ?? 'Массовая корректировка'
                    );
                    $adjusted++;
                } catch (Exception $e) {
                    $errors[] = "Товар #{$adjustment['product_id']}: {$e->getMessage()}";
                }
            }
            
            $this->db->commit();
            
            Middleware::logActivity(
                $this->user['id'],
                'mass_adjust_stock',
                'stock',
                null,
                "Массовая корректировка: {$adjusted} товаров"
            );
            
            Response::success([
                'adjusted_count' => $adjusted,
                'errors' => $errors
            ], 'Корректировка выполнена');
            
        } catch (Exception $e) {
            $this->db->rollback();
            Response::error($e->getMessage(), 500);
        }
    }
}

// Маршрутизация
$controller = new StockController();
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
            
        case 'adjust':
            if ($method !== 'POST') Response::error('Method not allowed', 405);
            if (!$id) Response::error('ID не указан', 400);
            $controller->adjust($id);
            break;
            
        case 'movements':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->movements();
            break;
            
        case 'movement-stats':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->movementStats();
            break;
            
        case 'low-stock':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->lowStock();
            break;
            
        case 'dormant':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->dormantProducts();
            break;
            
        case 'reconciliation':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->reconciliation();
            break;
            
        case 'mass-adjust':
            if ($method !== 'POST') Response::error('Method not allowed', 405);
            $controller->massAdjust();
            break;
            
        default:
            Response::error('Unknown action', 404);
    }
} catch (Exception $e) {
    error_log("Stock API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера', 500);
}