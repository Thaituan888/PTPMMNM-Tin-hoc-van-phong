<?php
declare(strict_types=1);

function lmsAdminStatusSQL(): string {
    return "CASE WHEN review_status IS NOT NULL THEN review_status WHEN status='expired' AND proof_submitted_at IS NOT NULL THEN 'late_review'
      WHEN status='pending_payment' AND expires_at<=:now THEN 'expired' ELSE status END";
}
function lmsAdminList(PDO $db): array {
    $class=trim((string)($_GET['class_code'] ?? ''));
    $status=trim((string)($_GET['status'] ?? ''));
    if ($class !== '') {
        $check=$db->prepare('SELECT 1 FROM lms_classes WHERE code=?');$check->execute([$class]);
        if (!$check->fetchColumn()) fail(422,'Mã lớp lọc không hợp lệ.');
    }
    if ($status !== '' && !in_array($status,['pending_payment','pending_review','late_review','expired','cancelled','enrolled','approved_waiting_access','needs_more','rejected'],true)) fail(422,'Trạng thái lọc không hợp lệ.');
    $page=filter_var($_GET['page'] ?? 1,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>1000000]]);
    $pageSize=filter_var($_GET['page_size'] ?? 20,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>50]]);
    if (!$page || !$pageSize) fail(422,'Phân trang không hợp lệ.');
    $where=[];$params=[];
    if ($class !== '') {$where[]='class_code=:class';$params[':class']=$class;}
    if ($status !== '') {$where[]='(' . lmsAdminStatusSQL() . ')=:status';$params[':status']=$status;$params[':now']=time();}
    $condition=$where ? ' WHERE '.implode(' AND ',$where) : '';
    $db->exec('BEGIN');
    try {
        $stmt=$db->prepare('SELECT COUNT(*) FROM lms_registrations'.$condition);$stmt->execute($params);$total=(int)$stmt->fetchColumn();
        $pages=max(1,(int)ceil($total/$pageSize));$page=min($page,$pages);
        $stmt=$db->prepare('SELECT *, (SELECT MAX(submitted_at) FROM lms_evidence WHERE registration_id=lms_registrations.id) AS last_evidence_at
          FROM lms_registrations'.$condition.' ORDER BY id DESC LIMIT :limit OFFSET :offset');
        foreach ($params as $key=>$value) $stmt->bindValue($key,$value,is_int($value)?PDO::PARAM_INT:PDO::PARAM_STR);
        $stmt->bindValue(':limit',$pageSize,PDO::PARAM_INT);$stmt->bindValue(':offset',($page-1)*$pageSize,PDO::PARAM_INT);$stmt->execute();
        $rows=$stmt->fetchAll();$db->exec('COMMIT');
    }catch(Throwable $e){$db->exec('ROLLBACK');throw $e;}
    $items=array_map(function($row){
        $reg=lmsRegistration($row);
        return ['reference'=>$reg['reference'],'fullname'=>$reg['fullname'],'course_name'=>$reg['class']['course_name'],
          'class_code'=>$reg['class']['code'],'fee_vnd'=>$reg['fee_vnd'],'transfer_content'=>$reg['transfer_content'],
          'created_at'=>gmdate('c',(int)$row['created_at']),'last_evidence_at'=>$row['last_evidence_at'] ? gmdate('c',(int)$row['last_evidence_at']) : null,
          'status'=>$reg['status'],'status_label'=>$reg['status_label']];
    },$rows);
    return ['items'=>$items,'page'=>$page,'page_size'=>$pageSize,'total'=>$total,'pages'=>$pages];
}
function lmsAdminDetail(PDO $db): array {
    $ref=(string)($_GET['reference'] ?? '');
    if (!preg_match('/^DK[0-9]{6,19}$/D',$ref)) fail(422,'Mã hồ sơ không hợp lệ.');
    $id=filter_var(ltrim(substr($ref,2),'0'),FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if (!$id) fail(404,'Không tìm thấy hồ sơ.');
    $stmt=$db->prepare('SELECT * FROM lms_registrations WHERE id=?');$stmt->execute([$id]);$row=$stmt->fetch();
    if (!$row || lmsRegistration($row)['reference'] !== $ref) fail(404,'Không tìm thấy hồ sơ.');
    $reg=lmsRegistration($row);
    $hold=lmsHasHold($row,time());
    $stmt=$db->prepare('SELECT bank_name,bank_bin,account_number,account_name,currency,created_at FROM lms_payments WHERE registration_id=?');$stmt->execute([$id]);
    $bank=$stmt->fetch() ?: null;
    return ['registration'=>$reg,'created_at'=>gmdate('c',(int)$row['created_at']),
      'revision'=>(int)$row['review_version'],
      'actions'=>['approve'=>in_array($reg['status'],['pending_review','late_review'],true) && $bank!==null,
        'request_more'=>!in_array($reg['status'],['approved_waiting_access','rejected','cancelled','enrolled'],true),
        'reject'=>!in_array($reg['status'],['approved_waiting_access','rejected','cancelled','enrolled'],true)],
      'history'=>lmsReviewHistory($db,(int)$row['id']),
      'hold'=>['reserved'=>$hold,'expires_at'=>$reg['expires_at'],
        'label'=>$reg['status']==='approved_waiting_access'?'Đang giữ chỗ — chờ cấp quyền học':($row['status']==='pending_review'?'Đang giữ chỗ chờ xử lý':($hold?'Đang giữ chỗ trong thời hạn đăng ký':
          ($reg['status']==='late_review'?'Không giữ chỗ — minh chứng nộp muộn chờ kiểm tra':'Không giữ chỗ')))],
      'payment_snapshot'=>$bank,'evidence'=>lmsEvidenceList($db,$row),
      'access'=>lmsAccessPublic($db,(int)$row['id']),
      'access_history'=>lmsAccessHistory($db,(int)$row['id']),
      'can_grant_access'=>$reg['status']==='approved_waiting_access'];
}
