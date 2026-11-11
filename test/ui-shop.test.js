// หน้าจอ: popup ภารกิจประจำวัน, การ์ดภารกิจ, ร้านค้า (ผู้ปกครองซื้อ/เด็กดูอย่างเดียว), ตัวละครเดินด้านล่างจอ
const { chromium } = require('playwright');
const { seedFamily, FAM, P2, C } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require('./lib/routes.js');
const OUT = require('os').tmpdir() + '/starbank-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 });
  await seedFamily(db);
  await db.prepare('UPDATE Families SET purple = 40 WHERE family_id = ?').bind(FAM).run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (id) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
    const p = await ctx.newPage(); await routes(p);
    p.on('pageerror', e => errors.push(e.message));
    return p;
  };
  const ready = p => p.waitForFunction(() => typeof dashboardData !== 'undefined' && dashboardData && dashboardData.daily, null, { timeout: 10000 });

  const mom = await mk(P2); await mom.goto(base + '/'); await ready(mom);
  await mom.waitForSelector('.dq-pop', { timeout: 5000 });
  ok(true, 'ผู้ปกครองเปิดแอปครั้งแรกของวัน → popup ภารกิจประจำวัน');
  await mom.waitForTimeout(500); await mom.screenshot({ path: OUT + 's1-popup-parent.png' });
  await mom.click('text=ไปทำเลย');
  await mom.waitForTimeout(400);
  ok(await mom.locator('#parent-daily .dq').count() >= 2, 'หน้าหลักมีการ์ดภารกิจผู้ปกครอง + ของลูก');
  await mom.screenshot({ path: OUT + 's2-parent-home.png' });
  await mom.reload(); await ready(mom); await mom.waitForTimeout(1200);
  ok(!(await mom.locator('.dq-pop').count()), 'เปิดใหม่วันเดียวกัน → ไม่เด้งซ้ำ');

  await mom.click('#pnav-shop'); await mom.waitForSelector('.shop-item');
  await mom.waitForTimeout(1200);
  ok(await mom.locator('#screen-parent-shop .shop-item').count() === 3, 'ร้านค้ามีตัวละคร 3 ตัว');
  ok(await mom.locator('#screen-parent-shop .sa-actor').count() === 3, 'ตัวละครในร้านเดินโชว์');
  ok(/ลด 50%/.test(await mom.textContent('#screen-parent-shop')), 'ป้ายลด 50% ตัวแรก');
  await mom.screenshot({ path: OUT + 's3-shop-parent.png' });
  await mom.click('#screen-parent-shop .shop-item:nth-child(3)'); await mom.waitForSelector('#shop-big .sa-actor', { state: 'attached' });
  await mom.waitForTimeout(600); await mom.screenshot({ path: OUT + 's4-buy.png' });
  await mom.click('text=ซื้อ 25 ดาวม่วง');
  await mom.waitForFunction(() => document.getElementById('avatar-strip').classList.contains('on'), null, { timeout: 8000 });
  ok(true, 'ซื้อลูกไดโนให้ลูก → ตัวละครเดินด้านล่างจอ');
  ok(/15/.test(await mom.textContent('.shop-top')), 'ดาวม่วงเหลือ 15');
  await mom.waitForTimeout(1500); await mom.screenshot({ path: OUT + 's5-after-buy.png' });

  const kid = await mk(C); await kid.goto(base + '/'); await ready(kid);
  await kid.waitForSelector('.dq-pop', { timeout: 5000 });
  ok(true, 'เด็กเห็น popup ภารกิจของตัวเอง');
  await kid.waitForTimeout(400); await kid.screenshot({ path: OUT + 's6-popup-kid.png' });
  await kid.click('text=ดูทีหลัง');
  await kid.waitForFunction(() => document.getElementById('avatar-strip').classList.contains('on'), null, { timeout: 8000 });
  ok(true, 'หน้าเด็กก็เห็นตัวละครของครอบครัวเดินด้านล่าง');
  await kid.click('#cnav-shop'); await kid.waitForSelector('#screen-child-shop .shop-item'); await kid.waitForTimeout(1000);
  await kid.click('#screen-child-shop .shop-item:nth-child(1)'); await kid.waitForSelector('#shop-big');
  ok(!(await kid.locator('#modal-content button:has-text("ซื้อ")').count()) && await kid.locator('#modal-content button:has-text("อยากได้")').count() === 1, 'เด็กไม่มีปุ่มซื้อ มีแต่ "อยากได้"');
  await kid.click('text=💜 อยากได้!'); await kid.waitForTimeout(800);
  await kid.screenshot({ path: OUT + 's7-shop-kid.png' });
  const w = await db.prepare('SELECT COUNT(*) AS n FROM Wishes WHERE family_id = ?').bind(FAM).first();
  ok(w.n === 1, 'บันทึก "อยากได้"');
  ok(!errors.length, 'ไม่มี JS error', errors);
  await browser.close(); await mf.dispose();
  console.log('ภาพอยู่ที่', OUT);
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
