<?php
// api/classes/ClientService.php
// Сервис управления клиентами

class ClientService {
    private $db;
    private $overpaymentService;
    
    public function __construct() {
        $this->db = Database::getInstance();
        $this->overpaymentService = new OverpaymentService();
    }
    
    /**
     * Получить список клиентов с пагинацией
     */
    public function getClients($page = 1, $pageSize = 50, $search = '') {
        $offset = ($page - 1) * $pageSize;
        
        $filters = ["c.deleted_at IS NULL"];
        $params = [];
        
        if ($search) {
            $filters[] = "(c.name LIKE ? OR c.phone LIKE ?)";
            $searchPattern = '%' . $this->db->escapeLike($search) . '%';
            $params[] = $searchPattern;
            $params[] = $searchPattern;
        }
        
        $whereClause = "WHERE " . implode(" AND ", $filters);
        
        // Подсчёт общего количества
        $total = $this->db->fetchOne(
            "SELECT COUNT(*) as count FROM clients c $whereClause",
            $params
        )['count'];
        
        // Получение клиентов через VIEW
        $clients = $this->db->fetchAll(
            "SELECT * FROM client_balances
             WHERE id IN (
                 SELECT id FROM clients c
                 $whereClause
                 ORDER BY c.name
                 LIMIT ? OFFSET ?
             )",
            array_merge($params, [$pageSize, $offset])
        );
        
        return [
            'items' => $clients,
            'total' => (int)$total,
            'page' => (int)$page,
            'page_size' => (int)$pageSize
        ];
    }
    
    /**
     * Получить одного клиента с деталями
     */
    public function getClient($id) {
        $client = $this->db->fetchOne(
            "SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL",
            [$id]
        );
        
        if (!$client) {
            throw new Exception("Клиент не найден");
        }
        
        // Добавляем историю переплат
        $client['overpayment_history'] = $this->overpaymentService->getHistory($id);
        
        // Добавляем последние продажи
        $client['recent_sales'] = $this->db->fetchAll(
            "SELECT * FROM sales_list
             WHERE client_name = ?
             ORDER BY created_at DESC
             LIMIT 10",
            [$client['name']]
        );
        
        return $client;
    }
    
    /**
     * Создать клиента
     */
    public function createClient($data, $userId = null) {
        // Валидация
        if (empty($data['name']) || strlen($data['name']) < 2) {
            throw new Exception("Имя клиента должно быть не менее 2 символов");
        }
        
        if (isset($data['phone']) && strlen($data['phone']) > 20) {
            throw new Exception("Телефон слишком длинный");
        }
        
        $this->db->beginTransaction();
        
        try {
            // Проверка дубликатов (опционально)
            if (!empty($data['phone'])) {
                $exists = $this->db->fetchOne(
                    "SELECT id FROM clients WHERE phone = ? AND deleted_at IS NULL",
                    [$data['phone']]
                );
                
                if ($exists) {
                    throw new Exception("Клиент с таким телефоном уже существует");
                }
            }
            
            // Создание клиента
            $clientId = $this->db->insert(
                "INSERT INTO clients (name, phone, address, created_by) 
                 VALUES (?, ?, ?, ?)",
                [
                    $data['name'],
                    $data['phone'] ?? null,
                    $data['address'] ?? null,
                    $userId
                ]
            );
            
            $this->db->commit();
            
            return $this->getClient($clientId);
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Обновить клиента
     */
    public function updateClient($id, $data, $userId = null) {
        $client = $this->db->fetchOne(
            "SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL",
            [$id]
        );
        
        if (!$client) {
            throw new Exception("Клиент не найден");
        }
        
        // Валидация
        if (isset($data['name']) && strlen($data['name']) < 2) {
            throw new Exception("Имя клиента должно быть не менее 2 символов");
        }
        
        $this->db->beginTransaction();
        
        try {
            $updates = [];
            $params = [];
            
            if (isset($data['name'])) {
                $updates[] = "name = ?";
                $params[] = $data['name'];
            }
            
            if (isset($data['phone'])) {
                $updates[] = "phone = ?";
                $params[] = $data['phone'];
            }
            
            if (isset($data['address'])) {
                $updates[] = "address = ?";
                $params[] = $data['address'];
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
                "UPDATE clients SET " . implode(', ', $updates) . " WHERE id = ?",
                $params
            );
            
            $this->db->commit();
            
            return $this->getClient($id);
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Удалить клиента (soft delete)
     */
    public function deleteClient($id, $userId = null) {
        $client = $this->db->fetchOne(
            "SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL",
            [$id]
        );
        
        if (!$client) {
            throw new Exception("Клиент не найден");
        }
        
        // Проверка наличия активных продаж
        $activeSales = $this->db->fetchOne(
            "SELECT COUNT(*) as count FROM sales 
             WHERE client_id = ? AND deleted_at IS NULL",
            [$id]
        )['count'];
        
        if ($activeSales > 0) {
            throw new Exception("Невозможно удалить клиента с активными продажами");
        }
        
        $this->db->beginTransaction();
        
        try {
            $this->db->update(
                "UPDATE clients SET deleted_at = NOW() WHERE id = ?",
                [$id]
            );
            
            $this->db->commit();
            
            return ['message' => 'Клиент удалён'];
            
        } catch (Exception $e) {
            $this->db->rollback();
            throw $e;
        }
    }
    
    /**
     * Выдать переплату наличными
     */
    public function withdrawOverpayment($id, $amount, $userId = null, $note = null) {
        $client = $this->db->fetchOne(
            "SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL",
            [$id]
        );
        
        if (!$client) {
            throw new Exception("Клиент не найден");
        }
        
        if ($amount <= 0) {
            throw new Exception("Сумма должна быть больше нуля");
        }
        
        if ($amount > floatval($client['current_overpayment'])) {
            throw new Exception("Недостаточно переплаты у клиента (доступно: {$client['current_overpayment']})");
        }
        
        return $this->overpaymentService->withdraw(
            $id,
            $amount,
            $userId,
            $note ?? 'Выдача переплаты наличными'
        );
    }
    
    /**
     * Получить должников
     */
    public function getDebtors() {
        return $this->db->fetchAll(
            "SELECT 
                c.id as client_id,
                c.name as client_name,
                c.phone as client_phone,
                COUNT(DISTINCT s.id) as sales_count,
                COALESCE(SUM(s.total), 0) as total_amount,
                COALESCE(SUM(s.paid), 0) as total_paid,
                COALESCE(SUM(s.debt), 0) as total_debt
             FROM clients c
             INNER JOIN sales s ON s.client_id = c.id
             WHERE c.deleted_at IS NULL
             AND s.deleted_at IS NULL
             AND s.debt > 0
             GROUP BY c.id, c.name, c.phone
             HAVING total_debt > 0
             ORDER BY total_debt DESC"
        );
    }
    
    /**
     * Получить клиентов с переплатами
     */
    public function getOverpayments() {
        return $this->db->fetchAll(
            "SELECT 
                c.id as client_id,
                c.name as client_name,
                c.phone as client_phone,
                c.current_overpayment as balance
             FROM clients c
             WHERE c.deleted_at IS NULL
             AND c.current_overpayment > 0
             ORDER BY c.current_overpayment DESC"
        );
    }
    
    /**
     * Пересчитать баланс клиента из журнала
     */
    public function recalculateBalance($id, $userId = null) {
        return $this->overpaymentService->recalculate($id);
    }
}