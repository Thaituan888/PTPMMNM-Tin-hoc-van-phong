<?php
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
require_once __DIR__ . '/lms-server/bootstrap.php';
require_once __DIR__ . '/lms-server/payment.php';
require_once __DIR__ . '/lms-server/evidence.php';
require_once __DIR__ . '/lms-server/admin.php';
require_once __DIR__ . '/lms-server/mail.php';
require_once __DIR__ . '/lms-server/student.php';
require_once __DIR__ . '/lms-server/resources.php';
require_once __DIR__ . '/lms-server/quizzes.php';
require_once __DIR__ . '/lms-server/certificates.php';
require_once __DIR__ . '/lms-server/class-mail.php';
require_once __DIR__ . '/lms-server/site-access.php';

function reply(int $status, array $data): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function fail(int $status, string $message): never { reply($status, ['error' => $message]); }
function accessCookie(string $code): string { return 'thvp_lms_' . str_replace('-', '_', $code); }
function grantAccess(string $code, string $token): void {
    setcookie(accessCookie($code), $token, ['expires' => time() + 86400 * 30,
      'path' => '/lms-api.php', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
      'httponly' => true, 'samesite' => 'Strict']);
}

try {
    $path = lmsStorage();
    $context=lmsSessionContext($path);$secret=$context['secret'];$csrf=$context['csrf'];$sessionUser=$context['user'];
    $db = lmsDB($path);
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];
    $actor = lmsActor($db, $sessionUser);
    if($method==='GET'&&$action==='site_access')reply(200,lmsSiteAccess($db,$actor));
    if(in_array($action,['class_lifecycle','class_transition','class_send_mail','class_certificates','class_certificate'],true)){
        try{
            if(!$actor)lmsContentError(401,'Vui lòng đăng nhập.');
            if($method==='GET'&&in_array($action,['class_certificates','class_certificate'],true)){
                if($action==='class_certificates'){
                    $filter=$_GET['class_code']??null;if($filter!==null&&!is_string($filter))lmsContentError(422,'Mã lớp không hợp lệ.');
                    reply(200,['certificates'=>lmsCertificateRows($db,$actor,$filter)]);
                }
                $certId=filter_var($_GET['id']??'',FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);if(!$certId)lmsContentError(404,'Không tìm thấy chứng nhận.');
                $cert=lmsContentRow($db,'SELECT * FROM lms_certificates WHERE id=?',[$certId]);
                if(!$cert||(!lmsContentCanEdit($actor)&&($actor['role']!=='student'||$actor['must_change_password']||(int)$cert['user_id']!==$actor['id'])))lmsContentError(404,'Không có quyền xem chứng nhận.');
                $file=lmsCertificateFile($path,$cert);header('Content-Type: image/png');header('Content-Disposition: attachment; filename="chung-nhan-THVP-'.str_pad((string)$certId,8,'0',STR_PAD_LEFT).'.png"');header('Content-Length: '.filesize($file));readfile($file);exit;
            }
            if(!lmsContentCanEdit($actor))lmsContentError(403,'Chỉ giáo viên quản trị được xử lý lớp.');
            if($method==='GET'&&$action==='class_lifecycle'){
                $code=$_GET['class_code']??'';if(!is_string($code))lmsContentError(422,'Mã lớp không hợp lệ.');lmsLearningClass($db,$actor,$code);reply(200,lmsLifecycleSummary($db,$code));
            }
            if($method!=='POST'||!in_array($action,['class_transition','class_send_mail'],true))lmsContentError(405,'Phương thức không hợp lệ.');
            if(!hash_equals($csrf,(string)($_SERVER['HTTP_X_CSRF_TOKEN']??'')))lmsContentError(403,'Phiên xác nhận không hợp lệ.');
            $body=lmsAuthJson();$key=(string)($_SERVER['HTTP_IDEMPOTENCY_KEY']??'');
            if($action==='class_transition'){
                lmsBeginWrite($db);$limited=lmsRateLimited($db,hash('sha256',(string)$actor['id']),time(),'lifecycle:');$db->exec('COMMIT');if($limited)lmsContentError(429,'Bạn thao tác quá nhiều lần. Vui lòng chờ một phút.');
                $event=lmsClassTransition($db,$actor,$body,$key);reply(200,['event_id'=>$event,'mail'=>lmsClassMailCounts($db,$event)]);
            }
            $event=lmsContentInt($body,'event_id');$retry=$body['retry']??false;if(!is_bool($retry))lmsContentError(422,'Yêu cầu gửi lại không hợp lệ.');
            lmsBeginWrite($db);$limited=lmsRateLimited($db,hash('sha256',(string)$actor['id']),time(),'classmail:',360,1080);$db->exec('COMMIT');if($limited)lmsContentError(429,'Gửi email quá nhanh. Chờ một phút rồi tiếp tục; hàng chờ được giữ nguyên.');
            reply(200,['event_id'=>$event,'mail'=>lmsSendClassMail($db,$path,$actor,$event,$retry,$key)]);
        }catch(LmsContentError|LmsAccessError $e){fail($e->httpStatus,$e->getMessage());}
    }
    if (($method==='GET'&&$action==='learning_quizzes')||($method==='POST'&&in_array($action,['content_quiz_save','quiz_submit'],true))) {
        try {
            if (!$actor) lmsContentError(401,'Vui lòng đăng nhập.');
            if ($method==='GET') {
                $code=$_GET['class_code']??'';$editing=$_GET['editing']??'0';if (!is_string($code)||!in_array($editing,['0','1'],true)) lmsContentError(422,'Yêu cầu không hợp lệ.');
                reply(200,['quizzes'=>lmsQuizList($db,$actor,$code,$editing==='1')]);
            }
            if (!hash_equals($csrf,(string)($_SERVER['HTTP_X_CSRF_TOKEN']??''))) lmsContentError(403,'Phiên xác nhận không hợp lệ.');
            if ($action==='content_quiz_save'&&!lmsContentCanEdit($actor)) lmsContentError(403,'Chỉ giáo viên được sửa bài kiểm tra.');
            $body=lmsAuthJson(1048576);
            if ($action==='quiz_submit')reply(200,['result'=>lmsQuizSubmit($db,$actor,$body)]);
            lmsQuizSave($db,$actor,$body);reply(200,['message'=>'Đã lưu bài kiểm tra.']);
        }catch(LmsContentError $e){fail($e->httpStatus,$e->getMessage());}
    }
    if (($method==='GET' && in_array($action,['learning_resources','learning_file'],true)) || ($method==='POST'&&$action==='content_resource_save')) {
        try {
            if ($action==='content_resource_save') {
                if (!$actor) lmsContentError(401,'Vui lòng đăng nhập.');
                if (!lmsContentCanEdit($actor)) lmsContentError(403,'Chỉ giáo viên được chỉnh sửa.');
                if (!hash_equals($csrf,(string)($_SERVER['HTTP_X_CSRF_TOKEN']??''))) lmsContentError(403,'Phiên xác nhận không hợp lệ.');
                $postLimit=lmsIniBytes(ini_get('post_max_size'));
                if ($postLimit>0&&(int)($_SERVER['CONTENT_LENGTH']??0)>$postLimit) lmsContentError(413,'Tệp vượt giới hạn gửi của PHP. Mỗi tài liệu tối đa 5 MB.');
                reply(200,['resource'=>lmsResourceSave($db,$path,$actor,$_POST,$_FILES['file']??null)]);
            }
            $code=$_GET['class_code']??'';if (!is_string($code)) lmsContentError(422,'Mã lớp không hợp lệ.');
            if ($action==='learning_resources') {
                $editing=$_GET['editing']??'0';if (!in_array($editing,['0','1'],true)) lmsContentError(422,'Chế độ xem không hợp lệ.');
                reply(200,['resources'=>lmsResourceList($db,$actor,$code,$editing==='1')]);
            }
            lmsLearningClass($db,$actor,$code);
            $id=filter_var($_GET['id']??'',FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);if (!$id) lmsContentError(404,'Không tìm thấy tài liệu.');
            $row=lmsContentRow($db,'SELECT * FROM lms_class_resources WHERE id=? AND class_code=?',[$id,$code]);
            if (!$row||(!$row['storage_key'])||($row['status']!=='published'&&!lmsContentCanEdit($actor))) lmsContentError(404,'Không tìm thấy tài liệu đã xuất bản.');
            if (!preg_match('/^[a-f0-9]{64}\.(pdf|txt|jpe?g|png)$/D',$row['storage_key'])) lmsContentError(404,'Tệp không hợp lệ.');
            $file=lmsResourceDirectory($path).'/'.$row['storage_key'];if (is_link($file)||!is_file($file)) lmsContentError(404,'Tài liệu không còn sẵn có.');
            header('Content-Type: application/octet-stream');header('Content-Disposition: attachment; filename="tai-lieu-'.(int)$row['id'].'.'.pathinfo($file,PATHINFO_EXTENSION).'"');header('Content-Length: '.filesize($file));header("Content-Security-Policy: sandbox");readfile($file);exit;
        } catch (LmsContentError $e) {fail($e->httpStatus,$e->getMessage());}
    }
    if ($method==='GET' && in_array($action,['learning_classes','learning_class','learning_lesson'],true)) {
        try {
            if ($action==='learning_classes') {
                $scope=$_GET['scope'] ?? 'all';
                if (!is_string($scope)) lmsContentError(422,'Phạm vi danh sách lớp không hợp lệ.');
                reply(200,['classes'=>lmsLearningClasses($db,$actor,$scope),'can_edit'=>lmsContentCanEdit($actor)]);
            }
            $editing=$_GET['editing'] ?? '0';
            if (!in_array($editing,['0','1'],true)) lmsContentError(422,'Chế độ xem không hợp lệ.');
            $id=null;
            if ($action==='learning_lesson') {
                $id=filter_var($_GET['id'] ?? '',FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
                if (!$id) lmsContentError(422,'ID bài không hợp lệ.');
            }
            $learningCode=$_GET['class_code'] ?? '';
            if (!is_string($learningCode)) lmsContentError(422,'Mã lớp không hợp lệ.');
            reply(200,lmsLearningRead($db,$actor,$learningCode,$editing==='1',$id));
        } catch (LmsContentError $e) {fail($e->httpStatus,$e->getMessage());}
    }
    if ($method==='POST' && in_array($action,['content_save_class','content_topic_create','content_topic_save','content_topic_move','content_lesson_create','content_lesson_save'],true)) {
        if (!$actor) fail(401,'Vui lòng đăng nhập quản trị.');
        if (!lmsContentCanEdit($actor)) fail(403,'Tài khoản không có quyền chỉnh sửa nội dung.');
        if (!hash_equals($csrf,(string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail(403,'Phiên xác nhận không hợp lệ.');
        $body=lmsAuthJson(131072);
        try {lmsContentWrite($db,$actor,$action,$body);reply(200,['message'=>'Đã lưu nội dung.']);}
        catch (LmsContentError $e) {fail($e->httpStatus,$e->getMessage());}
    }
    if ($method==='GET' && in_array($action,['student_classes','student_class'],true)) {
        lmsRequireStudent($actor);
        $code=$action==='student_class'?(string)($_GET['class_code'] ?? ''):null;
        $classes=lmsStudentClasses($db,$actor['id'],$code);
        reply(200,$code===null?['classes'=>$classes]:['class'=>$classes[0]]);
    }
    if ($method==='POST' && $action==='student_change_password') {
        if (!$actor) fail(401,'Vui lòng đăng nhập học sinh.');
        if ($actor['role']!=='student') fail(403,'Chức năng này dành cho học sinh.');
        if (!hash_equals($csrf,(string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail(403,'Phiên xác nhận không hợp lệ.');
        $body=lmsAuthJson();
        lmsBeginWrite($db);$limited=lmsRateLimited($db,hash('sha256',(string)$actor['id']),time(),'password:');$db->exec('COMMIT');
        if ($limited) fail(429,'Bạn thử đổi mật khẩu quá nhiều lần. Vui lòng chờ một phút.');
        try {$user=lmsStudentPassword($db,$actor,$body);} catch (LmsAccessError $e) {fail($e->httpStatus,$e->getMessage());}
        session_start();session_regenerate_id(true);
        $_SESSION['user']=['source'=>lmsSessionSource($db),'id'=>(int)$user['id'],'credential_stamp'=>hash('sha256',$user['password_hash']),'login_at'=>time()];session_write_close();
        reply(200,['user'=>lmsPublicUser($user),'message'=>'Đã đổi mật khẩu.']);
    }
    if ($method==='POST' && in_array($action,['admin_grant_access','admin_access_mail_retry','admin_reissue_credentials'],true)) {
        lmsRequireMailAdmin($actor);
        if (!hash_equals($csrf,(string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail(403,'Phiên xác nhận không hợp lệ. Vui lòng tải lại trang.');
        $body=lmsAuthJson();$key=(string)($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '');
        if (array_diff(array_keys($body),['reference','version'])) fail(422,'Chỉ gửi mã hồ sơ và phiên bản; thông tin tài khoản, lớp và email do máy chủ xác định.');
        lmsBeginWrite($db);$limited=lmsRateLimited($db,hash('sha256',(string)$actor['id']),time(),'access:');$db->exec('COMMIT');
        if ($limited) {header('Retry-After: 60');fail(429,'Bạn thao tác quá nhiều lần. Vui lòng chờ một phút.');}
        $id=null;
        try {
            [$id,$reference,$version]=lmsAccessRequest($body,$key);
            if ($action==='admin_grant_access') {
                $grant=lmsGrantAccess($db,$path,$actor,$body,$key);
                if ($grant['created']) lmsSendAccessMail($db,$path,$actor,$id,$key);
            } elseif($action==='admin_reissue_credentials'){
                if(lmsReissueCredentials($db,$path,$actor,$body,$key))lmsSendAccessMail($db,$path,$actor,$id,$key);
            } else lmsSendAccessMail($db,$path,$actor,$id,$key);
            reply(200,['reference'=>$reference,'access'=>lmsAccessPublic($db,$id)]);
        } catch (LmsAccessError $e) {lmsAccessFailure($db,$actor,$id,$action);fail($e->httpStatus,$e->getMessage());}
        catch (Throwable $e) {lmsAccessFailure($db,$actor,$id,$action);fail(503,'Chưa hoàn thành thao tác cấp quyền/email. Mở lại hồ sơ để kiểm tra trạng thái; không tạo thêm tài khoản.');}
    }
    if (($method==='GET' && $action==='mail_status') || ($method==='POST' && $action==='mail_test')) {
        lmsRequireMailAdmin($actor);
        if ($method==='GET') reply(200,['mail'=>lmsMailPublicStatus(lmsMailConfiguration($path))]);
        if (!hash_equals($csrf,(string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail(403,'Phiên xác nhận không hợp lệ. Vui lòng tải lại trang.');
        $body=lmsAuthJson();
        if (array_diff(array_keys($body),['recipient'])) fail(422,'Yêu cầu gửi thử chỉ được chứa email người nhận; cấu hình SMTP chỉ đọc từ tệp riêng trên máy chủ.');
        try {$recipient=lmsMailRecipient($body['recipient'] ?? null);}
        catch (LmsMailError $e) {reply($e->httpStatus,['error'=>$e->getMessage(),'code'=>$e->errorCode]);}
        lmsBeginWrite($db);
        $limited=lmsRateLimited($db,hash('sha256',(string)$actor['id']),time(),'mail:');$db->exec('COMMIT');
        if ($limited) {header('Retry-After: 60');fail(429,'Bạn gửi email thử quá nhiều lần. Vui lòng chờ một phút.');}
        $configuration=lmsMailConfiguration($path);
        if (!$configuration['configured']) reply(422,['error'=>'Chưa thể gửi email thử. '.implode(' ',$configuration['issues'] ?: [lmsMailPublicStatus($configuration)['message']]),
          'code'=>'mail_configuration','mail'=>lmsMailPublicStatus($configuration)]);
        try {lmsSendTestMail($configuration['config'],$recipient);}
        catch (LmsMailError $e) {reply($e->httpStatus,['error'=>$e->getMessage(),'code'=>$e->errorCode]);}
        reply(200,['message'=>'Đã gửi qua SMTP; vui lòng kiểm tra hộp thư và thư rác','accepted_by_smtp'=>true]);
    }
    if ($method === 'GET' && $action === 'auth_user') reply(200, ['user' => $actor]);
    if ($method === 'POST' && in_array($action, ['auth_login','auth_logout'], true)) {
        if (!hash_equals($csrf, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail(403,'Phiên xác nhận không hợp lệ. Vui lòng tải lại trang.');
        if ($action === 'auth_logout') {
            session_start();
            unset($_SESSION['user']);
            session_regenerate_id(true); // Keep guest_secret, CSRF and all registration access cookies.
            session_write_close();
            reply(200,['user'=>null]);
        }
        lmsBeginWrite($db);
        $limited=lmsRateLimited($db,hash('sha256',$secret),time(),'auth:');$db->exec('COMMIT');
        if ($limited) {header('Retry-After: 60');fail(429,'Bạn đăng nhập quá nhiều lần. Vui lòng chờ một phút.');}
        $body=lmsAuthJson();$username=$body['username'] ?? null;$password=$body['password'] ?? null;
        $expectedRole=$body['expected_role'] ?? null;
        if (array_key_exists('expected_role',$body) && !in_array($expectedRole,['admin','student'],true)) fail(422,'Loại tài khoản đăng nhập không hợp lệ.');
        if (!is_string($username) || !is_string($password) || !mb_check_encoding($username,'UTF-8') || mb_strlen($username)>150 || strlen($password)>1024 || trim($username)==='' || $password==='') fail(422,'Vui lòng nhập tài khoản và mật khẩu.');
        $user=lmsCredentialUser($db,trim($username),$password);
        if (!$user) fail(401,'Tài khoản hoặc mật khẩu không chính xác, hoặc tài khoản chưa được kích hoạt mật khẩu.');
        if ($expectedRole!==null && $user['role']!==$expectedRole) fail(403,$expectedRole==='admin'?'Vui lòng dùng tài khoản giáo viên để đăng nhập ở mục này.':'Vui lòng dùng tài khoản học sinh để đăng nhập ở mục này.');
        session_start();session_regenerate_id(true);
        $_SESSION['user']=['source'=>lmsSessionSource($db),'id'=>(int)$user['id'],
          'credential_stamp'=>hash('sha256',$user['password_hash']),'login_at'=>time()];
        session_write_close();
        reply(200,['user'=>lmsPublicUser($user)]);
    }
    if ($method === 'GET' && in_array($action,['admin_registrations','admin_registration'],true)) {
        lmsRequireAdmin($actor);
        reply(200,$action==='admin_registrations' ? lmsAdminList($db) : lmsAdminDetail($db));
    }
    if ($method === 'POST' && $action === 'admin_review') {
        lmsRequireAdmin($actor);
        if (!hash_equals($csrf, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail(403,'Phiên xác nhận không hợp lệ. Vui lòng tải lại trang.');
        $body=lmsAuthJson(32768);
        lmsBeginWrite($db);
        $limited=lmsRateLimited($db,hash('sha256',(string)$actor['id']),time(),'review:');$db->exec('COMMIT');
        if ($limited) {header('Retry-After: 60');fail(429,'Bạn xử lý quá nhiều yêu cầu. Vui lòng chờ một phút.');}
        try {reply(200,lmsReviewDecision($db,$actor,$body,(string)($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '')));}
        catch (LmsReviewError $e) {fail($e->httpStatus,$e->getMessage());}
    }
    if ($method === 'GET' && $action === 'session') reply(200, ['csrf' => $csrf]);
    if ($method === 'GET' && $action === 'classes') {
        $db->exec('BEGIN');
        $now = time();
        $rows = $db->query('SELECT * FROM lms_classes ORDER BY code')->fetchAll();
        $rows = array_map(fn($r) => lmsClass($db, $r, $now), $rows);
        $db->exec('COMMIT');
        reply(200, ['classes' => $rows]);
    }
    if ($method === 'GET' && $action === 'registration') {
        $code = (string)($_GET['class_code'] ?? '');
        $row = lmsOwnedRegistration($db, $code);
        if (!$row) fail(404, 'Không có quyền truy cập hồ sơ.');
        reply(200, ['registration' => lmsRegistration($row)]);
    }
    if ($method === 'GET' && in_array($action, ['evidence','evidence_image'], true)) {
        $code = (string)($_GET['class_code'] ?? '');
        $row = lmsOwnedRegistration($db, $code);
        if ($action === 'evidence') {
            if (!$row) fail(404, 'Không có quyền truy cập hồ sơ.');
            reply(200, ['evidence' => lmsEvidenceList($db, $row), 'registration' => lmsRegistration($row),
              'can_submit' => lmsCanSubmitEvidence($row),
              'upload' => lmsEvidenceSettings()]);
        }
        $id = filter_var($_GET['id'] ?? '', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if (!$id) fail(404, 'Không tìm thấy ảnh minh chứng.');
        if ($actor && $actor['role']==='admin') {
            $stmt=$db->prepare('SELECT e.* FROM lms_evidence e JOIN lms_registrations r ON r.id=e.registration_id WHERE e.id=? AND r.class_code=?');
            $stmt->execute([$id,$code]);
        } else {
            if (!$row) fail(404,'Không có quyền truy cập hồ sơ.');
            $stmt=$db->prepare('SELECT * FROM lms_evidence WHERE id=? AND registration_id=?');
            $stmt->execute([$id,$row['id']]);
        }
        $evidence = $stmt->fetch();
        if (!$evidence) fail(404, 'Không tìm thấy ảnh minh chứng.');
        $file = lmsEvidenceFile($path, $evidence['storage_key']);
        $stream = @fopen($file, 'rb');
        if (!$stream) fail(404, 'Ảnh minh chứng tạm không đọc được.');
        header('Content-Type: ' . $evidence['mime']);
        header('Content-Length: ' . fstat($stream)['size']);
        header('Content-Disposition: inline; filename="evidence.' . ($evidence['mime'] === 'image/png' ? 'png' : 'jpg') . '"');
        header("Content-Security-Policy: default-src 'none'; sandbox");
        fpassthru($stream); fclose($stream); exit;
    }
    if ($method === 'POST' && $action === 'evidence_upload') {
        if (!hash_equals($csrf, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail(403, 'Phiên xác nhận không hợp lệ. Vui lòng tải lại trang.');
        $code = (string)($_GET['class_code'] ?? '');
        $row = lmsOwnedRegistration($db, $code);
        if (!$row) fail(404, 'Không có quyền truy cập hồ sơ.');
        if (!hash_equals(lmsRegistration($row)['reference'], (string)($_SERVER['HTTP_X_LMS_REGISTRATION'] ?? ''))) {
            fail(409, 'Hồ sơ trong trình duyệt đã thay đổi. Vui lòng tải lại trang trước khi gửi ảnh.');
        }
        try { $evidence = lmsStoreEvidence($db, $path, $row, hash('sha256', $secret)); }
        catch (LmsEvidenceError $e) {
            if ($e->httpStatus === 429) header('Retry-After: 60');
            fail($e->httpStatus, $e->getMessage());
        } catch (Throwable $e) { fail(503, 'Không lưu được minh chứng. Vui lòng thử lại ảnh đã chọn; ảnh cũ vẫn được giữ nguyên.'); }
        $row = lmsOwnedRegistration($db, $code);
        reply(!empty($evidence['_replayed']) ? 200 : 201, ['evidence' => lmsEvidenceData($evidence, $code),
          'registration' => lmsRegistration($row), 'message' => 'Đã lưu minh chứng. Thanh toán chưa được xác nhận.']);
    }
    if ($method === 'POST' && $action === 'payment') {
        if (!hash_equals($csrf, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail(403, 'Phiên xác nhận không hợp lệ. Vui lòng tải lại trang.');
        lmsBeginWrite($db);
        $code = (string)($_GET['class_code'] ?? '');
        $row = lmsOwnedRegistration($db, $code);
        if (!$row) { $db->exec('ROLLBACK'); fail(404, 'Không có quyền truy cập hồ sơ.'); }
        $payment = lmsPayment($db, $row, $path);
        $db->exec('COMMIT');
        // Do not issue a QR if the hold expired while preparing its payload.
        if ($payment['eligible'] && (int)$row['expires_at'] <= time()) {
            $payment = lmsPayment($db, array_merge($row, ['status' => 'expired']), $path);
        }
        reply(200, ['payment' => $payment]);
    }
    if ($method !== 'POST' || $action !== 'register') fail(404, 'API không tồn tại.');
    if (!hash_equals($csrf, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail(403, 'Phiên xác nhận không hợp lệ. Vui lòng tải lại trang.');
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) fail(413, 'Dữ liệu quá dài.');
    $raw = file_get_contents('php://input', false, null, 0, 8193);
    if (strlen($raw) > 8192) fail(413, 'Dữ liệu quá dài.');
    try { $body = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { fail(422, 'Dữ liệu không hợp lệ.'); }
    if (!is_array($body)) fail(422, 'Dữ liệu không hợp lệ.');
    $key = $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '';
    if (!preg_match('/^[a-zA-Z0-9_-]{32,128}$/D', $key)) fail(422, 'Mã yêu cầu không hợp lệ.');
    $requestHash = hash('sha256', $key);
    $ownerHash = hash('sha256', $secret);
    // A 256-bit PRF token is reproducible for response-loss retries, but only its hash is in SQLite.
    $access = hash_hmac('sha256', 'lms-access:' . $key, $secret);
    lmsBeginWrite($db);
    $now = time();
    $db->exec("UPDATE lms_registrations SET status='expired' WHERE status='pending_payment'
      AND proof_submitted_at IS NULL AND expires_at<=" . $now);
    $payload = [];
    foreach (['class_code','fullname','phone','email'] as $field) {
        if (!isset($body[$field]) || !is_string($body[$field])) $payload[$field] = '';
        else $payload[$field] = preg_replace('/^\s+|\s+$/u', '', $body[$field]);
    }
    $payload['email'] = strtolower($payload['email']);
    $payload['phone'] = preg_replace('/[\s().-]/', '', $payload['phone']);
    $payload['phone'] = preg_replace('/^\+84/', '0', $payload['phone']);
    $payloadHash = hash('sha256', json_encode($payload, JSON_UNESCAPED_UNICODE));
    $stmt = $db->prepare('SELECT * FROM lms_registrations WHERE request_hash=?');
    $stmt->execute([$requestHash]);
    if ($row = $stmt->fetch()) {
        $db->exec('COMMIT');
        if (!hash_equals($row['owner_hash'], $ownerHash) || !hash_equals($row['payload_hash'], $payloadHash)) {
            fail(409, 'Yêu cầu đã được sử dụng. Vui lòng kiểm tra lại thông tin.');
        }
        grantAccess($row['class_code'], $access);
        reply(200, ['registration' => lmsRegistration($row)]);
    }
    $limited = lmsRateLimited($db, $ownerHash, $now);
    if ($limited) { $db->exec('COMMIT'); header('Retry-After: 60'); fail(429, 'Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau một phút.'); }
    $errors = [];
    if (!$payload['fullname'] || mb_strlen($payload['fullname']) > 150 || preg_match('/[\x00-\x1F\x7F]/u', $payload['fullname'])) $errors['name'] = 'Vui lòng nhập họ tên hợp lệ (tối đa 150 ký tự).';
    if (!preg_match('/^0(?:[35789]\d{8}|2\d{9})$/D', $payload['phone'])) $errors['phone'] = 'Số điện thoại không hợp lệ.';
    if (strlen($payload['email']) > 254 || !filter_var($payload['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Email không hợp lệ.';
    if ($errors) { $db->exec('COMMIT'); reply(422, ['error' => 'Vui lòng sửa thông tin.', 'fields' => $errors]); }
    $stmt = $db->prepare('SELECT * FROM lms_classes WHERE code=?');
    $stmt->execute([$payload['class_code']]);
    $class = $stmt->fetch();
    if (!$class) { $db->exec('COMMIT'); fail(422, 'Mã lớp không hợp lệ.'); }
    $availability = lmsClass($db, $class, $now);
    if ($availability['availability'] !== 'open') {
        $db->exec('COMMIT'); fail(409, 'Lớp đang đóng hoặc tạm hết chỗ. Vui lòng chọn lớp khác.');
    }
    $cycle=(int)lmsLifecycle($db,$class['code'])['cycle_id'];
    $stmt = $db->prepare("SELECT 1 FROM lms_registrations WHERE class_code=? AND email=? AND cycle_id=?
      AND status IN ('pending_payment','pending_review') UNION ALL
      SELECT 1 FROM lms_enrollments WHERE class_code=? AND email=? AND active=1 LIMIT 1");
    $stmt->execute([$class['code'], $payload['email'], $cycle, $class['code'], $payload['email']]);
    if ($stmt->fetchColumn()) { $db->exec('COMMIT'); fail(409, 'Không thể giữ thêm chỗ với thông tin này. Hồ sơ hiện có chỉ truy cập được bằng quyền truy cập riêng.'); }
    $ttl = (int)(getenv('THVP_LMS_HOLD_SECONDS') ?: 1800);
    $ttl = max(1, min(86400, $ttl));
    $stmt = $db->prepare('INSERT INTO lms_registrations
      (class_code,fullname,phone,email,class_snapshot,fee_vnd,created_at,expires_at,request_hash,owner_hash,payload_hash,access_hash,cycle_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([$class['code'], $payload['fullname'], $payload['phone'], $payload['email'],
      json_encode($class, JSON_UNESCAPED_UNICODE), (int)$class['fee_vnd'], $now, $now + $ttl,
      $requestHash, $ownerHash, $payloadHash, hash('sha256', $access),$cycle]);
    $id = (int)$db->lastInsertId();
    $stmt = $db->prepare('SELECT * FROM lms_registrations WHERE id=?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    $db->exec('COMMIT');
    grantAccess($class['code'], $access);
    reply(201, ['registration' => lmsRegistration($row)]);
} catch (Throwable $e) {
    if (isset($db)) { try { $db->exec('ROLLBACK'); } catch (Throwable $ignored) {} }
    fail(503, 'Dịch vụ đăng ký tạm chưa sẵn sàng. Vui lòng thử lại sau.');
}
