// ธีม: ไฟล์ธีมครบ, รายชื่อตรงกับเซิร์ฟเวอร์, setTheme (ผู้ปกครองเท่านั้น), หน้าเว็บใช้ไฟล์ธีม + สลับธีมแล้วพื้นหลัง/คำ/มาสคอตเปลี่ยน
const fs = require('fs');
const { chromium } = require('playwright');
const { seedFamily, FAM, P1, C } = require('./lib/fixture.js');
const { start, call, sessionFor, REPO } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
const OUT = require('os').tmpdir() + '/starbank-shots/'; fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  // ---- ไฟล์ธีม ----
  const T = REPO + '/public/themes/';
  const list = JSON.parse(fs.readFileSync(T + 'index.json', 'utf8'));
  const core = fs.readFileSync(REPO + '/src/core.js', 'utf8');
  const srv = [...core.match(/var THEMES = \[([^\]]*)\]/)[1].matchAll(/'([\w-]+)'/g)].map(m => m[1]);
  ok(JSON.stringify(list.map(t => t.id).sort()) === JSON.stringify(srv.slice().sort()), 'themes/index.json ตรงกับ THEMES ใน core.js', { list: list.map(t => t.id), srv });
  for (const it of list) {
    const d = T + it.id + '/', th = JSON.parse(fs.readFileSync(d + 'theme.json', 'utf8'));
    const files = [th.preview, th.bg, th.music, ...Object.values(th.mascot || {})];
    ['go', 'sleep', 'timeout', 'yay'].forEach(k => ok(th.mascot && th.mascot[k], `[${it.id}] มาสคอตท่า ${k}`));
    if (th.progress.type === 'images') { ok((th.progress.frames || []).length === 6, `[${it.id}] ภาพความคืบหน้า 6 รูป (0–5)`); files.push(...th.progress.frames); }
    if (th.celebrate.type === 'frames') { ok((th.celebrate.frames || []).length >= 2, `[${it.id}] ภาพฉลองอย่างน้อย 2 เฟรม`); files.push(...th.celebrate.frames); }
    if (th.celebrate.type === 'builtin-xmas-tree') files.push(...['bare', 't2', 't4', 't5', 'hold', 'reach', 'clasp', 'jump'].map(k => th.celebrate.dir + k + '.webp'));
    const missing = files.filter(f => !f || !fs.existsSync(d + f));
    ok(!missing.length, `[${it.id}] ไฟล์ที่ theme.json อ้างถึงมีครบ`, missing);
    ok(['board', 'item', 'unit', 'add', 'full', 'celebrateTag', 'celebrateTitle', 'celebrateText', 'icon'].every(k => th.words && th.words[k]), `[${it.id}] คำครบ`);
  }

  // ---- API ----
  const { mf, db } = await start({ port: 0 });
  await seedFamily(db);
  let r = await call(mf, 'getParentDashboard', P1);
  ok(r.value.family.theme === 'xmas', 'ค่าเริ่มต้น = คริสต์มาส', r.value.family.theme);
  r = await call(mf, 'setTheme', C, 'xmas'); ok(!r.ok, 'เด็กเปลี่ยนธีมไม่ได้');
  r = await call(mf, 'setTheme', P1, 'nope'); ok(!r.ok, 'ธีมที่ไม่มี → ปฏิเสธ');
  r = await call(mf, 'setTheme', P1, 'xmas'); ok(r.ok, 'ผู้ปกครองตั้งธีมได้');

  // ---- หน้าเว็บ ----
  const base = String(await mf.ready).replace(/\/$/, '');
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  await db.prepare('UPDATE Members SET quest_seen = ?').bind(today).run();
  await db.prepare("UPDATE Families SET wheel_enabled = 1, wheel_started_at = ? WHERE family_id = ?").bind(new Date(Date.now() - 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z'), FAM).run();
  const browser = await chromium.launch(); const errors = [], bad = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, C), url: base }]);
  const kid = await ctx.newPage(); await routes(kid);
  kid.on('pageerror', e => errors.push(e.message));
  kid.on('response', res => { if (res.url().includes('/themes/') && res.status() >= 400) bad.push(res.url()); });
  // ธีมทดสอบ (มีเฉพาะในเทสต์)
  await kid.route('**/themes/testtheme/**', rt => {
    const u = rt.request().url();
    if (u.endsWith('theme.json')) return rt.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'testtheme', name: 'ทดสอบ', bg: 'bg.jpg', music: 'm.mp3', effect: { type: 'none' },
      mascot: { go: 'g.webp', sleep: 'g.webp', timeout: 'g.webp', yay: 'g.webp' }, words: { icon: '💧', board: 'ขันน้ำ', item: 'หยดน้ำ', unit: 'หยด', add: 'เติม' },
      progress: { type: 'images', frames: ['p0.png', 'p1.png', 'p2.png', 'p3.png', 'p4.png', 'p5.png'] }, celebrate: { type: 'frames', frames: ['c1.png', 'c2.png'] } }) });
    return rt.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  });
  await kid.goto(base + '/');
  await kid.waitForFunction(() => typeof dashboardData !== 'undefined' && dashboardData && dashboardData.wheel, null, { timeout: 10000 });
  await kid.waitForTimeout(1200);
  ok((await kid.getAttribute('#theme-bg', 'src')) === '/themes/xmas/bg.jpg', 'พื้นหลังมาจาก themes/xmas');
  ok(await kid.evaluate(() => document.querySelectorAll('#snowfall .snowflake').length === 25), 'หิมะ 25 เกล็ด');
  ok(await kid.isVisible('text=ต้นคริสต์มาสของหนู'), 'คำของธีมคริสต์มาสเหมือนเดิม');
  ok(await kid.evaluate(() => URG_IMG.go === '/themes/xmas/mascot/dao-go.webp'), 'มาสคอตจาก themes/xmas');
  await kid.screenshot({ path: OUT + 'th1-xmas.png' });
  // สลับไปธีมทดสอบ (เหมือนผู้ปกครองเปลี่ยนแล้วข้อมูลมาทาง Live)
  await kid.evaluate(() => { dashboardData.family.theme = 'testtheme'; rerenderDashboard(); });
  await kid.waitForFunction(() => THEME.id === 'testtheme', null, { timeout: 5000 });
  await kid.waitForTimeout(500);
  ok((await kid.getAttribute('#theme-bg', 'src')) === '/themes/testtheme/bg.jpg', 'สลับธีม → พื้นหลังเปลี่ยน');
  ok(await kid.evaluate(() => document.querySelectorAll('#snowfall .snowflake').length === 0), 'สลับธีม → หิมะหาย (effect none)');
  ok(await kid.isVisible('text=ขันน้ำของหนู'), 'สลับธีม → คำเปลี่ยน');
  ok(await kid.evaluate(() => !!document.querySelector('#child-wheel-card img[src="/themes/testtheme/p0.png"]')), 'สลับธีม → ภาพความคืบหน้าจากธีม');
  ok(await kid.evaluate(() => URG_IMG.yay === '/themes/testtheme/g.webp'), 'สลับธีม → มาสคอตเปลี่ยน');
  ok(await kid.evaluate(() => localStorage.getItem('starbank_theme') === 'testtheme'), 'จำธีมล่าสุดในเครื่อง');
  ok(!bad.filter(u => u.includes('/themes/xmas/')).length, 'ไฟล์ธีมคริสต์มาสโหลดได้ครบ', bad);

  // ผู้ปกครองเห็นการ์ดเลือกธีมในตั้งค่า
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await pctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, P1), url: base }]);
  const mom = await pctx.newPage(); await routes(mom); mom.on('pageerror', e => errors.push(e.message));
  await mom.goto(base + '/');
  await mom.waitForFunction(() => typeof dashboardData !== 'undefined' && dashboardData && dashboardData.children, null, { timeout: 10000 });
  await mom.evaluate(() => showSettings());
  await mom.waitForSelector('.th-card.on', { timeout: 5000 });
  ok(await mom.isVisible('.th-card.on >> text=คริสต์มาส'), 'ตั้งค่า: การ์ดคริสต์มาส "ใช้อยู่"');
  await mom.locator('#theme-slot').scrollIntoViewIfNeeded(); await mom.waitForTimeout(400);
  await mom.screenshot({ path: OUT + 'th2-settings.png' });

  ok(!errors.length, 'ไม่มี JS error', errors);
  await browser.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
