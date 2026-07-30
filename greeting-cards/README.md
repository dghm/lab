# DGHM 企業電子賀卡平台

DGHM 長期使用的企業節慶電子賀卡發布平台。平台用於管理不同年度與節慶的賀卡，並提供客戶可長期存取的公開動畫賀卡頁面。

目前第一張賀卡為 2026 中秋賀卡。

## 產品原則

- 公開網址與網域由公司長期控制。
- 印刷後的 QR Code 與短網址必須持續有效。
- 已發布賀卡永久保留；封存不等於刪除。
- 平台能力可以共用，但每張賀卡保留獨立的視覺與動畫自由。
- 第一階段使用靜態檔案與 JSON，不過早建立大型 CMS 或資料庫。
- 公版賀卡不進行逐客戶追蹤，也不收集不必要的個人資料。

## 目前結構

```text
greeting-cards/
├── index.html       # 導向賀卡 Dashboard 的專案入口
├── dashboard/
│   ├── index.html
│   ├── dashboard.css
│   └── dashboard.js
├── cards/
│   └── 2026/
│       └── mid-autumn/
│           ├── index.html
│           └── *.svg
├── shared/          # 平台共用層（base.css / replay.js / 新卡骨架 / README）
├── data/
│   ├── cards.json
│   └── greetings-2026-christmas.json   # 個人化祝賀（範例；正式由 Airtable 產生器輸出）
├── public-root/
│   └── .htaccess     # 公開網域 HTTPS 與短網址規則
├── .gitignore
└── README.md
```

`public-root/` 僅部署到 `cards.dghm.tw` 的網站根目錄，用來保存平台層級設定，不屬於任何單張賀卡。

後續預計擴充：

```text
greeting-cards/
├── dashboard/       # 公司內部的賀卡管理入口
├── cards/           # 對外公開且永久保存的賀卡
├── shared/          # 平台共用樣式、腳本與品牌素材
└── README.md
```

`dashboard/` 是電子賀卡專用的內部管理頁，不是 lab 根目錄的專案總覽。

開啟 `greeting-cards/` 根路徑時，`index.html` 會導向 `dashboard/`，方便本機與 staging 使用同一個簡短入口。

Dashboard 目前會讀取 `data/cards.json`，顯示賀卡狀態、最終畫面縮圖、公開路徑與即時預覽。預覽區可切換桌機及手機外框。請透過本機 HTTP 伺服器或正式主機開啟，不要直接以 `file://` 開啟，否則瀏覽器可能阻擋 JSON 載入。

每張賀卡以 `previewImage` 指定清單縮圖。縮圖應保留動畫結束後的完整祝福畫面，並在賀卡最終版本異動時重新產生。

`data/cards.json` 是平台的賀卡清單。第一階段由 Dashboard 讀取這份靜態資料，不連接資料庫。

## 資料模型：模板 + 個人化兩層

平台把「賀卡」分成兩層，公版與個人化共用同一套模型：

- **卡片模板（card template）**：一個節慶一份視覺與預設文案，記在 `data/cards.json`。中秋、春節屬此層；聖誕的共用視覺也在此層。
- **個人化實例（greeting instance）**：同一個模板底下、逐客戶不同的祝賀詞。僅個人化賀卡有此層（目前只有聖誕）。資料來源為 Airtable，經產生器輸出為靜態頁與 `data/greetings-<campaign>-<festival>.json` 索引。

公版賀卡等於「個人化實例數 = 0」的特例，不需另建系統。

### 檔期（campaign）與年度（year）

賀卡以「計畫檔期」分組，一個檔期為一輪企劃：中秋 → 聖誕 → 隔年春節，共 3 張，橫跨兩個日曆年。

- `campaign`：檔期代號，以**中秋所在的年度**為準。例：2026 中秋、2026 聖誕、2027 春節同屬 `campaign: 2026`。
- `year`：節慶實際發生的年度，決定 canonical URL 與封存路徑（規則見下）。2027 春節的 `year` 為 2027，網址仍是 `/2027/lunar-new-year/`。

分組（campaign）與網址（year）是兩條獨立的軸，分開儲存。Dashboard 依 campaign 分組切換，URL 與短碼永遠照 year。

### 個人化賀卡守則（目前為聖誕）

- 短碼採「基底短碼 + 不可猜 token」，例如 `c26-9fk2`。token 一旦寄出或印製即凍結，永不重配。
- 逐客戶頁面一律 `noindex`，且不建立列出全部的公開索引，避免把客戶名單做成可爬目錄。
- 只存祝賀所需最小資料（稱呼、祝詞），不放電話、Email、地址等個資。此為對公版「不逐客戶追蹤」原則的刻意且受限的放寬。

### 短碼配置

字首 + 兩位年度（取自 `year`）。已印製或公開的短碼不重新配置。

| 節慶 | 字首 | 範例（2026 檔期） |
| --- | --- | --- |
| 中秋 mid-autumn | m | `m26` |
| 聖誕 christmas | c | `c26`（個人化：`c26-<token>`） |
| 春節 lunar-new-year | l | `l27`（`year` = 2027） |

## 命名規則

- 目錄與檔名使用小寫 kebab-case。
- 年度使用四位數，例如 `2026`。
- 節慶使用穩定的英文 slug，例如：
  - `mid-autumn`
  - `christmas`
  - `lunar-new-year`
- 春節以實際發布及節慶發生年度歸檔。例如 2027 年春節賀卡使用 `2027/lunar-new-year`。
- 已公開的 slug 不任意更名或重複使用。

## 公開網址規則

正式賀卡採用年度與節慶組成的 canonical URL：

```text
https://cards.dghm.tw/2026/mid-autumn/
https://cards.dghm.tw/2026/christmas/
https://cards.dghm.tw/2027/lunar-new-year/
```

實體卡片印製 QR Code 與可人工輸入的短網址，例如：

```text
https://cards.dghm.tw/m26
```

短網址只負責導向正式賀卡頁面。短碼一旦印刷或公開，不得重新分配給其他賀卡。

## 賀卡狀態

第一階段使用以下狀態：

- `draft`：製作中，不提供正式公開網址。
- `preview`：供內部審閱及跨裝置測試。
- `published`：正式發布，canonical URL 與短網址均可使用。
- `archived`：活動已過期，但原網址與內容永久保留。

狀態只描述賀卡生命週期，不應用來刪除或破壞已發布頁面。

## 賀卡品質要求

每張公開賀卡發布前至少確認：

- 手機與桌機響應式版面。
- Safari、Chrome、LINE 與 Email 內建瀏覽器的基本相容性。
- 低速網路及素材載入失敗時仍有可閱讀內容。
- 動畫完成後保留完整祝福畫面，並可重新播放。
- 支援 `prefers-reduced-motion`。
- 音樂由使用者主動播放，不依賴自動播放。
- 圖片、字型、音樂及插畫具有適用的商業授權。
- SEO、Open Graph、分享預覽圖及基本無障礙。

## 目前賀卡

### 2026 中秋賀卡

- 路徑：`cards/2026/mid-autumn/`
- 狀態：`draft`
- 類型：靜態 HTML、CSS、JavaScript 與 SVG
- 說明：目前保留原有視覺、文案與動畫，尚未進行平台化重構。

## 第一階段範圍

1. 建立專案結構與文件。
2. 將 2026 中秋賀卡納入平台。
3. 建立靜態 Dashboard 與賀卡資料結構。
4. 提供桌機及手機預覽。
5. 產生並下載 QR Code。
6. 建立正式 URL、短網址與封存規則。
7. 規劃並記錄部署流程。

第一階段不包含客戶個人化、完整 CMS、資料庫、權限系統或進階流量統計。

## 待辦（Roadmap）

已完成：

- [x] 資料模型加入 `campaign`（檔期）與 `personalized` 欄位（cards.json v2）
- [x] Dashboard 依檔期分組、公版預覽與個人化逐客戶清單兩種模式、`#card=<id>` 深連結
- [x] 建立 `shared/` 共用層（base.css / replay.js / 新卡骨架）

待辦：

- [ ] **聖誕個人化產生器（第四步，主要工作）**：以 Airtable「聖誕祝賀」表為資料源，
  讀表後替每位客戶產生 `cards/2026/christmas/<token>/` 靜態頁、配發不可猜短碼與 QR，
  並輸出取代 `data/greetings-2026-christmas.json` 的範例種子資料。逐客戶頁一律 `noindex`。
- [ ] 建立 2026 聖誕賀卡的共用視覺（`cards/2026/christmas/`，供個人化頁套用），以 `shared/card-starter.html` 起手。
- [ ] 將線上的 `cards/2026/mid-autumn/` 遷移改吃 `shared/`（需先確認 `shared/` 的正式部署路徑，避免動到線上卡片）。
