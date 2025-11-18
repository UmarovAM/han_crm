-- ============================================
-- МИГРАЦИЯ v3.1: Критические улучшения
-- Цель: Защита от дублей, race conditions, связность данных
-- База: HAN CRM v3.0 → v3.1
-- Дата: 2025-01-16
-- ============================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- 1. ИДЕМПОТЕНТНОСТЬ (защита от дублирования)
-- ============================================

-- Добавляем transaction_id для защиты от повторных запросов
ALTER TABLE client_overpayments
  ADD COLUMN transaction_id VARCHAR(64) NULL 
  COMMENT 'UUID для идемпотентности (защита от дублей при сбое сети)' 
  AFTER id;

-- Уникальный индекс для блокировки дублей
CREATE UNIQUE INDEX idx_overpayments_transaction 
ON client_overpayments(transaction_id);

-- Индекс для поиска записей с transaction_id
CREATE INDEX idx_overpayments_has_txn 
ON client_overpayments(client_id, transaction_id);

-- ============================================
-- 2. OPTIMISTIC LOCKING (защита от race conditions)
-- ============================================

-- Добавляем версионирование клиентов для конкурентных обновлений
ALTER TABLE clients 
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 
  COMMENT 'Версия записи для optimistic locking' 
  AFTER deleted_at;

-- Индекс для быстрой проверки версии
CREATE INDEX idx_clients_version ON clients(id, version);

-- ============================================
-- 3. СВЯЗЬ ПЛАТЕЖЕЙ С ПЕРЕПЛАТАМИ
-- ============================================

-- Добавляем ссылку на запись переплаты при оплате через overpayment
ALTER TABLE payments
  ADD COLUMN overpayment_record_id INT UNSIGNED NULL 
  COMMENT 'ID записи в client_overpayments (если payment_method=overpayment)' 
  AFTER sale_id;

-- FK для обеспечения целостности данных
ALTER TABLE payments
  ADD CONSTRAINT fk_payments_overpayment 
  FOREIGN KEY (overpayment_record_id) 
  REFERENCES client_overpayments(id) 
  ON DELETE SET NULL;

-- Индекс для обратного поиска (какие платежи использовали переплату)
CREATE INDEX idx_payments_overpayment ON payments(overpayment_record_id);

-- ============================================
-- 4. МЕТАДАННЫЕ ДЛЯ ОТЛАДКИ
-- ============================================

-- JSON-поле для хранения контекста операции
ALTER TABLE client_overpayments
  ADD COLUMN metadata JSON NULL 
  COMMENT 'Дополнительная информация: {ip, user_agent, source, etc}' 
  AFTER note;

-- Пример использования:
-- metadata: {"ip": "192.168.1.1", "source": "mobile_app", "request_id": "abc123"}

-- ============================================
-- 5. ОБНОВЛЕНИЕ updated_at для payments
-- ============================================

-- Добавляем auto-update для отслеживания изменений
ALTER TABLE payments
  MODIFY COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ============================================
-- 6. УЛУЧШЕНИЕ ПРОИЗВОДИТЕЛЬНОСТИ
-- ============================================

-- Составной индекс для быстрого расчёта баланса клиента
CREATE INDEX idx_overpayments_balance_calc 
ON client_overpayments(client_id, type, created_at);

-- Индекс для поиска неудалённых платежей по продаже
CREATE INDEX idx_payments_active 
ON payments(sale_id, deleted_at);

-- ============================================
-- 7. АУДИТ ИЗМЕНЕНИЙ (опционально)
-- ============================================

-- Добавляем поле для отслеживания, кто обновил запись
ALTER TABLE sales
  ADD COLUMN updated_by INT UNSIGNED NULL 
  COMMENT 'ID пользователя, который последним обновил запись' 
  AFTER user_id;

ALTER TABLE sales
  ADD CONSTRAINT fk_sales_updated_by 
  FOREIGN KEY (updated_by) 
  REFERENCES users(id) 
  ON DELETE SET NULL;

-- ============================================
-- 8. ПРОВЕРОЧНЫЕ CONSTRAINTS (безопасность)
-- ============================================

-- Переплата не может быть отрицательной (current_overpayment >= 0)
ALTER TABLE clients
  ADD CONSTRAINT chk_clients_overpayment_positive 
  CHECK (current_overpayment >= 0);

-- Сумма платежа всегда положительная
ALTER TABLE payments
  ADD CONSTRAINT chk_payments_amount_positive 
  CHECK (amount > 0);

-- Версия клиента всегда >= 1
ALTER TABLE clients
  ADD CONSTRAINT chk_clients_version_positive 
  CHECK (version >= 1);

-- ============================================
-- 9. МИГРАЦИЯ СУЩЕСТВУЮЩИХ ДАННЫХ
-- ============================================

-- Инициализируем version для существующих клиентов
UPDATE clients SET version = 1 WHERE version = 0 OR version IS NULL;

-- Логируем миграцию
INSERT INTO activity_log (user_id, action, entity_type, details, ip_address)
VALUES (
  1, 
  'migration', 
  'database', 
  'Applied migration v3.1: Added transaction_id, version, overpayment_record_id, metadata', 
  '127.0.0.1'
);

-- ============================================
-- ГОТОВО!
-- ============================================

SET FOREIGN_KEY_CHECKS = 1;

-- Проверка успешности миграции
SELECT 
  '✅ МИГРАЦИЯ v3.1 ЗАВЕРШЕНА!' AS status,
  CONCAT('Добавлено полей: ', 
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_schema = DATABASE() 
     AND column_name IN ('transaction_id', 'version', 'overpayment_record_id', 'metadata', 'updated_by'))
  ) AS fields_added,
  CONCAT('Добавлено индексов: ', 
    (SELECT COUNT(*) FROM information_schema.statistics 
     WHERE table_schema = DATABASE() 
     AND index_name IN ('idx_overpayments_transaction', 'idx_clients_version', 'idx_payments_overpayment'))
  ) AS indexes_added,
  CONCAT('Добавлено constraints: ', 
    (SELECT COUNT(*) FROM information_schema.table_constraints 
     WHERE table_schema = DATABASE() 
     AND constraint_name LIKE 'chk_%')
  ) AS constraints_added;

-- Показываем обновлённые структуры
SHOW COLUMNS FROM clients WHERE Field IN ('current_overpayment', 'version');
SHOW COLUMNS FROM client_overpayments WHERE Field IN ('transaction_id', 'metadata');
SHOW COLUMNS FROM payments WHERE Field = 'overpayment_record_id';