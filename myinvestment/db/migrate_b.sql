-- v1 → B 累計投入式 遷移。
-- 你目前 Bluehost 的資料庫是 v1（只有 quantity/manual_price）。匯入這個檔升級。
-- 在 phpMyAdmin 選 zjqafhmy_myinvest > Import，只需執行一次。

SET NAMES utf8mb4;

ALTER TABLE holdings
    ADD COLUMN asset_class    ENUM('equity','bond','balanced','cash','other') NOT NULL DEFAULT 'other' AFTER region,
    ADD COLUMN equity_pct     DECIMAL(5,2)  NULL AFTER asset_class,
    ADD COLUMN isin           VARCHAR(20)   NULL AFTER ticker,
    ADD COLUMN balance        DECIMAL(20,4) NULL AFTER quantity,
    ADD COLUMN price_at       DATETIME      NULL AFTER manual_price,
    ADD COLUMN cost_base      DECIMAL(20,4) NULL AFTER price_at,
    ADD COLUMN cost_base_date DATE          NULL AFTER cost_base,
    ADD COLUMN is_dca         TINYINT(1)    NOT NULL DEFAULT 0 AFTER cost_base_date,
    ADD COLUMN dca_amount     DECIMAL(20,4) NULL AFTER is_dca,
    ADD COLUMN dca_fee        DECIMAL(20,4) NULL AFTER dca_amount,
    ADD COLUMN dca_day        TINYINT       NULL AFTER dca_fee,
    ADD COLUMN target_return  DECIMAL(6,2)  NULL AFTER dca_day,
    ADD COLUMN cum_dividend   DECIMAL(20,4) NULL AFTER target_return;  -- 累計配息（原幣，月配/分派型用）

-- 既有資料給合理預設
UPDATE holdings SET asset_class = 'equity' WHERE category IN ('tw_stock', 'fund');
UPDATE holdings SET asset_class = 'cash'   WHERE category = 'cash';
UPDATE holdings SET balance = quantity     WHERE category = 'cash';

-- 讓再平衡可設「股債」目標
ALTER TABLE targets MODIFY dimension ENUM('category','currency','region','asset') NOT NULL;
