// หน้าจอ: ไข่ปริศนา (แถบห้อง · กอด · ลูกฟัก · ป๊อปอัปคนอื่น) + จัดห้อง (ลาก/ขนาด/บันทึก) + ป้ายเมื่อไม่มีตัวละคร
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
  await db.prepare('UPDATE Members SET quest_seen = ?, tree_seen = ?').bind(today, '9999').run();
  // ไม่มีตัวละคร · มีไข่กำลังอุ่น (เห็นเหตุการณ์ "เจอ" แล้ว) · มีของตกแต่ง 2 ชิ้น
  await db.prepare("INSERT INTO Eggs (egg_id,family_id,status,warm,goal,day,day_warm,contrib,hugs,found_by,found_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(FAM + '|1', FAM, 'warming', 6, 15, today, 0, JSON.stringify({ [C]: 4, [P1]: 2 }), '{}', C, today, today).run();
  await db.prepare('UPDATE Members SET egg_seen = ?').bind(FAM + '|1:f').run();
  for (const [id, item] of [['d1', 'decor_tree'], ['d2', 'decor_bear']])
    await db.prepare("INSERT INTO Inventory (inv_id,family_id,item_id,price,currency,bought_by,bought_at,assigned_to) VALUES (?,?,?,?,?,?,?,?)").bind(id, FAM, item, 10, 'purple', P1, '', '').run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const browser = await chromium.launch(); const errors = [];
  const open = async (id) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
    const p = await ctx.newPage(); await routes(p); p.on('pageerror', e => errors.push(e.message)); await p.goto(base + '/'); return p; };

  const mom = await open(P1);
  await mom.waitForSelector('#avatar-strip.on', { timeout: 15000 });
  ok(await mom.isVisible('#avatar-strip .strip-egg'), 'ไม่มีตัวละครแต่มีไข่ → แถบห้องขึ้น พร้อมไข่');
  ok(await mom.isVisible('#avatar-strip .strip-sign'), 'ป้าย "พาตัวละครมาอยู่ในห้องสิ"');

  // จัดห้อง
  await mom.click('#pnav-shop'); await mom.waitForSelector('.inv-card'); await mom.click('.inv-card');
  await mom.click('#modal-content .shop-tabs button:nth-child(4)'); await mom.waitForSelector('#room-pal button');
  await mom.click('#room-pal button:nth-child(1)'); await mom.click('#room-pal button:nth-child(2)');
  ok(await mom.locator('#room-ed .dc').count() === 2, 'แตะของ → วางในห้อง 2 ชิ้น');
  const dc = mom.locator('#room-ed .dc').nth(1), bb = await dc.boundingBox();
  await mom.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await mom.mouse.down();
  await mom.mouse.move(bb.x + bb.width / 2 + 90, bb.y + bb.height / 2, { steps: 6 }); await mom.mouse.up();
  await mom.click('#room-tool button:nth-child(3)'); await mom.click('#room-tool button:nth-child(3)');
  ok(await mom.textContent('#room-pct') === '120%', 'ขยาย → 120%');
  await mom.screenshot({ path: OUT + 'e1-room-editor.png' });
  await mom.click('text=💾 บันทึกห้อง'); await mom.waitForSelector('text=บันทึกห้องแล้ว');
  const st = JSON.parse((await db.prepare('SELECT stage FROM Families WHERE family_id = ?').bind(FAM).first()).stage);
  ok(st.decor.length === 2 && st.decor[1].x > 0.6 && st.decor[1].s === 1.2, 'บันทึกตำแหน่ง+ขนาด', st.decor);
  await mom.click('#modal-content .dq-btn.g'); await mom.waitForTimeout(800);
  ok(await mom.waitForFunction(() => document.querySelectorAll('#avatar-strip .dc').length === 2, null, { timeout: 8000 }).then(() => true, () => false), 'ของตกแต่งขึ้นในแถบห้อง');

  // กอดไข่
  await mom.click('#avatar-strip .strip-egg'); await mom.waitForSelector('text=ไข่ปริศนาของบ้านเรา');
  await mom.screenshot({ path: OUT + 'e2-egg-sheet.png' });
  await mom.click('#modal-content button:has-text("กอดไข่")'); await mom.waitForSelector('text=กอดแล้ววันนี้');
  ok((await db.prepare('SELECT warm FROM Eggs').first()).warm === 7, 'กอดไข่ +1');
  await mom.click('#modal-content .dq-btn.g');

  // พร้อมฟัก → ลูกฟัก
  await db.prepare("UPDATE Eggs SET status='ready', warm=15").run();
  const kid = await open(C);
  await kid.waitForSelector('#avatar-strip .strip-egg.ready', { timeout: 15000 });
  await kid.click('#avatar-strip .strip-egg', { force: true }); await kid.click('#modal-content button:has-text("ฟักเลย")');
  await kid.waitForSelector('#egg-pop.on');
  for (let i = 0; i < 3; i++) { await kid.click('#ep-egg'); await kid.waitForTimeout(400); }
  await kid.waitForSelector('#egg-pop .ep-prize.on', { timeout: 8000 });
  await kid.waitForTimeout(700); await kid.screenshot({ path: OUT + 'e3-hatch.png' });
  ok((await db.prepare('SELECT status FROM Eggs').first()).status === 'hatched', 'ลูกฟักไข่สำเร็จ');
  ok(await db.prepare("SELECT COUNT(*) n FROM Inventory WHERE currency='egg'").first().then(r => r.n === 1), 'ได้ของตกแต่งจากไข่ 1 ชิ้น');
  await kid.click('#egg-pop button');

  // แม่เห็นป๊อปอัป "ลูกฟักไข่ได้..." (ผ่าน Live)
  await mom.waitForSelector('#egg-pop.on', { timeout: 15000 });
  await mom.waitForSelector('#egg-pop .ep-prize.on', { timeout: 8000 });
  ok(/ฟักไข่ได้/.test(await mom.textContent('#egg-pop')), 'คนอื่นเห็นป๊อปอัปการฟัก');
  await mom.waitForTimeout(600); await mom.screenshot({ path: OUT + 'e4-hatch-others.png' });
  await mom.click('#egg-pop button:has-text("เย้")'); await mom.waitForTimeout(800);
  ok(/:h$/.test((await db.prepare('SELECT egg_seen FROM Members WHERE member_id = ?').bind(P1).first()).egg_seen), 'เห็นแล้ว → ไม่เด้งซ้ำ');

  ok(!errors.length, 'ไม่มี JS error', errors);
  await browser.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
