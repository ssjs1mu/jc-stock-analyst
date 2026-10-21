/* Accumulation & Exit (delivery) — reads NSE delivery volumes (data/delivery.json, filled nightly by GitHub Actions, no Apps Script quota)
   and, for a stock, estimates how much was accumulated on the way up, how much has exited since the peak, whether volume is drying up,
   and where the Fibonacci retracement levels sit. Research view only — a read of past volume, not a forecast and not advice.
   Costs one chart call per stock, and only when the panel is opened. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f0 = (v) => (num(v) ? Math.round(v).toLocaleString('en-IN') : '—');
  const f1 = (v) => (num(v) ? v.toFixed(1) : '—');
  const lk = (v) => (num(v) ? (v / 1e5).toFixed(v >= 1e7 ? 0 : 1) + ' L' : '—'); // lakh shares
  const day = (t) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);
  const R = { sym: 'HSCL', busy: false, dl: null, dlErr: '', res: null, scan: [], scanBusy: false, msg: '' };
  const LV = [0.382, 0.5, 0.618, 0.786];

  async function loadDeliv() {
    if (R.dl) return R.dl;
    try { const r = await fetch('data/delivery.json?h=' + Math.floor(Date.now() / 3600000), { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); R.dl = await r.json(); R.dlErr = ''; }
    catch (e) { R.dlErr = 'Delivery file not available yet (' + e.message + ')'; R.dl = null; }
    return R.dl;
  }
  function delivOf(sym, dl) { const m = {}; if (!dl) return m; Object.keys(dl.d || {}).forEach((d) => { const x = dl.d[d][sym]; if (x) m[d] = x; }); return m; }

  function analyse(sym, bars, dm) {
    const n = bars.length; if (n < 12) return { sym, err: 'Not enough price history (needs at least 12 sessions)' };
    const B = bars.map((x) => ({ d: day(x.t), o: x.o, h: x.h, l: x.l, c: x.c, v: x.v, dq: (dm[day(x.t)] || [])[0], tq: (dm[day(x.t)] || [])[1] }));
    const from = Math.max(1, n - 130); let pk = from, ph = 0; for (let i = from; i < n; i++) if (B[i].h > ph) { ph = B[i].h; pk = i; }
    let lo = 1e18, li = Math.max(0, pk - 90); for (let i = Math.max(0, pk - 90); i <= pk; i++) if (B[i].l < lo) { lo = B[i].l; li = i; }
    const last = B[n - 1], R_ = ph - lo, out = { sym, B, pk, li, ph, lo, last, hasDel: B.filter((b) => num(b.dq)).length };
    out.swingPct = (ph / lo - 1) * 100; out.ret = R_ > 0 ? (ph - last.c) / R_ : 0; out.fib = LV.map((L) => [L, ph - R_ * L]);
    out.fromPeak = n - 1 - pk; out.short = n < 60;
    if (out.swingPct < 25) { out.state = ['No major swing', 'Not enough of a rally in the last ~6 months to measure accumulation and exit.', 'n']; return out; }
    // signed delivered flow: delivery on up-close days minus delivery on down-close days (falls back to traded volume when delivery is missing)
    const sgn = (i) => (B[i].c > B[i - 1].c ? 1 : B[i].c < B[i - 1].c ? -1 : 0);
    const q = (i) => (num(B[i].dq) ? B[i].dq : null);
    let cum = [0], cov = 0, tot = 0; for (let i = 1; i < n; i++) { const dq = q(i); if (dq != null) { cov++; } tot++; cum.push(cum[i - 1] + sgn(i) * (dq != null ? dq : 0)); }
    const rallyDel = []; let A = 0, up = 0, dn = 0, delRally = 0, trRally = 0, covRally = 0;
    for (let i = li + 1; i <= pk; i++) { const dq = q(i); if (dq == null) continue; covRally++; delRally += dq; trRally += B[i].v; if (B[i].c > B[i - 1].c) up += dq; else if (B[i].c < B[i - 1].c) dn += dq; }
    A = up - dn; out.acc = A; out.accUp = up; out.accDn = dn; out.rallyCov = covRally / Math.max(1, pk - li);
    let sUp = 0, sDn = 0, delFall = 0, trFall = 0; for (let i = pk + 1; i < n; i++) { const dq = q(i); if (dq == null) continue; delFall += dq; trFall += B[i].v; if (B[i].c > B[i - 1].c) sUp += dq; else if (B[i].c < B[i - 1].c) sDn += dq; }
    out.exitNet = sDn - sUp; out.exitPct = A > 0 ? (out.exitNet / A) * 100 : null; out.sUp = sUp; out.sDn = sDn;
    out.delPctRally = trRally ? (delRally / trRally) * 100 : null; out.delPctFall = trFall ? (delFall / trFall) * 100 : null;
    const avg = (a, z, f) => { let s = 0, c = 0; for (let i = Math.max(0, a); i < Math.min(n, z); i++) { const v = f(B[i]); if (num(v)) { s += v; c++; } } return c ? s / c : null; };
    const vPk = avg(Math.max(0, pk - 9), Math.min(n, pk + 3), (b) => b.v), v5 = avg(n - 5, n, (b) => b.v), v20 = avg(n - 20, n, (b) => b.v);
    out.vPeak = vPk; out.v5 = v5; out.v20 = v20; out.dry = vPk ? v5 / vPk : null; out.lastDelPct = last.tq ? (last.dq / last.tq) * 100 : null;
    out.d5 = avg(n - 5, n, (b) => (num(b.dq) && b.tq ? (b.dq / b.tq) * 100 : null));
    // nearest level and verdict
    let near = null, bd = 1e9; out.fib.forEach(([L, p]) => { const dd = Math.abs(last.c - p) / last.c; if (dd < bd) { bd = dd; near = [L, p, dd]; } }); out.near = near;
    const dry = out.dry != null && out.dry < 0.4, atLvl = near && near[2] < 0.03, ex = out.exitPct;
    // volume-reversal / rising-volume-fade warnings on the way up
    const v3 = [n - 3, n - 2, n - 1].map((i) => B[i].v), fading = v3[0] > v3[1] && v3[1] > v3[2] && B[n - 1].c >= B[n - 4].c * 0.99, nearTop = last.c >= ph * 0.95;
    const bigDown = (() => { for (let i = Math.max(pk, n - 6); i < n; i++) { if (B[i].c < B[i - 1].c * 0.97 && v20 && B[i].v > 2 * v20) return B[i]; } return null; })();
    if (nearTop && fading) out.state = ['Rally losing volume', 'Price is still near the high but the last three sessions traded on shrinking volume — an early caution for the top, not a sell signal by itself.', 'a'];
    else if (nearTop) out.state = ['Near the high', 'Within 5 % of the swing high; watch for a high-volume reversal candle or shrinking-volume candles as the pre-alert.', 'b'];
    else if (ex != null && ex >= 50 && dry && atLvl) out.state = ['Base forming', `More than half (${ex.toFixed(0)} %) of the net accumulation has exited, volume is down to ${(out.dry * 100).toFixed(0)} % of peak-time volume and price is at the ${(near[0] * 100).toFixed(1)} % level (${near[1].toFixed(1)}). A base is possible — it counts only if a higher-volume up-candle follows and the next lower level holds.`, 'g'];
    else if (ex != null && ex >= 50 && !dry) out.state = ['Selling still active', `${ex.toFixed(0)} % of the net accumulation has exited but volume is still ${(out.dry * 100).toFixed(0)} % of peak-time volume — supply has not dried up yet.`, 'r'];
    else if (ex != null && ex < 50 && out.ret > 0.25) out.state = ['Exit incomplete', `Only ${ex < 0 ? 0 : ex.toFixed(0)} % of the net accumulation has exited; the earlier buyers still hold a large part, so more supply can come on weak days.`, 'a'];
    else out.state = ['Neutral', 'No clear volume-based setup right now.', 'n'];
    if (bigDown && out.state[2] !== 'g') out.flag = `High-volume down day on ${bigDown.d} (${(bigDown.v / v20).toFixed(1)}× the 20-day average).`;
    out.covNote = cov < tot * 0.8 ? `Delivery data covers ${cov} of ${tot} sessions in this window; uncovered sessions count as zero in the flow estimate.` : '';
    return out;
  }

  function svg(a) {
    const B = a.B.slice(-150), off = a.B.length - B.length, W = 720, H = 300, pl = 6, pr = 52, ph = 170, vh = 90, y0 = 8, vy = 190;
    const hi = Math.max(...B.map((b) => b.h)), lo = Math.min(...B.map((b) => b.l), a.lo), rg = hi - lo || 1;
    const X = (i) => pl + (i * (W - pl - pr)) / Math.max(1, B.length - 1), Y = (p) => y0 + ph - ((p - lo) / rg) * ph, vm = Math.max(...B.map((b) => b.v)) || 1, bw = Math.max(1.5, (W - pl - pr) / B.length - 1);
    let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;background:var(--bg2,#0f172a);border-radius:8px" role="img" aria-label="price with Fibonacci levels and volume">`;
    a.fib.forEach(([L, p]) => { if (p >= lo && p <= hi) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(p)}" y2="${Y(p)}" stroke="#94a3b8" stroke-dasharray="4 4" stroke-width=".8"/><text x="${W - pr + 3}" y="${Y(p) + 3}" font-size="9" fill="#94a3b8">${(L * 100).toFixed(1)}% ${p.toFixed(0)}</text>`; });
    s += `<path d="${B.map((b, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(b.c).toFixed(1)).join('')}" fill="none" stroke="#f1c40f" stroke-width="1.6"/>`;
    const pi = a.pk - off, li = a.li - off;
    if (pi >= 0) s += `<circle cx="${X(pi)}" cy="${Y(a.ph)}" r="3.5" fill="#ef4444"/><text x="${X(pi) + 5}" y="${Y(a.ph) - 4}" font-size="9" fill="#ef4444">peak ${a.ph.toFixed(0)}</text>`;
    if (li >= 0) s += `<circle cx="${X(li)}" cy="${Y(a.lo)}" r="3.5" fill="#22c55e"/><text x="${X(li) + 5}" y="${Y(a.lo) + 11}" font-size="9" fill="#22c55e">low ${a.lo.toFixed(0)}</text>`;
    B.forEach((b, i) => { const h1 = (b.v / vm) * vh, up = b.c >= (a.B[off + i - 1] ? a.B[off + i - 1].c : b.o); const hd = num(b.dq) ? Math.min(h1, (b.dq / vm) * vh) : 0; s += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${vy + vh - h1}" width="${bw.toFixed(1)}" height="${h1.toFixed(1)}" fill="${up ? '#16a34a' : '#dc2626'}" opacity=".35"/>`; if (hd) s += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${vy + vh - hd}" width="${bw.toFixed(1)}" height="${hd.toFixed(1)}" fill="${up ? '#22c55e' : '#ef4444'}" opacity=".95"/>`; });
    s += `<text x="${pl}" y="${H - 3}" font-size="9" fill="#94a3b8">${B[0].d} → ${B[B.length - 1].d} · volume bars: pale = traded, solid = delivered (green up day, red down day)</text></svg>`;
    return s;
  }

  const CL = { g: '#22c55e', r: '#ef4444', a: '#f59e0b', b: '#38bdf8', n: '#94a3b8' };
  function card(a) {
    if (a.err) return `<div class="note">${E(a.sym)}: ${E(a.err)}</div>`;
    const st = a.state, c = CL[st[2]] || CL.n;
    const row = (k, v) => `<tr><td style="padding:3px 10px 3px 0;color:#94a3b8">${k}</td><td style="padding:3px 0"><b>${v}</b></td></tr>`;
    const t = a.acc != null && a.hasDel ? `<table style="font-size:13px;border-collapse:collapse">
      ${row('Swing', `${a.lo.toFixed(1)} → ${a.ph.toFixed(1)} (+${a.swingPct.toFixed(0)} %), ${a.fromPeak} sessions since the high`)}
      ${row('Net accumulation on the way up', `${lk(a.acc)} shares <span style="color:#94a3b8;font-weight:400">(delivered on up days ${lk(a.accUp)} − on down days ${lk(a.accDn)})</span>`)}
      ${row('Exited since the peak (net)', a.exitPct == null ? '—' : `${lk(a.exitNet)} shares = <span style="color:${a.exitPct >= 50 ? '#ef4444' : '#f59e0b'}">${a.exitPct.toFixed(0)} %</span> <span style="color:#94a3b8;font-weight:400">(down days ${lk(a.sDn)} − up days ${lk(a.sUp)})</span>`)}
      ${row('Delivery % (rally → since peak)', `${f1(a.delPctRally)} % → ${f1(a.delPctFall)} %`)}
      ${row('Volume now vs peak time', `5-day avg ${lk(a.v5)} = ${a.dry == null ? '—' : (a.dry * 100).toFixed(0) + ' %'} of peak-time ${lk(a.vPeak)}`)}
      ${row('Last 5 days delivery %', f1(a.d5) + ' %')}
      ${row('Price vs levels', `${a.last.c.toFixed(1)} — ${(a.ret * 100).toFixed(0)} % retraced; nearest ${(a.near[0] * 100).toFixed(1)} % level ${a.near[1].toFixed(1)}`)}
    </table>` : '<div class="note">No delivery data for this stock in the file yet — showing price and levels only.</div>';
    return `<div style="border:1px solid ${c};border-left:6px solid ${c};border-radius:10px;padding:12px;margin:10px 0">
      <div style="font-size:16px"><b>${E(a.sym)}</b> &nbsp;<span style="color:${c};font-weight:700">${E(st[0])}</span></div>
      <p style="margin:6px 0 10px">${E(st[1])}</p>${a.flag ? `<p style="color:#f59e0b;margin:0 0 8px">⚠ ${E(a.flag)}</p>` : ''}
      ${svg(a)}<div style="margin-top:8px">${t}</div>${a.covNote ? `<p style="color:#94a3b8;font-size:12px">${E(a.covNote)}</p>` : ''}${a.short ? '<p style="color:#94a3b8;font-size:12px">Recently listed — only ' + a.B.length + ' sessions of history, so every figure here rests on a short record.</p>' : ''}</div>`;
  }

  async function run(sym) {
    sym = String(sym || '').trim().toUpperCase().replace(/\.NS$/, ''); if (!sym || R.busy) return; R.sym = sym; R.busy = true; R.msg = 'Loading ' + sym + '…'; paint();
    try {
      const dl = await loadDeliv(); const ch = await fetchChart((typeof symYf === 'function' ? symYf(sym) : sym + '.NS'), '1y', '1d');
      R.res = analyse(sym, (ch && ch.bars) || [], delivOf(sym, dl)); R.msg = '';
    } catch (e) { R.res = { sym, err: 'Could not load: ' + e.message }; R.msg = ''; }
    R.busy = false; paint();
  }
  async function scan() {
    if (R.scanBusy) return; R.scanBusy = true; R.scan = []; paint();
    try {
      if (typeof wlEnsure === 'function') await wlEnsure(); const syms = ((window.WL && WL.store && (WL.store.lists || []).find((l) => l.id === WL.store.active)) || { syms: [] }).syms || [];
      const dl = await loadDeliv(); const list = syms.slice(0, 25);
      for (const s of list) { try { const raw = String(s).replace(/\.NS$/, ''); const ch = await fetchChart((typeof symYf === 'function' ? symYf(raw) : raw + '.NS'), '1y', '1d'); R.scan.push(analyse(raw, (ch && ch.bars) || [], delivOf(raw, dl))); paint(); } catch (e) { } await new Promise((r) => setTimeout(r, 1500)); }
    } catch (e) { }
    R.scanBusy = false; paint();
  }
  function scanTable() {
    if (!R.scan.length) return ''; const rank = { g: 0, a: 1, b: 2, r: 3, n: 4 };
    const rows = R.scan.filter((a) => !a.err).sort((x, y) => rank[x.state[2]] - rank[y.state[2]]);
    return `<div style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:13px"><tr><th>Stock</th><th>State</th><th>Exited</th><th>Volume vs peak</th><th>Near level</th></tr>${rows.map((a) => `<tr><td><a href="#" data-dv="${E(a.sym)}">${E(a.sym)}</a></td><td style="color:${CL[a.state[2]]}"><b>${E(a.state[0])}</b></td><td>${a.exitPct == null ? '—' : a.exitPct.toFixed(0) + ' %'}</td><td>${a.dry == null ? '—' : (a.dry * 100).toFixed(0) + ' %'}</td><td>${a.near ? (a.near[0] * 100).toFixed(1) + ' % ' + a.near[1].toFixed(0) : '—'}</td></tr>`).join('')}</table></div>`;
  }

  /* ---------- pre-market list (built nightly by pipeline/accum_scan.py) + live 10 AM confirmation ---------- */
  const AC = { j: null, err: '', live: null, liveMsg: '', busy: false };
  const NM = { SURGEQ: 'Quality surge', SURGEHOLD: 'Surge holding', RUNLOWDEL: 'Retail-heavy run', ABSORB: 'Absorption', SHAKE: 'Shakeout → quiet', HHHL: 'Higher highs/lows', FIBDRY: 'Fib level, volume dry', CLIMAX: 'Climax reversal', REDHEAVY: 'Red on heavy volume' };
  const istMin = () => { const d = new Date(Date.now() + 19800000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const istDow = () => new Date(Date.now() + 19800000).getUTCDay();
  const istDate = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  async function loadAccum() {
    if (AC.j || AC.err) return AC.j;
    try { const r = await fetch('data/accum.json?h=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); AC.j = await r.json(); }
    catch (e) { AC.err = 'List not published yet (' + e.message + ')'; }
    return AC.j;
  }
  async function confirmLive(auto) {
    if (AC.busy || !AC.j) return; const L = (AC.j.picks || []).concat(AC.j.exits || []); const syms = [...new Set(L.map((p) => p.sym))]; if (!syms.length) return;
    AC.busy = true; AC.liveMsg = 'Checking live prices…'; paint();
    try {
      const u = getBackend(); if (!u) throw new Error('Data backend not connected');
      const j = JSON.parse(await fetchWithTimeout(beUrl(u, 'action=liveq&symbols=' + encodeURIComponent(syms.map((x) => x + '.NS').join(','))), 45000));
      if (!j || !j.ok) throw new Error('no quotes');
      AC.live = {}; Object.keys(j.q).forEach((k) => { AC.live[k.replace(/\.NS$/, '')] = j.q[k]; }); AC.liveAt = Date.now(); AC.liveMsg = '';
      try { localStorage.setItem('jc_dv_conf', istDate()); } catch (e) { }
    } catch (e) { AC.liveMsg = 'Live check failed: ' + e.message; }
    AC.busy = false; paint();
  }
  function status(p) {
    const q = AC.live && AC.live[p.sym]; if (!q) return ['', '#94a3b8', ''];
    const px = q[0], pc = q[1], h = q[3], v = q[5], av = q[6], m = istMin(), frac = Math.min(1, Math.max((m - 555) / 375, 0.06)), pace = av > 0 ? v / (av * frac) : null;
    const t = `${px.toFixed(2)} (${((px / pc - 1) * 100).toFixed(1)} %)${pace != null ? ', volume pace ' + pace.toFixed(1) + '×' : ''}`;
    if (px <= p.stop) return ['FAILED — at/below stop', '#ef4444', t];
    if (px >= p.trigger) return ['TRIGGERED — above ' + p.trigger, '#22c55e', t];
    if (px >= p.close * 0.995 && (pace == null || pace >= 0.8)) return ['CONFIRMED — holding the close', '#38bdf8', t];
    return ['WAIT — weak so far', '#f59e0b', t];
  }
  function statsTable(j) {
    const order = ['SURGEQ', 'SURGEHOLD', 'RUNLOWDEL', 'CLIMAX', 'REDHEAVY', 'ABSORB', 'SHAKE', 'HHHL', 'FIBDRY'], b = j.stats.BASE, ev = { 'modest edge': '#22c55e', 'weak exit tendency': '#f59e0b', 'no edge': '#94a3b8', 'small sample': '#94a3b8' };
    return `<details style="margin:8px 0"><summary><b>Track record of each signal</b> (${j.sessions} sessions, ${j.stocks} stocks; entry next-session open; random-day baseline: win ${b.win20} % at 20 days, avg ${b.r20} %)</summary>
      <div style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:12.5px"><tr><th>Signal</th><th>Cases</th><th>Avg 10d</th><th>Avg 20d</th><th>Win 20d</th><th>Hit +5 % within 20d</th><th>Avg worst dip</th><th>Median day of high</th><th>1st half → 2nd half (win 20d)</th><th>Reading</th></tr>
      ${order.map((k) => { const x = j.stats[k]; if (!x) return ''; return `<tr><td title="${E((j.method || {})[k] || '')}">${E(NM[k] || k)}</td><td>${x.n}</td><td>${x.r10} %</td><td>${x.r20} %</td><td>${x.win20} %</td><td>${x.p5_20} %</td><td>${x.mae} %</td><td>day ${x.pkday}</td><td>${(x.h1 && x.h1.n ? x.h1.win20 + ' % (' + x.h1.n + ')' : '—')} → ${(x.h2 && x.h2.n ? x.h2.win20 + ' % (' + x.h2.n + ')' : '—')}</td><td style="color:${ev[x.evidence]}"><b>${E(x.evidence)}</b></td></tr>`; }).join('')}</table></div>
      <p style="font-size:12px;color:#94a3b8">One year, one market phase, overlapping cases — a modest edge here is not a guarantee. "Absorption / shakeout / higher-high-low / Fibonacci-dry" showed no edge over a random day in this data; they are shown as context only.</p></details>`;
  }
  function resultsStats(j) {
    const r = j.results_stats; if (!r || !r.all) return '';
    const rows = [['All results', r.all], ['After +10 % run-up (10 sessions)', r.run_up_10pct], ['After +5–10 % run-up', r.run_up_5_10], ['After +5 % run-up on 1.5× volume', r.run_up_on_volume], ['Flat before', r.flat], ['After a fall of 5 %+', r.sold_off]];
    return `<details style="margin:8px 0"><summary><b>Results-day behaviour</b> (${r.all.n} results events, same 200 sessions) — does a run-up before results mean selling after?</summary><div style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:12.5px"><tr><th>Before the results</th><th>Events</th><th>Avg move (results day + next)</th><th>Fell</th><th>Avg size of move</th><th>Next 5 sessions</th></tr>${rows.map(([k, x]) => `<tr><td>${E(k)}</td><td>${x.n}</td><td>${x.react != null ? x.react + ' %' : '—'}</td><td>${x.neg != null ? x.neg + ' %' : '—'}</td><td>${x.absmove != null ? '±' + x.absmove + ' %' : '—'}</td><td>${x.follow5 != null ? x.follow5 + ' %' : '—'}</td></tr>`).join('')}</table></div><p style="font-size:12px;color:#94a3b8">A run-up before results did not, on average, lead to selling on the results in this data; the typical results move is about ±4–5 % either way, so stops tighter than that are likely to be hit by the results noise.</p></details>`;
  }
  function pickRows(L, withStatus) {
    return `<div style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:12.5px"><tr><th>Stock</th><th>Close</th><th>Signals</th><th>Why</th><th>Trigger / stop</th><th>Plan exit by</th><th>Delivery 5d</th>${withStatus ? '<th>Live status</th>' : ''}</tr>
      ${L.map((p) => { const s = withStatus ? status(p) : null; return `<tr><td><a href="#" data-dv="${E(p.sym)}"><b>${E(p.sym)}</b></a></td><td>${p.close}</td><td>${p.sigs.map((k) => E(NM[k] || k)).join(', ')}</td><td style="max-width:320px">${E(p.why.join(' · '))}</td><td>${p.trigger ? 'above ' + p.trigger + ' / stop ' + p.stop : '—'}</td><td>${p.exit_by ? 'about session ' + p.exit_by : '—'}</td><td>${p.dp5 != null ? p.dp5 + ' %' : '—'}</td>${withStatus ? `<td style="color:${s[1]}"><b>${E(s[0] || '—')}</b><br><span style="font-size:11px;color:#94a3b8">${E(s[2])}</span></td>` : ''}</tr>`; }).join('')}</table></div>`;
  }
  function accumHTML() {
    const j = AC.j; if (!j) return `<div class="note" style="margin:8px 0">${E(AC.err || 'Loading the pre-market list…')}</div>`;
    const exits = (j.exits || []).map((p) => ({ ...p, trigger: null, stop: null }));
    return `<div style="border:1px solid #334155;border-radius:10px;padding:12px;margin:10px 0">
      <div style="font-size:16px"><b>Pre-market list</b> <span style="color:#94a3b8;font-size:12px">built from NSE delivery + prices as of ${E(j.asof)} (${E(String(j.updated || '').replace('T', ' ').slice(0, 16))} IST), updated nightly after NSE posts</span></div>
      <p style="margin:6px 0;font-size:13px">Stocks where the big-hands signatures that held up in the back-test fired on the last sessions. Each is a candidate to confirm live, not a call. <b>Entry plan:</b> check at 10 AM; use the stop shown; plan the exit around the listed session count or earlier on an exit-watch signal.</p>
      <div class="bar2"><button class="btn" id="dvConf">${AC.busy ? 'Checking…' : 'Confirm now (live, one quote call)'}</button> <span style="font-size:12px;color:#94a3b8">${AC.liveAt ? 'last live check ' + new Date(AC.liveAt + 19800000).toISOString().slice(11, 16) + ' IST' : 'auto-runs once between 9:55 and 10:30 when this panel is open'}</span></div>
      ${AC.liveMsg ? `<div class="note">${E(AC.liveMsg)}</div>` : ''}
      <h4 style="margin:10px 0 4px">Accumulation / continuation candidates (${(j.picks || []).length}${j.picks_total > (j.picks || []).length ? ' of ' + j.picks_total : ''})</h4>${(j.picks || []).length ? pickRows(j.picks, true) : '<div class="note">None fired on the last sessions.</div>'}
      <h4 style="margin:10px 0 4px">Exit / avoid watch (${exits.length})</h4>${exits.length ? pickRows(exits, true) : '<div class="note">No climax or red-heavy-volume reversal after a 20 % run on the last sessions.</div>'}
      ${(j.results_watch || []).length ? `<h4 style="margin:10px 0 4px">Results due within a week after a run-up (${j.results_watch.length}) — risk flag, not a sell signal</h4><div style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:12.5px"><tr><th>Stock</th><th>Results</th><th>Run-up</th><th>What history says</th></tr>${j.results_watch.map((w) => `<tr><td><a href="#" data-dv="${E(w.sym)}"><b>${E(w.sym)}</b></a></td><td>${E(w.date)}</td><td>+${w.pre} %</td><td>${E(w.why)}</td></tr>`).join('')}</table></div>` : ''}
      ${resultsStats(j)}
      ${(j.watch || []).length ? `<details style="margin:8px 0"><summary>Context only — ${j.watch_total} stocks with absorption / shakeout / higher-low / Fibonacci-dry signals (no tested edge)</summary>${pickRows(j.watch, false)}</details>` : ''}
      ${statsTable(j)}
      <p style="font-size:12px;color:#94a3b8">Research view, not advice or a guarantee. The 10 AM confirmation rules are not back-tested (no intraday history is stored); delivery data is end-of-day, so a signal is always at least one session old.</p></div>`;
  }

  function paint() {
    const el = $('pDeliv'); if (!el || !el.classList.contains('active')) return;
    const upd = R.dl && R.dl.updated ? 'Delivery file updated ' + R.dl.updated.replace('T', ' ').slice(0, 16) + ' IST · ' + Object.keys(R.dl.d || {}).length + ' sessions' : '';
    el.innerHTML = `<div class="note" style="margin-bottom:8px"><b>Accumulation &amp; Exit (delivery).</b> How much a stock accumulated on the way up, how much has exited since the peak, whether volume is drying up, and where the 38.2 / 50 / 61.8 / 78.6 % retracement levels sit. Past volume only — a research view, not a forecast or advice. ${E(upd)}</div>
      ${accumHTML()}
      <div class="bar2"><label>Stock <input class="sel" id="dvSym" value="${E(R.sym)}" style="width:130px;text-transform:uppercase"></label> <button class="btn" id="dvGo">Analyse</button> <button class="btn" id="dvScan">Scan active watchlist (max 25)</button> ${['HSCL', 'HEROMOTORS', 'HFCL'].map((s) => `<a href="#" data-dv="${s}" style="margin-left:8px">${s}</a>`).join('')}</div>
      ${R.dlErr ? `<div class="note" style="color:#f59e0b">${E(R.dlErr)}</div>` : ''}${R.msg ? `<div class="note">${E(R.msg)}</div>` : ''}
      ${R.scanBusy ? '<div class="note">Scanning the watchlist one stock at a time…</div>' : ''}${scanTable()}${R.res ? card(R.res) : ''}`;
  }
  document.addEventListener('click', (e) => {
    const c = (q) => e.target.closest && e.target.closest(q); if (!c('#pDeliv')) return;
    const a = c('[data-dv]'); if (a) { e.preventDefault(); run(a.getAttribute('data-dv')); return; }
    if (c('#dvGo')) run(($('dvSym') || {}).value); else if (c('#dvScan')) scan(); else if (c('#dvConf')) confirmLive();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.id === 'dvSym') run(e.target.value); });
  function build0() {
    const sel = $('viewSel'), anchor = document.querySelector('details.datasec'); if (!sel || !anchor || $('pDeliv')) return;
    const o = document.createElement('option'); o.value = 'pDeliv'; o.textContent = '📦 Accumulation & Exit (delivery)'; const g = sel.querySelector('optgroup'); (g || sel).appendChild(o);
    const p = document.createElement('div'); p.className = 'panel'; p.id = 'pDeliv'; p.innerHTML = '<div class="note">Loading…</div>'; anchor.parentNode.insertBefore(p, anchor);
    const orig = window.showTab; window.showTab = function (id) { orig(id); if (id === 'pDeliv') { paint(); loadAccum().then(() => { paint(); const m = istMin(), d = istDow(); let done = ''; try { done = localStorage.getItem('jc_dv_conf') || ''; } catch (e) { } if (d >= 1 && d <= 5 && m >= 595 && m <= 630 && done !== istDate()) confirmLive(true); }); if (!R.res && !R.busy) run(R.sym); } };
  }
  window.JCDeliv = { analyse, run, loadDeliv };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build0); else build0();
})();
