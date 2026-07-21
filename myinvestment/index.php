<!DOCTYPE html>
<html lang="zh-Hant">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>我的資產配置儀表板</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=K2D:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="assets/style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
</head>
<body>
<header>
    <h1>個人投資 Dashboard</h1>
    <div class="head-actions">
        <span id="asOf" class="muted"></span>
        <button id="refreshBtn">↻ 重新抓價</button>
    </div>
</header>

<section class="cards">
    <div class="card big">
        <div class="label">總市值（TWD）</div>
        <div id="totalValue" class="value">—</div>
        <div id="cardAlertBadge" class="card-alert-badge hidden"></div>
    </div>
    <div class="card"><div class="label">追蹤成本</div><div id="totalCost" class="value sm">—</div></div>
    <div class="card"><div class="label">未實現損益</div><div id="totalPl" class="value sm">—</div></div>
    <div class="card"><div class="label">USD / TWD</div><div id="fxRate" class="value sm">—</div></div>
</section>

<div id="alerts" class="alerts"></div>
<div id="warnings" class="warnings"></div>

<section class="charts">
    <div class="chart-box">
        <h3>依股債（資產屬性）</h3>
        <div class="chart-body">
            <canvas id="chartAsset"></canvas>
            <ul class="chart-legend" id="legendAsset"></ul>
        </div>
    </div>
    <div class="chart-box">
        <h3>依資產類別</h3>
        <div class="chart-body">
            <canvas id="chartCategory"></canvas>
            <ul class="chart-legend" id="legendCategory"></ul>
        </div>
    </div>
    <div class="chart-box">
        <h3>依幣別</h3>
        <div class="chart-body">
            <canvas id="chartCurrency"></canvas>
            <ul class="chart-legend" id="legendCurrency"></ul>
        </div>
    </div>
    <div class="chart-box">
        <h3>依地區</h3>
        <div class="chart-body">
            <canvas id="chartRegion"></canvas>
            <ul class="chart-legend" id="legendRegion"></ul>
        </div>
    </div>
</section>

<section class="panel">
    <div class="section-head">
        <h2>再平衡建議</h2>
        <button id="editTargetsBtn" class="ghost">設定目標配置</button>
    </div>
    <table id="rebalanceTable" class="data-table">
        <thead><tr><th>維度</th><th>項目</th><th>目前 %</th><th>目標 %</th><th>差距</th><th>動作</th><th>金額 (TWD)</th></tr></thead>
        <tbody></tbody>
    </table>
    <p id="noTargets" class="muted hidden">尚未設定目標配置，點「設定目標配置」開始。</p>
</section>

<section class="panel">
    <div class="section-head">
        <h2>持有部位</h2>
        <button id="addBtn">＋ 新增資產</button>
    </div>
    <div class="tab-bar" id="holdingTabs">
        <button class="tab active" data-tab="all"><span class="tab-avatar">∑</span>全部</button>
        <button class="tab" data-tab="tw_stock"><span class="tab-avatar">台</span>台股</button>
        <button class="tab" data-tab="fund"><span class="tab-avatar">基</span>基金</button>
        <button class="tab" data-tab="cash"><span class="tab-avatar">$</span>現金</button>
    </div>
    <div id="tabSummary" class="tab-summary"></div>
    <table id="holdingsTable" class="data-table">
        <thead><tr>
            <th></th><th>名稱</th><th>類別</th><th>屬性</th><th class="num">持有</th><th class="num">現價</th>
            <th class="num">累計投入</th><th class="num">市值(TWD)</th><th class="num">損益</th>
            <th class="num">報酬率</th><th>停利</th><th></th>
        </tr></thead>
        <tbody></tbody>
    </table>
</section>
    </div>
</div>

<!-- 新增/編輯資產 -->
<dialog id="holdingDialog">
    <form id="holdingForm" method="dialog">
        <h3 id="dlgTitle">新增資產</h3>
        <input type="hidden" name="id">
        <label>名稱<input name="name" required placeholder="例：台積電 / 摩根美國科技"></label>
        <div class="row">
            <label>類別
                <select name="category" id="categorySel">
                    <option value="tw_stock">台股</option>
                    <option value="fund">海外基金</option>
                    <option value="cash">現金 / 存款</option>
                    <option value="other">其他</option>
                </select>
            </label>
            <label>資產屬性（股/債）
                <select name="asset_class" id="assetClassSel">
                    <option value="equity">股票</option>
                    <option value="bond">債券</option>
                    <option value="balanced">平衡 / 多元資產</option>
                    <option value="cash">現金</option>
                    <option value="other">其他</option>
                </select>
            </label>
        </div>
        <div class="row">
            <label>幣別<select name="currency"><option>TWD</option><option>USD</option></select></label>
            <label>地區
                <select name="region">
                    <option value="TW">台灣</option><option value="US">美國</option>
                    <option value="GLOBAL">全球</option><option value="OTHER">其他</option>
                </select>
            </label>
            <label class="equitypct-field">股票占比 %<input name="equity_pct" type="number" step="any" min="0" max="100" placeholder="平衡型才填，例 60"></label>
        </div>
        <label class="ticker-field">台股代號<input name="ticker" placeholder="例：2330"></label>
        <label class="isin-field">基金 ISIN<input name="isin">
            <span class="field-help">基金級別的國際識別碼，不是銀行基金代碼；自動比對淨值用。</span>
        </label>

        <div class="row notcash-field">
            <label id="qtyLabel"><span id="qtyLabelText">持有單位 / 股數</span><input name="quantity" type="number" step="any"></label>
            <label class="price-field"><span id="priceLabelText">目前單價 / 淨值（原幣）</span><input name="manual_price" type="number" step="any"></label>
        </div>
        <label class="balance-field">現金餘額<input name="balance" type="number" step="any"></label>
        <label class="auto-field"><input type="checkbox" name="price_mode" id="autoPrice"> 自動抓價（台股即時價 / 基金以 ISIN 嘗試）</label>

        <section class="fund-bank-summary" aria-labelledby="fundBankSummaryTitle">
            <h4 id="fundBankSummaryTitle">銀行欄位對照</h4>
            <div class="bank-summary-grid">
                <div><span>投資金額（含手續費）</span><strong id="bankInvested">—</strong></div>
                <div><span>投資現值</span><strong id="bankValue">—</strong></div>
                <div><span>投資損益</span><strong id="bankPl">—</strong></div>
                <div><span>報酬率</span><strong id="bankReturn">—</strong></div>
            </div>
            <p class="field-help" id="bankInvestedFormula"></p>
        </section>

        <div class="notcash-field cost-block">
            <label><span id="costBaseLabelText">累計投入基準（原幣，含手續費）</span>
                <input name="cost_base" type="number" step="any" placeholder="設成銀行目前『投資金額』，既往不究">
                <span class="field-help" id="costBaseHelp"></span>
            </label>
            <label class="auto-field"><input type="checkbox" name="is_dca" id="isDca"> 定期定額（每月自動累加投入）</label>
            <div class="row dca-field">
                <label>每次扣款<input name="dca_amount" type="number" step="any" placeholder="例 100"></label>
                <label>手續費<input name="dca_fee" type="number" step="any" placeholder="例 1.5"></label>
                <label>扣款日<input name="dca_day" type="number" min="1" max="28" placeholder="例 6"></label>
            </div>
            <div class="row">
                <label>停利目標報酬率 %（選填）<input name="target_return" type="number" step="any" placeholder="例 60"></label>
                <label><span id="cumDividendLabelText">累計配息（原幣，月配型才填）</span><input name="cum_dividend" type="number" step="any" placeholder="例 4731"></label>
            </div>
        </div>
        <label>備註<input name="note"></label>
        <menu>
            <button type="button" id="cancelDlg" class="ghost">取消</button>
            <button type="submit">儲存</button>
        </menu>
    </form>
</dialog>

<!-- 交易記錄 -->
<dialog id="txnDialog">
    <h3 id="txnDlgTitle">交易記錄</h3>
    <section class="txn-history" aria-labelledby="txnHistoryTitle">
        <h4 id="txnHistoryTitle" class="txn-section-title">最近交易</h4>
        <div id="txnList" class="txn-list"></div>
    </section>
    <div class="txn-form">
        <h4 class="txn-section-title">新增一筆</h4>
        <form id="txnForm">
            <input type="hidden" id="txnHoldingId">
            <input type="hidden" id="txnCurrency">
            <div class="row">
                <label>日期<input type="date" id="txnDate"></label>
                <label>類型
                    <select id="txnType">
                        <option value="buy">買入 / 申購</option>
                        <option value="sell">賣出 / 贖回</option>
                        <option value="dividend">配息 / 分派</option>
                        <option value="fx_in">換匯流入</option>
                        <option value="fx_out">換匯流出 / 費用</option>
                    </select>
                </label>
            </div>
            <div class="row primary-inputs">
                <label>數量 / 單位數<input type="number" step="any" id="txnQty" placeholder="必填"></label>
                <label>成交單價<input type="number" step="any" id="txnUnitPrice" placeholder="必填"></label>
            </div>
            <div class="row secondary-inputs">
                <label>金額<input type="number" step="any" id="txnAmount" placeholder="自動計算，可修改"></label>
                <label>手續費<input type="number" step="any" id="txnFee" placeholder="自動估算，可修改">
                    <span class="muted txn-fee-note hidden" id="txnFeeNote">依牌告 0.1425% 估算，請依實際扣款調整。</span>
                </label>
            </div>
            <label>備註<input type="text" id="txnNote" placeholder="選填"></label>
            <p class="muted hint" id="txnHint"></p>
            <menu>
                <button type="button" id="cancelTxn" class="ghost">關閉</button>
                <button type="submit">新增交易</button>
            </menu>
        </form>
    </div>
</dialog>

<!-- 目標配置 -->
<dialog id="targetsDialog">
    <form id="targetsForm" method="dialog">
        <h3>目標配置（%）</h3>
        <p class="muted">填你希望的比例，留白或 0 代表不追蹤。同一維度建議加總接近 100%。</p>
        <div id="targetsFields"></div>
        <menu>
            <button type="button" id="cancelTargets" class="ghost">取消</button>
            <button type="submit">儲存</button>
        </menu>
    </form>
</dialog>

<script src="assets/app.js"></script>
</body>
</html>
