# ตัดแถบพื้นจากภาพที่เจน → tile ต่อกันแนวนอนไม่เห็นรอย (public/stage/floors/<id>.webp)
# ใช้: python3 floor.py <ภาพ> <id> <y_บน> <y_ล่าง> [floors|walls] [สูง px]   (หาค่า y จากขอบบน / ล่างของแถบ)
import sys, numpy as np
from PIL import Image
src, fid, y0, y1 = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
kind = sys.argv[5] if len(sys.argv) > 5 else 'floors'; H = int(sys.argv[6]) if len(sys.argv) > 6 else 64
# ถ้ามีลายซ้ำ (เช่นหน้าต่าง) ใส่ x เริ่ม + ความกว้างรอบลาย ให้ระยะห่างเท่ากันตรงรอยต่อ
x0 = int(sys.argv[7]) if len(sys.argv) > 7 else 0; period = int(sys.argv[8]) if len(sys.argv) > 8 else 0
W0 = Image.open(src).width
o = 96 if not period else min(96, W0 - x0 - period)
im = Image.open(src).convert('RGB').crop((x0, y0, (x0 + period + o) if period else W0, y1))
a = np.asarray(im).astype(float); w = a.shape[1]            # ผสมขอบซ้าย-ขวา o px ให้ต่อกันเนียน
t = np.linspace(0, 1, o)[None, :, None]
a[:, :o] = a[:, :o] * t + a[:, w - o:] * (1 - t)
tile = Image.fromarray(a[:, :w - o].clip(0, 255).astype('uint8'))
tile = tile.resize((round(tile.width * H / tile.height), H), Image.LANCZOS)   # พื้นสูง 64 / ผนังสูง 160 (แสดงครึ่งหนึ่งบนจอ 2x)
import os; os.makedirs(f'../../public/stage/{kind}', exist_ok=True)
tile.save(f'../../public/stage/{kind}/{fid}.webp', 'WEBP', quality=90)
print(fid, tile.size)
