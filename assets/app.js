'use strict';

const API = 'api/index.php';
const CAT_LABEL = { tw_stock: '台股', fund: '海外基金', cash: '現金/存款', other: '其他' };
const REG_LABEL = { TW: '台灣', US: '美國', GLOBAL: '全球', OTHER: '其他' };
const ASSET_LABEL = { equity: '股票', bond: '債券', balanced: '平衡', cash: '現金', other: '其他' };
const DIM_LABEL = { category: '類別', currency: '幣別', region: '地區', asset: '股債' };
const fmt = n => (n ?? 0).toLocaleString('zh-TW', { maximumFractionDigits: 0 });
const charts = {};
let HOLDINGS = [];

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
    } finally {
        btn.disabled = false; btn.textContent = '↻ 重新抓價';
    }
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

    pie('chartAsset', s.allocation.asset, 'asset');
    pie('chartCategory', s.allocation.category, 'category');
    pie('chartCurrency', s.allocation.currency, 'currency');
    pie('chartRegion', s.allocation.region, 'region');

    renderHoldings(s.rows);
    renderRebalance(s.rebalance);
}

function pie(id, data, dim) {
    const ctx = document.getElementById(id);
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: data.map(d => `${labelOf(dim, d.bucket)} (${d.pct}%)`),
                datasets: [{ data: data.map(d => d.value) }] },
        options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } },
    });
}

function stopBadge(r) {
    if (r.targetReturn == null || r.returnPct == null) return '';
    const cls = r.stopStatus === 'hit' ? 'sell' : r.stopStatus === 'near' ? 'warn-tag' : 'ok';
    const icon = r.stopStatus === 'hit' ? '🔴' : r.stopStatus === 'near' ? '🟡' : '';
    return `<span class="tag ${cls}">${icon}${r.returnPct}/${r.targetReturn}%</span>`;
}

function renderHoldings(rows) {
    const tb = document.querySelector('#holdingsTable tbody');
    tb.innerHTML = rows.map(r => `
        <tr>
            <td>${r.name}${r.isDca ? ' <span class="muted">定期</span>' : ''}</td>
            <td>${CAT_LABEL[r.category] || r.category}</td>
            <td>${assetLabel(r)}</td>
            <td class="num">${r.units != null ? r.units.toLocaleString() : '—'}</td>
            <td class="num">${r.unitPrice != null ? r.unitPrice.toLocaleString() : '—'}</td>
            <td class="num">${r.cost != null ? fmt(r.cost) : '—'}</td>
            <td class="num strong">${fmt(r.value)}</td>
            <td class="num ${plClass(r.pl)}">${r.pl != null ? sign(r.pl) : '—'}</td>
            <td class="num ${plClass(r.pl)}">${r.returnPct != null ? r.returnPct + '%' : '—'}</td>
            <td>${stopBadge(r)}</td>
            <td class="ops">
                <button class="link edit" data-id="${r.id}">編輯</button>
                <button class="link del" data-id="${r.id}">刪除</button>
            </td>
        </tr>`).join('');
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
    show('.auto-field', cat === 'tw_stock' || cat === 'fund');
    show('.notcash-field', cat !== 'cash');
    show('.balance-field', cat === 'cash');
    show('.equitypct-field', document.getElementById('assetClassSel').value === 'balanced');
    show('.dca-field', document.getElementById('isDca').checked);
    document.getElementById('qtyLabel').firstChild.textContent =
        cat === 'fund' ? '持有單位數' : '股數';
    dlg.querySelector('.price-field').firstChild.textContent =
        cat === 'fund' ? '目前淨值（原幣）' : '目前股價（原幣）';
}

function openAdd() {
    form.reset(); form.id.value = '';
    document.getElementById('dlgTitle').textContent = '新增資產';
    document.getElementById('autoPrice').checked = false;
    document.getElementById('isDca').checked = false;
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
    toggleFields(); dlg.showModal();
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
