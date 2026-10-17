/* Dashboard "Live stock signals" table: day high/low, 52-week high/low, pivot hits, breakouts, volume blasters and rate (price) blasters
   across the Nifty 100 + MidSmallCap 400 universe, colour-coded. Uses the quotes the Early-Mover Radar already pulls every minute
   (one batched call), plus yesterday's high/low/close and 20-day range fetched once a day for the pivot and breakout levels. */
(function () {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v) => (num(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  const ist = () => new Date(Date.now() + 19800000);
  const istMin = () => { const d = ist(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const istToday = () => ist().toISOString().slice(0, 10);
  const dateOf = (t) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);
  const LSB = 'jc_sigbase_v1';
  const LSF = 'jc_sigfirst_v1';
  const G = { base: {}, baseAt: '', baseBusy: false, q: {}, qAt: 0, qBusy: false, f: 'ALL', ver: 0, seen: -1, sort: 'time', first: {}, firstLoaded: false, sigAt: 0 };
  const hhmm = (t) => new Date(t + 19800000).toISOString().slice(11, 16);
  const hhmmss = (t) => new Date(t + 19800000).toISOString().slice(11, 19);
  function loadFirst() { if (G.firstLoaded) return; G.firstLoaded = true; try { const c = JSON.parse(localStorage.getItem(LSF) || 'null'); if (c && c.d === istToday()) G.first = c.m || {}; } catch (e) { } }
  function saveFirst() { try { localStorage.setItem(LSF, JSON.stringify({ d: istToday(), m: G.first })); } catch (e) { } }
  const FILT = [['ALL', 'All'], ['DH', 'Day high'], ['DL', 'Day low'], ['WH', '52W high'], ['WL', '52W low'], ['PV', 'Pivot'], ['BO', 'Breakout'], ['VB', 'Volume blast'], ['RB', 'Rate blast']];
  async function be(qs, ms) { const u = getBackend(); if (!u) throw new Error('no backend'); return JSON.parse(await fetchWithTimeout(beUrl(u, qs), ms || 45000)); }

  /* yesterday's levels + 20-day range, once per day */
  async function loadBase() {
    if (G.baseBusy || (G.baseTry && Date.now() - G.baseTry < 90000)) return; try { const c = JSON.parse(localStorage.getItem(LSB) || 'null'); if (c && c.d === istToday() && c.b) { G.base = c.b; G.baseAt = c.d; return; } } catch (e) { }
    if (G.baseAt === istToday()) return; G.baseBusy = true;
    try {
      const syms = (window.jcUni ? window.jcUni() : []).map((s) => s + '.NS'), bt = []; for (let i = 0; i < syms.length; i += 30) bt.push(syms.slice(i, i + 30)); const today = istToday(), out = {}; let i = 0;
      await Promise.all([0, 1, 2].map(async () => { while (i < bt.length) { const b = bt[i++]; try { const j = await be('action=dailyb&range=1mo&symbols=' + encodeURIComponent(b.join(',')), 60000); Object.keys(j.bars || {}).forEach((k) => { const x = j.bars[k]; let n = x.t.length - 1; if (dateOf(x.t[n]) === today) n--; if (n < 5) return; let hi = 0, lo = 1e12; for (let q = Math.max(0, n - 19); q <= n; q++) { hi = Math.max(hi, x.h[q]); lo = Math.min(lo, x.l[q]); } out[k.replace(/\.NS$/, '')] = [x.h[n], x.l[n], x.c[n], hi, lo]; }); } catch (e) { } } }));
      if (Object.keys(out).length) { G.base = out; G.baseAt = today; try { localStorage.setItem(LSB, JSON.stringify({ d: today, b: out })); } catch (e) { } }
    } finally { G.baseBusy = false; G.baseTry = Date.now(); if (G.baseAt === istToday()) bump(); }
  }
  /* quotes: reuse the radar's minute sweep; fetch on our own once if it has not run (market closed / just opened the page) */
  async function loadQ() {
    const R = window.jcRadar && window.jcRadar.state; if (R && R.last && Object.keys(R.q).length) { G.q = R.q; G.qAt = R.last; return; }
    if (G.qBusy || (G.qAt && Date.now() - G.qAt < 120000) || (G.qTry && Date.now() - G.qTry < 90000)) return; G.qBusy = true; const had = G.qAt;
    try { const yf = (window.jcUni ? window.jcUni() : []).map((s) => s + '.NS'), q = {}; const rs = await Promise.all([yf.slice(0, 260), yf.slice(260)].filter((p) => p.length).map((p) => be('action=liveq&symbols=' + encodeURIComponent(p.join(',')), 45000))); rs.forEach((j) => { if (j && j.ok) Object.keys(j.q).forEach((k) => { q[k.replace(/\.NS$/, '')] = j.q[k]; }); }); if (Object.keys(q).length) { G.q = q; G.qAt = Date.now(); } } catch (e) { } finally { G.qBusy = false; G.qTry = Date.now(); if (G.qAt !== had) bump(); }
  }
  function bump() { G.ver++; try { if (window.__curTab === 'pDash' && window.jdRepaint) window.jdRepaint(); } catch (e) { } }

  /* ---------- the signals ---------- */
  function signals() {
    const m = istMin(), el = Math.max(1, Math.min(375, m - 555)), frac = m >= 555 && m <= 930 ? Math.max(el / 375, 0.06) : 1, out = [];
    Object.keys(G.q).forEach((s) => {
      const a = G.q[s], px = a[0], pc = a[1], o = a[2], h = a[3], l = a[4], v = a[5], av = a[6], wh = a[8], wl = a[9]; if (!(px > 50 && pc > 0 && av > 1e5)) return;
      const chg = (px / pc - 1) * 100, pace = v / (av * frac), b = G.base[s], tags = []; let score = 0;
      if (h > o * 1.001 && px >= h * 0.998 && chg > 0.4) { tags.push(['DH', 'DAY HIGH', 'g']); score += 2; }
      if (l < o * 0.999 && px <= l * 1.002 && chg < -0.4) { tags.push(['DL', 'DAY LOW', 'r']); score += 2; }
      if (num(wh) && h >= wh * 0.998) { tags.push(['WH', '52W HIGH', 'g2']); score += 4; }
      if (num(wl) && l <= wl * 1.002) { tags.push(['WL', '52W LOW', 'r2']); score += 4; }
      if (b) {
        const P = (b[0] + b[1] + b[2]) / 3, rg = b[0] - b[1], lv = [['S2', P - rg, 'r'], ['S1', 2 * P - b[0], 'r'], ['PIVOT', P, 'a'], ['R1', 2 * P - b[1], 'g'], ['R2', P + rg, 'g']];
        let best = null; lv.forEach((L) => { const d = Math.abs(px / L[1] - 1) * 100; if (d <= 0.15 && (!best || d < best.d)) best = { n: L[0], c: L[2], d }; });
        if (best) { tags.push(['PV', best.n + (px >= 0 ? '' : ''), best.c]); score += 1.5; }
        if (px > b[3] && chg > 0) { tags.push(['BO', 'BREAKOUT', 'g']); score += 3; } else if (px < b[4] && chg < 0) { tags.push(['BO', 'BREAKDOWN', 'r']); score += 3; }
      }
      if (pace >= 3 && v > 0) { tags.push(['VB', 'VOL ' + pace.toFixed(1) + '×', 'b']); score += Math.min(4, pace / 3); }
      if (Math.abs(chg) >= 4) { tags.push(['RB', (chg > 0 ? '+' : '') + chg.toFixed(1) + '%', chg > 0 ? 'g' : 'r']); score += Math.min(4, Math.abs(chg) / 2); }
      if (tags.length) out.push({ s, px, chg, pace, tags, score: score + tags.length });
    });
    /* when did each signal first appear? (keyed per stock+signal; dropped when the signal ends, so a re-trigger gets a fresh time) */
    loadFirst(); const now = G.qAt || Date.now(), act = {}, firstSweep = !G.calcd && Object.keys(G.q).length > 0; if (Object.keys(G.q).length) G.calcd = true;
    out.forEach((r) => { r.tags.forEach((t) => { const k = r.s + ':' + t[0] + ':' + t[1].replace(/[0-9.×%+-]+/g, '').trim(); act[k] = 1; if (!G.first[k]) G.first[k] = { t: now, pre: !!firstSweep }; t.k = k; t.at = G.first[k].t; t.pre = !!G.first[k].pre; }); r.at = Math.max(...r.tags.map((t) => t.at)); });
    Object.keys(G.first).forEach((k) => { if (!act[k]) delete G.first[k]; }); G.sigAt = now; saveFirst();
    return out;
  }
  const CHIP = { g: 'sg-g', g2: 'sg-g2', r: 'sg-r', r2: 'sg-r2', a: 'sg-a', b: 'sg-b' };
  function html(ms) {
    const first = !G.seen; G.seen = G.ver; loadBase(); loadQ();
    const rows = signals(), cnt = {}, nowT = Date.now(); rows.forEach((r) => { new Set(r.tags.map((t) => t[0])).forEach((k) => { cnt[k] = (cnt[k] || 0) + 1; }); });
    const sh = rows.filter((r) => G.f === 'ALL' || r.tags.some((t) => t[0] === G.f)).sort((a, b) => G.sort === 'time' ? (b.at - a.at) || (b.score - a.score) : b.score - a.score).slice(0, 80);
    const age = G.qAt ? Math.round((Date.now() - G.qAt) / 60000) : null, m = istMin(), live = istMin() >= 555 && m <= 935 && ist().getUTCDay() >= 1 && ist().getUTCDay() <= 5;
    return `<section class="jd-card jd-tc jd-sig"><h3><span class="jd-ic">🎯</span>Live stock signals <small>Nifty 100 + MidSmallCap 400</small><span class="jd-chip ${live ? 'on' : ''}">${live ? '● LIVE' : 'LAST SESSION'}</span></h3>`
      + `<div class="sg-bar"><label>Signal<select class="sg-sel" onchange="jcSig.filter(this.value)">${FILT.map((f) => `<option value="${f[0]}"${G.f === f[0] ? ' selected' : ''}>${f[1]} (${f[0] === 'ALL' ? rows.length : cnt[f[0]] || 0})</option>`).join('')}</select></label><label>Sort<select class="sg-sel" onchange="jcSig.sort(this.value)"><option value="time"${G.sort === 'time' ? ' selected' : ''}>Latest first</option><option value="score"${G.sort === 'score' ? ' selected' : ''}>Strongest first</option></select></label><span class="sg-hint">${sh.length} shown · time = when this page first saw the signal${G.first && Object.keys(G.first).some((k) => G.first[k].pre) ? ' (“≤” = already true at page open)' : ''}</span></div>`
      + (rows.length ? `<div class="sg-sc"><div class="sg-in"><table class="jd-tb sg-t"><thead><tr><th>TIME</th><th>STOCK</th><th>LTP</th><th>CHG</th><th>SIGNALS</th></tr></thead><tbody>${sh.map((r) => `<tr class="${r.chg > 0.05 ? 'u' : r.chg < -0.05 ? 'd' : ''}${nowT - r.at < 120000 && !r.tags.every((t) => t.pre) ? ' sg-new' : ''}"><td class="sg-tm">${r.tags.every((t) => t.pre) ? '≤ ' : ''}${hhmmss(r.at)}${nowT - r.at < 120000 && !r.tags.every((t) => t.pre) ? ' <em>NEW</em>' : ''}</td><td class="jd-nm">${E(r.s)}<button class="jd-xr" type="button" data-xr="${E(r.s)}.NS" title="Live X-ray of ${E(r.s)}">X-ray</button></td><td class="jd-px">${f2(r.px)}</td><td class="jd-pc"><span>${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(2)}%</span></td><td class="sg-c">${r.tags.map((t) => `<i class="sg ${CHIP[t[2]]}">${E(t[1])}</i>`).join('')}</td></tr>`).join('')}</tbody></table></div></div>` : `<div class="jd-fn">${G.qAt ? 'No stock is hitting these signals right now.' : 'Loading live quotes for ~500 stocks…'}</div>`)
      + `<div class="jd-fn"><b class="sg-lg g">green</b> bullish · <b class="sg-lg r">red</b> bearish · <b class="sg-lg a">amber</b> pivot · <b class="sg-lg b">blue</b> volume · day high/low = extreme of today’s range · pivot = within 0.15 % of yesterday’s S2/S1/P/R1/R2 · breakout = above the 20-day high · volume blast ≥ 3× pace · rate blast ±4 %. ${G.qAt ? 'Quotes ' + (age < 1 ? 'just now' : age + ' min old') + '. ' : ''}${G.baseAt ? '' : 'Pivot and breakout levels load in a minute. '}Delayed Yahoo data, not advice.</div></section>`;
  }
  const CSS = `
  .jd-sig{padding:0!important;overflow:hidden}.jd-sig>h3{margin:0!important;padding:10px 12px!important;border:0!important;color:#fff!important;background:linear-gradient(135deg,#1b2f66,#0b1330);border-bottom:2px solid #c9a24a!important}.jd-sig>h3 small{color:#c9d6f5!important}.jd-sig>h3 .jd-chip{margin-left:auto}
  .sg-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 12px;background:linear-gradient(180deg,#eef2fb,#f8faff);border-bottom:1px solid #d9e1f2}.sg-bar label{display:flex;align-items:center;gap:6px;font:800 10px 'Segoe UI',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#52607f}
  .sg-sel{font:700 12px 'Segoe UI',sans-serif;color:#0b2260;background:#fff;border:1px solid #b9c7e6;border-radius:8px;padding:5px 26px 5px 9px;cursor:pointer;box-shadow:0 1px 2px rgba(20,48,110,.12)}.sg-hint{flex:1 1 100%;font-size:9.5px;color:#6a7691}
  .jd-c1{display:flex;flex-direction:column}.jd-c1>.jd-sig{flex:1 1 auto;display:flex;flex-direction:column;min-height:420px}.jd-sig .sg-sc{position:relative;flex:1 1 0;min-height:300px;max-height:none;margin:0 6px}.sg-in{position:absolute;inset:0;overflow:auto}.jd-sig>.jd-fn{padding:6px 12px 8px}
  .sg-t{width:100%;border-collapse:separate;border-spacing:0 3px}.sg-t th{position:sticky;top:0;background:#fff;z-index:2;font-size:9px;letter-spacing:.1em;color:#7b88a6;text-align:left;padding:6px 6px 3px;border:0}.sg-t td{padding:5px 6px;background:#f5f7fc;border:0}.sg-t td:first-child{border-radius:8px 0 0 8px}.sg-t td:last-child{border-radius:0 8px 8px 0}
  .sg-t tr.u td:first-child{box-shadow:inset 4px 0 #12a05a}.sg-t tr.d td:first-child{box-shadow:inset 4px 0 #c0102e}.sg-t tr:hover td{background:#e9effb}
  .sg-tm{font:800 11px ui-monospace,Consolas,monospace;white-space:nowrap;color:#24365e;padding-left:10px!important}.sg-tm em{display:block;width:max-content;margin-top:1px;font:900 8px 'Segoe UI',sans-serif;font-style:normal;background:#e0245e;color:#fff;border-radius:99px;padding:1px 5px;animation:sgp 1s infinite}@keyframes sgp{50%{opacity:.4}}.sg-new td{background:#fff4c9!important}
  .sg-t .jd-nm{font-weight:800}.sg-t .jd-px{font:700 12px ui-monospace,Consolas,monospace}.sg-t .jd-pc span{font:800 11px ui-monospace,Consolas,monospace;padding:2px 7px;border-radius:99px;background:#e6ebf7}.sg-t tr.u .jd-pc span{background:#d6f3e3;color:#06612f}.sg-t tr.d .jd-pc span{background:#fbdce2;color:#a10b27}
  .sg-c{display:flex;flex-wrap:wrap;gap:3px}.sg{font:900 9px 'Segoe UI',sans-serif;font-style:normal;border-radius:99px;padding:2px 7px;white-space:nowrap}.sg-g{background:#c9f0da;color:#06612f}.sg-g2{background:#0b7a3f;color:#fff}.sg-r{background:#fbd0d8;color:#a10b27}.sg-r2{background:#b3162f;color:#fff}.sg-a{background:#ffe9a8;color:#7a4e00}.sg-b{background:#d6e4ff;color:#14306e}.sg-lg.g{color:#06612f}.sg-lg.r{color:#a10b27}.sg-lg.a{color:#9a6a00}.sg-lg.b{color:#14306e}`;
  window.jcSig = { html, sort: (k) => { G.sort = k; try { document.activeElement.blur(); } catch (e) { } if (window.jdRepaint) window.jdRepaint(); }, filter: (f) => { G.f = f; try { document.activeElement.blur(); } catch (e) { } if (window.jdRepaint) window.jdRepaint(); }, state: G };
  function init() { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); setInterval(() => { if (window.__curTab !== 'pDash' || document.hidden) return; loadQ(); const R = window.jcRadar && window.jcRadar.state; if (R && R.last && R.last !== G.qAt) { G.q = R.q; G.qAt = R.last; bump(); } }, 10000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
