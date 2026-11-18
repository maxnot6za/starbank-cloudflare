-- รางวัลที่ลูกแลก: ผู้ปกครองกด "✓ ให้แล้ว" ทีละรายการ (ใช้ acknowledged_at เดิม) → ลูกเห็นป๊อปอัป "ได้รับรางวัลแล้ว"
-- kid_seen_at = ลูกเห็นป๊อปอัปนั้นแล้ว · ของเก่าที่ให้ไปแล้ว ถือว่าเห็นแล้ว (ไม่เด้งย้อนหลัง)
ALTER TABLE Redemptions ADD COLUMN kid_seen_at TEXT;
UPDATE Redemptions SET kid_seen_at = acknowledged_at WHERE acknowledged_at IS NOT NULL AND acknowledged_at <> '';
