<?php
// api/classes/ReceiptService.php
// Сервис генерации номеров чеков

class ReceiptService {
    private $db;
    
    public function __construct() {
        $this->db = Database::getInstance();
    }
    
    /**
     * Генерация нового номера чека
     * Формат: 6 цифр с лидирующими нулями (000001, 000002, ...)
     */
    public function generateReceiptNumber() {
        $this->db->beginTransaction();
        
        try {
            // Получаем последний номер с блокировкой строки (FOR UPDATE)
            $lastReceipt = $this->db->fetchOne(
                "SELECT receipt_number FROM sales 
                 ORDER BY id DESC 
                 LIMIT 1 
                 FOR UPDATE"
            );
            
            if ($lastReceipt && !empty($lastReceipt['receipt_number'])) {
                $lastNumber = intval($lastReceipt['receipt_number']);
                $newNumber = $lastNumber + 1;
            } else {
                $newNumber = 1;
            }
            
            // Форматируем с лидирующими нулями
            $receiptNumber = str_pad($newNumber, 6, '0', STR_PAD_LEFT);
            
            $this->db->commit();
            
            return $receiptNumber;
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Проверка уникальности номера чека
     */
    public function isReceiptNumberUnique($receiptNumber) {
        $exists = $this->db->fetchOne(
            "SELECT id FROM sales WHERE receipt_number = ?",
            [$receiptNumber]
        );
        
        return !$exists;
    }
    
    /**
     * Поиск продажи по номеру чека
     */
    public function findByReceiptNumber($receiptNumber) {
        return $this->db->fetchOne(
            "SELECT * FROM sales_list 
             WHERE receipt_number = ? 
             AND deleted_at IS NULL",
            [$receiptNumber]
        );
    }
    
    /**
     * Валидация формата номера чека
     */
    public function validateReceiptNumber($receiptNumber) {
        // Номер должен быть строкой из 6 цифр
        if (!preg_match('/^\d{6}$/', $receiptNumber)) {
            throw new Exception("Некорректный формат номера чека (должно быть 6 цифр)");
        }
        
        return true;
    }
    
    /**
     * Получить статистику по чекам
     */
    public function getReceiptStats($dateFrom = null, $dateTo = null) {
        $where = ["deleted_at IS NULL"];
        $params = [];
        
        if ($dateFrom) {
            $where[] = "DATE(created_at) >= ?";
            $params[] = $dateFrom;
        }
        
        if ($dateTo) {
            $where[] = "DATE(created_at) <= ?";
            $params[] = $dateTo;
        }
        
        $whereClause = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";
        
        return $this->db->fetchOne(
            "SELECT 
                COUNT(*) as total_receipts,
                MIN(receipt_number) as first_receipt,
                MAX(receipt_number) as last_receipt,
                COUNT(DISTINCT DATE(created_at)) as days_with_sales
             FROM sales
             $whereClause",
            $params
        );
    }
    
    /**
     * Проверка последовательности номеров (поиск пропусков)
     */
    public function checkReceiptSequence() {
        $receipts = $this->db->fetchAll(
            "SELECT receipt_number 
             FROM sales 
             WHERE deleted_at IS NULL 
             ORDER BY CAST(receipt_number AS UNSIGNED)"
        );
        
        $gaps = [];
        $previous = 0;
        
        foreach ($receipts as $receipt) {
            $current = intval($receipt['receipt_number']);
            
            if ($previous > 0 && $current != $previous + 1) {
                // Найден пропуск
                $gaps[] = [
                    'from' => str_pad($previous + 1, 6, '0', STR_PAD_LEFT),
                    'to' => str_pad($current - 1, 6, '0', STR_PAD_LEFT)
                ];
            }
            
            $previous = $current;
        }
        
        return [
            'total_receipts' => count($receipts),
            'has_gaps' => !empty($gaps),
            'gaps' => $gaps
        ];
    }
    
    /**
     * Экспорт чеков за период (для печати)
     */
    public function exportReceipts($dateFrom, $dateTo) {
        return $this->db->fetchAll(
            "SELECT 
                receipt_number,
                created_at,
                client_name,
                total,
                paid,
                debt,
                items_list,
                created_by
             FROM sales_list
             WHERE DATE(created_at) BETWEEN ? AND ?
             ORDER BY receipt_number",
            [$dateFrom, $dateTo]
        );
    }
    
    /**
     * Получить следующий свободный номер (без создания)
     */
    public function getNextReceiptNumber() {
        $lastReceipt = $this->db->fetchOne(
            "SELECT receipt_number FROM sales ORDER BY id DESC LIMIT 1"
        );
        
        if ($lastReceipt) {
            $nextNumber = intval($lastReceipt['receipt_number']) + 1;
        } else {
            $nextNumber = 1;
        }
        
        return str_pad($nextNumber, 6, '0', STR_PAD_LEFT);
    }
    
    /**
     * Пересчёт нумерации (опасная операция!)
     * Используется только при миграции или восстановлении
     */
    public function recalculateReceiptNumbers() {
        $this->db->beginTransaction();
        
        try {
            // Получаем все продажи в порядке создания
            $sales = $this->db->fetchAll(
                "SELECT id FROM sales ORDER BY created_at ASC, id ASC"
            );
            
            $number = 1;
            
            foreach ($sales as $sale) {
                $receiptNumber = str_pad($number, 6, '0', STR_PAD_LEFT);
                
                $this->db->update(
                    "UPDATE sales SET receipt_number = ? WHERE id = ?",
                    [$receiptNumber, $sale['id']]
                );
                
                $number++;
            }
            
            $this->db->commit();
            
            return [
                'recalculated_count' => count($sales),
                'last_receipt_number' => str_pad($number - 1, 6, '0', STR_PAD_LEFT)
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
}