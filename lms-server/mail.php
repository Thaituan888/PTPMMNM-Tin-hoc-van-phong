<?php
declare(strict_types=1);

final class LmsMailError extends RuntimeException {
    public function __construct(public int $httpStatus, public string $errorCode, string $message) { parent::__construct($message); }
}

function lmsRequireMailAdmin(?array $actor): void {
    lmsRequireAdmin($actor);
    if (!in_array(strtolower($actor['username']), ['giaovien1','giaovien2','giaovien3'], true)) {
        fail(403, 'Chỉ ba tài khoản giáo viên được chỉ định mới có quyền kiểm tra email.');
    }
}

function lmsMailConfigPath(string $dbPath): string {
    return getenv('THVP_LMS_MAIL_CONFIG') ?: dirname($dbPath) . '/mail-config.json';
}

// Errors contain field names and fixed descriptions only, never configuration values.
function lmsMailConfiguration(string $dbPath): array {
    $path = lmsMailConfigPath($dbPath);
    $result = ['state'=>'invalid','enabled'=>false,'configured'=>false,'issues'=>[], 'config'=>null];
    $invalid = function (string $message) use (&$result): array { $result['issues'][]=$message;return $result; };
    if (!preg_match('~^(?:[A-Za-z]:[/\\\\]|/)~', $path)) return $invalid('Đường dẫn mail-config.json phải là đường dẫn tuyệt đối.');
    if (is_link($path)) return $invalid('mail-config.json không được là liên kết tượng trưng.');
    if (!is_file($path)) { $result['state']='missing';return $invalid('Chưa tìm thấy mail-config.json. Dùng công cụ check-mail-config.php để xem đường dẫn PHP đang đọc.'); }
    $resolved = strtolower(str_replace('\\','/',(string)realpath($path)));
    $public = strtolower(str_replace('\\','/',(string)realpath(dirname(__DIR__))));
    if ($resolved===$public || str_starts_with($resolved,$public.'/')) return $invalid('mail-config.json phải nằm ngoài thư mục web.');
    if (!is_readable($path)) return $invalid('PHP không đọc được mail-config.json. Kiểm tra quyền đọc tệp.');
    if (filesize($path)>16384) return $invalid('mail-config.json vượt giới hạn 16 KB.');
    $raw=@file_get_contents($path,false,null,0,16385);
    if ($raw===false) return $invalid('PHP không đọc được nội dung mail-config.json.');
    if (strlen($raw)>16384) return $invalid('mail-config.json vượt giới hạn 16 KB.');
    if (str_starts_with($raw,"\xEF\xBB\xBF")) return $invalid('mail-config.json có BOM. Hãy lưu lại UTF-8 không BOM.');
    if (!mb_check_encoding($raw,'UTF-8')) return $invalid('mail-config.json không phải UTF-8 hợp lệ.');
    try { $values=json_decode($raw,true,16,JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { return $invalid('JSON trong mail-config.json không hợp lệ. Kiểm tra dấu ngoặc, dấu phẩy và dấu nháy kép.'); }
    if (!is_array($values) || !str_starts_with(ltrim($raw),'{')) return $invalid('mail-config.json phải chứa một đối tượng JSON.');
    if (array_key_exists('enabled',$values) && !is_bool($values['enabled'])) return $invalid('Trường enabled phải là true hoặc false, không đặt trong dấu nháy.');
    $result['enabled']=$values['enabled'] ?? false;
    if (!$result['enabled']) { $result['state']='disabled';return $result; }
    $config=['enabled'=>true];
    foreach (['smtp_host'=>253,'smtp_encryption'=>10,'smtp_username'=>254,'smtp_password'=>1024,'from_email'=>254,'from_name'=>150,'base_url'=>2048] as $field=>$max) {
        $value=$values[$field] ?? null;
        if (!is_string($value) || trim($value)==='' || mb_strlen($value)>$max || preg_match('/[\x00-\x1F\x7F]/u',$value)) {
            $result['issues'][]="Trường $field bắt buộc là chuỗi không trống, không chứa ký tự điều khiển, tối đa $max ký tự.";
        } else $config[$field]=$field==='smtp_password' ? $value : trim($value);
    }
    if (!is_int($values['smtp_port'] ?? null) || $values['smtp_port']<1 || $values['smtp_port']>65535) $result['issues'][]='Trường smtp_port phải là số nguyên từ 1 đến 65535.';
    else $config['smtp_port']=$values['smtp_port'];
    if (isset($config['smtp_host']) && !filter_var($config['smtp_host'],FILTER_VALIDATE_IP) &&
      !filter_var($config['smtp_host'],FILTER_VALIDATE_DOMAIN,FILTER_FLAG_HOSTNAME)) $result['issues'][]='Trường smtp_host phải là tên máy chủ hoặc IP, không kèm giao thức, cổng hay đường dẫn.';
    if (isset($config['smtp_encryption']) && !in_array($config['smtp_encryption'],['tls','ssl'],true)) $result['issues'][]='Trường smtp_encryption chỉ nhận tls (STARTTLS) hoặc ssl (TLS ngay khi kết nối).';
    if (isset($config['from_email']) && !filter_var($config['from_email'],FILTER_VALIDATE_EMAIL)) $result['issues'][]='Trường from_email không phải địa chỉ email hợp lệ.';
    if (isset($config['base_url'])) {
        $url=parse_url($config['base_url']);
        if (!filter_var($config['base_url'],FILTER_VALIDATE_URL) || !$url || !in_array($url['scheme'] ?? '',['http','https'],true) ||
          isset($url['user']) || isset($url['pass']) || isset($url['query']) || isset($url['fragment'])) $result['issues'][]='Trường base_url phải là URL http/https của website, không kèm tài khoản, query hoặc fragment.';
        else $config['base_url']=rtrim($config['base_url'],'/');
    }
    $timeout=$values['timeout_seconds'] ?? 10;
    if (!is_int($timeout) || $timeout<1 || $timeout>30) $result['issues'][]='Trường timeout_seconds (nếu có) phải là số nguyên từ 1 đến 30.';
    else $config['timeout_seconds']=$timeout;
    foreach ($values as $field=>$unused) {
        if (!in_array($field,['enabled','smtp_host','smtp_port','smtp_encryption','smtp_username','smtp_password','from_email','from_name','base_url','timeout_seconds'],true)) {
            $result['issues'][]='Có trường cấu hình không được hỗ trợ. Chỉ sử dụng các trường trong tệp mẫu và timeout_seconds.';break;
        }
    }
    if ($result['issues']) return $result;
    if (!extension_loaded('openssl') || !function_exists('stream_socket_client')) return $invalid('PHP cần bật OpenSSL và stream_socket_client để gửi SMTP qua TLS.');
    foreach (['PHPMailer','SMTP','Exception'] as $file) {
        if (!is_readable(dirname(__DIR__).'/vendor/phpmailer/src/'.$file.'.php')) return $invalid('Thiếu thư viện PHPMailer trong vendor/phpmailer/src.');
    }
    return ['state'=>'ready','enabled'=>true,'configured'=>true,'issues'=>[], 'config'=>$config];
}

function lmsMailPublicStatus(array $configuration): array {
    $labels=['missing'=>'Chưa cấu hình email.','disabled'=>'Gửi email đang tắt (enabled=false).',
      'invalid'=>'Cấu hình email chưa hợp lệ.','ready'=>'Đã cấu hình SMTP. Chưa kiểm tra kết nối hoặc việc nhận thư.'];
    return ['state'=>$configuration['state'],'enabled'=>$configuration['enabled'],'configured'=>$configuration['configured'],
      'message'=>$labels[$configuration['state']],'issues'=>$configuration['issues']];
}

function lmsMailRecipient(mixed $value): string {
    if (!is_string($value) || strlen($value)>254 || preg_match('/[\x00-\x20\x7F]/',$value) || !filter_var($value,FILTER_VALIDATE_EMAIL)) {
        throw new LmsMailError(422,'recipient_invalid','Vui lòng nhập một địa chỉ email nhận thử hợp lệ.');
    }
    return $value;
}

// Reusable service. No profile queries, account creation, enrollment or email queue is performed here.
function lmsSendMail(array $config, string $recipient, string $subject, string $html, string $text, array $attachments=[]): void {
    lmsMailRecipient($recipient);
    require_once __DIR__.'/mail-transport.php';
    $mail=new \PHPMailer\PHPMailer\PHPMailer(true);
    $smtp=new LmsMailSMTP();
    $smtp->Timelimit=$config['timeout_seconds'];
    $mail->setSMTPInstance($smtp);
    $mail->isSMTP();$mail->SMTPAuth=true;$mail->SMTPAutoTLS=false;
    $mail->Host=filter_var($config['smtp_host'],FILTER_VALIDATE_IP,FILTER_FLAG_IPV6) ? '['.$config['smtp_host'].']' : $config['smtp_host'];
    $mail->Port=$config['smtp_port'];$mail->SMTPSecure=$config['smtp_encryption'];
    $mail->Username=$config['smtp_username'];$mail->Password=$config['smtp_password'];
    $mail->Timeout=$config['timeout_seconds'];
    $mail->SMTPDebug=0;$mail->Debugoutput=static function (): void {};
    $mail->SMTPOptions=['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true,'allow_self_signed'=>false]];
    $mail->CharSet='UTF-8';$mail->Encoding='base64';
    // Do not include the execution machine name or request Host header in SMTP greetings/Message-ID.
    $mail->Hostname=(string)parse_url($config['base_url'],PHP_URL_HOST);$mail->Helo=$mail->Hostname;
    set_error_handler(static function (): bool {return true;});
    try {
        $mail->setFrom($config['from_email'],$config['from_name']);$mail->addAddress($recipient);
        $mail->Subject=$subject;$mail->isHTML(true);$mail->Body=$html;$mail->AltBody=$text;
        foreach($attachments as $attachment)$mail->addStringAttachment($attachment['data'],$attachment['name'],'base64',$attachment['mime']);
        if (!$mail->send()) throw new RuntimeException('SMTP did not acknowledge send.');
    } catch (Throwable $e) {
        // Upstream ErrorInfo/replies can echo credentials. Never return/log them or chain the original exception.
        if ($smtp->socketError===10013) throw new LmsMailError(502,'smtp_socket_denied','Windows từ chối quyền kết nối mạng của tiến trình PHP (10013). Hãy khởi động máy chủ bằng PowerShell có quyền mạng, ngoài môi trường sandbox; không cần đổi tài khoản hoặc mật khẩu SMTP.');
        if ($smtp->timedOut) throw new LmsMailError(504,'smtp_timeout','SMTP hết thời gian chờ. Kết quả gửi chưa được xác nhận; hãy kiểm tra hộp thư trước khi gửi lại.');
        if ($smtp->tlsFailed) throw new LmsMailError(502,'smtp_tls','Không thiết lập được TLS hoặc không xác minh được chứng chỉ SMTP. Kiểm tra smtp_encryption, cổng và CA của PHP; không tắt kiểm tra chứng chỉ.');
        if ($smtp->phase==='auth') throw new LmsMailError(502,'smtp_auth','SMTP từ chối xác thực. Kiểm tra smtp_username, smtp_password hoặc mật khẩu ứng dụng và quyền SMTP của nhà cung cấp.');
        if ($smtp->phase==='connect') throw new LmsMailError(502,'smtp_connect','Không kết nối được SMTP. Kiểm tra smtp_host, smtp_port, DNS, mạng và tường lửa.');
        throw new LmsMailError(502,'smtp_rejected','SMTP chưa chấp nhận thư. Kiểm tra địa chỉ người gửi/người nhận và chính sách gửi của nhà cung cấp.');
    } finally {
        $mail->smtpClose();$mail->Password='';restore_error_handler();
    }
}

function lmsSendTestMail(array $config, string $recipient): void {
    $url=$config['base_url'];$safe=htmlspecialchars($url,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    lmsSendMail($config,$recipient,'Kiểm tra email LMS — Tin học văn phòng',
      '<!doctype html><html lang="vi"><meta charset="UTF-8"><body><h1>Kiểm tra email LMS</h1><p>Đây là email thử để kiểm tra cấu hình SMTP và nội dung tiếng Việt.</p><p>Website: <a href="'.$safe.'">'.$safe.'</a></p><p>Thư thử không chứa mật khẩu hoặc dữ liệu học sinh.</p></body></html>',
      "Kiểm tra email LMS\n\nĐây là email thử để kiểm tra cấu hình SMTP và nội dung tiếng Việt.\nWebsite: $url\nThư thử không chứa mật khẩu hoặc dữ liệu học sinh.\n");
}
