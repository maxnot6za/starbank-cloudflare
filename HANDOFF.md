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
- **ร้านค้า** (`SHOP_ITEMS` ใน core.js): พ่อ/แม่/ลูกไดโน ราคา 50 ดาวม่วง · ตัวแรกของครอบครัวลด 50% (`FIRST_DISCOUNT`)
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

- push `main` → Workers Builds build และ deploy (ประมาณ 1 นาที)
- เช็กเวอร์ชันที่ live: `GET /version`
- หน้าเว็บแจ้งเตือนผู้ใช้เมื่อมีเวอร์ชันใหม่ (เทียบ meta version)
- Cloudflare MCP ที่เคยใช้: `d1_database_query`, `workers_get_worker_code` (MCP ตัวเก่า deprecated แล้ว แนะนำ https://mcp.cloudflare.com/mcp)
- git push ใช้ GitHub ผ่าน proxy ของ session (`add_repo` แบบ push)

---

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
| ปรับ repo เป็น private | แนะนำแล้ว ยังไม่ทำ |
| ของขวัญ: ให้ดาวเข้ายอดอัตโนมัติหลัง N วันหรือไม่ | ยังไม่ได้ถามซ้ำ |
| ตัวละครเคลื่อนไหว (`dino` ลูก, `dad` พ่อ, `mom` แม่) | ระบบใน `sprites/` พร้อม: ตัด/เล่น/ฉากโต้ตอบ (`scenes/family.json` 4 บท, เดินสวนได้แต่ไม่หยุดทับ, เดินออกข้างจอได้แต่เหลือ ≥1 ตัว) **ยังไม่ได้ใส่ในแอป** รอ KC เลือกตำแหน่ง · ท่าเดินลูกยังไม่มีแว่น · มี prompt กล่องของขวัญอนิเมชันแล้ว ยังไม่ได้ภาพ |
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
9. อัปเดตไฟล์นี้ (HANDOFF.md)
