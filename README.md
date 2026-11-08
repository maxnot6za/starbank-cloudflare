# ธนาคารดาว (Cloudflare)

ระบบธนาคารดาวเวอร์ชัน Cloudflare Workers + D1 — พัฒนาคู่ขนานกับระบบเดิมบน Google Apps Script

| ไฟล์ | หน้าที่ |
|---|---|
| `src/core.js` | ตรรกะทั้งหมด พอร์ตจาก Code.gs แบบคงพฤติกรรมเดิม |
| `src/store.js` | อ่าน/เขียน D1 แบบ transaction + กันสองเครื่องแก้ทับกัน |
| `src/index.js` | `/api/<ฟังก์ชัน>` (แทน google.script.run), `/line` (LINE webhook ตรวจลายเซ็น) |
| `public/index.html` | หน้าแอปเดิม + ตัวแปลง google.script.run → fetch |
| `migrations/0001_init.sql` | ตารางใน D1 (ตรงกับแท็บในชีตเดิม) |

ความลับ (ตั้งใน Cloudflare Dashboard → Settings → Variables and Secrets เท่านั้น):
`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` — ถ้ายังไม่ใส่ ระบบจะไม่ส่งข้อความ LINE
