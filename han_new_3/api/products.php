<?php
// api/products.php - НОВАЯ ВЕРСИЯ (использует ProductService)

require_once 'config.php';
require_once 'autoload.php';

class ProductsController {
    private $user;
    private $productService;
    
    public function __construct() {
        $this->productService = new ProductService();
    }
    
    // Получить список товаров
    public function index() {
        $this->user = Middleware::requirePermission('products.view');
        
        $page = max(1, intval($_GET['page'] ?? 1));
        $pageSize = min(intval($_GET['page_size'] ?? 100), MAX_PAGE_SIZE);
        $search = $_GET['search'] ?? '';
        $activeOnly = isset($_GET['active_only']) && $_GET['active_only'] === 'true';
        
        try {
            $result = $this->productService->getProducts($page, $pageSize, $search, $activeOnly);
            Response::paginated($result['items'], $result['total'], $page, $pageSize);
        } catch (Exception $e) {
            error_log("Products index error: " . $e->getMessage());
            Response::error('Ошибка загрузки товаров', 500);
        }
    }
    
    // Получить один товар
    public function show($id) {
        $this->user = Middleware::requirePermission('products.view');
        
        try {
            $product = $this->productService->getProduct($id);
            Response::success($product);
        } catch (Exception $e) {
            if ($e->getMessage() === 'Товар не найден') {
                Response::notFound($e->getMessage());
            }
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Создать товар
    public function create() {
        $this->user = Middleware::requirePermission('products.create');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'name' => ['required' => true, 'min' => 2, 'max' => 200],
            'price' => ['required' => true, 'numeric' => true, 'min_value' => 0]
        ]);
        
        $data = Middleware::sanitize($data);
        
        try {
            $product = $this->productService->createProduct($data, $this->user['id']);
            
            Middleware::logActivity(
                $this->user['id'],
                'create',
                'product',
                $product['id'],
                "Создан товар: {$data['name']}"
            );
            
            Response::success($product, 'Товар создан', 201);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Обновить товар
    public function update($id) {
        $this->user = Middleware::requirePermission('products.edit');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'name' => ['min' => 2, 'max' => 200],
            'price' => ['numeric' => true, 'min_value' => 0]
        ]);
        
        $data = Middleware::sanitize($data);
        
        try {
            $product = $this->productService->updateProduct($id, $data, $this->user['id']);
            
            Middleware::logActivity(
                $this->user['id'],
                'update',
                'product',
                $id,
                "Обновлен товар: {$product['name']}"
            );
            
            Response::success($product, 'Товар обновлён');
        } catch (Exception $e) {
            if ($e->getMessage() === 'Товар не найден') {
                Response::notFound($e->getMessage());
            }
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Массовое обновление цен
    public function updatePrices() {
        $this->user = Middleware::requirePermission('products.edit');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!is_array($data) || empty($data)) {
            Response::error('Некорректные данные', 400);
        }
        
        try {
            $result = $this->productService->updatePrices($data, $this->user['id']);
            
            Middleware::logActivity(
                $this->user['id'],
                'update_prices',
                'product',
                null,
                "Массовое обновление цен: {$result['updated_count']} товаров"
            );
            
            Response::success($result, 'Цены обновлены');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Удалить товар
    public function delete($id) {
        $this->user = Middleware::requirePermission('products.delete');
        
        try {
            $product = $this->productService->getProduct($id);
            
            $this->productService->deleteProduct($id, $this->user['id']);
            
            Middleware::logActivity(
                $this->user['id'],
                'delete',
                'product',
                $id,
                "Удален товар: {$product['name']}"
            );
            
            Response::success(null, 'Товар удалён');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Получить остатки на складе
    public function stock() {
        $this->user = Middleware::requirePermission('products.view');
        
        try {
            $stock = $this->productService->getStock();
            Response::success($stock);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Корректировка остатка
    public function adjustStock($id) {
        $this->user = Middleware::requirePermission('products.edit');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'new_quantity' => ['required' => true, 'numeric' => true, 'min_value' => 0],
            'reason' => ['required' => true, 'min' => 3]
        ]);
        
        try {
            $result = $this->productService->adjustStock(
                $id,
                intval($data['new_quantity']),
                $this->user['id'],
                $data['reason']
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'adjust_stock',
                'product',
                $id,
                "Корректировка остатка: {$result['quantity_change']}"
            );
            
            Response::success($result, 'Остаток скорректирован');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Списать товар (брак, порча)
    public function writeOff() {
        $this->user = Middleware::requirePermission('writeoffs.create');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'product_id' => ['required' => true, 'numeric' => true],
            'quantity' => ['required' => true, 'numeric' => true, 'min_value' => 1],
            'type' => ['required' => true, 'in' => ['defect', 'expired', 'damage', 'other']],
            'reason' => ['required' => true, 'min' => 3]
        ]);
        
        try {
            $result = $this->productService->writeOff(
                intval($data['product_id']),
                intval($data['quantity']),
                $data['type'],
                $data['reason'],
                $this->user['id']
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'writeoff',
                'product',
                $data['product_id'],
                "Списано: {$data['quantity']} шт. Причина: {$data['reason']}"
            );
            
            Response::success($result, 'Товар списан', 201);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Получить журнал списаний
    public function writeOffs() {
        $this->user = Middleware::requirePermission('writeoffs.view');
        
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
        
        if (!empty($_GET['type'])) {
            $filters['type'] = $_GET['type'];
        }
        
        try {
            $writeOffs = $this->productService->getWriteOffs($filters);
            Response::success($writeOffs);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
}

// Маршрутизация
$controller = new ProductsController();
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
            
        case 'update':
            if ($method !== 'PUT') Response::error('Method not allowed', 405);
            if (!$id) Response::error('ID не указан', 400);
            $controller->update($id);
            break;
            
        case 'update-prices':
            if ($method !== 'PUT') Response::error('Method not allowed', 405);
            $controller->updatePrices();
            break;
            
        case 'delete':
            if ($method !== 'DELETE') Response::error('Method not allowed', 405);
            if (!$id) Response::error('ID не указан', 400);
            $controller->delete($id);
            break;
            
        case 'stock':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->stock();
            break;
            
        case 'adjust-stock':
            if ($method !== 'POST') Response::error('Method not allowed', 405);
            if (!$id) Response::error('ID не указан', 400);
            $controller->adjustStock($id);
            break;
            
        case 'writeoff':
            if ($method !== 'POST') Response::error('Method not allowed', 405);
            $controller->writeOff();
            break;
            
        case 'writeoffs':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->writeOffs();
            break;
            
        default:
            Response::error('Unknown action', 404);
    }
} catch (Exception $e) {
    error_log("Products API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера', 500);
}