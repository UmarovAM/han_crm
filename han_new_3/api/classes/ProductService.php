<?php
// api/classes/ProductService.php
// Сервис управления товарами

class ProductService {
    private $db;
    private $stockService;
    
    public function __construct() {
        $this->db = Database::getInstance();
        $this->stockService = new StockService();
    }
    
    /**
     * Получить список товаров с остатками
     */
    public function getProducts($page = 1, $pageSize = 100, $search = '', $activeOnly = false) {
        $offset = ($page - 1) * $pageSize;
        
        $filters = ["p.deleted_at IS NULL"];
        $params = [];
        
        if ($search) {
            $filters[] = "p.name LIKE ?";
            $params[] = '%' . $this->db->escapeLike($search) . '%';
        }
        
        if ($activeOnly) {
            $filters[] = "p.is_active = 1";
        }
        
        $whereClause = "WHERE " . implode(" AND ", $filters);
        
        // Подсчёт общего количества
        $total = $this->db->fetchOne(
            "SELECT COUNT(*) as count FROM products p $whereClause",
            $params
        )['count'];
        
        // Получение товаров с остатками
        $products = $this->db->fetchAll(
            "SELECT 
                p.id,
                p.name,
                p.price,
                p.is_active,
                COALESCE(s.quantity, 0) as quantity,
                p.created_at,
                p.updated_at
             FROM products p
             LEFT JOIN stock s ON p.id = s.product_id
             $whereClause
             ORDER BY p.name
             LIMIT ? OFFSET ?",
            array_merge($params, [$pageSize, $offset])
        );
        
        return [
            'items' => $products,
            'total' => (int)$total,
            'page' => (int)$page,
            'page_size' => (int)$pageSize
        ];
    }
    
    /**
     * Получить один товар
     */
    public function getProduct($id) {
        $product = $this->db->fetchOne(
            "SELECT 
                p.*,
                COALESCE(s.quantity, 0) as quantity
             FROM products p
             LEFT JOIN stock s ON p.id = s.product_id
             WHERE p.id = ? AND p.deleted_at IS NULL",
            [$id]
        );
        
        if (!$product) {
            throw new Exception("Товар не найден");
        }
        
        // Добавляем историю движений
        $product['movements'] = $this->stockService->getMovements($id, 50);
        
        return $product;
    }
    
    /**
     * Создать товар
     */
    public function createProduct($data, $userId = null) {
        // Валидация
        if (empty($data['name']) || strlen($data['name']) < 2) {
            throw new Exception("Название товара должно быть не менее 2 символов");
        }
        
        if (!isset($data['price']) || $data['price'] < 0) {
            throw new Exception("Укажите корректную цену");
        }
        
        $this->db->beginTransaction();
        
        try {
            // Проверка дубликатов
            $exists = $this->db->fetchOne(
                "SELECT id FROM products WHERE name = ? AND deleted_at IS NULL",
                [$data['name']]
            );
            
            if ($exists) {
                throw new Exception("Товар с таким названием уже существует");
            }
            
            // Создание товара
            $productId = $this->db->insert(
                "INSERT INTO products (name, price, is_active) 
                 VALUES (?, ?, ?)",
                [
                    $data['name'],
                    $data['price'],
                    $data['is_active'] ?? 1
                ]
            );
            
            // Создаём запись в stock с нулевым остатком
            $this->db->insert(
                "INSERT INTO stock (product_id, quantity) VALUES (?, 0)",
                [$productId]
            );
            
            $this->db->commit();
            
            return $this->getProduct($productId);
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Обновить товар
     */
    public function updateProduct($id, $data, $userId = null) {
        $product = $this->db->fetchOne(
            "SELECT * FROM products WHERE id = ? AND deleted_at IS NULL",
            [$id]
        );
        
        if (!$product) {
            throw new Exception("Товар не найден");
        }
        
        // Валидация
        if (isset($data['name']) && strlen($data['name']) < 2) {
            throw new Exception("Название товара должно быть не менее 2 символов");
        }
        
        if (isset($data['price']) && $data['price'] < 0) {
            throw new Exception("Цена не может быть отрицательной");
        }
        
        $this->db->beginTransaction();
        
        try {
            $updates = [];
            $params = [];
            
            if (isset($data['name'])) {
                $updates[] = "name = ?";
                $params[] = $data['name'];
            }
            
            if (isset($data['price'])) {
                $updates[] = "price = ?";
                $params[] = $data['price'];
            }
            
            if (isset($data['is_active'])) {
                $updates[] = "is_active = ?";
                $params[] = $data['is_active'] ? 1 : 0;
            }
            
            if (empty($updates)) {
                throw new Exception("Нет данных для обновления");
            }
            
            $params[] = $id;
            
            $this->db->update(
                "UPDATE products SET " . implode(', ', $updates) . " WHERE id = ?",
                $params
            );
            
            $this->db->commit();
            
            return $this->getProduct($id);
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Массовое обновление цен
     */
    public function updatePrices($updates, $userId = null) {
        if (!is_array($updates) || empty($updates)) {
            throw new Exception("Нет данных для обновления");
        }
        
        $this->db->beginTransaction();
        
        try {
            $updatedCount = 0;
            
            foreach ($updates as $update) {
                if (!isset($update['id']) || !isset($update['price'])) {
                    continue;
                }
                
                $productId = intval($update['id']);
                $newPrice = floatval($update['price']);
                
                if ($newPrice < 0) {
                    continue;
                }
                
                $this->db->update(
                    "UPDATE products SET price = ? WHERE id = ? AND deleted_at IS NULL",
                    [$newPrice, $productId]
                );
                
                $updatedCount++;
            }
            
            $this->db->commit();
            
            return [
                'updated_count' => $updatedCount,
                'message' => "Обновлено цен: {$updatedCount}"
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Удалить товар (soft delete)
     */
    public function deleteProduct($id, $userId = null) {
        $product = $this->db->fetchOne(
            "SELECT * FROM products WHERE id = ? AND deleted_at IS NULL",
            [$id]
        );
        
        if (!$product) {
            throw new Exception("Товар не найден");
        }
        
        // Проверка наличия в активных продажах
        $inSales = $this->db->fetchOne(
            "SELECT COUNT(*) as count FROM sale_items si
             INNER JOIN sales s ON si.sale_id = s.id
             WHERE si.product_id = ? AND s.deleted_at IS NULL",
            [$id]
        )['count'];
        
        if ($inSales > 0) {
            throw new Exception("Невозможно удалить товар, участвующий в продажах");
        }
        
        $this->db->beginTransaction();
        
        try {
            $this->db->update(
                "UPDATE products SET deleted_at = NOW() WHERE id = ?",
                [$id]
            );
            
            $this->db->commit();
            
            return ['message' => 'Товар удалён'];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Получить остатки всех товаров (для склада)
     */
    public function getStock() {
        return $this->stockService->getAllStock();
    }
    
    /**
     * Корректировка остатка товара
     */
    public function adjustStock($productId, $newQuantity, $userId = null, $reason = null) {
        return $this->stockService->adjustStock($productId, $newQuantity, $userId, $reason);
    }
    
    /**
     * Добавить производство
     */
    public function addProduction($productId, $quantity, $shift, $userId = null, $note = null) {
        if ($quantity <= 0) {
            throw new Exception("Количество должно быть больше нуля");
        }
        
        if (!in_array($shift, ['day', 'night'])) {
            throw new Exception("Некорректная смена");
        }
        
        $this->db->beginTransaction();
        
        try {
            // Создаём запись производства
            $productionId = $this->db->insert(
                "INSERT INTO production (product_id, quantity, shift, note, user_id) 
                 VALUES (?, ?, ?, ?, ?)",
                [$productId, $quantity, $shift, $note, $userId]
            );
            
            // Увеличиваем остаток
            $this->stockService->increaseStock(
                $productId,
                $quantity,
                'production',
                $productionId,
                $userId,
                "Производство: {$shift} смена" . ($note ? " - {$note}" : "")
            );
            
            $this->db->commit();
            
            return [
                'production_id' => $productionId,
                'product_id' => $productId,
                'quantity' => $quantity,
                'shift' => $shift
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Списать товар (брак, порча)
     */
    public function writeOff($productId, $quantity, $type = 'other', $reason, $userId = null) {
        if ($quantity <= 0) {
            throw new Exception("Количество должно быть больше нуля");
        }
        
        if (empty($reason)) {
            throw new Exception("Укажите причину списания");
        }
        
        $validTypes = ['defect', 'expired', 'damage', 'other'];
        if (!in_array($type, $validTypes)) {
            throw new Exception("Некорректный тип списания");
        }
        
        $this->db->beginTransaction();
        
        try {
            // Создаём запись списания
            $writeOffId = $this->db->insert(
                "INSERT INTO write_offs (product_id, quantity, type, reason, user_id) 
                 VALUES (?, ?, ?, ?, ?)",
                [$productId, $quantity, $type, $reason, $userId]
            );
            
            // Уменьшаем остаток
            $this->stockService->decreaseStock(
                $productId,
                $quantity,
                'writeoff',
                $writeOffId,
                $userId,
                "Списание: {$reason}"
            );
            
            $this->db->commit();
            
            return [
                'writeoff_id' => $writeOffId,
                'product_id' => $productId,
                'quantity' => $quantity,
                'type' => $type
            ];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Получить журнал производства
     */
    public function getProduction($filters = []) {
        $where = ["p.deleted_at IS NULL"];
        $params = [];
        
        if (!empty($filters['date_from'])) {
            $where[] = "DATE(p.created_at) >= ?";
            $params[] = $filters['date_from'];
        }
        
        if (!empty($filters['date_to'])) {
            $where[] = "DATE(p.created_at) <= ?";
            $params[] = $filters['date_to'];
        }
        
        if (!empty($filters['product_id'])) {
            $where[] = "p.product_id = ?";
            $params[] = $filters['product_id'];
        }
        
        if (!empty($filters['shift'])) {
            $where[] = "p.shift = ?";
            $params[] = $filters['shift'];
        }
        
        $whereClause = "WHERE " . implode(" AND ", $where);
        
        return $this->db->fetchAll(
            "SELECT 
                p.*,
                pr.name as product_name,
                u.name as user_name
             FROM production p
             JOIN products pr ON p.product_id = pr.id
             LEFT JOIN users u ON p.user_id = u.id
             $whereClause
             ORDER BY p.created_at DESC
             LIMIT 100",
            $params
        );
    }
    
    /**
     * Получить журнал списаний
     */
    public function getWriteOffs($filters = []) {
        $where = ["w.deleted_at IS NULL"];
        $params = [];
        
        if (!empty($filters['date_from'])) {
            $where[] = "DATE(w.created_at) >= ?";
            $params[] = $filters['date_from'];
        }
        
        if (!empty($filters['date_to'])) {
            $where[] = "DATE(w.created_at) <= ?";
            $params[] = $filters['date_to'];
        }
        
        if (!empty($filters['product_id'])) {
            $where[] = "w.product_id = ?";
            $params[] = $filters['product_id'];
        }
        
        if (!empty($filters['type'])) {
            $where[] = "w.type = ?";
            $params[] = $filters['type'];
        }
        
        $whereClause = "WHERE " . implode(" AND ", $where);
        
        return $this->db->fetchAll(
            "SELECT 
                w.*,
                p.name as product_name,
                u.name as user_name
             FROM write_offs w
             JOIN products p ON w.product_id = p.id
             LEFT JOIN users u ON w.user_id = u.id
             $whereClause
             ORDER BY w.created_at DESC
             LIMIT 100",
            $params
        );
    }
}