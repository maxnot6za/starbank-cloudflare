-- แจ้งเตือนของแอปเอง (Web Push) + ช่องทางแจ้งเตือนรายคน
ALTER TABLE Members ADD COLUMN notify_channel TEXT;   -- NULL/'line' = LINE (ค่าเดิม) · 'app' · 'both'
CREATE TABLE IF NOT EXISTS PushSubs (
  endpoint TEXT PRIMARY KEY, member_id TEXT, family_id TEXT, p256dh TEXT, auth TEXT,
  device TEXT, created_at TEXT, last_ok_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_member ON PushSubs(member_id);
CREATE TABLE IF NOT EXISTS AppConfig (key TEXT PRIMARY KEY, value TEXT);
