# พื้นที่ตัวละครเดิน (แถบล่างจอ)

- `floors/<art>.webp` พื้น (tile ต่อกันแนวนอน สูง 64px) · `decor/<art>.webp` ของตกแต่ง (พื้นโปร่งใส ~128px)
- ของในร้านประกาศใน `SHOP_ITEMS` (src/core.js): `kind: 'floor' | 'decor'`, `art`, `price` (พื้น 20 ดาวม่วง) · `free: true` = ทุกครอบครัวมี
- ครอบครัวเลือกใช้ใน `Families.stage` = `{"floor": id, "slots": [5 ช่อง]}` ผ่าน `setFloor` / `placeDecor`

## เพิ่มพื้นใหม่ — KC ส่ง
1. ภาพแถบพื้น 16:9 ใช้ prompt พื้นไม้ (sprites/stage-src/README) เปลี่ยนวัสดุ · ชื่อไทย
2. Claude: `cd sprites/stage-src && python3 floor.py <ภาพ> <art> <y_บน> <y_ล่าง>` → เพิ่มแถวใน `SHOP_ITEMS`

## เพิ่มของตกแต่ง — KC ส่ง
1. ภาพของ 1 ชิ้นต่อรูป พื้นสีเรียบ `#EEF8F4` สไตล์เดียวกับตัวละคร · ชื่อไทย · ราคา
2. Claude: ตัดพื้นหลัง → `decor/<art>.webp` → เพิ่มแถว `kind: 'decor'` ใน `SHOP_ITEMS`
3. ยังต้องทำตอนมีของชิ้นแรก: ให้ตัวละครไม่หยุดยืนทับจุดที่มีของ (scene.js)
