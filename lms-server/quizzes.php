<?php
declare(strict_types=1);
function lmsQuizList(PDO $db,?array $actor,string $code,bool $editing): array {
    lmsLearningClass($db,$actor,$code);if ($editing&&!lmsContentCanEdit($actor)) lmsContentError(403,'Không có quyền xem bản nháp.');
    $stmt=$db->prepare('SELECT * FROM lms_quizzes WHERE class_code=?'.($editing?'':" AND status='published'").' ORDER BY id DESC');$stmt->execute([$code]);$rows=$stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['questions']=json_decode($r['questions'],true,512,JSON_THROW_ON_ERROR);
        $r['result']=lmsContentRow($db,'SELECT correct_count,total,submitted_at FROM lms_quiz_attempts WHERE quiz_id=? AND user_id=?',[$r['id'],$actor['id']])?:null;
        if (!$editing) foreach ($r['questions'] as &$q) unset($q['answer']);unset($q);
    }unset($r);return $rows;
}
function lmsQuizSave(PDO $db,array $actor,array $body): void {
    $key=$_SERVER['HTTP_IDEMPOTENCY_KEY']??'';if (!preg_match('/^[a-zA-Z0-9_-]{32,128}$/D',$key)) lmsContentError(422,'Mã yêu cầu không hợp lệ.');
    $code=$body['class_code']??'';if (!is_string($code)) lmsContentError(422,'Mã lớp không hợp lệ.');
    $title=trim(lmsContentText($body,'title',150,true));$status=$body['status']??'';
    if (!in_array($status,['draft','published'],true)) lmsContentError(422,'Trạng thái không hợp lệ.');
    $id=lmsContentInt($body,'id',0);$version=lmsContentInt($body,'version',0);$questions=$body['questions']??null;
    if (!is_array($questions)||!array_is_list($questions)||count($questions)<1||count($questions)>100) lmsContentError(422,'Bài kiểm tra cần từ 1 đến 100 câu hỏi.');
    $clean=[];
    foreach ($questions as $q) {
        if (!is_array($q)) lmsContentError(422,'Câu hỏi không hợp lệ.');
        $text=lmsContentText($q,'text',2000,true);$choices=$q['choices']??null;$answer=$q['answer']??null;
        if (!is_array($choices)||!array_is_list($choices)||count($choices)<2||count($choices)>6||!is_int($answer)||$answer<0||$answer>=count($choices)) lmsContentError(422,'Mỗi câu cần 2–6 lựa chọn, answer là vị trí đáp án đúng tính từ 0.');
        $options=[];foreach ($choices as $choice) $options[]=lmsContentText(['choice'=>$choice],'choice',1000,true);
        $clean[]=['text'=>$text,'choices'=>$options,'answer'=>$answer];
    }
    lmsBeginWrite($db);try {
        $fresh=lmsContentRow($db,'SELECT username,role,active FROM users WHERE id=?',[$actor['id']]);if (!$fresh||!$fresh['active']||!lmsContentCanEdit($fresh)) lmsContentError(403,'Không có quyền chỉnh sửa.');
        lmsLearningClass($db,$actor,$code);
        $hash=hash('sha256',json_encode([$code,$id,$version,$title,$status,$clean],JSON_THROW_ON_ERROR));$requestKey=hash('sha256',$key);
        $replay=lmsContentRow($db,'SELECT payload_hash FROM lms_quiz_requests WHERE user_id=? AND request_key=?',[$actor['id'],$requestKey]);
        if ($replay){if (!hash_equals($replay['payload_hash'],$hash)) lmsContentError(409,'Mã yêu cầu đã dùng cho bài khác.');$db->exec('COMMIT');return;}
        $old=$id?lmsContentRow($db,'SELECT * FROM lms_quizzes WHERE id=? AND class_code=?',[$id,$code]):null;
        if ($id&&!$old) lmsContentError(404,'Bài kiểm tra không thuộc lớp này.');
        lmsContentVersion($old?(int)$old['revision']:0,$version);
        if ($old&&lmsContentRow($db,'SELECT id FROM lms_quiz_attempts WHERE quiz_id=? LIMIT 1',[$id])&&$old['questions']!==json_encode($clean,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)) lmsContentError(409,'Bài đã có học sinh nộp; hãy tạo bài mới để thay câu hỏi hoặc đáp án.');
        $json=json_encode($clean,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        if ($id) $db->prepare('UPDATE lms_quizzes SET title=?,questions=?,status=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=?')->execute([$title,$json,$status,$actor['id'],time(),$id]);
        else $db->prepare('INSERT INTO lms_quizzes(class_code,title,questions,status,updated_by,updated_at) VALUES (?,?,?,?,?,?)')->execute([$code,$title,$json,$status,$actor['id'],time()]);
        $db->prepare('INSERT INTO lms_quiz_requests(user_id,request_key,payload_hash) VALUES (?,?,?)')->execute([$actor['id'],$requestKey,$hash]);
        $db->exec('COMMIT');
    }catch(Throwable $e){$db->exec('ROLLBACK');throw $e;}
}
function lmsQuizSubmit(PDO $db,array $actor,array $body): array {
    if ($actor['role']!=='student') lmsContentError(403,'Chỉ học sinh được nộp bài.');
    $code=$body['class_code']??'';if (!is_string($code)) lmsContentError(422,'Mã lớp không hợp lệ.');
    $id=lmsContentInt($body,'id');$version=lmsContentInt($body,'version');
    lmsBeginWrite($db);try {
        $fresh=lmsContentRow($db,'SELECT * FROM users WHERE id=?',[$actor['id']]);
        if (!$fresh||!$fresh['active']||$fresh['role']!=='student') lmsContentError(403,'Tài khoản không còn quyền nộp bài.');
        lmsLearningClass($db,lmsPublicUser($fresh),$code);
        $quiz=lmsContentRow($db,"SELECT * FROM lms_quizzes WHERE id=? AND class_code=? AND status='published'",[$id,$code]);if (!$quiz) lmsContentError(404,'Bài kiểm tra chưa được xuất bản trong lớp này.');
        $old=lmsContentRow($db,'SELECT correct_count,total,submitted_at FROM lms_quiz_attempts WHERE quiz_id=? AND user_id=?',[$id,$actor['id']]);
        if ($old){$db->exec('COMMIT');return $old;}
        lmsContentVersion((int)$quiz['revision'],$version);$questions=json_decode($quiz['questions'],true,512,JSON_THROW_ON_ERROR);$answers=$body['answers']??null;
        if (!is_array($answers)||!array_is_list($answers)||count($answers)!==count($questions)) lmsContentError(422,'Vui lòng trả lời đầy đủ các câu hỏi.');
        $correct=0;foreach ($questions as $i=>$q){if (!is_int($answers[$i])||$answers[$i]<0||$answers[$i]>=count($q['choices'])) lmsContentError(422,'Lựa chọn không hợp lệ.');if ($answers[$i]===$q['answer'])$correct++;}
        $now=time();$db->prepare('INSERT INTO lms_quiz_attempts(quiz_id,user_id,quiz_revision,answers,correct_count,total,submitted_at) VALUES (?,?,?,?,?,?,?)')->execute([$id,$actor['id'],$version,json_encode($answers),$correct,count($questions),$now]);
        $db->exec('COMMIT');return ['correct_count'=>$correct,'total'=>count($questions),'submitted_at'=>$now];
    }catch(Throwable $e){$db->exec('ROLLBACK');throw $e;}
}
