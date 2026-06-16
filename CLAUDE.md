# myInvestment — 個人資產配置儀表板

個人跨資產配置與損益儀表板（PHP + MySQL，部署在 Bluehost）。
擁有者為 DGHM（萬能數維），個人用，追蹤台股、海外基金、美元/台幣現金。
全程使用繁體中文（註解、UI、回覆）。

## 部署資訊
- 網址：`lab.dghm.tw/myinvestment/`（lab 子網域為實驗室容器，整個 lab 已用 cPanel Directory Privacy 密碼鎖保護）
- 主機路徑：`/home1/zjqafhmy/lab.dghm.tw/myinvestment/`
- 資料庫：`zjqafhmy_myinvest`，使用者 `zjqafhmy_inv2`（密碼在 `config.php`，不進版控）
- `config.php` 由 `config.sample.php` 複製而來，含 DB 連線；已被 `.gitignore` 排除
- SSL：cPanel AutoSSL 已啟用；HTTPS 強制轉址
- 本機沒裝 PHP，無法在本機 lint/run；驗證都在 Bluehost 上做

## 追蹤模型：B 累計投入式
- 市值 = 持有單位 × 現價（台股自動抓 TWSE、基金手動淨值、現金=餘額）
- 累計投入 = `cost_base` + 定期定額自動累加（每月 `dca_day` 加 `dca_amount + dca_fee`，從 `cost_base_date` 起算）
- 損益 = 市值 − 累計投入 + 累計配息(`cum_dividend`)；報酬率 = 損益 / 累計投入
- 改動 `cost_base` 時，`cost_base_date` 自動設為今天（定期定額從今天重新累加，避免重複計）
- 「既往不究」：`cost_base` 設成銀行目前的「投資金額」，損益從今天起算
- 月配/分派型基金要填 `cum_dividend`（已領配息），否則報酬率會被低估（曾因此把 NN79 算成虧損）

## 四個配置維度
- 股債 `asset_class`：equity / bond / balanced(+`equity_pct` 拆股債) / cash / other
- 類別 `category`：tw_stock / fund / cash / other
- 幣別 `currency`、地區 `region`
- 重要：**類別 ≠ 屬性 ≠ 地區，要分開判斷**。台股代號可能是債券 ETF（例 00679B 元大美債20年 = 債券、地區美國）

## 檔案結構
- `index.php` 儀表板頁面、`assets/app.js` 前端邏輯、`assets/style.css`
- `api/index.php` 單一進入點 API：`?action=list|save|delete|targets_get|targets_save|summary`
- `lib/db.php` PDO 連線、`lib/fetchers.php` 外部抓價
- `db/schema.sql` 全新安裝、`db/migrate_b.sql` v1→B 遷移（只跑一次）

## 外部資料來源
- 台股價：TWSE MIS API（特別股如 2891C 抓不到，需手動填現價）
- 匯率：open.er-api.com（免金鑰 JSON）
- 基金淨值：目前手動；`lib/fetchers.php` 的 `fetch_fund_navs()` 是預留 hook（可填入以 ISIN 抓淨值的來源）
- 快取：`price_cache` 表，TTL 900 秒（`config.php` 的 `price_cache_ttl`）

## 目前狀態（2026-06）
- B 模式已上線，使用者已填入實際持有（玉山銀行：6 檔台股 + 5 檔基金 + 台幣/美元現金）
- 基金 DCA：每月 6 號各扣 $100 USD（單筆 NN37 除外）；手續費 AA77 1.5 / NN79 0.76 / CCE9 1.14 / 7604 1.14
- 停利監控：每檔可設 `target_return`（基金預設 60%），達標 🔴 / 接近 🟡 於儀表板提醒

## 待辦／想法
- 停利達標每日排程 + 推播通知
- 每日總值快照 → 資產成長趨勢圖
- 基金淨值自動化（實作 `fetch_fund_navs`）

## 慣例
- 不要把 `config.php`（含 DB 密碼）加入版控
- 變更後需重新打包上傳 Bluehost；DB 結構變更要寫對應 migration SQL
