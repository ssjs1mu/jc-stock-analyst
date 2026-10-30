/* Joshi's Corner — 5-minute path projection for the selected stock, with a walk-forward self-check on the last 5 sessions.
   Model (deliberately simple and transparent): ridge regression, fitted on the stock's own previous ~40 sessions, of the whole remaining
   5-minute path (relative to the reference price) on four things known at the cut-off: opening gap, move since the open, previous day's return and
   previous day's last-hour drift. The band is the residual spread of those fits. Nothing here is a guarantee — it is a statistical projection.
   Check: each of the last 5 sessions is predicted using ONLY the sessions before it, from the same cut-off, then compared with what really happened. */
(function (root) {
  'use strict';
  const NB = 75, OPEN_SEC = 9 * 3600 + 15 * 60, MAXTRAIN = 40, MINTRAIN = 15;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) * (x - m)))); };
  const istDay = (t) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);

  /* bars [{t,o,h,l,c,v}] -> sessions [{date, o, c:[75 closes forward-filled], n, complete}] */
  function sessionsOf(bars) {
    const by = {};
    (bars || []).forEach((b) => {
      if (!b || !isFinite(b.c)) return;
      const d = istDay(b.t), sec = (b.t + 19800) % 86400, i = Math.round((sec - OPEN_SEC) / 300);
      if (i < 0 || i >= NB) return;
      const s = by[d] || (by[d] = { date: d, o: b.o, cl: new Array(NB).fill(null), hi: -Infinity, lo: Infinity });
      if (i === 0 || s.o == null) s.o = b.o;
      s.cl[i] = b.c; s.hi = Math.max(s.hi, b.h); s.lo = Math.min(s.lo, b.l);
    });
    return Object.keys(by).sort().map((d) => {
      const s = by[d]; let n = 0, lastv = null;
      for (let i = 0; i < NB; i++) { if (s.cl[i] != null) { lastv = s.cl[i]; n = i + 1; } else if (lastv != null) s.cl[i] = lastv; }
      let first = s.cl.findIndex((x) => x != null); if (first > 0) for (let i = 0; i < first; i++) s.cl[i] = s.cl[first];
      return { date: d, o: s.o, c: s.cl, n, complete: n >= NB - 3 };
    });
  }

  /* solve (A + lam I) x = b for each column of B; A is p x p */
  function solve(A, B, lam) {
    const p = A.length, m = B[0].length, M = A.map((r, i) => r.map((v, j) => v + (i === j ? lam : 0)).concat(B[i]));
    for (let c = 0; c < p; c++) {
      let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c] || 1e-9; for (let j = c; j < p + m; j++) M[c][j] /= d;
      for (let r = 0; r < p; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = c; j < p + m; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map((r) => r.slice(p));
  }

  /* features known at cut-off k for session index s of list L (needs L[s-1], L[s-2]) */
  function feats(L, s, k, known) {
    const prev = L[s - 1], pp = L[s - 2], pc = prev.c[NB - 1];
    const gap = k > 0 ? (known.o / pc - 1) * 100 : 0;
    const so = k > 0 ? (known.c[k - 1] / known.o - 1) * 100 : 0;
    const pr = pp ? (pc / pp.c[NB - 1] - 1) * 100 : 0;
    const lh = (pc / prev.c[NB - 13] - 1) * 100;
    return [gap, so, pr, lh];
  }

  /* predict the path from cut-off k for the session AFTER index `s-1` of L, using training sessions < s. `known` = {o, c[0..k-1]} or null. */
  function predict(L, s, k, known) {
    const tr = []; for (let j = Math.max(2, s - MAXTRAIN); j < s; j++) if (L[j].complete && L[j - 1].complete) tr.push(j);
    if (tr.length < MINTRAIN) return null;
    const m = NB - k, ref = k > 0 ? known.c[k - 1] : L[s - 1].c[NB - 1];
    const X = tr.map((j) => feats(L, j, k, L[j])), Z = tr.map((j) => {
      const r = k > 0 ? L[j].c[k - 1] : L[j - 1].c[NB - 1], o = [];
      for (let i = k; i < NB; i++) o.push((L[j].c[i] / r - 1) * 100); return o;
    });
    const p = 4, n = tr.length, mu = [0, 1, 2, 3].map((c) => mean(X.map((r) => r[c]))), sg = [0, 1, 2, 3].map((c) => Math.max(sd(X.map((r) => r[c])), 1e-6));
    const Xs = X.map((r) => r.map((v, c) => (v - mu[c]) / sg[c]));
    const zbar = []; for (let i = 0; i < m; i++) zbar.push(mean(Z.map((z) => z[i])));
    const A = [...Array(p)].map((_, a) => [...Array(p)].map((_, b) => Xs.reduce((s_, r) => s_ + r[a] * r[b], 0)));
    const B = [...Array(p)].map((_, a) => [...Array(m)].map((_, i) => Xs.reduce((s_, r, jx) => s_ + r[a] * (Z[jx][i] - zbar[i]), 0)));
    const beta = solve(A, B, n * 1.0);              // heavy shrinkage: the signal in intraday data is weak
    const xt = feats(L, s, k, known).map((v, c) => (v - mu[c]) / sg[c]).map((v) => Math.max(-2.5, Math.min(2.5, v)));
    const path = [], lo = [], hi = [], res = [];
    for (let i = 0; i < m; i++) {
      let f = 0.5 * zbar[i]; for (let a = 0; a < p; a++) f += xt[a] * beta[a][i];
      path.push(f);
      const r = Xs.map((row, jx) => { let q = 0.5 * zbar[i]; for (let a = 0; a < p; a++) q += row[a] * beta[a][i]; return Z[jx][i] - q; });
      res.push(sd(r) * Math.sqrt(n / Math.max(1, n - p - 1)));
    }
    for (let i = 0; i < m; i++) { const s80 = 1.28 * Math.max(res[i], 0.01); lo.push(ref * (1 + (path[i] - s80) / 100)); hi.push(ref * (1 + (path[i] + s80) / 100)); }
    return { k, ref, pts: path.map((z) => ref * (1 + z / 100)), lo, hi, finalPct: path[m - 1], bandPct: 1.28 * res[m - 1], n };
  }

  /* walk-forward check of the last `count` complete sessions, each from the same cut-off k */
  function backtest(L, k, count) {
    const idx = []; for (let s = L.length - 1; s >= 2 && idx.length < count; s--) if (L[s].complete && L[s - 1].complete && !L[s].live) idx.push(s);
    idx.reverse();
    return idx.map((s) => {
      const known = k > 0 ? { o: L[s].o, c: L[s].c.slice(0, k) } : null, P = predict(L, s, k, known);
      if (!P) return null;
      const act = L[s].c.slice(k), ref = P.ref, m = act.length;
      const aFinal = (act[m - 1] / ref - 1) * 100;
      let mae = 0, naive = 0, inb = 0;
      for (let i = 0; i < m; i++) { mae += Math.abs(P.pts[i] - act[i]) / ref * 100; naive += Math.abs(act[i] - ref) / ref * 100; if (act[i] >= P.lo[i] && act[i] <= P.hi[i]) inb++; }
      const flat = Math.abs(aFinal) < 0.15 && Math.abs(P.finalPct) < 0.15;
      return { date: L[s].date, k, ref, P, act, aFinal, pFinal: P.finalPct, hit: flat || (aFinal >= 0) === (P.finalPct >= 0), mae: mae / m, naive: naive / m, cover: inb / m * 100 };
    }).filter(Boolean);
  }

  function summary(bt) {
    if (!bt.length) return null;
    return { n: bt.length, hits: bt.filter((b) => b.hit).length, mae: mean(bt.map((b) => b.mae)), naive: mean(bt.map((b) => b.naive)), cover: mean(bt.map((b) => b.cover)), beat: bt.filter((b) => b.mae < b.naive).length };
  }

  function nextDate(d) { const t = new Date(d + 'T00:00:00Z'); do t.setUTCDate(t.getUTCDate() + 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6); return t.toISOString().slice(0, 10); }

  /* main entry: bars = 60d of 5-minute bars; live = is the market open on the last session */
  function project(bars, live, nowSec) {
    const L = sessionsOf(bars);
    if (L.length < MINTRAIN + 3) return { ok: false, reason: 'Not enough 5-minute history (' + L.length + ' sessions) to fit and check a projection.' };
    const lastS = L[L.length - 1];
    let k = 0, target, s, known = null, label;
    if (live && !lastS.complete && lastS.n > 0) {          // projecting the rest of today
      lastS.live = true; k = lastS.n; s = L.length - 1; known = { o: lastS.o, c: lastS.c.slice(0, k) }; target = lastS.date; label = 'Rest of today';
    } else {                                               // next trading session, from the last close
      L.push({ date: nextDate(lastS.date), o: null, c: new Array(NB).fill(lastS.c[NB - 1]), n: 0, complete: false, future: true });
      s = L.length - 1; target = L[s].date; label = 'Next trading session';
    }
    const P = predict(L, s, k, known);
    if (!P) return { ok: false, reason: 'Not enough completed sessions to train the projection.' };
    const bt = backtest(L.filter((x) => !x.future), k, 5);
    return { ok: true, label, target, k, live: k > 0, known: known ? known.c : [], P, bt, sum: summary(bt), sessions: L.length - (L[L.length - 1].future ? 1 : 0), prevClose: k > 0 ? L[s - 1].c[NB - 1] : lastS.c[NB - 1], nowSec };
  }

  /* ---------------- drawing ---------------- */
  const fx = (v, d) => (isFinite(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '—');
  const timeLbl = (i) => { const m = 9 * 60 + 15 + i * 5; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  function svgPath(vals, x0, X, Y) { return vals.map((v, i) => (i ? 'L' : 'M') + X(x0 + i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' '); }

  function chartSvg(o) {  // o: {known:[], k, P, act (optional), prev, w, h, small}
    const w = o.w, h = o.h, pad = o.small ? { l: 6, r: 6, t: 8, b: 16 } : { l: 64, r: 14, t: 14, b: 26 };
    const all = [].concat(o.known || [], o.P.lo, o.P.hi, o.act || [], [o.P.ref]);
    let mn = Math.min.apply(null, all), mx = Math.max.apply(null, all); const padv = (mx - mn) * 0.08 || mx * 0.001; mn -= padv; mx += padv;
    const X = (i) => pad.l + (w - pad.l - pad.r) * i / (NB - 1), Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - mn) / (mx - mn));
    const band = svgPath(o.P.hi, o.k, X, Y) + ' ' + o.P.lo.map((v, i) => 'L' + X(o.k + o.P.lo.length - 1 - i).toFixed(1) + ' ' + Y(o.P.lo[o.P.lo.length - 1 - i]).toFixed(1)).join(' ') + ' Z';
    let g = '';
    if (!o.small) {
      for (let t = 0; t <= 4; t++) { const v = mn + (mx - mn) * t / 4, y = Y(v); g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e2e8f3"/><text x="${pad.l - 6}" y="${(y + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#5b6b8c">${fx(v, 1)}</text>`; }
    }
    [0, 21, 45, 74].forEach((i) => { g += `<text x="${X(i).toFixed(1)}" y="${h - 5}" font-size="${o.small ? 9 : 11}" text-anchor="${i === 0 ? 'start' : i === 74 ? 'end' : 'middle'}" fill="#5b6b8c">${timeLbl(i)}</text>`; });
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(o.P.ref).toFixed(1)}" y2="${Y(o.P.ref).toFixed(1)}" stroke="#94a3c4" stroke-dasharray="2 4"/>`;
    g += `<path d="${band}" fill="#c99a1c" fill-opacity=".16" stroke="none"/>`;
    if (o.known && o.known.length) g += `<path d="${svgPath(o.known, 0, X, Y)}" fill="none" stroke="#14306e" stroke-width="${o.small ? 1.6 : 2.4}"/>`;
    if (o.act) g += `<path d="${svgPath(o.act, o.k, X, Y)}" fill="none" stroke="#14306e" stroke-width="${o.small ? 1.6 : 2.4}"/>`;
    g += `<path d="${svgPath(o.P.pts, o.k, X, Y)}" fill="none" stroke="#b8860b" stroke-width="${o.small ? 1.6 : 2.6}" stroke-dasharray="${o.small ? '4 3' : '7 5'}"/>`;
    if (o.k > 0 && o.known.length) { const x = X(o.k - 1), y = Y(o.known[o.known.length - 1]); g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#14306e" stroke="#fff" stroke-width="2"/>`; }
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;max-width:${w}px" role="img">${g}</svg>`;
  }

  function html(R, sym) {
    if (!R.ok) return `<div class="note">${R.reason}</div>`;
    const P = R.P, dirUp = P.finalPct >= 0, S = R.sum;
    const endP = P.pts[P.pts.length - 1], hiP = Math.max.apply(null, P.pts), loP = Math.min.apply(null, P.pts);
    const hiI = P.pts.indexOf(hiP) + R.k, loI = P.pts.indexOf(loP) + R.k;
    const dt = new Date(R.target + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
    const chip = (t, c) => `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-weight:800;font-size:12px;background:${c};color:#fff">${t}</span>`;
    let head = `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:6px"><b style="font-size:15px;color:#14306e">${R.label.toUpperCase()} · ${dt}</b>${chip('PREDICTION', '#b8860b')}${R.live ? chip('LIVE · cut-off ' + timeLbl(R.k - 1), '#08783a') : chip('MARKET CLOSED · from last close', '#5b6b8c')}</div>`;
    const stat = (cap, val, sub) => `<div style="flex:1;min-width:130px;padding:8px 12px;border:1px solid #d9e1f0;border-radius:10px;background:#fff"><div style="font-size:11px;color:#5b6b8c;font-weight:700">${cap}</div><div style="font-size:18px;font-weight:900;color:#14306e">${val}</div><div style="font-size:11px;color:#5b6b8c">${sub}</div></div>`;
    const stats = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">` +
      stat('Expected close', '₹' + fx(endP), `<b style="color:${dirUp ? '#08783a' : '#c0102e'}">${dirUp ? '▲' : '▼'} ${fx(P.finalPct)}%</b> vs ${R.live ? 'now' : 'last close'} ₹${fx(P.ref)}`) +
      stat('80% band at close', '₹' + fx(P.lo[P.lo.length - 1], 1) + ' – ' + fx(P.hi[P.hi.length - 1], 1), '± ' + fx(P.bandPct) + '%') +
      stat('Likely high / low', '₹' + fx(hiP, 1) + ' / ' + fx(loP, 1), 'around ' + timeLbl(hiI) + ' / ' + timeLbl(loI)) +
      (S ? stat('Self-check, last ' + S.n, S.hits + '/' + S.n + ' direction', 'path error ' + fx(S.mae) + '% vs ' + fx(S.naive) + '% flat-line · band held ' + fx(S.cover, 0) + '%') : '') + `</div>`;
    const main = chartSvg({ known: R.known, k: R.k, P, prev: R.prevClose, w: 900, h: 300 });
    const legend = `<div style="font-size:11px;color:#5b6b8c;margin:2px 0 8px"><b style="color:#14306e">━</b> actual · <b style="color:#b8860b">╍</b> predicted path · <span style="color:#c99a1c">▇</span> 80% band · dotted = ${R.live ? 'cut-off price' : 'last close'}</div>`;
    const rows = R.bt.map((b) => {
      const d = new Date(b.date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
      return `<div style="flex:1;min-width:165px;border:1px solid #d9e1f0;border-radius:10px;background:#fff;padding:6px 8px"><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:#14306e"><span>${d}</span><span style="color:${b.hit ? '#08783a' : '#c0102e'}">${b.hit ? '✓ direction' : '✗ direction'}</span></div>${chartSvg({ known: R.k ? [] : [], k: b.k, P: b.P, act: b.act, w: 200, h: 90, small: true })}<div style="font-size:10.5px;color:#34456a;line-height:1.35">pred ${fx(b.pFinal)}% · actual ${fx(b.aFinal)}%<br>path err ${fx(b.mae)}% (flat ${fx(b.naive)}%) · band ${fx(b.cover, 0)}%</div></div>`;
    }).join('');
    const verdict = S ? `Over the last ${S.n} sessions the same method, trained only on the days before each one, called the direction right ${S.hits} times and tracked the intraday path closer than a flat line ${S.beat} times; the 80% band contained ${fx(S.cover, 0)}% of the 5-minute closes (target ≈ 80%).` + (S.hits <= Math.floor(S.n / 2) || S.beat <= Math.floor(S.n / 2) ? ' <b style="color:#c0102e">Edge is weak for this stock right now — read the path as an expected range, not a directional call.</b>' : ' <b style="color:#08783a">The method has been tracking this stock reasonably over the check window.</b>') : '';
    return head + stats + main + legend + `<div style="font-weight:800;color:#14306e;font-size:13px;margin:6px 0 4px">SELF-CHECK — same logic applied to the last ${R.bt.length} sessions${R.live ? ' (from the same cut-off time)' : ' (from the open)'}</div><div style="display:flex;flex-wrap:wrap;gap:8px">${rows}</div>` +
      `<div style="font-size:12px;color:#34456a;margin-top:8px">${verdict}</div>` +
      `<div style="font-size:11px;color:#5b6b8c;margin-top:6px">Statistical projection from ${sym}'s own last ${P.n} sessions of 5-minute data (opening gap, move so far, previous day return and last-hour drift; ridge-shrunk). A prediction, not a recommendation or a guarantee — news, results and global cues can break it.</div>`;
  }

  /* ---------------- page wiring ---------------- */
  let timer = null, seq = 0;
  async function run(R) {
    const box = root.document && root.document.getElementById('projPanel'); if (!box) return;
    const my = ++seq; clearTimeout(timer);
    box.style.display = 'block';
    const body = box.querySelector('.pbody'), sym = R.sym;
    body.innerHTML = '<div class="note">Building the 5-minute projection and self-check for ' + sym + '…</div>';
    try {
      const f = await root.fetchChart(`${R.sym}.${R.exch}`, '60d', '5m');
      if (my !== seq) return;
      const out = project(f.bars, !!R.live, Date.now() / 1000);
      body.innerHTML = out.ok ? html(out, sym) : '<div class="note">' + out.reason + '</div>';
      if (out.ok && out.live) timer = setTimeout(() => run(R), 300000);
    } catch (e) {
      if (my === seq) body.innerHTML = '<div class="note">5-minute history could not be fetched for ' + sym + ' right now (' + ((e && e.message) || e) + '). The projection needs it — try again shortly.</div>';
    }
  }

  root.JCProj = { run, project, sessionsOf, predict, backtest, html };
  if (typeof module !== 'undefined') module.exports = root.JCProj;
})(typeof window !== 'undefined' ? window : globalThis);
