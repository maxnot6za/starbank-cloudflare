# HANDOFF — ธนาคารดาว (Cloudflare)

เอกสารส่งต่องานสำหรับ AI session ใหม่หรือนักพัฒนาคนถัดไป อ่านไฟล์นี้ให้จบก่อนแก้โค้ด
อัปเดตล่าสุด: 2026-11-11 (commit `13077c7` + เอกสารนี้)

---

## 1. ระบบนี้คืออะไร

แอปเว็บ (PWA) ให้ครอบครัวใช้สะสม "ดาว" เป็นรางวัลให้ลูก
- **ผู้ปกครอง** สร้างภารกิจและรางวัล อนุมัติงานที่ลูกส่ง ส่งของขวัญดาว และสร้างภารกิจด่วน
- **เด็ก** ส่งภารกิจ แลกรางวัล หมุนวงล้อ รับภารกิจด่วน และเปิดกล่องของขวัญ

| รายการ | ค่า |
|---|---|
| URL จริง | https://starbank-cloudflare.maxnot6za.workers.dev |
| Repo | `maxnot6za/starbank-cloudflare` (**public**) |
| Deploy | Cloudflare **Workers Builds** — push เข้า `main` แล้ว deploy อัตโนมัติ |
| ฐานข้อมูล | D1 `starbank-db` (id อยู่ใน `wrangler.jsonc`) |
| ภาษา UI | ไทยทั้งหมด |

### ⚠️ มีผู้ใช้จริง
มีครอบครัวจริงใช้งานทุกวันบน production (ลูก 1 คน ผู้ปกครอง 3 คน)
- ทุก push เข้า `main` = deploy ทันที ห้าม push โค้ดที่ยังไม่ได้ทดสอบ
- migration ต้อง **apply บน production ก่อน push โค้ดที่ใช้คอลัมน์/ตารางใหม่**
- หลังเปลี่ยนเรื่องยอดดาว ให้ตรวจว่ายอดดาวของเด็กใน production ไม่เปลี่ยนไปเอง
- repo เป็น public: ห้ามใส่ความลับ ชื่อจริง LINE user id หรือข้อมูลครอบครัวจริงลงใน repo

---

## 2. วิธีทำงานกับเจ้าของโปรเจกต์ (KC)

- ตอบเป็น **ภาษาไทย**
- KC เปิด "caveman mode" ไว้: ตอบสั้น ขึ้นต้นด้วยคำตอบ ไม่มีคำเกริ่น แต่ตัวเลข โค้ด และคำปฏิเสธต้องครบถ้วน เวลาถามคำถามให้ใช้ประโยคเต็ม
- **วิเคราะห์ผลกระทบและถามก่อนแก้** โดยเฉพาะสิ่งที่กระทบครอบครัวจริง
- **ทำภาพตัวอย่างหน้าจอ (mock) ให้ดูก่อนเขียนโค้ด UI**
- **ห้ามใช้ polling / auto-refresh ด้วย timer** ให้ใช้ WebSocket (มีแล้ว ผ่าน Durable Object)
- ห้ามขอ LINE secret ในแชต KC ตั้งเองใน Cloudflare Dashboard เป็นชนิด **Secret** เท่านั้น ห้ามใส่ใน `wrangler.jsonc`
- KC ส่งข้อความ LINE เองได้ (AI ส่งแทนไม่ได้) ถ้าต้องส่งเอกสารให้ผู้ปกครองอ่าน ให้ทำเป็นรูป PNG

---

## 3. สถาปัตยกรรม

```
เบราว์เซอร์ (public/index.html, SPA ไฟล์เดียว)
   │  fetch /api/<fn>   fetch /auth/api/<action>   WebSocket /ws
   ▼
Worker (src/index.js)
   ├─ /api/*        → core.js ผ่าน Store (โหลดข้อมูลครอบครัวเข้าหน่วยความจำ → แก้ → flush เป็น D1 batch)
   ├─ /auth/*       → auth.js (session, LINE Login, PIN/QR, รหัสผ่าน, push subscribe)
   ├─ /line         → LINE Messaging webhook (ตรวจลายเซ็น)
   ├─ /ws           → Durable Object FamilyHub (1 ตัวต่อครอบครัว)
   ├─ /push/ack     → ใบตอบรับ Web Push จาก service worker
   ├─ /version      → เวอร์ชันที่ deploy อยู่
   └─ /health
Durable Object FamilyHub (src/hub.js)
   ├─ WebSocket hibernation: แจ้งทุกเครื่องในครอบครัวให้โหลดข้อมูลใหม่
   └─ alarm(): ปิดภารกิจด่วนที่หมดเวลา + เตือนเด็ก (src/urgent-run.js)
D1: ตารางทั้งหมดใน migrations/
```

### ที่มา: พอร์ตจาก Google Apps Script
ระบบเดิมเขียนบน Google Apps Script + Google Sheets (`Code.gs`) แล้วย้ายมา Cloudflare
- `core.js` คือพอร์ตจาก `Code.gs` แบบคงพฤติกรรมเดิม จึงใช้ `var` และ `function` สไตล์ GAS และชื่อฟังก์ชันลงท้าย `_` = ภายใน
- `store.js` จำลอง "ชีต" ในหน่วยความจำ: แต่ละตาราง = array ของ row object แล้ว flush การเปลี่ยนแปลงเป็น D1 batch เดียว
- หน้าเว็บยังเรียก `google.script.run.withSuccessHandler(...).fn(args)` อยู่ แต่มี shim ใน `index.html` (ราวบรรทัด 825) แปลงเป็น `fetch('/api/fn')`
- โค้ด GAS ที่ไม่ใช้แล้วยังค้างอยู่บางส่วน: `NO_LOCK` ใน core.js, `copyChildLink`, คำสั่ง `web_token` ผ่าน LINE (ยังไม่ได้ลบ รอ KC อนุมัติ)

---

## 4. แผนที่ไฟล์

| ไฟล์ | บรรทัดโดยประมาณ | หน้าที่ |
|---|---|---|
| `src/index.js` | 220 | router, `MEMBER_ARG`, retry เมื่อ `ConflictError`, inject version meta ด้วย HTMLRewriter, `scheduleUrgent()` |
| `src/core.js` | 1730 | ตรรกะธุรกิจทั้งหมด, `PUBLIC_API`, ภารกิจด่วน (~บรรทัด 1410+), ของขวัญ (~1660+) |
| `src/store.js` | 290 | นิยามตาราง (`TABLES`), โหลดแบบ windowed, `flush()`, `ConflictError` |
| `src/auth.js` | 850 | session cookie, LINE Login, PIN/QR เด็ก, username+password, recovery code, reset link, rate limit, push subscribe |
| `src/push.js` | 200 | Web Push (VAPID + aes128gcm), `notifyApp()` แจ้งเตือนตามประเภทเหตุการณ์, กรอง LINE outbox |
| `src/hub.js` | 60 | Durable Object `FamilyHub`: `/connect`, `/notify`, `/urgent-wake`, `alarm()` |
| `src/urgent-run.js` | 22 | `runUrgentSweep()` ใช้ใน alarm มี retry เมื่อชนกัน |
| `public/index.html` | 3940 | SPA ทั้งหมด (HTML+CSS+JS) หน้าเด็ก หน้าผู้ปกครอง หน้า login |
| `public/sw.js` | — | service worker: Web Push, badge, ใบตอบรับ |
| `public/img/mascot/dao-*.webp` | — | น้องดาว 4 ท่า (go/sleep/timeout/yay) ใช้ในภารกิจด่วน |
| `migrations/0001…0010` | — | schema D1 |
| `sprites/` | — | ระบบตัวละครเคลื่อนไหว (ไม่ถูก deploy) ดูหัวข้อ 13a |
| `test/` | — | ชุดทดสอบ miniflare + Playwright ดูหัวข้อ 9 |

---

## 5. ฐานข้อมูล (D1)

| ตาราง | มาจาก | หมายเหตุ |
|---|---|---|
| Families, Members, Missions, Submissions, Rewards, Redemptions, LineState, DailyLog, Spins | 0001 | ตรงกับแท็บในชีต GAS เดิม |
| `_guard` | 0001 | ใช้ CHECK constraint บังคับ optimistic concurrency |
| Sessions, AuthTokens | 0002 | session hash, token ชั่วคราว (invite, ticket, handoff, reset) |
| MergeLog | 0003 | บันทึกการรวมบัญชีผู้ปกครองซ้ำ |
| PushSubs, AppConfig | 0004 | push subscription; `AppConfig.vapid` = กุญแจ VAPID (สร้างเองอัตโนมัติ) |
| PushLog | 0005 | ใบตอบรับการแจ้งเตือน |
| ChildStats | 0006 | ยอดสรุปต่อเด็ก (trigger อัปเดต) รองรับประวัติยาวหลายปี |
| RateLimits + คอลัมน์ username/pw_*/recovery_* ใน Members | 0007 | |
| Urgent | 0008 | ภารกิจด่วน |
| Gifts + `Urgent.accepted_at` + trigger `trg_no_overspend` ใหม่ | 0009 | trigger นับดาวของขวัญที่เปิดแล้วด้วย |
| DailyQuests, Inventory, Wishes, WalletLog + `Families.purple/gold` + `Members.quest_seen` + trigger `trg_wallet_nonneg` | 0010 | ภารกิจประจำวัน/ร้านค้า |

**ยอดดาวของเด็ก** = ดาวจาก Submissions ที่อนุมัติ + Spins + Gifts ที่ `status='opened'` − Redemptions
(ดู `getStarBalance_`, `getChildStats_`, `getGiftStars_` ใน core.js) trigger `trg_no_overspend` กันยอดติดลบ

### วิธีเพิ่ม migration
1. สร้าง `migrations/00NN_name.sql` (ใช้ `IF NOT EXISTS` เสมอ)
2. ทดสอบในเครื่องด้วย miniflare (ดูหัวข้อ 9)
3. **Apply บน production ก่อน**: `npx wrangler d1 migrations apply starbank-db --remote` (ต้องมี Cloudflare API token) หรือรัน SQL ผ่าน Cloudflare MCP `d1_database_query`
4. ค่อย push โค้ด
5. ถ้าเพิ่มตาราง/คอลัมน์ที่ Store ต้องรู้ ให้เพิ่มใน `TABLES` ของ `store.js`

---

## 6. ความปลอดภัยและการยืนยันตัวตน

- Session: cookie `sb_s` (HttpOnly) อายุ 180 วัน เก็บเฉพาะ hash ใน `Sessions`
- **`MEMBER_ARG` ใน index.js**: สำหรับทุกคำสั่ง `/api/*` เซิร์ฟเวอร์จะเขียน member_id จาก session ทับอาร์กิวเมนต์ตำแหน่งที่กำหนดเสมอ ไม่เชื่อค่าจากหน้าเว็บ
  → **ฟังก์ชัน API ใหม่ต้องเพิ่มทั้งใน `PUBLIC_API` (core.js) และ `MEMBER_ARG` (index.js)** ไม่งั้นได้ 404
- ผู้ปกครองเข้าระบบได้ 2 ทาง: LINE Login หรือ username+รหัสผ่าน (PBKDF2 10k รอบ, recovery code, reset link ที่ผู้ปกครองอีกคนสร้างให้)
- เด็กเข้าระบบด้วย รหัสครอบครัว + PIN (ผิด 5 ครั้งล็อก 10 นาที) หรือ QR
- ผู้ใช้หลายคนในครอบครัวเดียวกัน: แอปบนหน้าจอโฮมของ iPhone เก็บ cookie แยกจาก Safari จึงมีระบบ "handoff" (`sb_handoff`)
- Rate limit: ตาราง `RateLimits` (รหัสผ่านผิด 5 ครั้งล็อก 15 นาที)

### Secrets (ตั้งใน Cloudflare Dashboard → Worker → Settings → Variables and Secrets)
| ชื่อ | ใช้ทำอะไร |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` | LINE Messaging API (แจ้งเตือนผู้ปกครองที่เลือกช่องทาง LINE) |
| `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET` | LINE Login |
| `LINE_LOGIN_BOT_PROMPT` (ไม่บังคับ) | ชวนแอดเพื่อน LINE OA ตอน login |

LINE webhook URL ใน LINE Developers ต้องชี้มาที่ `/line` (KC บอกว่าเปลี่ยนแล้ว แต่ยังไม่ได้ทดสอบส่งข้อความจริง)

---

## 7. การแจ้งเตือนและอัปเดตสด

- **Live update**: หลังเขียนข้อมูล Worker ส่ง `/notify` ไป FamilyHub → broadcast ทุก WebSocket ในครอบครัว → หน้าเว็บโหลดข้อมูลใหม่ (`Live` ใน index.html) ถ้ามี popup เปิดอยู่ (`Live.busy`) จะรอจนปิด
- **Web Push**: `notifyApp(env, origin, events)` ใน push.js ส่งตามประเภทเหตุการณ์ เช่น `urgent_new`, `urgent_remind`, `gift_new` (ส่งถึงเด็ก) และ `gift_opened`, `urgent_declined`, `urgent_expired` (ส่งถึงผู้ปกครอง)
- `Members.notify_channel`: `'app'` (ค่าเริ่มต้นถ้าไม่มี LINE) หรือ `'line'`
- เด็กก็รับ push ได้ (`kidPushSubscribe`) ถ้าเครื่องเป็นของผู้ปกครองอีกคนอยู่ จะถามยืนยันก่อน

---

## 8. ฟีเจอร์ล่าสุด (สถานะ live ทั้งหมด)

### 8.1 ภารกิจด่วน (Urgent)
- ผู้ปกครองตั้งชื่อ ไอคอน ดาว และระยะเวลา (นาที/ชม./วัน) แล้วเลือกเด็ก 1 คนขึ้นไป (สร้างหลายคน = หลายแถว `batch_id` เดียวกัน)
- เด็กมีภารกิจด่วนค้างได้ครั้งละ 1 อัน
- สถานะ: `pending` → `running` → `submitted` / `declined` / `expired` / `cancelled`
- เด็กเห็นป้าย (`urgentSeen`) แล้วมี 60 วิให้กด 💪รับภารกิจ หรือ 😴ไว้คราวหน้า ถ้าไม่กด จะเริ่มนับเวลาเอง (`URGENT_READ_MS`)
- ใช้เวลาเซิร์ฟเวอร์ทั้งหมด ผ่อนผันให้ 5 วิ (`URGENT_GRACE_MS`) dashboard ส่ง `serverNow` ไปให้หน้าเว็บชดเชยนาฬิกาเครื่อง
- เตือนเด็กเมื่อเหลือเวลา 20% (ถ้าภารกิจยาวไม่เกิน 1 ชม.) หรือเหลือ 1 ชม. (ถ้ายาวกว่านั้น) เฉพาะภารกิจที่ยาวตั้งแต่ 3 นาทีขึ้นไป
- หมดเวลา/เตือน ทำงานผ่าน alarm ของ Durable Object (`/urgent-wake` → `alarm()` → `runUrgentSweep`) ไม่มี cron
- ส่งแล้วไปรออนุมัติเหมือนภารกิจปกติ; `reviewSubmission` ใช้ `Urgent.stars` เมื่อหา mission ไม่เจอ
- ปฏิเสธหรือหมดเวลา **ไม่หักดาว**
- **UI ผู้ปกครอง (พ.ย. 2026):** ไม่มีหัวข้อภารกิจด่วนบนหน้าหลักแล้ว → ปุ่มกลม ⚡ ลอย (`#urg-fab`) เฉพาะหน้าหลัก · แตะ = สร้าง หรือถ้ามีที่ยังไม่จบ = เปิดรายละเอียด (`#urg-detail`, อัปเดตสดได้แม้ modal เปิด) · มีวงแหวนนับเวลา + จุดแดงจำนวนรออนุมัติ · ลากย้ายได้ เด้งชิดขอบซ้าย/ขวา จำตำแหน่งใน localStorage `sb_urgfab`
- รออนุมัติ (หน้าหลัก + แท็บอนุมัติ) แยกกลุ่ม ⚡ ด่วน ไว้บนสุด (`pendingGroups`, `urgSub` จับคู่ผ่าน `submission_id`) · ภารกิจด่วนที่หมดเวลา/ไว้คราวหน้า/ยกเลิก ไปอยู่ใน "ประวัติการอนุมัติ" พร้อมปุ่มส่งดาวปลอบใจ (ใช้ `d.urgent` 7 วันล่าสุด ไม่มีแก้เซิร์ฟเวอร์)
- ปุ่ม "📊 สรุปรายวัน" ย้ายไปอยู่ในหน้าตั้งค่า

### 8.2 ของขวัญ (Gifts)
- ผู้ปกครองส่งดาวพร้อมเหตุผล (gift/great/comfort/birthday/other) และข้อความ มีหน้ายืนยันก่อนส่ง สูงสุด 9,999 ดาวต่อครั้ง
- **ดาวเข้ายอดเมื่อเด็กกดเปิดกล่อง** (มีอนิเมชันเปิดกล่อง) ผู้ปกครองยกเลิกได้ก่อนเด็กเปิด
- ไม่นับเป็นภารกิจและไม่นับเป็นวันสำหรับวงล้อ
- คำตอบของ KC เรื่องเวลาที่ดาวเข้ายังกำกวมอยู่ ปัจจุบันยังไม่มีการเข้ายอดอัตโนมัติหลัง N วัน

### 8.3 เข้าระบบด้วย username + password
ทางเลือกแทน LINE สำหรับผู้ปกครองที่ไม่มี LINE มี recovery code และ reset link

### 8.4 ภารกิจประจำวัน + ดาวม่วง + ร้านค้า (migration 0010)
- **ดาวม่วง** = เงินของครอบครัว (`Families.purple`) แยกจากดาวสะสมเด็กเด็ดขาด · **เหรียญทอง** (`Families.gold`) ยังไม่มีที่มา · trigger `trg_wallet_nonneg` กันติดลบ · ทุกการรับ/จ่ายลง `WalletLog`
- **ภารกิจประจำวัน** (`DailyQuests`, quest_id = family|date|owner): สุ่มตอนมีคนในครอบครัวเปิดแอปครั้งแรกของวัน (เวลาไทย)
  - ผู้ปกครอง 1 อันร่วมกัน (owner='parents'): ส่งภารกิจด่วน 1–3 / อนุมัติ 1–5 (นับด่วนด้วย) / ส่งของขวัญ 1 (รางวัล 3)
  - เด็กแต่ละคน: ทำภารกิจทั่วไป 1–5 / ภารกิจด่วนสำเร็จ 1 (3) / ภารกิจคูณดาว 1 (2, สุ่มเฉพาะครอบครัวที่มีภารกิจคูณดาว)
  - นับใน `questBump_` จาก createUrgent / reviewSubmission_ (approved) / sendGift · ภารกิจเด็กนับตอนผู้ปกครองอนุมัติ · ส่งด่วนให้ลูกหลายคนในครั้งเดียว = 1
  - ทำครบ → `done` → กด "รับ" (`claimQuest`) · ลืมกด → ระบบเก็บให้ (`claimed_by='auto'`) ตอนมีคนเปิดแอปวันถัดไป
  - popup วันละครั้งต่อคน (`Members.quest_seen`) · ข้อมูลมากับ dashboard (`daily`) ไม่เพิ่ม request
- **ร้านค้า** (`SHOP_ITEMS` ใน core.js): พ่อ/แม่/ลูกไดโน ราคา 30 ดาวม่วง (เดิม 50) · ตัวแรกของครอบครัวลด 50% (`FIRST_DISCOUNT`)
  - ราคาคิดจาก: ภารกิจผู้ปกครองเฉลี่ย ~2.7/วัน + เด็ก 1 คน ~2.7–3/วัน ≈ 5.5/วัน → ~10 วันต่อ 1 ตัว (ลูก 2 คน ~6–7 วัน)
  - **ผู้ปกครองเท่านั้นที่ซื้อ/เปลี่ยนอวาตาร์ได้** (ตรวจที่เซิร์ฟเวอร์) · เด็กดูได้ + กด "อยากได้" (`Wishes`, push `shop_wish` ถึงผู้ปกครอง)
  - ซื้อแล้วเลือกว่าให้ใครใช้ (`Inventory.assigned_to`, 1 คน 1 ตัว, ชุดพ่อ/แม่ให้ผู้ปกครอง ชุดลูกให้เด็ก)
  - ตัวละครที่มีคนใช้ → เดินด้านล่างจอของทุกคนในครอบครัว (`#avatar-strip`, SpriteScene + บทจาก `scenes/family.json` เฉพาะตัวที่มี)
- ไฟล์ตัวละครบนเว็บอยู่ที่ `public/sprites/` สร้างด้วย `python3 sprites/publish.py` (เทสต์ฟ้องถ้าลืม)
- เมนูผู้ปกครอง: "สรุป" ถูกแทนด้วย "ร้านค้า" · หน้าสรุปเข้าจากปุ่ม "📊 สรุปรายวัน" บนหน้าหลัก

---

### 8.5 พับ/กางหัวข้อหน้าหลักผู้ปกครอง (index.html เท่านั้น)
- หัวข้อ ภารกิจประจำวัน / สมาชิกเด็ก / ภารกิจด่วน มีปุ่ม +/− (`foldToggle`, `foldApply`, `FOLD_DEF`) ตอนพับโชว์สรุปบนหัว
- ค่าเริ่มต้น: ประจำวัน พับ · สมาชิกเด็ก กาง · ภารกิจด่วน กาง · กล่อง "✅ จบแล้ว" พับ · จำในเครื่องที่ `localStorage.sb_fold`
- ภารกิจด่วนที่จบแล้ว (`!urgLive`) ย้ายไปกล่อง "จบแล้ว N รายการ" · ยังไม่จบ = active หรือมีเด็ก pending/running/submitted ที่ยังไม่ตัดสิน
- "มีเด็กแลกรางวัล" และ "รออนุมัติ" ไม่มีปุ่มพับ (ต้องกด) · หน้าเด็กไม่มีพับ

### 8.6 ป๊อปอัปครบ 5 วัน (ต้นคริสต์มาส) (migration 0011)
- เด้งที่เครื่องเด็กเมื่อมีแถว `Spins` ใหม่ที่ `earned_at` > `Members.tree_seen` (`wheel.lastEarned` vs `wheel.treeSeen`) · เช็กทุกครั้งที่ `renderWheelCard` → มาทาง Live ได้ทันที
- migration ตั้ง `tree_seen` = เวลาที่ migrate → สิทธิ์เก่าไม่เด้งย้อนหลัง · กด "ปิด" → `treeSeen(earnedAt)` (ไม่ย้อนกลับ)
- อวาตาร์ `dino_kid` ของเด็กคนนั้น = แบบน้องไดโนแขวนบอล · ไม่มี = บอลลอยลงมาเอง · ไม่มีรางวัลเพิ่ม (สิทธิ์หมุนเหมือนเดิม) · ผู้ปกครองไม่เห็น
- ภาพ `public/themes/xmas/celebrate/*.webp` (ตัดจาก `sprites/tree/src/` ด้วย `mk.py`/`mk2.py` ไม่ใช่ cut.py เพราะเป็นฉาก+ต้นไม้ ต้องคงตำแหน่ง) · อนิเมชันวาดด้วย canvas ใน `treePopOpen` · เสียงกริ๊ง WebAudio (ดังได้หลังเด็กแตะจอแล้ว)

### 8.7 ธีม (migration 0012) — ดู `public/themes/README.md`
- `Families.theme` (ค่าเริ่มต้น `xmas`) · `setTheme` เฉพาะผู้ปกครอง · id ต้องอยู่ใน `THEMES` (core.js) = `public/themes/index.json`
- หน้าเว็บ: `THEME`/`themeSet`/`themeApply`/`TW(คำ)`/`progressArt` · render หน้าหลักเรียก `themeSet(d.family.theme)` → เปลี่ยนตามทาง Live · เครื่องจำธีมล่าสุด (`localStorage.starbank_theme`)
- ของคริสต์มาสทั้งหมดย้ายไป `public/themes/xmas/` (พื้นหลังเดิมอยู่ repo starbank-assets, เพลงเดิม `public/music/`, มาสคอตเดิม `public/img/mascot/`, ภาพฉลองเดิม `public/sprites/tree/`)
- ตั้งค่าผู้ปกครองมีการ์ด "🎨 ธีมของครอบครัว" · ยังเหลือ logo + ไอคอน Fluent ที่ starbank-assets (ไม่ผูกธีม)

### 8.8 ผนัง + พื้น + ของตกแต่ง + หน้า "ของของครอบครัว" (migration 0013) — ดู `public/stage/README.md`
- `SHOP_ITEMS` มี `kind` (avatar/floor/decor) · `floor_wood` + `wall_cream` ฟรีเป็นค่าเริ่มต้น · `Families.stage` JSON · `setFloor`/`setWall`/`saveRoom` เฉพาะผู้ปกครอง · ของที่ไม่รู้จัก → ค่าเริ่มต้น
- ร้านแยกแท็บตามประเภท + การ์ด "🎒 ของของครอบครัว" → `openInventory()` (modal) จัดการตัวละคร/พื้น/จัดห้อง · เด็กดูอย่างเดียว
- แถบล่าง `stripUpdate(avatars, stage)` วาดผนัง + พื้น + ของตกแต่ง ตัวละครยืน `ground:16` · มีแถบ → `.xmas-scene` สั้นลง (พื้นหลังธีมยกขึ้น)
- ค้าง: ยังไม่มีพื้น/ผนังขาย (รอภาพจาก KC)

### 8.9 ไข่ปริศนา + ของตกแต่ง 18 ชิ้น + จัดห้องอิสระ (migration 0014)
- ของตกแต่ง `decor_<art>` ภาพที่ `public/stage/decor/` · ชุด xmas 6 ชิ้นขาย 10 ดาวม่วง (ใช้ส่วนลด 50% ชิ้นแรก) · ชุด room/toys 12 ชิ้น `egg:true` ได้จากไข่เท่านั้น
- ห้อง `Families.stage.decor = [{id,x,s}]` (x 0–1, s 0.6–1.6, ลำดับ = หลัง→หน้า, สูงสุด 8) · `saveRoom(memberId, json)` ผู้ปกครองเท่านั้น · หน้าจอ `roomEditorHtml/roomRender/roomSave` ในแท็บตกแต่งของ "ของของครอบครัว"
- ท่าขยับของตกแต่ง = CSS class `fx` (sway/rock/breathe/hover/bounce/beat/wiggle/hop/slide + lamp/fire/twinkle) จาก `SHOP_ITEMS` ไม่ต้องมีเฟรม
- ตัวละครเดินผ่านของได้แต่ไม่หยุดยืนทับ: `SpriteScene` รับ `cfg.blocked()` (แก้ใน `sprites/scene.js` แล้วคัดลอกไป `public/sprites/`)
- ไข่อยู่ชั้นบนสุดของแถบห้อง · ตอนมีไข่ หน้าจัดห้องแสดงเงา "ที่ของไข่" มุมขวา ลากของเข้าไปจะเด้งออก (`roomMaxX`)
- ไข่ในห้องกว้าง 54px · หายใจ + กระโดดทุก 4 วิ + แสงอุ่น · พร้อมฟักสั่นแรง + ประกาย · แตะ = เด้งยุบแล้วเปิดหน้าไข่ (`eggStripTap`)
- แถบห้องขึ้นเมื่อมีตัวละคร หรือไข่ หรือของตกแต่ง · ไม่มีตัวละคร → ป้าย "🛒 พาตัวละครมาอยู่ในห้องสิ"
- ไข่ (`Eggs`, `Families.egg_pity`, `Members.egg_seen`): เจอตอนอนุมัติภารกิจลูก 20% การันตีครั้งที่ 8 · เป้า 15 อุ่นวันละไม่เกิน 5 (อนุมัติ +1, กอดคนละครั้ง/วัน +1) · ลูกเท่านั้นฟัก (แตะ 3 ครั้ง) · ได้ของจากไข่ที่ยังไม่มีแบบสุ่ม ครบแล้วได้ดาวม่วง 15 · ป๊อปอัปเจอ/ฟักขึ้นให้ทุกคนครั้งเดียว (`eggSeen`)
- ทดสอบ: `egg.test.js` (API) + `ui-egg.test.js` (หน้าจอ)

### 8.11 สัตว์เลี้ยง (ตัวละครประเภทที่ 4 ต่อจาก ลูก/แม่/พ่อ)
- `SHOP_ITEMS` kind `pet` (ตอนนี้ `pet_dino` ไดโนจิ๋ว `petdino` `pet_dino_pink` ไดโนชมพู `petpink` และ `pet_dino_yellow` ไดโนเหลือง `petyellow` ตัวละ 20 ดาวม่วง) · ของทั้งครอบครัว ไม่มีเจ้าของรายคน
- ห้อง `Families.stage.pets = [item_id]` สูงสุด `PET_MAX` 2 · ซื้อแล้วเข้าห้องเองถ้ายังมีที่ · `setPets(memberId, json)` ผู้ปกครองเท่านั้น (ร้าน: พาเข้า/ออกห้อง · ของของครอบครัว: แท็บ 🐾)
- แถบห้อง: สัตว์เลี้ยงอยู่ใน cast ของ SpriteScene (scale 0.8) · มีสัตว์เลี้ยงแล้วไม่ขึ้นป้ายชวนซื้อตัวละคร
- ท่า (`sprites/characters/petdino`): เดิน · ลง/ลุก (ชีต down) · อมอมยิ้ม · นั่งเล่นบอล · หมอบหลับ · โหม่งบอล (แตะ) · `life` ใช้ `{"walk":"near"}` = เดินแค่ 1–2 ช่วงหัว (เพิ่มใน sprite-actor.js)
- สัตว์เลี้ยงสีใหม่: เจนชีตชุดเดียวกัน → cut.py เป็นตัวละครใหม่ → คัดลอก anims/life จาก petdino → เพิ่มใน SHOP_ITEMS · ทดสอบ `pet.test.js`
- ชีตโหม่งบอลจาก AI มีเส้นพื้นและบอลแยกชิ้น → สร้าง `src/head-fixed.webp` (ตัดเส้นพื้น เว้นช่องคอลัมน์) แล้วตัดด้วย `--keep-y --order 1,2,6,3,4,5`
- ค้าง: ท่าหมอบหลับของ petdino ไม่มีขอบขาว (KC จะเจนใหม่)

### 8.12 ไข่ 3 ระดับ + สัตว์เลี้ยงจากไข่ (migration 0017)
- `Eggs.tier` normal / rare / epic · ตอนเจอไข่สุ่ม rare 25% (`EGG_RARE_CHANCE`) · การันตี rare ทุกใบที่ 5 (`Families.egg_rare_pity`, `EGG_RARE_PITY`) · epic ยังไม่มีของ → ยังไม่สุ่ม
- เวลาฟักเท่ากันทุกระดับ (15 ความอุ่น ~3 วัน)
- ของในไข่ = `SHOP_ITEMS` ที่ `egg:true` ตาม `tier` (`eggPool_`): normal = ของตกแต่ง 12 ชิ้น · rare = สัตว์เลี้ยง ก๊อตซีโร่ `pet_godzero` (petwalk) · ปุยเมฆ `pet_puymek` (petlamb) · มังกรไฟจิ๋ว `pet_firedragon` (petdragon)
- ได้สัตว์เลี้ยงจากไข่ → เข้าห้องเองถ้ายังมีที่ · ไม่ขายในร้าน (แท็บสัตว์เลี้ยงโชว์เงาดำ + ป้าย "ไข่หายาก")
- ของในระดับนั้นครบแล้ว: normal = ดาวม่วง 15 (+ลุ้นคูปอง) · rare = ดาวม่วง 30 + คูปองลด 50% เสมอ
- หน้าตา: ไข่ rare = ม่วงลายดาวทอง + ประกาย (`eggSVG(stage, glow, tier)`) · ป้าย "RARE" ในหน้าไข่/ป๊อปอัปเจอไข่ · รูปเล็กสัตว์เลี้ยง `petThumb` (เฟรมแรกของชีต `thumb`)
- ท่าที่ยังขาด (ถ้า KC เจนเพิ่ม): ก๊อตซีโร่/ปุยเมฆ/มังกร ยังไม่มีนอนหงาย · นั่งเล่นบอล · โหม่งบอล
- เจอไข่ → แจ้งเตือนบนมือถือไปที่เด็กคนที่เจอ (push event `egg_found` ใน push.js · "🥚 เจอไข่ปริศนา!" / "✨ เจอไข่หายาก!")
- กอดไข่มีเอฟเฟค (`eggHugFx`): เสียงปุ๊ก · ไข่ยุบ-เด้ง · หัวใจพุ่งรอบไข่ · "+1" · แถบอุ่นเด้ง
- ทดสอบ: `egg.test.js` (rare/การันตี/ครบแล้ว) · `ui-egg-rare.test.js`

### 8.13 เอฟเฟครับดาวม่วง (migration 0018)
- กด "รับ" ภารกิจประจำวัน → ดาวม่วงลอยเข้าตัวเลข `.dq-wallet` · นับขึ้นทีละดวง + เสียงติ๊ง + สั่น · ตัวละครเจ้าของภารกิจกระโดด (`ppCheer`) · แถบบนบอกที่มา + การ์ดเป้าหมาย (`ppBanner`)
- เป้าหมาย = "อยากได้" ได้คนละ 1 ชิ้น (`wishItem` กดชิ้นใหม่แทนชิ้นเดิม · กดซ้ำ = ยกเลิก) · ผู้ปกครองกดได้ = "เป้าหมายของบ้าน" (ไม่แจ้งเตือน) · `daily.goal` (`purpleGoal_`): ลูก = ของตัวเอง → ของบ้าน → `{none}` · ผู้ปกครอง = ของบ้าน + `kidGoals` ของลูกแต่ละคน
- หลอดเป้าหมาย (`ppGoalBar`) ที่หัวภารกิจประจำวันและหัวร้านค้า · แตะ = ไปร้าน · ผู้ปกครองซื้อของที่ลูกอยากได้ → `Members.goal_got` → ลูกเห็นป๊อปอัป "พ่อซื้อ X ให้แล้ว!" ครั้งเดียว (`purpleSeen(id, '', true)` ล้าง)
- ข่าว `daily.news` (`purpleNews_`): ภารกิจที่คนอื่นรับให้/ระบบเก็บให้ ตั้งแต่ `Members.purple_seen` · เด็กเห็นเฉพาะภารกิจตัวเอง · ป๊อปอัปครั้งเดียว (`maybePurpleNews`) แล้วเรียก `purpleSeen`
- ผู้ปกครองกดรับแทนลูกได้ (ลูกมักปิดแอปหลังส่งงาน) · ทดสอบ `purple.test.js` + `ui-purple.test.js`

### 8.14 ป๊อปอัป "มีอะไรใหม่" (migration 0019)
- ผู้ปกครองเท่านั้น · ขึ้นครั้งเดียวต่อรุ่น (`Members.news_seen`, API `newsSeen`) · มีปุ่มเดียว "ปิด" · รอป๊อปอัปอื่นปิดก่อน
- ข้อความอยู่ใน `WHATS_NEW` (public/index.html) · เพิ่มรุ่นใหม่ไว้บนสุด v+1 · ไม่เกิน 3 ข้อ ข้อละบรรทัด (บอกประโยชน์)
- คนที่ไม่ได้เข้าแอปหลายรุ่น → รวมทุกรุ่นที่ยังไม่เห็นในป๊อปอัปเดียว (ใหม่สุดบน มีหัววันที่ · ไม่เกิน 6 ข้อ)
- **ก่อน deploy ฟีเจอร์ใหม่ ให้ถาม KC ว่าจะแจ้งไหม พร้อมร่างข้อความให้ดู** · แก้บั๊ก/ปรับเล็ก ๆ ไม่ต้องแจ้ง
- เทสต์: fixture ตั้ง `news_seen = 9999` กันป๊อปอัปบังเทสต์อื่น · `ui-news.test.js` ล้างเอง

### 8.10 คูปองลดราคาจากไข่ (migration 0015)
- ฟักไข่ → ได้ของปกติ + สุ่มคูปองแถม (`COUPON_DROPS`: 10% 8% · 25% 5% · 50% 2%) · `Eggs.prize` ต่อท้าย `+c<pct>` · ตาราง `Coupons` (ของทั้งครอบครัว ไม่หมดอายุ)
- `buyItem(memberId, itemId, assignTo, couponId)` ผู้ปกครองเลือกคูปองตอนซื้อ (ระบบเลือกใบมากสุดให้ก่อน) · ไม่ซ้อนกับส่วนลดชิ้นแรก · ดาวไม่พอ → ไม่เสียคูปอง
- ราคาหลังลดทุกแบบปัดเศษลง ต่ำสุด 1 (`discPrice_`) · ของฟรีคงเป็น 0
- ป้ายส่วนลดชิ้นแรก: "ซื้อชิ้นแรกของครอบครัว ลด 50% · เลือกได้ทุกอย่างในร้าน" (ของที่ได้จากไข่นับเป็นชิ้นแรกด้วย)

### 8.15 สรุปประจำสัปดาห์ (ไม่มี migration)
- API `getWeeklySummary(memberId, endKey)` (ผู้ปกครอง) 7 วันจบที่ endKey เทียบ 7 วันก่อน · ต่อลูก: ภารกิจ/ดาว (approved ตาม `reviewed_at`), รายวัน, ทำบ่อยสุด 3, ยังไม่ได้ทำ 3 (ภารกิจ active ที่ไม่ได้ทำเลย), ภารกิจด่วนทันเวลา · store โหลด Submissions ย้อนหลังแบบเดียวกับ `getDailySummary`
- เด้งเองครั้งเดียวต่อสัปดาห์ ช่วงอาทิตย์ 17:00 – อังคาร (สรุป จ–อา ล่าสุด) จำในเครื่อง `sb_week_seen` · ดูได้ในตั้งค่า "🗓️ สรุปสัปดาห์" (= 7 วันล่าสุดถึงวันนี้)
- KC ไม่เอาปุ่มปรับดาว/โบนัสในหน้านี้ (ใช้ยาก) · แค่บอกภารกิจที่ยังไม่ได้ทำ + ข้อความชวนชม · เทสต์ `ui-weekly.test.js`

## 9. การทดสอบ

ชุดทดสอบอยู่ใน `test/` (ใช้ข้อมูลครอบครัวปลอมเท่านั้น) รายละเอียดใน `test/README.md`

```bash
cd test && npm install
node run.js --quick   # ~30 วิ
node run.js           # ทั้งหมด ~2 นาที
```

**ต้องรันให้ผ่านก่อน push ทุกครั้ง** โดยเฉพาะ `page.test.js` ที่จับ syntax error ใน `index.html` (เคยพังเพราะ quote ใน string ที่สร้าง HTML ไม่ได้ escape)

เวลาเพิ่มฟีเจอร์ใหม่ ให้เพิ่มไฟล์ `test/<ชื่อ>.test.js` ตามแบบ `urgent.test.js` แล้วใส่ชื่อใน `test/run.js`
นอกจากผลทดสอบ ให้เปรียบเทียบยอดดาวของครอบครัวจริงบน production ก่อน/หลัง deploy ด้วย

---

## 10. Deploy และตรวจสอบ production

- **หน้าเก่าโหลดใหม่เองหลัง deploy:** ตอน WebSocket ต่อสำเร็จ (deploy ทำให้หลุดแล้วต่อใหม่) หน้าเว็บเช็ก `/version` ถ้า id ไม่ตรงกับ `<meta app-version data-id>` → รอจนไม่มีหน้าต่าง/ป๊อปอัปเปิด ไม่ได้พิมพ์ และแอปเปิดอยู่ แล้ว `location.reload()` (`Live` → `checkNewVersion`/`maybeReload` · เทสต์ `ui-reload.test.js`) · **ถ้าเปลี่ยน/ลบ API ที่หน้าเก่าเรียก ยังต้องระวังช่วงก่อนหน้าเก่าโหลดใหม่**

- push `main` → Workers Builds build และ deploy (ประมาณ 1 นาที)
- เช็กเวอร์ชันที่ live: `GET /version`
- หน้าเว็บแจ้งเตือนผู้ใช้เมื่อมีเวอร์ชันใหม่ (เทียบ meta version)
- Cloudflare MCP ที่เคยใช้: `d1_database_query`, `workers_get_worker_code` (MCP ตัวเก่า deprecated แล้ว แนะนำ https://mcp.cloudflare.com/mcp)
- git push ใช้ GitHub ผ่าน proxy ของ session (`add_repo` แบบ push)

### 10.1 เช็กว่ามีคนใช้แอปอยู่ไหม ก่อน deploy (ทำทุกครั้งก่อนถาม KC ว่า "ขึ้นเลยไหม")
deploy ทำให้ทุกหน้าจอหลุดแล้วต่อใหม่เอง (~1–3 วิ) แต่ถ้ามีคนกำลังทำอะไรอยู่ เช่น ผู้ปกครองกำลังอนุมัติ หรือเด็กกำลังหมุนวงล้อ อาจสะดุดได้ → เลี่ยงช่วงที่มีคนออนไลน์

ตาราง `Presence` (migration 0016) — FamilyHub เขียนแถวตอนหน้าจอต่อ WebSocket และใส่ `ended_at` ตอนตัด (ไม่มี polling) · เวลาเป็น ms UTC · เก็บ 30 วัน

รันผ่าน Cloudflare MCP `d1_database_query` (database_id ดูหัวข้อ D1 ด้านบน):

```sql
-- 1) ตอนนี้ออนไลน์กี่คน (นับเฉพาะที่ต่อมาไม่เกิน 12 ชม. กันแถวค้าง)
SELECT COUNT(DISTINCT member_id) AS people, COUNT(DISTINCT family_id) AS families, COUNT(*) AS screens,
       SUM(role = 'parent') AS parent_screens, SUM(role = 'child') AS child_screens
FROM Presence
WHERE ended_at IS NULL AND started_at > (CAST(strftime('%s','now') AS INTEGER) - 43200) * 1000;

-- 2) มีใครเพิ่งใช้ใน 10 นาทีที่ผ่านมาไหม (เปิดอยู่ หรือเพิ่งปิด)
SELECT COUNT(DISTINCT member_id) AS people
FROM Presence
WHERE ended_at IS NULL OR ended_at > (CAST(strftime('%s','now') AS INTEGER) - 600) * 1000;

-- 3) ช่วงเวลาที่ใช้กันเยอะ (เวลาไทย) 30 วันล่าสุด → เลือกช่วง deploy ที่เงียบ
SELECT CAST(strftime('%H', started_at / 1000 + 7 * 3600, 'unixepoch') AS INTEGER) AS hour_th, COUNT(*) AS opens
FROM Presence GROUP BY hour_th ORDER BY hour_th;
```

วิธีตัดสิน (รายงานผลให้ KC ทุกครั้ง เช่น "ตอนนี้ออนไลน์ 2 คน · 1 ครอบครัว"):
- ข้อ 1 = 0 และข้อ 2 = 0 → deploy ได้เลย
- ข้อ 1 = 0 แต่ข้อ 2 > 0 → มีคนเพิ่งใช้ อาจกลับมา · deploy ได้ แต่แจ้ง KC
- ข้อ 1 > 0 → แจ้ง KC ว่ามีคนใช้อยู่ แนะนำให้รอ หรือดูข้อ 3 แล้วเสนอเวลาที่เงียบ · KC ตัดสินเอง
- ข้อควรรู้: "ออนไลน์" = หน้าจอยังต่ออยู่ รวมถึงแอปที่เปิดค้างไว้เบื้องหลัง (มือถืออาจตัดเองภายหลัง) · ถ้าหลุดแบบไม่ได้ปิดปกติ (เน็ตหลุด/แบตหมด) แถวจะค้างจนกว่าคนในครอบครัวนั้นจะเปิดใหม่ หรือพ้น 12 ชม.
- ห้ามคัดลอกผลที่มี member_id/family_id จริงลง repo (repo เป็น public)

---

## 10.2 กู้คืนข้อมูล (D1 Time Travel) และแผนสำรองข้อมูล

**กู้คืนได้ทันที (มีอยู่แล้ว ไม่ต้องตั้งค่า):** D1 Time Travel ย้อนฐานข้อมูลไป ณ นาทีไหนก็ได้ภายใน 7 วันล่าสุด (แผนฟรี · แผนเสียเงิน 30 วัน)
```bash
npx wrangler d1 time-travel info starbank-db                       # ดู bookmark ปัจจุบัน (จดไว้ก่อนกู้ เผื่อย้อนกลับ)
npx wrangler d1 time-travel info starbank-db --timestamp=2026-11-13T21:00:00+07:00   # หา bookmark ของเวลาที่ต้องการ
npx wrangler d1 time-travel restore starbank-db --timestamp=2026-11-13T21:00:00+07:00
```
- กู้ = **ทับทั้งฐานข้อมูล** ข้อมูลหลังเวลานั้นหายหมด (กดอนุมัติ/ดาว/ของที่ซื้อ) → เช็กคนออนไลน์ (10.1) แจ้งครอบครัวก่อน และจด bookmark ปัจจุบันไว้ เผื่อต้องกู้กลับ
- ชื่อฐานข้อมูล `starbank-db` (`wrangler.jsonc`) · ต้องใช้ API token ของ KC (ห้ามขอ token ในแชต)
- กู้เฉพาะบางตารางไม่ได้ (ย้อนทั้งก้อน) → ก่อนกู้ให้ `npx wrangler d1 export starbank-db --remote --output=before-restore.sql` เก็บไว้ แล้วค่อยเอาข้อมูลที่ต้องการกลับมาใส่เอง

**ข้อจำกัด:** เกิน 7 วัน หรือฐานข้อมูลถูกลบทั้งก้อน → กู้ไม่ได้
**แผนสำรองชั้นที่ 2 (KC ให้เลื่อนไว้ · เมื่อ KC ถามเรื่องสำรองข้อมูล ให้หยิบแผนนี้มาคุย):** Cron Trigger ของ Worker ตี 3 ทุกวัน → export ทุกตารางเป็น JSON ไป R2 (`backups/YYYY-MM-DD.json`) เก็บ 30 วันแล้วลบเอง + สคริปต์กู้คืนจากไฟล์ · ฟรี · ไม่ผิดกฎ polling (รันฝั่งเซิร์ฟเวอร์)

## 11. โควตาและความจุ (แผนฟรี)

- Workers ฟรี: 100k request/วัน; ครอบครัวจริงใช้ราว 650 request/วัน (วันที่ทดสอบหนัก) → รองรับประมาณ 150 ครอบครัว (KC เคยคิดจะจำกัดที่ 125)
- แผน $5/เดือน: ประมาณ 500–1,000 ครอบครัว
- D1 ฟรี: อ่าน 5M แถว/วัน, เขียน 100k แถว/วัน, 500 MB
- จุดที่ลด request ได้ (ยังไม่ได้ทำ): ไม่ reload ถ้าข้อมูลไม่เปลี่ยน, ย้าย version meta ออกจาก HTML, รวม `me` + `load` เป็นคำสั่งเดียว

---

## 12. งานค้าง / เรื่องที่ยังไม่ตัดสินใจ

| เรื่อง | สถานะ |
|---|---|
| ทดสอบ LINE webhook `/line` (ให้ KC พิมพ์ "เว็บ" ใน OA แล้วดูผล) และแจ้งเตือนผ่าน LINE สำหรับภารกิจด่วน | ยังไม่ได้ทดสอบ |
| ลบโค้ด GAS ที่ไม่ใช้ (`NO_LOCK`, `copyChildLink`, `web_token`) และเปลี่ยนการสมัครผ่าน LINE chat เป็นลิงก์ | เสนอแล้ว รออนุมัติ |
| ลด request (หัวข้อ 11) | เสนอแล้ว เลื่อนไปก่อน |
| จำกัดจำนวนครอบครัว + ตัวนับการใช้งาน + แจ้งเตือนเมื่อใกล้เต็ม | เสนอแล้ว ยังไม่ทำ |
| เปลี่ยนชื่อแอป (ชื่อ "ธนาคารดาว" ซ้ำกับแอปอื่น เคยเสนอ "ออมดาว" และชื่ออื่น ๆ) | ยังไม่ตัดสินใจ |
| ซื้อโดเมน (เช่น .com หรือ .in.th) แล้วทำ redirect จาก workers.dev | ยังไม่ตัดสินใจ |
| ปรับ repo เป็น private | KC: ตอนนี้ใช้แค่ครอบครัวเดียว ยังไม่ทำ · **⚠️ Claude: เมื่อ KC จะเปิดให้ครอบครัวอื่นใช้ ต้องเตือนให้ทำ repo เป็น private ก่อน (และเช็ก deploy อัตโนมัติยังทำงาน)** |
| ของขวัญ: ให้ดาวเข้ายอดอัตโนมัติหลัง N วันหรือไม่ | ยังไม่ได้ถามซ้ำ |
| ฉากโต้ตอบตัวละคร | แอปโหลด `family` + `bearfamily` (5 บท) + `petroom` (ลูก↔สัตว์เลี้ยง, มังกรพ่นไฟ) ใช้ท่าที่มีอยู่ · ฉากที่ดีกว่านี้ต้องมีชีตใหม่: พ่อหมียื่นของขวัญ, แม่หมียื่นคุกกี้, ลูกหมีรับของ, ลูกลูบหัวสัตว์, สัตว์ดีใจ (ยังไม่ได้ภาพ) · ท่าเดินลูกยังไม่มีแว่น |
| ทำแอปลง App Store / Play Store | คุยแนวคิดแล้ว ยังไม่ทำ |

---

## 13a. ตัวละครเคลื่อนไหว (sprites/)

รายละเอียดเต็มใน `sprites/README.md` · prompt สำหรับเจนภาพใน `sprites/PROMPTS.md`
- ขั้นตอน: เจนภาพชีตท่าทางจาก AI → `python3 sprites/cut.py <ภาพ> --char <id> --sheet <ท่า> --frames N` → แก้ `anims`/`life` ใน `character.json` → `python3 sprites/build.py <id>` ได้ `preview.html` ไฟล์เดียวส่งให้ KC ดู
- `cut.py` ปรับทุกเฟรมให้หัวกว้าง 150px เท่ากัน, กึ่งกลางหัวอยู่กลางช่อง, เท้าแตะขอบล่าง, วาดขอบขาวใหม่ → ท่าจากชีตต่างกันต่อกันได้โดยตัวไม่เปลี่ยนขนาด
- `sprite-actor.js` = ตัวเล่นบนเว็บ (`create`, `play`, `loop`, `walkTo`, `life`, `say`) ใช้ rAF/setTimeout ตอนเล่นเท่านั้น และหยุดนิ่งเมื่อเครื่องตั้ง "ลดการเคลื่อนไหว"
- โฟลเดอร์นี้ไม่ถูก deploy จะใช้ในแอปต้องคัดลอกไฟล์ที่ใช้ไป `public/sprites/<id>/` (ทำ mock ให้ KC ดูก่อนตามกติกา)
- ภาพจาก AI ที่ตัดง่าย: ตัวละครห่างกัน, พื้นสีเรียบ, ไม่มีเงา, ขอบขาวแบบสติกเกอร์ (ใส่ไว้ใน PROMPTS.md แล้ว)
- `scene.js` + `scenes/*.json` = หลายตัวละครในฉากเดียว บทโต้ตอบเมื่ออยู่ใกล้กัน และแตะตัวละคร (`build.py --scene family`)
- เทสต์: `test/sprites.test.js` ตรวจเลขเฟรม/ท่าในทุก manifest และทุกบท แล้วเปิด preview ทุกตัวละคร + สั่งทุกบทในฉาก

## 13. ธีมและสไตล์ภาพ

- ฟอนต์ `Mali` (Google Fonts) สำหรับหัวข้อ
- สี: พื้นมิ้นต์ `#EEF8F4`, เขียวเข้ม (ตัวอักษร) `#1F3B35`, เขียว `#2A9479`, ส้มโค้ราล `#FF5A36` ถึง `#FF8A45`, เหลืองดาว `#FFC24B`, แก้มชมพู `#FF8E8E`
- ภาพการ์ตูนเป็น flat vector ขอบขาวหนาแบบสติกเกอร์ ตาวงรีดำมีจุดประกายขาว
- มาสคอต "น้องดาว" = ดาวห้าแฉกสีเหลืองมีหน้า
- รูปมาสคอตใช้ `.webp` กว้าง 360px พื้นโปร่งใส

---

## 14. Checklist สำหรับฟีเจอร์ใหม่

1. ถาม KC ให้ชัด และวิเคราะห์ผลกระทบต่อครอบครัวจริง
2. ทำ mock หน้าจอ (HTML → PNG ด้วย Playwright) ให้ KC ดู
3. เขียน migration (ถ้ามี) และอัปเดต `TABLES` ใน store.js
4. เพิ่มฟังก์ชันใน core.js + `PUBLIC_API` + `MEMBER_ARG`
5. ถ้าต้องแจ้งเตือน ให้เพิ่มประเภทเหตุการณ์ใน `notifyApp` (push.js)
6. ทำ UI ใน index.html (ระวังการ escape quote ใน string ที่สร้าง HTML)
7. เขียนเทสต์ใน `test/` แล้วรัน `node run.js` ให้ผ่าน
8. Apply migration บน production → push → ตรวจ `/version` → ตรวจยอดดาวครอบครัวจริงว่าไม่เปลี่ยน
9. อัปเดตไฟล์นี้ (HANDOFF.md) · ตัดภาพ: ชีตมีกรอบ/ตัวหนังสือ → `sprites/clean_sheet.py` · ตัวชิดกัน → `sprites/seg_touching.py` · ท่าเดินมุมข้างตัวใหญ่เกิน → `cut.py --zoom 0.8`
