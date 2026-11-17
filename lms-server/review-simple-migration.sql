CREATE TABLE lms_review_history_v2 (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 registration_id INTEGER NOT NULL REFERENCES lms_registrations(id),
 actor_id INTEGER NOT NULL REFERENCES users(id), actor_username TEXT NOT NULL, actor_name TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('approve','request_more','reject')),
 before_status TEXT NOT NULL, after_status TEXT NOT NULL, notes TEXT NOT NULL, public_reason TEXT,
 received_vnd INTEGER, bank_transaction TEXT, receiver_key TEXT,
 created_at INTEGER NOT NULL, from_version INTEGER NOT NULL, to_version INTEGER NOT NULL,
 request_hash TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
 manual_confirmation INTEGER NOT NULL DEFAULT 0 CHECK(manual_confirmation IN (0,1)),
 UNIQUE(registration_id,from_version), CHECK(to_version=from_version+1),
 CHECK(decision<>'approve' OR (received_vnd>0 AND (bank_transaction IS NOT NULL OR manual_confirmation=1) AND receiver_key IS NOT NULL))
);
INSERT INTO lms_review_history_v2(id,registration_id,actor_id,actor_username,actor_name,decision,before_status,after_status,notes,public_reason,received_vnd,bank_transaction,receiver_key,created_at,from_version,to_version,request_hash,payload_hash)
 SELECT id,registration_id,actor_id,actor_username,actor_name,decision,before_status,after_status,notes,public_reason,received_vnd,bank_transaction,receiver_key,created_at,from_version,to_version,request_hash,payload_hash FROM lms_review_history;
UPDATE sqlite_sequence SET seq=MAX(seq,COALESCE((SELECT seq FROM sqlite_sequence WHERE name='lms_review_history'),0)) WHERE name='lms_review_history_v2';
DROP TABLE lms_review_history;
ALTER TABLE lms_review_history_v2 RENAME TO lms_review_history;
CREATE UNIQUE INDEX lms_unique_bank_approval ON lms_review_history(receiver_key,bank_transaction) WHERE decision='approve';
CREATE INDEX lms_review_registration_history ON lms_review_history(registration_id,id);
