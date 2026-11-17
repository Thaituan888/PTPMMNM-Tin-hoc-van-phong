CREATE TABLE IF NOT EXISTS lms_class_resources (
 id INTEGER PRIMARY KEY AUTOINCREMENT, class_code TEXT NOT NULL REFERENCES lms_classes(code),
 kind TEXT NOT NULL CHECK(kind IN ('notice','material','test')), title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('draft','published')), revision INTEGER NOT NULL DEFAULT 1,
 storage_key TEXT, mime TEXT, size_bytes INTEGER, created_by INTEGER NOT NULL REFERENCES users(id), updated_by INTEGER NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lms_resource_requests (
 user_id INTEGER NOT NULL REFERENCES users(id), request_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 resource_id INTEGER NOT NULL REFERENCES lms_class_resources(id), PRIMARY KEY(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS lms_resources_class ON lms_class_resources(class_code,kind,id);
CREATE TABLE IF NOT EXISTS lms_quizzes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, class_code TEXT NOT NULL REFERENCES lms_classes(code), title TEXT NOT NULL,
 questions TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')), revision INTEGER NOT NULL DEFAULT 1,
 updated_by INTEGER NOT NULL REFERENCES users(id), updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lms_quiz_attempts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL REFERENCES lms_quizzes(id), user_id INTEGER NOT NULL REFERENCES users(id),
 quiz_revision INTEGER NOT NULL, answers TEXT NOT NULL, correct_count INTEGER NOT NULL, total INTEGER NOT NULL, submitted_at INTEGER NOT NULL,
 UNIQUE(quiz_id,user_id)
);
CREATE TABLE IF NOT EXISTS lms_quiz_requests (
 user_id INTEGER NOT NULL REFERENCES users(id), request_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 PRIMARY KEY(user_id,request_key)
);
