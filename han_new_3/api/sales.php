<?php
// api/sales.php - УПРОЩЁННАЯ ВЕРСИЯ (без триггеров)

require_once 'config.php';
require_once 'autoload.php';

class SalesController {
    private $db;
    private $user;
    
    public function __construct() {
        $this->db = Database::getInstance();
    }
    
    // Получить список продаж
    public function index() {
        $this->user = Middleware::requirePermission('sales.view');
        
        $page = max(1, intval($_GET['page'] ?? 1));
        $pageSize = min(intval($_GET['page_size'] ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
        $offset = ($page - 1) * $pageSize;
        
        $filters = ["s.deleted_at IS NULL"];
        $params = [];
        
        if (!empty($_GET['date_from'])) {
            $filters[] = "DATE(s.created_at) >= ?";
            $params[] = $_GET['date_from'];
        }
        
        if (!empty($_GET['date_to'])) {
            $filters[] = "DATE(s.created_at) <= ?";
            $params[] = $_GET['date_to'];
        }
        
        if (!empty($_GET['receipt_number'])) {
            $filters[] = "s.receipt_number LIKE ?";
            $params[] = '%' . $this->db->escapeLike($_GET['receipt_number']) . '%';
        }
        
        if (!empty($_GET['client_id'])) {
            $filters[] = "s.client_id = ?";
            $params[] = $_GET['client_id'];
        }
        
        if (isset($_GET['has_debt']) && $_GET['has_debt'] === 'true') {
            $filters[] = "s.debt > 0";
        }
        
        $whereClause = "WHERE " . implode(" AND ", $filters);
        
        try {
            $total = $this->db->fetchOne(
                "SELECT COUNT(*) as count FROM sales s $whereClause",
                $params
            )['count'];
            
            // ✅ Используем готовый VIEW
            $sales = $this->db->fetchAll(
                "SELECT * FROM sales_list
                 WHERE id IN (
                     SELECT id FROM sales s
                     $whereClause
                     ORDER BY created_at DESC
                     LIMIT ? OFFSET ?
                 )",
                array_merge($params, [$pageSize, $offset])
            );
            
            Response::paginated($sales, $total, $page, $pageSize);
            
        } catch (Exception $e) {
            error_log("Sales index error: " . $e->getMessage());
            Response::error('Ошибка загрузки продаж', 500);
        }
    }
    
    // Получить одну продажу
    public function show($id) {
        $this->user = Middleware::requirePermission('sales.view');
        
        try {
            $sale = $this->db->fetchOne(
                "SELECT 
                    s.*,
                    c.name as client_name,
                    c.phone as client_phone,
                    c.address as client_address,
                    u.name as created_by_name
                 FROM sales s
                 JOIN clients c ON s.client_id = c.id
                 LEFT JOIN users u ON s.user_id = u.id
                 WHERE s.id = ? AND s.deleted_at IS NULL",
                [$id]
            );
            
            if (!$sale) {
                Response::notFound('Продажа не найдена');
            }
            
            $items = $this->db->fetchAll(
                "SELECT si.*, p.name as product_name 
                 FROM sale_items si
                 JOIN products p ON si.product_id = p.id
                 WHERE si.sale_id = ?
                 ORDER BY si.id",
                [$id]
            );
            
            $payments = $this->db->fetchAll(
                "SELECT p.*, u.name as created_by_name
                 FROM payments p
                 LEFT JOIN users u ON p.user_id = u.id
                 WHERE p.sale_id = ? AND p.deleted_at IS NULL
                 ORDER BY p.created_at",
                [$id]
            );
            
            $sale['items'] = $items;
            $sale['payments'] = $payments;
            
            Response::success($sale);
            
        } catch (Exception $e) {
            error_log("Sales show error: " . $e->getMessage());
            Response::error('Ошибка загрузки продажи', 500);
        }
    }
    
    // ✅ УПРОЩЁННОЕ СОЗДАНИЕ ПРОДАЖИ (вся логика в PHP)
    public function create() {
        $this->user = Middleware::requirePermission('sales.create');
        
        $rawInput = file_get_contents('php://input');
        $data = json_decode($rawInput, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            Response::error('Некорректный JSON: ' . json_last_error_msg(), 400);
        }
        
        // Валидация
        $errors = [];
        
        if (!isset($data['client_id']) || empty($data['client_id'])) {
            $errors['client_id'] = ['Клиент не указан'];
        }
        
        if (!isset($data['items']) || !is_array($data['items']) || empty($data['items'])) {
            $errors['items'] = ['Товары не указаны'];
        }
        
        if (!isset($data['paid']) || !is_numeric($data['paid']) || $data['paid'] < 0) {
            $errors['paid'] = ['Некорректная сумма оплаты'];
        }
        
        if (!empty($errors)) {
            Response::validationError($errors);
        }
        
        try {
            $this->db->beginTransaction();
            
            // Генерация номера чека
            $lastReceipt = $this->db->fetchOne(
                "SELECT receipt_number FROM sales ORDER BY id DESC LIMIT 1"
            );
            
            $receiptNumber = $lastReceipt 
                ? str_pad(intval($lastReceipt['receipt_number']) + 1, 6, '0', STR_PAD_LEFT)
                : '000001';
            
            // Проверка и расчёт товаров
            $total = 0;
            $validatedItems = [];
            
            foreach ($data['items'] as $index => $item) {
                if (!isset($item['product_id']) || !isset($item['quantity']) || !isset($item['price'])) {
                    $this->db->rollback();
                    Response::error("Некорректные данные товара #" . ($index + 1), 400);
                }
                
                $productId = intval($item['product_id']);
                $quantity = intval($item['quantity']);
                $price = floatval($item['price']);
                
                if ($quantity <= 0 || $price < 0) {
                    $this->db->rollback();
                    Response::error("Некорректные значения товара #" . ($index + 1), 400);
                }
                
                // Проверка наличия на складе
                $stock = $this->db->fetchOne(
                    "SELECT COALESCE(quantity, 0) as quantity FROM stock WHERE product_id = ?",
                    [$productId]
                );
                
                $available = $stock ? $stock['quantity'] : 0;
                
                if ($quantity > $available) {
                    $this->db->rollback();
                    $product = $this->db->fetchOne("SELECT name FROM products WHERE id = ?", [$productId]);
                    Response::error("Недостаточно товара '{$product['name']}' на складе. Доступно: {$available}", 400);
                }
                
                $itemTotal = $quantity * $price;
                $total += $itemTotal;
                
                $validatedItems[] = [
                    'product_id' => $productId,
                    'quantity' => $quantity,
                    'price' => $price
                ];
            }
            
            $paid = floatval($data['paid']);
            $debt = max(0, $total - $paid);
            $newOverpayment = max(0, $paid - $total);
            
            // ✅ ШАГ 1: Создаём продажу
            $saleId = $this->db->insert(
                "INSERT INTO sales (receipt_number, client_id, user_id, total, paid, debt, new_overpayment) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    $receiptNumber,
                    $data['client_id'],
                    $this->user['id'],
                    $total,
                    $paid,
                    $debt,
                    $newOverpayment
                ]
            );
            
            // ✅ ШАГ 2: Создаём позиции продажи и списываем товары
            foreach ($validatedItems as $item) {
                // Создаём позицию
                $this->db->insert(
                    "INSERT INTO sale_items (sale_id, product_id, quantity, price, user_id) 
                     VALUES (?, ?, ?, ?, ?)",
                    [$saleId, $item['product_id'], $item['quantity'], $item['price'], $this->user['id']]
                );
                
                // Списываем товар со склада
                $this->db->update(
                    "UPDATE stock SET quantity = quantity - ? WHERE product_id = ?",
                    [$item['quantity'], $item['product_id']]
                );
                
                // Записываем движение
                $newQty = $this->db->fetchOne(
                    "SELECT quantity FROM stock WHERE product_id = ?",
                    [$item['product_id']]
                )['quantity'];
                
                $this->db->insert(
                    "INSERT INTO stock_movements 
                     (product_id, quantity_change, quantity_after, movement_type, reference_id, user_id)
                     VALUES (?, ?, ?, 'sale', ?, ?)",
                    [$item['product_id'], -$item['quantity'], $newQty, $saleId, $this->user['id']]
                );
            }
            
            // ✅ ШАГ 3: Создаём платёж (если оплата > 0)
            if ($paid > 0) {
                $this->db->insert(
                    "INSERT INTO payments (sale_id, amount, payment_method, note, user_id) 
                     VALUES (?, ?, 'cash', 'Оплата при продаже', ?)",
                    [$saleId, $paid, $this->user['id']]
                );
            }
            
            // ✅ ШАГ 4: Обновляем баланс клиента (если переплата)
            if ($newOverpayment > 0) {
                // Обновляем баланс
                $this->db->update(
                    "UPDATE clients 
                     SET current_overpayment = current_overpayment + ?
                     WHERE id = ?",
                    [$newOverpayment, $data['client_id']]
                );
                
                // Получаем новый баланс
                $newBalance = $this->db->fetchOne(
                    "SELECT current_overpayment FROM clients WHERE id = ?",
                    [$data['client_id']]
                )['current_overpayment'];
                
                // Записываем в историю
                $this->db->insert(
                    "INSERT INTO client_overpayments 
                     (client_id, sale_id, amount, type, balance_after, user_id, note)
                     VALUES (?, ?, ?, 'created', ?, ?, ?)",
                    [
                        $data['client_id'],
                        $saleId,
                        $newOverpayment,
                        $newBalance,
                        $this->user['id'],
                        "Переплата по чеку №{$receiptNumber}"
                    ]
                );
            }
            
            $this->db->commit();
            
            // Получаем созданную продажу
            $sale = $this->db->fetchOne(
                "SELECT s.*, c.name as client_name, c.phone as client_phone
                 FROM sales s
                 JOIN clients c ON s.client_id = c.id
                 WHERE s.id = ?",
                [$saleId]
            );
            
            $sale['items'] = $this->db->fetchAll(
                "SELECT si.*, p.name as product_name 
                 FROM sale_items si
                 JOIN products p ON si.product_id = p.id
                 WHERE si.sale_id = ?",
                [$saleId]
            );
            
            $sale['payments'] = $this->db->fetchAll(
                "SELECT p.*, u.name as created_by_name
                 FROM payments p
                 LEFT JOIN users u ON p.user_id = u.id
                 WHERE p.sale_id = ? AND p.deleted_at IS NULL",
                [$saleId]
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'create',
                'sale',
                $saleId,
                "Создана продажа №{$receiptNumber} на сумму {$total} сом (оплачено: {$paid})"
            );
            
            Response::success($sale, 'Продажа успешно оформлена', 201);
            
        } catch (Exception $e) {
            $this->db->rollback();
            error_log("Sale creation error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            Response::error('Ошибка при создании продажи: ' . $e->getMessage(), 500);
        }
    }
    
    // ✅ УПРОЩЁННОЕ УДАЛЕНИЕ ПРОДАЖИ
    public function delete($id) {
        $this->user = Middleware::requirePermission('sales.delete');
        
        try {
            $sale = $this->db->fetchOne(
                "SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL",
                [$id]
            );
            
            if (!$sale) {
                Response::notFound('Продажа не найдена');
            }
            
            $this->db->beginTransaction();
            
            // ✅ ШАГ 1: Возвращаем товары на склад
            $items = $this->db->fetchAll(
                "SELECT product_id, quantity FROM sale_items WHERE sale_id = ?",
                [$id]
            );
            
            foreach ($items as $item) {
                // Возвращаем на склад
                $this->db->update(
                    "UPDATE stock SET quantity = quantity + ? WHERE product_id = ?",
                    [$item['quantity'], $item['product_id']]
                );
                
                // Записываем движение
                $newQty = $this->db->fetchOne(
                    "SELECT quantity FROM stock WHERE product_id = ?",
                    [$item['product_id']]
                )['quantity'];
                
                $this->db->insert(
                    "INSERT INTO stock_movements 
                     (product_id, quantity_change, quantity_after, movement_type, reference_id, user_id, note)
                     VALUES (?, ?, ?, 'adjustment', ?, ?, ?)",
                    [
                        $item['product_id'],
                        $item['quantity'],
                        $newQty,
                        $id,
                        $this->user['id'],
                        "Возврат при удалении чека №{$sale['receipt_number']}"
                    ]
                );
            }
            
            // ✅ ШАГ 2: Убираем переплату из баланса клиента
            if ($sale['new_overpayment'] > 0) {
                // Уменьшаем баланс
                $this->db->update(
                    "UPDATE clients 
                     SET current_overpayment = GREATEST(0, current_overpayment - ?)
                     WHERE id = ?",
                    [$sale['new_overpayment'], $sale['client_id']]
                );
                
                // Получаем новый баланс
                $newBalance = $this->db->fetchOne(
                    "SELECT current_overpayment FROM clients WHERE id = ?",
                    [$sale['client_id']]
                )['current_overpayment'];
                
                // Записываем в историю (корректировка)
                $this->db->insert(
                    "INSERT INTO client_overpayments 
                     (client_id, sale_id, amount, type, balance_after, user_id, note)
                     VALUES (?, ?, ?, 'adjusted', ?, ?, ?)",
                    [
                        $sale['client_id'],
                        $id,
                        $sale['new_overpayment'],
                        $newBalance,
                        $this->user['id'],
                        "Удаление чека №{$sale['receipt_number']}"
                    ]
                );
            }
            
            // ✅ ШАГ 3: Soft delete платежей
            $this->db->update(
                "UPDATE payments SET deleted_at = NOW() WHERE sale_id = ?",
                [$id]
            );
            
            // ✅ ШАГ 4: Soft delete продажи
            $this->db->update(
                "UPDATE sales SET deleted_at = NOW() WHERE id = ?",
                [$id]
            );
            
            $this->db->commit();
            
            Middleware::logActivity(
                $this->user['id'],
                'delete',
                'sale',
                $id,
                "Удалена продажа №{$sale['receipt_number']}"
            );
            
            Response::success(null, 'Продажа удалена');
            
        } catch (Exception $e) {
            $this->db->rollback();
            error_log("Sale deletion error: " . $e->getMessage());
            Response::error('Ошибка при удалении продажи', 500);
        }
    }
    
    // Статистика
    public function stats() {
        $this->user = Middleware::requirePermission('sales.view');
        
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            $stats = $this->db->fetchOne(
                "SELECT 
                    COUNT(*) as sales_count,
                    COALESCE(SUM(total), 0) as total_amount,
                    COALESCE(SUM(paid), 0) as total_paid,
                    COALESCE(SUM(debt), 0) as total_debt,
                    COALESCE(AVG(total), 0) as avg_sale
                 FROM sales
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?",
                [$dateFrom, $dateTo]
            );
            
            Response::success($stats);
            
        } catch (Exception $e) {
            error_log("Sales stats error: " . $e->getMessage());
            Response::error('Ошибка получения статистики', 500);
        }
    }
}

// Маршрутизация
$controller = new SalesController();
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
    error_log("Sales API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера', 500);
}