-- ============================================
-- HAN CRM - УПРОЩЁННАЯ БД v3.1 FINAL
-- Только необходимое, без избыточности
-- ============================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Удаляем старые таблицы
DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS return_items;
DROP TABLE IF EXISTS returns;
DROP TABLE IF EXISTS write_offs;
DROP TABLE IF EXISTS client_overpayments;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS production;
DROP TABLE IF EXISTS stock;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS clients;
DROP TABLE IF EXISTS users;

-- ============================================
-- 1. USERS
-- ============================================

CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  login VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL COMMENT 'SHA256 hash',
  role ENUM('admin','manager','cashier') NOT NULL DEFAULT 'cashier',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY ux_users_login (login),
  KEY idx_users_role_active (role, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO users (name, login, password, role)
VALUES ('Администратор ХАН', 'admin',
'5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5',
'admin');

-- ============================================
-- 2. CLIENTS
-- ============================================

CREATE TABLE clients (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NULL,
  address TEXT NULL,
  current_overpayment DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Текущий баланс переплаты',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_clients_name (name),
  KEY idx_clients_phone (phone),
  KEY idx_clients_active (is_active),
  CONSTRAINT fk_clients_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO clients (name, phone, address, created_by) VALUES
('ТОО "АЗИЯ"', '+996 555 789 012', 'г. Бишкек, пр. Чуй', 1),
('Абдулло', '+996 555 123 456', 'г. Бишкек', 1),
('ТОО "Магнум"', '+996 555 999 888', 'г. Ош', 1);

-- ============================================
-- 3. PRODUCTS
-- ============================================

CREATE TABLE products (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_products_name (name),
  KEY idx_products_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO products (name, price) VALUES
('ХАН семечки солёные 2Кг', 191.00),
('Береке семечки 2Кг', 520.00),
('ХАН семечки солёные 100гр', 55.00),
('ХАН семечки солёные 60гр', 35.00),
('ХАН семечки солёные 25гр', 18.00),
('ХАН семечки 100гр', 50.00),
('ХАН семечки 60гр', 32.00),
('ХАН Семечки BBQ 200г', 112.00),
('ХАН Семечки микс 150г', 80.00),
('ХАН Семечки премиум 250г', 130.00);

-- ============================================
-- 4. STOCK
-- ============================================

CREATE TABLE stock (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_stock_product (product_id),
  CONSTRAINT fk_stock_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO stock (product_id, quantity) VALUES
(1,0),(2,3),(3,0),(4,0),(5,0),(6,0),(7,0),(8,0),(9,0),(10,0);

-- ============================================
-- 5. PRODUCTION
-- ============================================

CREATE TABLE production (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  shift ENUM('day','night') NOT NULL,
  note TEXT NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_production_product (product_id),
  KEY idx_production_shift (shift),
  KEY idx_production_created (created_at),
  CONSTRAINT fk_production_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_production_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. SALES
-- ============================================

CREATE TABLE sales (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_number VARCHAR(50) NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  debt DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  new_overpayment DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY ux_sales_receipt (receipt_number),
  KEY idx_sales_client (client_id),
  KEY idx_sales_created (created_at),
  KEY idx_sales_debt (debt),
  CONSTRAINT fk_sales_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 7. SALE ITEMS
-- ============================================

CREATE TABLE sale_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  returned_quantity INT NOT NULL DEFAULT 0,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sale_items_sale (sale_id),
  KEY idx_sale_items_product (product_id),
  CONSTRAINT fk_sale_item_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_sale_item_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sale_item_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. PAYMENTS
-- ============================================

CREATE TABLE payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id INT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('cash','card','transfer','overpayment') NOT NULL DEFAULT 'cash',
  note TEXT NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_payments_sale (sale_id),
  KEY idx_payments_method (payment_method),
  KEY idx_payments_created (created_at),
  CONSTRAINT fk_payments_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 9. CLIENT OVERPAYMENTS (УПРОЩЁННАЯ!)
-- ============================================

CREATE TABLE client_overpayments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id INT UNSIGNED NOT NULL,
  sale_id INT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL COMMENT 'Положительная для created/withdrawn, может быть отрицательной для adjusted',
  
  -- ✅ БЕЗ 'used' (в упрощённой версии не нужен)
  type ENUM('created','withdrawn','adjusted') NOT NULL,
  
  note TEXT NULL,
  balance_after DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_co_client_created (client_id, created_at),
  KEY idx_co_sale (sale_id),
  KEY idx_co_type (type),
  CONSTRAINT fk_co_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_co_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
  CONSTRAINT fk_co_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 10. RETURNS
-- ============================================

CREATE TABLE returns (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id INT UNSIGNED NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  reason TEXT NULL,
  refund_method ENUM('cash','overpayment','debt_reduction') NOT NULL DEFAULT 'overpayment',
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_returns_sale (sale_id),
  KEY idx_returns_created (created_at),
  CONSTRAINT fk_returns_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_returns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE return_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_id INT UNSIGNED NOT NULL,
  sale_item_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ri_return (return_id),
  KEY idx_ri_sale_item (sale_item_id),
  KEY idx_ri_product (product_id),
  CONSTRAINT fk_ri_return FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_ri_sale_item FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_ri_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 11. WRITE OFFS
-- ============================================

CREATE TABLE write_offs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  type ENUM('defect','expired','damage','other') NULL DEFAULT 'other',
  reason TEXT NOT NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_wo_product (product_id),
  KEY idx_wo_type (type),
  KEY idx_wo_created (created_at),
  CONSTRAINT fk_wo_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_wo_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 12. STOCK MOVEMENTS
-- ============================================

CREATE TABLE stock_movements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  quantity_change INT NOT NULL,
  quantity_after INT NOT NULL,
  movement_type ENUM('production','sale','return','writeoff','adjustment') NOT NULL,
  reference_id INT UNSIGNED NULL,
  note TEXT NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sm_product (product_id),
  KEY idx_sm_type (movement_type),
  KEY idx_sm_created (created_at),
  CONSTRAINT fk_sm_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 13. ACTIVITY LOG
-- ============================================

CREATE TABLE activity_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id INT UNSIGNED NULL,
  details TEXT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_log_user (user_id),
  KEY idx_log_action (action),
  KEY idx_log_entity (entity_type, entity_id),
  KEY idx_log_created (created_at),
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 14. VIEWS (ДЕТАЛЬНЫЕ!)
-- ============================================

CREATE OR REPLACE VIEW sales_list AS
SELECT
  s.id,
  s.receipt_number,
  s.created_at,
  c.name AS client_name,
  c.phone AS client_phone,
  s.total,
  s.paid,
  s.debt,
  s.new_overpayment,
  u.name AS created_by,
  COUNT(DISTINCT si.id) AS items_count,
  COALESCE(SUM(si.quantity), 0) AS total_quantity,
  GROUP_CONCAT(
    CONCAT(p.name, ' (', si.quantity, ' шт)')
    ORDER BY si.id SEPARATOR ', '
  ) AS items_list
FROM sales s
JOIN clients c ON c.id = s.client_id
LEFT JOIN users u ON u.id = s.user_id
LEFT JOIN sale_items si ON si.sale_id = s.id
LEFT JOIN products p ON p.id = si.product_id
WHERE s.deleted_at IS NULL
GROUP BY s.id, s.receipt_number, s.created_at, 
         c.name, c.phone, s.total, s.paid, s.debt, 
         s.new_overpayment, u.name;

CREATE OR REPLACE VIEW client_balances AS
SELECT
  c.id,
  c.name,
  c.phone,
  c.address,
  c.is_active,
  c.current_overpayment AS total_overpayment,
  COALESCE(SUM(s.debt), 0) AS total_debt,
  COUNT(DISTINCT s.id) AS total_sales
FROM clients c
LEFT JOIN sales s ON s.client_id = c.id AND s.deleted_at IS NULL
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name, c.phone, c.address, c.is_active, c.current_overpayment;

-- ============================================
-- ✅ ТОЛЬКО АУДИТ-ТРИГГЕР (без бизнес-логики!)
-- ============================================

DELIMITER $$

CREATE TRIGGER trg_production_audit 
AFTER INSERT ON production
FOR EACH ROW
BEGIN
  DECLARE qty_after INT DEFAULT 0;
  
  SELECT COALESCE(quantity, 0) INTO qty_after 
  FROM stock 
  WHERE product_id = NEW.product_id;
  
  INSERT INTO stock_movements (
    product_id, 
    quantity_change, 
    quantity_after, 
    movement_type, 
    reference_id, 
    note, 
    user_id
  ) VALUES (
    NEW.product_id, 
    NEW.quantity, 
    qty_after, 
    'production', 
    NEW.id, 
    NEW.note, 
    NEW.user_id
  );
END$$

DELIMITER ;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- ГОТОВО!
-- ============================================

SELECT '✅ УПРОЩЁННАЯ БД v3.1 FINAL УСТАНОВЛЕНА!' AS status;
SELECT COUNT(*) AS tables_count FROM information_schema.tables WHERE table_schema = DATABASE();
SELECT 'Товары ХАН:' AS info, COUNT(*) AS count FROM products;
SELECT 'Клиенты:' AS info, COUNT(*) AS count FROM clients;