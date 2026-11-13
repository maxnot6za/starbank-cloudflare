-- ดาวม่วงที่คนอื่นรับให้ / ระบบเก็บให้ ที่สมาชิกคนนี้ยังไม่เห็น (เวลา claimed_at ล่าสุดที่เห็นแล้ว)
ALTER TABLE Members ADD COLUMN purple_seen TEXT;
