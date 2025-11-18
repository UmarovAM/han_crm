<?php
// api/classes/StockService.php
// Сервис управления складом

class StockService {
    private $db;
    
    public function __construct() {
        $this->db = Database::getInstance();
    }
    
    /**
     * Получить количество товара на складе
     */
    public function getQuantity($productId) {
        $stock = $this->db->fetchOne(
            "SELECT COALESCE(quantity, 0) as quantity FROM stock WHERE product_id = ?",
            [$productId]
        );
        
        return intval($stock['quantity'] ?? 0);
    }
    
    /**
     * Проверить наличие товара
     */
    public function hasStock($productId, $requiredQuantity) {
        return $this->getQuantity($productId) >= $requiredQuantity;
    }
    
    /**
     * Увеличить остаток (производство, возврат)
     */
    public function increaseStock($productId, $quantity, $movementType = 'production', $referenceId = null, $userId = null, $note = null) {
        if ($quantity <= 0) {
            throw new Exception("Количество должно быть больше нуля");
        }
        
        $this->db->beginTransaction();
        
        try {
            // 1. Обновляем остаток (создаём запись если нет)
            $exists = $this->db->fetchOne(
                "SELECT id FROM stock WHERE product_id = ?",
                [$productId]
            );
            
            if ($exists) {
                $this->db->update(
                    "UPDATE stock SET quantity = quantity + ? WHERE product_id = ?",
                    [$quantity, $productId]
                );
            } else {
                $this->db->insert(
                    "INSERT INTO stock (product_id, quantity) VALUES (?, ?)",
                    [$productId, $quantity]
                );
            }
            
            // 2. Получаем новое количество
            $newQuantity = $this->getQuantity($productId);
            
            // 3. Записываем движение
            $this->db->insert(
                "INSERT INTO stock_movements 
                 (product_id, quantity_change, quantity_after, movement_type, reference_id, note, user_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    $productId,
                    $quantity,
                    $newQuantity,
                    $movementType,
                    $referenceId,
                    $note,
                    $userId
                ]
            );
            
            $this->db->commit();
            
            return [
                'product_id' => $productId,
                'quantity_change' => $quantity,
                'quantity_after' => $newQuantity
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Уменьшить остаток (продажа, списание)
     */
    public function decreaseStock($productId, $quantity, $movementType = 'sale', $referenceId = null, $userId = null, $note = null) {
        if ($quantity <= 0) {
            throw new Exception("Количество должно быть больше нуля");
        }
        
        if (!$this->hasStock($productId, $quantity)) {
            $available = $this->getQuantity($productId);
            throw new Exception("Недостаточно товара на складе (доступно: {$available})");
        }
        
        $this->db->beginTransaction();
        
        try {
            // 1. Уменьшаем остаток
            $this->db->update(
                "UPDATE stock SET quantity = quantity - ? WHERE product_id = ?",
                [$quantity, $productId]
            );
            
            // 2. Получаем новое количество
            $newQuantity = $this->getQuantity($productId);
            
            // 3. Записываем движение (отрицательное значение)
            $this->db->insert(
                "INSERT INTO stock_movements 
                 (product_id, quantity_change, quantity_after, movement_type, reference_id, note, user_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    $productId,
                    -$quantity,
                    $newQuantity,
                    $movementType,
                    $referenceId,
                    $note,
                    $userId
                ]
            );
            
            $this->db->commit();
            
            return [
                'product_id' => $productId,
                'quantity_change' => -$quantity,
                'quantity_after' => $newQuantity
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Корректировка остатка (инвентаризация)
     */
    public function adjustStock($productId, $newQuantity, $userId = null, $reason = null) {
        if ($newQuantity < 0) {
            throw new Exception("Количество не может быть отрицательным");
        }
        
        $this->db->beginTransaction();
        
        try {
            $currentQuantity = $this->getQuantity($productId);
            $difference = $newQuantity - $currentQuantity;
            
            if ($difference == 0) {
                $this->db->rollback();
                return ['message' => 'Количество не изменилось'];
            }
            
            // Обновляем остаток
            $exists = $this->db->fetchOne(
                "SELECT id FROM stock WHERE product_id = ?",
                [$productId]
            );
            
            if ($exists) {
                $this->db->update(
                    "UPDATE stock SET quantity = ? WHERE product_id = ?",
                    [$newQuantity, $productId]
                );
            } else {
                $this->db->insert(
                    "INSERT INTO stock (product_id, quantity) VALUES (?, ?)",
                    [$productId, $newQuantity]
                );
            }
            
            // Записываем движение
            $this->db->insert(
                "INSERT INTO stock_movements 
                 (product_id, quantity_change, quantity_after, movement_type, reference_id, note, user_id)
                 VALUES (?, ?, ?, 'adjustment', NULL, ?, ?)",
                [
                    $productId,
                    $difference,
                    $newQuantity,
                    $reason ?? "Корректировка остатка",
                    $userId
                ]
            );
            
            $this->db->commit();
            
            return [
                'product_id' => $productId,
                'quantity_change' => $difference,
                'quantity_after' => $newQuantity
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Получить остатки всех товаров
     */
    public function getAllStock() {
        return $this->db->fetchAll(
            "SELECT 
                s.product_id as id,
                p.name,
                p.price,
                COALESCE(s.quantity, 0) as quantity,
                p.is_active
             FROM products p
             LEFT JOIN stock s ON p.id = s.product_id
             WHERE p.deleted_at IS NULL
             ORDER BY p.name"
        );
    }
    
    /**
     * Получить историю движений товара
     */
    public function getMovements($productId = null, $limit = 100) {
        $sql = "SELECT 
                    sm.*,
                    p.name as product_name,
                    u.name as user_name
                FROM stock_movements sm
                JOIN products p ON sm.product_id = p.id
                LEFT JOIN users u ON sm.user_id = u.id";
        
        $params = [];
        
        if ($productId) {
            $sql .= " WHERE sm.product_id = ?";
            $params[] = $productId;
        }
        
        $sql .= " ORDER BY sm.created_at DESC, sm.id DESC LIMIT ?";
        $params[] = $limit;
        
        return $this->db->fetchAll($sql, $params);
    }
}