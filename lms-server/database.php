<?php
declare(strict_types=1);

// Local development keeps SQLite. Uploading lms-hosting.php enables MySQL.
function lmsHosting(): array {
    static $config;
    if ($config === null) {
        $file = getenv('THVP_LMS_HOSTING_CONFIG') ?: dirname(__DIR__) . '/lms-hosting.php';
        $config = is_file($file) ? require $file : [];
        if (!is_array($config)) throw new RuntimeException('Invalid LMS hosting configuration.');
    }
    return $config;
}
function lmsIsMySQL(PDO $db): bool { return $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'; }
function lmsColumns(PDO $db, string $table): array {
    if (!preg_match('/^[a-z_]+$/D', $table)) throw new InvalidArgumentException('Invalid table.');
    if (!lmsIsMySQL($db)) return array_column($db->query('PRAGMA table_info('.$table.')')->fetchAll(), 'name');
    return array_column($db->query('SHOW COLUMNS FROM `'.$table.'`')->fetchAll(), 'Field');
}
function lmsBeginWrite(PDO $db): void {
    if (!lmsIsMySQL($db)) { $db->exec('BEGIN IMMEDIATE'); return; }
    $db->beginTransaction();
    // Preserve SQLite's single-writer admission checks, seat counts and idempotency.
    // This row is held until COMMIT/ROLLBACK, including across separate PHP workers.
    try {
        $stmt = $db->query('SELECT id FROM lms_write_lock WHERE id=1 FOR UPDATE');
        if (!$stmt->fetchColumn()) throw new RuntimeException('Import the LMS MySQL schema first.');
        $stmt->closeCursor();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
}
function lmsSessionSource(PDO $db): string { return lmsIsMySQL($db) ? 'mysql' : 'sqlite'; }
function lmsMySQL(): PDO {
    $c = lmsHosting();
    foreach (['host','database','username','password'] as $key) {
        if (!is_string($c[$key] ?? null) || $c[$key] === '') throw new RuntimeException('Missing MySQL configuration.');
    }
    if (preg_match('/[;\x00-\x20]/', $c['host'].$c['database'])) throw new RuntimeException('Invalid MySQL address.');
    $db = new PDO('mysql:host='.$c['host'].';port='.(int)($c['port'] ?? 3306).';dbname='.$c['database'].';charset=utf8mb4', $c['username'], $c['password'], [
        PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES=>false, PDO::ATTR_STRINGIFY_FETCHES=>false
    ]);
    $db->exec('SET SESSION innodb_lock_wait_timeout=15');
    $version = $db->query("SELECT name FROM lms_schema_migrations WHERE name='mysql_lms_v1'")->fetchColumn();
    if (!$version) throw new RuntimeException('Import database-lms-infinityfree.sql first.');
    return $db;
}
// Apache hosting can keep private assets inside htdocs, protected by access denial.
// Only this fixed directory is accepted; arbitrary public directories stay forbidden.
function lmsPrivatePathAllowed(string $path): bool {
    $normalize = fn(string $p): string => strtolower(str_replace('\\','/', $p));
    $resolved = realpath($path);
    if ($resolved === false || is_link($path)) return false;
    $resolved = $normalize($resolved);
    $web = $normalize((string)realpath(dirname(__DIR__)));
    if ($resolved !== $web && !str_starts_with($resolved, $web.'/')) return true;
    if ((lmsHosting()['driver'] ?? '') !== 'mysql') return false;
    $root = dirname(__DIR__).'/lms-private';
    if (is_link($root)) return false;
    $private = $normalize((string)realpath($root));
    $deny = @file_get_contents($root.'/.htaccess');
    return $private === $web.'/lms-private' && ($resolved === $private || str_starts_with($resolved, $private.'/'))
        && is_string($deny) && preg_match('/^Require all denied\s*$/mi', $deny) === 1;
}
