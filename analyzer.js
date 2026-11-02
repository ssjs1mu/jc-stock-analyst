/* Data analyzer - Excel-style sheet: 2 years of daily data per stock, many computed columns,
   user formula columns (header text = the rule), per-row TRUE/FALSE, next-day outcome and a
   rule-weighted next-day call with hit-rate stats. Formulas use a small safe parser (no eval). */
(function (root) {
  'use strict';
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const r2 = (v) => (isN(v) ? Math.round(v * 100) / 100 : v);
  const NA = null;

  /* ---------- series helpers (arrays with null) ---------- */
  const mk = (n) => new Array(n).fill(NA);
  function sma(a, p) { const n = a.length, o = mk(n); for (let i = p - 1; i < n; i++) { let s = 0, ok = true; for (let k = i - p + 1; k <= i; k++) { if (!isN(a[k])) { ok = false; break; } s += a[k]; } if (ok) o[i] = s / p; } return o; }
  function ema(a, p) { const n = a.length, o = mk(n), k = 2 / (p + 1); let f = a.findIndex(isN); if (f < 0 || n - f < p) return o; let s = 0; for (let i = f; i < f + p; i++) { if (!isN(a[i])) return o; s += a[i]; } let pv = s / p; o[f + p - 1] = pv; for (let i = f + p; i < n; i++) { if (!isN(a[i])) { o[i] = pv; continue; } pv = a[i] * k + pv * (1 - k); o[i] = pv; } return o; }
  function wilder(a, p) { const n = a.length, o = mk(n); let f = a.findIndex(isN); if (f < 0 || n - f < p) return o; let s = 0; for (let i = f; i < f + p; i++) s += a[i]; let pv = s / p; o[f + p - 1] = pv; for (let i = f + p; i < n; i++) { pv = (pv * (p - 1) + a[i]) / p; o[i] = pv; } return o; }
  function rsi(a, p) { const n = a.length, g = mk(n), l = mk(n); for (let i = 1; i < n; i++) { if (!isN(a[i]) || !isN(a[i - 1])) continue; const d = a[i] - a[i - 1]; g[i] = d > 0 ? d : 0; l[i] = d < 0 ? -d : 0; } const ag = wilder(g, p), al = wilder(l, p); return a.map((_, i) => (isN(ag[i]) && isN(al[i]) ? (al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i])) : NA)); }
  function shift(a, k) { const n = a.length, o = mk(n); for (let i = k; i < n; i++) o[i] = a[i - k]; return o; }
  function roll(a, p, f, incl) { const n = a.length, o = mk(n); for (let i = 0; i < n; i++) { const e = incl ? i : i - 1, s = e - p + 1; if (s < 0) continue; let ok = true, r; for (let k = s; k <= e; k++) { if (!isN(a[k])) { ok = false; break; } r = k === s ? a[k] : f(r, a[k]); } if (ok) o[i] = r; } return o; }
  function stdev(a, p) { const n = a.length, o = mk(n); for (let i = p - 1; i < n; i++) { let s = 0, ok = true; for (let k = i - p + 1; k <= i; k++) { if (!isN(a[k])) { ok = false; break; } s += a[k]; } if (!ok) continue; const m = s / p; let q = 0; for (let k = i - p + 1; k <= i; k++) q += (a[k] - m) ** 2; o[i] = Math.sqrt(q / p); } return o; }
  function sumN(a, p) { const n = a.length, o = mk(n); for (let i = p - 1; i < n; i++) { let s = 0, ok = true; for (let k = i - p + 1; k <= i; k++) { if (!isN(a[k])) { ok = false; break; } s += a[k]; } if (ok) o[i] = s; } return o; }
  const zip = (a, b, f) => a.map((x, i) => (isN(x) && isN(b[i]) ? f(x, b[i]) : NA));
  function atrOf(H, L, C, p) { const n = C.length, tr = mk(n); for (let i = 0; i < n; i++) tr[i] = i === 0 ? H[i] - L[i] : Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])); return wilder(tr, p); }
  function adxOf(H, L, C, p) {
    const n = C.length, pdm = mk(n), mdm = mk(n), tr = mk(n);
    for (let i = 1; i < n; i++) { const up = H[i] - H[i - 1], dn = L[i - 1] - L[i]; pdm[i] = up > dn && up > 0 ? up : 0; mdm[i] = dn > up && dn > 0 ? dn : 0; tr[i] = Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])); }
    const st = wilder(tr, p), sp = wilder(pdm, p), sm = wilder(mdm, p);
    const pdi = st.map((t, i) => (isN(t) && t > 0 && isN(sp[i]) ? (100 * sp[i]) / t : NA)), mdi = st.map((t, i) => (isN(t) && t > 0 && isN(sm[i]) ? (100 * sm[i]) / t : NA));
    const dx = pdi.map((a, i) => (isN(a) && isN(mdi[i]) && a + mdi[i] > 0 ? (100 * Math.abs(a - mdi[i])) / (a + mdi[i]) : NA));
    return { adx: wilder(dx.map((v) => (isN(v) ? v : NA)), p), pdi, mdi };
  }

  /* ---------- formula language ---------- */
  function tokenize(s) {
    const t = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; t.push({ k: 'n', v: parseFloat(s.slice(i, j)) }); i = j; continue; }
      if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z0-9_%]/.test(s[j])) j++; t.push({ k: 'i', v: s.slice(i, j).toLowerCase() }); i = j; continue; }
      const two = s.substr(i, 2);
      if (['>=', '<=', '==', '!=', '<>', '&&', '||'].includes(two)) { t.push({ k: 'o', v: two }); i += 2; continue; }
      if ('+-*/<>=!(),'.includes(c)) { t.push({ k: 'o', v: c }); i++; continue; }
      throw new Error('Unexpected "' + c + '"');
    }
    return t;
  }
  function parse(src) {
    const t = tokenize(src); let p = 0;
    const peek = () => t[p], eat = () => t[p++];
    const isOp = (v) => t[p] && t[p].k === 'o' && t[p].v === v;
    const isKw = (v) => t[p] && t[p].k === 'i' && t[p].v === v;
    function or() { let a = and(); while (isKw('or') || isOp('||')) { eat(); a = { t: 'b', op: 'or', a, b: and() }; } return a; }
    function and() { let a = not(); while (isKw('and') || isOp('&&')) { eat(); a = { t: 'b', op: 'and', a, b: not() }; } return a; }
    function not() { if (isKw('not') || isOp('!')) { eat(); return { t: 'u', op: 'not', a: not() }; } return cmp(); }
    function cmp() { let a = add(); while (peek() && peek().k === 'o' && ['>', '<', '>=', '<=', '=', '==', '!=', '<>'].includes(peek().v)) { const op = eat().v; a = { t: 'b', op: op === '==' ? '=' : op === '<>' ? '!=' : op, a, b: add() }; } return a; }
    function add() { let a = mul(); while (isOp('+') || isOp('-')) { const op = eat().v; a = { t: 'b', op, a, b: mul() }; } return a; }
    function mul() { let a = un(); while (isOp('*') || isOp('/')) { const op = eat().v; a = { t: 'b', op, a, b: un() }; } return a; }
    function un() { if (isOp('-')) { eat(); return { t: 'u', op: 'neg', a: un() }; } return atom(); }
    function atom() {
      const x = eat(); if (!x) throw new Error('Formula ends too early');
      if (x.k === 'n') return { t: 'n', v: x.v };
      if (x.k === 'o' && x.v === '(') { const e = or(); if (!isOp(')')) throw new Error('Missing )'); eat(); return e; }
      if (x.k === 'i') {
        if (x.v === 'true') return { t: 'n', v: 1 }; if (x.v === 'false') return { t: 'n', v: 0 };
        if (isOp('(')) { eat(); const args = []; if (!isOp(')')) { for (;;) { args.push(or()); if (isOp(',')) { eat(); continue; } break; } } if (!isOp(')')) throw new Error('Missing ) after ' + x.v); eat(); return { t: 'f', name: x.v, args }; }
        return { t: 'i', name: x.v };
      }
      throw new Error('Unexpected "' + x.v + '"');
    }
    if (!t.length) throw new Error('Empty formula');
    const ast = or(); if (p < t.length) throw new Error('Unexpected "' + t[p].v + '"');
    return ast;
  }
  const ALIAS = { o: 'open', h: 'high', l: 'low', c: 'close', v: 'volume', vol: 'volume', 'del%': 'delpct', delivery: 'delpct', deliverypct: 'delpct', 'delivery%': 'delpct', prevclose: 'pclose', pc: 'pclose', gap: 'gap', 'chg%': 'chg', change: 'chg', 'vol/avg': 'volratio' };
  const OUTCOME = new Set(['nxto', 'nxth', 'nxtl', 'nxtc', 'nxtchg', 'nxtgap', 'nxtdir']);

  function evalAst(ast, S, n, ctx) {
    const arr = (x) => (Array.isArray(x) ? x : new Array(n).fill(x));
    const num = (node, d) => { if (node === undefined) return d; if (node.t !== 'n') throw new Error('Period must be a number'); return node.v; };
    function ev(a) {
      switch (a.t) {
        case 'n': return a.v;
        case 'i': { let k = ALIAS[a.name] || a.name; if (OUTCOME.has(k)) throw new Error('"' + a.name + '" is the next-day result - it cannot be used in a rule'); if (ctx.conds[k] && ctx.conds[k].upto) return ctx.conds[k].vals; if (S[k]) return S[k]; throw new Error('Unknown column "' + a.name + '"'); }
        case 'u': { const x = ev(a.a); if (a.op === 'neg') return Array.isArray(x) ? x.map((v) => (isN(v) ? -v : NA)) : -x; const y = arr(x); return y.map((v) => (isN(v) ? (v ? 0 : 1) : NA)); }
        case 'b': {
          const x = arr(ev(a.a)), y = arr(ev(a.b)), o = a.op, out = mk(n);
          for (let i = 0; i < n; i++) {
            const p = x[i], q = y[i];
            if (o === 'and') { out[i] = p === 0 || q === 0 ? 0 : isN(p) && isN(q) ? 1 : NA; continue; }
            if (o === 'or') { out[i] = (isN(p) && p) || (isN(q) && q) ? 1 : isN(p) && isN(q) ? 0 : NA; continue; }
            if (!isN(p) || !isN(q)) continue;
            switch (o) {
              case '+': out[i] = p + q; break; case '-': out[i] = p - q; break; case '*': out[i] = p * q; break;
              case '/': out[i] = q === 0 ? NA : p / q; break;
              case '>': out[i] = p > q ? 1 : 0; break; case '<': out[i] = p < q ? 1 : 0; break;
              case '>=': out[i] = p >= q - 1e-9 ? 1 : 0; break; case '<=': out[i] = p <= q + 1e-9 ? 1 : 0; break;
              case '=': out[i] = Math.abs(p - q) <= 1e-7 * Math.max(1, Math.abs(p)) ? 1 : 0; break;
              case '!=': out[i] = Math.abs(p - q) <= 1e-7 * Math.max(1, Math.abs(p)) ? 0 : 1; break;
            }
          }
          return out;
        }
        case 'f': {
          const A = a.args, f = a.name, X = (k) => arr(ev(A[k]));
          const need = (c) => { if (A.length < c) throw new Error(f + '() needs ' + c + ' argument(s)'); };
          switch (f) {
            case 'prev': need(1); return shift(X(0), num(A[1], 1));
            case 'sma': need(2); return sma(X(0), num(A[1]));
            case 'ema': need(2); return ema(X(0), num(A[1]));
            case 'sum': need(2); return sumN(X(0), num(A[1]));
            case 'stdev': need(2); return stdev(X(0), num(A[1]));
            case 'highest': need(2); return roll(X(0), num(A[1]), Math.max, false);
            case 'lowest': need(2); return roll(X(0), num(A[1]), Math.min, false);
            case 'roc': { need(2); const x = X(0), k = num(A[1]); return x.map((v, i) => (i >= k && isN(v) && isN(x[i - k]) && x[i - k] !== 0 ? (v / x[i - k] - 1) * 100 : NA)); }
            case 'rsi': need(1); return A.length === 1 ? S.rsi14 : rsi(X(0), num(A[1], 14));
            case 'atr': return atrOf(S.high, S.low, S.close, num(A[0], 14));
            case 'abs': need(1); return X(0).map((v) => (isN(v) ? Math.abs(v) : NA));
            case 'min': need(2); return zip(X(0), X(1), Math.min);
            case 'max': need(2); return zip(X(0), X(1), Math.max);
            case 'cross': { need(2); const x = X(0), y = X(1), px = shift(x, 1), py = shift(y, 1); return x.map((v, i) => (isN(v) && isN(y[i]) && isN(px[i]) && isN(py[i]) ? (v > y[i] && px[i] <= py[i] ? 1 : 0) : NA)); }
            case 'crossdown': { need(2); const x = X(0), y = X(1), px = shift(x, 1), py = shift(y, 1); return x.map((v, i) => (isN(v) && isN(y[i]) && isN(px[i]) && isN(py[i]) ? (v < y[i] && px[i] >= py[i] ? 1 : 0) : NA)); }
            case 'count': { need(2); return sumN(X(0).map((v) => (isN(v) ? (v ? 1 : 0) : NA)), num(A[1])); }
            case 'streak': { need(1); const x = X(0), o = mk(n); let c = 0; for (let i = 0; i < n; i++) { if (!isN(x[i])) { c = 0; continue; } c = x[i] ? c + 1 : 0; o[i] = c; } return o; }
            case 'if': { need(3); const c = X(0), p = X(1), q = X(2); return c.map((v, i) => (isN(v) ? (v ? p[i] : q[i]) : NA)); }
            default: throw new Error('Unknown function ' + f + '()');
          }
        }
      }
      throw new Error('Bad formula');
    }
    const r = ev(ast); return Array.isArray(r) ? r : new Array(n).fill(r);
  }

  /* ---------- the data table ---------- */
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const GLOB = [['nifty', '^NSEI', 'Nifty 50'], ['vix', '^INDIAVIX', 'India VIX'], ['crude', 'CL=F', 'Crude (WTI)'], ['usdinr', 'INR=X', 'USD/INR'], ['dxy', 'DX-Y.NYB', 'Dollar index'], ['us10y', '^TNX', 'US 10y yield'], ['spx', '^GSPC', 'S&P 500']];

  /* base: {d:[iso], o,h,l,c,v,dq,dp arrays}. mkt: {key:{iso:close}} */
  function build(base, mkt) {
    const n = base.d.length, S = {};
    const O = base.o, H = base.h, L = base.l, C = base.c, V = base.v;
    S.open = O; S.high = H; S.low = L; S.close = C; S.volume = V; S.delqty = base.dq; S.delpct = base.dp;
    S.dow = base.d.map((d) => new Date(d + 'T00:00:00Z').getUTCDay());
    S.pclose = shift(C, 1);
    S.chg = C.map((c, i) => (i && C[i - 1] ? (c / C[i - 1] - 1) * 100 : NA));
    S.gap = O.map((o, i) => (i && C[i - 1] ? (o / C[i - 1] - 1) * 100 : NA));
    S.range = H.map((h, i) => (i && C[i - 1] ? ((h - L[i]) / C[i - 1]) * 100 : NA));
    S.body = C.map((c, i) => (O[i] ? ((c - O[i]) / O[i]) * 100 : NA));
    S.bodyr = C.map((c, i) => (H[i] > L[i] ? Math.abs(c - O[i]) / (H[i] - L[i]) : NA));
    S.upwick = C.map((c, i) => (c ? ((H[i] - Math.max(O[i], c)) / c) * 100 : NA));
    S.lowwick = C.map((c, i) => (c ? ((Math.min(O[i], c) - L[i]) / c) * 100 : NA));
    S.clv = C.map((c, i) => (H[i] > L[i] ? (2 * c - H[i] - L[i]) / (H[i] - L[i]) : NA));
    S.typical = C.map((c, i) => (H[i] + L[i] + c) / 3);
    S.turnover = C.map((c, i) => (c * V[i]) / 1e7);
    const vb = shift(sma(V, 20), 1);
    S.volratio = V.map((v, i) => (isN(vb[i]) && vb[i] > 0 ? v / vb[i] : NA));
    const dpb = shift(sma(base.dp, 20), 1);
    S.delratio = base.dp.map((v, i) => (isN(v) && isN(dpb[i]) && dpb[i] > 0 ? v / dpb[i] : NA));
    S.delchg = base.dp.map((v, i) => (i && isN(v) && isN(base.dp[i - 1]) ? v - base.dp[i - 1] : NA));
    [5, 10, 20, 50].forEach((p) => { S['sma' + p] = sma(C, p); }); S.sma200 = sma(C, 200);
    [9, 20, 50, 200].forEach((p) => { S['ema' + p] = ema(C, p); });
    S.dist20 = C.map((c, i) => (isN(S.ema20[i]) ? (c / S.ema20[i] - 1) * 100 : NA));
    S.dist50 = C.map((c, i) => (isN(S.ema50[i]) ? (c / S.ema50[i] - 1) * 100 : NA));
    S.dist200 = C.map((c, i) => (isN(S.ema200[i]) ? (c / S.ema200[i] - 1) * 100 : NA));
    S.rsi14 = rsi(C, 14); S.rsi5 = rsi(C, 5);
    const e12 = ema(C, 12), e26 = ema(C, 26); S.macd = zip(e12, e26, (a, b) => a - b); S.macdsig = ema(S.macd.map((v) => (isN(v) ? v : NA)), 9); S.macdhist = zip(S.macd, S.macdsig, (a, b) => a - b);
    S.atr14 = atrOf(H, L, C, 14); S.atrpct = S.atr14.map((a, i) => (isN(a) && C[i] ? (a / C[i]) * 100 : NA));
    const ad = adxOf(H, L, C, 14); S.adx = ad.adx; S.pdi = ad.pdi; S.mdi = ad.mdi;
    const m20 = sma(C, 20), sd20 = stdev(C, 20);
    S.bbpct = C.map((c, i) => (isN(m20[i]) && sd20[i] > 0 ? (c - (m20[i] - 2 * sd20[i])) / (4 * sd20[i]) : NA));
    S.bbw = C.map((c, i) => (isN(m20[i]) && m20[i] ? ((4 * sd20[i]) / m20[i]) * 100 : NA));
    const hh14 = roll(H, 14, Math.max, true), ll14 = roll(L, 14, Math.min, true);
    S.stochk = C.map((c, i) => (isN(hh14[i]) && hh14[i] > ll14[i] ? ((c - ll14[i]) / (hh14[i] - ll14[i])) * 100 : NA)); S.stochd = sma(S.stochk, 3);
    S.willr = S.stochk.map((v) => (isN(v) ? v - 100 : NA));
    const obv = mk(n); obv[0] = 0; for (let i = 1; i < n; i++) obv[i] = obv[i - 1] + (C[i] > C[i - 1] ? V[i] : C[i] < C[i - 1] ? -V[i] : 0); S.obv = obv; S.obvema = ema(obv, 20);
    S.hh20 = roll(H, 20, Math.max, true); S.ll20 = roll(L, 20, Math.min, true); S.hh52 = roll(H, 250, Math.max, true); S.ll52 = roll(L, 250, Math.min, true);
    S.near52h = C.map((c, i) => (isN(S.hh52[i]) ? (c / S.hh52[i] - 1) * 100 : NA)); S.near52l = C.map((c, i) => (isN(S.ll52[i]) ? (c / S.ll52[i] - 1) * 100 : NA));
    [5, 10, 20].forEach((p) => { S['ret' + p] = C.map((c, i) => (i >= p && C[i - p] ? (c / C[i - p] - 1) * 100 : NA)); });
    { const o = mk(n); let c = 0; for (let i = 1; i < n; i++) { const d = C[i] - C[i - 1]; c = d > 0 ? (c > 0 ? c + 1 : 1) : d < 0 ? (c < 0 ? c - 1 : -1) : 0; o[i] = c; } S.streak = o; }
    S.rangeavg = sma(S.range, 20);
    S.insidebar = H.map((h, i) => (i ? (h <= H[i - 1] && L[i] >= L[i - 1] ? 1 : 0) : NA));
    S.narrow7 = S.range.map((v, i) => { if (i < 7 || !isN(v)) return NA; for (let k = i - 6; k < i; k++) if (!isN(S.range[k]) || S.range[k] <= v) return 0; return 1; });
    // outcomes (next day) - results only, not usable in rules
    S.nxto = O.map((_, i) => (i < n - 1 ? O[i + 1] : NA)); S.nxth = H.map((_, i) => (i < n - 1 ? H[i + 1] : NA)); S.nxtl = L.map((_, i) => (i < n - 1 ? L[i + 1] : NA)); S.nxtc = C.map((_, i) => (i < n - 1 ? C[i + 1] : NA));
    S.nxtchg = C.map((c, i) => (i < n - 1 && c ? (C[i + 1] / c - 1) * 100 : NA)); S.nxtgap = C.map((c, i) => (i < n - 1 && c ? (O[i + 1] / c - 1) * 100 : NA));
    S.nxtdir = S.nxtchg.map((v) => (isN(v) ? (v > 0 ? 1 : v < 0 ? -1 : 0) : NA));
    // market / global columns, aligned to the latest value on or before the row date
    const mcols = [];
    if (mkt) GLOB.forEach(([k, , nm]) => {
      const m = mkt[k]; if (!m) return; const ds = Object.keys(m).sort(); let j = -1; const v = mk(n);
      for (let i = 0; i < n; i++) { while (j + 1 < ds.length && ds[j + 1] <= base.d[i]) j++; if (j >= 0) v[i] = m[ds[j]]; }
      S[k] = v; S[k + 'chg'] = v.map((x, i) => { if (!isN(x) || i === 0) return NA; let q = i - 1; while (q >= 0 && !isN(v[q])) q--; return q >= 0 && v[q] ? (x / v[q] - 1) * 100 : NA; });
      mcols.push(k);
    });
    return { n, S, mcols };
  }

  /* ---------- condition columns + next-day call ---------- */
  function evalConds(conds, T) {
    const ctx = { conds: {} };
    conds.forEach((c, j) => {
      c.err = ''; c.vals = null; c.id = 'x' + (j + 1);
      try { c.ast = parse(c.f); c.vals = evalAst(c.ast, T.S, T.n, ctx); } catch (e) { c.err = e.message || String(e); }
      ctx.conds[c.id] = { vals: c.vals, upto: !!c.vals };
    });
  }
  function predict(conds, T, thr) {
    const n = T.n, score = new Array(n).fill(0), calls = new Array(n).fill(0);
    conds.forEach((c) => { if (!c.vals || !c.dir) return; for (let i = 0; i < n; i++) if (c.vals[i] === 1) score[i] += c.dir * (isN(+c.w) ? +c.w : 1); });
    for (let i = 0; i < n; i++) calls[i] = score[i] >= thr && score[i] > 0 ? 1 : score[i] <= -thr && score[i] < 0 ? -1 : 0;
    const a = T.S.nxtdir; let hit = 0, tot = 0, hitO = 0, totO = 0, up = 0, nn = 0; const cut = Math.floor(n * 0.7);
    for (let i = 0; i < n; i++) {
      if (!isN(a[i]) || a[i] === 0) continue; nn++; if (a[i] > 0) up++;
      if (!calls[i]) continue; tot++; const h = calls[i] === a[i]; if (h) hit++; if (i >= cut) { totO++; if (h) hitO++; }
    }
    return { score, calls, hit, tot, hitO, totO, base: nn ? (up / nn) * 100 : NA, cut };
  }
  function condStats(c, T) {
    if (!c.vals) return null; const a = T.S.nxtchg, n = T.n, cut = Math.floor(n * 0.7); let k = 0, u = 0, s = 0, ko = 0, uo = 0;
    for (let i = 0; i < n; i++) if (c.vals[i] === 1 && isN(a[i])) { k++; if (a[i] > 0) u++; s += a[i]; if (i >= cut) { ko++; if (a[i] > 0) uo++; } }
    let tr = 0; for (let i = 0; i < n; i++) if (c.vals[i] === 1) tr++;
    return { n: tr, k, up: k ? (u / k) * 100 : NA, avg: k ? s / k : NA, upO: ko ? (uo / ko) * 100 : NA, ko };
  }

  /* ---------- column catalogue for the grid ---------- */
  const px = (v) => (isN(v) ? v.toFixed(2) : '');
  const f1 = (v) => (isN(v) ? v.toFixed(1) : '');
  const f2 = (v) => (isN(v) ? v.toFixed(2) : '');
  const inr = (v) => (isN(v) ? Math.round(v).toLocaleString('en-IN') : '');
  const CATALOG = [
    ['PRICE & VOLUME', '#e8eefc', [['open', 'Open', px, 1], ['high', 'High', px, 1], ['low', 'Low', px, 1], ['close', 'Close', px, 1], ['volume', 'Volume', inr, 1], ['delqty', 'Del qty', inr], ['delpct', 'Del %', f1, 1], ['delratio', 'Del/avg', f2], ['delchg', 'Del Δ', f1], ['turnover', 'Turnover Cr', f1]]],
    ['DAY SHAPE', '#eaf6ee', [['pclose', 'Prev close', px], ['chg', 'Chg %', f2], ['gap', 'Gap %', f2], ['range', 'Range %', f2], ['body', 'Body %', f2], ['bodyr', 'Body/rng', f2], ['upwick', 'Up wick %', f2], ['lowwick', 'Low wick %', f2], ['clv', 'CLV', f2], ['typical', 'Typical', px], ['volratio', 'Vol/avg20', f2], ['insidebar', 'Inside', (v) => (isN(v) ? v : '')], ['narrow7', 'NR7', (v) => (isN(v) ? v : '')], ['streak', 'Streak', (v) => (isN(v) ? v : '')], ['dow', 'Dow', (v) => (isN(v) ? DOW[v] : '')]]],
    ['TREND', '#fdf3e2', [['ema9', 'EMA9', px], ['ema20', 'EMA20', px], ['ema50', 'EMA50', px], ['ema200', 'EMA200', px], ['sma5', 'SMA5', px], ['sma10', 'SMA10', px], ['sma20', 'SMA20', px], ['sma50', 'SMA50', px], ['sma200', 'SMA200', px], ['dist20', 'vs EMA20 %', f2], ['dist50', 'vs EMA50 %', f2], ['dist200', 'vs EMA200 %', f2], ['ret5', '5d %', f2], ['ret10', '10d %', f2], ['ret20', '20d %', f2]]],
    ['MOMENTUM', '#f3e9fb', [['rsi14', 'RSI14', f1], ['rsi5', 'RSI5', f1], ['macd', 'MACD', f2], ['macdsig', 'Signal', f2], ['macdhist', 'Hist', f2], ['stochk', 'Stoch K', f1], ['stochd', 'Stoch D', f1], ['willr', 'Will %R', f1], ['adx', 'ADX', f1], ['pdi', '+DI', f1], ['mdi', '−DI', f1]]],
    ['VOLATILITY / LEVELS', '#e6f4f8', [['atr14', 'ATR14', f2], ['atrpct', 'ATR %', f2], ['bbpct', 'BB %b', f2], ['bbw', 'BB width %', f2], ['hh20', '20d high', px], ['ll20', '20d low', px], ['hh52', '52w high', px], ['ll52', '52w low', px], ['near52h', 'vs 52w high %', f2], ['near52l', 'vs 52w low %', f2], ['obv', 'OBV', inr], ['obvema', 'OBV EMA20', inr]]],
  ];
  const MKT_CAT = (cols) => [['MARKET & GLOBAL', '#fbeaea', cols.flatMap((k) => { const nm = (GLOB.find((g) => g[0] === k) || [0, 0, k])[2]; return [[k, nm, f2], [k + 'chg', nm + ' Δ%', f2]]; })]];
  const PRED_CAT = ['PREDICTED NEXT DAY (today + N-day averages)', '#d8f0dc', [['pdir', 'Trend', (v) => (isN(v) ? (v > 0 ? 'UP' : v < 0 ? 'DOWN' : '') : '')], ['popen', 'Pred open', px], ['phigh', 'Pred high', px], ['plow', 'Pred low', px], ['pclose', 'Pred close', px], ['avgGap', 'Avg gap %', f2], ['avgUp', 'Avg open→high %', f2], ['avgDn', 'Avg open→low %', f2], ['avgBody', 'Avg body %', f2]]];
  const NEXT_CAT = ['ACTUAL NEXT DAY (only to check the prediction)', '#dfe7f5', [['nxto', 'Actual open', px], ['nxth', 'Actual high', px], ['nxtl', 'Actual low', px], ['nxtc', 'Actual close', px], ['nxtgap', 'Actual gap %', f2], ['nxtchg', 'Actual chg %', f2], ['nxtdir', 'Actual', (v) => (isN(v) ? (v > 0 ? 'UP' : v < 0 ? 'DOWN' : 'FLAT') : '')]]];
  const ERR_CAT = ['ERROR: actual vs predicted %', '#fbeee0', [['eo', 'Open err %', f2], ['eh', 'High err %', f2], ['el', 'Low err %', f2], ['ec', 'Close err %', f2]]];

  const PRESETS = [
    ['Open = High (sold from the open)', 'open = high'], ['Open = Low (bought from the open)', 'open = low'], ['Gap up > 1%', 'gap > 1'], ['Gap down < -1%', 'gap < -1'],
    ['Close above EMA20', 'close > ema20'], ['RSI oversold', 'rsi14 < 30'], ['RSI overbought', 'rsi14 > 70'], ['Volume spike 2x', 'volratio > 2'],
    ['Delivery up + price up (accumulation)', 'delpct > prev(delpct,1) and close > pclose'], ['20-day breakout', 'close > highest(close,20)'], ['Closed in top 20% of range', 'clv > 0.6'],
    ['3 down days in a row', 'streak(chg < 0) >= 3'], ['Inside bar', 'insidebar = 1'], ['EMA9 crosses above EMA20', 'cross(ema9, ema20)'], ['Heavy delivery (1.3x avg)', 'delratio > 1.3'], ['Nifty down more than 1%', 'niftychg < -1'], ['Mondays', 'dow = 1'],
  ];
  const DEFAULT_CONDS = [
    { f: 'open = high', dir: -1, w: 1 }, { f: 'open = low', dir: 1, w: 1 }, { f: 'gap > 1', dir: 0, w: 1 }, { f: 'close > ema20', dir: 1, w: 1 },
    { f: 'rsi14 < 30', dir: 1, w: 1 }, { f: 'rsi14 > 70', dir: -1, w: 1 }, { f: 'volratio > 2 and chg > 0', dir: 1, w: 1 }, { f: 'delratio > 1.3 and chg > 0', dir: 1, w: 1 },
  ];

  /* next-day OHLC from the last N sessions' average gap / open->high / open->low / body */
  function ohlcPred(T, N, calls, tol) {
    const n = T.n, S = T.S, o = () => mk(n);
    const R = { pdir: o(), popen: o(), phigh: o(), plow: o(), pclose: o(), eo: o(), eh: o(), el: o(), ec: o(), avgGap: o(), avgUp: o(), avgDn: o(), avgBody: o() };
    N = Math.max(2, Math.round(N) || 5);
    for (let i = N; i < n; i++) {
      let g = 0, u = 0, d = 0, b = 0, ab = 0, ok = true;
      for (let k = i - N + 1; k <= i; k++) {
        const O = S.open[k], H = S.high[k], L = S.low[k], C = S.close[k], pc = S.close[k - 1];
        if (![O, H, L, C, pc].every(isN) || !O || !pc) { ok = false; break; }
        g += (O / pc - 1) * 100; u += ((H - O) / O) * 100; d += ((O - L) / O) * 100; b += ((C - O) / O) * 100; ab += (Math.abs(C - O) / O) * 100;
      }
      if (!ok) continue;
      g /= N; u /= N; d /= N; b /= N; ab /= N;
      const dir = calls && calls[i] ? calls[i] : b > 0 ? 1 : b < 0 ? -1 : 0, c0 = S.close[i];
      const po = c0 * (1 + g / 100), pc2 = po * (1 + (dir * ab) / 100);
      const ph = Math.max(po * (1 + u / 100), po, pc2), pl = Math.min(po * (1 - d / 100), po, pc2);
      R.pdir[i] = dir; R.popen[i] = po; R.phigh[i] = ph; R.plow[i] = pl; R.pclose[i] = pc2; R.avgGap[i] = g; R.avgUp[i] = u; R.avgDn[i] = d; R.avgBody[i] = b;
      if (i < n - 1) { R.eo[i] = (S.nxto[i] / po - 1) * 100; R.eh[i] = (S.nxth[i] / ph - 1) * 100; R.el[i] = (S.nxtl[i] / pl - 1) * 100; R.ec[i] = (S.nxtc[i] / pc2 - 1) * 100; }
    }
    const st = {}; [['Open', 'eo'], ['High', 'eh'], ['Low', 'el'], ['Close', 'ec']].forEach(([nm, k]) => { let c = 0, w = 0, a = 0; R[k].forEach((v) => { if (!isN(v)) return; c++; a += Math.abs(v); if (Math.abs(v) <= tol) w++; }); st[nm] = { n: c, within: c ? (w / c) * 100 : NA, mae: c ? a / c : NA }; });
    let dh = 0, dn = 0; for (let i = 0; i < n - 1; i++) if (isN(R.pdir[i]) && R.pdir[i] && isN(S.nxtdir[i]) && S.nxtdir[i]) { dn++; if (R.pdir[i] === S.nxtdir[i]) dh++; } st.dir = { n: dn, hit: dn ? (dh / dn) * 100 : NA };
    let rg = 0, rn = 0; for (let i = 0; i < n - 1; i++) if (isN(R.phigh[i]) && isN(S.nxth[i])) { rn++; if (S.nxth[i] <= R.phigh[i] && S.nxtl[i] >= R.plow[i]) rg++; } st.inside = { n: rn, pct: rn ? (rg / rn) * 100 : NA };
    return { R, st };
  }
  const core = { ohlcPred, parse, evalAst, build, evalConds, predict, condStats, tokenize, sma, ema, rsi, PRESETS, GLOB };
  root.JCAn = Object.assign(root.JCAn || {}, { core });
  if (typeof document === 'undefined') return;

  /* ====================== UI ====================== */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = (t) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);
  const dmy = (d) => { const x = new Date(d + 'T00:00:00Z'); return String(x.getUTCDate()).padStart(2, '0') + '-' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getUTCMonth()] + '-' + String(x.getUTCFullYear()).slice(2); };
  const ST = { sym: '', busy: false, msg: '', base: null, raw: null, edits: {}, conds: [], thr: 1, N: 5, tol: 1, Q: null, mkt: null, mktOn: false, T: null, P: null, lastSync: '', dl: null, help: false, stats: true };
  try { const j = JSON.parse(localStorage.getItem('jc_an_v1') || 'null'); if (j && Array.isArray(j.conds)) { ST.conds = j.conds.map((c) => ({ f: String(c.f || ''), dir: +c.dir || 0, w: isN(+c.w) ? +c.w : 1 })); ST.thr = isN(+j.thr) ? +j.thr : 1; ST.N = isN(+j.N) && +j.N >= 2 ? Math.round(+j.N) : 5; ST.tol = isN(+j.tol) && +j.tol > 0 ? +j.tol : 1; } } catch (e) { /* ignore */ }
  if (!ST.conds.length) ST.conds = DEFAULT_CONDS.map((c) => ({ ...c }));
  const saveCols = () => { try { localStorage.setItem('jc_an_v1', JSON.stringify({ conds: ST.conds.map((c) => ({ f: c.f, dir: c.dir, w: c.w })), thr: ST.thr, N: ST.N, tol: ST.tol })); } catch (e) { /* ignore */ } };
  const saveEdits = () => { try { localStorage.setItem('jc_an_e_' + ST.sym, JSON.stringify(ST.edits)); } catch (e) { /* ignore */ } };

  async function loadDelivJson() {
    if (ST.dl) return ST.dl;
    try { const r = await fetch('data/delivery.json?h=' + Math.floor(Date.now() / 3600000), { cache: 'no-cache' }); if (r.ok) ST.dl = await r.json(); } catch (e) { /* ignore */ }
    return ST.dl;
  }
  function applyEdits() {
    const r = ST.raw; if (!r) return; const b = { d: r.d.slice(), o: r.o.slice(), h: r.h.slice(), l: r.l.slice(), c: r.c.slice(), v: r.v.slice(), dq: r.dq.slice(), dp: r.dp.slice() };
    const idx = {}; b.d.forEach((d, i) => { idx[d] = i; });
    Object.keys(ST.edits).forEach((d) => { const i = idx[d]; if (i == null) return; const e = ST.edits[d]; ['o', 'h', 'l', 'c', 'v', 'dp'].forEach((k) => { if (isN(e[k])) b[k][i] = e[k]; }); if (isN(e.dp) && isN(b.v[i])) b.dq[i] = (e.dp * b.v[i]) / 100; });
    ST.base = b;
  }
  function recompute() {
    if (!ST.base) return; ST.T = build(ST.base, ST.mktOn ? ST.mkt : null); evalConds(ST.conds, ST.T); ST.P = predict(ST.conds, ST.T, ST.thr);
    ST.Q = ohlcPred(ST.T, ST.N, ST.P.calls, ST.tol); Object.keys(ST.Q.R).forEach((k) => { ST.T.S[k] = ST.Q.R[k]; });
  }

  async function load(sym) {
    sym = String(sym || '').trim().toUpperCase().replace(/\.NS$/, ''); if (!sym || ST.busy) return;
    ST.sym = sym; ST.busy = true; ST.msg = 'Loading 2 years of ' + sym + '…'; paint();
    try {
      const yf = typeof symYf === 'function' ? symYf(sym) : sym + '.NS';
      const ch = await fetchChart(yf, '2y', '1d'); const bars = (ch && ch.bars) || []; if (bars.length < 30) throw new Error('Not enough price history for ' + sym);
      const dl = await loadDelivJson(); const dm = {}; if (dl && dl.d) Object.keys(dl.d).forEach((d) => { const x = dl.d[d][sym]; if (x) dm[d] = x; });
      const r = { d: [], o: [], h: [], l: [], c: [], v: [], dq: [], dp: [] };
      bars.forEach((b) => { const d = day(b.t); if (r.d.length && r.d[r.d.length - 1] === d) return; const x = dm[d]; r.d.push(d); r.o.push(r2(b.o)); r.h.push(r2(b.h)); r.l.push(r2(b.l)); r.c.push(r2(b.c)); r.v.push(b.v || 0); const dq = x ? x[0] : NA, tq = x ? x[1] : NA; r.dq.push(isN(dq) ? dq : NA); r.dp.push(isN(dq) && isN(tq) && tq > 0 ? Math.round((dq / tq) * 1000) / 10 : isN(dq) && b.v > 0 ? Math.round((dq / b.v) * 1000) / 10 : NA); });
      ST.raw = r; ST.mkt = null; ST.mktOn = false;
      try { ST.edits = JSON.parse(localStorage.getItem('jc_an_e_' + sym) || '{}') || {}; } catch (e) { ST.edits = {}; }
      applyEdits(); recompute(); const nd = r.dp.filter(isN).length; ST.msg = sym + ': ' + r.d.length + ' sessions (' + dmy(r.d[0]) + ' to ' + dmy(r.d[r.d.length - 1]) + '), delivery % on ' + nd + ' of them' + (nd < r.d.length ? ' (the delivery feed only goes back to ' + (Object.keys((ST.dl && ST.dl.d) || {}).sort()[0] || 'its start') + ')' : '') + '.';
    } catch (e) { ST.msg = 'Could not load ' + sym + ': ' + (e && e.message ? e.message : e); }
    ST.busy = false; paint(false);
    if (ST.raw && typeof getBackend === 'function' && getBackend() && typeof fetchDelivery === 'function') backendDel(sym);
  }
  async function backendDel(sym) {
    try {
      const j = await Promise.race([fetchDelivery(sym), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 20000))]); if (ST.sym !== sym || !ST.raw || !j) return;
      const r = ST.raw, idx = {}; r.d.forEach((d, i) => { idx[d] = i; }); let add = 0;
      (j.hist || []).forEach((h) => { const i = idx[h.date]; if (i == null || isN(r.dp[i]) || !isN(h.del)) return; r.dq[i] = h.del; r.dp[i] = isN(h.pct) ? Math.round(h.pct * 10) / 10 : isN(h.traded) && h.traded > 0 ? Math.round((h.del / h.traded) * 1000) / 10 : NA; add++; });
      if (add) { applyEdits(); recompute(); ST.msg += ' Older delivery % merged from the backend for ' + add + ' more days.'; paint(true); }
    } catch (e) { /* optional */ }
  }
  async function loadMarket() {
    if (!ST.raw || ST.busy) return; ST.busy = true; ST.msg = 'Loading Nifty, VIX, crude, USD/INR, dollar index, US 10y and S&P 500…'; paint();
    const m = {}; let ok = 0;
    for (const [k, y] of GLOB) { try { const ch = await fetchChart(y, '2y', '1d'); m[k] = {}; (ch.bars || []).forEach((b) => { m[k][day(b.t)] = b.c; }); ok++; } catch (e) { /* skip */ } }
    ST.mkt = m; ST.mktOn = ok > 0; ST.busy = false; recompute(); ST.msg = ok ? 'Market columns added (' + ok + ' of ' + GLOB.length + ' series). Global values are matched to the latest close on or before each row date - the US close of a day is known before the next Indian open.' : 'Market series could not be loaded.'; paint(true);
  }

  /* ---------- rendering ---------- */
  function allGroups() { const T = ST.T; const g = CATALOG.slice(); if (T && T.mcols.length) g.push(MKT_CAT(T.mcols)[0]); return g; }
  function columnPlan() {
    const groups = allGroups().map((g) => ({ name: g[0], bg: g[1], cols: g[2].map((c) => ({ key: c[0], label: c[1], fmt: c[2], edit: !!c[3] })) }));
    const sub = [PRED_CAT, NEXT_CAT, ERR_CAT].map((g) => ({ name: g[0], bg: g[1], cols: g[2].map((c) => ({ key: c[0], label: c[1], fmt: c[2], bg: g[1] })) }));
    return { groups, next: { name: 'NEXT DAY', bg: '#eef1f8', sub, cols: sub.flatMap((g) => g.cols) } };
  }
  const H1 = 18, H2 = 26, H3 = 22, H4 = 16;
  function tableHtml() {
    const T = ST.T, P = ST.P, b = ST.base; if (!T) return '';
    const plan = columnPlan(), n = T.n, S = T.S;
    const tops = [0, H1, H1 + H2, H1 + H2 + H3]; const stats = ST.conds.map((c) => condStats(c, T));
    const nC = ST.conds.length; let h = '<table class="anT"><thead>';
    const gcell = (name, span, bg) => `<th colspan="${span}" style="background:${bg};top:${tops[0]}px;height:${H1}px" class="g">${esc(name)}</th>`;
    h += '<tr><th class="d" style="top:0;height:' + H1 + 'px;background:#dfe5f3">SHEET</th>';
    plan.groups.forEach((g) => { h += gcell(g.name, g.cols.length, g.bg); });
    h += gcell('YOUR RULES (type the rule in the header)', Math.max(1, nC), '#fff4cf'); h += gcell('NEXT-DAY CALL', 4, '#d8f0dc'); plan.next.sub.forEach((g) => { h += gcell(g.name, g.cols.length, g.bg); }); h += '</tr>';
    h += '<tr><th class="d" style="top:' + tops[1] + 'px;height:' + H2 + 'px;background:#eef1f8">Date</th>';
    plan.groups.forEach((g) => g.cols.forEach((c) => { h += `<th style="top:${tops[1]}px;height:${H2}px;background:${g.bg}" title="${esc(c.key)}">${esc(c.label)}</th>`; }));
    ST.conds.forEach((c, j) => { h += `<th class="cond${c.err ? ' bad' : ''}" style="top:${tops[1]}px;height:${H2}px" title="${esc(c.err || ('x' + (j + 1) + ' - ' + c.f))}"><input class="fx" data-j="${j}" value="${esc(c.f)}" spellcheck="false" placeholder="e.g. open = high"><button class="rm" data-rm="${j}" title="Remove column">×</button></th>`; });
    if (!nC) h += `<th style="top:${tops[1]}px;height:${H2}px;background:#fff9e3">(add a column)</th>`;
    ['Score', 'Call', 'Actual', 'Hit?'].forEach((x) => { h += `<th style="top:${tops[1]}px;height:${H2}px;background:#e6f6e9">${x}</th>`; });
    plan.next.cols.forEach((c) => { h += `<th style="top:${tops[1]}px;height:${H2}px;background:${c.bg}" title="${esc(c.key)}">${esc(c.label)}</th>`; });
    h += '</tr>';
    // row 3: direction + weight
    const nBase = plan.groups.reduce((a, g) => a + g.cols.length, 0);
    h += `<tr><th class="d" style="top:${tops[2]}px;height:${H3}px;background:#f6f8fc;font-weight:400">rule id / dir / wt</th><th colspan="${nBase}" style="top:${tops[2]}px;height:${H3}px;background:#f6f8fc;text-align:left;font-weight:400;color:#52607f">${ST.stats ? 'The stat rows under each rule: days TRUE, chance next day closes UP when TRUE, average next-day %, and the same chance on the most recent 30% of days (out of sample).' : ''}</th>`;
    ST.conds.forEach((c, j) => { h += `<th style="top:${tops[2]}px;height:${H3}px;background:#fffaf0" class="dw"><b>x${j + 1}</b> <select data-dir="${j}"><option value="1"${c.dir > 0 ? ' selected' : ''}>UP if TRUE</option><option value="-1"${c.dir < 0 ? ' selected' : ''}>DOWN if TRUE</option><option value="0"${!c.dir ? ' selected' : ''}>not scored</option></select> <input class="wt" data-w="${j}" value="${esc(c.w)}" title="Weight"></th>`; });
    if (!nC) h += `<th style="top:${tops[2]}px;height:${H3}px"></th>`;
    h += `<th colspan="4" style="top:${tops[2]}px;height:${H3}px;background:#e6f6e9">call at score ≥ <input class="wt" id="anThr" value="${esc(ST.thr)}"></th><th colspan="${plan.next.cols.length}" style="top:${tops[2]}px;height:${H3}px;background:${plan.next.bg}"></th></tr>`;
    if (ST.stats) {
      const lab = ['days TRUE', 'next ↑ %', 'avg next %', 'last 30% ↑'];
      lab.forEach((lb, r) => {
        const top = tops[3] + r * H4;
        h += `<tr><th class="d" style="top:${top}px;height:${H4}px;background:#f6f8fc;font-weight:400;font-size:10px">${lb}</th><th colspan="${nBase}" style="top:${top}px;height:${H4}px;background:#f6f8fc"></th>`;
        ST.conds.forEach((c, j) => {
          const s = stats[j]; let v = '', cl = '';
          if (s) {
            if (r === 0) v = s.n; else if (r === 1) { v = isN(s.up) ? s.up.toFixed(0) + '%' : ''; if (isN(s.up) && isN(P.base) && s.k >= 15) cl = s.up >= P.base + 4 ? 'pos' : s.up <= P.base - 4 ? 'neg' : ''; }
            else if (r === 2) { v = isN(s.avg) ? s.avg.toFixed(2) : ''; cl = isN(s.avg) ? (s.avg > 0.05 ? 'pos' : s.avg < -0.05 ? 'neg' : '') : ''; }
            else { v = isN(s.upO) ? s.upO.toFixed(0) + '% (' + s.ko + ')' : ''; }
          }
          h += `<th class="st ${cl}" style="top:${top}px;height:${H4}px">${v}</th>`;
        });
        if (!nC) h += `<th style="top:${top}px"></th>`;
        if (r === 0) h += `<th colspan="4" style="top:${top}px;height:${H4}px;background:#e6f6e9;font-weight:400;font-size:10px">${P.tot} calls made</th>`;
        else if (r === 1) h += `<th colspan="4" style="top:${top}px;height:${H4}px;background:#e6f6e9;font-weight:700">${P.tot ? ((P.hit / P.tot) * 100).toFixed(1) + '% right' : '—'}</th>`;
        else if (r === 2) h += `<th colspan="4" style="top:${top}px;height:${H4}px;background:#e6f6e9;font-weight:400;font-size:10px">always-UP baseline ${isN(P.base) ? P.base.toFixed(1) + '%' : '—'}</th>`;
        else h += `<th colspan="4" style="top:${top}px;height:${H4}px;background:#e6f6e9;font-weight:700">${P.totO ? ((P.hitO / P.totO) * 100).toFixed(1) + '% on last 30% (' + P.totO + ')' : '—'}</th>`;
        h += `<th colspan="${plan.next.cols.length}" style="top:${top}px;height:${H4}px;background:${plan.next.bg}"></th></tr>`;
      });
    }
    h += '</thead><tbody>';
    const nextDay = (d) => { const x = new Date(d + 'T00:00:00Z'); do { x.setUTCDate(x.getUTCDate() + 1); } while ([0, 6].includes(x.getUTCDay())); return x.toISOString().slice(0, 10); };
    for (let i = n - 1; i >= 0; i--) {
      const last = i === n - 1, ed = ST.edits[b.d[i]] || {};
      h += `<tr${last ? ' class="last"' : ''}><td class="d">${dmy(b.d[i])}</td>`;
      plan.groups.forEach((g) => g.cols.forEach((c) => {
        const v = S[c.key] ? S[c.key][i] : NA; const dir = c.key === 'chg' || c.key === 'gap' || c.key === 'body' ? (isN(v) ? (v > 0 ? ' pos' : v < 0 ? ' neg' : '') : '') : '';
        const edk = { open: 'o', high: 'h', low: 'l', close: 'c', volume: 'v', delpct: 'dp' }[c.key];
        h += c.edit ? `<td class="e${dir}${edk && isN(ed[edk]) ? ' ed' : ''}" contenteditable="true" data-i="${i}" data-k="${edk}">${esc(c.fmt(v))}</td>` : `<td class="${dir.trim()}">${esc(c.fmt(v))}</td>`;
      }));
      ST.conds.forEach((c) => { const v = c.vals ? c.vals[i] : NA; h += `<td class="b ${v === 1 ? 'tr' : v === 0 ? 'fa' : 'na'}">${v === 1 ? 'TRUE' : v === 0 ? 'FALSE' : ''}</td>`; });
      if (!nC) h += '<td></td>';
      const sc = P.score[i], cl = P.calls[i], ac = S.nxtdir[i];
      h += `<td class="sc">${sc ? sc.toFixed(sc % 1 ? 1 : 0) : ''}</td><td class="call ${cl > 0 ? 'up' : cl < 0 ? 'dn' : ''}">${cl > 0 ? 'UP' : cl < 0 ? 'DOWN' : '—'}${last ? ' ▶' : ''}</td><td class="${ac > 0 ? 'pos' : ac < 0 ? 'neg' : ''}">${isN(ac) ? (ac > 0 ? 'UP' : ac < 0 ? 'DOWN' : 'FLAT') : last ? 'next ' + dmy(nextDay(b.d[i])) : ''}</td><td class="hit">${cl && isN(ac) && ac !== 0 ? (cl === ac ? '✓' : '✗') : ''}</td>`;
      plan.next.cols.forEach((c) => { const v = S[c.key][i]; const cc = c.key === 'nxtchg' || c.key === 'nxtgap' ? (isN(v) ? (v > 0 ? ' pos' : v < 0 ? ' neg' : '') : '') : c.key === 'nxtdir' || c.key === 'pdir' ? (v > 0 ? ' pos' : v < 0 ? ' neg' : '') : /^e[ohlc]$/.test(c.key) && isN(v) ? (Math.abs(v) <= ST.tol ? ' pos' : '') : ''; h += `<td class="${cc.trim()}">${esc(c.fmt(v))}</td>`; });
      h += '</tr>';
    }
    return h + '</tbody></table>';
  }
  function ohlcHtml() {
    const Q = ST.Q; if (!Q) return ''; const s = Q.st, i = ST.T.n - 1, R = Q.R, f = (v) => (isN(v) ? v.toFixed(2) : '—');
    const row = (nm) => `<tr><th>${nm}</th><td>${s[nm].n ? s[nm].within.toFixed(0) + '%' : '—'}</td><td>${isN(s[nm].mae) ? s[nm].mae.toFixed(2) + '%' : '—'}</td></tr>`;
    return `<div class="anAcc"><table><tr><th>Price (N=${ST.N} days)</th><th>within ±${ST.tol}%</th><th>avg miss</th></tr>${['Open', 'High', 'Low', 'Close'].map(row).join('')}</table>
      <div class="anNx"><b>Next session</b>: trend <b>${R.pdir[i] > 0 ? 'UP ▲' : R.pdir[i] < 0 ? 'DOWN ▼' : '—'}</b> · open ≈ <b>${f(R.popen[i])}</b> · high ≈ <b>${f(R.phigh[i])}</b> · low ≈ <b>${f(R.plow[i])}</b> · close ≈ <b>${f(R.pclose[i])}</b><br><span>Trend = the rule call (if none, the sign of the ${ST.N}-day average body). Open = today's close + ${ST.N}-day average gap; high/low = open + ${ST.N}-day average open→high / open→low; close = open ± average body. Next actual high-low stayed inside the predicted range on <b>${isN(s.inside.pct) ? s.inside.pct.toFixed(0) + '%' : '—'}</b> of days. Change <i>Avg days</i> above to compare 5, 10, 20…</span></div></div>`;
  }
  function summaryHtml() {
    const T = ST.T, P = ST.P; if (!T) return '';
    const n = T.n, i = n - 1, cl = P.calls[i], sc = P.score[i];
    const on = ST.conds.map((c, j) => (c.vals && c.vals[i] === 1 && c.dir ? `x${j + 1} <i>${esc(c.f)}</i> (${c.dir > 0 ? '▲' : '▼'}${c.w})` : '')).filter(Boolean);
    const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '—');
    return `<div class="anSum"><div class="big ${cl > 0 ? 'up' : cl < 0 ? 'dn' : ''}"><small>CALL FOR THE NEXT SESSION</small>${cl > 0 ? 'UP ▲' : cl < 0 ? 'DOWN ▼' : 'NO CALL'}<small>score ${sc ? sc : 0} · needs ±${ST.thr}</small></div>
      <div class="kv"><div><b>${pct(P.hit, P.tot)}</b><span>right over all ${P.tot} calls</span></div><div><b>${pct(P.hitO, P.totO)}</b><span>right on the last 30% (${P.totO}) - the honest number</span></div><div><b>${isN(P.base) ? P.base.toFixed(1) + '%' : '—'}</b><span>days that closed UP (always-UP baseline)</span></div><div><b>${pct(P.tot, n - 1)}</b><span>of days had a call</span></div></div>
      ${ohlcHtml()}<div class="why">${on.length ? 'Rules TRUE on the last row: ' + on.join(' · ') : 'No scored rule is TRUE on the last row.'}</div></div>`;
  }
  function helpHtml() {
    return `<div class="anHelp"><b>How it works.</b> Every row is one trading day. Grey-blue columns are data and indicators; the yellow header cells are <b>your rules</b> - type a condition and each row becomes TRUE or FALSE.
      <ul><li>Compare with <code>&gt; &lt; &gt;= &lt;= = !=</code>, join with <code>and</code> / <code>or</code> / <code>not</code>, group with ( ), do maths with <code>+ - * /</code>.</li>
      <li>Columns: <code>open high low close volume delpct delqty chg gap range body clv volratio delratio ema9 ema20 ema50 ema200 sma20 rsi14 macd macdhist adx pdi mdi atr14 bbpct stochk obv hh20 ll20 hh52 ll52 streak dow</code> (and <code>nifty niftychg vix crude usdinr dxy us10y spx</code> after you add market columns). Hover any column header for its name. Earlier rules can be reused as <code>x1</code>, <code>x2</code>…</li>
      <li>Functions: <code>prev(x,n)</code> value n days ago · <code>sma(x,n) ema(x,n) rsi(x,n) sum stdev roc</code> · <code>highest(x,n) lowest(x,n)</code> over the previous n days, today excluded · <code>cross(a,b) crossdown(a,b)</code> · <code>streak(cond)</code> consecutive TRUE days · <code>count(cond,n)</code> · <code>abs min max if atr</code>.</li>
      <li>Examples: <code>open = high</code> · <code>gap &gt; 1 and volratio &gt; 1.5</code> · <code>close &gt; highest(close,20)</code> · <code>delpct &gt; sma(delpct,20)*1.2 and chg &gt; 0</code> · <code>rsi14 &lt; 30 and close &gt; prev(close,1)</code>.</li>
      <li>Under each rule choose <b>UP if TRUE</b>, <b>DOWN if TRUE</b> or <b>not scored</b> and a weight. A row's score is the sum of the weights of its TRUE rules; at or beyond ±the threshold it becomes a call. The three green columns then compare the call with what really happened next.</li>
      <li>Cells with a pale blue edge (open, high, low, close, volume, delivery %) can be typed over - everything recalculates, and your edits are remembered per stock in this browser.</li>
      <li><b>Be careful:</b> rules tuned on the same rows they are scored on will look better than they are. Watch the <i>last 30%</i> numbers and the same rules on other stocks before trusting any combination.</li></ul></div>`;
  }
  function paint(keepScroll) {
    const p = $('pAn'); if (!p) return;
    const sc = p.querySelector('.anWrap'), st = sc ? [sc.scrollTop, sc.scrollLeft] : null;
    const opts = PRESETS.map((x, i) => `<option value="${i}">${esc(x[0])}</option>`).join('');
    const hasT = !!ST.T;
    p.innerHTML = `<div class="anBar"><b>🧮 Data analyzer</b><input id="anSym" value="${esc(ST.sym)}" placeholder="Symbol e.g. BEL" autocomplete="off"><button class="ghostBtn" id="anGo">Load 2 years</button>
      <label class="anP">Avg days <input class="wt" id="anN" value="${esc(ST.N)}" title="Number of past sessions used for the average gap / open-high / open-low / body"></label><label class="anP">Tolerance % <input class="wt" id="anTol" value="${esc(ST.tol)}" title="A predicted price counts as right if the actual is within this % of it"></label>
      <button class="ghostBtn" id="anAdd"${hasT ? '' : ' disabled'}>+ Rule column</button><select id="anPre"${hasT ? '' : ' disabled'}><option value="">Add a ready-made rule…</option>${opts}</select>
      <button class="ghostBtn" id="anMkt"${hasT && !ST.mktOn ? '' : ' disabled'}>${ST.mktOn ? 'Market columns on' : '+ Market & global columns'}</button>
      <button class="ghostBtn" id="anAuto"${hasT ? '' : ' disabled'} title="Set every rule to UP or DOWN by what it did historically">Auto-direction</button>
      <button class="ghostBtn" id="anStat"${hasT ? '' : ' disabled'}>${ST.stats ? 'Hide' : 'Show'} stats</button>
      <button class="ghostBtn" id="anCsv"${hasT ? '' : ' disabled'}>⬇ CSV</button><button class="ghostBtn" id="anTsv"${hasT ? '' : ' disabled'}>Copy for Excel</button><button class="ghostBtn" id="anHelp">? Help</button><button class="ghostBtn" id="anReset">Reset rules</button></div>
      <div class="note anMsg">${ST.busy ? '<span class="spin"></span> ' : ''}${esc(ST.msg || 'Type a symbol and press Load - or select a stock above and open this view.')}</div>
      ${ST.help ? helpHtml() : ''}${hasT ? summaryHtml() : ''}<div class="anWrap">${hasT ? tableHtml() : ''}</div>`;
    const w = p.querySelector('.anWrap'); if (w) { if (keepScroll && st) { w.scrollTop = st[0]; w.scrollLeft = st[1]; } else w.scrollTop = 0; }
  }
  function refresh() { recompute(); paint(true); }

  function csvOf(sep) {
    const T = ST.T, P = ST.P, b = ST.base, plan = columnPlan(); const cols = []; plan.groups.forEach((g) => g.cols.forEach((c) => cols.push(c)));
    const q = (s) => { s = String(s == null ? '' : s); return sep === ',' && /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['Date'].concat(cols.map((c) => c.label), ST.conds.map((c) => c.f), ['Score', 'Call', 'Actual next'], plan.next.cols.map((c) => c.label));
    const rows = [head.map(q).join(sep)];
    for (let i = 0; i < T.n; i++) {
      const r = [b.d[i]]; cols.forEach((c) => { const v = T.S[c.key][i]; r.push(isN(v) ? (c.key === 'dow' ? DOW[v] : Math.round(v * 10000) / 10000) : ''); });
      ST.conds.forEach((c) => r.push(c.vals && c.vals[i] != null ? (c.vals[i] ? 'TRUE' : 'FALSE') : ''));
      r.push(P.score[i], P.calls[i] > 0 ? 'UP' : P.calls[i] < 0 ? 'DOWN' : '', T.S.nxtdir[i] > 0 ? 'UP' : T.S.nxtdir[i] < 0 ? 'DOWN' : '');
      plan.next.cols.forEach((c) => { const v = T.S[c.key][i]; r.push(isN(v) ? (c.key === 'nxtdir' || c.key === 'pdir' ? (v > 0 ? 'UP' : v < 0 ? 'DOWN' : 'FLAT') : Math.round(v * 10000) / 10000) : ''); });
      rows.push(r.map(q).join(sep));
    }
    return rows.join('\n');
  }
  function commitCell(td) {
    const i = +td.getAttribute('data-i'), k = td.getAttribute('data-k'); if (!ST.base || isNaN(i) || !k) return;
    const txt = td.textContent.replace(/[,\s]/g, ''), d = ST.base.d[i], cur = k === 'dp' ? ST.base.dp[i] : ST.base[k][i];
    if (txt === '' || !isN(parseFloat(txt))) { paint(true); return; }
    const v = parseFloat(txt); if (Math.abs(v - (cur == null ? NaN : cur)) < 1e-9) return;
    (ST.edits[d] = ST.edits[d] || {})[k] = v; saveEdits(); applyEdits(); refresh();
  }
  function bind() {
    const p = $('pAn'); if (!p || p.__b) return; p.__b = true;
    p.addEventListener('click', (e) => {
      const t = e.target, id = t.id; const rm = t.getAttribute && t.getAttribute('data-rm');
      if (rm != null) { ST.conds.splice(+rm, 1); saveCols(); refresh(); return; }
      if (id === 'anGo') load($('anSym').value); else if (id === 'anAdd') { ST.conds.push({ f: 'close > prev(close,1)', dir: 0, w: 1 }); saveCols(); refresh(); }
      else if (id === 'anMkt') loadMarket(); else if (id === 'anHelp') { ST.help = !ST.help; paint(true); } else if (id === 'anStat') { ST.stats = !ST.stats; paint(true); }
      else if (id === 'anReset') { if (confirm('Reset the rule columns to the starter set?')) { ST.conds = DEFAULT_CONDS.map((c) => ({ ...c })); ST.thr = 1; saveCols(); refresh(); } }
      else if (id === 'anAuto') { ST.conds.forEach((c) => { const s = condStats(c, ST.T); if (s && s.k >= 15 && isN(s.up)) { c.dir = s.up > ST.P.base + 2 ? 1 : s.up < ST.P.base - 2 ? -1 : 0; } }); saveCols(); refresh(); ST.msg = 'Directions set from history (needs 15+ TRUE days and a 2+ point edge). This is in-sample - check the last-30% numbers.'; paint(true); }
      else if (id === 'anCsv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csvOf(',')], { type: 'text/csv' })); a.download = 'analyzer_' + ST.sym + '.csv'; document.body.appendChild(a); a.click(); a.remove(); }
      else if (id === 'anTsv') { const s = csvOf('\t'); (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(() => { ST.msg = 'Copied - paste into Excel / Google Sheets.'; paint(true); }).catch(() => { ST.msg = 'Copy blocked by the browser - use the CSV button.'; paint(true); }); }
    });
    p.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'anPre') { const x = PRESETS[+t.value]; if (x) { ST.conds.push({ f: x[1], dir: 0, w: 1 }); saveCols(); refresh(); } return; }
      if (t.classList.contains('fx')) { ST.conds[+t.getAttribute('data-j')].f = t.value.trim(); saveCols(); refresh(); return; }
      const dj = t.getAttribute && t.getAttribute('data-dir'); if (dj != null) { ST.conds[+dj].dir = +t.value; saveCols(); refresh(); return; }
      const wj = t.getAttribute && t.getAttribute('data-w'); if (wj != null) { ST.conds[+wj].w = isN(parseFloat(t.value)) ? parseFloat(t.value) : 1; saveCols(); refresh(); return; }
      if (t.id === 'anN') { ST.N = Math.max(2, Math.round(parseFloat(t.value)) || 5); saveCols(); refresh(); return; }
      if (t.id === 'anTol') { ST.tol = Math.max(0.05, parseFloat(t.value) || 1); saveCols(); refresh(); return; }
      if (t.id === 'anThr') { ST.thr = Math.max(0.1, isN(parseFloat(t.value)) ? parseFloat(t.value) : 1); saveCols(); refresh(); }
    });
    p.addEventListener('focusout', (e) => { const t = e.target; if (t.matches && t.matches('td.e[contenteditable]')) commitCell(t); });
    p.addEventListener('keydown', (e) => {
      const t = e.target; if (e.key === 'Enter') { if (t.id === 'anSym') { load(t.value); e.preventDefault(); } else if (t.isContentEditable || (t.classList && (t.classList.contains('fx') || t.classList.contains('wt') || t.id === 'anN' || t.id === 'anTol'))) { e.preventDefault(); t.blur(); } }
    });
  }
  const CSS = `#pAn .anBar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}#pAn .anBar input#anSym{width:110px;text-transform:uppercase;padding:4px 6px}#pAn .anBar select{max-width:190px;padding:3px}
  #pAn .anMsg{margin:4px 0}#pAn .anHelp{font-size:12px;border:1px solid #dde3f0;background:#fafbff;border-radius:6px;padding:8px 12px;margin:6px 0}#pAn .anHelp ul{margin:4px 0 0 16px;padding:0}#pAn .anHelp code{background:#eef1f8;padding:0 3px;border-radius:3px;font-size:11px}
  #pAn .anSum{display:flex;flex-wrap:wrap;gap:14px;align-items:stretch;border:1px solid #dde3f0;border-radius:8px;padding:8px 12px;margin:6px 0;background:#fff}#pAn .anSum .big{min-width:150px;font-size:22px;font-weight:800;color:#52607f;display:flex;flex-direction:column;justify-content:center}#pAn .anSum .big small{font-size:10px;font-weight:600;color:#52607f}#pAn .anSum .big.up{color:#12894b}#pAn .anSum .big.dn{color:#c11d3d}
  #pAn .anSum .kv{display:flex;gap:16px;flex-wrap:wrap}#pAn .anSum .kv div{display:flex;flex-direction:column}#pAn .anSum .kv b{font-size:17px}#pAn .anSum .kv span{font-size:10.5px;color:#52607f;max-width:170px}#pAn .anSum .why{flex-basis:100%;font-size:11.5px;color:#14213d}
  #pAn .anP{font-size:11px;display:inline-flex;gap:3px;align-items:center;font-weight:600}#pAn .anAcc{flex-basis:100%;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}#pAn .anAcc table{border-collapse:collapse;font-size:11px}#pAn .anAcc th,#pAn .anAcc td{border:1px solid #dde3f0;padding:1px 8px;text-align:right}#pAn .anAcc th:first-child{text-align:left}#pAn .anNx{font-size:12px;flex:1;min-width:260px}#pAn .anNx span{font-size:10.5px;color:#52607f}
  #pAn .anWrap{overflow:auto;max-height:72vh;border:1px solid #dde3f0;border-radius:6px;background:#fff}
  table.anT{border-collapse:separate;border-spacing:0;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}table.anT th,table.anT td{border-right:1px solid #e3e8f2;border-bottom:1px solid #e3e8f2;padding:1px 6px;text-align:right;line-height:16px}
  table.anT thead th{position:sticky;z-index:3;font-weight:600;color:#14213d;text-align:center;overflow:hidden}table.anT th.g{font-size:10px;letter-spacing:.04em;text-align:left}
  table.anT .d{position:sticky;left:0;z-index:4;background:#f4f6fb;text-align:left;font-weight:600;min-width:74px}table.anT thead th.d{z-index:6}table.anT tbody td.d{z-index:2}
  table.anT td.pos,table.anT th.pos{color:#12894b}table.anT td.neg,table.anT th.neg{color:#c11d3d}table.anT th.st.pos{background:#d9f3e2}table.anT th.st.neg{background:#fbdcdc}table.anT th.st{font-weight:600;font-size:10.5px}
  table.anT td.e{background:#f3f7ff;cursor:text}table.anT td.e:focus{outline:2px solid #14306e;background:#fff}table.anT td.e.ed{background:#fff2c2;font-weight:700}
  table.anT th.cond{min-width:150px;background:#fff4cf;padding:2px}table.anT th.cond.bad{background:#fbdcdc}table.anT th.cond .fx{width:calc(100% - 16px);font:600 11px ui-monospace,Menlo,monospace;border:1px solid #d6c27a;border-radius:3px;padding:2px 4px;background:#fff}table.anT th.cond .rm{border:0;background:none;color:#c11d3d;cursor:pointer;font-size:14px;padding:0 2px}
  table.anT th.dw{font-weight:400;font-size:10px;white-space:nowrap}table.anT th.dw select{font-size:10px;padding:0}table.anT .wt{width:30px;font-size:10.5px;text-align:center}
  table.anT td.b{text-align:center;font-weight:600;font-size:10px}table.anT td.b.tr{background:#d9f3e2;color:#0b6b37}table.anT td.b.fa{color:#9aa5bd}
  table.anT td.sc{text-align:center;font-weight:700}table.anT td.call{text-align:center;font-weight:800;color:#8b95ad}table.anT td.call.up{color:#12894b;background:#e6f6e9}table.anT td.call.dn{color:#c11d3d;background:#fdeaea}table.anT td.hit{text-align:center;font-weight:800}
  table.anT tr.last td{border-top:2px solid #14306e;border-bottom:2px solid #14306e;font-weight:700}table.anT tbody tr:hover td:not(.b):not(.call){background:#f1f5ff}`;
  function build0() {
    const sel = $('viewSel'), anchor = document.querySelector('details.datasec'); if (!sel || !anchor || $('pAn')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const o = document.createElement('option'); o.value = 'pAn'; o.textContent = '🧮 Data analyzer (Excel-style sheet)'; (sel.querySelector('optgroup') || sel).appendChild(o);
    const p = document.createElement('div'); p.className = 'panel'; p.id = 'pAn'; anchor.parentNode.insertBefore(p, anchor); paint(); bind();
    const orig = window.showTab;
    window.showTab = function (id) {
      orig(id);
      if (id === 'pAn') { const cur = (($('symbolInput') || {}).value || '').trim().toUpperCase().replace(/\.NS$/, ''); if (cur && cur !== ST.lastSync) { ST.lastSync = cur; if (cur !== ST.sym) { ST.sym = cur; load(cur); return; } } if (!ST.T && ST.sym) load(ST.sym); else paint(true); }
    };
  }
  root.JCAn.load = load;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build0); else build0();
})(typeof window !== 'undefined' ? window : globalThis);
