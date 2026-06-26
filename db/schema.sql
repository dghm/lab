-- myInvestment 資料表結構（B 累計投入式）
-- 全新安裝用。Bluehost 既有 v1 資料庫請改匯入 db/migrate_b.sql。

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS holdings (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,                  -- 顯示名稱
    category       ENUM('tw_stock','fund','cash','other') NOT NULL,
    currency       VARCHAR(8)   NOT NULL DEFAULT 'TWD',
    region         VARCHAR(16)  NOT NULL DEFAULT 'TW',     -- TW / US / GLOBAL / OTHER
    asset_class    ENUM('equity','bond','balanced','cash','other') NOT NULL DEFAULT 'other',
    equity_pct     DECIMAL(5,2) DEFAULT NULL,              -- 平衡型股票占比（例 60）
    ticker         VARCHAR(20)  DEFAULT NULL,              -- 台股代號（自動抓價）
    isin           VARCHAR(20)  DEFAULT NULL,              -- 基金識別碼（自動抓淨值，實驗）
    quantity       DECIMAL(20,4) NOT NULL DEFAULT 0,       -- 持有單位 / 股數
    balance        DECIMAL(20,4) DEFAULT NULL,             -- 現金餘額（category=cash）
    price_mode     ENUM('auto','manual') NOT NULL DEFAULT 'manual',
    manual_price   DECIMAL(20,4) DEFAULT NULL,             -- 目前單價 / 淨值（原幣）
    price_at       DATETIME     DEFAULT NULL,              -- 單價最後更新時間
    cost_base      DECIMAL(20,4) DEFAULT NULL,             -- 累計投入基準（原幣，含手續費）
    cost_base_date DATE         DEFAULT NULL,              -- 基準日（定期定額從此日後自動累加）
    is_dca         TINYINT(1)   NOT NULL DEFAULT 0,        -- 是否定期定額
    dca_amount     DECIMAL(20,4) DEFAULT NULL,             -- 每次扣款金額（原幣）
    dca_fee        DECIMAL(20,4) DEFAULT NULL,             -- 每次手續費（原幣）
    dca_day        TINYINT      DEFAULT NULL,              -- 扣款日（1-28）
    target_return  DECIMAL(6,2) DEFAULT NULL,              -- 停利目標報酬率(%)
    cum_dividend   DECIMAL(20,4) DEFAULT NULL,             -- 累計配息（原幣，月配/分派型用）
    note           VARCHAR(255) DEFAULT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS price_cache (
    symbol     VARCHAR(40) PRIMARY KEY,
    price      DECIMAL(20,6) NOT NULL,
    fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS targets (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    dimension  ENUM('category','currency','region','asset') NOT NULL,
    bucket     VARCHAR(32) NOT NULL,
    target_pct DECIMAL(6,2) NOT NULL,
    UNIQUE KEY uniq_dim_bucket (dimension, bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    holding_id  INT NOT NULL,
    txn_date    DATE NOT NULL,
    txn_type    ENUM('buy','sell','dividend','fx_in','fx_out') NOT NULL,
    quantity    DECIMAL(20,4) DEFAULT NULL,
    unit_price  DECIMAL(20,4) DEFAULT NULL,
    amount      DECIMAL(20,4) NOT NULL,
    fee         DECIMAL(20,4) DEFAULT NULL,
    currency    VARCHAR(8) NOT NULL DEFAULT 'TWD',
    note        VARCHAR(255) DEFAULT NULL,
    applied_qty       DECIMAL(20,4) DEFAULT NULL, -- 實際套用到持倉 quantity 的增減量（刪除交易時回沖用）
    applied_cost      DECIMAL(20,4) DEFAULT NULL, -- 實際套用到持倉 cost_base 的增減量
    applied_balance   DECIMAL(20,4) DEFAULT NULL, -- 實際套用到持倉 balance 的增減量
    applied_dividend  DECIMAL(20,4) DEFAULT NULL, -- 實際套用到持倉 cum_dividend 的增減量
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_holding (holding_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
