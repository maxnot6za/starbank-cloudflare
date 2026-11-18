// =====================================================================
// มินิเกม "ถุงเท้าซานต้า" (กิจกรรมคริสต์มาส) — เกมล้วน ไม่คุยกับเซิร์ฟเวอร์
//   SocksGame.start({ trial, kid, cfg, base, onEnd(result), onQuit(result) })
//   result = { socks, taps, golds, clocks, bad, played_ms, trial }
// จิ้มของที่หล่นจากฟ้า · ปรับค่าทั้งหมดได้จาก cfg (มาจากเซิร์ฟเวอร์ ไม่ต้อง deploy)
// =====================================================================
(function () {
  var DEF = {
    seconds: 30, clockAdd: 5, clockMax: 15,         // เวลาเล่น · นาฬิกา +5 วิ (รวมไม่เกิน +15)
    spawnFrom: 1.3, spawnTo: 3.0,                    // ของหล่นต่อวินาที ตอนเริ่ม → ตอนท้าย
    fallFrom: 0.20, fallTo: 0.42,                    // ความเร็วตก (สัดส่วนความสูงจอต่อวินาที)
    kidSlow: 0.85,
    rushSec: 10, rushX: 1.6,                         // 10 วิสุดท้าย: ของหล่นถี่และเร็วขึ้นอีก 1.6 เท่า                                   // ลูก: ตกช้ากว่า
    comboEvery: 5, comboBonus: 1,                    // เก็บถุงเท้าติดกัน 5 ชิ้น +1
    freezeMs: 1500, smokeMs: 3000,
    items: {                                         // w = น้ำหนักโอกาสเจอ · v = ถุงเท้าที่ได้/เสีย
      sock:  { w: 52, v: 1 },
      gold:  { w: 5,  v: 3, fast: 1.35 },
      clock: { w: 4 },
      snow:  { w: 12 },
      smoke: { w: 9 },
      boot:  { w: 12, v: -1 },
      rock:  { w: 6,  v: -2 }
    }
  };
  var CSS = `
  .sg{position:fixed;inset:0;z-index:600;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;background:#2a3f86 center bottom/cover;font-family:inherit;color:#fff}
  .sg-hud{position:absolute;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 10px;display:flex;align-items:center;gap:10px;z-index:5;background:linear-gradient(#0b1a4a99,transparent)}
  .sg-sc{display:flex;align-items:center;gap:6px;background:#ffffff26;border-radius:99px;padding:5px 12px 5px 6px;font-weight:900;font-size:1.35rem;font-variant-numeric:tabular-nums}
  .sg-sc img{width:30px;height:30px;object-fit:contain}
  .sg-sc.bump{animation:sgBump .3s}@keyframes sgBump{40%{transform:scale(1.18)}}
  .sg-tm{flex:1;height:12px;border-radius:9px;background:#ffffff30;overflow:hidden}.sg-tm i{display:block;height:100%;background:linear-gradient(90deg,#7CF0B0,#FFD66B);border-radius:9px;transform-origin:left}
  .sg-tm.low i{background:linear-gradient(90deg,#FF7A6B,#FFB020)}
  .sg-sec{min-width:34px;text-align:right;font-weight:900;font-variant-numeric:tabular-nums}
  .sg-x{width:40px;height:40px;border-radius:50%;border:0;background:#ffffff2b;color:#fff;font-size:1.1rem;cursor:pointer}
  .sg-trial{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 62px);transform:translateX(-50%);z-index:5;background:#FFD66B;color:#5a3d00;font-weight:900;font-size:.8rem;border-radius:99px;padding:3px 12px}
  .sg-it{position:absolute;left:0;top:0;width:var(--s);height:var(--s);margin:calc(var(--s) / -2);will-change:transform;cursor:pointer}
  .sg-it img{width:100%;height:100%;object-fit:contain;pointer-events:none;filter:drop-shadow(0 4px 6px #0005)}
  .sg-it.gold img{filter:drop-shadow(0 0 10px #FFD66B) drop-shadow(0 4px 6px #0005)}
  .sg-pop{position:absolute;z-index:4;font-weight:900;font-size:1.5rem;pointer-events:none;text-shadow:0 2px 0 #0006;animation:sgPop .8s ease-out forwards}
  @keyframes sgPop{to{transform:translateY(-60px) scale(1.2);opacity:0}}
  .sg-burst{position:absolute;z-index:3;width:70px;height:70px;margin:-35px;border-radius:50%;pointer-events:none;border:4px solid #FFD66B;animation:sgBurst .4s ease-out forwards}
  @keyframes sgBurst{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
  .sg-ice{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:0;transition:opacity .2s;background:radial-gradient(circle at 50% 50%,transparent 35%,#bfe9ffcc 100%);box-shadow:inset 0 0 60px 20px #e8f8ffcc}
  .sg-ice.on{opacity:1}.sg-ice b{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font-size:1.3rem;color:#1b4b7a;background:#ffffffd9;border-radius:99px;padding:6px 16px}
  .sg-smoke{position:absolute;z-index:6;pointer-events:none;border-radius:50%;filter:blur(6px);background:radial-gradient(circle,#d9d4e8 0 45%,#b9b3cfee 60%,transparent 72%);transition:opacity .25s}
  .sg.shake{animation:sgShake .35s}@keyframes sgShake{20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}
  .sg-combo{position:absolute;left:50%;top:30%;transform:translateX(-50%);z-index:4;font-weight:900;font-size:1.6rem;color:#FFD66B;text-shadow:0 3px 0 #0006;pointer-events:none;animation:sgPop 1s ease-out forwards}
  .sg-cd{position:absolute;inset:0;z-index:8;display:flex;align-items:center;justify-content:center;font-size:5rem;font-weight:900;text-shadow:0 4px 0 #0005;background:#0b1a4a55}
  .sg-cd span{animation:sgCd .9s ease-out both}@keyframes sgCd{from{transform:scale(1.8);opacity:0}30%{transform:scale(1);opacity:1}to{opacity:0}}
  .sg-ask{position:absolute;inset:0;z-index:9;background:#0b1a4aaa;display:flex;align-items:center;justify-content:center;padding:20px}
  .sg-ask>div{background:#fff;color:#1F3B35;border-radius:22px;padding:18px;max-width:340px;text-align:center}
  .sg-ask b{display:block;font-size:1.15rem;margin-bottom:6px}.sg-ask p{margin:0 0 14px;color:#5E7A73}
  .sg-ask .row{display:flex;gap:10px}.sg-ask button{flex:1;border:0;border-radius:14px;padding:12px;font:inherit;font-weight:800;cursor:pointer}
  .sg-ask .go{background:#23966F;color:#fff}.sg-ask .no{background:#FFEDEC;color:#C8322F}
    .sg-rush{position:absolute;left:0;right:0;top:34%;z-index:7;display:flex;justify-content:center;pointer-events:none}
  .sg-rush b{background:#FF5A3C;color:#fff;font-size:1.5rem;font-weight:900;border-radius:18px;padding:10px 20px;box-shadow:0 6px 0 #0004;animation:sgRush 1.8s ease-out forwards}
  @keyframes sgRush{0%{transform:scale(.4);opacity:0}15%{transform:scale(1.1);opacity:1}25%,80%{transform:scale(1);opacity:1}100%{transform:scale(1);opacity:0}}
  .sg-tm.rush{animation:sgBlink .5s infinite alternate}@keyframes sgBlink{to{box-shadow:0 0 12px #FF5A3C}}
  @media (prefers-reduced-motion:reduce){.sg.shake,.sg-pop,.sg-burst,.sg-combo{animation-duration:.01s}}`;

  // ---------- เสียง (Web Audio ล้วน ไม่มีไฟล์) · ปิดตามปุ่มเสียงของแอป (localStorage sb_sfx = '0') ----------
  // เพลงพื้นหลัง = Jingle Bells (James Lord Pierpont 1857 · public domain) เล่นแบบกระดิ่ง เร่งขึ้นช่วง 10 วิสุดท้าย
  var NOTE = { C: 523.25, D: 587.33, E: 659.25, F: 698.46, G: 783.99, A: 880, c: 261.63, g: 196, f: 174.61 };
  var A1 = 'E.5 E.5 E1 E.5 E.5 E1 E.5 G.5 C.75 D.25 E2', MEL = (A1 + ' F.5 F.5 F.75 F.25 F.5 E.5 E.5 E.25 E.25 E.5 D.5 D.5 E.5 D1 G1 ' + A1 + ' F.5 F.5 F.75 F.25 F.5 E.5 E.5 E.25 E.25 G.5 G.5 F.5 D.5 C2').split(' ').map(function (t) { return [t[0], parseFloat(t.slice(1))]; });
  function Sound() {
    var on = true; try { on = localStorage.getItem('sb_sfx') !== '0'; } catch (e) {}
    var A = window.AudioContext || window.webkitAudioContext, ac = null, out = null;
    if (on && A) { try { ac = new A(); out = ac.createGain(); out.gain.value = .55; out.connect(ac.destination); } catch (e) { ac = null; } }
    var noiseBuf = null;
    function tone(f, t, d, type, vol, f2) {
      var o = ac.createOscillator(), g = ac.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || .3, t + .01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d + .02);
    }
    function noise(t, d, vol, freq, q) {
      if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * .5, ac.sampleRate); var a = noiseBuf.getChannelData(0); for (var i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; }
      var n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); n.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 1;
      g.gain.setValueAtTime(vol || .2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + d + .02);
    }
    function bell(f, t, d, vol) { tone(f, t, d, 'sine', vol); tone(f * 2.01, t, d * .6, 'sine', vol * .35); tone(f * 3.2, t, d * .3, 'triangle', vol * .12); }
    var S = {
      ok: !!ac,
      resume: function () { if (ac && ac.state === 'suspended') ac.resume(); },
      play: function (k, n) {
        if (!ac) return; var t = ac.currentTime;
        switch (k) {
          case 'sock': var up = Math.min(n || 0, 8) * 40; tone(520 + up, t, .12, 'sine', .35, 900 + up); noise(t, .05, .08, 3000); break;
          case 'gold': [0, .06, .12].forEach(function (d, i) { bell([1046, 1318, 1568][i], t + d, .45, .22); }); break;
          case 'clock': noise(t, .03, .3, 4000, 8); noise(t + .14, .03, .3, 2600, 8); tone(1200, t + .28, .2, 'triangle', .15); break;
          case 'snow': tone(1800, t, .5, 'triangle', .12, 600); noise(t, .5, .1, 6000, 2); break;
          case 'smoke': noise(t, .45, .35, 500, .7); break;
          case 'bad': tone(140, t, .25, 'sine', .55, 45); noise(t, .12, .25, 300); break;
          case 'frozen': tone(220, t, .08, 'square', .06); break;
          case 'combo': [0, .07, .14, .21].forEach(function (d, i) { tone([784, 988, 1175, 1568][i], t + d, .14, 'triangle', .18); }); break;
          case 'count': tone(n ? 660 : 990, t, n ? .15 : .35, 'triangle', .25); break;
          case 'rush': tone(880, t, .12, 'square', .1); tone(880, t + .18, .12, 'square', .1); tone(1175, t + .36, .25, 'square', .1); break;
          case 'end': [0, .12, .24, .4].forEach(function (d, i) { bell([523, 659, 784, 1046][i], t + d, i === 3 ? .9 : .35, .25); }); break;
        }
      },
      // เพลง: เรียกทุกเฟรมจาก loop ของเกม จองโน้ตล่วงหน้า 0.25 วิ (ไม่ใช้ timer)
      mi: 0, next: 0, beat: 0,
      music: function (fast) {
        if (!ac) return; var t = ac.currentTime, bpm = 150 * (fast || 1), q = 60 / bpm;
        if (S.next < t) S.next = t + .05;
        while (S.next < t + .25) {
          var m = MEL[S.mi], d = m[1] * q;
          bell(NOTE[m[0]], S.next, Math.min(.6, d * 1.6), .09);
          var bb = Math.floor(S.beat); if (S.beat === bb) { tone(bb % 2 ? NOTE.g : NOTE.c, S.next, q * .9, 'triangle', .07); noise(S.next, .08, .05, 7000, 3); }
          if (S.beat - bb === .5) noise(S.next, .06, .035, 8000, 3);
          S.beat += m[1]; S.next += d; S.mi = (S.mi + 1) % MEL.length; if (S.mi === 0) S.beat = 0;
        }
      },
      close: function () { if (ac) { var c = ac; setTimeout(function () { try { c.close(); } catch (e) {} }, 1200); } ac = null; }
    };
    return S;
  }
  var styled = false;
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function merge(a, b) { var o = JSON.parse(JSON.stringify(a)); if (b) Object.keys(b).forEach(function (k) { if (k === 'items' && b.items) Object.keys(b.items).forEach(function (i) { o.items[i] = Object.assign({}, o.items[i] || {}, b.items[i]); }); else o[k] = b[k]; }); return o; }

  function start(opt) {
    if (!styled) { var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); styled = true; }
    var C = merge(DEF, opt.cfg), base = opt.base != null ? opt.base : '/events/socks/', img = function (n) { return base + n + '.webp'; };
    var root = el('div', 'sg'); root.style.backgroundImage = 'url(' + img('bg') + ')';
    var hud = el('div', 'sg-hud', '<div class="sg-sc"><img src="' + img('sock') + '" alt=""><span>0</span></div><div class="sg-tm"><i></i></div><span class="sg-sec">' + C.seconds + '</span><button type="button" class="sg-x" aria-label="ออก">✕</button>');
    root.appendChild(hud);
    if (opt.trial) root.appendChild(el('div', 'sg-trial', '🎮 ทดลองเล่น · ไม่นับถุงเท้า'));
    var ice = el('div', 'sg-ice', '<b>🥶 มือแข็ง!</b>'); root.appendChild(ice);
    document.body.appendChild(root);
    var snd = Sound(); snd.resume();
    var W = root.clientWidth, H = root.clientHeight, size = Math.round(Math.min(84, Math.max(58, W / 6)));
    var scEl = hud.querySelector('.sg-sc'), scN = scEl.querySelector('span'), tmBar = hud.querySelector('.sg-tm i'), tmBox = hud.querySelector('.sg-tm'), secEl = hud.querySelector('.sg-sec');
    var st = { socks: 0, taps: 0, golds: 0, clocks: 0, bad: 0, combo: 0, added: 0, left: C.seconds * 1000, total: C.seconds * 1000, freezeTo: 0, items: [], spawnAcc: 0, t0: 0, last: 0, run: false, over: false, paused: false };
    var slow = opt.kid ? C.kidSlow : 1, pool = Object.keys(C.items).map(function (k) { return [k, C.items[k].w || 0]; }), wsum = pool.reduce(function (a, b) { return a + b[1]; }, 0);
    function pick() { var r = Math.random() * wsum; for (var i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) return pool[i][0]; } return 'sock'; }
    function setScore(n, bump) { st.socks = Math.max(0, n); scN.textContent = st.socks; if (bump) { scEl.classList.remove('bump'); void scEl.offsetWidth; scEl.classList.add('bump'); } }
    function pop(x, y, txt, color) { var p = el('div', 'sg-pop', txt); p.style.left = x - 20 + 'px'; p.style.top = y - 30 + 'px'; p.style.color = color; root.appendChild(p); setTimeout(function () { p.remove(); }, 800); }
    function spawn() {
      var k = pick(), d = el('div', 'sg-it' + (k === 'gold' ? ' gold' : ''), '<img src="' + img(k) + '" alt="">'), it = C.items[k] || {};
      var s = size * (k === 'rock' || k === 'boot' ? 1.05 : 1); d.style.setProperty('--s', s + 'px');
      var o = { k: k, d: d, x: s / 2 + Math.random() * (W - s), y: -s, vy: 0, rot: (Math.random() - .5) * 40, sp: (Math.random() - .5) * 60, sway: Math.random() * 6.28, f: it.fast || 1 };
      d.addEventListener('pointerdown', function (e) { e.preventDefault(); hit(o, e.clientX, e.clientY); });
      root.appendChild(d); st.items.push(o);
    }
    function remove(o) { o.dead = 1; o.d.remove(); }
    function hit(o, x, y) {
      if (o.dead || !st.run || st.paused) return;
      if (performance.now() < st.freezeTo) { snd.play('frozen'); pop(x, y, '🥶', '#bfe9ff'); return; }
      st.taps++; remove(o);
      var b = el('div', 'sg-burst'); b.style.left = x + 'px'; b.style.top = y + 'px'; root.appendChild(b); setTimeout(function () { b.remove(); }, 400);
      var it = C.items[o.k] || {};
      if (o.k === 'sock' || o.k === 'gold') {
        if (o.k === 'gold') st.golds++;
        snd.play(o.k, st.combo);
        setScore(st.socks + it.v, true); pop(x, y, '+' + it.v, o.k === 'gold' ? '#FFD66B' : '#fff');
        st.combo++; if (C.comboEvery && st.combo % C.comboEvery === 0) { setScore(st.socks + C.comboBonus, true); snd.play('combo'); var c = el('div', 'sg-combo', '🔥 คอมโบ ' + st.combo + '! +' + C.comboBonus); root.appendChild(c); setTimeout(function () { c.remove(); }, 1000); }
        return;
      }
      st.combo = 0;
      if (o.k === 'clock') { var add = Math.min(C.clockAdd, C.clockMax - st.added); if (add > 0) { st.added += add; st.left += add * 1000; st.total += add * 1000; st.clocks++; snd.play('clock'); pop(x, y, '+' + add + ' วิ', '#9FE6FF'); } else pop(x, y, 'เต็มแล้ว', '#9FE6FF'); return; }
      st.bad++;
      if (o.k === 'snow') { snd.play('snow'); st.freezeTo = performance.now() + C.freezeMs; ice.classList.add('on'); setTimeout(function () { ice.classList.remove('on'); }, C.freezeMs); return; }
      if (o.k === 'smoke') { snd.play('smoke'); smoke(); pop(x, y, '💨', '#ddd'); return; }
      snd.play('bad'); setScore(st.socks + (it.v || 0)); pop(x, y, String(it.v), '#FF8A8A');
      root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
    }
    // ควันบังครึ่งจอ · ถูด้วยนิ้วให้จางเร็วขึ้น
    function smoke() {
      for (var i = 0; i < 4; i++) {
        var s = el('div', 'sg-smoke'), r = W * (.45 + Math.random() * .25), top = Math.random() > .5;
        s.style.cssText = 'width:' + r + 'px;height:' + r + 'px;left:' + (Math.random() * (W - r * .6) - r * .2) + 'px;top:' + ((top ? .15 : .45) * H + Math.random() * H * .2) + 'px';
        s._a = 1; root.appendChild(s);
        (function (s) { var t = setTimeout(function () { s.style.opacity = 0; setTimeout(function () { s.remove(); }, 260); }, C.smokeMs); s._t = t; })(s);
      }
    }
    root.addEventListener('pointermove', function (e) {
      if (!e.buttons && e.pointerType === 'mouse') return;
      root.querySelectorAll('.sg-smoke').forEach(function (s) { var r = s.getBoundingClientRect(); if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) { s._a -= .08; s.style.opacity = Math.max(0, s._a); if (s._a <= 0) s.remove(); } });
    });
    function loop(now) {
      if (st.over) return;
      var dt = Math.min(.05, (now - st.last) / 1000); st.last = now;
      if (st.run && !st.paused) {
        st.left -= dt * 1000;
        var k = 1 - Math.max(0, st.left) / st.total, prog = Math.min(1, (C.seconds * 1000 - Math.max(0, st.left)) / (C.seconds * 1000));
        var rush = st.left < C.rushSec * 1000 ? C.rushX : 1;
        if (rush > 1 && !st.rushed) { st.rushed = 1; snd.play('rush'); var rb = el('div', 'sg-rush', '<b>⚡ ' + C.rushSec + ' วิสุดท้าย เร็วขึ้น!</b>'); root.appendChild(rb); setTimeout(function () { rb.remove(); }, 1800); }
        st.spawnAcc += dt * rush * (C.spawnFrom + (C.spawnTo - C.spawnFrom) * prog);
        while (st.spawnAcc >= 1) { st.spawnAcc--; spawn(); }
        snd.music(rush > 1 ? 1.3 : 1);
        var v = (C.fallFrom + (C.fallTo - C.fallFrom) * prog) * H * slow * rush;
        st.items.forEach(function (o) {
          if (o.dead) return; o.y += v * o.f * dt; o.sway += dt * 2; o.rot += o.sp * dt;
          o.d.style.transform = 'translate(' + (o.x + Math.sin(o.sway) * 10) + 'px,' + o.y + 'px) rotate(' + o.rot + 'deg)';
          if (o.y > H + size) { if (o.k === 'sock' || o.k === 'gold') st.combo = 0; remove(o); }
        });
        st.items = st.items.filter(function (o) { return !o.dead; });
        tmBar.style.transform = 'scaleX(' + Math.max(0, st.left / st.total) + ')';
        secEl.textContent = Math.ceil(Math.max(0, st.left) / 1000); tmBox.classList.toggle('low', st.left < 10000); tmBox.classList.toggle('rush', rush > 1);
        if (st.left <= 0) return finish('time');
      }
      requestAnimationFrame(loop);
    }
    function result() { return { socks: st.socks, taps: st.taps, golds: st.golds, clocks: st.clocks, bad: st.bad, played_ms: Math.round(performance.now() - st.t0), trial: !!opt.trial }; }
    function finish(why) { if (st.over) return; st.over = true; st.run = false; var r = result(); r.why = why; if (why === 'time') snd.play('end'); snd.close(); setTimeout(function () { root.remove(); }, why === 'time' ? 600 : 0); (why === 'time' ? opt.onEnd : opt.onQuit || opt.onEnd)(r); }
    hud.querySelector('.sg-x').onclick = function () {
      if (opt.trial || !st.run) return finish('quit');
      st.paused = true;
      var a = el('div', 'sg-ask', '<div><b>ออกจากเกมเลยไหม?</b><p>ออกตอนนี้ได้ถุงเท้า <b style="display:inline;font-size:1.1rem;color:#C8322F">' + st.socks + '</b> คู่ และวันนี้เล่นไม่ได้อีกนะ</p><div class="row"><button type="button" class="go">เล่นต่อ</button><button type="button" class="no">ออกเลย</button></div></div>');
      root.appendChild(a);
      a.querySelector('.go').onclick = function () { a.remove(); st.paused = false; st.last = performance.now(); };
      a.querySelector('.no').onclick = function () { a.remove(); finish('quit'); };
    };
    // นับถอยหลัง 3-2-1
    var cd = el('div', 'sg-cd'); root.appendChild(cd); var n = 3;
    (function tick() { if (st.over) return; if (n === 0) { cd.remove(); snd.play('count', 0); st.run = true; st.t0 = st.last = performance.now(); return; } cd.innerHTML = '<span>' + n + '</span>'; snd.play('count', 1); n--; setTimeout(tick, 800); })();
    st.last = performance.now(); requestAnimationFrame(loop);
    return { quit: function () { finish('quit'); }, state: st };
  }
  window.SocksGame = { start: start, DEF: DEF };
})();
