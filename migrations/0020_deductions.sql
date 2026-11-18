-- หักดาว: ผู้ปกครองหักดาวลูก (ต้องมีเหตุผล) · ไม่ติดลบ · ยกเลิกได้ใน 5 นาที
-- ภารกิจแก้ตัว (ไม่บังคับ): ลูกทำ → ผู้ปกครองอนุมัติ → ได้ดาวคืนเท่าที่หัก
-- status: active · undone (ผู้ปกครองยกเลิก)
-- fix_status: '' (ไม่มีแก้ตัว) · open (รอลูกทำ) · pending (ลูกส่งแล้ว รออนุมัติ) · done (ได้ดาวคืนแล้ว)
--   หมดเวลา = open และเลย fix_until (คำนวณตอนอ่าน ไม่ต้องเขียน)
CREATE TABLE IF NOT EXISTS Deductions (
  ded_id        TEXT PRIMARY KEY,
  family_id     TEXT,
  child_id      TEXT,
  stars         INTEGER,
  reason        TEXT,
  created_by    TEXT,
  created_at    TEXT,
  status        TEXT,
  undone_at     TEXT,
  seen_at       TEXT,
  fix_title     TEXT,
  fix_icon      TEXT,
  fix_until     TEXT,
  fix_status    TEXT,
  fix_sent_at   TEXT,
  fix_by        TEXT,
  fix_done_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_ded_family ON Deductions(family_id);
CREATE INDEX IF NOT EXISTS idx_ded_child ON Deductions(child_id);

-- ดาวที่โดนหักอยู่ = active และยังไม่ได้คืน
-- กันดาวติดลบ: นับการหักดาวด้วย ทั้งตอนแลกรางวัลและตอนหักดาว
DROP TRIGGER IF EXISTS trg_no_overspend;
CREATE TRIGGER IF NOT EXISTS trg_no_overspend AFTER INSERT ON Redemptions
BEGIN
  SELECT RAISE(ABORT, 'ดาวไม่พอ')
  WHERE (SELECT COALESCE(SUM(stars_earned), 0) FROM Submissions WHERE child_id = NEW.child_id AND status = 'approved')
      + (SELECT COALESCE(SUM(prize_stars), 0) FROM Spins WHERE child_id = NEW.child_id AND COALESCE(used_at, '') <> '')
      + (SELECT COALESCE(SUM(stars), 0) FROM Gifts WHERE child_id = NEW.child_id AND status = 'opened')
      - (SELECT COALESCE(SUM(stars_spent), 0) FROM Redemptions WHERE child_id = NEW.child_id)
      - (SELECT COALESCE(SUM(stars), 0) FROM Deductions WHERE child_id = NEW.child_id AND status = 'active' AND COALESCE(fix_status, '') <> 'done') < 0;
END;
DROP TRIGGER IF EXISTS trg_no_overdeduct;
CREATE TRIGGER IF NOT EXISTS trg_no_overdeduct AFTER INSERT ON Deductions
BEGIN
  SELECT RAISE(ABORT, 'ดาวไม่พอให้หัก')
  WHERE (SELECT COALESCE(SUM(stars_earned), 0) FROM Submissions WHERE child_id = NEW.child_id AND status = 'approved')
      + (SELECT COALESCE(SUM(prize_stars), 0) FROM Spins WHERE child_id = NEW.child_id AND COALESCE(used_at, '') <> '')
      + (SELECT COALESCE(SUM(stars), 0) FROM Gifts WHERE child_id = NEW.child_id AND status = 'opened')
      - (SELECT COALESCE(SUM(stars_spent), 0) FROM Redemptions WHERE child_id = NEW.child_id)
      - (SELECT COALESCE(SUM(stars), 0) FROM Deductions WHERE child_id = NEW.child_id AND status = 'active' AND COALESCE(fix_status, '') <> 'done') < 0;
END;
