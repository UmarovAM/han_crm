-- Миграция базы данных v3.0 → v3.1

-- Таблица client_overpayments
ALTER TABLE client_overpayments
ADD COLUMN transaction_id VARCHAR(50) NULL AFTER id,
ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 AFTER balance_after,
ADD COLUMN metadata JSON NULL AFTER note,
ADD UNIQUE KEY ux_transaction_id (transaction_id),
ADD KEY idx_version (version);

-- Триггер auto-update для updated_at
-- (уже есть ON UPDATE CURRENT_TIMESTAMP в created_at)

-- Таблица payments
ALTER TABLE payments
ADD COLUMN transaction_id VARCHAR(50) NULL AFTER id,
ADD COLUMN overpayment_record_id INT UNSIGNED NULL AFTER sale_id,
ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 AFTER note,
ADD COLUMN metadata JSON NULL AFTER user_id,
ADD UNIQUE KEY ux_payment_transaction_id (transaction_id),
ADD KEY idx_overpayment_record (overpayment_record_id),
ADD KEY idx_payment_version (version),
ADD CONSTRAINT fk_payment_overpayment FOREIGN KEY (overpayment_record_id) 
    REFERENCES client_overpayments(id) ON DELETE SET NULL;