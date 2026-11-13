#!/usr/bin/env python3
"""ทำความสะอาดชีตจาก AI ก่อนส่งให้ cut.py

ปัญหาที่เจอบ่อย: ตัวหนังสือ "Frame 1 / 1. CONTACT", กรอบสี่เหลี่ยมรอบแต่ละเฟรม, เส้นพื้น,
เงาใต้ตัว, ตัวละครชิดกันจนตัดไม่ได้

วิธี: ตัวละครทุกตัวมี "ขอบขาวแบบสติกเกอร์" → หาขอบขาว → ถมด้านใน = รูปตัวละคร
→ ตัดเฉพาะส่วนนั้น (ตัวหนังสือ/กรอบ/เส้นพื้น/เงาที่อยู่นอกขอบขาวหายไปเอง)
→ เรียงใหม่บนพื้นสีเดียว เว้นช่องกว้าง → ส่งต่อ cut.py ได้เลย

ใช้: python3 clean_sheet.py <ภาพต้นฉบับ> <ภาพผลลัพธ์> --frames N [--order 1,2,...] [--min-area 0.01]
  --frames   จำนวนเฟรมที่ต้องการ (เลือกก้อนใหญ่สุด N ก้อน)
  --order    ลำดับเฟรมถ้าเรียงเองผิด (นับจาก 1 · ค่าเริ่มต้น = แถวบนซ้าย→ขวา แล้วแถวล่าง)
  --merge    ระยะ (px) ที่ถือว่าชิ้นเล็กใกล้ตัว (บอล ฟอง ประกาย) เป็นของเฟรมเดียวกัน · ค่าเริ่มต้น 40
"""
import argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

BG = (238, 248, 244)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--frames', type=int, required=True)
    ap.add_argument('--order', default='')
    ap.add_argument('--merge', type=int, default=40)
    ap.add_argument('--white', type=int, default=232, help='ความสว่างขั้นต่ำของขอบขาว')
    ap.add_argument('--inset', type=int, default=0, help='หดช่องเข้าไปกี่ px (ตัดกรอบ/เส้นแบ่งทิ้ง)')
    ap.add_argument('--top', type=int, default=0, help='ตัดส่วนบนของช่องทิ้งกี่ px (ตัวหนังสือหัวช่อง)')
    ap.add_argument('--bottom', type=int, default=0, help='ตัดส่วนล่างของช่องทิ้งกี่ px (ตัวหนังสือใต้ภาพ)')
    ap.add_argument('--grid', default='', help='แบ่งช่องตายตัว เช่น 6x1 หรือ 3x2 (ใช้เมื่อตัวชิดกัน/ไม่มีขอบขาว/มีกรอบ)')
    a = ap.parse_args()
    if a.grid: return grid_mode(a)

    im = Image.open(a.src).convert('RGB'); px = np.asarray(im).astype(int)
    if a.top or a.bottom:   # ลบแถบตัวหนังสือบน/ล่างทั้งภาพ
        bgc = px[3, 3].copy(); px[:a.top] = bgc
        if a.bottom: px[-a.bottom:] = bgc
        im = Image.fromarray(px.astype('uint8'))
    white = px.min(2) >= a.white
    # ขอบขาวต่อกันเป็นวง → ถมรูข้างใน = ตัวละคร (รวมของในมือที่อยู่ในขอบขาวเดียวกัน)
    body = ndi.binary_fill_holes(ndi.binary_closing(white, iterations=2))
    lab, n = ndi.label(body)
    sizes = ndi.sum(body, lab, range(1, n + 1))
    H, W = body.shape
    # ทิ้งก้อนที่เป็นพื้นหลังทั้งแผ่น (กรอบสีขาวใหญ่) และก้อนจิ๋ว
    cand = [(i + 1, s) for i, s in enumerate(sizes) if s < 0.5 * H * W and s > 0.002 * H * W]
    cand.sort(key=lambda t: -t[1])
    main_ids = [c[0] for c in cand[:a.frames]]
    if len(main_ids) < a.frames:
        raise SystemExit('เจอตัวละครแค่ %d ตัว (ต้องการ %d) — ขอบขาวอาจไม่ครบรอบ' % (len(main_ids), a.frames))
    boxes = {i: ndi.find_objects((lab == i).astype(int))[0] for i in main_ids}
    # ชิ้นเล็ก (บอล ฟอง ประกาย) ที่อยู่ใกล้ตัวไหน → รวมกับตัวนั้น
    masks = {i: lab == i for i in main_ids}
    for j, s in cand[a.frames:]:
        sl = ndi.find_objects((lab == j).astype(int))[0]
        cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
        best, bd = None, 1e9
        for i in main_ids:
            b = boxes[i]
            dx = max(b[1].start - cx, 0, cx - b[1].stop); dy = max(b[0].start - cy, 0, cy - b[0].stop)
            d = (dx * dx + dy * dy) ** .5
            if d < bd: best, bd = i, d
        if best is not None and bd <= a.merge: masks[best] |= lab == j
    # เรียง: แถวบน→ล่าง (ตามจุดกึ่งกลางแนวตั้ง แบ่งแถวเมื่อห่างกันเกินครึ่งความสูงตัว) แล้วซ้าย→ขวา
    info = []
    for i in main_ids:
        ys, xs = np.where(masks[i]); info.append((i, ys.min(), ys.max(), xs.min(), xs.max()))
    hmed = np.median([b[2] - b[1] for b in info])
    info.sort(key=lambda b: (b[1] + b[2]) / 2)
    rows, cur = [], [info[0]]
    for b in info[1:]:
        if abs((b[1] + b[2]) / 2 - (cur[-1][1] + cur[-1][2]) / 2) > hmed * 0.5: rows.append(cur); cur = [b]
        else: cur.append(b)
    rows.append(cur)
    ordered = [b for r in rows for b in sorted(r, key=lambda b: b[3])]
    if a.order:
        idx = [int(x) - 1 for x in a.order.split(',')]; ordered = [ordered[k] for k in idx]
    # วางเรียงใหม่ · ฐาน (เท้า) อยู่ระดับเดียวกัน
    gap = 80; hmax = max(b[2] - b[1] + 1 for b in ordered)
    out = Image.new('RGB', (sum(b[4] - b[3] + 1 for b in ordered) + gap * (len(ordered) + 1), hmax + 2 * gap), BG)
    x = gap
    for (i, y0, y1, x0, x1) in ordered:
        crop = im.crop((x0, y0, x1 + 1, y1 + 1))
        m = Image.fromarray((masks[i][y0:y1 + 1, x0:x1 + 1] * 255).astype('uint8'))
        out.paste(crop, (x, gap + hmax - (y1 - y0 + 1)), m)
        x += x1 - x0 + 1 + gap
    out.save(a.out, quality=95)
    print('ได้ %d เฟรม → %s' % (len(ordered), a.out))


def grid_mode(a):
    """แบ่งเป็นช่อง C x R → ในแต่ละช่อง: ถมพื้นหลังจากขอบช่อง (รวมเงา/สีพื้นไม่เท่ากัน) →
    เลือกก้อนที่ใหญ่สุด + ชิ้นเล็กใกล้ ๆ · ทิ้งก้อนที่แตะขอบช่อง (กรอบ/เส้นแบ่ง) และตัวหนังสือที่อยู่ไกล"""
    C, R = [int(v) for v in a.grid.lower().split('x')]
    im = Image.open(a.src).convert('RGB'); px = np.asarray(im).astype(int); H, W = px.shape[:2]
    ink = np.abs(px - px[3, 3]).sum(2) > 45
    # เส้นแบ่งช่อง: เลือกคอลัมน์/แถวที่หมึกน้อยสุดใกล้ตำแหน่งแบ่งเท่า ๆ กัน
    def cuts(n, size, prof):
        out = [0]
        for k in range(1, n):
            c = int(size * k / n); w = int(size / n * .3)
            out.append(c - w + int(np.argmin(prof[c - w:c + w])))
        return out + [size]
    xs = cuts(C, W, ink.sum(0)); ys = cuts(R, H, ink.sum(1))
    frames = []
    for r in range(R):
        for c in range(C):
            k = a.inset
            cell = px[ys[r] + k + a.top:ys[r + 1] - k - a.bottom, xs[c] + k:xs[c + 1] - k]
            h, w = cell.shape[:2]
            # พื้นหลังของช่อง = สีที่พบบ่อยตามขอบช่อง · ต่างไม่เกิน tol = พื้น (เงาจาง ๆ ก็นับเป็นพื้น)
            edge = np.concatenate([cell[0], cell[-1], cell[:, 0], cell[:, -1]])
            bgc = np.median(edge, axis=0)
            fg = np.abs(cell - bgc).sum(2) > 60
            # เงา/แถบพื้นสีเขียวมิ้นต์ ไม่ใช่ตัวละคร
            sm = cell.sum(2); fg &= ~(((cell[:, :, 1] - cell[:, :, 0]) > 22) & (sm > 430))
            # เส้นกรอบ/เส้นแบ่ง: แถวหรือคอลัมน์ที่มีหมึกยาวเกือบทั้งช่อง
            fg[:, fg.mean(0) > .9] = False; fg[fg.mean(1) > .9, :] = False
            fg = ndi.binary_closing(fg, iterations=2)
            lab, n = ndi.label(fg)
            if not n: continue
            sl = ndi.find_objects(lab)
            keep = []
            for i, b in enumerate(sl):
                # แตะขอบล่างได้ (เท้าชิดกรอบ) · แตะบน/ซ้าย/ขวา = กรอบหรือเส้นแบ่ง
                touch = b[0].start <= 1 or b[1].start <= 1 or b[1].stop >= w - 1
                area = (lab[b] == i + 1).sum()
                if not touch: keep.append((area, i + 1, b))
            if not keep: continue
            keep.sort(key=lambda t: -t[0])
            main = keep[0]; mb = main[2]; mask = lab == main[1]
            for area, i, b in keep[1:]:
                dx = max(mb[1].start - b[1].stop, 0, b[1].start - mb[1].stop); dy = max(mb[0].start - b[0].stop, 0, b[0].start - mb[0].stop)
                # ชิ้นเล็กข้าง ๆ/ด้านบน (บอล ประกาย) ได้ · ใต้เท้า (ตัวหนังสือ/เส้นพื้น) ไม่เอา
                if (dx * dx + dy * dy) ** .5 <= a.merge and b[0].start < mb[0].stop - 4: mask |= lab == i
            mask = ndi.binary_fill_holes(mask)
            yy, xx = np.where(mask)
            frames.append((cell[yy.min():yy.max() + 1, xx.min():xx.max() + 1], mask[yy.min():yy.max() + 1, xx.min():xx.max() + 1]))
    if len(frames) != a.frames: raise SystemExit('ได้ %d เฟรม (ต้องการ %d)' % (len(frames), a.frames))
    if a.order: frames = [frames[int(k) - 1] for k in a.order.split(',')]
    gap = 80; hmax = max(f[0].shape[0] for f in frames)
    out = Image.new('RGB', (sum(f[0].shape[1] for f in frames) + gap * (len(frames) + 1), hmax + 2 * gap), BG); x = gap
    for img, m in frames:
        out.paste(Image.fromarray(img.astype('uint8')), (x, gap + hmax - img.shape[0]), Image.fromarray((m * 255).astype('uint8')))
        x += img.shape[1] + gap
    out.save(a.out, quality=95); print('ได้ %d เฟรม (grid) → %s' % (len(frames), a.out))


if __name__ == '__main__':
    main()
