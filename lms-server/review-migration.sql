CREATE TABLE IF NOT EXISTS lms_review_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 registration_id INTEGER NOT NULL REFERENCES lms_registrations(id),
 actor_id INTEGER NOT NULL REFERENCES users(id),
 actor_username TEXT NOT NULL, actor_name TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('approve','request_more','reject')),
 before_status TEXT NOT NULL, after_status TEXT NOT NULL,
 notes TEXT NOT NULL, public_reason TEXT,
 manual_confirmation INTEGER NOT NULL DEFAULT 0 CHECK(manual_confirmation IN (0,1)),
 received_vnd INTEGER, bank_transaction TEXT, receiver_key TEXT,
 created_at INTEGER NOT NULL, from_version INTEGER NOT NULL, to_version INTEGER NOT NULL,
 request_hash TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
 UNIQUE(registration_id,from_version),
 CHECK(to_version=from_version+1),
 CHECK(decision<>'approve' OR (received_vnd>0 AND (bank_transaction IS NOT NULL OR manual_confirmation=1) AND receiver_key IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS lms_unique_bank_approval ON lms_review_history(receiver_key,bank_transaction)
 WHERE decision='approve';
CREATE INDEX IF NOT EXISTS lms_review_registration_history ON lms_review_history(registration_id,id);
