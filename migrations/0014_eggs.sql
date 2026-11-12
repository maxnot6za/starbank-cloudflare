-- ไข่ปริศนา: เจอตอนผู้ปกครองอนุมัติภารกิจของเด็ก (สุ่ม 20% · การันตีครั้งที่ 8) · ฟักเมื่อความอบอุ่นครบ 15 (วันละไม่เกิน 5) · เด็กแตะฟัก → ได้ของตกแต่ง
-- ครอบครัวมีไข่ที่ยังไม่ฟักได้ทีละ 1 ใบ · egg_id = family_id|ลำดับ (สองเครื่องเจอพร้อมกัน → ซ้ำ PK → ใช้ใบแรก)
CREATE TABLE IF NOT EXISTS Eggs (
  egg_id      TEXT PRIMARY KEY,
  family_id   TEXT,
  status      TEXT,      -- warming · ready · hatched
  warm        INTEGER,
  goal        INTEGER,
  day         TEXT,      -- วันไทยล่าสุดที่ได้ความอบอุ่น (นับเพดานรายวัน)
  day_warm    INTEGER,
  contrib     TEXT,      -- JSON {member_id: แต้ม}
  hugs        TEXT,      -- JSON {member_id: วันที่กอดล่าสุด}
  found_by    TEXT,
  found_at    TEXT,
  hatched_by  TEXT,
  hatched_at  TEXT,
  prize       TEXT,      -- item_id ของตกแต่ง หรือ purple:15
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_eggs_family ON Eggs(family_id);
-- นับครั้งที่อนุมัติแล้วยังไม่เจอไข่ (ครบ 8 → เจอแน่)
ALTER TABLE Families ADD COLUMN egg_pity INTEGER DEFAULT 0;
-- เหตุการณ์ไข่ล่าสุดที่สมาชิกเห็นป๊อปอัปแล้ว (egg_id:f = เจอ · egg_id:h = ฟัก)
ALTER TABLE Members ADD COLUMN egg_seen TEXT;
