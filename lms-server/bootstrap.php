<?php
declare(strict_types=1);
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/review.php';
require_once __DIR__ . '/access.php';
require_once __DIR__ . '/learning.php';
require_once __DIR__ . '/fee-migration.php';
require_once __DIR__ . '/lifecycle.php';

// Never initialize the legacy MySQL backend. Local account migrations preserve other identities/passwords.
function lmsStorage(): string {
    $path = getenv('THVP_LMS_DB') ?: ((lmsHosting()['driver'] ?? '') === 'mysql'
        ? dirname(__DIR__) . '/lms-private/lms-storage'
        : dirname(__DIR__, 2) . '/.thvp-lms/lms.sqlite');
    if (!preg_match('~^(?:[A-Za-z]:[/\\\\]|/)~', $path)) {
        throw new RuntimeException('SQLite path must be absolute.');
    }
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Cannot create private storage.');
    }
    $resolved = strtolower(str_replace('\\', '/', realpath($directory)));
    $public = strtolower(str_replace('\\', '/', realpath(dirname(__DIR__))));
    if (!lmsPrivatePathAllowed($directory)) {
        throw new RuntimeException('SQLite must be outside the public directory.');
    }
    if (is_link($path)) throw new RuntimeException('SQLite symlinks are not allowed.');
    return $path;
}

function lmsDB(string $path): PDO {
    if ((lmsHosting()['driver'] ?? '') === 'mysql') {
        $db = lmsMySQL();
        lmsExpireAccess($db);
        return $db;
    }
    $db = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 10
    ]);
    $db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');
    lmsInitFeeConstraints($db);
    lmsBeginWrite($db);
    try {
        $db->exec(file_get_contents(__DIR__ . '/migration.sql'));
        lmsInitAccounts($db);
        lmsInitReview($db);
        lmsInitAccess($db);
        $db->exec(file_get_contents(__DIR__.'/learning-migration.sql'));
        $db->exec(file_get_contents(__DIR__.'/resources-migration.sql'));
        lmsInitLifecycle($db);
        $db->prepare('INSERT OR IGNORE INTO lms_schema_migrations(name,applied_at) VALUES (?,?)')->execute(['classroom_resources_v1',time()]);
        $db->prepare('INSERT OR IGNORE INTO lms_schema_migrations(name,applied_at) VALUES (?,?)')->execute(['learning_content_v1',time()]);
        $seed = json_decode(file_get_contents(__DIR__ . '/classes.json'), true, 512, JSON_THROW_ON_ERROR);
        $stmt = $db->prepare('INSERT OR IGNORE INTO lms_classes
          (code,course_key,course_name,teacher,days,time,fee_vnd,capacity) VALUES (?,?,?,?,?,?,?,99)');
        foreach ($seed as $row) $stmt->execute([...array_values($row),$row['course_key']==='nang-cao'?2500000:1500000]);
        if (!$db->query("SELECT 1 FROM lms_schema_migrations WHERE name='advanced_fee_2500000_v1'")->fetchColumn()) {
            $db->exec("UPDATE lms_classes SET fee_vnd=2500000 WHERE code IN ('NC-01','NC-02','NC-03')");
            $db->prepare('INSERT INTO lms_schema_migrations(name,applied_at) VALUES (?,?)')->execute(['advanced_fee_2500000_v1',time()]);
        }
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');
        throw $e;
    }
    return $db;
}

function lmsOccupancy(PDO $db, string $code, int $now): array {
    $stmt = $db->prepare('SELECT COUNT(*) FROM lms_enrollments WHERE class_code=? AND active=1');
    $stmt->execute([$code]);
    $active = (int)$stmt->fetchColumn();
    $stmt = $db->prepare("SELECT COUNT(*) FROM lms_registrations WHERE class_code=? AND cycle_id=?
      AND (status='pending_review' OR (status='pending_payment' AND expires_at>?))");
    $stmt->execute([$code, (int)lmsLifecycle($db,$code)['cycle_id'], $now]);
    return [$active, (int)$stmt->fetchColumn()];
}

function lmsClass(PDO $db, array $row, int $now): array {
    [$active, $holds] = lmsOccupancy($db, $row['code'], $now);
    $remaining = max(0, (int)$row['capacity'] - $active - $holds);
    $state = !(int)$row['registration_open'] ? 'closed' :
      ($active >= (int)$row['capacity'] ? 'full' : ($remaining === 0 ? 'held_full' : 'open'));
    return array_merge($row, ['active_students' => $active, 'valid_holds' => $holds,
      'remaining' => $remaining, 'availability' => $state]);
}

function lmsStatusLabel(string $status): string {
    $labels = ['pending_payment' => 'Chưa xác nhận thanh toán', 'pending_review' => 'Chờ đối chiếu thanh toán',
      'late_review' => 'Minh chứng nộp muộn — chờ kiểm tra', 'expired' => 'Đã hết hạn giữ chỗ — chưa xác nhận thanh toán',
      'cancelled' => 'Hồ sơ đã hủy', 'enrolled' => 'Hồ sơ đã được ghi danh',
      'approved_waiting_access' => 'Đã duyệt — chờ cấp quyền học',
      'needs_more' => 'Yêu cầu bổ sung minh chứng', 'rejected' => 'Hồ sơ bị từ chối'];
    return $labels[$status] ?? $status;
}

function lmsRegistration(array $row): array {
    $snapshot = json_decode($row['class_snapshot'], true, 512, JSON_THROW_ON_ERROR);
    $ref = 'DK' . str_pad((string)$row['id'], 6, '0', STR_PAD_LEFT);
    $expired = $row['status'] === 'pending_payment' && (int)$row['expires_at'] <= time();
    // Preserve the existing CHECK constraint and IDs. Expired + proof timestamp is a durable late-review state.
    $status = $row['status'] === 'expired' && $row['proof_submitted_at'] !== null ? 'late_review' : ($expired ? 'expired' : $row['status']);
    $status = $row['review_status'] ?? $status;
    return ['reference' => $ref, 'class' => $snapshot, 'fee_vnd' => (int)$row['fee_vnd'],
      'fullname' => $row['fullname'], 'phone' => $row['phone'], 'email' => $row['email'],
      'transfer_content' => $row['class_code'] . ' ' . $ref,
      'expires_at' => gmdate('c', (int)$row['expires_at']),
      'status' => $status, 'status_label' => lmsStatusLabel($status),
      'hold_reserved' => lmsHasHold($row, time()),
      'public_reason' => in_array($status, ['needs_more','rejected'], true) ? ($row['review_reason'] ?? null) : null,
      'payment_confirmed' => in_array($status,['approved_waiting_access','enrolled'],true)];
}

// Call within a write transaction; callers commit the budget even if the request is rejected.
function lmsRateLimited(PDO $db, string $ownerHash, int $now, string $scope = '',int $ownerLimit=10,int $ipLimit=60): bool {
    $limited = false;
    foreach ([$scope . 'guest:' . $ownerHash => $ownerLimit, $scope . 'ip:' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '') => $ipLimit] as $rateKey => $limit) {
        $db->prepare(lmsIsMySQL($db)
          ? 'INSERT INTO lms_rate_limits(`key`,window_start,attempts) VALUES (?,?,1)
             ON DUPLICATE KEY UPDATE attempts=CASE WHEN window_start<=? THEN 1 ELSE attempts+1 END,
             window_start=CASE WHEN window_start<=? THEN VALUES(window_start) ELSE window_start END'
          : 'INSERT INTO lms_rate_limits(key,window_start,attempts) VALUES (?,?,1)
             ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<=? THEN 1 ELSE attempts+1 END,
             window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END')
          ->execute([$rateKey, $now, $now - 60, $now - 60]);
        $stmt = $db->prepare('SELECT attempts FROM lms_rate_limits WHERE `key`=?');
        $stmt->execute([$rateKey]);
        if ((int)$stmt->fetchColumn() > $limit) $limited = true;
    }
    return $limited;
}
