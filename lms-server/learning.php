<?php
declare(strict_types=1);

final class LmsContentError extends RuntimeException {
    public function __construct(public int $httpStatus,string $message) {parent::__construct($message);}
}
function lmsContentError(int $status,string $message): never {throw new LmsContentError($status,$message);}
function lmsContentCanEdit(?array $actor): bool {
    return $actor && $actor['role']==='admin' && in_array(strtolower($actor['username']),['giaovien1','giaovien2','giaovien3'],true);
}
function lmsContentRow(PDO $db,string $sql,array $params): array|false {
    $stmt=$db->prepare($sql);$stmt->execute($params);$row=$stmt->fetch();$stmt->closeCursor();return $row;
}
function lmsLearningClass(PDO $db,?array $actor,string $code): array {
    if (!$actor) lmsContentError(401,'Vui lòng đăng nhập để vào lớp.');
    if (!preg_match('/^(CB|NC)-0[123]$/D',$code)) lmsContentError(404,'Mã lớp không hợp lệ.');
    if (lmsContentCanEdit($actor)) {
        $row=lmsContentRow($db,'SELECT code,course_name,teacher,days,time,opening_date FROM lms_classes WHERE code=?',[$code]);
    } else {
        if ($actor['role']!=='student') lmsContentError(403,'Tài khoản không có quyền truy cập lớp học.');
        if ($actor['must_change_password']) lmsContentError(423,'Bạn phải đổi mật khẩu tạm trước khi vào lớp.');
        $row=lmsContentRow($db,'SELECT c.code,c.course_name,c.teacher,c.days,c.time,c.opening_date FROM lms_classes c
          JOIN lms_enrollments e ON e.class_code=c.code WHERE c.code=? AND e.user_id=? AND e.active=1 AND e.cycle_id=COALESCE((SELECT cycle_id FROM lms_class_lifecycle WHERE class_code=c.code),1) AND COALESCE((SELECT state FROM lms_class_lifecycle WHERE class_code=c.code),\'ready\')<>\'completed\'',[$code,$actor['id']]);
    }
    if (!$row) lmsContentError(404,'Không có quyền truy cập lớp này hoặc ghi danh không còn hiệu lực.');
    return $row;
}
function lmsLearningClasses(PDO $db,?array $actor,string $scope='all'): array {
    if (!$actor) lmsContentError(401,'Vui lòng đăng nhập để xem lớp học.');
    if (!in_array($scope,['all','mine'],true)) lmsContentError(422,'Phạm vi danh sách lớp không hợp lệ.');
    if (lmsContentCanEdit($actor)) {
        $stmt=$db->prepare('SELECT code,course_name,teacher,days,time,opening_date FROM lms_classes'.($scope==='mine'?' WHERE teacher=?':'').' ORDER BY code');
        $stmt->execute($scope==='mine'?[$actor['fullname']]:[]);return $stmt->fetchAll();
    }
    if ($actor['role']!=='student') lmsContentError(403,'Tài khoản không có quyền xem lớp học.');
    if ($actor['must_change_password']) lmsContentError(423,'Bạn phải đổi mật khẩu tạm trước khi vào lớp.');
    return lmsStudentClasses($db,$actor['id']);
}
function lmsLearningPage(PDO $db,string $code): array {
    $row=lmsContentRow($db,'SELECT introduction,online_title,online_url,revision,structure_revision FROM lms_class_pages WHERE class_code=?',[$code]);
    return $row ?: ['introduction'=>'','online_title'=>'','online_url'=>'','revision'=>0,'structure_revision'=>0];
}
function lmsLearningRead(PDO $db,?array $actor,string $code,bool $editing,?int $lessonId=null): array {
    $db->exec('BEGIN');
    try {
        $class=lmsLearningClass($db,$actor,$code);$canEdit=lmsContentCanEdit($actor);
        if ($editing && !$canEdit) lmsContentError(403,'Chỉ giáo viên quản trị mới được xem bản nháp hoặc bật chỉnh sửa.');
        if ($lessonId!==null) {
            $row=lmsContentRow($db,'SELECT l.id,l.topic_id,l.title,l.body,l.status,l.revision FROM lms_text_lessons l
              JOIN lms_topics t ON t.id=l.topic_id WHERE l.id=? AND t.class_code=?'.($editing?'':" AND t.visible=1 AND l.status='published'"),[$lessonId,$code]);
            if (!$row) lmsContentError(404,'Không tìm thấy bài đã xuất bản trong lớp này.');
            $db->exec('COMMIT');return ['class'=>$class,'lesson'=>$row,'can_edit'=>$canEdit];
        }
        $page=lmsLearningPage($db,$code);
        $stmt=$db->prepare('SELECT id,title,description,position,visible,revision FROM lms_topics WHERE class_code=?'.($editing?'':' AND visible=1').' ORDER BY position,id');$stmt->execute([$code]);$topics=$stmt->fetchAll();$stmt->closeCursor();
        $stmt=$db->prepare('SELECT l.id,l.topic_id,l.title,l.body,l.status,l.revision FROM lms_text_lessons l JOIN lms_topics t ON t.id=l.topic_id WHERE t.class_code=?'
          .($editing?'':" AND t.visible=1 AND l.status='published'").' ORDER BY l.id');$stmt->execute([$code]);$lessons=$stmt->fetchAll();$stmt->closeCursor();
        foreach ($topics as &$topic) $topic['lessons']=array_values(array_filter($lessons,fn($lesson)=>(int)$lesson['topic_id']===(int)$topic['id']));
        unset($topic);
        $life=lmsLifecycle($db,$code);$db->exec('COMMIT');return ['class'=>$class,'page'=>$page,'topics'=>$topics,'can_edit'=>$canEdit,'editing'=>$editing,'lifecycle'=>$life];
    } catch (Throwable $e) {$db->exec('ROLLBACK');throw $e;}
}
function lmsContentText(array $body,string $key,int $limit,bool $required=false): string {
    $labels=['introduction'=>'Giới thiệu lớp','online_title'=>'Tên liên kết','online_url'=>'URL học online','title'=>'Tiêu đề','description'=>'Mô tả','body'=>'Nội dung'];$label=$labels[$key] ?? $key;
    $text=$body[$key] ?? null;
    if (!is_string($text) || !mb_check_encoding($text,'UTF-8') || mb_strlen($text)>$limit || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u',$text)) lmsContentError(422,"$label phải là văn bản thuần, tối đa $limit ký tự.");
    $text=str_replace(["\r\n","\r"],"\n",$text);
    if ($required && preg_match('/^\s*$/u',$text)) lmsContentError(422,"Vui lòng nhập $label.");
    return $text;
}
function lmsContentInt(array $body,string $key,int $min=1): int {
    if (!is_int($body[$key] ?? null) || $body[$key]<$min) lmsContentError(422,"Trường $key không hợp lệ.");
    return $body[$key];
}
function lmsContentVersion(int $actual,int $expected): void {
    if ($actual!==$expected) lmsContentError(409,'Nội dung đã được giáo viên khác cập nhật. Hãy tải lại trước khi lưu; phần đang nhập chưa bị thay thế.');
}
function lmsContentOnline(string $title,string $url): void {
    if ($title==='' && $url==='') return;
    $parts=parse_url($url);
    if ($title==='' || $url==='' || !filter_var($url,FILTER_VALIDATE_URL) || !$parts ||
      !in_array(strtolower($parts['scheme'] ?? ''),['http','https'],true) || empty($parts['host']) ||
      isset($parts['user']) || isset($parts['pass']) || preg_match('/[\x00-\x20\x7F]/',$url)) {
        lmsContentError(422,'Liên kết online cần tên hiển thị và URL HTTP/HTTPS hợp lệ, không chứa tài khoản hoặc khoảng trắng.');
    }
}
function lmsContentWrite(PDO $db,?array $actor,string $action,array $body): void {
    if (!$actor) lmsContentError(401,'Vui lòng đăng nhập quản trị.');
    if (!lmsContentCanEdit($actor)) lmsContentError(403,'Học sinh không có quyền chỉnh sửa nội dung.');
    $allowed=[
      'content_save_class'=>['class_code','version','introduction','online_title','online_url'],
      'content_topic_create'=>['class_code','structure_version','title','description'],
      'content_topic_save'=>['class_code','id','version','title','description','visible'],
      'content_topic_move'=>['class_code','id','version','structure_version','direction'],
      'content_lesson_create'=>['class_code','topic_id','version','title','body'],
      'content_lesson_save'=>['class_code','id','topic_id','version','title','body','status']
    ];
    if (!isset($allowed[$action]) || array_diff(array_keys($body),$allowed[$action])) lmsContentError(422,'Yêu cầu chỉnh sửa chứa trường không được hỗ trợ.');
    $code=$body['class_code'] ?? null;
    if (!is_string($code)) lmsContentError(422,'Mã lớp không hợp lệ.');
    $db->exec('BEGIN IMMEDIATE');
    try {
        // Recheck role and active account while holding the same write lock as the content update.
        $user=lmsContentRow($db,'SELECT username,role,active FROM users WHERE id=?',[$actor['id']]);
        if (!$user || !(int)$user['active'] || !lmsContentCanEdit($user)) lmsContentError(403,'Tài khoản không còn quyền chỉnh sửa.');
        lmsLearningClass($db,$actor,$code);
        $db->prepare('INSERT OR IGNORE INTO lms_class_pages(class_code) VALUES (?)')->execute([$code]);
        $page=lmsLearningPage($db,$code);$now=time();$actorId=$actor['id'];
        if ($action==='content_save_class') {
            lmsContentVersion((int)$page['revision'],lmsContentInt($body,'version',0));
            $intro=lmsContentText($body,'introduction',5000);$title=trim(lmsContentText($body,'online_title',150));$url=trim(lmsContentText($body,'online_url',2048));
            lmsContentOnline($title,$url);
            $db->prepare('UPDATE lms_class_pages SET introduction=?,online_title=?,online_url=?,revision=revision+1,updated_at=?,updated_by=? WHERE class_code=?')->execute([$intro,$title,$url,$now,$actorId,$code]);
        } elseif ($action==='content_topic_create') {
            lmsContentVersion((int)$page['structure_revision'],lmsContentInt($body,'structure_version',0));
            $title=trim(lmsContentText($body,'title',150,true));$description=lmsContentText($body,'description',3000);
            $last=lmsContentRow($db,'SELECT COALESCE(MAX(position),0) AS last FROM lms_topics WHERE class_code=?',[$code]);
            $db->prepare('INSERT INTO lms_topics(class_code,title,description,position,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)')->execute([$code,$title,$description,(int)$last['last']+1,$now,$now,$actorId,$actorId]);
            $db->prepare('UPDATE lms_class_pages SET structure_revision=structure_revision+1 WHERE class_code=?')->execute([$code]);
        } elseif (in_array($action,['content_topic_save','content_topic_move'],true)) {
            $topic=lmsContentRow($db,'SELECT * FROM lms_topics WHERE id=? AND class_code=?',[lmsContentInt($body,'id'),$code]);
            if (!$topic) lmsContentError(404,'Chủ đề không thuộc lớp này.');
            lmsContentVersion((int)$topic['revision'],lmsContentInt($body,'version'));
            if ($action==='content_topic_save') {
                if (!is_bool($body['visible'] ?? null)) lmsContentError(422,'Trạng thái ẩn/hiện không hợp lệ.');
                $title=trim(lmsContentText($body,'title',150,true));$description=lmsContentText($body,'description',3000);
                $db->prepare('UPDATE lms_topics SET title=?,description=?,visible=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=?')->execute([$title,$description,$body['visible']?1:0,$now,$actorId,$topic['id']]);
            } else {
                lmsContentVersion((int)$page['structure_revision'],lmsContentInt($body,'structure_version',0));
                if (!in_array($body['direction'] ?? null,['up','down'],true)) lmsContentError(422,'Hướng sắp xếp không hợp lệ.');
                $stmt=$db->prepare('SELECT id,position FROM lms_topics WHERE class_code=? ORDER BY position,id');$stmt->execute([$code]);$rows=$stmt->fetchAll();$stmt->closeCursor();
                $index=array_search((int)$topic['id'],array_map(fn($r)=>(int)$r['id'],$rows),true);$target=$index+($body['direction']==='up'?-1:1);
                if ($target>=0 && $target<count($rows)) {
                    [$rows[$index],$rows[$target]]=[$rows[$target],$rows[$index]];
                    $stmt=$db->prepare('UPDATE lms_topics SET position=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND position<>?');
                    foreach ($rows as $i=>$row) $stmt->execute([$i+1,$now,$actorId,$row['id'],$i+1]);
                    $db->prepare('UPDATE lms_class_pages SET structure_revision=structure_revision+1 WHERE class_code=?')->execute([$code]);
                }
            }
        } else {
            $topic=lmsContentRow($db,'SELECT * FROM lms_topics WHERE id=? AND class_code=?',[lmsContentInt($body,'topic_id'),$code]);
            if (!$topic) lmsContentError(404,'Chủ đề không thuộc lớp này.');
            $title=trim(lmsContentText($body,'title',150,true));$text=lmsContentText($body,'body',20000);
            if ($action==='content_lesson_create') {
                lmsContentVersion((int)$topic['revision'],lmsContentInt($body,'version'));
                $db->prepare("INSERT INTO lms_text_lessons(topic_id,title,body,status,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,'draft',?,?,?,?)")
                  ->execute([$topic['id'],$title,$text,$now,$now,$actorId,$actorId]);
                $db->prepare('UPDATE lms_topics SET revision=revision+1,updated_at=?,updated_by=? WHERE id=?')->execute([$now,$actorId,$topic['id']]);
            } else {
                $lesson=lmsContentRow($db,'SELECT * FROM lms_text_lessons WHERE id=? AND topic_id=?',[lmsContentInt($body,'id'),$topic['id']]);
                if (!$lesson) lmsContentError(404,'Bài văn bản không thuộc chủ đề/lớp này.');
                lmsContentVersion((int)$lesson['revision'],lmsContentInt($body,'version'));
                $status=$body['status'] ?? null;
                if (!in_array($status,['draft','published'],true)) lmsContentError(422,'Trạng thái bài không hợp lệ.');
                if ($status==='published' && preg_match('/^\s*$/u',$text)) lmsContentError(422,'Vui lòng nhập nội dung trước khi xuất bản.');
                $db->prepare('UPDATE lms_text_lessons SET title=?,body=?,status=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=?')->execute([$title,$text,$status,$now,$actorId,$lesson['id']]);
            }
        }
        $db->exec('COMMIT');
    } catch (Throwable $e) {$db->exec('ROLLBACK');throw $e;}
}
