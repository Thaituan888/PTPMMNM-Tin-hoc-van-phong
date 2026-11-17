<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404);exit; }
ini_set('display_errors','0');
require_once __DIR__.'/bootstrap.php';
require_once __DIR__.'/mail.php';
require_once __DIR__.'/mail-transport.php';

// CLI only. This probe never calls authenticate(), MAIL FROM, RCPT TO or DATA.
// Raw debug/transcripts are disabled, including when configuration contains real credentials.
try {
    $dbPath=lmsStorage();
    $configuration=lmsMailConfiguration($dbPath);
    if (!$configuration['configured']) {
        echo json_encode(['configuration'=>lmsMailPublicStatus($configuration)],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;exit(1);
    }
    $config=$configuration['config'];
    $private=[];
    foreach (['smtp_password','smtp_username','from_email','from_name','base_url'] as $field) {
        if (!empty($config[$field])) $private[]=$config[$field];
    }
    $sanitize=static function (mixed $value) use ($private): string {
        $text=str_ireplace($private,array_fill(0,count($private),'[redacted]'),(string)$value);
        $text=preg_replace('/[\x00-\x1F\x7F]+/',' ',$text);
        return mb_substr($text,0,1500);
    };
    $pairs=in_array('--both',$argv,true) ? [[587,'tls'],[465,'ssl']] : [[$config['smtp_port'],$config['smtp_encryption']]];
    $host=$config['smtp_host'];
    $timeout=$config['timeout_seconds'];
    unset($config,$configuration);
    $results=[];$ok=true;
    foreach ($pairs as [$port,$encryption]) {
        while (openssl_error_string()!==false) {} // Avoid mixing earlier operations with this handshake.
        $smtp=new LmsMailSMTP();$smtp->do_debug=0;$smtp->Debugoutput=static function (): void {};
        $smtp->Timeout=$timeout;$smtp->Timelimit=$timeout;
        $options=['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true,'allow_self_signed'=>false]];
        $target=filter_var($host,FILTER_VALIDATE_IP,FILTER_FLAG_IPV6) ? '['.$host.']' : $host;
        $stage='connect';$verified=false;$caught=null;
        set_error_handler(static function (): bool {return true;});
        try {
            if (!$smtp->connect(($encryption==='ssl'?'ssl://':'').$target,$port,$timeout,$options)) throw new RuntimeException('connect failed');
            $stage='ehlo';
            if (!$smtp->hello('localhost')) throw new RuntimeException('EHLO failed');
            if ($encryption==='tls') {
                $stage='starttls';
                if (!$smtp->startTLS()) throw new RuntimeException('STARTTLS failed');
                if (!$smtp->hello('localhost')) throw new RuntimeException('EHLO after TLS failed');
            }
            $stage='tls_verified';$verified=true;
        } catch (Throwable $e) { $caught=$sanitize($e->getMessage()); }
        $error=$smtp->getError();$openssl=[];
        while (($entry=openssl_error_string())!==false && count($openssl)<12) $openssl[]=$sanitize($entry);
        $results[]=['host'=>$host,'port'=>$port,'encryption'=>$encryption,'stage'=>$stage,'tls_verified'=>$verified,
          'socket_or_smtp_code'=>$sanitize($error['smtp_code'] ?? ''),'driver_error'=>$sanitize($error['error'] ?? ''),
          'driver_detail'=>$sanitize($error['detail'] ?? ''),'openssl_errors'=>$openssl,'probe_error'=>$caught];
        $ok=$ok&&$verified;
        // Close without QUIT: no extra protocol operation can hide the diagnostic error or delay cleanup.
        $smtp->close();restore_error_handler();
    }
    $locations=openssl_get_cert_locations();$cafile=$locations['ini_cafile'] ?: (getenv('SSL_CERT_FILE') ?: $locations['default_cert_file']);
    echo json_encode(['php_binary'=>PHP_BINARY,'php_ini'=>php_ini_loaded_file(),'openssl_version'=>OPENSSL_VERSION_TEXT,
      'configured_cafile'=>$locations['ini_cafile'],'cafile_candidate'=>$cafile,'cafile_candidate_readable'=>is_readable($cafile),
      'trust_note'=>'Không có tệp CA tại đường dẫn mặc định chưa kết luận được lỗi CA; kết quả tls_verified xác nhận phép kiểm tra thực tế.',
      'verify_peer'=>true,'verify_peer_name'=>true,'allow_self_signed'=>false,'authentication_attempted'=>false,
      'mail_sent'=>false,'checks'=>$results],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL;
    exit($ok?0:1);
} catch (Throwable $e) {
    echo "Không chạy được chẩn đoán SMTP/TLS. Kiểm tra cấu hình bằng check-mail-config.php; không có thư được gửi.\n";exit(1);
}
