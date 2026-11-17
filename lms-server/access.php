<?php
declare(strict_types=1);

final class LmsAccessError extends RuntimeException {
    public function __construct(public int $httpStatus, string $message) {parent::__construct($message);}
}
function lmsAccessError(int $status,string $message): never {throw new LmsAccessError($status,$message);}
function lmsInitAccess(PDO $db): void {
    foreach (['users'=>['email'=>'TEXT DEFAULT NULL COLLATE NOCASE','must_change_password'=>'INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1))'],
      'lms_enrollments'=>['user_id'=>'INTEGER DEFAULT NULL REFERENCES users(id)']] as $table=>$additions) {
        $columns=array_column($db->query('PRAGMA table_info('.$table.')')->fetchAll(),'name');
        foreach ($additions as $name=>$definition) if (!in_array($name,$columns,true)) $db->exec("ALTER TABLE $table ADD COLUMN $name $definition");
    }
    $db->exec(file_get_contents(__DIR__.'/access-migration.sql'));
    if (!$db->query("SELECT 1 FROM lms_schema_migrations WHERE name='student_direct_login_v1'")->fetchColumn()) {
        $db->exec("UPDATE users SET must_change_password=0 WHERE role='student' AND id IN (SELECT user_id FROM lms_access_grants)");
        $db->prepare('INSERT INTO lms_schema_migrations(name,applied_at) VALUES (?,?)')->execute(['student_direct_login_v1',time()]);
    }
    $db->prepare('INSERT OR IGNORE INTO lms_schema_migrations(name,applied_at) VALUES (?,?)')->execute(['learning_access_v1',time()]);
    // Remove expired secret envelopes, without changing accounts, passwords or enrollments.
    $db->prepare("UPDATE lms_access_grants SET encrypted_payload=NULL,mail_state='expired',lease_hash=NULL,lease_expires_at=NULL,
      last_error_code='payload_expired',last_error_message='Đã hết thời hạn lưu thông tin thư tạm; cần xử lý khôi phục tài khoản.'
      WHERE encrypted_payload IS NOT NULL AND payload_expires_at<=? AND (mail_state<>'sending' OR lease_expires_at<=?)")
      ->execute([time(),time()]);
}
function lmsAccessAdmin(PDO $db,array $actor): void {
    $stmt=$db->prepare("SELECT 1 FROM users WHERE id=? AND active=1 AND role='admin' AND lower(username) IN ('giaovien1','giaovien2','giaovien3')");
    $stmt->execute([$actor['id']]);
    if (!$stmt->fetchColumn()) lmsAccessError(403,'Tài khoản không còn quyền cấp quyền học.');
}
function lmsAccessRequest(array $body,string $key): array {
    $reference=$body['reference'] ?? null;$version=$body['version'] ?? null;
    if (!is_string($reference) || !preg_match('/^DK[0-9]{6,19}$/D',$reference) ||
      !is_int($version) || $version<0 || !preg_match('/^[a-zA-Z0-9_-]{32,128}$/D',$key)) lmsAccessError(422,'Mã hồ sơ, phiên bản hoặc mã yêu cầu không hợp lệ.');
    $id=filter_var(ltrim(substr($reference,2),'0'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if (!$id) lmsAccessError(404,'Không tìm thấy hồ sơ.');
    if ('DK'.str_pad((string)$id,6,'0',STR_PAD_LEFT)!==$reference) lmsAccessError(404,'Mã hồ sơ không hợp lệ.');
    return [$id,$reference,$version];
}
function lmsAccessKey(PDO $db,string $dbPath): string {
    $path=getenv('THVP_LMS_ACCESS_KEY') ?: dirname($dbPath).'/mail-outbox.key';
    if (!preg_match('~^(?:[A-Za-z]:[/\\\\]|/)~',$path) || is_link($path) || !is_dir(dirname($path))) lmsAccessError(503,'Đường dẫn khóa mã hóa thư không hợp lệ.');
    $directory=strtolower(str_replace('\\','/',(string)realpath(dirname($path))));
    $public=strtolower(str_replace('\\','/',(string)realpath(dirname(__DIR__))));
    if ($directory===$public || str_starts_with($directory,$public.'/')) lmsAccessError(503,'Khóa mã hóa thư phải nằm ngoài webroot.');
    if (!is_file($path)) {
        if ($db->query('SELECT 1 FROM lms_access_grants WHERE encrypted_payload IS NOT NULL LIMIT 1')->fetchColumn()) lmsAccessError(503,'Thiếu khóa giải mã thư đang chờ; cần khôi phục khóa đã sao lưu, không tạo lại tài khoản.');
        $stream=@fopen($path,'x+b');
        if ($stream) {
            try {$bytes=bin2hex(random_bytes(32));if (fwrite($stream,$bytes)!==64 || !fflush($stream)) lmsAccessError(503,'Không ghi được khóa mã hóa thư.');}
            finally {fclose($stream);}
            @chmod($path,0600);
        }
    }
    $key=@file_get_contents($path,false,null,0,65);
    if (!is_string($key) || !preg_match('/^[a-f0-9]{64}$/D',$key)) lmsAccessError(503,'Không đọc được khóa mã hóa thư hợp lệ.');
    return hex2bin($key);
}
function lmsAccessSeal(array $payload,string $key,int $id): string {
    $iv=random_bytes(12);$tag='';
    $encrypted=openssl_encrypt(json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag,'lms-access:'.$id,16);
    if ($encrypted===false) lmsAccessError(503,'Không mã hóa được thư chờ gửi.');
    return base64_encode($iv.$tag.$encrypted);
}
function lmsAccessOpen(string $envelope,string $key,int $id): array {
    $bytes=base64_decode($envelope,true);
    if ($bytes===false || strlen($bytes)<29) lmsAccessError(503,'Không giải mã được thư chờ gửi; cần kiểm tra khóa mã hóa.');
    $plain=openssl_decrypt(substr($bytes,28),'aes-256-gcm',$key,OPENSSL_RAW_DATA,substr($bytes,0,12),substr($bytes,12,16),'lms-access:'.$id);
    if ($plain===false) lmsAccessError(503,'Không giải mã được thư chờ gửi; cần kiểm tra khóa mã hóa.');
    return json_decode($plain,true,16,JSON_THROW_ON_ERROR);
}
function lmsAccessHistory(PDO $db,int $id): array {
    $stmt=$db->prepare('SELECT actor_username,actor_name,action,result,error_code,created_at,completed_at FROM lms_access_history WHERE registration_id=? ORDER BY id DESC');$stmt->execute([$id]);
    return array_map(function($r){$r['created_at']=gmdate('c',(int)$r['created_at']);$r['completed_at']=$r['completed_at']?gmdate('c',(int)$r['completed_at']):null;return $r;},$stmt->fetchAll());
}
function lmsAccessPublic(PDO $db,int $id): ?array {
    $stmt=$db->prepare('SELECT g.*,u.username,u.must_change_password FROM lms_access_grants g JOIN users u ON u.id=g.user_id WHERE g.registration_id=?');$stmt->execute([$id]);$row=$stmt->fetch();
    if (!$row) return null;
    $state=$row['mail_state'];
    if ($state==='sending' && (int)$row['lease_expires_at']<=time()) $state='unknown';
    $labels=['pending'=>'Chưa gửi email','sending'=>'Đang gửi email','sent'=>'SMTP đã chấp nhận email; chưa xác nhận tới Inbox',
      'failed'=>'Gửi email chưa thành công','unknown'=>'Chưa xác nhận kết quả gửi; kiểm tra hộp thư trước khi gửi lại','expired'=>'Đã hết thời hạn lưu thư tạm'];
    $stmt->closeCursor();
    return ['username'=>$row['username'],'new_account'=>(bool)$row['new_account'],'created_at'=>gmdate('c',(int)$row['created_at']),
      'mail_state'=>$state,'mail_label'=>$labels[$state],'last_error'=>$row['last_error_message'],
      'attempts'=>(int)$row['attempts'],'smtp_accepted_at'=>$row['smtp_accepted_at']?gmdate('c',(int)$row['smtp_accepted_at']):null,
      'can_retry'=>in_array($state,['pending','failed','unknown'],true) && ($row['encrypted_payload']!==null || !(int)$row['must_change_password']),
      'can_reissue'=>$state!=='sending',
      'history'=>lmsAccessHistory($db,$id)];
}
function lmsAccessFailure(PDO $db,array $actor,?int $id,string $action): void {
    if (!$id) return;
    try {
        $stmt=$db->prepare('SELECT 1 FROM lms_registrations WHERE id=?');$stmt->execute([$id]);$exists=$stmt->fetchColumn();$stmt->closeCursor();
        if ($exists) lmsAccessAudit($db,$id,$actor,$action,'failed');
    } catch (Throwable $ignored) {} // Failure reporting must never expose exceptions or secrets.
}
function lmsAccessAudit(PDO $db,int $id,array $actor,string $action,string $result,?string $requestHash=null): void {
    $db->prepare('INSERT INTO lms_access_history(registration_id,actor_id,actor_username,actor_name,action,result,created_at,request_hash) VALUES (?,?,?,?,?,?,?,?)')
      ->execute([$id,$actor['id'],$actor['username'],$actor['fullname'],$action,$result,time(),$requestHash]);
}
function lmsStudentUsername(PDO $db,string $name): string {
    $base=preg_replace('/\s+/u',' ',trim($name));
    for($i=0;$i<200;$i++){
        $prefix=str_pad((string)random_int($i<50?1:100,$i<50?99:99999999),2,'0',STR_PAD_LEFT).' ';
        $username=$prefix.mb_substr($base,0,150-mb_strlen($prefix));
        $stmt=$db->prepare('SELECT 1 FROM users WHERE username=? COLLATE NOCASE');$stmt->execute([$username]);
        if(!$stmt->fetchColumn())return $username;
    }
    lmsAccessError(409,'Chưa cấp được tên đăng nhập duy nhất. Vui lòng thử lại.');
}
function lmsReissueCredentials(PDO $db,string $path,array $actor,array $body,string $key): bool {
    [$id,$ref,$version]=lmsAccessRequest($body,$key);$requestHash=hash('sha256','reissue:'.$actor['id'].':'.$key);
    $db->exec('BEGIN IMMEDIATE');
    try{
        lmsAccessAdmin($db,$actor);
        $prior=lmsContentRow($db,'SELECT registration_id FROM lms_access_history WHERE request_hash=?',[$requestHash]);
        if($prior){if((int)$prior['registration_id']!==$id)lmsAccessError(409,'Mã yêu cầu đã dùng cho hồ sơ khác.');$db->exec('COMMIT');return false;}
        $r=lmsContentRow($db,"SELECT * FROM lms_registrations WHERE id=? AND status='enrolled'",[$id]);
        if(!$r)lmsAccessError(409,'Chỉ cấp lại thông tin cho hồ sơ đã ghi danh.');
        if((int)$r['review_version']!==$version)lmsAccessError(409,'Hồ sơ đã thay đổi. Vui lòng tải lại chi tiết.');
        $g=lmsContentRow($db,'SELECT * FROM lms_access_grants WHERE registration_id=?',[$id]);
        if(!$g)lmsAccessError(409,'Hồ sơ chưa được cấp quyền.');
        $u=lmsContentRow($db,'SELECT * FROM users WHERE id=?',[$g['user_id']]);
        if(!$u||!$u['active']||$u['role']!=='student'||strtolower(trim((string)$u['email']))!==strtolower(trim($r['email'])))lmsAccessError(409,'Tài khoản hoặc email không còn phù hợp với hồ sơ.');
        $stmt=$db->prepare('SELECT COUNT(*) FROM users WHERE lower(trim(email))=?');$stmt->execute([strtolower(trim($r['email']))]);
        $matches=(int)$stmt->fetchColumn();$stmt->closeCursor();
        if($matches!==1)lmsAccessError(409,'Email trùng nhiều tài khoản; cần kiểm tra thủ công.');
        if(!lmsContentRow($db,'SELECT id FROM lms_enrollments WHERE id=? AND user_id=? AND class_code=? AND active=1',[$g['enrollment_id'],$u['id'],$r['class_code']]))lmsAccessError(409,'Ghi danh không còn hiệu lực.');
        if(lmsContentRow($db,"SELECT registration_id FROM lms_access_grants WHERE user_id=? AND mail_state='sending' AND lease_expires_at>?",[$u['id'],time()]))lmsAccessError(409,'Tài khoản đang có email được gửi. Chờ xong rồi thử lại.');
        $username=preg_match('/^[0-9]{2,8} /',$u['username'])?$u['username']:lmsStudentUsername($db,$r['fullname']);$password=rtrim(strtr(base64_encode(random_bytes(24)),'+/','-_'),'=');
        $payload=['recipient'=>strtolower(trim($r['email'])),'username'=>$username,'temporary_password'=>$password,'new_account'=>false,'must_change_password'=>false,'class'=>json_decode($r['class_snapshot'],true,16,JSON_THROW_ON_ERROR),'reference'=>$ref];
        $sealed=lmsAccessSeal($payload,lmsAccessKey($db,$path),$id);
        $db->prepare('UPDATE users SET username=?,password_hash=?,must_change_password=0 WHERE id=?')->execute([$username,password_hash($password,PASSWORD_DEFAULT),$u['id']]);
        // Cancel old pending credential messages for the same account, across all classes.
        $db->prepare("UPDATE lms_access_grants SET encrypted_payload=NULL,lease_hash=NULL,lease_expires_at=NULL,mail_state=CASE WHEN mail_state='sent' THEN 'sent' ELSE 'expired' END WHERE user_id=?")->execute([$u['id']]);
        $ttl=max(3600,min(604800,(int)(getenv('THVP_LMS_ACCESS_MAIL_TTL')?:604800)));
        $db->prepare("UPDATE lms_access_grants SET encrypted_payload=?,payload_expires_at=?,mail_state='pending',smtp_accepted_at=NULL,last_error_code=NULL,last_error_message=NULL WHERE registration_id=?")->execute([$sealed,time()+$ttl,$id]);
        $db->prepare('UPDATE lms_registrations SET review_version=review_version+1 WHERE id=?')->execute([$id]);
        lmsAccessAudit($db,$id,$actor,'reissue_credentials','completed',$requestHash);
        unset($password,$payload);$db->exec('COMMIT');return true;
    }catch(Throwable $e){$db->exec('ROLLBACK');throw $e;}
}
function lmsGrantAccess(PDO $db,string $dbPath,array $actor,array $body,string $key): array {
    [$id,$reference,$version]=lmsAccessRequest($body,$key);$requestHash=hash('sha256','grant:'.$actor['id'].':'.$key);
    $db->exec('BEGIN IMMEDIATE');
    try {
        lmsAccessAdmin($db,$actor);
        $stmt=$db->prepare('SELECT * FROM lms_registrations WHERE id=?');$stmt->execute([$id]);$row=$stmt->fetch();
        if (!$row || lmsRegistration($row)['reference']!==$reference) lmsAccessError(404,'Không tìm thấy hồ sơ.');
        $stmt=$db->prepare('SELECT registration_id FROM lms_access_grants WHERE request_hash=?');$stmt->execute([$requestHash]);$used=$stmt->fetchColumn();
        if ($used && (int)$used!==$id) lmsAccessError(409,'Mã yêu cầu đã dùng cho hồ sơ khác.');
        if (lmsAccessPublic($db,$id)!==null) {$db->exec('COMMIT');return ['created'=>false,'id'=>$id];}
        if ((int)$row['review_version']!==$version) lmsAccessError(409,'Hồ sơ đã thay đổi. Vui lòng mở lại chi tiết.');
        if ($row['status']!=='pending_review' || ($row['review_status'] ?? null)!=='approved_waiting_access') lmsAccessError(409,'Chỉ cấp quyền cho hồ sơ đã xác nhận thanh toán và duyệt.');
        if(!lmsLifecycleAdmission($db,$row))lmsAccessError(409,'Hồ sơ thuộc đợt học đã kết thúc; không thể cấp quyền vào đợt mới.');
        $stmt=$db->prepare("SELECT 1 FROM lms_review_history WHERE registration_id=? AND decision='approve' AND received_vnd=?");$stmt->execute([$id,$row['fee_vnd']]);
        if (!$stmt->fetchColumn()) lmsAccessError(409,'Không có lịch sử xác nhận thanh toán hợp lệ của hồ sơ.');
        $email=strtolower(trim($row['email']));
        if (!filter_var($email,FILTER_VALIDATE_EMAIL)) lmsAccessError(409,'Email trong hồ sơ không hợp lệ; cần xử lý trước khi cấp quyền.');
        $stmt=$db->prepare('SELECT * FROM users WHERE lower(trim(email))=?');$stmt->execute([$email]);$matches=$stmt->fetchAll();
        if (count($matches)>1) lmsAccessError(409,'Email trùng nhiều tài khoản; cần xử lý thủ công, không tự liên kết.');
        $new=count($matches)===0;$temporary=null;
        if (!$new) {
            $user=$matches[0];
            if ($user['role']!=='student') lmsAccessError(409,'Email thuộc tài khoản quản trị hoặc vai trò khác; không tự liên kết.');
            if (!(int)$user['active'] || (!$user['password_hash'] && empty($user['password']))) lmsAccessError(409,'Tài khoản học sinh chưa hoạt động hoặc chưa có mật khẩu; cần xử lý thủ công.');
        } else {
            $temporary=rtrim(strtr(base64_encode(random_bytes(24)),'+/','-_'),'=');
            $username=lmsStudentUsername($db,$row['fullname']);
            $columns=array_column($db->query('PRAGMA table_info(users)')->fetchAll(),'name');
            $legacy=in_array('password',$columns,true);
            $stmt=$db->prepare("INSERT INTO users(username,fullname,email,password_hash,role,active,must_change_password".($legacy?',password':'').") VALUES (?,?,?,?,'student',1,0".($legacy?",''":'').')');
            $stmt->execute([$username,$row['fullname'],$email,password_hash($temporary,PASSWORD_DEFAULT)]);
            $user=['id'=>(int)$db->lastInsertId(),'username'=>$username];
        }
        $stmt=$db->prepare('SELECT * FROM lms_enrollments WHERE class_code=? AND (registration_id=? OR (active=1 AND (user_id=? OR lower(trim(email))=?))) ORDER BY id');
        $stmt->execute([$row['class_code'],$id,$user['id'],$email]);$existing=$stmt->fetchAll();
        if (count($existing)>1) lmsAccessError(409,'Có nhiều ghi danh liên quan; cần kiểm tra thủ công.');
        if ($existing) {
            $enrollment=$existing[0];
            if ($enrollment['user_id']!==null && (int)$enrollment['user_id']!==(int)$user['id']) lmsAccessError(409,'Ghi danh đã liên kết tài khoản khác; không tự chuyển quyền.');
            $enrollmentId=(int)$enrollment['id'];
            $db->prepare('UPDATE lms_enrollments SET user_id=?,email=?,active=1,cycle_id=? WHERE id=?')->execute([$user['id'],$email,$row['cycle_id'],$enrollmentId]);
        } else {
            $db->prepare('INSERT INTO lms_enrollments(class_code,registration_id,email,active,user_id,cycle_id) VALUES (?,?,?,1,?,?)')->execute([$row['class_code'],$id,$email,$user['id'],$row['cycle_id']]);
            $enrollmentId=(int)$db->lastInsertId();
        }
        $db->prepare("UPDATE lms_registrations SET status='enrolled',review_status=NULL,review_reason=NULL,review_version=review_version+1 WHERE id=?")->execute([$id]);
        $stmt=$db->prepare('SELECT capacity FROM lms_classes WHERE code=?');$stmt->execute([$row['class_code']]);$capacity=(int)$stmt->fetchColumn();
        [$active,$holds]=lmsOccupancy($db,$row['class_code'],time());
        if ($active+$holds>$capacity) lmsAccessError(409,'Lớp vượt sức chứa; cần kiểm tra dữ liệu trước khi cấp quyền.');
        $payload=['recipient'=>$email,'username'=>$user['username'],'temporary_password'=>$temporary,
          'class'=>json_decode($row['class_snapshot'],true,16,JSON_THROW_ON_ERROR),'reference'=>$reference,'new_account'=>$new,'direct_login'=>true];
        $envelope=lmsAccessSeal($payload,lmsAccessKey($db,$dbPath),$id);unset($temporary,$payload);
        $ttl=max(3600,min(604800,(int)(getenv('THVP_LMS_ACCESS_MAIL_TTL') ?: 604800)));
        $db->prepare('INSERT INTO lms_access_grants(registration_id,user_id,enrollment_id,new_account,created_at,created_by,request_hash,encrypted_payload,payload_expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
          ->execute([$id,$user['id'],$enrollmentId,$new?1:0,time(),$actor['id'],$requestHash,$envelope,time()+$ttl]);
        lmsAccessAudit($db,$id,$actor,'grant',$new?'new_student':'existing_student');
        $db->exec('COMMIT');return ['created'=>true,'id'=>$id];
    } catch (Throwable $e) {$db->exec('ROLLBACK');throw $e;}
}

function lmsSendAccessMail(PDO $db,string $dbPath,array $actor,int $id,string $key): void {
    $requestHash=hash('sha256','access-mail:'.$actor['id'].':'.$key);$lease=bin2hex(random_bytes(32));
    $db->exec('BEGIN IMMEDIATE');
    try {
        lmsAccessAdmin($db,$actor);
        $stmt=$db->prepare('SELECT registration_id FROM lms_access_history WHERE request_hash=?');$stmt->execute([$requestHash]);$used=$stmt->fetchColumn();
        $stmt->closeCursor();
        if ($used) {
            if ((int)$used!==$id) lmsAccessError(409,'Mã gửi email đã dùng cho hồ sơ khác.');
            $db->exec('COMMIT');return;
        }
        $stmt=$db->prepare('SELECT * FROM lms_access_grants WHERE registration_id=?');$stmt->execute([$id]);$grant=$stmt->fetch();
        $stmt->closeCursor();
        if (!$grant) lmsAccessError(409,'Hồ sơ chưa được cấp quyền học.');
        if (in_array($grant['mail_state'],['sent','expired'],true) || ($grant['mail_state']==='sending' && (int)$grant['lease_expires_at']>time())) {$db->exec('COMMIT');return;}
        if ($grant['encrypted_payload']===null) {
            $stmt=$db->prepare('SELECT must_change_password FROM users WHERE id=?');$stmt->execute([$grant['user_id']]);
            $mustChange=(int)$stmt->fetchColumn();$stmt->closeCursor();
            if ($mustChange) lmsAccessError(409,'Không còn nội dung thư chờ gửi an toàn.');
        }
        $db->prepare("UPDATE lms_access_grants SET mail_state='sending',lease_hash=?,lease_expires_at=?,attempts=attempts+1,last_error_code=NULL,last_error_message=NULL WHERE registration_id=?")
          ->execute([hash('sha256',$lease),time()+300,$id]);
        lmsAccessAudit($db,$id,$actor,'mail_attempt','sending',$requestHash);
        $db->exec('COMMIT');
    } catch (Throwable $e) {$db->exec('ROLLBACK');throw $e;}
    $state='sent';$errorCode=null;$errorMessage=null;
    try {
        $configuration=lmsMailConfiguration($dbPath);
        if (!$configuration['configured']) throw new LmsMailError(422,'mail_configuration','Cấu hình SMTP chưa sẵn sàng. Kiểm tra tại mục Kiểm tra email.');
        if ($grant['encrypted_payload']!==null) $payload=lmsAccessOpen($grant['encrypted_payload'],lmsAccessKey($db,$dbPath),$id);
        else {
            $stmt=$db->prepare('SELECT r.email,r.class_snapshot,u.username FROM lms_registrations r JOIN lms_access_grants g ON g.registration_id=r.id JOIN users u ON u.id=g.user_id WHERE r.id=?');$stmt->execute([$id]);$source=$stmt->fetch();
            $stmt->closeCursor();
            $payload=['recipient'=>strtolower(trim($source['email'])),'username'=>$source['username'],'temporary_password'=>null,
              'new_account'=>false,'class'=>json_decode($source['class_snapshot'],true,16,JSON_THROW_ON_ERROR)];
        }
        $stmt=$db->prepare('SELECT * FROM users WHERE id=?');$stmt->execute([$grant['user_id']]);$user=$stmt->fetch();
        $stmt->closeCursor(); // No SQLite read cursor/lock may remain open while waiting on SMTP.
        if (!$user || !(int)$user['active'] || $user['role']!=='student' || strtolower(trim((string)$user['email']))!==$payload['recipient']) lmsAccessError(409,'Tài khoản hoặc email đã thay đổi; không gửi thư cũ.');
        $payload['username']=$user['username'];
        $payload['must_change_password']=(bool)$user['must_change_password'];
        if ($payload['temporary_password']!==null && !password_verify($payload['temporary_password'],$user['password_hash'])) {
            // Never send an obsolete password after a successful first change or administrative reset.
            $db->prepare('UPDATE lms_access_grants SET encrypted_payload=NULL WHERE registration_id=? AND lease_hash=?')->execute([$id,hash('sha256',$lease)]);
            if ((int)$user['must_change_password']) lmsAccessError(409,'Mật khẩu tạm đã được thay đổi ngoài luồng; cần kiểm tra tài khoản, không gửi thông tin cũ.');
            $payload['temporary_password']=null;$payload['new_account']=false;
        }
        $parts=lmsAccessMailContent($payload,$configuration['config']['base_url']);
        lmsSendMail($configuration['config'],$payload['recipient'],$parts['subject'],$parts['html'],$parts['text']);
        unset($payload,$parts);
    } catch (LmsMailError $e) {$state=$e->errorCode==='smtp_timeout'?'unknown':'failed';$errorCode=$e->errorCode;$errorMessage=$e->getMessage();}
    catch (LmsAccessError $e) {$state='failed';$errorCode='access_mail';$errorMessage=$e->getMessage();}
    catch (Throwable $e) {$state='failed';$errorCode='mail_internal';$errorMessage='Chưa gửi được thư; tài khoản và ghi danh đã lưu. Vui lòng kiểm tra lại.';}
    $db->exec('BEGIN IMMEDIATE');
    try {
        $stmt=$db->prepare('UPDATE lms_access_grants SET mail_state=?,last_error_code=?,last_error_message=?,smtp_accepted_at=?,
          encrypted_payload=CASE WHEN ?=\'sent\' THEN NULL ELSE encrypted_payload END,lease_hash=NULL,lease_expires_at=NULL
          WHERE registration_id=? AND lease_hash=?');
        $stmt->execute([$state,$errorCode,$errorMessage,$state==='sent'?time():null,$state,$id,hash('sha256',$lease)]);
        $db->prepare('UPDATE lms_access_history SET result=?,error_code=?,completed_at=? WHERE request_hash=?')->execute([$state,$errorCode,time(),$requestHash]);
        $db->exec('COMMIT');
    } catch (Throwable $e) {$db->exec('ROLLBACK');lmsAccessError(503,'Tài khoản và ghi danh đã lưu; chưa xác nhận được kết quả SMTP. Mở lại hồ sơ trước khi thử gửi lại.');}
}

function lmsAccessMailContent(array $payload,string $base): array {
    $login=rtrim($base,'/').'/dang-nhap-hoc-sinh.html';
    $c=$payload['class'];
    $text="Bạn đã được ghi danh vào lớp {$c['code']} — {$c['course_name']}.\nGiáo viên: {$c['teacher']}\nLịch học: {$c['days']} · {$c['time']}\nTên đăng nhập: {$payload['username']}\n";
    if ($payload['temporary_password']!==null) {
        $text.="Mật khẩu: {$payload['temporary_password']}\n";
        $text.=!empty($payload['must_change_password'])?"Tài khoản cũ cần đổi mật khẩu theo thiết lập hiện tại.\n":"Bạn có thể đăng nhập và vào lớp ngay bằng thông tin này.\n";
    }
    else $text.="Tài khoản này đã tồn tại. Nếu bạn chưa có mật khẩu hoặc chưa đăng nhập được, hãy yêu cầu giáo viên chọn Cấp lại thông tin đăng nhập và gửi email trong hồ sơ để nhận mật khẩu mới.\n";
    $change=$login.'?doi-mat-khau=1';
    $text.="Đăng nhập: $login\nĐổi mật khẩu (không bắt buộc): $change\nSau khi đăng nhập, bạn cũng có thể chọn Tài khoản → Đổi mật khẩu.\n";
    $host=strtolower((string)parse_url($base,PHP_URL_HOST));
    if (in_array($host,['localhost','127.0.0.1','::1','[::1]'],true)) $text.="Lưu ý: localhost/địa chỉ loopback chỉ truy cập được trên máy đang chạy server. Cần URL triển khai để đăng nhập từ máy khác.\n";
    $safe=htmlspecialchars($text,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    return ['subject'=>'Thông tin lớp học LMS — '.$c['code'],'text'=>$text,
      'html'=>'<!doctype html><html lang="vi"><meta charset="UTF-8"><body><h1>Thông tin lớp học LMS</h1><p>'.nl2br($safe).'</p><p><a href="'.htmlspecialchars($login,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8').'">Đăng nhập học sinh</a></p><p><a href="'.htmlspecialchars($change,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8').'">Đổi mật khẩu ngay (tùy chọn)</a></p></body></html>'];
}
