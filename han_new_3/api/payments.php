<?php
// api/payments.php - УПРОЩЁННАЯ ВЕРСИЯ (без триггеров)

require_once 'config.php';
require_once 'autoload.php';

class PaymentsController {
    private $db;
    private $user;
    
    public function __construct() {
        $this->db = Database::getInstance();
    }
    
    // Получить список платежей по продаже
    public function index() {
        $this->user = Middleware::requirePermission('payments.view');
        
        $saleId = $_GET['sale_id'] ?? null;
        
        if (!$saleId) {
            Response::error('Не указан ID продажи', 400);
        }
        
        try {
            $payments = $this->db->fetchAll(
                "SELECT p.*, u.name as created_by_name
                 FROM payments p
                 LEFT JOIN users u ON p.user_id = u.id
                 WHERE p.sale_id = ? AND p.deleted_at IS NULL
                 ORDER BY p.created_at DESC",
                [$saleId]
            );
            
            Response::success($payments);
            
        } catch (Exception $e) {
            error_log("Payments index error: " . $e->getMessage());
            Response::error('Ошибка загрузки платежей', 500);
        }
    }
    
    // ✅ УПРОЩЁННОЕ СОЗДАНИЕ ПЛАТЕЖА
    public function create() {
        $this->user = Middleware::requirePermission('payments.create');
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Валидация
        Middleware::validate($data, [
            'sale_id' => ['required' => true, 'numeric' => true],
            'amount' => ['required' => true, 'numeric' => true, 'min_value' => 0.01],
            'payment_method' => ['required' => true, 'in' => ['cash', 'card', 'transfer']]
        ]);
        
        try {
            // Получаем продажу
            $sale = $this->db->fetchOne(
                "SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL",
                [$data['sale_id']]
            );
            
            if (!$sale) {
                Response::notFound('Продажа не найдена');
            }
            
            if ($data['amount'] > $sale['debt']) {
                // Переплата будет создана
                $overpaymentAmount = $data['amount'] - $sale['debt'];
            }
            
            $this->db->beginTransaction();
            
            // ✅ ШАГ 1: Создаём платёж
            $paymentId = $this->db->insert(
                "INSERT INTO payments (sale_id, amount, payment_method, note, user_id) 
                 VALUES (?, ?, ?, ?, ?)",
                [
                    $data['sale_id'],
                    $data['amount'],
                    $data['payment_method'],
                    $data['note'] ?? null,
                    $this->user['id']
                ]
            );
            
            // ✅ ШАГ 2: Обновляем продажу
            $newPaid = $sale['paid'] + $data['amount'];
            $newDebt = max(0, $sale['total'] - $newPaid);
            $newOverpayment = max(0, $newPaid - $sale['total']);
            
            $this->db->update(
                "UPDATE sales 
                 SET paid = ?, 
                     debt = ?,
                     new_overpayment = new_overpayment + ?
                 WHERE id = ?",
                [$newPaid, $newDebt, max(0, $data['amount'] - $sale['debt']), $data['sale_id']]
            );
            
            // ✅ ШАГ 3: Если есть переплата → добавляем в баланс клиента
            if ($newOverpayment > $sale['new_overpayment']) {
                $overpaymentDiff = $newOverpayment - $sale['new_overpayment'];
                
                // Обновляем баланс клиента
                $this->db->update(
                    "UPDATE clients 
                     SET current_overpayment = current_overpayment + ?
                     WHERE id = ?",
                    [$overpaymentDiff, $sale['client_id']]
                );
                
                // Получаем новый баланс
                $newBalance = $this->db->fetchOne(
                    "SELECT current_overpayment FROM clients WHERE id = ?",
                    [$sale['client_id']]
                )['current_overpayment'];
                
                // Записываем в историю
                $this->db->insert(
                    "INSERT INTO client_overpayments 
                     (client_id, sale_id, amount, type, balance_after, user_id, note)
                     VALUES (?, ?, ?, 'created', ?, ?, ?)",
                    [
                        $sale['client_id'],
                        $data['sale_id'],
                        $overpaymentDiff,
                        $newBalance,
                        $this->user['id'],
                        "Переплата при платеже к чеку №{$sale['receipt_number']}"
                    ]
                );
            }
            
            $this->db->commit();
            
            // Получаем созданный платёж
            $payment = $this->db->fetchOne(
                "SELECT p.*, u.name as created_by_name 
                 FROM payments p 
                 LEFT JOIN users u ON p.user_id = u.id 
                 WHERE p.id = ?",
                [$paymentId]
            );
            
            // Получаем обновлённую продажу
            $updatedSale = $this->db->fetchOne(
                "SELECT * FROM sales WHERE id = ?",
                [$data['sale_id']]
            );
            
            Middleware::logActivity(
                $this->user['id'],
                'create',
                'payment',
                $paymentId,
                "Платёж {$data['amount']} сом ({$data['payment_method']}) к чеку №{$sale['receipt_number']}"
            );
            
            Response::success([
                'payment' => $payment,
                'sale' => $updatedSale
            ], 'Платёж принят', 201);
            
        } catch (Exception $e) {
            $this->db->rollback();
            error_log("Payment creation error: " . $e->getMessage());
            Response::error('Ошибка создания платежа: ' . $e->getMessage(), 500);
        }
    }
    
    // ✅ УПРОЩЁННОЕ УДАЛЕНИЕ ПЛАТЕЖА
    public function delete($id) {
        $this->user = Middleware::requirePermission('payments.delete');
        
        $payment = $this->db->fetchOne(
            "SELECT * FROM payments WHERE id = ? AND deleted_at IS NULL",
            [$id]
        );
        
        if (!$payment) {
            Response::notFound('Платёж не найден');
        }
        
        try {
            $this->db->beginTransaction();
            
            // ✅ ШАГ 1: Получаем продажу
            $sale = $this->db->fetchOne(
                "SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL",
                [$payment['sale_id']]
            );
            
            if (!$sale) {
                $this->db->rollback();
                Response::notFound('Продажа не найдена');
            }
            
            // ✅ ШАГ 2: Пересчитываем paid и debt
            $newPaid = $sale['paid'] - $payment['amount'];
            $newDebt = $sale['total'] - $newPaid;
            
            // ✅ ШАГ 3: Если платёж создал переплату → убираем её
            $oldOverpayment = max(0, $sale['paid'] - $sale['total']);
            $newOverpayment = max(0, $newPaid - $sale['total']);
            $overpaymentDiff = $oldOverpayment - $newOverpayment;
            
            if ($overpaymentDiff > 0) {
                // Уменьшаем баланс клиента
                $this->db->update(
                    "UPDATE clients 
                     SET current_overpayment = GREATEST(0, current_overpayment - ?)
                     WHERE id = ?",
                    [$overpaymentDiff, $sale['client_id']]
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
                        $payment['sale_id'],
                        $overpaymentDiff,
                        $newBalance,
                        $this->user['id'],
                        "Корректировка при удалении платежа на {$payment['amount']} сом"
                    ]
                );
            }
            
            // ✅ ШАГ 4: Обновляем продажу
            $this->db->update(
                "UPDATE sales 
                 SET paid = ?,
                     debt = ?,
                     new_overpayment = ?
                 WHERE id = ?",
                [$newPaid, $newDebt, $newOverpayment, $payment['sale_id']]
            );
            
            // ✅ ШАГ 5: Soft delete платежа
            $this->db->update(
                "UPDATE payments SET deleted_at = NOW() WHERE id = ?",
                [$id]
            );
            
            $this->db->commit();
            
            Middleware::logActivity(
                $this->user['id'],
                'delete',
                'payment',
                $id,
                "Удалён платёж на {$payment['amount']} сом"
            );
            
            Response::success(null, 'Платёж удалён');
            
        } catch (Exception $e) {
            $this->db->rollback();
            error_log("Payment deletion error: " . $e->getMessage());
            Response::error('Ошибка удаления платежа: ' . $e->getMessage(), 500);
        }
    }
    
    // Статистика платежей
    public function stats() {
        $this->user = Middleware::requirePermission('payments.view');
        
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            $byMethod = $this->db->fetchAll(
                "SELECT 
                    payment_method,
                    COUNT(*) as count,
                    SUM(amount) as total_amount
                 FROM payments
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?
                 GROUP BY payment_method",
                [$dateFrom, $dateTo]
            );
            
            $overall = $this->db->fetchOne(
                "SELECT 
                    COUNT(*) as total_payments,
                    SUM(amount) as total_amount,
                    AVG(amount) as avg_amount
                 FROM payments
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?",
                [$dateFrom, $dateTo]
            );
            
            Response::success([
                'overall' => $overall,
                'by_method' => $byMethod
            ]);
            
        } catch (Exception $e) {
            error_log("Payments stats error: " . $e->getMessage());
            Response::error('Ошибка получения статистики', 500);
        }
    }
}

// Маршрутизация
$controller = new PaymentsController();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'index';
$id = $_GET['id'] ?? null;

try {
    switch ($action) {
        case 'index':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->index();
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
    error_log("Payments API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера', 500);
}