// กิจกรรมถุงเท้า (UI): การ์ดผู้ปกครอง/ลูก · ทดลองเล่น · เล่นจริงจนจบ → หน้าสรุป · ลูกเห็นป๊อปอัป → เปิดถุง → ของเด้ง · หน้าถุงเท้ายักษ์
const { chromium } = require('playwright');
const { seedFamily, P1, P2, C, FAM } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  await db.prepare("UPDATE Members SET quest_seen = ?, news_seen = 99, tree_seen = '9999'").bind(today).run();
  await db.prepare("INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('event_socks', ?)").bind(JSON.stringify({ enabled: true, season: 'T', start: addD(today, -3), end: addD(today, 5), santaHour: 0, game: { seconds: 3 } })).run();
  // แม่เล่นไปแล้ว 100 คู่ (บ้าน 3 คน → ขั้น 45/90/135 → ถุงกลาง)
  await db.prepare("INSERT INTO SocksPlays (play_id,family_id,member_id,season,play_date,day,status,socks,started_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(P2 + '|' + today, FAM, P2, 'T', today, today, 'done', 100, new Date().toISOString()).run();
  const base = String(await mf.ready).replace(/\/$/, ''); const br = await chromium.launch(), errors = [];
  const open = async id => { const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
    await ctx.addInitScript(() => { try { localStorage.setItem('sb_ui2', '1'); } catch (e) {} });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await routes(p); await p.goto(base + '/'); return p; };
  const par = await open(P1);
  await par.waitForSelector('#sx-card', { timeout: 15000 }); await par.waitForTimeout(600);
  let t = await par.textContent('#sx-card');
  ok(/100/.test(t) && /ซานต้ามารับถุงเท้าแล้ว/.test(t) && /รอลูกเปิด 1 ถุง/.test(t), 'ผู้ปกครอง: ยอด 100 · ซานต้ามา · รอลูกเปิด', t.slice(0, 160));
  ok(/แม่ 100/.test(t) && /พ่อ ยังไม่เล่น/.test(t), 'เห็นว่าใครเล่นแล้ว');
  // ทดลอง → ออกได้ทันที
  await par.evaluate(() => { while (MODAL.stack.length) MODAL.stack.pop(); closeModal(); });
  await par.click('#sx-card .sx-t'); await par.waitForSelector('.sg-trial', { timeout: 8000 });
  await par.click('.sg-x'); await par.waitForTimeout(400);
  ok(!(await par.$('.sg')), 'ทดลองเล่น กด ✕ ออกทันที');
  // เล่นจริง (ตั้ง 3 วิ) → หน้าสรุป
  await par.click('#sx-card .sx-r'); await par.waitForSelector('.sg', { timeout: 8000 });
  ok(!(await par.$('.sg-trial')), 'เล่นจริงไม่มีป้ายทดลอง');
  await par.waitForSelector('.sx-end', { timeout: 20000 }); await par.waitForTimeout(500);
  t = await par.textContent('.sx-end');
  ok(/หมดเวลา/.test(t) && /แม่/.test(t) && /\(คุณ\)/.test(t) && /เข้าตะกร้า/.test(t), 'หน้าสรุป: คะแนน · อันดับ · เข้าตะกร้า', t.slice(0, 200));
  await par.click('.sx-end .sx-r'); await par.waitForTimeout(1500);
  ok(/วันนี้เล่นแล้ว/.test(await par.textContent('#sx-card')), 'เล่นแล้ว → ปุ่มเปลี่ยนเป็น ✓ วันนี้เล่นแล้ว');
  // ลูก: ป๊อปอัป → เปิดถุง
  const kid = await open(C);
  await kid.waitForSelector('#sx-card', { timeout: 15000 });
  await kid.waitForSelector('#modal-overlay.show:has-text("ซานต้ามาแล้ว")', { timeout: 8000 });
  ok(true, 'ลูกเห็นป๊อปอัปซานต้ามาแล้ว (เห็นรอบหน้าได้)');
  await kid.click('#modal-overlay .sx-g'); await kid.waitForSelector('.sx-ov .sx-sc0', { timeout: 5000 });
  ok(/ขอบคุณสำหรับถุงเท้า/.test(await kid.textContent('.sx-ov')), 'ซานต้าทั้งตัวขอบคุณ');
  await kid.click('.sx-ov .sx-g'); await kid.waitForSelector('.sx-ov .ho-num', { timeout: 5000 }); ok(true, 'ฉากส่งถุงเท้า: เลขนับ'); await kid.waitForSelector('.sx-bag', { timeout: 20000 }); await kid.waitForTimeout(800);
  for (let i = 0; i < 3; i++) { await kid.click('.sx-bag'); await kid.waitForTimeout(250); }
  await kid.waitForSelector('.sx-loot', { timeout: 5000 }); await kid.waitForTimeout(1500);
  const n = await kid.locator('.sx-loot > div').count();
  ok(n === 2 && /ดาวม่วง/.test(await kid.textContent('.sx-loot')), 'ถุงกลาง → ได้ 2 ชิ้น มีดาวม่วง', await kid.textContent('.sx-loot'));
  await kid.click('.sx-ov .sx-r'); await kid.waitForTimeout(1500);
  ok(!/เปิดถุงของขวัญ/.test(await kid.textContent('#sx-card')) && /นับเป็นของพรุ่งนี้/.test(await kid.textContent('#sx-card')), 'เปิดแล้ว → ปุ่มหาย · บอกว่าเก็บต่อนับเป็นพรุ่งนี้');
  await kid.click('#sx-card .sx-gs'); await kid.waitForSelector('.sx-big', { timeout: 3000 });
  ok(/ถุงเท้ายักษ์ของบ้าน/.test(await kid.textContent('.sx-big')) && await kid.locator('.sx-pin').count() === 4, 'หน้าถุงเท้ายักษ์ 4 หมุด');
  await kid.screenshot({ path: '/tmp/claude-0/-home-claude/b14b10f7-9712-559b-898d-5816c2230c4d/scratchpad/ui-big.png' });
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose(); console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
