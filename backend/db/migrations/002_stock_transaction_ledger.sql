-- stock_transaction 원장 확장 (M2) — Postgres 등 수동 적용용
-- SQLite는 main.py startup ALTER로도 추가됨

ALTER TABLE stock_transaction ADD COLUMN IF NOT EXISTS as_of_date DATE;
ALTER TABLE stock_transaction ADD COLUMN IF NOT EXISTS lot_no VARCHAR;
ALTER TABLE stock_transaction ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE stock_transaction ADD COLUMN IF NOT EXISTS unit VARCHAR;
ALTER TABLE stock_transaction ADD COLUMN IF NOT EXISTS source_ref VARCHAR;

UPDATE stock_transaction
SET as_of_date = (trx_time AT TIME ZONE 'UTC')::date
WHERE as_of_date IS NULL;
