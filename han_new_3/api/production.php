<?php
// api/production.php - НОВАЯ ВЕРСИЯ (использует ProductService)

require_once 'config.php';
require_once 'autoload.php';

class ProductionController {
    private $user;
    private $productService;
    
    public function __construct() {
        $this->productService = new ProductService();
    }
    
    // Получить журнал производства
    public function index() {
        $this->user = Middleware::requirePermission('production.view');
        
        $filters = [];
        
        if (!empty($_GET['date_from'])) {
            $filters['date_from'] = $_GET['date_from'];
        }
        
        if (!empty($_GET['date_to'])) {
            $filters['date_to'] = $_GET['date_to'];
        }
        
        if (!empty($_GET['product_id'])) {
            $filters['product_id'] = $_GET['product_id'];
        }
        
        if (!empty($_GET['shift'])) {
            if (!in_array($_GET['shift'], ['day', 'night'])) {
                Response::error('Некорректная смена', 400);
            }
            $filters['shift'] = $_GET['shift'];
        }
        
        try {
            $production = $this->productService->getProduction($filters);
            Response::success($production);
        } catch (Exception $e) {
            error_log("Production index error: " . $e->getMessage());
            Response::error('Ошибка загрузки производства', 500);
        }
    }
    
    // Добавить производство
    public function create() {
        $this->user = Middleware::requirePermission('production.create');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'product_id' => ['required' => true, 'numeric' => true],
            'quantity' => ['required' => true, 'numeric' => true, 'min_value' => 1],
            'shift' => ['required' => true, 'in' => ['day', 'night']]
        ]);
        
        try {
            $result = $this->productService->addProduction(
                intval($data['product_id']),
                intval($data['quantity']),
                $data['shift'],
                $this->user['id'],
                $data['note'] ?? null
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'create',
                'production',
                $result['production_id'],
                "Производство: {$data['quantity']} шт. ({$data['shift']} смена)"
            );
            
            Response::success($result, 'Производство добавлено', 201);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Удалить запись производства
    public function delete($id) {
        $this->user = Middleware::requirePermission('production.delete');
        
        try {
            $db = Database::getInstance();
            
            // Получаем запись производства
            $production = $db->fetchOne(
                "SELECT * FROM production WHERE id = ? AND deleted_at IS NULL",
                [$id]
            );
            
            if (!$production) {
                Response::notFound('Запись производства не найдена');
            }
            
            $db->beginTransaction();
            
            // Уменьшаем остаток (откат производства)
            $stockService = new StockService();
            $stockService->decreaseStock(
                $production['product_id'],
                $production['quantity'],
                'adjustment',
                $id,
                $this->user['id'],
                "Удаление записи производства #{$id}"
            );
            
            // Soft delete производства
            $db->update(
                "UPDATE production SET deleted_at = NOW() WHERE id = ?",
                [$id]
            );
            
            $db->commit();
            
            Middleware::logActivity(
                $this->user['id'],
                'delete',
                'production',
                $id,
                "Удалена запись производства: {$production['quantity']} шт."
            );
            
            Response::success(null, 'Запись производства удалена');
            
        } catch (Exception $e) {
            $db->rollback();
            error_log("Production deletion error: " . $e->getMessage());
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Получить статистику производства
    public function stats() {
        $this->user = Middleware::requirePermission('production.view');
        
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            $db = Database::getInstance();
            
            // Общая статистика
            $overall = $db->fetchOne(
                "SELECT 
                    COUNT(*) as total_records,
                    SUM(quantity) as total_quantity,
                    COUNT(DISTINCT product_id) as products_count,
                    COUNT(DISTINCT DATE(created_at)) as days_with_production
                 FROM production
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?",
                [$dateFrom, $dateTo]
            );
            
            // По сменам
            $byShift = $db->fetchAll(
                "SELECT 
                    shift,
                    COUNT(*) as records_count,
                    SUM(quantity) as total_quantity
                 FROM production
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?
                 GROUP BY shift",
                [$dateFrom, $dateTo]
            );
            
            // По товарам
            $byProduct = $db->fetchAll(
                "SELECT 
                    p.id,
                    p.name,
                    SUM(pr.quantity) as total_quantity,
                    COUNT(*) as records_count
                 FROM production pr
                 JOIN products p ON pr.product_id = p.id
                 WHERE pr.deleted_at IS NULL
                 AND DATE(pr.created_at) BETWEEN ? AND ?
                 GROUP BY p.id, p.name
                 ORDER BY total_quantity DESC",
                [$dateFrom, $dateTo]
            );
            
            Response::success([
                'overall' => $overall,
                'by_shift' => $byShift,
                'by_product' => $byProduct
            ]);
            
        } catch (Exception $e) {
            error_log("Production stats error: " . $e->getMessage());
            Response::error('Ошибка получения статистики', 500);
        }
    }
}

// Маршрутизация
$controller = new ProductionController();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'index';
$id = $_GET['id'] ?? null;

try {
    switch ($action) {
        case 'index':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->index();
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
            
        default:
            Response::error('Unknown action', 404);
    }
} catch (Exception $e) {
    error_log("Production API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера', 500);
}