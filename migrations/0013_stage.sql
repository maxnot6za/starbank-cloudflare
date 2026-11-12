-- พื้นที่เดินของตัวละคร (แถบล่างจอ) ของครอบครัว: JSON {"floor":"floor_wood","wall":"wall_cream","slots":["",...5]}
-- ว่าง = พื้นไม้ (ฟรี) + ยังไม่วางของตกแต่ง · พื้น/ของตกแต่งที่ซื้อแล้วอยู่ใน Inventory เหมือนตัวละคร
ALTER TABLE Families ADD COLUMN stage TEXT;
