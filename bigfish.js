/* ============================================================
   Joshi's Corner — PRE-MARKET BIG FISH
   Finds momentum stocks BEFORE the move, from the Big Fish long screener adapted for the pre-open:
     Universe  Nifty MidSmallCap 400            Price  > ₹50              Breakout  new 1-month high (last completed session)
     Strength  RSI(14) > 55  ·  Volatility (14-day avg daily range) > 2 %
     Interest  10-day average volume > 500 K  (pre-open qty > 50 K shown when NSE publishes it)
     Gap       pre-open / opening gap > 1.5 %  → promotes SETUP to READY
   This is a SCREEN (candidates to watch), not a call. Nothing here is a recommendation to trade.
   ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v, d) => (num(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '—');
  const sg = (v, d) => (num(v) ? (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) : '—');
  const K = (v) => (num(v) ? (v >= 1e7 ? (v / 1e7).toFixed(2) + ' Cr' : v >= 1e5 ? (v / 1e5).toFixed(1) + ' L' : v >= 1e3 ? (v / 1e3).toFixed(0) + ' K' : String(Math.round(v))) : '—');
  const ist = () => new Date(Date.now() + 19800000);
  const istMin = () => { const d = ist(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const istToday = () => ist().toISOString().slice(0, 10);
  const dateOf = (t) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);
  const CRIT = { minPrice: 50, minVol: 5e5, minVolat: 2, minRsi: 55, gap: 1.5, preVol: 5e4, hiN: 20 };
  const LS = 'jc_bigfish_v1';
  const B = { rows: [], universe: null, src: '', busy: false, msg: '', err: '', scanned: 0, total: 0, at: 0, pre: null, preOk: null, live: false, timer: null, sort: 'status' };

  async function be(qs, ms) { const u = getBackend(); if (!u) throw new Error('Data backend not connected'); const t = await fetchWithTimeout(beUrl(u, qs), ms || 45000); return JSON.parse(t); }
  async function mapLimit(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { await fn(items[k], k); } catch (e) { } } })); }
  const rsi14 = (c) => { const n = 14; if (c.length < n + 2) return null; let ag = 0, al = 0; for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) ag += d; else al -= d; } ag /= n; al /= n; for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; ag = (ag * (n - 1) + (d > 0 ? d : 0)) / n; al = (al * (n - 1) + (d < 0 ? -d : 0)) / n; } return al === 0 ? 100 : 100 - 100 / (1 + ag / al); };

  /* one stock → metrics as of the last COMPLETED session; today's partial bar (if any) gives the live gap */
  function metrics(sym, b) {
    const today = istToday(), n = b.t.length; let k = n - 1, live = null;
    if (dateOf(b.t[k]) === today && istMin() < 15 * 60 + 40) { live = { o: b.o[k], h: b.h[k], l: b.l[k], c: b.c[k], v: b.v[k] }; k--; }
    if (k < 25) return null;
    const c = b.c.slice(0, k + 1), px = c[k];
    let hh = -Infinity; for (let i = k - CRIT.hiN; i < k; i++) hh = Math.max(hh, b.h[i]);
    let vol = 0; for (let i = k - 9; i <= k; i++) vol += b.v[i]; vol /= 10;
    let rg = 0; for (let i = k - 13; i <= k; i++) rg += (b.h[i] - b.l[i]) / b.c[i] * 100; rg /= 14;
    const r = rsi14(c), newHigh = b.h[k] >= hh, toHigh = (hh / px - 1) * 100;
    const m = { s: sym, px, prev: px, rsi: r, volat: rg, avgVol: vol, newHigh, hi20: hh, hiDist: (px / hh - 1) * 100, chg1: (px / c[k - 1] - 1) * 100, refDate: dateOf(b.t[k]) };
    m.setup = px > CRIT.minPrice && newHigh && r > CRIT.minRsi && rg > CRIT.minVolat && vol > CRIT.minVol;
    m.near = !m.setup && px > CRIT.minPrice && r > CRIT.minRsi && rg > CRIT.minVolat && vol > CRIT.minVol && px >= hh * 0.97;
    if (live) { m.gap = (live.o / px - 1) * 100; m.now = live.c; m.nowChg = (live.c / px - 1) * 100; m.dayVol = live.v; }
    return m;
  }
  function applyPre(m) {
    const p = B.pre && B.pre[m.s]; if (p && num(p.i) && num(m.px)) { m.preGap = (p.i / m.px - 1) * 100; m.preQty = p.q; }
    const g = num(m.gap) ? m.gap : m.preGap; m.gapUse = g; m.gapOk = num(g) && g > CRIT.gap;
    m.preOk = num(m.preQty) ? m.preQty > CRIT.preVol : null;
    m.status = m.setup ? (m.gapOk ? 'READY' : 'SETUP') : m.near ? 'NEAR' : '';
    return m;
  }

  async function loadUniverse() {
    try { const c = JSON.parse(localStorage.getItem(LS + '_u') || 'null'); if (c && c.d === istToday() && c.list && c.list.length) { B.universe = c.list; B.src = c.src; return; } } catch (e) { }
    B.msg = 'Loading Nifty MidSmallCap 400 list…'; paint();
    const j = await be('action=universe', 45000);
    if (!j.list || !j.list.length) throw new Error('NSE index list unavailable right now (NSE blocks cloud servers at times) — try again in a few minutes');
    B.universe = j.list.map((x) => x.s); B.src = j.src;
    try { localStorage.setItem(LS + '_u', JSON.stringify({ d: istToday(), list: B.universe, src: B.src })); } catch (e) { }
  }
  async function fetchPre() {
    if (istMin() < 8 * 60 + 55 || istMin() > 9 * 60 + 20) return; // NSE pre-open session is 09:00–09:08; the order book freezes after
    try { const j = await be('action=preopen', 30000); B.preOk = !!j.ok; B.pre = j.ok ? j.rows : B.pre; } catch (e) { B.preOk = false; }
  }
  async function scan() {
    if (B.busy) return; B.busy = true; B.err = ''; paint();
    try {
      await loadUniverse(); await fetchPre();
      const syms = B.universe, batches = []; for (let i = 0; i < syms.length; i += 30) batches.push(syms.slice(i, i + 30));
      B.total = syms.length; B.scanned = 0; const rows = [];
      await mapLimit(batches, 3, async (bt) => {
        const j = await be('action=dailyb&range=3mo&symbols=' + encodeURIComponent(bt.map((s) => s + '.NS').join(',')), 60000);
        bt.forEach((s) => { const b = j.bars && j.bars[s + '.NS']; if (b) { const m = metrics(s, b); if (m) rows.push(applyPre(m)); } });
        B.scanned += bt.length; B.msg = `Scanning ${B.scanned}/${B.total} stocks…`; paint();
      });
      B.rows = rows.filter((r) => r.status); B.at = Date.now(); B.msg = ''; B.live = rows.some((r) => num(r.gap));
      try { localStorage.setItem(LS, JSON.stringify({ d: istToday(), at: B.at, rows: B.rows, src: B.src, n: B.total })); } catch (e) { }
    } catch (e) { B.err = 'Scan failed: ' + ((e && e.message) || e); B.msg = ''; }
    finally { B.busy = false; paint(); }
  }
  /* light refresh: only the stocks already on the list get today's bar + the NSE pre-open book */
  async function refreshLive() {
    if (B.busy || !B.rows.length) return; const mn = istMin(); if (mn < 8 * 60 + 55 || mn > 15 * 60 + 35) return;
    B.busy = true;
    try {
      await fetchPre();
      const syms = B.rows.map((r) => r.s), batches = []; for (let i = 0; i < syms.length; i += 30) batches.push(syms.slice(i, i + 30));
      await mapLimit(batches, 2, async (bt) => {
        const j = await be('action=dailyb&range=3mo&symbols=' + encodeURIComponent(bt.map((s) => s + '.NS').join(',')), 45000);
        bt.forEach((s) => { const b = j.bars && j.bars[s + '.NS']; if (!b) return; const m = metrics(s, b); if (!m) return; applyPre(m); const i = B.rows.findIndex((r) => r.s === s); if (i >= 0 && m.status) B.rows[i] = m; });
      });
      B.at = Date.now(); B.live = true; try { localStorage.setItem(LS, JSON.stringify({ d: istToday(), at: B.at, rows: B.rows, src: B.src, n: B.total })); } catch (e) { }
    } catch (e) { }
    finally { B.busy = false; paint(); }
  }

  const ord = { READY: 0, SETUP: 1, NEAR: 2 };
  function sorted() {
    const r = B.rows.slice();
    r.sort((a, b) => B.sort === 'az' ? a.s.localeCompare(b.s) : B.sort === 'rsi' ? b.rsi - a.rsi : B.sort === 'gap' ? (b.gapUse || -99) - (a.gapUse || -99) : B.sort === 'volat' ? b.volat - a.volat : (ord[a.status] - ord[b.status]) || ((b.gapUse || -99) - (a.gapUse || -99)) || b.volat - a.volat);
    return r;
  }
  function paint() {
    const el = $('pBig'); if (!el) return; const rows = sorted(), nR = rows.filter((r) => r.status === 'READY').length, nS = rows.filter((r) => r.status === 'SETUP').length, nN = rows.filter((r) => r.status === 'NEAR').length;
    const mn = istMin(), phase = mn < 9 * 60 ? 'Pre-market — gap & pre-open data appear from 09:00' : mn < 9 * 60 + 15 ? 'NSE pre-open session — indicative opening prices' : mn <= 15 * 60 + 30 ? 'Market live — gap is today’s open vs yesterday’s close' : 'Market closed — showing tomorrow’s setups from today’s close';
    const th = (k, t) => `<th class="${B.sort === k ? 'on' : ''}" onclick="jcBig.sort('${k}')" style="cursor:pointer">${t}</th>`;
    el.innerHTML = `<div class="bf-head"><div><h2>🐟 Pre-Market Big Fish <small>find momentum before the move</small></h2><div class="bf-st">${E(phase)}${B.at ? ' · scanned ' + new Date(B.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' · universe: ' + E(B.src || 'Nifty MidSmallCap 400') + ' (' + (B.total || (B.universe || []).length) + ' stocks)' : ''}</div></div><div class="bf-acts"><button class="bf-btn" onclick="jcBig.scan()" ${B.busy ? 'disabled' : ''}>${B.busy ? 'Scanning…' : '⟳ Scan now'}</button></div></div>`
      + (B.err ? `<div class="bf-err">${E(B.err)}</div>` : '') + (B.msg ? `<div class="bf-msg">${E(B.msg)}</div>` : '')
      + `<div class="bf-crit"><b>Screen:</b> MidSmallCap 400 · price &gt; ₹50 · new 1-month high · RSI(14) &gt; 55 · volatility &gt; 2 % · 10-day avg volume &gt; 500 K · <b>READY</b> = all of these <i>and</i> gap &gt; 1.5 % ${B.preOk === false ? '· <span class="r">NSE pre-open feed unavailable — gap uses the live open once the market starts</span>' : B.preOk ? '· pre-open feed on (qty &gt; 50 K flagged)' : ''}</div>`
      + `<div class="bf-kp"><div class="bf-k"><i>READY now</i><b class="g">${nR}</b><small>setup + gap &gt; 1.5 %</small></div><div class="bf-k"><i>SETUP (waiting for gap)</i><b>${nS}</b><small>all criteria except gap</small></div><div class="bf-k"><i>NEAR (within 3 % of high)</i><b>${nN}</b><small>on the radar</small></div></div>`
      + (rows.length ? `<div class="bf-sc"><table class="bf-t"><thead><tr><th>#</th>${th('az', 'Stock')}${th('status', 'Status')}<th>Prev close</th>${th('gap', 'Gap %')}<th>Now</th><th>Pre-open qty</th><th>10-D avg vol</th><th>1-M high</th>${th('volat', 'Volatility')}${th('rsi', 'RSI')}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.status === 'READY' ? 'rdy' : ''}"><td>${i + 1}</td><td class="bf-s"><a class="symlink" href="javascript:void(0)" data-sym="${E(r.s)}" onclick="loadSymbol('${E(r.s)}')">${E(r.s)}</a></td><td><span class="bf-b ${r.status}">${r.status}</span></td><td>${f2(r.px)}</td><td class="${r.gapUse > 0 ? 'g' : 'r'}">${num(r.gapUse) ? sg(r.gapUse) + '%' : '—'}${num(r.preGap) && !num(r.gap) ? '<small>pre-open</small>' : ''}</td><td>${num(r.now) ? f2(r.now) + '<small class="' + (r.nowChg >= 0 ? 'g' : 'r') + '">' + sg(r.nowChg) + '%</small>' : '—'}</td><td>${num(r.preQty) ? K(r.preQty) + (r.preOk ? ' ✓' : '') : '—'}</td><td>${K(r.avgVol)}</td><td>${r.newHigh ? '<b class="g">NEW HIGH</b>' : sg(r.hiDist) + '%'}<small>${f2(r.hi20)}</small></td><td>${r.volat.toFixed(1)}%</td><td>${r.rsi.toFixed(0)}</td></tr>`).join('')}</tbody></table></div>` : (B.busy ? '' : '<div class="bf-card">No stocks pass the screen yet. Press <b>Scan now</b> (the full MidSmallCap 400 scan takes about a minute).</div>'))
      + `<div class="bf-note"><b>How to read this honestly.</b> It is a candidate list, not a call. Over 2 years of data on a 46-stock sample, stocks passing this screen (before the gap filter) rose about +0.26 % the next day versus +0.03 % for all stocks, but almost all of that was the opening gap — measured from the open to the close they were flat (−0.03 %). With a gap above 1.5 % the open-to-close drift was about +0.45 % (only 92 cases, 43 % ended higher). The gap is the part you mostly cannot buy. Use the list to decide where to watch for an orderly pullback or a clean 5-minute close above the first 15-minute high, keep position size small, and let the stock-level X-ray and Today’s Calls confirm.</div>`;
  }
  function open(s) { if (window.jcXray) window.jcXray(s); }

  const CSS = `#pBig{--g:#08783a;--r:#c0102e;background:linear-gradient(180deg,#e4ebf8,#edf1fa 60%,#e4ebf8);border-radius:16px;padding:10px;color:#0a1430}
  .bf-head{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;background:linear-gradient(120deg,#17388a,#0b1d4d);color:#fff;border-radius:14px;padding:14px 18px;margin-bottom:10px}.bf-head>div:first-child{flex:1;min-width:260px}.bf-head h2{margin:0 0 4px;font-size:22px}.bf-head h2 small{font-size:12px;color:#c9d6f7;font-weight:700;margin-left:8px}.bf-st{font-size:12.5px;color:#e5ecff}
  .bf-btn{border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.12);color:#fff;border-radius:8px;padding:6px 12px;font-weight:800;font-size:12px;cursor:pointer}.bf-btn[disabled]{opacity:.45}
  .bf-err{background:#fde6ea;color:#a10b27;border-radius:10px;padding:8px 12px;margin-bottom:8px;font-weight:700;font-size:12.5px}.bf-msg{background:#fff;border:1px solid #bccae6;border-radius:10px;padding:8px 12px;margin-bottom:8px;font-weight:700;font-size:12.5px;color:#14306e}
  .bf-crit{font-size:12px;color:#24365e;margin:2px 2px 10px;line-height:1.5}.bf-kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px}.bf-k{background:#fff;border:1px solid #bccae6;border-left:4px solid #14306e;border-radius:10px;padding:6px 10px}.bf-k i{display:block;font-style:normal;font-size:9.5px;letter-spacing:.8px;text-transform:uppercase;color:#34456a;font-weight:800}.bf-k b{display:block;font:900 22px ui-monospace,Consolas,monospace;color:#0b2260}.bf-k small{color:#34456a;font-size:10.5px}
  .bf-sc{overflow-x:auto;background:#fff;border:1px solid #bccae6;border-radius:14px;padding:6px 10px}.bf-t{width:100%;border-collapse:collapse;font-size:12.5px;min-width:860px}.bf-t th{font-size:9.5px;letter-spacing:.7px;text-transform:uppercase;color:#34456a;text-align:left;padding:5px 6px;border-bottom:1.5px solid #c9d3e8;white-space:nowrap}.bf-t th.on{color:#0b2260;text-decoration:underline}.bf-t td{padding:6px;border-bottom:1px solid #e3e9f5;font-family:ui-monospace,Consolas,monospace;vertical-align:top;text-align:left}.bf-t td small{display:block;font:600 10.5px 'Segoe UI',sans-serif;color:#34456a}.bf-t tr.rdy td{background:#eefaf3}.bf-s a{font:800 13.5px 'Segoe UI',sans-serif;color:#0b2260;text-decoration:none}
  .bf-b{font:900 10.5px 'Segoe UI',sans-serif;padding:3px 9px;border-radius:99px}.bf-b.READY{background:#c9f0da;color:#06612f}.bf-b.SETUP{background:#fbe9c0;color:#7a4e00}.bf-b.NEAR{background:#e6ebf7;color:#34456a}
  .bf-t .g,#pBig .g{color:#08783a}.bf-t .r,#pBig .r{color:#c0102e}.bf-card,.bf-note{background:#fff;border:1px solid #bccae6;border-radius:12px;padding:10px 14px;font-size:12px;color:#24365e;line-height:1.55;margin-top:10px}`;
  function build() {
    if ($('pBig')) return; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const anchor = document.querySelector('details.datasec'); if (!anchor) return;
    const p = document.createElement('div'); p.className = 'panel'; p.id = 'pBig'; p.innerHTML = '<div class="note">Loading…</div>'; anchor.parentNode.insertBefore(p, anchor);
    const sel = $('viewSel'); if (sel) { const og = document.createElement('optgroup'); og.label = 'Scanners'; const o = document.createElement('option'); o.value = 'pBig'; o.textContent = '🐟 Pre-Market Big Fish — stocks before the move'; og.appendChild(o); sel.insertBefore(og, sel.children[2] || null); sel.value = window.__curTab || 'pSummary'; }
    const prev = window.showTab; window.showTab = function (id) { prev(id); if (id === 'pBig') onShow(); };
    const pp = window.printPDF; window.printPDF = function () { if (window.__curTab === 'pBig') { window.print(); return; } return pp.apply(this, arguments); };
    clearInterval(B.timer); B.timer = setInterval(() => { if (window.__curTab === 'pBig' && !document.hidden) refreshLive(); }, 60000);
    if ((location.hash || '').slice(1) === 'bigfish') window.showTab('pBig');
  }
  function onShow() {
    if (!B.rows.length) { try { const c = JSON.parse(localStorage.getItem(LS) || 'null'); if (c && c.rows) { B.rows = c.rows; B.at = c.at; B.src = c.src; B.total = c.n; } } catch (e) { } }
    paint(); const stale = !B.at || new Date(B.at + 19800000).toISOString().slice(0, 10) !== istToday();
    if (stale && !B.busy) scan(); else refreshLive();
  }
  window.jcBig = { scan, open, sort: (k) => { B.sort = k; paint(); }, state: B };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
