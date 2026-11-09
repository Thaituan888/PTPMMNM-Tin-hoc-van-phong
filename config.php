<?php
/**
 * ===================================================================
 * CẤU HÌNH KẾT NỐI DATABASE MYSQL TRÊN INFINITYFREE
 * ===================================================================
 * Bạn lấy các thông số này trong trang Control Panel của InfinityFree:
 * Mục: "MySQL Databases"
 */

// 1. THÔNG TIN KẾT NỐI MYSQL INFINITYFREE (Lấy trực tiếp từ phpMyAdmin của bạn)
define('DB_HOST', 'sql202.infinityfree.com'); // Máy phục vụ của bạn
define('DB_USER', 'if0_43040726');           // Tên tài khoản MySQL của bạn
define('DB_PASS', 'THNyAJGpnfSr');    // Mật khẩu hosting InfinityFree của bạn
define('DB_NAME', 'if0_43040726_hihihi');    // Tên database của bạn

// 2. THƯ MỤC LƯU FILE UPLOAD THỰC TẾ TRÊN HOSTING
define('UPLOAD_DIR', __DIR__ . '/uploads/');

// Tự động tạo thư mục uploads nếu chưa có
if (!file_exists(UPLOAD_DIR)) {
    @mkdir(UPLOAD_DIR, 0777, true);
}

// 3. KẾT NỐI DATABASE BẰNG PDO
function getDBConnection() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
            
            // Tự động khởi tạo các bảng nếu chưa có
            initDatabaseTables($pdo);
        } catch (PDOException $e) {
            return null;
        }
    }
    return $pdo;
}

// 4. HÀM TỰ ĐỘNG TẠO BẢNG & TÀI KHOẢN MẶC ĐỊNH
function initDatabaseTables($pdo) {
    // Bảng tài khoản (users)
    $pdo->exec("CREATE TABLE IF NOT EXISTS `users` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `username` VARCHAR(50) NOT NULL UNIQUE,
        `password` VARCHAR(255) NOT NULL,
        `fullname` VARCHAR(100) NOT NULL,
        `email` VARCHAR(150) DEFAULT '',
        `mssv` VARCHAR(50) DEFAULT '',
        `role` ENUM('admin', 'student') NOT NULL DEFAULT 'student',
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Thêm cột email nếu chưa có
    try {
        $pdo->exec("ALTER TABLE `users` ADD COLUMN `email` VARCHAR(150) DEFAULT '' AFTER `fullname`");
    } catch (Exception $e) {}

    // Bảng bài tập / tài liệu (exercises)
    $pdo->exec("CREATE TABLE IF NOT EXISTS `exercises` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `category` VARCHAR(20) NOT NULL,
        `title` VARCHAR(255) NOT NULL,
        `level` VARCHAR(50) NOT NULL DEFAULT 'Cơ bản',
        `requirements` TEXT NOT NULL,
        `file_name` VARCHAR(255) NOT NULL,
        `file_path` VARCHAR(255) DEFAULT '',
        `file_data` LONGTEXT DEFAULT NULL,
        `file_size` INT DEFAULT 0,
        `solution_steps` TEXT,
        `uploaded_by` VARCHAR(100) DEFAULT 'Giảng viên',
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Bảng bài nộp của sinh viên (submissions)
    $pdo->exec("CREATE TABLE IF NOT EXISTS `submissions` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `exercise_id` INT NOT NULL,
        `exercise_title` VARCHAR(255) NOT NULL,
        `category` VARCHAR(20) NOT NULL,
        `student_username` VARCHAR(50) NOT NULL,
        `student_name` VARCHAR(100) NOT NULL,
        `student_mssv` VARCHAR(50) NOT NULL,
        `file_name` VARCHAR(255) NOT NULL,
        `file_path` VARCHAR(255) DEFAULT '',
        `file_data` LONGTEXT DEFAULT NULL,
        `file_size` INT DEFAULT 0,
        `note` TEXT,
        `grade` VARCHAR(50) DEFAULT NULL,
        `feedback` TEXT,
        `submitted_at` DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Đảm bảo chỉ có 1 tài khoản Giảng viên (admin): Giangvien / 12345678 / Nguyễn Thái Tuấn
    // Xóa các tài khoản admin cũ và các tài khoản sinh viên mẫu tạo thủ công bằng code
    $pdo->exec("DELETE FROM `users` WHERE `username` IN ('admin', 'sv01', 'sv02', 'sv03', 'sv04', 'sv05')");

    // Khởi tạo hoặc cập nhật tài khoản Giảng viên duy nhất
    $stmtGv = $pdo->prepare("SELECT `id` FROM `users` WHERE LOWER(`username`) = 'giangvien' LIMIT 1");
    $stmtGv->execute();
    $existingGv = $stmtGv->fetch();

    if ($existingGv) {
        $updateGv = $pdo->prepare("UPDATE `users` SET `username` = 'Giangvien', `password` = '12345678', `fullname` = 'Nguyễn Thái Tuấn', `email` = 'giangvien@gmail.com', `mssv` = 'GV01', `role` = 'admin' WHERE `id` = ?");
        $updateGv->execute([$existingGv['id']]);
    } else {
        $insertGv = $pdo->prepare("INSERT INTO `users` (`username`, `password`, `fullname`, `email`, `mssv`, `role`) VALUES ('Giangvien', '12345678', 'Nguyễn Thái Tuấn', 'giangvien@gmail.com', 'GV01', 'admin')");
        $insertGv->execute();
    }

    // Khởi tạo tài khoản Học viên mẫu (hocvien01 / 12345678)
    $stmtHv = $pdo->prepare("SELECT `id` FROM `users` WHERE LOWER(`username`) = 'hocvien01' LIMIT 1");
    $stmtHv->execute();
    if (!$stmtHv->fetch()) {
        $insertHv = $pdo->prepare("INSERT INTO `users` (`username`, `password`, `fullname`, `email`, `mssv`, `role`) VALUES ('hocvien01', '12345678', 'Nguyễn Văn An', 'hocvien01@gmail.com', 'HV01', 'student')");
        $insertHv->execute();
    }
}
?>
