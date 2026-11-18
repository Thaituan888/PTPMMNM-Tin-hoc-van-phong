-- LMS + website legacy tables for InfinityFree. UTF-8. MySQL 8.0.16+ / MariaDB 10.6+.
-- Select the database in phpMyAdmin before importing. No CREATE DATABASE, DROP or DELETE.
-- Back up existing data. Rerunning this import preserves existing accounts/passwords.
SET NAMES utf8mb4;


CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `fullname` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) DEFAULT '',
    `mssv` VARCHAR(50) DEFAULT '',
    `role` ENUM('admin', 'student') NOT NULL DEFAULT 'student',
    `avatar` LONGTEXT DEFAULT NULL,
    `bio` TEXT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `exercises` (
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

CREATE TABLE IF NOT EXISTS `submissions` (
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

CREATE TABLE IF NOT EXISTS `forum_posts` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `forum_comments` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @lms_ddl = (SELECT IF(COUNT(*)=0,'ALTER TABLE `users` ADD COLUMN `password_hash` VARCHAR(255) DEFAULT NULL','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='password_hash');
PREPARE lms_stmt FROM @lms_ddl;
EXECUTE lms_stmt;
DEALLOCATE PREPARE lms_stmt;


SET @lms_ddl = (SELECT IF(COUNT(*)=0,'ALTER TABLE `users` ADD COLUMN `active` TINYINT NOT NULL DEFAULT 1','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='active');
PREPARE lms_stmt FROM @lms_ddl;
EXECUTE lms_stmt;
DEALLOCATE PREPARE lms_stmt;


SET @lms_ddl = (SELECT IF(COUNT(*)=0,'ALTER TABLE `users` ADD COLUMN `must_change_password` TINYINT NOT NULL DEFAULT 0','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='must_change_password');
PREPARE lms_stmt FROM @lms_ddl;
EXECUTE lms_stmt;
DEALLOCATE PREPARE lms_stmt;


SET @lms_ddl = (SELECT IF(COUNT(*)=0,'ALTER TABLE `users` ADD COLUMN `email` VARCHAR(254) DEFAULT ''''','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='email');
PREPARE lms_stmt FROM @lms_ddl;
EXECUTE lms_stmt;
DEALLOCATE PREPARE lms_stmt;


SET @lms_ddl = (SELECT IF(COUNT(*)=0,'ALTER TABLE `users` ADD COLUMN `avatar` LONGTEXT DEFAULT NULL','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='avatar');
PREPARE lms_stmt FROM @lms_ddl;
EXECUTE lms_stmt;
DEALLOCATE PREPARE lms_stmt;


SET @lms_ddl = (SELECT IF(COUNT(*)=0,'ALTER TABLE `users` ADD COLUMN `bio` TEXT DEFAULT NULL','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='bio');
PREPARE lms_stmt FROM @lms_ddl;
EXECUTE lms_stmt;
DEALLOCATE PREPARE lms_stmt;


-- Expand legacy account columns to match LMS validation limits; values are preserved.
ALTER TABLE users MODIFY COLUMN username VARCHAR(150) NOT NULL,
  MODIFY COLUMN fullname VARCHAR(255) NOT NULL,
  MODIFY COLUMN email VARCHAR(254) DEFAULT '';

-- Blank legacy emails remain allowed; nonblank account emails are unique.
-- If old data contains duplicate emails, resolve those identities before importing.
SET @lms_ddl = (SELECT IF(COUNT(*)=0,
  'ALTER TABLE users ADD COLUMN lms_normalized_email VARCHAR(254) GENERATED ALWAYS AS (NULLIF(LOWER(TRIM(email)), '''')) STORED',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='lms_normalized_email');
PREPARE lms_stmt FROM @lms_ddl;
EXECUTE lms_stmt;
DEALLOCATE PREPARE lms_stmt;
SET @lms_ddl = (SELECT IF(COUNT(*)=0,
  'CREATE UNIQUE INDEX lms_user_email_unique ON users(lms_normalized_email)',
  'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='lms_user_email_unique');
PREPARE lms_stmt FROM @lms_ddl;
EXECUTE lms_stmt;
DEALLOCATE PREPARE lms_stmt;

CREATE TABLE IF NOT EXISTS lms_write_lock (id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO lms_write_lock(id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM lms_write_lock WHERE id=1);

CREATE TABLE IF NOT EXISTS `lms_classes` (
  `code` VARCHAR(16) NOT NULL PRIMARY KEY,
  `course_key` VARCHAR(255) NOT NULL,
  `course_name` VARCHAR(255) NOT NULL,
  `teacher` VARCHAR(255) NOT NULL,
  `days` VARCHAR(255) NOT NULL,
  `time` VARCHAR(255) NOT NULL,
  `fee_vnd` INT NOT NULL CHECK(fee_vnd > 0),
  `capacity` INT NOT NULL DEFAULT 99 CHECK(capacity = 99),
  `registration_open` INT NOT NULL DEFAULT 1 CHECK(registration_open IN (0,1)),
  `opening_date` VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_registrations` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `class_code` VARCHAR(16) NOT NULL,
  `fullname` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(255) NOT NULL,
  `email` VARCHAR(254) NOT NULL ,
  `class_snapshot` LONGTEXT NOT NULL,
  `fee_vnd` INT NOT NULL CHECK(fee_vnd > 0),
  `status` VARCHAR(40) NOT NULL DEFAULT 'pending_payment'

  CHECK(status IN ('pending_payment','pending_review','expired','cancelled','enrolled')),
  `created_at` INT NOT NULL,
  `expires_at` INT NOT NULL,
  `proof_submitted_at` INT DEFAULT NULL,
  `request_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  `owner_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `payload_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `access_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  `review_status` VARCHAR(40) DEFAULT NULL CHECK(review_status IN ('approved_waiting_access','needs_more','rejected')),
  `review_version` INT NOT NULL DEFAULT 0,
  `review_reason` LONGTEXT DEFAULT NULL,
  `cycle_id` INT NOT NULL DEFAULT 1,
  `held_email` VARCHAR(254) GENERATED ALWAYS AS (CASE WHEN status IN ('pending_payment','pending_review') THEN email ELSE NULL END) STORED,
  UNIQUE KEY lms_one_email_hold (class_code,held_email,cycle_id),
  FOREIGN KEY (`class_code`) REFERENCES `lms_classes` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_enrollments` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `class_code` VARCHAR(16) NOT NULL,
  `registration_id` INT UNIQUE,
  `email` VARCHAR(254) NOT NULL ,
  `active` INT NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  `user_id` INT DEFAULT NULL,
  `cycle_id` INT NOT NULL DEFAULT 1,
  `active_email` VARCHAR(254) GENERATED ALWAYS AS (CASE WHEN active=1 THEN email ELSE NULL END) STORED,
  `active_user` INT GENERATED ALWAYS AS (CASE WHEN active=1 THEN user_id ELSE NULL END) STORED,
  UNIQUE KEY lms_one_active_email (class_code,active_email),
  UNIQUE KEY lms_one_active_user (class_code,active_user),
  FOREIGN KEY (`class_code`) REFERENCES `lms_classes` (`code`),
  FOREIGN KEY (`registration_id`) REFERENCES `lms_registrations` (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_rate_limits` (
  `key` VARCHAR(160) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  `window_start` INT NOT NULL,
  `attempts` INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_payments` (
  `registration_id` INT PRIMARY KEY,
  `bank_name` VARCHAR(255) NOT NULL,
  `bank_bin` VARCHAR(255) NOT NULL,
  `account_number` VARCHAR(255) NOT NULL,
  `account_name` VARCHAR(255) NOT NULL,
  `currency` VARCHAR(40) NOT NULL DEFAULT 'VND' CHECK(currency='VND'),
  `created_at` INT NOT NULL,
  FOREIGN KEY (`registration_id`) REFERENCES `lms_registrations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_evidence` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `registration_id` INT NOT NULL,
  `storage_key` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  `mime` VARCHAR(255) NOT NULL CHECK(mime IN ('image/jpeg','image/png')),
  `size_bytes` INT NOT NULL CHECK(size_bytes>0),
  `source_sha256` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `request_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `submitted_at` INT NOT NULL,
  `timeliness` VARCHAR(40) NOT NULL CHECK(timeliness IN ('on_time','late')),
  UNIQUE(registration_id,request_hash),
  UNIQUE(registration_id,source_sha256),
  FOREIGN KEY (`registration_id`) REFERENCES `lms_registrations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_schema_migrations` (
  `name` VARCHAR(255) NOT NULL PRIMARY KEY,
  `applied_at` INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_review_history` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `registration_id` INT NOT NULL,
  `actor_id` INT NOT NULL,
  `actor_username` VARCHAR(150) NOT NULL,
  `actor_name` VARCHAR(255) NOT NULL,
  `decision` VARCHAR(40) NOT NULL CHECK(decision IN ('approve','request_more','reject')),
  `before_status` VARCHAR(255) NOT NULL,
  `after_status` VARCHAR(255) NOT NULL,
  `notes` LONGTEXT NOT NULL,
  `public_reason` LONGTEXT,
  `manual_confirmation` INT NOT NULL DEFAULT 0 CHECK(manual_confirmation IN (0,1)),
  `received_vnd` INT,
  `bank_transaction` VARCHAR(255),
  `receiver_key` VARCHAR(128) COLLATE utf8mb4_bin,
  `created_at` INT NOT NULL,
  `from_version` INT NOT NULL,
  `to_version` INT NOT NULL,
  `request_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  `payload_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  UNIQUE(registration_id,from_version),
  CHECK(to_version=from_version+1),
  CHECK(decision<>'approve' OR (received_vnd>0 AND (bank_transaction IS NOT NULL OR manual_confirmation=1) AND receiver_key IS NOT NULL)),
  `approved_transaction` VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN decision='approve' THEN bank_transaction ELSE NULL END) STORED,
  UNIQUE KEY lms_unique_bank_approval (receiver_key,approved_transaction),
  KEY lms_review_registration_history (registration_id,id),
  FOREIGN KEY (`registration_id`) REFERENCES `lms_registrations` (`id`),
  FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_access_grants` (
  `registration_id` INT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `enrollment_id` INT NOT NULL,
  `new_account` INT NOT NULL CHECK(new_account IN (0,1)),
  `created_at` INT NOT NULL,
  `created_by` INT NOT NULL,
  `request_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  `mail_state` VARCHAR(40) NOT NULL DEFAULT 'pending' CHECK(mail_state IN ('pending','sending','sent','failed','unknown','expired')),
  `encrypted_payload` LONGTEXT,
  `payload_expires_at` INT NOT NULL,
  `lease_hash` VARCHAR(128) COLLATE utf8mb4_bin,
  `lease_expires_at` INT,
  `attempts` INT NOT NULL DEFAULT 0,
  `last_error_code` VARCHAR(255),
  `last_error_message` LONGTEXT,
  `smtp_accepted_at` INT,
  FOREIGN KEY (`registration_id`) REFERENCES `lms_registrations` (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  FOREIGN KEY (`enrollment_id`) REFERENCES `lms_enrollments` (`id`),
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_access_history` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `registration_id` INT NOT NULL,
  `actor_id` INT,
  `actor_username` VARCHAR(150) NOT NULL,
  `actor_name` VARCHAR(255) NOT NULL,
  `action` VARCHAR(40) NOT NULL,
  `result` VARCHAR(40) NOT NULL,
  `error_code` VARCHAR(255),
  `created_at` INT NOT NULL,
  `completed_at` INT,
  `request_hash` VARCHAR(128) COLLATE utf8mb4_bin UNIQUE,
  KEY lms_access_history_registration (registration_id,id),
  FOREIGN KEY (`registration_id`) REFERENCES `lms_registrations` (`id`),
  FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_class_pages` (
  `class_code` VARCHAR(16) NOT NULL PRIMARY KEY,
  `introduction` LONGTEXT NOT NULL DEFAULT (''),
  `online_title` VARCHAR(255) NOT NULL DEFAULT '',
  `online_url` VARCHAR(2048) NOT NULL DEFAULT '',
  `revision` INT NOT NULL DEFAULT 0,
  `structure_revision` INT NOT NULL DEFAULT 0,
  `updated_at` INT,
  `updated_by` INT,
  FOREIGN KEY (`class_code`) REFERENCES `lms_classes` (`code`),
  FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_topics` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `class_code` VARCHAR(16) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` LONGTEXT NOT NULL DEFAULT (''),
  `position` INT NOT NULL,
  `visible` INT NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
  `revision` INT NOT NULL DEFAULT 1,
  `created_at` INT NOT NULL,
  `updated_at` INT NOT NULL,
  `created_by` INT NOT NULL,
  `updated_by` INT NOT NULL,
  KEY lms_topic_class_order (class_code,position,id),
  FOREIGN KEY (`class_code`) REFERENCES `lms_classes` (`code`),
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_text_lessons` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `topic_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` LONGTEXT NOT NULL DEFAULT (''),
  `status` VARCHAR(40) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  `revision` INT NOT NULL DEFAULT 1,
  `created_at` INT NOT NULL,
  `updated_at` INT NOT NULL,
  `created_by` INT NOT NULL,
  `updated_by` INT NOT NULL,
  KEY lms_text_lesson_topic (topic_id,id),
  FOREIGN KEY (`topic_id`) REFERENCES `lms_topics` (`id`),
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_class_resources` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `class_code` VARCHAR(16) NOT NULL,
  `kind` VARCHAR(40) NOT NULL CHECK(kind IN ('notice','material','test')),
  `title` VARCHAR(255) NOT NULL,
  `body` LONGTEXT NOT NULL DEFAULT (''),
  `url` VARCHAR(2048) NOT NULL DEFAULT '',
  `status` VARCHAR(40) NOT NULL CHECK(status IN ('draft','published')),
  `revision` INT NOT NULL DEFAULT 1,
  `storage_key` VARCHAR(128) COLLATE utf8mb4_bin,
  `mime` VARCHAR(255),
  `size_bytes` INT,
  `created_by` INT NOT NULL,
  `updated_by` INT NOT NULL,
  `created_at` INT NOT NULL,
  `updated_at` INT NOT NULL,
  KEY lms_resources_class (class_code,kind,id),
  FOREIGN KEY (`class_code`) REFERENCES `lms_classes` (`code`),
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_resource_requests` (
  `user_id` INT NOT NULL,
  `request_key` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `payload_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `resource_id` INT NOT NULL,
  PRIMARY KEY(user_id,request_key),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  FOREIGN KEY (`resource_id`) REFERENCES `lms_class_resources` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_quizzes` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `class_code` VARCHAR(16) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `questions` LONGTEXT NOT NULL,
  `status` VARCHAR(40) NOT NULL CHECK(status IN ('draft','published')),
  `revision` INT NOT NULL DEFAULT 1,
  `updated_by` INT NOT NULL,
  `updated_at` INT NOT NULL,
  FOREIGN KEY (`class_code`) REFERENCES `lms_classes` (`code`),
  FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_quiz_attempts` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `quiz_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `quiz_revision` INT NOT NULL,
  `answers` LONGTEXT NOT NULL,
  `correct_count` INT NOT NULL,
  `total` INT NOT NULL,
  `submitted_at` INT NOT NULL,
  UNIQUE(quiz_id,user_id),
  FOREIGN KEY (`quiz_id`) REFERENCES `lms_quizzes` (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_quiz_requests` (
  `user_id` INT NOT NULL,
  `request_key` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `payload_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY(user_id,request_key),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_class_lifecycle` (
  `class_code` VARCHAR(16) NOT NULL PRIMARY KEY,
  `cycle_id` INT NOT NULL DEFAULT 1,
  `state` VARCHAR(40) NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','started','completed')),
  `starts_at` INT,
  `revision` INT NOT NULL DEFAULT 0,
  `updated_at` INT,
  `updated_by` INT,
  FOREIGN KEY (`class_code`) REFERENCES `lms_classes` (`code`),
  FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_class_events` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `class_code` VARCHAR(16) NOT NULL,
  `cycle_id` INT NOT NULL,
  `action` VARCHAR(40) NOT NULL CHECK(action IN ('start','complete','reopen','close_registration')),
  `snapshot` LONGTEXT NOT NULL,
  `actor_id` INT NOT NULL,
  `created_at` INT NOT NULL,
  `from_version` INT NOT NULL,
  `to_version` INT NOT NULL,
  `request_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  `payload_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  UNIQUE(class_code,from_version),
  FOREIGN KEY (`class_code`) REFERENCES `lms_classes` (`code`),
  FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_certificates` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `event_id` INT NOT NULL,
  `enrollment_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `class_code` VARCHAR(16) NOT NULL,
  `cycle_id` INT NOT NULL,
  `fullname` VARCHAR(255) NOT NULL,
  `course_name` VARCHAR(255) NOT NULL,
  `issued_at` INT NOT NULL,
  `storage_key` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  UNIQUE(event_id,enrollment_id),
  FOREIGN KEY (`event_id`) REFERENCES `lms_class_events` (`id`),
  FOREIGN KEY (`enrollment_id`) REFERENCES `lms_enrollments` (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  FOREIGN KEY (`class_code`) REFERENCES `lms_classes` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_class_mail` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `event_id` INT NOT NULL,
  `enrollment_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `recipient` VARCHAR(254) NOT NULL,
  `fullname` VARCHAR(255) NOT NULL,
  `certificate_id` INT,
  `state` VARCHAR(40) NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','unknown')),
  `attempts` INT NOT NULL DEFAULT 0,
  `lease_hash` VARCHAR(128) COLLATE utf8mb4_bin,
  `lease_expires_at` INT,
  `error_code` VARCHAR(255),
  `created_at` INT NOT NULL,
  `sent_at` INT,
  UNIQUE(event_id,enrollment_id),
  KEY lms_class_mail_queue (event_id,state,id),
  FOREIGN KEY (`event_id`) REFERENCES `lms_class_events` (`id`),
  FOREIGN KEY (`enrollment_id`) REFERENCES `lms_enrollments` (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  FOREIGN KEY (`certificate_id`) REFERENCES `lms_certificates` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `lms_class_mail_retries` (
  `request_hash` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  `event_id` INT NOT NULL,
  FOREIGN KEY (`event_id`) REFERENCES `lms_class_events` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


INSERT INTO users(username,password,password_hash,fullname,email,mssv,role,active,must_change_password)
SELECT 'Giaovien1','','$2y$12$vifeyC3aOUtKDGxyalWLneM28bsStBRR/tFFT5vWcun.87S.n/nX6','Tống Hoàng Thiên','','GV01','admin',1,0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username)=LOWER('Giaovien1'));

INSERT INTO users(username,password,password_hash,fullname,email,mssv,role,active,must_change_password)
SELECT 'Giaovien2','','$2y$12$SPwf0YQXzR9OlPPzk/dDxu0xd29QucXHLc0Vg.jR.0yhKHUx.dUpS','Nguyễn Thái Tuấn','','GV02','admin',1,0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username)=LOWER('Giaovien2'));

INSERT INTO users(username,password,password_hash,fullname,email,mssv,role,active,must_change_password)
SELECT 'Giaovien3','','$2y$12$psfYROHolQJK41wlXjHGuegfo6KJRKxmJbrpVxBuPd4ltCFltbNSu','Trần Anh Khoa','','GV03','admin',1,0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username)=LOWER('Giaovien3'));

INSERT INTO lms_classes(code,course_key,course_name,teacher,days,time,fee_vnd,capacity)
SELECT 'CB-01','co-ban','Tin học cơ bản','Tống Hoàng Thiên','Thứ 2, thứ 4','19:00–21:00',1500000,99
WHERE NOT EXISTS (SELECT 1 FROM lms_classes WHERE code='CB-01');

INSERT INTO lms_classes(code,course_key,course_name,teacher,days,time,fee_vnd,capacity)
SELECT 'CB-02','co-ban','Tin học cơ bản','Nguyễn Thái Tuấn','Thứ 3, thứ 5','19:00–21:00',1500000,99
WHERE NOT EXISTS (SELECT 1 FROM lms_classes WHERE code='CB-02');

INSERT INTO lms_classes(code,course_key,course_name,teacher,days,time,fee_vnd,capacity)
SELECT 'CB-03','co-ban','Tin học cơ bản','Trần Anh Khoa','Thứ 6, chủ nhật','19:00–21:00',1500000,99
WHERE NOT EXISTS (SELECT 1 FROM lms_classes WHERE code='CB-03');

INSERT INTO lms_classes(code,course_key,course_name,teacher,days,time,fee_vnd,capacity)
SELECT 'NC-01','nang-cao','Tin học nâng cao','Tống Hoàng Thiên','Thứ 3, thứ 5','19:00–21:00',2500000,99
WHERE NOT EXISTS (SELECT 1 FROM lms_classes WHERE code='NC-01');

INSERT INTO lms_classes(code,course_key,course_name,teacher,days,time,fee_vnd,capacity)
SELECT 'NC-02','nang-cao','Tin học nâng cao','Nguyễn Thái Tuấn','Thứ 6, chủ nhật','19:00–21:00',2500000,99
WHERE NOT EXISTS (SELECT 1 FROM lms_classes WHERE code='NC-02');

INSERT INTO lms_classes(code,course_key,course_name,teacher,days,time,fee_vnd,capacity)
SELECT 'NC-03','nang-cao','Tin học nâng cao','Trần Anh Khoa','Thứ 2, thứ 4','19:00–21:00',2500000,99
WHERE NOT EXISTS (SELECT 1 FROM lms_classes WHERE code='NC-03');

INSERT INTO lms_schema_migrations(name,applied_at) SELECT 'mysql_lms_v1',UNIX_TIMESTAMP() WHERE NOT EXISTS (SELECT 1 FROM lms_schema_migrations WHERE name='mysql_lms_v1');
