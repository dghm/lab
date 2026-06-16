-- 新增交易記錄表（簡單版：記錄為主，成本/持倉仍手動維護）
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
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_holding (holding_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
