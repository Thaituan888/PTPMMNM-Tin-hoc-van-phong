<?php
declare(strict_types=1);
function lmsResourceDirectory(string $path): string {
    $dir=dirname($path).'/learning-files';
    if (!is_dir($dir) && !mkdir($dir,0700,true) && !is_dir($dir)) lmsContentError(503,'Không tạo được kho tài liệu.');
    $real=strtolower(str_replace('\\','/',realpath($dir)));$web=strtolower(str_replace('\\','/',realpath(dirname(__DIR__))));
    if (is_link($dir)||$real===$web||str_starts_with($real,$web.'/')) lmsContentError(503,'Kho tài liệu phải nằm ngoài thư mục website.');
    return $dir;
}
function lmsResourcePublic(array $r): array {
    unset($r['storage_key']);$r['download_url']=$r['mime']?'lms-api.php?action=learning_file&class_code='.rawurlencode($r['class_code']).'&id='.(int)$r['id']:null;
    return $r;
}
function lmsResourceList(PDO $db,?array $actor,string $code,bool $editing): array {
    lmsLearningClass($db,$actor,$code);
    if ($editing&&!lmsContentCanEdit($actor)) lmsContentError(403,'Không có quyền xem bản nháp.');
    $stmt=$db->prepare('SELECT * FROM lms_class_resources WHERE class_code=?'.($editing?'':" AND status='published'").' ORDER BY id DESC');$stmt->execute([$code]);
    return array_map('lmsResourcePublic',$stmt->fetchAll());
}
function lmsResourceSave(PDO $db,string $path,array $actor,array $body,?array $file): array {
    $code=$body['class_code']??'';if (!is_string($code)) lmsContentError(422,'Mã lớp không hợp lệ.');
    $key=$_SERVER['HTTP_IDEMPOTENCY_KEY']??'';if (!preg_match('/^[a-zA-Z0-9_-]{32,128}$/D',$key)) lmsContentError(422,'Mã yêu cầu không hợp lệ.');
    $id=filter_var($body['id']??0,FILTER_VALIDATE_INT,['options'=>['min_range'=>0]]);
    $version=filter_var($body['version']??0,FILTER_VALIDATE_INT,['options'=>['min_range'=>0]]);
    if ($id===false||$version===false) lmsContentError(422,'Phiên bản không hợp lệ.');
    $kind=$body['kind']??'';$status=$body['status']??'';
    if (!in_array($kind,['notice','material','test'],true)||!in_array($status,['draft','published'],true)) lmsContentError(422,'Loại nội dung hoặc trạng thái không hợp lệ.');
    $title=trim(lmsContentText($body,'title',150,true));$text=lmsContentText($body,'body',20000);$url=trim(lmsContentText($body,'url',2048));
    if ($url!=='') lmsContentOnline($title,$url);
    $new=null;$mime=null;$size=null;$sourceHash='';
    if ($file && ($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE) {
        $error=$file['error']??null;if (in_array($error,[UPLOAD_ERR_INI_SIZE,UPLOAD_ERR_FORM_SIZE],true)) lmsContentError(413,'Tài liệu vượt giới hạn upload PHP hoặc 5 MB.');
        if ($error!==UPLOAD_ERR_OK||!is_string($file['tmp_name']??null)||!is_uploaded_file($file['tmp_name'])) lmsContentError(422,'Tệp tải lên chưa đầy đủ hoặc không hợp lệ.');
        $size=filesize($file['tmp_name']);if (!$size||$size>5*1024*1024) lmsContentError(413,'Tệp phải có dung lượng từ 1 byte đến 5 MB.');
        $mime=(new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);$ext=strtolower(pathinfo((string)($file['name']??''),PATHINFO_EXTENSION));
        $types=['pdf'=>'application/pdf','txt'=>'text/plain','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png'];
        if (!isset($types[$ext])||$mime!==$types[$ext]) lmsContentError(422,'Chỉ nhận PDF, TXT, JPG, PNG thật, đúng phần mở rộng.');
        if ($ext==='pdf'&&file_get_contents($file['tmp_name'],false,null,0,5)!=='%PDF-') lmsContentError(422,'PDF không hợp lệ.');
        if (in_array($ext,['jpg','jpeg','png'],true)&&!@getimagesize($file['tmp_name'])) lmsContentError(422,'Ảnh không hợp lệ.');
        if ($ext==='txt'&&!mb_check_encoding(file_get_contents($file['tmp_name']),'UTF-8')) lmsContentError(422,'Tệp TXT phải dùng UTF-8.');
        $sourceHash=hash_file('sha256',$file['tmp_name']);$new=bin2hex(random_bytes(32)).'.'.$ext;
    }
    $hash=hash('sha256',json_encode([$code,$id,$version,$kind,$status,$title,$text,$url,$sourceHash],JSON_THROW_ON_ERROR));$saved=null;
    $db->exec('BEGIN IMMEDIATE');
    try {
        $fresh=lmsContentRow($db,'SELECT username,role,active FROM users WHERE id=?',[$actor['id']]);
        if (!$fresh||!$fresh['active']||!lmsContentCanEdit($fresh)) lmsContentError(403,'Không có quyền chỉnh sửa.');
        lmsLearningClass($db,$actor,$code);
        $replay=lmsContentRow($db,'SELECT * FROM lms_resource_requests WHERE user_id=? AND request_key=?',[$actor['id'],hash('sha256',$key)]);
        if ($replay) {
            if (!hash_equals($replay['payload_hash'],$hash)) lmsContentError(409,'Mã yêu cầu đã dùng cho nội dung khác.');
            $row=lmsContentRow($db,'SELECT * FROM lms_class_resources WHERE id=?',[$replay['resource_id']]);$db->exec('COMMIT');return lmsResourcePublic($row);
        }
        if (lmsRateLimited($db,hash('sha256',(string)$actor['id']),time(),'resource:')) lmsContentError(429,'Bạn lưu quá nhiều lần. Vui lòng chờ một phút.');
        $old=$id?lmsContentRow($db,'SELECT * FROM lms_class_resources WHERE id=? AND class_code=?',[$id,$code]):null;
        if ($id&&!$old) lmsContentError(404,'Nội dung không thuộc lớp này.');
        lmsContentVersion($old?(int)$old['revision']:0,(int)$version);
        if ($status==='published'&&trim($text)===''&&$url===''&&!$new&&!($old['storage_key']??null)) lmsContentError(422,'Nhập nội dung, liên kết hoặc chọn tệp trước khi xuất bản.');
        if ($new) {$saved=lmsResourceDirectory($path).'/'.$new;if (!move_uploaded_file($file['tmp_name'],$saved)) lmsContentError(503,'Không lưu được tệp tài liệu.');}
        $now=time();$values=[$kind,$title,$text,$url,$status,$new??($old['storage_key']??null),$mime??($old['mime']??null),$size??($old['size_bytes']??null),$actor['id'],$now];
        if ($old) {$db->prepare('UPDATE lms_class_resources SET kind=?,title=?,body=?,url=?,status=?,storage_key=?,mime=?,size_bytes=?,updated_by=?,updated_at=?,revision=revision+1 WHERE id=?')->execute([...$values,$id]);}
        else {$db->prepare('INSERT INTO lms_class_resources(kind,title,body,url,status,storage_key,mime,size_bytes,updated_by,updated_at,class_code,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([...$values,$code,$actor['id'],$now]);$id=(int)$db->lastInsertId();}
        $db->prepare('INSERT INTO lms_resource_requests(user_id,request_key,payload_hash,resource_id) VALUES (?,?,?,?)')->execute([$actor['id'],hash('sha256',$key),$hash,$id]);
        $row=lmsContentRow($db,'SELECT * FROM lms_class_resources WHERE id=?',[$id]);$db->exec('COMMIT');return lmsResourcePublic($row);
    } catch (Throwable $e) {$db->exec('ROLLBACK');if ($saved&&is_file($saved)) unlink($saved);throw $e;}
}
