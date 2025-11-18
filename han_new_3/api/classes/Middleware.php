<?php
// api/classes/Middleware.php
// Middleware для проверки аутентификации и прав доступа (НА СЕССИЯХ)

class Middleware {
    
    // Проверка авторизации
    public static function requireAuth() {
        // Подключаем Auth если не подключен
       // if (!class_exists('Auth')) {
      //      require_once __DIR__ . '/autoloa.php';
      //  }
        
        if (!Auth::check()) {
            Response::unauthorized();
        }
        
        $user = Auth::user();
        
        // Проверяем, что пользователь активен в БД
        $db = Database::getInstance();
        $dbUser = $db->fetchOne(
            "SELECT id, name, login, role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
            [$user['id']]
        );
        
        if (!$dbUser) {
            Auth::logout();
            Response::unauthorized('Пользователь деактивирован');
        }
        
        return $user;
    }
    
    // Проверка прав доступа
    public static function requirePermission($permission) {
        global $PERMISSIONS;
        
        if (!class_exists('Auth')) {
            require_once __DIR__ . '/Auth.php';
        }
        
        $user = self::requireAuth();
        
        if (!Auth::hasPermission($permission)) {
            Response::forbidden('Недостаточно прав для выполнения этого действия');
        }
        
        return $user;
    }
    
    // Проверка роли
    public static function requireRole($roles) {
        if (!class_exists('Auth')) {
            require_once __DIR__ . '/Auth.php';
        }
        
        $user = self::requireAuth();
        
        if (!Auth::hasRole($roles)) {
            Response::forbidden('Доступ запрещен для вашей роли');
        }
        
        return $user;
    }
    
    // Валидация данных
    public static function validate($data, $rules) {
        $errors = [];
        
        foreach ($rules as $field => $rule) {
            $value = $data[$field] ?? null;
            
            // Required
            if (isset($rule['required']) && $rule['required'] && empty($value)) {
                $errors[$field][] = "Поле {$field} обязательно для заполнения";
                continue;
            }
            
            if (empty($value) && !isset($rule['required'])) {
                continue;
            }
            
            // Min length
            if (isset($rule['min']) && strlen($value) < $rule['min']) {
                $errors[$field][] = "Минимальная длина: {$rule['min']}";
            }
            
            // Max length
            if (isset($rule['max']) && strlen($value) > $rule['max']) {
                $errors[$field][] = "Максимальная длина: {$rule['max']}";
            }
            
            // Email
            if (isset($rule['email']) && $rule['email'] && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                $errors[$field][] = "Неверный формат email";
            }
            
            // Numeric
            if (isset($rule['numeric']) && $rule['numeric'] && !is_numeric($value)) {
                $errors[$field][] = "Должно быть числом";
            }
            
            // Min value
            if (isset($rule['min_value']) && $value < $rule['min_value']) {
                $errors[$field][] = "Минимальное значение: {$rule['min_value']}";
            }
            
            // Max value
            if (isset($rule['max_value']) && $value > $rule['max_value']) {
                $errors[$field][] = "Максимальное значение: {$rule['max_value']}";
            }
            
            // In array
            if (isset($rule['in']) && !in_array($value, $rule['in'])) {
                $errors[$field][] = "Недопустимое значение";
            }
            
            // Custom regex
            if (isset($rule['regex']) && !preg_match($rule['regex'], $value)) {
                $errors[$field][] = $rule['regex_message'] ?? "Неверный формат";
            }
        }
        
        if (!empty($errors)) {
            Response::validationError($errors);
        }
        
        return true;
    }
    
    // Sanitize input
    public static function sanitize($data) {
        if (is_array($data)) {
            return array_map([self::class, 'sanitize'], $data);
        }
        
        return htmlspecialchars(trim($data), ENT_QUOTES, 'UTF-8');
    }
    
    // Логирование активности
    public static function logActivity($userId, $action, $entityType, $entityId, $details = null) {
        try {
            $db = Database::getInstance();
            $db->insert(
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
?>