// หน้าจอไข่หายาก (rare): ไข่ม่วงลายดาวในห้อง · หน้าไข่ลุ้นสัตว์เลี้ยง · ลูกฟักได้สัตว์เลี้ยง · ร้านแสดงสัตว์เลี้ยงจากไข่หายาก
const { chromium } = require('playwright');
const { seedFamily, FAM, P1, C } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
const OUT = require('os').tmpdir() + '/starbank-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 });
  await seedFamily(db);
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  await db.prepare('UPDATE Members SET quest_seen = ?, tree_seen = ?, egg_seen = ?').bind(today, '9999', FAM + '|1:f').run();
  await db.prepare("INSERT INTO Eggs (egg_id,family_id,status,warm,goal,day,day_warm,contrib,hugs,found_by,found_at,created_at,tier) VALUES (?,?,'warming',7,15,?,0,?,'{}',?,?,?,'rare')")
    .bind(FAM + '|1', FAM, today, JSON.stringify({ [C]: 5, [P1]: 2 }), C, today, today).run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const browser = await chromium.launch(), errors = [];
  const open = async (id) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
    const p = await ctx.newPage(); await routes(p); p.on('pageerror', e => errors.push(e.message)); await p.goto(base + '/'); return p; };
  const mom = await open(P1);
  await mom.waitForSelector('#avatar-strip .strip-egg', { timeout: 15000 });
  await mom.waitForTimeout(800); await mom.screenshot({ path: OUT + 'r1-strip-rare.png' });
  await mom.click('#avatar-strip .strip-egg', { force: true }); await mom.waitForSelector('text=ไข่หายาก');
  ok(await mom.locator('#modal-content .egg-pool span').count() === 3, 'หน้าไข่หายาก: ลุ้นสัตว์เลี้ยง 3 ตัว');
  await mom.waitForTimeout(500); await mom.screenshot({ path: OUT + 'r2-egg-sheet-rare.png' });
  await mom.click('#modal-content .dq-btn.g');
  await mom.click('#pnav-shop'); await mom.click('.shop-tabs button:has-text("สัตว์เลี้ยง")'); await mom.waitForTimeout(1200);
  ok(await mom.locator('#screen-parent-shop .shop-tag:has-text("ไข่หายาก")').count() === 3, 'ร้าน: สัตว์เลี้ยงจากไข่หายาก 3 ตัว (ซื้อไม่ได้)');
  await mom.screenshot({ path: OUT + 'r3-shop-rare.png' });

  await db.prepare("UPDATE Eggs SET status='ready', warm=15").run();
  const kid = await open(C);
  await kid.waitForSelector('#avatar-strip .strip-egg.ready', { timeout: 15000 });
  await kid.click('#avatar-strip .strip-egg', { force: true }); await kid.click('#modal-content button:has-text("ฟักเลย")');
  await kid.waitForSelector('#egg-pop.on');
  for (let i = 0; i < 3; i++) { await kid.click('#ep-egg'); await kid.waitForTimeout(400); }
  await kid.waitForSelector('#egg-pop .ep-prize.on', { timeout: 8000 });
  await kid.waitForTimeout(1200); await kid.screenshot({ path: OUT + 'r4-hatch-pet.png' });
  ok(/สัตว์เลี้ยง/.test(await kid.textContent('#egg-pop')), 'ฟักไข่หายาก → ได้สัตว์เลี้ยง');
  const st = JSON.parse((await db.prepare('SELECT stage FROM Families').first()).stage || '{}');
  ok(st.pets && st.pets.length === 1, 'สัตว์เลี้ยงเข้าห้องเอง', st.pets);
  ok(!errors.length, 'ไม่มี JS error', errors);
  await browser.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
