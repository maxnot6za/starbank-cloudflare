const { chromium } = require('playwright');
const { seedFamily, FAM, FAM2, P1, P2, C } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require('./lib/routes.js');
const OUT = require('os').tmpdir() + '/starbank-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x)); if (!c) fails++; };

(async () => {
  const { mf, db } = await start({ port: 0 });
  await seedFamily(db);
  // ปิด popup ภารกิจประจำวัน (มีเทสต์ของตัวเองใน ui-shop.test.js) จะได้ไม่บังปุ่มในเทสต์นี้
  await db.prepare('UPDATE Members SET quest_seen = ?').bind(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)).run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (memberId) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, memberId), url: base }]);
    const p = await ctx.newPage(); await routes(p);
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => { Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'default' }); });
    return p;
  };
  const ready = p => p.waitForFunction(() => typeof dashboardData !== 'undefined' && dashboardData && dashboardData.member, null, { timeout: 10000 });

  const mom = await mk(P2); await mom.goto(base + '/'); await ready(mom);
  ok(await mom.isVisible('#urg-fab') && !(await mom.isVisible('text=สรุปรายวัน')), 'หน้าแรกผู้ปกครองมีปุ่มลอย ⚡ · ไม่มีปุ่มสรุปรายวัน');
  const kid = await mk(C); await kid.goto(base + '/'); await ready(kid);
  await kid.waitForTimeout(800);
  ok(/เปิดแจ้งเตือน/.test(await kid.textContent('#kid-push-slot')), 'หน้าเด็กมีปุ่มเปิดแจ้งเตือน');

  // ผู้ปกครองสร้าง
  await mom.click('#urg-fab'); await mom.waitForSelector('#u-title');
  await mom.fill('#u-title', 'เก็บของเล่นในห้องนั่งเล่น');
  await mom.click('#u-icons button:nth-child(2)');
  await mom.click('text=10 นาที');
  ok(await mom.evaluate(() => window.__urgForm.kids.length === 1), 'มีลูกคนเดียว → เลือกให้อัตโนมัติ');
  await mom.screenshot({ path: OUT + 'u1-create.png' });
  await mom.click('#u-create-btn');
  await mom.waitForFunction(() => /ยังไม่เปิดดู/.test(document.getElementById('parent-urgent').textContent), null, { timeout: 8000 });
  ok(true, 'ส่งแล้ว → การ์ด "ยังไม่เปิดดู"');

  // เด็ก: อัปเดตสด → ป้ายใหญ่เด้ง
  await kid.waitForSelector('.u-ribbon', { timeout: 8000 });
  await kid.waitForTimeout(1500);
  const ban = await kid.evaluate(() => ({ img: document.querySelector('.u-mascot').naturalWidth, dur: document.querySelector('.u-dur-pill').textContent, auto: document.getElementById('u-auto').textContent }));
  ok(ban.img > 0 && /10 นาที/.test(ban.dur) && /^0?0:5\d$|^0?1:00$/.test(ban.auto.trim()), 'ป้ายใหญ่: แสดงเวลาทำ ยังไม่นับ + นับถอยหลังเริ่มเอง 1 นาที', ban);
  await kid.screenshot({ path: OUT + 'u2-banner.png' });
  await mom.waitForFunction(() => /เปิดดูแล้ว ยังไม่รับ/.test(document.getElementById('parent-urgent').textContent), null, { timeout: 8000 });
  ok(true, 'ผู้ปกครองเห็น "เปิดดูแล้ว ยังไม่รับ"');
  await kid.click('#u-accept-btn');
  await mom.waitForFunction(() => /กำลังทำ/.test(document.getElementById('parent-urgent').textContent), null, { timeout: 8000 });
  ok(true, 'กดรับภารกิจ → ผู้ปกครองเห็น "กำลังทำ" ทันที');
  await mom.waitForSelector('#urg-fab.live .ring');
  ok(true, 'ปุ่มลอยมีวงแหวนนับเวลา');
  await mom.click('#urg-fab', { force: true }); await mom.waitForSelector('#urg-detail .u-kid');
  await mom.screenshot({ path: OUT + 'u3-parent-running.png' });
  await mom.evaluate(() => closeModal());

  await kid.waitForSelector('#u-submit-btn');
  await kid.waitForTimeout(1200);
  const t = await kid.textContent('.u-timer');
  ok(/^0?9:\d\d$|^10:00$/.test(t.trim()), 'การ์ดติดบนหน้าแรก นับเวลาต่อ', t);
  await kid.screenshot({ path: OUT + 'u4-kid-card.png' });
  await kid.click('#u-submit-btn');
  await kid.waitForSelector('text=ส่งทันเวลา!');
  await kid.waitForTimeout(500);
  await kid.screenshot({ path: OUT + 'u5-yay.png' });
  await mom.waitForFunction(() => /ส่งแล้ว รออนุมัติ/.test(document.getElementById('parent-urgent').textContent), null, { timeout: 8000 });
  ok(await mom.evaluate(() => dashboardData.pending.some(p => p.mission_title === '⚡ เก็บของเล่นในห้องนั่งเล่น')), 'ผู้ปกครอง: เข้ารายการรออนุมัติพร้อม ⚡');
  await mom.waitForSelector('#parent-pending-home .pending-item.urg .urg-tag');
  ok(/ภารกิจด่วน · 1/.test(await mom.textContent('#parent-pending-home')) && /ภารกิจทั่วไป/.test(await mom.textContent('#parent-pending-home')), 'รออนุมัติแยก ด่วน/ทั่วไป');
  ok(await mom.textContent('#urg-fab .b') === '1', 'ปุ่มลอยมีจุดแดง 1');
  await mom.screenshot({ path: OUT + 'u5b-pending-split.png' });
  await kid.click('text=ตกลง');

  // ภารกิจที่ 2: ปฏิเสธ
  await mom.evaluate(() => google.script.run.createUrgent(currentMember.memberId, { title: 'ล้างจาน', icon: '🍽️', stars: 3, minutes: 20, childIds: dashboardData.children.map(c => c.member_id) }));
  await kid.waitForSelector('.u-ribbon', { timeout: 8000 });
  await kid.waitForTimeout(600);
  await kid.click('#u-decline-btn');
  await kid.waitForSelector('text=ไม่เป็นไรนะ');
  await kid.waitForTimeout(400);
  await kid.screenshot({ path: OUT + 'u6-decline.png' });
  await mom.waitForFunction(() => /ไว้คราวหน้า/.test(document.getElementById('review-history-list').textContent), null, { timeout: 8000 });
  ok(true, 'ปฏิเสธ → ผู้ปกครองเห็น "ไว้คราวหน้า"');
  await kid.click('text=ตกลง');

  // ภารกิจที่ 3: หมดอายุตอนเด็กไม่ได้เปิดแอป → เปิดมาเห็นป้ายหมดเวลา ครั้งเดียว
  await kid.close();
  await mom.evaluate(() => google.script.run.createUrgent(currentMember.memberId, { title: 'พับผ้า', icon: '🧺', stars: 2, minutes: 15, childIds: dashboardData.children.map(c => c.member_id) }));
  await mom.waitForTimeout(800);
  await db.prepare("UPDATE Urgent SET open_until = ? WHERE status = 'pending'").bind(new Date(Date.now() - 1000).toISOString()).run();
  const kid2 = await mk(C); await kid2.goto(base + '/'); await ready(kid2);
  await kid2.waitForSelector('text=ภารกิจด่วนหมดเวลาแล้ว', { timeout: 8000 });
  await kid2.waitForTimeout(400);
  await kid2.screenshot({ path: OUT + 'u7-timeout.png' });
  await kid2.click('text=ตกลง');
  await kid2.reload(); await ready(kid2); await kid2.waitForTimeout(1200);
  ok(!(await kid2.isVisible('text=ภารกิจด่วนหมดเวลาแล้ว')), 'ป้ายหมดเวลาแสดงครั้งเดียว');

  // หมดเวลา → ผู้ปกครองมีปุ่มส่งดาวปลอบใจ
  await mom.evaluate(() => Live.request());
  // จบแล้ว → ย้ายไปกล่อง "จบแล้ว" ที่พับไว้ · กด + เพื่อกาง
  await mom.evaluate(() => parentNav('approvals'));
  await mom.waitForSelector('#review-history-list .rh-row.urg >> text=ส่งดาวปลอบใจ', { timeout: 8000 });
  const hist = await mom.textContent('#review-history-list');
  ok(/ไว้คราวหน้า/.test(hist) && /หมดเวลา/.test(hist), 'ภารกิจด่วนที่จบแล้ว → อยู่ในประวัติอนุมัติ มีปุ่มส่งดาวปลอบใจ');
  ok(!(await mom.isVisible('#urg-fab')), 'ปุ่มลอยไม่ขึ้นในแท็บอื่น');
  await mom.screenshot({ path: OUT + 'u7b-history.png' });
  await mom.evaluate(() => parentNav('home'));
  // ลากปุ่มไปซ้าย → เด้งชิดขอบซ้าย + จำตำแหน่ง
  const fb = await mom.locator('#urg-fab').boundingBox();
  await mom.mouse.move(fb.x + 30, fb.y + 30); await mom.mouse.down(); await mom.mouse.move(60, 400, { steps: 8 }); await mom.mouse.up(); await mom.waitForTimeout(400);
  const fb2 = await mom.locator('#urg-fab').boundingBox();
  ok(fb2.x < 30 && !(await mom.isVisible('#modal-content h2:has-text("สร้างภารกิจด่วน")')), 'ลากปุ่ม → ชิดซ้าย ไม่เปิดหน้าสร้าง', fb2);
  await mom.reload(); await ready(mom); await mom.waitForTimeout(800);
  ok((await mom.locator('#urg-fab').boundingBox()).x < 30, 'เปิดใหม่ ปุ่มอยู่ที่เดิม');
  await mom.click('.hdr-btn[aria-label="ตั้งค่า"]'); await mom.click('#modal-content .set-link');
  await mom.waitForTimeout(800);
  ok(!(await mom.isVisible('#modal-content .set-link')), 'ตั้งค่า → สรุปรายวัน เปิดได้');
  await mom.evaluate(() => { try { closeModal(); } catch (e) {} parentNav('home'); });

  // ของขวัญ: ผู้ปกครองส่ง 120 ดาว → ยืนยัน → เด็กเปิดกล่อง
  await mom.click('#parent-children-list >> text=ส่งของขวัญ');
  await mom.waitForSelector('#gf-stars');
  await mom.fill('#gf-stars', '120');
  await mom.click('#gf-reasons button:nth-child(2)');
  await mom.fill('#gf-msg', 'วันนี้ช่วยแม่เยอะเลย ขอบคุณนะ');
  await mom.screenshot({ path: OUT + 'g1-send.png' });
  await mom.click('button[onclick="gfConfirm()"]');
  await mom.waitForSelector('#gf-ok');
  const conf = await mom.textContent('#modal-content');
  ok(/120 ดาว/.test(conf) && /ลูก/.test(conf) && /ยืนยันใช่ไหม/.test(conf), 'หน้าต่างยืนยัน: จำนวนดาว + ชื่อลูก', conf.replace(/\s+/g, ' ').slice(0, 80));
  await mom.screenshot({ path: OUT + 'g2-confirm.png' });
  await mom.click('#gf-ok');
  await mom.waitForFunction(() => /รอเปิด/.test((document.getElementById('parent-gifts') || {}).textContent || ''), null, { timeout: 8000 });
  ok(true, 'ผู้ปกครองเห็นของขวัญ "รอเปิด"');
  await kid2.waitForSelector('.g-card', { timeout: 8000 });
  const bal0 = Number(await kid2.evaluate(() => dashboardData.stats.balance));
  await kid2.screenshot({ path: OUT + 'g3-kid-card.png' });
  await kid2.click('.g-card');
  await kid2.waitForSelector('#g-wrap');
  await kid2.waitForTimeout(400);
  await kid2.screenshot({ path: OUT + 'g4-stage.png' });
  await kid2.click('#g-wrap');
  await kid2.waitForTimeout(700);
  await kid2.screenshot({ path: OUT + 'g5-opening.png' });
  await kid2.waitForTimeout(1800);
  const end = await kid2.evaluate(() => ({ amt: document.getElementById('g-amount').textContent, btn: document.getElementById('g-done').textContent }));
  ok(/\+120/.test(end.amt) && new RegExp('ทั้งหมด ' + (bal0 + 120) + '\\b').test(end.btn), 'เปิดกล่อง → ดาวพุ่ง + นับถึง +120 + ยอดใหม่', end);
  await kid2.screenshot({ path: OUT + 'g6-opened.png' });
  await kid2.click('#g-done');
  await kid2.waitForFunction((b) => !document.getElementById('gift-stage') && dashboardData.stats.balance === b && !document.querySelector('.g-card'), bal0 + 120, { timeout: 8000 });
  ok(true, 'เก็บดาว → ยอดดาวบนหน้าหลักเพิ่ม + กล่องหายไป');
  ok(/ของขวัญจากแม่ \(\+120/.test(await kid2.textContent('#child-history-list')), 'ประวัติเด็กมีของขวัญ');
  await mom.waitForFunction(() => /เปิดแล้ว/.test(document.getElementById('parent-gifts').textContent), null, { timeout: 8000 });
  ok(true, 'ผู้ปกครองเห็น "เปิดแล้ว 🎉"');

  // ผู้ปกครอง: สร้างแล้วยกเลิก (แตะ 2 ครั้ง)
  await mom.evaluate(() => google.script.run.createUrgent(currentMember.memberId, { title: 'กวาดบ้าน', icon: '🧹', stars: 4, hours: 1, childIds: dashboardData.children.map(c => c.member_id) }));
  await mom.waitForSelector('#urg-fab.live', { timeout: 8000 });
  await mom.click('#urg-fab', { force: true }); await mom.waitForSelector('#urg-detail >> text=ยกเลิกภารกิจด่วน');
  await mom.screenshot({ path: OUT + 'u8-parent-home.png' });
  await mom.click('#urg-detail >> text=ยกเลิกภารกิจด่วน'); await mom.click('text=แตะอีกครั้งเพื่อยืนยันยกเลิก');
  await mom.waitForFunction(() => !document.getElementById('urg-fab').classList.contains('live') && /ยกเลิกแล้ว/.test(document.getElementById('review-history-list').textContent), null, { timeout: 8000 });
  ok(true, 'ยกเลิก (แตะยืนยัน 2 ครั้ง)');

  ok(errors.length === 0, 'ไม่มี JS error', errors);
  await browser.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
