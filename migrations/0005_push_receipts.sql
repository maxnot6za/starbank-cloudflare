-- ใบตอบรับแจ้งเตือน: รู้ว่าแจ้งเตือนถึงเครื่องจริงหรือไม่ (ไม่ใช่แค่ Apple/Google รับไป)
ALTER TABLE PushSubs ADD COLUMN last_sent_at TEXT;
ALTER TABLE PushSubs ADD COLUMN last_delivered_at TEXT;
CREATE TABLE IF NOT EXISTS PushLog (
  nid TEXT PRIMARY KEY, endpoint TEXT, member_id TEXT, kind TEXT,
  sent_at TEXT, status INTEGER, delivered_at TEXT, clicked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pushlog_endpoint ON PushLog(endpoint);
