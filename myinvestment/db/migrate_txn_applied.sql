-- 在既有 transactions 表新增「實際套用增減量」欄位，讓刪除交易時能正確回沖持倉
-- 只需在 Bluehost phpMyAdmin 跑一次

ALTER TABLE transactions
    ADD COLUMN applied_qty       DECIMAL(20,4) DEFAULT NULL AFTER note,
    ADD COLUMN applied_cost      DECIMAL(20,4) DEFAULT NULL AFTER applied_qty,
    ADD COLUMN applied_balance   DECIMAL(20,4) DEFAULT NULL AFTER applied_cost,
    ADD COLUMN applied_dividend  DECIMAL(20,4) DEFAULT NULL AFTER applied_balance;
