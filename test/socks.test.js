// กิจกรรมถุงเท้า (API): ปิด = ไม่มีข้อมูล · เล่นวันละครั้ง · กันโกง · ถุงตามขั้น · ลูกเปิด · เปิดแล้วนับเป็นพรุ่งนี้ · หมุดถุงเท้ายักษ์ · คูปองสัปดาห์ละใบ · cron
const { seedFamily, FAM, P1, P2, C } = require('./lib/fixture.js');
const { start, call } = require('./lib/mf.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
(async () => {
  const pushes = [];
  const { mf, db } = await start({ outbound: async (req) => { pushes.push(new URL(req.url).pathname); return new Response('', { status: 201 }); } });
  await seedFamily(db);
  const setCfg = (o) => db.prepare("INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('event_socks', ?)").bind(JSON.stringify(o)).run();
  let r = await call(mf, 'getChildDashboard', C);
  ok(r.ok && r.value.socks === null, 'ยังไม่เปิดกิจกรรม → ไม่มีการ์ด');
  r = await call(mf, 'socksStart', P1); ok(!r.ok && /ยังไม่เปิด/.test(r.error), 'ปิดอยู่ เล่นไม่ได้');
  // ซานต้ามาตั้งแต่ 0 นาฬิกา (ทดสอบได้ทุกเวลา) · สมาชิก 3 คน → ขั้น 45/90/135 · ยักษ์ 300
  const base = { enabled: true, season: 'T', start: addD(today, -10), end: addD(today, 10), santaHour: 0, bigPerPerson: 100, maxPerSec: 100 };
  await setCfg(base);
  r = await call(mf, 'getParentDashboard', P1);
  ok(r.value.socks && r.value.socks.on && r.value.socks.canPlay && r.value.socks.tiers.join() === '45,90,135', 'เปิดแล้ว: เล่นได้ · ขั้นคิดตามจำนวนคน', r.value.socks && r.value.socks.tiers);
  r = await call(mf, 'socksStart', P1); ok(r.ok, 'พ่อเริ่มเล่น');
  r = await call(mf, 'socksStart', P1); ok(!r.ok && /เล่นไปแล้ว/.test(r.error), 'วันละครั้ง');
  const back = (m) => db.prepare("UPDATE SocksPlays SET started_at = ? WHERE member_id = ? AND status = 'playing'").bind(new Date(Date.now() - 40000).toISOString(), m).run();
  await back(P1);
  r = await call(mf, 'socksEnd', P1, { socks: 999 });
  ok(r.ok && r.value.socks === 160, 'เกินเพดาน → ตัดเหลือ 160', r.value && r.value.socks);
  ok(r.value.unlocked.map(u => u.pct).join() === '25,50', 'ยักษ์ 160/300 → ปลดล็อก 25%, 50%', r.value.unlocked);
  const inv = (await db.prepare("SELECT item_id FROM Inventory WHERE family_id = ? AND currency = 'event'").bind(FAM).all()).results.map(x => x.item_id);
  ok(inv.includes('decor_snowfam') && inv.includes('decor_reindeer'), 'ได้ของ exclusive เข้าบ้าน', inv);
  r = await call(mf, 'socksEnd', P1, { socks: 5 }); ok(!r.ok, 'ส่งผลซ้ำไม่ได้');
  // กันโกงความเร็ว
  await setCfg(Object.assign({}, base, { maxPerSec: 4 }));
  await call(mf, 'socksStart', P2);
  r = await call(mf, 'socksEnd', P2, { socks: 100 }); ok(r.ok && r.value.socks <= 10, 'จบเร็วผิดปกติ → นับตามเวลาที่เล่นจริง', r.value.socks);
  await setCfg(base);
  let s = (await call(mf, 'getChildDashboard', C)).value.socks;
  ok(s.pending.length === 1 && s.pending[0].tier === 'l' && s.canOpen, 'ถึงขั้น 3 → ลูกมีถุงใหญ่รอเปิด', s.pending);
  r = await call(mf, 'socksOpen', P1); ok(!r.ok && /ลูก/.test(r.error), 'ผู้ปกครองเปิดไม่ได้ (บ้านมีลูก)');
  const p0 = (await db.prepare('SELECT purple FROM Families WHERE family_id = ?').bind(FAM).first()).purple || 0;
  r = await call(mf, 'socksOpen', C);
  ok(r.ok && r.value.tier === 'l' && r.value.items.length === 3, 'ลูกเปิดถุงใหญ่ได้ 3 ชิ้น', r.value && r.value.items);
  const gotP = r.value.items.filter(i => i.kind === 'purple').reduce((a, i) => a + i.n, 0);
  ok(((await db.prepare('SELECT purple FROM Families WHERE family_id = ?').bind(FAM).first()).purple || 0) === p0 + gotP && gotP >= 4, 'ดาวม่วงเข้ากระเป๋าครอบครัว', gotP);
  ok(r.value.items.some(i => i.kind === 'item' && i.event === undefined || i.kind === 'item'), 'ได้ของตกแต่ง 1 ชิ้น');
  r = await call(mf, 'socksOpen', C); ok(!r.ok, 'เปิดซ้ำไม่ได้');
  // หลังเปิดถุงวันนี้ → ลูกเล่นแล้วนับเป็นพรุ่งนี้
  await call(mf, 'socksStart', C); await back(C);
  r = await call(mf, 'socksEnd', C, { socks: 50 });
  ok(r.ok && r.value.day === addD(today, 1) && r.value.state.countDay === addD(today, 1), 'เปิดถุงแล้ว ถุงเท้าที่เล่นต่อ → ตะกร้าพรุ่งนี้', r.value && r.value.day);
  s = (await call(mf, 'getChildDashboard', C)).value.socks;
  ok(!s.pending.length && s.opened && s.opened.tier === 'l', 'ไม่มีถุงค้าง · เห็นของที่เปิดวันนี้');
  // ถุงค้างจากเมื่อวาน (ลูกไม่ได้เปิด) ยังอยู่
  const y = addD(today, -1);
  await db.prepare("INSERT INTO SocksPlays (play_id,family_id,member_id,season,play_date,day,status,socks,started_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(P2 + '|' + y, FAM, P2, 'T', y, y, 'done', 95, new Date().toISOString()).run();
  s = (await call(mf, 'getChildDashboard', C)).value.socks;
  ok(s.pending.length === 1 && s.pending[0].day === y && s.pending[0].tier === 'm', 'ถุงเมื่อวานที่ยังไม่เปิดยังรออยู่ (ถุงกลาง)', s.pending);
  // คูปอง: สัปดาห์ละไม่เกิน 1 (ล้างคูปองที่อาจสุ่มได้จากถุงแรกก่อน)
  await db.prepare('DELETE FROM Coupons WHERE family_id = ?').bind(FAM).run();
  await setCfg(Object.assign({}, base, { bags: { m: [[['coupon', 30, 1]], [['coupon', 20, 1]]] } }));
  r = await call(mf, 'socksOpen', C);
  ok(r.ok && r.value.items.filter(i => i.kind === 'coupon').length === 1 && r.value.items.some(i => i.kind === 'purple'), 'คูปองใบที่ 2 ในสัปดาห์เดียวกัน → เป็นดาวม่วงแทน', r.value && r.value.items);
  // ร้านค้า: ของกิจกรรมซื้อไม่ได้ และไม่โชว์ถ้ายังไม่มี
  r = await call(mf, 'buyItem', P1, 'decor_bells'); ok(!r.ok && /กิจกรรม/.test(r.error), 'ซื้อของกิจกรรมไม่ได้');
  const shop = (await call(mf, 'getShop', P1)).value.items.filter(i => i.event);
  ok(shop.every(i => i.owned) && shop.some(i => i.id === 'decor_snowfam'), 'ร้านโชว์ของกิจกรรมเฉพาะที่มีแล้ว', shop.map(i => i.id));
  // cron 18:00
  await db.prepare("INSERT INTO PushSubs (endpoint, member_id, family_id, p256dh, auth, device, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind('https://push.example/kid', C, FAM, 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'test', new Date().toISOString()).run();
  pushes.length = 0;
  const res = await mf.dispatchFetch('http://x/__scheduled').catch(() => null);
  const w = await mf.getWorker(); await w.scheduled({ cron: '0 11 * * *' });
  await new Promise(x => setTimeout(x, 500));
  ok(pushes.includes('/kid'), 'cron 18:00 → แจ้งเตือนซานต้ามา');
  await setCfg(Object.assign({}, base, { enabled: false })); pushes.length = 0;
  await w.scheduled({ cron: '0 11 * * *' }); await new Promise(x => setTimeout(x, 300));
  ok(!pushes.length, 'ปิดกิจกรรม → ไม่แจ้งเตือน');
  ok((await call(mf, 'getChildDashboard', C)).value.socks === null, 'ปิดกิจกรรม → การ์ดหาย');
  await mf.dispose();
  console.log(fails ? `\n✗ ไม่ผ่าน ${fails} ข้อ` : '\n✓ ผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})();
