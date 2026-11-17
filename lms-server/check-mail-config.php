<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') {http_response_code(404);exit;}
require_once __DIR__.'/bootstrap.php';
require_once __DIR__.'/mail.php';
try {
    $path=lmsStorage(); // Resolve paths only. No DB opening and no SMTP connection.
    $configPath=lmsMailConfigPath($path);
    $status=lmsMailPublicStatus(lmsMailConfiguration($path));
    echo json_encode(['config_path'=>str_replace(['/', '\\'],DIRECTORY_SEPARATOR,$configPath),
      'exists'=>is_file($configPath),'readable'=>is_readable($configPath),'openssl'=>extension_loaded('openssl')]+$status,
      JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL;
    exit($status['configured']?0:1);
} catch (Throwable $e) {
    echo "Không kiểm tra được đường dẫn dữ liệu riêng. Kiểm tra THVP_LMS_DB/THVP_LMS_MAIL_CONFIG và quyền đọc.\n";exit(1);
}
