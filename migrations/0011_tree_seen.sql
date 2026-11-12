-- ป๊อปอัป "ครบ 5 วันแล้ว" (ต้นคริสต์มาส): earned_at ของสิทธิ์หมุนล่าสุดที่เด็กเห็นป๊อปอัปแล้ว
-- ตั้งค่าเริ่มต้นเป็นเวลาที่ migrate → สิทธิ์เก่าไม่เด้งย้อนหลัง เด้งเฉพาะรอบใหม่
ALTER TABLE Members ADD COLUMN tree_seen TEXT;
UPDATE Members SET tree_seen = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE role = 'child';
