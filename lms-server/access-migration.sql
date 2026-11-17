CREATE INDEX IF NOT EXISTS lms_user_email_lookup ON users(lower(trim(email)));
-- Existing ambiguous emails remain untouched. Prevent introducing new ambiguities.
CREATE TRIGGER IF NOT EXISTS lms_user_email_insert BEFORE INSERT ON users
 WHEN NEW.email IS NOT NULL AND trim(NEW.email)<>''
 BEGIN
  SELECT RAISE(ABORT,'LMS account email already exists') WHERE EXISTS
   (SELECT 1 FROM users WHERE lower(trim(email))=lower(trim(NEW.email)));
 END;
CREATE TRIGGER IF NOT EXISTS lms_user_email_update BEFORE UPDATE OF email ON users
 WHEN NEW.email IS NOT NULL AND trim(NEW.email)<>'' AND lower(trim(COALESCE(OLD.email,'')))<>lower(trim(NEW.email))
 BEGIN
  SELECT RAISE(ABORT,'LMS account email already exists') WHERE EXISTS
   (SELECT 1 FROM users WHERE id<>OLD.id AND lower(trim(email))=lower(trim(NEW.email)));
 END;
CREATE UNIQUE INDEX IF NOT EXISTS lms_one_active_user ON lms_enrollments(class_code,user_id) WHERE active=1 AND user_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS lms_access_grants (
 registration_id INTEGER PRIMARY KEY REFERENCES lms_registrations(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 enrollment_id INTEGER NOT NULL REFERENCES lms_enrollments(id),
 new_account INTEGER NOT NULL CHECK(new_account IN (0,1)),
 created_at INTEGER NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id),
 request_hash TEXT NOT NULL UNIQUE,
 mail_state TEXT NOT NULL DEFAULT 'pending' CHECK(mail_state IN ('pending','sending','sent','failed','unknown','expired')),
 encrypted_payload TEXT, payload_expires_at INTEGER NOT NULL,
 lease_hash TEXT, lease_expires_at INTEGER,
 attempts INTEGER NOT NULL DEFAULT 0,
 last_error_code TEXT, last_error_message TEXT, smtp_accepted_at INTEGER
);
CREATE TABLE IF NOT EXISTS lms_access_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 registration_id INTEGER NOT NULL REFERENCES lms_registrations(id),
 actor_id INTEGER REFERENCES users(id), actor_username TEXT NOT NULL, actor_name TEXT NOT NULL,
 action TEXT NOT NULL, result TEXT NOT NULL, error_code TEXT,
 created_at INTEGER NOT NULL, completed_at INTEGER,
 request_hash TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS lms_access_history_registration ON lms_access_history(registration_id,id);
