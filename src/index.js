// ธนาคารดาว — Cloudflare Worker
//   POST /api/<ฟังก์ชัน>   แทน google.script.run (body: {"args":[...]})
//   POST /line             LINE webhook (ตรวจลายเซ็นจาก LINE ทุกครั้ง)
//   อื่น ๆ                  หน้าเว็บจากโฟลเดอร์ public/
import { Store, ConflictError } from './store.js';
import { createCore, PUBLIC_API } from './core.js';
export { FamilyHub } from './hub.js';

import { handleAuth, getSession } from './auth.js';
import { notifyApp, filterLineOutbox, pushAck } from './push.js';

// คำสั่งที่ต้องเข้าสู่ระบบ: อาร์กิวเมนต์ตัวไหนคือ "ตัวผู้ใช้"
// → เซิร์ฟเวอร์ใส่รหัสสมาชิกจากกุญแจเครื่อง (session) ทับเสมอ ไม่เชื่อค่าที่หน้าเว็บส่งมา
const MEMBER_ARG = {
  getChildDashboard: 0, getParentDashboard: 0,
  submitMission: 1, redeemReward: 1, spinWheel: 0,
  reviewSubmission: 2, acknowledgeRedemptions: 1, checkRejectImpact: 1,
  webSaveMission: 1, webSaveReward: 1, webDeleteMission: 1, webDeleteReward: 1,
  toggleSubmissionNotify: 0, getDailySummary: 2,
  setWheelEnabled: 0, setWheelPrizes: 0, getWheelStatus: 0,
  createUrgent: 0, cancelUrgent: 0, urgentSeen: 0, acceptUrgent: 0, submitUrgent: 0, declineUrgent: 0,
  sendGift: 0, cancelGift: 0, openGift: 0,
  questSeen: 0, treeSeen: 0, setTheme: 0, setFloor: 0, setWall: 0, saveRoom: 0, setPets: 0, hugEgg: 0, hatchEgg: 0, eggSeen: 0, purpleSeen: 0, claimQuest: 0, getShop: 0, buyItem: 0, assignAvatar: 0, wishItem: 0,
};
// คำสั่งเข้าระบบแบบเก่า (ลิงก์ ?auto=, รหัสครอบครัว) ถูกแทนด้วย /auth/* แล้ว

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
      return handleApi(url.pathname.slice(5), request, env, ctx);
    }
    if (url.pathname === '/line') {
      if (request.method !== 'POST') return new Response('OK');
      return handleLine(request, env, ctx);
    }
    if (url.pathname.startsWith('/auth/')) {
      return handleAuth(request, env, fid => notifyFamilies(env, ctx, new Set([String(fid)]), ''));
    }
    if (url.pathname === '/push/ack' && request.method === 'POST') {
      let b = {}; try { b = await request.json(); } catch (e) {}
      return json({ ok: await pushAck(env, b.nid, b.ev) });
    }
    if (url.pathname === '/ws') return handleLive(url, request, env);
    if (url.pathname === '/health') return json({ ok: true, app: 'starbank' });
    if (url.pathname === '/version') return json(appVersion(env));
    if (url.pathname === '/' || url.pathname === '/index.html') {
      // ฝังเวอร์ชันที่ deploy อยู่ลงในหน้าแอป → หน้าตั้งค่าเทียบกับเซิร์ฟเวอร์ได้ว่าล่าสุดหรือยัง
      const res = await env.ASSETS.fetch(request);
      if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
      const v = appVersion(env);
      return new HTMLRewriter().on('head', {
        element(el) { el.append(`<meta name="app-version" content="${v.version}" data-id="${v.id}">`, { html: true }); },
      }).transform(res);
    }
    return env.ASSETS.fetch(request);
  },
};

// เวอร์ชัน = เวลาที่ deploy (เวลาไทย) เช่น 2026.11.08-1315 · เปลี่ยนเองทุกครั้งที่ push ขึ้น GitHub
function appVersion(env) {
  const m = env.CF_VERSION_METADATA || {};
  const id = String(m.id || 'dev').slice(0, 8);
  let version = 'dev';
  if (m.timestamp) {
    const t = new Date(new Date(m.timestamp).getTime() + 7 * 3600000).toISOString();
    version = t.slice(0, 10).replace(/-/g, '.') + '-' + t.slice(11, 16).replace(':', '');
  }
  return { version, id };
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}

async function handleApi(fn, request, env, ctx) {
  if (!PUBLIC_API.includes(fn) || !(fn in MEMBER_ARG)) return json({ ok: false, error: 'ไม่พบคำสั่งนี้' }, 404);
  let args;
  try { args = (await request.json()).args || []; } catch (e) { return json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, 400); }
  if (!Array.isArray(args)) return json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, 400);
  const webAppUrl = new URL(request.url).origin + '/';
  const session = await getSession(request, env);
  if (!session) return json({ ok: false, auth: true, error: 'กรุณาเข้าสู่ระบบใหม่' });
  args[MEMBER_ARG[fn]] = session.member.member_id;
  const scope = { familyIds: [session.member.family_id] };
  const extra = session.renewCookie ? { 'set-cookie': session.renewCookie } : {};

  // ถ้ามีเครื่องอื่นแก้ข้อมูลชนกัน (ไม่มีอะไรถูกบันทึก) → ลองใหม่อัตโนมัติ เหมือน LockService รอคิว
  for (let attempt = 0; ; attempt++) {
    const store = new Store(env.DB);
    const S = { store, outbox: [], webAppUrl, events: [] };
    try {
      await store.load(scope, { fn, subIds: (fn === 'reviewSubmission' || fn === 'checkRejectImpact') ? [args[0]] : [] });
      const core = createCore(S);
      const value = core.api[fn](...args);
      await store.flush();
      notifyFamilies(env, ctx, store.touched, request.headers.get('x-client-id'));
      const origin = new URL(request.url).origin;
      if (S.events.length) ctx.waitUntil(notifyApp(env, origin, S.events).catch(e => console.log('app push error', e)));
      if (S.urgentWake) scheduleUrgent(env, ctx, session.member.family_id, S.urgentWake, origin);
      await sendLine(env, await filterLineOutbox(env, scope.familyIds, S.outbox), origin);
      return json({ ok: true, value: value === undefined ? null : value }, 200, extra);
    } catch (e) {
      if (e instanceof ConflictError && attempt < 2) continue;
      console.log('api error', fn, e && e.stack || e);
      return json({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  }
}

// ---------- อัปเดตหน้าจอทันที (ทุกเครื่องในครอบครัวเดียวกัน) ----------
async function handleLive(url, request, env) {
  if (request.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
  const session = await getSession(request, env);
  if (!session) return new Response('login required', { status: 403 });
  const hub = env.FAMILY_HUB.get(env.FAMILY_HUB.idFromName(String(session.member.family_id)));
  // บอก Hub ว่าการเชื่อมต่อนี้เป็นของใคร (บันทึกในตาราง Presence)
  const h = new Headers(request.headers);
  h.set('x-sb-family', String(session.member.family_id)); h.set('x-sb-member', String(session.member.member_id)); h.set('x-sb-role', String(session.member.role || ''));
  return hub.fetch(new Request('https://hub/connect', { headers: h }));
}

// บอกทุกเครื่องในครอบครัวว่า "มีข้อมูลใหม่" (ไม่ส่งข้อมูลจริงออกไป หน้าจอจะดึงเองตามสิทธิ์ของตัวเอง)
function notifyFamilies(env, ctx, families, from) {
  if (!env.FAMILY_HUB || !families || !families.size) return;
  for (const fid of families) {
    const hub = env.FAMILY_HUB.get(env.FAMILY_HUB.idFromName(fid));
    const p = hub.fetch('https://hub/notify', { method: 'POST', body: JSON.stringify({ from: from || '' }) })
      .catch(e => console.log('notify error', e));
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  }
}

// ภารกิจด่วน: ตั้งนาฬิกาปลุกที่ศูนย์กลางของครอบครัว → ปิดภารกิจที่หมดเวลา/เตือนเด็ก ตรงเวลาแม้ไม่มีใครเปิดแอป
function scheduleUrgent(env, ctx, familyId, at, origin) {
  if (!env.FAMILY_HUB) return;
  const hub = env.FAMILY_HUB.get(env.FAMILY_HUB.idFromName(String(familyId)));
  const p = hub.fetch('https://hub/urgent-wake', { method: 'POST', body: JSON.stringify({ familyId: String(familyId), at, origin }) })
    .catch(e => console.log('urgent schedule error', e));
  if (ctx && ctx.waitUntil) ctx.waitUntil(p);
}

// ---------- LINE ----------
async function verifyLineSignature(secret, body, signature) {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

async function handleLine(request, env, ctx) {
  const body = await request.text();
  const ok = await verifyLineSignature(env.LINE_CHANNEL_SECRET, body, request.headers.get('x-line-signature'));
  if (!ok) return new Response('bad signature', { status: 401 });
  let events = [];
  try { events = JSON.parse(body).events || []; } catch (e) {}
  const webAppUrl = new URL(request.url).origin + '/';
  for (const event of events) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const store = new Store(env.DB);
      const S = { store, outbox: [], webAppUrl };
      try {
        await store.load({ all: true });
        createCore(S).handleLineEvent_(event);
        await store.flush();
        notifyFamilies(env, ctx, store.touched, 'line');
        await sendLine(env, S.outbox, new URL(request.url).origin);
        break;
      } catch (e) {
        if (e instanceof ConflictError) continue;
        console.log('line error', e && e.stack || e);
        break;
      }
    }
  }
  return new Response('OK');
}

// ส่ง push (แจ้งเตือนผู้ปกครอง) เฉพาะเมื่อ Webhook ใน LINE ชี้มาที่ระบบนี้แล้ว
// → ช่วงทดสอบคู่ขนานจะไม่ส่ง LINE จริง · วันย้ายแค่เปลี่ยน Webhook ระบบนี้ก็เริ่มส่งเอง
// ถ้าเช็กไม่ได้ (LINE ล่ม) = ไม่ส่ง (ปลอดภัยกว่าส่งผิดระบบ)
let webhookCache = { at: 0, url: '', ok: false };
async function webhookPointsHere(env, origin) {
  const expected = origin + '/line';
  if (Date.now() - webhookCache.at < 60000 && webhookCache.url === expected) return webhookCache.ok;
  let ok = false;
  try {
    const r = await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', {
      headers: { authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN },
    });
    if (r.ok) {
      const j = await r.json();
      ok = !!j.active && String(j.endpoint || '').replace(/\/+$/, '') === expected;
    }
  } catch (e) { console.log('webhook check error', e); }
  webhookCache = { at: Date.now(), url: expected, ok };
  return ok;
}

async function sendLine(env, outbox, origin) {
  if (!outbox.length || !env.LINE_CHANNEL_ACCESS_TOKEN) return;
  // reply = ตอบข้อความที่ LINE ส่งมาหาระบบนี้ (มาถึงได้ก็แปลว่า Webhook ชี้มาที่นี่) → ส่งได้เสมอ
  let msgs = outbox;
  if (outbox.some(m => m.kind === 'push') && !(await webhookPointsHere(env, origin))) {
    msgs = outbox.filter(m => m.kind === 'reply');
  }
  await Promise.all(msgs.map(m => fetch(
    m.kind === 'reply' ? 'https://api.line.me/v2/bot/message/reply' : 'https://api.line.me/v2/bot/message/push',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN },
      body: JSON.stringify(m.kind === 'reply' ? { replyToken: m.replyToken, messages: m.messages } : { to: m.to, messages: m.messages }),
    }
  ).catch(e => console.log('line send error', e))));
}
