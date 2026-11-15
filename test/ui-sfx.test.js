// เสียง+เอฟเฟกต์ปุ่ม: ปุ่มทางลัด/อนุมัติมี data-sfx · กดแล้วยุบ+ประกาย · ปิดเสียงในตั้งค่าได้
const { chromium } = require('playwright');
const { seedFamily, P1 } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  await db.prepare("UPDATE Members SET quest_seen = 'x', news_seen = 99, tree_seen = '9999'").run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const br = await chromium.launch(), errors = [];
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, P1), url: base }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('sb_ui2', '1'); } catch (e) {} });
  const p = await ctx.newPage(); await routes(p); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('.u2-pr', { timeout: 15000 }); await p.waitForTimeout(1500);
  ok(await p.locator('.u2-acts [data-sfx]').count() === 4, 'ปุ่มทางลัด 4 ปุ่มมีเสียง');
  ok(await p.locator('.u2-pr [data-sfx=ok]').count() > 0 && await p.locator('.u2-pr [data-sfx=no]').count() > 0, 'ปุ่ม ✓ ✕ มีเสียง');
  ok(await p.locator('#nav-parent [data-sfx]').count() === 0, 'เมนูล่างไม่มี');
  await p.locator('.u2-acts [data-sfx=weekly]').dispatchEvent('pointerdown');
  ok(await p.evaluate(() => document.querySelectorAll('.sfx-sp').length === 6 && document.querySelector('.u2-acts [data-sfx=weekly]').classList.contains('sfx-press')), 'กดแล้วยุบ + ประกาย 6 ดวง');
  await p.evaluate(() => { sfxToggle(); }); ok(await p.evaluate(() => !sfxOn()), 'ปิดเสียงได้');
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
