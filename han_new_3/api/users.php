<?php
// api/users.php
// API для управления пользователями (только для админов)

require_once 'config.php';
require_once 'autoload.php'; // ← ДОСТАТОЧНО ОДИН РАЗ

class UsersController {
    private $db;
    private $user;
    
    public function __construct() {
        $this->db = Database::getInstance();
    }
    
    // Получить список пользователей
    public function index() {
        $this->user = Middleware::requirePermission('users.view');
        
        $users = $this->db->fetchAll(
            "SELECT 
                id,
                name,
                login,
                role,
                is_active,
                created_at,
                updated_at
             FROM users
             WHERE deleted_at IS NULL
             ORDER BY name"
        );
        
        Response::success($users);
    }
    
    // Получить одного пользователя
    public function show($id) {
        $this->user = Middleware::requirePermission('users.view');
        
        $user = $this->db->fetchOne(
            "SELECT 
                id,
                name,
                login,
                role,
                is_active,
                created_at,
                updated_at
             FROM users
             WHERE id = ? AND deleted_at IS NULL",
            [$id]
        );
        
        if (!$user) {
            Response::notFound('Пользователь не найден');
        }
        
        // Статистика активности
        $activity = $this->db->fetchOne(
            "SELECT 
                COUNT(*) as total_actions,
                MAX(created_at) as last_activity
             FROM activity_log
             WHERE user_id = ?",
            [$id]
        );
        
        $user['activity'] = $activity;
        
        Response::success($user);
    }
    
    // Создать пользователя
    public function create() {
        $this->user = Middleware::requirePermission('users.create');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        Middleware::validate($data, [
            'name' => ['required' => true, 'min' => 2, 'max' => 100],
            'login' => ['required' => true, 'min' => 3, 'max' => 50],
            'password' => ['required' => true, 'min' => PASSWORD_MIN_LENGTH],
            'role' => ['required' => true, 'in' => [ROLE_ADMIN, ROLE_MANAGER, ROLE_CASHIER]]
        ]);
        
        // Проверка уникальности логина
        $existing = $this->db->fetchOne(
            "SELECT id FROM users WHERE login = ?",
            [$data['login']]
        );
        
        if ($existing) {
            Response::error('Пользователь с таким логином уже существует', 400);
        }
        
        try {
            $id = $this->db->insert(
                "INSERT INTO users (name, login, password, role, is_active) 
                 VALUES (?, ?, ?, ?, ?)",
                [
                    $data['name'],
                    $data['login'],
                    hash('sha256', $data['password']),
                    $data['role'],
                    $data['is_active'] ?? 1
                ]
            );
            
            $created = $this->db->fetchOne(
                "SELECT id, name, login, role, is_active, created_at FROM users WHERE id = ?",
                [$id]
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'create',
                'user',
                $id,
                "Создан пользователь: {$data['name']} ({$data['role']})"
            );
            
            Response::success($created, 'Пользователь создан', 201);
            
        } catch (Exception $e) {
            error_log("User creation error: " . $e->getMessage());
            Response::error('Ошибка создания пользователя', 500);
        }
    }
    
    // Обновить пользователя
    public function update($id) {
        $this->user = Middleware::requirePermission('users.edit');
        
        $user = $this->db->fetchOne(
            "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
            [$id]
        );
        
        if (!$user) {
            Response::notFound('Пользователь не найден');
        }
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Валидация
        $rules = [];
        if (isset($data['name'])) {
            $rules['name'] = ['min' => 2, 'max' => 100];
        }
        if (isset($data['login'])) {
            $rules['login'] = ['min' => 3, 'max' => 50];
        }
        if (isset($data['password'])) {
            $rules['password'] = ['min' => PASSWORD_MIN_LENGTH];
        }
        if (isset($data['role'])) {
            $rules['role'] = ['in' => [ROLE_ADMIN, ROLE_MANAGER, ROLE_CASHIER]];
        }
        
        if (!empty($rules)) {
            Middleware::validate($data, $rules);
        }
        
        // Проверка уникальности логина при изменении
        if (isset($data['login']) && $data['login'] !== $user['login']) {
            $existing = $this->db->fetchOne(
                "SELECT id FROM users WHERE login = ? AND id != ?",
                [$data['login'], $id]
            );
            
            if ($existing) {
                Response::error('Пользователь с таким логином уже существует', 400);
            }
        }
        
        try {
            $updates = [];
            $params = [];
            
            if (isset($data['name'])) {
                $updates[] = "name = ?";
                $params[] = $data['name'];
            }
            
            if (isset($data['login'])) {
                $updates[] = "login = ?";
                $params[] = $data['login'];
            }
            
            if (isset($data['password'])) {
                $updates[] = "password = ?";
                $params[] = hash('sha256', $data['password']);
            }
            
            if (isset($data['role'])) {
                $updates[] = "role = ?";
                $params[] = $data['role'];
            }
            
            if (isset($data['is_active'])) {
                $updates[] = "is_active = ?";
                $params[] = $data['is_active'] ? 1 : 0;
            }
            
            if (empty($updates)) {
                Response::error('Нет данных для обновления', 400);
            }
            
            $params[] = $id;
            
            $this->db->update(
                "UPDATE users SET " . implode(', ', $updates) . ", updated_at = NOW() WHERE id = ?",
                $params
            );
            
            $updated = $this->db->fetchOne(
                "SELECT id, name, login, role, is_active, updated_at FROM users WHERE id = ?",
                [$id]
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'update',
                'user',
                $id,
                "Обновлен пользователь: {$updated['name']}"
            );
            
            Response::success($updated, 'Пользователь обновлен');
            
        } catch (Exception $e) {
            error_log("User update error: " . $e->getMessage());
            Response::error('Ошибка обновления пользователя', 500);
        }
    }
    
    // Удалить пользователя (soft delete)
    public function delete($id) {
        $this->user = Middleware::requirePermission('users.delete');
        
        // Нельзя удалить самого себя
        if ($id == $this->user['id']) {
            Response::error('Нельзя удалить свой собственный аккаунт', 400);
        }
        
        $user = $this->db->fetchOne(
            "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
            [$id]
        );
        
        if (!$user) {
            Response::notFound('Пользователь не найден');
        }
        
        try {
            $this->db->update(
                "UPDATE users SET deleted_at = NOW(), is_active = 0 WHERE id = ?",
                [$id]
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'delete',
                'user',
                $id,
                "Удален пользователь: {$user['name']}"
            );
            
            Response::success(null, 'Пользователь удален');
            
        } catch (Exception $e) {
            error_log("User deletion error: " . $e->getMessage());
            Response::error('Ошибка удаления пользователя', 500);
        }
    }
    
    // Журнал активности
    public function activityLog() {
        $this->user = Middleware::requireRole(ROLE_ADMIN);
        
        $page = max(1, intval($_GET['page'] ?? 1));
        $pageSize = min(intval($_GET['page_size'] ?? 100), MAX_PAGE_SIZE);
        $offset = ($page - 1) * $pageSize;
        
        $filters = [];
        $params = [];
        
        if (!empty($_GET['id'])) {
            $filters[] = "id = ?";
            $params[] = $_GET['id'];
        }
        
        if (!empty($_GET['action'])) {
            $filters[] = "action = ?";
            $params[] = $_GET['action'];
        }
        
        if (!empty($_GET['date_from'])) {
            $filters[] = "DATE(created_at) >= ?";
            $params[] = $_GET['date_from'];
        }
        
        if (!empty($_GET['date_to'])) {
            $filters[] = "DATE(created_at) <= ?";
            $params[] = $_GET['date_to'];
        }
        
        $whereClause = !empty($filters) ? "WHERE " . implode(" AND ", $filters) : "";
        
        $total = $this->db->fetchOne(
            "SELECT COUNT(*) as count FROM activity_log $whereClause",
            $params
        )['count'];
        
        $logs = $this->db->fetchAll(
            "SELECT 
                a.*,
                u.name as user_name,
                u.role as user_role
             FROM activity_log a
             LEFT JOIN users u ON a.user_id = u.id
             $whereClause
             ORDER BY a.created_at DESC
             LIMIT ? OFFSET ?",
            array_merge($params, [$pageSize, $offset])
        );
        
        Response::paginated($logs, $total, $page, $pageSize);
    }
}

// Маршрутизация
$controller = new UsersController();
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
            
        case 'activity-log':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->activityLog();
            break;
            
        default:
            Response::error('Unknown action', 404);
    }
} catch (Exception $e) {
    error_log("Users API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера', 500);
}