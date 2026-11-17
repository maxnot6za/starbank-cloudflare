// แตะสัตว์เลี้ยง → เล่นท่าแตะ (โหม่งบอล เป็นท่า loop) แล้วต้องกลับไปใช้ชีวิตต่อ ไม่ค้างท่าเดิม
const { chromium } = require('playwright');
const { seedFamily, C, FAM, P1 } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  await db.prepare("UPDATE Members SET quest_seen = 'x', news_seen = 99, tree_seen = '9999'").run();
  await db.prepare("INSERT INTO Inventory (inv_id,family_id,item_id,price,currency,bought_by,bought_at,assigned_to) VALUES ('i1',?,'pet_dino',20,'purple',?,'',NULL)").bind(FAM, P1).run();
  await db.prepare("UPDATE Families SET stage = ? WHERE family_id = ?").bind(JSON.stringify({ pets: ['pet_dino'] }), FAM).run();
  const base = String(await mf.ready).replace(/\/$/, ''); const br = await chromium.launch(), errors = [];
  const ctx = await br.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, C), url: base }]);
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await routes(p);
  await p.goto(base + '/'); await p.waitForFunction(() => window.STRIP && STRIP.scene && STRIP.scene.actors.petdino, null, { timeout: 20000 }); await p.waitForTimeout(800);
  await p.evaluate(() => { while (MODAL.stack.length) MODAL.stack.pop(); closeModal(); var a = STRIP.scene.actors.petdino; a.stop(); a.target = null; STRIP.scene.tap('petdino'); });
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => STRIP.scene.actors.petdino.current === 'header'), 'แตะแล้วโหม่งบอล');
  await p.waitForTimeout(3500);
  ok(await p.evaluate(() => STRIP.scene.actors.petdino.current !== 'header' && !STRIP.scene.busy.petdino), 'โหม่งบอลจบแล้วกลับไปใช้ชีวิตต่อ', await p.evaluate(() => STRIP.scene.actors.petdino.current));
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose(); console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
