<?php
/**
 * 單一進入點 API：api/index.php?action=...
 * 資產：list / save / delete
 * 設定：targets_get / targets_save
 * 總覽：summary（估值 + 累計投入 + 損益 + 停利 + 配置 + 再平衡）
 *
 * 追蹤模型＝B 累計投入式：
 *   市值  = 持有單位 × 現價（台股自動抓、基金手動淨值、現金=餘額）
 *   累計投入 = 投入基準(cost_base) + 定期定額自動累加（從 cost_base_date 起每月 dca_day）
 *   損益  = 市值 − 累計投入
 */
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/fetchers.php';

$action = $_GET['action'] ?? '';
$body   = json_decode(file_get_contents('php://input'), true) ?: [];

try {
    switch ($action) {
        case 'list':         json_out(['holdings' => list_holdings()]); break;
        case 'save':         json_out(save_holding($body)); break;
        case 'delete':       json_out(delete_holding((int) ($body['id'] ?? 0))); break;
        case 'targets_get':  json_out(['targets' => get_targets()]); break;
        case 'targets_save': json_out(save_targets($body['targets'] ?? [])); break;
        case 'summary':      json_out(build_summary()); break;
        case 'txn_list':   json_out(['txns' => list_txns((int)($_GET['holding_id'] ?? 0))]); break;
        case 'txn_save':   json_out(save_txn($body)); break;
        case 'txn_delete': json_out(delete_txn((int)($body['id'] ?? 0))); break;
        default:             json_out(['error' => 'unknown action'], 400);
    }
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 500);
}

// ---------- holdings ----------

function list_holdings(): array
{
    return db()->query('SELECT * FROM holdings ORDER BY category, name')->fetchAll();
}

function save_holding(array $d): array
{
    $f = [
        'name'         => trim($d['name'] ?? ''),
        'category'     => $d['category'] ?? 'other',
        'currency'     => strtoupper(trim($d['currency'] ?? 'TWD')),
        'region'       => strtoupper(trim($d['region'] ?? 'TW')),
        'asset_class'  => $d['asset_class'] ?? 'other',
        'equity_pct'   => num_or_null($d['equity_pct'] ?? ''),
        'ticker'       => trim($d['ticker'] ?? '') ?: null,
        'isin'         => trim($d['isin'] ?? '') ?: null,
        'quantity'     => (float) ($d['quantity'] ?? 0),
        'balance'      => num_or_null($d['balance'] ?? ''),
        'price_mode'   => ($d['price_mode'] ?? 'manual') === 'auto' ? 'auto' : 'manual',
        'manual_price' => num_or_null($d['manual_price'] ?? ''),
        'cost_base'    => num_or_null($d['cost_base'] ?? ''),
        'is_dca'       => !empty($d['is_dca']) ? 1 : 0,
        'dca_amount'   => num_or_null($d['dca_amount'] ?? ''),
        'dca_fee'      => num_or_null($d['dca_fee'] ?? ''),
        'dca_day'      => num_or_null($d['dca_day'] ?? ''),
        'target_return'=> num_or_null($d['target_return'] ?? ''),
        'cum_dividend' => num_or_null($d['cum_dividend'] ?? ''),
        'note'         => trim($d['note'] ?? '') ?: null,
    ];
    if ($f['name'] === '') {
        json_out(['error' => '名稱不可空白'], 422);
    }

    // 改了「累計投入基準」就把基準日設為今天（定期定額從今天後重新累加，避免重複計）
    $oldBase = null;
    if (!empty($d['id'])) {
        $stmt = db()->prepare('SELECT cost_base FROM holdings WHERE id = ?');
        $stmt->execute([(int) $d['id']]);
        $oldBase = $stmt->fetchColumn();
        $oldBase = $oldBase === false ? null : (float) $oldBase;
    }
    $baseChanged = ($f['cost_base'] !== null) && ((float) $f['cost_base'] !== ($oldBase ?? -INF));
    $f['cost_base_date'] = ($baseChanged || empty($d['id'])) ? date('Y-m-d')
        : ($d['cost_base_date'] ?? date('Y-m-d'));

    $touchPrice = $f['manual_price'] !== null ? ', price_at = NOW()' : '';
    $cols = 'name=:name, category=:category, currency=:currency, region=:region,
             asset_class=:asset_class, equity_pct=:equity_pct, ticker=:ticker, isin=:isin,
             quantity=:quantity, balance=:balance, price_mode=:price_mode, manual_price=:manual_price,
             cost_base=:cost_base, cost_base_date=:cost_base_date, is_dca=:is_dca,
             dca_amount=:dca_amount, dca_fee=:dca_fee, dca_day=:dca_day,
             target_return=:target_return, cum_dividend=:cum_dividend, note=:note';

    if (!empty($d['id'])) {
        $f['id'] = (int) $d['id'];
        db()->prepare("UPDATE holdings SET $cols $touchPrice WHERE id=:id")->execute($f);
        return ['ok' => true, 'id' => $f['id']];
    }
    $keys = implode(',', array_keys($f));
    $vals = ':' . implode(',:', array_keys($f));
    db()->prepare("INSERT INTO holdings ($keys) VALUES ($vals)")->execute($f);
    return ['ok' => true, 'id' => (int) db()->lastInsertId()];
}

function delete_holding(int $id): array
{
    db()->prepare('DELETE FROM holdings WHERE id = ?')->execute([$id]);
    return ['ok' => true];
}

// ---------- targets ----------

function get_targets(): array
{
    return db()->query('SELECT dimension, bucket, target_pct FROM targets')->fetchAll();
}

function save_targets(array $targets): array
{
    $pdo = db();
    $pdo->beginTransaction();
    $pdo->exec('DELETE FROM targets');
    $stmt = $pdo->prepare('INSERT INTO targets (dimension, bucket, target_pct) VALUES (?,?,?)');
    foreach ($targets as $t) {
        if (($t['target_pct'] ?? 0) <= 0) continue;
        $stmt->execute([$t['dimension'], $t['bucket'], (float) $t['target_pct']]);
    }
    $pdo->commit();
    return ['ok' => true];
}

// ---------- summary ----------

function build_summary(): array
{
    $holdings = list_holdings();

    $currencies = ['TWD']; $tickers = []; $isins = [];
    foreach ($holdings as $h) {
        $currencies[] = $h['currency'];
        if ($h['category'] === 'tw_stock' && $h['price_mode'] === 'auto' && $h['ticker']) $tickers[] = $h['ticker'];
        if ($h['category'] === 'fund' && $h['price_mode'] === 'auto' && $h['isin'])       $isins[]   = $h['isin'];
    }
    $fx     = fetch_fx_rates(array_values(array_unique($currencies)));
    $prices = fetch_tw_stock_prices($tickers);
    $navs   = fetch_fund_navs($isins);

    $rows = [];
    $totalValue = 0.0; $totalCost = 0.0; $totalPl = 0.0;  // cost/pl 只計有投入的部位
    $warnings = []; $alerts = [];

    foreach ($holdings as $h) {
        $rate = $fx[$h['currency']] ?? 0.0;

        if ($h['category'] === 'cash') {
            $nativeValue = (float) ($h['balance'] ?? 0);
            $invested = null;
        } else {
            $price = current_price($h, $prices, $navs, $warnings);
            $nativeValue = (float) $h['quantity'] * $price;
            $invested = invested_amount($h);
        }
        $row = make_row($h, $nativeValue, $invested, $rate, $prices, $navs);
        $totalValue += $row['value'];
        if ($row['cost'] !== null) { $totalCost += $row['cost']; $totalPl += $row['pl']; }
        if ($row['stopStatus'] === 'hit')  $alerts[] = "🔴 {$row['name']} 報酬率 {$row['returnPct']}%，已達停利目標 {$row['targetReturn']}%，可考慮贖回。";
        if ($row['stopStatus'] === 'near') $alerts[] = "🟡 {$row['name']} 報酬率 {$row['returnPct']}%，接近停利目標 {$row['targetReturn']}%。";
        $rows[] = $row;
    }

    return [
        'baseCurrency' => config()['base_currency'],
        'total'        => round($totalValue, 2),
        'totalCost'    => round($totalCost, 2),
        'totalPl'      => round($totalPl, 2),
        'totalReturn'  => $totalCost > 0 ? round($totalPl / $totalCost * 100, 2) : 0,
        'fx'           => $fx,
        'rows'         => $rows,
        'allocation'   => [
            'asset'    => aggregate_stock_bond($rows, $totalValue),
            'category' => aggregate($rows, 'category', $totalValue),
            'currency' => aggregate($rows, 'currency', $totalValue),
            'region'   => aggregate($rows, 'region', $totalValue),
        ],
        'rebalance'    => build_rebalance($rows, $totalValue),
        'alerts'       => $alerts,
        'warnings'     => $warnings,
        'asOf'         => date('Y-m-d H:i:s'),
    ];
}

/** 目前單價（原幣）。 */
function current_price(array $h, array $prices, array $navs, array &$warnings): float
{
    if ($h['category'] === 'tw_stock' && $h['price_mode'] === 'auto') {
        if ($h['ticker'] && isset($prices[$h['ticker']])) return $prices[$h['ticker']];
        $warnings[] = "台股 {$h['name']}（{$h['ticker']}）抓不到即時價，暫用手動價。";
    }
    if ($h['category'] === 'fund' && $h['price_mode'] === 'auto') {
        if ($h['isin'] && isset($navs[$h['isin']])) return $navs[$h['isin']];
    }
    return $h['manual_price'] !== null ? (float) $h['manual_price'] : 0.0;
}

/** 累計投入（原幣）＝ 投入基準 + 定期定額自動累加。null 代表未設成本、不算損益。 */
function invested_amount(array $h): ?float
{
    $base = $h['cost_base'] !== null ? (float) $h['cost_base'] : null;
    if ((int) $h['is_dca'] === 1 && $h['dca_amount'] !== null && $h['dca_day'] && $h['cost_base_date']) {
        $n = dca_contributions($h['cost_base_date'], (int) $h['dca_day']);
        $per = (float) $h['dca_amount'] + (float) ($h['dca_fee'] ?? 0);
        return ($base ?? 0) + $n * $per;
    }
    return $base;
}

/** 從 baseDate 之後到今天，第 day 號扣款發生了幾次。 */
function dca_contributions(string $baseDate, int $day, ?string $today = null): int
{
    $today = new DateTime($today ?? date('Y-m-d'));
    $start = new DateTime($baseDate);
    $cursor = new DateTime($start->format('Y-m-01'));
    $count = 0;
    while ($cursor <= $today) {
        $dim = (int) $cursor->format('t');           // 當月天數
        $d = min($day, $dim);
        $contrib = new DateTime($cursor->format('Y-m-') . str_pad((string) $d, 2, '0', STR_PAD_LEFT));
        if ($contrib > $start && $contrib <= $today) $count++;
        $cursor->modify('+1 month');
    }
    return $count;
}

function make_row(array $h, float $nativeValue, ?float $invested, float $rate,
                  array $prices, array $navs): array
{
    $isCash = $h['category'] === 'cash';
    $unit = $isCash ? null : ((float) $h['quantity'] != 0 ? round($nativeValue / (float) $h['quantity'], 4) : 0);

    $value = $nativeValue * $rate;
    $cost  = $invested !== null ? $invested * $rate : null;
    $div   = $h['cum_dividend'] !== null ? (float) $h['cum_dividend'] * $rate : 0.0; // 已領配息計入報酬
    $pl    = $cost !== null ? $value - $cost + $div : null;
    $ret   = ($cost !== null && $cost > 0) ? round($pl / $cost * 100, 2) : null;

    $target = $h['target_return'] !== null ? (float) $h['target_return'] : null;
    $stop = 'none';
    if ($target !== null && $ret !== null) {
        $stop = $ret >= $target ? 'hit' : ($ret >= $target * 0.8 ? 'near' : 'ok');
    }

    return [
        'id'         => (int) $h['id'],
        'name'       => $h['name'],
        'category'   => $h['category'],
        'currency'   => $h['currency'],
        'region'     => $h['region'],
        'assetClass' => $h['asset_class'],
        'equityPct'  => $h['equity_pct'] !== null ? (float) $h['equity_pct'] : null,
        'units'      => $isCash ? null : (float) $h['quantity'],
        'unitPrice'  => $unit,
        'value'      => round($value, 2),
        'cost'       => $cost !== null ? round($cost, 2) : null,
        'pl'         => $pl !== null ? round($pl, 2) : null,
        'returnPct'  => $ret,
        'targetReturn' => $target,
        'stopStatus'  => $stop,
        'isDca'       => (int) $h['is_dca'] === 1,
        'nativeValue' => round($nativeValue, 4),
        'ticker'      => $h['ticker'],
    ];
}

function aggregate(array $rows, string $key, float $total): array
{
    $sum = [];
    foreach ($rows as $r) {
        $b = $r[$key] ?: 'OTHER';
        $sum[$b] = ($sum[$b] ?? 0) + $r['value'];
    }
    $out = [];
    foreach ($sum as $bucket => $val) {
        $out[] = ['bucket' => $bucket, 'value' => round($val, 2),
                  'pct' => $total > 0 ? round($val / $total * 100, 2) : 0];
    }
    usort($out, fn($a, $b) => $b['value'] <=> $a['value']);
    return $out;
}

/** 股債比：平衡型按 equity_pct 拆股/債。 */
function aggregate_stock_bond(array $rows, float $total): array
{
    $sum = ['股票' => 0.0, '債券' => 0.0, '現金' => 0.0, '平衡(未分)' => 0.0, '其他' => 0.0];
    foreach ($rows as $r) {
        $v = $r['value'];
        switch ($r['assetClass']) {
            case 'equity': $sum['股票'] += $v; break;
            case 'bond':   $sum['債券'] += $v; break;
            case 'cash':   $sum['現金'] += $v; break;
            case 'balanced':
                if ($r['equityPct'] !== null) {
                    $e = $r['equityPct'] / 100;
                    $sum['股票'] += $v * $e; $sum['債券'] += $v * (1 - $e);
                } else { $sum['平衡(未分)'] += $v; }
                break;
            default: $sum['其他'] += $v;
        }
    }
    $out = [];
    foreach ($sum as $bucket => $val) {
        if ($val <= 0) continue;
        $out[] = ['bucket' => $bucket, 'value' => round($val, 2),
                  'pct' => $total > 0 ? round($val / $total * 100, 2) : 0];
    }
    usort($out, fn($a, $b) => $b['value'] <=> $a['value']);
    return $out;
}

function build_rebalance(array $rows, float $total): array
{
    $actual = [
        'category' => index_pct(aggregate($rows, 'category', $total)),
        'currency' => index_pct(aggregate($rows, 'currency', $total)),
        'region'   => index_pct(aggregate($rows, 'region', $total)),
        'asset'    => index_pct(aggregate_stock_bond($rows, $total)),
    ];
    $out = [];
    foreach (get_targets() as $t) {
        $dim = $t['dimension']; $bkt = $t['bucket']; $tgt = (float) $t['target_pct'];
        $act = $actual[$dim][$bkt] ?? 0.0;
        $diff = $act - $tgt;
        $out[] = [
            'dimension' => $dim, 'bucket' => $bkt,
            'actualPct' => round($act, 2), 'targetPct' => round($tgt, 2),
            'diffPct'   => round($diff, 2),
            'action'    => $diff > 0.5 ? '減碼' : ($diff < -0.5 ? '加碼' : '符合'),
            'amount'    => round(abs($total * $diff / 100), 0),
        ];
    }
    return $out;
}

function index_pct(array $agg): array
{
    $m = [];
    foreach ($agg as $a) $m[$a['bucket']] = $a['pct'];
    return $m;
}

function num_or_null($v): ?float
{
    return ($v === '' || $v === null) ? null : (float) $v;
}

// ---------- transactions ----------

function list_txns(int $holdingId): array
{
    $stmt = db()->prepare('SELECT * FROM transactions WHERE holding_id = ? ORDER BY txn_date DESC, id DESC');
    $stmt->execute([$holdingId]);
    return $stmt->fetchAll();
}

function save_txn(array $d): array
{
    $f = [
        'holding_id' => (int)($d['holding_id'] ?? 0),
        'txn_date'   => $d['txn_date'] ?? date('Y-m-d'),
        'txn_type'   => $d['txn_type'] ?? 'buy',
        'quantity'   => num_or_null($d['quantity'] ?? ''),
        'unit_price' => num_or_null($d['unit_price'] ?? ''),
        'amount'     => (float)($d['amount'] ?? 0),
        'fee'        => num_or_null($d['fee'] ?? ''),
        'currency'   => strtoupper(trim($d['currency'] ?? 'TWD')),
        'note'       => trim($d['note'] ?? '') ?: null,
    ];
    if ($f['holding_id'] <= 0) json_out(['error' => 'holding_id 必填'], 422);
    if (!empty($d['id'])) {
        $f['id'] = (int)$d['id'];
        db()->prepare('UPDATE transactions SET holding_id=:holding_id, txn_date=:txn_date, txn_type=:txn_type,
            quantity=:quantity, unit_price=:unit_price, amount=:amount, fee=:fee, currency=:currency, note=:note
            WHERE id=:id')->execute($f);
        return ['ok' => true, 'id' => $f['id']];
    }
    $keys = implode(',', array_keys($f));
    $vals = ':' . implode(',:', array_keys($f));
    db()->prepare("INSERT INTO transactions ($keys) VALUES ($vals)")->execute($f);
    apply_txn_to_holding($f);
    return ['ok' => true, 'id' => (int)db()->lastInsertId()];
}

function delete_txn(int $id): array
{
    db()->prepare('DELETE FROM transactions WHERE id = ?')->execute([$id]);
    return ['ok' => true];
}

/** 交易記錄自動同步到持倉：買入/賣出調整 quantity+cost_base，配息調整 cum_dividend，換匯調整 balance。 */
function apply_txn_to_holding(array $txn): void
{
    $stmt = db()->prepare('SELECT * FROM holdings WHERE id = ?');
    $stmt->execute([$txn['holding_id']]);
    $h = $stmt->fetch();
    if (!$h) return;

    $qty    = (float) ($txn['quantity'] ?? 0);
    $amount = (float) $txn['amount'];
    $fee    = (float) ($txn['fee'] ?? 0);

    switch ($txn['txn_type']) {
        case 'buy':
            $newQty  = (float) $h['quantity'] + $qty;
            $newCost = (float) ($h['cost_base'] ?? 0) + $amount + $fee;
            db()->prepare('UPDATE holdings SET quantity=?, cost_base=?, cost_base_date=CURDATE() WHERE id=?')
                ->execute([$newQty, $newCost, $h['id']]);
            break;
        case 'sell':
            $oldQty = (float) $h['quantity'];
            $oldCost = (float) ($h['cost_base'] ?? 0);
            $newQty = max(0, $oldQty - $qty);
            $costPerUnit = $oldQty > 0 ? $oldCost / $oldQty : 0;
            $newCost = max(0, $oldCost - $costPerUnit * $qty);
            db()->prepare('UPDATE holdings SET quantity=?, cost_base=?, cost_base_date=CURDATE() WHERE id=?')
                ->execute([$newQty, $newCost, $h['id']]);
            break;
        case 'dividend':
            $newDiv = (float) ($h['cum_dividend'] ?? 0) + $amount;
            db()->prepare('UPDATE holdings SET cum_dividend=? WHERE id=?')->execute([$newDiv, $h['id']]);
            break;
        case 'fx_in':
            $newBal = (float) ($h['balance'] ?? 0) + $amount;
            db()->prepare('UPDATE holdings SET balance=? WHERE id=?')->execute([$newBal, $h['id']]);
            break;
        case 'fx_out':
            $newBal = (float) ($h['balance'] ?? 0) - $amount - $fee;
            db()->prepare('UPDATE holdings SET balance=? WHERE id=?')->execute([$newBal, $h['id']]);
            break;
    }
}
