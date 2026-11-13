# CLAUDE.md

อ่าน `HANDOFF.md` ให้จบก่อนเริ่มงานทุกครั้ง

กฎสำคัญ:
- ตอบ KC เป็นภาษาไทย วิเคราะห์ผลกระทบและถามก่อนแก้ ทำ mock หน้าจอให้ดูก่อนเขียน UI
- push เข้า `main` = deploy production ทันที และมีครอบครัวจริงใช้งานอยู่ · ก่อนถาม KC ว่าจะ deploy ให้เช็กคนออนไลน์ตาม `HANDOFF.md` หัวข้อ 10.1 แล้วรายงานด้วย
- migration ต้อง apply บน production ก่อน push โค้ดที่ใช้
- ฟังก์ชัน `/api` ใหม่ต้องเพิ่มทั้ง `PUBLIC_API` (src/core.js) และ `MEMBER_ARG` (src/index.js)
- ห้าม polling ด้วย timer ให้ใช้ WebSocket ที่มีอยู่
- repo เป็น public: ห้ามใส่ secret หรือข้อมูลครอบครัวจริง
- ตัวละครเคลื่อนไหวอยู่ใน `sprites/` (อ่าน `sprites/README.md`) ภาพใหม่ตัดด้วย `cut.py` ไม่ต้องเขียนโค้ดตัดเอง
- อัปเดต `HANDOFF.md` เมื่อเพิ่มฟีเจอร์หรือเปลี่ยนสถานะงานค้าง
- deploy ฟีเจอร์ใหม่ → ถาม KC ว่าจะแจ้ง "มีอะไรใหม่" ไหม พร้อมร่างข้อความ (`WHATS_NEW` ใน public/index.html · HANDOFF 8.14)
- KC พูดว่า "เพิ่มธีม" → ส่งรายการของที่ต้องส่งจาก `public/themes/README.md` ให้ก่อนเสมอ
- KC จะสร้างตัวละครใหม่ → ส่งรายการท่า + prompt จาก `sprites/PROMPTS.md` หัวข้อ "ตัวละครลูกใหม่ — ครบชุด"
