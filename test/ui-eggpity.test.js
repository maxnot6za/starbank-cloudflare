// ป้าย "อีกไม่เกิน N ภารกิจ" เหนือฐานไข่ว่าง · แตะดูรายละเอียด · มีไข่อยู่แล้ว = ไม่มีป้าย · ไม่บอกเรื่องไข่หายาก
const { chromium } = require('playwright');
const { seedFamily, C, FAM, P1 } = require('./lib/fixture.js');
const { start, sessionFor } = require('./lib/mf.js');
const routes = require(process.env.SB_ROUTES || './lib/routes.js');
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ port: 0 }); await seedFamily(db);
  await db.prepare("UPDATE Members SET quest_seen = 'x', news_seen = 99, tree_seen = '9999'").run();
  await db.prepare("UPDATE Families SET egg_pity = 5 WHERE family_id = ?").bind(FAM).run();
  const base = String(await mf.ready).replace(/\/$/, ''); const br = await chromium.launch(), errors = [];
  for (const [who, id, vp] of [['ลูก', C, { width: 390, height: 844 }], ['ผู้ปกครอง iPad', P1, { width: 820, height: 1180 }]]) {
    const ctx = await br.newContext({ viewport: vp });
    await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, id), url: base }]);
    await ctx.addInitScript(() => { try { localStorage.setItem('sb_ui2', '1'); } catch (e) {} });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await routes(p);
    await p.goto(base + '/'); await p.waitForSelector('#avatar-strip .egg-pity', { timeout: 15000 }); await p.waitForTimeout(1200);
    await p.evaluate(() => { while (MODAL.stack.length) MODAL.stack.pop(); closeModal(); }); await p.waitForTimeout(400);
    ok(/อีกไม่เกิน\s*3\s*ภารกิจ/.test(await p.textContent('.egg-pity')), who + ': ป้าย อีกไม่เกิน 3 ภารกิจ');
    const r = await p.evaluate(() => { var b = document.querySelector('.egg-pity').getBoundingClientRect(); return { l: b.left, r: b.right, w: innerWidth }; });
    ok(r.l >= 0 && r.r <= r.w, who + ': ป้ายอยู่ในจอ', r);
    await p.click('.egg-pity'); await p.waitForTimeout(500);
    const t = await p.textContent('#modal-content');
    ok(/อนุมัติไปแล้ว\s*5/.test(t) && /อีกไม่เกิน 3 ภารกิจ ได้ไข่แน่นอน/.test(t) && !/หายาก/.test(t), who + ': แตะแล้วเห็นรายละเอียด ไม่พูดถึงไข่หายาก');
    if (id === P1) {
      await p.evaluate(() => closeModal());
      const sid = await p.evaluate(() => dashboardData.pending[0].submission_id);
      await p.evaluate(sid => doReview(sid, 'approved'), sid); await p.waitForTimeout(2500);
      const e = await p.evaluate(() => Object.assign({}, dashboardData.egg, { txt: (document.querySelector('.egg-pity') || {}).textContent || '' }));
      ok((e.pity && e.pity.left === 2 && /อีกไม่เกิน\s*2/.test(e.txt)) || (!!e.current && !e.txt), 'อนุมัติ 1 ภารกิจ → ป้ายลดเหลือ 2 (หรือเจอไข่แล้วป้ายหาย)', { pity: e.pity, cur: !!e.current });
      await db.prepare("DELETE FROM Eggs").run();
    }
    await ctx.close();
  }
  await db.prepare("INSERT INTO Eggs (egg_id,family_id,status,warm,goal,tier,day,day_warm,contrib,hugs,found_by,found_at,hatched_by,hatched_at,prize,created_at) VALUES (?,?,'warming',2,15,'normal','',0,'{}','{}',?,'','','','','')").bind(FAM + '|1', FAM, C).run();
  await db.prepare("UPDATE Members SET egg_seen = ?").bind(FAM + '|1:f').run();
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'sb_s', value: await sessionFor(db, C), url: base }]);
  const p = await ctx.newPage(); await routes(p); await p.goto(base + '/'); await p.waitForSelector('#avatar-strip .strip-egg', { timeout: 15000 });
  ok(!(await p.locator('.egg-pity').count()), 'มีไข่อยู่แล้ว → ไม่มีป้าย');
  ok(!errors.length, 'ไม่มี JS error', errors);
  await br.close(); await mf.dispose(); console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
