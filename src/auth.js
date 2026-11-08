// ระบบเข้าสู่ระบบ
//   ผู้ปกครอง: LINE Login (OAuth) · เด็ก: รหัสครอบครัว + เลือกรูป + PIN 4 หลัก หรือสแกน QR จากผู้ปกครอง
//   ทุกคนได้ "กุญแจเครื่อง" เป็นคุกกี้ HttpOnly (JavaScript อ่านไม่ได้) อายุ 180 วัน ใช้ต่อเนื่องก็ต่ออายุเอง
//   ฐานข้อมูลเก็บเฉพาะค่าแฮชของกุญแจ/รหัสใช้ครั้งเดียว ไม่เก็บค่าจริง
import { Store } from './store.js';
import { createCore } from './core.js';
import { vapidKeys, notifyTest } from './push.js';

const SESSION_COOKIE = 'sb_s';
const OAUTH_COOKIE = 'sb_oauth';
const TICKET_COOKIE = 'sb_ticket';
const HANDOFF_COOKIE = 'sb_handoff';   // แอปบนหน้าจอโฮม (เก็บคุกกี้แยกจากเบราว์เซอร์) ขอให้เบราว์เซอร์ช่วยเข้าระบบ
const SESSION_DAYS = 180;
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MIN = 10;

// ---------- เครื่องมือ ----------
const enc = new TextEncoder();
function b64url(bytes) {
  let s = ''; bytes.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function randomToken(n = 32) { return b64url(crypto.getRandomValues(new Uint8Array(n))); }
export async function sha256(s) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}
function nowIso() { return new Date().toISOString(); }
function addMs(ms) { return new Date(Date.now() + ms).toISOString(); }

export function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}
function cookie(request, name, value, maxAgeSec) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
function clearCookie(request, name) { return cookie(request, name, '', 0); }

function json(obj, headers = {}) {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  for (const [k, v] of Object.entries(headers)) [].concat(v).forEach(x => h.append(k, x));
  return new Response(JSON.stringify(obj), { headers: h });
}
function redirect(location, cookies = []) {
  const h = new Headers({ location, 'cache-control': 'no-store' });
  cookies.forEach(c => h.append('set-cookie', c));
  return new Response(null, { status: 302, headers: h });
}

function deviceLabel(request) {
  const ua = request.headers.get('user-agent') || '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'อุปกรณ์อื่น';
  const br = /Line\//.test(ua) ? 'LINE' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox'
    : /Safari/.test(ua) ? 'Safari' : '';
  return br ? os + ' · ' + br : os;
}

async function hashPin(memberId, pin, salt) {
  salt = salt || randomToken(12);
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt + ':' + memberId), iterations: 10000 }, key, 256));
  return salt + ':' + b64url(bits);
}

// รหัสยืนยัน 4 ตัวที่แอปและเบราว์เซอร์แสดงตรงกัน (กันคนอื่นหลอกให้กดอนุญาต)
export function handoffCode(raw) { return String(raw).slice(0, 4).toUpperCase(); }

function publicMember(m, family) {
  return m ? { memberId: m.member_id, familyId: m.family_id, name: m.name, role: m.role, avatar: m.avatar,
    familyName: family ? family.family_name : '' } : null;
}

// ---------- กุญแจเครื่อง (session) ----------
export async function getSession(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT s.session_hash, s.last_seen_at, s.expires_at, m.member_id, m.family_id, m.name, m.role, m.avatar
       FROM Sessions s JOIN Members m ON m.member_id = s.member_id WHERE s.session_hash = ?`).bind(hash).first();
  if (!row) return null;
  if (row.expires_at && row.expires_at < nowIso()) {
    await env.DB.prepare('DELETE FROM Sessions WHERE session_hash = ?').bind(hash).run();
    return null;
  }
  const session = { hash, token, member: row, renewCookie: null };
  // ใช้งานต่อเนื่อง → ต่ออายุ (เขียนวันละครั้งพอ ประหยัดโควตา)
  if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() > 86400000) {
    await env.DB.prepare('UPDATE Sessions SET last_seen_at = ?, expires_at = ? WHERE session_hash = ?')
      .bind(nowIso(), addMs(SESSION_DAYS * 86400000), hash).run();
    session.renewCookie = cookie(request, SESSION_COOKIE, token, SESSION_DAYS * 86400);
  }
  return session;
}

async function createSession(env, request, member) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO Sessions (session_hash, member_id, family_id, created_at, last_seen_at, expires_at, device) VALUES (?,?,?,?,?,?,?)')
    .bind(await sha256(token), member.member_id, member.family_id, nowIso(), nowIso(), addMs(SESSION_DAYS * 86400000), deviceLabel(request)).run();
  return cookie(request, SESSION_COOKIE, token, SESSION_DAYS * 86400);
}

// ---------- รหัสใช้ครั้งเดียว ----------
async function makeToken(env, kind, fields, ttlMs) {
  const token = randomToken(kind === 'qr' ? 18 : 24);
  await env.DB.prepare('INSERT INTO AuthTokens (token_hash, kind, family_id, member_id, line_user_id, line_name, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(await sha256(token), kind, fields.family_id || null, fields.member_id || null, fields.line_user_id || null,
      fields.line_name || null, fields.created_by || null, nowIso(), addMs(ttlMs)).run();
  return token;
}
async function readToken(env, kind, token) {
  if (!token) return null;
  const row = await env.DB.prepare('SELECT * FROM AuthTokens WHERE token_hash = ? AND kind = ?').bind(await sha256(token), kind).first();
  if (!row || row.used_at || row.expires_at < nowIso()) return null;
  return row;
}
// ใช้แล้วทิ้ง (ถ้ามีคนใช้ไปก่อนเสี้ยววินาที = ไม่ผ่าน)
async function useToken(env, row) {
  const r = await env.DB.prepare('UPDATE AuthTokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').bind(nowIso(), row.token_hash).run();
  return r.meta && r.meta.changes === 1;
}

// ---------- LINE Login ----------
function lineConfigured(env) { return !!(env.LINE_LOGIN_CHANNEL_ID && env.LINE_LOGIN_CHANNEL_SECRET); }
function callbackUrl(request) { return new URL(request.url).origin + '/auth/line/callback'; }

async function lineStart(request, env) {
  const url = new URL(request.url);
  if (!lineConfigured(env)) return redirect('/?login_error=' + encodeURIComponent('ยังไม่ได้ตั้งค่า LINE Login'));
  const state = randomToken(16), nonce = randomToken(16);
  const invite = (url.searchParams.get('invite') || '').replace(/[^A-Za-z0-9_-]/g, '');
  const handoff = (url.searchParams.get('handoff') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const extra = [];
  if (handoff.length >= 32) {
    // แอปบนหน้าจอโฮมสร้างรหัสนี้เอง → จดไว้ รอให้ผู้ใช้กดยืนยันในเบราว์เซอร์หลังเข้าระบบ
    await env.DB.prepare("INSERT OR IGNORE INTO AuthTokens (token_hash, kind, created_by, created_at, expires_at) VALUES (?, 'handoff', 'pending', ?, ?)")
      .bind(await sha256(handoff), nowIso(), addMs(10 * 60000)).run();
    extra.push(cookie(request, HANDOFF_COOKIE, handoff, 600));
  }
  const q = new URLSearchParams({
    response_type: 'code', client_id: env.LINE_LOGIN_CHANNEL_ID, redirect_uri: callbackUrl(request),
    state, scope: 'profile openid', nonce,
  });
  if (env.LINE_LOGIN_BOT_PROMPT) q.set('bot_prompt', env.LINE_LOGIN_BOT_PROMPT);   // ชวนแอดเพื่อน LINE OA
  // จด state ไว้ในฐานข้อมูล (ไม่พึ่งคุกกี้อย่างเดียว) — บน iPhone, LINE มักยืนยันในแอป LINE แล้วเด้งกลับมา
  // หน้าต่างอื่นที่ไม่มีคุกกี้ของเรา · state ใช้ได้ครั้งเดียว อายุ 15 นาที
  await env.DB.prepare("INSERT INTO AuthTokens (token_hash, kind, line_name, created_at, expires_at) VALUES (?, 'oauth', ?, ?, ?)")
    .bind(await sha256(state), JSON.stringify({ nonce, invite, handoff: handoff.length >= 32 ? handoff : '' }), nowIso(), addMs(15 * 60000)).run();
  return redirect('https://access.line.me/oauth2/v2.1/authorize?' + q, [cookie(request, OAUTH_COOKIE, [state, nonce, invite].join('.'), 600), ...extra]);
}

async function lineCallback(request, env) {
  const url = new URL(request.url);
  const fail = msg => redirect('/?login_error=' + encodeURIComponent(msg), [clearCookie(request, OAUTH_COOKIE)]);
  if (url.searchParams.get('error')) return fail('ยกเลิกการเข้าสู่ระบบด้วย LINE');
  const state = url.searchParams.get('state') || '';
  const st = await readToken(env, 'oauth', state);
  if (!st || !(await useToken(env, st))) return fail('หมดเวลา กรุณากดเข้าสู่ระบบอีกครั้ง');
  let saved = {};
  try { saved = JSON.parse(st.line_name || '{}'); } catch (e) {}
  const nonce = saved.nonce || '', invite = saved.invite || '', handoffRaw = saved.handoff || '';

  let profile;
  try {
    const tr = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '',
        redirect_uri: callbackUrl(request), client_id: env.LINE_LOGIN_CHANNEL_ID, client_secret: env.LINE_LOGIN_CHANNEL_SECRET }),
    });
    const tok = await tr.json();
    if (!tr.ok || !tok.id_token) throw new Error('token');
    const vr = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: tok.id_token, client_id: env.LINE_LOGIN_CHANNEL_ID, nonce }),
    });
    profile = await vr.json();
    if (!vr.ok || !profile.sub) throw new Error('verify');
  } catch (e) {
    console.log('line login error', e);
    return fail('เชื่อมต่อ LINE ไม่สำเร็จ ลองใหม่อีกครั้ง');
  }
  const lineId = profile.sub, lineName = String(profile.name || 'ผู้ปกครอง').slice(0, 40);
  const done = [clearCookie(request, OAUTH_COOKIE)];
  // เด้งกลับมาหน้าต่างใหม่ → ฝากคำขอของแอปบนหน้าจอโฮมไว้ที่หน้าต่างนี้ด้วย (ให้กดยืนยันรหัสได้)
  if (handoffRaw) done.push(cookie(request, HANDOFF_COOKIE, handoffRaw, 600));

  // มาจากลิงก์เชิญ
  if (invite) {
    const inv = await readToken(env, 'invite', invite);
    if (!inv) return fail('ลิงก์เชิญหมดอายุหรือถูกใช้ไปแล้ว ขอลิงก์ใหม่จากผู้ปกครองในครอบครัว');
    const already = await env.DB.prepare("SELECT * FROM Members WHERE line_user_id = ? AND family_id = ? AND role = 'parent'").bind(lineId, inv.family_id).first();
    let member = already;
    if (!member && inv.member_id) {
      // ผูก LINE กับสมาชิกเดิมที่ยังไม่มี LINE (กันสมาชิกซ้ำ)
      const target = await env.DB.prepare("SELECT * FROM Members WHERE member_id = ? AND family_id = ? AND role = 'parent'").bind(inv.member_id, inv.family_id).first();
      if (!target) return fail('ไม่พบสมาชิกที่ลิงก์นี้ชี้ไป');
      if (target.line_user_id && target.line_user_id !== lineId) return fail('สมาชิกนี้ผูกกับ LINE บัญชีอื่นแล้ว');
      if (!(await useToken(env, inv))) return fail('ลิงก์เชิญถูกใช้ไปแล้ว');
      await env.DB.prepare('UPDATE Members SET line_user_id = ? WHERE member_id = ?').bind(lineId, target.member_id).run();
      member = target;
    } else if (!member) {
      if (!(await useToken(env, inv))) return fail('ลิงก์เชิญถูกใช้ไปแล้ว');
      member = await addParentViaCore(env, request, inv.family_id, lineName, '👨‍👩‍👧', lineId);
    } else {
      await useToken(env, inv);
    }
    done.push(await createSession(env, request, member));
    return redirect('/', done);
  }

  const { results } = await env.DB.prepare("SELECT * FROM Members WHERE line_user_id = ? AND role = 'parent'").bind(lineId).all();
  if (results.length === 1) {
    done.push(await createSession(env, request, results[0]));
    return redirect('/', done);
  }
  // ยังไม่มีบัญชี หรือมีหลายครอบครัว → ให้หน้าเว็บถามต่อ
  const ticket = await makeToken(env, 'ticket', { line_user_id: lineId, line_name: lineName }, 15 * 60000);
  done.push(cookie(request, TICKET_COOKIE, ticket, 900));
  return redirect(results.length ? '/#pick-family' : '/#new-parent', done);
}

// เพิ่มผู้ปกครองผ่านตรรกะเดิม (joinFamily) แล้วผูก LINE
async function addParentViaCore(env, request, familyId, name, avatar, lineId) {
  const store = new Store(env.DB);
  await store.load({ familyIds: [familyId] });
  const core = createCore({ store, outbox: [], webAppUrl: new URL(request.url).origin + '/' });
  const r = core.joinFamily(familyId, name, 'parent', avatar);
  store.update('Members', 'member_id', r.memberId, { line_user_id: lineId });
  await store.flush();
  return { member_id: r.memberId, family_id: familyId };
}

// ---------- คำสั่งจากหน้าเว็บ: POST /auth/api/<fn> ----------
async function requireParentSession(request, env) {
  const s = await getSession(request, env);
  if (!s || s.member.role !== 'parent') throw new Error('เฉพาะผู้ปกครองเท่านั้น');
  return s;
}
async function familyChild(env, familyId, childId) {
  const c = await env.DB.prepare("SELECT * FROM Members WHERE member_id = ? AND family_id = ? AND role = 'child'").bind(String(childId), familyId).first();
  if (!c) throw new Error('ไม่พบเด็กคนนี้');
  return c;
}
function cleanPin(pin) {
  pin = String(pin || '');
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN ต้องเป็นตัวเลข 4 หลัก');
  return pin;
}

const ACTIONS = {
  // ใครกำลังใช้เครื่องนี้
  async me(request, env) {
    const s = await getSession(request, env);
    if (!s) return { value: null };
    const fam = await env.DB.prepare('SELECT family_name FROM Families WHERE family_id = ?').bind(s.member.family_id).first();
    return { value: publicMember(s.member, fam), cookies: s.renewCookie ? [s.renewCookie] : [] };
  },

  async logout(request, env) {
    const s = await getSession(request, env);
    if (s) await env.DB.prepare('DELETE FROM Sessions WHERE session_hash = ?').bind(s.hash).run();
    return { value: true, cookies: [clearCookie(request, SESSION_COOKIE)] };
  },

  // หลัง LINE Login: ข้อมูลที่ต้องถามต่อ (สร้างครอบครัว / เลือกครอบครัว)
  async ticketInfo(request, env) {
    const t = await readToken(env, 'ticket', getCookie(request, TICKET_COOKIE));
    if (!t) return { value: null };
    const { results } = await env.DB.prepare(
      "SELECT m.member_id, m.name, m.avatar, f.family_name FROM Members m JOIN Families f ON f.family_id = m.family_id WHERE m.line_user_id = ? AND m.role = 'parent'")
      .bind(t.line_user_id).all();
    return { value: { lineName: t.line_name, options: results } };
  },

  async pickFamily(request, env, [memberId]) {
    const t = await readToken(env, 'ticket', getCookie(request, TICKET_COOKIE));
    if (!t) throw new Error('หมดเวลา กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง');
    const m = await env.DB.prepare("SELECT * FROM Members WHERE member_id = ? AND line_user_id = ? AND role = 'parent'").bind(String(memberId), t.line_user_id).first();
    if (!m) throw new Error('ไม่พบครอบครัวนี้');
    await useToken(env, t);
    return { value: true, cookies: [await createSession(env, request, m), clearCookie(request, TICKET_COOKIE)] };
  },

  async registerFamily(request, env, [familyName, parentName, avatar]) {
    const t = await readToken(env, 'ticket', getCookie(request, TICKET_COOKIE));
    if (!t) throw new Error('หมดเวลา กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง');
    familyName = String(familyName || '').trim().slice(0, 60);
    parentName = String(parentName || '').trim().slice(0, 40);
    if (familyName.length < 2) throw new Error('กรุณาใส่ชื่อครอบครัว');
    if (!parentName) throw new Error('กรุณาใส่ชื่อของคุณ');
    if (!(await useToken(env, t))) throw new Error('หมดเวลา กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง');
    const store = new Store(env.DB);
    await store.load({ familyIds: [] });
    const core = createCore({ store, outbox: [], webAppUrl: new URL(request.url).origin + '/' });
    const fam = core.createFamily_(familyName);
    const r = core.joinFamily(fam.familyId, parentName, 'parent', avatar || '👨‍👩‍👧');
    store.update('Members', 'member_id', r.memberId, { line_user_id: t.line_user_id });
    await store.flush();
    return { value: true, cookies: [await createSession(env, request, { member_id: r.memberId, family_id: fam.familyId }), clearCookie(request, TICKET_COOKIE)] };
  },

  // ---- เด็ก ----
  async kidFamily(request, env, [code]) {
    code = String(code || '').toUpperCase().replace(/\s/g, '');
    const f = await env.DB.prepare('SELECT family_id, family_name FROM Families WHERE join_code = ?').bind(code).first();
    if (!f) throw new Error('ไม่พบครอบครัวนี้ ลองตรวจรหัสอีกครั้ง');
    const { results } = await env.DB.prepare("SELECT member_id, name, avatar, pin_hash FROM Members WHERE family_id = ? AND role = 'child' ORDER BY rowid").bind(f.family_id).all();
    return { value: { familyName: f.family_name, children: results.map(c => ({ member_id: c.member_id, name: c.name, avatar: c.avatar, hasPin: !!c.pin_hash })) } };
  },

  async kidLogin(request, env, [code, childId, pin]) {
    code = String(code || '').toUpperCase().replace(/\s/g, '');
    const c = await env.DB.prepare(
      "SELECT m.* FROM Members m JOIN Families f ON f.family_id = m.family_id WHERE f.join_code = ? AND m.member_id = ? AND m.role = 'child'")
      .bind(code, String(childId)).first();
    if (!c) throw new Error('ไม่พบสมาชิก');
    if (!c.pin_hash) throw new Error('ยังไม่มี PIN ให้ผู้ปกครองตั้ง PIN หรือเปิด QR ให้สแกน');
    if (c.pin_locked_until && c.pin_locked_until > nowIso()) {
      const min = Math.ceil((new Date(c.pin_locked_until) - Date.now()) / 60000);
      throw new Error(`ใส่ PIN ผิดหลายครั้ง รออีก ${min} นาที หรือให้ผู้ปกครองเปิด QR ให้สแกน`);
    }
    const salt = String(c.pin_hash).split(':')[0];
    if ((await hashPin(c.member_id, String(pin || ''), salt)) !== c.pin_hash) {
      const fails = Number(c.pin_fails || 0) + 1;
      const lock = fails >= PIN_MAX_FAILS;
      await env.DB.prepare('UPDATE Members SET pin_fails = ?, pin_locked_until = ? WHERE member_id = ?')
        .bind(lock ? 0 : fails, lock ? addMs(PIN_LOCK_MIN * 60000) : null, c.member_id).run();
      throw new Error(lock ? `ใส่ PIN ผิด ${PIN_MAX_FAILS} ครั้ง ล็อก ${PIN_LOCK_MIN} นาที` : `PIN ไม่ถูกต้อง (เหลือ ${PIN_MAX_FAILS - fails} ครั้ง)`);
    }
    await env.DB.prepare('UPDATE Members SET pin_fails = 0, pin_locked_until = NULL WHERE member_id = ?').bind(c.member_id).run();
    return { value: true, cookies: [await createSession(env, request, c)] };
  },

  async qrLogin(request, env, [token]) {
    const t = await readToken(env, 'qr', token);
    if (!t || !(await useToken(env, t))) throw new Error('QR หมดอายุหรือถูกใช้แล้ว ให้ผู้ปกครองเปิด QR ใหม่');
    const c = await env.DB.prepare('SELECT * FROM Members WHERE member_id = ? AND family_id = ?').bind(t.member_id, t.family_id).first();
    if (!c) throw new Error('ไม่พบสมาชิก');
    return { value: true, cookies: [await createSession(env, request, c)] };
  },

  // ---- ผู้ปกครองจัดการการเข้าระบบของครอบครัว ----
  async familyAccess(request, env) {
    const s = await requireParentSession(request, env);
    const fid = s.member.family_id;
    const [mem, ses] = await env.DB.batch([
      // ใช้งานล่าสุด = เวลาล่าสุดของ: เข้าระบบ, อนุมัติ/ปฏิเสธ, เพิ่มภารกิจ/รางวัล, รับทราบการแลก
      env.DB.prepare(`SELECT m.member_id, m.name, m.avatar, m.role, m.line_user_id, m.pin_hash, m.created_at,
          (SELECT MAX(last_seen_at) FROM Sessions WHERE member_id = m.member_id) AS seen,
          (SELECT MAX(reviewed_at) FROM Submissions WHERE family_id = m.family_id AND reviewed_by = m.member_id) AS reviewed,
          (SELECT COUNT(*) FROM Submissions WHERE family_id = m.family_id AND reviewed_by = m.member_id) AS n_review,
          (SELECT MAX(created_at) FROM Missions WHERE family_id = m.family_id AND created_by = m.member_id) AS mission,
          (SELECT COUNT(*) FROM Missions WHERE family_id = m.family_id AND created_by = m.member_id) AS n_mission,
          (SELECT MAX(created_at) FROM Rewards WHERE family_id = m.family_id AND created_by = m.member_id) AS reward,
          (SELECT COUNT(*) FROM Rewards WHERE family_id = m.family_id AND created_by = m.member_id) AS n_reward,
          (SELECT MAX(acknowledged_at) FROM Redemptions WHERE family_id = m.family_id AND acknowledged_by = m.member_id) AS ack,
          (SELECT COUNT(*) FROM Sessions WHERE member_id = m.member_id) AS n_device
        FROM Members m WHERE m.family_id = ? ORDER BY m.rowid`).bind(fid),
      env.DB.prepare('SELECT s.session_hash, s.member_id, s.device, s.last_seen_at, m.name, m.avatar FROM Sessions s JOIN Members m ON m.member_id = s.member_id WHERE s.family_id = ? ORDER BY s.last_seen_at DESC').bind(fid),
    ]);
    const members = mem.results;
    return { value: {
      children: members.filter(m => m.role === 'child').map(m => ({ member_id: m.member_id, name: m.name, avatar: m.avatar, hasPin: !!m.pin_hash })),
      parents: members.filter(m => m.role === 'parent').map(m => ({
        member_id: m.member_id, name: m.name, avatar: m.avatar, hasLine: !!m.line_user_id, isMe: m.member_id === s.member.member_id,
        createdAt: m.created_at || '',
        lastActive: [m.seen, m.reviewed, m.mission, m.reward, m.ack, m.created_at].filter(Boolean).sort().pop() || '',
        reviews: m.n_review, missions: m.n_mission, rewards: m.n_reward, devices: m.n_device,
      })),
      devices: ses.results.map(d => ({ id: d.session_hash.slice(0, 16), name: d.name, avatar: d.avatar, device: d.device, lastSeen: d.last_seen_at, current: d.session_hash === s.hash })),
    } };
  },

  async setChildPin(request, env, [childId, pin]) {
    const s = await requireParentSession(request, env);
    const c = await familyChild(env, s.member.family_id, childId);
    const h = await hashPin(c.member_id, cleanPin(pin));
    await env.DB.prepare('UPDATE Members SET pin_hash = ?, pin_fails = 0, pin_locked_until = NULL WHERE member_id = ?').bind(h, c.member_id).run();
    return { value: true };
  },

  async addChild(request, env, [name, avatar, pin]) {
    const s = await requireParentSession(request, env);
    name = String(name || '').trim().slice(0, 40);
    if (!name) throw new Error('กรุณาใส่ชื่อ');
    pin = cleanPin(pin);
    const store = new Store(env.DB);
    await store.load({ familyIds: [s.member.family_id] });
    const core = createCore({ store, outbox: [], webAppUrl: new URL(request.url).origin + '/' });
    const r = core.joinFamily(s.member.family_id, name, 'child', avatar || '🧒');
    await store.flush();
    await env.DB.prepare('UPDATE Members SET pin_hash = ? WHERE member_id = ?').bind(await hashPin(r.memberId, pin), r.memberId).run();
    return { value: { member_id: r.memberId }, touched: s.member.family_id };
  },

  async childQr(request, env, [childId]) {
    const s = await requireParentSession(request, env);
    const c = await familyChild(env, s.member.family_id, childId);
    const token = await makeToken(env, 'qr', { family_id: c.family_id, member_id: c.member_id, created_by: s.member.member_id }, 10 * 60000);
    return { value: { url: new URL(request.url).origin + '/?qr=' + token, minutes: 10 } };
  },

  async createInvite(request, env, [claimMemberId]) {
    const s = await requireParentSession(request, env);
    let target = null;
    if (claimMemberId) {
      target = await env.DB.prepare("SELECT * FROM Members WHERE member_id = ? AND family_id = ? AND role = 'parent'").bind(String(claimMemberId), s.member.family_id).first();
      if (!target) throw new Error('ไม่พบสมาชิก');
      if (target.line_user_id) throw new Error('สมาชิกนี้ผูก LINE แล้ว');
    }
    const token = await makeToken(env, 'invite', { family_id: s.member.family_id, member_id: target ? target.member_id : null, created_by: s.member.member_id }, 7 * 86400000);
    return { value: { url: new URL(request.url).origin + '/?invite=' + token, days: 7 } };
  },

  async inviteInfo(request, env, [token]) {
    const t = await readToken(env, 'invite', token);
    if (!t) return { value: null };
    const f = await env.DB.prepare('SELECT family_name FROM Families WHERE family_id = ?').bind(t.family_id).first();
    const m = t.member_id ? await env.DB.prepare('SELECT name FROM Members WHERE member_id = ?').bind(t.member_id).first() : null;
    return { value: { familyName: f ? f.family_name : '', claimName: m ? m.name : '' } };
  },

  // รวมผู้ปกครองซ้ำ: ย้ายประวัติทั้งหมดไปที่ intoId แล้วลบแถว fromId (เฉพาะแถวที่ไม่ได้ผูก LINE)
  async mergeParent(request, env, [fromId, intoId]) {
    const s = await requireParentSession(request, env);
    const fid = s.member.family_id;
    fromId = String(fromId || ''); intoId = String(intoId || '');
    if (!fromId || !intoId || fromId === intoId) throw new Error('เลือกสมาชิกไม่ถูกต้อง');
    const from = await env.DB.prepare("SELECT * FROM Members WHERE member_id = ? AND family_id = ? AND role = 'parent'").bind(fromId, fid).first();
    const into = await env.DB.prepare("SELECT * FROM Members WHERE member_id = ? AND family_id = ? AND role = 'parent'").bind(intoId, fid).first();
    if (!from || !into) throw new Error('ไม่พบสมาชิก');
    if (from.line_user_id) throw new Error('รวมได้เฉพาะสมาชิกที่ยังไม่ผูก LINE');
    const db = env.DB;
    await db.batch([
      // ลบก่อน แล้วเช็กว่าลบได้จริง (ถ้าระหว่างนั้นมีคนผูก LINE ให้แถวนี้ → ยกเลิกทั้งชุด)
      db.prepare("DELETE FROM Members WHERE member_id = ? AND family_id = ? AND role = 'parent' AND (line_user_id IS NULL OR line_user_id = '')").bind(fromId, fid),
      db.prepare('INSERT INTO _guard (ok) VALUES (changes())'),
      db.prepare('UPDATE Submissions SET reviewed_by = ? WHERE family_id = ? AND reviewed_by = ?').bind(intoId, fid, fromId),
      db.prepare('UPDATE Missions SET created_by = ? WHERE family_id = ? AND created_by = ?').bind(intoId, fid, fromId),
      db.prepare('UPDATE Rewards SET created_by = ? WHERE family_id = ? AND created_by = ?').bind(intoId, fid, fromId),
      db.prepare('UPDATE Redemptions SET acknowledged_by = ? WHERE family_id = ? AND acknowledged_by = ?').bind(intoId, fid, fromId),
      db.prepare('DELETE FROM Sessions WHERE member_id = ?').bind(fromId),
      db.prepare('DELETE FROM AuthTokens WHERE member_id = ?').bind(fromId),
      db.prepare('INSERT INTO MergeLog (from_id, into_id, family_id, merged_by, merged_at) VALUES (?,?,?,?,?)').bind(fromId, intoId, fid, s.member.member_id, nowIso()),
      db.prepare('DELETE FROM _guard'),
    ]).catch(e => { throw new Error(/CHECK/i.test(String(e.message)) ? 'ข้อมูลเพิ่งเปลี่ยน กรุณาลองใหม่' : e.message); });
    return { value: true, touched: fid };
  },

  // ---- แจ้งเตือนในแอป ----
  async pushInfo(request, env, [endpoint]) {
    const s = await requireParentSession(request, env);
    const m = await env.DB.prepare('SELECT notify_channel, line_user_id FROM Members WHERE member_id = ?').bind(s.member.member_id).first();
    const { publicKey } = await vapidKeys(env);
    const here = endpoint ? await env.DB.prepare('SELECT 1 AS x FROM PushSubs WHERE endpoint = ? AND member_id = ?').bind(String(endpoint), s.member.member_id).first() : null;
    const { results: subs } = await env.DB.prepare('SELECT endpoint, device, created_at, last_sent_at, last_delivered_at FROM PushSubs WHERE member_id = ? ORDER BY created_at').bind(s.member.member_id).all();
    const list = [];
    for (const d of subs) {
      // ส่งไปแล้วแต่ไม่มีใบตอบรับเกิน 5 นาที = แจ้งเตือนล่าสุดยังไม่ถึงเครื่อง
      const missed = !!(d.last_sent_at && (!d.last_delivered_at || d.last_delivered_at < d.last_sent_at) && Date.now() - new Date(d.last_sent_at) > 5 * 60000);
      list.push({ id: (await sha256(d.endpoint)).slice(0, 16), device: d.device, since: d.created_at, lastSent: d.last_sent_at, lastDelivered: d.last_delivered_at,
        thisDevice: !!endpoint && d.endpoint === String(endpoint), missed });
    }
    return { value: { publicKey, channel: m.notify_channel || 'line', hasLine: !!m.line_user_id, thisDevice: !!here, devices: subs.length, list } };
  },

  async pushSubscribe(request, env, [sub]) {
    const s = await requireParentSession(request, env);
    const ep = sub && String(sub.endpoint || ''), keys = (sub && sub.keys) || {};
    if (!/^https:\/\//.test(ep) || !keys.p256dh || !keys.auth) throw new Error('ข้อมูลการแจ้งเตือนไม่ถูกต้อง');
    await env.DB.prepare(`INSERT INTO PushSubs (endpoint, member_id, family_id, p256dh, auth, device, created_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(endpoint) DO UPDATE SET member_id = excluded.member_id, family_id = excluded.family_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device`)
      .bind(ep, s.member.member_id, s.member.family_id, String(keys.p256dh), String(keys.auth), deviceLabel(request), nowIso()).run();
    // เปิดครั้งแรก: ถ้ายังใช้ค่าเดิม (LINE) → รับทั้งสองทางไปก่อน แล้วค่อยเลือกเองได้
    await env.DB.prepare("UPDATE Members SET notify_channel = 'both' WHERE member_id = ? AND (notify_channel IS NULL OR notify_channel = 'line')").bind(s.member.member_id).run();
    return { value: true };
  },

  async pushRemoveDevice(request, env, [id]) {
    const s = await requireParentSession(request, env);
    const { results } = await env.DB.prepare('SELECT endpoint FROM PushSubs WHERE member_id = ?').bind(s.member.member_id).all();
    for (const r of results) if ((await sha256(r.endpoint)).slice(0, 16) === String(id)) await env.DB.prepare('DELETE FROM PushSubs WHERE endpoint = ?').bind(r.endpoint).run();
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM PushSubs WHERE member_id = ?').bind(s.member.member_id).first();
    if (!n.n) await env.DB.prepare("UPDATE Members SET notify_channel = 'line' WHERE member_id = ? AND notify_channel IN ('app','both')").bind(s.member.member_id).run();
    return { value: true };
  },

  async pushUnsubscribe(request, env, [endpoint]) {
    const s = await requireParentSession(request, env);
    await env.DB.prepare('DELETE FROM PushSubs WHERE endpoint = ? AND member_id = ?').bind(String(endpoint || ''), s.member.member_id).run();
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM PushSubs WHERE member_id = ?').bind(s.member.member_id).first();
    if (!n.n) await env.DB.prepare("UPDATE Members SET notify_channel = 'line' WHERE member_id = ? AND notify_channel IN ('app','both')").bind(s.member.member_id).run();
    return { value: true };
  },

  async setNotifyChannel(request, env, [ch]) {
    const s = await requireParentSession(request, env);
    if (!['line', 'app', 'both'].includes(ch)) throw new Error('ตัวเลือกไม่ถูกต้อง');
    const m = await env.DB.prepare('SELECT line_user_id FROM Members WHERE member_id = ?').bind(s.member.member_id).first();
    if (ch !== 'app' && !m.line_user_id) throw new Error('บัญชีนี้ยังไม่ผูก LINE');
    if (ch !== 'line') {
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM PushSubs WHERE member_id = ?').bind(s.member.member_id).first();
      if (!n.n) throw new Error('เปิดแจ้งเตือนในเครื่องนี้ก่อน');
    }
    await env.DB.prepare('UPDATE Members SET notify_channel = ? WHERE member_id = ?').bind(ch, s.member.member_id).run();
    return { value: ch };
  },

  async pushTest(request, env) {
    const s = await requireParentSession(request, env);
    const n = await notifyTest(env, new URL(request.url).origin, s.member.member_id);
    if (!n) throw new Error('ยังไม่มีเครื่องที่เปิดแจ้งเตือน');
    return { value: n };
  },

  // ---- แอปบนหน้าจอโฮม: เข้าระบบผ่านเบราว์เซอร์แล้วส่งต่อมาที่แอป ----
  // (เบราว์เซอร์ฝั่งที่เพิ่งเข้าด้วย LINE) มีคำขอรออยู่ไหม
  async handoffInfo(request, env) {
    const raw = getCookie(request, HANDOFF_COOKIE);
    if (!raw) return { value: null };
    const t = await readToken(env, 'handoff', raw);
    const s = await getSession(request, env);
    if (!t || t.created_by !== 'pending' || !s) return { value: null };
    return { value: { code: handoffCode(raw), name: s.member.name, avatar: s.member.avatar } };
  },
  async handoffApprove(request, env) {
    const raw = getCookie(request, HANDOFF_COOKIE);
    const s = await getSession(request, env);
    if (!raw || !s) throw new Error('หมดเวลา ลองกดเข้าสู่ระบบจากแอปอีกครั้ง');
    const r = await env.DB.prepare("UPDATE AuthTokens SET member_id = ?, family_id = ?, created_by = 'approved' WHERE token_hash = ? AND kind = 'handoff' AND created_by = 'pending' AND used_at IS NULL AND expires_at > ?")
      .bind(s.member.member_id, s.member.family_id, await sha256(raw), nowIso()).run();
    if (!(r.meta && r.meta.changes === 1)) throw new Error('หมดเวลา ลองกดเข้าสู่ระบบจากแอปอีกครั้ง');
    return { value: true, cookies: [clearCookie(request, HANDOFF_COOKIE)] };
  },
  async handoffCancel(request, env) {
    return { value: true, cookies: [clearCookie(request, HANDOFF_COOKIE)] };
  },
  // (แอปบนหน้าจอโฮม) ถามว่ายืนยันแล้วหรือยัง → ได้กุญแจเครื่องของตัวเอง
  async handoffCheck(request, env, [raw]) {
    const t = await readToken(env, 'handoff', String(raw || ''));
    if (!t) throw new Error('หมดเวลา กรุณากดเข้าสู่ระบบอีกครั้ง');
    if (t.created_by !== 'approved' || !t.member_id) return { value: false };
    if (!(await useToken(env, t))) return { value: false };
    const m = await env.DB.prepare('SELECT * FROM Members WHERE member_id = ?').bind(t.member_id).first();
    if (!m) throw new Error('ไม่พบสมาชิก');
    return { value: true, cookies: [await createSession(env, request, m)] };
  },

  async revokeDevice(request, env, [id]) {
    const s = await requireParentSession(request, env);
    id = String(id || '').replace(/[^0-9a-f]/g, '');
    if (id.length !== 16) throw new Error('ไม่พบอุปกรณ์');
    const r = await env.DB.prepare("DELETE FROM Sessions WHERE family_id = ? AND substr(session_hash, 1, 16) = ?").bind(s.member.family_id, id).run();
    return { value: (r.meta && r.meta.changes) || 0, touched: s.member.family_id };
  },
};

export async function handleAuth(request, env, notify) {
  const url = new URL(request.url);
  if (url.pathname === '/auth/line/start') return lineStart(request, env);
  if (url.pathname === '/auth/line/callback') return lineCallback(request, env);
  if (url.pathname.startsWith('/auth/api/') && request.method === 'POST') {
    const fn = url.pathname.slice('/auth/api/'.length);
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, fn)) return json({ ok: false, error: 'ไม่พบคำสั่งนี้' });
    let args = [];
    try { args = (await request.json()).args || []; } catch (e) {}
    try {
      const r = await ACTIONS[fn](request, env, Array.isArray(args) ? args : []);
      if (r.touched && notify) notify(r.touched);
      return json({ ok: true, value: r.value === undefined ? null : r.value }, { 'set-cookie': r.cookies || [] });
    } catch (e) {
      return json({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  }
  return new Response('not found', { status: 404 });
}
