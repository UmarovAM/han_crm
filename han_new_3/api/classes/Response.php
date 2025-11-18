<?php
// api/classes/Response.php
// Класс для стандартизированных ответов API

class Response {
    
    // Успешный ответ
    public static function success($data = null, $message = null, $code = 200) {
        http_response_code($code);
        
        $response = [
            'success' => true,
            'timestamp' => date('c')
        ];
        
        if ($message) {
            $response['message'] = $message;
        }
        
        if ($data !== null) {
            $response['data'] = $data;
        }
        
        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
    
    // Ошибка
    public static function error($message, $code = 400, $errors = null) {
        http_response_code($code);
        
        $response = [
            'success' => false,
            'error' => [
                'message' => $message,
                'code' => $code
            ],
            'timestamp' => date('c')
        ];
        
        if ($errors) {
            $response['error']['details'] = $errors;
        }
        
        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
    
    // Ответ с пагинацией
    public static function paginated($items, $total, $page, $pageSize) {
        $totalPages = ceil($total / $pageSize);
        
        self::success([
            'items' => $items,
            'pagination' => [
                'total' => (int)$total,
                'page' => (int)$page,
                'page_size' => (int)$pageSize,
                'total_pages' => $totalPages,
                'has_next' => $page < $totalPages,
                'has_prev' => $page > 1
            ]
        ]);
    }
    
    // Валидация и возврат ошибок валидации
    public static function validationError($errors) {
        self::error('Ошибки валидации', 422, $errors);
    }
    
    // Не найдено
    public static function notFound($message = 'Ресурс не найден') {
        self::error($message, 404);
    }
    
    // Нет доступа
    public static function forbidden($message = 'Доступ запрещен') {
        self::error($message, 403);
    }
    
    // Не авторизован
    public static function unauthorized($message = 'Требуется авторизация') {
        self::error($message, 401);
    }
}