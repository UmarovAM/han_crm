<?php
// api/classes/PaymentService.php
// Сервис управления платежами (отдельный от продаж)

class PaymentService {
    private $db;
    private $overpaymentService;
    
    public function __construct() {
        $this->db = Database::getInstance();
        $this->overpaymentService = new OverpaymentService();
    }
    
    /**
     * Генерация уникального transaction_id для платежа
     */
    private function generateTransactionId() {
        return 'PAY_' . date('YmdHis') . '_' . uniqid();
    }
    
    /**
     * Создать платёж к продаже
     * v3.1: добавлена поддержка transaction_id, overpayment_record_id, version, metadata
     */
    public function createPayment($saleId, $amount, $paymentMethod = 'cash', $userId = null, $note = null, $metadata = null) {
        if ($amount <= 0) {
            throw new Exception("Сумма платежа должна быть больше нуля");
        }
        
        $this->db->beginTransaction();
        
        try {
            // 1. Получаем продажу с блокировкой
            $sale = $this->db->fetchOne(
                "SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
                [$saleId]
            );
            
            if (!$sale) {
                throw new Exception("Продажа не найдена");
            }
            
            // Генерируем transaction_id для платежа
            $paymentTransactionId = $this->generateTransactionId();
            
            // 2. Создаём платёж
            $paymentId = $this->db->insert(
                "INSERT INTO payments 
                 (transaction_id, sale_id, amount, payment_method, note, version, user_id, metadata) 
                 VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                [
                    $paymentTransactionId,
                    $saleId,
                    $amount,
                    $paymentMethod,
                    $note,
                    $userId,
                    $metadata ? json_encode($metadata) : null
                ]
            );
            
            // 3. Пересчитываем продажу
            $newPaid = floatval($sale['paid']) + $amount;
            $newDebt = max(0, floatval($sale['total']) - $newPaid);
            
            // Проверяем, появилась ли переплата
            $oldOverpayment = floatval($sale['new_overpayment']);
            $newOverpayment = max(0, $newPaid - floatval($sale['total']));
            $overpaymentDiff = $newOverpayment - $oldOverpayment;
            
            // 4. Обновляем продажу
            $this->db->update(
                "UPDATE sales 
                 SET paid = ?,
                     debt = ?,
                     new_overpayment = ?
                 WHERE id = ?",
                [$newPaid, $newDebt, $newOverpayment, $saleId]
            );
            
            // 5. Если появилась переплата → добавляем клиенту
            $overpaymentRecordId = null;
            if ($overpaymentDiff > 0) {
                $overpaymentMetadata = [
                    'payment_id' => $paymentId,
                    'payment_transaction_id' => $paymentTransactionId,
                    'payment_method' => $paymentMethod
                ];
                
                $overpaymentResult = $this->overpaymentService->create(
                    $sale['client_id'],
                    $overpaymentDiff,
                    $saleId,
                    $userId,
                    "Переплата при платеже к чеку №{$sale['receipt_number']}",
                    $overpaymentMetadata
                );
                
                $overpaymentRecordId = $overpaymentResult['overpayment_id'];
                
                // Обновляем платёж: связываем с записью переплаты
                $this->db->update(
                    "UPDATE payments 
                     SET overpayment_record_id = ?
                     WHERE id = ?",
                    [$overpaymentRecordId, $paymentId]
                );
            }
            
            $this->db->commit();
            
            return [
                'payment_id' => $paymentId,
                'transaction_id' => $paymentTransactionId,
                'overpayment_record_id' => $overpaymentRecordId,
                'new_paid' => floatval($newPaid),
                'new_debt' => floatval($newDebt),
                'new_overpayment' => floatval($newOverpayment)
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Удалить платёж (с откатом переплаты)
     * v3.1: используем overpayment_record_id для точного отката
     */
    public function deletePayment($paymentId, $userId = null) {
        $payment = $this->db->fetchOne(
            "SELECT * FROM payments WHERE id = ? AND deleted_at IS NULL",
            [$paymentId]
        );
        
        if (!$payment) {
            throw new Exception("Платёж не найден");
        }
        
        $this->db->beginTransaction();
        
        try {
            // 1. Получаем продажу
            $sale = $this->db->fetchOne(
                "SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
                [$payment['sale_id']]
            );
            
            if (!$sale) {
                throw new Exception("Продажа не найдена");
            }
            
            // 2. Пересчитываем после удаления платежа
            $newPaid = floatval($sale['paid']) - floatval($payment['amount']);
            $newDebt = floatval($sale['total']) - $newPaid;
            
            // Проверяем, была ли создана переплата этим платежом
            $oldOverpayment = floatval($sale['new_overpayment']);
            $newOverpayment = max(0, $newPaid - floatval($sale['total']));
            $overpaymentDiff = $oldOverpayment - $newOverpayment;
            
            // 3. Если платёж создал переплату → убираем её
            if ($overpaymentDiff > 0 && $payment['overpayment_record_id']) {
                // Используем точный overpayment_record_id для отката
                $overpaymentMetadata = [
                    'deleted_payment_id' => $paymentId,
                    'deleted_payment_transaction_id' => $payment['transaction_id'],
                    'original_overpayment_record_id' => $payment['overpayment_record_id']
                ];
                
                $this->overpaymentService->adjust(
                    $sale['client_id'],
                    -$overpaymentDiff,
                    $userId,
                    "Корректировка при удалении платежа #{$paymentId} на {$payment['amount']} сом",
                    $overpaymentMetadata
                );
            }
            
            // 4. Обновляем продажу
            $this->db->update(
                "UPDATE sales 
                 SET paid = ?,
                     debt = ?,
                     new_overpayment = ?
                 WHERE id = ?",
                [$newPaid, $newDebt, $newOverpayment, $payment['sale_id']]
            );
            
            // 5. Soft delete платежа
            $this->db->update(
                "UPDATE payments SET deleted_at = NOW() WHERE id = ?",
                [$paymentId]
            );
            
            $this->db->commit();
            
            return [
                'deleted_payment_id' => $paymentId,
                'transaction_id' => $payment['transaction_id'],
                'new_paid' => floatval($newPaid),
                'new_debt' => floatval($newDebt)
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Получить платежи по продаже
     */
    public function getPaymentsBySale($saleId) {
        return $this->db->fetchAll(
            "SELECT p.*, u.name as created_by_name
             FROM payments p
             LEFT JOIN users u ON p.user_id = u.id
             WHERE p.sale_id = ? AND p.deleted_at IS NULL
             ORDER BY p.created_at DESC",
            [$saleId]
        );
    }
    
    /**
     * Статистика платежей
     */
    public function getStats($dateFrom, $dateTo) {
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
        
        return [
            'overall' => $overall,
            'by_method' => $byMethod
        ];
    }
}