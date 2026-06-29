# CLAUDE.md — 667 公寓費用分攤系統

## 這是什麼

台北內湖「667 公寓」的水電瓦斯網路費用分攤 + 繳費追蹤系統。
房客登入各看各的應繳金額與明細，管理者（Aries）輸入帳單、系統自動計算分攤、標記已繳/未繳。

- 已上線：https://dghm.tw/apt/（Bluehost 共享主機）
- 技術：原生 PHP 8 + MySQL，無框架、無 composer 依賴
- 本資料夾＝部署母版；**線上檔案在 Bluehost `public_html/apt/`，改完要手動上傳覆蓋**

## 業務規則（核心，勿擅改）

- 分攤起始日 **2026/05/01**（config.php 的 SPLIT_START）：帳單期間在此日前的部分由 Aries 自付，之後的部分 3 人均分（Aries + A 室 + B 室）
- 跨期帳單按天數比例拆分，**起訖日皆計入**（inclusive）
- 每人金額四捨五入，**尾差由 Aries 吸收**（landlord_amount = 總額 − 2×每人）
- 固定費（網路，is_fixed=1）直接 ÷3 不拆天數；網路費雙月 NT$1,400
- 瓦斯等含一次性費用（工料費）時：total_amount 填帳單總額、split_base 只填可分攤部分
- 結算節奏：雙月底結算，隨次月租金收取
- 人數 3 是寫死在 functions.php compute_split() 的，改房客數需改程式

## 檔案結構

```
login.php / logout.php   登入登出
index.php                房客端（手機 2×2 費用卡片 + 期間選擇 + 匯款資訊）
admin.php                Aries 後台（新增帳單即時試算、標記繳費、開結算期）
db.php                   PDO 連線 + 安全 session
functions.php            認證 / CSRF / 分攤計算（業務邏輯全集中在此）
config.php               DB 帳密 + SPLIT_START + 收款資訊（已被 .htaccess 鎖）
schema.sql               四表：users / settlements / bills / payments
.htaccess                強制 HTTPS + 鎖 config/db/functions/*.sql
assets/style.css         樣式（含手機卡片、hero、timeline 元件）
assets/app.js            複製按鈕、modal、admin 即時試算（公式須與 PHP 同步）
assets/logo.png          登入頁圓形 logo
assets/thankyou.png      已繳時 hero 右側貼圖（透明背景）
```

## 環境與帳號

- DB：`zjqafhmy_667_no7`，使用者 `zjqafhmy_667user`（密碼見線上 config.php，**勿寫進本檔或 git**）
- 帳號：`admin`（Aries）／`David`（A 室 侯太偉）／`Zeb`（B 室 李新善）
- 密碼以 bcrypt 雜湊存於 users 表；手動改密需先算雜湊再 UPDATE，禁明文
- 部署：cPanel File Manager 上傳；掛 Cloudflare（改版後清快取、SSL=Full）

## 開發守則

- 安全第一：所有查詢用 PDO prepared statements；房客資料一律 `WHERE user_id=自己`；寫入動作必帶 CSRF token；輸出必經 h()（htmlspecialchars）
- 計算邏輯只能改 functions.php 的 compute_split()，且 app.js 的即時試算公式要同步改
- 日期顯示集中在 functions.php 的 roc()（目前輸出西元 yyyy/m/d）
- 不存身分證、戶籍等敏感個資
- config.php 第一行必為 `<?php`（曾因缺漏導致密碼外洩，外洩即換 DB 密碼）
- 文案稱呼用「Aries」不用「房東」
- 文件排版：少用 emoji；中文與半形英數間加半形空格

## 目前狀態與待辦

已完成：上線、四筆帳單（115年5–6月期，每人 NT$689）、西元年顯示、logo、已繳貼圖
待辦（不急）：
- [ ] admin 重設房客密碼功能
- [ ] 每次結算後 phpMyAdmin Export 備份一次
- [x] 帳單照片上傳存檔（admin/房客端、schema、bill-file.php 皆已完成）
- [ ] （若房客數變動）compute_split() 改為動態抓 tenant 人數
- [ ] 個人費用歷史趨勢走線圖（房客端）
- [ ] 年度統計（每年 5/1–隔年 4/30 為一區間）

## 相關資源

- 完整復盤：667-公寓系統開發復盤.md（DGHM Google Drive）
- 可複用骨架 skill：tenant-portal（同源碼，已衍生 TailorMed 貨件追蹤版 tm-portal）
