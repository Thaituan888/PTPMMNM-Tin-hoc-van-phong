<?php
declare(strict_types=1);
function lmsSessionContext(string $path): array {
    $sessions=dirname($path).'/sessions';if(!is_dir($sessions)&&!mkdir($sessions,0700,true)&&!is_dir($sessions))throw new RuntimeException('Session storage unavailable.');
    session_save_path($sessions);session_name('THVP_LMS_SESSION');ini_set('session.use_strict_mode','1');
    $options=['httponly'=>true,'samesite'=>'Strict','path'=>'/','secure'=>!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off'];
    session_set_cookie_params($options);session_start();
    $_SESSION['guest_secret']??=bin2hex(random_bytes(32));$_SESSION['csrf']??=bin2hex(random_bytes(32));
    // Migrate only the former session-cookie scope; registration/evidence cookies remain intact.
    // Set the migrated scope once, under the session lock. A late GET response must
    // never overwrite the new session ID issued by a concurrent login/logout.
    if(empty($_SESSION['cookie_scope_v2'])){
        setcookie(session_name(),session_id(),$options);$_SESSION['cookie_scope_v2']=true;
    }
    setcookie(session_name(),'',array_merge($options,['path'=>'/lms-api.php','expires'=>time()-3600]));
    $context=['secret'=>$_SESSION['guest_secret'],'csrf'=>$_SESSION['csrf'],'user'=>$_SESSION['user']??null];
    session_write_close();return $context;
}
function lmsSiteAccess(PDO $db,?array $actor): array {
    $allowed=false;$reason='login_required';
    if($actor){
        if(lmsContentCanEdit($actor)){$allowed=true;$reason='teacher';}
        elseif($actor['role']==='student'){
            if($actor['must_change_password'])$reason='password_change_required';
            else{
                $stmt=$db->prepare("SELECT 1 FROM lms_enrollments e JOIN lms_classes c ON c.code=e.class_code LEFT JOIN lms_class_lifecycle l ON l.class_code=c.code WHERE e.user_id=? AND e.active=1 AND e.cycle_id=COALESCE(l.cycle_id,1) AND COALESCE(l.state,'ready')<>'completed' LIMIT 1");$stmt->execute([$actor['id']]);$allowed=(bool)$stmt->fetchColumn();$stmt->closeCursor();$reason=$allowed?'enrolled':'enrollment_required';
            }
        }else $reason='role_not_allowed';
    }
    return ['user'=>$actor,'can_use_features'=>$allowed,'reason'=>$reason];
}
function lmsFeaturePages(): array {
    return ['on-luyen-thi-thu.html'=>['Ôn luyện & Thi thử','Luyện tập và kiểm tra kiến thức tin học.'],
      'luyen-go-phim.html'=>['Luyện gõ phím','Rèn luyện kỹ năng gõ bàn phím phục vụ học tập và công việc.'],
      'kiem-tra-ban-phim.html'=>['Kiểm tra bàn phím','Kiểm tra các phím và thực hành sử dụng bàn phím.'],
      'tra-cuu-phim-tat.html'=>['Tra cứu phím tắt','Tìm hiểu các phím tắt cho công việc văn phòng.'],
      'tim-hieu-ban-phim.html'=>['Tìm hiểu bàn phím','Học cách sử dụng bàn phím máy tính.'],
      'dien-dan.html'=>['Diễn đàn','Trao đổi và chia sẻ kinh nghiệm cùng học sinh, giáo viên.']];
}
function lmsFeaturePreview(string $file,array $access): void {
    [$title,$description]=lmsFeaturePages()[$file];$h=fn($v)=>htmlspecialchars($v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    $template=file_get_contents(dirname(__DIR__).'/khoa-hoc-lms.html');
    preg_match('~<header\b.*?</header>~s',$template,$matches);$header=$matches[0]??'';
    preg_match('~<footer\b.*?</footer>~s',$template,$matches);$footer=$matches[0]??'';
    $message=$access['reason']==='password_change_required'?'Vui lòng hoàn thành đổi mật khẩu để sử dụng chức năng.':'Chức năng dành cho học sinh có ghi danh còn hiệu lực và giáo viên.';
    $login=$access['reason']==='password_change_required'?'dang-nhap-hoc-sinh.html?doi-mat-khau=1':'khoa-hoc-lms.html#khoa-hoc';
    echo '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$h($title).' | Tin học văn phòng</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="lms-admin.css"><script src="lms-api-client.js" defer></script><script src="auth.js" defer></script><script src="lms-account.js" defer></script></head><body class="lms-admin-page" data-lms-feature-preview="true">'.$header.'<main><a class="lms-admin-back" href="index.html">← Trang chủ</a><div data-lms-account hidden></div><section class="lms-admin-box"><h1>'.$h($title).'</h1><p class="lms-admin-intro">'.$h($description).'</p><p>'.$h($message).'</p><div class="lms-review-buttons"><a class="lms-admin-action" href="'.$h($login).'">Đăng nhập</a><a class="lms-admin-back" href="khoa-hoc-lms.html#gioi-thieu">Chưa có tài khoản? Xem khóa học và đăng ký</a></div></section></main>'.$footer.'</body></html>';
}
