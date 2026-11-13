// สรุปประจำสัปดาห์ (ผู้ปกครอง): ตัวเลข · ทำบ่อยสุด · ยังไม่ได้ทำ · เปิดจากตั้งค่า
const { chromium } = require('playwright');
const { seedFamily, FAM, P1, C } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
const OUT = require('os').tmpdir() + '/starbank-shots/'; require('fs').mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  await db.prepare('UPDATE Members SET quest_seen = ?').bind(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)).run();
  const ms = (await db.prepare('SELECT mission_id, title FROM Missions WHERE family_id = ? AND is_active = 1').bind(FAM).all()).results;
  // ภารกิจแรก: ทำทุกวัน 7 วัน · ภารกิจอื่น: ไม่ได้ทำ
  for (let i = 0; i < 7; i++) {
    const t = new Date(Date.now() - i * 86400000).toISOString();
    await db.prepare("INSERT INTO Submissions (submission_id,mission_id,child_id,family_id,mission_title,status,stars_earned,submitted_at,reviewed_by,reviewed_at) VALUES (?,?,?,?,?,'approved',2,?,?,?)")
      .bind('wk' + i, ms[0].mission_id, C, FAM, ms[0].title, t, P1, t).run();
  }
  const base = String(await mf.ready).replace(/\/$/, '');
  const br = await chromium.launch(), errors = [];
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, P1), url: base }]);
  const p = await ctx.newPage(); await routes(p); p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForFunction(() => typeof dashboardData !== 'undefined' && dashboardData && dashboardData.member, null, { timeout: 15000 });
  await p.waitForTimeout(2500); await p.evaluate(() => { try { closeModal(); } catch (e) {} });
  const r = await p.evaluate(() => new Promise(res => google.script.run.withSuccessHandler(res).getWeeklySummary(currentMember.memberId, new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10))));
  const k = r.kids[0];
  ok(k.missions === 7 && k.stars === 14 && k.perDay.every(n => n === 1), 'API: 7 ภารกิจ 14 ดาว วันละ 1', k);
  ok(k.top[0].days === 7 && k.low.length >= 1 && !k.low.some(x => x.title === ms[0].title), 'API: ทำบ่อยสุด/ยังไม่ได้ทำ', { top: k.top, low: k.low });
  await p.click('.hdr-btn[aria-label="ตั้งค่า"]'); await p.click('#modal-content .set-link:has-text("สรุปสัปดาห์")');
  await p.waitForSelector('#wk-box .wk-stats', { timeout: 8000 }); await p.waitForTimeout(500);
  const txt = await p.textContent('#wk-box');
  ok(/ทุกวัน/.test(txt) && /ยังไม่ได้ทำ/.test(txt) && /ครบทุกวันเลย/.test(txt) && !/เพิ่มดาว|\+1 ดาว/.test(txt), 'หน้าสรุป: ทำบ่อยสุด · ยังไม่ได้ทำ · ชวนชม · ไม่มีปุ่มปรับดาว');
  await p.screenshot({ path: OUT + 'w1-weekly.png' });
  const kidCtx = await br.newContext(); await kidCtx.addCookies([{ name: 'sb_s', value: await sessionFor(db, C), url: base }]);
  const kp = await kidCtx.newPage(); await routes(kp);
  const res = await kp.goto(base + '/'); await kp.waitForTimeout(1500);
  const denied = await kp.evaluate(() => new Promise(res => google.script.run.withSuccessHandler(() => res(false)).withFailureHandler(() => res(true)).getWeeklySummary(currentMember.memberId)));
  ok(denied, 'เด็กเรียกสรุปสัปดาห์ไม่ได้');
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
