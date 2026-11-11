/* SpriteScene — ผู้กำกับฉาก: หลายตัวละครในฉากเดียว + บทโต้ตอบเมื่ออยู่ใกล้กัน + แตะตัวละคร
 * ต้องโหลด sprite-actor.js ก่อน
 *
 *   const scene = SpriteScene.create(stageEl, {
 *     size: 56,                                   // ความกว้างหัวบนจอ (px)
 *     cast: [{ id: 'dino', manifest: dinoJson, basePath: '/sprites/dino/' }, { id: 'dad', manifest: dadJson, ... }],
 *     interactions: sceneJson.interactions,
 *     onEvent: (text) => console.log(text)        // ไว้แสดงว่าเกิดบทอะไร (ไม่บังคับ)
 *   });
 *   scene.start();   scene.stop();
 *
 * บทโต้ตอบ (scene json → interactions[]):
 *   { "id": "dadGift", "label": "พ่อให้ของขวัญลูก",
 *     "who": ["dad", "dino"],                     // ตัวละครที่เกี่ยวข้อง
 *     "lock": ["dad", "dino"],                    // ตัวที่หยุดพฤติกรรมเดิมมาเล่นบท (ค่าเริ่มต้น = who ทั้งหมด)
 *     "near": 3,                                  // ห่างกันไม่เกินกี่ "หัว" ถึงจะเริ่ม
 *     "when": { "dino": ["walk", "stand"] },      // ท่าปัจจุบันที่อนุญาต ("*" = ท่าไหนก็ได้)
 *     "chance": 0.5, "cooldown": 25000,           // โอกาสเกิด · เว้นระยะก่อนเกิดซ้ำ (ms)
 *     "script": [
 *       { "meet": 1.6 },                          // ตัวที่ล็อกเดินเข้าหากันจนห่าง 1.6 หัว แล้วหันหน้าเข้าหากัน
 *       { "dad": "gift" },                        // ให้ตัวนั้นเล่นท่า (รอจนจบ)
 *       { "dino": "cheer", "say": "เย้!" },       // เล่นท่า + กล่องคำพูด
 *       { "dino": "say", "say": "😊" },           // พูดอย่างเดียว ไม่เปลี่ยนท่า
 *       { "together": [ {...}, {...} ] },          // เล่นพร้อมกัน
 *       { "wait": 600 }
 *     ] }
 *   ตัวที่ไม่ได้อยู่ใน lock ยังทำท่าเดิมต่อ (เช่น ลูกนั่งเขียนต่อขณะแม่เดินมาชม)
 */
(function (root) {
  'use strict';
  function SpriteScene(stage, cfg) {
    this.stage = stage;
    this.cfg = cfg;
    this.size = cfg.size || 56;
    this.rules = cfg.interactions || [];
    this.cool = {};              // id บท → เวลาที่เกิดซ้ำได้
    this.busy = {};              // id ตัวละคร → กำลังเล่นบทอยู่
    this.running = false;
    this.actors = {};
    var self = this, n = cfg.cast.length;
    cfg.cast.forEach(function (c, i) {
      // แถวลึกตื้น: ตัวแรกอยู่หลังสุด (สูงจากพื้นมากสุด) ตัวท้ายอยู่หน้าสุด
      var lane = (n - 1 - i) * (cfg.laneGap != null ? cfg.laneGap : 7);
      var w = stage.clientWidth || 360;
      var a = SpriteActor.create(stage, c.manifest, {
        size: self.size, basePath: c.basePath || '', ground: (cfg.ground || 0) + lane,
        x: (w / (n + 1)) * (i + 1)
      });
      a.id = c.id;
      a.el.style.zIndex = 10 + i;
      if (cfg.passThrough === false) {
        // โหมดเข้ม: ห้ามเดินผ่านกันเลย
        a.range = function () { return self.range(a); };
        a.blocked = function (nx) { return self.blocked(a, nx); };
      } else {
        // โหมดปกติ: เดินสวนผ่านกันได้ แต่จุดที่หยุดต้องว่าง
        a.isFree = function (x) { return self.isFree(a, x); };
      }
      a.onChange = function (actor) { if (self.running) self.check(actor); };
      a.spr.style.pointerEvents = 'auto';
      a.spr.style.cursor = 'pointer';
      a.spr.addEventListener('click', function () { self.tap(c.id); });
      self.actors[c.id] = a;
    });
  }
  SpriteScene.create = function (stage, cfg) { return new SpriteScene(stage, cfg); };
  var P = SpriteScene.prototype;

  P.start = function () {
    this.running = true;
    var A = this.actors;
    Object.keys(A).forEach(function (k) { A[k].life(); });
  };
  P.stop = function () {
    this.running = false;
    var A = this.actors;
    Object.keys(A).forEach(function (k) { A[k].stop(); });
  };
  // ครึ่งความกว้างจริงของตัวละคร (รวมขอบขาวและของที่ถือ ทุกท่า) จาก extent ที่ cut.py วัดไว้ (px บนจอ)
  P.half = function (a) {
    if (a._half) return a._half;
    var mx = 0, sh = a.m.sheets;
    Object.keys(sh).forEach(function (k) {
      var e = sh[k].extent || [sh[k].cell[0] / 2, sh[k].cell[0] / 2];
      mx = Math.max(mx, e[0], e[1]);
    });
    return (a._half = mx * a.scale);
  };
  // ระยะห่างขั้นต่ำระหว่างกึ่งกลางของสองตัว = ครึ่งตัว A + ครึ่งตัว B + ช่องว่างเล็กน้อย → ไม่ทับกันเลย
  P.space = function (a, b) {
    if (!a) { var A = this.actors, k = Object.keys(A); return this.space(A[k[0]], A[k[1]]); }
    return this.half(a) + this.half(b) + this.size * (this.cfg.gap != null ? this.cfg.gap : 0.08);
  };
  P._others = function (a) {
    var A = this.actors;
    return Object.keys(A).filter(function (k) { return A[k] !== a; }).map(function (k) { return A[k]; });
  };
  // ช่องว่างที่ตัวนี้เดินได้: ระหว่างเพื่อนตัวซ้ายสุดที่ใกล้สุดกับตัวขวาที่ใกล้สุด (นับจุดที่เพื่อนกำลังเดินไปด้วย)
  P.range = function (a, except) {
    var self = this, lo = -Infinity, hi = Infinity;
    this._others(a).forEach(function (o) {
      if (except && except.indexOf(o) >= 0) return;
      var sp = self.space(a, o), far = o.target != null ? o.target : o.x;
      if (o.x < a.x) lo = Math.max(lo, Math.max(o.x, far) + sp);
      else hi = Math.min(hi, Math.min(o.x, far) - sp);
    });
    return [lo, hi];
  };
  // ก้าวไป nx แล้วจะชิดตัวที่อยู่ข้างหน้าเกินไปไหม
  P.blocked = function (a, nx) {
    var self = this;
    return this._others(a).some(function (o) {
      var ahead = (o.x - a.x) * a.dir > 0;
      return ahead && Math.abs(o.x - nx) < self.space(a, o) * 0.97;
    });
  };
  // จุดที่ "หยุด" ของแต่ละตัว: กำลังเดิน = จุดหมาย, ไม่ได้เดิน = ที่ยืนอยู่
  P.spot = function (o) { return o.target != null ? o.target : o.x; };
  P.isFree = function (a, x, except) {
    var self = this;
    return this._others(a).every(function (o) {
      return (except && except.indexOf(o) >= 0) || Math.abs(self.spot(o) - x) >= self.space(a, o);
    });
  };
  P._between = function (p, q) {
    var lo = Math.min(p.x, q.x), hi = Math.max(p.x, q.x);
    return this._others(p).some(function (o) { return o !== q && o.x > lo && o.x < hi; });
  };
  P._event = function (t) { if (this.cfg.onEvent) this.cfg.onEvent(t); };

  function allowed(list, cur) { return !list || list.indexOf('*') >= 0 || list.indexOf(cur) >= 0; }

  // เรียกทุกครั้งที่ตัวละครเปลี่ยนท่า (ไม่ได้วนเช็กตลอดเวลา)
  P.check = function (actor) {
    var now = Date.now(), self = this;
    for (var i = 0; i < this.rules.length; i++) {
      var r = this.rules[i];
      if (r.who.indexOf(actor.id) < 0) continue;
      if ((this.cool[r.id] || 0) > now) continue;
      var cast = r.who.map(function (id) { return self.actors[id]; });
      if (cast.some(function (a) { return !a || self.busy[a.id]; })) continue;
      var xs = cast.map(function (a) { return a.x; });
      if (Math.max.apply(null, xs) - Math.min.apply(null, xs) > (r.near || 3) * this.size) continue;
      if (!cast.every(function (a) { return allowed((r.when || {})[a.id], a.current); })) continue;
      if (this.cfg.passThrough === false && cast.length === 2 && this._between(cast[0], cast[1])) continue;   // โหมดห้ามผ่าน: มีคนคั่นกลาง → ไม่ไปหา
      // ไม่ผ่านโอกาส → พักบทนี้สักครู่ ไม่สุ่มใหม่ทุกครั้งที่เปลี่ยนท่า
      if (Math.random() > (r.chance != null ? r.chance : 1)) { this.cool[r.id] = now + 4000; continue; }
      this.run(r);
      return;
    }
  };

  P.run = function (r, tries) {
    var self = this, lock = (r.lock || r.who).map(function (id) { return self.actors[id]; });
    // ตัวที่ต้องใช้ยังเล่นบทอื่นอยู่ → รอให้จบก่อน (สูงสุด ~10 วิ) ไม่แย่งตัวกลางบท
    if (lock.some(function (a) { return self.busy[a.id]; })) {
      if ((tries || 0) < 20) setTimeout(function () { self.run(r, (tries || 0) + 1); }, 500);
      return;
    }
    this.cool[r.id] = Date.now() + (r.cooldown || 20000);
    lock.forEach(function (a) { self.busy[a.id] = true; a.stop(); });
    this._event(r.label || r.id);
    var steps = r.script || [];
    function one(s) {
      if (!self.running) return Promise.reject('stop');
      if (s.together) return Promise.all(s.together.map(one));
      if (s.wait) return new Promise(function (res) { setTimeout(res, s.wait); });
      if (s.meet != null) return self._meet(r, lock, s.meet);
      var id = Object.keys(s).filter(function (k) { return self.actors[k]; })[0];
      if (!id) return Promise.resolve();
      var a = self.actors[id], what = s[id];
      if (what === 'say') {
        a.say(s.say);
        return new Promise(function (res) { setTimeout(function () { a.say(''); res(); }, s.ms || 1400); });
      }
      var p = a.play(what);
      if (s.say) a.say(s.say);
      return p.then(function () { if (s.say) a.say(''); });
    }
    steps.reduce(function (p, s) { return p.then(function () { return one(s); }); }, Promise.resolve())
      .catch(function () {})
      .then(function () {
        lock.forEach(function (a) { self.busy[a.id] = false; if (self.running) a.life(); });
      });
  };

  // ตัวที่ล็อกเดินเข้าหากัน แล้วหันหน้าเข้าหากัน
  P._meet = function (r, lock, gapHeads) {
    var self = this, cast = r.who.map(function (id) { return self.actors[id]; });
    var locked = function (a) { return lock.indexOf(a) >= 0; }, moves = [];
    var left = cast[0].x <= cast[1].x ? cast[0] : cast[1], right = left === cast[0] ? cast[1] : cast[0];
    var gap = Math.max(gapHeads * this.size, this.space(left, right));
    var w = this.stage.clientWidth, m = this.size * 0.9;
    // ขอบเขตที่คู่นี้ใช้ได้ (ไม่ล้ำเข้าไปหาตัวที่สาม)
    var strict = this.cfg.passThrough === false, self = this, pair = [left, right];
    var lo = strict ? Math.max(m, this.range(left, [right])[0]) : m;
    var hi = strict ? Math.min(w - m, this.range(right, [left])[1]) : w - m;
    // โหมดปกติ: เลือกจุดพบที่ทั้งสองตำแหน่งว่าง (ไม่ไปหยุดทับตัวที่สาม) ลองขยับซ้ายขวาทีละนิด
    function spotOk(x, who) { return strict || self.isFree(who, x, pair); }
    if (locked(left) && locked(right)) {
      var mid0 = Math.min(hi - gap / 2, Math.max(lo + gap / 2, (left.x + right.x) / 2)), mid = mid0;
      for (var d = 0; d < w; d += this.size * 0.25) {
        var c1 = Math.min(hi - gap / 2, Math.max(lo + gap / 2, mid0 + d)), c2 = Math.min(hi - gap / 2, Math.max(lo + gap / 2, mid0 - d));
        if (spotOk(c1 - gap / 2, left) && spotOk(c1 + gap / 2, right)) { mid = c1; break; }
        if (spotOk(c2 - gap / 2, left) && spotOk(c2 + gap / 2, right)) { mid = c2; break; }
      }
      // ไม่มีที่ว่างพอ (จอแคบ มีตัวที่สามยืนขวาง) → ขอให้ตัวที่ขวางและว่างอยู่หลบไปจุดอื่น
      left.target = mid - gap / 2; right.target = mid + gap / 2;
      moves.push(left.walkTo(mid - gap / 2), right.walkTo(mid + gap / 2));
      this._shoo(pair);
    } else if (locked(left)) {
      var tl = right.x - gap;   // ยืนด้านซ้ายของเพื่อน ถ้าไม่ว่าง/ชิดขอบ ไปด้านขวาแทน
      if (tl < lo || !spotOk(tl, left)) tl = Math.min(hi, right.x + gap);
      left.target = tl; moves.push(left.walkTo(tl)); this._shoo(pair);
    } else if (locked(right)) {
      var tr = left.x + gap;
      if (tr > hi || !spotOk(tr, right)) tr = Math.max(lo, left.x - gap);
      right.target = tr; moves.push(right.walkTo(tr)); this._shoo(pair);
    }
    return Promise.all(moves).then(function () {
      // หันหน้าเข้าหากันตามตำแหน่งจริงหลังเดิน
      var l = left.x <= right.x ? left : right, r2 = l === left ? right : left;
      if (locked(l)) l.face(1);
      if (locked(r2)) r2.face(-1);
    });
  };

  // ตัวอื่นที่ยืน/กำลังจะหยุดทับจุดพบของคู่นี้ และไม่ได้เล่นบทอยู่ → เดินหลบไปจุดว่าง แล้วใช้ชีวิตต่อ
  P._shoo = function (pair) {
    var self = this;
    this._others(pair[0]).forEach(function (o) {
      if (pair.indexOf(o) >= 0 || self.busy[o.id]) return;
      var x = self.spot(o);
      var clash = pair.some(function (p) { return Math.abs(self.spot(p) - x) < self.space(p, o); });
      if (!clash) return;
      o.stop();
      var t = o.randomX();
      if (!self.isFree(o, t)) t = self.bestSpot(o);
      self.busy[o.id] = true;
      o.target = t;
      o.walkTo(t).then(function () { self.busy[o.id] = false; if (self.running) o.life(); });
    });
  };

  // จุดที่ห่างจากทุกตัวมากที่สุด (ใช้เมื่อสุ่มหาจุดว่างไม่เจอ) — ไล่ดูทั้งฉาก
  P.bestSpot = function (o) {
    var self = this, w = this.stage.clientWidth, m = this.size * 0.9, best = o.x, bestScore = -Infinity;
    for (var x = m; x <= w - m; x += this.size / 4) {
      var score = Math.min.apply(null, this._others(o).map(function (p) { return Math.abs(self.spot(p) - x) - self.space(p, o); }));
      if (score > bestScore) { bestScore = score; best = x; }
    }
    return best;
  };

  // แตะตัวละคร → เล่นท่า manifest.tap แล้วกลับไปใช้ชีวิตต่อ
  P.tap = function (id) {
    var a = this.actors[id], self = this, t = a.m.tap;
    if (!t || this.busy[id]) return;
    // กำลังเดินอยู่ → ทักทายด้วยคำพูดอย่างเดียว ไม่หยุดกลางทาง (กันหยุดทับตัวอื่น)
    if (a.target != null) { a.say(t.say || '👋'); setTimeout(function () { a.say(''); }, 1200); return; }
    this.busy[id] = true;
    a.stop();
    this._event('แตะ ' + (a.m.name || id));
    a.play(t.anim || t).then(function () {
      self.busy[id] = false;
      if (self.running) a.life();
    });
    if (t.say) a.say(t.say);
  };

  root.SpriteScene = SpriteScene;
  if (typeof module === 'object' && module.exports) module.exports = SpriteScene;
})(typeof window !== 'undefined' ? window : globalThis);
