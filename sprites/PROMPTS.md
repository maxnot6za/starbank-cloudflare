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
