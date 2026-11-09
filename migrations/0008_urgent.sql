-- ภารกิจด่วน: 1 แถว = ภารกิจด่วน 1 อันของเด็ก 1 คน (สร้างให้หลายคนพร้อมกัน = หลายแถว batch_id เดียวกัน)
-- status: pending (ส่งแล้ว เด็กยังไม่เห็น) · running (เห็นแล้ว กำลังนับถอยหลัง) · submitted (ส่งทันเวลา → ไปรออนุมัติ)
--         declined (ไว้คราวหน้า) · expired (หมดเวลา / ไม่เปิดดูจนหมดอายุ) · cancelled (ผู้ปกครองยกเลิก)
-- เวลาทั้งหมดเป็นเวลาเซิร์ฟเวอร์ (UTC ISO) — มือถือเด็กเปลี่ยนเวลาเครื่องเพื่อยืดเวลาไม่ได้
CREATE TABLE IF NOT EXISTS Urgent (
  urgent_id     TEXT PRIMARY KEY,
  batch_id      TEXT,
  family_id     TEXT,
  child_id      TEXT,
  title         TEXT,
  icon          TEXT,
  stars         INTEGER,
  duration_sec  INTEGER,
  open_until    TEXT,
  created_by    TEXT,
  created_at    TEXT,
  status        TEXT,
  seen_at       TEXT,
  deadline_at   TEXT,
  reminded_at   TEXT,
  submission_id TEXT,
  ended_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_urgent_family ON Urgent(family_id, status);
CREATE INDEX IF NOT EXISTS idx_urgent_family_created ON Urgent(family_id, created_at);
