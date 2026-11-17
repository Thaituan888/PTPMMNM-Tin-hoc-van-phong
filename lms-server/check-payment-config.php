<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/payment.php';
$dbPath = lmsStorage(); // Resolve paths only; do not open or modify the database.
$configPath = getenv('THVP_LMS_PAYMENT_CONFIG') ?: dirname($dbPath) . '/payment-config.json';
$bank = lmsBankConfig($dbPath, $issue);
echo json_encode(['project' => dirname(__DIR__), 'database_path' => str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $dbPath),
  'config_path' => str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $configPath), 'exists' => is_file($configPath),
  'readable' => is_readable($configPath), 'valid' => $bank !== null, 'error' => $issue],
  JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
exit($bank === null ? 1 : 0);
