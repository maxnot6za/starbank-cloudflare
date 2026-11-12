-- ใครเปิดแอปอยู่ (1 แถว = 1 การเชื่อมต่อ WebSocket) · FamilyHub เขียนตอนต่อ/ตัด · ใช้เช็กก่อน deploy
-- ended_at ว่าง = ยังต่ออยู่ · เวลาเป็น ms (UTC) · เก็บ 30 วันแล้วลบเอง
CREATE TABLE IF NOT EXISTS Presence (
  sid        TEXT PRIMARY KEY,
  family_id  TEXT,
  member_id  TEXT,
  role       TEXT,
  started_at INTEGER,
  ended_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_presence_open ON Presence(ended_at, started_at);
CREATE INDEX IF NOT EXISTS idx_presence_family ON Presence(family_id);
