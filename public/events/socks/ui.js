// =====================================================================
// กิจกรรม "ถุงเท้าซานต้า" ฝั่งหน้าจอ (HANDOFF 8.18)
//   socksCard(s)      การ์ดตะกร้าในหน้าหลัก (ผู้ปกครอง + ลูก) · s = dashboard.socks (null = ปิดกิจกรรม)
//   socksPlay(trial)  เล่นจริง/ทดลอง → ตัวเกม game.js → ส่งผล → หน้าสรุป
//   socksBag()        ลูกเปิดถุงของขวัญ (ซานต้ารับตะกร้า → ถุงหล่น → แตะ 3 ครั้ง → ของเด้ง)
//   socksBig()        หน้าถุงเท้ายักษ์ + หมุดรางวัล
//   socksPop(d)       ป๊อปอัป "เห็นรอบหน้าได้" ของลูกเมื่อมีถุงรอเปิด
// ใช้ของในหน้าแอป: esc, toast, google.script.run, Live, openModal, closeModal, popBusy, popLater, dashboardData, currentMember
// =====================================================================
(function () {
  var B = '/events/socks/', V = '?v=5', SX = { busy: false, popped: '' };
  var TIER = { s: 'ถุงเล็ก', m: 'ถุงกลาง', l: 'ถุงใหญ่' }, BAG_H = { s: 34, m: 38, l: 44 };
  var CSS = `
  .sx-pill{position:absolute;right:10px;top:10px;z-index:5;display:flex;align-items:center;gap:4px;background:#ffffff2e;border:1px solid #ffffff66;color:#fff;border-radius:99px;padding:3px 10px 3px 4px;font:inherit;font-size:.74rem;font-weight:800;cursor:pointer;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
  .sx-pill img{height:20px}
  .sx-cnt{display:flex;gap:6px;justify-content:center;margin:10px 0}.sx-cnt div{background:#22336e;color:#fff;border-radius:12px;padding:6px 8px;min-width:50px}.sx-cnt b{display:block;font-size:1.4rem}.sx-cnt small{font-size:.66rem;opacity:.8}
  .sx-card{position:relative;background:#fff;border-radius:22px;padding:14px;margin:12px 0;box-shadow:0 3px 0 #1f3b3512}
  .sx-card.santa{margin-top:70px}
  .sx-peek{position:absolute;right:4px;top:-64px;width:132px;pointer-events:none}
  .sx-ban{background:#E8473C;color:#fff;border-radius:16px;padding:8px 12px;font-weight:800;text-align:center;margin-bottom:10px}
  .sx-bk{display:flex;gap:10px;align-items:center}.sx-bk>img{width:92px;flex:none}
  .sx-bk b{font-size:1.05rem;display:block}.sx-bk small{color:#5E7A73;font-size:.78rem;display:block}
  .sx-num{display:flex;align-items:baseline;gap:4px;font-size:1.6rem;font-weight:800;color:#E8473C;line-height:1.15}.sx-num span{font-size:.85rem;color:#5E7A73;font-weight:600}
  .sx-tier{position:relative;height:12px;background:#E2F5EE;border-radius:9px;margin:52px 8px 8px}
  .sx-tier>i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#FF8A45,#E8473C);border-radius:9px;transition:width .6s}
  .sx-m{position:absolute;top:50%;width:max-content;transform:translate(-50%,-100%);margin-top:-6px;display:flex;flex-direction:column;align-items:center;font-size:.68rem;color:#5E7A73}
  .sx-m img{width:auto;max-width:none}.sx-m:not(.got) img{opacity:.45;filter:grayscale(.6)}.sx-m.got img{filter:drop-shadow(0 0 5px #FFC24B)}
  .sx-who{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.sx-who span{font-size:.74rem;background:#E2F5EE;border-radius:99px;padding:2px 9px}.sx-who span.no{background:#f2f2f2;color:#999}
  .sx-row{display:flex;gap:8px;margin-top:10px}
  .sx-btn{flex:1;border:0;border-radius:14px;padding:11px;font:inherit;font-weight:800;font-size:.92rem;cursor:pointer}
  .sx-r{background:#E8473C;color:#fff}.sx-t{background:#FFF4D6;color:#7a5400;flex:.6}.sx-g{background:#23966F;color:#fff}.sx-d{background:#EEF3F1;color:#7a8c87}
  .sx-gs{display:flex;align-items:center;gap:8px;margin-top:10px;background:#FFF8EC;border-radius:14px;padding:6px 10px;font-size:.8rem;cursor:pointer;border:0;width:100%;font:inherit;color:inherit;text-align:left}
  .sx-gs img{height:34px}.sx-gs .bar{flex:1;height:7px;border-radius:5px;background:#f1dfc4;overflow:hidden}.sx-gs .bar i{display:block;height:100%;background:#E8473C}
  .sx-note{font-size:.74rem;color:#5E7A73;margin-top:8px;text-align:center}
  .sx-ov{position:fixed;inset:0;z-index:640;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 16px) 16px calc(env(safe-area-inset-bottom,0px) + 16px);text-align:center;color:#fff;background:radial-gradient(circle at 50% 42%,#3b4f99,#141f4a);overflow:auto}
  .sx-ov h3{margin:0;font-size:1.25rem}.sx-ov p{margin:0;opacity:.85;font-size:.9rem}
  .sx-x{position:absolute;right:14px;top:calc(env(safe-area-inset-top,0px) + 12px);width:40px;height:40px;border-radius:50%;border:0;background:#ffffff2b;color:#fff;font-size:1.1rem;cursor:pointer}
  .sx-bub{background:#fff;color:#1F3B35;border-radius:18px;padding:10px 14px;position:relative;max-width:300px}.sx-bub:after{content:"";position:absolute;left:50%;bottom:-8px;margin-left:-8px;border:8px solid transparent;border-top-color:#fff;border-bottom:0}
  .sx-sc0{position:relative;height:260px;width:100%;max-width:360px;display:flex;justify-content:center;align-items:flex-end}
  .sx-sc0 .tk{height:250px;filter:drop-shadow(0 8px 14px #0007)}
  .sx-sc0 .bk{position:absolute;width:84px;left:calc(50% - 150px);bottom:10px;transition:transform .5s ease-in,opacity .5s}
  .sx-sc0.in .bk{transform:translate(170px,-90px) scale(.5) rotate(20deg);opacity:0}
  .sx-sc0.out{animation:sxOut .8s ease-in forwards}@keyframes sxOut{20%{transform:translateY(10px)}100%{transform:translate(160px,-260px) scale(.6);opacity:0}}
  .sx-bag{width:180px;cursor:pointer;filter:drop-shadow(0 10px 20px #0008);animation:sxDrop .7s cubic-bezier(.3,1.5,.5,1) both}
  @keyframes sxDrop{from{transform:translateY(-320px)}}
  .sx-bag.sh{animation:sxSh .35s}@keyframes sxSh{25%{transform:rotate(-8deg) scale(1.05)}75%{transform:rotate(8deg) scale(1.05)}}
  .sx-taps{display:flex;gap:6px}.sx-taps i{width:10px;height:10px;border-radius:50%;background:#ffffff40}.sx-taps i.on{background:#FFC24B}
  .sx-loot{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;max-width:360px}
  .sx-loot div{background:#fff;color:#1F3B35;border-radius:16px;padding:10px 4px;font-size:.74rem;font-weight:800;opacity:0;transform:scale(.4) translateY(30px);animation:sxPop .5s cubic-bezier(.3,1.6,.5,1) forwards}
  .sx-loot div:nth-child(2){animation-delay:.25s}.sx-loot div:nth-child(3){animation-delay:.5s}
  .sx-loot em{display:block;font-style:normal;font-size:1.9rem;height:48px;line-height:48px}.sx-loot em img{height:48px;width:auto;max-width:100%;object-fit:contain}
  @keyframes sxPop{to{opacity:1;transform:none}}
  .sx-bye{display:flex;align-items:center;gap:8px;background:#ffffff1f;border-radius:16px;padding:4px 12px 4px 4px;font-size:.88rem;animation:sxPop .5s .9s both;opacity:0}.sx-bye img{height:78px}
  .sx-fl{position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:641}.sx-fl.go{animation:sxFl .5s}@keyframes sxFl{0%{opacity:.9}100%{opacity:0}}
  .sx-end{background:#22336e center bottom/cover;justify-content:flex-start;color:#1F3B35}
  .sx-box{background:#fff;border-radius:22px;padding:14px;width:100%;max-width:380px;text-align:center}
  .sx-score{font-size:2.6rem;font-weight:800;color:#E8473C;line-height:1}.sx-score img{height:38px;vertical-align:-4px}
  .sx-rec{display:inline-block;margin-top:6px;background:#FFC24B;color:#5a3d00;border-radius:99px;padding:3px 12px;font-weight:800;font-size:.85rem}
  .sx-rank{text-align:left;display:flex;flex-direction:column;gap:6px;font-size:.88rem}.sx-rank h4{margin:0;color:#5E7A73;font-size:.85rem}
  .sx-rank div{display:flex;gap:8px;align-items:center}.sx-rank div span:nth-child(2){flex:1}.sx-rank .me{background:#FFF4D6;border-radius:10px;padding:2px 6px;margin:0 -6px}.sx-rank .gray{color:#aaa}
  .sx-add{display:flex;gap:8px;align-items:center;text-align:left;font-size:.85rem}.sx-add img{height:44px}
  .sx-big{background:#EEF8F4;color:#1F3B35;justify-content:flex-start}
  .sx-sock{position:relative;width:46%;max-width:190px;flex:none}.sx-sock img{width:100%;display:block}.sx-sock .e{filter:grayscale(1) opacity(.35)}.sx-sock .f{position:absolute;inset:0}
  .sx-pins{flex:1;display:flex;flex-direction:column;gap:8px;justify-content:space-between;min-width:0}
  .sx-pin{display:flex;gap:8px;align-items:center;background:#fff;border-radius:14px;padding:6px 8px;font-size:.75rem;text-align:left;line-height:1.3}
  .sx-pin em{font-style:normal;font-size:1.4rem;flex:none;width:40px;height:40px;display:flex;align-items:center;justify-content:center}.sx-pin em img{max-width:40px;max-height:40px}
  .sx-pin b{display:block;font-size:.78rem}.sx-pin.got{background:#FFF4D6;box-shadow:0 0 0 2px #FFC24B}.sx-pin:not(.got){opacity:.75}
  @media (prefers-reduced-motion:reduce){.sx-bag,.sx-loot div,.sx-bye,.sx-sc0.out{animation:none!important;opacity:1;transform:none}}`;
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  function E(s) { return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s); }
  function img(n) { return B + n + '.webp'; }
  function S() { return dashboardData && dashboardData.socks; }
  function basketOf(t) { return img('basket-' + (t === 'l' ? 2 : t ? 1 : 0)); }
  function dayLabel(d, s) { return d === s.today ? 'วันนี้' : 'วันที่ ' + Number(d.slice(8)) + '/' + Number(d.slice(5, 7)); }
  function itemPic(x) {
    if (x.kind === 'purple') return '<em>💜</em>ดาวม่วง ×' + x.n;
    if (x.kind === 'coupon') return '<em>🎟️</em>คูปองลด ' + x.pct + '%';
    var src = x.itemKind === 'pet' ? '/sprites/characters/' + x.sprite + '/' + (x.thumb || 'walk') + '.webp' : '/stage/decor/' + x.art + '.webp';
    return '<em><img src="' + src + '" alt="" onerror="this.replaceWith(\'🎁\')"></em>' + E(x.name);
  }

  // ---------- การ์ดหน้าหลัก ----------
  window.socksCard = function (s) {
    if (!s || s.soon) return '';
    socksResend();
    var t = s.tiers, top = t[2], pct = Math.min(100, s.total / top * 100), next = s.tier === 'l' ? null : (s.tier === 'm' ? ['l', t[2]] : s.tier === 's' ? ['m', t[1]] : ['s', t[0]]);
    var pend = s.pending || [], santa = s.santa && pend.length;
    var tomorrow = s.countDay !== s.today;
    var h = '<div class="sx-card' + (santa ? ' santa' : '') + '" id="sx-card">';
    if (santa) h += '<img class="sx-peek" src="' + img('santa-peek') + '" alt=""><div class="sx-ban">🎅 ซานต้ามารับถุงเท้าแล้ว!</div>';
    h += '<div class="sx-bk"><img src="' + basketOf(s.tier) + '" alt=""><div style="min-width:0"><b>ตะกร้าถุงเท้าของบ้าน' + (tomorrow ? ' (พรุ่งนี้)' : '') + '</b>' +
      '<div class="sx-num">' + s.total + ' <span>คู่</span></div><small>' + (next ? 'อีก ' + (next[1] - s.total) + ' คู่ได้' + TIER[next[0]] : 'ถึงถุงใหญ่แล้ว! 🎉') + '</small></div></div>';
    h += '<div class="sx-tier"><i style="width:' + pct + '%"></i>' + ['s', 'm', 'l'].map(function (k, i) {
      return '<span class="sx-m' + (s.total >= t[i] ? ' got' : '') + '" style="left:' + (t[i] / top * 100 - (i === 2 ? 3 : 0)) + '%"><img src="' + img('bag-' + k) + '" alt="" style="height:' + BAG_H[k] + 'px">' + t[i] + '</span>';
    }).join('') + '</div>';
    h += '<div class="sx-who">' + s.who.map(function (w) { return w.socks == null ? '<span class="no">' + E(w.name) + ' ยังไม่เล่น</span>' : '<span>✓ ' + E(w.name) + ' ' + w.socks + '</span>'; }).join('') + '</div>';
    if (santa) {
      h += s.canOpen ? '<div class="sx-row"><button class="sx-btn sx-g" onclick="socksBag()">🎁 เปิดถุงของขวัญ' + (pend.length > 1 ? ' (' + pend.length + ' ถุง)' : '') + '</button></div>'
        : '<div class="sx-note" style="font-weight:700;color:#23966F">🎁 มีถุงของขวัญรอลูกเปิด ' + pend.length + ' ถุง</div>';
    } else if (s.opened && !tomorrow) { /* ไม่เกิด: เปิดแล้ว countDay = พรุ่งนี้เสมอ */ }
    if (s.on) h += '<div class="sx-row">' + (s.canPlay ? '<button class="sx-btn sx-r" onclick="socksPlay(false)">🧦 เล่นเลย</button>' : '<button class="sx-btn sx-d" disabled>✓ วันนี้เล่นแล้ว</button>') +
      '<button class="sx-btn sx-t" onclick="socksPlay(true)">ทดลอง</button></div>';
    var bg = s.big;
    h += '<button class="sx-gs" onclick="socksBig()"><img src="' + img('bigsock-1') + '" alt=""><span>ถุงเท้ายักษ์</span><span class="bar"><i style="width:' + bg.pct + '%"></i></span><b>' + bg.pct + '%</b></button>';
    h += '<div class="sx-note">' + (tomorrow ? '🎁 เปิดถุงวันนี้แล้ว · ถุงเท้าที่เก็บตอนนี้นับเป็นของพรุ่งนี้<br>' : '') +
      '🎅 ซานต้ามารับถุงเท้า ' + s.santaHour + ':00–24:00 ทุกวัน · ลูกเป็นคนเปิดถุง</div></div>';
    return h;
  };

  // ---------- นับถอยหลังก่อนเริ่ม: ป้ายเล็กมุมขวาบนของการ์ดดาว (ทุกใบที่ปัดได้) · แตะ = ป๊อปอัปเล่ากิจกรรม ----------
  window.socksPill = function () {
    var s = S(); document.querySelectorAll('.sx-pill').forEach(function (e) { e.remove(); });
    if (!s || !s.soon) return;
    document.querySelectorAll('.u2-hero.u2-slide').forEach(function (h) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sx-pill';
      b.innerHTML = '<img src="' + img('sock') + '" alt="">' + (s.days ? 'อีก ' + s.days + ' วัน' : 'พรุ่งนี้!');
      b.onclick = function (e) { e.stopPropagation(); socksSoonPop(); };
      h.appendChild(b);
    });
  };
  window.socksSoonPop = function () {
    var s = S(); if (!s || !s.soon) return;
    var st = Date.parse(s.start + 'T00:00:00+07:00'), tick = function () {
      var el = document.getElementById('sx-cnt'); if (!el) return;
      var ms = Math.max(0, st - Date.now()), d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
      el.innerHTML = [[d, 'วัน'], [('0' + h).slice(-2), 'ชม.'], [('0' + m).slice(-2), 'นาที']].map(function (x) { return '<div><b>' + x[0] + '</b><small>' + x[1] + '</small></div>'; }).join('');
      setTimeout(tick, 20000);   // นาฬิกาในหน้าต่างที่เปิดอยู่ (ไม่ได้ดึงข้อมูลจากเซิร์ฟเวอร์)
    };
    openModal('<div style="text-align:center"><img src="' + img('santa-wave') + '" alt="" style="height:120px"><h2 style="margin:6px 0">🧦 ถุงเท้าซานต้า</h2>' +
      '<p style="margin:0 0 6px;color:var(--text-muted)">เริ่ม ' + Number(s.start.slice(8)) + ' ' + ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'][Number(s.start.slice(5, 7)) - 1] + ' · เล่นเกมเก็บถุงเท้าวันละรอบ<br>รวมกันทั้งบ้าน ' + s.santaHour + ':00 ซานต้ามารับ ลูกได้เปิดถุงของขวัญ!</p>' +
      '<div class="sx-cnt" id="sx-cnt"></div><button class="sx-btn sx-g" style="width:100%" onclick="closeModal()">รอเลย!</button></div>');
    tick();
  };

  // ---------- เล่น ----------
  function loadGame(cb) {
    if (window.SocksGame) return cb();
    var sc = document.createElement('script'); sc.src = B + 'game.js' + V; sc.onload = cb; sc.onerror = function () { toast('โหลดเกมไม่สำเร็จ ลองใหม่อีกครั้ง'); SX.busy = false; }; document.head.appendChild(sc);
  }
  window.socksPlay = function (trial) {
    var s = S(); if (!s || SX.busy) return; SX.busy = true;
    loadGame(function () {
      if (trial) {
        SocksGame.start({ trial: true, cfg: s.game, onEnd: function (r) { SX.busy = false; toast('🎮 ทดลองเล่นได้ ' + r.socks + ' คู่ (ไม่นับ)', 3500); }, onQuit: function () { SX.busy = false; } });
        return;
      }
      google.script.run.withSuccessHandler(function (st0) {
        SocksGame.start({ trial: false, cfg: st0.game || s.game, onEnd: send, onQuit: send });
      }).withFailureHandler(function (e) { SX.busy = false; toast(e.message, 4000); if (typeof Live !== 'undefined') Live.request(); }).socksStart(currentMember.memberId);
    });
  };
  function send(r) {
    var body = { socks: r.socks, golds: r.golds, clocks: r.clocks, bad: r.bad, taps: r.taps, played_ms: r.played_ms };
    try { localStorage.setItem('sb_socks_end', JSON.stringify(body)); } catch (e) {}
    google.script.run.withSuccessHandler(function (res) {
      try { localStorage.removeItem('sb_socks_end'); } catch (e) {}
      SX.busy = false; endScreen(res);
    }).withFailureHandler(function (e) { SX.busy = false; toast('ส่งผลไม่สำเร็จ เดี๋ยวลองส่งให้ใหม่อัตโนมัติ', 4000); }).socksEnd(currentMember.memberId, body);
  }
  // ส่งผลค้าง (เน็ตหลุดตอนจบเกม) ตอนการ์ดวาดใหม่
  function socksResend() {
    var raw = null; try { raw = localStorage.getItem('sb_socks_end'); } catch (e) {}
    if (!raw || SX.busy || SX.resending) return; SX.resending = true;
    google.script.run.withSuccessHandler(function () { SX.resending = false; try { localStorage.removeItem('sb_socks_end'); } catch (e) {} toast('🧦 ส่งถุงเท้ารอบที่แล้วเข้าตะกร้าแล้ว'); Live.request(); })
      .withFailureHandler(function (e) { SX.resending = false; if (/ไม่พบรอบ/.test(e.message)) try { localStorage.removeItem('sb_socks_end'); } catch (x) {} })
      .socksEnd(currentMember.memberId, JSON.parse(raw));
  }
  function endScreen(res) {
    var s = res.state || S() || { who: [], tiers: [0, 0, 0] }, me = currentMember.memberId;
    var who = (s.who || []).slice().sort(function (a, b) { return (b.socks == null ? -1 : b.socks) - (a.socks == null ? -1 : a.socks); });
    var medal = ['🥇', '🥈', '🥉'], k = 0;
    var ov = document.createElement('div'); ov.className = 'sx-ov sx-end'; ov.style.backgroundImage = 'url(' + img('bg') + ')';
    var tierTxt = s.tier ? 'ถึง' + TIER[s.tier] + 'แล้ว!' : 'อีก ' + (s.tiers[0] - s.total) + ' คู่ได้' + TIER.s;
    ov.innerHTML = '<div class="sx-box"><b>หมดเวลา!</b><div class="sx-score"><img src="' + img('sock') + '" alt=""> ' + res.socks + '</div>' +
      (res.record ? '<div class="sx-rec">🏆 สถิติใหม่! (เดิม ' + res.best + ')</div>' : res.best ? '<div style="color:#5E7A73;font-size:.85rem;margin-top:4px">สถิติของคุณ ' + Math.max(res.best, res.socks) + ' คู่</div>' : '') + '</div>' +
      '<div class="sx-box sx-rank"><h4>วันนี้ใครเก็บได้มากสุด</h4>' + who.map(function (w) {
        if (w.socks == null) return '<div class="gray"><span>·</span><span>' + E(w.name) + '</span><span>ยังไม่เล่น</span></div>';
        return '<div class="' + (String(w.member_id) === String(me) ? 'me' : '') + '"><span>' + (medal[k++] || '·') + '</span><span>' + E(w.name) + (String(w.member_id) === String(me) ? ' (คุณ)' : '') + '</span><b>' + w.socks + '</b></div>';
      }).join('') + '</div>' +
      '<div class="sx-box sx-add"><img src="' + basketOf(s.tier) + '" alt=""><span>เข้าตะกร้า' + (s.countDay !== s.today ? 'ของพรุ่งนี้' : 'บ้าน') + ' +' + res.socks + ' คู่<br><b>' + tierTxt + '</b></span></div>' +
      (res.unlocked && res.unlocked.length ? '<div class="sx-box">' + res.unlocked.map(function (u) { return '🎉 ถุงเท้ายักษ์ถึง ' + u.pct + '% ได้ <b>' + E(u.item && u.item.name) + '</b>'; }).join('<br>') + '</div>' : '') +
      '<button class="sx-btn sx-r" style="flex:none;width:100%;max-width:380px">กลับหน้าหลัก</button>';
    ov.querySelector('button').onclick = function () { ov.remove(); Live.request(); };
    document.body.appendChild(ov);
  }

  // ---------- เปิดถุงของขวัญ ----------
  window.socksBag = function () {
    var s = S(); if (!s || !s.pending || !s.pending.length || SX.busy) return;
    var b = s.pending[0]; SX.busy = true; loadHO(function () {});   // โหลดฉากส่งมอบไว้ก่อน → ตอนแตะปลดล็อกเสียงได้ทันที
    var ov = document.createElement('div'); ov.className = 'sx-ov';
    ov.innerHTML = '<button class="sx-x" aria-label="ปิด">✕</button><div class="sx-bub">โฮ่ โฮ่ โฮ่! ขอบคุณสำหรับถุงเท้า<br><b>' + b.total + ' คู่</b> ' + (b.day === s.today ? 'นะ' : 'ของ' + dayLabel(b.day, s)) + '</div>' +
      '<div class="sx-sc0"><img class="tk" src="' + img('santa-take') + '" alt="ซานต้า"><img class="bk" src="' + basketOf(b.tier) + '" alt=""></div>' +
      '<button class="sx-btn sx-g" style="flex:none;padding:12px 26px">🧦 ส่งถุงเท้าให้ซานต้า</button>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); SX.busy = false; Live.request(); };
    ov.querySelector('.sx-x').onclick = close;
    ov.querySelector('.sx-g').onclick = function () {
      this.disabled = true;
      loadHO(function () { if (window.SocksHandover) SocksHandover.unlock(); });   // ปลดล็อกเสียงตอนแตะ (iOS)
      google.script.run.withSuccessHandler(function (res) { reveal(ov, res, close); })
        .withFailureHandler(function (e) { toast(e.message, 4000); close(); }).socksOpen(currentMember.memberId, b.day);
    };
  };
  // ฉากส่งมอบ (handover.js: ถุงเท้าลอยเข้ากระสอบ + เลขนับ) → ถุงของขวัญหล่น
  function loadHO(cb) { if (window.SocksHandover) return cb(); var sc = document.createElement('script'); sc.src = B + 'handover.js' + V; sc.onload = cb; sc.onerror = cb; document.head.appendChild(sc); }
  function reveal(ov, res, close) {
    var s = S() || {};
    loadHO(function () {
      if (!window.SocksHandover) return step2();
      ov.innerHTML = '<button class="sx-x" aria-label="ปิด">✕</button><h3>ส่งถุงเท้าให้ซานต้า</h3>';
      ov.querySelector('.sx-x').onclick = close;
      SocksHandover.play(ov, { total: res.total, tiers: s.tiers || [45, 90, 135], base: B, onDone: step2 });
    });
    function step2() {
      ov.innerHTML = '<button class="sx-x" aria-label="ปิด">✕</button><h3>' + TIER[res.tier] + 'จากซานต้า</h3><p class="hint">แตะถุงให้เปิด</p>' +
        '<img class="sx-bag" src="' + img('bag-' + res.tier) + '" alt="ถุงของขวัญ"><div class="sx-taps"><i></i><i></i><i></i></div>';
      ov.querySelector('.sx-x').onclick = close;
      var bag = ov.querySelector('.sx-bag'), taps = ov.querySelectorAll('.sx-taps i'), n = 0;
      bag.onclick = function () {
        if (n >= 3) return; taps[n].classList.add('on'); n++;
        bag.style.animation = 'none'; void bag.offsetWidth; bag.style.animation = ''; bag.classList.remove('sh'); void bag.offsetWidth; bag.style.animationDuration = (.4 - .08 * n) + 's'; bag.classList.add('sh');
        if (n < 3) return;
        setTimeout(function () {
          var fl = document.createElement('div'); fl.className = 'sx-fl go'; document.body.appendChild(fl); setTimeout(function () { fl.remove(); }, 600);
          ov.innerHTML = '<h3>' + TIER[res.tier] + 'จากซานต้า</h3><p>ได้ของ ' + res.items.length + ' ชิ้น!</p><div class="sx-loot">' +
            res.items.map(function (x) { return '<div>' + itemPic(x) + '</div>'; }).join('') + '</div>' +
            '<div class="sx-bye"><img src="' + img('santa-wave') + '" alt=""><span>' + (res.more ? 'ยังมีถุงรออีก ' + res.more + ' ถุงนะ!' : 'เจอกันพรุ่งนี้ ' + ((S() || {}).santaHour || 18) + ':00 นะ!') + '</span></div>' +
            '<button class="sx-btn sx-r" style="flex:none;padding:12px 26px">' + (res.more ? 'เปิดถุงถัดไป' : 'เย้! เสร็จแล้ว') + '</button>';
          ov.querySelector('.sx-r').onclick = function () {
            ov.remove(); SX.busy = false;
            if (res.more && res.state) { dashboardData.socks = res.state; socksBag(); } else Live.request();
          };
        }, 380);
      };
    }
  }

  // ---------- ถุงเท้ายักษ์ ----------
  window.socksBig = function () {
    var s = S(); if (!s) return; var g = s.big;
    var left = Math.max(0, Math.round((Date.parse(s.end + 'T00:00:00Z') - Date.parse(s.today + 'T00:00:00Z')) / 86400000));
    var ov = document.createElement('div'); ov.className = 'sx-ov sx-big';
    ov.innerHTML = '<button class="sx-x" style="background:#1F3B3522;color:#1F3B35" aria-label="ปิด">✕</button><h3>ถุงเท้ายักษ์ของบ้าน</h3><p style="color:#5E7A73">ถุงเท้าทุกคู่ที่บ้านเก็บได้ มาเติมที่นี่ · ' + (left ? 'อีก ' + left + ' วันถึงวันสุดท้าย' : 'วันนี้วันสุดท้าย!') + '</p>' +
      '<div style="display:flex;gap:10px;width:100%;max-width:380px;align-items:center">' +
      '<div class="sx-sock"><img class="e" src="' + img('bigsock-1') + '" alt=""><img class="f" src="' + img('bigsock-1') + '" alt="" style="clip-path:inset(' + (100 - g.pct) + '% 0 0 0)"></div>' +
      '<div class="sx-pins">' + g.milestones.slice().reverse().map(function (m) {
        var it = m.item || {}, src = it.kind === 'pet' ? '/sprites/characters/' + it.sprite + '/' + (it.thumb || 'walk') + '.webp' : '/stage/decor/' + it.art + '.webp';
        return '<div class="sx-pin' + (m.got ? ' got' : '') + '"><em><img src="' + src + '" alt="" onerror="this.replaceWith(\'' + (m.pct === 100 ? '🐧' : '🎁') + '\')"></em><span><b>' + m.pct + '%' + (m.got ? ' ✓' : '') + (m.pct === 100 ? ' · ภายใน ' + Number(s.end.slice(8)) + ' ธ.ค.' : '') + '</b>' + E(it.name) + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="sx-box" style="display:flex;justify-content:space-between"><span>เก็บแล้ว <b style="color:#E8473C">' + g.total.toLocaleString() + '</b> / ' + g.target.toLocaleString() + ' คู่</span><b>' + g.pct + '%</b></div>';
    ov.querySelector('.sx-x').onclick = function () { ov.remove(); };
    document.body.appendChild(ov);
  };

  // ---------- ป๊อปอัปลูก (เห็นรอบหน้าได้) ----------
  window.socksPop = function (d) {
    var s = d && d.socks; if (!s || !s.canOpen || !s.pending || !s.pending.length || currentMember.role !== 'child') return;
    var key = s.today + ':' + s.pending.length; if (SX.popped === key || popBusy() || !popLater()) return; SX.popped = key;
    openModal('<div style="text-align:center"><img src="' + img('santa-wave') + '" alt="" style="height:150px"><h2 style="margin:6px 0">🎅 ซานต้ามาแล้ว!</h2><p>ทิ้ง' + TIER[s.pending[0].tier] + 'ไว้ให้บ้านเรา' + (s.pending.length > 1 ? ' (รออยู่ ' + s.pending.length + ' ถุง)' : '') + '</p>' +
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="sx-btn sx-d" onclick="closeModal()">ไว้ก่อน</button><button class="sx-btn sx-g" onclick="closeModal();setTimeout(socksBag,300)">🎁 เปิดเลย</button></div></div>');
  };
})();
