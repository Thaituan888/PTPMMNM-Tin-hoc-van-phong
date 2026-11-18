<?php
declare(strict_types=1);

// Additive migration: keep the original status CHECK, IDs, snapshots and evidence intact.
function lmsInitReview(PDO $db): void {
    $columns = array_column($db->query('PRAGMA table_info(lms_registrations)')->fetchAll(), 'name');
    foreach ([
      'review_status' => "TEXT DEFAULT NULL CHECK(review_status IN ('approved_waiting_access','needs_more','rejected'))",
      'review_version' => 'INTEGER NOT NULL DEFAULT 0',
      'review_reason' => 'TEXT DEFAULT NULL'
    ] as $name => $definition) {
        if (!in_array($name, $columns, true)) $db->exec("ALTER TABLE lms_registrations ADD COLUMN $name $definition");
    }
    $db->exec(file_get_contents(__DIR__ . '/review-migration.sql'));
    if (!in_array('manual_confirmation',array_column($db->query('PRAGMA table_info(lms_review_history)')->fetchAll(),'name'),true)) {
        $db->exec(file_get_contents(__DIR__.'/review-simple-migration.sql'));
    }
    $db->prepare('INSERT OR IGNORE INTO lms_schema_migrations(name,applied_at) VALUES (?,?)')
      ->execute(['registration_review_v1', time()]);
}

function lmsHasHold(array $row, int $now): bool {
    if(($row['_admission_open']??true)===false)return false;
    return $row['status'] === 'pending_review' || ($row['status'] === 'pending_payment' && (int)$row['expires_at'] > $now);
}
function lmsCanSubmitEvidence(array $row): bool {
    return !in_array($row['review_status'] ?? null, ['approved_waiting_access','rejected'], true)
      && in_array($row['status'], ['pending_payment','pending_review','expired'], true);
}
function lmsReviewHistory(PDO $db, int $id): array {
    $stmt = $db->prepare('SELECT actor_username,actor_name,decision,before_status,after_status,notes,public_reason,
      received_vnd,bank_transaction,manual_confirmation,created_at,from_version,to_version FROM lms_review_history WHERE registration_id=? ORDER BY id DESC');
    $stmt->execute([$id]);
    return array_map(function ($row) {
        $row['created_at'] = gmdate('c', (int)$row['created_at']);
        $row['before_status_label'] = lmsStatusLabel($row['before_status']);
        $row['after_status_label'] = lmsStatusLabel($row['after_status']);
        return $row;
    }, $stmt->fetchAll());
}

final class LmsReviewError extends RuntimeException {
    public function __construct(public int $httpStatus, string $message) { parent::__construct($message); }
}
function lmsReviewError(int $status, string $message): never { throw new LmsReviewError($status, $message); }

function lmsReviewText(array $body, string $field, int $max): string {
    $value = $body[$field] ?? '';
    if (!is_string($value) || !mb_check_encoding($value, 'UTF-8') || mb_strlen($value) > $max ||
      preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $value)) lmsReviewError(422, 'Nội dung nhập không hợp lệ hoặc quá dài.');
    return preg_replace('/^\s+|\s+$/u', '', $value);
}

function lmsReviewDecision(PDO $db, array $actor, array $body, string $key): array {
    if (!preg_match('/^[a-zA-Z0-9_-]{32,128}$/D', $key)) lmsReviewError(422, 'Mã yêu cầu xử lý không hợp lệ.');
    $ref = $body['reference'] ?? '';
    $version = $body['version'] ?? null;
    $decision = $body['decision'] ?? '';
    if (!is_string($ref) || !preg_match('/^DK[0-9]{6,19}$/D', $ref) || !is_int($version) || $version < 0 ||
      !in_array($decision, ['approve','request_more','reject'], true)) lmsReviewError(422, 'Thông tin xử lý hồ sơ không hợp lệ.');
    $reason = lmsReviewText($body, 'reason', 2000);
    $notes = lmsReviewText($body, 'notes', 2000);
    $tx = strtoupper(lmsReviewText($body, 'bank_transaction', 100));
    $amount = $body['received_vnd'] ?? null;
    if ($decision !== 'approve' && $reason === '') lmsReviewError(422, 'Vui lòng nhập lý do gửi cho người đăng ký.');
    $manual=$decision==='approve'&&!array_key_exists('received_vnd',$body)&&!array_key_exists('bank_transaction',$body);
    if ($decision === 'approve' && (($body['funds_verified'] ?? false) !== true || (!$manual&&(!is_int($amount) ||
      !preg_match('/^[A-Z0-9][A-Z0-9._\/-]{0,99}$/D', $tx))))) {
        lmsReviewError(422, 'Phải xác nhận đã kiểm tra tiền thực nhận, nhập số tiền nguyên VND và mã giao dịch ngân hàng hợp lệ.');
    }
    $payloadHash = hash('sha256', json_encode([$ref,$version,$decision,$reason,$notes,$tx,$amount,$body['funds_verified'] ?? false], JSON_UNESCAPED_UNICODE));
    $requestHash = hash('sha256', $actor['id'] . ':' . $key);
    $id = filter_var(ltrim(substr($ref, 2), '0'), FILTER_VALIDATE_INT, ['options'=>['min_range'=>1]]);
    lmsBeginWrite($db);
    try {
        // Recheck privileges under the same write lock as the decision (a concurrent demotion wins).
        $check = $db->prepare("SELECT 1 FROM users WHERE id=? AND active=1 AND role='admin'");
        $check->execute([$actor['id']]);
        if (!$check->fetchColumn()) lmsReviewError(403, 'Tài khoản không còn quyền quản trị.');
        $stmt = $db->prepare('SELECT * FROM lms_registrations WHERE id=?');$stmt->execute([$id ?: 0]);$row = $stmt->fetch();
        if (!$row || lmsRegistration($row)['reference'] !== $ref) lmsReviewError(404, 'Không tìm thấy hồ sơ.');
        $stmt = $db->prepare('SELECT * FROM lms_review_history WHERE request_hash=?');$stmt->execute([$requestHash]);$existing = $stmt->fetch();
        if ($existing) {
            if (!hash_equals($existing['payload_hash'], $payloadHash) || (int)$existing['to_version'] !== (int)$row['review_version']) {
                lmsReviewError(409, 'Yêu cầu cũ đã được xử lý hoặc hồ sơ đã thay đổi. Vui lòng mở lại chi tiết.');
            }
            $db->exec('COMMIT');
            return ['registration'=>lmsRegistration($row), 'replayed'=>true];
        }
        if ((int)$row['review_version'] !== $version) lmsReviewError(409, 'Hồ sơ đã thay đổi. Vui lòng mở lại chi tiết trước khi xử lý.');
        $before = lmsRegistration($row)['status'];
        if (in_array($before, ['approved_waiting_access','rejected','cancelled','enrolled'], true)) lmsReviewError(409, 'Hồ sơ đã có quyết định cuối cùng; không thể ghi đè.');
        $now = time();$receiverKey = null;
        $rawStatus = $row['status'];
        $after = ['approve'=>'approved_waiting_access','request_more'=>'needs_more','reject'=>'rejected'][$decision];
        if ($decision === 'approve') {
            if(!lmsLifecycleAdmission($db,$row))lmsReviewError(409,'Hồ sơ thuộc đợt học đã kết thúc; không thể duyệt vào đợt mới.');
            if ($manual){$amount=(int)$row['fee_vnd'];$tx=null;}
            if (!in_array($before, ['pending_review','late_review'], true) || $row['proof_submitted_at'] === null) {
                lmsReviewError(409, 'Chỉ duyệt hồ sơ có minh chứng đang chờ đối chiếu. Hồ sơ yêu cầu bổ sung cần được nộp ảnh mới trước.');
            }
            if ($amount !== (int)$row['fee_vnd']) lmsReviewError(422, 'Số tiền thực nhận phải khớp học phí đã lưu của hồ sơ.');
            $stmt = $db->prepare('SELECT * FROM lms_payments WHERE registration_id=?');$stmt->execute([$id]);$bank = $stmt->fetch();
            if (!$bank) lmsReviewError(409, 'Hồ sơ chưa có tài khoản nhận tiền đã lưu để đối chiếu.');
            $receiverKey = hash('sha256', $bank['bank_bin'] . ':' . strtoupper($bank['account_number']));
            $stmt = $db->prepare("SELECT 1 FROM lms_review_history WHERE receiver_key=? AND bank_transaction=? AND decision='approve'");
            $stmt->execute([$receiverKey,$tx]);
            if ($stmt->fetchColumn()) lmsReviewError(409, 'Giao dịch ngân hàng này đã được dùng để duyệt hồ sơ khác trên cùng tài khoản nhận tiền.');
            $stmt = $db->prepare('SELECT * FROM lms_classes WHERE code=?');$stmt->execute([$row['class_code']]);$class = $stmt->fetch();
            if (!$class || !(int)$class['registration_open']) lmsReviewError(409, 'Lớp đang đóng; chưa thể duyệt hồ sơ.');
            [$active,$holds] = lmsOccupancy($db, $row['class_code'], $now);
            $required = lmsHasHold($row, $now) ? 0 : 1;
            if ($active + $holds + $required > (int)$class['capacity']) lmsReviewError(409, 'Lớp đã hết chỗ. Hồ sơ nộp muộn chưa thể được duyệt.');
            $stmt = $db->prepare("SELECT 1 FROM lms_registrations WHERE class_code=? AND email=? AND id<>? AND cycle_id=? AND
              (status='pending_review' OR (status='pending_payment' AND expires_at>?))
              UNION ALL SELECT 1 FROM lms_enrollments WHERE class_code=? AND email=? AND active=1 LIMIT 1");
            $stmt->execute([$row['class_code'],$row['email'],$id,$row['cycle_id'],$now,$row['class_code'],$row['email']]);
            if ($stmt->fetchColumn()) lmsReviewError(409, 'Email này đã có chỗ giữ hoặc ghi danh khác trong lớp.');
            // Free only genuinely expired unpaid holds so the existing partial email index stays correct.
            $db->prepare("UPDATE lms_registrations SET status='expired' WHERE class_code=? AND status='pending_payment' AND expires_at<=?")
              ->execute([$row['class_code'],$now]);
            $rawStatus = 'pending_review'; // Reserved, but no active enrollment is created.
        } elseif ($decision === 'reject') {
            $rawStatus = 'cancelled';
        } else {
            $rawStatus = lmsHasHold($row, $now) ? 'pending_review' : 'expired';
        }
        $db->prepare('UPDATE lms_registrations SET status=?,review_status=?,review_reason=?,review_version=review_version+1 WHERE id=? AND review_version=?')
          ->execute([$rawStatus,$after,$decision === 'approve' ? null : $reason,$id,$version]);
        $db->prepare('INSERT INTO lms_review_history (registration_id,actor_id,actor_username,actor_name,decision,before_status,after_status,
          notes,public_reason,received_vnd,bank_transaction,receiver_key,created_at,from_version,to_version,request_hash,payload_hash,manual_confirmation)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$id,$actor['id'],$actor['username'],$actor['fullname'],$decision,$before,$after,
            $notes,$decision === 'approve' ? null : $reason,$decision === 'approve' ? $amount : null,
            $decision === 'approve' ? $tx : null,$receiverKey,$now,$version,$version+1,$requestHash,$payloadHash,$manual?1:0]);
        $stmt = $db->prepare('SELECT * FROM lms_registrations WHERE id=?');$stmt->execute([$id]);$result = lmsRegistration($stmt->fetch());
        $db->exec('COMMIT');
        return ['registration'=>$result, 'replayed'=>false];
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');throw $e;
    }
}
