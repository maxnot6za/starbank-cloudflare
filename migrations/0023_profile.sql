-- ระบบโปรไฟล์สมาชิก: สีประจำตัว · คำประจำตัว · วันเกิด (YYYY-MM-DD)
-- avatar เดิม (อีโมจิ) ใช้ต่อได้ · ตัวการ์ตูนเก็บเป็น '@<art>' (public/avatars/<art>.webp)
ALTER TABLE Members ADD COLUMN color TEXT;
ALTER TABLE Members ADD COLUMN motto TEXT;
ALTER TABLE Members ADD COLUMN birthday TEXT;
