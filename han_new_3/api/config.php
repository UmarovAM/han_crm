<?php
// api/config.php
// Конфигурация API HAN Seeds CRM

define('DB_HOST', 'localhost');
define('DB_NAME', 'user');
define('DB_USER', 'user');
define('DB_PASS', ''); // Замените на реальный пароль


define('API_VERSION', 'v1');
define('CORS_ORIGIN', '*'); // В продакшене укажите конкретный домен
// В продакшене укажите конкретный домен
define('CORS_ORIGIN', 'https://obmensuzak.com.kg');

// Роли пользователей
define('ROLE_ADMIN', 'admin');
define('ROLE_MANAGER', 'manager');
define('ROLE_CASHIER', 'cashier');

// Права доступа по ролям
$PERMISSIONS = [
    ROLE_ADMIN => [
        'users.view', 'users.create', 'users.edit', 'users.delete',
        'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
        'products.view', 'products.edit',
        'production.view', 'production.create', 'production.delete',
        'sales.view', 'sales.create', 'sales.delete',
        'payments.view', 'payments.create', 'payments.delete',
        'returns.view', 'returns.create',
        'writeoffs.view', 'writeoffs.create', 'writeoffs.delete',
        'overpayments.view', 'overpayments.use', 'overpayments.withdraw',
        'reports.view', 'reports.export'
    ],
    ROLE_MANAGER => [
        'clients.view', 'clients.create', 'clients.edit',
        'products.view',
        'production.view', 'production.create',
        'sales.view', 'sales.create',
        'payments.view', 'payments.create',
        'returns.view', 'returns.create',
        'writeoffs.view', 'writeoffs.create',
        'overpayments.view', 'overpayments.use',
        'reports.view', 'reports.export'
    ],
    ROLE_CASHIER => [
        'clients.view',
        'products.view',
        'sales.view', 'sales.create',
        'payments.view', 'payments.create',
        'returns.view', 'returns.create',
        'overpayments.view'
    ]
];

// Настройки безопасности
define('PASSWORD_MIN_LENGTH', 6);
define('MAX_LOGIN_ATTEMPTS', 5);
define('LOGIN_ATTEMPT_TIMEOUT', 7200); // 15 минут

// Настройки пагинации
define('DEFAULT_PAGE_SIZE', 50);
define('MAX_PAGE_SIZE', 500);

// Часовой пояс
date_default_timezone_set('Asia/Bishkek');

// Обработка ошибок
error_reporting(E_ALL);
ini_set('display_errors', 0); // В продакшене всегда 0
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/logs/php_errors.log');

// CORS заголовки
header('Access-Control-Allow-Origin: ' . CORS_ORIGIN);
// В api/config.php, после CORS_ORIGIN добавьте:
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Max-Age: 3600');
header('Content-Type: application/json; charset=UTF-8');

// Обработка preflight запросов
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();

}

