// =====================================================================
// ฉาก "ส่งมอบถุงเท้าให้ซานต้า" (ก่อนถุงของขวัญหล่น) · ใช้ทั้งในแอป (ui.js) และหน้าจำลอง
//   SocksHandover.play(host, { total, tiers:[s,m,l], base, onDone })
// ถุงเท้าลอยโค้งจากตะกร้า → กระสอบ · ตัวเลขนับขึ้น เอฟเฟกต์แรงขึ้นตามยอด · กระสอบโตขึ้น 4 ระดับ · ตะกร้าค่อย ๆ ว่าง
// =====================================================================
(function () {
  var CSS = `
  .ho{position:relative;width:100%;max-width:380px;height:360px;margin:0 auto}
  .ho-num{position:absolute;left:0;right:0;top:0;text-align:center;font-weight:900;font-size:3.2rem;line-height:1;color:#fff;text-shadow:0 4px 0 #0005;font-variant-numeric:tabular-nums;z-index:6;transition:font-size .3s}
  .ho-num small{display:block;font-size:.9rem;font-weight:700;opacity:.85;margin-top:4px}
  .ho-num.b{animation:hoB .18s}@keyframes hoB{50%{transform:scale(1.18)}}
  .ho-num.t1{color:#FFD66B}
  .ho-num.t2{font-size:4rem;color:#FFD66B;text-shadow:0 0 18px #FFC24B,0 4px 0 #0005}
  .ho-num.t3{font-size:4.6rem;background:linear-gradient(90deg,#ff6b6b,#FFD66B,#7CF0B0,#6bc5ff,#c08bff,#ff6b6b);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 0 10px #FFD66B) drop-shadow(0 4px 0 #0005);animation:hoRain 1.2s linear infinite}
  @keyframes hoRain{to{background-position:300% 0}}
  .ho-bk{position:absolute;left:0;bottom:0;width:150px;z-index:3;transition:transform .2s}
  .ho-bk.p{animation:hoP .25s}@keyframes hoP{50%{transform:scale(1.08,.94)}}
  .ho-sa{position:absolute;right:0;bottom:0;height:250px;z-index:4;transform:scaleX(-1)}
  .ho-sk{position:absolute;z-index:5;transform-origin:50% 100%;transition:transform .35s cubic-bezier(.3,1.6,.5,1)}
  .ho-sk img{display:block;width:100%}
  .ho-fly{position:absolute;left:0;top:0;width:38px;z-index:6;pointer-events:none;will-change:transform}
  .ho-sp{position:absolute;width:10px;height:10px;margin:-5px;border-radius:50%;z-index:7;pointer-events:none;background:radial-gradient(circle,#fff 0 20%,#FFC24B 40%,transparent 70%)}
  .ho-cf{position:absolute;width:8px;height:12px;z-index:7;pointer-events:none;border-radius:2px}
  .ho-tag{position:absolute;left:50%;top:78px;transform:translateX(-50%) scale(.3);z-index:8;background:#E8473C;color:#fff;font-weight:900;border-radius:16px;padding:6px 16px;white-space:nowrap;opacity:0;animation:hoTag 1.3s ease-out forwards}
  @keyframes hoTag{15%,70%{opacity:1;transform:translateX(-50%) scale(1)}100%{opacity:0;transform:translateX(-50%) translateY(-20px) scale(1)}}
  .ho.shake{animation:hoSh .3s}@keyframes hoSh{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
  .ho-bub{position:absolute;right:10px;top:118px;background:#fff;color:#1F3B35;border-radius:16px;padding:8px 12px;font-weight:800;z-index:8;opacity:0;transform:scale(.4);transition:all .3s cubic-bezier(.3,1.6,.5,1)}
  .ho-bub.on{opacity:1;transform:none}`;
  // เสียง: ถุงเท้าเข้ากระสอบ = โน้ตไล่ขึ้น (สเกลเพนทาโทนิก C ไล่ทีละขั้น 3 ช่วงเสียง) · ผ่านขั้นถุง = คอร์ด · จบ = ฉลอง · ปิดตามปุ่มเสียงแอป (sb_sfx)
  var PENTA = [0, 2, 4, 7, 9], AC = null;
  function snd() {
    try { if (localStorage.getItem('sb_sfx') === '0') return null; } catch (e) {}
    try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { return null; }
    return AC;
  }
  // ต้องเรียกตอนผู้ใช้แตะ (iOS ไม่ให้เปิดเสียงจาก timer/animation) · เล่นเสียงเงียบ 1 ครั้งเพื่อปลดล็อก
  function unlock() {
    if (!snd()) return;
    try { var b = AC.createBuffer(1, 1, 22050), src = AC.createBufferSource(); src.buffer = b; src.connect(AC.destination); src.start(0); AC.resume(); } catch (e) {}
  }
  function bell(f, at, d, v) {
    var ac = AC, o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.01;
    g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(v, at + .008); g.gain.exponentialRampToValueAtTime(.0001, at + d);
    o.connect(g); o2.connect(g); g.connect(ac.destination); o.start(at); o2.start(at); o.stop(at + d + .05); o2.stop(at + d + .05);
  }
  function noteF(i) { var k = Math.min(i, 14), semi = PENTA[k % 5] + 12 * Math.floor(k / 5); return 523.25 * Math.pow(2, semi / 12); }
  function plink(i) { if (!snd()) return; bell(noteF(i), AC.currentTime, .32, .13); }
  function chord(k) { if (!snd()) return; var t = AC.currentTime, root = [523.25, 659.25, 783.99][k]; [1, 1.25, 1.5, 2].forEach(function (m, j) { bell(root * m, t + j * .06, .9, .09); }); }
  function fanfare() { if (!snd()) return; var t = AC.currentTime; [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, j) { bell(f, t + j * .1, j === 4 ? 1.2 : .4, .12); }); }
  var styled = false;
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h) e.innerHTML = h; return e; }
  function play(host, o) {
    if (!styled) { var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); styled = true; }
    var B = o.base != null ? o.base : '/events/socks/', img = function (n) { return B + n + '.webp'; }, N = Math.max(0, o.total | 0), T = o.tiers || [60, 120, 180];
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var box = el('div', 'ho'); host.appendChild(box);
    var num = el('div', 'ho-num', '0<small>คู่</small>'), bk = el('img', 'ho-bk'), sa = el('img', 'ho-sa'), sk = el('div', 'ho-sk', '<img alt="">'), bub = el('div', 'ho-bub', 'โฮ่ โฮ่! ขอบคุณนะ 🎅');
    bk.src = img('basket-2'); sa.src = img('santa-hold'); sk.querySelector('img').src = img('sack-0');
    [num, bk, sk, sa, bub].forEach(function (x) { box.appendChild(x); });
    // กระสอบ: ปากกระสอบอยู่ที่มือของซานต้า (92%, 57% ของภาพต้นฉบับ)
    var W = box.clientWidth, SA_H = 250, saW = SA_H * 273 / 420, saL = W - saW, hand = [saL + saW * .45, 360 - SA_H * (1 - .6)];   // กระสอบวางหน้าซานต้า (กลางตัว ระดับมือ)
    var SK = [[201, 156], [185, 190], [204, 219], [246, 272]], skW = 125;
    function sackLevel(i, sc) {
      var r = SK[i], h = skW * r[1] / r[0] * sc;
      sk.style.width = skW * sc + 'px'; sk.style.left = (hand[0] - skW * sc / 2) + 'px'; sk.style.top = (Math.min(hand[1] - h * .1, 360 - h + 6)) + 'px';
      var im = sk.querySelector('img'); if (!im.src.endsWith('sack-' + i + '.webp')) { im.src = img('sack-' + i); sk.style.transform = 'scale(1.12)'; setTimeout(function () { sk.style.transform = ''; }, 120); }
    }
    sackLevel(0, .85);
    var mouthB = function () { return [hand[0], hand[1] + 6]; }, mouthA = [75, 360 - 120];
    var count = 0, sent = 0, flights = Math.min(N, 36), per = flights ? N / flights : 0, launched = 0, tierShown = 0;
    function setNum(n) {
      num.firstChild.nodeValue = n;
      num.className = 'ho-num' + (n >= 100 ? ' t3' : n >= 60 ? ' t2' : n >= 30 ? ' t1' : '');
      void num.offsetWidth; num.classList.add('b');
      for (var k = tierShown; k < 3; k++) if (n >= T[k]) { tierShown = k + 1; chord(k); var tg = el('div', 'ho-tag', ['🎒 ถุงเล็ก!', '🎁 ถุงกลาง!', '🎅 ถุงใหญ่!'][k]); box.appendChild(tg); setTimeout(function () { tg.remove(); }, 1400); }
      var p = N ? n / N : 1, lvl = Math.min(3, Math.floor(p * 3.999));
      sackLevel(lvl, .85 + .15 * p);
      var b = p < .4 ? 'basket-2' : p < .85 ? 'basket-1' : 'basket-0'; if (!bk.src.endsWith(b + '.webp')) bk.src = img(b);
      bk.classList.remove('p'); void bk.offsetWidth; bk.classList.add('p');
      if (n >= 60 && !reduce) burst(mouthB(), n >= 100 ? 8 : 4);
      if (n >= 100 && !reduce) { box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); confetti(3); }
    }
    function burst(at, k) {
      for (var i = 0; i < k; i++) (function () { var s = el('i', 'ho-sp'); box.appendChild(s); var a = Math.random() * 6.28, d = 30 + Math.random() * 30;
        s.animate([{ transform: 'translate(' + at[0] + 'px,' + at[1] + 'px) scale(1)', opacity: 1 }, { transform: 'translate(' + (at[0] + Math.cos(a) * d) + 'px,' + (at[1] + Math.sin(a) * d - 20) + 'px) scale(.3)', opacity: 0 }], { duration: 600, easing: 'ease-out' }).onfinish = function () { s.remove(); }; })();
    }
    function confetti(k) {
      var C = ['#ff6b6b', '#FFD66B', '#7CF0B0', '#6bc5ff', '#c08bff'];
      for (var i = 0; i < k; i++) (function () { var c = el('i', 'ho-cf'); c.style.background = C[Math.random() * 5 | 0]; box.appendChild(c); var x = Math.random() * W;
        c.animate([{ transform: 'translate(' + x + 'px,-10px) rotate(0)' }, { transform: 'translate(' + (x + (Math.random() - .5) * 80) + 'px,380px) rotate(' + (Math.random() * 720) + 'deg)' }], { duration: 1400 + Math.random() * 600, easing: 'ease-in' }).onfinish = function () { c.remove(); }; })();
    }
    function fly() {
      var s = el('img', 'ho-fly'); s.src = img('sock'); box.appendChild(s);
      var a = [mouthA[0] + (Math.random() - .5) * 40, mouthA[1]], b = mouthB(), top = Math.min(a[1], b[1]) - 90 - Math.random() * 50;
      var steps = [], K = 12; for (var i = 0; i <= K; i++) { var t = i / K, x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * ((a[0] + b[0]) / 2) + t * t * b[0], y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * top + t * t * b[1];
        steps.push({ transform: 'translate(' + (x - 19) + 'px,' + (y - 19) + 'px) rotate(' + (t * 540) + 'deg) scale(' + (1 - t * .45) + ')' }); }
      var anim = s.animate(steps, { duration: reduce ? 1 : 620, easing: 'linear' });
      anim.onfinish = function () { s.remove(); plink(Math.floor(sent * 15 / Math.max(1, flights))); sent++; var n = Math.min(N, Math.round(sent * per)); if (sent >= flights) n = N; count = n; setNum(n); if (sent >= flights) finish(); };
    }
    function finish() { setTimeout(function () { bub.classList.add('on'); fanfare(); }, 250); setTimeout(function () { if (o.onDone) o.onDone(); }, 1700); }
    if (!flights) { finish(); return box; }
    (function launch() { if (launched >= flights) return; fly(); launched++; var p = launched / flights; setTimeout(launch, reduce ? 0 : Math.max(55, 230 - 190 * p)); })();
    return box;
  }
  window.SocksHandover = { play: play, unlock: unlock };
})();
