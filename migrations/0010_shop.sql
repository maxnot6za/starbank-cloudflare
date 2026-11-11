-- ร้านค้า + ภารกิจประจำวัน + ดาวม่วง/เหรียญทอง (เงินของครอบครัว แยกจากดาวสะสมเด็กเด็ดขาด)

-- กระเป๋าครอบครัว: ดาวม่วง (ได้จากภารกิจประจำวัน) · เหรียญทอง (ยังไม่มีที่มา)
ALTER TABLE Families ADD COLUMN purple INTEGER DEFAULT 0;
ALTER TABLE Families ADD COLUMN gold INTEGER DEFAULT 0;
-- วันที่สมาชิกเห็น popup ภารกิจประจำวันล่าสุด (YYYY-MM-DD เวลาไทย) → เด้งวันละครั้งไม่ว่าเปิดเครื่องไหน
ALTER TABLE Members ADD COLUMN quest_seen TEXT;

-- กันยอดติดลบ (ซื้อพร้อมกันสองเครื่อง)
CREATE TRIGGER IF NOT EXISTS trg_wallet_nonneg
BEFORE UPDATE OF purple, gold ON Families
WHEN NEW.purple < 0 OR NEW.gold < 0
BEGIN
  SELECT RAISE(ABORT, 'CHECK constraint failed: wallet');
END;

-- ภารกิจประจำวัน: 1 แถว = ภารกิจ 1 อันของวันนั้น · owner = 'parents' (ร่วมกันทุกผู้ปกครอง) หรือ member_id ของเด็ก
-- quest_id = family_id|date|owner (สองเครื่องสุ่มพร้อมกัน → ซ้ำ PK → ลองใหม่แล้วใช้อันที่บันทึกก่อน)
-- status: active · done (ทำครบ รอกดรับ) · claimed (รับแล้ว / ระบบเก็บให้ตอนข้ามวัน)
CREATE TABLE IF NOT EXISTS DailyQuests (
  quest_id    TEXT PRIMARY KEY,
  family_id   TEXT,
  date        TEXT,
  owner       TEXT,
  type        TEXT,
  target      INTEGER,
  progress    INTEGER,
  reward      INTEGER,
  status      TEXT,
  claimed_by  TEXT,
  claimed_at  TEXT,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_quests_family_date ON DailyQuests(family_id, date);

-- ตัวละครที่ครอบครัวซื้อแล้ว · assigned_to = member_id ที่ใช้เป็นอวาตาร์ (ว่าง = ยังไม่ได้ให้ใคร)
CREATE TABLE IF NOT EXISTS Inventory (
  inv_id      TEXT PRIMARY KEY,
  family_id   TEXT,
  item_id     TEXT,
  price       INTEGER,
  currency    TEXT,
  bought_by   TEXT,
  bought_at   TEXT,
  assigned_to TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_item ON Inventory(family_id, item_id);

-- เด็กกด "อยากได้" ตัวละคร
CREATE TABLE IF NOT EXISTS Wishes (
  wish_id    TEXT PRIMARY KEY,
  family_id  TEXT,
  child_id   TEXT,
  item_id    TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_wishes_family ON Wishes(family_id);

-- สมุดบัญชีเงินร้านค้า (เขียนอย่างเดียว ไว้ตรวจย้อนหลัง)
CREATE TABLE IF NOT EXISTS WalletLog (
  log_id     TEXT PRIMARY KEY,
  family_id  TEXT,
  currency   TEXT,
  amount     INTEGER,
  kind       TEXT,
  ref        TEXT,
  member_id  TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_walletlog_family ON WalletLog(family_id, created_at);
