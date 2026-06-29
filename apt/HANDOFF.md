# HANDOFF — 667 公寓費用分攤系統

> 更新：2026-06-15
> 對象：透過 GitHub repo `dghm/apt` 接手的開發者 / AI Agent。
> **先讀 `CLAUDE.md`**（專案全貌、業務規則、檔案結構、開發守則），本檔只補充「如何開發部署、目前現況、待辦」。

---

## 一分鐘上手

- 這是台北內湖「667 公寓」的水電瓦斯網路費用分攤 + 繳費追蹤系統。
- 原生 PHP 8 + MySQL，無框架、無 composer 依賴。
- 已上線：https://dghm.tw/apt/
- 此 repo＝**部署母版**。線上檔案在 Bluehost，**改完要用 `deploy.sh` 上傳**（部署不靠 git，靠 lftp）。

## 開發與部署流程

1. 本機改檔。
2. `./deploy.sh --dry-run` 預覽會上傳哪些檔。
3. `./deploy.sh` 上傳（mirror，只傳變動、**不刪**遠端檔）。
4. 開 https://dghm.tw/apt/login.php 驗證。

- 線上實際路徑：`/website_6b29b600/apt`（FTP 登入後即在網站根目錄，**不需** `public_html` 前綴）。
- `deploy.sh` 會刻意跳過 `config.php` / `schema.sql` / `uploads/` 與開發文件；要改 DB 設定或結構請手動進 cPanel / phpMyAdmin。

## 環境機密（**不在 repo 內，需向 Aries 取得**）

這些被 `.gitignore` 排除，絕不可進版控：

| 檔案 | 內容 | 如何取得 |
|------|------|----------|
| `config.php` | DB 帳密、SPLIT_START、收款資訊 | 向 Aries 取，或從線上 cPanel 複製 |
| `deploy.local.sh` | FTP 帳密與遠端路徑 | 依 `deploy.local.sh.example` 範本建立（權限設 600）；FTP 帳號向 Aries 取 |

- 部署需先 `brew install lftp`（本系統用 lftp 4.9.x 驗證過）。
- ⚠️ 部署用的 FTP 應使用**落在網站根目錄**的主帳號；早期測試發現某些子帳號被 chroot 鎖在獨立空目錄、看不到網站檔。

## 目前現況（2026-06-15）

- 系統已上線正常運作；近一次驗證 `https://dghm.tw/apt/` 與 `login.php` 皆回 200。
- 本機與線上內容已同步。
- error_log 曾有 2026-06-10 一批 DB 連線 Fatal error，已確認為**舊設定殘留**（失敗帳號 `xxxxxxx_apt` 非現行 `zjqafhmy_667user`），無新錯誤、視為已排除。
- 帳單照片上傳（admin / 房客端 / schema / `bill-file.php`）已完成。
- 本專案於 2026-06-15 從 workspace 大 repo 獨立出來，成為私有 repo **`dghm/apt`**。

## 待辦

功能面（見 CLAUDE.md「目前狀態與待辦」）：
- [ ] admin 重設房客密碼功能（尚未實作）
- [ ] 每次結算後 phpMyAdmin Export 備份
- [ ] compute_split() 改為動態抓 tenant 人數（目前硬寫 3 人）
- [ ] 個人費用歷史趨勢走線圖（房客端）
- [ ] 年度統計（每年 5/1–隔年 4/30）

維運面：
- [ ] **清線上殘留開發檔**：線上 `/website_6b29b600/apt` 仍有 `CLAUDE.md`、`DEPLOY-SOP.md`、`error_log`、`files/`、`files.zip`、`preview.html`（早期上傳、會洩漏結構，`error_log` 含舊 DB 帳號）。`deploy.sh` 不刪遠端檔，需手動用 FTP / cPanel 清。
- [ ] **改外洩的 FTP 密碼**：早期測試曾在輸出印出某 FTP 子帳號密碼，建議到 cPanel 改密或刪該子帳號。
- [ ] **（資安）確認 workspace 大 repo 的 GitHub 外洩疑慮**：apt 原屬的 `dghm/workspace` repo 曾掛一個拼法可疑的遠端 `github.com/brabdrize/workspace`，含全公司機密。本機遠端已移除，但 GitHub 上既有內容需另行確認與處理（與本 apt repo 無關）。

## 重要注意事項

- **業務規則勿擅改**：分攤起始日、跨期按天數拆分、尾差由 Aries 吸收、固定費 ÷3 等，邏輯集中在 `functions.php` 的 `compute_split()`；改算法時 `assets/app.js` 的即時試算公式要同步改。詳見 CLAUDE.md。
- **安全第一**：PDO prepared statements、房客查詢一律 `WHERE user_id=自己`、寫入帶 CSRF token、輸出經 `h()`。
- **機密絕不進 repo**：`config.php` 第一行必為 `<?php`（曾因缺漏導致密碼外洩）。新增機密類檔案先確認在 `.gitignore` 內。
- 文案稱呼用「Aries」不用「房東」。

---

## 參考檔案

- `CLAUDE.md` — 專案全貌與開發守則（**必讀**）
- `DEPLOY-SOP.md` — 部署 SOP 細節
- `deploy.sh` / `deploy.local.sh.example` — 部署腳本與設定範本
- `files/667-公寓系統開發復盤.md` — 完整開發復盤
- `files/tenant-portal/` — 可複用骨架 skill（同源碼）
