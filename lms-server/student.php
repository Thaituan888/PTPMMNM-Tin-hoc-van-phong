<?php
declare(strict_types=1);
function lmsRequireStudent(?array $actor): void {
    if (!$actor) fail(401,'Vui lòng đăng nhập học sinh.');
    if ($actor['role']!=='student') fail(403,'Chức năng này dành cho tài khoản học sinh.');
    if ($actor['must_change_password']) reply(423,['error'=>'Bạn phải đổi mật khẩu tạm trước khi truy cập lớp học.','code'=>'password_change_required']);
}
function lmsStudentClasses(PDO $db,int $id,?string $code=null): array {
    $stmt=$db->prepare("SELECT c.code,c.course_name,c.teacher,c.days,c.time,c.opening_date,
      EXISTS(SELECT 1 FROM lms_topics t JOIN lms_text_lessons l ON l.topic_id=t.id WHERE t.class_code=c.code AND t.visible=1 AND l.status='published') AS content_available
      FROM lms_classes c JOIN lms_enrollments e ON e.class_code=c.code
      WHERE e.user_id=? AND e.active=1 AND e.cycle_id=COALESCE((SELECT cycle_id FROM lms_class_lifecycle WHERE class_code=c.code),1)
      AND COALESCE((SELECT state FROM lms_class_lifecycle WHERE class_code=c.code),'ready')<>'completed'".($code!==null?' AND c.code=?':'').' ORDER BY c.code');
    $stmt->execute($code===null?[$id]:[$id,$code]);$rows=$stmt->fetchAll();
    if ($code!==null && !$rows) fail(404,'Không có quyền truy cập lớp này hoặc ghi danh không còn hoạt động.');
    return array_map(function($row){
        $row['content_available']=(bool)$row['content_available'];
        $row['message']=$row['content_available']?'Vào lớp để xem nội dung đã xuất bản.':'Nội dung lớp học đang được cập nhật.';
        return $row;
    },$rows);
}
function lmsStudentPassword(PDO $db,array $actor,array $body): array {
    $current=$body['current_password'] ?? null;$next=$body['new_password'] ?? null;
    if (!is_string($current) || !is_string($next) || strlen($current)>1024 || !mb_check_encoding($next,'UTF-8') ||
      mb_strlen($next)<12 || strlen($next)>72 || preg_match('/^[\s]+$|[\x00-\x1F\x7F]/u',$next) || $next===$current) fail(422,'Mật khẩu mới phải khác mật khẩu hiện tại, có ít nhất 12 ký tự, tối đa 72 byte UTF-8 và không có ký tự điều khiển.');
    lmsBeginWrite($db);
    try {
        $stmt=$db->prepare('SELECT * FROM users WHERE id=?');$stmt->execute([$actor['id']]);$user=$stmt->fetch();
        if (!$user || $user['role']!=='student' || !(int)$user['active']) lmsAccessError(403,'Tài khoản không có quyền đổi mật khẩu học sinh.');
        if (!password_verify($current,$user['password_hash'])) lmsAccessError(422,'Mật khẩu hiện tại không chính xác.');
        if(lmsContentRow($db,"SELECT registration_id FROM lms_access_grants WHERE user_id=? AND mail_state='sending' AND lease_expires_at>?",[$user['id'],time()]))lmsAccessError(409,'Thông tin đăng nhập đang được gửi qua email. Vui lòng chờ gửi xong rồi đổi mật khẩu.');
        $hash=password_hash($next,PASSWORD_DEFAULT);
        $db->prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?')->execute([$hash,$user['id']]);
        // A temporary password is no longer needed after the first successful change.
        $db->prepare('UPDATE lms_access_grants SET encrypted_payload=NULL WHERE user_id=?')->execute([$user['id']]);
        $stmt=$db->prepare('SELECT registration_id FROM lms_access_grants WHERE user_id=?');$stmt->execute([$user['id']]);
        foreach ($stmt->fetchAll() as $grant) lmsAccessAudit($db,(int)$grant['registration_id'],$actor,'password_changed','completed');
        $db->exec('COMMIT');$user['password_hash']=$hash;$user['must_change_password']=0;return $user;
    } catch (Throwable $e) {$db->exec('ROLLBACK');throw $e;}
}
