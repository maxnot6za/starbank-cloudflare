// ภารกิจประจำวัน + ดาวม่วง + ร้านค้าตัวละคร
const { seedFamily, FAM, P1, P2, P3, C, START_BALANCE } = require('./lib/fixture.js');
const { start, call } = require('./lib/mf.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
const thaiToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
(async () => {
  const { mf, db } = await start({ outbound: async () => new Response('', { status: 201 }) });
  await seedFamily(db);
  const today = thaiToday();
  const q = async (owner) => db.prepare('SELECT * FROM DailyQuests WHERE family_id = ? AND date = ? AND owner = ?').bind(FAM, today, owner).first();
  const purple = async () => (await db.prepare('SELECT purple FROM Families WHERE family_id = ?').bind(FAM).first()).purple;

  // --- สุ่มภารกิจ ---
  let pd = (await call(mf, 'getParentDashboard', P1)).value;
  ok(pd.daily && pd.daily.parents && pd.daily.kids.length === 1, 'เปิดแอปครั้งแรกของวัน → ได้ภารกิจผู้ปกครอง 1 + เด็ก 1', pd.daily);
  ok(pd.daily.seen === false, 'ยังไม่เห็น popup วันนี้');
  ok(['urgent_send', 'approve', 'gift'].includes(pd.daily.parents.type), 'ภารกิจผู้ปกครองมาจาก pool ผู้ปกครอง', pd.daily.parents.type);
  ok(['kid_submit', 'kid_urgent'].includes(pd.daily.kids[0].type), 'ไม่มีภารกิจคูณดาวในครอบครัว → ไม่สุ่ม "ทำภารกิจที่มีตัวคูณ"', pd.daily.kids[0].type);
  const pd2 = (await call(mf, 'getParentDashboard', P2)).value;
  ok(pd2.daily.parents.quest_id === pd.daily.parents.quest_id, 'ผู้ปกครองทุกคนได้ภารกิจเดียวกัน');
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM DailyQuests WHERE family_id = ?').bind(FAM).first()).n;
  ok(n === 2, 'เปิดซ้ำไม่สุ่มใหม่', n);
  const kd = (await call(mf, 'getChildDashboard', C)).value;
  ok(kd.daily.mine.length === 1 && kd.daily.mine[0].owner === C, 'เด็กเห็นภารกิจของตัวเอง', kd.daily.mine);
  const other = (await call(mf, 'getParentDashboard', P3)).value;
  ok(other.daily.kids.length === 0 && other.daily.parents.quest_id.indexOf(FAM) < 0, 'บ้านอื่นไม่เห็นภารกิจบ้านนี้');

  // --- popup วันละครั้ง ---
  await call(mf, 'questSeen', C);
  ok((await call(mf, 'getChildDashboard', C)).value.daily.seen === true, 'กดปิด popup → วันนี้ไม่เด้งอีก (ทุกเครื่อง)');
  ok((await call(mf, 'getParentDashboard', P1)).value.daily.seen === false, 'ของคนอื่นยังเด้ง');

  // --- นับความคืบหน้า (บังคับประเภทเพื่อทดสอบ) ---
  await db.prepare("UPDATE DailyQuests SET type = 'approve', target = 2, reward = 2 WHERE owner = 'parents' AND family_id = ?").bind(FAM).run();
  await db.prepare("UPDATE DailyQuests SET type = 'kid_submit', target = 2, reward = 2 WHERE owner = ? AND family_id = ?").bind(C, FAM).run();
  let r = await call(mf, 'submitMission', 'm1', C, FAM);
  ok((await q(C)).progress === 0, 'เด็กกดส่ง → ยังไม่นับ (นับตอนอนุมัติ)');
  await call(mf, 'reviewSubmission', r.value, 'approved', P2);
  ok((await q('parents')).progress === 1 && (await q(C)).progress === 1, 'แม่อนุมัติ → นับทั้งภารกิจผู้ปกครองและเด็ก');
  r = await call(mf, 'submitMission', 'm2', C, FAM);
  await call(mf, 'reviewSubmission', r.value, 'rejected', P1);
  ok((await q('parents')).progress === 1, 'ปฏิเสธ → ไม่นับ');
  ok(!(await call(mf, 'claimQuest', P1, (await q('parents')).quest_id)).ok, 'ยังไม่ครบ → รับรางวัลไม่ได้');
  r = await call(mf, 'submitMission', 'm2', C, FAM);
  await call(mf, 'reviewSubmission', r.value, 'approved', P1);
  ok((await q('parents')).status === 'done' && (await q(C)).status === 'done', 'ครบเป้า → สถานะทำสำเร็จ (รอกดรับ)');
  r = await call(mf, 'submitMission', 'm2', C, FAM);
  await call(mf, 'reviewSubmission', r.value, 'approved', P1);
  ok((await q('parents')).progress === 2, 'ครบแล้วไม่นับเกิน');

  // --- รับรางวัล → กระเป๋าครอบครัว ---
  ok(!(await call(mf, 'claimQuest', C, (await q('parents')).quest_id)).ok, 'เด็กกดรับภารกิจผู้ปกครองไม่ได้');
  r = await call(mf, 'claimQuest', P2, (await q('parents')).quest_id);
  ok(r.ok && r.value.reward === 2 && r.value.wallet.purple === 2, 'ผู้ปกครองกดรับ → ดาวม่วงครอบครัว +2', r.value);
  r = await call(mf, 'claimQuest', P1, (await q('parents')).quest_id);
  ok(r.ok && r.value.already && (await purple()) === 2, 'กดรับซ้ำ → ไม่ได้ซ้ำ');
  r = await call(mf, 'claimQuest', C, (await q(C)).quest_id);
  ok(r.ok && (await purple()) === 4, 'เด็กกดรับของตัวเอง → เข้ากระเป๋าครอบครัวเดียวกัน', await purple());
  const kstats = (await call(mf, 'getChildDashboard', C)).value.stats;
  ok(kstats.balance === START_BALANCE + 3 + 1 + 1, 'ดาวม่วงไม่ปนกับดาวสะสมของเด็ก', kstats.balance);

  // --- ลืมกดรับ → เก็บให้ตอนข้ามวัน ---
  const y = new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
  await db.prepare("INSERT INTO DailyQuests (quest_id, family_id, date, owner, type, target, progress, reward, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(FAM + '|' + y + '|old', FAM, y, C, 'kid_urgent', 1, 1, 3, 'done', new Date().toISOString()).run();
  await call(mf, 'getParentDashboard', P1);
  const old = await db.prepare('SELECT status, claimed_by FROM DailyQuests WHERE quest_id = ?').bind(FAM + '|' + y + '|old').first();
  ok(old.status === 'claimed' && old.claimed_by === 'auto' && (await purple()) === 7, 'ภารกิจเมื่อวานที่ลืมกด → เก็บให้อัตโนมัติ', { old, p: await purple() });

  // --- ภารกิจด่วน + ของขวัญ นับ ---
  await db.prepare("UPDATE DailyQuests SET type = 'urgent_send', target = 1, progress = 0, status = 'active' WHERE owner = 'parents' AND date = ?").bind(today).run();
  await call(mf, 'createUrgent', P1, { title: 'เก็บของ', stars: 3, minutes: 10, childIds: [C] });
  ok((await q('parents')).status === 'done', 'ส่งภารกิจด่วน → นับ');
  await db.prepare("UPDATE DailyQuests SET type = 'gift', target = 1, progress = 0, status = 'active' WHERE owner = 'parents' AND date = ?").bind(today).run();
  await call(mf, 'sendGift', P1, { stars: 1, childIds: [C] });
  ok((await q('parents')).status === 'done', 'ส่งของขวัญ → นับ');
  await db.prepare("UPDATE DailyQuests SET type = 'kid_urgent', target = 1, progress = 0, status = 'active' WHERE owner = ? AND date = ?").bind(C, today).run();
  const U = (await call(mf, 'getChildDashboard', C)).value.urgent.active[0].urgent_id;
  await call(mf, 'acceptUrgent', C, U);
  r = await call(mf, 'submitUrgent', C, U);
  await call(mf, 'reviewSubmission', r.value.submissionId, 'approved', P2);
  ok((await q(C)).status === 'done', 'ภารกิจด่วนของเด็กได้รับอนุมัติ → นับ');

  // --- ร้านค้า ---
  await db.prepare('UPDATE Families SET purple = 30 WHERE family_id = ?').bind(FAM).run();
  let shop = (await call(mf, 'getShop', C)).value;
  ok(shop.canBuy === false && shop.items.filter(i => i.kind === 'avatar').length === 6, 'เด็กเปิดร้านได้ แต่ซื้อไม่ได้');
  ok(shop.firstDiscount && shop.items.every(i => i.pay === Math.ceil(i.price / 2)), 'ตัวแรกของครอบครัวลด 50%', shop.items.map(i => i.pay));
  ok(!(await call(mf, 'buyItem', C, 'dino_kid', C)).ok, 'เด็กยิงคำสั่งซื้อตรง ๆ → ถูกปฏิเสธ');
  r = await call(mf, 'wishItem', C, 'dino_kid');
  ok(r.ok && r.value.wished, 'เด็กกด "อยากได้"');
  shop = (await call(mf, 'getShop', P1)).value;
  ok(shop.items.find(i => i.id === 'dino_kid').wishedBy.length === 1, 'ผู้ปกครองเห็นว่าลูกอยากได้');
  ok(!(await call(mf, 'buyItem', P1, 'dino_dad', C)).ok, 'ตัวละครพ่อให้เด็กใช้ไม่ได้');
  r = await call(mf, 'buyItem', P1, 'dino_kid', C);
  ok(r.ok && r.value.paid === 15 && (await purple()) === 15, 'ซื้อตัวแรก จ่าย 15 ดาวม่วง', r.error || r.value.paid);
  ok(r.value.shop.items.find(i => i.id === 'dino_kid').wishedBy.length === 0, 'ซื้อแล้ว → ป้าย "อยากได้" หายไป');
  ok(!(await call(mf, 'buyItem', P2, 'dino_kid', C)).ok, 'ซื้อซ้ำไม่ได้');
  r = await call(mf, 'buyItem', P1, 'dino_mom', P2);
  ok(!r.ok && /ไม่พอ/.test(r.error) && (await purple()) === 15, 'ตัวที่สองราคาเต็ม 30 → ดาวม่วงไม่พอ', r.error);
  let blocked = false;
  try { await db.prepare('UPDATE Families SET purple = -1 WHERE family_id = ?').bind(FAM).run(); } catch (e) { blocked = true; }
  ok(blocked, 'ฐานข้อมูลกันดาวม่วงติดลบ');
  await db.prepare('UPDATE Families SET purple = 100 WHERE family_id = ?').bind(FAM).run();
  r = await call(mf, 'buyItem', P2, 'dino_mom', P2);
  ok(r.ok && r.value.paid === 30, 'ตัวที่สองราคาเต็ม', r.value && r.value.paid);
  r = await call(mf, 'buyItem', P1, 'dino_dad', P2);
  ok(r.ok, 'ซื้อพ่อไดโนให้แม่ใช้ (ผู้ปกครองคนไหนก็ได้)');
  const av = (await call(mf, 'getChildDashboard', C)).value.avatars;
  ok(av.length === 2 && av.some(a => a.sprite === 'dino' && a.member_id === C) && av.some(a => a.sprite === 'dad' && a.member_id === P2), '1 คนใช้ได้ 1 ตัว (แม่เปลี่ยนจากแม่ไดโนเป็นพ่อไดโน)', av);
  r = await call(mf, 'assignAvatar', P1, 'dino_mom', P1);
  ok(r.ok, 'ย้ายแม่ไดโนให้พ่อใช้');
  ok(!(await call(mf, 'assignAvatar', C, 'dino_mom', P2)).ok, 'เด็กเปลี่ยนอวาตาร์ไม่ได้');
  const av2 = (await call(mf, 'getParentDashboard', P3)).value.avatars;
  ok(av2.length === 0, 'บ้านอื่นไม่เห็นตัวละครบ้านนี้');
  const log = (await db.prepare('SELECT COUNT(*) AS n, SUM(amount) AS s FROM WalletLog WHERE family_id = ?').bind(FAM).first());
  ok(log.n >= 6, 'ทุกการรับ/จ่ายบันทึกในสมุดบัญชี', log);

  // --- พื้น / ของตกแต่ง ---
  let st = (await call(mf, 'getChildDashboard', C)).value.stage;
  ok(st && st.floor.id === 'floor_wood' && st.wall.id === 'wall_cream' && Array.isArray(st.decor) && st.decor.length === 0, 'ค่าเริ่มต้น: พื้นไม้ + ห้องว่าง', st);
  shop = (await call(mf, 'getShop', P1)).value;
  const wood = shop.items.find(i => i.id === 'floor_wood');
  ok(wood && wood.free && wood.owned && wood.inUse === true, 'พื้นไม้ฟรี มีแล้ว ใช้อยู่', wood);
  r = await call(mf, 'buyItem', P1, 'floor_wood', ''); ok(!r.ok, 'ซื้อพื้นฟรีซ้ำไม่ได้');
  r = await call(mf, 'setFloor', C, 'floor_wood'); ok(!r.ok, 'เด็กเปลี่ยนพื้นไม่ได้');
  r = await call(mf, 'setFloor', P1, 'dino_kid'); ok(!r.ok, 'ตัวละครใช้เป็นพื้นไม่ได้');
  r = await call(mf, 'setFloor', P1, 'floor_wood'); ok(r.ok && r.value.stage.floor.id === 'floor_wood', 'ผู้ปกครองตั้งพื้นได้');
  r = await call(mf, 'setWall', P1, 'wall_cream'); ok(r.ok && r.value.stage.wall.id === 'wall_cream', 'ผู้ปกครองตั้งผนังได้');
  r = await call(mf, 'setWall', P1, 'floor_wood'); ok(!r.ok, 'พื้นใช้เป็นผนังไม่ได้');
  r = await call(mf, 'saveRoom', P1, JSON.stringify([{ id: 'floor_wood', x: .5 }])); ok(!r.ok, 'พื้นวางเป็นของตกแต่งไม่ได้');
  r = await call(mf, 'saveRoom', P1, '[]'); ok(r.ok && r.value.stage.decor.length === 0, 'ล้างห้องได้');
  await db.prepare("UPDATE Families SET stage = ? WHERE family_id = ?").bind('{"floor":"nope","decor":[{"id":"x","x":0.5}]}', FAM).run();
  st = (await call(mf, 'getParentDashboard', P1)).value.stage;
  ok(st.floor.id === 'floor_wood' && st.decor.length === 0, 'ข้อมูลเสีย/ของไม่รู้จัก → กลับเป็นค่าเริ่มต้น', st);

  await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
