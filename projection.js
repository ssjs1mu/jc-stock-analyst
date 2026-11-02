/* Joshi's Corner - 5-minute RANGE projection for the selected stock (v3).
   Research (56 NSE stocks, walk-forward, see docs/PROJECTION_RESEARCH.md): the DIRECTION of the next 5-minute candles is a coin flip (47-54 %) for every
   method tested, so it is no longer predicted. What IS predictable: (1) how far the rest of the day can stretch (calibrated 80 % high/low band),
   (2) whether today's high / low will be broken again (73-80 % right, 90 %+ when confident) and (3) when the day's extremes tend to print (U-shape).
   Every claim made here is back-tested on this stock's last 20 sessions and shown as a table. Statistical, not a guarantee. */
(function (root) {
  'use strict';
  const NB = 75, OPEN_SEC = 9 * 3600 + 15 * 60, BT = 20;
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


  const CAL = () => root.JC_PROJ_CAL;
  const KEYS = () => Object.keys(CAL().bands).map(Number).sort((a, b) => a - b);
  const nearest = (k) => KEYS().reduce((b, x) => (Math.abs(x - k) < Math.abs(b - k) ? x : b));
  const sigm = (z) => 1 / (1 + Math.exp(-z));
  const maxOf = (a, i, j) => { let m = -Infinity; for (let x = i; x < j; x++) if (a[x] > m) m = a[x]; return m; };
  const minOf = (a, i, j) => { let m = Infinity; for (let x = i; x < j; x++) if (a[x] < m) m = a[x]; return m; };

  /* average daily range (high-low / open) of the 20 complete sessions before index s */
  function avgRange(L, s) {
    const r = []; for (let j = s - 1; j >= 0 && r.length < 20; j--) if (L[j].complete) r.push((maxOf(L[j].hh, 0, NB) - minOf(L[j].ll, 0, NB)) / L[j].o);
    return r.length >= 5 ? mean(r) : null;
  }
  /* everything we claim for session S from cut-off k (k = bars already printed; k<6 -> whole-day mode from the previous close) */
  function claims(S, k, prevClose, dr) {
    const C = CAL();
    if (k < 6) {
      const [qh, ql] = C.day; return { mode: 'day', k: 0, ref: prevClose, hiLvl: prevClose * (1 + qh * dr), loLvl: prevClose * (1 + ql * dr) };
    }
    const kk = nearest(k), px = S.c[k - 1], hi = maxOf(S.hh, 0, k), lo = minOf(S.ll, 0, k), left = NB - k;
    const lr = []; for (let i = 1; i < k; i++) lr.push(Math.log(S.c[i] / S.c[i - 1]));
    const sv = (sd(lr) + 1e-6) * Math.sqrt(left), sdd = dr * Math.sqrt(left / NB), pos = (px - lo) / (hi - lo + 1e-9), rs = (hi - lo) / px;
    const [qh, ql] = C.bands[kk];
    const pr = (key, d) => { const m = C.brk[kk][key], f = [Math.abs(d) / (sdd + 1e-9), Math.abs(d) / (sv + 1e-9), pos, rs / (dr + 1e-9)]; let z = m.b; for (let i = 0; i < 4; i++) z += m.w[i] * (f[i] - m.mu[i]) / m.sd[i]; return sigm(z); };
    return { mode: 'live', k, ref: px, hi, lo, hiLvl: px * (1 + qh * sdd), loLvl: px * (1 + ql * sdd), pHi: pr('bh', hi / px - 1), pLo: pr('bl', lo / px - 1), sofar: px / prevClose - 1 };
  }
  /* back-test one past session with the same claims, using only the ranges of sessions before it */
  function checkOne(L, j, k) {
    const S = L[j], dr = avgRange(L, j); if (dr == null || j < 1) return null;
    const pc = L[j - 1].c[NB - 1], cl = claims(S, k, pc, dr), from = cl.mode === 'day' ? 0 : cl.k, ref = cl.ref;
    const H = maxOf(S.hh, from, NB) / ref - 1, Lw = minOf(S.ll, from, NB) / ref - 1, out = { date: S.date, H, L: Lw, bH: cl.hiLvl / ref - 1, bL: cl.loLvl / ref - 1, holdH: H <= cl.hiLvl / ref - 1, holdL: Lw >= cl.loLvl / ref - 1, mode: cl.mode };
    if (cl.mode === 'live') {
      const nh = maxOf(S.hh, k, NB) > cl.hi, nl = minOf(S.ll, k, NB) < cl.lo;
      Object.assign(out, { pHi: cl.pHi, pLo: cl.pLo, nh, nl, okH: (cl.pHi > .5) === nh, okL: (cl.pLo > .5) === nl, lean: Math.sign(cl.sofar), end: S.c[NB - 1] / ref - 1 });
      out.okLean = cl.sofar !== 0 && Math.sign(out.end) === Math.sign(cl.sofar);
    }
    return out;
  }
  const pct = (a) => (a.length ? a.filter(Boolean).length * 100 / a.length : NaN);
  function nextDate(d) { const t = new Date(d + 'T00:00:00Z'); do t.setUTCDate(t.getUTCDate() + 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6); return t.toISOString().slice(0, 10); }

  /* chunked (30-minute) share of days on which the high / low printed in each chunk, among the chunks still to come */
  function timing(k) {
    const C = CAL(), ch = [], th = C.hiHist.slice(k).reduce((a, b) => a + b, 0) || 1, tl = C.loHist.slice(k).reduce((a, b) => a + b, 0) || 1;
    for (let a = k; a < NB; a += 6) { const b = Math.min(NB, a + 6); ch.push({ a, b, hi: C.hiHist.slice(a, b).reduce((x, y) => x + y, 0) * 100 / th, lo: C.loHist.slice(a, b).reduce((x, y) => x + y, 0) * 100 / tl }); }
    return ch;
  }

  /* main entry: bars = 60d of 5-minute bars; live = is the market open on the last session */
  function project(bars, live, nowSec) {
    if (!CAL()) return { ok: false, reason: 'Calibration table not loaded.' };
    const L = sessionsOf(bars);
    if (L.length < 8) return { ok: false, reason: 'Not enough 5-minute history (' + L.length + ' sessions).' };
    const last = L[L.length - 1], isLive = !!(live && !last.complete && last.n > 0);
    let S, s, k, pc;
    if (isLive) { S = last; s = L.length - 1; k = last.n; pc = L[s - 1].c[NB - 1]; }
    else { S = last; s = L.length; k = 0; pc = last.c[NB - 1]; }
    const dr = avgRange(L, s); if (dr == null) return { ok: false, reason: 'Not enough completed sessions to measure the usual daily range.' };
    const cl = claims(S, k, pc, dr);
    const idx = []; for (let j = L.length - 1; j >= 1 && idx.length < BT; j--) if (L[j].complete) idx.push(j);
    const bt = idx.map((j) => checkOne(L, j, isLive ? k : 0)).filter(Boolean);
    const sum = { n: bt.length, holdH: pct(bt.map((b) => b.holdH)), holdL: pct(bt.map((b) => b.holdL)) };
    if (cl.mode === 'live') { sum.okH = pct(bt.map((b) => b.okH)); sum.okL = pct(bt.map((b) => b.okL)); sum.lean = pct(bt.map((b) => b.okLean)); }
    const candles = []; const src = isLive ? S : last; for (let i = 0; i < (isLive ? k : NB); i++) candles.push({ o: src.oo[i], h: src.hh[i], l: src.ll[i], c: src.c[i] });
    return { ok: true, live: isLive, cl, dr, pc, candles, date: isLive ? S.date : nextDate(last.date), lastDate: last.date, tim: timing(cl.mode === 'live' ? k : 0), bt, sum, nowSec };
  }

  /* ---------------- drawing ---------------- */
  const fx = (v, d) => (isFinite(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '-');
  const tl = (i) => { const m = 9 * 60 + 15 + i * 5; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const UP = '#12894b', DN = '#c0102e', NAVY = '#14306e', GOLD = '#b8860b', GREY = '#5b6b8c';

  function chartSvg(R) {
    const w = 940, h = 320, pad = { l: 64, r: 120, t: 14, b: 24 }, cl = R.cl, k = cl.mode === 'live' ? cl.k : NB, cand = R.candles;
    const vals = [cl.hiLvl, cl.loLvl]; cand.forEach((c) => vals.push(c.h, c.l));
    let mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals); const pv = (mx - mn) * .05; mn -= pv; mx += pv;
    const X = (i) => pad.l + (w - pad.l - pad.r) * i / NB, Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - mn) / (mx - mn)), bw = Math.max(2, (w - pad.l - pad.r) / NB * .62);
    let g = '';
    for (let t = 0; t <= 4; t++) { const v = mn + (mx - mn) * t / 4, y = Y(v); g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e6ebf5"/><text x="${pad.l - 6}" y="${(y + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="${GREY}">${fx(v, 1)}</text>`; }
    [0, 12, 24, 36, 48, 60, 72].forEach((i) => { g += `<text x="${(X(i) + 1).toFixed(1)}" y="${h - 6}" font-size="10.5" fill="${GREY}">${tl(i)}</text>`; });
    if (cl.mode === 'live') {
      g += `<rect x="${X(k).toFixed(1)}" y="${Y(cl.hiLvl).toFixed(1)}" width="${(X(NB) - X(k)).toFixed(1)}" height="${(Y(cl.loLvl) - Y(cl.hiLvl)).toFixed(1)}" fill="${GOLD}" fill-opacity=".13" stroke="${GOLD}" stroke-dasharray="5 3"/>`;
      g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(cl.hi).toFixed(1)}" y2="${Y(cl.hi).toFixed(1)}" stroke="${UP}" stroke-dasharray="2 3"/><line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(cl.lo).toFixed(1)}" y2="${Y(cl.lo).toFixed(1)}" stroke="${DN}" stroke-dasharray="2 3"/>`;
      g += `<text x="${w - pad.r + 5}" y="${(Y(cl.hi) + 4).toFixed(1)}" font-size="11" font-weight="800" fill="${UP}">Day high ${fx(cl.hi, 1)}</text><text x="${w - pad.r + 5}" y="${(Y(cl.lo) + 4).toFixed(1)}" font-size="11" font-weight="800" fill="${DN}">Day low ${fx(cl.lo, 1)}</text>`;
      g += `<text x="${w - pad.r + 5}" y="${(Y(cl.hiLvl) + 4).toFixed(1)}" font-size="11" font-weight="800" fill="${GOLD}">Upper ${fx(cl.hiLvl, 1)}</text><text x="${w - pad.r + 5}" y="${(Y(cl.loLvl) + 4).toFixed(1)}" font-size="11" font-weight="800" fill="${GOLD}">Lower ${fx(cl.loLvl, 1)}</text>`;
      g += `<line x1="${X(k).toFixed(1)}" x2="${X(NB).toFixed(1)}" y1="${Y(cl.ref).toFixed(1)}" y2="${Y(cl.ref).toFixed(1)}" stroke="${NAVY}" stroke-dasharray="1 4"/>`;
      g += `<text x="${((X(k) + X(NB)) / 2).toFixed(1)}" y="${(Y(cl.hiLvl) + 15).toFixed(1)}" font-size="11.5" font-weight="800" text-anchor="middle" fill="${GOLD}">80% of days the rest of the session stays inside this box</text>`;
    } else {
      g += `<rect x="${pad.l}" y="${Y(cl.hiLvl).toFixed(1)}" width="${(w - pad.l - pad.r).toFixed(1)}" height="${(Y(cl.loLvl) - Y(cl.hiLvl)).toFixed(1)}" fill="${GOLD}" fill-opacity=".10" stroke="${GOLD}" stroke-dasharray="5 3"/>`;
      g += `<text x="${w - pad.r + 5}" y="${(Y(cl.hiLvl) + 4).toFixed(1)}" font-size="11" font-weight="800" fill="${GOLD}">Upper ${fx(cl.hiLvl, 1)}</text><text x="${w - pad.r + 5}" y="${(Y(cl.loLvl) + 4).toFixed(1)}" font-size="11" font-weight="800" fill="${GOLD}">Lower ${fx(cl.loLvl, 1)}</text>`;
      g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(cl.ref).toFixed(1)}" y2="${Y(cl.ref).toFixed(1)}" stroke="${NAVY}" stroke-dasharray="1 4"/><text x="${w - pad.r + 5}" y="${(Y(cl.ref) + 4).toFixed(1)}" font-size="11" font-weight="800" fill="${NAVY}">Last close ${fx(cl.ref, 1)}</text>`;
    }
    cand.forEach((c, i) => { const up = c.c >= c.o, col = up ? UP : DN, x = X(i + .5), top = Math.min(Y(c.o), Y(c.c)); g += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(c.h).toFixed(1)}" y2="${Y(c.l).toFixed(1)}" stroke="${col}" opacity="${cl.mode === 'live' ? 1 : .45}"/><rect x="${(x - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(Y(c.o) - Y(c.c))).toFixed(1)}" fill="${col}" opacity="${cl.mode === 'live' ? 1 : .45}"/>`; });
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;max-width:${w}px" role="img">${g}</svg>`;
  }
  function timingSvg(R) {
    const w = 940, h = 110, pad = { l: 64, r: 120, t: 20, b: 18 }, T = R.tim, mx = Math.max.apply(null, T.map((c) => Math.max(c.hi, c.lo))) || 1, bwid = (w - pad.l - pad.r) / T.length;
    let g = '';
    T.forEach((c, i) => { const x = pad.l + bwid * i, hh = (c.hi / mx) * (h - pad.t - pad.b), hl = (c.lo / mx) * (h - pad.t - pad.b);
      g += `<rect x="${(x + 3).toFixed(1)}" y="${(h - pad.b - hh).toFixed(1)}" width="${(bwid / 2 - 4).toFixed(1)}" height="${hh.toFixed(1)}" fill="${UP}" opacity=".75"/><rect x="${(x + bwid / 2 + 1).toFixed(1)}" y="${(h - pad.b - hl).toFixed(1)}" width="${(bwid / 2 - 4).toFixed(1)}" height="${hl.toFixed(1)}" fill="${DN}" opacity=".75"/>`;
      g += `<text x="${(x + bwid / 2).toFixed(1)}" y="${h - 5}" font-size="10" text-anchor="middle" fill="${GREY}">${tl(c.a)}</text>`;
      if (c.hi === mx || c.lo === mx || c.hi > mx * .6 || c.lo > mx * .6) g += `<text x="${(x + bwid / 2).toFixed(1)}" y="${(h - pad.b - Math.max(hh, hl) - 2).toFixed(1)}" font-size="9.5" text-anchor="middle" fill="${NAVY}" font-weight="700">${Math.round(c.hi)}/${Math.round(c.lo)}%</text>`; });
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;max-width:${w}px">${g}</svg>`;
  }

  function html(R, sym) {
    if (!R.ok) return `<div class="note">${R.reason}</div>`;
    const cl = R.cl, S = R.sum, live = cl.mode === 'live', ref = cl.ref;
    const dt = new Date(R.date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
    const chip = (t, c) => `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-weight:800;font-size:12px;background:${c};color:#fff">${t}</span>`;
    const head = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px"><b style="font-size:15px;color:${NAVY}">${live ? 'REST OF TODAY' : 'NEXT TRADING SESSION'} · ${dt} · RANGE & LEVELS</b>${chip('PREDICTION', GOLD)}${live ? chip('LIVE · from ' + tl(cl.k - 1), '#08783a') : chip('MARKET CLOSED · from last close', GREY)}</div>`;
    const card = (cap, val, sub, col) => `<div style="flex:1;min-width:150px;padding:8px 12px;border:1px solid #d9e1f0;border-radius:10px;background:#fff"><div style="font-size:11px;color:${GREY};font-weight:700">${cap}</div><div style="font-size:18px;font-weight:900;color:${col || NAVY}">${val}</div><div style="font-size:11px;color:${GREY}">${sub}</div></div>`;
    const pc = (p) => Math.round(p * 100) + '%';
    const lean = live && cl.sofar !== 0 ? (cl.sofar > 0 ? '▲ up' : '▼ down') : '-';
    const cards = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">' +
      card('Upper limit (80%)', '₹' + fx(cl.hiLvl), `+${fx((cl.hiLvl / ref - 1) * 100)}% from ${live ? 'now' : 'last close'} ₹${fx(ref)}`, UP) +
      card('Lower limit (80%)', '₹' + fx(cl.loLvl), `${fx((cl.loLvl / ref - 1) * 100)}% from ${live ? 'now' : 'last close'}`, DN) +
      (live ? card('Day high ₹' + fx(cl.hi, 1) + ' broken again?', pc(cl.pHi), cl.pHi > .5 ? 'LIKELY - expect a new high' : 'unlikely - likely stays the day high', cl.pHi > .5 ? UP : NAVY) +
        card('Day low ₹' + fx(cl.lo, 1) + ' broken again?', pc(cl.pLo), cl.pLo > .5 ? 'LIKELY - expect a new low' : 'unlikely - likely stays the day low', cl.pLo > .5 ? DN : NAVY) +
        card('Direction lean (weak)', lean, 'continue-the-day heuristic: only ~53% right - no real edge', GREY) : card('Direction', 'No edge', 'tested 8 ways on 56 stocks: 47-54% = coin flip', GREY)) + '</div>';
    const ok = (v) => (v ? '<b style="color:' + UP + '">✓</b>' : '<b style="color:' + DN + '">✗</b>');
    const rows = R.bt.slice(0, 5).map((b) => {
      const d = new Date(b.date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
      const td = 'padding:3px 8px;border-top:1px solid #eef1f8;';
      return `<tr><td style="${td}font-weight:700">${d}</td><td style="${td}">${ok(b.holdH)} high ${b.H >= 0 ? '+' : ''}${fx(b.H * 100)}% <span style="color:${GREY}">(limit +${fx(b.bH * 100)}%)</span></td><td style="${td}">${ok(b.holdL)} low ${fx(b.L * 100)}% <span style="color:${GREY}">(limit ${fx(b.bL * 100)}%)</span></td>` +
        (b.mode === 'live' ? `<td style="${td}">${ok(b.okH)} said ${pc(b.pHi)} → ${b.nh ? 'broke' : 'held'}</td><td style="${td}">${ok(b.okL)} said ${pc(b.pLo)} → ${b.nl ? 'broke' : 'held'}</td><td style="${td}">${ok(b.okLean)} ${b.end >= 0 ? '+' : ''}${fx(b.end * 100)}%</td>` : '<td style="' + td + '">-</td><td style="' + td + '">-</td><td style="' + td + '">-</td>') + '</tr>';
    }).join('');
    const th = 'padding:3px 8px;text-align:left;font-size:11px;color:' + GREY + ';';
    const f0 = (v) => (isFinite(v) ? Math.round(v) + '%' : '-');
    const tot = `<tr style="background:#f6f8fd;font-weight:800;color:${NAVY}"><td style="padding:4px 8px">This stock, last ${S.n} sessions</td><td style="padding:4px 8px">${f0(S.holdH)} held</td><td style="padding:4px 8px">${f0(S.holdL)} held</td>` + (live ? `<td style="padding:4px 8px">${f0(S.okH)} right</td><td style="padding:4px 8px">${f0(S.okL)} right</td><td style="padding:4px 8px">${f0(S.lean)} right</td>` : '<td colspan="3"></td>') + '</tr>' +
      `<tr style="color:#34456a"><td style="padding:4px 8px">56 stocks (out-of-sample test)</td><td style="padding:4px 8px">78-81% held</td><td style="padding:4px 8px">75-80% held</td><td style="padding:4px 8px">73-80% right</td><td style="padding:4px 8px">76-80% right</td><td style="padding:4px 8px">~53% (coin flip)</td></tr>`;
    const table = `<table style="border-collapse:collapse;font-size:12px;background:#fff;border:1px solid #d9e1f0;width:100%"><tr><th style="${th}">Session</th><th style="${th}">Upper limit held?</th><th style="${th}">Lower limit held?</th><th style="${th}">Day-high call</th><th style="${th}">Day-low call</th><th style="${th}">Direction lean</th></tr>${rows}${tot}</table>`;
    const topH = R.tim.slice().sort((a, b) => b.hi - a.hi)[0], topL = R.tim.slice().sort((a, b) => b.lo - a.lo)[0];
    const timeNote = `Day high tends to print ${tl(topH.a)}-${tl(topH.b)} (${Math.round(topH.hi)}% of days), day low ${tl(topL.a)}-${tl(topL.b)} (${Math.round(topL.lo)}%). Extremes cluster at the open and the last hour.`;
    const verdict = live
      ? `Expect the rest of today to trade between ₹${fx(cl.loLvl)} and ₹${fx(cl.hiLvl)} (80% of days). The day high ₹${fx(cl.hi, 1)} has a ${pc(cl.pHi)} chance of being broken again; the day low ₹${fx(cl.lo, 1)} ${pc(cl.pLo)}.`
      : `Expect the next session to trade between ₹${fx(cl.loLvl)} and ₹${fx(cl.hiLvl)} (80% of days), measured from the last close ₹${fx(ref)}.`;
    return head + `<div style="font-size:13px;color:${NAVY};font-weight:700;margin:2px 0 4px">${verdict}</div>` + cards + chartSvg(R) +
      `<div style="font-size:11px;color:${GREY};margin:2px 0 6px">${live ? 'Candles = actual so far. Gold box = projected limits for the rest of the session. Green / red dotted = day high / low so far.' : 'Faded candles = last session. Gold box = projected limits for the next session.'}</div>` +
      `<div style="font-weight:800;color:${NAVY};font-size:13px;margin:6px 0 2px">WHEN THE EXTREMES PRINT <span style="font-weight:400;color:${GREY};font-size:11px">(share of days, high <b style="color:${UP}">■</b> / low <b style="color:${DN}">■</b>, per 30 minutes still to come)</span></div>` + timingSvg(R) + `<div style="font-size:12px;color:#34456a;margin:2px 0 8px">${timeNote}</div>` +
      `<div style="font-weight:800;color:${NAVY};font-size:13px;margin:6px 0 4px">BACK-TEST - the same claims, made from the same ${live ? 'cut-off time' : 'starting point'} on this stock's recent sessions</div>` + table +
      `<div style="font-size:11px;color:${GREY};margin-top:6px">Limits = calibrated from the stock's usual daily range (avg ${fx(R.dr * 100)}% over the last 20 sessions) and how much time is left; constants fitted on 56 NSE stocks, 57 sessions, tested out-of-sample. Why no candle forecast: the direction of the next 5-minute candles could not beat a coin flip in any of 8 methods tested (docs/PROJECTION_RESEARCH.md). A statistical projection, not a recommendation or a guarantee.</div>`;
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

  root.JCProj = { run, project, sessionsOf, html, claims, checkOne };
  if (typeof module !== 'undefined') module.exports = root.JCProj;
})(typeof window !== 'undefined' ? window : globalThis);
