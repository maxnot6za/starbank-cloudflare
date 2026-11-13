// ไข่ปริศนา + ของตกแต่ง + จัดห้อง (API)
const { seedFamily, FAM, P1, P2, C } = require('./lib/fixture.js');
const { start, call } = require('./lib/mf.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ outbound: async () => new Response('', { status: 201 }) });
  await seedFamily(db);
  const approve = async () => { const s = await call(mf, 'submitMission', 'm1', C, FAM); return call(mf, 'reviewSubmission', s.value, 'approved', P2); };
  const egg = async () => db.prepare("SELECT * FROM Eggs WHERE family_id = ? AND status != 'hatched'").bind(FAM).first();
  const day = (n) => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);

  // --- เจอไข่: การันตีครั้งที่ 8 ---
  let n = 0;
  while (!(await egg()) && n < 8) { await approve(); n++; }
  ok(await egg(), 'อนุมัติไม่เกิน 8 ครั้ง → เจอไข่แน่นอน', { n });
  const e0 = await egg();
  ok(e0.found_by === C && e0.goal === 15 && e0.warm === 0, 'ไข่ใบใหม่: เด็กคนที่ส่งงานเป็นคนเจอ · เป้า 15');
  ok(['normal', 'rare'].includes(e0.tier), 'ไข่มีระดับ normal/rare', e0.tier);
  await db.prepare("UPDATE Eggs SET tier = 'normal'").run();   // ทดสอบไข่ธรรมดาก่อน
  ok((await db.prepare('SELECT egg_pity FROM Families WHERE family_id = ?').bind(FAM).first()).egg_pity === 0, 'เจอไข่แล้ว รีเซ็ตตัวนับ');
  let cd = (await call(mf, 'getChildDashboard', C)).value;
  ok(cd.egg.current && cd.egg.event && cd.egg.event.type === 'found', 'dashboard มีไข่ + เหตุการณ์ "เจอไข่" ที่ยังไม่เห็น', cd.egg.event);

  // --- อนุมัติ +1 · กอด +1 · เพดานวันละ 5 ---
  await approve();
  ok((await egg()).warm === 1, 'อนุมัติภารกิจ +1 ความอบอุ่น');
  let r = await call(mf, 'hugEgg', P1); ok(r.ok && r.value.added === 1, 'ผู้ปกครองกอดไข่ +1');
  r = await call(mf, 'hugEgg', P1); ok(!r.ok, 'กอดซ้ำในวันเดียวไม่ได้');
  await call(mf, 'hugEgg', P2); await call(mf, 'hugEgg', C); await approve(); await approve();
  ok((await egg()).warm === 5, 'วันละไม่เกิน 5 แต้ม', (await egg()).warm);
  cd = (await call(mf, 'getChildDashboard', C)).value;
  ok(cd.egg.current.todayLeft === 0, 'วันนี้เต็มเพดานแล้ว');
  // ข้ามวัน
  await db.prepare('UPDATE Eggs SET day = ?, warm = 14 WHERE family_id = ?').bind(day(-1), FAM).run();
  await approve();
  ok((await egg()).status === 'ready', 'ครบ 15 → พร้อมฟัก');
  r = await call(mf, 'hugEgg', P1); ok(!r.ok, 'พร้อมฟักแล้วกอดไม่ได้');

  // --- ฟัก ---
  r = await call(mf, 'hatchEgg', P1); ok(!r.ok, 'ผู้ปกครองฟักไม่ได้ (ให้ลูกฟัก)');
  r = await call(mf, 'hatchEgg', C);
  ok(r.ok && r.value.prize && r.value.prize.kind === 'decor', 'ลูกฟัก → ได้ของตกแต่ง', r.value && r.value.prize);
  const got = r.value.prize.id;
  ok(!!(await db.prepare('SELECT 1 FROM Inventory WHERE family_id = ? AND item_id = ?').bind(FAM, got).first()), 'ของเข้าคลังของครอบครัว');
  let pd = (await call(mf, 'getParentDashboard', P1)).value;
  ok(pd.egg.event && pd.egg.event.type === 'hatched' && pd.egg.event.prize.id === got && pd.egg.event.by, 'ผู้ปกครองเห็นเหตุการณ์ฟัก (ยังไม่เห็น)', pd.egg.event);
  cd = (await call(mf, 'getChildDashboard', C)).value;
  ok(!cd.egg.event, 'ลูกที่ฟักเอง ไม่ต้องเห็นป๊อปอัปซ้ำ');
  await call(mf, 'eggSeen', P1, pd.egg.event.key);
  pd = (await call(mf, 'getParentDashboard', P1)).value;
  ok(!pd.egg.event && !pd.egg.current, 'เห็นแล้วไม่ขึ้นซ้ำ · ไม่มีไข่ค้าง');
  ok(pd.egg.pool.length === 12 && pd.egg.pool.filter(p => p.owned).length === 1, 'ของจากไข่ 12 ชิ้น มีแล้ว 1');

  // --- ของครบ → ดาวม่วง ---
  const eggItems = ['plant', 'lamp', 'bear', 'toybox', 'shelf', 'beanbag', 'ball', 'horse', 'rocket', 'blocks', 'drum', 'tent'].map(a => 'decor_' + a);
  for (const id of eggItems) await db.prepare("INSERT OR IGNORE INTO Inventory (inv_id,family_id,item_id,price,currency,bought_by,bought_at,assigned_to) VALUES (?,?,?,0,'egg',?,'','')").bind('x' + id, FAM, id, C).run();
  await db.prepare("INSERT INTO Eggs (egg_id,family_id,status,warm,goal,day,day_warm,contrib,hugs,found_by,found_at,hatched_by,hatched_at,prize,created_at) VALUES (?,?,'ready',15,15,'',0,'{}','{}',?,'','','','','')").bind(FAM + '|9', FAM, C).run();
  const before = (await db.prepare('SELECT purple FROM Families WHERE family_id = ?').bind(FAM).first()).purple;
  r = await call(mf, 'hatchEgg', C);
  ok(r.ok && r.value.prize.kind === 'purple' && r.value.prize.amount === 15, 'ของจากไข่ครบแล้ว → ได้ดาวม่วง 15');
  ok((await db.prepare('SELECT purple FROM Families WHERE family_id = ?').bind(FAM).first()).purple === before + 15, 'ดาวม่วงเข้ากระเป๋า');

  // --- ร้าน: ของคริสต์มาสซื้อได้ 10 · ของจากไข่ซื้อไม่ได้ ---
  let shop = (await call(mf, 'getShop', P1)).value;
  const tree = shop.items.find(i => i.id === 'decor_tree'), drum = shop.items.find(i => i.id === 'decor_drum');
  ok(tree && tree.price === 10 && !tree.egg && drum && drum.egg, 'ต้นคริสต์มาส 10 ดาวม่วง · กลองได้จากไข่');
  ok(tree.pay === 10, 'ครอบครัวมีของแล้ว → ไม่ลด 50%');
  r = await call(mf, 'buyItem', P1, 'decor_drum', ''); ok(!r.ok, 'ของจากไข่ซื้อไม่ได้');
  r = await call(mf, 'buyItem', P1, 'decor_tree', ''); ok(r.ok && r.value.paid === 10, 'ซื้อต้นคริสต์มาส 10 ดาวม่วง');

  // --- จัดห้อง ---
  r = await call(mf, 'saveRoom', C, JSON.stringify([{ id: 'decor_tree', x: .2, s: 1 }])); ok(!r.ok, 'เด็กจัดห้องไม่ได้');
  r = await call(mf, 'saveRoom', P1, JSON.stringify([{ id: 'decor_tree', x: .2, s: 1.2 }, { id: 'decor_drum', x: 1.5, s: 9 }]));
  ok(r.ok && r.value.stage.decor.length === 2, 'บันทึกห้องได้');
  const dd = r.value.stage.decor;
  ok(dd[1].x === 0.96 && dd[1].s === 1.6 && dd[0].h === 1, 'ตำแหน่ง/ขนาดถูกจำกัด · มีความสูงเทียบตัวละคร', dd);
  r = await call(mf, 'saveRoom', P1, JSON.stringify([{ id: 'decor_gifts', x: .5 }])); ok(!r.ok, 'ของที่ยังไม่มี วางไม่ได้');
  r = await call(mf, 'saveRoom', P1, JSON.stringify(eggItems.map((id, i) => ({ id, x: i / 12 })))); ok(!r.ok, 'เกิน 8 ชิ้นไม่ได้');
  cd = (await call(mf, 'getChildDashboard', C)).value;
  ok(cd.stage.decor.length === 2 && cd.stage.decor[0].id === 'decor_tree', 'เด็กเห็นห้องเดียวกัน');

  // --- คูปองจากไข่ ---
  await db.prepare("UPDATE Families SET purple = 100 WHERE family_id = ?").bind(FAM).run();
  await db.prepare("INSERT INTO Coupons (coupon_id,family_id,pct,egg_id,created_at,used_at,used_on) VALUES ('c25',?,25,'x','', '', ''),('c10',?,10,'x','','','')").bind(FAM, FAM).run();
  let sh = (await call(mf, 'getShop', P1)).value;
  ok(sh.coupons.length >= 2 && sh.coupons.some(c => c.id === 'c25') && sh.coupons.every((c, i, a) => !i || a[i - 1].pct >= c.pct), 'ร้านเห็นคูปอง (มากสุดก่อน)', sh.coupons);
  const xid = sh.items.find(i => i.set === 'xmas' && !i.owned).id;
  r = await call(mf, 'buyItem', P1, xid, '', 'c25');
  ok(r.ok && r.value.paid === 7, 'คูปอง 25% ของ 10 ดาว → 7 (ปัดลง)', r.value && r.value.paid);
  ok((await db.prepare("SELECT used_on FROM Coupons WHERE coupon_id='c25'").first()).used_on === xid, 'คูปองถูกใช้แล้ว');
  const xid2 = r.value.shop.items.find(i => i.set === 'xmas' && !i.owned).id;
  r = await call(mf, 'buyItem', P1, xid2, '', 'c25'); ok(!r.ok, 'ใช้คูปองซ้ำไม่ได้');
  await db.prepare("UPDATE Families SET purple = 5 WHERE family_id = ?").bind(FAM).run();
  r = await call(mf, 'buyItem', P1, xid2, '', 'c10'); ok(!r.ok, 'ดาวไม่พอ → ไม่เสียคูปอง');
  ok(!(await db.prepare("SELECT used_at FROM Coupons WHERE coupon_id='c10'").first()).used_at, 'คูปองยังอยู่');
  r = await call(mf, 'buyItem', C, xid2, '', 'c10'); ok(!r.ok, 'เด็กใช้คูปองซื้อไม่ได้');
  // ฟักแล้วได้คูปอง (บังคับสุ่ม)
  await db.prepare("INSERT INTO Eggs (egg_id,family_id,status,warm,goal,contrib,hugs,found_by,created_at) VALUES (?,?,'ready',15,15,'{}','{}',?, '')").bind(FAM + '|99', FAM, C).run();
  const R = Math.random; 
  r = await call(mf, 'hatchEgg', C);
  ok(r.ok, 'ฟักใบใหม่ได้');
  const pz = (await db.prepare("SELECT prize FROM Eggs WHERE egg_id = ?").bind(FAM + '|99').first()).prize;
  const cnt = (await db.prepare("SELECT COUNT(*) n FROM Coupons WHERE egg_id = ?").bind(FAM + '|99').first()).n;
  ok(/\+c\d+$/.test(pz) === (cnt === 1) && (!r.value.prize.coupon || [10, 25, 50].includes(r.value.prize.coupon)), 'รางวัล+คูปองตรงกับตาราง', { pz, cnt, p: r.value.prize });

  // --- ไข่ rare: ได้สัตว์เลี้ยง rare + เข้าห้อง · ครบแล้วได้ดาวม่วง 30 + คูปอง 50% · การันตีใบที่ 5 ---
  await db.prepare("UPDATE Families SET stage = NULL WHERE family_id = ?").bind(FAM).run();
  await db.prepare("INSERT INTO Eggs (egg_id,family_id,status,warm,goal,contrib,hugs,found_by,created_at,tier) VALUES (?,?,'ready',15,15,'{}','{}',?,'','rare')").bind(FAM + '|r1', FAM, C).run();
  let cv = (await call(mf, 'getChildDashboard', C)).value.egg;
  ok(cv.current.tier === 'rare' && cv.pool.length === 3 && cv.pool.every(p => p.sprite), 'ไข่ rare: รายการลุ้นเป็นสัตว์เลี้ยง 3 ตัว', cv.pool);
  r = await call(mf, 'hatchEgg', C);
  ok(r.ok && r.value.prize.kind === 'pet' && r.value.prize.tier === 'rare', 'ฟักไข่ rare → ได้สัตว์เลี้ยง rare', r.value && r.value.prize);
  const st = JSON.parse((await db.prepare('SELECT stage FROM Families WHERE family_id = ?').bind(FAM).first()).stage);
  ok(st.pets.includes(r.value.prize.id), 'สัตว์เลี้ยงจากไข่เข้าห้องเอง', st.pets);
  for (const id of ['pet_godzero', 'pet_puymek', 'pet_firedragon']) await db.prepare("INSERT OR IGNORE INTO Inventory (inv_id,family_id,item_id,price,currency,bought_by,bought_at,assigned_to) VALUES (?,?,?,0,'egg',?,'','')").bind('y' + id, FAM, id, C).run();
  await db.prepare("INSERT INTO Eggs (egg_id,family_id,status,warm,goal,contrib,hugs,found_by,created_at,tier) VALUES (?,?,'ready',15,15,'{}','{}',?,'','rare')").bind(FAM + '|r2', FAM, C).run();
  const pb = (await db.prepare('SELECT purple FROM Families WHERE family_id = ?').bind(FAM).first()).purple;
  r = await call(mf, 'hatchEgg', C);
  ok(r.ok && r.value.prize.kind === 'purple' && r.value.prize.amount === 30 && r.value.prize.coupon === 50, 'rare ครบแล้ว → ดาวม่วง 30 + คูปอง 50%', r.value && r.value.prize);
  ok((await db.prepare('SELECT purple FROM Families WHERE family_id = ?').bind(FAM).first()).purple === pb + 30, 'ดาวม่วง 30 เข้ากระเป๋า');
  r = await call(mf, 'buyItem', P1, 'pet_godzero'); ok(!r.ok, 'สัตว์เลี้ยง rare ซื้อในร้านไม่ได้');
  // การันตี rare: ตัวนับครบ 4 แล้ว ใบถัดไปต้องเป็น rare
  await db.prepare("UPDATE Eggs SET status = 'hatched' WHERE family_id = ?").bind(FAM).run();
  await db.prepare("UPDATE Families SET egg_pity = 7, egg_rare_pity = 4 WHERE family_id = ?").bind(FAM).run();
  await approve();
  const last = await db.prepare("SELECT tier FROM Eggs WHERE family_id = ? AND status = 'warming'").bind(FAM).first();
  ok(last && last.tier === 'rare', 'การันตีไข่ rare ทุกใบที่ 5', last);

  await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
