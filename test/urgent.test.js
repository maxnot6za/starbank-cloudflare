// ภารกิจด่วน: สร้าง/เห็น/ส่ง/ปฏิเสธ/หมดเวลา/ยกเลิก/เตือน/นาฬิกาปลุก/แจ้งเตือนเด็ก
const { seedFamily, FAM, FAM2, P1, P2, C } = require('./lib/fixture.js');
const { start, sessionFor, call } = require('./lib/mf.js');
const C2 = 'kid2kid2kid2';
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const pushes = [];
  const { mf, db } = await start({ outbound: async (req) => { pushes.push(new URL(req.url).pathname); return new Response('', { status: 201 }); } });
  await seedFamily(db);
  await db.prepare("INSERT INTO Members (member_id, family_id, name, role, avatar, created_at) VALUES (?,?,?,?,?,?)").bind(C2, FAM, 'น้องภู', 'child', '👦', new Date().toISOString()).run();
  const bal = async (id) => (await call(mf, 'getChildDashboard', id)).value.stats.balance;
  const urg = async (id) => db.prepare('SELECT * FROM Urgent WHERE urgent_id = ?').bind(id).first();
  // เครื่องรับแจ้งเตือน: เด็ก C และ P2 (แอป)
  await db.prepare("INSERT INTO PushSubs (endpoint, member_id, family_id, p256dh, auth, device, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind('https://push.example/kid', C, FAM, 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'test', new Date().toISOString()).run();
  await db.prepare("INSERT INTO PushSubs (endpoint, member_id, family_id, p256dh, auth, device, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind('https://push.example/mom', P2, FAM, 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'test', new Date().toISOString()).run();
  await db.prepare("UPDATE Members SET notify_channel = 'app' WHERE member_id = ?").bind(P2).run();

  // ตรวจค่าที่กรอก
  const base = { title: 'เก็บของเล่น', icon: '🧸', stars: 5, days: 0, hours: 0, minutes: 30, childIds: [C] };
  for (const [bad, re] of [[{ title: '' }, /ชื่อ/], [{ stars: 0 }, /1–100/], [{ minutes: 0 }, /อย่างน้อย 1 นาที/], [{ days: 8 }, /7 วัน/], [{ childIds: [] }, /เลือกลูก/], [{ childIds: ['nobody'] }, /เลือกลูก/]]) {
    const r = await call(mf, 'createUrgent', P1, Object.assign({}, base, bad));
    ok(!r.ok && re.test(r.error), 'กรอกผิด → ' + r.error);
  }
  ok(!(await call(mf, 'createUrgent', C, base)).ok, 'เด็กสร้างภารกิจด่วนไม่ได้');

  // สร้าง → เด็กเห็นแจ้งเตือน + ป้าย
  pushes.length = 0;
  let r = await call(mf, 'createUrgent', P1, base);
  ok(r.ok && r.value.count === 1, 'แม่สร้างภารกิจด่วนให้ ลูก', r);
  const batch1 = r.value.batchId;
  await sleep(300);
  let log = await db.prepare("SELECT member_id, kind FROM PushLog WHERE kind = 'urgent'").all();
  ok(log.results.some(x => x.member_id === C), 'ส่งแจ้งเตือนไปที่เครื่องของเด็ก', log.results);
  r = await call(mf, 'createUrgent', P2, base);
  ok(!r.ok && /ค้างอยู่/.test(r.error), 'มีค้างอยู่แล้ว → สร้างซ้ำไม่ได้', r.error);
  let kd = (await call(mf, 'getChildDashboard', C)).value;
  ok(kd.urgent.active.length === 1 && kd.urgent.active[0].status === 'pending' && kd.urgent.active[0].from_name, 'หน้าเด็ก: มีภารกิจด่วนรอเห็นป้าย', kd.urgent.active[0]);
  const U1 = kd.urgent.active[0].urgent_id;
  let pd = (await call(mf, 'getParentDashboard', P2)).value;
  ok(pd.urgent.length === 1 && pd.urgent[0].kids[0].status === 'pending' && pd.urgent[0].active, 'หน้าผู้ปกครอง: สถานะ "ยังไม่เปิดดู"');
  ok(!(await call(mf, 'urgentSeen', C2, U1)).ok, 'เด็กคนอื่นเปิดภารกิจของพี่ไม่ได้');

  // เห็นป้าย → ยังไม่นับ (ให้อ่าน 1 นาที) · กดรับ → เริ่มนับ
  r = await call(mf, 'urgentSeen', C, U1);
  ok(r.ok && r.value.urgent.status === 'pending' && r.value.urgent.seen_at && r.value.urgent.auto_start_at, 'เห็นป้าย → ยังไม่เริ่มนับ (มีเวลาอ่าน)', r.value.urgent);
  pd = (await call(mf, 'getParentDashboard', P2)).value;
  ok(pd.urgent[0].kids[0].status === 'pending' && pd.urgent[0].kids[0].seen_at, 'ผู้ปกครองเห็น "เปิดดูแล้ว ยังไม่รับ"');
  r = await call(mf, 'acceptUrgent', C, U1);
  ok(r.ok && r.value.urgent.status === 'running' && Math.abs(r.value.urgent.left_ms - 30 * 60000) < 5000, 'กดรับภารกิจ → เริ่มนับ 30 นาที', r.value.urgent);
  const dl1 = (await urg(U1)).deadline_at;
  await sleep(50);
  await call(mf, 'acceptUrgent', C, U1); await call(mf, 'urgentSeen', C, U1);
  ok((await urg(U1)).deadline_at === dl1, 'กดรับ/เปิดซ้ำ → เวลาไม่เริ่มใหม่');
  pd = (await call(mf, 'getParentDashboard', P2)).value;
  ok(pd.urgent[0].kids[0].status === 'running' && pd.urgent[0].kids[0].left_ms > 0, 'ผู้ปกครองเห็น "กำลังทำ" + เวลาที่เหลือ');

  // ส่งทัน → รออนุมัติ → ได้ดาวตามที่ตั้ง
  const b0 = await bal(C);
  r = await call(mf, 'submitUrgent', C, U1);
  ok(r.ok && r.value.submitted, 'ส่งทันเวลา', r);
  const sub = await db.prepare('SELECT * FROM Submissions WHERE submission_id = ?').bind(r.value.submissionId).first();
  ok(sub && sub.status === 'pending' && sub.mission_title === '⚡ เก็บของเล่น' && sub.mission_id === U1, 'เข้าคิวรออนุมัติพร้อมป้าย ⚡', sub);
  pd = (await call(mf, 'getParentDashboard', P2)).value;
  ok(pd.pending.some(p => p.submission_id === sub.submission_id) && pd.urgent[0].kids[0].status === 'submitted' && pd.urgent[0].kids[0].review === 'pending', 'ผู้ปกครองเห็นในรออนุมัติ + การ์ดด่วน "ส่งแล้ว"');
  ok(!(await call(mf, 'submitUrgent', C, U1)).ok, 'ส่งซ้ำไม่ได้');
  r = await call(mf, 'reviewSubmission', sub.submission_id, 'approved', P2);
  ok(r.ok && r.value.starsEarned === 5, 'อนุมัติ → ได้ 5 ดาวตามที่ตั้ง', r.value);
  ok(await bal(C) === b0 + 5, 'ยอดดาวเพิ่ม 5', { b0, now: await bal(C) });

  // ปฏิเสธ
  r = await call(mf, 'createUrgent', P1, Object.assign({}, base, { title: 'ล้างจาน' }));
  kd = (await call(mf, 'getChildDashboard', C)).value; const U2 = kd.urgent.active[0].urgent_id;
  await call(mf, 'acceptUrgent', C, U2);
  pushes.length = 0;
  r = await call(mf, 'declineUrgent', C, U2);
  ok(r.ok && r.value.status === 'declined', 'กด "ไว้คราวหน้า"');
  await sleep(300);
  log = await db.prepare("SELECT member_id FROM PushLog WHERE kind = 'urgent' AND member_id = ?").bind(P2).all();
  ok(log.results.length >= 1, 'ผู้ปกครอง (แอป) ได้แจ้งเตือนว่าลูกปฏิเสธ');
  kd = (await call(mf, 'getChildDashboard', C)).value;
  ok(!kd.urgent.active.length && kd.urgent.recent.some(u => u.urgent_id === U2 && u.status === 'declined'), 'ป้ายหายจากหน้าเด็ก (เก็บไว้ในรายการที่เพิ่งจบ)');
  ok(await bal(C) === b0 + 5, 'ปฏิเสธ → ไม่หักดาว');

  // หมดเวลา (ตรวจตอนเปิดแอป)
  await call(mf, 'createUrgent', P1, Object.assign({}, base, { title: 'พับผ้า' }));
  kd = (await call(mf, 'getChildDashboard', C)).value; const U3 = kd.urgent.active[0].urgent_id;
  await call(mf, 'acceptUrgent', C, U3);
  await db.prepare('UPDATE Urgent SET deadline_at = ? WHERE urgent_id = ?').bind(new Date(Date.now() - 2000).toISOString(), U3).run();
  r = await call(mf, 'submitUrgent', C, U3);
  ok(r.ok && r.value.submitted, 'เลยเวลา 2 วินาที (ยังอยู่ในช่วงผ่อนผัน 5 วิ) → ยังส่งทัน');
  await call(mf, 'createUrgent', P1, Object.assign({}, base, { title: 'กวาดบ้าน' }));
  kd = (await call(mf, 'getChildDashboard', C)).value; const U4 = kd.urgent.active[0].urgent_id;
  await call(mf, 'acceptUrgent', C, U4);
  await db.prepare('UPDATE Urgent SET deadline_at = ? WHERE urgent_id = ?').bind(new Date(Date.now() - 10000).toISOString(), U4).run();
  r = await call(mf, 'submitUrgent', C, U4);
  ok(r.ok && r.value.expired === true, 'เลยเวลา 10 วินาที → หมดเวลา ส่งไม่ได้', r.value);
  ok((await urg(U4)).status === 'expired' && !(await db.prepare("SELECT 1 FROM Submissions WHERE mission_id = ?").bind(U4).first()), 'ไม่มีรายการรออนุมัติ ไม่ได้ดาว');

  // ไม่เปิดดูจนหมดอายุ
  await call(mf, 'createUrgent', P1, Object.assign({}, base, { title: 'รดน้ำต้นไม้' }));
  kd = (await call(mf, 'getChildDashboard', C)).value; const U5 = kd.urgent.active[0].urgent_id;
  await db.prepare('UPDATE Urgent SET open_until = ? WHERE urgent_id = ?').bind(new Date(Date.now() - 1000).toISOString(), U5).run();
  pd = (await call(mf, 'getParentDashboard', P2)).value;
  ok((await urg(U5)).status === 'expired', 'ไม่เปิดดูเลยจนหมดอายุ → ปิดเอง');

  // เห็นป้ายแล้วไม่กดรับ → ครบ 1 นาทีเริ่มนับเอง (นับจากเวลาครบ 1 นาที)
  await call(mf, 'createUrgent', P1, Object.assign({}, base, { title: 'ปิดไฟ', minutes: 10 }));
  kd = (await call(mf, 'getChildDashboard', C)).value; const U9 = kd.urgent.active[0].urgent_id;
  await call(mf, 'urgentSeen', C, U9);
  const seenAt = Date.now() - 90000;
  await db.prepare('UPDATE Urgent SET seen_at = ? WHERE urgent_id = ?').bind(new Date(seenAt).toISOString(), U9).run();
  kd = (await call(mf, 'getChildDashboard', C)).value;
  const u9 = await urg(U9);
  ok(u9.status === 'running' && Math.abs(new Date(u9.deadline_at) - (seenAt + 60000 + 600000)) < 1500, 'ไม่กดรับ → เริ่มนับเองที่ 1 นาทีหลังเห็นป้าย', { accepted: u9.accepted_at, dl: u9.deadline_at });
  await call(mf, 'declineUrgent', C, U9);

  // ยกเลิก
  r = await call(mf, 'createUrgent', P1, Object.assign({}, base, { title: 'เก็บขยะ', childIds: [C, C2] }));
  ok(r.ok && r.value.count === 2, 'ส่งให้ลูก 2 คนพร้อมกัน → แยกคนละแถว');
  const batch6 = r.value.batchId;
  const rows6 = (await db.prepare('SELECT * FROM Urgent WHERE batch_id = ?').bind(batch6).all()).results;
  await call(mf, 'acceptUrgent', C, rows6.find(x => x.child_id === C).urgent_id);
  const after = (await db.prepare('SELECT * FROM Urgent WHERE batch_id = ?').bind(batch6).all()).results;
  ok(after.find(x => x.child_id === C).status === 'running' && after.find(x => x.child_id === C2).status === 'pending', 'แต่ละคนนับเวลาของตัวเอง');
  ok(!(await call(mf, 'cancelUrgent', C, batch6)).ok, 'เด็กยกเลิกไม่ได้');
  r = await call(mf, 'cancelUrgent', P2, batch6);
  ok(r.ok && r.value.cancelled === 2, 'ผู้ปกครองยกเลิก → ปิดทั้ง 2 คน');
  r = await call(mf, 'submitUrgent', C, rows6.find(x => x.child_id === C).urgent_id);
  ok(!r.ok && /ยกเลิก/.test(r.error), 'ยกเลิกแล้วเด็กส่งไม่ได้', r.error);

  // เตือนใกล้หมดเวลา
  await call(mf, 'createUrgent', P1, Object.assign({}, base, { title: 'อาบน้ำ', minutes: 10 }));
  kd = (await call(mf, 'getChildDashboard', C)).value; const U7 = kd.urgent.active[0].urgent_id;
  await call(mf, 'acceptUrgent', C, U7);
  await db.prepare('UPDATE Urgent SET deadline_at = ? WHERE urgent_id = ?').bind(new Date(Date.now() + 100000).toISOString(), U7).run();
  pushes.length = 0;
  await call(mf, 'getParentDashboard', P2);
  await sleep(300);
  ok(!!(await urg(U7)).reminded_at, 'เหลือ < 20% → ส่งเตือนเด็ก (ครั้งเดียว)');
  log = await db.prepare("SELECT COUNT(*) AS n FROM PushLog WHERE kind = 'urgent' AND member_id = ?").bind(C).first();
  await call(mf, 'getParentDashboard', P2); await sleep(200);
  const log2 = await db.prepare("SELECT COUNT(*) AS n FROM PushLog WHERE kind = 'urgent' AND member_id = ?").bind(C).first();
  ok(log2.n === log.n, 'ไม่เตือนซ้ำ');
  await call(mf, 'declineUrgent', C, U7);

  // นาฬิกาปลุก: หมดเวลาเองแม้ไม่มีใครเปิดแอป (ใช้เวลาจริง ~65 วินาที)
  await call(mf, 'createUrgent', P1, Object.assign({}, base, { title: 'ใส่ชุดนอน', minutes: 1 }));
  kd = (await call(mf, 'getChildDashboard', C)).value; const U8 = kd.urgent.active[0].urgent_id;
  await call(mf, 'acceptUrgent', C, U8);
  const t0 = Date.now();
  let st = 'running';
  while (Date.now() - t0 < 80000 && st === 'running') { await sleep(2000); st = (await urg(U8)).status; }
  ok(st === 'expired', 'นาฬิกาปลุกปิดภารกิจเองตอนครบเวลา (' + Math.round((Date.now() - t0) / 1000) + ' วิ)');
  await sleep(500);
  log = await db.prepare("SELECT COUNT(*) AS n FROM PushLog WHERE kind = 'urgent' AND member_id = ? AND sent_at >= ?").bind(P2, new Date(t0).toISOString()).first();
  ok(log.n >= 1, 'ผู้ปกครองได้แจ้งเตือน "ทำไม่ทันเวลา"');

  // เครื่องที่แชร์กัน: เปิดแจ้งเตือนเด็กบนเครื่องที่เป็นของแม่ → ถามก่อน
  const kidTok = await sessionFor(db, C);
  const kauth = async (fn, ...args) => (await mf.dispatchFetch('http://local/auth/api/' + fn, { method: 'POST', headers: { cookie: 'sb_s=' + kidTok }, body: JSON.stringify({ args }) })).json();
  const subMom = { endpoint: 'https://push.example/mom', keys: { p256dh: 'x', auth: 'y' } };
  r = await kauth('kidPushState', subMom.endpoint);
  ok(r.ok && r.value.owner && !r.value.thisDevice && r.value.publicKey, 'เครื่องนี้รับแจ้งเตือนของผู้ปกครองอยู่ → แจ้งชื่อเจ้าของ', r.value);
  r = await kauth('kidPushSubscribe', subMom);
  ok(r.ok && r.value.needConfirm, 'ไม่ย้ายเครื่องจนกว่าจะยืนยัน');
  r = await kauth('kidPushSubscribe', subMom, true);
  const own = await db.prepare('SELECT member_id FROM PushSubs WHERE endpoint = ?').bind(subMom.endpoint).first();
  ok(r.ok && own.member_id === C, 'ยืนยัน → เครื่องนี้รับแจ้งเตือนของเด็ก');
  const ch = await db.prepare('SELECT notify_channel FROM Members WHERE member_id = ?').bind(P2).first();
  ok(ch.notify_channel === 'line', 'ผู้ปกครองที่ไม่เหลือเครื่องแอป → กลับไปรับทาง LINE', ch);
  const ptok = await sessionFor(db, P2);
  r = await (await mf.dispatchFetch('http://local/auth/api/kidPushSubscribe', { method: 'POST', headers: { cookie: 'sb_s=' + ptok }, body: JSON.stringify({ args: [subMom] }) })).json();
  ok(!r.ok, 'บัญชีผู้ปกครองใช้คำสั่งของเด็กไม่ได้');

  // ของขวัญ
  const g0 = await bal(C);
  const stats0 = (await call(mf, 'getChildDashboard', C)).value.stats;
  ok(!(await call(mf, 'sendGift', C, { stars: 5, childIds: [C] })).ok, 'เด็กส่งของขวัญไม่ได้');
  ok(!(await call(mf, 'sendGift', P2, { stars: 0, childIds: [C] })).ok, 'ดาว 0 → ไม่ได้');
  ok(!(await call(mf, 'sendGift', P2, { stars: 10000, childIds: [C] })).ok, 'เกิน 9,999 → ไม่ได้ (กันพิมพ์ผิด)');
  pushes.length = 0;
  r = await call(mf, 'sendGift', P2, { stars: 250, reason: 'comfort', message: 'สู้ ๆ นะลูก', childIds: [C, C2] });
  ok(r.ok && r.value.count === 2, 'ส่งของขวัญ 250 ดาวให้ลูก 2 คน (ไม่จำกัดจำนวน)');
  await sleep(300);
  log = await db.prepare("SELECT COUNT(*) AS n FROM PushLog WHERE kind = 'gift' AND member_id = ?").bind(C).first();
  ok(log.n >= 1, 'เด็กได้แจ้งเตือนของขวัญ');
  kd = (await call(mf, 'getChildDashboard', C)).value;
  ok(kd.gifts.unopened.length === 1 && kd.gifts.unopened[0].message === 'สู้ ๆ นะลูก' && kd.gifts.unopened[0].reason_label === '🤗 ปลอบใจ', 'หน้าเด็ก: มีกล่องรอเปิด', kd.gifts.unopened[0]);
  ok(kd.stats.balance === g0, 'ยังไม่เปิด → ดาวยังไม่เข้า');
  const G1 = kd.gifts.unopened[0].gift_id;
  ok(!(await call(mf, 'openGift', C2, G1)).ok, 'เด็กคนอื่นเปิดกล่องของพี่ไม่ได้');
  r = await call(mf, 'openGift', C, G1);
  ok(r.ok && r.value.stars === 250 && r.value.balance === g0 + 250, 'เปิดกล่อง → ได้ 250 ดาวทันที', r.value);
  r = await call(mf, 'openGift', C, G1);
  ok(r.ok && r.value.balance === g0 + 250, 'เปิดซ้ำ → ไม่ได้ดาวซ้ำ');
  kd = (await call(mf, 'getChildDashboard', C)).value;
  ok(kd.stats.missionsCompleted === stats0.missionsCompleted && kd.stats.giftStars === 250 && kd.stats.totalEarned === stats0.totalEarned + 250, 'ไม่นับเป็นภารกิจ · นับในดาวที่ได้รับ', kd.stats);
  ok(kd.gifts.opened.some(g => g.gift_id === G1), 'ประวัติของขวัญ');
  pd = (await call(mf, 'getParentDashboard', P2)).value;
  ok(pd.children.find(c => c.member_id === C).stats.balance === g0 + 250, 'ผู้ปกครองเห็นยอดใหม่');
  // ใช้ดาวจากของขวัญแลกรางวัลได้ (ตัวกันดาวติดลบในฐานข้อมูลนับของขวัญด้วย)
  await db.prepare("INSERT INTO Rewards (reward_id, family_id, title, stars_cost, type, quantity, icon, is_active, created_at) VALUES ('rbig', ?, 'รางวัลใหญ่', ?, 'physical', 5, '🎁', 1, ?)").bind(FAM, g0 + 200, new Date().toISOString()).run();
  r = await call(mf, 'redeemReward', 'rbig', C, FAM);
  ok(r.ok, 'แลกรางวัลด้วยดาวจากของขวัญได้', r.error);
  ok(await bal(C) === 50, 'ยอดหลังแลกถูกต้อง', await bal(C));
  r = await call(mf, 'redeemReward', 'rbig', C, FAM);
  ok(!r.ok && /ดาวไม่พอ/.test(r.error), 'ดาวไม่พอ → แลกไม่ได้ (ยังกันติดลบ)');
  // ยกเลิกของขวัญที่ยังไม่เปิด
  const G2 = (await db.prepare("SELECT gift_id FROM Gifts WHERE child_id = ? AND status = 'sent'").bind(C2).first()).gift_id;
  ok(!(await call(mf, 'cancelGift', C2, G2)).ok, 'เด็กยกเลิกไม่ได้');
  r = await call(mf, 'cancelGift', P1, G2);
  ok(r.ok, 'ผู้ปกครองยกเลิกของขวัญที่ยังไม่เปิด');
  r = await call(mf, 'openGift', C2, G2);
  ok(!r.ok && /ยกเลิก/.test(r.error), 'ยกเลิกแล้วเปิดไม่ได้');
  ok(!(await call(mf, 'cancelGift', P1, G1)).ok, 'เปิดไปแล้ว → ยกเลิกไม่ได้');
  pd = (await call(mf, 'getParentDashboard', P2)).value;
  ok(pd.gifts.length === 2 && pd.gifts.some(g => g.status === 'opened') && pd.gifts.some(g => g.status === 'cancelled'), 'ผู้ปกครองเห็นสถานะของขวัญ');

  // ภารกิจปกติยังทำงานเหมือนเดิม
  const md = (await call(mf, 'getChildDashboard', C)).value;
  const m0 = md.missions[0];
  r = await call(mf, 'submitMission', m0.mission_id, C, FAM);
  const r2 = await call(mf, 'reviewSubmission', r.value, 'approved', P1);
  ok(r.ok && r2.ok && r2.value.starsEarned === Number(m0.base_stars) * Number(m0.multiplier || 1), 'ภารกิจปกติ: ส่ง + อนุมัติได้ดาวตามเดิม');

  await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
