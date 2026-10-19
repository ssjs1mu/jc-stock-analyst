/* Joshi's Corner — "Chhotu", the little helper kid.
   A small cartoon baby that now and then pops up beside something worth pressing on Joshi's Dashboard — an X-ray button, the heatmap,
   the Global / Commodities / Currencies / Bonds buttons, the Market Bias map, the call tiles, Live TV — points at it with one arm and says
   "Press here!". It never blocks clicks (only its own little speech bubble is clickable), only shows on the dashboard, stays out of the way of
   pop-ups, and can be switched off with the 👶 chip (the choice is remembered on this device). */
(function () {
  'use strict';
  const LS = 'jc_kid_v1';
  let pref = { off: false, seen: {} };
  try { const j = JSON.parse(localStorage.getItem(LS) || 'null'); if (j) pref = Object.assign(pref, j); } catch (e) { }
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(pref)); } catch (e) { } };
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* every tip: where to point (CSS selector in #pDash), what to say. {n} = the visible name of the thing, if any */
  const TIPS = [
    { id: 'xray', sel: '#pDash .j3 .jd-xr', say: ['Press here for the X-ray! 🔍', 'Full report on {n} inside!'], pick: (el) => (el.closest('.j3-in') || el.closest('.j3') || {}).querySelector ? ((el.closest('.j3').querySelector('.j3-nm') || {}).textContent || '').replace(/\s+/g, ' ').trim() : '' },
    { id: 'heat', sel: '#pDash [data-hm]', say: ['Tap a box in the heatmap!', 'Peek inside the index — every stock is in there 🔥'] },
    { id: 'cat', sel: '#pDash [data-cat]', say: ['Press me! 👆', 'Global, Commodities, Currencies, Bonds — all hiding inside.'] },
    { id: 'bias', sel: '#pDash .jd-bias', say: ['Tap the map!', 'See why the market feels this way 🇮🇳'] },
    { id: 'calls', sel: '#pDash .dc-tile.t1', say: ['Press here for today’s calls!', 'Entry, stop-loss and targets are inside 🎯'] },
    { id: 'radar', sel: '#pDash .dc-tile.t3', say: ['Press here — Early-Mover Radar!', 'Stocks that just woke up ⚡'] },
    { id: 'stk', sel: '#pDash .dc-st', say: ['Tap this stock tile!', 'It opens a live X-ray 🔍'] },
    { id: 'fii', sel: '#pDash .fdg', say: ['FII / DII money flow!', 'Who is buying, who is selling? Look here 💰'] },
    { id: 'tv', sel: '#pDash .jd-tvb', say: ['Press here to watch live TV!', 'It keeps playing on every tab 📺'] },
    { id: 'inv', sel: '#pDash .dc-tile.t2', say: ['Press here — Investment calls!', 'Buy zone, stop-loss, targets 📈'] },
    { id: 'xr2', sel: '#pDash [data-xr]', say: ['Press here for the X-ray! 🔍', 'Everything about {n} inside!'] },
    { id: 'rf', sel: '#pDash #jdRf', say: ['Press here to refresh!', 'Fresh prices, right now ⟳'] },
  ];

  const CSS = `
  #jkRoot{position:fixed;z-index:8000;left:0;top:0;pointer-events:none;display:none;align-items:flex-end;gap:2px;transition:transform .55s cubic-bezier(.3,1.3,.5,1),opacity .3s;opacity:0;will-change:transform}
  #jkRoot.on{display:flex;opacity:1}#jkRoot.rev{flex-direction:row-reverse}
  #jkRoot .kd{width:74px;height:92px;flex:none;filter:drop-shadow(0 6px 6px rgba(0,0,0,.35));animation:jkBob 1.3s ease-in-out infinite}
  #jkRoot.pop .kd{animation:jkPop .5s cubic-bezier(.3,1.6,.5,1),jkBob 1.3s ease-in-out .5s infinite}
  #jkRoot .kd .arm{transform-box:view-box;transform-origin:78px 66px;transition:transform .45s cubic-bezier(.3,1.5,.5,1)}
  #jkRoot .kd .eye{transform-box:fill-box;transform-origin:center;animation:jkBlink 4s infinite}
  #jkRoot .kb{pointer-events:auto;position:relative;max-width:min(230px,calc(100vw - 120px));margin-bottom:46px;padding:8px 26px 8px 11px;border-radius:14px;color:#fff;font:700 12.5px/1.35 "Segoe UI",system-ui,sans-serif;background:linear-gradient(150deg,#1d3f8f,#0b1330);border:2px solid #e4c97a;box-shadow:0 8px 22px rgba(0,0,0,.45)}
  #jkRoot .kb::after{content:'';position:absolute;bottom:14px;left:-9px;border:7px solid transparent;border-right:9px solid #e4c97a;border-left:0}#jkRoot.rev .kb::after{left:auto;right:-9px;border-right:0;border-left:9px solid #e4c97a}
  #jkRoot .kb b{display:block;color:#ffe08a;font-size:13.5px}#jkRoot .kb small{display:block;font-weight:600;opacity:.92;margin-top:1px}
  #jkRoot .kb button{pointer-events:auto;cursor:pointer;font:800 10px "Segoe UI",sans-serif;color:#0b1330;background:#e4c97a;border:0;border-radius:99px;padding:2px 8px;margin:6px 6px 0 0}
  #jkRoot .kb .kx{position:absolute;right:5px;top:3px;margin:0;background:transparent;color:#cfd8f3;font-size:13px;padding:0 4px}
  #jkRing{position:fixed;z-index:7999;pointer-events:none;border-radius:14px;border:3px solid #ffd166;box-shadow:0 0 0 4px rgba(255,209,102,.28),0 0 22px 4px rgba(255,209,102,.7);opacity:0;transition:opacity .25s;animation:jkRing 1.1s ease-in-out infinite}#jkRing.on{opacity:1}
  #jkChip{position:fixed;left:10px;bottom:10px;z-index:7998;cursor:pointer;border:1px solid rgba(255,255,255,.5);border-radius:99px;padding:5px 10px;font:800 11px "Segoe UI",system-ui,sans-serif;color:#fff;background:linear-gradient(150deg,#1d3f8f,#0b1330);box-shadow:0 4px 12px rgba(0,0,0,.35);opacity:.85}#jkChip:hover{opacity:1}
  #jkRoot.fol{transition:transform .28s ease-out,opacity .25s;pointer-events:none}#jkRoot.fol .kb{pointer-events:none;margin-bottom:60px;display:none}#jkRoot.fol.hot .kb{display:block}
  #jkRoot.fol .kd{width:56px;height:70px}#jkRoot.fol .kw{display:block;flex:none}#jkRoot.fol.hot .kd{animation:jkHop .6s ease-in-out infinite}
  @keyframes jkHop{0%,100%{transform:translateY(0) scale(1,1)}15%{transform:translateY(0) scale(1.1,.88)}50%{transform:translateY(-22px) scale(.95,1.08)}85%{transform:translateY(0) scale(1.08,.9)}}
  @keyframes jkBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}@keyframes jkPop{0%{transform:scale(.2) translateY(30px)}100%{transform:none}}
  @keyframes jkBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}@keyframes jkRing{0%,100%{box-shadow:0 0 0 3px rgba(255,209,102,.25),0 0 14px 2px rgba(255,209,102,.55)}50%{box-shadow:0 0 0 8px rgba(255,209,102,.18),0 0 28px 8px rgba(255,209,102,.85)}}
  @media(prefers-reduced-motion:reduce){#jkRoot .kd,#jkRing{animation:none!important}#jkRoot{transition:none}}
  @media(max-width:700px){#jkRoot .kd{width:58px;height:72px}#jkRoot .kb{font-size:11.5px;margin-bottom:34px}}
  @media print{#jkRoot,#jkRing,#jkChip{display:none!important}}`;

  /* the kid: an original little cartoon baby — round head, a curl of hair, big blinking eyes, cheeks, gold-and-navy onesie, one pointing arm */
  const KID = `<svg class="kd" viewBox="0 0 100 124" aria-hidden="true">
    <ellipse cx="50" cy="119" rx="24" ry="4" fill="rgba(0,0,0,.25)"/>
    <ellipse cx="38" cy="112" rx="9" ry="6" fill="#ffcfa8" stroke="#d99a6c" stroke-width="1.5"/><ellipse cx="62" cy="112" rx="9" ry="6" fill="#ffcfa8" stroke="#d99a6c" stroke-width="1.5"/>
    <path d="M26 100 Q26 70 50 68 Q74 70 74 100 Q74 112 50 112 Q26 112 26 100Z" fill="#f4c542" stroke="#b8891a" stroke-width="2"/>
    <path d="M30 88 Q50 98 70 88" fill="none" stroke="#1d3f8f" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="92" r="4.5" fill="#1d3f8f"/><text x="50" y="95" text-anchor="middle" font-size="6.5" font-weight="900" fill="#ffe08a" font-family="Segoe UI,Arial">JC</text>
    <path d="M30 78 Q20 92 26 100" fill="none" stroke="#ffcfa8" stroke-width="8" stroke-linecap="round"/>
    <g class="arm" id="jkArm"><path d="M78 66 L99 66" stroke="#ffcfa8" stroke-width="8" stroke-linecap="round"/><circle cx="99" cy="66" r="6" fill="#ffcfa8" stroke="#d99a6c" stroke-width="1.5"/><path d="M103 62 L111 60" stroke="#ffcfa8" stroke-width="4" stroke-linecap="round"/></g>
    <circle cx="50" cy="38" r="31" fill="#ffd9b8" stroke="#d99a6c" stroke-width="2"/><circle cx="19.5" cy="42" r="6" fill="#ffd9b8" stroke="#d99a6c" stroke-width="2"/><circle cx="80.5" cy="42" r="6" fill="#ffd9b8" stroke="#d99a6c" stroke-width="2"/>
    <path d="M44 9 Q50 -2 58 7 Q52 8 54 14 Q47 10 44 9Z" fill="#5a3a22"/><path d="M34 14 Q40 8 46 10" fill="none" stroke="#5a3a22" stroke-width="3" stroke-linecap="round"/>
    <g class="eye"><ellipse cx="39" cy="38" rx="7" ry="8" fill="#fff" stroke="#6b4a33" stroke-width="1.5"/><circle cx="41" cy="40" r="4.4" fill="#2b1a10"/><circle cx="42.6" cy="38" r="1.5" fill="#fff"/></g>
    <g class="eye"><ellipse cx="61" cy="38" rx="7" ry="8" fill="#fff" stroke="#6b4a33" stroke-width="1.5"/><circle cx="63" cy="40" r="4.4" fill="#2b1a10"/><circle cx="64.6" cy="38" r="1.5" fill="#fff"/></g>
    <ellipse cx="29" cy="50" rx="5.5" ry="3.5" fill="#ff9aa0" opacity=".7"/><ellipse cx="71" cy="50" rx="5.5" ry="3.5" fill="#ff9aa0" opacity=".7"/>
    <path d="M42 55 Q50 63 58 55" fill="#8a2f3b" stroke="#6b1f2b" stroke-width="1.6" stroke-linejoin="round"/><path d="M45 56.5 Q50 60 55 56.5" fill="#ffb3b8"/>
  </svg>`;

  const K = { root: null, ring: null, chip: null, cur: null, timer: null, hideT: null, raf: 0, shown: 0, last: 0, since: Date.now() };

  function build() {
    if (K.root) return;
    const st = document.createElement('style'); st.id = 'jkcss'; st.textContent = CSS; document.head.appendChild(st);
    K.root = document.createElement('div'); K.root.id = 'jkRoot'; K.root.setAttribute('role', 'status'); document.body.appendChild(K.root);
    K.ring = document.createElement('div'); K.ring.id = 'jkRing'; document.body.appendChild(K.ring);
    K.chip = document.createElement('button'); K.chip.id = 'jkChip'; K.chip.type = 'button'; K.chip.addEventListener('click', toggle); document.body.appendChild(K.chip); chip();
    document.addEventListener('click', (e) => { if (K.cur && e.target.closest && !e.target.closest('#jkRoot') && K.cur.el() && K.cur.el().contains(e.target)) done(true); }, true);
    window.addEventListener('scroll', place, { passive: true }); window.addEventListener('resize', place);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && K.cur) hide(); });
    setInterval(tick, 2500);
  }
  function chip() { K.chip.textContent = pref.off ? '👶 Helper: off' : '👶 Helper: on'; K.chip.title = pref.off ? 'Bring the little helper back' : 'Switch the little helper off'; K.chip.style.display = (window.__curTab || '') === 'pDash' ? '' : 'none'; }
  function toggle() { pref.off = !pref.off; save(); chip(); if (pref.off) { hide(); fStop(); } else { K.last = 0; K.since = Date.now() - 8000; setTimeout(show, 600); } }

  const visible = (el) => { if (!el || !el.getBoundingClientRect) return false; const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 8 && r.bottom > 70 && r.top < innerHeight - 70 && r.right > 8 && r.left < innerWidth - 8; };
  const blocked = () => { const p = $('jdPop'); if (p && !p.hidden) return true; const x = $('jcxr'); if (x && x.classList.contains('on')) return true; const i = $('jcIntro'); if (i && !i.classList.contains('out')) return true; return document.hidden; };

  function choose() {
    const cand = [];
    TIPS.forEach((t) => { const els = [...document.querySelectorAll(t.sel)].filter(visible); if (els.length) cand.push({ t, els }); });
    if (!cand.length) return null;
    cand.sort((a, b) => ((pref.seen[a.t.id] || 0) - (pref.seen[b.t.id] || 0)) || (Math.random() - 0.5));
    const c = cand[Math.floor(Math.random() * Math.min(3, cand.length))], idx = Math.floor(Math.random() * c.els.length), el = c.els[idx], all = [...document.querySelectorAll(c.t.sel)];
    return { t: c.t, sel: c.t.sel, idx: all.indexOf(el), el: () => document.querySelectorAll(c.t.sel)[all.indexOf(el)] || null, first: el };
  }

  function show() {
    if (F.on) return;
    if (pref.off || K.cur || blocked() || (window.__curTab || '') !== 'pDash') return;
    const c = choose(); if (!c) return;
    K.cur = c; pref.seen[c.t.id] = (pref.seen[c.t.id] || 0) + 1; save(); K.shown++;
    let name = ''; try { name = c.t.pick ? c.t.pick(c.first) : ''; } catch (e) { }
    const l1 = c.t.say[0].replace('{n}', name), l2 = (c.t.say[1] || '').replace('{n}', name || 'this');
    K.root.innerHTML = `${KID}<div class="kb"><button class="kx" type="button" title="Close" aria-label="Close">✕</button><b>${l1}</b>${l2 ? `<small>${l2}</small>` : ''}<button class="kn" type="button">Next tip ▸</button><button class="ko" type="button">Switch me off</button></div>`;
    K.root.querySelector('.kx').onclick = () => hide(); K.root.querySelector('.kn').onclick = () => { hide(); K.last = 0; setTimeout(show, 450); }; K.root.querySelector('.ko').onclick = toggle;
    K.root.classList.add('on', 'pop'); K.ring.classList.add('on'); place(); setTimeout(() => K.root && K.root.classList.remove('pop'), 700);
    clearTimeout(K.hideT); K.hideT = setTimeout(hide, 14000);
  }
  function hide() { clearTimeout(K.hideT); K.cur = null; K.last = Date.now(); if (K.root) K.root.classList.remove('on', 'pop'); if (K.ring) K.ring.classList.remove('on'); }
  function done() { // the target was pressed: cheer, then go
    if (!K.cur) return; const b = K.root.querySelector('.kb'); if (b) b.innerHTML = '<b>Yay! 🎉</b><small>Well done!</small>'; K.ring.classList.remove('on'); clearTimeout(K.hideT); K.hideT = setTimeout(hide, 1300);
  }

  function place() {
    if (!K.cur) return; cancelAnimationFrame(K.raf);
    K.raf = requestAnimationFrame(() => {
      const el = K.cur && K.cur.el(); if (!el || !visible(el)) { if (K.cur && !el) hide(); else if (K.cur) hide(); return; }
      const r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight, kw = W < 700 ? 58 : 74, kh = W < 700 ? 72 : 92, bw = 230;
      K.ring.style.cssText = `left:${r.left - 5}px;top:${r.top - 5}px;width:${r.width + 10}px;height:${r.height + 10}px`;
      // kid goes below the target if there is room, otherwise above; bubble opens toward the roomier side
      let top = r.bottom + 12; if (top + kh > H - 8) top = Math.max(70, r.top - kh - 12);
      let left = Math.min(Math.max(8, r.left + r.width / 2 - kw / 2), W - kw - 8); const rev = left + kw + bw + 10 > W;
      K.root.classList.toggle('rev', rev);
      const bub = K.root.querySelector('.kb'), bh = bub ? bub.offsetHeight : 60; if (top < 70) top = 70;
      K.root.style.transform = `translate(${rev ? Math.max(8, left - (bub ? bub.offsetWidth : bw) - 2) : left}px,${top}px)`;
      // arm: points from the kid's shoulder to the middle of the target (rotated around the shoulder)
      const sx = left + (rev ? kw * 0.22 : kw * 0.78), sy = top + kh * 0.53, tx = r.left + r.width / 2, ty = r.top + Math.min(r.height / 2, 40);
      let ang = Math.atan2(ty - sy, tx - sx) * 180 / Math.PI; if (rev) { ang = 180 - ang; }
      const arm = $('jkArm'); if (arm) arm.style.transform = `rotate(${ang.toFixed(0)}deg)`;
      const svg = K.root.querySelector('.kd'); if (svg) svg.style.transform = rev ? 'scaleX(-1)' : '';
      void bh;
    });
  }

  function tick() {
    chip();
    if (F.on) return;
    if (K.cur) { place(); if ((window.__curTab || '') !== 'pDash' || blocked()) hide(); return; }
    if (pref.off || blocked() || (window.__curTab || '') !== 'pDash') return;
    const now = Date.now(), warm = K.since + 9000, gap = K.shown < 2 ? 22000 : 55000;
    if (now > warm && now - K.last > gap && K.shown < 14) show();
  }


  /* ---- follow mode (mouse / trackpad): Chhotu trails the pointer; when the pointer is over something pressable he hops and says "Press here!" ---- */
  const F = { on: false, x: -200, y: -200, tx: -200, ty: -200, hot: null, raf: 0, cheerT: 0, rev: false, ok: window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches };
  function fBlocked() { return pref.off || (window.__curTab || '') !== 'pDash' || blocked(); }
  function fStart() {
    if (F.on || !F.ok || fBlocked()) return; F.on = true; hide();
    K.root.innerHTML = `<div class="kw">${KID}</div><div class="kb"><b></b><small></small></div>`;
    K.root.classList.add('on', 'fol'); K.root.classList.remove('rev'); F.x = F.tx; F.y = F.ty; fLoop();
  }
  function fStop() { if (!F.on) return; F.on = false; F.hot = null; K.root.classList.remove('on', 'fol', 'hot', 'rev'); K.ring.classList.remove('on'); }
  function fHot(t) {
    if (!t || !t.closest || t.closest('#jkRoot,#jkChip')) return null;
    for (const T of TIPS) { const el = t.closest(T.sel); if (el) return { T, el }; }
    return null;
  }
  function fSay(h) {
    let name = ''; try { name = h.T.pick ? h.T.pick(h.el) : ((h.el.closest('.j3') || h.el).querySelector && (h.el.closest('.j3,.dc-st,[data-xr]') || h.el).textContent.replace(/\s+/g, ' ').trim().slice(0, 18)) || ''; } catch (e) { }
    const b = K.root.querySelector('.kb'); if (!b) return;
    b.querySelector('b').textContent = h.T.say[0].replace('{n}', name || 'this');
    b.querySelector('small').textContent = (h.T.say[1] || '').replace('{n}', name || 'this');
  }
  function fMove(e) {
    if (e.pointerType === 'touch') return; F.tx = e.clientX; F.ty = e.clientY;
    if (!F.on) { if (!fBlocked()) fStart(); return; }
    if (fBlocked()) { fStop(); return; }
    if (!F.pend) { F.pend = 1; setTimeout(fLoop, 90); }
    if (e.target === F.lt) return; F.lt = e.target; // same element as last time: nothing new to work out
    const h = fHot(e.target);
    if (h) { if (!F.hot || F.hot.el !== h.el) { F.hot = h; pref.seen[h.T.id] = (pref.seen[h.T.id] || 0) + 1; fSay(h); } }
    else F.hot = null;
  }
  function fLoop() { // one placement per pointer move (throttled), no animation-frame loop: the browser tweens the move with a CSS transition
    F.pend = 0; if (!F.on) return; F.x = F.tx; F.y = F.ty;
    const W = innerWidth, H = innerHeight, kw = 56, kh = 70, bw = F.hot ? 230 : 0;
    const rev = F.x + 22 + kw + bw + 12 > W, down = F.y + 20 + kh > H - 6;
    let left = rev ? F.x - 22 - kw : F.x + 22; let top = down ? F.y - 20 - kh : F.y + 20;
    left = Math.max(6, Math.min(W - kw - 6, left)); top = Math.max(6, top);
    const bub = K.root.querySelector('.kb'), bwid = bub && F.hot ? bub.offsetWidth : 0;
    K.root.classList.toggle('rev', rev); K.root.classList.toggle('hot', !!F.hot);
    K.root.style.transform = `translate(${rev ? Math.max(6, left - bwid - 2) : left}px,${top}px)`;
    const kwEl = K.root.querySelector('.kw'); if (kwEl) kwEl.style.transform = rev ? 'scaleX(-1)' : '';
    const arm = $('jkArm');
    if (F.hot && F.hot.el.isConnected) {
      const r = F.hot.el.getBoundingClientRect();
      K.ring.style.cssText = `left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px`; K.ring.classList.add('on');
      const sx = left + (rev ? kw * 0.22 : kw * 0.78), sy = top + kh * 0.53;
      let ang = Math.atan2(F.ty - sy, F.tx - sx) * 180 / Math.PI; if (rev) ang = 180 - ang; if (arm) arm.style.transform = `rotate(${ang.toFixed(0)}deg)`;
    } else { K.ring.classList.remove('on'); if (arm) arm.style.transform = 'rotate(-35deg)'; }
  }
  function fClick(e) {
    if (!F.on || !F.hot) return; const h = fHot(e.target); if (!h) return;
    const b = K.root.querySelector('.kb'); if (b) { b.querySelector('b').textContent = 'Yay! 🎉'; b.querySelector('small').textContent = 'Well done!'; }
    F.hot = null; clearTimeout(F.cheerT); K.root.classList.add('hot'); F.cheerT = setTimeout(() => K.root.classList.remove('hot'), 1100);
    if (b) b.style.display = 'block'; setTimeout(() => { if (b) b.style.display = ''; }, 1100);
  }
  document.addEventListener('pointermove', fMove, { passive: true });
  document.addEventListener('click', fClick, true);
  document.addEventListener('mouseleave', () => { if (F.on) { K.root.style.opacity = 0; F.hot = null; } });
  document.addEventListener('mouseenter', () => { if (K.root) K.root.style.opacity = ''; });
  setInterval(() => { if (!K.root) return; if (F.on && fBlocked()) fStop(); }, 1000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  window.jcKid = { show, hide, toggle, state: K };
})();
