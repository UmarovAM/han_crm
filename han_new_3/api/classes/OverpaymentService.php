<?php
// api/classes/OverpaymentService.php
// Сервис управления переплатами клиентов

class OverpaymentService {
    private $db;
    
    public function __construct() {
        $this->db = Database::getInstance();
    }
    
    /**
     * Генерация уникального transaction_id
     */
    private function generateTransactionId() {
        return 'OVP_' . date('YmdHis') . '_' . uniqid();
    }
    
    /**
     * Получить текущий баланс клиента
     */
    public function getBalance($clientId) {
        $client = $this->db->fetchOne(
            "SELECT current_overpayment FROM clients WHERE id = ? AND deleted_at IS NULL",
            [$clientId]
        );
        
        if (!$client) {
            throw new Exception("Клиент не найден");
        }
        
        return floatval($client['current_overpayment']);
    }
    
    /**
     * Создать переплату (при продаже или ручном пополнении)
     * v3.1: добавлена поддержка transaction_id, version, metadata
     */
    public function create($clientId, $amount, $saleId = null, $userId = null, $note = null, $metadata = null) {
        if ($amount <= 0) {
            throw new Exception("Сумма переплаты должна быть больше нуля");
        }
        
        $this->db->beginTransaction();
        
        try {
            // Генерируем уникальный transaction_id
            $transactionId = $this->generateTransactionId();
            
            // Optimistic locking: проверяем текущую версию клиента
            $client = $this->db->fetchOne(
                "SELECT current_overpayment, version FROM clients WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
                [$clientId]
            );
            
            if (!$client) {
                throw new Exception("Клиент не найден");
            }
            
            // 1. Обновляем баланс клиента с инкрементом версии
            $affected = $this->db->update(
                "UPDATE clients 
                 SET current_overpayment = current_overpayment + ?,
                     version = version + 1
                 WHERE id = ? AND version = ?",
                [$amount, $clientId, $client['version']]
            );
            
            if ($affected === 0) {
                throw new Exception("Конфликт версий: данные клиента были изменены");
            }
            
            // 2. Получаем новый баланс и версию
            $updated = $this->db->fetchOne(
                "SELECT current_overpayment, version FROM clients WHERE id = ?",
                [$clientId]
            );
            
            $newBalance = floatval($updated['current_overpayment']);
            $newVersion = intval($updated['version']);
            
            // 3. Записываем в журнал с новыми полями
            $overpaymentId = $this->db->insert(
                "INSERT INTO client_overpayments 
                 (transaction_id, client_id, sale_id, amount, type, balance_after, version, user_id, note, metadata)
                 VALUES (?, ?, ?, ?, 'created', ?, ?, ?, ?, ?)",
                [
                    $transactionId,
                    $clientId,
                    $saleId,
                    $amount,
                    $newBalance,
                    $newVersion,
                    $userId,
                    $note ?? "Создана переплата",
                    $metadata ? json_encode($metadata) : null
                ]
            );
            
            $this->db->commit();
            
            return [
                'overpayment_id' => $overpaymentId,
                'transaction_id' => $transactionId,
                'amount' => floatval($amount),
                'balance_after' => $newBalance,
                'version' => $newVersion
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Использовать переплату (при новой продаже)
     * ✅ ИСПРАВЛЕНО v3.1: используем 'adjusted' с отрицательной суммой + новые поля
     */
    public function use($clientId, $amount, $saleId, $userId = null, $note = null, $metadata = null) {
        if ($amount <= 0) {
            throw new Exception("Сумма использования должна быть больше нуля");
        }
        
        $currentBalance = $this->getBalance($clientId);
        
        if ($amount > $currentBalance) {
            throw new Exception("Недостаточно переплаты (доступно: {$currentBalance})");
        }
        
        $this->db->beginTransaction();
        
        try {
            // Генерируем transaction_id
            $transactionId = $this->generateTransactionId();
            
            // Optimistic locking
            $client = $this->db->fetchOne(
                "SELECT version FROM clients WHERE id = ? FOR UPDATE",
                [$clientId]
            );
            
            // 1. Уменьшаем баланс с проверкой версии
            $affected = $this->db->update(
                "UPDATE clients 
                 SET current_overpayment = current_overpayment - ?,
                     version = version + 1
                 WHERE id = ? AND version = ?",
                [$amount, $clientId, $client['version']]
            );
            
            if ($affected === 0) {
                throw new Exception("Конфликт версий: данные клиента были изменены");
            }
            
            // 2. Получаем новый баланс и версию
            $updated = $this->db->fetchOne(
                "SELECT current_overpayment, version FROM clients WHERE id = ?",
                [$clientId]
            );
            
            $newBalance = floatval($updated['current_overpayment']);
            $newVersion = intval($updated['version']);
            
            // 3. Записываем в журнал (отрицательная сумма + type='adjusted')
            $overpaymentId = $this->db->insert(
                "INSERT INTO client_overpayments 
                 (transaction_id, client_id, sale_id, amount, type, balance_after, version, user_id, note, metadata)
                 VALUES (?, ?, ?, ?, 'adjusted', ?, ?, ?, ?, ?)",
                [
                    $transactionId,
                    $clientId,
                    $saleId,
                    -$amount, // ✅ Отрицательная сумма
                    $newBalance,
                    $newVersion,
                    $userId,
                    $note ?? "Использована переплата в продаже №{$saleId}",
                    $metadata ? json_encode($metadata) : null
                ]
            );
            
            $this->db->commit();
            
            return [
                'overpayment_id' => $overpaymentId,
                'transaction_id' => $transactionId,
                'amount' => floatval($amount),
                'balance_after' => $newBalance,
                'version' => $newVersion
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Выдать переплату наличными
     * v3.1: добавлены новые поля
     */
    public function withdraw($clientId, $amount, $userId = null, $note = null, $metadata = null) {
        if ($amount <= 0) {
            throw new Exception("Сумма выдачи должна быть больше нуля");
        }
        
        $currentBalance = $this->getBalance($clientId);
        
        if ($amount > $currentBalance) {
            throw new Exception("Недостаточно переплаты (доступно: {$currentBalance})");
        }
        
        $this->db->beginTransaction();
        
        try {
            // Генерируем transaction_id
            $transactionId = $this->generateTransactionId();
            
            // Optimistic locking
            $client = $this->db->fetchOne(
                "SELECT version FROM clients WHERE id = ? FOR UPDATE",
                [$clientId]
            );
            
            // 1. Уменьшаем баланс с проверкой версии
            $affected = $this->db->update(
                "UPDATE clients 
                 SET current_overpayment = current_overpayment - ?,
                     version = version + 1
                 WHERE id = ? AND version = ?",
                [$amount, $clientId, $client['version']]
            );
            
            if ($affected === 0) {
                throw new Exception("Конфликт версий: данные клиента были изменены");
            }
            
            // 2. Получаем новый баланс и версию
            $updated = $this->db->fetchOne(
                "SELECT current_overpayment, version FROM clients WHERE id = ?",
                [$clientId]
            );
            
            $newBalance = floatval($updated['current_overpayment']);
            $newVersion = intval($updated['version']);
            
            // 3. Записываем в журнал
            $withdrawalId = $this->db->insert(
                "INSERT INTO client_overpayments 
                 (transaction_id, client_id, sale_id, amount, type, balance_after, version, user_id, note, metadata)
                 VALUES (?, ?, NULL, ?, 'withdrawn', ?, ?, ?, ?, ?)",
                [
                    $transactionId,
                    $clientId,
                    $amount,
                    $newBalance,
                    $newVersion,
                    $userId,
                    $note ?? "Выдана переплата наличными",
                    $metadata ? json_encode($metadata) : null
                ]
            );
            
            $this->db->commit();
            
            return [
                'withdrawal_id' => $withdrawalId,
                'transaction_id' => $transactionId,
                'amount' => floatval($amount),
                'balance_after' => $newBalance,
                'version' => $newVersion
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Корректировка баланса (ручное исправление)
     * v3.1: добавлены новые поля
     */
    public function adjust($clientId, $amount, $userId = null, $note = null, $metadata = null) {
        if ($amount == 0) {
            throw new Exception("Сумма корректировки не может быть нулевой");
        }
        
        $this->db->beginTransaction();
        
        try {
            // Генерируем transaction_id
            $transactionId = $this->generateTransactionId();
            
            // Optimistic locking
            $client = $this->db->fetchOne(
                "SELECT version FROM clients WHERE id = ? FOR UPDATE",
                [$clientId]
            );
            
            // 1. Изменяем баланс с проверкой версии
            $affected = $this->db->update(
                "UPDATE clients 
                 SET current_overpayment = GREATEST(0, current_overpayment + ?),
                     version = version + 1
                 WHERE id = ? AND version = ?",
                [$amount, $clientId, $client['version']]
            );
            
            if ($affected === 0) {
                throw new Exception("Конфликт версий: данные клиента были изменены");
            }
            
            // 2. Получаем новый баланс и версию
            $updated = $this->db->fetchOne(
                "SELECT current_overpayment, version FROM clients WHERE id = ?",
                [$clientId]
            );
            
            $newBalance = floatval($updated['current_overpayment']);
            $newVersion = intval($updated['version']);
            
            // 3. Записываем в журнал
            $adjustmentId = $this->db->insert(
                "INSERT INTO client_overpayments 
                 (transaction_id, client_id, sale_id, amount, type, balance_after, version, user_id, note, metadata)
                 VALUES (?, ?, NULL, ?, 'adjusted', ?, ?, ?, ?, ?)",
                [
                    $transactionId,
                    $clientId,
                    $amount,
                    $newBalance,
                    $newVersion,
                    $userId,
                    $note ?? "Ручная корректировка баланса",
                    $metadata ? json_encode($metadata) : null
                ]
            );
            
            $this->db->commit();
            
            return [
                'adjustment_id' => $adjustmentId,
                'transaction_id' => $transactionId,
                'amount' => floatval($amount),
                'balance_after' => $newBalance,
                'version' => $newVersion
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Пересчитать баланс клиента из журнала (восстановление)
     */
    public function recalculate($clientId) {
        $this->db->beginTransaction();
        
        try {
            // 1. Считаем баланс из журнала
            $history = $this->db->fetchAll(
                "SELECT amount FROM client_overpayments 
                 WHERE client_id = ?
                 ORDER BY created_at ASC, id ASC",
                [$clientId]
            );
            
            $calculatedBalance = 0;
            foreach ($history as $record) {
                $calculatedBalance += floatval($record['amount']);
            }
            
            // Не может быть отрицательным
            $calculatedBalance = max(0, $calculatedBalance);
            
            // 2. Обновляем в таблице clients
            $this->db->update(
                "UPDATE clients SET current_overpayment = ? WHERE id = ?",
                [$calculatedBalance, $clientId]
            );
            
            $this->db->commit();
            
            return [
                'client_id' => $clientId,
                'recalculated_balance' => $calculatedBalance
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Получить историю операций клиента
     */
    public function getHistory($clientId, $limit = 100) {
        return $this->db->fetchAll(
            "SELECT 
                co.id,
                co.sale_id,
                co.amount,
                co.type,
                co.balance_after,
                co.note,
                co.created_at,
                u.name as created_by_name
             FROM client_overpayments co
             LEFT JOIN users u ON co.user_id = u.id
             WHERE co.client_id = ?
             ORDER BY co.created_at DESC, co.id DESC
             LIMIT ?",
            [$clientId, $limit]
        );
    }
}