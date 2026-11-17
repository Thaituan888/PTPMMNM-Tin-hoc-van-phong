<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/evidence.php';
$settings = lmsEvidenceSettings();
echo json_encode($settings + ['gd' => extension_loaded('gd'),
  'upload_max_filesize' => ini_get('upload_max_filesize'), 'post_max_size' => ini_get('post_max_size')],
  JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
exit($settings['upload_available'] ? 0 : 1);
