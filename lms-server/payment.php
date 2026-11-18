<?php
declare(strict_types=1);

function lmsOwnedRegistration(PDO $db, string $code): array|false {
    $token = $_COOKIE[accessCookie($code)] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) return false;
    $stmt = $db->prepare('SELECT * FROM lms_registrations WHERE class_code=? AND access_hash=?');
    $stmt->execute([$code, hash('sha256', $token)]);
    $row=$stmt->fetch();if($row)$row['_admission_open']=lmsLifecycleAdmission($db,$row);return $row;
}

function lmsBankConfig(string $dbPath, ?string &$issue = null): ?array {
    $issue = null;
    $file = getenv('THVP_LMS_PAYMENT_CONFIG') ?: dirname($dbPath) . '/payment-config.json';
    if (!is_file($file)) { $issue = 'Không tìm thấy tệp cấu hình thanh toán.'; return null; }
    if (!is_readable($file)) { $issue = 'PHP không đọc được tệp cấu hình thanh toán.'; return null; }
    if (is_link($file)) { $issue = 'Tệp cấu hình không được là liên kết tượng trưng.'; return null; }
    $resolved = strtolower(str_replace('\\', '/', realpath($file)));
    $public = strtolower(str_replace('\\', '/', realpath(dirname(__DIR__))));
    if (!lmsPrivatePathAllowed($file)) { $issue = 'Cấu hình phải nằm ngoài thư mục web.'; return null; }
    if (filesize($file) > 8192) { $issue = 'Tệp cấu hình vượt quá 8192 byte.'; return null; }
    $raw = file_get_contents($file);
    if ($raw === false) { $issue = 'Không đọc được nội dung tệp cấu hình.'; return null; }
    if (str_starts_with($raw, "\xEF\xBB\xBF")) { $issue = 'Tệp cấu hình có BOM; hãy lưu UTF-8 không BOM.'; return null; }
    try { $values = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { $issue = 'JSON cấu hình không hợp lệ: ' . $e->getMessage(); return null; }
    $bank = [];
    foreach (['bank_name','bank_bin','account_number','account_name'] as $field) {
        if (!isset($values[$field]) || !is_string($values[$field])) { $issue = "Trường $field phải là chuỗi."; return null; }
        $bank[$field] = trim($values[$field]);
        if ($bank[$field] === '' || mb_strlen($bank[$field]) > 120 || preg_match('/[\x00-\x1F\x7F]/u', $bank[$field])) {
            $issue = "Trường $field trống, quá dài hoặc có ký tự điều khiển."; return null;
        }
    }
    if (!preg_match('/^[0-9]{6}$/D', $bank['bank_bin'])) { $issue = 'Trường bank_bin phải gồm đúng 6 chữ số.'; return null; }
    if (!preg_match('/^[A-Za-z0-9]{1,19}$/D', $bank['account_number'])) { $issue = 'Trường account_number phải gồm 1–19 ký tự chữ hoặc số.'; return null; }
    return $bank;
}

function lmsTLV(string $id, string $value): string {
    $length = strlen($value);
    if ($length < 1 || $length > 99) throw new LengthException('Invalid VietQR field length.');
    return $id . str_pad((string)$length, 2, '0', STR_PAD_LEFT) . $value;
}

function lmsVietQR(array $bank, int $amount, string $transfer): string {
    // NAPAS account transfer: 38/00=AID, 38/01/{00=BIN,01=account}, 38/02=QRIBFTTA.
    // Only bank routing, beneficiary account, VND amount and the registration reference are encoded.
    if ($amount <= 0 || strlen((string)$amount) > 13 || !preg_match('/^[A-Z0-9 -]{1,25}$/D', $transfer)) {
        throw new InvalidArgumentException('Invalid transfer fields.');
    }
    $beneficiary = lmsTLV('00', $bank['bank_bin']) . lmsTLV('01', $bank['account_number']);
    $merchant = lmsTLV('00', 'A000000727') . lmsTLV('01', $beneficiary) . lmsTLV('02', 'QRIBFTTA');
    $payload = lmsTLV('00', '01') . lmsTLV('01', '12') . lmsTLV('38', $merchant)
      . lmsTLV('53', '704') . lmsTLV('54', (string)$amount) . lmsTLV('58', 'VN')
      . lmsTLV('62', lmsTLV('08', $transfer)) . '6304';
    // CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), including the 6304 header.
    $crc = 0xFFFF;
    foreach (unpack('C*', $payload) as $byte) {
        $crc ^= $byte << 8;
        for ($bit = 0; $bit < 8; $bit++) $crc = (($crc & 0x8000) ? ($crc << 1) ^ 0x1021 : $crc << 1) & 0xFFFF;
    }
    return $payload . strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
}

function lmsPayment(PDO $db, array $row, string $dbPath): array {
    $registration = lmsRegistration($row);
    $base = ['reference' => $registration['reference'], 'class_code' => $row['class_code'],
      'course_name' => $registration['class']['course_name'], 'amount_vnd' => (int)$row['fee_vnd'],
      'currency' => 'VND', 'expires_at' => $registration['expires_at'],
      'server_time' => gmdate('c'), 'server_time_ms' => (int)floor(microtime(true) * 1000),
      'status' => $registration['status'], 'status_label' => $registration['status_label'], 'payment_confirmed' => $registration['payment_confirmed']];
    if(!lmsLifecycleAdmission($db,$row))return $base+['eligible'=>false,'configured'=>false,'message'=>'Đợt học của hồ sơ đã kết thúc. Không tiếp tục thanh toán theo hồ sơ này; liên hệ giáo viên nếu đã chuyển tiền.'];
    if ($registration['status'] !== 'pending_payment' || $row['proof_submitted_at'] !== null || (int)$row['expires_at'] <= time()) {
        return $base + ['eligible' => false, 'configured' => false,
          'message' => $registration['status'] === 'expired' ? 'Hồ sơ đã hết hạn giữ chỗ. Vui lòng không tiếp tục thanh toán theo hồ sơ này.' : 'Hồ sơ không còn ở bước chờ thanh toán.'];
    }
    $stmt = $db->prepare('SELECT * FROM lms_payments WHERE registration_id=?');
    $stmt->execute([$row['id']]);
    $bank = $stmt->fetch();
    if (!$bank) {
        $bank = lmsBankConfig($dbPath, $configurationIssue);
        if (!$bank) return $base + ['eligible' => true, 'configured' => false,
          'message' => 'Thông tin thanh toán chưa được cấu hình', 'configuration_error' => $configurationIssue];
        $db->prepare('INSERT INTO lms_payments (registration_id,bank_name,bank_bin,account_number,account_name,created_at)
          VALUES (?,?,?,?,?,?)')->execute([$row['id'], $bank['bank_name'], $bank['bank_bin'],
            $bank['account_number'], $bank['account_name'], time()]);
    }
    $info = array_intersect_key($bank, array_flip(['bank_name','bank_bin','account_number','account_name']));
    $result = $base + ['eligible' => true, 'configured' => true, 'bank' => $info,
      'transfer_content' => $registration['transfer_content'],
      'message' => 'Vui lòng chuyển đúng số tiền và giữ nguyên nội dung chuyển khoản.'];
    try { $result['qr_payload'] = lmsVietQR($info, (int)$row['fee_vnd'], $registration['transfer_content']); }
    catch (Throwable $e) {
        $result['qr_payload'] = null;
        $result['qr_error'] = 'Chưa tạo được QR. Bạn có thể chuyển khoản theo thông tin bên cạnh hoặc thử lại.';
    }
    return $result;
}
