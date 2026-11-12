# ตัดแถบพื้นจากภาพที่เจน → tile ต่อกันแนวนอนไม่เห็นรอย (public/stage/floors/<id>.webp)
# ใช้: python3 floor.py <ภาพ> <id> <y_บน> <y_ล่าง>   (หาค่า y จากขอบเส้นขาวบน / เส้นเข้มล่างของแถบ)
import sys, numpy as np
from PIL import Image
src, fid, y0, y1 = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert('RGB').crop((0, y0, Image.open(src).width, y1))
a = np.asarray(im).astype(float); w = a.shape[1]; o = 96            # ผสมขอบซ้าย-ขวา 96px ให้ต่อกันเนียน
t = np.linspace(0, 1, o)[None, :, None]
a[:, :o] = a[:, :o] * t + a[:, w - o:] * (1 - t)
tile = Image.fromarray(a[:, :w - o].clip(0, 255).astype('uint8'))
H = 64; tile = tile.resize((round(tile.width * H / tile.height), H), Image.LANCZOS)   # สูง 64px (แสดง 32px บนจอ 2x)
tile.save(f'../../public/stage/floors/{fid}.webp', 'WEBP', quality=90)
print(fid, tile.size)
