-- ========================================================
-- SCRIPT ĐỒNG BỘ TOÀN DIỆN CHO MYSQL TRÊN INFINITYFREE
-- Database: if0_43040726_hihihi
-- DÁN TOÀN BỘ CODE NÀY VÀO TAB "SQL" VÀ BẤM "THỰC HIỆN"
-- ========================================================

-- 1. XÓA BẢNG CŨ ĐỂ KHỞI TẠO MỚI CHUẨN CHỈNH 100%
DROP TABLE IF EXISTS `submissions`;
DROP TABLE IF EXISTS `exercises`;
DROP TABLE IF EXISTS `users`;

-- 2. BẢNG TÀI KHOẢN NGƯỜI DÙNG (users)
-- Lưu trữ tài khoản Giảng viên và toàn bộ Sinh viên đăng ký mới
CREATE TABLE `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `fullname` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) DEFAULT '',
    `mssv` VARCHAR(50) DEFAULT '',
    `role` ENUM('admin', 'student') NOT NULL DEFAULT 'student',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. BẢNG BÀI TẬP & TÀI LIỆU CỦA GIẢNG VIÊN (exercises)
-- Cột `file_data` lưu trực tiếp toàn bộ dữ liệu file Word/Excel/PPT vào Database!
CREATE TABLE `exercises` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. BẢNG BÀI NỘP CỦA SINH VIÊN (submissions)
-- Cột `file_data` lưu trực tiếp toàn bộ dữ liệu bài nộp của sinh viên vào Database!
CREATE TABLE `submissions` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. TẠO SẴN TÀI KHOẢN GIẢNG VIÊN VÀ 1 TÀI KHOẢN HỌC VIÊN MẪU ĐỂ TEST
INSERT INTO `users` (`username`, `password`, `fullname`, `email`, `mssv`, `role`) VALUES
('Giangvien', '12345678', 'Nguyễn Thái Tuấn', 'giangvien@gmail.com', 'GV01', 'admin'),
('hocvien01', '12345678', 'Nguyễn Văn An', 'hocvien01@gmail.com', 'HV01', 'student');
