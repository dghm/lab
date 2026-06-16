<?php
/* 帳單附件輸出
   全戶共同分攤、無須區分房客，僅檢查已登入即可（房客或 admin 皆可）。
   實際檔案存於 uploads/bills/（.htaccess 已擋直接存取），一律經本檔驗證後讀取。 */
require_once __DIR__ . '/functions.php';
require_login();

$id = (int)($_GET['id'] ?? 0);

$stmt = db()->prepare('SELECT attachment_path FROM bills WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();

if (!$row || !$row['attachment_path']) {
    http_response_code(404);
    exit('找不到附件。');
}

$filename = $row['attachment_path'];
$path = BILL_UPLOAD_DIR . '/' . basename($filename);
if (!is_file($path)) {
    http_response_code(404);
    exit('找不到附件。');
}

$ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$mime = BILL_UPLOAD_ALLOWED[$ext] ?? 'application/octet-stream';

header('Content-Type: ' . $mime);
header('Content-Disposition: inline; filename="' . $filename . '"');
header('Content-Length: ' . filesize($path));
header('Cache-Control: private, max-age=600');
header('X-Content-Type-Options: nosniff');
readfile($path);
