# sprites/ — ระบบตัวละครเคลื่อนไหว

ทำตัวละครใหม่ได้โดยไม่ต้องเขียนโค้ด: เจนภาพ → `cut.py` → แก้ `character.json` → `build.py` ดูตัวอย่าง
โฟลเดอร์นี้ **ไม่ถูก deploy** (Worker เสิร์ฟเฉพาะ `public/`) จนกว่าจะคัดลอกไฟล์ที่ใช้จริงไปไว้ใน `public/`

```
sprites/
  cut.py              ตัดภาพชีตจาก AI → แถบเฟรมมาตรฐาน + ลงทะเบียนใน character.json
  build.py            สร้าง preview.html (ไฟล์เดียว ฝังรูป) ไว้ส่งให้คนอื่นเปิดดู
  sprite-actor.js     ตัวเล่นอนิเมชันบนเว็บ (ไม่มี dependency) — ไฟล์เดียวกันนี้ใช้ในแอปจริง
  PROMPTS.md          prompt สำหรับเจนท่าทางให้ตัดอัตโนมัติได้
  characters/<id>/
    src/*.webp        ภาพต้นฉบับจาก AI (เก็บไว้ ตัดใหม่ได้เสมอ)
    <sheet>.webp      แถบเฟรมที่ตัดแล้ว (cut.py สร้าง)
    character.json    ข้อมูลตัวละคร: ชีต ท่า และพฤติกรรม
```

ต้องใช้: `pip install pillow numpy scipy scikit-image` (ใน container ของ Claude มีครบแล้ว) และ Playwright ถ้าจะถ่ายภาพตรวจ

## ขั้นตอนเพิ่มท่า / ตัวละครใหม่

1. เจนภาพตาม `PROMPTS.md` (ตัวละครแยกห่างกัน พื้นสีเรียบ ไม่มีเงา)
2. เก็บต้นฉบับ: `sprites/characters/<id>/src/<sheet>.webp`
3. ตัด:
   ```bash
   python3 sprites/cut.py sprites/characters/<id>/src/<sheet>.webp --char <id> --sheet <sheet> --frames N --facing right
   ```
   - เปิด `<sheet>.check.png` ดูผล (พื้นมืด จะเห็นเศษพื้นหลังชัด)
   - ตัวเลือก: `--order 1,2,4` เลือก/เรียงเฟรม · `--flip 7,9` พลิกเฟรมที่หันผิดทาง · `--slim 1` บีบเฟรมที่อ้วนกว่าเพื่อน
   - `--method split` เมื่อตัวละครยืนชิด/ซ้อนกัน · `--method color` เมื่อเส้นขาวขอบขาด
   - `--facing` = ตัวละครในชีตหันไปทางไหน (ดูทิศหน้า ไม่ใช่หาง) runtime จะพลิกให้เองตามทิศที่เดิน
4. เพิ่มท่าใน `character.json` → `anims` (ดูหัวข้อถัดไป) และใส่ใน `life` ถ้าอยากให้ทำเอง
5. ดูตัวอย่าง: `python3 sprites/build.py <id>` แล้วเปิด `sprites/characters/<id>/preview.html`

## character.json

```jsonc
{
  "id": "dino", "name": "น้องไดโน",
  "headWidth": 150,               // มาตรฐานจาก cut.py — ห้ามแก้
  "idle": "stand",                // ท่าที่แสดงตอนเริ่ม
  "walk": "walk",                 // ท่าที่ใช้ตอนเดิน
  "sheets": {                     // cut.py เขียนให้เอง
    "walk": { "file": "walk.webp", "frames": 6, "cell": [212, 291], "facing": "right" }
  },
  "anims": {
    // แบบ 1: เฟรม + เวลา (ms เดียวทุกเฟรม หรือ array รายเฟรม)
    "sitDown": { "label": "นั่งลง", "sheet": "sit", "frames": [0,1,2,3,4,5], "ms": [600,160,160,220,160,300] },
    // แบบ 2: steps = [เฟรม, ms, "คำพูดในกล่อง"(ไม่บังคับ)] · loop = วนได้
    "writeThink": { "sheet": "write", "loop": true, "steps": [[0,220],[3,350,"ยกดินสอ"],[4,1100,"อืม..."]] },
    // ท่าเดิน: speed = กี่ "ความกว้างหัว" ต่อวินาที · bob = เด้งขึ้นลงต่อเฟรม
    "walk": { "sheet": "walk", "frames": [0,1,2,3,4,5], "ms": 130, "loop": true, "speed": 1.05, "bob": [0,-1,-1.5,0,-1,-1.5] }
  },
  "life": [                        // พฤติกรรมวนเอง (actor.life())
    { "walk": "random" },
    { "chance": 0.3, "do": [ { "play": "stand" }, { "walk": "random" } ] },
    { "play": "sitDown" },
    { "pick": ["writeThink", "writeFace"], "for": [4000, 7000] },
    { "wait": [500, 1500] },
    { "play": "standUp" }
  ],
  "notes": "ข้อสังเกตที่ยังค้าง (แสดงเป็นแถบเตือนในหน้าตัวอย่าง)"
}
```

กติกาต่อท่าให้เนียน: เฟรมสุดท้ายของท่าหนึ่งควรเหมือนเฟรมแรกของท่าถัดไป (เช่น `sitDown` จบที่ท่านั่งถือสมุด = เฟรมแรกของ `writeThink`)

## ใช้ในหน้าเว็บ

```html
<div id="pet" style="position:relative;height:160px"></div>
<script src="/sprites/sprite-actor.js"></script>
<script>
  SpriteActor.load('/sprites/dino/character.json').then(m => {
    const a = SpriteActor.create(document.getElementById('pet'), m, { size: 56, basePath: '/sprites/dino/', ground: 16 });
    a.life();                        // หรือ a.play('cheer'), a.loop('writeThink'), a.walkTo(120), a.say('เก่งมาก!')
  });
</script>
```
- `size` = ความกว้างหัวบนจอ (px) ทุกท่าจะใหญ่เท่ากันอัตโนมัติ
- ผู้ใช้ที่ตั้ง "ลดการเคลื่อนไหว" ในเครื่อง → ตัวละครหยุดนิ่ง ไม่เดิน
- ก่อนใส่ในแอปจริง: คัดลอก `sprite-actor.js`, `character.json`, `*.webp` ของตัวที่ใช้ไปไว้ใน `public/sprites/<id>/` (เฉพาะไฟล์ที่ใช้ ไม่เอา src/)
