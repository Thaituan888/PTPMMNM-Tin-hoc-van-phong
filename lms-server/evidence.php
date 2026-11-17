<?php
declare(strict_types=1);

const LMS_EVIDENCE_MAX = 5 * 1024 * 1024;

final class LmsEvidenceError extends RuntimeException {
    public function __construct(public int $httpStatus, string $message) { parent::__construct($message); }
}
function lmsEvidenceError(int $status, string $message): never { throw new LmsEvidenceError($status, $message); }

function lmsIniBytes(string $value): int {
    $value = trim($value);
    $number = (int)$value;
    return match (strtolower(substr($value, -1))) {
        'g' => $number * 1024 ** 3, 'm' => $number * 1024 ** 2, 'k' => $number * 1024, default => $number
    };
}
function lmsEvidenceSettings(): array {
    $issue = null;
    if (!function_exists('imagecreatefromstring')) $issue = 'PHP chưa bật GD để kiểm tra ảnh. Cần khởi động lại máy chủ bằng start-local.ps1 mới.';
    elseif (lmsIniBytes(ini_get('upload_max_filesize')) < LMS_EVIDENCE_MAX ||
        (lmsIniBytes(ini_get('post_max_size')) > 0 && lmsIniBytes(ini_get('post_max_size')) < LMS_EVIDENCE_MAX + 65536)) {
        $issue = 'Giới hạn upload PHP chưa đủ cho ảnh 5 MB. Cần upload_max_filesize tối thiểu 5M và post_max_size tối thiểu 6M.';
    }
    return ['max_bytes' => LMS_EVIDENCE_MAX, 'upload_available' => $issue === null, 'configuration_error' => $issue];
}
function lmsEvidenceDirectory(string $dbPath): string {
    $directory = getenv('THVP_LMS_EVIDENCE_DIR') ?: dirname($dbPath) . '/evidence';
    if (!preg_match('~^(?:[A-Za-z]:[/\\\\]|/)~', $directory)) throw new RuntimeException('Private evidence path must be absolute.');
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Private storage unavailable.');
    $resolved = strtolower(str_replace('\\', '/', realpath($directory)));
    $public = strtolower(str_replace('\\', '/', realpath(dirname(__DIR__))));
    if (is_link($directory) || $resolved === $public || str_starts_with($resolved, $public . '/')) throw new RuntimeException('Evidence storage must be outside webroot.');
    return $directory;
}
function lmsEvidenceFile(string $dbPath, string $key): string {
    if (!preg_match('/^[a-f0-9]{64}\.(jpg|png)$/D', $key)) throw new RuntimeException('Invalid storage key.');
    $file = lmsEvidenceDirectory($dbPath) . '/' . $key;
    if (is_link($file)) throw new RuntimeException('Invalid evidence file.');
    return $file;
}
function lmsEvidenceData(array $row, string $classCode): array {
    return ['id' => (int)$row['id'], 'mime' => $row['mime'], 'size_bytes' => (int)$row['size_bytes'],
      'submitted_at' => gmdate('c', (int)$row['submitted_at']), 'timeliness' => $row['timeliness'],
      'image_url' => 'lms-api.php?action=evidence_image&class_code=' . rawurlencode($classCode) . '&id=' . (int)$row['id']];
}
function lmsEvidenceList(PDO $db, array $registration): array {
    $stmt = $db->prepare('SELECT * FROM lms_evidence WHERE registration_id=? ORDER BY id DESC');
    $stmt->execute([$registration['id']]);
    return array_map(fn($r) => lmsEvidenceData($r, $registration['class_code']), $stmt->fetchAll());
}

function lmsStoreEvidence(PDO $db, string $dbPath, array $registration, string $ownerHash): array {
    if (!lmsCanSubmitEvidence($registration)) lmsEvidenceError(409, 'Hồ sơ đã có quyết định cuối cùng, không nhận thêm minh chứng.');
    $key = $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '';
    if (!preg_match('/^[a-zA-Z0-9_-]{32,128}$/D', $key)) lmsEvidenceError(422, 'Mã yêu cầu tải ảnh không hợp lệ.');
    $requestHash = hash('sha256', $key);
    $file = $_FILES['image'] ?? null;
    $sourceHash = null;
    if (is_array($file) && is_int($file['error'] ?? null) && $file['error'] === UPLOAD_ERR_OK &&
        is_string($file['tmp_name'] ?? null) && is_uploaded_file($file['tmp_name']) && filesize($file['tmp_name']) <= LMS_EVIDENCE_MAX) {
        $sourceHash = hash_file('sha256', $file['tmp_name']);
    }
    $findDuplicate = function () use ($db, $registration, $requestHash, &$sourceHash): array|false {
        $stmt = $db->prepare('SELECT * FROM lms_evidence WHERE registration_id=? AND (request_hash=? OR source_sha256=?) ORDER BY id LIMIT 1');
        $stmt->execute([$registration['id'], $requestHash, $sourceHash]);
        $existing = $stmt->fetch();
        if ($existing && (!is_string($sourceHash) || !hash_equals($existing['source_sha256'], $sourceHash))) {
            lmsEvidenceError(409, 'Mã yêu cầu đã dùng cho ảnh khác. Vui lòng chọn lại ảnh để gửi bổ sung.');
        }
        return $existing;
    };
    if ($existing = $findDuplicate()) {
        if (!is_file(lmsEvidenceFile($dbPath, $existing['storage_key']))) lmsEvidenceError(503, 'Ảnh đã lưu tạm không đọc được. Vui lòng liên hệ hỗ trợ.');
        return $existing + ['_replayed' => true];
    }
    $db->exec('BEGIN IMMEDIATE');
    try { $limited = lmsRateLimited($db, $ownerHash, time(), 'evidence:'); $db->exec('COMMIT'); }
    catch (Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
    if ($limited) lmsEvidenceError(429, 'Bạn gửi ảnh quá nhiều lần. Vui lòng chờ một phút rồi thử lại.');
    $postLimit = lmsIniBytes(ini_get('post_max_size'));
    if ($postLimit > 0 && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $postLimit) lmsEvidenceError(413, 'Tổng dung lượng gửi vượt giới hạn PHP. Chỉ chọn một ảnh JPG/PNG tối đa 5 MB.');
    if (!is_array($file) || !is_int($file['error'] ?? null)) lmsEvidenceError(422, 'Vui lòng chọn một ảnh JPG hoặc PNG.');
    $error = $file['error'];
    if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) lmsEvidenceError(413, 'Ảnh vượt giới hạn 5 MB hoặc giới hạn upload PHP.');
    if ($error === UPLOAD_ERR_NO_FILE) lmsEvidenceError(422, 'Vui lòng chọn ảnh minh chứng.');
    if ($error === UPLOAD_ERR_PARTIAL) lmsEvidenceError(422, 'Ảnh tải lên chưa đầy đủ. Vui lòng gửi lại ảnh đã chọn.');
    if ($error !== UPLOAD_ERR_OK) lmsEvidenceError(503, 'PHP không nhận được ảnh do lỗi thư mục tạm hoặc ghi tệp. Vui lòng thử lại.');
    if (!is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])) lmsEvidenceError(422, 'Tệp tải lên không hợp lệ.');
    if (!is_string($sourceHash)) lmsEvidenceError(413, 'Ảnh không hợp lệ hoặc vượt giới hạn 5 MB.');
    $size = filesize($file['tmp_name']);
    if ($size < 1 || $size > LMS_EVIDENCE_MAX) lmsEvidenceError(413, 'Ảnh phải có dung lượng từ 1 byte đến 5 MB.');
    $settings = lmsEvidenceSettings();
    if (!$settings['upload_available']) lmsEvidenceError(503, $settings['configuration_error']);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $extension = strtolower(pathinfo(is_string($file['name'] ?? null) ? $file['name'] : '', PATHINFO_EXTENSION));
    if (!in_array($mime, ['image/jpeg','image/png'], true) ||
        !in_array($extension, $mime === 'image/png' ? ['png'] : ['jpg','jpeg'], true)) {
        lmsEvidenceError(422, 'Chỉ nhận ảnh JPG/PNG thật; loại tệp phải khớp phần mở rộng.');
    }
    $info = @getimagesize($file['tmp_name']);
    if (!$info || ($info['mime'] ?? '') !== $mime || $info[0] < 1 || $info[1] < 1) lmsEvidenceError(422, 'Nội dung ảnh không hợp lệ.');
    $bytes = file_get_contents($file['tmp_name']);
    if (($mime === 'image/jpeg' && substr($bytes, -2) !== "\xFF\xD9") ||
        ($mime === 'image/png' && substr($bytes, -12) !== hex2bin('0000000049454e44ae426082'))) {
        lmsEvidenceError(422, 'Ảnh bị thiếu dữ liệu hoặc có nội dung lạ nối sau ảnh. Vui lòng xuất lại ảnh JPG/PNG.');
    }
    $pixels = $info[0] * $info[1];
    $memory = lmsIniBytes(ini_get('memory_limit'));
    if ($pixels > 16000000 || max($info[0], $info[1]) > 8192 || ($memory > 0 && memory_get_usage(true) + $pixels * 8 + $size * 2 + 8388608 > $memory)) {
        lmsEvidenceError(422, 'Độ phân giải ảnh quá lớn. Vui lòng giảm ảnh xuống tối đa 16 triệu điểm ảnh rồi gửi lại.');
    }
    $warning = false;
    set_error_handler(function () use (&$warning): bool { $warning = true; return true; });
    try { $image = imagecreatefromstring($bytes); }
    finally { restore_error_handler(); }
    if (!$image || $warning) {
        if ($image) imagedestroy($image);
        lmsEvidenceError(422, 'Không giải mã được ảnh. Tệp có thể bị hỏng hoặc chỉ giả định dạng ảnh.');
    }
    $newFile = null;
    $transaction = false;
    try {
        $storageKey = bin2hex(random_bytes(32)) . ($mime === 'image/png' ? '.png' : '.jpg');
        $newFile = lmsEvidenceFile($dbPath, $storageKey);
        $stream = @fopen($newFile, 'x+b');
        if (!$stream) lmsEvidenceError(503, 'Không ghi được ảnh vào kho lưu trữ riêng.');
        try {
            if ($mime === 'image/png') { imagesavealpha($image, true); $saved = imagepng($image, $stream, 6); }
            else $saved = imagejpeg($image, $stream, 90);
            $flushed = fflush($stream);
        } finally { fclose($stream); }
        @chmod($newFile, 0600);
        if (!$saved || !$flushed || filesize($newFile) < 1 || filesize($newFile) > 16 * 1024 * 1024) lmsEvidenceError(503, 'Không lưu được ảnh đã kiểm tra.');
        $db->exec('BEGIN IMMEDIATE'); $transaction = true;
        if ($existing = $findDuplicate()) {
            $db->exec('COMMIT'); $transaction = false;
            unlink($newFile); $newFile = null;
            return $existing + ['_replayed' => true];
        }
        $stmt = $db->prepare('SELECT * FROM lms_registrations WHERE id=?');
        $stmt->execute([$registration['id']]); $fresh = $stmt->fetch();
        if (!$fresh || !lmsCanSubmitEvidence($fresh)) lmsEvidenceError(409, 'Hồ sơ không ở trạng thái cho phép bổ sung minh chứng.');
        $now = time();
        $onTime = $fresh['status'] === 'pending_review' || ($fresh['status'] === 'pending_payment' && (int)$fresh['expires_at'] > $now);
        $stmt = $db->prepare('INSERT INTO lms_evidence (registration_id,storage_key,mime,size_bytes,source_sha256,request_hash,submitted_at,timeliness) VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([$fresh['id'], $storageKey, $mime, filesize($newFile), $sourceHash, $requestHash, $now, $onTime ? 'on_time' : 'late']);
        $id = (int)$db->lastInsertId();
        $db->prepare('UPDATE lms_registrations SET status=?,proof_submitted_at=COALESCE(proof_submitted_at,?),review_status=NULL,review_reason=NULL,review_version=review_version+1 WHERE id=?')
          ->execute([$onTime ? 'pending_review' : 'expired', $now, $fresh['id']]);
        $stmt = $db->prepare('SELECT * FROM lms_evidence WHERE id=?'); $stmt->execute([$id]); $result = $stmt->fetch();
        $db->exec('COMMIT'); $transaction = false;
        $newFile = null;
        return $result;
    } catch (Throwable $e) {
        if ($transaction) { try { $db->exec('ROLLBACK'); } catch (Throwable $ignored) {} }
        if ($newFile !== null && is_file($newFile)) @unlink($newFile);
        throw $e;
    } finally { imagedestroy($image); }
}
