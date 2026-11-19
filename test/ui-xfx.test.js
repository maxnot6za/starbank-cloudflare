// ของตกแต่งกิจกรรมถุงเท้า: วางในห้อง → มีส่วนประกอบท่า (ควัน/หิมะ/ไฟ) · แตะ = .tap · exclusive มีออร่า · เพนกวินซานต้าเดินในห้อง
const { chromium } = require('playwright');
const { seedFamily, P1, C, FAM } = require('./lib/fixture.js');
const { start, sessionFor, call } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  await db.prepare("UPDATE Members SET quest_seen = ?, news_seen = 99, tree_seen = '9999'").bind(today).run();
  for (const id of ['decor_ginger', 'decor_globe', 'decor_reindeer', 'pet_penguin'])
    await db.prepare("INSERT INTO Inventory (inv_id,family_id,item_id,price,currency,bought_by,bought_at,assigned_to) VALUES (?,?,?,0,'event',?,?,'')").bind('i' + id, FAM, id, P1, new Date().toISOString()).run();
  let r = await call(mf, 'saveRoom', P1, JSON.stringify([{ id: 'decor_ginger', x: .2 }, { id: 'decor_globe', x: .45 }, { id: 'decor_reindeer', x: .75 }]));
  ok(r.ok, 'จัดห้องด้วยของกิจกรรมได้', r.error);
  r = await call(mf, 'setPets', P1, JSON.stringify(['pet_penguin'])); ok(r.ok, 'ใส่เพนกวินในห้อง', r.error);
  const base = String(await mf.ready).replace(/\/$/, ''); const br = await chromium.launch(), errors = [];
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, C), url: base }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('sb_ui2', '1'); } catch (e) {} });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await routes(p); await p.goto(base + '/');
  await p.waitForSelector('#avatar-strip .dc.x-ginger', { timeout: 15000 }); await p.waitForTimeout(1500);
  ok(await p.locator('#avatar-strip .dc.x-ginger .x-puff').count() === 2 && await p.locator('#avatar-strip .dc.x-globe .x-flake').count() > 5, 'บ้านขนมปังขิงมีควัน · ลูกแก้วมีหิมะ');
  ok(await p.locator('#avatar-strip .dc.x-reindeer.xex .x-gold').count() === 5, 'กวาง exclusive มีประกายทอง');
  await p.evaluate(() => { while (MODAL.stack.length) MODAL.stack.pop(); closeModal(); });
  await p.locator('#avatar-strip .dc.x-ginger').click({ force: true });
  ok(await p.locator('#avatar-strip .dc.x-ginger.tap').count() === 1, 'แตะบ้านขนมปังขิง → ท่าพิเศษ');
  ok(await p.locator('#avatar-strip [data-sprite="petpenguin"], #avatar-strip .sa-actor').count() > 0, 'มีตัวละคร/สัตว์เลี้ยงในห้อง');
  await p.screenshot({ path: '/tmp/claude-0/-home-claude/b14b10f7-9712-559b-898d-5816c2230c4d/scratchpad/xfx-strip.png' });
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose(); console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
