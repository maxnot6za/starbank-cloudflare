// หน้าจอ: พื้นที่ตัวละครเดิน + หน้า "ของของครอบครัว" (ตัวละคร/พื้น/ของตกแต่ง) · ผู้ปกครองจัดการ · เด็กดูอย่างเดียว
const { chromium } = require('playwright');
const { seedFamily, FAM, P1, P2, C } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
const OUT = require('os').tmpdir() + '/starbank-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 });
  await seedFamily(db);
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  await db.prepare('UPDATE Members SET quest_seen = ?').bind(today).run();
  for (const [id, item, who] of [['i1', 'dino_dad', P1], ['i2', 'dino_mom', P2], ['i3', 'dino_kid', '']])
    await db.prepare("INSERT INTO Inventory (inv_id,family_id,item_id,price,currency,bought_by,bought_at,assigned_to) VALUES (?,?,?,?,?,?,?,?)").bind(id, FAM, item, 50, 'purple', P1, '', who).run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const browser = await chromium.launch(); const errors = [];
  const open = async (id) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
    const p = await ctx.newPage(); await routes(p); p.on('pageerror', e => errors.push(e.message)); await p.goto(base + '/'); return p; };

  const mom = await open(P1);
  await mom.waitForSelector('#avatar-strip.on', { timeout: 15000 });
  ok(await mom.evaluate(() => /floors\/wood\.webp/.test(getComputedStyle(document.querySelector('#avatar-strip .stage-floor')).backgroundImage)), 'แถบล่างมีพื้นไม้');
  await mom.waitForTimeout(2500); await mom.screenshot({ path: OUT + 'g1-strip-floor.png' });

  await mom.click('#pnav-shop'); await mom.waitForSelector('.inv-card');
  ok(/ตัวละคร 3 · พื้น 1 · ของตกแต่ง 0/.test(await mom.textContent('.inv-card')), 'การ์ดของของครอบครัวนับถูก');
  await mom.click('.shop-tabs button:nth-child(2)'); await mom.waitForSelector('.shop-floor');
  ok(/ใช้อยู่/.test(await mom.textContent('#screen-parent-shop .shop-item')), 'แท็บพื้น: พื้นไม้ "ใช้อยู่"');
  ok(await mom.isVisible('text=พื้นแบบใหม่ เร็ว ๆ นี้'), 'แท็บพื้น: เร็ว ๆ นี้');
  await mom.screenshot({ path: OUT + 'g2-shop-floor.png' });
  await mom.click('.shop-tabs button:nth-child(3)'); ok(await mom.isVisible('text=ของตกแต่ง เร็ว ๆ นี้'), 'แท็บของตกแต่ง: เร็ว ๆ นี้');

  await mom.click('.inv-card'); await mom.waitForSelector('#modal-content .inv-row', { timeout: 5000 });
  ok(await mom.locator('#modal-content .inv-row').count() === 3, 'ของของครอบครัว: ตัวละคร 3 ตัว');
  ok(await mom.isVisible('#modal-content >> text=ยังไม่ได้ให้ใคร'), 'บอกตัวที่ยังไม่ได้ให้ใคร');
  await mom.waitForTimeout(800); await mom.screenshot({ path: OUT + 'g3-inventory.png' });
  // ให้ลูกไดโนกับลูก → กลับมาหน้าของของครอบครัว
  await mom.click('#modal-content .inv-row:nth-child(3) .inv-btn'); await mom.waitForSelector('#shop-who');
  await mom.click('#shop-who .u-chip'); await mom.click('#modal-content .dq-btn.p');
  await mom.waitForSelector('#modal-content .inv-row', { timeout: 5000 });
  ok((await db.prepare("SELECT assigned_to FROM Inventory WHERE inv_id='i3'").first()).assigned_to === C, 'ให้ลูกไดโนกับลูกได้จากหน้านี้');
  await mom.click('#modal-content .shop-tabs button:nth-child(3)'); await mom.waitForSelector('.inv-slot');
  ok(await mom.locator('.inv-slot').count() === 5, 'แท็บตกแต่ง: จุดวางของ 5 จุดบนพรีวิวพื้น');
  await mom.click('.inv-slot:nth-child(3)'); await mom.waitForSelector('text=วางอะไรที่จุด 2?');
  ok(await mom.isVisible('text=ยังไม่มีของตกแต่ง'), 'แตะจุด → เลือกของ (ยังไม่มีของ)');
  await mom.screenshot({ path: OUT + 'g4-decor-pick.png' });

  const kid = await open(C);
  await kid.click('#cnav-shop'); await kid.waitForSelector('.inv-card');
  ok(/ดู ›/.test(await kid.textContent('.inv-card')), 'เด็ก: ปุ่ม "ดู"');
  await kid.click('.inv-card'); await kid.waitForSelector('#modal-content .inv-row');
  ok(!(await kid.locator('#modal-content .inv-btn').count()) && await kid.isVisible('text=ดูได้อย่างเดียว'), 'เด็ก: ดูอย่างเดียว ไม่มีปุ่มแก้');
  await kid.click('#modal-content .shop-tabs button:nth-child(3)');
  ok(!(await kid.locator('.inv-slot').count()), 'เด็ก: แตะจุดวางของไม่ได้');

  ok(!errors.length, 'ไม่มี JS error', errors);
  await browser.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
