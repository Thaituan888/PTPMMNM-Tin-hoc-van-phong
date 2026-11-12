<?php
/**
 * ===================================================================
 * API XỬ LÝ DATABASE MYSQL & LƯU TRỮ TRỰC TIẾP TRÊN INFINITYFREE
 * - Toàn bộ dữ liệu (tài khoản, bài tập, bài nộp, file tài liệu)
 *   được lưu trực tiếp và đồng bộ 100% trong Database MySQL!
 * ===================================================================
 */

header('Content-Type: application/json; charset=utf-8');
session_start();

require_once __DIR__ . '/config.php';

$action = isset($_GET['action']) ? $_GET['action'] : '';
$pdo = getDBConnection();

// Hàm phản hồi JSON
function jsonResponse($success, $message, $data = null) {
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function isTeacherRole($role, $username = '') {
    $r = strtolower(trim((string)$role));
    $u = strtolower(trim((string)$username));
    return in_array($r, ['admin', 'teacher', 'giangvien'], true) || $u === 'giangvien';
}

function canDeleteForumPost($pdo, $authorUsername, $actorUsername, $actorRole = 'student') {
    $sessionUser = $_SESSION['user'] ?? null;
    $effectiveUsername = $sessionUser ? trim((string)($sessionUser['username'] ?? '')) : trim((string)$actorUsername);
    $effectiveRole = $sessionUser ? trim((string)($sessionUser['role'] ?? 'student')) : trim((string)$actorRole);

    if (!$sessionUser && $pdo && $effectiveUsername !== '') {
        $stmtU = $pdo->prepare("SELECT `role` FROM `users` WHERE LOWER(`username`) = LOWER(?) LIMIT 1");
        $stmtU->execute([$effectiveUsername]);
        $dbUser = $stmtU->fetch();
        if ($dbUser && !empty($dbUser['role'])) {
            $effectiveRole = $dbUser['role'];
        }
    }

    if (isTeacherRole($effectiveRole, $effectiveUsername)) {
        return true;
    }

    return $effectiveUsername !== '' && strcasecmp((string)$authorUsername, $effectiveUsername) === 0;
}

// Hàm xuất file tải về (Ưu tiên file đĩa, nếu không có lấy trực tiếp từ database MySQL)
function serveFileDownload($fileName, $filePath, $fileDataBase64) {
    // 1. Nếu có file vật lý trên hosting thì tải từ đĩa
    $physicalFile = !empty($filePath) ? __DIR__ . '/' . $filePath : '';
    if (!empty($physicalFile) && file_exists($physicalFile)) {
        header('Content-Description: File Transfer');
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . rawurlencode($fileName) . '"');
        header('Expires: 0');
        header('Cache-Control: must-revalidate');
        header('Pragma: public');
        header('Content-Length: ' . filesize($physicalFile));
        readfile($physicalFile);
        exit;
    }

    // 2. Nếu không có file vật lý, xuất trực tiếp từ cột file_data trong MySQL!
    if (!empty($fileDataBase64)) {
        $binary = base64_decode($fileDataBase64);
        header('Content-Description: File Transfer');
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . rawurlencode($fileName) . '"');
        header('Expires: 0');
        header('Cache-Control: must-revalidate');
        header('Pragma: public');
        header('Content-Length: ' . strlen($binary));
        echo $binary;
        exit;
    }

    die('File không tồn tại trên hệ thống!');
}

// Hàm xuất file để xem trực tiếp (inline) trên trình duyệt (cho PDF, ảnh, text,...)
function serveFileInline($fileName, $filePath, $fileDataBase64) {
    $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    $mimeTypes = [
        'pdf'  => 'application/pdf',
        'txt'  => 'text/plain; charset=utf-8',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif'  => 'image/gif',
        'webp' => 'image/webp',
        'svg'  => 'image/svg+xml',
        'html' => 'text/html; charset=utf-8',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc'  => 'application/msword',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls'  => 'application/vnd.ms-excel',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'ppt'  => 'application/vnd.ms-powerpoint',
    ];
    $contentType = $mimeTypes[$ext] ?? 'application/octet-stream';

    $physicalFile = !empty($filePath) ? __DIR__ . '/' . $filePath : '';
    if (!empty($physicalFile) && file_exists($physicalFile)) {
        header('Content-Type: ' . $contentType);
        header('Content-Disposition: inline; filename="' . rawurlencode($fileName) . '"');
        header('Content-Length: ' . filesize($physicalFile));
        header('Cache-Control: public, max-age=3600');
        readfile($physicalFile);
        exit;
    }

    if (!empty($fileDataBase64)) {
        $binary = base64_decode($fileDataBase64);
        header('Content-Type: ' . $contentType);
        header('Content-Disposition: inline; filename="' . rawurlencode($fileName) . '"');
        header('Content-Length: ' . strlen($binary));
        header('Cache-Control: public, max-age=3600');
        echo $binary;
        exit;
    }

    die('File không tồn tại trên hệ thống!');
}

// Xử lý xem trước file trực tiếp trên trình duyệt (inline preview)
if ($action === 'preview_exercise') {
    if (!$pdo) die('Chưa kết nối Database!');
    $id = intval($_GET['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT `file_name`, `file_path`, `file_data` FROM `exercises` WHERE `id` = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) die('Không tìm thấy bài tập!');
    serveFileInline($row['file_name'], $row['file_path'], $row['file_data']);
}

if ($action === 'preview_submission') {
    if (!$pdo) die('Chưa kết nối Database!');
    $id = intval($_GET['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT `file_name`, `file_path`, `file_data`, `student_mssv` FROM `submissions` WHERE `id` = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) die('Không tìm thấy bài nộp!');
    serveFileInline($row['file_name'], $row['file_path'], $row['file_data']);
}

// Xử lý tải file trực tiếp (không trả JSON)
if ($action === 'download_exercise') {
    if (!$pdo) die('Chưa kết nối Database!');
    $id = intval($_GET['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT `file_name`, `file_path`, `file_data` FROM `exercises` WHERE `id` = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) die('Không tìm thấy bài tập!');
    serveFileDownload($row['file_name'], $row['file_path'], $row['file_data']);
}

if ($action === 'download_submission') {
    if (!$pdo) die('Chưa kết nối Database!');
    $id = intval($_GET['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT `file_name`, `file_path`, `file_data`, `student_mssv` FROM `submissions` WHERE `id` = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) die('Không tìm thấy bài nộp!');
    $dlName = 'BaiLam_' . ($row['student_mssv'] ?: 'SV') . '_' . $row['file_name'];
    serveFileDownload($dlName, $row['file_path'], $row['file_data']);
}

// Xem ảnh hoặc tải file đính kèm trên Diễn đàn
if ($action === 'preview_forum_image') {
    if (!$pdo) die('Chưa kết nối Database!');
    $id = intval($_GET['id'] ?? 0);
    $type = $_GET['type'] ?? 'image';
    $table = ($type === 'comment') ? 'forum_comments' : 'forum_posts';
    $stmt = $pdo->prepare("SELECT `image_name`, `image_path`, `image_data` FROM `$table` WHERE `id` = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) die('Không tìm thấy hình ảnh!');
    $base64 = $row['image_data'] ?? '';
    if (strpos($base64, 'base64,') !== false) {
        $base64 = substr($base64, strpos($base64, 'base64,') + 7);
    }
    serveFileInline($row['image_name'] ?: 'image.png', $row['image_path'], $base64);
}

if ($action === 'download_forum_file') {
    if (!$pdo) die('Chưa kết nối Database!');
    $id = intval($_GET['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT `file_name`, `file_path`, `file_data` FROM `forum_posts` WHERE `id` = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row || empty($row['file_name'])) die('Không tìm thấy file đính kèm!');
    serveFileDownload($row['file_name'], $row['file_path'], $row['file_data']);
}

// Kiểm tra kết nối Database cho các API JSON khác
if (!$pdo && $action !== 'status') {
    jsonResponse(false, 'Chưa kết nối được MySQL. Vui lòng mở file config.php để điền đúng thông số MySQL Database của InfinityFree.');
}

switch ($action) {
    // -------------------------------------------------------------
    // KIỂM TRA TRẠNG THÁI KẾT NỐI
    // -------------------------------------------------------------
    case 'status':
        if ($pdo) {
            jsonResponse(true, 'Kết nối MySQL thành công!', [
                'database' => DB_NAME,
                'upload_dir' => is_writable(UPLOAD_DIR) ? 'Ghi được file (Writable)' : 'Chỉ lưu trong Database'
            ]);
        } else {
            jsonResponse(false, 'Chưa kết nối được MySQL trong config.php');
        }
        break;

    // -------------------------------------------------------------
    // ĐĂNG NHẬP (Hỗ trợ Tên đăng nhập hoặc Email)
    // -------------------------------------------------------------
    case 'login':
        $username = trim($_POST['username'] ?? '');
        $password = trim($_POST['password'] ?? '');

        if (empty($username) || empty($password)) {
            jsonResponse(false, 'Vui lòng nhập tên đăng nhập/email và mật khẩu!');
        }

        $stmt = $pdo->prepare("SELECT * FROM `users` WHERE LOWER(`username`) = LOWER(?) OR (email != '' AND LOWER(`email`) = LOWER(?)) LIMIT 1");
        $stmt->execute([$username, $username]);
        $user = $stmt->fetch();

        if ($user && $user['password'] === $password) {
            $_SESSION['user'] = [
                'id' => $user['id'],
                'username' => $user['username'],
                'fullname' => $user['fullname'],
                'email' => $user['email'] ?? '',
                'role' => $user['role']
            ];
            jsonResponse(true, 'Đăng nhập thành công!', $_SESSION['user']);
        } else {
            jsonResponse(false, 'Tên đăng nhập/email hoặc mật khẩu không chính xác!');
        }
        break;

    // -------------------------------------------------------------
    // GỬI MÃ OTP 6 SỐ THẬT ĐẾN GMAIL
    // -------------------------------------------------------------
    case 'send_otp':
        $email = trim($_POST['email'] ?? '');
        $username = trim($_POST['username'] ?? '');
        $actionType = trim($_POST['action_type'] ?? 'register'); // 'register' hoặc 'forgot'

        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(false, 'Địa chỉ Gmail không hợp lệ!');
        }

        if ($actionType === 'forgot') {
            // Rà soát chính xác cả Tên đăng nhập VÀ Gmail đã đăng ký
            if (empty($username)) {
                jsonResponse(false, 'Vui lòng nhập Tên đăng nhập của tài khoản cần lấy lại mật khẩu!');
            }
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM `users` WHERE LOWER(`username`) = LOWER(?) AND LOWER(`email`) = LOWER(?)");
            $stmt->execute([$username, $email]);
            if ($stmt->fetchColumn() == 0) {
                jsonResponse(false, 'Tên đăng nhập và Gmail không khớp với bất kỳ tài khoản nào trong hệ thống!');
            }
        } elseif ($actionType === 'register') {
            // Kiểm tra email đã có người dùng chưa
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM `users` WHERE LOWER(`email`) = LOWER(?)");
            $stmt->execute([$email]);
            if ($stmt->fetchColumn() > 0) {
                jsonResponse(false, 'Gmail này đã được sử dụng bởi một tài khoản khác!');
            }
        }

        // Tạo mã OTP 6 số ngẫu nhiên
        $otpCode = (string) rand(100000, 999999);
        $_SESSION['pending_otp'] = [
            'email' => strtolower($email),
            'username' => strtolower($username),
            'otp' => $otpCode,
            'action_type' => $actionType,
            'expires_at' => time() + 300 // 5 phút
        ];

        // Gửi thư thật qua PHP mail()
        $subject = "[Tin Học Văn Phòng] Mã OTP xác thực: " . $otpCode;
        $body = "Chào bạn,\r\n\r\n" .
                "Mã OTP xác thực 6 chữ số của bạn là: " . $otpCode . "\r\n\r\n" .
                "Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.\r\n\r\n" .
                "Trân trọng,\r\nTrung Tâm Tin Học Văn Phòng.";
        $headers = "From: Tin Hoc Van Phong <no-reply@tinhocvanphong.edu.vn>\r\n" .
                   "Reply-To: no-reply@tinhocvanphong.edu.vn\r\n" .
                   "Content-Type: text/plain; charset=UTF-8\r\n" .
                   "X-Mailer: PHP/" . phpversion();

        $mailSent = @mail($email, $subject, $body, $headers);

        jsonResponse(true, 'Mã OTP đã được gửi đến email ' . $email, [
            'email' => $email,
            'otp_preview' => $otpCode, // Hỗ trợ hiển thị preview khi test
            'mail_sent' => $mailSent
        ]);
        break;

    // -------------------------------------------------------------
    // XÁC MINH MÃ OTP
    // -------------------------------------------------------------
    case 'verify_otp':
        $email = strtolower(trim($_POST['email'] ?? ''));
        $otp = trim($_POST['otp'] ?? '');

        if (!isset($_SESSION['pending_otp'])) {
            jsonResponse(false, 'Mã OTP đã hết hạn hoặc chưa được tạo. Vui lòng bấm gửi lại mã!');
        }

        $pending = $_SESSION['pending_otp'];
        if ($pending['email'] !== $email) {
            jsonResponse(false, 'Email không khớp với yêu cầu OTP!');
        }

        if (time() > $pending['expires_at']) {
            unset($_SESSION['pending_otp']);
            jsonResponse(false, 'Mã OTP đã hết hạn! Vui lòng yêu cầu mã mới.');
        }

        if ($pending['otp'] !== $otp) {
            jsonResponse(false, 'Mã OTP 6 số không chính xác! Vui lòng kiểm tra lại.');
        }

        $_SESSION['verified_otp_email'] = $email;
        jsonResponse(true, 'Xác minh mã OTP thành công!');
        break;

    // -------------------------------------------------------------
    // ĐẶT LẠI MẬT KHẨU MỚI (QUÊN MẬT KHẨU)
    // -------------------------------------------------------------
    case 'reset_password':
        $email = strtolower(trim($_POST['email'] ?? ''));
        $newPassword = trim($_POST['password'] ?? '');

        if (empty($email) || empty($newPassword)) {
            jsonResponse(false, 'Vui lòng nhập mật khẩu mới!');
        }

        if (strlen($newPassword) < 4) {
            jsonResponse(false, 'Mật khẩu mới phải có ít nhất 4 ký tự!');
        }

        $stmt = $pdo->prepare("UPDATE `users` SET `password` = ? WHERE LOWER(`email`) = ?");
        $stmt->execute([$newPassword, $email]);

        unset($_SESSION['pending_otp']);
        unset($_SESSION['verified_otp_email']);

        // Tự động lấy thông tin người dùng để đăng nhập luôn
        $stmtUser = $pdo->prepare("SELECT * FROM `users` WHERE LOWER(`email`) = ? LIMIT 1");
        $stmtUser->execute([$email]);
        $user = $stmtUser->fetch();
        if ($user) {
            $_SESSION['user'] = [
                'id' => $user['id'],
                'username' => $user['username'],
                'fullname' => $user['fullname'],
                'email' => $user['email'],
                'role' => $user['role']
            ];
            jsonResponse(true, 'Đổi mật khẩu thành công! Bạn đã được đăng nhập vào hệ thống.', $_SESSION['user']);
        }

        jsonResponse(true, 'Cập nhật mật khẩu mới thành công! Vui lòng đăng nhập lại.');
        break;

    // -------------------------------------------------------------
    // ĐĂNG KÝ TÀI KHOẢN HỌC VIÊN (LƯU VÀO MYSQL)
    // -------------------------------------------------------------
    case 'register':
        $fullname = trim($_POST['fullname'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $username = trim($_POST['username'] ?? '');
        $password = trim($_POST['password'] ?? '');

        if (empty($fullname) || empty($username) || empty($password)) {
            jsonResponse(false, 'Vui lòng điền đầy đủ các trường thông tin!');
        }

        // Kiểm tra username đã tồn tại chưa
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM `users` WHERE LOWER(`username`) = LOWER(?)");
        $stmt->execute([$username]);
        if ($stmt->fetchColumn() > 0) {
            jsonResponse(false, 'Tên đăng nhập này đã tồn tại! Vui lòng chọn tên khác.');
        }

        // Kiểm tra email nếu có
        if (!empty($email)) {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM `users` WHERE LOWER(`email`) = LOWER(?)");
            $stmt->execute([$email]);
            if ($stmt->fetchColumn() > 0) {
                jsonResponse(false, 'Email này đã được sử dụng bởi một tài khoản khác!');
            }
        }

        $stmt = $pdo->prepare("INSERT INTO `users` (`username`, `password`, `fullname`, `email`, `role`) VALUES (?, ?, ?, ?, 'student')");
        $stmt->execute([$username, $password, $fullname, $email]);

        $newUser = [
            'id' => $pdo->lastInsertId(),
            'username' => $username,
            'fullname' => $fullname,
            'email' => $email,
            'role' => 'student'
        ];
        $_SESSION['user'] = $newUser;
        unset($_SESSION['pending_otp']);

        jsonResponse(true, 'Đăng ký tài khoản học viên thành công!', $newUser);
        break;

    // -------------------------------------------------------------
    // ĐĂNG XUẤT
    // -------------------------------------------------------------
    case 'logout':
        session_destroy();
        jsonResponse(true, 'Đã đăng xuất.');
        break;

    // -------------------------------------------------------------
    // LẤY DANH SÁCH BÀI TẬP TỪ MYSQL
    // -------------------------------------------------------------
    case 'get_exercises':
        $stmt = $pdo->query("SELECT `id`, `category`, `title`, `level`, `requirements`, `file_name`, `file_path`, `file_size`, `solution_steps`, `uploaded_by`, `created_at` FROM `exercises` ORDER BY `id` DESC");
        $exercises = $stmt->fetchAll();

        foreach ($exercises as &$ex) {
            $ex['requirements'] = json_decode($ex['requirements'], true) ?: [];
            $ex['solution_steps'] = json_decode($ex['solution_steps'], true) ?: [];
        }
        jsonResponse(true, 'Lấy danh sách bài tập thành công', $exercises);
        break;

    // -------------------------------------------------------------
    // GIẢNG VIÊN TẢI ĐỀ BÀI LÊN (LƯU TRỰC TIẾP VÀO MYSQL VÀ FILE UPLOADS)
    // -------------------------------------------------------------
    case 'upload_exercise':
        $title = trim($_POST['title'] ?? '');
        $category = trim($_POST['category'] ?? 'word');
        $level = trim($_POST['level'] ?? 'Cơ bản');
        $requirementsRaw = trim($_POST['requirements'] ?? '');
        $uploadedBy = trim($_POST['uploaded_by'] ?? 'Giảng viên');
        $solutionStepsRaw = trim($_POST['solution_steps'] ?? '[]');

        if (empty($title) || empty($requirementsRaw)) {
            jsonResponse(false, 'Vui lòng nhập đầy đủ tiêu đề và yêu cầu bài tập!');
        }

        $reqLines = array_filter(array_map('trim', explode("\n", $requirementsRaw)));
        $requirementsJson = json_encode(array_values($reqLines), JSON_UNESCAPED_UNICODE);

        $originalFileName = 'De_Thuc_Hanh_' . time() . '.docx';
        $relativeFilePath = '';
        $fileSize = 0;
        $fileDataBase64 = '';

        if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['file'];
            $originalFileName = basename($file['name']);
            $fileSize = $file['size'];

            // Đọc toàn bộ nội dung file và mã hóa Base64 để lưu thẳng vào MySQL
            $rawContent = file_get_contents($file['tmp_name']);
            $fileDataBase64 = base64_encode($rawContent);

            // Thử lưu file vào thư mục uploads/ nếu quyền cho phép
            $ext = pathinfo($originalFileName, PATHINFO_EXTENSION);
            $safeName = 'de_' . time() . '_' . rand(1000, 9999) . '.' . $ext;
            $destination = UPLOAD_DIR . $safeName;
            if (@move_uploaded_file($file['tmp_name'], $destination)) {
                $relativeFilePath = 'uploads/' . $safeName;
            }
        } else {
            // Nếu không chọn file, tự sinh nội dung đề mẫu
            $ext = $category === 'word' ? 'docx' : ($category === 'excel' ? 'xlsx' : ($category === 'theory' ? 'pdf' : 'pptx'));
            $safeName = 'de_' . time() . '.' . $ext;
            $destination = UPLOAD_DIR . $safeName;
            $dummyContent = "BÀI TẬP: $title\nYêu cầu thực hành:\n" . implode("\n", $reqLines);
            $fileDataBase64 = base64_encode($dummyContent);
            $fileSize = strlen($dummyContent);
            $originalFileName = $category === 'theory' ? "TaiLieu_{$title}.{$ext}" : "De_{$category}_{$title}.{$ext}";
            if (@file_put_contents($destination, $dummyContent)) {
                $relativeFilePath = 'uploads/' . $safeName;
            }
        }

        // Lưu toàn bộ vào MySQL (bao gồm cả nội dung file trong file_data)
        $sql = "INSERT INTO `exercises` (`category`, `title`, `level`, `requirements`, `file_name`, `file_path`, `file_data`, `file_size`, `solution_steps`, `uploaded_by`) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $category,
            $title,
            $level,
            $requirementsJson,
            $originalFileName,
            $relativeFilePath,
            $fileDataBase64,
            $fileSize,
            $solutionStepsRaw,
            $uploadedBy
        ]);

        jsonResponse(true, 'Tải lên bài tập và lưu vào Database MySQL thành công!', [
            'id' => $pdo->lastInsertId(),
            'file_name' => $originalFileName
        ]);
        break;

    // -------------------------------------------------------------
    // XÓA BÀI TẬP (XÓA KHỎI MYSQL VÀ XÓA FILE TRÊN ĐĨA)
    // -------------------------------------------------------------
    case 'delete_exercise':
        $id = intval($_POST['id'] ?? 0);
        if ($id <= 0) jsonResponse(false, 'ID không hợp lệ');

        // Tìm file để xóa đĩa nếu có
        $stmt = $pdo->prepare("SELECT `file_path` FROM `exercises` WHERE `id` = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row && !empty($row['file_path'])) {
            $physicalFile = __DIR__ . '/' . $row['file_path'];
            if (file_exists($physicalFile)) @unlink($physicalFile);
        }

        // Xóa hoàn toàn trong Database
        $stmt = $pdo->prepare("DELETE FROM `exercises` WHERE `id` = ?");
        $stmt->execute([$id]);
        jsonResponse(true, 'Đã xóa bài tập khỏi Database MySQL thành công!');
        break;

    // -------------------------------------------------------------
    // LẤY DANH SÁCH BÀI NỘP TỪ MYSQL
    // -------------------------------------------------------------
    case 'get_submissions':
        $stmt = $pdo->query("SELECT `id`, `exercise_id`, `exercise_title`, `category`, `student_username`, `student_name`, `student_mssv`, `file_name`, `file_path`, `file_size`, `note`, `grade`, `feedback`, `submitted_at` FROM `submissions` ORDER BY `id` DESC");
        $submissions = $stmt->fetchAll();
        jsonResponse(true, 'Lấy danh sách bài nộp thành công', $submissions);
        break;

    // -------------------------------------------------------------
    // SINH VIÊN NỘP BÀI (LƯU TRỰC TIẾP VÀO MYSQL VÀ FILE UPLOADS)
    // -------------------------------------------------------------
    case 'submit_assignment':
        $exerciseId = intval($_POST['exercise_id'] ?? 0);
        $exerciseTitle = trim($_POST['exercise_title'] ?? '');
        $category = trim($_POST['category'] ?? '');
        $studentUsername = trim($_POST['student_username'] ?? '');
        $studentName = trim($_POST['student_name'] ?? '');
        $studentMssv = trim($_POST['student_mssv'] ?? '');
        $note = trim($_POST['note'] ?? '');

        if ($exerciseId <= 0 || empty($studentUsername)) {
            jsonResponse(false, 'Thông tin bài nộp không hợp lệ!');
        }

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(false, 'Vui lòng chọn file bài làm từ máy tính của bạn!');
        }

        $file = $_FILES['file'];
        $originalFileName = basename($file['name']);
        $fileSize = $file['size'];

        // Đọc toàn bộ nội dung file và mã hóa Base64 để lưu vào Database
        $rawContent = file_get_contents($file['tmp_name']);
        $fileDataBase64 = base64_encode($rawContent);

        // Thử lưu file vào thư mục uploads/
        $ext = pathinfo($originalFileName, PATHINFO_EXTENSION);
        $safeName = 'nop_' . $studentMssv . '_' . time() . '.' . $ext;
        $destination = UPLOAD_DIR . $safeName;
        $relativeFilePath = '';

        if (@move_uploaded_file($file['tmp_name'], $destination)) {
            $relativeFilePath = 'uploads/' . $safeName;
        }

        // Kiểm tra xem sinh viên đã nộp bài này trước đó chưa
        $stmt = $pdo->prepare("SELECT `id`, `file_path` FROM `submissions` WHERE `exercise_id` = ? AND `student_username` = ?");
        $stmt->execute([$exerciseId, $studentUsername]);
        $existing = $stmt->fetch();

        if ($existing) {
            // Xóa file cũ trên đĩa nếu có
            if (!empty($existing['file_path'])) {
                $oldFile = __DIR__ . '/' . $existing['file_path'];
                if (file_exists($oldFile)) @unlink($oldFile);
            }

            // Cập nhật bản ghi mới trong MySQL
            $updateSql = "UPDATE `submissions` SET `file_name` = ?, `file_path` = ?, `file_data` = ?, `file_size` = ?, `note` = ?, `submitted_at` = CURRENT_TIMESTAMP WHERE `id` = ?";
            $stmt = $pdo->prepare($updateSql);
            $stmt->execute([$originalFileName, $relativeFilePath, $fileDataBase64, $fileSize, $note, $existing['id']]);
        } else {
            // Thêm mới vào MySQL
            $insertSql = "INSERT INTO `submissions` (`exercise_id`, `exercise_title`, `category`, `student_username`, `student_name`, `student_mssv`, `file_name`, `file_path`, `file_data`, `file_size`, `note`) 
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($insertSql);
            $stmt->execute([
                $exerciseId,
                $exerciseTitle,
                $category,
                $studentUsername,
                $studentName,
                $studentMssv,
                $originalFileName,
                $relativeFilePath,
                $fileDataBase64,
                $fileSize,
                $note
            ]);
        }

        jsonResponse(true, 'Nộp bài và lưu vào Database MySQL thành công!', [
            'file_name' => $originalFileName
        ]);
        break;

    // -------------------------------------------------------------
    // GIẢNG VIÊN CHẤM ĐIỂM & NHẬN XÉT (CẬP NHẬT MYSQL)
    // -------------------------------------------------------------
    case 'save_grade':
        $submissionId = intval($_POST['submission_id'] ?? 0);
        $grade = trim($_POST['grade'] ?? '');
        $feedback = trim($_POST['feedback'] ?? '');

        if ($submissionId <= 0 || empty($grade)) {
            jsonResponse(false, 'Vui lòng nhập điểm số hợp lệ!');
        }

        $stmt = $pdo->prepare("UPDATE `submissions` SET `grade` = ?, `feedback` = ? WHERE `id` = ?");
        $stmt->execute([$grade, $feedback, $submissionId]);

        jsonResponse(true, 'Lưu kết quả chấm điểm vào Database MySQL thành công!');
        break;

    // -------------------------------------------------------------
    // XÓA BÀI NỘP CỦA SINH VIÊN (XÓA TRONG MYSQL)
    // -------------------------------------------------------------
    case 'delete_submission':
        $id = intval($_POST['id'] ?? 0);
        if ($id <= 0) jsonResponse(false, 'ID không hợp lệ');

        $stmt = $pdo->prepare("SELECT `file_path` FROM `submissions` WHERE `id` = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row && !empty($row['file_path'])) {
            $physicalFile = __DIR__ . '/' . $row['file_path'];
            if (file_exists($physicalFile)) @unlink($physicalFile);
        }

        $stmt = $pdo->prepare("DELETE FROM `submissions` WHERE `id` = ?");
        $stmt->execute([$id]);
        jsonResponse(true, 'Đã xóa bài nộp khỏi Database MySQL thành công!');
        break;

    // -------------------------------------------------------------
    // DIỄN ĐÀN CỘNG ĐỒNG: LẤY DANH SÁCH BÀI VIẾT & THỐNG KÊ
    // -------------------------------------------------------------
    case 'forum_get_posts':
        $sort = trim($_GET['sort'] ?? 'recent');
        $tag = ltrim(trim($_GET['tag'] ?? ''), '#');
        $group = trim($_GET['group'] ?? '');
        $type = trim($_GET['type'] ?? '');
        $author = trim($_GET['author'] ?? '');
        $search = trim($_GET['search'] ?? '');
        $page = max(1, intval($_GET['page'] ?? 1));
        $limit = max(1, min(50, intval($_GET['limit'] ?? 8)));

        $sql = "SELECT p.`id`, p.`user_id`, p.`author_name`, p.`author_username`, p.`author_role`,
                       p.`author_avatar`, p.`author_mssv`, p.`post_type`, p.`title`, p.`content`,
                       p.`feeling`, p.`tags`, p.`group_name`, p.`file_name`, p.`file_path`, p.`file_size`,
                       p.`image_name`, p.`image_path`, p.`meta_score`, p.`reactions`, p.`is_pinned`,
                       p.`views`, p.`created_at`,
                       (SELECT COUNT(*) FROM `forum_comments` c WHERE c.`post_id` = p.`id`) AS `comment_count`
                FROM `forum_posts` p
                ORDER BY p.`is_pinned` DESC, p.`id` DESC";
        $stmt = $pdo->query($sql);
        $allRows = $stmt->fetchAll();

        $defaultReactions = ['like' => [], 'love' => [], 'idea' => [], 'wow' => [], 'sad' => []];
        $groupCounts = [];
        $tagCounts = [];
        $contribMap = [];

        foreach ($allRows as &$row) {
            $decodedReactions = json_decode($row['reactions'] ?? '', true);
            $row['reactions'] = is_array($decodedReactions) ? array_merge($defaultReactions, $decodedReactions) : $defaultReactions;
            $row['meta_score'] = !empty($row['meta_score']) ? json_decode($row['meta_score'], true) : null;
            $row['comment_count'] = intval($row['comment_count'] ?? 0);
            $row['is_pinned'] = intval($row['is_pinned'] ?? 0);
            $row['file_size'] = intval($row['file_size'] ?? 0);

            if (!empty($row['group_name'])) {
                $groupCounts[$row['group_name']] = ($groupCounts[$row['group_name']] ?? 0) + 1;
            }
            if (!empty($row['tags'])) {
                foreach (explode(',', $row['tags']) as $t) {
                    $cleanT = ltrim(trim($t), '#');
                    if ($cleanT !== '') {
                        $tagCounts[$cleanT] = ($tagCounts[$cleanT] ?? 0) + 1;
                    }
                }
            }

            $uKey = $row['author_username'];
            if (!isset($contribMap[$uKey])) {
                $contribMap[$uKey] = [
                    'username' => $uKey,
                    'name' => $row['author_name'],
                    'role' => $row['author_role'],
                    'points' => 0
                ];
            }
            $rxTotal = 0;
            foreach ($row['reactions'] as $rxArr) {
                $rxTotal += is_array($rxArr) ? count($rxArr) : 0;
            }
            $contribMap[$uKey]['points'] += 10 + ($rxTotal * 5) + ($row['comment_count'] * 2);
        }
        unset($row);

        arsort($tagCounts);
        $trendingTags = [];
        foreach (array_slice($tagCounts, 0, 6, true) as $tName => $tCount) {
            $trendingTags[] = ['tag' => $tName, 'count' => $tCount];
        }

        $leaderboard = array_values($contribMap);
        usort($leaderboard, function ($a, $b) {
            return $b['points'] <=> $a['points'];
        });
        $leaderboard = array_slice($leaderboard, 0, 5);

        $filtered = array_values(array_filter($allRows, function ($p) use ($tag, $group, $type, $author, $search, $sort) {
            if ($tag !== '') {
                $hay = mb_strtolower(($p['tags'] ?? '') . ' ' . ($p['content'] ?? ''), 'UTF-8');
                if (mb_strpos($hay, '#' . mb_strtolower($tag, 'UTF-8')) === false && mb_strpos($hay, mb_strtolower($tag, 'UTF-8')) === false) {
                    return false;
                }
            }
            if ($group !== '' && ($p['group_name'] ?? '') !== $group) {
                return false;
            }
            if ($type !== '' && ($p['post_type'] ?? '') !== $type) {
                return false;
            }
            if ($author !== '' && strcasecmp($p['author_username'] ?? '', $author) !== 0) {
                return false;
            }
            if ($sort === 'teacher') {
                if (!isTeacherRole($p['author_role'] ?? '', $p['author_username'] ?? '')) {
                    return false;
                }
            } elseif ($sort === 'score') {
                if (($p['post_type'] ?? '') !== 'score_brag' && empty($p['meta_score'])) {
                    return false;
                }
            }
            if ($search !== '') {
                $kw = mb_strtolower($search, 'UTF-8');
                $text = mb_strtolower(($p['title'] ?? '') . ' ' . ($p['content'] ?? '') . ' ' . ($p['author_name'] ?? ''), 'UTF-8');
                if (mb_strpos($text, $kw) === false) {
                    return false;
                }
            }
            return true;
        }));

        if ($sort === 'hot') {
            usort($filtered, function ($a, $b) {
                $sumA = 0;
                foreach ($a['reactions'] as $arr) { $sumA += is_array($arr) ? count($arr) : 0; }
                $sumB = 0;
                foreach ($b['reactions'] as $arr) { $sumB += is_array($arr) ? count($arr) : 0; }
                return ($sumB + $b['comment_count']) <=> ($sumA + $a['comment_count']);
            });
        }

        $offset = ($page - 1) * $limit;
        $paged = array_slice($filtered, $offset, $limit);
        $hasMore = ($offset + count($paged)) < count($filtered);

        jsonResponse(true, 'Lấy bài viết diễn đàn thành công', [
            'posts' => $paged,
            'has_more' => $hasMore,
            'summary' => [
                'group_counts' => $groupCounts,
                'trending_tags' => $trendingTags,
                'leaderboard' => $leaderboard
            ]
        ]);
        break;

    // -------------------------------------------------------------
    // DIỄN ĐÀN CỘNG ĐỒNG: TẠO BÀI VIẾT MỚI
    // -------------------------------------------------------------
    case 'forum_create_post':
        $authorName = trim($_POST['author_name'] ?? '');
        $authorUsername = trim($_POST['author_username'] ?? '');
        $authorRole = trim($_POST['author_role'] ?? 'student');
        $authorAvatar = trim($_POST['author_avatar'] ?? '');
        $authorMssv = trim($_POST['author_mssv'] ?? '');
        $userId = intval($_POST['user_id'] ?? 0);
        $postType = trim($_POST['post_type'] ?? 'general');
        $title = trim($_POST['title'] ?? '');
        $content = trim($_POST['content'] ?? '');
        $feeling = trim($_POST['feeling'] ?? '');
        $groupName = trim($_POST['group_name'] ?? '');
        $metaScoreRaw = trim($_POST['meta_score'] ?? '');

        if (empty($authorUsername) || empty($content)) {
            jsonResponse(false, 'Vui lòng đăng nhập và nhập nội dung bài viết!');
        }

        preg_match_all('/#([a-zA-Z0-9_\p{L}]+)/u', $content, $tagMatches);
        $tagsStr = !empty($tagMatches[0]) ? implode(',', array_unique($tagMatches[0])) : '';

        $imageName = '';
        $imagePath = '';
        $imageData = null;
        if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
            $img = $_FILES['image'];
            $imageName = basename($img['name']);
            $rawImg = file_get_contents($img['tmp_name']);
            $mime = $img['type'] ?: 'image/png';
            $imageData = 'data:' . $mime . ';base64,' . base64_encode($rawImg);
            $ext = pathinfo($imageName, PATHINFO_EXTENSION) ?: 'png';
            $safeImgName = 'forum_img_' . time() . '_' . rand(1000, 9999) . '.' . $ext;
            if (@move_uploaded_file($img['tmp_name'], UPLOAD_DIR . $safeImgName)) {
                $imagePath = 'uploads/' . $safeImgName;
            }
        }

        $fileName = '';
        $filePath = '';
        $fileData = null;
        $fileSize = 0;
        if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $f = $_FILES['file'];
            $fileName = basename($f['name']);
            $fileSize = intval($f['size']);
            $rawFile = file_get_contents($f['tmp_name']);
            $fileData = base64_encode($rawFile);
            $ext = pathinfo($fileName, PATHINFO_EXTENSION);
            $safeFileName = 'forum_file_' . time() . '_' . rand(1000, 9999) . ($ext ? '.' . $ext : '');
            if (@move_uploaded_file($f['tmp_name'], UPLOAD_DIR . $safeFileName)) {
                $filePath = 'uploads/' . $safeFileName;
            }
        }

        $emptyReactions = json_encode(['like' => [], 'love' => [], 'idea' => [], 'wow' => [], 'sad' => []]);
        $stmt = $pdo->prepare("INSERT INTO `forum_posts`
            (`user_id`, `author_name`, `author_username`, `author_role`, `author_avatar`, `author_mssv`,
             `post_type`, `title`, `content`, `feeling`, `tags`, `group_name`,
             `file_name`, `file_path`, `file_data`, `file_size`,
             `image_name`, `image_path`, `image_data`, `meta_score`, `reactions`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $userId,
            $authorName ?: $authorUsername,
            $authorUsername,
            $authorRole,
            $authorAvatar,
            $authorMssv,
            $postType,
            $title,
            $content,
            $feeling,
            $tagsStr,
            $groupName,
            $fileName,
            $filePath,
            $fileData,
            $fileSize,
            $imageName,
            $imagePath,
            $imageData,
            $metaScoreRaw !== '' ? $metaScoreRaw : null,
            $emptyReactions
        ]);

        jsonResponse(true, 'Đăng bài viết thành công!', ['id' => intval($pdo->lastInsertId())]);
        break;

    // -------------------------------------------------------------
    // DIỄN ĐÀN CỘNG ĐỒNG: XÓA BÀI VIẾT
    // -------------------------------------------------------------
    case 'forum_delete_post':
        $id = intval($_POST['id'] ?? 0);
        $username = trim($_POST['username'] ?? '');
        $role = strtolower(trim($_POST['role'] ?? 'student'));
        if ($id <= 0) jsonResponse(false, 'ID bài viết không hợp lệ!');

        $stmt = $pdo->prepare("SELECT `author_username`, `file_path`, `image_path` FROM `forum_posts` WHERE `id` = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) jsonResponse(false, 'Không tìm thấy bài viết!');

        if (!canDeleteForumPost($pdo, $row['author_username'], $username, $role)) {
            jsonResponse(false, 'Bạn không có quyền xóa bài viết này! Chỉ tác giả bài viết hoặc tài khoản Giáo viên mới được phép xóa.');
        }

        if (!empty($row['file_path']) && file_exists(__DIR__ . '/' . $row['file_path'])) {
            @unlink(__DIR__ . '/' . $row['file_path']);
        }
        if (!empty($row['image_path']) && file_exists(__DIR__ . '/' . $row['image_path'])) {
            @unlink(__DIR__ . '/' . $row['image_path']);
        }

        $pdo->prepare("DELETE FROM `forum_comments` WHERE `post_id` = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM `forum_posts` WHERE `id` = ?")->execute([$id]);
        jsonResponse(true, 'Đã xóa bài viết thành công!');
        break;

    // -------------------------------------------------------------
    // DIỄN ĐÀN CỘNG ĐỒNG: THẢ CẢM XÚC BÀI VIẾT
    // -------------------------------------------------------------
    case 'forum_react_post':
        $postId = intval($_POST['post_id'] ?? 0);
        $reaction = trim($_POST['reaction'] ?? 'like');
        $username = trim($_POST['username'] ?? '');
        $allowed = ['like', 'love', 'idea', 'wow', 'sad'];

        if ($postId <= 0 || empty($username) || !in_array($reaction, $allowed, true)) {
            jsonResponse(false, 'Thông tin biểu cảm không hợp lệ!');
        }

        $stmt = $pdo->prepare("SELECT `reactions` FROM `forum_posts` WHERE `id` = ?");
        $stmt->execute([$postId]);
        $row = $stmt->fetch();
        if (!$row) jsonResponse(false, 'Bài viết không tồn tại!');

        $defaultReactions = ['like' => [], 'love' => [], 'idea' => [], 'wow' => [], 'sad' => []];
        $decoded = json_decode($row['reactions'] ?? '', true);
        $reactions = is_array($decoded) ? array_merge($defaultReactions, $decoded) : $defaultReactions;

        $prevType = null;
        foreach ($allowed as $t) {
            $list = is_array($reactions[$t]) ? $reactions[$t] : [];
            $idx = array_search($username, $list, true);
            if ($idx !== false) {
                $prevType = $t;
                array_splice($list, $idx, 1);
                $reactions[$t] = array_values($list);
            }
        }
        if ($prevType !== $reaction) {
            $reactions[$reaction][] = $username;
        }

        $upd = $pdo->prepare("UPDATE `forum_posts` SET `reactions` = ? WHERE `id` = ?");
        $upd->execute([json_encode($reactions, JSON_UNESCAPED_UNICODE), $postId]);
        jsonResponse(true, 'Đã cập nhật cảm xúc', ['reactions' => $reactions]);
        break;

    // -------------------------------------------------------------
    // DIỄN ĐÀN CỘNG ĐỒNG: LẤY BÌNH LUẬN BÀI VIẾT
    // -------------------------------------------------------------
    case 'forum_get_comments':
        $postId = intval($_GET['post_id'] ?? 0);
        if ($postId <= 0) jsonResponse(false, 'ID bài viết không hợp lệ!');

        $stmt = $pdo->prepare("SELECT `id`, `post_id`, `parent_id`, `user_id`, `author_name`, `author_username`,
                                      `author_role`, `author_avatar`, `content`, `image_name`, `image_path`,
                                      `reactions`, `created_at`
                               FROM `forum_comments`
                               WHERE `post_id` = ?
                               ORDER BY `id` ASC");
        $stmt->execute([$postId]);
        $comments = $stmt->fetchAll();
        foreach ($comments as &$c) {
            $c['id'] = intval($c['id']);
            $c['post_id'] = intval($c['post_id']);
            $c['parent_id'] = intval($c['parent_id']);
            $decoded = json_decode($c['reactions'] ?? '', true);
            $c['reactions'] = is_array($decoded) ? $decoded : ['like' => []];
        }
        unset($c);
        jsonResponse(true, 'Lấy bình luận thành công', $comments);
        break;

    // -------------------------------------------------------------
    // DIỄN ĐÀN CỘNG ĐỒNG: THÊM BÌNH LUẬN
    // -------------------------------------------------------------
    case 'forum_add_comment':
        $postId = intval($_POST['post_id'] ?? 0);
        $parentId = intval($_POST['parent_id'] ?? 0);
        $content = trim($_POST['content'] ?? '');
        $authorName = trim($_POST['author_name'] ?? '');
        $authorUsername = trim($_POST['author_username'] ?? '');
        $authorRole = trim($_POST['author_role'] ?? 'student');
        $authorAvatar = trim($_POST['author_avatar'] ?? '');
        $userId = intval($_POST['user_id'] ?? 0);

        $imageName = '';
        $imagePath = '';
        $imageData = null;

        if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
            $img = $_FILES['image'];
            $imageName = basename($img['name']);
            $rawImg = file_get_contents($img['tmp_name']);
            $mime = $img['type'] ?: 'image/png';
            $imageData = 'data:' . $mime . ';base64,' . base64_encode($rawImg);
            $ext = pathinfo($imageName, PATHINFO_EXTENSION) ?: 'png';
            $safeImgName = 'forum_cmt_' . time() . '_' . rand(1000, 9999) . '.' . $ext;
            if (@move_uploaded_file($img['tmp_name'], UPLOAD_DIR . $safeImgName)) {
                $imagePath = 'uploads/' . $safeImgName;
            }
        } elseif (!empty($_POST['image_base64'])) {
            $imageName = 'comment_img.png';
            $imageData = trim($_POST['image_base64']);
        }

        if ($postId <= 0 || empty($authorUsername) || ($content === '' && $imageName === '')) {
            jsonResponse(false, 'Vui lòng nhập nội dung bình luận!');
        }

        $reactionsJson = json_encode(['like' => []]);
        $stmt = $pdo->prepare("INSERT INTO `forum_comments`
            (`post_id`, `parent_id`, `user_id`, `author_name`, `author_username`, `author_role`, `author_avatar`,
             `content`, `image_name`, `image_path`, `image_data`, `reactions`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $postId,
            $parentId,
            $userId,
            $authorName ?: $authorUsername,
            $authorUsername,
            $authorRole,
            $authorAvatar,
            $content,
            $imageName,
            $imagePath,
            $imageData,
            $reactionsJson
        ]);

        jsonResponse(true, 'Đã gửi bình luận!', ['id' => intval($pdo->lastInsertId())]);
        break;

    // -------------------------------------------------------------
    // DIỄN ĐÀN CỘNG ĐỒNG: THẢ TIM BÌNH LUẬN
    // -------------------------------------------------------------
    case 'forum_react_comment':
        $commentId = intval($_POST['comment_id'] ?? 0);
        $username = trim($_POST['username'] ?? '');
        if ($commentId <= 0 || empty($username)) {
            jsonResponse(false, 'Thông tin không hợp lệ!');
        }

        $stmt = $pdo->prepare("SELECT `reactions` FROM `forum_comments` WHERE `id` = ?");
        $stmt->execute([$commentId]);
        $row = $stmt->fetch();
        if (!$row) jsonResponse(false, 'Không tìm thấy bình luận!');

        $decoded = json_decode($row['reactions'] ?? '', true);
        $likes = (is_array($decoded) && isset($decoded['like']) && is_array($decoded['like'])) ? $decoded['like'] : [];
        $idx = array_search($username, $likes, true);
        if ($idx !== false) {
            array_splice($likes, $idx, 1);
        } else {
            $likes[] = $username;
        }
        $newReactions = ['like' => array_values($likes)];
        $pdo->prepare("UPDATE `forum_comments` SET `reactions` = ? WHERE `id` = ?")
            ->execute([json_encode($newReactions, JSON_UNESCAPED_UNICODE), $commentId]);

        jsonResponse(true, 'Đã cập nhật thích bình luận', ['reactions' => $newReactions]);
        break;

    // -------------------------------------------------------------
    // DIỄN ĐÀN CỘNG ĐỒNG: TRANG CÁ NHÂN (PROFILE WALL)
    // -------------------------------------------------------------
    case 'forum_get_profile':
        $username = trim($_GET['username'] ?? '');
        if ($username === '') jsonResponse(false, 'Thiếu tên người dùng!');

        $stmtU = $pdo->prepare("SELECT `id`, `username`, `fullname`, `role`, `mssv` FROM `users` WHERE LOWER(`username`) = LOWER(?) LIMIT 1");
        $stmtU->execute([$username]);
        $userRow = $stmtU->fetch();

        $stmtP = $pdo->prepare("SELECT p.`id`, p.`user_id`, p.`author_name`, p.`author_username`, p.`author_role`,
                                       p.`author_avatar`, p.`author_mssv`, p.`post_type`, p.`title`, p.`content`,
                                       p.`feeling`, p.`tags`, p.`group_name`, p.`file_name`, p.`file_path`, p.`file_size`,
                                       p.`image_name`, p.`image_path`, p.`meta_score`, p.`reactions`, p.`is_pinned`,
                                       p.`views`, p.`created_at`,
                                       (SELECT COUNT(*) FROM `forum_comments` c WHERE c.`post_id` = p.`id`) AS `comment_count`
                                FROM `forum_posts` p
                                WHERE LOWER(p.`author_username`) = LOWER(?)
                                ORDER BY p.`id` DESC");
        $stmtP->execute([$username]);
        $userPosts = $stmtP->fetchAll();

        $defaultReactions = ['like' => [], 'love' => [], 'idea' => [], 'wow' => [], 'sad' => []];
        $appreciationCount = 0;
        foreach ($userPosts as &$p) {
            $decodedRx = json_decode($p['reactions'] ?? '', true);
            $p['reactions'] = is_array($decodedRx) ? array_merge($defaultReactions, $decodedRx) : $defaultReactions;
            $p['meta_score'] = !empty($p['meta_score']) ? json_decode($p['meta_score'], true) : null;
            $p['comment_count'] = intval($p['comment_count'] ?? 0);
            foreach ($p['reactions'] as $arr) {
                $appreciationCount += is_array($arr) ? count($arr) : 0;
            }
        }
        unset($p);

        $stmtC = $pdo->prepare("SELECT COUNT(*) FROM `forum_comments` WHERE LOWER(`author_username`) = LOWER(?)");
        $stmtC->execute([$username]);
        $commentsCount = intval($stmtC->fetchColumn());

        $resolvedName = $userRow ? $userRow['fullname'] : (!empty($userPosts) ? $userPosts[0]['author_name'] : $username);
        $resolvedRole = $userRow ? $userRow['role'] : (!empty($userPosts) ? $userPosts[0]['author_role'] : 'student');
        $resolvedMssv = $userRow ? $userRow['mssv'] : (!empty($userPosts) ? $userPosts[0]['author_mssv'] : '');

        $badges = [];
        if (count($userPosts) >= 1) {
            $badges[] = ['name' => 'Thành viên tích cực', 'icon' => '🏅', 'desc' => 'Đã đóng góp bài viết trên diễn đàn'];
        }
        if ($commentsCount >= 3) {
            $badges[] = ['name' => 'Người bạn nhiệt tình', 'icon' => '💬', 'desc' => 'Tích cực thảo luận và hỗ trợ lớp'];
        }
        if ($appreciationCount >= 5) {
            $badges[] = ['name' => 'Bài viết hữu ích', 'icon' => '🌟', 'desc' => 'Nhận được nhiều cảm xúc tích cực'];
        }

        jsonResponse(true, 'Lấy hồ sơ thành viên thành công', [
            'user' => [
                'username' => $userRow ? $userRow['username'] : $username,
                'fullname' => $resolvedName,
                'role' => $resolvedRole,
                'mssv' => $resolvedMssv,
                'bio' => ''
            ],
            'stats' => [
                'posts_count' => count($userPosts),
                'comments_count' => $commentsCount,
                'appreciation_count' => $appreciationCount
            ],
            'badges' => $badges,
            'posts' => $userPosts
        ]);
        break;

    default:
        jsonResponse(false, 'Hành động không hợp lệ!');
}
?>
