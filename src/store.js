// ที่เก็บข้อมูลแบบ "ชีตในหน่วยความจำ" บน D1
// - โหลดแถวที่เกี่ยวข้องจาก D1 ครั้งเดียวต่อคำขอ → ตรรกะเดิมจาก Code.gs ทำงานแบบเดิมได้ทุกบรรทัด
// - การเขียนถูกเก็บเป็นรายการ แล้วบันทึกลง D1 ทีเดียวแบบ transaction (สำเร็จทั้งหมด หรือไม่บันทึกเลย)
// - ทุกการแก้แถวมีเงื่อนไข "ค่าเดิมต้องยังเหมือนตอนอ่าน" กันสองเครื่องแก้ทับกัน (แทน LockService)

export const TABLES = {
  Families:    { pk: 'family_id', cols: ['family_id','family_name','join_code','created_at','wheel_enabled','wheel_started_at','wheel_prizes'], bools: ['wheel_enabled'] },
  Members:     { pk: 'member_id', cols: ['member_id','family_id','name','role','avatar','line_user_id','web_token','created_at','notify_submission'], bools: ['notify_submission'] },
  Missions:    { pk: 'mission_id', cols: ['mission_id','family_id','title','description','base_stars','multiplier','icon','is_active','created_by','created_at'], bools: ['is_active'] },
  Submissions: { pk: 'submission_id', cols: ['submission_id','mission_id','child_id','family_id','mission_title','status','stars_earned','submitted_at','reviewed_by','reviewed_at'], bools: [] },
  Rewards:     { pk: 'reward_id', cols: ['reward_id','family_id','title','description','stars_cost','type','secret_data','quantity','icon','is_active','created_by','created_at'], bools: ['is_active'] },
  Redemptions: { pk: 'redemption_id', cols: ['redemption_id','reward_id','child_id','family_id','reward_title','stars_spent','secret_revealed','redeemed_at','acknowledged_at','acknowledged_by'], bools: [] },
  LineState:   { pk: 'user_id', cols: ['user_id','state','data','updated_at'], bools: [], global: true },
  DailyLog:    { pk: 'log_id', cols: ['log_id','family_id','date','child_id','child_name','stars_earned_today','stars_spent_today','balance','missions_completed_today','logged_at'], bools: [], upsert: true },
  Spins:       { pk: 'spin_id', cols: ['spin_id','child_id','family_id','round_key','earned_at','used_at','prize_stars','prize_index','request_id'], bools: [], ignoreDup: true },
};

const NUM_COLS = new Set(['base_stars','multiplier','stars_earned','stars_cost','quantity','stars_spent','prize_stars','prize_index',
  'stars_earned_today','stars_spent_today','balance','missions_completed_today']);

export class ConflictError extends Error {}

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
  async load(scope, opts = {}) {
    const stmts = [], names = [];
    for (const [name, t] of Object.entries(TABLES)) {
      if (name === 'DailyLog') { this.rows[name] = []; continue; }      // ใช้แค่เขียน
      if (t.global) {
        if (scope.all || opts.withLineState) { stmts.push(this.db.prepare(`SELECT * FROM ${name}`)); names.push(name); }
        else this.rows[name] = [];
        continue;
      }
      if (scope.all) { stmts.push(this.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`)); names.push(name); continue; }
      const ids = (scope.familyIds || []).filter(Boolean).map(String);
      if (!ids.length) { this.rows[name] = []; continue; }
      const q = ids.map(() => '?').join(',');
      stmts.push(this.db.prepare(`SELECT * FROM ${name} WHERE family_id IN (${q}) ORDER BY rowid`).bind(...ids));
      names.push(name);
    }
    const results = stmts.length ? await this.db.batch(stmts) : [];
    results.forEach((r, i) => {
      const name = names[i];
      this.rows[name] = (r.results || []).map(dbRow => this._wrap(name, dbRow));
    });
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
      if (op.kind === 'insert') {
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
      throw e;
    }
  }
}
