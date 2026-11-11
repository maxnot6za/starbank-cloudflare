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


def clean_core(m, keep_parts=False):
    # keep_parts: ของชิ้นเล็กที่มีก้าน/เส้นบาง (ต้นไม้ในกระถาง) → เปิดเบากว่า ก้านจะได้ไม่ขาด
    m = nd.binary_opening(m, iterations=1 if keep_parts else 2)
    m = nd.binary_closing(m, iterations=3)
    if not keep_parts:
        return nd.binary_fill_holes(biggest(m))
    # เก็บของชิ้นเล็กที่อยู่กับตัวละครด้วย (กระถาง ต้นไม้ สายน้ำ) ทิ้งแค่เศษจิ๋ว
    l, n = nd.label(m)
    if n == 0:
        return m
    s = nd.sum(m, l, range(1, n + 1))
    return nd.binary_fill_holes(np.isin(l, [i + 1 for i, v in enumerate(s) if v >= 80]))


def cores_color(a, bg):
    """วิธีสำรอง: เมื่อเส้นขาวขาด (ตัวละครแยกกันชัดแต่ขอบไม่ต่อเนื่อง)"""
    dbg = np.abs(a - bg).sum(2)
    raw = dbg > 18
    # เส้นพื้นยาวพาดทั้งภาพ (AI ชอบวาดให้) เชื่อมทุกเฟรมเข้าด้วยกัน → ลบเฉพาะส่วนที่บางแนวตั้ง
    rows = raw.sum(1) > raw.shape[1] * 0.4
    if rows.any():
        thin = raw & ~nd.binary_opening(raw, structure=np.ones((9, 1)))
        raw = raw & ~(thin & rows[:, None])
    fg = nd.binary_fill_holes(nd.binary_closing(raw, iterations=3))
    lab, n = nd.label(fg)
    sz = nd.sum(fg, lab, range(1, n + 1))
    body = body_color_mask(a, bg)
    light = ((a.min(2) > 160) & ((a.max(2) - a.min(2)) < 55)) | (a.min(2) > 230)
    out = []
    for i in range(n):
        if sz[i] <= 1500:
            continue
        comp = lab == i + 1
        # สีขาว/อ่อนที่ล้อมด้วยเส้นเข้ม (รองเท้าขาว ตาขาว กระดาษ) ไม่แตะขอบนอก → เก็บไว้
        edge = comp & ~nd.binary_erosion(comp, iterations=2)
        ll, _ = nd.label(comp & light)
        outer = set(np.unique(ll[edge & (ll > 0)])) - {0}
        inner = (ll > 0) & ~np.isin(ll, list(outer))
        out.append(clean_core(comp & (body | inner), keep_parts=True))
    return out


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
    """ความกว้างหัว: ในช่วงบนของตัว ใช้เฉพาะช่วงพิกเซลต่อเนื่องที่ยาวที่สุดของแต่ละแถว
    (มือที่ชูขึ้น/ของที่ถือข้างหัว เป็นช่วงแยก จึงไม่ถูกนับเป็นหัว)"""
    a = np.array(f)[:, :, 3] > 128
    rows = np.where(a.any(1))[0]
    top, h = rows.min(), rows.max() - rows.min()
    L, R = None, None
    for y in range(top, int(top + h * HEAD_BAND) + 1):
        xs = np.where(a[y])[0]
        if not len(xs):
            continue
        cuts = np.where(np.diff(xs) > 1)[0]
        starts = np.r_[xs[0], xs[cuts + 1]]
        ends = np.r_[xs[cuts], xs[-1]]
        k = np.argmax(ends - starts)
        L = starts[k] if L is None else min(L, starts[k])
        R = ends[k] if R is None else max(R, ends[k])
    return L, R


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
    if len(cores) > n and method in ('auto', 'color'):
        cores = group(cores, n)
    cores = order(cores)
    print(os.path.basename(path), 'ตัดได้', len(cores), 'เฟรม')
    if len(cores) != n:
        sys.exit('จำนวนเฟรมไม่ตรง (ต้องการ %d) — ลอง --method color หรือ --method split หรือเจนภาพใหม่ให้ตัวละครห่างกัน' % n)
    out = []
    for c in cores:
        f = render(im, c)
        f.info['bottom'] = int(np.where(c.any(1))[0].max())   # ตำแหน่งเท้าในภาพต้นฉบับ (ใช้กับ --keep-y)
        f.info['src'] = path                                    # เฟรมจากภาพเดียวกัน = วาดขนาดเดียวกัน
        out.append(f)
    return out


def group(cores, n):
    """มีชิ้นมากกว่าจำนวนเฟรม (เช่น กระถางต้นไม้แยกจากตัว) → รวมชิ้นที่อยู่คอลัมน์เดียวกัน
    โดยตัดแบ่งตรงช่องว่างแนวนอนที่กว้างที่สุด n-1 ช่อง"""
    spans = []
    for m in cores:
        xs = np.where(m.any(0))[0]
        spans.append((xs.min(), xs.max(), m))
    spans.sort(key=lambda t: (t[0] + t[1]) / 2)
    gaps = [(spans[i + 1][0] - spans[i][1], i) for i in range(len(spans) - 1)]
    cuts = sorted(i for _, i in sorted(gaps, reverse=True)[:n - 1])
    groups, start = [], 0
    for c in cuts + [len(spans) - 1]:
        m = np.zeros_like(spans[0][2])
        for t in spans[start:c + 1]:
            m |= t[2]
        groups.append(m)
        start = c + 1
    return groups


def extent(sheet, frames, W):
    """ความกว้างจริงของตัวละคร (รวมขอบขาวและของที่ถือ) ซ้าย/ขวาจากกึ่งกลางช่อง สูงสุดทุกเฟรม (px)"""
    a = np.array(sheet)[:, :, 3] > 128
    L = R = 0
    for k in range(frames):
        xs = np.where(a[:, k * W:(k + 1) * W].any(0))[0]
        if len(xs):
            L = max(L, W / 2 - xs.min())
            R = max(R, xs.max() + 1 - W / 2)
    return [int(round(L)), int(round(R))]


def parse_list(s):
    return [int(x) for x in s.split(',') if x.strip()] if s else []


def recut(char):
    """ตัดทุกชีตของตัวละครใหม่ด้วยคำสั่งเดิมที่บันทึกไว้ (ใช้หลังปรับปรุง cut.py)"""
    cdir = os.path.join(ROOT, 'characters', char)
    man = json.load(open(os.path.join(cdir, 'character.json'), encoding='utf-8'))
    for name, sh in list(man['sheets'].items()):
        c = sh.get('cut')
        if not c:
            print('ข้าม', name, '(ไม่มีคำสั่งตัดที่บันทึกไว้)')
            continue
        cmd = [sys.executable, os.path.abspath(__file__), os.path.join(cdir, c['src']), '--char', char, '--sheet', name]
        for k, v in c.items():
            if k == 'src':
                continue
            flag = '--' + k.replace('_', '-')
            if v is True:
                cmd.append(flag)
            elif isinstance(v, list):
                for x in v:
                    cmd += [flag, x.replace('$CHAR', cdir) if isinstance(x, str) else str(x)]
            else:
                cmd += [flag, str(v)]
        print('ตัดใหม่', name)
        import subprocess
        subprocess.run(cmd, check=True, cwd=cdir)


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
    p.add_argument('--keep-y', action='store_true',
                   help='คงความสูงจากพื้นตามภาพต้นฉบับ (ท่ากระโดด) แทนการวางเท้าแตะพื้นทุกเฟรม')
    p.add_argument('--quality', type=int, default=90)
    if len(sys.argv) > 2 and sys.argv[1] == '--recut':
        return recut(sys.argv[2])
    a_ = p.parse_args()

    # เก็บคำสั่งตัดไว้ใน character.json → ตัดใหม่ทั้งตัวละครได้ด้วย --recut
    cut_args = {k: v for k, v in vars(a_).items() if k not in ('char', 'sheet', 'recut') and v not in (None, False, [], 'auto', 90)}
    cdir0 = os.path.join(ROOT, 'characters', a_.char)
    cut_args['src'] = os.path.relpath(os.path.abspath(a_.src), cdir0)
    if a_.replace:
        cut_args['replace'] = [r.split('=', 1)[0] + '=' + os.path.relpath(os.path.abspath(r.split('=', 1)[1]), cdir0) for r in a_.replace]
    frames = cut_frames(a_.src, a_.frames, a_.method)
    if a_.order:
        frames = [frames[i - 1] for i in parse_list(a_.order)]
    for r in a_.replace:
        i, path = r.split('=', 1)
        frames[int(i) - 1] = cut_frames(path, 1, 'auto')[0]
        print('แทนเฟรม', i, 'ด้วย', path)
    for i in parse_list(a_.flip):
        g = ImageOps.mirror(frames[i - 1]); g.info.update(frames[i - 1].info); frames[i - 1] = g
    for i in parse_list(a_.slim):
        g = slim(frames[i - 1]); g.info.update(frames[i - 1].info); frames[i - 1] = g

    # ปรับขนาดให้หัวกว้าง HEAD_W ทุกเฟรม
    out = []
    # ขนาดต่อเฟรม: ปรับให้หัวกว้าง HEAD_W · แต่ถ้าเฟรมไหนต่างจากค่ากลางของชีตเกิน 7%
    # (มักเพราะมือ/ของที่ชูข้างหัวถูกนับเป็นหัว) ใช้ค่ากลางของชีตแทน
    scales = [HEAD_W / (r - l) for l, r in map(head_span, frames)]
    for i, f in enumerate(frames):
        s = scales[i]
        same = [scales[j] for j, g in enumerate(frames) if g.info.get('src') == f.info.get('src')]
        med = float(np.median(same))
        if abs(s / med - 1) > 0.07:
            print('เฟรม', i + 1, 'วัดหัวเพี้ยน (%.0f%%) ใช้ขนาดเดียวกับเฟรมอื่น' % ((s / med - 1) * 100))
            s = med
        g = f.resize((round(f.width * s), round(f.height * s)), Image.LANCZOS)
        g.info['lift'] = 0
        if a_.keep_y:
            g.info['lift'] = round((max(x.info.get('bottom', 0) for x in frames) - f.info.get('bottom', 0)) * s)
        out.append(g)
    cx = [sum(head_span(f)) / 2 for f in out]
    W = int(2 * max(max(cx), max(f.width - c for f, c in zip(out, cx)))) + 8
    H = max(f.height + f.info['lift'] for f in out) + BASE + 3
    sheet = Image.new('RGBA', (W * len(out), H))
    for k, (f, c) in enumerate(zip(out, cx)):
        sheet.alpha_composite(f, (k * W + int(round(W / 2 - c)), H - f.height - BASE - f.info['lift']))

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
                               'facing': a_.facing or prev.get('facing', 'right'),
                               'extent': extent(sheet, len(out), W),
                               'cut': cut_args}
    with open(mpath, 'w', encoding='utf-8') as fh:
        json.dump(man, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    kb = os.path.getsize(os.path.join(cdir, fn)) // 1024
    print('บันทึก %s (%d เฟรม, ช่อง %dx%d, %d KB) และอัปเดต character.json' % (fn, len(out), W, H, kb))


if __name__ == '__main__':
    main()
