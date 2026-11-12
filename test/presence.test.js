// ใครเปิดแอปอยู่: เปิดหน้าจอ → แถว Presence ยังต่ออยู่ · ปิดหน้าจอ → ended_at · แถวค้างถูกปิดตอนมีคนต่อใหม่ · ลบแถวเก่ากว่า 30 วัน
const { chromium } = require('playwright');
const { seedFamily, FAM, P1, C } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 200)); } return false; };
(async () => {
  const { mf, db } = await start({ port: 0 });
  await seedFamily(db);
  // แถวค้างจาก "ก่อน deploy" + แถวเก่ากว่า 30 วัน
  await db.prepare("INSERT INTO Presence VALUES ('old-open',?,?,'parent',?,NULL),('ancient',?,?,'parent',?,?)").bind(FAM, P1, Date.now() - 3600000, FAM, P1, Date.now() - 40 * 86400000, Date.now() - 40 * 86400000).run();
  const base = String(await mf.ready).replace(/\/$/, '');
  const browser = await chromium.launch();
  const open = async (id) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
    const p = await ctx.newPage(); await routes(p); await p.goto(base + '/'); return { p, ctx }; };
  const online = () => db.prepare('SELECT member_id, role FROM Presence WHERE ended_at IS NULL').all().then(r => r.results);

  const mom = await open(P1);
  ok(await until(async () => (await online()).some(r => r.member_id === P1 && r.role === 'parent')), 'แม่เปิดแอป → ออนไลน์');
  ok(await until(async () => (await db.prepare("SELECT ended_at FROM Presence WHERE sid='old-open'").first()).ended_at > 0), 'แถวค้างก่อน deploy ถูกปิด');
  ok(await until(async () => !(await db.prepare("SELECT sid FROM Presence WHERE sid='ancient'").first())), 'แถวเก่ากว่า 30 วันถูกลบ');
  const kid = await open(C);
  ok(await until(async () => (await online()).length === 2), 'ลูกเปิดด้วย → ออนไลน์ 2 คน', await online());
  await kid.ctx.close();
  ok(await until(async () => (await online()).length === 1), 'ลูกปิดแอป → เหลือ 1', await online());
  const q = await db.prepare("SELECT COUNT(*) AS screens, COUNT(DISTINCT member_id) AS people, COUNT(DISTINCT family_id) AS families FROM Presence WHERE ended_at IS NULL AND started_at > (CAST(strftime('%s','now') AS INTEGER) - 43200) * 1000").first();
  ok(q.people === 1 && q.families === 1, 'คำสั่งเช็กก่อน deploy ใช้ได้', q);
  await browser.close(); await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
