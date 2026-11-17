CREATE TABLE IF NOT EXISTS lms_classes (
 code TEXT PRIMARY KEY, course_key TEXT NOT NULL, course_name TEXT NOT NULL,
 teacher TEXT NOT NULL, days TEXT NOT NULL, time TEXT NOT NULL,
 fee_vnd INTEGER NOT NULL CHECK(fee_vnd > 0),
 capacity INTEGER NOT NULL DEFAULT 99 CHECK(capacity = 99),
 registration_open INTEGER NOT NULL DEFAULT 1 CHECK(registration_open IN (0,1)),
 opening_date TEXT DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS lms_registrations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 class_code TEXT NOT NULL REFERENCES lms_classes(code),
 fullname TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE,
 class_snapshot TEXT NOT NULL, fee_vnd INTEGER NOT NULL CHECK(fee_vnd > 0),
 status TEXT NOT NULL DEFAULT 'pending_payment'
  CHECK(status IN ('pending_payment','pending_review','expired','cancelled','enrolled')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 proof_submitted_at INTEGER DEFAULT NULL,
 request_hash TEXT NOT NULL UNIQUE, owner_hash TEXT NOT NULL,
 payload_hash TEXT NOT NULL, access_hash TEXT NOT NULL UNIQUE
);
CREATE UNIQUE INDEX IF NOT EXISTS lms_one_email_hold ON lms_registrations(class_code,email)
 WHERE status IN ('pending_payment','pending_review');
CREATE TABLE IF NOT EXISTS lms_enrollments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 class_code TEXT NOT NULL REFERENCES lms_classes(code),
 registration_id INTEGER UNIQUE REFERENCES lms_registrations(id),
 email TEXT NOT NULL COLLATE NOCASE, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS lms_one_active_email ON lms_enrollments(class_code,email) WHERE active=1;
CREATE TABLE IF NOT EXISTS lms_rate_limits (
 key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lms_payments (
 registration_id INTEGER PRIMARY KEY REFERENCES lms_registrations(id),
 bank_name TEXT NOT NULL, bank_bin TEXT NOT NULL,
 account_number TEXT NOT NULL, account_name TEXT NOT NULL,
 currency TEXT NOT NULL DEFAULT 'VND' CHECK(currency='VND'),
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lms_evidence (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 registration_id INTEGER NOT NULL REFERENCES lms_registrations(id),
 storage_key TEXT NOT NULL UNIQUE,
 mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
 source_sha256 TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 submitted_at INTEGER NOT NULL,
 timeliness TEXT NOT NULL CHECK(timeliness IN ('on_time','late')),
 UNIQUE(registration_id,request_hash), UNIQUE(registration_id,source_sha256)
);
