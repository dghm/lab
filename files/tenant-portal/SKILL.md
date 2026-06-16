---
name: tenant-portal
description: 建立「登入自助查詢入口」系統（PHP + MySQL，Bluehost 可部署）。適用於 1 個管理者 + N 個只看自己資料的使用者之場景：客戶請款／對帳入口、專案進度查詢、UAT 驗收追蹤、費用分攤、課程繳費等。當使用者說「幫客戶做一個登入查詢頁」、「客戶要能自己查請款／進度」、「做一個分攤系統」、「做個繳費狀態查詢入口」、「像 667 公寓那套」時，立即啟動此 Skill。
---

# tenant-portal — 登入自助查詢入口骨架

## 系統本質

**登入 → 各自看自己的資料 → 管理者輸入 → 系統自動計算 → 狀態追蹤**

源自 667 公寓費用分攤系統（2026/06 上線於 dghm.tw/apt/），已驗證可在 Bluehost PHP + MySQL 環境運作。

## 何時使用

- 客戶請款／對帳入口（客戶看自己的應付款與付款狀態）
- 專案進度查詢頁（客戶看自己專案的里程碑）
- UAT 驗收追蹤（客戶勾驗收、管理端看全貌）
- 費用分攤、繳費查詢等任何「1 admin + N 使用者各看各的」場合

## 範本位置

完整可部署程式碼在本 skill 的 `template/` 目錄（即 667 系統原始碼）：

```
template/
├── login.php / logout.php     登入登出
├── index.php                  使用者自助頁（手機 2×2 卡片版）
├── admin.php                  管理後台（輸入資料、標記狀態、即時試算）
├── db.php                     PDO 連線 + 安全 session
├── functions.php              認證、CSRF、核心計算（業務邏輯集中於此）
├── config.php                 設定檔範本（DB 帳密、業務常數）
├── schema.sql                 四表結構 + 種子資料
├── .htaccess                  強制 HTTPS、鎖設定檔
└── assets/ (style.css, app.js)
```

## 改造三步驟（沿用八成程式碼）

新場景只需改三處，其餘（登入、權限、CSRF、部署）不動：

1. **schema.sql 欄位** — 把資料概念換掉：
   - `settlements`（結算期）→ 期別／專案／課程
   - `bills`（帳單）→ 請款單／里程碑／驗收項
   - `payments`（狀態）→ 已付／已完成／已驗收
2. **functions.php 的 compute_split()** — 換成新業務的計算規則（或刪除，純查詢不需計算）
3. **頁面文案** — index.php / admin.php 的標題與欄位名

## 部署 SOP（Bluehost cPanel）

1. MySQL Databases：建庫 → 建使用者 → Add User To Database（ALL PRIVILEGES）
2. phpMyAdmin：選庫 → Import → schema.sql
3. File Manager：上傳到 `public_html/<子目錄>/`（含隱藏檔 .htaccess；Settings → Show Hidden Files）
4. 編輯 config.php 填 DB_NAME / DB_USER / DB_PASS
5. 測 `https://網域/<子目錄>/login.php`

## 必守規則（踩過的坑）

- config.php **第一行必須是 `<?php`**，否則整檔被當純文字輸出（密碼外洩）。外洩處置：立刻換 DB 密碼。
- `.htaccess` 必須上傳：它負責鎖 config.php / *.sql 不被外部直接讀取。Mac 顯示隱藏檔：Cmd+Shift+.
- 密碼一律 bcrypt 雜湊（`password_hash`），手動改密碼要先算雜湊再 UPDATE，不可寫明文。
- 登入頁正常、提交才 500 → 九成是 DB 連線（config 帳密、使用者未授權），看同目錄 error_log。
- 使用者查詢一律 `WHERE user_id = 自己`，禁止用前端參數決定查誰。
- 不在系統存身分證、戶籍等敏感個資；登入用代號即可。
- 掛 Cloudflare：JS 獨立成檔（避免 Email Obfuscation 干擾）、SSL 設 Full、改版後 Purge 快取。

## 慣例

- 日期顯示函式集中一處（functions.php 的 roc()），全站格式改一次生效
- 計算邏輯只寫一份，前端即時試算（app.js）與後端必須同公式
- 角色名、收款資訊等放 config.php 常數，不散落頁面
