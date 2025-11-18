<?php
// api/classes/SalesService.php
// Сервис управления продажами

class SalesService {
    private $db;
    private $overpaymentService;
    private $stockService;
    private $receiptService;
    
    public function __construct() {
        $this->db = Database::getInstance();
        $this->overpaymentService = new OverpaymentService();
        $this->stockService = new StockService();
        $this->receiptService = new ReceiptService();
    }
    
    /**
     * Создать продажу
     */
    public function createSale($data, $userId = null) {
        // Валидация
        if (empty($data['client_id'])) {
            throw new Exception("Не указан клиент");
        }
        
        if (empty($data['items']) || !is_array($data['items'])) {
            throw new Exception("Не указаны товары");
        }
        
        if (!isset($data['paid']) || $data['paid'] < 0) {
            throw new Exception("Некорректная сумма оплаты");
        }
        
        $this->db->beginTransaction();
        
        try {
            // 1. Генерация номера чека через ReceiptService
            $receiptNumber = $this->receiptService->generateReceiptNumber();
            
            // 2. Валидация товаров и расчёт суммы
            $total = 0;
            $validatedItems = [];
            
            foreach ($data['items'] as $item) {
                if (!isset($item['product_id']) || !isset($item['quantity']) || !isset($item['price'])) {
                    throw new Exception("Некорректные данные товара");
                }
                
                $productId = intval($item['product_id']);
                $quantity = intval($item['quantity']);
                $price = floatval($item['price']);
                
                if ($quantity <= 0 || $price < 0) {
                    throw new Exception("Некорректные значения товара");
                }
                
                // Проверка остатков
                if (!$this->stockService->hasStock($productId, $quantity)) {
                    $product = $this->db->fetchOne("SELECT name FROM products WHERE id = ?", [$productId]);
                    $available = $this->stockService->getQuantity($productId);
                    throw new Exception("Недостаточно '{$product['name']}' на складе (доступно: {$available})");
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
            
            // 3. Создаём продажу
            $saleId = $this->db->insert(
                "INSERT INTO sales (receipt_number, client_id, user_id, total, paid, debt, new_overpayment) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    $receiptNumber,
                    $data['client_id'],
                    $userId,
                    $total,
                    $paid,
                    $debt,
                    $newOverpayment
                ]
            );
            
            // 4. Создаём позиции продажи
            foreach ($validatedItems as $item) {
                $this->db->insert(
                    "INSERT INTO sale_items (sale_id, product_id, quantity, price, user_id) 
                     VALUES (?, ?, ?, ?, ?)",
                    [$saleId, $item['product_id'], $item['quantity'], $item['price'], $userId]
                );
                
                // Списываем товар
                $this->stockService->decreaseStock(
                    $item['product_id'], 
                    $item['quantity'], 
                    'sale', 
                    $saleId, 
                    $userId
                );
            }
            
            // 5. Создаём платёж (если есть оплата)
            // ⚠️ Только ПЕРВИЧНЫЙ платёж! Дальнейшие — через PaymentService
            if ($paid > 0) {
                $this->db->insert(
                    "INSERT INTO payments (sale_id, amount, payment_method, note, user_id) 
                     VALUES (?, ?, 'cash', 'Оплата при продаже', ?)",
                    [$saleId, $paid, $userId]
                );
            }
            
            // 6. Если есть переплата → добавляем в баланс клиента
            // ✅ Переплата создаётся ОДИН РАЗ при создании продажи
            if ($newOverpayment > 0) {
                $this->overpaymentService->create(
                    $data['client_id'],
                    $newOverpayment,
                    $saleId,
                    $userId,
                    "Переплата по чеку №{$receiptNumber}"
                );
            }
            
            $this->db->commit();
            
            // Возвращаем созданную продажу
            return $this->getSale($saleId);
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * ❌ УДАЛЕНО: Платежи теперь через PaymentService
     * Оставляем только создание ПЕРВОГО платежа при продаже
     */
    
    /**
     * Удалить продажу (полный откат)
     */
    public function deleteSale($saleId, $userId = null) {
        $this->db->beginTransaction();
        
        try {
            // 1. Получаем продажу
            $sale = $this->db->fetchOne(
                "SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL",
                [$saleId]
            );
            
            if (!$sale) {
                throw new Exception("Продажа не найдена");
            }
            
            // 2. Возвращаем товары на склад
            $items = $this->db->fetchAll(
                "SELECT product_id, quantity FROM sale_items WHERE sale_id = ?",
                [$saleId]
            );
            
            foreach ($items as $item) {
                $this->stockService->increaseStock(
                    $item['product_id'],
                    $item['quantity'],
                    'adjustment',
                    $saleId,
                    $userId,
                    "Возврат при удалении чека №{$sale['receipt_number']}"
                );
            }
            
            // 3. Убираем переплату из баланса клиента
            if (floatval($sale['new_overpayment']) > 0) {
                $this->overpaymentService->adjust(
                    $sale['client_id'],
                    -floatval($sale['new_overpayment']),
                    $userId,
                    "Корректировка при удалении чека №{$sale['receipt_number']}"
                );
            }
            
            // 4. Soft delete платежей
            $this->db->update(
                "UPDATE payments SET deleted_at = NOW() WHERE sale_id = ?",
                [$saleId]
            );
            
            // 5. Soft delete продажи
            $this->db->update(
                "UPDATE sales SET deleted_at = NOW() WHERE id = ?",
                [$saleId]
            );
            
            $this->db->commit();
            
            return ['message' => 'Продажа удалена'];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Получить продажу со всеми деталями
     */
    public function getSale($saleId) {
        $sale = $this->db->fetchOne(
            "SELECT 
                s.*,
                c.name as client_name,
                c.phone as client_phone,
                u.name as created_by_name
             FROM sales s
             JOIN clients c ON s.client_id = c.id
             LEFT JOIN users u ON s.user_id = u.id
             WHERE s.id = ? AND s.deleted_at IS NULL",
            [$saleId]
        );
        
        if (!$sale) {
            return null;
        }
        
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
        
        return $sale;
    }
}