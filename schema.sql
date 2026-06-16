-- ============================================================
--  公寓費用分攤系統  schema + 種子資料
--  台北市內湖區內湖路一段 667 巷 7 號 5 樓
--  匯入方式：Bluehost cPanel → phpMyAdmin → 選你的資料庫 → 匯入此檔
-- ============================================================
--  既有資料庫升級（已部署過、不想重新匯入整份 schema 的話）：
--  ALTER TABLE bills ADD COLUMN attachment_path VARCHAR(255) DEFAULT NULL AFTER note;
-- ============================================================
SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- ---------- 使用者 ----------
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(32)  NOT NULL UNIQUE,      -- 房號登入：a / b / admin
  password_hash VARCHAR(255) NOT NULL,             -- bcrypt，絕不存明文
  role          ENUM('tenant','admin') NOT NULL,
  room          VARCHAR(8)   DEFAULT NULL,          -- A / B（admin 為 NULL）
  display_name  VARCHAR(64)  NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 結算期（雙月一期）----------
CREATE TABLE IF NOT EXISTS settlements (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(64) NOT NULL,                 -- 例：115年5–6月期
  due_date    DATE        NOT NULL,                 -- 繳費期限（隨次月租金）
  note        VARCHAR(255) DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 帳單 ----------
-- 系統會依 period_start / period_end 與分攤起始日(2026-05-01) 自動算分攤。
-- split_base：實際拿來分攤的基礎金額（一般 = total_amount；
--             瓦斯有「工料費」時，base 只填基本費+從量費，工料費差額由房東自付）。
-- is_fixed：固定費（如網路），直接 ÷3，不做天數拆分。
CREATE TABLE IF NOT EXISTS bills (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  settlement_id INT NOT NULL,
  category      VARCHAR(16) NOT NULL,               -- 電費 / 水費 / 天然氣 / 網路
  period_start  DATE        DEFAULT NULL,           -- 固定費可留空
  period_end    DATE        DEFAULT NULL,
  total_amount  DECIMAL(10,2) NOT NULL,             -- 帳單實際總額
  split_base    DECIMAL(10,2) NOT NULL,             -- 分攤基礎
  is_fixed      TINYINT(1)  NOT NULL DEFAULT 0,
  note          VARCHAR(255) DEFAULT NULL,
  attachment_path VARCHAR(255) DEFAULT NULL,        -- 帳單附件檔名（存於 uploads/bills/，經 bill-file.php 驗證後輸出）
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 繳費狀態（每期 × 每房客）----------
CREATE TABLE IF NOT EXISTS payments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  settlement_id INT NOT NULL,
  user_id       INT NOT NULL,
  status        ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
  paid_date     DATE DEFAULT NULL,
  updated_by    VARCHAR(64) DEFAULT NULL,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_settle_user (settlement_id, user_id),
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
--  種子資料
-- ============================================================
-- 帳號（初始密碼，首次登入請立即修改）：
--   admin / Admin@115   （Aries）
--   a     / RoomA@115   （A 室 侯太偉）
--   b     / RoomB@115   （B 室 李新善）
-- 注意：上線後帳號已改名為 David（A 室）/ Zeb（B 室），密碼亦已個別更換。
-- 本檔案僅為初始部署種子資料，重新匯入時帳號仍會是 a/b，需再手動改名/改密。
INSERT INTO users (username, password_hash, role, room, display_name) VALUES
('admin', '$2b$10$XpQRoz6gL0PY3D2pWJkQfO17ZjJrSLRAgzSY3TpuZmErIS/LbEq3u', 'admin',  NULL, 'Aries'),
('a',     '$2b$10$u825mI.7ILsuB4vs8ApIsO0CaZBzMwuoxA6hNN8aKjKMCxohO2.9q', 'tenant', 'A',  '侯太偉'),
('b',     '$2b$10$E6ZzNV4w4wW7mSzmwRKHfOtYolih0qxb8CPjLS5GgRJu0c2x/oC4y', 'tenant', 'B',  '李新善');

-- 結算期 1：115年5–6月（隨 7 月租金收取）
INSERT INTO settlements (id, name, due_date, note) VALUES
(1, '115年5–6月期', '2026-07-01', '隨 7 月租金一併收取');

-- 帳單（對應目前對話累積的四筆）
INSERT INTO bills (settlement_id, category, period_start, period_end, total_amount, split_base, is_fixed, note) VALUES
(1, '電費',   '2026-03-16', '2026-05-18',  662.00,  662.00, 0, NULL),
(1, '水費',   '2026-04-03', '2026-06-02',  494.00,  494.00, 0, NULL),
(1, '天然氣', '2026-04-10', '2026-06-10', 3124.00,  324.00, 0, '工料費 NT$2,800 為一次性檢修換料，Aries 全額自付、不列入分攤'),
(1, '網路',    NULL,         NULL,        1400.00, 1400.00, 1, '寬頻 300M，NT$700/月 × 2 月');

-- 繳費狀態（初始皆未繳）
INSERT INTO payments (settlement_id, user_id, status) VALUES
(1, (SELECT id FROM users WHERE username='a'), 'unpaid'),
(1, (SELECT id FROM users WHERE username='b'), 'unpaid');
