// ป๊อปอัปเด้งเอง: "เห็นรอบหน้าได้" ไม่เกิน 2 อันต่อการเปิดแอป · จด "เห็นแล้ว" ตอนปิด · "ต้องเห็นทันที" แซงได้แต่อันเดิมไม่หาย
const { chromium } = require('playwright');
const { seedFamily, P1 } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  // ผู้ปกครองยังไม่เห็น: ภารกิจประจำวัน + มีอะไรใหม่ (+ สรุปสัปดาห์ถูกปิดใน routes) → 2 อัน
  await db.prepare("UPDATE Members SET quest_seen = '', news_seen = 1, tree_seen = '9999'").run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const br = await chromium.launch(), errors = [];
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, P1), url: base }]);
  const p = await ctx.newPage(); await routes(p); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/');
  await p.waitForSelector('#modal-overlay.show .dq-pop', { timeout: 15000 });
  ok(true, 'อันที่ 1: ภารกิจประจำวัน');
  ok(!(await db.prepare('SELECT quest_seen FROM Members WHERE member_id = ?').bind(P1).first()).quest_seen, 'ยังไม่จด "เห็นแล้ว" ตอนเปิด');
  // ภารกิจด่วน (ต้องเห็นทันที) แซง → ปิดแล้วอันเดิมกลับมา
  await p.evaluate(() => urgPopup(URG_IMG.yay, 'ทดสอบแซง', 'ข้อความ'));
  await p.waitForSelector('#modal-content:has-text("ทดสอบแซง")');
  await p.click('#modal-content .u-btn'); await p.waitForTimeout(700);
  ok(await p.isVisible('#modal-overlay.show .dq-pop'), 'ปิดป๊อปอัปที่แซงแล้ว → ภารกิจประจำวันกลับมา');
  await p.click('#modal-content .dq-btn.g'); await p.waitForTimeout(800);
  ok(!!(await db.prepare('SELECT quest_seen FROM Members WHERE member_id = ?').bind(P1).first()).quest_seen, 'ปิด → จด "เห็นแล้ว"');
  await p.waitForSelector('#modal-overlay.show .wn-hd', { timeout: 8000 });
  ok(true, 'อันที่ 2: มีอะไรใหม่ (ต่อคิว)');
  await p.click('#modal-content .dq-btn.g'); await p.waitForTimeout(800);
  ok((await db.prepare('SELECT news_seen FROM Members WHERE member_id = ?').bind(P1).first()).news_seen > 1, 'ปิด "มีอะไรใหม่" → จดรุ่นที่เห็น');
  // อันที่ 3 (ดาวม่วง/สรุปสัปดาห์) ไม่ขึ้นรอบนี้
  await p.evaluate(() => { POP.later = 2; dashboardData.newsSeen = 0; WN.shown = 0; maybeWhatsNew(dashboardData); });
  await p.waitForTimeout(600);
  ok(!(await p.isVisible('#modal-overlay.show')), 'ครบ 2 อันแล้ว → อันถัดไปรอเปิดแอปครั้งหน้า');
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
