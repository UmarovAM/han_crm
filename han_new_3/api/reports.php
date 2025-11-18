<?php
// api/reports.php - Отчёты и аналитика

require_once 'config.php';
require_once 'autoload.php';

class ReportsController {
    private $db;
    private $user;
    private $clientService;
    private $productService;
    
    public function __construct() {
        $this->db = Database::getInstance();
        $this->clientService = new ClientService();
        $this->productService = new ProductService();
    }
    
    // Сводный отчёт
    public function summary() {
        $this->user = Middleware::requirePermission('reports.view');
        
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            // Продажи
            $sales = $this->db->fetchOne(
                "SELECT 
                    COUNT(*) as total_sales,
                    SUM(total) as total_amount,
                    SUM(paid) as total_paid,
                    SUM(debt) as total_debt,
                    AVG(total) as avg_sale,
                    COUNT(DISTINCT client_id) as unique_clients
                 FROM sales
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?",
                [$dateFrom, $dateTo]
            );
            
            // Платежи
            $payments = $this->db->fetchOne(
                "SELECT 
                    COUNT(*) as total_payments,
                    SUM(amount) as total_amount
                 FROM payments
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?",
                [$dateFrom, $dateTo]
            );
            
            // Производство
            $production = $this->db->fetchOne(
                "SELECT 
                    COUNT(*) as total_records,
                    SUM(quantity) as total_quantity
                 FROM production
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?",
                [$dateFrom, $dateTo]
            );
            
            // Списания
            $writeOffs = $this->db->fetchOne(
                "SELECT 
                    COUNT(*) as total_records,
                    SUM(quantity) as total_quantity
                 FROM write_offs
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?",
                [$dateFrom, $dateTo]
            );
            
            // Остатки на складе
            $stock = $this->db->fetchOne(
                "SELECT 
                    COUNT(*) as total_products,
                    SUM(s.quantity) as total_quantity,
                    COUNT(CASE WHEN s.quantity = 0 THEN 1 END) as out_of_stock,
                    COUNT(CASE WHEN s.quantity > 0 AND s.quantity < 10 THEN 1 END) as low_stock
                 FROM products p
                 LEFT JOIN stock s ON p.id = s.product_id
                 WHERE p.deleted_at IS NULL"
            );
            
            // Текущие долги и переплаты
            $debtors = $this->db->fetchOne(
                "SELECT 
                    COUNT(DISTINCT client_id) as total_debtors,
                    SUM(debt) as total_debt
                 FROM sales
                 WHERE deleted_at IS NULL
                 AND debt > 0"
            );
            
            $overpayments = $this->db->fetchOne(
                "SELECT 
                    COUNT(*) as total_clients,
                    SUM(current_overpayment) as total_overpayment
                 FROM clients
                 WHERE deleted_at IS NULL
                 AND current_overpayment > 0"
            );
            
            Response::success([
                'period' => [
                    'date_from' => $dateFrom,
                    'date_to' => $dateTo
                ],
                'sales' => $sales,
                'payments' => $payments,
                'production' => $production,
                'write_offs' => $writeOffs,
                'stock' => $stock,
                'debtors' => $debtors,
                'overpayments' => $overpayments
            ]);
            
        } catch (Exception $e) {
            error_log("Reports summary error: " . $e->getMessage());
            Response::error('Ошибка формирования отчёта', 500);
        }
    }
    
    // Отчёт по должникам
    public function debtors() {
        $this->user = Middleware::requirePermission('reports.view');
        
        try {
            $debtors = $this->clientService->getDebtors();
            
            // Добавляем детали по продажам
            foreach ($debtors as &$debtor) {
                $debtor['sales'] = $this->db->fetchAll(
                    "SELECT 
                        id,
                        receipt_number,
                        created_at,
                        total,
                        paid,
                        debt
                     FROM sales
                     WHERE client_id = ?
                     AND deleted_at IS NULL
                     AND debt > 0
                     ORDER BY created_at DESC",
                    [$debtor['client_id']]
                );
            }
            
            Response::success($debtors);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Отчёт по переплатам
    public function overpayments() {
        $this->user = Middleware::requirePermission('reports.view');
        
        try {
            $overpayments = $this->clientService->getOverpayments();
            
            // Добавляем историю переплат
            foreach ($overpayments as &$overpayment) {
                $overpaymentService = new OverpaymentService();
                $overpayment['history'] = $overpaymentService->getHistory($overpayment['client_id'], 10);
            }
            
            Response::success($overpayments);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Отчёт по складу
    public function stock() {
        $this->user = Middleware::requirePermission('reports.view');
        
        try {
            $stock = $this->productService->getStock();
            
            // Группируем по статусам
            $outOfStock = array_filter($stock, fn($item) => $item['quantity'] == 0);
            $lowStock = array_filter($stock, fn($item) => $item['quantity'] > 0 && $item['quantity'] < 10);
            $inStock = array_filter($stock, fn($item) => $item['quantity'] >= 10);
            
            Response::success([
                'all' => $stock,
                'out_of_stock' => array_values($outOfStock),
                'low_stock' => array_values($lowStock),
                'in_stock' => array_values($inStock),
                'statistics' => [
                    'total_products' => count($stock),
                    'out_of_stock_count' => count($outOfStock),
                    'low_stock_count' => count($lowStock),
                    'in_stock_count' => count($inStock),
                    'total_quantity' => array_sum(array_column($stock, 'quantity'))
                ]
            ]);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
    
    // Отчёт по продажам (детальный)
    public function salesReport() {
        $this->user = Middleware::requirePermission('reports.view');
        
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            // По дням
            $byDay = $this->db->fetchAll(
                "SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as sales_count,
                    SUM(total) as total_amount,
                    SUM(paid) as total_paid,
                    SUM(debt) as total_debt,
                    AVG(total) as avg_sale
                 FROM sales
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?
                 GROUP BY DATE(created_at)
                 ORDER BY date DESC",
                [$dateFrom, $dateTo]
            );
            
            // По клиентам
            $byClient = $this->db->fetchAll(
                "SELECT 
                    c.id as client_id,
                    c.name as client_name,
                    c.phone as client_phone,
                    COUNT(s.id) as sales_count,
                    SUM(s.total) as total_amount,
                    SUM(s.paid) as total_paid,
                    SUM(s.debt) as total_debt
                 FROM clients c
                 INNER JOIN sales s ON s.client_id = c.id
                 WHERE c.deleted_at IS NULL
                 AND s.deleted_at IS NULL
                 AND DATE(s.created_at) BETWEEN ? AND ?
                 GROUP BY c.id, c.name, c.phone
                 ORDER BY total_amount DESC
                 LIMIT 20",
                [$dateFrom, $dateTo]
            );
            
            // По товарам
            $byProduct = $this->db->fetchAll(
                "SELECT 
                    p.id as product_id,
                    p.name as product_name,
                    SUM(si.quantity) as total_quantity,
                    COUNT(DISTINCT si.sale_id) as sales_count,
                    SUM(si.quantity * si.price) as total_amount,
                    AVG(si.price) as avg_price
                 FROM sale_items si
                 INNER JOIN sales s ON si.sale_id = s.id
                 INNER JOIN products p ON si.product_id = p.id
                 WHERE s.deleted_at IS NULL
                 AND DATE(s.created_at) BETWEEN ? AND ?
                 GROUP BY p.id, p.name
                 ORDER BY total_quantity DESC",
                [$dateFrom, $dateTo]
            );
            
            Response::success([
                'period' => [
                    'date_from' => $dateFrom,
                    'date_to' => $dateTo
                ],
                'by_day' => $byDay,
                'by_client' => $byClient,
                'by_product' => $byProduct
            ]);
            
        } catch (Exception $e) {
            error_log("Sales report error: " . $e->getMessage());
            Response::error('Ошибка формирования отчёта', 500);
        }
    }
    
    // Отчёт по платежам
    public function paymentsReport() {
        $this->user = Middleware::requirePermission('reports.view');
        
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            // По дням
            $byDay = $this->db->fetchAll(
                "SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as payments_count,
                    SUM(amount) as total_amount
                 FROM payments
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?
                 GROUP BY DATE(created_at)
                 ORDER BY date DESC",
                [$dateFrom, $dateTo]
            );
            
            // По методам оплаты
            $byMethod = $this->db->fetchAll(
                "SELECT 
                    payment_method,
                    COUNT(*) as payments_count,
                    SUM(amount) as total_amount,
                    AVG(amount) as avg_amount
                 FROM payments
                 WHERE deleted_at IS NULL
                 AND DATE(created_at) BETWEEN ? AND ?
                 GROUP BY payment_method
                 ORDER BY total_amount DESC",
                [$dateFrom, $dateTo]
            );
            
            // По пользователям
            $byUser = $this->db->fetchAll(
                "SELECT 
                    u.id as user_id,
                    u.name as user_name,
                    COUNT(p.id) as payments_count,
                    SUM(p.amount) as total_amount
                 FROM payments p
                 LEFT JOIN users u ON p.user_id = u.id
                 WHERE p.deleted_at IS NULL
                 AND DATE(p.created_at) BETWEEN ? AND ?
                 GROUP BY u.id, u.name
                 ORDER BY total_amount DESC",
                [$dateFrom, $dateTo]
            );
            
            Response::success([
                'period' => [
                    'date_from' => $dateFrom,
                    'date_to' => $dateTo
                ],
                'by_day' => $byDay,
                'by_method' => $byMethod,
                'by_user' => $byUser
            ]);
            
        } catch (Exception $e) {
            error_log("Payments report error: " . $e->getMessage());
            Response::error('Ошибка формирования отчёта', 500);
        }
    }
    
    // Экспорт отчёта (CSV)
    public function export() {
        $this->user = Middleware::requirePermission('reports.export');
        
        $type = $_GET['type'] ?? 'sales';
        $dateFrom = $_GET['date_from'] ?? date('Y-m-01');
        $dateTo = $_GET['date_to'] ?? date('Y-m-d');
        
        try {
            $data = [];
            $filename = '';
            
            switch ($type) {
                case 'sales':
                    $data = $this->db->fetchAll(
                        "SELECT * FROM sales_list 
                         WHERE DATE(created_at) BETWEEN ? AND ?
                         ORDER BY created_at DESC",
                        [$dateFrom, $dateTo]
                    );
                    $filename = "sales_{$dateFrom}_{$dateTo}.csv";
                    break;
                    
                case 'debtors':
                    $data = $this->clientService->getDebtors();
                    $filename = "debtors_" . date('Y-m-d') . ".csv";
                    break;
                    
                case 'stock':
                    $data = $this->productService->getStock();
                    $filename = "stock_" . date('Y-m-d') . ".csv";
                    break;
                    
                default:
                    Response::error('Неизвестный тип отчёта', 400);
            }
            
            if (empty($data)) {
                Response::error('Нет данных для экспорта', 404);
            }
            
            // Формируем CSV
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            
            $output = fopen('php://output', 'w');
            
            // UTF-8 BOM для корректного отображения в Excel
            fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
            
            // Заголовки
            fputcsv($output, array_keys($data[0]));
            
            // Данные
            foreach ($data as $row) {
                fputcsv($output, $row);
            }
            
            fclose($output);
            exit;
            
        } catch (Exception $e) {
            error_log("Export error: " . $e->getMessage());
            Response::error('Ошибка экспорта', 500);
        }
    }
}

// Маршрутизация
$controller = new ReportsController();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'summary';

try {
    switch ($action) {
        case 'summary':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->summary();
            break;
            
        case 'debtors':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->debtors();
            break;
            
        case 'overpayments':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->overpayments();
            break;
            
        case 'stock':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->stock();
            break;
            
        case 'sales':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->salesReport();
            break;
            
        case 'payments':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->paymentsReport();
            break;
            
        case 'export':
            if ($method !== 'GET') Response::error('Method not allowed', 405);
            $controller->export();
            break;
            
        default:
            Response::error('Unknown action', 404);
    }
} catch (Exception $e) {
    error_log("Reports API error: " . $e->getMessage());
    Response::error('Внутренняя ошибка сервера', 500);
}