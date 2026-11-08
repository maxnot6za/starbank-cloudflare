-- รองรับประวัติยาวหลายปีโดยไม่ช้าลง: ไม่แก้ข้อมูลเดิม เพิ่มแค่ดัชนี + ตารางสรุปยอดที่ฐานข้อมูลดูแลเอง
CREATE INDEX IF NOT EXISTS idx_subs_family_status ON Submissions(family_id, status);
CREATE INDEX IF NOT EXISTS idx_subs_family_submitted ON Submissions(family_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_subs_family_reviewed ON Submissions(family_id, reviewed_at);

-- ยอดสะสมของเด็กแต่ละคน (นับจาก Submissions ทั้งหมด) — trigger อัปเดตให้ทุกครั้งที่เพิ่ม/แก้/ลบ
CREATE TABLE IF NOT EXISTS ChildStats (
  child_id TEXT PRIMARY KEY, earned REAL NOT NULL DEFAULT 0, approved INTEGER NOT NULL DEFAULT 0, pending INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER IF NOT EXISTS trg_cs_ins AFTER INSERT ON Submissions
BEGIN
  INSERT OR IGNORE INTO ChildStats (child_id) VALUES (NEW.child_id);
  UPDATE ChildStats SET
    earned = earned + (CASE WHEN NEW.status = 'approved' THEN COALESCE(NEW.stars_earned, 0) ELSE 0 END),
    approved = approved + (NEW.status = 'approved'), pending = pending + (NEW.status = 'pending')
  WHERE child_id = NEW.child_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_cs_upd AFTER UPDATE OF status, stars_earned, child_id ON Submissions
BEGIN
  UPDATE ChildStats SET
    earned = earned - (CASE WHEN OLD.status = 'approved' THEN COALESCE(OLD.stars_earned, 0) ELSE 0 END),
    approved = approved - (OLD.status = 'approved'), pending = pending - (OLD.status = 'pending')
  WHERE child_id = OLD.child_id;
  INSERT OR IGNORE INTO ChildStats (child_id) VALUES (NEW.child_id);
  UPDATE ChildStats SET
    earned = earned + (CASE WHEN NEW.status = 'approved' THEN COALESCE(NEW.stars_earned, 0) ELSE 0 END),
    approved = approved + (NEW.status = 'approved'), pending = pending + (NEW.status = 'pending')
  WHERE child_id = NEW.child_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_cs_del AFTER DELETE ON Submissions
BEGIN
  UPDATE ChildStats SET
    earned = earned - (CASE WHEN OLD.status = 'approved' THEN COALESCE(OLD.stars_earned, 0) ELSE 0 END),
    approved = approved - (OLD.status = 'approved'), pending = pending - (OLD.status = 'pending')
  WHERE child_id = OLD.child_id;
END;
-- ตั้งต้นจากข้อมูลที่มีอยู่ (รันซ้ำได้ ผลเท่าเดิม)
DELETE FROM ChildStats;
INSERT INTO ChildStats (child_id, earned, approved, pending)
  SELECT child_id,
    COALESCE(SUM(CASE WHEN status = 'approved' THEN COALESCE(stars_earned, 0) ELSE 0 END), 0),
    SUM(status = 'approved'), SUM(status = 'pending')
  FROM Submissions WHERE child_id IS NOT NULL GROUP BY child_id;
