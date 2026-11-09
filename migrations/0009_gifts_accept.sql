-- ภารกิจด่วน: เวลากด "รับภารกิจ" (นาฬิกาเริ่มนับจากตอนนี้ หรือ 1 นาทีหลังเห็นป้าย)
ALTER TABLE Urgent ADD COLUMN accepted_at TEXT;

-- ของขวัญ: ผู้ปกครองส่งดาวให้เด็ก · ดาวเข้าเมื่อเด็กเปิดกล่อง
-- status: sent (รอเปิด) · opened (เปิดแล้ว ดาวเข้า) · cancelled (ผู้ปกครองยกเลิกก่อนเปิด)
CREATE TABLE IF NOT EXISTS Gifts (
  gift_id     TEXT PRIMARY KEY,
  family_id   TEXT,
  child_id    TEXT,
  stars       INTEGER,
  reason      TEXT,
  message     TEXT,
  created_by  TEXT,
  created_at  TEXT,
  status      TEXT,
  opened_at   TEXT,
  ended_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_gifts_family ON Gifts(family_id, status);
CREATE INDEX IF NOT EXISTS idx_gifts_child ON Gifts(child_id, status);

-- กันดาวติดลบ: นับดาวจากของขวัญที่เปิดแล้วด้วย
DROP TRIGGER IF EXISTS trg_no_overspend;
CREATE TRIGGER IF NOT EXISTS trg_no_overspend AFTER INSERT ON Redemptions
BEGIN
  SELECT RAISE(ABORT, 'ดาวไม่พอ')
  WHERE (SELECT COALESCE(SUM(stars_earned), 0) FROM Submissions WHERE child_id = NEW.child_id AND status = 'approved')
      + (SELECT COALESCE(SUM(prize_stars), 0) FROM Spins WHERE child_id = NEW.child_id AND COALESCE(used_at, '') <> '')
      + (SELECT COALESCE(SUM(stars), 0) FROM Gifts WHERE child_id = NEW.child_id AND status = 'opened')
      - (SELECT COALESCE(SUM(stars_spent), 0) FROM Redemptions WHERE child_id = NEW.child_id) < 0;
END;
