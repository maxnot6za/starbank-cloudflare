// ฐานไข่หลายแบบ: ซื้อในร้าน → ใช้เลย · แถบห้องแสดงฐาน 2 ชั้น · เปลี่ยนแบบในหน้าจัดห้อง · ป๊อปอัปฟักมีฐาน + เอฟเฟกต์
const { chromium } = require('playwright');
const { seedFamily, FAM, P1, C } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
const OUT = require('os').tmpdir() + '/starbank-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  await db.prepare('UPDATE Members SET quest_seen = ?, tree_seen = ?, news_seen = 4').bind(today, '9999').run();
  await db.prepare('UPDATE Families SET purple = 60').run();
  await db.prepare("INSERT INTO Inventory (inv_id,family_id,item_id,price,currency,bought_by,bought_at,assigned_to) VALUES ('d1',?,'decor_tree',10,'purple',?,'','')").bind(FAM, P1).run();
  await db.prepare("INSERT INTO Eggs (egg_id,family_id,status,warm,goal,day,day_warm,contrib,hugs,found_by,found_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(FAM + '|1', FAM, 'warming', 6, 15, today, 0, '{}', '{}', C, today, today).run();
  await db.prepare('UPDATE Members SET egg_seen = ?').bind(FAM + '|1:f').run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const br = await chromium.launch(), errors = [];
  const open = async (id) => { const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
    const p = await ctx.newPage(); await routes(p); p.on('pageerror', e => errors.push(e.message)); await p.goto(base + '/'); return p; };
  const mom = await open(P1);
  // มีอะไรใหม่ v5 + พรีวิวฐาน
  await mom.waitForSelector('.wn-nests', { timeout: 15000 }); await mom.waitForTimeout(600);
  ok(await mom.locator('.wn-nests .nk').count() === 7, 'มีอะไรใหม่: พรีวิวฐานไข่ 7 แบบ');
  await mom.screenshot({ path: OUT + 'n0-whatsnew.png' });
  await mom.click('#modal-content .dq-btn'); await mom.waitForTimeout(500);
  // ร้าน: แท็บฐานไข่
  await mom.click('#pnav-shop'); await mom.waitForSelector('.shop-tabs');
  await mom.click('#screen-parent-shop .shop-tabs button:has-text("ฐานไข่")'); await mom.waitForTimeout(500);
  ok(await mom.locator('#screen-parent-shop .shop-item').count() === 11, 'ร้าน: ฐานไข่ 11 แบบ (รังฟางฟรี + 7 + หายากจากไข่ 3)');
  await mom.screenshot({ path: OUT + 'n1-shop.png' });
  await mom.locator('#screen-parent-shop .shop-item:has-text("พุดดิ้ง")').click(); await mom.waitForSelector('#shop-buy');
  await mom.click('#shop-buy'); await mom.waitForTimeout(1200);
  const st = JSON.parse((await db.prepare('SELECT stage, purple FROM Families WHERE family_id = ?').bind(FAM).first()).stage);
  ok(st.nest && st.nest.skin === 'nest_pudding', 'ซื้อแล้วใช้ฐานพุดดิ้งเลย', st.nest);
  ok((await db.prepare('SELECT purple FROM Families').first()).purple === 45, 'จ่าย 15 ดาวม่วง');
  await mom.evaluate(() => { try { closeModal(); } catch (e) {} parentNav('home'); });
  await mom.waitForSelector('#avatar-strip .strip-nest .nk.skin.nfx-pudding .nk-f', { timeout: 8000 });
  ok(await mom.isVisible('#avatar-strip .nk.skin .strip-egg'), 'แถบห้อง: ไข่อยู่ในฐานพุดดิ้ง (2 ชั้น)');
  await mom.waitForTimeout(500); await mom.screenshot({ path: OUT + 'n2-strip.png' });
  // หน้าจัดห้อง: เปลี่ยนกลับเป็นรังฟาง แล้วกลับเป็นพุดดิ้ง + บันทึก
  await mom.evaluate(() => openInventory('decor')); await mom.waitForSelector('#nest-pick');
  ok(await mom.locator('#nest-pick button').count() === 2, 'ตัวเลือกฐาน = ของที่มี 2 แบบ');
  await mom.screenshot({ path: OUT + 'n3-editor.png' });
  await mom.click('#nest-pick button:has-text("รังฟาง")'); await mom.waitForTimeout(200);
  ok(await mom.isVisible('#ed-nest .nk.straw'), 'เปลี่ยนเป็นรังฟางในหน้าจัดห้อง');
  await mom.click('text=💾 บันทึกห้อง'); await mom.waitForSelector('text=บันทึกห้องแล้ว');
  ok(JSON.parse((await db.prepare('SELECT stage FROM Families').first()).stage).nest.skin === 'nest_straw', 'บันทึกแบบฐาน');
  await mom.evaluate(() => { INV.open = false; closeModal(); });
  // ใช้พุดดิ้งกลับผ่านคลังของ
  await mom.evaluate(() => openInventory('nest')); await mom.waitForSelector('#modal-content .inv-btn');
  await mom.click('#modal-content .inv-btn'); await mom.waitForTimeout(1000);
  ok(JSON.parse((await db.prepare('SELECT stage FROM Families').first()).stage).nest.skin === 'nest_pudding', 'ใช้ฐานนี้ (คลังของ)');
  // ฟักไข่: ป๊อปอัปมีฐาน + เอฟเฟกต์
  await db.prepare("UPDATE Eggs SET status='ready', warm=15").run();
  const kid = await open(C);
  await kid.waitForSelector('#avatar-strip .strip-egg.ready', { timeout: 15000 });
  await kid.click('#avatar-strip .strip-egg', { force: true }); await kid.click('#modal-content button:has-text("ฟักเลย")');
  await kid.waitForSelector('#egg-pop.on .ep-nest .nk.skin');
  ok(true, 'ป๊อปอัปฟัก: มีฐานพุดดิ้ง');
  for (let i = 0; i < 3; i++) { await kid.click('#ep-egg'); await kid.waitForTimeout(350); }
  await kid.waitForSelector('#egg-pop .nfx-p', { timeout: 8000 }).then(() => ok(true, 'เอฟเฟกต์ฐานตอนฟัก'), () => ok(false, 'เอฟเฟกต์ฐานตอนฟัก'));
  await kid.waitForTimeout(250); await kid.screenshot({ path: OUT + 'n4-hatch.png' });
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
