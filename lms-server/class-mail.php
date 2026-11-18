<?php
declare(strict_types=1);
function lmsSendClassMail(PDO $db,string $path,array $actor,int $eventId,bool $retry,string $key): array {
    $lease=bin2hex(random_bytes(32));$now=time();lmsBeginWrite($db);
    try{
        lmsAccessAdmin($db,$actor);$event=lmsContentRow($db,'SELECT * FROM lms_class_events WHERE id=?',[$eventId]);
        if(!$event)lmsContentError(404,'Không tìm thấy đợt thông báo.');
        if($event['action']==='start'){$current=lmsLifecycle($db,$event['class_code']);if($current['state']!=='started'||(int)$current['cycle_id']!==(int)$event['cycle_id'])lmsContentError(409,'Thông báo khai giảng này thuộc đợt đã kết thúc.');}
        $db->prepare("UPDATE lms_class_mail SET state='unknown',error_code='smtp_unknown',lease_hash=NULL,lease_expires_at=NULL WHERE event_id=? AND state='sending' AND lease_expires_at<=?")->execute([$eventId,$now]);
        if($retry){
            if(!preg_match('/^[A-Za-z0-9_-]{32,128}$/D',$key))lmsContentError(422,'Mã yêu cầu gửi lại không hợp lệ.');
            $hash=hash('sha256','class-retry:'.$actor['id'].':'.$key);
            $prior=lmsContentRow($db,'SELECT event_id FROM lms_class_mail_retries WHERE request_hash=?',[$hash]);
            if($prior&&(int)$prior['event_id']!==$eventId)lmsContentError(409,'Mã yêu cầu đã được dùng.');
            if(!$prior){$db->prepare("UPDATE lms_class_mail SET state='pending',error_code=NULL WHERE event_id=? AND state IN ('failed','unknown')")->execute([$eventId]);$db->prepare('INSERT INTO lms_class_mail_retries(request_hash,event_id) VALUES (?,?)')->execute([$hash,$eventId]);}
        }
        $job=lmsContentRow($db,"SELECT * FROM lms_class_mail WHERE event_id=? AND state='pending' ORDER BY id LIMIT 1",[$eventId]);
        if(!$job){$db->exec('COMMIT');return lmsClassMailCounts($db,$eventId);}
        $db->prepare("UPDATE lms_class_mail SET state='sending',attempts=attempts+1,lease_hash=?,lease_expires_at=? WHERE id=?")->execute([hash('sha256',$lease),$now+300,$job['id']]);$db->exec('COMMIT');
    }catch(Throwable $e){$db->exec('ROLLBACK');throw $e;}
    $state='sent';$error=null;
    try{
        $current=lmsContentRow($db,'SELECT u.active,u.role,u.email,e.email AS enrollment_email,e.active AS enrolled,e.class_code,e.cycle_id FROM users u JOIN lms_enrollments e ON e.user_id=u.id WHERE u.id=? AND e.id=?',[$job['user_id'],$job['enrollment_id']]);
        if(!$current||!$current['active']||$current['role']!=='student'||strtolower(trim((string)$current['email']))!==strtolower(trim($job['recipient']))||strtolower(trim($current['enrollment_email']))!==strtolower(trim($job['recipient']))||$current['class_code']!==$event['class_code']||(int)$current['cycle_id']!==(int)$event['cycle_id']||($event['action']==='start'&&!$current['enrolled']))throw new LmsMailError(409,'recipient_changed','Tài khoản hoặc email học sinh đã thay đổi; không gửi thư cũ.');
        $configuration=lmsMailConfiguration($path);if(!$configuration['configured'])throw new LmsMailError(422,'mail_configuration','SMTP chưa được cấu hình hợp lệ.');
        $snapshot=json_decode($event['snapshot'],true,16,JSON_THROW_ON_ERROR);$attachments=[];
        if($event['action']==='start'){
            $date=(new DateTimeImmutable('@'.$snapshot['starts_at']))->setTimezone(new DateTimeZone('Asia/Ho_Chi_Minh'))->format('d/m/Y H:i');
            $subject='Khai giảng lớp '.$event['class_code'].' — '.$snapshot['course_name'];
            $text="Chào {$job['fullname']},\nLớp {$event['class_code']} — {$snapshot['course_name']} đã được mở.\nBuổi đầu tiên: $date (giờ Việt Nam).\nLịch học: {$snapshot['days']} · {$snapshot['time']}.\nGiáo viên: {$snapshot['teacher']}.\nLớp tạm ngừng nhận đăng ký mới.\n";
        }else{
            $subject='Chúc mừng hoàn thành khóa học — '.$snapshot['course_name'];
            $text="Chào {$job['fullname']},\nLớp {$event['class_code']} — {$snapshot['course_name']} đã bế giảng.\nTrung tâm Tin học văn phòng chúc mừng và công nhận bạn đã hoàn thành khóa học.\nGiấy chứng nhận mang họ tên của bạn được đính kèm email này. Quyền truy cập nội dung đợt học đã kết thúc.\n";
            $cert=lmsContentRow($db,'SELECT * FROM lms_certificates WHERE id=?',[$job['certificate_id']]);if(!$cert)lmsContentError(503,'Không tìm thấy chứng nhận.');
            $file=lmsCertificateFile($path,$cert);$attachments[]=['data'=>file_get_contents($file),'name'=>'chung-nhan-THVP-'.str_pad((string)$cert['id'],8,'0',STR_PAD_LEFT).'.png','mime'=>'image/png'];
        }
        $url=$configuration['config']['base_url'].'/lop-hoc-cua-toi.html';$text.="Lớp học và chứng nhận của tôi: $url\n";
        if(in_array(parse_url($url,PHP_URL_HOST),['127.0.0.1','localhost','::1'],true))$text.="Địa chỉ localhost chỉ truy cập trên máy đang chạy website.\n";
        $html='<!doctype html><html lang="vi"><meta charset="UTF-8"><body><h1>'.htmlspecialchars($subject,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8').'</h1><p>'.nl2br(htmlspecialchars($text,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8')).'</p></body></html>';
        lmsSendMail($configuration['config'],$job['recipient'],$subject,$html,$text,$attachments);
    }catch(LmsMailError $e){$state=$e->errorCode==='smtp_timeout'?'unknown':'failed';$error=$e->errorCode;}
    catch(LmsContentError $e){$state='failed';$error='certificate_unavailable';}
    catch(Throwable $e){$state='failed';$error='certificate_or_mail';}
    $db->prepare('UPDATE lms_class_mail SET state=?,error_code=?,sent_at=?,lease_hash=NULL,lease_expires_at=NULL WHERE id=? AND lease_hash=?')->execute([$state,$error,$state==='sent'?time():null,$job['id'],hash('sha256',$lease)]);
    return lmsClassMailCounts($db,$eventId);
}
