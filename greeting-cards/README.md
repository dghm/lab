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
├── dashboard/
│   ├── index.html
│   ├── dashboard.css
│   └── dashboard.js
├── cards/
│   └── 2026/
│       └── mid-autumn/
│           ├── index.html
│           └── *.svg
├── data/
│   └── cards.json
├── .gitignore
└── README.md
```

後續預計擴充：

```text
greeting-cards/
├── dashboard/       # 公司內部的賀卡管理入口
├── cards/           # 對外公開且永久保存的賀卡
├── shared/          # 平台共用樣式、腳本與品牌素材
└── README.md
```

`dashboard/` 是電子賀卡專用的內部管理頁，不是 lab 根目錄的專案總覽。

Dashboard 目前會讀取 `data/cards.json`，顯示賀卡狀態、公開路徑與預覽入口。請透過本機 HTTP 伺服器或正式主機開啟，不要直接以 `file://` 開啟，否則瀏覽器可能阻擋 JSON 載入。

`data/cards.json` 是平台的賀卡清單。第一階段由 Dashboard 讀取這份靜態資料，不連接資料庫。

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
