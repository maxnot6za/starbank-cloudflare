// หน้าจอดาวม่วง: พ่อกดรับแทนลูก → ดาวลอย ตัวเลขนับขึ้น แถบบอกที่มา+เป้าหมาย · ลูกเปิดแอป → ป๊อปอัป "+4 จากภารกิจของหนู · พ่อรับให้"
const { chromium } = require('playwright');
const { seedFamily, FAM, P1, C } = require('./lib/fixture.js');
const { start, call, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
const OUT = require('os').tmpdir() + '/starbank-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  await call(mf, 'getChildDashboard', C);   // สร้างภารกิจวันนี้
  await db.prepare('UPDATE Members SET quest_seen = ?, tree_seen = ?, purple_seen = ?').bind(today, '9999', new Date().toISOString()).run();
  await db.prepare("UPDATE Families SET purple = 6").run();
  await call(mf, 'wishItem', C, 'pet_dino_pink');
  await db.prepare("UPDATE DailyQuests SET status = 'done', progress = target, reward = 4, type = 'kid_submit', target = 4 WHERE owner = ?").bind(C).run();
  const base = String(await mf.ready).replace(/\/$/, ''); const browser = await chromium.launch(), errors = [];
  const open = async (id) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]); const p = await ctx.newPage(); await routes(p); p.on('pageerror', e => errors.push(e.message)); await p.goto(base + '/'); return p; };
  const dad = await open(P1);
  await dad.waitForSelector('#parent-daily .fold-h'); await dad.click('#parent-daily .fold-h');
  await dad.waitForSelector('.dq-claim'); await dad.click('.dq-claim', { force: true });
  await dad.waitForTimeout(500); await dad.screenshot({ path: OUT + 'pp1-fly.png' });
  await dad.waitForSelector('#pp-banner.on', { timeout: 5000 });
  await dad.waitForTimeout(900); await dad.screenshot({ path: OUT + 'pp2-banner.png' });
  ok(/\+4 ดาวม่วง/.test(await dad.textContent('#pp-banner')) && /ไดโนชมพู/.test(await dad.textContent('#pp-banner')), 'แถบบอก +4 และเป้าหมายไดโนชมพู', await dad.textContent('#pp-banner'));
  ok((await dad.textContent('.dq-wallet')).trim() === '10', 'ตัวเลขดาวม่วงนับขึ้นเป็น 10');
  const kid = await open(C);
  await kid.waitForSelector('.pp-news', { timeout: 15000 });
  await kid.waitForTimeout(1500); await kid.screenshot({ path: OUT + 'pp3-kid-news.png' });
  const t = await kid.textContent('.pp-news');
  ok(/\+4/.test(t) && /ภารกิจของหนู/.test(t) && /พ่อ/.test(t) && /อีก 0|พอซื้อแล้ว|อีก/.test(t), 'ลูกเห็นป๊อปอัป +4 จากภารกิจของหนู · พ่อรับให้', t);
  await kid.click('.pp-news .dq-btn'); await kid.waitForTimeout(800);
  ok(!!(await db.prepare('SELECT purple_seen FROM Members WHERE member_id = ?').bind(C).first()).purple_seen, 'บันทึกว่าเห็นแล้ว');
  ok(!errors.length, 'ไม่มี JS error', errors);
  await browser.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
