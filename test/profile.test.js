// ระบบโปรไฟล์: updateProfile (สิทธิ์ลูก/ผู้ปกครอง, ตรวจค่า, ข้ามครอบครัวไม่ได้) + หน้าจอ (เปิดโปรไฟล์ เปลี่ยนตัวการ์ตูน สี ชื่อ)
const fs = require('fs');
const { chromium } = require('playwright');
const { seedFamily, FAM, P1, P2, P3, C } = require('./lib/fixture.js');
const { start, call, sessionFor, REPO } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
const OUT = require('os').tmpdir() + '/starbank-shots/'; fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  // ---- ภาพตัวการ์ตูนครบตามรายการในเซิร์ฟเวอร์ ----
  const core = fs.readFileSync(REPO + '/src/core.js', 'utf8');
  const arts = [...core.match(/AVATAR_ART = \{([^}]*)\}/)[1].matchAll(/(\w+):/g)].map(m => m[1]);
  ok(arts.length === 12 && arts.every(a => fs.existsSync(REPO + '/public/avatars/' + a + '.webp')), 'มีไฟล์ตัวการ์ตูนครบ', arts);

  const { mf, db } = await start({ port: 0 });
  await seedFamily(db);
  let r;
  r = await call(mf, 'updateProfile', C, C, { avatar: '@dino', color: '#FF9F43', motto: '  ไดโน   พลังเต็ม! ' });
  ok(r.ok && r.value.profile.avatar === '@dino' && r.value.profile.color === '#FF9F43' && r.value.profile.motto === 'ไดโน พลังเต็ม!', 'ลูกเปลี่ยนรูป สี คำประจำตัวของตัวเองได้', r);
  r = await call(mf, 'updateProfile', C, C, { name: 'ชื่อใหม่' }); ok(!r.ok, 'ลูกแก้ชื่อตัวเองไม่ได้', r.error);
  r = await call(mf, 'updateProfile', C, C, { birthday: '2019-03-12' }); ok(!r.ok, 'ลูกแก้วันเกิดไม่ได้');
  r = await call(mf, 'updateProfile', C, P1, { color: '#3BB08F' }); ok(!r.ok, 'ลูกแก้โปรไฟล์คนอื่นไม่ได้');
  r = await call(mf, 'updateProfile', C, C, { avatar: '@nope' }); ok(!r.ok, 'ตัวการ์ตูนที่ไม่มี → ปฏิเสธ');
  r = await call(mf, 'updateProfile', C, C, { avatar: '<img>' }); ok(!r.ok, 'avatar มี HTML → ปฏิเสธ');
  r = await call(mf, 'updateProfile', C, C, { color: 'red' }); ok(!r.ok, 'สีนอกรายการ → ปฏิเสธ');
  r = await call(mf, 'updateProfile', P1, C, { name: '  น้องภูมิ ', birthday: '2019-03-12' });
  ok(r.ok && r.value.profile.name === 'น้องภูมิ' && r.value.profile.birthday === '2019-03-12', 'ผู้ปกครองแก้ชื่อ + วันเกิดลูกได้', r);
  r = await call(mf, 'updateProfile', P1, C, { name: 'แม่' }); ok(!r.ok, 'ชื่อซ้ำในครอบครัว → ปฏิเสธ', r.error);
  r = await call(mf, 'updateProfile', P1, C, { name: 'ก'.repeat(21) }); ok(!r.ok, 'ชื่อยาวเกิน 20 → ปฏิเสธ');
  r = await call(mf, 'updateProfile', P1, C, { birthday: '2019-02-30' }); ok(!r.ok, 'วันที่ไม่มีจริง → ปฏิเสธ');
  r = await call(mf, 'updateProfile', P1, C, { birthday: '2999-01-01' }); ok(!r.ok, 'วันเกิดในอนาคต → ปฏิเสธ');
  r = await call(mf, 'updateProfile', P1, C, { birthday: '' }); ok(r.ok && r.value.profile.birthday === '', 'ลบวันเกิดได้');
  r = await call(mf, 'updateProfile', P3, C, { color: '#5BA8F5' }); ok(!r.ok, 'ผู้ปกครองบ้านอื่นแก้ไม่ได้');
  r = await call(mf, 'updateProfile', P1, P2, { avatar: '@mom' }); ok(r.ok, 'ผู้ปกครองแก้โปรไฟล์ผู้ปกครองอีกคนได้');
  r = await call(mf, 'getChildDashboard', C);
  const me = (r.value.profiles || []).find(p => p.member_id === C);
  ok(me && me.avatar === '@dino' && me.color === '#FF9F43' && r.value.profiles.length === 3, 'dashboard ส่ง profiles ของทั้งบ้าน', r.value.profiles);
  const row = await db.prepare('SELECT name, avatar FROM Members WHERE member_id = ?').bind(C).first();
  ok(row.name === 'น้องภูมิ' && row.avatar === '@dino', 'บันทึกลง D1', row);

  // ---- หน้าเว็บ ----
  const base = String(await mf.ready).replace(/\/$/, '');
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  await db.prepare('UPDATE Members SET quest_seen = ?').bind(today).run();
  const browser = await chromium.launch(); const errors = [], bad = [];
  for (const who of [C, P1]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, who), url: base }]);
    const pg = await ctx.newPage(); await routes(pg);
    pg.on('pageerror', e => errors.push(e.message));
    pg.on('response', res => { if (res.url().includes('/avatars/') && res.status() >= 400) bad.push(res.url()); });
    await pg.goto(base + '/');
    await pg.waitForFunction(() => typeof dashboardData !== 'undefined' && dashboardData && Object.keys(PROF).length, null, { timeout: 10000 });
    await pg.waitForTimeout(1500);
    await pg.evaluate(() => { while (document.getElementById('modal-overlay').classList.contains('show')) closeModal(); });
    await pg.waitForTimeout(400);
    if (who === C) {
      ok(await pg.evaluate(() => !!document.querySelector('img[src="/avatars/dino.webp"]')), 'หน้าเด็กแสดงตัวการ์ตูน');
      await pg.evaluate(() => openProfile());
      await pg.waitForSelector('.pf-hero');
      ok(await pg.isVisible('.pf-cam'), 'ลูกเห็นปุ่มเปลี่ยนรูป');
      ok(await pg.locator('.pf-it[disabled]').count() >= 2, 'ชื่อ/วันเกิด กดไม่ได้สำหรับลูก');
      await pg.screenshot({ path: OUT + 'profile-kid.png' });
      await pg.click('.pf-cam'); await pg.waitForSelector('.pf-grid');
      await pg.screenshot({ path: OUT + 'profile-pick.png' });
      await pg.click('.pf-grid button:nth-child(2)'); await pg.click('#pf-use');
      await pg.waitForSelector('.pf-hero'); await pg.waitForTimeout(500);
      const av = (await db.prepare('SELECT avatar FROM Members WHERE member_id = ?').bind(C).first()).avatar;
      ok(av === '@bunny', 'ลูกเลือกตัวการ์ตูนใหม่ผ่านหน้าจอได้', av);
      await pg.click('.pf-dot:nth-child(3)'); await pg.waitForTimeout(800);
      const col = (await db.prepare('SELECT color FROM Members WHERE member_id = ?').bind(C).first()).color;
      ok(col === '#5BA8F5', 'ลูกเปลี่ยนสีได้', col);
    } else {
      await pg.evaluate(() => openFamilyProfiles());
      await pg.waitForSelector('.pf-mem');
      ok(await pg.locator('.pf-mem').count() === 3, 'ผู้ปกครองเห็นสมาชิก 3 คน');
      await pg.screenshot({ path: OUT + 'profile-family.png' });
      await pg.locator('.pf-mem', { hasText: 'น้องภูมิ' }).click(); await pg.waitForSelector('.pf-hero');
      await pg.locator('.pf-it', { hasText: 'ชื่อ' }).first().click();
      await pg.fill('#pf-v', 'ภูมิ'); await pg.click('#pf-ok'); await pg.waitForSelector('.pf-hero'); await pg.waitForTimeout(500);
      ok((await pg.textContent('.pf-nm')) === 'ภูมิ', 'ผู้ปกครองแก้ชื่อลูกผ่านหน้าจอได้');
      await pg.screenshot({ path: OUT + 'profile-parent.png' });
      // ทัวร์ "รูปโปรไฟล์"
      await pg.evaluate(() => { while (document.getElementById('modal-overlay').classList.contains('show')) closeModal(); });
      await pg.waitForTimeout(500);
      ok(await pg.evaluate(() => WHATS_NEW.find(function (g) { return g.v === 8; }).items[0][3] === 'tour:profile'), 'มีอะไรใหม่ v8 มีทัวร์โปรไฟล์');
      await pg.evaluate(() => tourStart('profile'));
      await pg.waitForSelector('.tr-tip'); await pg.click('#parent-avatar', { force: true });
      await pg.waitForSelector('.pf-hero'); await pg.waitForTimeout(1200);
      for (let i = 0; i < 3; i++) {
        ok(await pg.isVisible('.tr-next'), 'ทัวร์ขั้นที่ ' + (i + 2) + ' แสดง');
        if (i === 1) await pg.screenshot({ path: OUT + 'profile-tour.png' });
        await pg.click('.tr-next'); await pg.waitForTimeout(400);
      }
      ok(!(await pg.$('.tr-tip')), 'ทัวร์จบ');
      ok(await pg.evaluate(() => !!toursTried().profile), 'จำว่าลองทัวร์แล้ว');
    }
    await ctx.close();
  }
  ok(!errors.length, 'ไม่มี error ในหน้าเว็บ', errors);
  ok(!bad.length, 'โหลดภาพตัวการ์ตูนได้ทุกไฟล์', bad);
  await browser.close(); await mf.dispose();
  console.log(fails ? `\n✗ ${fails} ข้อไม่ผ่าน` : '\n✓ ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
