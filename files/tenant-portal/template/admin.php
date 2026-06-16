<?php
require_once __DIR__ . '/functions.php';
$user = require_admin();

$flash = '';

// 取得兩位房客
$tenants = db()->query("SELECT * FROM users WHERE role='tenant' ORDER BY room")->fetchAll();

function ensure_payment_rows(int $settlementId, array $tenants): void {
    $ins = db()->prepare("INSERT IGNORE INTO payments (settlement_id, user_id, status) VALUES (?,?, 'unpaid')");
    foreach ($tenants as $t) $ins->execute([$settlementId, $t['id']]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_csrf();
    $action = $_POST['action'] ?? '';

    if ($action === 'create_settlement') {
        $stmt = db()->prepare('INSERT INTO settlements (name, due_date, note) VALUES (?,?,?)');
        $stmt->execute([trim($_POST['name']), $_POST['due_date'], trim($_POST['note'] ?? '')]);
        ensure_payment_rows((int)db()->lastInsertId(), $tenants);
        $flash = '已新增結算期。';
    }

    if ($action === 'add_bill') {
        $isFixed = isset($_POST['is_fixed']) ? 1 : 0;
        $ps = $isFixed ? null : ($_POST['period_start'] ?: null);
        $pe = $isFixed ? null : ($_POST['period_end'] ?: null);
        if (!$isFixed && (!$ps || !$pe)) {
            $flash = '非固定費請填寫計費起訖日。';
        } else {
            $total = (float)$_POST['total_amount'];
            $base  = $_POST['split_base'] !== '' ? (float)$_POST['split_base'] : $total;
            $stmt = db()->prepare(
              'INSERT INTO bills (settlement_id, category, period_start, period_end, total_amount, split_base, is_fixed, note)
               VALUES (?,?,?,?,?,?,?,?)');
            $stmt->execute([
                (int)$_POST['settlement_id'], trim($_POST['category']),
                $ps, $pe, $total, $base, $isFixed, trim($_POST['note'] ?? '')
            ]);
            $flash = '已新增帳單，分攤已自動計算。';
        }
    }

    if ($action === 'delete_bill') {
        db()->prepare('DELETE FROM bills WHERE id = ?')->execute([(int)$_POST['bill_id']]);
        $flash = '已刪除該筆帳單。';
    }

    if ($action === 'toggle_payment') {
        $sid = (int)$_POST['settlement_id'];
        $uid = (int)$_POST['user_id'];
        $new = $_POST['new_status'] === 'paid' ? 'paid' : 'unpaid';
        $paidDate = $new === 'paid' ? date('Y-m-d') : null;
        ensure_payment_rows($sid, $tenants);
        db()->prepare('UPDATE payments SET status=?, paid_date=?, updated_by=? WHERE settlement_id=? AND user_id=?')
            ->execute([$new, $paidDate, $user['display_name'], $sid, $uid]);
        $flash = '繳費狀態已更新。';
    }
}

$settlements = settlements_all();
$activeId = (int)($_GET['s'] ?? ($settlements[0]['id'] ?? 0));
$active = null;
foreach ($settlements as $s) if ((int)$s['id'] === $activeId) $active = $s;
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aries 管理後台</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header class="topbar admin">
    <div class="topbar-in">
      <div>
        <div class="t-title">Aries 管理後台</div>
        <div class="t-sub">內湖路一段 667 巷 7 號 5 樓</div>
      </div>
      <a class="link" href="logout.php">登出</a>
    </div>
  </header>

  <main class="wrap">
    <?php if ($flash): ?><div class="alert info"><?= h($flash) ?></div><?php endif; ?>

    <!-- 結算期選擇 -->
    <div class="settle-tabs">
      <?php foreach ($settlements as $s): ?>
        <a class="tab <?= (int)$s['id']===$activeId?'on':'' ?>" href="?s=<?= $s['id'] ?>"><?= h($s['name']) ?></a>
      <?php endforeach; ?>
      <button class="tab add" id="open-settle">＋ 新結算期</button>
    </div>

    <?php if ($active): $bills = bills_of($activeId); $due = tenant_due($activeId); ?>
      <section class="card">
        <h2><?= h($active['name']) ?>　<span class="muted">繳費期限 <?= roc($active['due_date']) ?></span></h2>

        <!-- 全戶總覽 -->
        <table class="admin-table">
          <thead><tr><th>項目</th><th>計費期間</th><th class="r">總額</th><th class="r">基礎</th><th class="r">A 室</th><th class="r">B 室</th><th class="r">Aries</th><th></th></tr></thead>
          <tbody>
          <?php foreach ($bills as $b): $c=$b['calc']; ?>
            <tr>
              <td><strong><?= h($b['category']) ?></strong><?= $b['note']?'<div class="note">※ '.h($b['note']).'</div>':'' ?></td>
              <td class="period"><?= $b['is_fixed']?'固定（雙月）':roc($b['period_start']).' ~ '.roc($b['period_end']) ?>
                <?php if(!$b['is_fixed'] && $c['days_after']>0): ?><div class="muted sm"><?= $c['days_before'] ?>+<?= $c['days_after'] ?> 天</div><?php endif; ?>
              </td>
              <td class="r"><?= number_format($b['total_amount']) ?></td>
              <td class="r"><?= number_format($b['split_base']) ?></td>
              <td class="r"><?= number_format($c['per_person']) ?></td>
              <td class="r"><?= number_format($c['per_person']) ?></td>
              <td class="r"><?= number_format($c['landlord_amount']) ?></td>
              <td class="r">
                <form method="post" onsubmit="return confirm('確定刪除這筆帳單？');" style="margin:0">
                  <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                  <input type="hidden" name="action" value="delete_bill">
                  <input type="hidden" name="bill_id" value="<?= $b['id'] ?>">
                  <button class="btn-x" title="刪除">✕</button>
                </form>
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
          <tfoot><tr><td colspan="4">每位房客本期應繳</td><td class="r total"><?= number_format($due) ?></td><td class="r total"><?= number_format($due) ?></td><td></td><td></td></tr></tfoot>
        </table>

        <!-- 繳費狀態 -->
        <h3>繳費狀態</h3>
        <div class="pay-grid">
          <?php foreach ($tenants as $t): $p = payment_for($activeId,(int)$t['id']); $paid = $p && $p['status']==='paid'; ?>
            <div class="pay-card <?= $paid?'is-paid':'' ?>">
              <div class="pc-room"><?= h($t['room']) ?> 室 · <?= h($t['display_name']) ?></div>
              <div class="pc-amt">NT$<?= number_format($due) ?></div>
              <div class="pc-status"><?= $paid ? '已繳 · '.roc($p['paid_date']) : '未繳' ?></div>
              <form method="post" style="margin:0">
                <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                <input type="hidden" name="action" value="toggle_payment">
                <input type="hidden" name="settlement_id" value="<?= $activeId ?>">
                <input type="hidden" name="user_id" value="<?= $t['id'] ?>">
                <input type="hidden" name="new_status" value="<?= $paid?'unpaid':'paid' ?>">
                <button class="btn <?= $paid?'':'btn-primary' ?> btn-block"><?= $paid?'改為未繳':'標記已繳' ?></button>
              </form>
            </div>
          <?php endforeach; ?>
        </div>
      </section>

      <!-- 新增帳單 -->
      <section class="card">
        <h3>新增帳單</h3>
        <form method="post" class="form grid2" id="bill-form">
          <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
          <input type="hidden" name="action" value="add_bill">
          <input type="hidden" name="settlement_id" value="<?= $activeId ?>">

          <label>項目
            <select name="category" id="f-cat">
              <option>電費</option><option>水費</option><option>天然氣</option><option>網路</option><option>其他</option>
            </select>
          </label>
          <label class="chk">
            <input type="checkbox" name="is_fixed" id="f-fixed"> 固定費（直接 ÷3，不依天數）
          </label>

          <label class="period-field">計費起日
            <input type="date" name="period_start" id="f-ps">
          </label>
          <label class="period-field">計費迄日
            <input type="date" name="period_end" id="f-pe">
          </label>

          <label>帳單總額（元）
            <input type="number" step="1" name="total_amount" id="f-total" required>
          </label>
          <label>分攤基礎（元，留空＝同總額）
            <input type="number" step="1" name="split_base" id="f-base">
          </label>

          <label class="full">備註（選填）
            <input type="text" name="note" placeholder="選填，特殊情況補充說明">
          </label>

          <div class="full preview" id="preview">輸入金額與期間後，這裡會即時試算每人應分。</div>
          <button type="submit" class="btn btn-primary full">新增並計算</button>
        </form>
      </section>
    <?php endif; ?>
  </main>

  <!-- 新結算期 -->
  <div class="modal" id="settle-modal" hidden>
    <div class="modal-card">
      <h3>新增結算期</h3>
      <form method="post" class="form">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
        <input type="hidden" name="action" value="create_settlement">
        <label>名稱<input type="text" name="name" placeholder="例：115年7–8月期" required></label>
        <label>繳費期限<input type="date" name="due_date" required></label>
        <label>備註<input type="text" name="note" placeholder="隨次月租金收取"></label>
        <div class="modal-actions">
          <button type="button" class="btn" id="close-settle">取消</button>
          <button type="submit" class="btn btn-primary">建立</button>
        </div>
      </form>
    </div>
  </div>

  <script>window.SPLIT_START = <?= json_encode(SPLIT_START) ?>;</script>
  <script src="assets/app.js"></script>
</body>
</html>
