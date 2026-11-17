CREATE TABLE IF NOT EXISTS lms_class_pages (
 class_code TEXT PRIMARY KEY REFERENCES lms_classes(code),
 introduction TEXT NOT NULL DEFAULT '', online_title TEXT NOT NULL DEFAULT '', online_url TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0, structure_revision INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER, updated_by INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS lms_topics (
 id INTEGER PRIMARY KEY AUTOINCREMENT, class_code TEXT NOT NULL REFERENCES lms_classes(code),
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL,
 visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)), revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id), updated_by INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS lms_topic_class_order ON lms_topics(class_code,position,id);
CREATE TABLE IF NOT EXISTS lms_text_lessons (
 id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id INTEGER NOT NULL REFERENCES lms_topics(id),
 title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id), updated_by INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS lms_text_lesson_topic ON lms_text_lessons(topic_id,id);
