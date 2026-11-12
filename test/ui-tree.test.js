// หน้าจอ: ป๊อปอัป "ครบ 5 วันแล้ว" (ต้นคริสต์มาส) — เด้งเฉพาะสิทธิ์หมุนใหม่, มาทาง Live ได้ไม่ต้องเปิดใหม่, ปิดแล้วไม่เด้งซ้ำ
const { chromium } = require('playwright');
const { seedFamily, FAM, P1, C } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
const OUT = require('os').tmpdir() + '/starbank-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
(async () => {
  const { mf, db } = await start({ port: 0 });
  await seedFamily(db);
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const started = iso(Date.now() - 10 * 86400000);
  await db.prepare("UPDATE Families SET wheel_enabled = 1, wheel_started_at = ? WHERE family_id = ?").bind(started, FAM).run();
  await db.prepare('UPDATE Members SET quest_seen = ?').bind(today).run();
  // สิทธิ์เก่า (ได้ก่อน tree_seen) → ต้องไม่เด้ง
  await db.prepare('UPDATE Members SET tree_seen = ? WHERE member_id = ?').bind(iso(Date.now() - 3600000), C).run();
  const addSpin = (id, at) => db.prepare("INSERT INTO Spins (spin_id,child_id,family_id,round_key,earned_at,used_at,prize_stars,prize_index,request_id) VALUES (?,?,?,?,?,'','','','')")
    .bind(id, C, FAM, started + '|' + { old: '2000-01-01', new: '2000-01-02', new2: '2000-01-03' }[id], at).run();
  await addSpin('old', iso(Date.now() - 2 * 3600000));
  const base = String(await mf.ready).replace(/\/$/, '');
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, C), url: base }]);
  const kid = await ctx.newPage(); await routes(kid); kid.on('pageerror', e => errors.push(e.message));
  const ready = () => kid.waitForFunction(() => typeof dashboardData !== 'undefined' && dashboardData && dashboardData.wheel, null, { timeout: 10000 });
  const popOn = () => kid.evaluate(() => document.getElementById('tree-pop').classList.contains('on'));

  await kid.goto(base + '/'); await ready(); await kid.waitForTimeout(1500);
  ok(!(await popOn()), 'สิทธิ์เก่า (ก่อนอัปเดต) ไม่เด้งย้อนหลัง');

  // เด็กเปิดจอค้างไว้ → ได้สิทธิ์ใหม่ → ข้อมูลมาทาง Live → เด้งทันที
  await addSpin('new', iso(Date.now()));
  await kid.evaluate(() => Live.request());
  await kid.waitForFunction(() => document.getElementById('tree-pop').classList.contains('on'), null, { timeout: 8000 });
  ok(true, 'ครบ 5 วันระหว่างเปิดจอ → ป๊อปอัปเด้งโดยไม่ต้องเปิดแอปใหม่');
  ok(await kid.evaluate(() => !(dashboardData.avatars || []).some(a => a.item_id === 'dino_kid')), 'ไม่มีอวาตาร์ลูกไดโน → แบบต้นไม้อย่างเดียว');
  await kid.waitForSelector('#tree-pop .tp-msg.on', { timeout: 6000 });
  ok(await kid.isVisible('text=ครบ 5 วันแล้ว!'), 'ข้อความ "ครบ 5 วันแล้ว! 🎉"');
  await kid.waitForTimeout(1200); await kid.screenshot({ path: OUT + 't1-tree-pop.png' });
  await kid.click('#tree-pop .tp-close');
  await kid.waitForTimeout(800);
  ok(!(await popOn()), 'กด "ปิด" → ป๊อปอัปหาย');
  const seen = (await db.prepare('SELECT tree_seen FROM Members WHERE member_id = ?').bind(C).first()).tree_seen;
  const newAt = (await db.prepare("SELECT earned_at FROM Spins WHERE spin_id = 'new'").first()).earned_at;
  ok(seen === newAt, 'บันทึก tree_seen ลงฐานข้อมูล', { seen, newAt });
  ok(await kid.isVisible('text=หมุนกงล้อได้'), 'ยังเห็นการ์ดหมุนกงล้อตามเดิม');

  await kid.reload(); await ready(); await kid.waitForTimeout(1500);
  ok(!(await popOn()), 'เปิดใหม่ → ไม่เด้งซ้ำ');

  // มีอวาตาร์ลูกไดโน → แบบมีน้องไดโน
  await db.prepare("INSERT INTO Inventory (inv_id,family_id,item_id,price,currency,bought_by,bought_at,assigned_to) VALUES ('i1',?,'dino_kid',50,'purple',?,'',?)").bind(FAM, P1, C).run();
  await addSpin('new2', iso(Date.now() + 1000));
  await kid.reload(); await ready();
  await kid.waitForFunction(() => document.getElementById('tree-pop').classList.contains('on'), null, { timeout: 8000 });
  ok(await kid.evaluate(() => dashboardData.avatars.some(a => a.item_id === 'dino_kid' && a.member_id === dashboardData.member.member_id)), 'รอบใหม่ + มีลูกไดโน → เด้งแบบมีน้องไดโน');
  await kid.waitForTimeout(4200); await kid.screenshot({ path: OUT + 't2-tree-pop-dino.png' });

  ok(!errors.length, 'ไม่มี JS error', errors);
  await browser.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
