-- คูปองลดราคาจากไข่ (ของแถมตอนฟัก · สุ่ม 10%/25%/50%) · ใช้ลดของ 1 ชิ้นตอนซื้อ · เป็นของทั้งครอบครัว ไม่หมดอายุ
CREATE TABLE IF NOT EXISTS Coupons (
  coupon_id  TEXT PRIMARY KEY,
  family_id  TEXT,
  pct        INTEGER,
  egg_id     TEXT,
  created_at TEXT,
  used_at    TEXT,
  used_on    TEXT     -- item_id ที่ใช้คูปองซื้อ
);
CREATE INDEX IF NOT EXISTS idx_coupons_family ON Coupons(family_id);
