// ตัวละครเคลื่อนไหว: สร้างหน้าตัวอย่างจาก character.json ทุกตัว แล้วเปิดดูว่าไม่มี JS error และเปลี่ยนท่าได้
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../sprites');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('- ข้าม (ไม่มี playwright)'); process.exit(0); }
  const chars = fs.readdirSync(path.join(ROOT, 'characters'));
  const browser = await chromium.launch();
  for (const c of chars) {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'characters', c, 'character.json'), 'utf8'));
    for (const [n, a] of Object.entries(m.anims)) {
      const sh = m.sheets[a.sheet];
      ok(!!sh, c + ': ท่า ' + n + ' ใช้ชีตที่มีอยู่จริง', a.sheet);
      const fr = a.steps ? a.steps.map(s => s[0]) : a.frames;
      ok(sh && fr.every(f => f >= 0 && f < sh.frames), c + ': ท่า ' + n + ' เลขเฟรมอยู่ในช่วง');
    }
    execFileSync('python3', [path.join(ROOT, 'build.py'), c], { stdio: 'pipe' });
    const p = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.route('**/fonts.*/**', r => r.abort());
    await p.goto('file://' + path.join(ROOT, 'characters', c, 'preview.html'));
    const states = new Set();
    for (let i = 0; i < 30; i++) { await p.waitForTimeout(300); states.add(await p.textContent('#st')); }
    ok(!errors.length, c + ': หน้าตัวอย่างไม่มี JS error', errors);
    ok(states.size >= 2, c + ': เปลี่ยนท่าเองได้', [...states]);
    await p.close();
  }
  // ฉากรวมหลายตัวละคร: ทุกคนในบทต้องมีอยู่จริง ท่าในบทต้องมีอยู่จริง และสั่งบทแล้วไม่ error
  for (const f of fs.readdirSync(path.join(ROOT, 'scenes')).filter(f => f.endsWith('.json'))) {
    const sc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scenes', f), 'utf8'));
    const ms = Object.fromEntries(sc.cast.map(c => [c, JSON.parse(fs.readFileSync(path.join(ROOT, 'characters', c, 'character.json'), 'utf8'))]));
    for (const r of sc.interactions) {
      ok(r.who.every(w => ms[w]), f + ': บท ' + r.id + ' ตัวละครครบ');
      const anims = [];
      (function walk(list) { for (const s of list) { if (s.together) walk(s.together); for (const k of Object.keys(s)) if (ms[k] && s[k] !== 'say') anims.push([k, s[k]]); } })(r.script);
      ok(anims.every(([k, a]) => ms[k].anims[a]), f + ': บท ' + r.id + ' ใช้ท่าที่มีอยู่จริง', anims);
    }
    const name = f.slice(0, -5);
    execFileSync('python3', [path.join(ROOT, 'build.py'), '--scene', name], { stdio: 'pipe' });
    const p = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.route('**/fonts.*/**', r => r.abort());
    await p.goto('file://' + path.join(ROOT, 'scenes', name + '.html'));
    for (const b of await p.$$('#force button')) { await b.click(); await p.waitForTimeout(2500); }
    await p.click('.sa-spr'); await p.waitForTimeout(800);
    const logs = await p.$$eval('#log li', l => l.length);
    ok(!errors.length && logs >= sc.interactions.length, name + ': สั่งทุกบท + แตะตัวละคร ไม่มี error', { errors, logs });
    await p.close();
  }
  await browser.close();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
