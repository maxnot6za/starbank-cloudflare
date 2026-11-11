// ชื่อผู้ใช้ + รหัสผ่าน: สมัคร, เข้า, ล็อก, กู้คืน, ลิงก์ตั้งรหัสใหม่, เปลี่ยนรหัส, แจ้งเตือนเริ่มต้น, ผู้ใช้ LINE เดิมไม่กระทบ
const { seedFamily, FAM, FAM2, P1, P2, C } = require('./lib/fixture.js');
const { start, sessionFor, call } = require('./lib/mf.js');
const C2 = 'kid2kid2kid2';
let fails = 0;
const ok = (c, l, x) => { console.log(c ? '✓' : '✗', l, x === undefined ? '' : JSON.stringify(x)); if (!c) fails++; };
(async () => {
  const { mf, db } = await start({ outbound: async () => Response.json({}) });
  await seedFamily(db);
  let ipN = 0;
  const device = (ip) => {
    const jar = {}; ip = ip || ('10.0.0.' + (++ipN));
    const req = async (path, opt = {}) => {
      const headers = Object.assign({ 'cf-connecting-ip': ip }, opt.headers || {});
      const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; '); if (ck) headers.cookie = ck;
      const r = await mf.dispatchFetch('http://local' + path, Object.assign({}, opt, { headers, redirect: 'manual' }));
      (r.headers.getSetCookie() || []).forEach(c => { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (/Max-Age=0/.test(c)) delete jar[kv.slice(0, i)]; else jar[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
      return r;
    };
    const auth = async (fn, ...args) => (await req('/auth/api/' + fn, { method: 'POST', body: JSON.stringify({ args }) })).json();
    const api = async (fn, ...args) => (await req('/api/' + fn, { method: 'POST', body: JSON.stringify({ args }) })).json();
    return { jar, req, auth, api };
  };

  // ตรวจชื่อผู้ใช้
  const a = device();
  ok((await a.auth('usernameCheck', 'แม่ปุ๋ย')).value.ok === false, 'ชื่อผู้ใช้ภาษาไทย → ไม่ได้');
  ok((await a.auth('usernameCheck', 'ab')).value.ok === false, 'สั้นกว่า 4 ตัว → ไม่ได้');
  ok((await a.auth('usernameCheck', 'mom.pui')).value.ok === false, 'มีจุด → ไม่ได้ (อังกฤษ+ตัวเลขเท่านั้น)');
  ok((await a.auth('usernameCheck', 'MomPui1')).value.ok === true, 'ตัวพิมพ์ใหญ่ → ใช้ได้ (เก็บเป็นตัวเล็ก)');

  // สมัคร: ครอบครัวใหม่
  let r = await a.auth('registerPassword', { mode: 'new', familyName: 'บ้านสุขสันต์', name: 'แม่ปุ๋ย', avatar: '👩', username: 'MomPui1', password: 'short' });
  ok(!r.ok && /8 ตัว/.test(r.error), 'รหัสสั้นกว่า 8 → ไม่ได้');
  r = await a.auth('registerPassword', { mode: 'new', familyName: 'บ้านสุขสันต์', name: 'แม่ปุ๋ย', avatar: '👩', username: 'MomPui1', password: 'Secret-pass-1' });
  ok(r.ok && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(r.value.recoveryCode), 'สมัครสำเร็จ + ได้รหัสกู้คืน', r.value);
  const rc = r.value.recoveryCode;
  let me = (await a.auth('me')).value;
  ok(me && me.role === 'parent' && me.familyName === 'บ้านสุขสันต์', 'สมัครแล้วเข้าระบบทันที');
  const row = await db.prepare('SELECT * FROM Members WHERE username = ?').bind('mompui1').first();
  ok(row && row.pw_hash.startsWith('pbkdf2$10000$') && !row.pw_hash.includes('Secret') && row.notify_channel === 'app', 'เก็บรหัสแบบแฮช · แจ้งเตือนเริ่มต้น = แอป', row.notify_channel);
  const pd = await a.api('getParentDashboard', 'x');
  ok(pd.ok && pd.value.missions.length === 5 && !JSON.stringify(pd.value).includes('pw_hash') && !JSON.stringify(pd.value).includes('recovery'), 'ใช้แอปได้ (มีภารกิจตัวอย่าง) · ข้อมูลรหัสไม่หลุดไปหน้าเว็บ');
  const pi = (await a.auth('pushInfo')).value;
  ok(pi.channel === 'app' && pi.hasLine === false, 'ตั้งค่าแจ้งเตือน: แอป · ปุ่ม LINE ปิดไว้ (ไม่ได้ผูก)');
  ok(!(await a.auth('setNotifyChannel', 'line')).ok, 'เลือกแจ้งเตือนทาง LINE ไม่ได้');
  r = await device().auth('registerPassword', { mode: 'new', familyName: 'บ้านอื่น', name: 'x', username: 'mompui1', password: 'Another-pass-2' });
  ok(!r.ok && /มีคนใช้แล้ว/.test(r.error), 'ชื่อผู้ใช้ซ้ำ → ไม่ได้');

  // เข้าสู่ระบบ
  const b = device();
  r = await b.auth('loginPassword', 'MOMPUI1', 'Secret-pass-1');
  ok(r.ok && (await b.auth('me')).value.name === 'แม่ปุ๋ย', 'เข้าด้วยชื่อผู้ใช้ (ไม่สนตัวพิมพ์เล็กใหญ่) + รหัสผ่าน');
  r = await device().auth('loginPassword', 'nobody9', 'whatever123');
  const r2 = await device().auth('loginPassword', 'mompui1', 'wrong-pass');
  ok(!r.ok && !r2.ok && r.error === r2.error, 'ไม่บอกว่าชื่อผู้ใช้มีอยู่จริงไหม (ข้อความเดียวกัน)', r.error);
  // ผิด 5 ครั้ง → ล็อก
  for (let i = 0; i < 4; i++) await device().auth('loginPassword', 'mompui1', 'wrong-' + i);
  r = await device().auth('loginPassword', 'mompui1', 'Secret-pass-1');
  ok(!r.ok && /ล็อก/.test(r.error), 'ผิดรวม 5 ครั้ง → ล็อกบัญชี 15 นาที (ใส่ถูกก็ยังเข้าไม่ได้)', r.error);
  // จำกัดต่อ IP
  const atk = device('9.9.9.9');
  for (let i = 0; i < 30; i++) await atk.auth('loginPassword', 'user' + i + 'x', 'guess-' + i);
  r = await atk.auth('loginPassword', 'anyone1', 'guess');
  ok(!r.ok && /รอ 15 นาที/.test(r.error), 'IP เดียวเดาผิด 30 ครั้ง → ระงับชั่วคราว');

  // รหัสกู้คืน (ใช้ได้แม้บัญชีล็อก) → ตั้งรหัสใหม่ → ได้รหัสกู้คืนใหม่
  const c = device();
  r = await c.auth('recoveryLogin', rc.toLowerCase().replace(/-/g, ' '));
  ok(r.ok && r.value.username === 'mompui1' && r.value.resetToken, 'รหัสกู้คืน (พิมพ์ตัวเล็ก/เว้นวรรคก็ได้) → เข้าได้ + ให้ตั้งรหัสใหม่');
  r = await c.auth('resetPassword', r.value.resetToken, 'Brand-new-pass-3');
  ok(r.ok && (await c.auth('me')).value.name === 'แม่ปุ๋ย', 'ตั้งรหัสใหม่สำเร็จ');
  ok((await b.auth('me')).value === null, 'เครื่องเก่าที่ค้างอยู่ถูกออกจากระบบ');
  ok(!(await device().auth('recoveryLogin', rc)).ok, 'รหัสกู้คืนเดิมใช้ซ้ำไม่ได้');
  const rc2 = (await c.auth('newRecoveryCode')).value.code;
  ok(rc2 && rc2 !== rc, 'ออกรหัสกู้คืนใหม่');
  ok((await device().auth('loginPassword', 'mompui1', 'Brand-new-pass-3')).ok, 'เข้าด้วยรหัสใหม่ได้ (ปลดล็อกแล้ว)');

  // เชิญผู้ปกครองคนที่ 2 → สมัครด้วยชื่อผู้ใช้
  const inv = new URL((await c.auth('createInvite', '')).value.url).searchParams.get('invite');
  const d = device();
  r = await d.auth('registerPassword', { mode: 'invite', invite: inv, name: 'พ่อปุ๋ย', avatar: '👨', username: 'dadpui', password: 'Dad-pass-1234' });
  me = (await d.auth('me')).value;
  ok(r.ok && me.familyId === (await c.auth('me')).value.familyId, 'สมัครผ่านลิงก์เชิญ → อยู่ครอบครัวเดียวกัน');
  ok(!(await device().auth('registerPassword', { mode: 'invite', invite: inv, name: 'x', username: 'dadpui2', password: 'Dad-pass-1234' })).ok, 'ลิงก์เชิญใช้ซ้ำไม่ได้');

  // พ่อลืมรหัส → แม่ส่งลิงก์ตั้งรหัสใหม่
  const acc = (await c.auth('familyAccess')).value;
  const dad = acc.parents.find(p => p.username === 'dadpui');
  ok(acc.me.username === 'mompui1' && acc.me.hasRecovery && dad, 'ตั้งค่าเห็นชื่อผู้ใช้ของฉัน/ของพ่อ + มีรหัสกู้คืน');
  const rl = new URL((await c.auth('createResetLink', dad.member_id)).value.url).searchParams.get('reset');
  ok((await device().auth('resetInfo', rl)).value.username === 'dadpui', 'เปิดลิงก์เห็นชื่อบัญชี');
  ok(!(await d.auth('createResetLink', dad.member_id)).ok, 'ส่งลิงก์ให้ตัวเองไม่ได้ (ใช้ "เปลี่ยนรหัส")');
  const e = device();
  ok((await e.auth('resetPassword', rl, 'Dad-new-pass-99')).ok && (await d.auth('me')).value === null, 'พ่อตั้งรหัสใหม่ · เครื่องเก่าออกจากระบบ');
  ok(!(await device().auth('resetPassword', rl, 'Again-pass-99')).ok, 'ลิงก์ใช้ซ้ำไม่ได้');

  // เปลี่ยนรหัสเอง
  ok(!(await e.auth('changePassword', 'wrong', 'Newer-pass-77')).ok, 'เปลี่ยนรหัส: รหัสเดิมผิด → ไม่ได้');
  ok((await e.auth('changePassword', 'Dad-new-pass-99', 'Newer-pass-77')).ok && (await e.auth('me')).value.name === 'พ่อปุ๋ย', 'เปลี่ยนรหัสสำเร็จ เครื่องนี้ยังอยู่');

  // ผู้ใช้ LINE เดิม: ไม่กระทบ + ตั้งชื่อผู้ใช้สำรองได้
  const line = device(); line.jar.sb_s = await sessionFor(db, P2);
  ok((await line.api('getParentDashboard', P2)).ok, 'ผู้ใช้ LINE เดิมใช้งานได้ตามปกติ');
  ok((await line.auth('pushInfo')).value.channel === 'line', 'แจ้งเตือนของผู้ใช้ LINE เดิมยังเป็นค่าเดิม');
  ok((await line.auth('setCredentials', 'ninimom', 'Nini-pass-123')).ok && (await device().auth('loginPassword', 'ninimom', 'Nini-pass-123')).ok, 'ผู้ใช้ LINE ตั้งชื่อผู้ใช้สำรองแล้วเข้าได้');
  const rcLine = (await line.auth('newRecoveryCode')).value.code;
  const lr = await device().auth('recoveryLogin', rcLine);
  ok(lr.ok && lr.value.hasLine, 'ผู้ใช้ LINE มีรหัสกู้คืนได้');

  await mf.dispose();
  console.log(fails ? fails + ' ไม่ผ่าน' : 'ผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
