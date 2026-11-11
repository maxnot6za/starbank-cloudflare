// พื้นฐาน: ยอดดาว, ส่ง/อนุมัติภารกิจ, แลกรางวัล, กันดาวติดลบ, ต้องเข้าระบบ, ข้อมูลไม่ข้ามครอบครัว, MEMBER_ARG ครบ
const { seedFamily, FAM, FAM2, P1, P2, P3, C, START_BALANCE } = require('./lib/fixture.js');
const { start, call, MEMBER_ARG, REPO } = require('./lib/mf.js');
const fs = require('fs');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  // ทุกคำสั่งใน PUBLIC_API ต้องมีใน MEMBER_ARG (ไม่งั้นได้ 404 บน production)
  const core = fs.readFileSync(REPO + '/src/core.js', 'utf8');
  const pub = [...core.match(/export const PUBLIC_API = \[([\s\S]*?)\];/)[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
  const legacy = ['getMemberByWebToken', 'webLookupFamily', 'webReconnect', 'webRegister', 'webJoinFamily'];
  const missing = pub.filter(f => !legacy.includes(f) && !(f in MEMBER_ARG));
  ok(!missing.length, 'PUBLIC_API ทุกตัวมีใน MEMBER_ARG', missing);

  const { mf, db } = await start({ outbound: async () => new Response('', { status: 201 }) });
  await seedFamily(db);
  const bal = async () => (await call(mf, 'getChildDashboard', C)).value.stats.balance;

  ok(await bal() === START_BALANCE, 'ยอดดาวเริ่มต้นถูกต้อง', await bal());
  let r = await (await mf.dispatchFetch('http://local/api/getChildDashboard', { method: 'POST', body: JSON.stringify({ args: [C] }) })).json();
  ok(!r.ok && r.auth, 'ไม่มี session → ต้องเข้าระบบ');
  r = await (await mf.dispatchFetch('http://local/api/notAFunction', { method: 'POST', body: '{"args":[]}' })).json();
  ok(!r.ok, 'คำสั่งที่ไม่มี → ปฏิเสธ');

  const pd = (await call(mf, 'getParentDashboard', P1)).value;
  ok(pd.children.length === 1 && pd.children[0].member_id === C, 'ผู้ปกครองเห็นลูกของตัวเอง');
  ok(pd.pending.length === 1, 'มีงานรออนุมัติ 1 รายการ');
  const other = (await call(mf, 'getParentDashboard', P3)).value;
  ok(!other.children.length && !other.pending.length, 'บ้านอื่นไม่เห็นข้อมูลบ้านนี้');

  r = await call(mf, 'submitMission', 'm1', C, FAM);
  ok(r.ok, 'ลูกส่งภารกิจ', r.error);
  r = await call(mf, 'reviewSubmission', r.value, 'approved', P2);
  ok(r.ok && r.value.starsEarned === 3, 'แม่อนุมัติ → ได้ 3 ดาว', r.value);
  ok(await bal() === START_BALANCE + 3, 'ยอดดาวเพิ่มขึ้น');

  r = await call(mf, 'submitMission', 'mx', C, FAM2);
  ok(!r.ok || (await bal()) === START_BALANCE + 3, 'ส่งภารกิจของบ้านอื่นไม่ได้ดาว');

  r = await call(mf, 'redeemReward', 'r1', C, FAM);
  ok(r.ok && await bal() === START_BALANCE, 'แลกรางวัล 3 ดาว', r.error);
  await db.prepare("UPDATE Rewards SET stars_cost = 999 WHERE reward_id = 'r1'").run();
  r = await call(mf, 'redeemReward', 'r1', C, FAM);
  ok(!r.ok && /ดาวไม่พอ/.test(r.error), 'ดาวไม่พอ → แลกไม่ได้', r.error);
  let blocked = false;
  try { await db.prepare("INSERT INTO Redemptions (redemption_id, reward_id, child_id, family_id, reward_title, stars_spent, redeemed_at) VALUES ('dx','r1',?,?, 'x', 999, ?)").bind(C, FAM, new Date().toISOString()).run(); }
  catch (e) { blocked = true; }
  ok(blocked, 'ฐานข้อมูลกันดาวติดลบ (trigger trg_no_overspend)');

  r = await (await mf.dispatchFetch('http://local/version')).json();
  ok(r && typeof r === 'object', '/version ตอบได้', r);

  await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
