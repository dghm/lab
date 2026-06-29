<?php
/* PDO 連線與安全 session 啟動 */
require_once __DIR__ . '/config.php';

// ---- 安全 session ----
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => COOKIE_SECURE,   // 僅 HTTPS 傳送
        'httponly' => true,            // JS 無法讀取 cookie，防 XSS 竊取
        'samesite' => 'Lax',           // 防 CSRF
    ]);
    session_start();
}

// ---- PDO ----
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,   // 真 prepared statements，防 SQL injection
        ]);
    }
    return $pdo;
}
