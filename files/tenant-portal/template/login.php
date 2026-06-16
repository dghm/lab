<?php
require_once __DIR__ . '/functions.php';

if (current_user()) { header('Location: index.php'); exit; }

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_csrf();
    $u = trim($_POST['username'] ?? '');
    $p = $_POST['password'] ?? '';
    if (attempt_login($u, $p)) {
        header('Location: index.php');
        exit;
    }
    $error = '帳號或密碼錯誤';
}
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>公寓費用分攤 · 登入</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body class="login-bg">
  <main class="login-card">
    <div class="brand">
      <img class="brand-logo" src="assets/logo.png" alt="公寓費用分攤">
      <h1>公寓費用分攤</h1>
      <p class="sub">內湖路一段 667 巷 7 號 5 樓</p>
    </div>

    <?php if ($error): ?>
      <div class="alert"><?= h($error) ?></div>
    <?php endif; ?>

    <form method="post" class="form" autocomplete="off">
      <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
      <label>房號 / 帳號
        <input type="text" name="username" placeholder="a、b 或 admin" required autofocus>
      </label>
      <label>密碼
        <input type="password" name="password" required>
      </label>
      <button type="submit" class="btn btn-primary btn-block">登入</button>
    </form>

    <p class="hint">A 室、B 室房客請輸入房號（a / b）登入查詢自己的帳單。</p>
  </main>
</body>
</html>
