# ตัดของตกแต่งจากชีต 3x2 (พื้น #EEF8F4) → public/stage/decor/<ชื่อ>.webp (พื้นโปร่งใส สูง/กว้างไม่เกิน 256px)
# ใช้: python3 decor.py <ภาพ> ชื่อ1,ชื่อ2,...  (เรียงซ้าย→ขวา บน→ล่าง)
import sys, numpy as np
from PIL import Image
from scipy import ndimage
src, names = sys.argv[1], sys.argv[2].split(',')
a = np.asarray(Image.open(src).convert('RGB')).astype(int); bg = a[4, 4]
near = np.abs(a - bg).sum(2) < 34
lab, _ = ndimage.label(near)
edge = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
fg = ndimage.binary_fill_holes(~np.isin(lab, list(edge)))
objs = [s for s in ndimage.find_objects(ndimage.label(fg)[0]) if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 8000]
rowh = a.shape[0] // 2
objs.sort(key=lambda s: ((s[0].start + s[0].stop) // 2 // rowh, s[1].start))
if len(objs) != len(names): sys.exit(f'เจอ {len(objs)} ชิ้น แต่ใส่ชื่อ {len(names)} ชื่อ')
al = ndimage.gaussian_filter(fg.astype(float) * 255, 0.7).clip(0, 255)
rgba = np.dstack([a, al]).astype('uint8')
for n, s in zip(names, objs):
    im = Image.fromarray(rgba[s[0], s[1]], 'RGBA'); im.thumbnail((256, 256), Image.LANCZOS)
    im.save(f'../../public/stage/decor/{n}.webp', 'WEBP', quality=88, method=6); print(n, im.size)
