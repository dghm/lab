# shared/ — 賀卡平台共用層

跨賀卡通用的樣式、腳本與新卡骨架。原則：**能力共用，視覺與動畫各卡自由**。
只有「與特定節慶無關」的機制才放這裡；每張卡的版面、圖層、進場動畫、RWD 都留在該卡自己的檔案。

## 內容

| 檔案 | 用途 |
| --- | --- |
| `base.css` | reset、`prefers-reduced-motion`、重播用的 `.is-replaying` 動畫清除 |
| `replay.js` | 通用重播行為（一張 `.card` + 一顆 `.replay-btn` 即可運作） |
| `card-starter.html` | 新賀卡起手骨架：含 `<head>` meta / OG 樣板、已接好 shared 引用 |

## 新增一張賀卡

1. 複製 `card-starter.html` 到 `cards/<year>/<festival>/index.html`。
2. 填入該卡的視覺、圖層與祝福文字；主色、字型自由決定。
3. 填好 `<head>` 的 title / description / canonical / OG 與 `theme-color`。
4. 到 `data/cards.json` 新增一筆對應卡片（`year`、`campaign`、`festival`、`personalized`、`shortCode` 等）。
5. 發布前對照根目錄 README 的「賀卡品質要求」逐項確認。

從 `cards/<year>/<festival>/` 連回 shared 的相對路徑固定為 `../../../shared/`。

## 引用路徑注意

共用檔以絕對結構部署在平台根的 `shared/`（正式站為 `https://cards.dghm.tw/shared/`）。
卡片以 `../../../shared/...` 引用；改動部署配置時，務必確認 `shared/` 仍部署在該位置，
否則所有引用它的卡片會失去共用樣式與重播。

## 尚未套用

現行的 `cards/2026/mid-autumn/`（線上已發布）仍為自帶全部樣式的單檔，尚未改吃 shared/。
待確認 `shared/` 的正式部署路徑後再遷移，以免動到線上卡片。詳見根目錄 README 的待辦。
