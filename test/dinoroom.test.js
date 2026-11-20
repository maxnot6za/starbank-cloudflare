// ชุดห้องครอบครัวไดโนเสาร์: พื้น + ผนัง + ของตกแต่ง 5 ชิ้น
const fs = require('fs'), path = require('path');
const { seedFamily, FAM, P1, C } = require('./lib/fixture.js');
const { start, call } = require('./lib/mf.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
const DECOR = ['dvolcano', 'dpalm', 'dskeleton', 'dplush', 'dfossil'];
(async () => {
  const pub = path.join(__dirname, '..', 'public', 'stage');
  ok(fs.existsSync(path.join(pub, 'floors', 'dino.webp')), 'มีภาพพื้นไดโน');
  ok(fs.existsSync(path.join(pub, 'walls', 'dino.webp')), 'มีภาพผนังไดโน');
  DECOR.forEach(function(d) { ok(fs.existsSync(path.join(pub, 'decor', d + '.webp')), 'มีภาพของตกแต่ง ' + d); });

  const { mf, db } = await start({ outbound: async () => new Response('', { status: 201 }) });
  await seedFamily(db);
  await db.prepare('UPDATE Families SET purple = 200 WHERE family_id = ?').bind(FAM).run();
  const shop = (await call(mf, 'getShop', P1)).value;
  const items = shop.items || shop;
  const find = (id) => items.find((i) => i.id === id);
  ok(find('floor_dino') && find('floor_dino').price === 20, 'ร้านมีพื้นไดโน 20 ดาวม่วง');
  ok(find('wall_dino') && find('wall_dino').price === 20, 'ร้านมีผนังไดโน 20 ดาวม่วง');
  ok(DECOR.every((d) => find('decor_' + d) && find('decor_' + d).price === 10), 'ร้านมีของตกแต่งไดโนครบ 5 ชิ้น ชิ้นละ 10');

  let r = await call(mf, 'setFloor', P1, 'floor_dino'); ok(!r.ok, 'ยังไม่ได้ซื้อ → ใช้พื้นไม่ได้');
  r = await call(mf, 'buyItem', C, 'floor_dino'); ok(!r.ok, 'เด็กซื้อไม่ได้');
  r = await call(mf, 'buyItem', P1, 'floor_dino'); ok(r.ok, 'ผู้ปกครองซื้อพื้นได้', r);
  r = await call(mf, 'buyItem', P1, 'wall_dino'); ok(r.ok, 'ผู้ปกครองซื้อผนังได้', r);
  r = await call(mf, 'setFloor', P1, 'floor_dino'); ok(r.ok, 'ใช้พื้นไดโนได้', r);
  r = await call(mf, 'setWall', P1, 'wall_dino'); ok(r.ok, 'ใช้ผนังไดโนได้', r);
  r = await call(mf, 'buyItem', P1, 'decor_dvolcano'); ok(r.ok, 'ซื้อโคมไฟภูเขาไฟได้', r);
  r = await call(mf, 'saveRoom', P1, JSON.stringify([{ id: 'decor_dvolcano', x: .3, s: 1 }])); ok(r.ok, 'วางโคมไฟภูเขาไฟในห้องได้', r);
  const st = JSON.parse((await db.prepare('SELECT stage FROM Families WHERE family_id = ?').bind(FAM).first()).stage);
  ok(st.floor === 'floor_dino' && st.wall === 'wall_dino' && st.decor[0].id === 'decor_dvolcano', 'ห้องบันทึกพื้น/ผนัง/ของครบ', st);
  await mf.dispose();
  console.log(fails ? `\nไม่ผ่าน ${fails}` : '\nผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
