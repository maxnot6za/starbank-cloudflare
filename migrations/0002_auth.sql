-- ระบบเข้าสู่ระบบ: ผู้ปกครองใช้ LINE Login · เด็กใช้ PIN 4 หลัก หรือ QR จากผู้ปกครอง
ALTER TABLE Members ADD COLUMN pin_hash TEXT;
ALTER TABLE Members ADD COLUMN pin_fails INTEGER;
ALTER TABLE Members ADD COLUMN pin_locked_until TEXT;

-- เครื่องที่เข้าสู่ระบบอยู่ (เก็บเฉพาะค่าแฮชของกุญแจ ไม่เก็บกุญแจจริง)
CREATE TABLE IF NOT EXISTS Sessions (
  session_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL, family_id TEXT,
  created_at TEXT, last_seen_at TEXT, expires_at TEXT, device TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_member ON Sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_sessions_family ON Sessions(family_id);

-- รหัสใช้ครั้งเดียว: qr (เด็กเข้าเครื่องใหม่) · invite (เชิญผู้ปกครอง) · ticket (ยืนยัน LINE แล้ว รอเลือก/สร้างครอบครัว)
CREATE TABLE IF NOT EXISTS AuthTokens (
  token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, family_id TEXT, member_id TEXT,
  line_user_id TEXT, line_name TEXT, created_by TEXT, created_at TEXT, expires_at TEXT, used_at TEXT
);
