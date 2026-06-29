<?php
require_once __DIR__ . '/functions.php';
$user = require_login();
if ($user['role'] === 'admin') { header('Location: admin.php'); exit; }

// 處理修改密碼
$pwMsg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'pw') {
    check_csrf();
    $ok = change_password($user['id'], $_POST['old'] ?? '', $_POST['new'] ?? '');
    $pwMsg = $ok ? '密碼已更新。' : '舊密碼錯誤，或新密碼少於 6 碼。';
}

$settlements = settlements_all();

// 選定要顯示的結算期（期間選擇器；預設最新一期）
$activeId = (int)($_GET['s'] ?? ($settlements[0]['id'] ?? 0));
$active = null;
foreach ($settlements as $s) if ((int)$s['id'] === $activeId) $active = $s;
if (!$active && $settlements) { $active = $settlements[0]; $activeId = (int)$active['id']; }

function status_badge(?array $pay): string {
    $paid = $pay && $pay['status'] === 'paid';
    $cls = $paid ? 'badge-paid' : 'badge-unpaid';
    $txt = $paid ? '已繳' : '未繳';
    return "<span class=\"badge $cls\">$txt</span>";
}

// 卡片內的算式明細
function bill_detail_html(array $b): string {
    $c = $b['calc'];
    if ($b['is_fixed']) {
        $s = '分攤基礎 NT$' . number_format($b['split_base']) . ' ÷ 3 人 = NT$' . $c['per_person'];
    } elseif ($c['days_after'] == 0) {
        $s = '全期在分攤起始日（2026/5/1）前 → Aries 全額自付，房客不分攤。';
    } else {
        $s = '分攤基礎 NT$' . number_format($b['split_base']) . '，總 ' . $c['total_days']
           . ' 天（前段 ' . $c['days_before'] . ' 天 Aries 自付、後段 ' . $c['days_after'] . ' 天均分）<br>'
           . '後段 = ' . (int)$b['split_base'] . ' × (' . $c['days_after'] . ' ÷ ' . $c['total_days']
           . ') = NT$' . number_format($c['back_amount']) . '，每人 = ' . number_format($c['back_amount'])
           . ' ÷ 3 = <b>NT$' . $c['per_person'] . '</b>';
    }
    if (!empty($b['note'])) $s .= '<div class="note">※ ' . h($b['note']) . '</div>';
    return $s;
}
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>我的費用 · <?= h($user['display_name']) ?></title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header class="topbar">
    <div class="topbar-in">
      <div>
        <div class="t-title">我的費用</div>
        <div class="t-sub"><?= h($user['room']) ?> 室 · <?= h($user['display_name']) ?></div>
      </div>
      <nav>
        <button class="link" id="open-pw">修改密碼</button>
        <a class="link" href="logout.php">登出</a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <?php if ($pwMsg): ?><div class="alert info"><?= h($pwMsg) ?></div><?php endif; ?>

    <?php if (!$active): ?>
      <p class="empty">目前尚無帳單。</p>
    <?php else:
      $due   = tenant_due($activeId);
      $pay   = payment_for($activeId, (int)$user['id']);
      $bills = bills_of($activeId);
      $paid  = $pay && $pay['status'] === 'paid';
    ?>

      <!-- 期間選擇器（名字下方、費用上方）-->
      <div class="period-picker">
        <label for="period-sel">查詢期間</label>
        <select id="period-sel" data-base="index.php">
          <?php foreach ($settlements as $s): ?>
            <option value="<?= (int)$s['id'] ?>" <?= (int)$s['id']===$activeId?'selected':'' ?>>
              <?= h($s['name']) ?>
            </option>
          <?php endforeach; ?>
        </select>
      </div>

      <!-- 本期應繳大數字 -->
      <div class="hero <?= $paid?'is-paid':'' ?>">
        <div class="hero-label">本期應繳合計　<?= status_badge($pay) ?></div>
        <div class="hero-amt-row">
          <div class="hero-amt">NT$<?= number_format($due) ?></div>
          <?php if ($paid): ?><img class="hero-thanks" src="assets/thankyou.png" alt="Thank you"><?php endif; ?>
        </div>
        <div class="hero-due">繳費期限 <?= roc($active['due_date']) ?></div>
      </div>

      <!-- 2×2 費用卡片 -->
      <div class="fgrid">
        <?php foreach ($bills as $b): $c = $b['calc']; ?>
          <details class="fcard">
            <summary>
              <div class="fc-amt">NT$<?= number_format($c['per_person']) ?></div>
              <div class="fc-cat"><?= h($b['category']) ?></div>
              <div class="fc-period"><?= $b['is_fixed'] ? '固定費（雙月）' : roc($b['period_start']).'～'.roc($b['period_end']) ?></div>
              <span class="fc-more">明細 ▾</span>
            </summary>
            <div class="fc-detail"><?= bill_detail_html($b) ?></div>
          </details>
        <?php endforeach; ?>
      </div>

      <!-- 繳費資訊 -->
      <?php if ($paid): ?>
        <div class="paid-line">✓ 已於 <?= roc($pay['paid_date']) ?> 完成繳費</div>
      <?php else: ?>
        <div class="pay-box">
          <div class="pay-title">繳費方式（匯款）</div>
          <div class="pay-row"><span>銀行</span><b><?= h(BANK_NAME) ?></b></div>
          <div class="pay-row"><span>戶名</span><b><?= h(BANK_PAYEE) ?></b></div>
          <div class="pay-row"><span>帳號</span><b><?= h(BANK_ACCT) ?></b><button class="btn-copy" data-copy="<?= h(BANK_ACCT) ?>">複製</button></div>
          <div class="pay-row"><span>金額</span><b>NT$<?= number_format($due) ?></b><button class="btn-copy" data-copy="<?= $due ?>">複製</button></div>
          <div class="pay-hint">匯款後由 Aries 確認到帳，狀態會更新為「已繳」。</div>
        </div>
      <?php endif; ?>

    <?php endif; ?>
  </main>

  <!-- 修改密碼 -->
  <div class="modal" id="pw-modal" hidden>
    <div class="modal-card">
      <h3>修改密碼</h3>
      <?php if ($pwMsg): ?><div class="alert info"><?= h($pwMsg) ?></div><?php endif; ?>
      <form method="post" class="form">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
        <input type="hidden" name="action" value="pw">
        <label>舊密碼<input type="password" name="old" required></label>
        <label>新密碼（至少 6 碼）<input type="password" name="new" required minlength="6"></label>
        <div class="modal-actions">
          <button type="button" class="btn" id="close-pw">取消</button>
          <button type="submit" class="btn btn-primary">更新</button>
        </div>
      </form>
    </div>
  </div>

  <script src="assets/app.js"></script>
</body>
</html>
