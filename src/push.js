// แจ้งเตือนของแอปเอง (Web Push) — ฟรี ไม่กินโควตา LINE
// - กุญแจ VAPID สร้างอัตโนมัติครั้งแรกแล้วเก็บใน D1 (ไม่ต้องตั้งค่าอะไรเพิ่ม)
// - เข้ารหัสข้อความตามมาตรฐาน RFC 8291 (aes128gcm) ด้วย WebCrypto ไม่ใช้ไลบรารีภายนอก
// - ผู้ปกครองเลือกช่องทางเองได้: 'line' (ค่าเดิม) · 'app' · 'both'

const enc = new TextEncoder();
function b64u(bytes) {
  let s = ''; new Uint8Array(bytes).forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...arrs) {
  const n = arrs.reduce((a, b) => a + b.length, 0); const out = new Uint8Array(n); let o = 0;
  arrs.forEach(a => { out.set(a, o); o += a.length; });
  return out;
}

// ---------- กุญแจ VAPID ----------
let vapidCache = null;
export async function vapidKeys(env) {
  if (vapidCache) return vapidCache;
  let row = await env.DB.prepare("SELECT value FROM AppConfig WHERE key = 'vapid'").first();
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    await env.DB.prepare("INSERT OR IGNORE INTO AppConfig (key, value) VALUES ('vapid', ?)").bind(JSON.stringify({ jwk, pub: b64u(pub) })).run();
    row = await env.DB.prepare("SELECT value FROM AppConfig WHERE key = 'vapid'").first();   // ถ้าสร้างพร้อมกัน ใช้อันที่บันทึกก่อน
  }
  const v = JSON.parse(row.value);
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  vapidCache = { publicKey: v.pub, key };
  return vapidCache;
}

async function vapidAuth(env, endpoint, subject) {
  const { publicKey, key } = await vapidKeys(env);
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(header + '.' + claims));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${publicKey}`;
}

// ---------- เข้ารหัส (RFC 8291) ----------
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

export async function encryptPayload(p256dh, authSecret, plaintext) {
  const uaPub = unb64u(p256dh), auth = unb64u(authSecret);
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(enc.encode(plaintext), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]);   // record size 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

// ส่ง 1 เครื่อง → คืน status (404/410 = เครื่องยกเลิกการรับแล้ว)
export async function sendPush(env, sub, payload, origin) {
  const body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(payload));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuth(env, sub.endpoint, origin),
      'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream',
      ttl: '86400', urgency: 'high',
    },
    body,
  });
  return r.status;
}

async function deliver(env, subs, payload, origin) {
  await Promise.all(subs.map(async s => {
    // แต่ละเครื่องได้รหัสข้อความของตัวเอง → เครื่องส่งใบตอบรับกลับมาเมื่อแจ้งเตือนเด้งขึ้นจอ
    const nid = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();
    let st = 0;
    try { st = await sendPush(env, s, Object.assign({}, payload, { nid }), origin); }
    catch (e) { console.log('push error', e); }
    try {
      if (st === 404 || st === 410) {
        await env.DB.prepare('DELETE FROM PushSubs WHERE endpoint = ?').bind(s.endpoint).run();
        return;
      }
      await env.DB.batch([
        env.DB.prepare('INSERT INTO PushLog (nid, endpoint, member_id, kind, sent_at, status) VALUES (?,?,?,?,?,?)')
          .bind(nid, s.endpoint, s.member_id, payload.kind || '', now, st),
        st >= 200 && st < 300
          ? env.DB.prepare('UPDATE PushSubs SET last_ok_at = ?, last_sent_at = ? WHERE endpoint = ?').bind(now, now, s.endpoint)
          : env.DB.prepare('UPDATE PushSubs SET last_sent_at = ? WHERE endpoint = ?').bind(now, s.endpoint),
      ]);
      if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM PushLog WHERE sent_at < ?').bind(new Date(Date.now() - 30 * 86400000).toISOString()).run();
      if (!(st >= 200 && st < 300)) console.log('push status', st);
    } catch (e) { console.log('push log error', e); }
  }));
}

// ใบตอบรับจากเครื่อง (service worker): 'shown' = เด้งขึ้นจอแล้ว · 'click' = ผู้ปกครองแตะแจ้งเตือน
export async function pushAck(env, nid, ev) {
  nid = String(nid || '').replace(/[^0-9a-f]/g, '');
  if (nid.length !== 32) return false;
  const now = new Date().toISOString();
  const row = await env.DB.prepare('SELECT endpoint FROM PushLog WHERE nid = ?').bind(nid).first();
  if (!row) return false;
  if (ev === 'click') {
    await env.DB.prepare('UPDATE PushLog SET clicked_at = COALESCE(clicked_at, ?), delivered_at = COALESCE(delivered_at, ?) WHERE nid = ?').bind(now, now, nid).run();
  } else {
    await env.DB.prepare('UPDATE PushLog SET delivered_at = COALESCE(delivered_at, ?) WHERE nid = ?').bind(now, nid).run();
  }
  await env.DB.prepare('UPDATE PushSubs SET last_delivered_at = ? WHERE endpoint = ?').bind(now, row.endpoint).run();
  return true;
}

// จำนวนเรื่องที่รอผู้ปกครองจัดการ → ตัวเลขบนไอคอนแอป
async function pendingCount(env, familyId) {
  const r = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM Submissions WHERE family_id = ?1 AND status = 'pending') + (SELECT COUNT(*) FROM Redemptions WHERE family_id = ?1 AND (acknowledged_at IS NULL OR acknowledged_at = '')) AS n")
    .bind(familyId).first();
  return r ? r.n : 0;
}

// ---------- ส่งตามเหตุการณ์จากตรรกะหลัก ----------
// events: [{ type: 'submit'|'redeem', familyId, ... }]
export async function notifyApp(env, origin, events) {
  for (const ev of events || []) {
    const { results: parents } = await env.DB.prepare(
      "SELECT member_id, line_user_id, notify_channel, notify_submission FROM Members WHERE family_id = ? AND role = 'parent'").bind(ev.familyId).all();
    // ค่าเริ่มต้น: ผูก LINE = LINE (แบบเดิม) · ไม่ผูก LINE = แอป
    const chOf = p => p.notify_channel || (p.line_user_id ? 'line' : 'app');
    const want = parents.filter(p => (chOf(p) === 'app' || chOf(p) === 'both') &&
      !(ev.type === 'submit' && p.notify_submission === 0)).map(p => p.member_id);
    if (!want.length) continue;
    const { results: subs } = await env.DB.prepare(
      `SELECT * FROM PushSubs WHERE member_id IN (${want.map(() => '?').join(',')})`).bind(...want).all();
    if (!subs.length) continue;
    let payload;
    const badge = await pendingCount(env, ev.familyId);
    if (ev.type === 'submit') {
      payload = { title: `${ev.childAvatar || '🧒'} ${ev.childName} ส่งภารกิจ`, body: `${ev.missionTitle} · ${ev.starsDisplay}`,
        tag: 'sub-' + ev.submissionId, url: '/#approvals', subId: ev.submissionId, kind: 'submit', badge };
    } else if (ev.type === 'redeem') {
      payload = { title: `🎁 ${ev.childName} แลกรางวัล`, body: `${ev.rewardTitle} (${ev.stars} ดาว)`, tag: 'redeem-' + Date.now(), url: '/', kind: 'redeem', badge };
    } else continue;
    await deliver(env, subs, payload, origin);
  }
}

export async function notifyTest(env, origin, memberId) {
  const { results: subs } = await env.DB.prepare('SELECT * FROM PushSubs WHERE member_id = ?').bind(memberId).all();
  await deliver(env, subs, { title: '⭐ ธนาคารดาว', body: 'ทดสอบแจ้งเตือน — ได้รับแล้ว เยี่ยมเลย!', tag: 'test', url: '/', kind: 'test' }, origin);
  return subs.length;
}

// ผู้ปกครองที่เลือก "แอปอย่างเดียว" → ไม่ต้องส่ง LINE (push) ซ้ำ  ·  การตอบกลับในแชต LINE (reply) ไม่ตัด
export async function filterLineOutbox(env, familyIds, outbox) {
  if (!outbox.some(m => m.kind === 'push') || !familyIds.length) return outbox;
  const { results } = await env.DB.prepare(
    // ตัด LINE เฉพาะคนที่ยังมีเครื่องรับแจ้งเตือนแอปอยู่จริง (ถ้าเครื่องหายหมด → กลับไปได้ LINE เอง ไม่พลาดแจ้งเตือน)
    `SELECT line_user_id FROM Members m WHERE notify_channel = 'app' AND line_user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM PushSubs p WHERE p.member_id = m.member_id) AND family_id IN (${familyIds.map(() => '?').join(',')})`)
    .bind(...familyIds).all();
  const skip = new Set(results.map(r => r.line_user_id));
  return outbox.filter(m => m.kind !== 'push' || !skip.has(m.to));
}
