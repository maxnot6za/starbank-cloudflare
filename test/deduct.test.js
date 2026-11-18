// หักดาว + ภารกิจแก้ตัว (API): เหตุผลบังคับ · ไม่ติดลบ · ยกเลิกได้ 5 นาที · แก้ตัวได้ดาวคืน · ไม่อนุมัติ = ส่งใหม่ได้ · หมดเวลา · ไม่นับไข่
const { seedFamily, FAM, P1, P2, C } = require('./lib/fixture.js');
const { start, call } = require('./lib/mf.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const pushes = [];
  const { mf, db } = await start({ outbound: async (req) => { pushes.push(new URL(req.url).pathname); return new Response('', { status: 201 }); } });
  await seedFamily(db);
  await db.prepare("INSERT INTO PushSubs (endpoint, member_id, family_id, p256dh, auth, device, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind('https://push.example/kid', C, FAM, 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'test', new Date().toISOString()).run();
  const bal = async () => (await call(mf, 'getChildDashboard', C)).value.stats.balance;
  const b0 = await bal();
  ok(b0 > 0, 'ลูกมีดาวเริ่มต้น', b0);

  let r = await call(mf, 'deductStars', P1, { childId: C, stars: 1, reason: '' });
  ok(!r.ok && /เหตุผล/.test(r.error), 'ไม่มีเหตุผล → หักไม่ได้', r.error);
  r = await call(mf, 'deductStars', P1, { childId: C, stars: b0 + 1, reason: 'ทดสอบ' });
  ok(!r.ok && /หักได้ไม่เกิน/.test(r.error), 'หักเกินดาวที่มี → ไม่ได้ (ไม่ติดลบ)', r.error);
  r = await call(mf, 'deductStars', C, { childId: C, stars: 1, reason: 'x' });
  ok(!r.ok, 'ลูกหักดาวเองไม่ได้');

  // หักแบบไม่มีแก้ตัว แล้วยกเลิก
  r = await call(mf, 'deductStars', P1, { childId: C, stars: 2, reason: 'พูดไม่สุภาพ' });
  ok(r.ok && r.value.balance === b0 - 2 && r.value.ded.undoable && !r.value.ded.fix, 'หัก 2 ดาว → ดาวลด · ยกเลิกได้', r.value);
  await new Promise(x => setTimeout(x, 300));
  ok(pushes.includes('/kid'), 'แจ้งเตือนไปที่เครื่องลูก');
  let cd = (await call(mf, 'getChildDashboard', C)).value;
  ok(cd.deds.unseen.length === 1 && cd.deds.unseen[0].reason === 'พูดไม่สุภาพ' && cd.stats.deducted === 2, 'ลูกเห็นรายการที่ยังไม่ได้ดู + เหตุผล', cd.deds.unseen);
  r = await call(mf, 'undoDeduction', P2, r.value.ded.ded_id);
  ok(r.ok && r.value.balance === b0, 'ผู้ปกครองอีกคนยกเลิกได้ → ดาวกลับมา');
  cd = (await call(mf, 'getChildDashboard', C)).value;
  ok(!cd.deds.unseen.length, 'ยกเลิกแล้ว ลูกไม่เห็นป๊อปอัป');

  // หักแบบมีแก้ตัว
  r = await call(mf, 'deductStars', P1, { childId: C, stars: 3, reason: 'ทะเลาะกับพี่', fix: { title: 'ขอโทษพี่', icon: '🤗', minutes: 180 } });
  const id = r.value.ded.ded_id;
  ok(r.ok && r.value.ded.fix.state === 'open' && r.value.balance === b0 - 3, 'หัก 3 + ภารกิจแก้ตัว 3 ชม.', r.value.ded.fix);
  r = await call(mf, 'submitFix', C, id); ok(r.ok, 'ลูกส่งภารกิจแก้ตัว');
  r = await call(mf, 'submitFix', C, id); ok(!r.ok && /รอผู้ปกครอง/.test(r.error), 'ส่งซ้ำระหว่างรอไม่ได้');
  let pd = (await call(mf, 'getParentDashboard', P1)).value;
  ok(pd.deds.fixPending.length === 1 && pd.deds.fixPending[0].fix.title === 'ขอโทษพี่', 'ผู้ปกครองเห็นรายการรออนุมัติแก้ตัว');
  r = await call(mf, 'reviewFix', P1, id, false); ok(r.ok && r.value.balance === b0 - 3, 'ไม่อนุมัติ → ยังไม่ได้ดาวคืน');
  cd = (await call(mf, 'getChildDashboard', C)).value;
  ok(cd.deds.fixes[0].fix.state === 'open', 'ไม่อนุมัติ → กลับไปส่งใหม่ได้');
  await call(mf, 'submitFix', C, id);
  const pity0 = (await db.prepare('SELECT egg_pity FROM Families WHERE family_id = ?').bind(FAM).first()).egg_pity;
  r = await call(mf, 'reviewFix', P1, id, true); ok(r.ok && r.value.balance === b0, 'อนุมัติ → ได้ดาวคืนครบ');
  ok((await db.prepare('SELECT egg_pity FROM Families WHERE family_id = ?').bind(FAM).first()).egg_pity === pity0 && !(await db.prepare('SELECT * FROM Eggs').first()), 'ภารกิจแก้ตัวไม่นับในไข่');
  r = await call(mf, 'undoDeduction', P1, id); ok(!r.ok, 'ได้ดาวคืนแล้ว ยกเลิกการหักไม่ได้');

  // หมดเวลา
  r = await call(mf, 'deductStars', P1, { childId: C, stars: 1, reason: 'ช้า', fix: { title: 'เก็บของ', minutes: 30 } });
  const id2 = r.value.ded.ded_id;
  await db.prepare('UPDATE Deductions SET fix_until = ?, created_at = ? WHERE ded_id = ?').bind(new Date(Date.now() - 60000).toISOString(), new Date(Date.now() - 3600000).toISOString(), id2).run();
  r = await call(mf, 'submitFix', C, id2); ok(!r.ok && /หมดเวลา/.test(r.error), 'หมดเวลา → ส่งไม่ได้');
  cd = (await call(mf, 'getChildDashboard', C)).value;
  ok(!cd.deds.fixes.some(f => f.ded_id === id2), 'หมดเวลา → การ์ดหาย');
  r = await call(mf, 'undoDeduction', P1, id2); ok(!r.ok && /5 นาที/.test(r.error), 'เลย 5 นาที → ยกเลิกไม่ได้');

  // แลกรางวัลนับการหักด้วย (trigger กันติดลบ)
  const now = await bal();
  r = await call(mf, 'deductStars', P1, { childId: C, stars: now, reason: 'ทั้งหมด' });
  ok(r.ok && r.value.balance === 0, 'หักจนเหลือ 0 ได้');
  r = await call(mf, 'deductStars', P1, { childId: C, stars: 1, reason: 'อีก' });
  ok(!r.ok && /ไม่มีดาว/.test(r.error), 'เหลือ 0 → หักต่อไม่ได้');
  const rw = await db.prepare('SELECT reward_id FROM Rewards WHERE family_id = ? LIMIT 1').bind(FAM).first();
  r = await call(mf, 'redeemReward', rw.reward_id, C);
  ok(!r.ok || r.value && r.value.success === false, 'ดาวเหลือ 0 → แลกรางวัลไม่ได้', r);

  await mf.dispose(); console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
