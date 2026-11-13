-- ไข่ 3 ระดับ (normal / rare / epic) · ตอนนี้สุ่ม normal 75% / rare 25% (การันตี rare ทุกใบที่ 5) · epic ยังไม่มีของ
ALTER TABLE Eggs ADD COLUMN tier TEXT DEFAULT 'normal';
ALTER TABLE Families ADD COLUMN egg_rare_pity INTEGER DEFAULT 0;
