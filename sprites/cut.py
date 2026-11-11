#!/usr/bin/env python3
"""ตัดภาพชีตท่าทาง (ที่เจนจาก AI) เป็นแถบเฟรมพร้อมใช้ แล้วลงทะเบียนในไฟล์ตัวละคร

ตัวอย่าง:
  python3 sprites/cut.py sprites/characters/dino/src/sit.webp --char dino --sheet sit --frames 6
  python3 sprites/cut.py src/write.webp --char dino --sheet write --frames 10 --flip 7,9
  python3 sprites/cut.py src/walk.webp --char dino --sheet walk --frames 6 --method split --slim 1

ผลลัพธ์:
  sprites/characters/<char>/<sheet>.webp   แถบเฟรมแนวนอน พื้นโปร่งใส ทุกช่องขนาดเท่ากัน
  sprites/characters/<char>/<sheet>.check.png  (ไม่ commit) ภาพตรวจบนพื้นมืด
  character.json → sheets.<sheet> = { file, frames, cell, facing }

มาตรฐานที่ทุกแถบเฟรมใช้ร่วมกัน (runtime อาศัยข้อนี้ จึงสลับท่าข้ามชีตได้โดยตัวไม่เปลี่ยนขนาด):
  - ปรับขนาดให้ "ความกว้างหัว" = HEAD_W พิกเซลทุกเฟรม (ไม่ใช่ความสูง เพราะท่านั่ง/ยืนสูงไม่เท่ากัน)
  - กึ่งกลางหัวอยู่กลางช่องพอดี และเท้า/ก้นแตะขอบล่างของช่อง (เว้น BASE พิกเซล)
  - ขอบขาวแบบสติกเกอร์วาดใหม่หนา OUTLINE พิกเซลเท่ากันทุกเฟรม เงา/พื้นเดิมถูกตัดทิ้ง
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter, ImageOps
from scipy import ndimage as nd

HEAD_W = 150      # ความกว้างหัวมาตรฐาน (px ในไฟล์)
OUTLINE = 5       # ความหนาขอบขาว (px ก่อนปรับขนาด)
BASE = 3          # ระยะจากเท้าถึงขอบล่างของช่อง
HEAD_BAND = 0.33  # ส่วนบนสุดของตัว (สัดส่วนความสูง) ที่ใช้วัดความกว้างหัว
ROOT = os.path.dirname(os.path.abspath(__file__))


def load(path):
    im = Image.open(path).convert('RGB')
    return im, np.array(im).astype(int)


def background(a):
    # สีพื้น = ค่ามัธยฐานของมุมทั้งสี่
    c = np.concatenate([a[:30, :30], a[:30, -30:], a[-30:, :30], a[-30:, -30:]]).reshape(-1, 3)
    return np.median(c, 0)


def biggest(mask):
    l, n = nd.label(mask)
    if n == 0:
        return mask
    s = nd.sum(mask, l, range(1, n + 1))
    return l == (np.argmax(s) + 1)


def cores_outline(a):
    """วิธีหลัก: ขอบสติกเกอร์สีขาวคือเส้นแบ่ง ข้างในเส้นขาว = ตัวละคร (เก็บพุงสีอ่อน/กระดาษไว้ครบ)"""
    white = a.min(2) > 236
    lab, _ = nd.label(~white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(border))
    inside = ~outside & ~(white & nd.binary_dilation(outside, iterations=9))
    l2, n2 = nd.label(inside)
    s = nd.sum(inside, l2, range(1, n2 + 1))
    out = []
    for i in range(n2):
        if s[i] > 6000:
            out.append(nd.binary_fill_holes(nd.binary_opening(l2 == i + 1, iterations=1)))
    return out


def body_color_mask(a, bg):
    """พิกเซลที่เป็นตัวละคร: ไม่ใช่ขาว ไม่ใช่พื้น ไม่ใช่เงา (สีอ่อนอมเขียว) — กระดาษสีครีมยังอยู่"""
    dbg = np.abs(a - bg).sum(2)
    greenpale = (a.min(2) > 118) & ((a[:, :, 1] - a[:, :, 0]) > 10) & ((a.max(2) - a.min(2)) < 60)
    return (a.min(2) <= 238) & (dbg > 30) & ~greenpale


def clean_core(m):
    m = nd.binary_opening(m, iterations=2)
    m = nd.binary_closing(m, iterations=3)
    return nd.binary_fill_holes(biggest(m))


def cores_color(a, bg):
    """วิธีสำรอง: เมื่อเส้นขาวขาด (ตัวละครแยกกันชัดแต่ขอบไม่ต่อเนื่อง)"""
    dbg = np.abs(a - bg).sum(2)
    fg = nd.binary_fill_holes(nd.binary_closing(dbg > 18, iterations=3))
    lab, n = nd.label(fg)
    sz = nd.sum(fg, lab, range(1, n + 1))
    body = body_color_mask(a, bg)
    return [clean_core((lab == i + 1) & body) for i in range(n) if sz[i] > 8000]


def cores_split(a, bg, n):
    """วิธีสำหรับชีตที่ตัวละครยืนชิด/ซ้อนกัน: หาจุดกลางหัวแต่ละตัวแล้วแบ่งตามเส้นขาวด้วย watershed"""
    from skimage.segmentation import watershed
    white = nd.binary_closing(a.min(2) > 230, iterations=1)
    lab, _ = nd.label(~white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sprite = ~np.isin(lab, list(border))
    ys, xs = np.where(sprite)
    y0, y1 = ys.min(), ys.max()
    # จุดเริ่ม: แบ่งความกว้างทั้งแถวเป็น n ช่องเท่ากัน ที่ระดับหน้า (~35% จากบน)
    x0, x1 = xs.min(), xs.max()
    yc = int(y0 + (y1 - y0) * 0.35)
    markers = np.zeros(sprite.shape, int)
    for k in range(n):
        cx = int(x0 + (x1 - x0) * (k + 0.5) / n)
        markers[yc - 8:yc + 8, cx - 5:cx + 5] = k + 1
    seg = watershed(a.min(2).astype(float), markers, mask=sprite)
    # สีอ่อน/ขาวที่แตะขอบนอกของชิ้น = เส้นขาวขอบสติกเกอร์ หรือพื้นหลังที่ติดอยู่ระหว่างสองตัว → ทิ้ง
    # สีอ่อน/ขาวที่ล้อมด้วยเส้นตัดสีเข้ม (พุง รองเท้าขาว ตาขาว กระดาษ) ไม่แตะขอบนอก → เก็บไว้
    light = ((a.min(2) > 160) & ((a.max(2) - a.min(2)) < 55)) | (a.min(2) > 230)
    out = []
    for k in range(n):
        comp = seg == k + 1
        edge = comp & ~nd.binary_erosion(comp, iterations=2)
        ll, _ = nd.label(comp & light)
        bad = set(np.unique(ll[edge & (ll > 0)])) - {0}
        core = comp & ~np.isin(ll, list(bad))
        out.append(clean_core(core))
    return out


def order(cores):
    # เรียงเป็นแถว (บน→ล่าง) แล้วซ้าย→ขวา
    boxes = []
    for m in cores:
        ys, xs = np.where(m)
        boxes.append((ys.min(), ys.max(), xs.min(), m))
    hs = np.median([b[1] - b[0] for b in boxes])
    boxes.sort(key=lambda b: (round(b[0] / (hs * 0.6)), b[2]))
    return [b[3] for b in boxes]


def render(im, core):
    out = nd.binary_dilation(core, iterations=OUTLINE)
    ys, xs = np.where(out)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    alpha = Image.fromarray((out * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8))
    bm = Image.fromarray((core * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6))
    rgba = Image.new('RGB', im.size, (255, 255, 255))
    rgba.paste(im, (0, 0), bm)
    rgba = rgba.convert('RGBA')
    rgba.putalpha(alpha)
    return rgba.crop(box)


def head_span(f):
    a = np.array(f)[:, :, 3] > 128
    ys, xs = np.where(a)
    top, h = ys.min(), ys.max() - ys.min()
    sel = ys < top + h * HEAD_BAND
    return xs[sel].min(), xs[sel].max()


def slim(f, top=0.95, body=0.87, feet=0.9):
    """บีบแนวนอน (หัวน้อย ตัวมาก) สำหรับเฟรมที่ AI วาดอ้วนกว่าเฟรมอื่น"""
    a = np.array(f).astype(float)
    al = a[:, :, 3] > 128
    ys = np.where(al.any(1))[0]
    t, h = ys.min(), ys.max() - ys.min()
    l, r = head_span(f)
    cx = (l + r) / 2
    xs = np.arange(a.shape[1])
    out = np.zeros_like(a)
    for y in range(a.shape[0]):
        sc = np.interp((y - t) / h, [0, .3, .5, .7, 1], [top, top - .01, body, body, feet])
        src = cx + (xs - cx) / sc
        for c in range(4):
            out[y, :, c] = np.interp(src, xs, a[y, :, c], left=0, right=0)
    return Image.fromarray(np.clip(out, 0, 255).astype('uint8'))


def cut_frames(path, n, method):
    im, a = load(path)
    bg = background(a)
    cores = []
    if method in ('auto', 'outline'):
        cores = cores_outline(a)
    if method == 'color' or (method == 'auto' and len(cores) != n):
        cores = cores_color(a, bg)
    if method == 'split':
        cores = cores_split(a, bg, n)
    cores = order(cores)
    print(os.path.basename(path), 'ตัดได้', len(cores), 'เฟรม')
    if len(cores) != n:
        sys.exit('จำนวนเฟรมไม่ตรง (ต้องการ %d) — ลอง --method color หรือ --method split หรือเจนภาพใหม่ให้ตัวละครห่างกัน' % n)
    return [render(im, c) for c in cores]


def parse_list(s):
    return [int(x) for x in s.split(',') if x.strip()] if s else []


def main():
    p = argparse.ArgumentParser(description='ตัดชีตท่าทางเป็นแถบเฟรม')
    p.add_argument('src', help='ภาพต้นฉบับจาก AI (png/webp/jpg)')
    p.add_argument('--char', required=True, help='รหัสตัวละคร เช่น dino')
    p.add_argument('--sheet', required=True, help='ชื่อแถบเฟรม เช่น walk, sit, write')
    p.add_argument('--frames', type=int, required=True, help='จำนวนเฟรมที่ควรได้ (ใช้ตรวจผล)')
    p.add_argument('--method', choices=['auto', 'outline', 'color', 'split'], default='auto',
                   help='auto = ลองขอบขาวก่อน แล้วสีพื้น · split = ตัวละครชิด/ซ้อนกัน')
    p.add_argument('--order', help='เลือก/เรียงเฟรมใหม่ เช่น 1,2,3,5 (นับจาก 1 ตามลำดับที่ตัดได้)')
    p.add_argument('--flip', help='พลิกซ้ายขวาเฉพาะเฟรม เช่น 7,9 (หลัง --order)')
    p.add_argument('--slim', help='บีบเฟรมที่อ้วนเกิน เช่น 1')
    p.add_argument('--facing', choices=['left', 'right'], help='ตัวละครในชีตหันไปทางไหน (ใส่ใน character.json)')
    p.add_argument('--replace', action='append', default=[],
                   help='แทนเฟรมด้วยภาพเดี่ยว เช่น 3=src/coffee-3.webp (ใช้ได้หลายครั้ง, นับหลัง --order)')
    p.add_argument('--quality', type=int, default=90)
    a_ = p.parse_args()

    frames = cut_frames(a_.src, a_.frames, a_.method)
    if a_.order:
        frames = [frames[i - 1] for i in parse_list(a_.order)]
    for r in a_.replace:
        i, path = r.split('=', 1)
        frames[int(i) - 1] = cut_frames(path, 1, 'auto')[0]
        print('แทนเฟรม', i, 'ด้วย', path)
    for i in parse_list(a_.flip):
        frames[i - 1] = ImageOps.mirror(frames[i - 1])
    for i in parse_list(a_.slim):
        frames[i - 1] = slim(frames[i - 1])

    # ปรับขนาดให้หัวกว้าง HEAD_W ทุกเฟรม
    out = []
    for f in frames:
        l, r = head_span(f)
        s = HEAD_W / (r - l)
        out.append(f.resize((round(f.width * s), round(f.height * s)), Image.LANCZOS))
    cx = [sum(head_span(f)) / 2 for f in out]
    W = int(2 * max(max(cx), max(f.width - c for f, c in zip(out, cx)))) + 8
    H = max(f.height for f in out) + BASE + 3
    sheet = Image.new('RGBA', (W * len(out), H))
    for k, (f, c) in enumerate(zip(out, cx)):
        sheet.alpha_composite(f, (k * W + int(round(W / 2 - c)), H - f.height - BASE))

    cdir = os.path.join(ROOT, 'characters', a_.char)
    os.makedirs(cdir, exist_ok=True)
    fn = a_.sheet + '.webp'
    sheet.save(os.path.join(cdir, fn), 'WEBP', quality=a_.quality, method=6)
    chk = Image.new('RGBA', sheet.size, (40, 40, 60, 255))
    chk.alpha_composite(sheet)
    chk.convert('RGB').save(os.path.join(cdir, a_.sheet + '.check.png'))

    mpath = os.path.join(cdir, 'character.json')
    man = json.load(open(mpath, encoding='utf-8')) if os.path.exists(mpath) else {
        'id': a_.char, 'name': a_.char, 'headWidth': HEAD_W, 'sheets': {}, 'anims': {}, 'life': []}
    prev = man['sheets'].get(a_.sheet, {})
    man['sheets'][a_.sheet] = {'file': fn, 'frames': len(out), 'cell': [W, H],
                               'facing': a_.facing or prev.get('facing', 'right')}
    with open(mpath, 'w', encoding='utf-8') as fh:
        json.dump(man, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    kb = os.path.getsize(os.path.join(cdir, fn)) // 1024
    print('บันทึก %s (%d เฟรม, ช่อง %dx%d, %d KB) และอัปเดต character.json' % (fn, len(out), W, H, kb))


if __name__ == '__main__':
    main()
