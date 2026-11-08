// ธนาคารดาว — Cloudflare Worker
//   POST /api/<ฟังก์ชัน>   แทน google.script.run (body: {"args":[...]})
//   POST /line             LINE webhook (ตรวจลายเซ็นจาก LINE ทุกครั้ง)
//   อื่น ๆ                  หน้าเว็บจากโฟลเดอร์ public/
import { Store, ConflictError } from './store.js';
import { createCore, PUBLIC_API } from './core.js';

// อาร์กิวเมนต์ตัวไหนเป็น memberId/token → ใช้หาครอบครัวที่ต้องโหลด
const MEMBER_ARG = {
  getMemberByWebToken: 0, getChildDashboard: 0, getParentDashboard: 0, webReconnect: 0,
  submitMission: 1, redeemReward: 1, spinWheel: 0,
  reviewSubmission: 2, acknowledgeRedemptions: 1, checkRejectImpact: 1,
  webSaveMission: 1, webSaveReward: 1, webDeleteMission: 1, webDeleteReward: 1,
  toggleSubmissionNotify: 0, getDailySummary: 2,
  setWheelEnabled: 0, setWheelPrizes: 0, getWheelStatus: 0,
};
const CODE_ARG = { webLookupFamily: 0, webJoinFamily: 0 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
      return handleApi(url.pathname.slice(5), request, env);
    }
    if (url.pathname === '/line') {
      if (request.method !== 'POST') return new Response('OK');
      return handleLine(request, env, ctx);
    }
    if (url.pathname === '/health') return json({ ok: true, app: 'starbank' });
    return env.ASSETS.fetch(request);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function familyScopeFor(fn, args, db) {
  if (fn in MEMBER_ARG) {
    const id = args[MEMBER_ARG[fn]];
    if (id === undefined || id === null || id === '') return { familyIds: [] };
    const r = await db.prepare('SELECT family_id FROM Members WHERE member_id = ?1 OR web_token = ?1 LIMIT 1').bind(String(id)).first();
    return { familyIds: r ? [r.family_id] : [] };
  }
  if (fn in CODE_ARG) {
    const code = String(args[CODE_ARG[fn]] || '').toUpperCase();
    const r = await db.prepare('SELECT family_id FROM Families WHERE join_code = ? LIMIT 1').bind(code).first();
    return { familyIds: r ? [r.family_id] : [] };
  }
  return { familyIds: [] };   // webRegister: สร้างครอบครัวใหม่ ไม่ต้องโหลดอะไร
}

async function handleApi(fn, request, env) {
  if (!PUBLIC_API.includes(fn)) return json({ ok: false, error: 'ไม่พบคำสั่งนี้' }, 404);
  let args;
  try { args = (await request.json()).args || []; } catch (e) { return json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, 400); }
  if (!Array.isArray(args)) return json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, 400);
  const webAppUrl = new URL(request.url).origin + '/';

  // ถ้ามีเครื่องอื่นแก้ข้อมูลชนกัน (ไม่มีอะไรถูกบันทึก) → ลองใหม่อัตโนมัติ เหมือน LockService รอคิว
  for (let attempt = 0; ; attempt++) {
    const store = new Store(env.DB);
    const S = { store, outbox: [], webAppUrl };
    try {
      await store.load(await familyScopeFor(fn, args, env.DB));
      const core = createCore(S);
      const value = core.api[fn](...args);
      await store.flush();
      await sendLine(env, S.outbox);
      return json({ ok: true, value: value === undefined ? null : value });
    } catch (e) {
      if (e instanceof ConflictError && attempt < 2) continue;
      console.log('api error', fn, e && e.stack || e);
      return json({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  }
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

async function handleLine(request, env) {
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
        await sendLine(env, S.outbox);
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

async function sendLine(env, outbox) {
  // ยังไม่ได้ใส่ LINE token = ไม่ส่งข้อความ (ช่วงทดสอบคู่ขนาน จะได้ไม่รบกวน LINE ของระบบเดิม)
  if (!outbox.length || !env.LINE_CHANNEL_ACCESS_TOKEN) return;
  await Promise.all(outbox.map(m => fetch(
    m.kind === 'reply' ? 'https://api.line.me/v2/bot/message/reply' : 'https://api.line.me/v2/bot/message/push',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN },
      body: JSON.stringify(m.kind === 'reply' ? { replyToken: m.replyToken, messages: m.messages } : { to: m.to, messages: m.messages }),
    }
  ).catch(e => console.log('line send error', e))));
}
