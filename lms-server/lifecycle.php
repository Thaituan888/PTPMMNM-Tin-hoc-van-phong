<?php
declare(strict_types=1);
function lmsInitLifecycle(PDO $db): void {
    $db->exec(file_get_contents(__DIR__.'/lifecycle-migration.sql'));
    foreach(['lms_registrations','lms_enrollments'] as $table){
        $cols=array_column($db->query('PRAGMA table_info('.$table.')')->fetchAll(),'name');
        if(!in_array('cycle_id',$cols,true))$db->exec('ALTER TABLE '.$table.' ADD COLUMN cycle_id INTEGER NOT NULL DEFAULT 1');
    }
    if(!$db->query("SELECT 1 FROM lms_schema_migrations WHERE name='class_lifecycle_v1'")->fetchColumn()){
        $db->exec("DROP INDEX IF EXISTS lms_one_email_hold; CREATE UNIQUE INDEX lms_one_email_hold ON lms_registrations(class_code,email,cycle_id) WHERE status IN ('pending_payment','pending_review')");
        $db->prepare('INSERT INTO lms_schema_migrations(name,applied_at) VALUES (?,?)')->execute(['class_lifecycle_v1',time()]);
    }
}
function lmsLifecycle(PDO $db,string $code): array {
    return lmsContentRow($db,'SELECT * FROM lms_class_lifecycle WHERE class_code=?',[$code])?:['class_code'=>$code,'cycle_id'=>1,'state'=>'ready','starts_at'=>null,'revision'=>0];
}
function lmsLifecycleAdmission(PDO $db,array $row): bool {
    $life=lmsLifecycle($db,$row['class_code']);
    return $life['state']!=='completed'&&(int)($row['cycle_id']??1)===(int)$life['cycle_id'];
}
function lmsLifecycleSummary(PDO $db,string $code): array {
    $life=lmsLifecycle($db,$code);$class=lmsContentRow($db,'SELECT registration_open,days,time FROM lms_classes WHERE code=?',[$code]);
    $events=$db->prepare('SELECT id,cycle_id,action,created_at,snapshot,actor_id FROM lms_class_events WHERE class_code=? ORDER BY id DESC');$events->execute([$code]);$rows=$events->fetchAll();$events->closeCursor();
    foreach($rows as &$event){$event['mail']=lmsClassMailCounts($db,(int)$event['id']);$event['snapshot']=json_decode($event['snapshot'],true);}
    unset($event);
    $students=lmsContentRow($db,'SELECT COUNT(*) AS n FROM lms_enrollments WHERE class_code=? AND cycle_id=? AND active=1',[$code,$life['cycle_id']]);
    return ['lifecycle'=>$life,'registration_open'=>(bool)$class['registration_open'],'active_students'=>(int)$students['n'],'events'=>$rows];
}
function lmsClassMailCounts(PDO $db,int $event): array {
    $counts=['pending'=>0,'sending'=>0,'sent'=>0,'failed'=>0,'unknown'=>0,'total'=>0];
    $stmt=$db->prepare("SELECT CASE WHEN state='sending' AND lease_expires_at<=? THEN 'unknown' ELSE state END AS state,COUNT(*) AS n FROM lms_class_mail WHERE event_id=? GROUP BY 1");$stmt->execute([time(),$event]);
    foreach($stmt->fetchAll() as $r){$counts[$r['state']]=(int)$r['n'];$counts['total']+=(int)$r['n'];}
    $stmt=$db->prepare("SELECT error_code,COUNT(*) AS n FROM lms_class_mail WHERE event_id=? AND state IN ('failed','unknown') AND error_code IS NOT NULL GROUP BY error_code");$stmt->execute([$event]);$counts['errors']=[];
    foreach($stmt->fetchAll() as $r)$counts['errors'][$r['error_code']]=(int)$r['n'];return $counts;
}
function lmsClassTransition(PDO $db,array $actor,array $body,string $key): int {
    if(!preg_match('/^[A-Za-z0-9_-]{32,128}$/D',$key))lmsContentError(422,'Mã yêu cầu không hợp lệ.');
    $code=$body['class_code']??'';if(!is_string($code))lmsContentError(422,'Mã lớp không hợp lệ.');
    $version=lmsContentInt($body,'version',0);$action=$body['action']??'';$date=$body['start_date']??'';
    if(!in_array($action,['start','complete','reopen','close_registration'],true)||!is_string($date))lmsContentError(422,'Thao tác lớp không hợp lệ.');
    $request=hash('sha256','class:'.$actor['id'].':'.$key);$hash=hash('sha256',json_encode([$code,$version,$action,$date]));
    lmsBeginWrite($db);
    try{
        lmsAccessAdmin($db,$actor);$class=lmsLearningClass($db,$actor,$code);
        $prior=lmsContentRow($db,'SELECT id,payload_hash FROM lms_class_events WHERE request_hash=?',[$request]);
        if($prior){if(!hash_equals($prior['payload_hash'],$hash))lmsContentError(409,'Mã yêu cầu đã dùng cho thao tác khác.');$db->exec('COMMIT');return (int)$prior['id'];}
        $life=lmsLifecycle($db,$code);lmsContentVersion((int)$life['revision'],$version);
        $cycle=(int)$life['cycle_id'];$state=$life['state'];$starts=$life['starts_at'];$now=time();$recipients=[];
        $open=(int)lmsContentRow($db,'SELECT registration_open FROM lms_classes WHERE code=?',[$code])['registration_open'];
        if(in_array($action,['start','complete'],true)){
            $stmt=$db->prepare("SELECT e.id,e.user_id,e.email,u.active,u.role,COALESCE(r.fullname,u.fullname) AS fullname FROM lms_enrollments e LEFT JOIN users u ON u.id=e.user_id LEFT JOIN lms_registrations r ON r.id=e.registration_id WHERE e.class_code=? AND e.active=1 AND e.cycle_id=? ORDER BY e.id");$stmt->execute([$code,$cycle]);$recipients=$stmt->fetchAll();$stmt->closeCursor();
            foreach($recipients as $r)if(!$r['user_id']||!$r['active']||$r['role']!=='student'||!filter_var($r['email'],FILTER_VALIDATE_EMAIL)||!is_string($r['fullname'])||trim($r['fullname'])==='')lmsContentError(409,'Có ghi danh thiếu tài khoản học sinh, họ tên hoặc email hợp lệ. Cần xử lý trước khi gửi thông báo.');
        }
        if($action==='start'){
            if($state!=='ready')lmsContentError(409,'Đợt học này đã khai giảng hoặc đã bế giảng.');
            $start=DateTimeImmutable::createFromFormat('!Y-m-d',$date,new DateTimeZone('Asia/Ho_Chi_Minh'));
            if(!$start||$start->format('Y-m-d')!==$date)lmsContentError(422,'Chọn ngày bắt đầu hợp lệ.');
            $iso=(int)$start->format('N');$day=$iso===7?'chủ nhật':'thứ '.($iso+1);
            if(!str_contains(mb_strtolower($class['days']),$day))lmsContentError(422,'Ngày bắt đầu phải khớp lịch học của lớp: '.$class['days'].'.');
            if(!preg_match('/^(\d{2}):(\d{2})/',$class['time'],$m))lmsContentError(422,'Giờ học của lớp chưa hợp lệ.');
            $starts=$start->setTime((int)$m[1],(int)$m[2])->getTimestamp();if($starts<$now)lmsContentError(422,'Buổi bắt đầu phải ở hiện tại hoặc tương lai.');
            $state='started';$open=0;
        }elseif($action==='complete'){
            if($state!=='started')lmsContentError(409,'Chỉ bế giảng đợt học đã khai giảng.');
            $state='completed';$open=0;
        }elseif($action==='reopen'){
            if($open)lmsContentError(409,'Đăng ký đã được mở.');
            if($state==='completed'){$cycle++;$state='ready';$starts=null;}
            $open=1;
        }else{
            if(!$open)lmsContentError(409,'Đăng ký đã đóng.');$open=0;
        }
        $snapshot=['course_name'=>$class['course_name'],'class_code'=>$code,'teacher'=>$class['teacher'],'days'=>$class['days'],'time'=>$class['time'],'starts_at'=>$starts,'state'=>$state];
        $db->prepare('INSERT INTO lms_class_events(class_code,cycle_id,action,snapshot,actor_id,created_at,from_version,to_version,request_hash,payload_hash) VALUES (?,?,?,?,?,?,?,?,?,?)')->execute([$code,$cycle,$action,json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$actor['id'],$now,$version,$version+1,$request,$hash]);$event=(int)$db->lastInsertId();
        $db->prepare(lmsIsMySQL($db) ? 'INSERT INTO lms_class_lifecycle(class_code,cycle_id,state,starts_at,revision,updated_at,updated_by) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE cycle_id=VALUES(cycle_id),state=VALUES(state),starts_at=VALUES(starts_at),revision=VALUES(revision),updated_at=VALUES(updated_at),updated_by=VALUES(updated_by)' : 'INSERT INTO lms_class_lifecycle(class_code,cycle_id,state,starts_at,revision,updated_at,updated_by) VALUES (?,?,?,?,?,?,?) ON CONFLICT(class_code) DO UPDATE SET cycle_id=excluded.cycle_id,state=excluded.state,starts_at=excluded.starts_at,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by')->execute([$code,$cycle,$state,$starts,$version+1,$now,$actor['id']]);
        $db->prepare('UPDATE lms_classes SET registration_open=?,opening_date=? WHERE code=?')->execute([$open,$starts?(new DateTimeImmutable('@'.$starts))->setTimezone(new DateTimeZone('Asia/Ho_Chi_Minh'))->format('Y-m-d'):null,$code]);
        foreach($recipients as $r){
            $certificate=null;
            if($action==='complete'){
                $db->prepare('INSERT INTO lms_certificates(event_id,enrollment_id,user_id,class_code,cycle_id,fullname,course_name,issued_at,storage_key) VALUES (?,?,?,?,?,?,?,?,?)')->execute([$event,$r['id'],$r['user_id'],$code,$cycle,$r['fullname'],$class['course_name'],$now,bin2hex(random_bytes(32)).'.png']);$certificate=(int)$db->lastInsertId();
            }
            $db->prepare('INSERT INTO lms_class_mail(event_id,enrollment_id,user_id,recipient,fullname,certificate_id,created_at) VALUES (?,?,?,?,?,?,?)')->execute([$event,$r['id'],$r['user_id'],$r['email'],$r['fullname'],$certificate,$now]);
        }
        if($action==='complete')$db->prepare('UPDATE lms_enrollments SET active=0 WHERE class_code=? AND cycle_id=? AND active=1')->execute([$code,$cycle]);
        $db->exec('COMMIT');return $event;
    }catch(Throwable $e){$db->exec('ROLLBACK');throw $e;}
}
