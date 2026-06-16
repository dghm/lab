<?php
require_once __DIR__ . '/db.php';

/* ============ 認證與權限 ============ */

function current_user(): ?array {
    return $_SESSION['user'] ?? null;
}

function require_login(): array {
    $u = current_user();
    if (!$u) { header('Location: login.php'); exit; }
    return $u;
}

function require_admin(): array {
    $u = require_login();
    if ($u['role'] !== 'admin') { http_response_code(403); exit('禁止存取'); }
    return $u;
}

function attempt_login(string $username, string $password): bool {
    $stmt = db()->prepare('SELECT * FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($password, $row['password_hash'])) {
        return false;
    }
    // 防 session fixation：登入成功後重生 session id
    session_regenerate_id(true);
    $_SESSION['user'] = [
        'id'   => (int)$row['id'],
        'username'     => $row['username'],
        'role'         => $row['role'],
        'room'         => $row['room'],
        'display_name' => $row['display_name'],
    ];
    return true;
}

function logout(): void {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

function change_password(int $userId, string $old, string $new): bool {
    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($old, $row['password_hash'])) return false;
    if (strlen($new) < 6) return false;
    $hash = password_hash($new, PASSWORD_DEFAULT);
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $userId]);
    return true;
}

/* ============ CSRF ============ */

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function check_csrf(): void {
    $t = $_POST['csrf'] ?? '';
    if (!hash_equals($_SESSION['csrf'] ?? '', $t)) {
        http_response_code(400);
        exit('CSRF 驗證失敗，請重新整理頁面再試。');
    }
}

/* ============ 顯示用小工具 ============ */

function h(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

// 格式化日期 yyyy-mm-dd → 26/5/1（西元年取末兩位）
function roc(?string $ymd): string {
    if (!$ymd) return '—';
    [$y, $m, $d] = explode('-', $ymd);
    return substr($y, -2) . '/' . (int)$m . '/' . (int)$d;
}

/* ============ 核心：費用分攤自動計算 ============ */
/*
   規則：
   - 分攤起始日 SPLIT_START（民國 115/5/1）
   - 帳單期間全在起始日前：房東全額自付，房客 0
   - 全在起始日後：分攤基礎 ÷ 3
   - 跨越起始日：依天數比例拆分
       後段金額 = 分攤基礎 × (後段天數 ÷ 總天數)
       每人應分 = round(後段金額 ÷ 3)   ← 四捨五入
   - 固定費（is_fixed=1，如網路）：分攤基礎 ÷ 3，不做天數拆分
   - 房東負擔 = 帳單總額 − 房客 A − 房客 B（含工料費等不分攤部分）
   - 天數採「起訖日皆計入」（inclusive）
*/
function inclusive_days(string $start, string $end): int {
    $s = new DateTime($start);
    $e = new DateTime($end);
    return $s->diff($e)->days + 1;
}

function compute_split(array $b): array {
    $base  = (float)$b['split_base'];
    $total = (float)$b['total_amount'];

    if (!empty($b['is_fixed'])) {
        $per = (int)round($base / 3);
        return [
            'is_fixed'        => true,
            'total_days'      => null,
            'days_before'     => null,
            'days_after'      => null,
            'back_amount'     => round($base),
            'per_person'      => $per,
            'landlord_amount' => (int)round($total) - 2 * $per,
        ];
    }

    $total_days = inclusive_days($b['period_start'], $b['period_end']);
    $split = new DateTime(SPLIT_START);
    $s = new DateTime($b['period_start']);
    $e = new DateTime($b['period_end']);

    if ($e < $split) {
        $days_after = 0;
    } elseif ($s >= $split) {
        $days_after = $total_days;
    } else {
        $days_after = $split->diff($e)->days + 1;   // 5/1 ~ 期末，inclusive
    }
    $days_before = $total_days - $days_after;

    $back_amount = $base * $days_after / $total_days;
    $per = (int)round($back_amount / 3);

    return [
        'is_fixed'        => false,
        'total_days'      => $total_days,
        'days_before'     => $days_before,
        'days_after'      => $days_after,
        'back_amount'     => round($back_amount),
        'per_person'      => $per,
        'landlord_amount' => (int)round($total) - 2 * $per,
    ];
}

/* 取一個結算期的所有帳單（含計算結果） */
function bills_of(int $settlementId): array {
    $stmt = db()->prepare('SELECT * FROM bills WHERE settlement_id = ? ORDER BY is_fixed, id');
    $stmt->execute([$settlementId]);
    $out = [];
    foreach ($stmt->fetchAll() as $b) {
        $b['calc'] = compute_split($b);
        $out[] = $b;
    }
    return $out;
}

/* 一個結算期、單一房客的應繳總額 */
function tenant_due(int $settlementId): int {
    $sum = 0;
    foreach (bills_of($settlementId) as $b) $sum += $b['calc']['per_person'];
    return $sum;
}

function settlements_all(): array {
    return db()->query('SELECT * FROM settlements ORDER BY due_date DESC, id DESC')->fetchAll();
}

function payment_for(int $settlementId, int $userId): ?array {
    $stmt = db()->prepare('SELECT * FROM payments WHERE settlement_id = ? AND user_id = ?');
    $stmt->execute([$settlementId, $userId]);
    return $stmt->fetch() ?: null;
}

/* ============ 帳單附件 ============ */

const BILL_UPLOAD_DIR = __DIR__ . '/uploads/bills';

// 副檔名 → 允許的 MIME（白名單，存檔與輸出皆用此表）
const BILL_UPLOAD_ALLOWED = [
    'pdf'  => 'application/pdf',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png'  => 'image/png',
];

// 儲存上傳的帳單附件（$_FILES['attachment']），回傳存檔檔名；未上傳或驗證失敗回 null
function save_bill_attachment(array $file): ?string {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if ($file['error'] !== UPLOAD_ERR_OK) return null;
    if (!is_uploaded_file($file['tmp_name'])) return null;

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!isset(BILL_UPLOAD_ALLOWED[$ext])) return null;

    // 用實際內容的 MIME 再驗證一次，避免只改副檔名就上傳偽裝檔案
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime  = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    if ($mime !== BILL_UPLOAD_ALLOWED[$ext]) return null;

    if (!is_dir(BILL_UPLOAD_DIR)) mkdir(BILL_UPLOAD_DIR, 0755, true);

    $name = 'bill_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], BILL_UPLOAD_DIR . '/' . $name)) return null;
    return $name;
}

// 刪除帳單附件實體檔案（找不到就略過，不視為錯誤）
function delete_bill_attachment(?string $filename): void {
    if (!$filename) return;
    $path = BILL_UPLOAD_DIR . '/' . basename($filename);
    if (is_file($path)) unlink($path);
}

// 依副檔名判斷顯示方式：pdf → iframe／image → img／其他或無附件 → null
function attachment_kind(?string $filename): ?string {
    if (!$filename) return null;
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    if ($ext === 'pdf') return 'pdf';
    if (in_array($ext, ['jpg', 'jpeg', 'png'], true)) return 'image';
    return null;
}
