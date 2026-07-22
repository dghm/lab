'use strict';

const API = 'api/index.php';
const CAT_LABEL = { tw_stock: '台股', fund: '海外基金', cash: '現金/存款', other: '其他' };
const REG_LABEL = { TW: '台灣', US: '美國', GLOBAL: '全球', OTHER: '其他' };
const ASSET_LABEL = { equity: '股票', bond: '債券', balanced: '平衡', cash: '現金', other: '其他' };
const DIM_LABEL = { category: '類別', currency: '幣別', region: '地區', asset: '股債' };
const fmt = n => (n ?? 0).toLocaleString('zh-TW', { maximumFractionDigits: 0 });
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const charts = {};
let HOLDINGS = [];
let ROWS = [];
let currentTab = 'all';

async function api(action, body) {
    const res = await fetch(`${API}?action=${action}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

const labelOf = (dim, b) =>
    dim === 'category' ? (CAT_LABEL[b] || b) : dim === 'region' ? (REG_LABEL[b] || b) : b;
const plClass = v => v > 0 ? 'sell' : v < 0 ? 'buy' : '';   // 賺=綠 賠=紅
const sign = v => (v > 0 ? '+' : '') + fmt(v);
const assetLabel = r => r.assetClass === 'balanced' && r.equityPct != null
    ? `平衡 ${r.equityPct}/${100 - r.equityPct}` : (ASSET_LABEL[r.assetClass] || '—');

// ---------- 載入 ----------
async function refresh() {
    const btn = document.getElementById('refreshBtn');
    btn.disabled = true; btn.textContent = '抓取中…';
    try {
        HOLDINGS = (await api('list')).holdings || [];
        const s = await api('summary');
        if (s.error) { alert('錯誤：' + s.error); return; }
        renderSummary(s);
        loadMacro();
    } finally {
        btn.disabled = false; btn.textContent = '↻ 重新抓價';
    }
}

async function loadMacro() {
    try {
        const data = await api('macro');
        renderMacro(data);
    } catch (_) {
        document.getElementById('macroNews').innerHTML = '<p class="macro-error">宏觀資料暫時無法載入，不影響資產數據。</p>';
    }
}

function renderMacro(data) {
    const y = data?.yield;
    if (!y) {
        document.getElementById('us10yValue').textContent = '—';
        document.getElementById('macroNews').innerHTML = '<p class="macro-error">殖利率資料暫時無法取得。</p>';
        return;
    }
    document.getElementById('us10yValue').textContent = `${(+y.value).toFixed(2)}%`;
    document.getElementById('us10yDate').textContent = `資料日 ${y.date}`;
    const setChange = (id, value) => {
        const el = document.getElementById(id);
        const n = +value;
        el.textContent = `${n > 0 ? '+' : ''}${n.toFixed(1)} bp`;
        el.className = n > 0 ? 'up' : n < 0 ? 'down' : '';
    };
    setChange('us10yDay', y.dayBp);
    setChange('us10yWeek', y.weekBp);
    setChange('us10yMonth', y.monthBp);

    const ctx = document.getElementById('us10yChart');
    if (charts.us10y) charts.us10y.destroy();
    charts.us10y = new Chart(ctx, {
        type: 'line',
        data: {
            labels: y.points.map(p => p.date.slice(5)),
            datasets: [{ data: y.points.map(p => p.value), borderColor: '#2f6df0',
                backgroundColor: 'rgba(47,109,240,.08)', fill: true, borderWidth: 2,
                pointRadius: 0, tension: .25 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { ticks: { callback: value => `${value}%`, font: { size: 10 } }, grid: { color: '#eef0f4' } },
            },
        },
    });

    const news = Array.isArray(data.news) ? data.news : [];
    document.getElementById('macroNews').innerHTML = news.length ? news.map(item => {
        const url = String(item.url || '').startsWith('https://news.google.com/') ? item.url : '#';
        const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('zh-TW') : '';
        return `<a class="macro-news-item" href="${escapeHtml(url)}" target="_blank" rel="noopener">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="macro-news-meta"><span>${escapeHtml(item.source)}</span><span>${escapeHtml(date)}</span></span>
        </a>`;
    }).join('') : '<p class="macro-error">近期沒有取得相關新聞。</p>';
}

function renderSummary(s) {
    document.getElementById('totalValue').textContent = 'NT$ ' + fmt(s.total);
    document.getElementById('totalCost').textContent = 'NT$ ' + fmt(s.totalCost);
    const plEl = document.getElementById('totalPl');
    plEl.textContent = `${sign(s.totalPl)}　${s.totalReturn > 0 ? '+' : ''}${s.totalReturn}%`;
    plEl.className = 'value sm ' + plClass(s.totalPl);
    document.getElementById('fxRate').textContent = s.fx.USD ? s.fx.USD.toFixed(3) : '—';
    document.getElementById('asOf').textContent = '更新於 ' + s.asOf;

    document.getElementById('alerts').innerHTML =
        (s.alerts || []).map(a => `<div class="alert">${a}</div>`).join('');
    document.getElementById('warnings').innerHTML =
        (s.warnings || []).map(w => `<div class="warn">⚠ ${w}</div>`).join('');

    // 將「達標」優先於「接近」顯示在大卡片內的小徽章；其餘細節仍留在 #alerts/#warnings。
    const badgeEl = document.getElementById('cardAlertBadge');
    const hasAlert = (s.alerts || []).length > 0;
    const hasWarning = (s.warnings || []).length > 0;
    if (hasAlert) {
        badgeEl.textContent = `${s.alerts.length} 項已達停利目標`;
        badgeEl.className = 'card-alert-badge hit';
    } else if (hasWarning) {
        badgeEl.textContent = `🟡 ${s.warnings.length} 項接近停利目標`;
        badgeEl.className = 'card-alert-badge near';
    } else {
        badgeEl.className = 'card-alert-badge hidden';
    }

    pie('chartAsset', s.allocation.asset, 'asset', 'legendAsset');
    pie('chartCategory', s.allocation.category, 'category', 'legendCategory');
    pie('chartCurrency', s.allocation.currency, 'currency', 'legendCurrency');
    pie('chartRegion', s.allocation.region, 'region', 'legendRegion');

    ROWS = s.rows;
    renderHoldings(ROWS);
    renderRebalance(s.rebalance);
}

const PIE_COLORS = ['#89b7ee', '#f2b33f', '#89cda0', '#f89f9f', '#b8a4e3', '#7fd0d0', '#e3c98a', '#c5c9d6'];

function pie(id, data, dim, legendId) {
    const ctx = document.getElementById(id);
    if (charts[id]) charts[id].destroy();
    const colors = data.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]);
    charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: data.map(d => labelOf(dim, d.bucket)),
                datasets: [{ data: data.map(d => d.value), backgroundColor: colors, borderWidth: 0 }] },
        options: { plugins: { legend: { display: false } }, cutout: '62%' },
    });
    if (legendId) {
        const legendEl = document.getElementById(legendId);
        if (legendEl) {
            legendEl.innerHTML = data.map((d, i) => `
                <li class="legend-item">
                    <span class="legend-dot" style="background:${colors[i]}"></span>
                    <span class="legend-label">${labelOf(dim, d.bucket)}</span>
                    <span class="legend-value">${d.pct}%</span>
                </li>`).join('');
        }
    }
}

function stopBadge(r) {
    if (r.targetReturn == null || r.returnPct == null) return '';
    const cls = r.stopStatus === 'hit' ? 'sell' : r.stopStatus === 'near' ? 'warn-tag' : 'ok';
    const icon = r.stopStatus === 'hit' ? '🔴' : r.stopStatus === 'near' ? '🟡' : '';
    return `<span class="tag ${cls}">${icon}${r.returnPct}/${r.targetReturn}%</span>`;
}

function renderHoldings(rows) {
    // Tab 篩選
    const filtered = currentTab === 'all' ? rows : rows.filter(r => r.category === currentTab);

    // Tab 小計
    const tabVal  = filtered.reduce((s, r) => s + (r.value || 0), 0);
    const tabCost = filtered.reduce((s, r) => s + (r.cost || 0), 0);
    const tabPl   = filtered.reduce((s, r) => s + (r.pl || 0), 0);
    const tabRet  = tabCost > 0 ? (tabPl / tabCost * 100).toFixed(2) : null;
    const summEl  = document.getElementById('tabSummary');
    summEl.innerHTML = `市值 NT$${fmt(tabVal)}｜投入 NT$${fmt(tabCost)}｜損益 <span class="${plClass(tabPl)}">${sign(tabPl)}${tabRet != null ? ' (' + (tabRet > 0 ? '+' : '') + tabRet + '%)' : ''}</span>`;

    const tb = document.querySelector('#holdingsTable tbody');
    tb.innerHTML = filtered.map(r => {
        const valueCell = r.category === 'fund' && r.currency === 'USD'
            ? `${fmt(r.value)}<br><span class="muted" style="font-size:11px">$${r.nativeValue?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} USD</span>`
            : fmt(r.value);
        return `
        <tr>
            <td class="drag-handle" aria-hidden="true">⠿</td>
            <td>${r.name}${r.isDca ? ' <span class="muted">定期</span>' : ''}</td>
            <td>${CAT_LABEL[r.category] || r.category}</td>
            <td>${assetLabel(r)}</td>
            <td class="num">${r.units != null ? r.units.toLocaleString() : '—'}</td>
            <td class="num">${r.unitPrice != null ? r.unitPrice.toLocaleString() : '—'}</td>
            <td class="num">${r.cost != null ? fmt(r.cost) : '—'}</td>
            <td class="num strong">${valueCell}</td>
            <td class="num ${plClass(r.pl)}">${r.pl != null ? sign(r.pl) : '—'}</td>
            <td class="num ${plClass(r.pl)}">${r.returnPct != null ? r.returnPct + '%' : '—'}</td>
            <td>${stopBadge(r)}</td>
            <td class="ops">
                <button class="icon-btn txn" data-id="${r.id}" data-name="${r.name}" data-currency="${r.currency}" data-category="${r.category}" data-ticker="${r.ticker || ''}" title="交易記錄">🧾</button>
                <button class="icon-btn edit" data-id="${r.id}" title="編輯">✎</button>
                <button class="icon-btn del" data-id="${r.id}" title="刪除">🗑</button>
            </td>
        </tr>`;
    }).join('');
    tb.querySelectorAll('.txn').forEach(b => b.onclick = () => openTxnDialog(+b.dataset.id, b.dataset.name, b.dataset.currency, b.dataset.category, b.dataset.ticker));
    tb.querySelectorAll('.edit').forEach(b => b.onclick = () => openEdit(+b.dataset.id));
    tb.querySelectorAll('.del').forEach(b => b.onclick = () => removeHolding(+b.dataset.id));
}

function renderRebalance(rb) {
    const tb = document.querySelector('#rebalanceTable tbody');
    document.getElementById('noTargets').classList.toggle('hidden', rb.length > 0);
    tb.innerHTML = rb.map(r => {
        const cls = r.action === '加碼' ? 'buy' : r.action === '減碼' ? 'sell' : 'ok';
        return `<tr>
            <td>${DIM_LABEL[r.dimension]}</td><td>${labelOf(r.dimension, r.bucket)}</td>
            <td class="num">${r.actualPct}%</td><td class="num">${r.targetPct}%</td>
            <td class="num ${cls}">${r.diffPct > 0 ? '+' : ''}${r.diffPct}%</td>
            <td><span class="tag ${cls}">${r.action}</span></td>
            <td class="num">${r.action === '符合' ? '—' : fmt(r.amount)}</td>
        </tr>`;
    }).join('');
}

// ---------- 新增 / 編輯 ----------
const dlg = document.getElementById('holdingDialog');
const form = document.getElementById('holdingForm');

function toggleFields() {
    const cat = document.getElementById('categorySel').value;
    if (cat === 'cash') document.getElementById('assetClassSel').value = 'cash';
    const show = (sel, on) => dlg.querySelectorAll(sel).forEach(e => e.style.display = on ? '' : 'none');
    show('.ticker-field', cat === 'tw_stock');
    show('.isin-field', cat === 'fund');
    show('.fund-bank-summary', cat === 'fund');
    show('.auto-field', cat === 'tw_stock' || cat === 'fund');
    show('.notcash-field', cat !== 'cash');
    show('.balance-field', cat === 'cash');
    show('.equitypct-field', document.getElementById('assetClassSel').value === 'balanced');
    show('.dca-field', document.getElementById('isDca').checked);
    document.getElementById('qtyLabelText').textContent =
        cat === 'fund' ? '單位數' : '股數';
    document.getElementById('priceLabelText').textContent =
        cat === 'fund' ? '參考淨值' : '目前股價（原幣）';
    document.getElementById('costBaseLabelText').textContent =
        cat === 'fund' ? '自動累加起始金額' : '累計投入基準（原幣，含手續費）';
    document.getElementById('costBaseHelp').textContent = cat === 'fund'
        ? '系統由此金額開始累加每期扣款與手續費；不是銀行目前顯示的投資金額。'
        : '';
    document.getElementById('cumDividendLabelText').textContent =
        cat === 'fund' ? '累計配息' : '累計配息（原幣，月配型才填）';
}

function renderFundBankSummary(h) {
    const row = ROWS.find(x => +x.id === +h.id);
    const currency = h.currency || '';
    const invested = h.current_invested != null ? +h.current_invested : null;
    const value = row?.nativeValue != null ? +row.nativeValue : null;
    const dividends = h.cum_dividend != null ? +h.cum_dividend : 0;
    const pl = invested != null && value != null ? value - invested + dividends : null;
    const money = n => n == null ? '—' : `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    document.getElementById('bankInvested').textContent = money(invested);
    document.getElementById('bankValue').textContent = money(value);
    document.getElementById('bankPl').textContent = pl == null ? '—' : `${pl >= 0 ? '+' : ''}${money(pl)}`;
    document.getElementById('bankReturn').textContent = row?.returnPct == null ? '—' : `${row.returnPct}%`;

    const count = +h.dca_contribution_count || 0;
    const amount = +(h.dca_amount || 0);
    const fee = +(h.dca_fee || 0);
    const base = +(h.cost_base || 0);
    document.getElementById('bankInvestedFormula').textContent = +h.is_dca === 1
        ? `${base.toFixed(2)} + ${count} 次 × (${amount.toFixed(2)} + ${fee.toFixed(2)}) = ${(invested ?? 0).toFixed(2)} ${currency}`
        : '目前累計投入等於自動累加起始金額。';
}

function openAdd() {
    form.reset(); form.id.value = '';
    document.getElementById('dlgTitle').textContent = '新增資產';
    document.getElementById('autoPrice').checked = false;
    document.getElementById('isDca').checked = false;
    document.getElementById('bankInvested').textContent = '—';
    document.getElementById('bankValue').textContent = '—';
    document.getElementById('bankPl').textContent = '—';
    document.getElementById('bankReturn').textContent = '—';
    document.getElementById('bankInvestedFormula').textContent = '';
    toggleFields(); dlg.showModal();
}

function openEdit(id) {
    const h = HOLDINGS.find(x => +x.id === id);
    if (!h) return;
    form.reset();
    form.id.value = h.id; form.name.value = h.name; form.category.value = h.category;
    form.asset_class.value = h.asset_class || 'other'; form.equity_pct.value = h.equity_pct ?? '';
    form.currency.value = h.currency; form.region.value = h.region;
    form.ticker.value = h.ticker || ''; form.isin.value = h.isin || '';
    form.quantity.value = h.quantity ?? ''; form.manual_price.value = h.manual_price ?? '';
    form.balance.value = h.balance ?? ''; form.cost_base.value = h.cost_base ?? '';
    form.dca_amount.value = h.dca_amount ?? ''; form.dca_fee.value = h.dca_fee ?? '';
    form.dca_day.value = h.dca_day ?? ''; form.target_return.value = h.target_return ?? '';
    form.cum_dividend.value = h.cum_dividend ?? '';
    form.note.value = h.note || '';
    document.getElementById('autoPrice').checked = h.price_mode === 'auto';
    document.getElementById('isDca').checked = +h.is_dca === 1;
    document.getElementById('dlgTitle').textContent = '編輯資產';
    toggleFields();
    if (h.category === 'fund') renderFundBankSummary(h);
    dlg.showModal();
}

form.onsubmit = async () => {
    await api('save', {
        id: form.id.value || null,
        name: form.name.value, category: form.category.value,
        asset_class: form.asset_class.value, equity_pct: form.equity_pct.value,
        currency: form.currency.value, region: form.region.value,
        ticker: form.ticker.value, isin: form.isin.value,
        quantity: form.quantity.value, manual_price: form.manual_price.value,
        balance: form.balance.value, cost_base: form.cost_base.value,
        price_mode: document.getElementById('autoPrice').checked ? 'auto' : 'manual',
        is_dca: document.getElementById('isDca').checked ? 1 : 0,
        dca_amount: form.dca_amount.value, dca_fee: form.dca_fee.value, dca_day: form.dca_day.value,
        target_return: form.target_return.value, cum_dividend: form.cum_dividend.value,
        note: form.note.value,
    });
    dlg.close(); refresh();
};

async function removeHolding(id) {
    if (!confirm('確定刪除這筆資產？')) return;
    await api('delete', { id }); refresh();
}

// ---------- 目標配置 ----------
const tDlg = document.getElementById('targetsDialog');
const tForm = document.getElementById('targetsForm');

async function openTargets() {
    const summary = await api('summary');
    const t = await api('targets_get');
    const existing = {};
    (t.targets || []).forEach(x => existing[`${x.dimension}|${x.bucket}`] = x.target_pct);
    const groups = { asset: [], category: [], currency: [], region: [] };
    for (const dim of Object.keys(groups)) groups[dim] = summary.allocation[dim].map(a => a.bucket);
    document.getElementById('targetsFields').innerHTML = Object.entries(groups).map(([dim, bs]) => `
        <fieldset><legend>${DIM_LABEL[dim]}</legend>
        ${bs.map(b => `<label class="trow">${labelOf(dim, b)}
            <input type="number" step="any" min="0" max="100" data-dim="${dim}" data-bucket="${b}"
                value="${existing[`${dim}|${b}`] ?? ''}"></label>`).join('')}
        </fieldset>`).join('');
    tDlg.showModal();
}

tForm.onsubmit = async () => {
    const targets = [...tForm.querySelectorAll('input[data-dim]')]
        .map(i => ({ dimension: i.dataset.dim, bucket: i.dataset.bucket, target_pct: parseFloat(i.value) || 0 }))
        .filter(t => t.target_pct > 0);
    await api('targets_save', { targets });
    tDlg.close(); refresh();
};

// ---------- Tab 切換 ----------
document.getElementById('holdingTabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('#holdingTabs .tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    renderHoldings(ROWS);
});

// ---------- 交易記錄 ----------
const txnDlg = document.getElementById('txnDialog');
const txnForm = document.getElementById('txnForm');
const TXN_LABEL = { buy: '買入/申購', sell: '賣出/贖回', dividend: '配息/分派', fx_in: '換匯流入', fx_out: '換匯流出/費用' };

let txnCategory = '', txnTicker = '';

async function openTxnDialog(holdingId, name, currency, category, ticker) {
    txnCategory = category || ''; txnTicker = ticker || '';
    document.getElementById('txnDlgTitle').textContent = `交易記錄：${name}`;
    document.getElementById('txnHoldingId').value = holdingId;
    document.getElementById('txnCurrency').value = currency;
    document.getElementById('txnDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('txnAmount').value = '';
    document.getElementById('txnFee').value = '';
    document.getElementById('txnQty').value = '';
    document.getElementById('txnUnitPrice').value = '';
    document.getElementById('txnNote').value = '';
    document.getElementById('txnHint').textContent = '';
    updateTxnFeeNote();
    await loadTxnList(holdingId);
    txnDlg.showModal();
}

/** 台股：股數 × 成交單價 自動算出金額。 */
function calcTwAmount() {
    if (txnCategory !== 'tw_stock') return;
    const qty = parseFloat(document.getElementById('txnQty').value);
    const price = parseFloat(document.getElementById('txnUnitPrice').value);
    if (!qty || !price) return;
    document.getElementById('txnAmount').value = Math.round(qty * price);
    estimateTwFee();
}

/** 台股手續費／交易稅估算（牌告費率，未反映券商折扣，僅供參考）。 */
function estimateTwFee() {
    if (txnCategory !== 'tw_stock') return;
    const amount = parseFloat(document.getElementById('txnAmount').value);
    const type = document.getElementById('txnType').value;
    if (!amount || (type !== 'buy' && type !== 'sell')) return;
    let fee = Math.round(amount * 0.001425);
    if (type === 'sell') {
        const isEtf = (txnTicker || '').startsWith('00');
        fee += Math.round(amount * (isEtf ? 0.001 : 0.003));
    }
    document.getElementById('txnFee').value = fee;
}
function updateTxnFeeNote() {
    const type = document.getElementById('txnType').value;
    const isPositionTrade = (type === 'buy' || type === 'sell') && txnCategory !== 'cash';
    const isAutoTwTrade = isPositionTrade && txnCategory === 'tw_stock';
    document.getElementById('txnQty').placeholder = isPositionTrade ? '必填' : '不適用';
    document.getElementById('txnUnitPrice').placeholder = isPositionTrade ? '必填' : '不適用';
    document.getElementById('txnAmount').placeholder = isAutoTwTrade ? '自動計算，可修改' : '必填';
    document.getElementById('txnFee').placeholder = isAutoTwTrade ? '自動估算，可修改' : '選填';
    document.getElementById('txnFeeNote').classList.toggle(
        'hidden',
        !isAutoTwTrade
    );
}
document.getElementById('txnQty').addEventListener('input', calcTwAmount);
document.getElementById('txnUnitPrice').addEventListener('input', calcTwAmount);
document.getElementById('txnAmount').addEventListener('input', estimateTwFee);
document.getElementById('txnType').addEventListener('change', () => {
    estimateTwFee();
    updateTxnFeeNote();
});

async function loadTxnList(holdingId) {
    const res = await api(`txn_list&holding_id=${holdingId}`);
    const list = document.getElementById('txnList');
    if (!res.txns || res.txns.length === 0) {
        list.innerHTML = '<p class="muted" style="margin:0 0 8px">尚無交易記錄。</p>';
        return;
    }
    list.innerHTML = `<table class="data-table mini" style="margin:0 0 12px">
        <thead><tr><th>日期</th><th>類型</th><th class="num">金額</th><th class="num secondary-col">手續費</th><th>數量</th><th class="secondary-col">備註</th><th></th></tr></thead>
        <tbody>${res.txns.map(t => `<tr>
            <td>${t.txn_date}</td>
            <td>${TXN_LABEL[t.txn_type] || t.txn_type}</td>
            <td class="num"><span class="txn-amount"><span class="txn-currency">${t.currency}</span><span class="txn-amount-value">${(+t.amount).toLocaleString()}</span></span></td>
            <td class="num secondary-col">${t.fee != null ? (+t.fee).toLocaleString() : '—'}</td>
            <td>${t.quantity != null ? (+t.quantity).toLocaleString() : '—'}</td>
            <td class="secondary-col">${t.note || ''}</td>
            <td><button class="link del-txn" data-id="${t.id}" data-hid="${t.holding_id}">刪</button></td>
        </tr>`).join('')}</tbody>
    </table>`;
    list.querySelectorAll('.del-txn').forEach(b => b.onclick = async () => {
        if (!confirm('刪除這筆交易記錄？')) return;
        await api('txn_delete', { id: +b.dataset.id });
        await loadTxnList(+b.dataset.hid);
    });
}

txnForm.onsubmit = async (e) => {
    e.preventDefault();
    const holdingId = +document.getElementById('txnHoldingId').value;
    const txnType = document.getElementById('txnType').value;
    await api('txn_save', {
        holding_id: holdingId,
        txn_date:   document.getElementById('txnDate').value,
        txn_type:   txnType,
        amount:     document.getElementById('txnAmount').value,
        fee:        document.getElementById('txnFee').value,
        quantity:   document.getElementById('txnQty').value,
        unit_price: document.getElementById('txnUnitPrice').value,
        currency:   document.getElementById('txnCurrency').value,
        note:       document.getElementById('txnNote').value,
    });
    document.getElementById('txnAmount').value = '';
    document.getElementById('txnFee').value = '';
    document.getElementById('txnQty').value = '';
    document.getElementById('txnUnitPrice').value = '';
    document.getElementById('txnNote').value = '';
    await loadTxnList(holdingId);
    await refresh();
    if (txnType === 'buy' || txnType === 'sell') {
        document.getElementById('txnHint').textContent =
            '✅ 已自動更新持倉的「持有單位數」與「累計投入基準」。';
    } else if (txnType === 'dividend') {
        document.getElementById('txnHint').textContent = '✅ 已自動累加至「累計配息」。';
    } else {
        document.getElementById('txnHint').textContent = '✅ 已自動更新現金餘額。';
    }
};

document.getElementById('cancelTxn').onclick = () => txnDlg.close();

// ---------- 綁定 ----------
document.getElementById('refreshBtn').onclick = refresh;
document.getElementById('addBtn').onclick = openAdd;
document.getElementById('cancelDlg').onclick = () => dlg.close();
document.getElementById('editTargetsBtn').onclick = openTargets;
document.getElementById('cancelTargets').onclick = () => tDlg.close();
document.getElementById('categorySel').onchange = toggleFields;
document.getElementById('assetClassSel').onchange = toggleFields;
document.getElementById('isDca').onchange = toggleFields;

refresh();
