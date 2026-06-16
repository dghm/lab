# 公寓費用分攤系統 — Bluehost 部署 SOP

## 一、檔案清單

```
dashboard/
├── login.php          登入頁
├── logout.php         登出
├── index.php          房客自助查帳
├── admin.php          房東後台（新增帳單／標記繳費）
├── db.php             資料庫連線 + 安全 session
├── functions.php      認證、CSRF、分攤計算核心
├── config.php         ⚠️ 設定檔（填 DB 帳密，勿公開）
├── schema.sql         資料表 + 種子資料
├── .htaccess          強制 HTTPS、保護設定檔
├── preview.html       靜態預覽（不需部署即可開）
└── assets/
    ├── style.css
    └── app.js
```

> 本系統使用 PHP + MySQL，**不需要** PHPMailer（與線上填單那套不同）。

---

## 二、部署步驟

### Step 1｜建立資料庫（cPanel）
1. 登入 Bluehost cPanel → **MySQL® Databases**
2. 建立資料庫，例：`xxxxxxx_apartment`
3. 建立使用者並設強密碼，**Add User To Database** → 勾 **ALL PRIVILEGES**
4. 記下：資料庫名、使用者名、密碼

### Step 2｜匯入資料表
1. cPanel → **phpMyAdmin** → 左側點選剛建的資料庫
2. 上方 **Import（匯入）** → 選 `schema.sql` → 執行
3. 成功後會看到 `users / settlements / bills / payments` 四張表，且已含目前對話的四筆帳單

### Step 3｜填寫 config.php
打開 `config.php`，填入 Step 1 的資料：
```php
define('DB_NAME', 'xxxxxxx_apartment');
define('DB_USER', 'xxxxxxx_apt');
define('DB_PASS', '你的資料庫密碼');
```
其餘（分攤起始日、收款帳號）已預填好，通常不用改。

### Step 4｜上傳檔案
用 cPanel **File Manager** 或 FTP，把整個 `dashboard/` 內容上傳到：
- 若要當主網站：`public_html/`
- 若要放子目錄：`public_html/apt/`（網址就是 `https://你的網域/apt/`）

確認 `.htaccess`、`assets/` 一併上傳（隱藏檔記得顯示）。

### Step 5｜測試
1. 開 `https://你的網域/（或 /apt/）login.php`
2. 用 `b` / `RoomB@115` 登入 → 應看到 B 室本期 NT$689、未繳
3. 用 `admin` / `Admin@115` 登入 → 看到全戶總覽、可標記繳費、新增帳單

---

## 三、初始帳號（**請立即改密碼**）

| 帳號 | 初始密碼 | 角色 |
|------|----------|------|
| `admin` | `Admin@115` | 房東 謝萬錤 |
| `a` | `RoomA@115` | A 室 侯太偉 |
| `b` | `RoomB@115` | B 室 李新善 |

登入後右上「修改密碼」即可變更。建議把 a / b 的新密碼私訊給房客。

---

## 四、日常操作

- **新帳單來了**：admin 後台 →「新增帳單」→ 填項目、期間、金額（瓦斯把「分攤基礎」填基本費+從量費、總額填整張），系統即時試算並存檔。
- **網路費**：項目選「網路」會自動勾「固定費」，填雙月總額（1,400）即可。
- **開新一期**：上方「＋ 新結算期」，輸入名稱與繳費期限。
- **房客匯款後**：在繳費狀態按「標記已繳」，房客端即顯示已繳與日期。

---

## 五、Cloudflare 注意事項（若有掛 CF）

- 本系統 JS 已獨立成 `assets/app.js`，不受 Email Obfuscation 影響。
- 若登入後樣式跑掉，到 CF → **Caching → Purge Everything** 清快取。
- 確認 SSL/TLS 模式為 **Full**，避免與 `.htaccess` 強制 HTTPS 產生重導循環。

---

## 六、資安重點（已內建）

- 密碼以 **bcrypt** 雜湊儲存，絕不存明文
- 全程 **PDO prepared statements**，防 SQL injection
- 登入成功 **重生 session id**；所有寫入動作帶 **CSRF token**
- 房客查詢只會看到自己房間的資料
- `.htaccess` 已禁止外部存取 `config.php / db.php / functions.php / *.sql`，並強制 HTTPS
- 系統**不儲存**身分證、戶籍等敏感資料；登入只用房號

> ⚠️ `config.php` 內含資料庫密碼，切勿提交到 git 或公開分享。

---

## 七、帳單附件功能（更新）

- 新增檔案：`bill-file.php`、`uploads/bills/.htaccess`（記得連同空的 `uploads/bills/` 目錄一起上傳；FTP 對空目錄常會忽略，至少要把 `.htaccess` 傳上去讓目錄存在）
- 已部署的資料庫請在 phpMyAdmin 執行（不用重新匯入整份 schema.sql）：
  ```sql
  ALTER TABLE bills ADD COLUMN attachment_path VARCHAR(255) DEFAULT NULL AFTER note;
  ```
- 上傳目錄需可寫入（Bluehost 預設權限通常即可，若上傳失敗可將 `uploads/bills/` 設為 755）
- 後台「新增帳單」可選填附件（PDF / JPG / PNG），房客端對應卡片右下角會出現文件圖示，點擊彈出視窗檢視；附件僅限已登入使用者（房客或 Aries）存取，全戶共用、不分房客權限
