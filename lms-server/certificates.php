<?php
declare(strict_types=1);
function lmsCertificatePublic(array $r): array {
    return ['id'=>(int)$r['id'],'number'=>'THVP-'.str_pad((string)$r['id'],8,'0',STR_PAD_LEFT),'fullname'=>$r['fullname'],'course_name'=>$r['course_name'],'class_code'=>$r['class_code'],'cycle_id'=>(int)$r['cycle_id'],'issued_at'=>(int)$r['issued_at'],'download_url'=>'lms-api.php?action=class_certificate&id='.(int)$r['id']];
}
function lmsCertificateRows(PDO $db,array $actor,?string $code=null): array {
    $admin=lmsContentCanEdit($actor);
    if(!$admin&&($actor['role']!=='student'||$actor['must_change_password']))lmsContentError(403,'Không có quyền xem chứng nhận.');
    $sql='SELECT * FROM lms_certificates WHERE '.($admin?'1=1':'user_id=?');$params=$admin?[]:[$actor['id']];
    if($code!==null){$sql.=' AND class_code=?';$params[]=$code;}
    $stmt=$db->prepare($sql.' ORDER BY id DESC');$stmt->execute($params);return array_map('lmsCertificatePublic',$stmt->fetchAll());
}
function lmsCertificateFile(string $path,array $certificate): string {
    $dir=dirname($path).'/certificates';
    if(!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir))lmsContentError(503,'Không tạo được kho chứng nhận.');
    $private=strtolower(str_replace('\\','/',(string)realpath($dir)));$web=strtolower(str_replace('\\','/',realpath(dirname(__DIR__))));
    if(!lmsPrivatePathAllowed($dir))lmsContentError(503,'Kho chứng nhận phải ở ngoài webroot.');
    if(!preg_match('/^[a-f0-9]{64}\.png$/D',$certificate['storage_key']))lmsContentError(503,'Tệp chứng nhận không hợp lệ.');
    $file=$dir.'/'.$certificate['storage_key'];if(is_link($file))lmsContentError(503,'Tệp chứng nhận không hợp lệ.');if(is_file($file))return $file;
    $font=dirname(__DIR__).'/vendor/noto-sans/NotoSans-Regular.ttf';
    if(!function_exists('imagettftext')||!is_readable($font))lmsContentError(503,'Cần PHP GD và phông Noto Sans để tạo chứng nhận. Khởi động bằng start-local.ps1.');
    $im=imagecreatetruecolor(1600,1120);$white=imagecolorallocate($im,255,255,255);$navy=imagecolorallocate($im,7,89,133);$blue=imagecolorallocate($im,2,132,199);$pale=imagecolorallocate($im,224,242,254);$gray=imagecolorallocate($im,71,85,105);
    imagefill($im,0,0,$white);imagefilledrectangle($im,0,0,1600,22,$blue);imagefilledrectangle($im,0,1098,1600,1120,$blue);imagesetthickness($im,3);imagerectangle($im,42,42,1557,1077,$blue);imagerectangle($im,55,55,1544,1064,$pale);
    $line=function(string $text,int $y,int $size,int $color)use($im,$font):void{
        do{$box=imagettfbbox($size,0,$font,$text);$width=$box[2]-$box[0];if($width<=1400)break;$size--;}while($size>10);
        imagettftext($im,$size,0,(int)((1600-$width)/2),$y,$color,$font,$text);
    };
    $line('TRUNG TÂM TIN HỌC VĂN PHÒNG',145,31,$navy);
    $line('GIẤY CHỨNG NHẬN',270,58,$navy);$line('HOÀN THÀNH KHÓA HỌC',340,35,$blue);
    $line('Trung tâm chúc mừng và công nhận',450,28,$gray);
    $line($certificate['fullname'],560,52,$navy);
    imageline($im,320,600,1280,600,$pale);
    $line('đã hoàn thành khóa học',680,28,$gray);$line($certificate['course_name'],755,39,$navy);
    $line('Lớp '.$certificate['class_code'].' · Đợt '.$certificate['cycle_id'],830,25,$gray);
    $date=(new DateTimeImmutable('@'.$certificate['issued_at']))->setTimezone(new DateTimeZone('Asia/Ho_Chi_Minh'))->format('d/m/Y');
    $line('Ngày cấp: '.$date,920,23,$gray);$line('Số chứng nhận: THVP-'.str_pad((string)$certificate['id'],8,'0',STR_PAD_LEFT),1000,20,$blue);
    $tmp=$file.'.'.bin2hex(random_bytes(8)).'.part';
    try{if(!imagepng($im,$tmp,6)||!rename($tmp,$file))lmsContentError(503,'Không lưu được chứng nhận.');}
    finally{imagedestroy($im);if(is_file($tmp))unlink($tmp);}
    return $file;
}
