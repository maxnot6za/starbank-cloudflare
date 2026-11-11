// สร้าง Worker จำลอง (miniflare) + D1 ในเครื่อง จาก src/ และ migrations/ ของ repo นี้
// ไม่แตะ production เลย: ฐานข้อมูลเป็นของชั่วคราวในหน่วยความจำ
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Miniflare } = require('miniflare');
const esbuild = require('esbuild');
const REPO = path.resolve(__dirname, '../..');

async function build() {
  const r = await esbuild.build({ entryPoints: [REPO + '/src/index.js'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
  return r.outputFiles[0].text;
}

const TYPES = { '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json' };

// แยกไฟล์ migration เป็นคำสั่งทีละอัน (CREATE TRIGGER ... BEGIN ... END; มี ; อยู่ข้างใน)
function splitSql(sql) {
  const parts = []; let buf = '';
  for (const line of sql.split('\n')) {
    if (line.trim().startsWith('--')) continue;
    buf += line + '\n';
    if (/;\s*$/.test(line) && !/BEGIN\s*$/i.test(buf.trim()) && (!/CREATE TRIGGER/i.test(buf) || /END;\s*$/.test(buf.trim()))) { parts.push(buf.trim()); buf = ''; }
  }
  return parts;
}

let CURRENT_DB = null;

// opts.outbound: ดักทุก fetch ขาออก (Web Push, LINE) · opts.port: เปิดพอร์ตจริงให้เบราว์เซอร์ทดสอบ · opts.bindings: secrets ปลอม
async function start(opts = {}) {
  const script = await build();
  const mf = new Miniflare({
    modules: true, script, compatibilityDate: '2025-09-01',
    durableObjects: { FAMILY_HUB: { className: 'FamilyHub', useSQLite: true } },
    d1Databases: { DB: 'starbank-test-' + Date.now() + Math.random() },
    bindings: opts.bindings || {},
    ...(opts.outbound ? { outboundService: opts.outbound } : {}),
    ...(opts.port !== undefined ? { port: opts.port, host: '127.0.0.1' } : {}),
    serviceBindings: { ASSETS: async (req) => {
      const pth = decodeURIComponent(new URL(req.url).pathname);
      const f = REPO + '/public' + pth;
      if (pth !== '/' && fs.existsSync(f) && fs.statSync(f).isFile()) {
        return new Response(fs.readFileSync(f), { headers: { 'content-type': TYPES[path.extname(pth)] || 'application/octet-stream' } });
      }
      return new Response(fs.readFileSync(REPO + '/public/index.html', 'utf8'), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    } },
  });
  const db = await mf.getD1Database('DB');
  const files = fs.readdirSync(REPO + '/migrations').filter(f => f.endsWith('.sql')).sort();
  for (const f of files) for (const p of splitSql(fs.readFileSync(REPO + '/migrations/' + f, 'utf8'))) await db.prepare(p).run();
  CURRENT_DB = db;
  return { mf, db };
}

// อ่าน MEMBER_ARG จาก src/index.js ตรง ๆ จะได้ไม่ต้องแก้สองที่
const MEMBER_ARG = (() => {
  const src = fs.readFileSync(REPO + '/src/index.js', 'utf8');
  const body = src.match(/const MEMBER_ARG = \{([\s\S]*?)\};/)[1];
  const o = {}; for (const m of body.matchAll(/(\w+):\s*(\d+)/g)) o[m[1]] = Number(m[2]);
  return o;
})();

// สร้างกุญแจเครื่อง (cookie sb_s) ให้สมาชิกคนนั้น โดยใส่ลงตาราง Sessions ตรง ๆ
const sessionCache = new Map();
async function sessionFor(db, memberId) {
  const key = String(memberId);
  if (sessionCache.has(db) && sessionCache.get(db)[key]) return sessionCache.get(db)[key];
  const m = await db.prepare('SELECT family_id FROM Members WHERE member_id = ?').bind(key).first();
  if (!m) return '';
  const token = crypto.randomBytes(24).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO Sessions (session_hash, member_id, family_id, created_at, last_seen_at, expires_at, device) VALUES (?,?,?,?,?,?,'test')")
    .bind(hash, key, m.family_id, now, now, new Date(Date.now() + 864e5).toISOString()).run();
  if (!sessionCache.has(db)) sessionCache.set(db, {});
  sessionCache.get(db)[key] = token;
  return token;
}

// เรียก /api/<fn> ในนามสมาชิกที่อยู่ในตำแหน่ง MEMBER_ARG ของคำสั่งนั้น
async function call(mf, fn, ...args) {
  const headers = { 'content-type': 'application/json' };
  if (fn in MEMBER_ARG && CURRENT_DB) {
    const tok = await sessionFor(CURRENT_DB, args[MEMBER_ARG[fn]]);
    if (tok) headers.cookie = 'sb_s=' + tok;
  }
  const r = await mf.dispatchFetch('http://local/api/' + fn, { method: 'POST', headers, body: JSON.stringify({ args }) });
  return r.json();
}

module.exports = { start, call, build, sessionFor, MEMBER_ARG, REPO };
