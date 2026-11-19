// นับถอยหลังกิจกรรมถุงเท้า (ป้ายมุมการ์ดดาว · แตะ = ป๊อปอัป) · ฐานไข่หายาก 3 แบบ (ไข่นั่งในแอ่ง)
const { chromium } = require('playwright');
const { seedFamily, P1, C, FAM } = require('./lib/fixture.js');
const { start, sessionFor, call } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  await db.prepare("UPDATE Members SET quest_seen = ?, news_seen = 99, tree_seen = '9999'").bind(today).run();
  const cfg = s => db.prepare("INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('event_socks', ?)").bind(JSON.stringify(Object.assign({ enabled: true, season: 'T', start: addD(today, s), end: addD(today, s + 20) }))).run();
  await cfg(30);
  let r = await call(mf, 'getParentDashboard', P1); ok(r.value.socks === null, 'เกิน 14 วันก่อนเริ่ม → ยังไม่โชว์');
  await cfg(9);
  r = await call(mf, 'getParentDashboard', P1); ok(r.value.socks && r.value.socks.soon && r.value.socks.days === 9, 'เหลือ 9 วัน → soon', r.value.socks);
  const base = String(await mf.ready).replace(/\/$/, ''); const br = await chromium.launch(), errors = [];
  const open = async id => { const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
    await ctx.addInitScript(() => { try { localStorage.setItem('sb_ui2', '1'); } catch (e) {} });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await routes(p); await p.goto(base + '/'); return p; };
  for (const [id, who] of [[P1, 'ผู้ปกครอง'], [C, 'ลูก']]) {
    const p = await open(id);
    await p.waitForSelector('.sx-pill', { timeout: 15000 }); await p.waitForTimeout(500);
    ok(/อีก 9 วัน/.test(await p.textContent('.sx-pill')) && !(await p.$('#sx-card')), who + ': ป้ายอีก 9 วันบนการ์ดดาว · ไม่มีการ์ดตะกร้า');
    await p.evaluate(() => { while (MODAL.stack.length) MODAL.stack.pop(); closeModal(); }); await p.waitForTimeout(400);
    await p.locator('.sx-pill').first().click(); await p.waitForSelector('#sx-cnt div', { timeout: 3000 });
    ok(/ถุงเท้าซานต้า/.test(await p.textContent('#modal-content')) && await p.locator('#sx-cnt div').count() === 3, who + ': แตะ → ป๊อปอัปนับวัน/ชม./นาที');
    await p.screenshot({ path: '/tmp/claude-0/-home-claude/b14b10f7-9712-559b-898d-5816c2230c4d/scratchpad/soon-' + (id === C ? 'kid' : 'par') + '.png' });
    if (id === P1) {
      await p.evaluate(() => { closeModal(); });
      await p.waitForTimeout(400);
      await p.evaluate(() => { var d = document.createElement('div'); d.id = 'nt'; d.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:9999;background:#fff;display:flex;gap:20px;padding:30px'; d.innerHTML = ['crown', 'rainbow', 'fire'].map(function (a, i) { return '<div style="width:110px">' + nestBox({ art: a, rim: [.42, .64, .45][i], fx: a }, eggSVG(2)) + '</div>'; }).join(''); document.body.appendChild(d); });
      await p.waitForTimeout(800); await (await p.$('#nt')).screenshot({ path: '/tmp/claude-0/-home-claude/b14b10f7-9712-559b-898d-5816c2230c4d/scratchpad/nests3.png' });
    }
  }
  const pool = (await call(mf, 'getParentDashboard', P1)).value;
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose(); console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
