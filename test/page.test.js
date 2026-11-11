// หน้าเว็บ: inline <script> ทุกบล็อกต้อง parse ได้ + เปิดหน้าเด็ก/ผู้ปกครองแล้วไม่มี JS error
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { seedFamily, P2, C } = require('./lib/fixture.js');
const { start, sessionFor, REPO } = require('./lib/mf.js');
const routes = require('./lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const html = fs.readFileSync(REPO + '/public/index.html', 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-js-'));
  blocks.forEach((js, i) => {
    const f = path.join(tmp, i + '.js'); fs.writeFileSync(f, js);
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); ok(true, 'script #' + i + ' parse ได้'); }
    catch (e) { ok(false, 'script #' + i + ' syntax error', String(e.stderr)); }
  });

  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('- ข้ามการเปิดเบราว์เซอร์ (ไม่มี playwright)'); }
  if (chromium) {
    const { mf, db } = await start({ port: 0 });
    await seedFamily(db);
    const base = String(await mf.ready).replace(/\/$/, '');
    const browser = await chromium.launch();
    for (const [who, id] of [['ผู้ปกครอง', P2], ['เด็ก', C]]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
      const p = await ctx.newPage(); await routes(p);
      const errors = []; p.on('pageerror', e => errors.push(e.message));
      await p.goto(base + '/');
      const loaded = await p.waitForFunction(() => typeof dashboardData !== 'undefined' && dashboardData && dashboardData.member, null, { timeout: 10000 }).then(() => true, () => false);
      await p.waitForTimeout(800);
      ok(loaded, 'หน้า' + who + ' โหลดข้อมูลได้');
      ok(!errors.length, 'หน้า' + who + ' ไม่มี JS error', errors);
      await ctx.close();
    }
    await browser.close(); await mf.dispose();
  }
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
