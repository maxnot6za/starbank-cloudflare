/* SpriteActor — เล่นอนิเมชันตัวละครจาก character.json (ไม่มี dependency, ใช้ได้ทั้ง <script> และ import)
 *
 *   const actor = SpriteActor.create(stageEl, manifest, { size: 70, basePath: 'sprites/characters/dino/' });
 *   actor.life();                 // เดินเล่น/นั่ง/เขียน วนเองตาม manifest.life
 *   await actor.play('sitDown');  // เล่นท่าเดียวจนจบ
 *   actor.loop('writeThink');     // วนท่าไปเรื่อย ๆ (เรียก play/loop/walkTo อื่นเพื่อหยุด)
 *   await actor.walkTo(200);      // เดินไปตำแหน่ง x (px จากซ้ายของ stage)
 *   actor.say('อืม...');  actor.destroy();
 *
 * กติกา:
 *   - ทุกชีตตัดด้วย sprites/cut.py → หัวกว้างเท่ากัน (manifest.headWidth) จึงใช้ scale เดียวกันทุกท่า
 *   - size = ความกว้างหัวบนจอ (px) · ตำแหน่ง x = กึ่งกลางหัว · เท้าอยู่บนพื้นของ stage เสมอ
 *   - ใช้ requestAnimationFrame/setTimeout เฉพาะตอนเล่นอนิเมชัน (ไม่ได้ poll เซิร์ฟเวอร์)
 *   - prefers-reduced-motion → ไม่เดิน ไม่วน แสดงเฟรมแรกของท่า idle เท่านั้น
 */
(function (root) {
  'use strict';
  var REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STYLE_ID = 'sprite-actor-style';
  var CSS = '.sa-actor{position:absolute;bottom:0;left:0;width:0;height:0;will-change:transform;pointer-events:none}' +
    '.sa-spr{position:absolute;bottom:0;left:0;background-repeat:no-repeat;transform-origin:50% 100%}' +
    '.sa-shadow{position:absolute;bottom:-5px;height:10px;border-radius:50%;background:rgba(31,59,53,.13);transform:translateX(-50%)}' +
    '.sa-bubble{position:absolute;left:0;transform:translate(-50%,-6px);white-space:nowrap;font-size:13px;line-height:1.3;' +
    'background:#FFF4D6;color:#7a5200;border-radius:12px;padding:4px 10px;opacity:0;transition:opacity .2s}' +
    '.sa-bubble.on{opacity:1}';

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // แปลง anim ใน manifest เป็นรายการขั้น [{ f, ms, say }]
  // รูปแบบที่รองรับ:  frames: [0,1,2] + ms: 120 | [600,160,...]   หรือ   steps: [[เฟรม, ms, "คำพูด"?], ...]
  function stepsOf(anim) {
    if (anim.steps) return anim.steps.map(function (s) { return { f: s[0], ms: s[1], say: s[2] }; });
    var fr = anim.frames;
    return fr.map(function (f, i) { return { f: f, ms: Array.isArray(anim.ms) ? anim.ms[i] : (anim.ms || 120) }; });
  }

  function SpriteActor(stage, manifest, opts) {
    opts = opts || {};
    injectStyle();
    this.stage = stage;
    this.m = manifest;
    this.base = opts.basePath || '';
    this.size = opts.size || 70;                     // ความกว้างหัวบนจอ
    this.scale = this.size * (manifest.scale || 1) / (manifest.headWidth || 150);   // manifest.scale = หัวใหญ่กว่าตัวอื่นกี่เท่า (ผู้ใหญ่ > เด็ก)
    this.speed = opts.speed || 1;                    // ตัวคูณความเร็ว (0.5 = ช้าลงครึ่งหนึ่ง)
    this.margin = opts.margin != null ? opts.margin : this.size * 0.9;
    this.onState = opts.onState || null;             // callback(ชื่อท่า) ไว้แสดงสถานะ/ดีบัก
    this.x = opts.x != null ? opts.x : this.margin;
    this.dir = 1;                                    // 1 = หันขวา, -1 = หันซ้าย
    this.token = 0;                                  // เปลี่ยนทุกครั้งที่สั่งท่าใหม่ → ท่าเก่าหยุดเอง

    if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
    var el = this.el = document.createElement('div'); el.className = 'sa-actor';
    el.style.bottom = (opts.ground || 0) + 'px';
    this.shadow = document.createElement('div'); this.shadow.className = 'sa-shadow';
    this.shadow.style.width = (this.size * 1.1) + 'px';
    this.spr = document.createElement('div'); this.spr.className = 'sa-spr';
    this.bubble = document.createElement('div'); this.bubble.className = 'sa-bubble';
    el.appendChild(this.shadow); el.appendChild(this.spr); el.appendChild(this.bubble);
    stage.appendChild(el);
    this.sheet = null;
    var idle = this.m.idle || Object.keys(this.m.anims)[0];
    this._frame(this.m.anims[idle].sheet, stepsOf(this.m.anims[idle])[0].f);
    this._place();
  }

  SpriteActor.create = function (stage, manifest, opts) { return new SpriteActor(stage, manifest, opts); };
  SpriteActor.load = function (url) { return fetch(url).then(function (r) { return r.json(); }); };

  var P = SpriteActor.prototype;

  P._frame = function (sheetName, f) {
    var sh = this.m.sheets[sheetName], s = this.spr, k = this.scale;
    if (this.sheet !== sheetName) {
      this.sheet = sheetName;
      var w = sh.cell[0] * k, h = sh.cell[1] * k;
      s.style.width = w + 'px'; s.style.height = h + 'px';
      s.style.marginLeft = (-w / 2) + 'px';
      s.style.backgroundImage = 'url("' + (sh.src || this.base + sh.file) + '")';
      s.style.backgroundSize = (sh.frames * 100) + '% 100%';
      this.bubble.style.bottom = (h * 0.98) + 'px';
    }
    s.style.backgroundPosition = (sh.frames > 1 ? f * 100 / (sh.frames - 1) : 0) + '% 0';
    // หันตามทิศที่ต้องการ: ชีตแต่ละอันบอกไว้ว่าวาดหันทางไหน
    var flip = (sh.facing === 'left' ? -1 : 1) * this.dir;
    s.style.transform = 'scaleX(' + flip + ')' + (this._bob ? ' translateY(' + this._bob + 'px)' : '');
  };
  P._place = function () { this.el.style.transform = 'translateX(' + this.x + 'px)'; };
  P._wait = function (ms, t) {
    var self = this;
    return new Promise(function (res, rej) {
      setTimeout(function () { self.token === t ? res() : rej('stop'); }, ms / self.speed);
    });
  };
  P._state = function (s) {
    if (this.onState) this.onState(s);
    if (this.onChange) this.onChange(this);   // ให้ Scene ตรวจว่าใกล้ตัวอื่นไหม
  };

  P.say = function (text) { this.bubble.textContent = text || ''; this.bubble.classList.toggle('on', !!text); };
  P.face = function (dir) { this.dir = dir < 0 ? -1 : 1; this._frame(this.sheet, this._f || 0); };
  P.stop = function () { this.token++; this.say(''); };

  // เล่นท่าเดียว 1 รอบ (หรือวนจนครบ forMs ถ้าส่งมา)
  P._run = function (name, t, forMs) {
    var a = this.m.anims[name];
    if (!a) return Promise.reject(new Error('ไม่มีท่า ' + name));
    var steps = stepsOf(a), self = this, i = 0, end = forMs ? performance.now() + forMs / this.speed : 0;
    this.current = name;
    this._state(a.label || name);
    if (REDUCED) { this._f = steps[steps.length - 1].f; this._frame(a.sheet, this._f); return Promise.resolve(); }
    function next() {
      if (self.token !== t) return Promise.reject('stop');
      if (i >= steps.length) {
        if (!(a.loop || forMs) || (forMs && performance.now() >= end)) { self.say(''); return Promise.resolve(); }
        i = 0;
      }
      var s = steps[i++];
      self._f = s.f; self._frame(a.sheet, s.f);
      if (s.say !== undefined) self.say(s.say); else if (a.steps) self.say('');
      return self._wait(s.ms, t).then(next);
    }
    return next();
  };
  P.play = function (name) { this.token++; return this._run(name, this.token).catch(function () {}); };
  P.loop = function (name, forMs) {
    this.token++;
    var a = this.m.anims[name];
    return this._run(name, this.token, forMs || (a && a.loop ? Infinity : 0)).catch(function () {});
  };

  // เดินไปที่ x ด้วยท่าที่ระบุใน manifest (anims.walk: sheet, frames, ms, speed = หัวต่อวินาที)
  P._walk = function (tx, t) {
    var self = this, a = this.m.anims[this.m.walk || 'walk'], steps = stepsOf(a);
    var pxPerMs = (a.speed || 1) * this.size / 1000, bob = a.bob || [];
    this.dir = tx >= this.x ? 1 : -1;
    this.target = tx;
    this.current = this.m.walk || 'walk';
    this._state(this.dir > 0 ? 'เดินไปทางขวา' : 'เดินไปทางซ้าย');
    if (REDUCED) { this.x = tx; this._place(); return Promise.resolve(); }
    return new Promise(function (res, rej) {
      var i = 0, acc = 0, last = performance.now();
      (function fr(now) {
        if (self.token !== t) return rej('stop');
        var dt = Math.min(50, now - last) * self.speed; last = now; acc += dt;
        while (acc >= steps[i].ms) { acc -= steps[i].ms; i = (i + 1) % steps.length; }
        var nx = self.x + self.dir * dt * pxPerMs;
        // กันชน: ถ้าก้าวต่อไปจะเข้าใกล้ตัวข้างหน้าเกินระยะ → หยุดตรงนี้ (ไม่เดินทะลุ/ทับกัน)
        var blocked = self.blocked && self.blocked(nx);
        if (!blocked) self.x = nx;
        var done = blocked || (self.dir > 0 ? self.x >= tx : self.x <= tx);
        if (done && !blocked) self.x = tx;
        self._bob = (bob[i] || 0) * self.scale * 2;
        self._f = steps[i].f; self._frame(a.sheet, steps[i].f); self._place();
        if (done) { self._bob = 0; self.target = null; return res(); }
        requestAnimationFrame(fr);
      })(last);
    });
  };
  P.walkTo = function (x) { this.token++; return this._walk(x, this.token).catch(function () {}); };
  P.randomX = function () {
    var w = this.stage.clientWidth, lo = this.margin, hi = Math.max(lo, w - this.margin), x;
    // อยู่ในฉากกับตัวอื่น → เดินได้แค่ในช่องว่างระหว่างเพื่อนซ้ายขวา (ไม่เดินผ่านกัน จึงไม่ทับกัน)
    if (this.range) { var r = this.range(); lo = Math.max(lo, r[0]); hi = Math.min(hi, r[1]); }
    if (hi <= lo) return this.x;
    var minGap = Math.min((hi - lo) / 2, this.size * 1.5), n = 0;
    do { x = rand(lo, hi); } while (Math.abs(x - this.x) < minGap && ++n < 20);
    return x;
  };

  // วนพฤติกรรมตาม manifest.life:
  //   { "walk": "random" }                       เดินไปจุดสุ่ม
  //   { "play": "sitDown" }                      เล่นท่า 1 รอบ
  //   { "pick": ["a","b"], "for": [4000,7000] }  สุ่มท่า แล้ววนท่านั้นตามเวลาที่สุ่ม
  //   { "wait": [500,1500] }                     อยู่นิ่ง ๆ
  //   { "chance": 0.5, "do": [ ...ขั้นย่อย ] }    ทำขั้นย่อยด้วยความน่าจะเป็น
  P.life = function () {
    this.token++;
    var t = this.token, self = this;
    if (REDUCED) return Promise.resolve();
    function runSteps(list) {
      return list.reduce(function (p, s) { return p.then(function () { return one(s); }); }, Promise.resolve());
    }
    function dur(v) { return Array.isArray(v) ? rand(v[0], v[1]) : (v || 0); }
    function one(s) {
      if (self.token !== t) return Promise.reject('stop');
      if (s.walk) return self._walk(s.walk === 'random' ? self.randomX() : s.walk, t);
      if (s.play) return self._run(s.play, t);
      if (s.pick) return self._run(pick(s.pick), t, dur(s.for) || 0);
      if (s.wait) { self.current = 'wait'; self._state('อยู่นิ่ง ๆ'); return self._wait(dur(s.wait), t); }
      if (s.chance != null) return Math.random() < s.chance ? runSteps(s.do || []) : Promise.resolve();
      return Promise.resolve();
    }
    function forever() { return runSteps(self.m.life || []).then(forever); }
    return forever().catch(function () {});
  };

  P.destroy = function () { this.stop(); this.el.remove(); };

  root.SpriteActor = SpriteActor;
  if (typeof module === 'object' && module.exports) module.exports = SpriteActor;
})(typeof window !== 'undefined' ? window : globalThis);
