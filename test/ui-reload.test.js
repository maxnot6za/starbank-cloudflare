// deploy ใหม่ → หน้าเก่าโหลดใหม่เอง · แต่ไม่โหลดตอนมีหน้าต่างเปิด/กำลังพิมพ์
const { chromium } = require('playwright');
const { seedFamily, P1 } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  await db.prepare('UPDATE Members SET quest_seen = ?').bind(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)).run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const br = await chromium.launch(); const errors = [];
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, P1), url: base }]);
  const p = await ctx.newPage(); await routes(p); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForFunction(() => typeof dashboardData !== 'undefined' && dashboardData && dashboardData.member, null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  // เวอร์ชันในหน้าไม่ตรงกับเซิร์ฟเวอร์ → เช็กตอน WebSocket ต่อใหม่
  await p.evaluate(() => { window.__mark = 1; document.querySelector('meta[name="app-version"]').setAttribute('data-id', 'oldver01'); });
  await p.evaluate(() => showSettings()); await p.waitForTimeout(300);
  await p.evaluate(() => Live._ver()); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => window.__mark === 1), 'มีหน้าต่างเปิดอยู่ → ยังไม่โหลดใหม่');
  await p.evaluate(() => closeModal());
  await p.waitForFunction(() => !window.__mark, null, { timeout: 8000 }).then(() => ok(true, 'ปิดหน้าต่างแล้ว → โหลดหน้าใหม่เอง'), () => ok(false, 'ปิดหน้าต่างแล้ว → โหลดหน้าใหม่เอง'));
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
