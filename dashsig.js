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
  const G = { base: {}, baseAt: '', baseBusy: false, q: {}, qAt: 0, qBusy: false, f: 'ALL', ver: 0, seen: -1 };
  const FILT = [['ALL', 'All'], ['DH', 'Day high'], ['DL', 'Day low'], ['WH', '52W high'], ['WL', '52W low'], ['PV', 'Pivot'], ['BO', 'Breakout'], ['VB', 'Volume blast'], ['RB', 'Rate blast']];
  async function be(qs, ms) { const u = getBackend(); if (!u) throw new Error('no backend'); return JSON.parse(await fetchWithTimeout(beUrl(u, qs), ms || 45000)); }

  /* yesterday's levels + 20-day range, once per day */
  async function loadBase() {
    if (G.baseBusy) return; try { const c = JSON.parse(localStorage.getItem(LSB) || 'null'); if (c && c.d === istToday() && c.b) { G.base = c.b; G.baseAt = c.d; return; } } catch (e) { }
    if (G.baseAt === istToday()) return; G.baseBusy = true;
    try {
      const syms = (window.jcUni ? window.jcUni() : []).map((s) => s + '.NS'), bt = []; for (let i = 0; i < syms.length; i += 30) bt.push(syms.slice(i, i + 30)); const today = istToday(), out = {}; let i = 0;
      await Promise.all([0, 1, 2].map(async () => { while (i < bt.length) { const b = bt[i++]; try { const j = await be('action=dailyb&range=1mo&symbols=' + encodeURIComponent(b.join(',')), 60000); Object.keys(j.bars || {}).forEach((k) => { const x = j.bars[k]; let n = x.t.length - 1; if (dateOf(x.t[n]) === today) n--; if (n < 5) return; let hi = 0, lo = 1e12; for (let q = Math.max(0, n - 19); q <= n; q++) { hi = Math.max(hi, x.h[q]); lo = Math.min(lo, x.l[q]); } out[k.replace(/\.NS$/, '')] = [x.h[n], x.l[n], x.c[n], hi, lo]; }); } catch (e) { } } }));
      if (Object.keys(out).length) { G.base = out; G.baseAt = today; try { localStorage.setItem(LSB, JSON.stringify({ d: today, b: out })); } catch (e) { } }
    } finally { G.baseBusy = false; bump(); }
  }
  /* quotes: reuse the radar's minute sweep; fetch on our own once if it has not run (market closed / just opened the page) */
  async function loadQ() {
    const R = window.jcRadar && window.jcRadar.state; if (R && R.last && Object.keys(R.q).length) { G.q = R.q; G.qAt = R.last; return; }
    if (G.qBusy || (G.qAt && Date.now() - G.qAt < 120000)) return; G.qBusy = true;
    try { const yf = (window.jcUni ? window.jcUni() : []).map((s) => s + '.NS'), q = {}; const rs = await Promise.all([yf.slice(0, 260), yf.slice(260)].filter((p) => p.length).map((p) => be('action=liveq&symbols=' + encodeURIComponent(p.join(',')), 45000))); rs.forEach((j) => { if (j && j.ok) Object.keys(j.q).forEach((k) => { q[k.replace(/\.NS$/, '')] = j.q[k]; }); }); if (Object.keys(q).length) { G.q = q; G.qAt = Date.now(); } } catch (e) { } finally { G.qBusy = false; bump(); }
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
        let best = null; lv.forEach((L) => { const d = Math.abs(px / L[1] - 1) * 100; if (d <= 0.35 && (!best || d < best.d)) best = { n: L[0], c: L[2], d }; });
        if (best) { tags.push(['PV', best.n + (px >= 0 ? '' : ''), best.c]); score += 1.5; }
        if (px > b[3] && chg > 0) { tags.push(['BO', 'BREAKOUT', 'g']); score += 3; } else if (px < b[4] && chg < 0) { tags.push(['BO', 'BREAKDOWN', 'r']); score += 3; }
      }
      if (pace >= 3 && v > 0) { tags.push(['VB', 'VOL ' + pace.toFixed(1) + '×', 'b']); score += Math.min(4, pace / 3); }
      if (Math.abs(chg) >= 4) { tags.push(['RB', (chg > 0 ? '+' : '') + chg.toFixed(1) + '%', chg > 0 ? 'g' : 'r']); score += Math.min(4, Math.abs(chg) / 2); }
      if (tags.length) out.push({ s, px, chg, pace, tags, score: score + tags.length });
    });
    return out;
  }
  const CHIP = { g: 'sg-g', g2: 'sg-g2', r: 'sg-r', r2: 'sg-r2', a: 'sg-a', b: 'sg-b' };
  function html(ms) {
    const first = !G.seen; G.seen = G.ver; loadBase(); loadQ();
    const rows = signals(), cnt = {}; rows.forEach((r) => { new Set(r.tags.map((t) => t[0])).forEach((k) => { cnt[k] = (cnt[k] || 0) + 1; }); });
    const sh = rows.filter((r) => G.f === 'ALL' || r.tags.some((t) => t[0] === G.f)).sort((a, b) => b.score - a.score).slice(0, 60);
    const age = G.qAt ? Math.round((Date.now() - G.qAt) / 60000) : null, m = istMin(), live = istMin() >= 555 && m <= 935 && ist().getUTCDay() >= 1 && ist().getUTCDay() <= 5;
    return `<section class="jd-card jd-tc jd-sig"><h3><span class="jd-ic">🎯</span>Live stock signals <small>Nifty 100 + MidSmallCap 400</small><span class="jd-chip ${live ? 'on' : ''}">${live ? '● LIVE' : 'LAST SESSION'}</span></h3>`
      + `<div class="sg-f">${FILT.map((f) => `<button type="button" class="sg-fb ${G.f === f[0] ? 'on' : ''} fb-${f[0]}" onclick="jcSig.filter('${f[0]}')">${f[1]}${f[0] === 'ALL' ? ' <b>' + rows.length + '</b>' : cnt[f[0]] ? ' <b>' + cnt[f[0]] + '</b>' : ' <b>0</b>'}</button>`).join('')}</div>`
      + (rows.length ? `<div class="sg-sc"><table class="jd-tb sg-t"><thead><tr><th>STOCK</th><th>LTP</th><th>CHG</th><th>SIGNALS</th></tr></thead><tbody>${sh.map((r) => `<tr class="${r.chg > 0.05 ? 'u' : r.chg < -0.05 ? 'd' : ''}"><td class="jd-nm">${E(r.s)}<button class="jd-xr" type="button" data-xr="${E(r.s)}.NS" title="Live X-ray of ${E(r.s)}">X-ray</button></td><td class="jd-px">${f2(r.px)}</td><td class="jd-pc"><span>${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(2)}%</span></td><td class="sg-c">${r.tags.map((t) => `<i class="sg ${CHIP[t[2]]}">${E(t[1])}</i>`).join('')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="jd-fn">${G.qAt ? 'No stock is hitting these signals right now.' : 'Loading live quotes for ~500 stocks…'}</div>`)
      + `<div class="jd-fn"><b class="sg-lg g">green</b> bullish · <b class="sg-lg r">red</b> bearish · <b class="sg-lg a">amber</b> pivot · <b class="sg-lg b">blue</b> volume. Day high/low = at the extreme of today’s range · pivot = within 0.35 % of yesterday’s S2/S1/P/R1/R2 · breakout = above the 20-day high · volume blast = ≥ 3× normal pace · rate blast = ±4 % or more. ${G.qAt ? 'Quotes ' + (age < 1 ? 'just now' : age + ' min old') + '. ' : ''}${G.baseAt ? '' : 'Pivot and breakout levels load in a minute. '}Delayed Yahoo data, not advice.</div></section>`;
  }
  const CSS = `.jd-sig .sg-f{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 8px}.sg-fb{border:1px solid #c8d3ea;background:#fff;color:#24365e;border-radius:99px;padding:3px 9px;font:800 10.5px 'Segoe UI',sans-serif;cursor:pointer}.sg-fb b{background:#e6ebf7;border-radius:99px;padding:0 6px;margin-left:2px}.sg-fb.on{background:#0f2352;color:#fff;border-color:#0f2352}.sg-fb.on b{background:rgba(255,255,255,.22)}.sg-fb.fb-DH,.sg-fb.fb-WH,.sg-fb.fb-RB{border-bottom:3px solid #12a05a}.sg-fb.fb-DL,.sg-fb.fb-WL{border-bottom:3px solid #c0102e}.sg-fb.fb-PV{border-bottom:3px solid #e0a800}.sg-fb.fb-VB{border-bottom:3px solid #1e6bff}.sg-fb.fb-BO{border-bottom:3px solid #12a05a}
  .sg-sc{max-height:560px;overflow:auto}.sg-t th{position:sticky;top:0;background:#f3f5fa;z-index:1;font-size:9px;letter-spacing:1px;color:#6a7691;text-align:left;padding:4px 6px}.sg-t td{padding:4px 6px}.sg-t tr.u td:first-child{box-shadow:inset 3px 0 #12a05a}.sg-t tr.d td:first-child{box-shadow:inset 3px 0 #c0102e}.sg-c{display:flex;flex-wrap:wrap;gap:3px}
  .sg{font:900 9px 'Segoe UI',sans-serif;font-style:normal;border-radius:99px;padding:2px 7px;white-space:nowrap}.sg-g{background:#c9f0da;color:#06612f}.sg-g2{background:#0b7a3f;color:#fff}.sg-r{background:#fbd0d8;color:#a10b27}.sg-r2{background:#b3162f;color:#fff}.sg-a{background:#ffe9a8;color:#7a4e00}.sg-b{background:#d6e4ff;color:#14306e}.sg-lg.g{color:#06612f}.sg-lg.r{color:#a10b27}.sg-lg.a{color:#9a6a00}.sg-lg.b{color:#14306e}`;
  window.jcSig = { html, filter: (f) => { G.f = f; if (window.jdRepaint) window.jdRepaint(); }, state: G };
  function init() { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); setInterval(() => { if (window.__curTab !== 'pDash' || document.hidden) return; loadQ(); const R = window.jcRadar && window.jcRadar.state; if (R && R.last && R.last !== G.qAt) { G.q = R.q; G.qAt = R.last; bump(); } }, 30000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
