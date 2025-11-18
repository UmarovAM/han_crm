<?php
// api/clients.php - НОВАЯ ВЕРСИЯ (использует ClientService)

require_once 'config.php';
require_once 'autoload.php';

class ClientsController {
    private $user;
    private $clientService;
    
    public function __construct() {
        $this->clientService = new ClientService();
    }
    
    // Получить список клиентов
    public function index() {
        $this->user = Middleware::requirePermission('clients.view');
        
        $page = max(1, intval($_GET['page'] ?? 1));
        $pageSize = min(intval($_GET['page_size'] ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
        $search = $_GET['search'] ?? '';
        
        try {
            $result = $this->clientService->getClients($page, $pageSize, $search);
            Response::paginated($result['items'], $result['total'], $page, $pageSize);
        } catch (Exception $e) {
            error_log("Clients index error: " . $e->getMessage());
            Response::error('Ошибка загрузки клиентов', 500);
        }
    }
    
    // Получить одного клиента
    public function show($id) {
        $this->user = Middleware::requirePermission('clients.view');
        
        try {
            $client = $this->clientService->getClient($id);
            Response::success($client);
        } catch (Exception $e) {
            if ($e->getMessage() === 'Клиент не найден') {
                Response::notFound($e->getMessage());
            }
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Создать клиента
    public function create() {
        $this->user = Middleware::requirePermission('clients.create');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'name' => ['required' => true, 'min' => 2, 'max' => 200],
            'phone' => ['max' => 20],
            'address' => ['max' => 500]
        ]);
        
        $data = Middleware::sanitize($data);
        
        try {
            $client = $this->clientService->createClient($data, $this->user['id']);
            
            Middleware::logActivity(
                $this->user['id'],
                'create',
                'client',
                $client['id'],
                "Создан клиент: {$data['name']}"
            );
            
            Response::success($client, 'Клиент создан', 201);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Обновить клиента
    public function update($id) {
        $this->user = Middleware::requirePermission('clients.edit');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'name' => ['min' => 2, 'max' => 200],
            'phone' => ['max' => 20],
            'address' => ['max' => 500]
        ]);
        
        $data = Middleware::sanitize($data);
        
        try {
            $client = $this->clientService->updateClient($id, $data, $this->user['id']);
            
            Middleware::logActivity(
                $this->user['id'],
                'update',
                'client',
                $id,
                "Обновлен клиент: {$client['name']}"
            );
            
            Response::success($client, 'Клиент обновлён');
        } catch (Exception $e) {
            if ($e->getMessage() === 'Клиент не найден') {
                Response::notFound($e->getMessage());
            }
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Удалить клиента
    public function delete($id) {
        $this->user = Middleware::requirePermission('clients.delete');
        
        try {
            $client = $this->clientService->getClient($id);
            
            $this->clientService->deleteClient($id, $this->user['id']);
            
            Middleware::logActivity(
                $this->user['id'],
                'delete',
                'client',
                $id,
                "Удален клиент: {$client['name']}"
            );
            
            Response::success(null, 'Клиент удалён');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Выдать переплату
    public function withdrawOverpayment($id) {
        $this->user = Middleware::requirePermission('overpayments.withdraw');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'amount' => ['required' => true, 'numeric' => true, 'min_value' => 0.01]
        ]);
        
        try {
            $result = $this->clientService->withdrawOverpayment(
                $id,
                floatval($data['amount']),
                $this->user['id'],
                $data['note'] ?? null
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'withdraw_overpayment',
                'client',
                $id,
                "Выдано наличными: {$data['amount']} сом"
            );
            
            Response::success($result, 'Переплата выдана');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    
    // Получить должников
    public function debtors() {
        $this->user = Middleware::requirePermission('clients.view');
        
        try {
            $debtors = $this->clientService->getDebtors();
            Response::success($debtors);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Получить переплаты
    public function overpayments() {
        $this->user = Middleware::requirePermission('clients.view');
        
        try {
            $overpayments = $this->clientService->getOverpayments();
            Response::success($overpayments);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Пересчитать баланс
    public function recalculateBalance($id) {
        $this->user = Middleware::requirePermission('clients.edit');
        
        try {
            $result = $this->clientService->recalculateBalance($id, $this->user['id']);
            
            Middleware::logActivity(
                $this->user['id'],
                'recalculate_balance',
                'client',
                $id,
                "Пересчитан баланс клиента"
            );
            
            Response::success($result, 'Баланс пересчитан');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
}

// Маршрутизация
$controller = new ClientsController();
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
            
        case 'delete':
            if ($method !== 'DELETE') Response::error('Method not allowed', 405);
            if (!$id) Response::error('ID не указан', 400);
            $controller->delete($id);
            break;
            
        case 'withdraw-overpayment':
            if ($method !== 'POST') Response::error('Method not allowed', 405);
            if (!$id) Response::error('ID не указан', 400);
            $controller->withdrawOverpayment($id);
            break;
            
        case 'debtors':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->debtors();
            break;
            
        case 'overpayments':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->overpayments();
            break;
            
        case 'recalculate-balance':
            if ($method !== 'POST') Response::error('Method not allowed', 405);
            if (!$id) Response::error('ID не указан', 400);
            $controller->recalculateBalance($id);
            break;
            
        default:
            Response::error('Unknown action', 404);
    }
} catch (Exception $e) {
    error_log("Clients API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера', 500);
}