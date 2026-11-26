// หน้าจอรางวัลใหญ่ในไข่ธรรมดา (ครอบครัวชุดญี่ปุ่น): ร้านโชว์เงาดำ ซื้อไม่ได้ · หน้าไข่มีตัวละครในรายการลุ้น · ฟักได้ตัวละคร → มอบให้ลูกใส่
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
  await db.prepare("INSERT INTO Eggs (egg_id,family_id,status,warm,goal,day,day_warm,contrib,hugs,found_by,found_at,created_at,tier) VALUES (?,?,'warming',7,15,?,0,?,'{}',?,?,?,'normal')")
    .bind(FAM + '|1', FAM, today, JSON.stringify({ [C]: 5, [P1]: 2 }), C, today, today).run();
  // มีของตกแต่งจากไข่ครบแล้ว + ตัวละครญี่ปุ่น 3 ตัว → ฟักแล้วต้องได้ตัวที่เหลือ (ไม่ขึ้นกับการสุ่ม)
  const decor = ['plant', 'lamp', 'bear', 'toybox', 'shelf', 'beanbag', 'ball', 'horse', 'rocket', 'blocks', 'drum', 'tent'].map(a => 'decor_' + a);
  for (const id of decor.concat(['kimono_dad', 'kimono_mom', 'kimono_girl'])) await db.prepare("INSERT INTO Inventory (inv_id,family_id,item_id,price,currency,bought_by,bought_at,assigned_to) VALUES (?,?,?,0,'egg',?,'','')").bind('x' + id, FAM, id, C).run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const browser = await chromium.launch(), errors = [];
  const open = async (id) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
    const p = await ctx.newPage(); await routes(p); p.on('pageerror', e => errors.push(e.message)); await p.goto(base + '/'); return p; };

  // ร้าน: แท็บตัวละคร → ตัวที่ยังไม่มีเป็นเงาดำ (data-locked) + ป้ายจากไข่ · แตะ = ตัวละครปริศนา ไม่มีปุ่มซื้อ
  const mom = await open(P1);
  await mom.waitForSelector('#avatar-strip .strip-egg', { timeout: 15000 });
  await mom.click('#pnav-shop'); await mom.click('.shop-tabs button:has-text("ตัวละคร")'); await mom.waitForTimeout(1500);
  const locked = await mom.locator('#screen-parent-shop .shop-stage[data-sprite^="kimono"][data-locked]').count();
  ok(locked === 1, 'ร้าน: ตัวละครญี่ปุ่นที่ยังไม่มี = เงาดำ 1 ตัว (มีแล้ว 3)', locked);
  ok(await mom.locator('#screen-parent-shop .shop-stage[data-sprite^="kimono"] canvas, #screen-parent-shop .shop-stage[data-sprite^="kimono"] .sa-frame, #screen-parent-shop .shop-stage[data-sprite^="kimono"] > *').count() >= 4, 'ร้าน: ตัวละครญี่ปุ่นวาดครบ 4 ตัว');
  await mom.evaluate(() => { var el = document.querySelector('.shop-stage[data-locked][data-sprite^="kimono"]'); el.scrollIntoView({ block: 'center' }); });
  await mom.waitForTimeout(400); await mom.screenshot({ path: OUT + 'j1-shop-silhouette.png' });
  await mom.locator('#screen-parent-shop .shop-item:has(.shop-stage[data-locked][data-sprite^="kimono"])').click();
  await mom.waitForSelector('#modal-content h2:has-text("ตัวละครปริศนา")');
  const mt = await mom.textContent('#modal-content');
  ok(/ได้จากไข่ปริศนาเท่านั้น/.test(mt) && /โอกาสน้อยมาก/.test(mt) && !/ซื้อ/.test(mt.replace('ซื้อไม่ได้', '')), 'แตะเงาดำ → ตัวละครปริศนา ลุ้นจากไข่ ไม่มีปุ่มซื้อ', mt.slice(0, 120));
  await mom.waitForTimeout(500); await mom.screenshot({ path: OUT + 'j2-mystery.png' });
  await mom.click('#modal-content .dq-btn.g');

  // หน้าไข่ธรรมดา: รายการลุ้นมีตัวละครญี่ปุ่น 4 ตัว (เงา = ยังไม่มี)
  await mom.click('#pnav-home').catch(() => {});
  await mom.evaluate(() => openEgg());
  await mom.waitForSelector('#modal-content .egg-pool');
  const pool = await mom.$$eval('#modal-content .egg-pool span', els => els.map(e => [e.style.backgroundImage, e.className]));
  const kp = pool.filter(p => /kimono/.test(p[0]));
  ok(kp.length === 4 && kp.filter(p => /\bno\b/.test(p[1])).length === 1, 'หน้าไข่: ลุ้นตัวละครญี่ปุ่น 4 ตัว (ยังไม่มี 1 = เงา)', kp);
  await mom.screenshot({ path: OUT + 'j3-egg-pool.png' });
  await mom.click('#modal-content .dq-btn.g');

  // ลูกฟัก → ได้ตัวละคร (ตัวที่เหลือ)
  await db.prepare("UPDATE Eggs SET status='ready', warm=15").run();
  const kid = await open(C);
  await kid.waitForSelector('#avatar-strip .strip-egg.ready', { timeout: 15000 });
  await kid.click('#avatar-strip .strip-egg', { force: true }); await kid.click('#modal-content button:has-text("ฟักเลย")');
  await kid.waitForSelector('#egg-pop.on');
  for (let i = 0; i < 3; i++) { await kid.click('#ep-egg'); await kid.waitForTimeout(400); }
  await kid.waitForSelector('#egg-pop .ep-prize.on', { timeout: 8000 });
  await kid.waitForTimeout(1200); await kid.screenshot({ path: OUT + 'j4-hatch-avatar.png' });
  const txt = await kid.textContent('#egg-pop');
  ok(/ตัวละครหายาก น้องฮัปปิ/.test(txt) && /รางวัลใหญ่/.test(txt), 'ฟักไข่ → ได้ตัวละครหายาก + บอกให้ผู้ปกครองเลือกคนใส่', txt.slice(0, 160));
  const bg = await kid.$eval('#egg-pop .ep-prize', e => e.style.backgroundImage);
  ok(/kimonoboy\/walk\.webp/.test(bg), 'ป๊อปอัปฟักโชว์ภาพตัวละคร', bg);
  ok(!!(await db.prepare("SELECT 1 FROM Inventory WHERE item_id = 'kimono_boy'").first()), 'ตัวละครเข้าคลังของครอบครัว');

  // ผู้ปกครองมอบให้ลูก → ลูกเดินในแถบห้องด้วยชุดใหม่
  await mom.reload(); await mom.waitForSelector('#pnav-shop');
  await mom.click('#egg-pop button:has-text("เย้")').catch(() => {});
  await mom.click('#pnav-shop'); await mom.click('.shop-tabs button:has-text("ตัวละคร")'); await mom.waitForTimeout(800);
  await mom.locator('#screen-parent-shop .shop-item:has(.shop-stage[data-sprite="kimonoboy"])').click();
  await mom.waitForSelector('#shop-who');
  await mom.click('#shop-who .u-chip:first-child');
  await mom.click('#modal-content .dq-btn.p'); await mom.waitForTimeout(1200);
  const inv = await db.prepare("SELECT assigned_to FROM Inventory WHERE item_id = 'kimono_boy'").first();
  ok(inv && inv.assigned_to === C, 'ผู้ปกครองมอบตัวละครให้ลูก', inv);
  ok(!errors.length, 'ไม่มี JS error', errors);
  await browser.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
