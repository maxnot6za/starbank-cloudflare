// ที่เก็บข้อมูลแบบ "ชีตในหน่วยความจำ" บน D1
// - โหลดแถวที่เกี่ยวข้องจาก D1 ครั้งเดียวต่อคำขอ → ตรรกะเดิมจาก Code.gs ทำงานแบบเดิมได้ทุกบรรทัด
// - การเขียนถูกเก็บเป็นรายการ แล้วบันทึกลง D1 ทีเดียวแบบ transaction (สำเร็จทั้งหมด หรือไม่บันทึกเลย)
// - ทุกการแก้แถวมีเงื่อนไข "ค่าเดิมต้องยังเหมือนตอนอ่าน" กันสองเครื่องแก้ทับกัน (แทน LockService)

export const TABLES = {
  Families:    { pk: 'family_id', cols: ['family_id','family_name','join_code','created_at','wheel_enabled','wheel_started_at','wheel_prizes','purple','gold'], bools: ['wheel_enabled'] },
  Members:     { pk: 'member_id', cols: ['member_id','family_id','name','role','avatar','line_user_id','web_token','created_at','notify_submission','quest_seen'], bools: ['notify_submission'] },
  Missions:    { pk: 'mission_id', cols: ['mission_id','family_id','title','description','base_stars','multiplier','icon','is_active','created_by','created_at'], bools: ['is_active'] },
  Submissions: { pk: 'submission_id', cols: ['submission_id','mission_id','child_id','family_id','mission_title','status','stars_earned','submitted_at','reviewed_by','reviewed_at'], bools: [] },
  Rewards:     { pk: 'reward_id', cols: ['reward_id','family_id','title','description','stars_cost','type','secret_data','quantity','icon','is_active','created_by','created_at'], bools: ['is_active'] },
  Redemptions: { pk: 'redemption_id', cols: ['redemption_id','reward_id','child_id','family_id','reward_title','stars_spent','secret_revealed','redeemed_at','acknowledged_at','acknowledged_by'], bools: [] },
  LineState:   { pk: 'user_id', cols: ['user_id','state','data','updated_at'], bools: [], global: true },
  DailyLog:    { pk: 'log_id', cols: ['log_id','family_id','date','child_id','child_name','stars_earned_today','stars_spent_today','balance','missions_completed_today','logged_at'], bools: [], upsert: true },
  Urgent:      { pk: 'urgent_id', cols: ['urgent_id','batch_id','family_id','child_id','title','icon','stars','duration_sec','open_until','created_by','created_at','status','seen_at','deadline_at','reminded_at','submission_id','ended_at','accepted_at'], bools: [] },
  Gifts:       { pk: 'gift_id', cols: ['gift_id','family_id','child_id','stars','reason','message','created_by','created_at','status','opened_at','ended_at'], bools: [] },
  DailyQuests: { pk: 'quest_id', cols: ['quest_id','family_id','date','owner','type','target','progress','reward','status','claimed_by','claimed_at','created_at'], bools: [] },
  Inventory:   { pk: 'inv_id', cols: ['inv_id','family_id','item_id','price','currency','bought_by','bought_at','assigned_to'], bools: [] },
  Wishes:      { pk: 'wish_id', cols: ['wish_id','family_id','child_id','item_id','created_at'], bools: [] },
  WalletLog:   { pk: 'log_id', cols: ['log_id','family_id','currency','amount','kind','ref','member_id','created_at'], bools: [], writeOnly: true },
  Spins:       { pk: 'spin_id', cols: ['spin_id','child_id','family_id','round_key','earned_at','used_at','prize_stars','prize_index','request_id'], bools: [], ignoreDup: true },
};

const NUM_COLS = new Set(['base_stars','multiplier','stars_earned','stars_cost','quantity','stars_spent','prize_stars','prize_index',
  'stars_earned_today','stars_spent_today','balance','missions_completed_today','stars','duration_sec',
  'purple','gold','target','progress','reward','price','amount']);

export class ConflictError extends Error {}

// วันแรกที่กงล้อต้องใช้ข้อมูล (เวลา UTC เผื่อ 1 วัน) — คิดแบบเดียวกับ computeWheelProgress_ ใน core.js
function thaiKey(d) { const t = new Date(d); return isNaN(t) ? '' : new Date(t.getTime() + 7 * 3600000).toISOString().slice(0, 10); }
function wheelCutoff(fam, kids, spins) {
  const on = fam.wheel_enabled === true || String(fam.wheel_enabled).toUpperCase() === 'TRUE';
  const raw = fam.wheel_started_at;
  const started = raw ? new Date(raw) : null;
  if (!on || !started || isNaN(started)) return null;
  const startedAt = started.toISOString().replace(/\.\d{3}Z$/, 'Z');
  let earliest = null;
  for (const k of kids) {
    let lastEnd = '';
    for (const s of spins) {
      if (String(s.child_id) !== String(k.member_id)) continue;
      const p = String(s.round_key || '').split('|');
      if (p[0] === startedAt && p[1] > lastEnd) lastEnd = p[1];
    }
    const from = lastEnd || thaiKey(started);
    if (!earliest || from < earliest) earliest = from;
  }
  if (!earliest) earliest = thaiKey(started);
  return new Date(new Date(earliest + 'T00:00:00Z').getTime() - 7 * 3600000 - 86400000).toISOString();
}

// ค่าจากหน้าโค้ด → ค่าที่เก็บใน D1
export function toDb(table, col, v) {
  if (v === undefined || v === null || v === '') return null;
  if (TABLES[table].bools.includes(col)) {
    if (v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1') return 1;
    if (v === false || String(v).toUpperCase() === 'FALSE' || v === 0 || v === '0') return 0;
    return null;
  }
  if (NUM_COLS.has(col)) { const n = Number(v); return isNaN(n) ? String(v) : n; }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return '[object Object]';  // เหมือนพฤติกรรมของ Google Sheet
  return String(v);
}

// ค่าใน D1 → ค่าที่โค้ดเดิมเคยได้จาก Sheet ('' แทนช่องว่าง, true/false สำหรับช่องติ๊ก)
function fromDb(table, col, v) {
  if (v === null || v === undefined) return '';
  if (TABLES[table].bools.includes(col)) return v === 1 ? true : v === 0 ? false : v;
  return v;
}

export class Store {
  constructor(db) {
    this.db = db;
    this.rows = {};          // table -> array of row objects (ตัวที่โค้ดใช้)
    this.raw = new Map();    // row object -> ค่าล่าสุดใน D1 (ใช้ทำเงื่อนไขกันแก้ทับ)
    this.ops = [];
    this.touched = new Set();   // ครอบครัวที่ข้อมูลเปลี่ยน (ไว้ส่งสัญญาณให้หน้าจออัปเดต)
  }

  // scope: { all: true } | { familyIds: [...] }  — LineState โหลดเมื่อ withLineState
  // scope: { all: true } | { familyIds: [...] }  — LineState โหลดเมื่อ withLineState
  // opts.subIds: รหัสภารกิจที่คำสั่งนี้อ้างถึง (ต้องโหลดแม้เก่า)
  async load(scope, opts = {}) {
    const stmts = [], names = [];
    const ids = (scope.familyIds || []).filter(Boolean).map(String);
    const q = ids.map(() => '?').join(',');
    // โหมดครอบครัว: Submissions (ตารางเดียวที่โตเร็ว) โหลดเฉพาะส่วนที่ต้องใช้ — ดู _loadSubmissions
    this.subWindowed = !scope.all;
    for (const [name, t] of Object.entries(TABLES)) {
      if (name === 'DailyLog' || t.writeOnly) { this.rows[name] = []; continue; }      // ใช้แค่เขียน
      if (t.global) {
        if (scope.all || opts.withLineState) { stmts.push(this.db.prepare(`SELECT * FROM ${name}`)); names.push(name); }
        else this.rows[name] = [];
        continue;
      }
      if (scope.all) { stmts.push(this.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`)); names.push(name); continue; }
      if (name === 'Submissions') continue;
      if (!ids.length) { this.rows[name] = []; continue; }
      if (name === 'Gifts') {
        // ของขวัญ: ที่ยังไม่เปิด + 30 วันล่าสุด (ไว้แสดง) · ยอดดาวรวมจากของขวัญที่เปิดแล้วใช้ผลรวมจากฐานข้อมูล
        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        stmts.push(this.db.prepare(`SELECT * FROM Gifts WHERE family_id IN (${q}) AND (status = 'sent' OR created_at >= ? OR opened_at >= ?) ORDER BY rowid`).bind(...ids, since, since));
        names.push(name);
        stmts.push(this.db.prepare(`SELECT child_id, SUM(stars) AS s FROM Gifts WHERE family_id IN (${q}) AND status = 'opened' GROUP BY child_id`).bind(...ids));
        names.push('__GiftSum');
        continue;
      }
      if (name === 'DailyQuests') {
        // ภารกิจประจำวัน: ตั้งแต่เมื่อวาน (เวลาไทย) + ที่ทำครบแต่ยังไม่กดรับ (เก็บให้อัตโนมัติตอนข้ามวัน)
        const y = thaiKey(Date.now() - 86400000);
        stmts.push(this.db.prepare(`SELECT * FROM DailyQuests WHERE family_id IN (${q}) AND (date >= ? OR status = 'done') ORDER BY rowid`).bind(...ids, y));
        names.push(name);
        continue;
      }
      if (name === 'Urgent') {
        // ภารกิจด่วน: ที่ยังค้างอยู่ + ที่จบใน 30 วันล่าสุด + ที่ยังรออนุมัติ (ต้องใช้ดาวตอนอนุมัติ)
        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        stmts.push(this.db.prepare(`SELECT * FROM Urgent WHERE family_id IN (${q}) AND (status IN ('pending','running') OR created_at >= ?
          OR urgent_id IN (SELECT mission_id FROM Submissions WHERE family_id IN (${q}) AND status = 'pending')) ORDER BY rowid`).bind(...ids, since, ...ids));
        names.push(name);
        continue;
      }
      stmts.push(this.db.prepare(`SELECT * FROM ${name} WHERE family_id IN (${q}) ORDER BY rowid`).bind(...ids));
      names.push(name);
    }
    if (this.subWindowed && ids.length) {
      stmts.push(this.db.prepare(`SELECT cs.* FROM ChildStats cs JOIN Members m ON m.member_id = cs.child_id WHERE m.family_id IN (${q})`).bind(...ids));
      names.push('__ChildStats');
    }
    const results = stmts.length ? await this.db.batch(stmts) : [];
    results.forEach((r, i) => {
      const name = names[i];
      if (name === '__GiftSum') {
        this.giftSum = new Map((r.results || []).map(x => [String(x.child_id), Number(x.s || 0)]));
        return;
      }
      if (name === '__ChildStats') {
        this.childStats = new Map((r.results || []).map(x => [String(x.child_id), x]));
        return;
      }
      this.rows[name] = (r.results || []).map(dbRow => this._wrap(name, dbRow));
      if (name === 'Gifts') this.giftOrig = new Map(this.rows.Gifts.map(g => [g, { child: String(g.child_id), opened: g.status === 'opened', stars: Number(g.stars || 0) }]));
    });
    if (this.subWindowed) {
      this.childStats = this.childStats || new Map();
      this.rows.Submissions = ids.length ? await this._loadSubmissions(ids, opts.subIds || [], opts.fn) : [];
    }
  }

  // โหลดเฉพาะภารกิจที่ตรรกะเดิมต้องใช้ (ผลลัพธ์เหมือนโหลดทั้งหมดทุกประการ):
  //   รออนุมัติทั้งหมด · ส่ง/ตรวจภายใน 62 วัน (สรุปรายวันสูงสุด 60 วัน) · ช่วงที่กงล้อกำลังนับ
  //   20 รายการตรวจล่าสุดของครอบครัว · 20 รายการล่าสุดของเด็กแต่ละคน · รายการที่คำสั่งอ้างถึง
  // ยอดดาว/จำนวนรวมใช้ตาราง ChildStats (trigger ในฐานข้อมูลดูแล) แทนการบวกทุกแถว
  // fn = คำสั่งที่กำลังทำ → โหลดเฉพาะส่วนที่คำสั่งนั้นใช้ (ไม่รู้จัก = โหลดครบทุกส่วนไว้ก่อน)
  async _loadSubmissions(ids, subIds, fn) {
    const db = this.db, q = ids.map(() => '?').join(',');
    const known = !!fn;
    const needSummary = !known || fn === 'getDailySummary';         // สรุปรายวันย้อนหลังสูงสุด 60 วัน
    const needReviews = !known || fn === 'getParentDashboard';      // ประวัติการตรวจ 20 รายการล่าสุด
    const needChildRecent = !known || fn === 'getChildDashboard';   // ประวัติของเด็ก 20 รายการล่าสุด
    // 2 วันล่าสุดเสมอ: เผื่อผู้ปกครองเพิ่งเปิดกงล้อในคำสั่งนี้ (เริ่มนับวันนี้)
    const recent = new Date(Date.now() - (needSummary ? 62 : 2) * 86400000).toISOString();
    let cutoff = recent;
    const kids = this.all('Members').filter(m => m.role === 'child');
    for (const fam of this.all('Families')) {
      const w = wheelCutoff(fam, kids.filter(k => String(k.family_id) === String(fam.family_id)), this.all('Spins'));
      if (w && w < cutoff) cutoff = w;
    }
    const sel = 'SELECT rowid AS _rid, * FROM Submissions';
    const st = [
      db.prepare(`${sel} WHERE family_id IN (${q}) AND status = 'pending'`).bind(...ids),
      db.prepare(`${sel} WHERE family_id IN (${q}) AND submitted_at >= ?`).bind(...ids, cutoff),
      ...(needSummary ? [db.prepare(`${sel} WHERE family_id IN (${q}) AND reviewed_at >= ?`).bind(...ids, recent)] : []),
      ...(needReviews ? ids.map(f => db.prepare(`${sel} WHERE family_id = ? AND reviewed_at > '' ORDER BY reviewed_at DESC LIMIT 25`).bind(f)) : []),
      ...(needChildRecent ? kids.map(k => db.prepare(`${sel} WHERE child_id = ? ORDER BY rowid DESC LIMIT 20`).bind(String(k.member_id))) : []),
    ];
    const extra = subIds.filter(Boolean).map(String).slice(0, 20);
    if (extra.length) st.push(db.prepare(`${sel} WHERE family_id IN (${q}) AND submission_id IN (${extra.map(() => '?').join(',')})`).bind(...ids, ...extra));
    const res = await db.batch(st);
    const byId = new Map();
    res.forEach(r => (r.results || []).forEach(row => byId.set(String(row.submission_id), row)));
    const rows = [...byId.values()].sort((a, b) => a._rid - b._rid);
    this.subOrig = new Map();
    return rows.map(row => {
      const obj = this._wrap('Submissions', row);
      this.subOrig.set(obj, { child: String(row.child_id), status: row.status, stars: Number(row.stars_earned || 0) });
      return obj;
    });
  }

  // ยอดของเด็ก 1 คน = ยอดในฐานข้อมูล − ส่วนของแถวที่โหลดมา (ค่าตอนโหลด) + ส่วนของแถวเดียวกันตอนนี้
  // (รวมการแก้/เพิ่มในคำขอนี้ที่ยังไม่บันทึก) · โหมดโหลดทั้งหมดคืน null ให้ตรรกะเดิมบวกเอง
  childAgg(childId) {
    if (!this.subWindowed) return null;
    const id = String(childId);
    const base = this.childStats.get(id) || { earned: 0, approved: 0, pending: 0 };
    let earned = Number(base.earned || 0), approved = Number(base.approved || 0), pending = Number(base.pending || 0);
    for (const row of this.all('Submissions')) {
      const o = this.subOrig && this.subOrig.get(row);
      if (o && o.child === id) {
        if (o.status === 'approved') { earned -= o.stars; approved--; }
        else if (o.status === 'pending') pending--;
      }
      if (String(row.child_id) === id) {
        if (row.status === 'approved') { earned += Number(row.stars_earned || 0); approved++; }
        else if (row.status === 'pending') pending++;
      }
    }
    return { earned, approved, pending };
  }

  // ดาวจากของขวัญที่เปิดแล้วของเด็ก 1 คน (รวมที่เพิ่งเปิดในคำขอนี้) · โหมดโหลดทั้งหมดคืน null ให้บวกเอง
  giftStars(childId) {
    if (!this.giftSum) return null;
    const id = String(childId);
    let s = this.giftSum.get(id) || 0;
    for (const g of this.all('Gifts')) {
      const o = this.giftOrig && this.giftOrig.get(g);
      if (o && o.child === id && o.opened) s -= o.stars;
      if (String(g.child_id) === id && g.status === 'opened') s += Number(g.stars || 0);
    }
    return s;
  }

  _wrap(name, dbRow) {
    const obj = {};
    const raw = {};
    for (const c of TABLES[name].cols) { raw[c] = dbRow[c] === undefined ? null : dbRow[c]; obj[c] = fromDb(name, c, raw[c]); }
    this.raw.set(obj, raw);
    return obj;
  }

  all(name) {
    if (!this.rows[name]) this.rows[name] = [];
    return this.rows[name];
  }

  append(name, objIn) {
    const t = TABLES[name];
    const raw = {}, obj = {};
    for (const c of t.cols) { raw[c] = toDb(name, c, objIn[c]); obj[c] = objIn[c] === undefined ? '' : objIn[c]; }
    this.all(name).push(obj);
    this.raw.set(obj, raw);
    this.ops.push({ kind: 'insert', name, raw: { ...raw } });
    if (raw.family_id) this.touched.add(String(raw.family_id));
  }

  remove(name, idField, idValue) {
    const t = TABLES[name];
    const rows = this.all(name);
    const i = rows.findIndex(r => String(r[idField]) === String(idValue));
    if (i < 0) return false;
    const raw = this.raw.get(rows[i]);
    rows.splice(i, 1);
    this.ops.push({ kind: 'delete', name, pkVal: raw[t.pk] });
    if (raw.family_id) this.touched.add(String(raw.family_id));
    return true;
  }

  update(name, idField, idValue, updates) {
    const t = TABLES[name];
    const row = this.all(name).find(r => String(r[idField]) === String(idValue));
    if (!row) return false;
    const raw = this.raw.get(row);
    const set = {}, before = {};
    for (const [k, v] of Object.entries(updates)) {
      if (!t.cols.includes(k)) continue;           // เหมือนชีต: คอลัมน์ที่ไม่มี = ไม่บันทึก
      before[k] = raw[k];
      set[k] = toDb(name, k, v);
      raw[k] = set[k];
      row[k] = v;
    }
    if (Object.keys(set).length) {
      this.ops.push({ kind: 'update', name, pkVal: raw[t.pk], set, before });
      if (raw.family_id) this.touched.add(String(raw.family_id));
    }
    return true;
  }

  async flush() {
    if (!this.ops.length) return;
    const stmts = [];
    let guarded = false;
    for (const op of this.ops) {
      const t = TABLES[op.name];
      if (op.kind === 'delete') {
        stmts.push(this.db.prepare(`DELETE FROM ${op.name} WHERE ${t.pk} = ?`).bind(op.pkVal));
      } else if (op.kind === 'insert') {
        const verb = t.upsert ? 'INSERT OR REPLACE' : t.ignoreDup ? 'INSERT OR IGNORE' : 'INSERT';
        stmts.push(this.db.prepare(`${verb} INTO ${op.name} (${t.cols.join(',')}) VALUES (${t.cols.map(() => '?').join(',')})`)
          .bind(...t.cols.map(c => op.raw[c])));
      } else {
        const keys = Object.keys(op.set);
        const sql = `UPDATE ${op.name} SET ${keys.map(k => k + ' = ?').join(', ')} WHERE ${t.pk} = ? AND ${keys.map(k => k + ' IS ?').join(' AND ')}`;
        stmts.push(this.db.prepare(sql).bind(...keys.map(k => op.set[k]), op.pkVal, ...keys.map(k => op.before[k])));
        stmts.push(this.db.prepare('INSERT INTO _guard (ok) VALUES (changes())'));
        guarded = true;
      }
    }
    if (guarded) stmts.push(this.db.prepare('DELETE FROM _guard'));
    try {
      await this.db.batch(stmts);
      this.ops = [];
    } catch (e) {
      const msg = String(e && e.message || e);
      if (msg.includes('ดาวไม่พอ')) throw new Error('ดาวไม่พอ');
      if (/CHECK constraint failed/i.test(msg)) throw new ConflictError('ข้อมูลเพิ่งถูกแก้จากอีกเครื่อง กรุณาลองใหม่อีกครั้ง');
      // สองเครื่องสร้างแถวเดียวกันพร้อมกัน (เช่น สุ่มภารกิจประจำวัน) → โหลดใหม่แล้วใช้แถวที่บันทึกก่อน
      if (/UNIQUE constraint failed: (DailyQuests|Inventory)/i.test(msg)) throw new ConflictError('ข้อมูลเพิ่งถูกแก้จากอีกเครื่อง กรุณาลองใหม่อีกครั้ง');
      throw e;
    }
  }
}
