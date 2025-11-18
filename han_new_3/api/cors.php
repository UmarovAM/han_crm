<?php
// cors.php - Подключайте в начале ВСЕХ PHP файлов
$allowed_origin = 'https://obmensuzak.com.kg';
$allowed_methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
$allowed_headers = ['Content-Type', 'Authorization'];

header("Access-Control-Allow-Origin: $allowed_origin");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: " . implode(', ', $allowed_methods));
header("Access-Control-Allow-Headers: " . implode(', ', $allowed_headers));
header("Content-Type: application/json; charset=utf-8");

// Обработка preflight-запросов
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}