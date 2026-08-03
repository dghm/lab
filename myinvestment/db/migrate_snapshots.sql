-- 新增每日資產快照表，供趨勢圖使用
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    snapshot_date   DATE NOT NULL,
    total_value_twd DECIMAL(20,2) NOT NULL,
    total_cost_twd  DECIMAL(20,2) NOT NULL,
    total_pl_twd    DECIMAL(20,2) NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_snapshot_date (snapshot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
