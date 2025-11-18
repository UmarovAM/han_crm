<?php
// api/auth.php
// Упрощенная аутентификация на сессиях (БЕЗ JWT)

// Разрешаем CORS с вашего фронтенд-домена
header("Access-Control-Allow-Origin: https://obmensuzak.com.kg");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=utf-8");

// Обработка preflight запроса (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
require_once 'cors.php'; // Добавьте ЭТУ СТРОКУ ПЕРВОЙ
// Ваш существующий код авторизации...
require_once 'config.php';
require_once 'autoload.php'; // ← ДОСТАТОЧНО ОДИН РАЗ
class AuthController {
    private $db;
    
    public function __construct() {
        $this->db = Database::getInstance();
    }
    
    // Вход в систему
    public function login() {
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($data['login']) || !isset($data['password'])) {
            Response::error('Не указаны логин или пароль', 400);
        }
        
        $login = trim($data['login']);
        $password = $data['password'];
        
        // Проверка попыток входа
        $this->checkLoginAttempts($login);
        
        // Поиск пользователя
        $user = $this->db->fetchOne(
            "SELECT * FROM users WHERE login = ? AND is_active = 1 AND deleted_at IS NULL",
            [$login]
        );
        
        if (!$user) {
            $this->logFailedAttempt($login);
            Response::error('Неверный логин или пароль', 401);
        }
        
        // Проверка пароля
        if (hash('sha256', $password) !== $user['password']) {
            $this->logFailedAttempt($login);
            Response::error('Неверный логин или пароль', 401);
        }
        
        // Успешный вход
        $this->clearLoginAttempts($login);
        
        // Сохраняем в сессию
        Auth::login($user['id'], [
            'id' => $user['id'],
            'name' => $user['name'],
            'login' => $user['login'],
            'role' => $user['role']
        ]);
        
        // Логирование
        $this->logActivity($user['id'], 'login', 'user', $user['id'], 'Вход в систему');
        
        Response::success([
            'user' => [
                'id' => $user['id'],
                'name' => $user['name'],
                'login' => $user['login'],
                'role' => $user['role']
            ],
            'session_id' => session_id()
        ], 'Успешный вход');
    }
    
    // Проверка текущей сессии
    public function verify() {
        $user = Auth::user();
        
        if (!$user) {
            Response::error('Не авторизован', 401);
        }
        
        // Проверяем, что пользователь все еще активен
        $dbUser = $this->db->fetchOne(
            "SELECT id, name, login, role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
            [$user['id']]
        );
        
        if (!$dbUser) {
            Auth::logout();
            Response::error('Пользователь не найден или деактивирован', 401);
        }
        
        Response::success(['user' => $dbUser]);
    }
    
    // Выход из системы
    public function logout() {
        $user = Auth::user();
        
        if ($user) {
            $this->logActivity($user['id'], 'logout', 'user', $user['id'], 'Выход из системы');
        }
        
        Auth::logout();
        
        Response::success(['message' => 'Успешный выход']);
    }
    
    // Смена пароля
    public function changePassword() {
        if (!Auth::check()) {
            Response::error('Не авторизован', 401);
        }
        
        $user = Auth::user();
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($data['old_password']) || !isset($data['new_password'])) {
            Response::error('Не указаны пароли', 400);
        }
        
        if (strlen($data['new_password']) < PASSWORD_MIN_LENGTH) {
            Response::error('Пароль должен быть не менее ' . PASSWORD_MIN_LENGTH . ' символов', 400);
        }
        
        // Проверка старого пароля
        $dbUser = $this->db->fetchOne(
            "SELECT password FROM users WHERE id = ?",
            [$user['id']]
        );
        
        if (hash('sha256', $data['old_password']) !== $dbUser['password']) {
            Response::error('Неверный текущий пароль', 401);
        }
        
        // Обновление пароля
        $this->db->update(
            "UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?",
            [hash('sha256', $data['new_password']), $user['id']]
        );
        
        $this->logActivity($user['id'], 'password_change', 'user', $user['id'], 'Смена пароля');
        
        Response::success(['message' => 'Пароль успешно изменен']);
    }
    
    // Вспомогательные методы
    private function checkLoginAttempts($login) {
        $cacheDir = __DIR__ . '/cache';
        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0755, true);
        }
        
        $cacheFile = $cacheDir . '/login_attempts_' . md5($login) . '.json';
        
        if (!file_exists($cacheFile)) {
            return;
        }
        
        $attempts = json_decode(file_get_contents($cacheFile), true);
        
        if ($attempts['count'] >= MAX_LOGIN_ATTEMPTS) {
            $timePassed = time() - $attempts['first_attempt'];
            
            if ($timePassed < LOGIN_ATTEMPT_TIMEOUT) {
                $timeLeft = LOGIN_ATTEMPT_TIMEOUT - $timePassed;
                Response::error("Слишком много попыток входа. Попробуйте через " . ceil($timeLeft / 60) . " минут", 429);
            } else {
                unlink($cacheFile);
            }
        }
    }
    
    private function logFailedAttempt($login) {
        $cacheDir = __DIR__ . '/cache';
        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0755, true);
        }
        
        $cacheFile = $cacheDir . '/login_attempts_' . md5($login) . '.json';
        
        if (file_exists($cacheFile)) {
            $attempts = json_decode(file_get_contents($cacheFile), true);
            $attempts['count']++;
            $attempts['last_attempt'] = time();
        } else {
            $attempts = [
                'count' => 1,
                'first_attempt' => time(),
                'last_attempt' => time()
            ];
        }
        
        file_put_contents($cacheFile, json_encode($attempts));
    }
    
    private function clearLoginAttempts($login) {
        $cacheFile = __DIR__ . '/cache/login_attempts_' . md5($login) . '.json';
        if (file_exists($cacheFile)) {
            unlink($cacheFile);
        }
    }
    
    private function logActivity($userId, $action, $entityType, $entityId, $details) {
        try {
            $this->db->insert(
                "INSERT INTO activity_log (user_id, action, entity_type, entity_id, details, ip_address, user_agent) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    $userId,
                    $action,
                    $entityType,
                    $entityId,
                    $details,
                    $_SERVER['REMOTE_ADDR'] ?? null,
                    $_SERVER['HTTP_USER_AGENT'] ?? null
                ]
            );
        } catch (Exception $e) {
            error_log("Failed to log activity: " . $e->getMessage());
        }
    }
}

// Маршрутизация
try {
    $controller = new AuthController();
    $method = $_SERVER['REQUEST_METHOD'];
    $path = $_GET['action'] ?? '';

    switch ($path) {
        case 'login':
            if ($method !== 'POST') Response::error('Method not allowed', 405);
            $controller->login();
            break;
            
        case 'verify':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->verify();
            break;
            
        case 'logout':
            if ($method !== 'POST') Response::error('Method not allowed', 405);
            $controller->logout();
            break;
            
        case 'change-password':
            if ($method !== 'POST') Response::error('Method not allowed', 405);
            $controller->changePassword();
            break;
            
        default:
            Response::error('Unknown action', 404);
    }
} catch (Exception $e) {
    error_log("Auth API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера: ' . $e->getMessage(), 500);
}