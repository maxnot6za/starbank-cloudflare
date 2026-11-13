// ดาวม่วง: ข่าว "คนอื่นรับให้" (news) + เป้าหมายถัดไป (goal) + purpleSeen
const { seedFamily, FAM, P1, C } = require('./lib/fixture.js');
const { start, call } = require('./lib/mf.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ outbound: async () => new Response('', { status: 201 }) });
  await seedFamily(db);
  let kd = (await call(mf, 'getChildDashboard', C)).value.daily;
  ok(kd.news === null, 'ยังไม่มีข่าวดาวม่วง');
  ok(kd.goal && kd.goal.none, 'ยังไม่มีของที่อยากได้ → goal.none (ชวนไปกด)', kd.goal);
  // พ่อตั้งเป้าหมายของบ้าน → ลูกก็เห็น
  let w = await call(mf, 'wishItem', P1, 'decor_tree'); ok(w.ok && w.value.wished, 'ผู้ปกครองกดตั้งเป้าหมายได้', w.error);
  kd = (await call(mf, 'getChildDashboard', C)).value.daily;
  ok(kd.goal.id === 'decor_tree' && !kd.goal.byKid, 'ลูกเห็นเป้าหมายที่พ่อตั้ง', kd.goal);
  await call(mf, 'wishItem', P1, 'decor_tree');   // ยกเลิก
  // ลูกกด "อยากได้" ไดโนชมพู → เป้าหมายของลูกเป็นชิ้นนั้น
  await call(mf, 'wishItem', C, 'pet_dino_pink');
  kd = (await call(mf, 'getChildDashboard', C)).value.daily;
  ok(kd.goal.id === 'pet_dino_pink' && kd.goal.byKid, 'เป้าหมาย = ของที่ลูกอยากได้', kd.goal);
  // ภารกิจของลูกครบ → พ่อกดรับแทน
  await db.prepare("UPDATE DailyQuests SET status = 'done', progress = target, reward = 4 WHERE owner = ? AND family_id = ?").bind(C, FAM).run();
  const qid = (await db.prepare('SELECT quest_id FROM DailyQuests WHERE owner = ?').bind(C).first()).quest_id;
  const r = await call(mf, 'claimQuest', P1, qid);
  ok(r.ok && r.value.reward === 4 && r.value.goal && r.value.owner, 'พ่อรับแทน → ได้ goal + ชื่อเจ้าของภารกิจ', r.value);
  kd = (await call(mf, 'getChildDashboard', C)).value.daily;
  ok(kd.news && kd.news.total === 4 && kd.news.items[0].byRole === 'parent', 'ลูกเห็นข่าว "+4 พ่อรับให้"', kd.news);
  const pd = (await call(mf, 'getParentDashboard', P1)).value.daily;
  ok(pd.news === null, 'พ่อ (คนกดเอง) ไม่เห็นข่าวซ้ำ', pd.news);
  await call(mf, 'purpleSeen', C, kd.news.until);
  kd = (await call(mf, 'getChildDashboard', C)).value.daily;
  ok(kd.news === null, 'เห็นแล้ว → ไม่ขึ้นซ้ำ');
  await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
