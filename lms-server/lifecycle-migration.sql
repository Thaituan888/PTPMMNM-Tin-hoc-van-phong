CREATE TABLE IF NOT EXISTS lms_class_lifecycle (
 class_code TEXT PRIMARY KEY REFERENCES lms_classes(code), cycle_id INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','started','completed')),
 starts_at INTEGER, revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, updated_by INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS lms_class_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, class_code TEXT NOT NULL REFERENCES lms_classes(code),cycle_id INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('start','complete','reopen','close_registration')),
 snapshot TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
 from_version INTEGER NOT NULL,to_version INTEGER NOT NULL, request_hash TEXT NOT NULL UNIQUE,payload_hash TEXT NOT NULL,
 UNIQUE(class_code,from_version)
);
CREATE TABLE IF NOT EXISTS lms_certificates (
 id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL REFERENCES lms_class_events(id),
 enrollment_id INTEGER NOT NULL REFERENCES lms_enrollments(id), user_id INTEGER NOT NULL REFERENCES users(id),
 class_code TEXT NOT NULL REFERENCES lms_classes(code),cycle_id INTEGER NOT NULL,fullname TEXT NOT NULL,course_name TEXT NOT NULL,
 issued_at INTEGER NOT NULL,storage_key TEXT NOT NULL UNIQUE,UNIQUE(event_id,enrollment_id)
);
CREATE TABLE IF NOT EXISTS lms_class_mail (
 id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL REFERENCES lms_class_events(id),
 enrollment_id INTEGER NOT NULL REFERENCES lms_enrollments(id),user_id INTEGER NOT NULL REFERENCES users(id),
 recipient TEXT NOT NULL,fullname TEXT NOT NULL,certificate_id INTEGER REFERENCES lms_certificates(id),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','unknown')),
 attempts INTEGER NOT NULL DEFAULT 0,lease_hash TEXT,lease_expires_at INTEGER,error_code TEXT,created_at INTEGER NOT NULL,sent_at INTEGER,
 UNIQUE(event_id,enrollment_id)
);
CREATE INDEX IF NOT EXISTS lms_class_mail_queue ON lms_class_mail(event_id,state,id);
CREATE TABLE IF NOT EXISTS lms_class_mail_retries(request_hash TEXT PRIMARY KEY,event_id INTEGER NOT NULL REFERENCES lms_class_events(id));
