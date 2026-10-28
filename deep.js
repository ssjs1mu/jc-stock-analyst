/* ============================================================
   Joshi's Corner — Deep Research core (deep.js)
   Pure analysis functions, no DOM. Used by deep/index.html and by Node tests.
   What it does for one symbol:
     • scans the last 15/30/45/60/75/90 trading days (daily bars) + intraday (15m) + NSE delivery levels
     • weekday behaviour, repeated 2-day patterns, swing/cycle spacing (with a shuffle test)
     • tags the biggest move days with news published around them
     • predicts the next 3 sessions (close range, next opens) with a WALK-FORWARD backtest:
       models are fitted only on the past at every test day, chosen on the first half of the test span,
       and scored on the untouched second half. A model is used only if it beats "no change" there.
     • astro lab: Moon position/tithi/nakshatra/aspects vs the stock's own returns, with a
       family-wise permutation test (so 90 tests do not produce fake "discoveries").
   Nothing here is a guarantee; every number carries its backtest.
   ============================================================ */
(function (root, factory) { if (typeof module !== 'undefined' && module.exports) module.exports = factory(); else root.JCDeep = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const HOL = ['2026-01-15', '2026-01-26', '2026-03-03', '2026-03-26', '2026-03-31', '2026-04-03', '2026-04-14', '2026-05-01', '2026-05-28', '2026-06-26', '2026-09-14', '2026-10-02', '2026-10-20', '2026-11-10', '2026-11-24', '2026-12-25'];
  const WIN = [15, 30, 45, 60, 75, 90];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const isNum = (v) => v !== null && v !== undefined && isFinite(v) && !isNaN(v);
  const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); };
  const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const quant = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };
  const istDate = (t) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);
  const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
  const addDays = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
  const isTrading = (iso) => { const d = dow(iso); return d !== 0 && d !== 6 && HOL.indexOf(iso) < 0; };
  const nextTrading = (iso) => { let d = addDays(iso, 1); while (!isTrading(d)) d = addDays(d, 1); return d; };
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pct = (x, d = 2) => (x * 100).toFixed(d);

  /* ---------- bars ---------- */
  /* bars: [{t (unix s), o,h,l,c,v}] daily. Returns clean ascending arrays; drops today's partial bar (kept as `live`). */
  function prep(bars, now) {
    const m = new Map();
    (bars || []).forEach((b) => { if (!b || !isNum(b.c) || b.c <= 0) return; const d = b.date || istDate(b.t); m.set(d, { date: d, o: isNum(b.o) && b.o > 0 ? b.o : b.c, h: isNum(b.h) && b.h > 0 ? b.h : b.c, l: isNum(b.l) && b.l > 0 ? b.l : b.c, c: b.c, v: isNum(b.v) ? b.v : 0 }); });
    let a = Array.from(m.values()).sort((x, y) => (x.date < y.date ? -1 : 1));
    a.forEach((b) => { b.h = Math.max(b.h, b.o, b.c); b.l = Math.min(b.l, b.o, b.c); });
    const ist = new Date((now || new Date()).getTime() + 19800000), today = ist.toISOString().slice(0, 10), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    let live = null, phase = 'closed';
    if (isTrading(today)) { if (mins < 555) phase = 'pre'; else if (mins < 930) phase = 'open'; }
    if (a.length && a[a.length - 1].date === today && phase === 'open') { live = { price: a[a.length - 1].c, open: a[a.length - 1].o, high: a[a.length - 1].h, low: a[a.length - 1].l }; a = a.slice(0, -1); }
    let exp = today; if (!(isTrading(today) && mins >= 945)) { exp = addDays(today, -1); while (!isTrading(exp)) exp = addDays(exp, -1); }
    return { bars: a, live, today, phase, minsLeft: phase === 'open' ? 930 - mins : 0, expected: exp };
  }

  /* ---------- series with volatility + features ---------- */
  function mkSeries(bars) {
    const n = bars.length, o = bars.map((b) => b.o), h = bars.map((b) => b.h), l = bars.map((b) => b.l), c = bars.map((b) => b.c);
    const r = new Array(n).fill(0); for (let i = 1; i < n; i++) r[i] = Math.log(c[i] / c[i - 1]);
    const sig = new Array(n).fill(0); let v = Math.pow(sd(r.slice(1, Math.min(n, 21))) || 0.015, 2);
    for (let i = 1; i < n; i++) { v = 0.94 * v + 0.06 * r[i] * r[i]; sig[i] = Math.max(Math.sqrt(v), 0.003); }
    sig[0] = sig[1] || 0.015;
    const S = { n, o, h, l, c, r, sig, bars, F: [] };
    for (let i = 0; i < n; i++) S.F[i] = i >= 20 ? featAt(S, i) : null;
    return S;
  }
  function featAt(S, i) {
    const { c, h, l, r, sig } = S, s = sig[i], k = (m) => Math.log(c[i] / c[i - m]) / (s * Math.sqrt(m));
    let hi = -Infinity, lo = Infinity, ar5 = 0, ar20 = 0, rg14 = 0;
    for (let j = i - 19; j <= i; j++) { hi = Math.max(hi, h[j]); lo = Math.min(lo, l[j]); ar20 += Math.abs(r[j]); if (j > i - 5) ar5 += Math.abs(r[j]); }
    for (let j = i - 13; j <= i; j++) rg14 += (h[j] - l[j]) / c[j];
    const rgNow = (h[i] - l[i]) / c[i];
    return [k(1), k(3), k(5), k(10), k(20), hi > lo ? (c[i] - lo) / (hi - lo) - 0.5 : 0, h[i] > l[i] ? (c[i] - l[i]) / (h[i] - l[i]) - 0.5 : 0, Math.log((ar5 / 5 + 1e-9) / (ar20 / 20 + 1e-9)), Math.log((rgNow + 1e-9) / (rg14 / 14 + 1e-9))];
  }
  function solve(A, b) { // gaussian elimination
    const n = b.length; A = A.map((r) => r.slice()); b = b.slice();
    for (let i = 0; i < n; i++) {
      let p = i; for (let j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      const d = A[i][i] || 1e-12;
      for (let j = i + 1; j < n; j++) { const f = A[j][i] / d; for (let k = i; k < n; k++) A[j][k] -= f * A[i][k]; b[j] -= f * b[i]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= A[i][k] * x[k]; x[i] = s / (A[i][i] || 1e-12); }
    return x;
  }
  const clipZ = (z) => Math.max(-5, Math.min(5, z));
  /* training set for one target: rows = [{i, x, y}] with i<=maxI ; y standardised by sigma at i */
  function targetZ(S, key, i) {
    const h = +key[1]; if (i + h >= S.n) return null;
    const base = S.c[i], px = key[0] === 'C' ? S.c[i + h] : S.o[i + h];
    return clipZ(Math.log(px / base) / S.sig[i]);
  }
  function trainRows(S, key, maxI) { const rows = []; for (let i = 20; i <= maxI; i++) { const y = targetZ(S, key, i); if (y !== null && S.F[i]) rows.push({ i, x: S.F[i], y }); } return rows; }
  function fitRidge(rows, lam) {
    const p = rows[0].x.length, mu = new Array(p).fill(0), sg = new Array(p).fill(1);
    for (let j = 0; j < p; j++) { const col = rows.map((q) => q.x[j]); mu[j] = mean(col); sg[j] = sd(col) || 1; }
    const ym = mean(rows.map((q) => q.y)), A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
    rows.forEach((q) => { const z = q.x.map((v, j) => (v - mu[j]) / sg[j]); for (let a = 0; a < p; a++) { b[a] += z[a] * (q.y - ym); for (let k = 0; k < p; k++) A[a][k] += z[a] * z[k]; } });
    for (let a = 0; a < p; a++) A[a][a] += lam;
    return { mu, sg, ym, w: solve(A, b) };
  }
  const predRidge = (m, x) => clipZ(m.ym + x.reduce((s, v, j) => s + m.w[j] * (v - m.mu[j]) / m.sg[j], 0));
  function predKnn(rows, x, K) {
    const p = x.length, sg = new Array(p).fill(1); for (let j = 0; j < p; j++) sg[j] = sd(rows.map((q) => q.x[j])) || 1;
    const d = rows.map((q) => { let s = 0; for (let j = 0; j < p; j++) { const t = (q.x[j] - x[j]) / sg[j]; s += t * t; } return { s, y: q.y }; }).sort((a, b) => a.s - b.s).slice(0, K);
    return clipZ(median(d.map((q) => q.y)) * 0.8); // shrink: neighbours are noisy
  }
  const MODELS = ['naive', 'ridge', 'knn', 'blend'];
  function predictAll(rows, x) {
    const out = { naive: 0 };
    if (rows.length < 40) { out.ridge = 0; out.knn = 0; out.blend = 0; return out; }
    const m = fitRidge(rows, 60); out.ridge = predRidge(m, x); out.knn = predKnn(rows, x, 15); out.blend = (out.ridge + out.knn) / 2; return out;
  }

  /* ---------- walk-forward backtest for one target ---------- */
  function walkForward(S, key, minTrain) {
    const h = +key[1], res = []; let cache = null, cacheAt = -99;
    for (let t = Math.max(20 + minTrain, 40); t < S.n - h; t++) {
      const maxI = t - h, rows = trainRows(S, key, maxI); if (rows.length < Math.min(minTrain, 60)) continue;
      if (t - cacheAt >= 10 || !cache) { cache = fitRidge(rows, 60); cacheAt = t; }
      const x = S.F[t], y = targetZ(S, key, t); if (y === null || !x) continue;
      const rg = predRidge(cache, x), kn = predKnn(rows, x, 15);
      res.push({ t, y, naive: 0, ridge: rg, knn: kn, blend: (rg + kn) / 2 });
    }
    return res;
  }
  const mae = (rows, m) => rows.length ? mean(rows.map((q) => Math.abs(q.y - q[m]))) : NaN;
  function evaluate(S, key, minTrain) {
    const wf = walkForward(S, key, minTrain), half = Math.floor(wf.length / 2), A = wf.slice(0, half), B = wf.slice(half);
    const out = { key, n: wf.length, nSel: A.length, nHold: B.length, chosen: 'naive', used: 'naive', models: {} };
    if (wf.length < 40) { out.note = 'history too short for a backtest'; out.q = { lo: -1.1, hi: 1.1, xlo: -1.9, xhi: 1.9 }; return out; }
    MODELS.forEach((m) => { out.models[m] = { maeSel: mae(A, m), maeHold: mae(B, m) }; });
    let best = 'naive', bv = out.models.naive.maeSel; MODELS.forEach((m) => { if (out.models[m].maeSel < bv - 1e-9) { bv = out.models[m].maeSel; best = m; } });
    out.chosen = best;
    const nv = out.models.naive.maeHold, bh = out.models[best].maeHold;
    out.edge = 1 - bh / nv; // + = model beats "no change" on unseen half
    const nz = B.filter((q) => Math.abs(q[best]) > 0.05); out.hit = nz.length ? nz.filter((q) => Math.sign(q[best]) === Math.sign(q.y)).length / nz.length : null; out.hitN = nz.length;
    out.used = (best !== 'naive' && out.edge > 0.01 && (out.hit === null || out.hit > 0.5)) ? best : 'naive';
    // band calibration: quantiles from first half, coverage tested on second half, final quantiles from all
    const qs = (rows, m) => { const e = rows.map((q) => q.y - q[m]); return { lo: quant(e, 0.1), hi: quant(e, 0.9), xlo: quant(e, 0.02), xhi: quant(e, 0.98) }; };
    const qa = qs(A, out.used), cov = B.filter((q) => { const e = q.y - q[out.used]; return e >= qa.lo && e <= qa.hi; }).length / Math.max(1, B.length);
    out.coverage80 = cov; out.q = qs(wf, out.used);
    out.resid = wf.map((q) => q.y - q[out.used]);
    const absTarget = B.map((q) => Math.abs(q.y)), absPred = B.map((q) => Math.abs(q[out.used] - 0));
    out.biasHold = mean(B.map((q) => q[out.used] - q.y));
    out.avgAbsMoveZ = mean(absTarget);
    return out;
  }

  /* ---------- windows, levels, weekday, patterns, cycles ---------- */
  function scanWindows(bars, deliv) {
    const out = [], dm = new Map(); (deliv || []).forEach((d) => dm.set(d.date, d));
    WIN.forEach((N) => {
      if (bars.length < N + 1) { out.push({ N, short: true }); return; }
      const sl = bars.slice(-N), prev = bars[bars.length - N - 1], first = prev.c, lastC = sl[N - 1].c;
      const rets = sl.map((b, i) => Math.log(b.c / (i ? sl[i - 1].c : prev.c)));
      const hi = Math.max(...sl.map((b) => b.h)), lo = Math.min(...sl.map((b) => b.l));
      let peak = -Infinity, mdd = 0; sl.forEach((b) => { peak = Math.max(peak, b.c); mdd = Math.min(mdd, b.c / peak - 1); });
      const xs = sl.map((_, i) => i), my = mean(sl.map((b) => Math.log(b.c))), mx = mean(xs); let nu = 0, de = 0; sl.forEach((b, i) => { nu += (i - mx) * (Math.log(b.c) - my); de += (i - mx) * (i - mx); });
      const gaps = sl.map((b, i) => Math.abs(b.o / (i ? sl[i - 1].c : prev.c) - 1));
      let bi = 0, bw = 0; rets.forEach((x, i) => { if (x > rets[bi]) bi = i; if (x < rets[bw]) bw = i; });
      const dv = sl.map((b) => dm.get(b.date)).filter((x) => x && isNum(x.del));
      let dvwap = null, delPct = null; if (dv.length >= N * 0.6) { let sw = 0, sp = 0; dv.forEach((d) => { const b = sl.find((x) => x.date === d.date); sw += d.del; sp += d.del * (b.h + b.l + b.c) / 3; }); dvwap = sw ? sp / sw : null; const pc = dv.filter((d) => isNum(d.traded) && d.traded > 0).map((d) => d.del / d.traded * 100); delPct = pc.length ? mean(pc) : null; }
      const vs = sl.reduce((s, b) => s + b.v, 0); const vw = vs ? sl.reduce((s, b) => s + b.v * (b.h + b.l + b.c) / 3, 0) / vs : null;
      out.push({ N, from: sl[0].date, ret: lastC / first - 1, hi, lo, pos: hi > lo ? (lastC - lo) / (hi - lo) : 0.5, avgAbs: mean(rets.map(Math.abs)), avgRange: mean(sl.map((b) => (b.h - b.l) / b.c)), upPct: rets.filter((x) => x > 0).length / N, gap: mean(gaps), mdd, slope: de ? nu / de : 0, bestDay: { date: sl[bi].date, r: Math.exp(rets[bi]) - 1 }, worstDay: { date: sl[bw].date, r: Math.exp(rets[bw]) - 1 }, vwap: vw, dvwap, delPct, vol: sd(rets) });
    });
    return out;
  }

  function levels(bars, win, intraLv, deliv, lastClose) {
    const cands = [], L = bars[bars.length - 1], P = (L.h + L.l + L.c) / 3, add = (price, label, w) => { if (isNum(price) && price > 0) cands.push({ price, label, w: w || 1 }); };
    add(P, 'Pivot', 1); add(2 * P - L.l, 'R1', 1); add(P + (L.h - L.l), 'R2', 1); add(2 * P - L.h, 'S1', 1); add(P - (L.h - L.l), 'S2', 1);
    add(L.h, 'Prev day high', 1.5); add(L.l, 'Prev day low', 1.5); add(L.c, 'Prev close', 1.5);
    [20, 50, 100, 200].forEach((n) => { if (bars.length >= n) add(mean(bars.slice(-n).map((b) => b.c)), n + '-DMA', n >= 50 ? 1.5 : 1); });
    win.forEach((w) => { if (w.short) return; if (w.N === 30 || w.N === 90) { add(w.hi, w.N + 'd high', 2); add(w.lo, w.N + 'd low', 2); } if (w.N === 15) { add(w.hi, '15d high', 1.5); add(w.lo, '15d low', 1.5); } add(w.vwap, w.N + 'd VWAP', 1.2); add(w.dvwap, w.N + 'd delivery-VWAP', 2); });
    (intraLv || []).forEach((x) => add(x.price, x.label, x.w || 1.2));
    // swing touches in the last 90 bars
    const sl = bars.slice(-90), sw = []; for (let i = 2; i < sl.length - 2; i++) { if (sl[i].h >= Math.max(sl[i - 1].h, sl[i - 2].h, sl[i + 1].h, sl[i + 2].h)) sw.push(sl[i].h); if (sl[i].l <= Math.min(sl[i - 1].l, sl[i - 2].l, sl[i + 1].l, sl[i + 2].l)) sw.push(sl[i].l); }
    sw.forEach((p) => add(p, 'swing', 0.6));
    // delivery-heavy days: their highs/lows hold the real positions
    if (deliv && deliv.length) { const dm = new Map(deliv.map((d) => [d.date, d])); const rows = bars.slice(-90).map((b) => { const d = dm.get(b.date); return d && d.traded > 0 ? { b, p: d.del / d.traded } : null; }).filter(Boolean); if (rows.length > 20) { const thr = quant(rows.map((x) => x.p), 0.8); rows.filter((x) => x.p >= thr).forEach((x) => { add(x.b.l, 'high-delivery day low', 1.2); add(x.b.h, 'high-delivery day high', 1.2); }); } }
    cands.sort((a, b) => a.price - b.price);
    const cl = []; cands.forEach((c) => { const g = cl.length && Math.abs(c.price / cl[cl.length - 1].mid - 1) < 0.004 ? cl[cl.length - 1] : null; if (g) { g.items.push(c); g.mid = g.items.reduce((s, x) => s + x.price * x.w, 0) / g.items.reduce((s, x) => s + x.w, 0); g.score += c.w; } else cl.push({ mid: c.price, items: [c], score: c.w }); });
    const named = (g) => Array.from(new Set(g.items.map((x) => x.label).filter((x) => x !== 'swing'))).slice(0, 4).join(' + ') || 'swing level';
    const res = cl.filter((g) => g.score >= 2.2).map((g) => ({ price: g.mid, score: +g.score.toFixed(1), what: named(g), touches: g.items.filter((x) => x.label === 'swing').length }));
    const ref = lastClose, above = res.filter((x) => x.price > ref * 1.001).sort((a, b) => a.price - b.price).slice(0, 4), below = res.filter((x) => x.price < ref * 0.999).sort((a, b) => b.price - a.price).slice(0, 4);
    return { ref, above, below, pivots: { P, R1: 2 * P - L.l, R2: P + (L.h - L.l), S1: 2 * P - L.h, S2: P - (L.h - L.l) } };
  }

  /* intraday (15m or 5m bars: [{t,o,h,l,c,v}]) → session levels + time-of-day behaviour */
  function intradayStats(ib) {
    if (!ib || ib.length < 50) return null;
    const by = new Map(); ib.forEach((b) => { if (!isNum(b.c)) return; const ist = new Date((b.t + 19800) * 1000), d = ist.toISOString().slice(0, 10), m = ist.getUTCHours() * 60 + ist.getUTCMinutes(); if (m < 555 || m > 930) return; (by.get(d) || by.set(d, []).get(d)).push({ m, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }); });
    const days = Array.from(by.keys()).sort(), sess = days.map((d) => { const a = by.get(d).sort((x, y) => x.m - y.m); let tv = 0, tp = 0, hi = -Infinity, lo = Infinity, hm = 0, lm = 0; a.forEach((b) => { tv += b.v; tp += b.v * (b.h + b.l + b.c) / 3; if (b.h > hi) { hi = b.h; hm = b.m; } if (b.l < lo) { lo = b.l; lm = b.m; } }); return { d, a, o: a[0].o, c: a[a.length - 1].c, hi, lo, hm, lm, vwap: tv ? tp / tv : null, orH: Math.max(...a.filter((b) => b.m < 585).map((b) => b.h)), orL: Math.min(...a.filter((b) => b.m < 585).map((b) => b.l)) }; }).filter((s) => s.a.length >= 8);
    if (sess.length < 5) return null;
    const bucket = (m) => m < 615 ? '09:15-10:15' : m < 690 ? '10:15-11:30' : m < 780 ? '11:30-13:00' : m < 870 ? '13:00-14:30' : '14:30-15:30';
    const B = ['09:15-10:15', '10:15-11:30', '11:30-13:00', '13:00-14:30', '14:30-15:30'], hiC = {}, loC = {}, rg = {}, vo = {}; B.forEach((k) => { hiC[k] = 0; loC[k] = 0; rg[k] = []; vo[k] = 0; });
    let volTot = 0; sess.forEach((s) => { hiC[bucket(s.hm)]++; loC[bucket(s.lm)]++; s.a.forEach((b) => { rg[bucket(b.m)].push((b.h - b.l) / b.c); vo[bucket(b.m)] += b.v; volTot += b.v; }); });
    const orRes = sess.map((s) => ({ rng: (s.orH - s.orL) / s.o, up: s.c > s.orH, dn: s.c < s.orL })), lastS = sess[sess.length - 1], prevS = sess[sess.length - 2] || lastS;
    // volume profile over last 10 sessions
    const last10 = sess.slice(-10), step = lastS.c * 0.0015, prof = new Map(); last10.forEach((s) => s.a.forEach((b) => { const k = Math.round(((b.h + b.l + b.c) / 3) / step); prof.set(k, (prof.get(k) || 0) + b.v); }));
    const keys = Array.from(prof.keys()).sort((a, b) => a - b), tot = keys.reduce((s, k) => s + prof.get(k), 0); let poc = keys[0]; keys.forEach((k) => { if (prof.get(k) > prof.get(poc)) poc = k; });
    let acc = prof.get(poc), lo = poc, hi = poc; while (acc < tot * 0.7 && (lo > keys[0] || hi < keys[keys.length - 1])) { const dn = prof.get(lo - 1) || 0, up = prof.get(hi + 1) || 0; if (up >= dn) { hi++; acc += up; } else { lo--; acc += dn; } if (!prof.has(lo) && !prof.has(hi) && lo < keys[0] - 3 && hi > keys[keys.length - 1] + 3) break; }
    return { sessions: sess.length, buckets: B.map((k) => ({ k, hiPct: hiC[k] / sess.length, loPct: loC[k] / sess.length, rangePct: mean(rg[k]), volShare: volTot ? vo[k] / volTot : 0 })), or: { avgRange: mean(orRes.map((x) => x.rng)), closeAbove: orRes.filter((x) => x.up).length / orRes.length, closeBelow: orRes.filter((x) => x.dn).length / orRes.length }, last: { d: lastS.d, o: lastS.o, h: lastS.hi, l: lastS.lo, c: lastS.c, vwap: lastS.vwap }, prev: { d: prevS.d, h: prevS.hi, l: prevS.lo, c: prevS.c, vwap: prevS.vwap }, poc: poc * step, vaL: lo * step, vaH: hi * step, levels: [{ price: lastS.vwap, label: 'Last-session VWAP', w: 1.2 }, { price: prevS.vwap, label: 'Prev-session VWAP', w: 1 }, { price: poc * step, label: '10-session POC', w: 1.8 }, { price: lo * step, label: 'Value-area low', w: 1.2 }, { price: hi * step, label: 'Value-area high', w: 1.2 }, { price: lastS.orH, label: 'Last opening-range high', w: 1 }, { price: lastS.orL, label: 'Last opening-range low', w: 1 }].filter((x) => isNum(x.price)) };
  }

  function weekdayStats(S, lookback) {
    const from = Math.max(1, S.n - lookback), rows = {}; for (let d = 1; d <= 5; d++) rows[d] = { d, n: 0, r: [], rg: [] };
    for (let i = from; i < S.n; i++) { const d = dow(S.bars[i].date); if (rows[d]) { rows[d].r.push(S.r[i]); rows[d].rg.push((S.h[i] - S.l[i]) / S.c[i]); } }
    const all = []; for (let i = from; i < S.n; i++) all.push(S.r[i]); const m0 = mean(all), s0 = sd(all);
    return Object.values(rows).map((x) => ({ day: WD[x.d], n: x.r.length, mean: mean(x.r), win: x.r.length ? x.r.filter((v) => v > 0).length / x.r.length : 0, avgAbs: mean(x.r.map(Math.abs)), range: mean(x.rg), t: x.r.length > 2 ? (mean(x.r) - m0) / (s0 / Math.sqrt(x.r.length)) : 0 }));
  }
  function patterns(S) {
    const sym = (i) => (S.r[i] > 0.5 * S.sig[i - 1] ? 'U' : S.r[i] < -0.5 * S.sig[i - 1] ? 'D' : 'F'), n = S.n, hist = {};
    for (let i = 22; i < n - 1; i++) { const k = sym(i - 1) + sym(i); (hist[k] || (hist[k] = [])).push(S.r[i + 1] / S.sig[i]); }
    const cur = sym(n - 2) + sym(n - 1), h = hist[cur] || [];
    const big = []; for (let i = 22; i < n - 1; i++) if (Math.abs(S.r[i]) > 1.5 * S.sig[i - 1]) big.push({ s: Math.sign(S.r[i]), nx: S.r[i + 1] / S.sig[i] });
    const afterUp = big.filter((x) => x.s > 0), afterDn = big.filter((x) => x.s < 0);
    const f = (a) => ({ n: a.length, meanZ: mean(a.map((x) => x.nx)), upPct: a.length ? a.filter((x) => x.nx > 0).length / a.length : 0 });
    return { current: cur, now: { n: h.length, upPct: h.length ? h.filter((v) => v > 0).length / h.length : null, meanZ: mean(h), medZ: median(h) }, afterBigUp: f(afterUp), afterBigDown: f(afterDn), table: Object.keys(hist).sort().map((k) => ({ k, n: hist[k].length, upPct: hist[k].filter((v) => v > 0).length / hist[k].length, meanZ: mean(hist[k]) })) };
  }
  function cycles(S, seed) {
    const L = Math.min(S.n, 200); if (L < 90) return { ok: false, note: 'needs ~90 days of history' };
    const detr = (r) => { const p = [0]; for (let i = 0; i < r.length; i++) p.push(p[i] + r[i]); // log path
      const w = 21, out = []; for (let i = 0; i < p.length; i++) { const a = Math.max(0, i - w), b = Math.min(p.length - 1, i + w); out.push(p[i] - mean(p.slice(a, b + 1))); } return out; };
    const periods = []; for (let P = 5; P <= 45; P++) periods.push(P);
    const power = (x) => { const m = x.length, res = periods.map((P) => { let a = 0, b = 0; for (let i = 0; i < m; i++) { const ph = 2 * Math.PI * i / P; a += x[i] * Math.cos(ph); b += x[i] * Math.sin(ph); } return { P, pw: (a * a + b * b) / m, a, b }; }); return res; };
    const r0 = S.r.slice(S.n - L + 1), x0 = detr(r0), pw0 = power(x0), tot = pw0.reduce((s, q) => s + q.pw, 0), top = pw0.reduce((q, z) => (z.pw > q.pw ? z : q));
    const rn = rng(seed || 7), perms = 200; let ge = 0;
    for (let k = 0; k < perms; k++) { const sh = r0.slice(); for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rn() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; } const mx = Math.max(...power(detr(sh)).map((q) => q.pw)); if (mx >= top.pw) ge++; }
    const p = (ge + 1) / (perms + 1), m = x0.length, ph = Math.atan2(top.b, top.a); // x ≈ A cos(2πi/P − φ)
    const A = 2 * Math.sqrt(top.pw * m) / m, val = (i) => A * Math.cos(2 * Math.PI * i / top.P - ph), cur = val(m - 1), nxt = [1, 2, 3].map((k) => val(m - 1 + k));
    // swing spacing
    const sw = { highs: [], lows: [] }, sl = S.bars.slice(-120); for (let i = 3; i < sl.length - 3; i++) { if (sl[i].h >= Math.max(...sl.slice(i - 3, i + 4).map((b) => b.h))) sw.highs.push(i); if (sl[i].l <= Math.min(...sl.slice(i - 3, i + 4).map((b) => b.l))) sw.lows.push(i); }
    const gap = (a) => a.length > 1 ? mean(a.slice(1).map((v, i) => v - a[i])) : null;
    return { ok: true, period: top.P, share: top.pw / tot, p, significant: p < 0.05, phaseNow: cur > 0 ? 'upper half of the cycle' : 'lower half of the cycle', turning: nxt[2] > nxt[0] ? 'rising into the next 3 sessions' : 'falling into the next 3 sessions', swingHighGap: gap(sw.highs), swingLowGap: gap(sw.lows), sinceHigh: sw.highs.length ? sl.length - 1 - sw.highs[sw.highs.length - 1] : null, sinceLow: sw.lows.length ? sl.length - 1 - sw.lows[sw.lows.length - 1] : null, swingHighs: sw.highs.length, swingLows: sw.lows.length };
  }

  /* ---------- news cover for the big move days ---------- */
  const TOPICS = [['Results / earnings', /result|earnings|profit|q[1-4]|revenue|net income|margin|ebitda/i], ['Orders / deals', /order|contract|deal|wins?|bags?|acqui|merger|stake|block deal|bulk deal/i], ['Brokerage / rating', /target|upgrade|downgrade|rating|buy call|sell call|initiat|brokerage|jefferies|motilal|kotak|nomura|goldman|morgan stanley|citi|ubs/i], ['Regulatory / legal', /sebi|rbi|court|tribunal|penalty|probe|raid|notice|ban|tax|gst|nclt|cci/i], ['Management / corporate', /ceo|md |chairman|resign|appoint|board|dividend|bonus|split|buyback|fund ?raise|qip|ipo|rights/i], ['Sector / macro', /sector|industry|crude|oil|rupee|fed|budget|tariff|policy|inflation|rate cut|gdp/i], ['Production / sales data', /sales|production|volume|deliver|launch|unit|registration|dispatch/i]];
  const topic = (t) => { const hit = TOPICS.find(([, re]) => re.test(t)); return hit ? hit[0] : 'General'; };
  const tone = (t) => { const pos = /(surge|jump|rally|gain|rise|soar|record|beat|upgrade|win|bags|strong|buy|hike|growth)/i.test(t), neg = /(fall|drop|slump|plunge|cut|miss|downgrade|probe|penalty|resign|weak|sell|loss|decline|fraud|raid)/i.test(t); return pos && !neg ? '+' : neg && !pos ? '−' : '·'; };
  function newsCover(S, news, days) {
    const items = (news || []).map((n) => ({ title: String(n.title || '').replace(/\s+-\s+[^-]+$/, ''), source: (String(n.title || '').match(/\s-\s([^-]+)$/) || [])[1] || '', link: n.link, date: n.date ? new Date(n.date).toISOString().slice(0, 10) : null })).filter((n) => n.date);
    const from = Math.max(1, S.n - days), mv = []; for (let i = from; i < S.n; i++) mv.push({ i, date: S.bars[i].date, r: Math.exp(S.r[i]) - 1, z: S.r[i] / S.sig[i - 1 > 0 ? i - 1 : 1] });
    const big = mv.slice().sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 8).sort((a, b) => (a.date < b.date ? -1 : 1));
    const rows = big.map((m) => { const d0 = m.date, hits = items.filter((n) => n.date >= addDays(d0, -1) && n.date <= d0 || n.date === addDays(d0, 1)); return { date: m.date, r: m.r, z: m.z, news: hits.slice(0, 3).map((n) => ({ title: n.title, source: n.source, link: n.link, date: n.date, topic: topic(n.title), tone: tone(n.title) })) }; });
    const covered = rows.filter((x) => x.news.length).length, recent = items.slice(0, 8).map((n) => ({ title: n.title, source: n.source, link: n.link, date: n.date, topic: topic(n.title), tone: tone(n.title) }));
    const tp = {}; rows.forEach((x) => x.news.forEach((n) => { tp[n.topic] = (tp[n.topic] || 0) + 1; }));
    return { available: items.length > 0, nItems: items.length, oldest: items.length ? items[items.length - 1].date : null, rows, covered, total: rows.length, topics: tp, recent };
  }

  /* ---------- astro lab ---------- */
  const NAK = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'P.Phalguni', 'U.Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'P.Ashadha', 'U.Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'P.Bhadrapada', 'U.Bhadrapada', 'Revati'];
  const SIGN = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  const AYAN = 23.857; // Lahiri, measured against the J2000 ecliptic that astronomy-engine returns
  const mod = (x, m) => ((x % m) + m) % m;
  function astroTags(A, iso) {
    const d = new Date(iso + 'T04:30:00Z'), ecl = (b) => A.Ecliptic(A.GeoVector(b, d, true)).elon, moon = ecl('Moon'), sun = ecl('Sun'), sm = mod(moon - AYAN, 360);
    const tag = { date: iso, nak: Math.floor(sm / (360 / 27)), sign: Math.floor(sm / 30), tithi: Math.floor(mod(moon - sun, 360) / 12), phase8: Math.floor(mod(moon - sun + 22.5, 360) / 45), moonLon: sm };
    const d2 = new Date(d.getTime() + 864e5), mer2 = A.Ecliptic(A.GeoVector('Mercury', d2, true)).elon, mer = ecl('Mercury'); tag.merRetro = mod(mer2 - mer + 180, 360) - 180 < 0 ? 1 : 0;
    tag.asp = {}; ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].forEach((p) => { const e = mod(moon - ecl(p), 360); tag.asp[p] = { conj: (e < 6 || e > 354) ? 1 : 0, opp: Math.abs(e - 180) < 6 ? 1 : 0, sq: (Math.abs(e - 90) < 6 || Math.abs(e - 270) < 6) ? 1 : 0 }; });
    return tag;
  }
  function astroLab(A, S, futureDates, seed) {
    if (!A) return { available: false, note: 'astronomy library not loaded' };
    const first = Math.max(21, S.n - 480), idx = []; for (let i = first; i < S.n; i++) idx.push(i);
    const tags = idx.map((i) => astroTags(A, S.bars[i].date)), ftags = futureDates.map((d) => astroTags(A, d));
    const fam = []; // {name, labels, grp(tag)}
    fam.push({ f: 'Tithi', n: 30, g: (t) => t.tithi, lab: (k) => 'Tithi ' + (k + 1) + (k < 15 ? ' (waxing)' : ' (waning)') });
    fam.push({ f: 'Nakshatra', n: 27, g: (t) => t.nak, lab: (k) => NAK[k] });
    fam.push({ f: 'Moon sign', n: 12, g: (t) => t.sign, lab: (k) => 'Moon in ' + SIGN[k] });
    fam.push({ f: 'Moon phase', n: 8, g: (t) => t.phase8, lab: (k) => ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'][k] });
    fam.push({ f: 'Mercury', n: 2, g: (t) => t.merRetro, lab: (k) => (k ? 'Mercury retrograde' : 'Mercury direct') });
    ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].forEach((p) => [['conj', 'conjunct'], ['opp', 'opposite'], ['sq', 'square']].forEach(([k, w]) => fam.push({ f: 'Moon ' + w + ' ' + p, n: 2, g: (t) => t.asp[p][k], lab: (v) => (v ? 'Moon ' + w + ' ' + p : 'no such aspect'), only1: true })));
    const targets = { ret: idx.map((i) => S.r[i] / S.sig[i - 1]), vol: idx.map((i) => Math.abs(S.r[i]) / S.sig[i - 1]) };
    const N = idx.length, groups = []; // each: {f, k, label, members[]}
    fam.forEach((F) => { const m = Array.from({ length: F.n }, () => []); tags.forEach((t, j) => m[F.g(t)].push(j)); m.forEach((mem, k) => { if (F.only1 && k === 0) return; if (mem.length >= 8) groups.push({ f: F.f, k, label: F.lab(k), mem }); }); });
    const out = { available: true, days: N, tests: groups.length * 2, perms: 1000, results: {}, future: [], survivors: [] };
    const rn = rng(seed || 11);
    ['ret', 'vol'].forEach((tg) => {
      const x = targets[tg], mu = mean(x), s = sd(x) || 1, tstat = (arr, mem) => { let sm = 0; for (let q = 0; q < mem.length; q++) sm += arr[mem[q]]; return Math.abs((sm / mem.length - mu) / (s / Math.sqrt(mem.length))); };
      const obs = groups.map((g) => tstat(x, g.mem)), maxes = [], sh = x.slice();
      for (let p = 0; p < out.perms; p++) { for (let i = N - 1; i > 0; i--) { const j = Math.floor(rn() * (i + 1)); const t = sh[i]; sh[i] = sh[j]; sh[j] = t; } let mx = 0; for (let g = 0; g < groups.length; g++) { const t = tstat(sh, groups[g].mem); if (t > mx) mx = t; } maxes.push(mx); }
      const rows = groups.map((g, gi) => { const sub = g.mem.map((j) => x[j]); const padj = (1 + maxes.filter((m) => m >= obs[gi]).length) / (out.perms + 1); return { f: g.f, label: g.label, n: g.mem.length, mean: mean(sub), t: obs[gi], padj }; }).sort((a, b) => a.padj - b.padj || b.t - a.t);
      out.results[tg] = { top: rows.slice(0, 5), survivors: rows.filter((r) => r.padj < 0.05), byLabel: new Map(rows.map((r) => [r.label, r])) };
      out.results[tg].survivors.forEach((r) => out.survivors.push({ target: tg, ...r }));
    });
    out.future = ftags.map((t) => {
      const labs = [fam[0].lab(t.tithi), NAK[t.nak], 'Moon in ' + SIGN[t.sign], fam[3].lab(t.phase8), fam[4].lab(t.merRetro)]; ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].forEach((p) => { const a = t.asp[p]; if (a.conj) labs.push('Moon conjunct ' + p); if (a.opp) labs.push('Moon opposite ' + p); if (a.sq) labs.push('Moon square ' + p); });
      return { date: t.date, tags: labs.map((l) => { const a = out.results.ret.byLabel.get(l), b = out.results.vol.byLabel.get(l); return { label: l, ret: a ? { n: a.n, mean: a.mean, padj: a.padj } : null, vol: b ? { n: b.n, mean: b.mean, padj: b.padj } : null }; }) };
    });
    ['ret', 'vol'].forEach((tg) => { delete out.results[tg].byLabel; });
    return out;
  }

  /* ---------- the 3-session forecast ---------- */
  const KEYS = ['C1', 'C2', 'C3', 'O1', 'O2', 'O3'];
  function sessionDates(pp) { // the three sessions to forecast
    const lastD = pp.bars[pp.bars.length - 1].date, out = []; let d = lastD;
    for (let k = 0; k < 3; k++) { d = nextTrading(d); out.push(d); }
    return out;
  }
  function forecast(S, pp, astro) {
    const minTrain = S.n >= 330 ? 150 : Math.max(60, Math.floor((S.n - 40) * 0.45)), n = S.n, last = S.c[n - 1], sg = S.sig[n - 1], x = S.F[n - 1], ev = {}, fit = {};
    KEYS.forEach((k) => {
      ev[k] = evaluate(S, k, minTrain);
      const rows = trainRows(S, k, n - 1 - +k[1]), pr = predictAll(rows, x); fit[k] = { rows, z: pr[ev[k].used], all: pr };
    });
    const dates = sessionDates(pp), px = (key, z, q) => last * Math.exp(sg * (z + q));
    const row = (key) => { const e = ev[key], z = fit[key].z; return { key, z, mid: px(key, z, 0), lo: px(key, z, e.q.lo), hi: px(key, z, e.q.hi), xlo: px(key, z, e.q.xlo), xhi: px(key, z, e.q.xhi), pUp: null }; };
    const R = {}; KEYS.forEach((k) => { R[k] = row(k); R[k].chg = R[k].mid / last - 1; });
    // probability that close is above the last close: ridge-type centre + empirical residuals
    ['C1', 'C2', 'C3'].forEach((k) => { const res = ev[k].resid || []; R[k].pUp = res.length ? res.filter((v) => fit[k].z + v > 0).length / res.length : null; });
    // today's live adjustment (session already running): narrow the first close band by what is left of the day
    let liveAdj = null;
    if (pp.live && pp.phase === 'open') {
      const f = Math.max(0.05, pp.minsLeft / 375), done = Math.log(pp.live.price / last), tgt = Math.log(R.C1.mid / last), cen = pp.live.price * Math.exp(f * (tgt - done)), wl = (R.C1.hi - R.C1.lo) / last * Math.sqrt(f) / 2, wx = (R.C1.xhi - R.C1.xlo) / last * Math.sqrt(f) / 2;
      liveAdj = { price: pp.live.price, f, mid: cen, lo: cen - wl * pp.live.price / 1, hi: cen + wl * pp.live.price / 1, xlo: cen - wx * pp.live.price, xhi: cen + wx * pp.live.price }; liveAdj.lo = cen - wl * last; liveAdj.hi = cen + wl * last; liveAdj.xlo = cen - wx * last; liveAdj.xhi = cen + wx * last;
    }
    // scenario chain: what if session 1 closes low / base / high → sessions 2 and 3
    const scen = [['Weak close', R.C1.lo], ['Base close', R.C1.mid], ['Strong close', R.C1.hi]].map(([name, c1]) => {
      const bar = { date: dates[0], o: Math.max(1e-6, R.O1.mid), h: Math.max(R.O1.mid, c1) * 1.004, l: Math.min(R.O1.mid, c1) * 0.996, c: c1, v: 0 }, S2 = mkSeries(S.bars.concat([bar])), x2 = S2.F[S2.n - 1], sg2 = S2.sig[S2.n - 1];
      const rg = (k) => { const z = predictAll(fit[k].rows, x2)[ev[k].used], q = ev[k].q; return { mid: c1 * Math.exp(sg2 * z), lo: c1 * Math.exp(sg2 * (z + q.lo)), hi: c1 * Math.exp(sg2 * (z + q.hi)) }; };
      return { name, c1, o2: rg('O1'), c2: rg('C1'), o3: rg('O2'), c3: rg('C2') };
    });
    // astro: only a result that survives the multiple-testing test may nudge the centre, and only as a shrunken tilt
    let astroTilt = null;
    if (astro && astro.available && astro.survivors.length) astroTilt = astro.survivors.filter((s) => s.target === 'ret').slice(0, 3);
    return { dates, base: last, sigma1: sg, R, liveAdj, scen, ev, minTrain, astroTilt };
  }

  /* ---------- main ---------- */
  function analyse(inp) {
    const now = inp.now || new Date(), pp = prep(inp.bars, now);
    if (!pp.live && pp.phase === 'open' && isNum(inp.livePrice)) pp.live = { price: inp.livePrice };
    if (pp.bars.length < 60) return { ok: false, error: 'Only ' + pp.bars.length + ' daily bars are available — need at least 60 for a deep scan.' };
    const S = mkSeries(pp.bars), deliv = inp.deliv || [], win = scanWindows(pp.bars, deliv), istats = intradayStats(inp.intra), lastClose = pp.live ? pp.live.price : S.c[S.n - 1];
    const lv = levels(pp.bars, win, istats && istats.levels, deliv, lastClose), wk90 = weekdayStats(S, 90), wkAll = weekdayStats(S, Math.min(S.n, 480)), pat = patterns(S), cyc = cycles(S, 7), dates = sessionDates(pp);
    const astro = inp.astronomy ? astroLab(inp.astronomy, S, dates, 11) : { available: false, note: 'astronomy library not loaded' };
    const fc = forecast(S, pp, astro), news = newsCover(S, inp.news, 90);
    // delivery summary
    let dl = null; if (deliv.length > 20) { const p = deliv.filter((d) => d.traded > 0).map((d) => ({ date: d.date, p: d.del / d.traded * 100 })), l5 = p.slice(-5), l30 = p.slice(-30); const dm = new Map(p.map((x) => [x.date, x.p])), rr = [], pr2 = []; for (let i = 1; i < pp.bars.length - 1; i++) { const a = dm.get(pp.bars[i].date); if (a !== undefined) { pr2.push(a); rr.push(S.r[i + 1] / S.sig[i]); } } const thr = quant(pr2, 0.8), hi = rr.filter((_, i) => pr2[i] >= thr); dl = { last: p[p.length - 1], avg5: mean(l5.map((x) => x.p)), avg30: mean(l30.map((x) => x.p)), highDays: { n: hi.length, nextMeanZ: mean(hi), nextUp: hi.length ? hi.filter((v) => v > 0).length / hi.length : null } }; }
    return { ok: true, _S: S, sessions: dates, expected: pp.expected, stale: pp.bars[S.n - 1].date < pp.expected, recent: pp.bars.slice(-40), sym: inp.sym, asOf: pp.bars[S.n - 1].date, today: pp.today, phase: pp.phase, live: pp.live, bars: S.n, first: pp.bars[0].date, windows: win, levels: lv, intraday: istats, weekday: { d90: wk90, all: wkAll }, patterns: pat, cycle: cyc, news, astro, forecast: fc, delivery: dl, source: inp.source || '' };
  }
  return { analyse, prep, astroLabFor: (A, res) => astroLab(A, res._S, res.sessions, 11), mkSeries, evaluate, walkForward, astroTags, astroLab, scanWindows, levels, intradayStats, weekdayStats, patterns, cycles, newsCover, isTrading, nextTrading, WIN, HOL };
});
