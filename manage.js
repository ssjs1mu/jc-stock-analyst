/* Trade desk — (1) manages every Early-Mover Radar position: trails the stop and extends targets as price breaks out,
   alerts to BOOK PROFIT when a run is tiring and to REVERSE when it fails; (2) watches Nifty / Bank Nifty / Sensex for
   intraday trend reversals; (3) reads PCR, VIX, crude and bond yields into a market-bias + carry/exit view.
   Rule-based and mechanical — not a forecast and not advice. Alerts only fire while this page is open. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v) => (num(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  const sg = (v, d) => (num(v) ? (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) : '—');
  const ist = () => new Date(Date.now() + 19800000);
  const istMin = () => { const d = ist(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const istDow = () => ist().getUTCDay();
  const istToday = () => ist().toISOString().slice(0, 10);
  const hhmm = (t) => new Date(t + 19800000).toISOString().slice(11, 16);
  const LS = 'jc_mgr_v1';
  const LAD = [1.5, 3, 5, 7.5, 10, 12.5, 15, 20, 25]; // target ladder, % above entry (T1..T3 are the radar's own; T4+ are the extensions)
  const IDX = [['^NSEI', 'Nifty 50'], ['^NSEBANK', 'Bank Nifty'], ['^BSESN', 'Sensex']];
  const M = { pos: {}, log: [], idx: {}, mac: {}, pcr: null, in10: null, last: 0, lastR: 0, err: '', busy: false, built: false };
  const live = () => { const m = istMin(), d = istDow(); return d >= 1 && d <= 5 && m >= 555 && m <= 935; };

  function load() { try { const c = JSON.parse(localStorage.getItem(LS) || 'null'); if (c && c.d === istToday()) { M.pos = c.pos || {}; M.log = c.log || []; M.idx = c.idx || {}; } } catch (e) { } }
  function save() { try { localStorage.setItem(LS, JSON.stringify({ d: istToday(), pos: M.pos, log: M.log.slice(-120), idx: M.idx })); } catch (e) { } }
  async function be(qs, ms) { const u = getBackend(); if (!u) throw new Error('Data backend not connected'); return JSON.parse(await fetchWithTimeout(beUrl(u, qs), ms || 20000)); }

  /* ---------- alert delivery: popup + beep + desktop notification + timestamped log ---------- */
  function beep(sev) { try { if (window.jcRadar && window.jcRadar.state.mute) return; const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const c = M.ac || (M.ac = new C()); (sev === 'rev' ? [0, 0.15, 0.3] : [0, 0.2]).forEach((d, i) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = sev === 'rev' ? (i % 2 ? 520 : 700) : 980; g.gain.value = 0.08; o.connect(g); g.connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + 0.12); }); } catch (e) { } }
  function box() { let b = $('jcMgrToasts'); if (b) return b; const st = document.createElement('style'); st.textContent = '#jcMgrToasts{position:fixed;top:12px;left:12px;z-index:99994;display:flex;flex-direction:column;gap:8px;width:min(380px,calc(100vw - 24px))}.mt{background:#0a1736;color:#fff;border:1px solid #2b4a9a;border-left:6px solid #e0a100;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.45);padding:10px 12px;font-size:13px;animation:mtin .25s ease-out}.mt.rev{border-left-color:#e03a3a}.mt.up{border-left-color:#12a05a}.mt-h{display:flex;gap:8px;align-items:center}.mt-h b{font-size:13px;letter-spacing:.3px}.mt-h span{margin-left:auto;font-size:11px;opacity:.7}.mt-x{background:none;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1}.mt-w{margin:5px 0;opacity:.92;line-height:1.4}.mt-g{display:flex;gap:10px;flex-wrap:wrap;font-size:12px}.mt-g i{font-style:normal;opacity:.65;margin-right:3px}@keyframes mtin{from{transform:translateX(-30px);opacity:0}to{transform:none;opacity:1}}'; document.head.appendChild(st); b = document.createElement('div'); b.id = 'jcMgrToasts'; document.body.appendChild(b); return b; }
  function alertUser(o) { // o: {who, kind, sev:'rev'|'act'|'up', title, msg, lv:[[label,val]]}
    o.t = Date.now(); M.log.push(o); save();
    try {
      const b = box(); while (b.children.length >= 4) b.removeChild(b.firstChild);
      const d = document.createElement('div'); d.className = 'mt ' + (o.sev === 'rev' ? 'rev' : o.sev === 'up' ? 'up' : '');
      d.innerHTML = `<div class="mt-h"><b>${E(o.title)}</b><span>${hhmm(o.t)} IST</span><button class="mt-x" aria-label="Dismiss">×</button></div><div class="mt-w">${E(o.msg)}</div><div class="mt-g">${(o.lv || []).map((x) => `<div><i>${E(x[0])}</i><b>${E(x[1])}</b></div>`).join('')}</div>`;
      d.querySelector('.mt-x').onclick = () => d.remove(); b.appendChild(d); setTimeout(() => { try { d.remove(); } catch (e) { } }, 150000);
    } catch (e) { }
    beep(o.sev);
    try { if (window.Notification && Notification.permission === 'granted') new Notification(o.title, { body: o.msg + (o.lv ? ' · ' + o.lv.map((x) => x[0] + ' ' + x[1]).join(' · ') : ''), tag: o.who + o.kind + o.t }); } catch (e) { }
    paint();
  }

  /* ---------- 1. radar positions: trail, extend, book profit, reverse ---------- */
  function ladder(entry) { return LAD.map((p) => entry * (1 + p / 100)); }
  function runPos() {
    const R = window.jcRadar && window.jcRadar.state; if (!R || !R.q) return;
    R.alerts.forEach((a) => {
      if (a.kind === 'WATCH' && !a.go) return; // not triggered yet
      const q = R.q[a.sym]; if (!q || !num(q[0])) return; const px = q[0], dh = q[3], dl = q[4];
      let P = M.pos[a.id]; if (!P) P = M.pos[a.id] = { sym: a.sym, entry: a.entry, hi: Math.max(a.entry, px), tier: 0, trail: a.sl, closed: '', booked: 0, rev: null, since: Date.now() };
      if (P.closed === 'STOP' || P.closed === 'TRAIL') return;
      const L = ladder(a.entry);
      if (px > P.hi) P.hi = px;
      if (num(dh) && dh > P.hi && dh <= px * 1.03 && Date.now() - P.since > 120000) P.hi = dh; // day-high ticks between sweeps (only once the position has aged)
      P.px = px;
      let tier = 0; while (tier < L.length && P.hi >= L[tier]) tier++;
      if (tier > P.tier) { // new target reached → raise the stop, and push the targets further once past T3
        const old = P.trail; P.trail = Math.max(P.trail, tier === 1 ? a.entry * 1.001 : L[tier - 2]); P.tier = tier; P.booked = 0;
        const ext = tier >= 3, nx = L[Math.min(tier, L.length - 1)], nx2 = L[Math.min(tier + 1, L.length - 1)];
        alertUser({ who: a.sym, kind: ext ? 'EXTEND' : 'TRAIL', sev: 'up', title: `${ext ? '🚀 TARGETS EXTENDED' : '🔼 TRAIL STOP'} — ${a.sym}`, msg: ext ? `${a.sym} broke through T${Math.min(tier, 3)} (+${LAD[tier - 1]} %). Hold the runner, stop raised, new targets set higher.` : `${a.sym} reached T${tier} (+${LAD[tier - 1]} %). Stop moved up to protect the gain.`, lv: [['LTP', f2(px)], ['NEW STOP', f2(P.trail)], ['NEXT TGT', f2(nx)], ['THEN', f2(nx2)], ['OLD STOP', f2(old)]] });
      }
      const gain = P.hi - a.entry, giveback = gain > 0 ? (P.hi - px) / gain : 0, offHigh = (P.hi - px) / P.hi * 100;
      if (P.tier >= 1 && px <= P.trail) { // trailing stop hit → exit; if it also gave back most of the run, flag the reversal
        P.closed = 'TRAIL'; P.rev = revLevels(px, P.hi);
        alertUser({ who: a.sym, kind: 'EXIT', sev: 'rev', title: `🔻 BOOK PROFIT & REVERSE — ${a.sym}`, msg: `${a.sym} fell back through its trailing stop after a ${((P.hi / a.entry - 1) * 100).toFixed(1)} % run (peak ${f2(P.hi)}). Exit the long now. Aggressive traders may reverse short (F&O stocks / MIS) with a tight stop above the peak.`, lv: [['EXIT', f2(px)], ['SHORT BELOW', f2(P.rev.e)], ['STOP', f2(P.rev.sl)], ['T1', f2(P.rev.t[0])], ['T2', f2(P.rev.t[1])], ['T3', f2(P.rev.t[2])]] });
        return;
      }
      if (P.tier >= 1 && giveback >= 0.35 && offHigh >= 0.8 && !P.booked) { // tiring: gave back > a third of the run and sits clear of the high
        P.booked = 1; P.tired = true;
        alertUser({ who: a.sym, kind: 'TIRED', sev: 'act', title: `⚠️ BOOK PROFIT — ${a.sym} tiring`, msg: `${a.sym} has given back ${(giveback * 100).toFixed(0)} % of its run from the ${f2(P.hi)} peak (−${offHigh.toFixed(1)} % off high). Book at least half now; the rest stays only above the trail.`, lv: [['LTP', f2(px)], ['PEAK', f2(P.hi)], ['TRAIL STOP', f2(P.trail)], ['IF IT LOSES', f2(P.trail)]] });
      }
      if (P.tired && px > P.hi * 0.997) { P.tired = false; P.booked = 0; } // new high → re-arm
      if (P.tier === 0 && px <= a.sl && P.closed !== 'STOP') { P.closed = 'STOP'; save(); }
    });
    save();
  }
  function revLevels(px, hi) { const sl = Math.min(hi * 1.002, px * 1.025), r = Math.max(sl - px, px * 0.004); return { e: px, sl, t: [px - r, px - 2 * r, px - 3 * r] }; }

  /* ---------- 2. index trend monitor ---------- */
  function runIdx() {
    IDX.forEach(([s, nm]) => {
      const q = M.mac[s]; if (!q || !num(q[0]) || !num(q[3]) || !num(q[4]) || !num(q[1])) return; const [p, pc, o, h, l] = q, rg = h - l;
      const I = M.idx[s] || (M.idx[s] = { upTier: 0, dnTier: 0, revUp: 0, revDn: 0 });
      const upPct = (h - pc) / pc * 100, dnPct = (pc - l) / pc * 100;
      const upT = Math.floor(upPct / 0.5), dnT = Math.floor(dnPct / 0.5);
      if (upT >= 1 && upT > I.upTier && p >= h - rg * 0.15) { I.upTier = upT; const tr = h - Math.max(rg * 0.4, h * 0.0035); alertUser({ who: nm, kind: 'TREND-UP', sev: 'up', title: `📈 ${nm} breaking higher`, msg: `${nm} is ${sg((p / pc - 1) * 100)} % and pressing the day high. Trail longs; stop is below the trail level, targets move up.`, lv: [['LTP', f2(p)], ['DAY HIGH', f2(h)], ['TRAIL', f2(tr)], ['NEXT', f2(h * 1.004)], ['THEN', f2(h * 1.008)]] }); }
      if (dnT >= 1 && dnT > I.dnTier && p <= l + rg * 0.15) { I.dnTier = dnT; const tr = l + Math.max(rg * 0.4, l * 0.0035); alertUser({ who: nm, kind: 'TREND-DN', sev: 'act', title: `📉 ${nm} breaking lower`, msg: `${nm} is ${sg((p / pc - 1) * 100)} % and pressing the day low. Longs at risk; shorts can trail above the trail level.`, lv: [['LTP', f2(p)], ['DAY LOW', f2(l)], ['TRAIL (shorts)', f2(tr)], ['NEXT', f2(l * 0.996)], ['THEN', f2(l * 0.992)]] }); }
      if (upPct >= 0.6 && rg > 0 && (h - p) / rg >= 0.5 && p < o && I.revUp < upT + 1) { I.revUp = upT + 1; const rv = revLevels(p, h); alertUser({ who: nm, kind: 'REV-DN', sev: 'rev', title: `🔄 ${nm}: up-trend reversing`, msg: `${nm} rallied to ${f2(h)} (+${upPct.toFixed(2)} %) but has given back half the day’s range and is below the open. Book index longs / tighten; bears can trade the reversal.`, lv: [['LTP', f2(p)], ['SELL BELOW', f2(rv.e)], ['STOP', f2(rv.sl)], ['T1', f2(rv.t[0])], ['T2', f2(rv.t[1])], ['T3', f2(rv.t[2])]] }); }
      if (dnPct >= 0.6 && rg > 0 && (p - l) / rg >= 0.5 && p > o && I.revDn < dnT + 1) { I.revDn = dnT + 1; const sl = Math.max(l * 0.998, p * 0.975), r = Math.max(p - sl, p * 0.004); alertUser({ who: nm, kind: 'REV-UP', sev: 'up', title: `🔄 ${nm}: down-trend reversing`, msg: `${nm} fell to ${f2(l)} (−${dnPct.toFixed(2)} %) but has recovered half the day’s range and is above the open. Cover shorts / bulls can look for a bounce.`, lv: [['LTP', f2(p)], ['BUY ABOVE', f2(p)], ['STOP', f2(sl)], ['T1', f2(p + r)], ['T2', f2(p + 2 * r)], ['T3', f2(p + 3 * r)]] }); }
    });
    save();
  }

  /* ---------- 3. data: indices, VIX, crude, yields, PCR ---------- */
  async function fetchMacro(force) {
    if (M.busy) return; if (!force && Date.now() - M.last < (live() ? 55000 : 300000)) return; M.busy = true;
    try {
      const syms = IDX.map((x) => x[0]).concat(['^INDIAVIX', 'BZ=F', '^TNX', 'USDINR=X']);
      const j = await be('action=liveq&symbols=' + encodeURIComponent(syms.join(',')), 25000);
      if (j && j.ok && j.q) { Object.keys(j.q).forEach((k) => { M.mac[k] = j.q[k]; }); M.last = Date.now(); M.err = ''; }
      else M.err = 'Index/macro quotes unavailable';
    } catch (e) { M.err = 'Macro quotes: ' + ((e && e.message) || e); }
    try { if (!M.in10 || Date.now() - M.in10.at > 600000) { const j = await be('action=in10y', 14000); if (j && !j.err && num(j.p)) M.in10 = { p: j.p, pc: j.pc, at: Date.now() }; } } catch (e) { }
    try { if (!M.pcr || Date.now() - M.pcr.at > 180000) { const j = await be('action=pcr', 25000); if (j && !j.err && num(j.pcr)) { M.pcr = { v: j.pcr, ce: j.ce, pe: j.pe, expiry: j.expiry, ts: j.ts, src: j.src || 'NSE', at: Date.now() }; M.pcrErr = ''; } else M.pcrErr = (j && j.err) || 'no PCR'; } } catch (e) { M.pcrErr = (e && e.message) || String(e); }
    M.busy = false; runIdx(); paint();
  }
  function pcrNow() {
    if (M.pcr) return { v: M.pcr.v, note: 'Nifty option chain, ' + (M.pcr.expiry ? M.pcr.expiry + ' expiry, ' : '') + M.pcr.src + (M.pcr.ts ? ' · ' + M.pcr.ts : '') };
    const S = window.__jdS; const x = S && S.x && S.x.pcr; if (x && num(x.pcr)) return { v: x.pcr, note: 'dashboard feed' };
    try { const m = JSON.parse(localStorage.getItem('jd_manual_v1') || 'null'); if (m && m.pcr && num(m.pcr.v)) return { v: m.pcr.v, note: 'manually entered' }; } catch (e) { }
    return null;
  }

  /* ---------- outlook: PCR + VIX + crude + bonds → bias, then carry/exit ---------- */
  function outlook() {
    const F = [], pc = pcrNow(); let sc = 0;
    if (pc) { const v = pc.v, s = v >= 1.2 ? 1 : v <= 0.8 ? -1 : 0; sc += s; F.push(['PCR (Nifty)', v.toFixed(2), s, v >= 1.6 ? 'very high — put-writers are crowded; supportive, but a break of support can unwind fast' : v >= 1.2 ? 'more puts written than calls — option sellers are defending lower levels' : v <= 0.8 ? 'call-heavy — option sellers expect a cap on the upside' : 'balanced', pc.note]); } else F.push(['PCR (Nifty)', '—', 0, 'not available right now', 'enter manually on the dashboard if needed']);
    const vx = M.mac['^INDIAVIX']; if (vx && num(vx[0]) && num(vx[1])) { const ch = (vx[0] / vx[1] - 1) * 100, s = vx[0] >= 20 || ch >= 5 ? -1 : ch <= -5 ? 1 : 0; sc += s; F.push(['India VIX', vx[0].toFixed(2) + ' (' + sg(ch, 1) + ' %)', s, vx[0] >= 20 ? 'elevated fear — wide swings, size down' : ch >= 5 ? 'jumping — hedging demand rising' : ch <= -5 ? 'falling — fear easing' : vx[0] < 13 ? 'very low — complacent; cheap hedges' : 'steady', 'Yahoo ^INDIAVIX']); }
    const cr = M.mac['BZ=F']; if (cr && num(cr[0]) && num(cr[1])) { const ch = (cr[0] / cr[1] - 1) * 100, s = ch >= 1.5 ? -1 : ch <= -1.5 ? 1 : 0; sc += s; F.push(['Brent crude', '$' + cr[0].toFixed(2) + ' (' + sg(ch, 1) + ' %)', s, ch >= 1.5 ? 'rising — raises India’s import bill, inflation and OMC/paint/aviation costs' : ch <= -1.5 ? 'falling — a tailwind for India’s margins and the rupee' : 'little changed', 'Yahoo BZ=F']); }
    const us = M.mac['^TNX']; let usbp = null; if (us && num(us[0]) && num(us[1])) { const k = us[0] > 20 ? 0.1 : 1; usbp = (us[0] - us[1]) * k * 100; }
    const inb = M.in10 && num(M.in10.p) && num(M.in10.pc) ? (M.in10.p - M.in10.pc) * 100 : null;
    if (inb != null || usbp != null) { const s = (inb != null && inb >= 3) || (usbp != null && usbp >= 5) ? -1 : (inb != null && inb <= -3) || (usbp != null && usbp <= -5) ? 1 : 0; sc += s; F.push(['Bond yields', (inb != null ? 'IN 10Y ' + M.in10.p.toFixed(3) + '% (' + sg(inb, 1) + ' bp)' : '') + (inb != null && usbp != null ? ' · ' : '') + (usbp != null ? 'US 10Y ' + ((us[0] > 20 ? us[0] / 10 : us[0])).toFixed(2) + '% (' + sg(usbp, 1) + ' bp)' : ''), s, s < 0 ? 'yields rising — pressure on valuations and FII flows' : s > 0 ? 'yields easing — supportive for equities' : 'steady', 'Yahoo ^TNX · India 10Y feed']); }
    const n = M.mac['^NSEI']; let trend = null; if (n && num(n[0]) && num(n[1])) { const ch = (n[0] / n[1] - 1) * 100; trend = { ch, p: n[0], h: n[3], l: n[4], o: n[2] }; }
    const lab = sc >= 2 ? ['SUPPORTIVE', 'g', 'Positioning, volatility and macro all lean the same way — the next move is more likely up/steady than a sharp fall.', 'Carry positions that are above their trail. Fresh longs only on dips with a stop; do not chase after 2:30 PM.'] : sc === 1 ? ['MILDLY SUPPORTIVE', 'g', 'Slight tilt to the upside, not a strong one.', 'Carry positions that have already hit T1 and sit above the trail; exit the rest if they have not worked by 3:00 PM.'] : sc === 0 ? ['NEUTRAL / MIXED', 'a', 'Signals offset each other — expect range-bound, news-driven moves.', 'Carry only positions already in profit above their trail, in reduced size. Square off intraday longs before 3:15 PM.'] : sc === -1 ? ['MILDLY WEAK', 'a', 'A slight tilt to the downside.', 'Reduce: exit weak/tiring positions now; carry overnight only the strongest, small, with a hard stop. Consider a hedge.'] : ['RISK-OFF', 'r', 'Fear, rates and/or crude are moving against equities.', 'Exit intraday longs before the close, do not carry overnight, keep cash or hedge with index puts / reverse-trade only on a confirmed break.'];
    return { sc, F, lab, trend, pc };
  }
  function verdict(P, o) {
    if (P.closed === 'TRAIL') return ['EXIT', 'r', 'trail stop hit'];
    if (P.closed === 'STOP') return ['EXIT', 'r', 'stop-loss hit'];
    const strong = P.tier >= 1 && P.px > P.trail, mins = istMin();
    if (P.tired) return ['BOOK / EXIT', 'a', 'tiring — book profit, don’t carry'];
    if (o.sc >= 2 && strong) return ['CARRY', 'g', 'above trail; market backdrop supportive'];
    if (o.sc >= 0 && strong) return ['CARRY (small)', 'g', 'in profit above trail — keep the stop'];
    if (o.sc <= -1 && strong) return ['BOOK MOST', 'a', 'in profit, backdrop weak — keep only a runner'];
    if (P.tier === 0) return mins >= 870 ? ['EXIT', 'a', 'no target hit yet — square off before 3:15'] : ['INTRADAY ONLY', 'a', 'no target hit yet — don’t carry overnight'];
    return ['REVIEW', 'a', ''];
  }

  /* ---------- panel ---------- */
  function paint() {
    const el = $('clMgr'); if (!el) return; const o = outlook(), R = window.jcRadar && window.jcRadar.state;
    const rows = R ? R.alerts.filter((a) => M.pos[a.id] && !(a.kind === 'WATCH' && !a.go)).slice().reverse() : [];
    const col = (c) => ({ g: '#12a05a', r: '#e03a3a', a: '#c98a00' }[c] || '#17388a');
    const fac = o.F.map((f) => `<tr><td>${E(f[0])}</td><td><b>${E(f[1])}</b></td><td style="color:${f[2] > 0 ? '#12a05a' : f[2] < 0 ? '#e03a3a' : '#7a869f'};font-weight:700">${f[2] > 0 ? '▲ +1' : f[2] < 0 ? '▼ −1' : '● 0'}</td><td>${E(f[3])}<div class="tm-src">${E(f[4])}</div></td></tr>`).join('');
    const idxR = IDX.map(([s, nm]) => { const q = M.mac[s]; if (!q || !num(q[0])) return `<tr><td>${nm}</td><td colspan="5">—</td></tr>`; const [p, pc, op, h, l] = q, ch = (p / pc - 1) * 100, rg = h - l, st = ch >= 0.6 && rg > 0 && (h - p) / rg >= 0.5 && p < op ? ['UP-TREND FAILING', 'r'] : ch <= -0.6 && rg > 0 && (p - l) / rg >= 0.5 && p > op ? ['DOWN-TREND FAILING', 'g'] : (h - pc) / pc * 100 >= 0.5 && p >= h - rg * 0.15 ? ['BREAKING HIGHER', 'g'] : (pc - l) / pc * 100 >= 0.5 && p <= l + rg * 0.15 ? ['BREAKING LOWER', 'r'] : ['RANGE', 'a']; return `<tr><td><b>${nm}</b></td><td>${f2(p)}</td><td style="color:${ch >= 0 ? '#12a05a' : '#e03a3a'}">${sg(ch)} %</td><td>${f2(l)} – ${f2(h)}</td><td style="color:${col(st[1])};font-weight:700">${st[0]}</td><td>${rg > 0 ? Math.round((p - l) / rg * 100) + ' % of day range' : '—'}</td></tr>`; }).join('');
    const posT = rows.length ? `<div class="bf-sc"><table class="bf-t"><thead><tr><th>Stock</th><th>Entry</th><th>LTP</th><th>Peak</th><th>Gain</th><th>Trail stop</th><th>Next targets</th><th>Reverse (if failed)</th><th>Carry / exit</th></tr></thead><tbody>${rows.map((a) => { const P = M.pos[a.id], L = ladder(a.entry), v = verdict(P, o), g = num(P.px) ? (P.px / a.entry - 1) * 100 : null; return `<tr><td><a href="javascript:void(0)" onclick="loadSymbol('${E(a.sym)}')"><b>${E(a.sym)}</b></a><div class="tm-src">since ${hhmm(a.t)}</div></td><td>${f2(a.entry)}</td><td>${f2(P.px)}</td><td>${f2(P.hi)}</td><td style="color:${g >= 0 ? '#12a05a' : '#e03a3a'}">${sg(g)} %</td><td><b>${f2(P.trail)}</b><div class="tm-src">${P.tier ? 'T' + P.tier + ' passed' : 'initial stop'}</div></td><td>${L.slice(P.tier, P.tier + 2).map(f2).join(' · ')}</td><td>${P.rev ? 'short ' + f2(P.rev.e) + ' · SL ' + f2(P.rev.sl) + '<div class="tm-src">T ' + P.rev.t.map(f2).join(' / ') + '</div>' : '—'}</td><td style="color:${col(v[1])};font-weight:700">${v[0]}<div class="tm-src" style="font-weight:400">${E(v[2])}</div></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="tm-empty">No open radar positions yet — they appear here the moment the radar raises an alert, and are managed automatically (trail, extend, book profit, reverse).</div>';
    const log = M.log.slice().reverse();
    const logT = log.length ? `<div class="bf-sc" style="max-height:300px"><table class="bf-t"><thead><tr><th>Time</th><th>Who</th><th>Alert</th><th>What to do</th><th>Levels</th></tr></thead><tbody>${log.map((x) => `<tr><td>${hhmm(x.t)}${Date.now() - x.t < 120000 ? ' <span class="rd-nw">NEW</span>' : ''}</td><td><b>${E(x.who)}</b></td><td>${E(x.title)}</td><td>${E(x.msg)}</td><td>${(x.lv || []).map((y) => '<span class="tm-lv"><i>' + E(y[0]) + '</i> ' + E(y[1]) + '</span>').join(' ')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="tm-empty">No trade-management or reversal alerts yet today.</div>';
    el.innerHTML = `<section class="tm"><div class="tm-h"><div><h3>🧭 Trade desk — manage, reverse &amp; market bias</h3><small>Trails stops and lifts targets on breakouts · flags tiring moves to book profit and reverse · watches Nifty / Bank Nifty / Sensex for trend reversals · reads PCR, VIX, crude and bonds. Mechanical rules, not a forecast or advice. Alerts fire only while this page is open.</small></div><div class="tm-b" style="background:${col(o.lab[1])}"><i>MARKET BIAS</i><b>${o.lab[0]}</b><span>score ${o.sc > 0 ? '+' : ''}${o.sc} of ±4</span></div></div>`
      + (M.err ? `<div class="cl-err">${E(M.err)}</div>` : '')
      + `<div class="tm-act"><b>Next move:</b> ${E(o.lab[2])}${o.trend ? ` Nifty is ${sg(o.trend.ch)} % at ${f2(o.trend.p)}.` : ''}<br><b>Positions:</b> ${E(o.lab[3])}</div>`
      + `<h4>What is driving the bias</h4><div class="bf-sc"><table class="bf-t"><thead><tr><th>Factor</th><th>Reading</th><th>Vote</th><th>Meaning</th></tr></thead><tbody>${fac}</tbody></table></div>`
      + `<h4>Index trend monitor</h4><div class="bf-sc"><table class="bf-t"><thead><tr><th>Index</th><th>LTP</th><th>Chg</th><th>Day low – high</th><th>State</th><th>Position in range</th></tr></thead><tbody>${idxR}</tbody></table></div>`
      + `<h4>Open radar positions — trail &amp; carry / exit</h4>${posT}<h4>Alert log</h4>${logT}`
      + `<div class="bf-note">Rules — <b>Trail:</b> after T1 the stop moves to entry, after T2 to T1, after T3 to T2, and so on; past T3 the targets keep stepping up (+7.5 %, +10 %, +12.5 %…). <b>Book profit:</b> price gives back more than a third of the run and sits ≥ 0.8 % off the peak. <b>Reverse:</b> trailing stop breaks — short below that level, stop just above the peak, targets at 1R / 2R / 3R. <b>Index reversal:</b> a ≥ 0.6 % move that gives back half the day’s range and crosses the open. <b>Bias score:</b> PCR ≥ 1.2 / ≤ 0.8, VIX ≥ 20 or ±5 %, Brent ±1.5 %, bond yields ±3 bp (India) / ±5 bp (US), each worth ±1. PCR is for the nearest weekly expiry. Shorting in cash is intraday-only (MIS); use futures/options for anything held.</div></section>`;
  }
  const CSS = '.tm{margin:10px 0}.tm-h{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:linear-gradient(120deg,#0d2b5e,#5a1e6e);color:#fff;border-radius:14px;padding:12px 16px;margin-bottom:8px}.tm-h>div:first-child{flex:1;min-width:240px}.tm-h h3{margin:0 0 3px;font-size:19px}.tm-h small{opacity:.85}.tm-b{border-radius:12px;padding:8px 16px;text-align:center;color:#fff;min-width:150px}.tm-b i{display:block;font-style:normal;font-size:10px;letter-spacing:1px;opacity:.85}.tm-b b{display:block;font-size:17px}.tm-b span{font-size:11px;opacity:.9}.tm-act{background:#fff7e0;border:1px solid #f0d58a;border-radius:10px;padding:9px 12px;margin:6px 0;line-height:1.5;color:#3a2e00}.tm h4{margin:12px 0 4px;font-size:14px}.tm-src{font-size:10.5px;color:#7a869f}.tm-empty{padding:10px;color:#7a869f;font-size:13px}.tm-lv{display:inline-block;background:#eef2fb;border-radius:6px;padding:1px 6px;margin:1px;font-size:11.5px;white-space:nowrap}.tm-lv i{font-style:normal;color:#7a869f}@media(prefers-color-scheme:dark){.tm-act{background:#2a2410;border-color:#6b5a1c;color:#f3e3a4}.tm-lv{background:#1b2540}}';
  function build() {
    if (M.built) return; M.built = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); load();
    setInterval(() => { try { runPos(); } catch (e) { } if (live() || Date.now() - M.last > 300000) fetchMacro(false); }, 30000);
    setTimeout(() => { fetchMacro(true); }, 9000);
  }
  window.jcMgr = { run: () => { try { runPos(); } catch (e) { } paint(); }, paint, refresh: () => fetchMacro(true), state: M, outlook, test: () => alertUser({ who: 'TEST', kind: 'TEST', sev: 'rev', title: '🔻 BOOK PROFIT & REVERSE — SAMPLE', msg: 'sample alert — this is how a real trade-management alert will look', lv: [['EXIT', '500.00'], ['SHORT BELOW', '500.00'], ['STOP', '508.00'], ['T1', '492.00']] }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
