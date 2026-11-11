# ธนาคารดาว (Cloudflare)

ระบบธนาคารดาวเวอร์ชัน Cloudflare Workers + D1 — พัฒนาคู่ขนานกับระบบเดิมบน Google Apps Script

| ไฟล์ | หน้าที่ |
|---|---|
| `src/core.js` | ตรรกะทั้งหมด พอร์ตจาก Code.gs แบบคงพฤติกรรมเดิม |
| `src/store.js` | อ่าน/เขียน D1 แบบ transaction + กันสองเครื่องแก้ทับกัน |
| `src/auth.js` | เข้าสู่ระบบ: ผู้ปกครองใช้ LINE Login, เด็กใช้รหัสครอบครัว + PIN หรือ QR, จำเครื่องด้วยคุกกี้ HttpOnly |
| `src/hub.js` | ส่งสัญญาณให้หน้าจอทุกเครื่องในครอบครัวอัปเดตทันที (Durable Object) |
| `src/index.js` | `/api/<ฟังก์ชัน>` (แทน google.script.run), `/line` (LINE webhook ตรวจลายเซ็น) |
| `public/index.html` | หน้าแอปเดิม + ตัวแปลง google.script.run → fetch |
| `migrations/0001_init.sql` | ตารางใน D1 (ตรงกับแท็บในชีตเดิม) |

เอกสารส่งต่องาน: ดู `HANDOFF.md`

ความลับ (ตั้งใน Cloudflare Dashboard → Settings → Variables and Secrets เท่านั้น):
`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` (Messaging API — ส่งแจ้งเตือนเฉพาะเมื่อ Webhook ชี้มาที่ระบบนี้)
`LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET` (LINE Login สำหรับผู้ปกครอง)
