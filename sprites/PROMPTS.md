# Prompt สำหรับเจนภาพท่าทาง (Google Flow / Gemini / AI วาดภาพอื่น ๆ)

ทุกครั้งที่เจน ให้ใส่ **ภาพอ้างอิงของตัวละคร** (ท่าที่ชอบที่สุด 1–2 รูป) เป็น Ingredient/Reference เสมอ
แล้วต่อ prompt = **[ส่วนท่าทาง]** + **[ส่วนกติกาชีต]** + **[ส่วนสไตล์]**

## ส่วนกติกาชีต (ใช้ทุกครั้ง — ทำให้ cut.py ตัดได้อัตโนมัติ)
```
Layout: N frames in ONE horizontal row, evenly spaced with a WIDE empty gap between frames
(characters must NOT touch or overlap). Identical character size, same ground line, same camera in every frame.
Keep the costume, accessories and proportions identical to the reference in every frame.
Background: plain flat solid mint #EEF8F4. No shadows under the characters, no scenery,
no text, no frame numbers, no watermark.
```

## ส่วนสไตล์ (ธีมแอป)
```
Style: flat vector kids' app sticker, soft rounded shapes, thick clean white outline around each
character, dark-teal line art #1F3B35, big oval eyes with a white highlight, pink blush #FF8E8E.
Palette: mint green #2A9479 / #E2F5EE, coral orange #FF5A36 / #FF8A45, star yellow #FFC24B, white.
```

## Negative prompt (ถ้ามีช่อง)
```
overlapping characters, touching frames, different sizes, different outfit, missing accessories,
extra limbs, extra fingers, drop shadow, ground shadow, text, numbers, realistic, 3D, glossy
```

## ส่วนท่าทาง (ตัวอย่างที่ใช้แล้วได้ผล)

**เดิน (6 เฟรม)** — `--sheet walk`
```
Create a 6-frame side-view walk cycle of the same character, facing right.
Frames: contact, down, passing, contact (opposite leg), down, passing.
```

**นั่งลง (6 เฟรม)** — `--sheet sit` (ลุกขึ้น = เล่นย้อนกลับ ไม่ต้องเจน)
```
Frame 1: standing still, relaxed, small smile. Frame 2: knees bending, starting to sit.
Frame 3: half squatting, arms forward for balance. Frame 4: bottom touching the ground, legs forward.
Frame 5: settled sitting, picking up a small notepad. Frame 6: sitting holding the notepad and pencil, ready to write.
```

**นั่งเขียน (6–10 เฟรม)** — `--sheet write`
```
Smooth looping writing cycle, only small movements:
1 pencil on paper looking down · 2 pencil moves right · 3 further right · 4 pencil lifts, head tilts up ·
5 pencil tip at chin, thinking · 6 head back down, pencil returning to paper.
Keep body, legs, tail and notepad in the same place; only hand, pencil and head change.
```

**ดีใจ/กระโดด (6 เฟรม)** — `--sheet cheer`
```
Frame 1 standing · 2 crouch (anticipation) · 3 jump up with both arms raised, eyes closed happy ·
4 top of the jump, small yellow sparkles · 5 landing, knees bent · 6 standing with a big smile.
```

**ยืนเฉย ๆ / กะพริบตา (4 เฟรม)** — `--sheet idle`
```
Frame 1 standing relaxed · 2 same pose, chest slightly up (breathing in) · 3 same as 1 ·
4 same as 1 but eyes closed (blink). Body must stay in exactly the same place.
```

## ตัวละครใหม่
1. เจนภาพหลักของตัวละคร 1 รูป (ท่ายืน หันขวา 3/4) ให้ชอบก่อน — ใช้เป็นภาพอ้างอิงของทุกท่า
2. เจนท่า **เดิน** + **นั่งลง** ก่อน (ใช้ทำพฤติกรรมพื้นฐานได้ทันที) แล้วค่อยเพิ่มท่าอื่น
3. ถ้าตัวละครมีของติดตัว (แว่น หมวก กระเป๋า) ให้เขียนชื่อของนั้นใน prompt ทุกครั้ง ไม่งั้น AI ลืมบางท่า

## ตัวละครลูกใหม่ — ครบชุด (6 ภาพ)

ตัวละคร **ลูก** ต้องมีท่าฉลองธีมเพิ่ม เพราะป๊อปอัปครบ 5 วัน (ต้นคริสต์มาส ฯลฯ) ขึ้นที่เครื่องลูก
ตัวละคร **พ่อ/แม่** ใช้แค่ภาพที่ 0–4

| # | ภาพ | เฟรม | `--sheet` | ใช้ทำอะไร |
|---|---|---|---|---|
| 0 | ภาพอ้างอิง (ท่ายืน) | 1 | — | ใส่เป็น reference ทุกภาพต่อจากนี้ · ไม่ได้ใช้ในแอป |
| 1 | เดิน | 6 | `walk` | เดินในแถบล่าง · เฟรมแรก = ท่ายืน |
| 2 | กิจกรรม 1 (แบบยืนทำ) | 6 | ชื่อกิจกรรม | ทำเล่นตอนหยุดเดิน |
| 3 | กิจกรรม 2 (แบบยืนทำ) | 6 | ชื่อกิจกรรม | ทำเล่นตอนหยุดเดิน |
| 4 | ดีใจ / กระโดด | 6 | `cheer` | ทักทายตัวละครอื่น + กระโดดในป๊อปอัปฉลอง |
| 5 | ฉลองธีม (มือเปล่า) | 3 | `celebrate` | ป๊อปอัปครบ 5 วัน · โค้ดวาดของประจำธีม (บอล/ขัน ฯลฯ) ใส่ในมือเอง → ใช้ได้ทุกธีม |

กิจกรรมแบบนั่ง (เช่นนั่งเขียนของลูกไดโน) ต้องเจนท่า "นั่งลง" เพิ่มอีก 1 ภาพ → เลือกกิจกรรมแบบยืนจะเหลือ 6 ภาพพอดี

ทุกภาพ (ยกเว้น 0) = **[ส่วนท่าทาง ด้านล่าง]** + **ส่วนกติกาชีต** (เปลี่ยน N) + **ส่วนสไตล์** (ด้านบนของไฟล์นี้)
ของติดตัว (แว่น หมวก โบว์) ต้องเขียนในบรรทัด `Keep the costume, accessories…` ทุกภาพ

**0. ภาพอ้างอิง** (ใส่ภาพลูกไดโนเป็น reference ให้สัดส่วนเข้าชุด)
```
A single full-body character design of [อธิบายตัวละคร เช่น a cute 6-year-old girl wearing a pink bunny costume hoodie with long ears, round glasses, white sneakers],
standing relaxed, 3/4 view facing right, small happy smile.
Background: plain flat solid mint #EEF8F4. No shadow, no text, no watermark.
Match the art style and body proportions of the reference character.
```
+ ส่วนสไตล์

**1. เดิน (6)** — ใช้ "ส่วนท่าทาง > เดิน" ด้านบน

**2–3. กิจกรรมแบบยืน (6)** — เลือกได้ 2 อย่าง
```
Smooth looping [กิจกรรม] cycle of the same character, standing in place, facing right.
[เลือก 1 ชุด:]
· Bouncing a ball: 1 holding ball at chest · 2 ball dropping · 3 ball hits ground · 4 ball rising · 5 catching · 6 same as 1
· Dancing: 1 standing · 2 arms up left, hip right · 3 spin half turn · 4 arms up right, hip left · 5 small hop · 6 standing
· Reading a book: 1 holding open book · 2 eyes reading left · 3 eyes reading right · 4 turning the page · 5 smiling at the page · 6 same as 1
· Waving a flag: 1 holding small flag down · 2 raising · 3 waving left · 4 waving right · 5 waving left · 6 lowering
· Hula hoop: 1 hoop at waist · 2–5 hoop rotating around the waist, hips swaying · 6 same as 1
Feet stay on the same ground line; keep the body in the same place.
```

**4. ดีใจ (6)** — ใช้ "ส่วนท่าทาง > ดีใจ/กระโดด" ด้านบน

**5. ฉลองธีม (3) — มือเปล่า** (เฉพาะตัวละครลูก)
```
Create a 3-frame sheet of the same character, facing right, hands EMPTY (holding nothing).
Frame 1: standing, both hands together in front of the chest as if holding a small round object, excited smile.
Frame 2: on tiptoe, both arms stretched up and forward to the right as if hanging something up high, looking up.
Frame 3: standing, hands clasped at the chest, eyes wide and sparkling, amazed happy face.
```
+ ส่วนกติกาชีต (N = 3) + ส่วนสไตล์

**ตัดภาพ:** `python3 cut.py src/<ภาพ>.jpg <id> --sheet <ชื่อ>` ทีละภาพ → `python3 build.py` → `python3 publish.py`
(ท่าฉลองธีมยังต้องต่อโค้ดใน `treePopOpen` ให้ใช้ชีต `celebrate` ของตัวละครที่เด็กใช้อยู่ — ตอนนี้ฝังเฉพาะลูกไดโน)
