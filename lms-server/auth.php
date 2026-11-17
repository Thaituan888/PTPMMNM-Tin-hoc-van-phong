<?php
declare(strict_types=1);

function lmsInitAccounts(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      fullname TEXT NOT NULL, password_hash TEXT DEFAULT NULL, role TEXT NOT NULL DEFAULT 'student',
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $columns = array_column($db->query('PRAGMA table_info(users)')->fetchAll(), 'name');
    foreach (['id','username','fullname','role'] as $required) {
        if (!in_array($required, $columns, true)) throw new RuntimeException('Existing users schema is not compatible; no identities have been overwritten.');
    }
    if (!in_array('password_hash', $columns, true)) $db->exec('ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT NULL');
    if (!in_array('active', $columns, true)) $db->exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    $db->exec('CREATE TABLE IF NOT EXISTS lms_schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
    if ($db->query("SELECT 1 FROM lms_schema_migrations WHERE name='admin_accounts_v1'")->fetchColumn()) return;
    $names = ['Giaovien1' => 'Tống Hoàng Thiên', 'Giaovien2' => 'Nguyễn Thái Tuấn', 'Giaovien3' => 'Trần Anh Khoa'];
    foreach ($names as $username => $fullname) {
        $stmt = $db->prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE'); $stmt->execute([$username]);
        $matches = $stmt->fetchAll();
        if (count($matches) > 1) throw new RuntimeException('Ambiguous pre-existing account names; preserve accounts for manual resolution.');
        if ($matches) {
            // Unify only these requested identities; never reset their existing password.
            $db->prepare("UPDATE users SET fullname=?,role='admin' WHERE id=?")->execute([$fullname, $matches[0]['id']]);
        } elseif (in_array('password', $columns, true)) {
            $db->prepare("INSERT INTO users(username,fullname,role,password) VALUES (?,?,'admin','')")->execute([$username,$fullname]);
        } else {
            $db->prepare("INSERT INTO users(username,fullname,role) VALUES (?,?,'admin')")->execute([$username,$fullname]);
        }
    }
    $db->prepare('INSERT INTO lms_schema_migrations(name,applied_at) VALUES (?,?)')->execute(['admin_accounts_v1',time()]);
}

function lmsPublicUser(array $row): array {
    return ['id'=>(int)$row['id'], 'username'=>$row['username'], 'fullname'=>$row['fullname'], 'role'=>$row['role'],
      'must_change_password'=>(bool)($row['must_change_password'] ?? false)];
}
function lmsActor(PDO $db, mixed $sessionUser): ?array {
    if (!is_array($sessionUser) || ($sessionUser['source'] ?? '') !== 'sqlite' || !is_int($sessionUser['id'] ?? null)) return null;
    if ((int)($sessionUser['login_at'] ?? 0) < time()-28800) return null;
    $stmt = $db->prepare('SELECT * FROM users WHERE id=?'); $stmt->execute([$sessionUser['id']]); $row=$stmt->fetch();
    if (!$row || !(int)$row['active'] || !$row['password_hash'] ||
        !hash_equals(hash('sha256',$row['password_hash']), (string)($sessionUser['credential_stamp'] ?? ''))) return null;
    return lmsPublicUser($row);
}
function lmsRequireAdmin(?array $actor): void {
    if (!$actor) fail(401, 'Vui lòng đăng nhập bằng tài khoản quản trị.');
    if ($actor['role'] !== 'admin') fail(403, 'Tài khoản không có quyền quản trị LMS.');
}
function lmsCredentialUser(PDO $db, string $username, string $password): ?array {
    $stmt=$db->prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE');$stmt->execute([$username]);$row=$stmt->fetch();
    $hash=$row['password_hash'] ?? null;
    $valid=false;
    if ($row && $hash) $valid=password_verify($password,$hash);
    elseif ($row && is_string($row['password'] ?? null) && $row['password'] !== '') {
        // Preserve passwords from a pre-existing local users table, upgrading only after successful verification.
        $stored=$row['password'];
        $valid=password_get_info($stored)['algo'] !== null ? password_verify($password,$stored) : hash_equals($stored,$password);
    } else {
        // Constant-cost password verification for nonexistent/unconfigured identities.
        password_verify($password, '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
    }
    if (!$valid || !(int)$row['active']) return null;
    if (!$hash) {
        $legacyHash=$row['password'] ?? '';
        $row['password_hash']=password_get_info($legacyHash)['algo'] !== null
          ? $legacyHash : password_hash($password,PASSWORD_DEFAULT);
        $db->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([$row['password_hash'],$row['id']]);
    }
    return $row;
}
function lmsAuthJson(int $limit = 4096): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>$limit) fail(413,'Nội dung yêu cầu quá dài.');
    $raw=file_get_contents('php://input',false,null,0,$limit+1);
    if (strlen($raw)>$limit) fail(413,'Nội dung yêu cầu quá dài.');
    try {$body=json_decode($raw,true,16,JSON_THROW_ON_ERROR);}catch(JsonException $e){fail(422,'Dữ liệu không hợp lệ.');}
    if (!is_array($body)) fail(422,'Dữ liệu không hợp lệ.');
    return $body;
}
