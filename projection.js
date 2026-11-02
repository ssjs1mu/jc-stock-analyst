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
      const s = by[d] || (by[d] = { date: d, cl: new Array(NB).fill(null), op: new Array(NB).fill(null), hi: new Array(NB).fill(null), lo: new Array(NB).fill(null) });
      s.cl[i] = b.c; s.op[i] = isFinite(b.o) ? b.o : b.c; s.hi[i] = isFinite(b.h) ? b.h : b.c; s.lo[i] = isFinite(b.l) ? b.l : b.c;
    });
    return Object.keys(by).sort().map((d) => {
      const s = by[d]; let n = 0, lastv = null;
      for (let i = 0; i < NB; i++) { if (s.cl[i] != null) { lastv = s.cl[i]; n = i + 1; } else if (lastv != null) { s.cl[i] = lastv; s.op[i] = lastv; s.hi[i] = lastv; s.lo[i] = lastv; } }
      const first = s.cl.findIndex((x) => x != null);
      if (first > 0) for (let i = 0; i < first; i++) { s.cl[i] = s.cl[first]; s.op[i] = s.op[first]; s.hi[i] = s.hi[first]; s.lo[i] = s.lo[first]; }
      return { date: d, o: s.op[0], c: s.cl, oo: s.op, hh: s.hi, ll: s.lo, n, complete: n >= NB - 3 };
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

  /* typical wick sizes (% of price) from the last sessions, used to give projected candles realistic shadows */
  function wickStats(L) {
    let u = 0, l = 0, n = 0;
    L.slice(-30).forEach((s) => { for (let i = 0; i < NB; i++) { const c = s.c[i]; if (!c) continue; u += (s.hh[i] - Math.max(s.oo[i], c)) / c; l += (Math.min(s.oo[i], c) - s.ll[i]) / c; n++; } });
    return { u: n ? Math.max(0, u / n) : 0.0005, l: n ? Math.max(0, l / n) : 0.0005 };
  }
  function predCandles(P, w) {
    return P.pts.map((c, i) => { const o = i ? P.pts[i - 1] : P.ref; return { o, c, h: Math.max(o, c) * (1 + w.u), l: Math.min(o, c) * (1 - w.l) }; });
  }
  /* time-bound up / down phases of the projected path (zig-zag on a lightly smoothed path) */
  function phases(P, k) {
    const m = P.pts.length, sm = P.pts.map((_, i) => { let a = 0, n = 0; for (let j = Math.max(0, i - 3); j <= Math.min(m - 1, i + 3); j++) { a += P.pts[j]; n++; } return a / n; });
    const th = 0.0005; let dir = 0, ext = 0, pv = [0], last = 0;
    for (let i = 1; i < m; i++) {
      if (dir === 0) { if (sm[i] >= sm[last] * (1 + th)) { dir = 1; ext = i; } else if (sm[i] <= sm[last] * (1 - th)) { dir = -1; ext = i; } }
      else if (dir === 1) { if (sm[i] > sm[ext]) ext = i; else if (sm[i] <= sm[ext] * (1 - th)) { pv.push(ext); last = ext; dir = -1; ext = i; } }
      else { if (sm[i] < sm[ext]) ext = i; else if (sm[i] >= sm[ext] * (1 + th)) { pv.push(ext); last = ext; dir = 1; ext = i; } }
    }
    pv.push(m - 1);
    const seg = [];
    for (let q = 0; q < pv.length - 1; q++) {
      const a = pv[q], b = pv[q + 1]; if (b <= a) continue;
      const from = a === 0 ? P.ref : P.pts[a], to = P.pts[b], pc = (to / from - 1) * 100;
      if (seg.length && b - a < 6) { seg[seg.length - 1].b = k + b; seg[seg.length - 1].to = to; seg[seg.length - 1].pct = (to / seg[seg.length - 1].from - 1) * 100; seg[seg.length - 1].dir = seg[seg.length - 1].pct >= 0 ? 1 : -1; continue; }
      seg.push({ a: k + a, b: k + b, from, to, pct: pc, dir: pc >= 0 ? 1 : -1 });
    }
    return seg;
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
      let mae = 0, naive = 0, inb = 0, ch = 0, chn = 0;
      for (let i = 0; i < m; i++) {
        mae += Math.abs(P.pts[i] - act[i]) / ref * 100; naive += Math.abs(act[i] - ref) / ref * 100; if (act[i] >= P.lo[i] && act[i] <= P.hi[i]) inb++;
        const pa = i ? P.pts[i - 1] : ref, aa = i ? act[i - 1] : ref, pd = P.pts[i] - pa, ad = act[i] - aa;
        if (ad !== 0) { chn++; if ((pd >= 0) === (ad > 0)) ch++; }
      }
      const ph = phases(P, k), pres = ph.map((g) => { const a0 = g.a === k ? ref : L[s].c[g.a], mv = (L[s].c[g.b] / a0 - 1) * 100; return { g, mv, hit: Math.abs(g.pct) < 0.03 ? Math.abs(mv) < 0.1 : (mv >= 0) === (g.pct >= 0) }; });
      const flat = Math.abs(aFinal) < 0.15 && Math.abs(P.finalPct) < 0.15;
      const candles = []; for (let i = k; i < NB; i++) candles.push({ o: L[s].oo[i], h: L[s].hh[i], l: L[s].ll[i], c: L[s].c[i] });
      return { date: L[s].date, k, ref, P, act, candles, phases: pres, phaseHit: pres.filter((x) => x.hit).length, aFinal, pFinal: P.finalPct, hit: flat || (aFinal >= 0) === (P.finalPct >= 0), mae: mae / m, naive: naive / m, cover: inb / m * 100, candleHit: chn ? ch / chn * 100 : 0 };
    }).filter(Boolean);
  }

  function summary(bt) {
    if (!bt.length) return null;
    return { n: bt.length, hits: bt.filter((b) => b.hit).length, mae: mean(bt.map((b) => b.mae)), naive: mean(bt.map((b) => b.naive)), cover: mean(bt.map((b) => b.cover)), beat: bt.filter((b) => b.mae < b.naive).length, candle: mean(bt.map((b) => b.candleHit)), phHits: bt.reduce((a, b) => a + b.phaseHit, 0), phTot: bt.reduce((a, b) => a + b.phases.length, 0) };
  }

  function nextDate(d) { const t = new Date(d + 'T00:00:00Z'); do t.setUTCDate(t.getUTCDate() + 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6); return t.toISOString().slice(0, 10); }

  /* main entry: bars = 60d of 5-minute bars; live = is the market open on the last session */
  function project(bars, live, nowSec) {
    const L = sessionsOf(bars);
    if (L.length < MINTRAIN + 3) return { ok: false, reason: 'Not enough 5-minute history (' + L.length + ' sessions) to fit and check a projection.' };
    const lastS = L[L.length - 1], wick = wickStats(L.filter((x) => x.complete));
    let k = 0, target, s, known = null, label, knownC = [];
    if (live && !lastS.complete && lastS.n > 0) {          // projecting the rest of today
      lastS.live = true; k = lastS.n; s = L.length - 1; known = { o: lastS.o, c: lastS.c.slice(0, k) }; target = lastS.date; label = 'Rest of today';
      for (let i = 0; i < k; i++) knownC.push({ o: lastS.oo[i], h: lastS.hh[i], l: lastS.ll[i], c: lastS.c[i] });
    } else {                                               // next trading session, from the last close
      L.push({ date: nextDate(lastS.date), o: null, c: new Array(NB).fill(lastS.c[NB - 1]), n: 0, complete: false, future: true });
      s = L.length - 1; target = L[s].date; label = 'Next trading session';
    }
    const P = predict(L, s, k, known);
    if (!P) return { ok: false, reason: 'Not enough completed sessions to train the projection.' };
    const bt = backtest(L.filter((x) => !x.future), k, 5);
    return { ok: true, label, target, k, live: k > 0, known: known ? known.c : [], knownC, P, cand: predCandles(P, wick), phases: phases(P, k), wick, bt, sum: summary(bt), sessions: L.length - (L[L.length - 1].future ? 1 : 0), prevClose: k > 0 ? L[s - 1].c[NB - 1] : lastS.c[NB - 1], nowSec };
  }

  /* ---------------- drawing ---------------- */
  const fx = (v, d) => (isFinite(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '—');
  const timeLbl = (i) => { const m = 9 * 60 + 15 + i * 5; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const UP = '#12894b', DN = '#c0102e';

  /* candlestick chart: o = {k, known:[candles], pred:[candles], actual:[candles], phases, P, ref, w, h, small}
     stripes behind the candles mark the projected UP (green) and DOWN (red) time windows; actual candles are solid, projected candles are hollow with a gold outline */
  function candleSvg(o) {
    const w = o.w, h = o.h, pad = o.small ? { l: 4, r: 4, t: 6, b: 15 } : { l: 62, r: 12, t: 22, b: 24 }, k = o.k;
    const all = [];
    [o.known, o.pred, o.actual].forEach((a) => (a || []).forEach((c) => { all.push(c.h, c.l); }));
    all.push(o.ref);
    let mn = Math.min.apply(null, all), mx = Math.max.apply(null, all); const pv = (mx - mn) * 0.06 || mx * 0.001; mn -= pv; mx += pv;
    const X = (i) => pad.l + (w - pad.l - pad.r) * (i + 0.5) / NB, bw = Math.max(1.6, (w - pad.l - pad.r) / NB * 0.64), Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - mn) / (mx - mn));
    let g = '';
    (o.phases || []).forEach((p) => {
      const x0 = pad.l + (w - pad.l - pad.r) * p.a / NB, x1 = pad.l + (w - pad.l - pad.r) * (p.b + 1) / NB;
      g += `<rect x="${x0.toFixed(1)}" y="${pad.t}" width="${(x1 - x0).toFixed(1)}" height="${(h - pad.t - pad.b).toFixed(1)}" fill="${p.dir > 0 ? UP : DN}" fill-opacity=".09"/>`;
      if (!o.small) g += `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${pad.t - 7}" font-size="11" font-weight="800" text-anchor="middle" fill="${p.dir > 0 ? UP : DN}">${p.dir > 0 ? '▲' : '▼'} ${timeLbl(p.a)}–${timeLbl(p.b + 1)} ${fx(p.pct)}%</text>`;
    });
    if (!o.small) {
      for (let t = 0; t <= 4; t++) { const v = mn + (mx - mn) * t / 4, y = Y(v); g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e6ebf5"/><text x="${pad.l - 6}" y="${(y + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#5b6b8c">${fx(v, 1)}</text>`; }
    }
    [0, 12, 24, 36, 48, 60, 72].forEach((i) => { const x = pad.l + (w - pad.l - pad.r) * i / NB; if (!o.small) g += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pad.t}" y2="${h - pad.b}" stroke="#eef1f8"/>`; g += `<text x="${(x + 1).toFixed(1)}" y="${h - 5}" font-size="${o.small ? 8.5 : 10.5}" fill="#5b6b8c">${o.small && i % 24 ? '' : timeLbl(i)}</text>`; });
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(o.ref).toFixed(1)}" y2="${Y(o.ref).toFixed(1)}" stroke="#94a3c4" stroke-dasharray="2 4"/>`;
    const candle = (c, i, solid) => {
      const up = c.c >= c.o, col = up ? UP : DN, x = X(i), yo = Y(c.o), yc = Y(c.c), top = Math.min(yo, yc), bh = Math.max(1, Math.abs(yo - yc));
      return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(c.h).toFixed(1)}" y2="${Y(c.l).toFixed(1)}" stroke="${solid ? col : '#b8860b'}" stroke-width="1"/><rect x="${(x - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${solid ? col : '#fff'}" fill-opacity="${solid ? 1 : .75}" stroke="${solid ? col : '#b8860b'}" stroke-width="${solid ? 0 : 1.2}"/>`;
    };
    (o.known || []).forEach((c, i) => { g += candle(c, i, true); });
    (o.actual || []).forEach((c, i) => { g += candle(c, k + i, true); });
    if (o.P) g += `<path d="${o.P.pts.map((v, i) => (i ? 'L' : 'M') + X(k + i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ')}" fill="none" stroke="#b8860b" stroke-width="${o.small ? 1.5 : 2}" stroke-dasharray="${o.small ? '3 2' : '5 3'}"/>`;
    if (!o.actual) (o.pred || []).forEach((c, i) => { g += candle(c, k + i, false); });
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;max-width:${w}px" role="img">${g}</svg>`;
  }

  function html(R, sym) {
    if (!R.ok) return `<div class="note">${R.reason}</div>`;
    const P = R.P, dirUp = P.finalPct >= 0, S = R.sum;
    const endP = P.pts[P.pts.length - 1], hiP = Math.max.apply(null, R.cand.map((c) => c.h)), loP = Math.min.apply(null, R.cand.map((c) => c.l));
    const hiI = R.cand.findIndex((c) => c.h === hiP) + R.k, loI = R.cand.findIndex((c) => c.l === loP) + R.k;
    const dt = new Date(R.target + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
    const chip = (t, c) => `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-weight:800;font-size:12px;background:${c};color:#fff">${t}</span>`;
    const head = `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:6px"><b style="font-size:15px;color:#14306e">${R.label.toUpperCase()} · ${dt} · 5-MINUTE CANDLES</b>${chip('PREDICTION', '#b8860b')}${R.live ? chip('LIVE · cut-off ' + timeLbl(R.k - 1), '#08783a') : chip('MARKET CLOSED · from last close', '#5b6b8c')}</div>`;
    const stat = (cap, val, sub) => `<div style="flex:1;min-width:130px;padding:8px 12px;border:1px solid #d9e1f0;border-radius:10px;background:#fff"><div style="font-size:11px;color:#5b6b8c;font-weight:700">${cap}</div><div style="font-size:18px;font-weight:900;color:#14306e">${val}</div><div style="font-size:11px;color:#5b6b8c">${sub}</div></div>`;
    const stats = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">' +
      stat('Expected close', '₹' + fx(endP), `<b style="color:${dirUp ? UP : DN}">${dirUp ? '▲' : '▼'} ${fx(P.finalPct)}%</b> vs ${R.live ? 'now' : 'last close'} ₹${fx(P.ref)}`) +
      stat('Projected high / low', '₹' + fx(hiP, 1) + ' / ' + fx(loP, 1), 'around ' + timeLbl(hiI) + ' / ' + timeLbl(loI)) +
      stat('80% band at close', '₹' + fx(P.lo[P.lo.length - 1], 1) + ' – ' + fx(P.hi[P.hi.length - 1], 1), '± ' + fx(P.bandPct) + '%') +
      (S ? stat('Back-test hit rate (last ' + S.n + ')', fx(S.candle, 0) + '% candles', fx(S.phTot ? S.phHits * 100 / S.phTot : 0, 0) + '% phases · ' + S.hits + '/' + S.n + ' close dir.') : '') + '</div>';
    const main = candleSvg({ k: R.k, known: R.knownC, pred: R.cand, phases: R.phases, P, ref: P.ref, w: 940, h: 340 });
    const legend = '<div style="font-size:11px;color:#5b6b8c;margin:2px 0 8px"><b style="color:' + UP + '">▮</b>/<b style="color:' + DN + '">▮</b> actual candles · <b style="color:#b8860b">▯</b> projected candles (hollow) · <b style="color:#b8860b">╍</b> projected close path · <span style="background:#dff3e8;padding:0 6px">green</span>/<span style="background:#fbe3e6;padding:0 6px">red</span> stripes = projected UP / DOWN time windows · dotted = ' + (R.live ? 'cut-off price' : 'last close') + '</div>';
    const phRows = R.phases.map((p) => `<tr><td style="padding:3px 8px;font-weight:800;color:${p.dir > 0 ? UP : DN}">${p.dir > 0 ? '▲ UP' : '▼ DOWN'}</td><td style="padding:3px 8px">${timeLbl(p.a)} – ${timeLbl(p.b + 1)}</td><td style="padding:3px 8px;text-align:right">₹${fx(p.from, 1)} → ₹${fx(p.to, 1)}</td><td style="padding:3px 8px;text-align:right;font-weight:800;color:${p.dir > 0 ? UP : DN}">${fx(p.pct)}%</td></tr>`).join('');
    const phTable = `<table style="border-collapse:collapse;font-size:12px;margin:4px 0 10px;background:#fff;border:1px solid #d9e1f0;border-radius:8px"><tr style="color:#5b6b8c;font-size:11px"><th style="padding:3px 8px;text-align:left">Phase</th><th style="padding:3px 8px;text-align:left">Time (IST)</th><th style="padding:3px 8px;text-align:right">Price</th><th style="padding:3px 8px;text-align:right">Move</th></tr>${phRows}</table>`;
    const cards = R.bt.map((b) => {
      const d = new Date(b.date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
      const col = (v) => (v >= 60 ? UP : v >= 45 ? '#b87a00' : DN);
      return `<div style="flex:1 1 440px;min-width:300px;border:1px solid #d9e1f0;border-radius:10px;background:#fff;padding:7px 9px"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;font-size:12px;font-weight:800;color:#14306e"><span>${d}</span><span style="color:${b.hit ? UP : DN}">${b.hit ? '✓' : '✗'} close ${fx(b.pFinal)}% pred / ${fx(b.aFinal)}% actual</span></div>${candleSvg({ k: b.k, actual: b.candles, phases: b.phases.map((x) => x.g), P: b.P, ref: b.ref, w: 460, h: 150, small: true })}<div style="display:flex;flex-wrap:wrap;gap:10px;font-size:11.5px;margin-top:2px"><b style="color:${col(b.candleHit)}">Candle direction hit ${fx(b.candleHit, 0)}%</b><b style="color:${b.phaseHit * 2 >= b.phases.length ? UP : DN}">Phases ${b.phaseHit}/${b.phases.length} (${fx(b.phases.length ? b.phaseHit * 100 / b.phases.length : 0, 0)}%)</b><span style="color:#34456a">band held ${fx(b.cover, 0)}% · path err ${fx(b.mae)}% (flat ${fx(b.naive)}%)</span></div></div>`;
    }).join('');
    const verdict = S ? `Back-test (each day predicted using only the days before it, from the ${R.live ? 'same cut-off time' : 'open'}): ${fx(S.candle, 0)}% of 5-minute candles moved the way they were projected (50% = coin flip); ${S.phHits} of ${S.phTot} projected UP/DOWN windows were right; closing direction right ${S.hits}/${S.n}; the 80% band held ${fx(S.cover, 0)}% of closes.` : '';
    const edge = S ? (S.candle >= 55 && S.hits * 2 > S.n ? ' <b style="color:#08783a">Edge: modest but present over this window.</b>' : ' <b style="color:#c0102e">Edge: weak for this stock right now — read the candles as an expected range and timing, not a firm call.</b>') : '';
    return head + stats + main + legend + '<div style="font-weight:800;color:#14306e;font-size:13px;margin:4px 0 2px">PROJECTED UP / DOWN WINDOWS</div>' + phTable +
      `<div style="font-weight:800;color:#14306e;font-size:13px;margin:6px 0 4px">BACK-TEST — same logic on the last ${R.bt.length} sessions (actual candles; stripes = what was projected)</div><div style="display:flex;flex-wrap:wrap;gap:8px">${cards}</div>` +
      `<div style="font-size:12px;color:#34456a;margin-top:8px">${verdict}${edge}</div>` +
      `<div style="font-size:11px;color:#5b6b8c;margin-top:6px">Statistical projection from ${sym}'s own last ${P.n} sessions of 5-minute data (opening gap, move so far, previous day return, last-hour drift; ridge-shrunk). Projected candles are drawn from the projected close path with typical shadow sizes. A prediction, not a recommendation or a guarantee.</div>`;
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
