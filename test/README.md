# ทดสอบ

ทดสอบทั้งหมดรันในเครื่องด้วย miniflare (Worker + D1 + Durable Object จำลอง) **ไม่แตะ production**
ข้อมูลใน `lib/fixture.js` เป็นครอบครัวปลอม ห้ามใส่ข้อมูลจริง (repo เป็น public)

```bash
cd test
npm install
node run.js --quick   # ~40 วิ: api, page, password, sprites
node run.js           # ทั้งหมด ~2 นาที: + urgent (รอนาฬิกาปลุกจริง ~65 วิ), ui-urgent (เบราว์เซอร์สองเครื่อง)
node urgent.test.js   # รันไฟล์เดียว
```

`page.test.js` และ `ui-urgent.test.js` ใช้ `playwright` (ติดตั้งไว้แล้วใน container ของ Claude) ถ้าไม่มี ให้ `npm i playwright && npx playwright install chromium`

| ไฟล์ | ทดสอบอะไร |
|---|---|
| `api.test.js` | ยอดดาว, ส่ง/อนุมัติ, แลกรางวัล, กันดาวติดลบ, ต้องมี session, ข้อมูลไม่ข้ามครอบครัว, `PUBLIC_API` ครบใน `MEMBER_ARG` |
| `page.test.js` | inline `<script>` ใน index.html parse ได้ทุกบล็อก + เปิดหน้าเด็ก/ผู้ปกครองไม่มี JS error |
| `password.test.js` | สมัคร/เข้าด้วยชื่อผู้ใช้+รหัสผ่าน, ล็อกเมื่อผิดหลายครั้ง, recovery code, reset link |
| `urgent.test.js` | ภารกิจด่วนครบทุกสถานะ, นาฬิกาปลุก DO, แจ้งเตือน, kid push, ของขวัญ |
| `sprites.test.js` | ตัวละครใน `sprites/`: เลขเฟรมใน character.json ถูกต้อง + หน้าตัวอย่างเปิดได้ เปลี่ยนท่าเองได้ |
| `shop.test.js` | ภารกิจประจำวัน (สุ่ม/นับ/รับ/เก็บอัตโนมัติ), ดาวม่วง, ร้านค้า (ลดตัวแรก, เด็กซื้อไม่ได้, อยากได้, อวาตาร์) |
| `ui-shop.test.js` | popup ภารกิจ, การ์ดภารกิจ, ร้านค้าผู้ปกครอง/เด็ก, ตัวละครเดินด้านล่างจอ (บันทึกภาพไว้ใน tmp) |
| `ui-urgent.test.js` | ภารกิจด่วนแบบสองเครื่อง (แม่ + ลูก) ผ่านเบราว์เซอร์ พร้อม live update |

ตัวช่วย:
- `lib/mf.js` — `start()` สร้าง Worker+DB ใหม่ทุกครั้ง, `call(mf, fn, ...args)` เรียก `/api/<fn>` ในนามสมาชิกตามตำแหน่ง `MEMBER_ARG` (อ่านจาก src/index.js อัตโนมัติ), `sessionFor(db, memberId)` สร้าง cookie `sb_s`
- `lib/fixture.js` — `seedFamily(db)` + รหัสสมาชิก `P1` (พ่อ), `P2` (แม่), `C` (ลูก), `P3` (บ้านอื่น)
- `lib/routes.js` — ตัดฟอนต์/รูปจาก CDN ตอนทดสอบเบราว์เซอร์

ข้อความ `api error ...` ใน log เป็นเรื่องปกติ (เทสต์ตั้งใจส่งค่าผิด) ดูผลจากบรรทัด ✓/✗ และ "ผ่านทั้งหมด"
