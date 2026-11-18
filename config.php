<?php
/**
 * ===================================================================
 * CẤU HÌNH KẾT NỐI DATABASE MYSQL TRÊN INFINITYFREE
 * ===================================================================
 * Bạn lấy các thông số này trong trang Control Panel của InfinityFree:
 * Mục: "MySQL Databases"
 */

require_once __DIR__ . '/lms-server/database.php';

// Both APIs use the same hosting connection; real secrets stay in lms-hosting.php.
$lmsConnection = lmsHosting();
define('DB_HOST', $lmsConnection['host'] ?? (getenv('THVP_MYSQL_HOST') ?: 'sql204.infinityfree.com'));
define('DB_USER', $lmsConnection['username'] ?? (getenv('THVP_MYSQL_USER') ?: 'if0_43468398'));
define('DB_PASS', $lmsConnection['password'] ?? (getenv('THVP_MYSQL_PASSWORD') ?: 'aebsNooNCsbB'));
define('DB_NAME', $lmsConnection['database'] ?? (getenv('THVP_MYSQL_DATABASE') ?: 'if0_43468398_database'));
define('DB_PORT', (int)($lmsConnection['port'] ?? 3306));
unset($lmsConnection);

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
        if (!DB_HOST || !DB_USER || !DB_NAME || DB_PASS === '') {
            return null;
        }
        try {
            if ((lmsHosting()['driver'] ?? '') === 'mysql') {
                try {
                    return $pdo = lmsMySQL();
                } catch (Throwable $ignore) {
                    // Nếu lmsMySQL chưa có bảng migration, tiếp tục kết nối trực tiếp
                }
            }
            $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
            
            // Tự động khởi tạo các bảng nếu chưa có
            initDatabaseTables($pdo);
        } catch (Throwable $e) {
            error_log("Database connection error: " . $e->getMessage());
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

    // Thêm cột email, avatar, bio nếu chưa có
    try {
        $pdo->exec("ALTER TABLE `users` ADD COLUMN `email` VARCHAR(150) DEFAULT '' AFTER `fullname`");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE `users` ADD COLUMN `avatar` LONGTEXT DEFAULT NULL");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE `users` ADD COLUMN `bio` TEXT DEFAULT NULL");
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

    // Bảng bài viết diễn đàn (forum_posts) - Khởi tạo trống, không chèn dữ liệu mẫu
    $pdo->exec("CREATE TABLE IF NOT EXISTS `forum_posts` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `user_id` INT DEFAULT 0,
        `author_name` VARCHAR(100) NOT NULL,
        `author_username` VARCHAR(50) NOT NULL,
        `author_role` VARCHAR(20) NOT NULL DEFAULT 'student',
        `author_avatar` TEXT DEFAULT NULL,
        `author_mssv` VARCHAR(50) DEFAULT '',
        `post_type` VARCHAR(30) NOT NULL DEFAULT 'general',
        `title` VARCHAR(255) DEFAULT '',
        `content` TEXT NOT NULL,
        `feeling` VARCHAR(255) DEFAULT '',
        `tags` TEXT DEFAULT NULL,
        `group_name` VARCHAR(150) DEFAULT '',
        `file_name` VARCHAR(255) DEFAULT '',
        `file_path` VARCHAR(255) DEFAULT '',
        `file_data` LONGTEXT DEFAULT NULL,
        `file_size` INT DEFAULT 0,
        `image_name` VARCHAR(255) DEFAULT '',
        `image_path` VARCHAR(255) DEFAULT '',
        `image_data` LONGTEXT DEFAULT NULL,
        `meta_score` TEXT DEFAULT NULL,
        `reactions` TEXT DEFAULT NULL,
        `is_pinned` TINYINT(1) DEFAULT 0,
        `views` INT DEFAULT 0,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Bảng bình luận diễn đàn (forum_comments) - Khởi tạo trống, không chèn dữ liệu mẫu
    $pdo->exec("CREATE TABLE IF NOT EXISTS `forum_comments` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `post_id` INT NOT NULL,
        `parent_id` INT NOT NULL DEFAULT 0,
        `user_id` INT DEFAULT 0,
        `author_name` VARCHAR(100) NOT NULL,
        `author_username` VARCHAR(50) NOT NULL,
        `author_role` VARCHAR(20) NOT NULL DEFAULT 'student',
        `author_avatar` TEXT DEFAULT NULL,
        `content` TEXT NOT NULL,
        `image_name` VARCHAR(255) DEFAULT '',
        `image_path` VARCHAR(255) DEFAULT '',
        `image_data` LONGTEXT DEFAULT NULL,
        `reactions` TEXT DEFAULT NULL,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Accounts are provisioned by the additive SQL import, never reset on page requests.
}
