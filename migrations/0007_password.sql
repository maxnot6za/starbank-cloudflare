-- เข้าสู่ระบบด้วยชื่อผู้ใช้ + รหัสผ่าน (ทางเลือกนอกจาก LINE) + รหัสกู้คืน
ALTER TABLE Members ADD COLUMN username TEXT;          -- ภาษาอังกฤษตัวเล็ก/ตัวเลข ไม่ซ้ำทั้งระบบ
ALTER TABLE Members ADD COLUMN pw_hash TEXT;           -- pbkdf2$รอบ$salt$hash (ไม่เก็บรหัสจริง)
ALTER TABLE Members ADD COLUMN pw_fails INTEGER;
ALTER TABLE Members ADD COLUMN pw_locked_until TEXT;
ALTER TABLE Members ADD COLUMN pw_changed_at TEXT;
ALTER TABLE Members ADD COLUMN recovery_hash TEXT;     -- แฮชของรหัสกู้คืน (ใช้ได้ครั้งเดียว)
ALTER TABLE Members ADD COLUMN recovery_created_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_username ON Members(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_recovery ON Members(recovery_hash);
-- กันเดารหัส: นับครั้งที่ผิดต่อเครื่อง/IP
CREATE TABLE IF NOT EXISTS RateLimits (key TEXT PRIMARY KEY, count INTEGER, reset_at TEXT);
