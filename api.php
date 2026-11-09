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

    default:
        jsonResponse(false, 'Hành động không hợp lệ!');
}
?>
