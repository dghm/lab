# HANDOFF — 667 公寓費用分攤系統

> 交接時間：2026-06-14
> 用途：在另一台電腦用 Claude Cowork 同步後，接續未完成的檢查與待辦。

## 已處理項目

- [x] **帳單照片上傳存檔**：已確認 admin.php 新增/編輯帳單表單已串接上傳（`save_bill_attachment` / `delete_bill_attachment`），房客端 index.php 也已顯示附件圖示，schema.sql 已含 `attachment_path`。CLAUDE.md 待辦已打勾。
- [x] **房客帳號 a/b 與 David/Zeb 對應**：已確認線上帳號為 David（A 室）/ Zeb（B 室），CLAUDE.md 為正確現況；schema.sql 已加註說明該檔僅為初始種子資料（a/b），重新匯入需再手動改名改密。
- [ ] **admin 重設房客密碼功能**：仍未實作，維持為真待辦（見 CLAUDE.md）。

## 尚待確認的風險項目

- **error_log 有 2026-06-10 的嚴重錯誤**：
  ```
  PHP Fatal error: Uncaught PDOException: SQLSTATE[HY000] [1045]
  Access denied for user 'xxxxxxx_apt'@'localhost' (using password: YES)
  in .../db.php:22
  ```
  - 錯誤路徑顯示為 `public_html/website_6b29b600/apt/`，但 CLAUDE.md 寫的線上路徑是 `public_html/apt/`。
  - **待確認**：
    1. ~~這個路徑差異是測試環境造成的，還是線上路徑真的改變了？~~ → 已釐清（2026-06-14）：線上實際路徑就是 `/website_6b29b600/apt`，CLAUDE.md 記載過時，見下方「部署設定」。
    2. 線上 `config.php` 的 DB 帳密是否與 Bluehost 上的 DB 使用者一致（密碼曾外洩換過，可能還沒同步到所有地方）。→ **已釐清（2026-06-14）**：線上 `https://dghm.tw/apt/` 與 `login.php` 皆回 200，未噴 500，代表線上 DB 連線正常、帳密一致。
    3. 此錯誤是否已排除（log 是否還在持續新增）。→ **已釐清（2026-06-14）**：error_log 全部 12 筆 Fatal error 集中在 10-Jun-2026 19:35–19:59 單一時段，且失敗的使用者是 `xxxxxxx_apt`（舊設定的 `_apt` 帳號），**並非**目前 config.php 的 `zjqafhmy_667user`。距今 4 天無新錯誤，視為已排除（舊版設定殘留）。

---

## 部署設定（2026-06-14 新增）

### 已完成
- **lftp 4.9.3** 已安裝（`brew install lftp`）。
- 由範本建立 **`deploy.local.sh`**（權限 600，含 FTP 帳密，已 gitignore，勿提交/分享）。
- **確認線上正確路徑**：`/website_6b29b600/apt`（底線；FTP 登入後已在網站根目錄，**不需** `public_html` 前綴）。與 error_log 顯示一致。
- 可用 FTP 帳號：`yayan@zjq.afh.mybluehost.me`（落在網站根目錄）。
  ❌ 別用 `dghm-apt@...` 子帳號 —— 它被 chroot 鎖在獨立空目錄，看不到網站檔。
- **修補 `deploy.sh` 嚴重安全漏洞** ⚠️：worktree 實體位於 `apt/.claude/worktrees/<name>/`，內含整包大 repo（`clients/`、`Proposal/` 等全公司機密）。原排除清單缺 `.claude/`，會把機密一起上傳。已加入 `--exclude-glob .claude/`（及 `.git`、`.gitignore`），`--dry-run` 驗證乾淨。
- **清理殘留 worktree**（各約 521MB）：已移除 `thirsty-murdock-dd8d56`（只含 .DS_Store）、prune 掉失效的 `upbeat-williams-a659a5`。`quirky-mirzakhani-cb5bc7` 已於 2026-06-14 移除（確認只有 .DS_Store 變更、無未提交程式碼）。

### 部署指令
```bash
cd /Users/arieshsieh/Desktop/projects/dghm/workspace/website_6b29b600/apt
./deploy.sh --dry-run   # 預覽
./deploy.sh             # 上傳（只傳變動，不刪遠端）
```
`config.php` / `schema.sql` / `uploads/` 會被刻意跳過，需手動進 cPanel / phpMyAdmin。目前本機與線上已同步，`--dry-run` 無待傳檔屬正常。

### 部署相關待辦
- [ ] **commit `deploy.sh` 的安全修補**：目前是未追蹤本機檔（`??`），尚未進版控，易遺失。
- [ ] **改掉外洩的 FTP 密碼**：測試初期 lftp 曾把 `dghm-apt` 子帳號密碼印在輸出（已在對話記錄中）。建議到 cPanel 改密碼或刪掉該子帳號。
- [ ] **清線上殘留開發檔**：線上 `/website_6b29b600/apt` 仍有 `CLAUDE.md`、`DEPLOY-SOP.md`、`error_log`、`files/`、`files.zip`、`preview.html`（早期上傳，會洩漏結構，error_log 含 DB 帳號）。deploy.sh 不刪遠端檔，需手動清。
- [ ] **`inspiring-galileo-08fcf7`（fp-decoration）worktree**：可能是另一工作階段在用，確認沒用後再移除。
- [x] **補本機 root `.htaccess`**（2026-06-14 完成）：已依 `files/tenant-portal/template/.htaccess` 範本建立本機 apt 根目錄 `.htaccess`（強制 HTTPS + 擋 config/db/functions/*.sql + 安全標頭）。deploy.sh 未排除 `.htaccess`，下次部署會一併上傳，與線上保持同步。

### worktree 背景
- 本階段以「worktree 隔離模式」啟動，由 Claude Code 自動建立，**結束不會自動刪**（需 `git worktree remove`）。
- 避免再產生：開新階段時不要勾「在 worktree 中執行 / isolated」。
- 部署檔（`deploy.sh`、`deploy.local.sh`、本檔）都在 **apt 主資料夾**，不在 worktree 內，刪 worktree 不會弄丟。

## 其他觀察（非緊急）

- 資料夾內有多個輔助檔案未列在 CLAUDE.md 檔案結構說明中，可考慮補充說明或整理：
  - `DEPLOY-SOP.md`（部署 SOP）
  - `preview.html`（靜態預覽）
  - `bill-file.php`（帳單附件輸出）
  - `files/667-公寓系統開發復盤.md`、`files/tenant-portal-skill.zip`、`files.zip`
  - `assets/icon-doc.svg`、`assets/icon-details.svg`（CLAUDE.md 的 assets 清單未列出）

- `compute_split()` 仍為硬寫 3 人分攤，與 CLAUDE.md 規則一致，本次未改動任何程式碼。

---
本檔案為一次性交接筆記，處理完畢後可刪除或併入 CLAUDE.md。
