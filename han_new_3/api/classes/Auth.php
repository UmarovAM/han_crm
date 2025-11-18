<?php
// api/classes/Auth.php
// Простая аутентификация на PHP сессиях (БЕЗ JWT)

class Auth {
    
    // Инициализация сессии
    public static function init() {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }
    
    // Вход пользователя
    public static function login($userId, $userData) {
        self::init();
        
        $_SESSION['user_id'] = $userId;
        $_SESSION['user_data'] = $userData;
        $_SESSION['logged_in_at'] = time();
        
        // Регенерация ID сессии для безопасности
        session_regenerate_id(true);
    }
    
    // Выход
    public static function logout() {
        self::init();
        
        $_SESSION = [];
        
        if (isset($_COOKIE[session_name()])) {
            setcookie(session_name(), '', time() - 3600, '/');
        }
        
        session_destroy();
    }
    
    // Проверка авторизации
    public static function check() {
        self::init();
        
        if (!isset($_SESSION['user_id'])) {
            return false;
        }
        
        // Проверка таймаута (24 часа)
        $timeout = 86400; // 24 часа
        if (isset($_SESSION['logged_in_at'])) {
            if (time() - $_SESSION['logged_in_at'] > $timeout) {
                self::logout();
                return false;
            }
        }
        
        return true;
    }
    
    // Получить текущего пользователя
    public static function user() {
        self::init();
        
        if (!self::check()) {
            return null;
        }
        
        return $_SESSION['user_data'] ?? null;
    }
    
    // Получить ID пользователя
    public static function userId() {
        self::init();
        
        if (!self::check()) {
            return null;
        }
        
        return $_SESSION['user_id'] ?? null;
    }
    
    // Проверка роли
    public static function hasRole($roles) {
        if (!is_array($roles)) {
            $roles = [$roles];
        }
        
        $user = self::user();
        if (!$user) {
            return false;
        }
        
        return in_array($user['role'], $roles);
    }
    
    // Проверка прав
    public static function hasPermission($permission) {
        global $PERMISSIONS;
        
        $user = self::user();
        if (!$user) {
            return false;
        }
        
        $role = $user['role'];
        
        if (!isset($PERMISSIONS[$role])) {
            return false;
        }
        
        return in_array($permission, $PERMISSIONS[$role]);
    }
}