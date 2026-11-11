#!/usr/bin/env python3
"""สร้างหน้าตัวอย่างอนิเมชันของตัวละคร (ไฟล์ HTML เดียว ฝังรูปไว้ข้างใน ส่งให้คนอื่นเปิดดูได้เลย)

  python3 sprites/build.py dino          → sprites/characters/dino/preview.html
  python3 sprites/build.py               → ทำทุกตัวละคร
"""
import base64, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))

PAGE = r'''<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__NAME__ · ตัวอย่างอนิเมชัน</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mali:wght@500;700&display=swap">
<style>
:root{--bg:#EEF8F4;--card:#fff;--ink:#1F3B35;--mute:#5C7C74;--accent:#FF5A36;--ground:#CFEBDF;--line:#CDE9E1}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Mali,'Noto Sans Thai',system-ui,sans-serif;padding:20px max(16px,env(safe-area-inset-left,0px))}
.wrap{max-width:820px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
h1{font-size:24px;margin:0} h2{font-size:17px;margin:0 0 8px} .mute{color:var(--mute);font-size:13px}
.card{background:var(--card);border-radius:24px;padding:18px;box-shadow:0 4px 16px rgba(31,59,53,.07)}
.stage{position:relative;height:var(--sh,250px);border-radius:16px;overflow:hidden;background:linear-gradient(#F6FCF9 0 74%,var(--ground) 74%)}
.stage .sa-actor{bottom:26px}
.ctl{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;font-size:14px}
button{font:inherit;border:0;border-radius:999px;padding:7px 13px;background:#E2F5EE;color:var(--ink);cursor:pointer}
button.on{background:var(--accent);color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.anim{border:2px solid var(--line);border-radius:16px;padding:8px}
.anim .stage{--sh:170px}
.anim b{display:block;font-size:14px;margin:6px 4px 0}
.strip{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.cell{flex:none;border:2px solid var(--line);border-radius:10px;background-repeat:no-repeat;position:relative}
.cell span{position:absolute;left:4px;top:2px;font-size:11px;color:var(--mute)}
.warn{background:#FFF4D6;color:#7a5200;border-radius:14px;padding:10px 14px;font-size:14px}
</style></head><body><div class="wrap">
<div><h1>__NAME__</h1><p class="mute">หน้าตัวอย่างสร้างจาก character.json ด้วย sprites/build.py</p></div>
<div class="warn" id="notes" hidden></div>
<div class="card"><h2>ใช้ชีวิตเอง (manifest.life)</h2>
 <div class="stage" id="life" style="--sh:270px"></div>
 <div class="ctl">ตอนนี้: <b id="st">-</b>
  <span style="flex:1"></span>ความเร็ว <button data-sp="0.5">×0.5</button><button data-sp="1" class="on">×1</button><button data-sp="2">×2</button></div>
</div>
<div class="card"><h2>ทุกท่า</h2><p class="mute">วนท่าเดียวซ้ำ ๆ ไว้ตรวจทีละท่า</p><div class="grid" id="anims"></div></div>
<div class="card"><h2>เทียบขนาด</h2><p class="mute">เฟรมแรกของทุกชีตวางเรียงกัน หัวควรใหญ่เท่ากัน เท้าอยู่บนพื้นเดียวกัน</p><div class="stage" id="sizes" style="--sh:210px"></div></div>
<div class="card"><h2>ทุกเฟรม</h2><div id="sheets"></div></div>
</div>
<script>__RUNTIME__</script>
<script>
const M = __MANIFEST__;
if (M.notes) { notes.textContent = '⚠️ ' + M.notes; notes.hidden = false; }
const st = document.getElementById('st');
const main = SpriteActor.create(document.getElementById('life'), M, { size: 64, onState: s => st.textContent = s });
main.life();
document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => {
  main.speed = +b.dataset.sp; document.querySelectorAll('[data-sp]').forEach(x => x.classList.toggle('on', x === b));
});
// ทุกท่า
for (const [name, a] of Object.entries(M.anims)) {
  const box = document.createElement('div'); box.className = 'anim';
  box.innerHTML = '<div class="stage"></div><b>' + (a.label || name) + '</b><div class="mute" style="margin:0 4px">' + name + ' · ' + a.sheet + '</div>';
  anims.appendChild(box);
  const act = SpriteActor.create(box.querySelector('.stage'), M, { size: 48 });
  const stg = box.querySelector('.stage');
  requestAnimationFrame(() => {
    act.x = stg.clientWidth / 2; act._place();
    if (name === (M.walk || 'walk')) {
      (async function pace() { for (;;) { await act.walkTo(stg.clientWidth - 50); await act.walkTo(50); } })();
    } else if (a.loop) act.loop(name);
    else (async function again() { for (;;) { await act.play(name); await new Promise(r => setTimeout(r, 700)); } })();
  });
}
// เทียบขนาด
const sz = document.getElementById('sizes'); let x = 50;
for (const name of Object.keys(M.sheets)) {
  const act = SpriteActor.create(sz, M, { size: 56, x });
  act._frame(name, 0); x += 56 * 2;
}
// ทุกเฟรม
for (const [name, s] of Object.entries(M.sheets)) {
  const h = 110, w = h * s.cell[0] / s.cell[1];
  const wrap = document.createElement('div');
  wrap.innerHTML = '<p class="mute" style="margin:10px 0 4px">' + name + ' · ' + s.frames + ' เฟรม · หัน' + (s.facing === 'left' ? 'ซ้าย' : 'ขวา') + '</p><div class="strip"></div>';
  for (let i = 0; i < s.frames; i++) {
    const c = document.createElement('div'); c.className = 'cell';
    c.style.cssText = 'width:' + w + 'px;height:' + h + 'px;background-image:url("' + s.src + '");background-size:' + (s.frames * 100) + '% 100%;background-position:' + (s.frames > 1 ? i * 100 / (s.frames - 1) : 0) + '% 0';
    c.innerHTML = '<span>' + i + '</span>';
    wrap.querySelector('.strip').appendChild(c);
  }
  sheets.appendChild(wrap);
}
</script></body></html>
'''


def build(char):
    cdir = os.path.join(ROOT, 'characters', char)
    m = json.load(open(os.path.join(cdir, 'character.json'), encoding='utf-8'))
    for s in m['sheets'].values():
        data = base64.b64encode(open(os.path.join(cdir, s['file']), 'rb').read()).decode()
        s['src'] = 'data:image/webp;base64,' + data
    runtime = open(os.path.join(ROOT, 'sprite-actor.js'), encoding='utf-8').read()
    html = (PAGE.replace('__NAME__', m.get('name', char))
            .replace('__RUNTIME__', runtime)
            .replace('__MANIFEST__', json.dumps(m, ensure_ascii=False)))
    out = os.path.join(cdir, 'preview.html')
    open(out, 'w', encoding='utf-8').write(html)
    print(out, '(%d KB)' % (os.path.getsize(out) // 1024))
    return out


if __name__ == '__main__':
    chars = sys.argv[1:] or sorted(os.listdir(os.path.join(ROOT, 'characters')))
    for c in chars:
        build(c)
