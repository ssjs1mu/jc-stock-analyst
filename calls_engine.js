/* ============================================================
   Joshi's Corner — CALLS ENGINE (JCE)
   One pure-JS file, no DOM, no network. It runs in three places with identical results:
     • the terminal (index.html)  • Node (tests / back-tests)  • Google Apps Script (8:30 AM call book, post-close reconciliation)
   Bars are {t (unix seconds), o, h, l, c, v}. Daily bars must END at the previous completed session.
   Nothing here "predicts" — it only issues a call when several independent parameters agree, and it replays the same rules on
   real 5-minute candles so every call carries its own track record.
   ============================================================ */
var JCE = (function () {
  'use strict';
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var last = function (a) { return a[a.length - 1]; };
  var istDate = function (t) { return new Date((t + 19800) * 1000).toISOString().slice(0, 10); };
  var istMin = function (t) { return Math.floor(((t + 19800) % 86400) / 60); };

  /* ---------- indicators ---------- */
  function ema(a, n) { var o = new Array(a.length).fill(null), k = 2 / (n + 1), s = 0, c = 0, p = null; for (var i = 0; i < a.length; i++) { var v = a[i]; if (!isNum(v)) continue; if (p === null) { s += v; c++; if (c === n) { p = s / n; o[i] = p; } } else { p = v * k + p * (1 - k); o[i] = p; } } return o; }
  function wilder(a, n) { var o = new Array(a.length).fill(null), f = -1; for (var i = 0; i < a.length; i++) if (isNum(a[i])) { f = i; break; } if (f < 0 || a.length - f < n) return o; var s = 0; for (var j = f; j < f + n; j++) s += a[j]; o[f + n - 1] = s / n; for (var q = f + n; q < a.length; q++) o[q] = (o[q - 1] * (n - 1) + a[q]) / n; return o; }
  function rsi(c, n) { n = n || 14; var g = [null], l = [null]; for (var i = 1; i < c.length; i++) { var d = c[i] - c[i - 1]; g.push(d > 0 ? d : 0); l.push(d < 0 ? -d : 0); } var ag = wilder(g, n), al = wilder(l, n); return ag.map(function (x, i) { return x == null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + x / al[i]); }); }
  function trs(b) { return b.map(function (x, i) { return i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)); }); }
  function atr(b, n) { return wilder(trs(b), n || 14); }
  function adx(b, n) {
    n = n || 14; var pd = [0], md = [0], tr = trs(b);
    for (var i = 1; i < b.length; i++) { var up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l; pd.push(up > dn && up > 0 ? up : 0); md.push(dn > up && dn > 0 ? dn : 0); }
    var str = wilder(tr, n), sp = wilder(pd, n), sm = wilder(md, n), pdi = [], mdi = [], dx = [];
    for (var j = 0; j < b.length; j++) { if (str[j] == null || !str[j]) { pdi.push(null); mdi.push(null); dx.push(null); continue; } var a = 100 * sp[j] / str[j], m = 100 * sm[j] / str[j]; pdi.push(a); mdi.push(m); dx.push(a + m === 0 ? 0 : 100 * Math.abs(a - m) / (a + m)); }
    return { adx: wilder(dx, n), pdi: pdi, mdi: mdi };
  }
  function macdHist(c) { var ef = ema(c, 12), es = ema(c, 26), m = c.map(function (_, i) { return ef[i] != null && es[i] != null ? ef[i] - es[i] : null; }), sg = ema(m, 9); return m.map(function (v, i) { return v != null && sg[i] != null ? v - sg[i] : null; }); }
  function sma(a, n, k) { if (k + 1 < n) return null; var s = 0; for (var i = k - n + 1; i <= k; i++) s += a[i]; return s / n; }
  function pivots(h, l, c) { var P = (h + l + c) / 3, BC = (h + l) / 2, TC = 2 * P - BC, r = h - l; return { P: P, R1: 2 * P - l, R2: P + r, R3: h + 2 * (P - l), S1: 2 * P - h, S2: P - r, S3: l - 2 * (h - P), cprTop: Math.max(BC, TC), cprBot: Math.min(BC, TC), cprPct: Math.abs(TC - BC) / P * 100, H3: c + r * 1.1 / 4, H4: c + r * 1.1 / 2, L3: c - r * 1.1 / 4, L4: c - r * 1.1 / 2 }; }
  function dedupe(arr) { var o = []; arr.forEach(function (l) { if (!o.length || Math.abs(l.v - last(o).v) / l.v > 0.002) o.push(l); }); return o; }
  var below = function (L, x, gap, k) { return dedupe(L.filter(function (l) { return isNum(l.v) && l.v < x - gap; }).sort(function (a, b) { return b.v - a.v; })).slice(0, k); };
  var above = function (L, x, gap, k) { return dedupe(L.filter(function (l) { return isNum(l.v) && l.v > x + gap; }).sort(function (a, b) { return a.v - b.v; })).slice(0, k); };

  /* ---------- tunables ---------- */
  var CFG = {
    minScore: 6.0,        // |confluence score| needed for a day-trading call (max ≈ 12)
    gradeA: 7.5, gradeAA: 9.0,
    minAdx: 15,           // below this the stock is chopping — no call (unless score ≥ gradeAA)
    minAtrPct: 0.9, maxAtrPct: 6.5,
    minTurnover: 3e7,     // avg 20-day ₹ turnover (price × volume)
    minPrice: 50,
    vixHigh: 24,          // above this India VIX demands a stronger score
    slMin: 0.40, slMax: 0.75, t1MinAtr: 0.55, t2MinGap: 0.45,
    entryBuf: 0.03,       // trigger = prev high/low ± 3 % of ATR
    chaseMax: 0.25,       // skip if the confirming candle closes > 25 % ATR beyond the trigger
    gapSkip: 0.30,        // skip if the day opens > 30 % ATR beyond the trigger
    noEntryAfter: 14 * 60 + 30, firstEntryBar: 1, squareOff: 15 * 60 + 15,
    minRR1: 1.5,          // first target must pay at least 1.5× the risk (back-test: calls with R:R<1.5 had no edge after costs)
    costPct: 0.05         // brokerage + STT + slippage, % of price (round trip) charged against every triggered trade
  };

  /* ---------- market regime (Nifty trend + India VIX), keyed by the date of the last completed session ---------- */
  function mktSeries(nifty, vix) {
    var out = {}; if (!nifty || nifty.length < 60) return out;
    var c = nifty.map(function (b) { return b.c; }), e20 = ema(c, 20), e50 = ema(c, 50), r = rsi(c, 14), mh = macdHist(c);
    var vmap = {}, vc = (vix || []).map(function (b) { return b.c; }), vidx = {};
    (vix || []).forEach(function (b, i) { var d = istDate(b.t); vmap[d] = b.c; vidx[d] = i; });
    nifty.forEach(function (b, i) {
      if (e50[i] == null || r[i] == null) return; var d = istDate(b.t);
      var s = (c[i] > e20[i] ? 1 : -1) + (e20[i] > e50[i] ? 1 : -1) + (r[i] > 54 ? 1 : r[i] < 46 ? -1 : 0) + (mh[i] != null ? (mh[i] > 0 ? 0.5 : -0.5) : 0);
      var v = vmap[d], vi = vidx[d], vAvg = isNum(vi) && vi >= 20 ? sma(vc, 20, vi) : null;
      out[d] = { reg: s, bias: s >= 2 ? 'Bullish' : s <= -2 ? 'Bearish' : 'Neutral', rsi: r[i], vix: isNum(v) ? v : null, vixHigh: isNum(v) && v > CFG.vixHigh, vixRising: isNum(v) && isNum(vAvg) && v > vAvg * 1.12, chg: i ? (c[i] / c[i - 1] - 1) * 100 : 0 };
    });
    return out;
  }

  /* ---------- everything we know about a stock as of the close of bar k ---------- */
  function ctxAt(dd, k) {
    if (!dd._ind) {
      var c = dd.map(function (b) { return b.c; }), A = adx(dd, 14);
      dd._ind = { e20: ema(c, 20), e50: ema(c, 50), e200: ema(c, 200), rsi: rsi(c, 14), atr: atr(dd, 14), adx: A.adx, pdi: A.pdi, mdi: A.mdi, mh: macdHist(c) };
    }
    var I = dd._ind, b = dd[k], p = dd[k - 1] || b, rng = Math.max(1e-9, b.h - b.l);
    var vol20 = 0, n20 = 0; for (var i = Math.max(0, k - 20); i < k; i++) { vol20 += dd[i].v; n20++; } vol20 = n20 ? vol20 / n20 : 0;
    var hi20 = -Infinity, lo20 = Infinity; for (var j = Math.max(0, k - 19); j <= k; j++) { hi20 = Math.max(hi20, dd[j].h); lo20 = Math.min(lo20, dd[j].l); }
    return { i: k, date: b.date || istDate(b.t), o: b.o, h: b.h, l: b.l, c: b.c, pc: p.c, e20: I.e20[k], e50: I.e50[k], e200: I.e200[k], rsi: I.rsi[k], atr: I.atr[k], adx: I.adx[k], pdi: I.pdi[k], mdi: I.mdi[k], mh: I.mh[k], mhPrev: I.mh[k - 1],
      pos: (b.c - b.l) / rng, green: b.c > b.o, rv: vol20 ? b.v / vol20 : null, turnover: vol20 * b.c, hi20: hi20, lo20: lo20, piv: pivots(b.h, b.l, b.c), chgPct: p.c ? (b.c / p.c - 1) * 100 : 0 };
  }

  /* ---------- confluence score for a day-trading call ---------- */
  function scoreDay(x, m) {
    var pts = [], S = 0, add = function (label, v, txt) { pts.push({ label: label, v: v, txt: txt }); S += v; };
    var stack = (x.c > x.e20 ? 1 : -1) + (x.e20 > x.e50 ? 1 : -1) + (isNum(x.e200) ? (x.e50 > x.e200 ? 1 : -1) : 0);
    add('Trend', stack, stack >= 2 ? 'price > 20 > 50' + (isNum(x.e200) ? ' > 200 DMA' : ' DMA') : stack <= -2 ? 'price < 20 < 50' + (isNum(x.e200) ? ' < 200 DMA' : ' DMA') : 'mixed moving averages');
    var dirDI = x.pdi > x.mdi ? 1 : -1, aPts = x.adx >= 25 ? 2 * dirDI : x.adx >= 18 ? dirDI : 0;
    add('ADX ' + (isNum(x.adx) ? x.adx.toFixed(0) : '–'), aPts, x.adx >= 25 ? 'strong trend, ' + (dirDI > 0 ? '+DI' : '−DI') + ' leads' : x.adx >= 18 ? 'developing trend' : 'no trend (chop)');
    var rp = x.rsi >= 55 && x.rsi <= 72 ? 1 : x.rsi <= 45 && x.rsi >= 28 ? -1 : 0;
    add('RSI ' + (isNum(x.rsi) ? x.rsi.toFixed(0) : '–'), rp, rp > 0 ? 'bullish momentum, not stretched' : rp < 0 ? 'bearish momentum, not washed-out' : x.rsi > 72 ? 'overbought — no fresh longs' : x.rsi < 28 ? 'oversold — no fresh shorts' : 'neutral');
    var mp = isNum(x.mh) ? (x.mh > 0 ? (x.mh > (x.mhPrev || 0) ? 1 : 0.5) : (x.mh < (x.mhPrev || 0) ? -1 : -0.5)) : 0;
    add('MACD', mp, mp > 0 ? 'histogram positive' + (mp === 1 ? ' & rising' : '') : mp < 0 ? 'histogram negative' + (mp === -1 ? ' & falling' : '') : 'flat');
    var cp = x.pos > 0.7 && x.green ? 1 : x.pos < 0.3 && !x.green ? -1 : 0;
    add('Prev-day close', cp, cp > 0 ? 'closed in top 30 % of its range, green candle' : cp < 0 ? 'closed in bottom 30 % of its range, red candle' : 'mid-range close');
    var vp = isNum(x.rv) && x.rv >= 1.3 ? (x.green ? 1 : -1) : 0;
    add('Volume', vp, vp ? (x.rv.toFixed(1) + '× average volume on a ' + (x.green ? 'green' : 'red') + ' day') : 'volume normal');
    var cpr = x.c > x.piv.cprTop ? 1 : x.c < x.piv.cprBot ? -1 : 0;
    add('CPR', cpr, cpr > 0 ? 'closed above CPR' : cpr < 0 ? 'closed below CPR' : 'closed inside CPR');
    var nearHi = x.c >= x.hi20 * 0.99, nearLo = x.c <= x.lo20 * 1.01, px = nearHi ? 1 : nearLo ? -1 : 0;
    add('20-day range', px, nearHi ? 'at 20-day high (breakout fuel)' : nearLo ? 'at 20-day low (breakdown risk)' : 'inside the 20-day range');
    var mv = 0, mtxt = 'index data n/a';
    if (m) { mv = m.reg >= 3 ? 1.5 : m.reg >= 2 ? 1 : m.reg <= -3 ? -1.5 : m.reg <= -2 ? -1 : 0; mtxt = 'Nifty ' + m.bias.toLowerCase() + (isNum(m.vix) ? ' · VIX ' + m.vix.toFixed(1) : ''); }
    add('Market', mv, mtxt);
    return { S: S, pts: pts, narrowCpr: x.piv.cprPct < 0.4 };
  }

  /* ---------- YOUR RULES: rows of the "Rules" tab in the master sheet "JC Logic & Formula Reference" ----------
     Only rows with Status = Live and Use = Intraday are used here. Stage "Setup" is tested on the previous session's daily candle
     (before the open): Effect "Must" = no call unless true, "Points" = adds (Long) / subtracts (Short) points to the confluence score.
     Stage "Entry" is tested on the 5-minute candle that closes beyond the trigger: it must be true too, otherwise the call waits for a
     later candle. Side "Both" mirrors a Long rule for shorts (> becomes <, High becomes Low, RSI 60 becomes 40, MACD +x becomes −x).
     5-minute indicators use today's candles only (warm up from 09:15). Every call keeps the entry rules it was built with. */
  var RULES = [], RULES_BAD = [];
  var OPND = {
    Setup: ['Close', 'Open', 'High', 'Low', 'Prev Close', 'Volume', 'DMA (SMA)', 'EMA', 'RSI', 'ATR', 'ADX', 'MACD Hist', 'Avg Volume', 'N-Day High', 'N-Day Low', 'Number'],
    Entry: ['Price (5m Close)', '5m Open', '5m High', '5m Low', 'VWAP', 'Day Open', 'Day High', 'Day Low', 'Prev Day High', 'Prev Day Low', 'Prev Day Close', '5m EMA', '5m DMA (SMA)', '5m RSI', '5m Volume', '5m Avg Volume', 'Minutes Since Open', 'Daily DMA (SMA)', 'Daily EMA', 'Number']
  };
  var DEFN = { 'DMA (SMA)': 20, 'EMA': 20, 'RSI': 14, 'ATR': 14, 'ADX': 14, 'Avg Volume': 20, 'N-Day High': 20, 'N-Day Low': 20, '5m EMA': 20, '5m DMA (SMA)': 20, '5m RSI': 14, '5m Avg Volume': 10, 'Daily DMA (SMA)': 20, 'Daily EMA': 20 };
  var PRICE = { 'Close': 1, 'Open': 1, 'High': 1, 'Low': 1, 'Prev Close': 1, 'DMA (SMA)': 1, 'EMA': 1, 'N-Day High': 1, 'N-Day Low': 1, 'Price (5m Close)': 1, '5m Open': 1, '5m High': 1, '5m Low': 1, 'VWAP': 1, 'Day Open': 1, 'Day High': 1, 'Day Low': 1, 'Prev Day High': 1, 'Prev Day Low': 1, 'Prev Day Close': 1, '5m EMA': 1, '5m DMA (SMA)': 1, 'Daily DMA (SMA)': 1, 'Daily EMA': 1 };
  var SWAP = { 'High': 'Low', 'Low': 'High', 'N-Day High': 'N-Day Low', 'N-Day Low': 'N-Day High', '5m High': '5m Low', '5m Low': '5m High', 'Day High': 'Day Low', 'Day Low': 'Day High', 'Prev Day High': 'Prev Day Low', 'Prev Day Low': 'Prev Day High' };
  var OPS = { '>': 1, '<': 1, '>=': 1, '<=': 1, 'Crosses Above': 1, 'Crosses Below': 1 }, FLIP = { '>': '<', '<': '>', '>=': '<=', '<=': '>=', 'Crosses Above': 'Crosses Below', 'Crosses Below': 'Crosses Above' };
  function g(r, k) { var v = r[k]; return v == null ? '' : String(v).trim(); }
  function normRule(r) {
    var o = { id: g(r, 'Rule ID'), use: g(r, 'Use'), stage: g(r, 'Stage'), side: g(r, 'Side') || 'Both', L: g(r, 'Left'), Ln: parseInt(g(r, 'L Period'), 10) || null, op: g(r, 'Test'), R: g(r, 'Right'), Rn: parseInt(g(r, 'R Period'), 10) || null,
      val: g(r, 'Value / ×') === '' ? null : parseFloat(g(r, 'Value / ×').replace(/[,×x\s]/g, '')), eff: g(r, 'Effect') || 'Must', pts: parseFloat(g(r, 'Points')) || 1, status: g(r, 'Status') || 'Proposed' };
    var why = !o.id ? 'no Rule ID' : !OPND[o.stage] ? 'Stage must be Setup or Entry' : !/^(Long|Short|Both)$/.test(o.side) ? 'Side must be Long, Short or Both' : OPND[o.stage].indexOf(o.L) < 0 || o.L === 'Number' ? 'Left "' + o.L + '" is not a valid ' + o.stage + ' item' : !OPS[o.op] ? 'Test must be >, <, >=, <=, Crosses Above or Crosses Below' : OPND[o.stage].indexOf(o.R) < 0 ? 'Right "' + o.R + '" is not a valid ' + o.stage + ' item' : o.R === 'Number' && !isNum(o.val) ? 'Right is Number but Value is empty' : o.stage === 'Entry' && o.eff !== 'Must' ? 'Entry rules can only be Must' : !/^(Must|Points)$/.test(o.eff) ? 'Effect must be Must or Points' : '';
    if (why) return { bad: why, id: o.id || '?' };
    if (!o.Ln) o.Ln = DEFN[o.L] || null; if (!o.Rn) o.Rn = DEFN[o.R] || null; if (o.R !== 'Number' && !isNum(o.val)) o.val = 1;
    return o;
  }
  function mirror(o) {
    var m = Object.assign({}, o), lp = PRICE[o.L], rp = PRICE[o.R], osc = { 'RSI': 100, '5m RSI': 100, 'MACD Hist': 0 };
    if ((lp && o.R !== 'Number') || (rp && !lp)) { m.op = FLIP[o.op]; m.L = SWAP[o.L] || o.L; m.R = SWAP[o.R] || o.R; }
    else if (osc[o.L] != null && o.R === 'Number') { m.op = FLIP[o.op]; m.val = osc[o.L] ? 100 - o.val : -o.val; }
    else if (osc[o.L] != null && osc[o.R] != null) m.op = FLIP[o.op];
    return m;
  }
  function versions(o, dir) { if (o.side === 'Both') return [dir > 0 ? o : mirror(o)]; return (o.side === 'Long') === (dir > 0) ? [o] : []; }
  function setRules(rows, opts) {
    var all = (rows || []).map(normRule), ok = [], bad = [], st = (opts && opts.status) || 'Live';
    all.forEach(function (o) { if (o.bad) bad.push(o); else if (o.status === st && /^Intraday/i.test(o.use || 'Intraday')) ok.push(o); });
    RULES = ok; RULES_BAD = bad; return { live: ok.length, bad: bad };
  }
  function cmp(op, a, b, a1, b1) {
    if (!isNum(a) || !isNum(b)) return false;
    if (op === '>') return a > b; if (op === '<') return a < b; if (op === '>=') return a >= b; if (op === '<=') return a <= b;
    if (!isNum(a1) || !isNum(b1)) return false; return op === 'Crosses Above' ? a > b && a1 <= b1 : a < b && a1 >= b1;
  }
  function dser(dd, key, n) {
    var ck = key + '|' + n; dd._rc = dd._rc || {}; if (dd._rc[ck]) return dd._rc[ck];
    var c = dd.map(function (b) { return b.c; }), s;
    if (key === 'DMA (SMA)' || key === 'Daily DMA (SMA)') s = c.map(function (_, i) { return sma(c, n, i); });
    else if (key === 'EMA' || key === 'Daily EMA') s = ema(c, n); else if (key === 'RSI') s = rsi(c, n); else if (key === 'ATR') s = atr(dd, n); else if (key === 'ADX') s = adx(dd, n).adx; else if (key === 'MACD Hist') s = macdHist(c);
    else if (key === 'Avg Volume') s = dd.map(function (_, i) { if (i < n) return null; var t = 0; for (var j = i - n; j < i; j++) t += dd[j].v; return t / n; });
    else if (key === 'N-Day High' || key === 'N-Day Low') s = dd.map(function (_, i) { if (i + 1 < n) return null; var x = key === 'N-Day High' ? -Infinity : Infinity; for (var j = i - n + 1; j <= i; j++) x = key === 'N-Day High' ? Math.max(x, dd[j].h) : Math.min(x, dd[j].l); return x; });
    dd._rc[ck] = s; return s;
  }
  function dval(dd, key, n, j, val) {
    if (j < 0 || !dd[j]) return null; var b = dd[j];
    if (key === 'Number') return val; if (key === 'Close') return b.c; if (key === 'Open') return b.o; if (key === 'High') return b.h; if (key === 'Low') return b.l; if (key === 'Volume') return b.v; if (key === 'Prev Close') return dd[j - 1] ? dd[j - 1].c : null;
    var s = dser(dd, key, n); return s ? s[j] : null;
  }
  function setupTrue(dd, k, o) {
    var rv = function (j) { var v = dval(dd, o.R, o.Rn, j, o.val); return o.R === 'Number' ? v : isNum(v) ? v * o.val : null; };
    return cmp(o.op, dval(dd, o.L, o.Ln, k, null), rv(k), dval(dd, o.L, o.Ln, k - 1, null), rv(k - 1));
  }
  function resolveEntry(dd, k, o) {   /* daily items become fixed numbers so the call can be settled later from 5-min candles alone */
    var r = { id: o.id, op: o.op, L: o.L, Ln: o.Ln, R: o.R, Rn: o.Rn, val: o.val }, b = dd[k];
    var fix = function (key, n) { return key === 'Prev Day High' ? b.h : key === 'Prev Day Low' ? b.l : key === 'Prev Day Close' ? b.c : key === 'Daily DMA (SMA)' || key === 'Daily EMA' ? dval(dd, key, n, k, null) : undefined; };
    var lf = fix(o.L, o.Ln), rf = fix(o.R, o.Rn); if (lf !== undefined) { r.L = 'Fixed'; r.lv = lf; } if (rf !== undefined) { r.R = 'Fixed'; r.rv = rf; }
    return r;
  }
  function mser(B, key, n, cache) {
    var ck = key + '|' + n; if (cache[ck]) return cache[ck]; var c = B.map(function (b) { return b.c; }), s;
    if (key === '5m EMA') s = ema(c, n); else if (key === '5m DMA (SMA)') s = c.map(function (_, i) { return sma(c, n, i); }); else if (key === '5m RSI') s = rsi(c, n);
    else if (key === 'VWAP') { var pv = 0, vv = 0; s = B.map(function (b) { var tp = (b.h + b.l + b.c) / 3; pv += tp * (b.v || 0); vv += b.v || 0; return vv ? pv / vv : tp; }); }
    else if (key === 'Day High' || key === 'Day Low') { var x = null; s = B.map(function (b) { x = x == null ? (key === 'Day High' ? b.h : b.l) : key === 'Day High' ? Math.max(x, b.h) : Math.min(x, b.l); return x; }); }
    else if (key === '5m Avg Volume') s = B.map(function (_, i) { if (i < n) return null; var t = 0; for (var j = i - n; j < i; j++) t += B[j].v || 0; return t / n; });
    cache[ck] = s; return s;
  }
  function mval(B, key, n, i, val, fixed, cache) {
    if (i < 0 || !B[i]) return null; var b = B[i];
    if (key === 'Fixed') return fixed; if (key === 'Number') return val; if (key === 'Price (5m Close)') return b.c; if (key === '5m Open') return b.o; if (key === '5m High') return b.h; if (key === '5m Low') return b.l;
    if (key === '5m Volume') return b.v; if (key === 'Day Open') return B[0].o; if (key === 'Minutes Since Open') return istMin(b.t) - 555;
    var s = mser(B, key, n, cache); return s ? s[i] : null;
  }
  function entryOk(er, B, i, cache) {
    for (var q = 0; q < er.length; q++) {
      var o = er[q], rv = function (j) { var v = mval(B, o.R, o.Rn, j, o.val, o.rv, cache); return o.R === 'Number' || o.R === 'Fixed' ? v : isNum(v) ? v * o.val : null; };
      if (!cmp(o.op, mval(B, o.L, o.Ln, i, null, o.lv, cache), rv(i), mval(B, o.L, o.Ln, i - 1, null, o.lv, cache), rv(i - 1))) return false;
    }
    return true;
  }
  function applyRules(dd, k, sc) {   /* Points rules move the score; returns the Must rules that failed for each direction */
    var fail = { '1': [], '-1': [] };
    RULES.forEach(function (o) {
      if (o.stage !== 'Setup') return;
      [1, -1].forEach(function (dir) {
        versions(o, dir).forEach(function (v) {
          var t = setupTrue(dd, k, v);
          if (o.eff === 'Points') { if (t) { var p = dir * o.pts; sc.S += p; sc.pts.push({ label: 'Rule ' + o.id, v: p, txt: 'your rule: ' + v.L + ' ' + v.op + ' ' + (v.R === 'Number' ? v.val : v.R) }); } }
          else if (!t) fail[String(dir)].push(o.id);
        });
      });
    });
    return fail;
  }

  /* ---------- plan for one session from the previous session's data ---------- */
  function dayPlanFor(dd, k, mkt) {
    var x = ctxAt(dd, k), m = (mkt && mkt[x.date]) || null, a = x.atr;
    var out = { date: x.date, ref: { h: x.h, l: x.l, c: x.c }, atr: a, ctx: x, mkt: m, sides: [], bias: 'No trade', score: 0, grade: '', pts: [], reasons: [] };
    if (!isNum(a) || !isNum(x.e50)) { out.reasons.push('not enough history'); return out; }
    var sc = scoreDay(x, m), rf = RULES.length ? applyRules(dd, k, sc) : null; out.pts = sc.pts; out.score = sc.S; out.narrowCpr = sc.narrowCpr;
    var abs = Math.abs(sc.S), dir = sc.S > 0 ? 1 : -1, atrPct = a / x.c * 100, why = out.reasons;
    var need = CFG.minScore; if (m && m.vixHigh) need += 1.5; if (m && m.vixRising) need += 0.5; if (m && ((dir > 0 && m.reg <= -2) || (dir < 0 && m.reg >= 2))) need += 2; if (sc.narrowCpr) need -= 0.5;
    /* today's pre-open MOOD (global cues, crude, rupee, VIX, Nifty's last move): a call that fights it is held back; one that agrees needs a little less confluence */
    var md = m && isNum(m.mood) ? m.mood : null;
    if (md != null) { if ((dir > 0 && md <= 40) || (dir < 0 && md >= 60)) out.moodBlock = true; else if ((dir > 0 && md >= 60) || (dir < 0 && md <= 40)) need -= 0.5; else if (dir < 0 && md > 50) need += (md - 50) / 10; else if (dir > 0 && md < 50) need += (50 - md) / 10; }
    out.need = need;
    if (out.moodBlock) why.push("against today's market mood (" + (m.moodLabel || '') + ' ' + md + '/100)');
    if (abs < need) why.push('confluence ' + abs.toFixed(1) + ' < ' + need.toFixed(1) + ' needed');
    if (isNum(x.adx) && x.adx < CFG.minAdx && abs < CFG.gradeAA) why.push('ADX ' + x.adx.toFixed(0) + ' — chopping');
    if (atrPct < CFG.minAtrPct) why.push('range too small (ATR ' + atrPct.toFixed(1) + '%)'); if (atrPct > CFG.maxAtrPct) why.push('too volatile (ATR ' + atrPct.toFixed(1) + '%)');
    if (x.turnover < CFG.minTurnover) why.push('thin liquidity'); if (x.c < CFG.minPrice) why.push('price below ₹' + CFG.minPrice);
    if (dir > 0 && x.rsi > 78) why.push('RSI stretched'); if (dir < 0 && x.rsi < 22) why.push('RSI washed-out');
    if (rf && rf[String(dir)].length) why.push('your rule ' + rf[String(dir)].join(', ') + ' not met');
    if (why.length) { out.bias = 'No trade'; return out; }
    var lv = [], addL = function (v, l) { if (isNum(v)) lv.push({ v: v, label: l }); }, rp = x.piv;
    ['R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3'].forEach(function (q) { addL(rp[q], 'Pivot ' + q); }); addL(rp.cprTop, 'CPR top'); addL(rp.cprBot, 'CPR bottom'); addL(rp.H3, 'Camarilla H3'); addL(rp.H4, 'Camarilla H4'); addL(rp.L3, 'Camarilla L3'); addL(rp.L4, 'Camarilla L4'); addL(x.h, 'Prev high'); addL(x.l, 'Prev low'); addL(x.hi20, '20-day high'); addL(x.lo20, '20-day low');
    var entry = dir > 0 ? x.h + CFG.entryBuf * a : x.l - CFG.entryBuf * a;
    var near = (dir > 0 ? below(lv, entry, 0.2 * a, 1) : above(lv, entry, 0.2 * a, 1))[0];
    var risk = near ? Math.abs(entry - near.v) + 0.1 * a : 0.55 * a; risk = Math.min(CFG.slMax * a, Math.max(CFG.slMin * a, risk));
    var minGap = Math.max(CFG.t1MinAtr * a, 1.0 * risk), ups = dir > 0 ? above(lv, entry, minGap, 2) : below(lv, entry, minGap, 2);
    var t1 = ups[0] ? ups[0].v : entry + dir * Math.max(0.75 * a, 1.3 * risk);
    var t2 = ups[1] ? ups[1].v : t1 + dir * Math.max(0.6 * a, 1.0 * risk); if (dir * (t2 - t1) < CFG.t2MinGap * a) t2 = t1 + dir * 0.6 * a;
    var sd = { dir: dir, side: dir > 0 ? 'BUY' : 'SELL', entry: entry, sl: entry - dir * risk, t1: t1, t2: t2, risk: risk, rr1: Math.abs(t1 - entry) / risk, rr2: Math.abs(t2 - entry) / risk, t1Why: ups[0] ? ups[0].label : 'ATR projection', t2Why: ups[1] ? ups[1].label : 'ATR projection' };
    var er = []; RULES.forEach(function (o) { if (o.stage === 'Entry') versions(o, dir).forEach(function (v) { er.push(resolveEntry(dd, k, v)); }); }); if (er.length) sd.er = er;
    if (sd.rr1 < CFG.minRR1) { why.push('first target too close for the risk (R:R ' + sd.rr1.toFixed(2) + ' < ' + CFG.minRR1 + ')'); return out; }
    out.sides = [sd]; out.bias = dir > 0 ? 'Bullish' : 'Bearish'; out.grade = abs >= CFG.gradeAA ? 'A+' : abs >= CFG.gradeA ? 'A' : 'B';
    return out;
  }

  /* ---------- one call evaluated on 5-minute candles ----------
     Entry = a 5-min candle CLOSING beyond the trigger (wicks don't count), not before 09:20, not after 14:30, not if the day gaps/chases past it.
     Stop moves to cost after T1; half booked at T1, half at T2 / stop-at-cost / 15:15 square-off. Stop & target in one bar → stop first. */
  function evalDay(sd, bars, atrv, final) {
    var d = sd.dir, fill = null, fi = -1, cfg = CFG, i, b; var er = sd.er && sd.er.length ? sd.er : null, ec = {};
    for (i = 0; i < bars.length; i++) {
      b = bars[i]; var mn = istMin(b.t);
      if (i === 0) { var gapBy = d > 0 ? b.o - sd.entry : sd.entry - b.o; if (gapBy > cfg.gapSkip * atrv) return { state: 'SKIP', fill: null, R: 0, fi: 0 }; }
      if (i < cfg.firstEntryBar) continue;
      if (mn >= cfg.noEntryAfter) break;
      var beyond = d > 0 ? b.c >= sd.entry : b.c <= sd.entry;
      if (beyond && er && !entryOk(er, bars, i, ec)) continue;
      if (beyond) { var over = d > 0 ? b.c - sd.entry : sd.entry - b.c; if (over > cfg.chaseMax * atrv) return { state: 'SKIP', fill: null, R: 0, fi: i }; fill = b.c; fi = i; break; }
    }
    var lastB = last(bars);
    if (fi < 0) return { state: final || (lastB && istMin(lastB.t) >= cfg.noEntryAfter) ? 'NT' : 'WAIT', fill: null, R: 0, fi: -1, cmp: lastB ? lastB.c : null };
    var risk = Math.abs(fill - sd.sl) || atrv * 0.3, pr = function (px) { return d * (px - fill) / risk; }, costR = (cfg.costPct / 100 * fill) / risk;
    var t1hit = false, outcome = null, stop = sd.sl, exitPx = null, exitI = -1;
    for (i = fi + 1; i < bars.length; i++) {
      b = bars[i]; var slH = d > 0 ? b.l <= stop : b.h >= stop, t1H = d > 0 ? b.h >= sd.t1 : b.l <= sd.t1, t2H = d > 0 ? b.h >= sd.t2 : b.l <= sd.t2;
      if (!t1hit) { if (slH) { outcome = 'SL'; exitPx = stop; exitI = i; break; } if (t1H) { t1hit = true; stop = fill; if (t2H) { outcome = 'T2'; exitPx = sd.t2; exitI = i; break; } } }
      else { if (slH) { outcome = 'T1'; exitPx = stop; exitI = i; break; } if (t2H) { outcome = 'T2'; exitPx = sd.t2; exitI = i; break; } }
      if (istMin(b.t) >= cfg.squareOff) { outcome = 'EOD'; exitPx = b.c; exitI = i; break; }
    }
    var R, state;
    if (outcome === 'SL') { R = -1; state = 'SL'; }
    else if (outcome === 'T2') { R = (pr(sd.t1) + pr(sd.t2)) / 2; state = 'T2'; }
    else if (outcome === 'T1') { R = pr(sd.t1) / 2; state = 'T1'; }
    else if (outcome === 'EOD') { R = t1hit ? (pr(sd.t1) + pr(exitPx)) / 2 : pr(exitPx); state = t1hit ? 'T1' : R >= 0 ? 'EOD+' : 'EOD−'; }
    else { R = t1hit ? (pr(sd.t1) + pr(lastB.c)) / 2 : pr(lastB.c); state = final ? (t1hit ? 'T1' : R >= 0 ? 'EOD+' : 'EOD−') : 'LIVE'; if (final) exitPx = lastB.c; }
    var live = !final && !outcome; if (!live) R -= costR;
    return { state: state, fill: fill, fi: fi, R: R, t1hit: t1hit, live: live, pnlPct: d * (lastB.c - fill) / fill * 100, cmp: lastB.c, exitPx: exitPx, retPct: (R * risk / fill) * 100, riskPct: risk / fill * 100, exitT: exitI >= 0 ? bars[exitI].t : null };
  }

  /* ---------- replay: the same rules on past sessions ---------- */
  function sessionsOf(m5) { var s = {}; m5.forEach(function (x) { var d = istDate(x.t); (s[d] = s[d] || []).push(x); }); return s; }
  function replay(dd, m5, mkt, opts) {
    opts = opts || {}; var sess = sessionsOf(m5), dates = Object.keys(sess).sort(), res = [];
    var idxBefore = function (d) { var k = -1; for (var i = 0; i < dd.length; i++) { if (dd[i].date < d) k = i; else break; } return k; };
    dates.forEach(function (d) {
      if (sess[d].length < 25 || (opts.upTo && d >= opts.upTo)) return; var k = idxBefore(d); if (k < 60) return;
      var plan = dayPlanFor(dd, k, mkt), r = { date: d, plan: plan, sd: plan.sides[0] || null, ev: null };
      if (r.sd) r.ev = evalDay(r.sd, sess[d], plan.atr, true); res.push(r);
    });
    return res;
  }
  function summarize(rs) {
    var a = { sessions: rs.length, calls: 0, trig: 0, tgt: 0, sl: 0, eodP: 0, eodN: 0, nt: 0, skip: 0, netR: 0, netPct: 0, wins: 0, grossW: 0, grossL: 0 };
    rs.forEach(function (r) { if (!r.sd) return; a.calls++; var s = r.ev.state; if (s === 'NT') { a.nt++; return; } if (s === 'SKIP') { a.skip++; return; } a.trig++; a.netR += r.ev.R; a.netPct += r.ev.retPct; if (r.ev.R > 0) { a.wins++; a.grossW += r.ev.R; } else a.grossL += -r.ev.R; if (s === 'T1' || s === 'T2') a.tgt++; else if (s === 'SL') a.sl++; else if (s === 'EOD+') a.eodP++; else a.eodN++; });
    a.hit = a.trig ? a.tgt / a.trig : null; a.slRate = a.trig ? a.sl / a.trig : null; a.win = a.trig ? a.wins / a.trig : null; a.avgR = a.trig ? a.netR / a.trig : null; a.pf = a.grossL ? a.grossW / a.grossL : null; return a;
  }

  /* ---------- investment (positional) call — long-only, delivery ---------- */
  function investFor(dd, k, nifty, mkt) {
    var x = ctxAt(dd, k); if (k < 210 || !isNum(x.e200) || !isNum(x.atr)) return null;
    var I = dd._ind, e200Prev = I.e200[k - 20], why = [], pts = 0;
    if (!(x.c > x.e50 && x.e50 > x.e200 && isNum(e200Prev) && x.e200 > e200Prev)) return null;
    if (x.turnover < 1e8 || x.c < 100) return null;
    var ret63 = k >= 63 ? x.c / dd[k - 63].c - 1 : null, nret = null;
    if (nifty && nifty.length > 70) { var ni = -1; for (var q = nifty.length - 1; q >= 0; q--) { if (istDate(nifty[q].t) <= x.date) { ni = q; break; } } if (ni >= 63) nret = nifty[ni].c / nifty[ni - 63].c - 1; }
    var rs = isNum(ret63) && isNum(nret) ? ret63 - nret : null;
    pts += 2; why.push('Stage-2 uptrend: price > 50 DMA > rising 200 DMA');
    if (x.adx >= 18 && x.pdi > x.mdi) { pts += 1; why.push('ADX ' + x.adx.toFixed(0) + ' with +DI leading'); }
    if (isNum(rs) && rs > 0.02) { pts += 1; why.push('Outperforming Nifty by ' + (rs * 100).toFixed(0) + ' pts over 3 months'); } else if (isNum(rs) && rs < -0.03) return null;
    var hi55 = -Infinity; for (var j = Math.max(0, k - 54); j <= k; j++) hi55 = Math.max(hi55, dd[j].h);
    var dd20 = (x.hi20 - x.c) / x.hi20, setup = null, entry, mode;
    if (x.c <= x.e20 * 1.025 && x.c >= x.e50 * 0.985 && x.rsi >= 38 && x.rsi <= 58 && dd20 >= 0.03 && dd20 <= 0.14) { setup = 'Pullback to the 20/50 DMA support inside an uptrend (RSI ' + x.rsi.toFixed(0) + ')'; entry = x.c; mode = 'limit'; pts += 2; }
    else if (x.c >= hi55 * 0.99 && isNum(x.rv) && x.rv >= 1.2 && x.c <= x.e20 * 1.08) { setup = 'Breakout at the 55-day high on ' + x.rv.toFixed(1) + '× volume'; entry = hi55 * 1.003; mode = 'stop'; pts += 2; }
    if (!setup) return null; why.push(setup);
    if (isNum(x.rv) && x.rv >= 1.0 && x.green) pts += 0.5;
    var m = mkt && mkt[x.date]; if (m) { if (m.reg >= 1) { pts += 1; why.push('Nifty regime ' + m.bias.toLowerCase()); } else if (m.reg <= -2) { pts -= 1.5; why.push('Nifty regime weak (−)'); } }
    if (pts < 5.5) return null;
    var low10 = Math.min.apply(null, dd.slice(k - 9, k + 1).map(function (b) { return b.l; })), sl = Math.min(low10 - 0.1 * x.atr, x.e50 - 0.5 * x.atr), rp = (entry - sl) / entry * 100;
    if (rp > 9) { sl = entry * 0.91; rp = 9; } if (rp < 3.5) { sl = entry * 0.965; rp = 3.5; }
    var risk = entry - sl, t1 = entry + 2 * risk, t2 = entry + 3.5 * risk, sessions = Math.max(10, Math.ceil((t2 - entry) / (0.3 * x.atr)));
    var label = sessions <= 15 ? '2–3 weeks' : sessions <= 30 ? '1–1.5 months' : sessions <= 60 ? '2–3 months' : '3–6 months';
    return { type: 'INV', side: 'BUY', mode: mode, entry: entry, entryLo: entry * 0.99, entryHi: entry * 1.005, sl: sl, t1: t1, t2: t2, risk: risk, riskPct: rp, rr1: 2, rr2: 3.5, score: pts, grade: pts >= 7 ? 'A+' : pts >= 6 ? 'A' : 'B', tenureSessions: sessions, tenure: label, why: why, atr: x.atr, refDate: x.date, refClose: x.c };
  }
  /* daily bars after the issue date → state of a positional call. 'limit' = buy when price trades down to entry, 'stop' = buy when it trades up through it.
     Not filled within 5 sessions → NT. Stop-loss on any session low; half off at T1 (stop → cost), rest at T2; unresolved at the tenure date → EXPIRED at that close. */
  function evalInvest(call, daily, expiryIso) {
    var bars = daily.filter(function (b) { return istDate(b.t) > call.refDate; }), out = { state: 'WAIT', fill: null, exitPx: null, exitDate: null, R: 0, retPct: 0, daysHeld: 0, cmp: null };
    var fill = null, entryIdx = -1, t1hit = false, stop = call.sl, i, b, day, risk, pr, held;
    for (i = 0; i < bars.length; i++) {
      b = bars[i]; day = istDate(b.t); out.cmp = b.c;
      if (fill === null) {
        var trig = call.mode === 'stop' ? b.h >= call.entry : b.l <= call.entry;
        if (!trig) { if (i + 1 >= 5) { out.state = 'NT'; out.exitDate = day; } continue; }
        fill = call.mode === 'stop' ? Math.max(call.entry, b.o) : Math.min(call.entry, b.o); entryIdx = i; out.fill = fill; out.state = 'OPEN';
        risk = Math.max(fill - call.sl, fill * 0.02); pr = (function (f, r) { return function (px) { return (px - f) / r; }; })(fill, risk);
        if (b.l <= stop && b.c < fill) { out.state = 'SL'; out.exitPx = stop; out.exitDate = day; out.R = -1; out.retPct = (stop - fill) / fill * 100; out.daysHeld = 1; return out; }
        continue;
      }
      if (out.state === 'NT') return out;
      held = i - entryIdx + 1;
      var slH = b.l <= stop, t1H = b.h >= call.t1, t2H = b.h >= call.t2;
      var fin = function (state, px, R) { out.state = state; out.exitPx = px; out.exitDate = day; out.R = R; out.retPct = R * risk / fill * 100; out.daysHeld = held; return out; };
      if (!t1hit) { if (slH) { var sx = Math.min(stop, b.o); return fin('SL', sx, Math.max(-1.3, pr(sx))); } if (t1H) { t1hit = true; stop = fill; if (t2H) return fin('T2', call.t2, (pr(call.t1) + pr(call.t2)) / 2); } }
      else { if (slH) return fin('T1', stop, pr(call.t1) / 2); if (t2H) return fin('T2', call.t2, (pr(call.t1) + pr(call.t2)) / 2); }
      var Rm = t1hit ? (pr(call.t1) + pr(b.c)) / 2 : pr(b.c);
      if (expiryIso && day >= expiryIso) return fin('EXPIRED', b.c, Rm);
      out.state = t1hit ? 'T1·OPEN' : 'OPEN'; out.daysHeld = held; out.R = Rm; out.retPct = Rm * risk / fill * 100;
    }
    if (fill === null && out.state !== 'NT') out.state = bars.length >= 5 ? 'NT' : 'WAIT';
    if (fill !== null && out.state === 'OPEN' && out.cmp != null) { out.R = (t1hit ? (pr(call.t1) + pr(out.cmp)) / 2 : pr(out.cmp)); out.retPct = out.R * risk / fill * 100; }
    return out;
  }

  /* ---------- one compact row per stock for client dashboards (every scanned stock, trade or not) ---------- */
  function boardRow(plan) {
    var x = plan.ctx, S = plan.score || 0, abs = Math.abs(S), dir = S >= 0 ? 1 : -1, sd = plan.sides[0] || null, r2 = function (v) { return isNum(v) ? Math.round(v * 100) / 100 : null; };
    var conv = Math.max(0, Math.min(100, Math.round(abs / CFG.gradeAA * 100))); if (!sd) conv = Math.min(conv, 49);
    var why = plan.pts.filter(function (p) { return Math.sign(p.v) === dir; }).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); }).slice(0, 5).map(function (p) { return p.label + ': ' + p.txt; });
    var pv = x.piv || {}, row = { c: r2(x.c), pc: r2(x.pc), S: Math.round(S * 10) / 10, need: Math.round((plan.need || CFG.minScore) * 10) / 10, b: sd ? sd.side : 'WAIT', lean: dir > 0 ? 'BUY' : 'SELL', g: plan.grade || '', conv: conv,
      atr: r2(x.atr), rsi: r2(x.rsi), adx: r2(x.adx), e20: r2(x.e20), e50: r2(x.e50), e200: r2(x.e200), ph: r2(x.h), pl: r2(x.l), hi20: r2(x.hi20), lo20: r2(x.lo20), rv: r2(x.rv),
      pv: { R2: r2(pv.R2), R1: r2(pv.R1), P: r2(pv.P), S1: r2(pv.S1), S2: r2(pv.S2) }, why: why };
    if (sd) row.p = { e: r2(sd.entry), sl: r2(sd.sl), t1: r2(sd.t1), t2: r2(sd.t2), rr: r2(sd.rr1), t1w: sd.t1Why, t2w: sd.t2Why }; else row.no = plan.reasons[0] || 'no edge';
    return row;
  }

  /* ---------- the call book for one morning ---------- */
  function buildBook(inputs) {
    // inputs: { dateIso, stocks: [{sym, ex, daily:[...]}], nifty:[...], vix:[...], maxDay, maxInv }
    var mkt = mktSeries(inputs.nifty, inputs.vix), today = inputs.dateIso, day = [], inv = [], skipped = [], board = {}, held = [];
    if (inputs.mood && isNum(inputs.mood.score)) { var mk0 = Object.keys(mkt).filter(function (d) { return d < today; }).sort(); if (mk0.length) { mkt[mk0[mk0.length - 1]].mood = inputs.mood.score; mkt[mk0[mk0.length - 1]].moodLabel = inputs.mood.label; } }
    inputs.stocks.forEach(function (s) {
      var dd = (s.daily || []).filter(function (b) { return istDate(b.t) < today; }).map(function (b) { return Object.assign({ date: istDate(b.t) }, b); });
      if (dd.length < 80) { skipped.push({ sym: s.sym, why: 'only ' + dd.length + ' sessions of history' }); return; }
      var k = dd.length - 1, plan = dayPlanFor(dd, k, mkt);
      if (isNum(plan.atr)) { try { board[s.sym] = boardRow(plan); } catch (e) { } }
      if (plan.sides.length) {
        var sd = plan.sides[0], m = plan.mkt;
        day.push({ type: 'DAY', sym: s.sym, ex: s.ex || 'NS', date: today, side: sd.side, entry: sd.entry, sl: sd.sl, t1: sd.t1, t2: sd.t2, rr1: sd.rr1, rr2: sd.rr2, t1Why: sd.t1Why, t2Why: sd.t2Why, risk: sd.risk, atr: plan.atr, score: Math.abs(plan.score), grade: plan.grade,
          why: plan.pts.filter(function (p) { return Math.sign(p.v) === sd.dir; }).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); }).slice(0, 6).map(function (p) { return p.label + ': ' + p.txt; }), cmp0: plan.ref.c, regime: m ? m.bias : null, er: sd.er || undefined });
      } else { skipped.push({ sym: s.sym, why: plan.reasons.join('; ') || 'no edge' }); if (plan.moodBlock && held.length < 40) held.push({ sym: s.sym, side: plan.score > 0 ? 'BUY' : 'SELL', score: Math.round(Math.abs(plan.score) * 10) / 10 }); }
      var iv = investFor(dd, k, inputs.nifty, mkt);
      if (iv) inv.push(Object.assign(iv, { sym: s.sym, ex: s.ex || 'NS', date: today }));
    });
    day.sort(function (a, b) { return b.score - a.score; }); inv.sort(function (a, b) { return b.score - a.score; });
    var keys = Object.keys(mkt).filter(function (d) { return d < today; }).sort(), m0 = keys.length ? mkt[keys[keys.length - 1]] : null;
    return { held: held, board: board, day: day.slice(0, inputs.maxDay || 12), inv: inv.slice(0, inputs.maxInv || 5), skipped: skipped, ctx: m0 ? { regime: m0.bias, reg: m0.reg, vix: m0.vix, vixHigh: m0.vixHigh, niftyRsi: m0.rsi, niftyChg: m0.chg, mood: inputs.mood ? inputs.mood.score : null, moodLabel: inputs.mood ? inputs.mood.label : null } : null };
  }

  return { setRules: setRules, rules: function () { return { live: RULES, bad: RULES_BAD }; }, normRule: normRule, OPND: OPND, CFG: CFG, isNum: isNum, istDate: istDate, istMin: istMin, ema: ema, rsi: rsi, atr: atr, adx: adx, macdHist: macdHist, pivots: pivots, ctxAt: ctxAt, scoreDay: scoreDay, mktSeries: mktSeries, dayPlanFor: dayPlanFor, evalDay: evalDay, sessionsOf: sessionsOf, replay: replay, summarize: summarize, investFor: investFor, evalInvest: evalInvest, buildBook: buildBook };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = JCE;
