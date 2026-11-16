// หน้าหลักลูกแบบใหม่: การ์ดดาว+เป้าหมาย · การ์ดต้นไม้ซ้อนภาพ (ลูกบอลตามจำนวน, ครบ → ดาวติดไฟ+ปุ่มหมุน) · กล่องภารกิจ
const { chromium } = require('playwright');
const { seedFamily, C, FAM } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  await db.prepare("UPDATE Members SET quest_seen = 'x', news_seen = 99, tree_seen = '9999'").run();
  await db.prepare("UPDATE Families SET wheel_enabled = 1, wheel_started_at = ? WHERE family_id = ?").bind(new Date(Date.now() - 5 * 86400000).toISOString(), FAM).run();
  const base = String(await mf.ready).replace(/\/$/, ''); const br = await chromium.launch(), errors = [];
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, C), url: base }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('sb_ui2', '1'); } catch (e) {} });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await routes(p);
  await p.goto(base + '/'); await p.waitForSelector('.k2-tree', { timeout: 15000 }); await p.waitForTimeout(1500);
  ok(await p.isVisible('#k2-hero .u2-hero') && !(await p.isVisible('.star-hero')) && !(await p.isVisible('.stats-grid')), 'การ์ดดาวใหม่แทนกล่องเดิม');
  ok(await p.locator('.k2-box .k2-m button[data-sfx=send]').count() === 2, 'กล่องภารกิจ + ปุ่มส่ง');
  ok(await p.evaluate(() => document.getElementById('k2-hero').nextElementSibling.id === 'child-wheel-card'), 'การ์ดต้นไม้อยู่ใต้การ์ดดาว');
  await p.evaluate(() => { Object.assign(dashboardData.wheel, { run: 3, pendingCount: 0, spins: 0, todayStatus: 'none', broke: false }); renderChildHome(dashboardData); });
  ok(await p.locator('.k2-tree .pl-ball.done').count() === 3 && await p.locator('.k2-tree .pl-today').count() === 1 && !(await p.isVisible('.k2-tree button')), '3/5: ลูกบอล 3 + ช่องวันนี้ ยังไม่มีปุ่มหมุน');
  await p.evaluate(() => { Object.assign(dashboardData.wheel, { run: 5, spins: 1 }); renderChildHome(dashboardData); });
  ok(await p.locator('.k2-tree.rdy .pl-ball').count() === 5 && await p.isVisible('.k2-tree .pl-star') && await p.isVisible('.k2-tree button'), 'ครบ: ลูกบอล 5 + ดาวติดไฟ + ปุ่มหมุน');
  await p.evaluate(() => { while (MODAL.stack.length) MODAL.stack.pop(); closeModal(); }); await p.waitForTimeout(500);
  await p.click('.k2-tree button'); await p.waitForTimeout(800);
  ok(await p.isVisible('#screen-child-wheel'), 'กดแล้วเข้ากงล้อ');
  // ธีมอื่น: ต้นไม้/คำ/ภาพการ์ดเปลี่ยนตามธีม (ไม่ติดของคริสต์มาส)
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const TH = {
    timg: { progress: { type: 'images', frames: ['p0.png', 'p1.png', 'p2.png', 'p3.png', 'p4.png', 'p5.png'] }, words: { icon: '💧', board: 'ขันน้ำ', unit: 'หยด' } },
    tlay: { progress: { type: 'layers', base: 'b.png', star: 's.png', aspect: 1, balls: ['o.png'], spots: [[.2, .5], [.4, .5], [.6, .5], [.8, .5], [.5, .2]], ballW: .2, starAt: [.5, .05], starW: .3 }, words: { icon: '🌸', board: 'ต้นซากุระ', unit: 'ดอก' } },
    tnone: { words: { icon: '🌱', board: 'ต้นไม้', unit: 'ใบ' } } };
  await p.route(/\/themes\/t(img|lay|none)\//, rt => { const u = rt.request().url(), id = u.match(/themes\/(\w+)\//)[1];
    if (u.endsWith('theme.json')) return rt.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.assign({ id, name: id, bg: 'bg.png', effect: { type: 'none' }, mascot: { go: 'g.png', sleep: 'g.png', timeout: 'g.png', yay: 'g.png' } }, TH[id])) });
    return rt.fulfill({ contentType: 'image/png', body: PNG }); });
  const swap = async id => { await p.evaluate(id => { dashboardData.family.theme = id; Object.assign(dashboardData.wheel, { run: 3, spins: 0, pendingCount: 0, todayStatus: 'none' }); rerenderDashboard(); }, id);
    await p.waitForFunction(id => THEME.id === id, id, { timeout: 5000 }); await p.waitForTimeout(500); await p.evaluate(() => { while (MODAL.stack.length) MODAL.stack.pop(); closeModal(); }); };
  await p.evaluate(() => { if (window.closeWheel) closeWheel(); childNav('home'); }); await p.waitForTimeout(800);
  await swap('timg');
  ok(await p.locator('.k2-tree img[src="/themes/timg/p3.png"]').count() === 1 && /ขันน้ำของหนู/.test(await p.textContent('.k2-tree')) && /หยด/.test(await p.textContent('.k2-tree')), 'ธีมภาพ 6 รูป → ใช้รูปของธีม (3/5) + คำของธีม');
  ok(!(await p.locator('.k2-tree [src*="/themes/xmas/"]').count()) && !(await p.locator('#k2-hero .has-img').count()), 'ไม่มีภาพคริสต์มาสค้าง · การ์ดไม่มีภาพ → ใช้สีจากโค้ด');
  await swap('tlay');
  ok(await p.locator('.k2-tree .pl-base[src="/themes/tlay/b.png"]').count() === 1 && await p.locator('.k2-tree .pl-ball.done[src="/themes/tlay/o.png"]').count() === 3 && /ต้นซากุระของหนู/.test(await p.textContent('.k2-tree')), 'ธีมซ้อนภาพ → ต้น+ของแขวนของธีม');
  await swap('tnone');
  ok(await p.locator('.k2-tree svg').count() === 1 && /ต้นไม้ของหนู/.test(await p.textContent('.k2-tree')), 'ธีมไม่มีภาพต้นไม้ → ต้นไม้วาดจากโค้ด');
  await swap('xmas');
  ok(await p.locator('.k2-tree .pl-base[src="/themes/xmas/tree-base.webp"]').count() === 1, 'กลับคริสต์มาส → ต้นไม้ 3D');
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose(); console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
