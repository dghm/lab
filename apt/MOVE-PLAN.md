# MOVE-PLAN — 將 apt 部署位置遷移至 lab.dghm.tw/apt/

> 建立：2026-06-29
> 對象：在新 session 接手 apt 部署遷移的開發者 / AI Agent。
> **先讀 `CLAUDE.md` 與 `HANDOFF.md`**，本檔只記錄「這次的搬遷計畫與決定」，不重複專案全貌。

---

## 背景與決定

- apt 的「程式碼母版」已於 2026-06-29 從獨立 repo `dghm/apt` 併入 `dghm/lab`，現位於 **`lab/apt/`**（subtree merge，歷史保留）。
- 目前線上部署位置仍是舊的：`https://dghm.tw/apt/`，FTP 路徑 `/website_6b29b600/apt`。
- 目標：把「部署位置」也搬到 lab 子網域下，與 myinvestment 並列，成為 **`https://lab.dghm.tw/apt/`**。
- 已選定 **方案 A**：apt 放進密碼鎖保護的 lab.dghm.tw 之下，但用 `apt/.htaccess` 覆寫，解除 apt 子目錄繼承的 Directory Privacy 密碼鎖，讓房客仍可公開登入。
- 房客上傳的帳單附件（`uploads/`）目前只有一期，**要保留**。

## 必要前提（為何不能只靠 deploy.sh）

`deploy.sh` 是 lftp `mirror --reverse`，且刻意排除 `config.php`、`uploads/`、`schema.sql` 與開發文件，**只上傳、不刪遠端**。
所以這些「不在版控、只存在於線上」的東西，搬家時必須**手動**從舊位置複製到新位置，否則新站會缺 DB 設定與房客資料：

| 項目 | 來源（舊） | 去向（新） | 備註 |
|------|-----------|-----------|------|
| `config.php` | `/website_6b29b600/apt/config.php` | `/lab.dghm.tw/apt/config.php` | DB 帳密 + SPLIT_START + 收款資訊。第一行必為 `<?php` |
| `uploads/`（含一期附件） | `/website_6b29b600/apt/uploads/` | `/lab.dghm.tw/apt/uploads/` | 房客資料，務必保留 |

- 資料庫**不用搬**：Bluehost MySQL 是帳號層級共用，不綁資料夾。新站的 `config.php` 仍指向同一個 `zjqafhmy_667_no7`，照常運作。
- 新位置 FTP 路徑以實際登入為準（推測為 `/lab.dghm.tw/apt`，比照 myinvestment 的 `/lab.dghm.tw/myinvestment`，但**部署前先用 FTP 軟體確認**）。

## 搬遷步驟（依序）

1. **cPanel 建資料夾** `/home1/zjqafhmy/lab.dghm.tw/apt/`。
2. **手動搬非版控線上資料**（見上表）：把舊站的 `config.php` 與整個 `uploads/` 複製到新資料夾。可用 cPanel File Manager 直接複製，或 FTP 下載再上傳。
3. **加 apt/.htaccess 解鎖片段**（方案 A 核心，下節有完整片段），讓房客不被 lab 密碼鎖擋。
4. **改 `apt/deploy.local.sh` 的 `REMOTE_DIR`**：從 `/website_6b29b600/apt` 改為新路徑（確認後填，推測 `/lab.dghm.tw/apt`）。`deploy.local.sh` 是 gitignore 的機密檔，不在 repo 內，需依 `deploy.local.sh.example` 重建並填 FTP 帳密。
5. **預覽**：`cd apt && ./deploy.sh --dry-run`，確認上傳清單與目標路徑正確。
6. **正式部署**：`./deploy.sh`，把程式碼上傳到新位置。
7. **驗證**（見「驗收檢查」）。
8. **收掉舊站**：確認新站完全正常後，把舊 `/website_6b29b600/apt` 收掉或設 301 轉址到新網址（房客舊書籤會失效，需評估是否通知房客新網址）。

## 方案 A：apt/.htaccess 解鎖片段

lab.dghm.tw 根目錄被 cPanel Directory Privacy 加了 Basic Auth（`Require valid-user`），子目錄會繼承。
要讓 apt 子目錄對外公開，在 `apt/.htaccess`**現有內容最上方**加入：

```apache
# 解除繼承自 lab.dghm.tw 根目錄的 Directory Privacy 密碼鎖，讓房客可公開存取 apt
Satisfy Any
Allow from all
```

注意與風險（務必驗證，勿假設成功）：

- 此寫法依賴 `mod_access_compat`（Bluehost 通常有）。若 Bluehost 為嚴格 Apache 2.4 而停用該模組，可能無效，需改用其他方式或洽主機商。
- `Satisfy Any` 會放寬本目錄的存取控制，**有可能連帶削弱現有 `<Files config.php>` / `<Files db.php>` 等 `Require all denied` 的保護**。因此部署後**一定要實測**：
  - `https://lab.dghm.tw/apt/config.php` 應回 **403**（被擋）。
  - `https://lab.dghm.tw/apt/db.php`、`*.sql` 同樣應回 403。
  - 若任一變成可讀取，立即移除解鎖片段，改採其他隔離方式（例如不走 lab 子網域、改用獨立子網域 apt.dghm.tw），並視同機密外洩處理（換 DB 密碼）。

## 驗收檢查

- [ ] `https://lab.dghm.tw/apt/login.php` 可直接開啟，**不跳 lab 的密碼視窗**（房客可登入）。
- [ ] 房客登入後看得到自己那一期帳單與**既有上傳的附件**（確認 `uploads/` 搬成功）。
- [ ] `https://lab.dghm.tw/apt/config.php`、`db.php`、`*.sql` 皆回 403。
- [ ] admin（Aries）登入、新增帳單即時試算、標記繳費皆正常。
- [ ] 強制 HTTPS 生效（apt 自帶 .htaccess 已有此規則）。
- [ ] 確認 SSL/快取：dghm.tw 原掛 Cloudflare，lab.dghm.tw 走 cPanel AutoSSL；遷移後憑證與快取行為要確認（必要時清快取）。

## 順手處理（搬新家正好一併清理，見 HANDOFF.md 維運待辦）

- [ ] 新站**不要**再帶舊站殘留的開發檔（`CLAUDE.md`、`DEPLOY-SOP.md`、`error_log`、`files/`、`files.zip`、`preview.html`）。`deploy.sh` 已排除這些，全新部署的新站本就乾淨——保持即可。
- [ ] 趁這次確認舊站殘留開發檔是否要一併刪除。
- [ ] HANDOFF.md 提到曾外洩的 FTP 子帳號密碼，建議趁重設部署帳密時一併處理。

## 完成後要更新的文件

- 搬遷完成後，更新 `CLAUDE.md` 與 `HANDOFF.md` 的上線網址（`https://dghm.tw/apt/` → `https://lab.dghm.tw/apt/`）與 FTP 路徑，並把本 MOVE-PLAN 標記為已完成或移除。
