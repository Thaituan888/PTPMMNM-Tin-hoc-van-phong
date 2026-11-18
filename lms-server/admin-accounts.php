<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {http_response_code(404);exit;}
require_once __DIR__.'/bootstrap.php';
try {
    $db=lmsDB(lmsStorage());
    $command=$argv[1] ?? 'list';
    if ($command==='list') {
        $rows=$db->query('SELECT * FROM users ORDER BY id')->fetchAll();
        $rows=array_map(fn($row)=>lmsPublicUser($row)+['active'=>(bool)$row['active'],
          'password_configured'=>!empty($row['password_hash']) || !empty($row['password'])],$rows);
        echo json_encode(['accounts'=>$rows],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;exit;
    }
    if ($command!=='set-password') throw new RuntimeException('Use list or set-password USERNAME.');
    $username=$argv[2] ?? '';
    $stmt=$db->prepare("SELECT id FROM users WHERE LOWER(username)=LOWER(?) AND role='admin'");$stmt->execute([$username]);$id=$stmt->fetchColumn();
    if (!$id) throw new RuntimeException('Admin account not found. No new identity was created.');
    $raw=stream_get_contents(STDIN,4097);
    if (strlen($raw)>4096) throw new RuntimeException('Input too long.');
    $data=json_decode($raw,true,8,JSON_THROW_ON_ERROR);$password=$data['password'] ?? null;
    if (!is_string($password) || !mb_check_encoding($password,'UTF-8') || mb_strlen($password,'UTF-8')<12 || strlen($password)>72) throw new RuntimeException('New password must contain at least 12 characters and at most 72 UTF-8 bytes.');
    $db->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),$id]);
    echo 'Password saved for '.$username.'.'.PHP_EOL;
}catch(Throwable $e){fwrite(STDERR,'Account tool failed: '.$e->getMessage().PHP_EOL);exit(1);}
