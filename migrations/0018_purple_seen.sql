-- ดาวม่วงที่คนอื่นรับให้ / ระบบเก็บให้ ที่สมาชิกคนนี้ยังไม่เห็น (เวลา claimed_at ล่าสุดที่เห็นแล้ว)
ALTER TABLE Members ADD COLUMN purple_seen TEXT;
-- ของที่เด็กอยากได้ ที่ผู้ปกครองซื้อให้แล้ว (item_id|เวลา|ผู้ซื้อ) รอป๊อปอัป "ซื้อให้แล้ว!"
ALTER TABLE Members ADD COLUMN goal_got TEXT;
