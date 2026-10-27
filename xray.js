/* ============================================================
   Joshi's Corner — LIVE X-RAY
   One button (X-ray) beside every stock / index in the terminal opens this overlay: live price, day structure, trend & momentum
   indicators, pivot / CPR / Camarilla ladder with the LTP marked, the day-trading call (or the reasons for "No trade"), and charts.
   Works for NSE / BSE stocks, Indian indices (^NSEI …), global indices, commodities and FX — anything Yahoo serves.
   Uses the same calls engine (JCE) as Today's Calls, so the X-ray and the calls never disagree.
   ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v, d) => (num(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '—');
  const sg = (v, d) => (num(v) ? (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) : '—');
  const X = { sym: null, timer: null, token: 0, data: null };

  function norm(s) {
    s = String(s || '').trim().toUpperCase().replace(/^(NSE|BSE):/, (m) => (m === 'BSE:' ? 'BSE:' : ''));
    if (/^BSE:/.test(s)) s = s.slice(4) + '.BO';
    if (/^[\^]/.test(s) || /[=]/.test(s) || /\.(NS|BO)$/.test(s)) return s;
    if (/^\d{5,6}$/.test(s)) return s + '.BO';
    return s.replace(/[^A-Z0-9&\-]/g, '') + '.NS';
  }
  const isIndexLike = (y) => /^\^/.test(y) || /=/.test(y) || /^NIFTY_/.test(y) || /^DX-Y/.test(y);
  const label = (y) => y.replace(/\.(NS|BO)$/, '').replace(/^\^/, '').replace(/_/g, ' ');
  const istDate = (t) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);
  const istMin = (t) => Math.floor(((t + 19800) % 86400) / 60);

  /* ---------- data + analysis ---------- */
  async function load(y) {
    const [d, m] = await Promise.allSettled([fetchChart(y, '2y', '1d'), fetchChart(y, '5d', '5m')]);
    if (d.status !== 'fulfilled' && m.status !== 'fulfilled') throw new Error((d.reason && d.reason.message) || 'No data returned for ' + y);
    const daily = d.status === 'fulfilled' ? d.value.bars : [], m5 = m.status === 'fulfilled' ? m.value.bars : [], meta = (m.status === 'fulfilled' ? m.value.meta : d.value.meta) || {};
    let mkt = {}; try { mkt = (typeof wlMkt === 'function') ? await wlMkt(false) : {}; } catch (e) {}
    return analyse(y, daily, m5, meta, mkt || {});
  }
  function analyse(y, daily, m5, meta, mkt) {
    const now = Date.now() / 1000, today = istDate(now), idx = isIndexLike(y), sess = {};
    m5.forEach((b) => { const d = istDate(b.t); (sess[d] = sess[d] || []).push(b); });
    const sd = Object.keys(sess).sort(), lastS = sd.length ? sd[sd.length - 1] : null, sbars = lastS ? sess[lastS] : [];
    const dd = daily.map((b) => Object.assign({ date: istDate(b.t) }, b));
    const live = !!lastS && lastS === today && istMin(now) >= 555 && istMin(now) <= 935 + 5;
    // completed daily bars only (today's partial bar is dropped while the day is in progress)
    const done = dd.filter((b) => b.date < (lastS || today) || (b.date === lastS && !live && sbars.length > 60) || (b.date < today));
    const hist = done.length ? done : dd; if (hist.length < 30) return { y, idx, err: 'Not enough daily history (' + hist.length + ' sessions) for indicators.' };
    const k = hist.length - 1, x = JCE.ctxAt(hist, k), I = hist._ind, last5 = sbars.length ? sbars[sbars.length - 1] : null;
    const cmp = num(meta.regularMarketPrice) && live ? meta.regularMarketPrice : last5 ? last5.c : hist[k].c;
    const prevClose = lastS && hist[k].date === lastS ? (hist[k - 1] ? hist[k - 1].c : hist[k].c) : hist[k].c;
    let dayO = null, dayH = null, dayL = null, vwap = null, orbH = null, orbL = null, vsum = 0, pv = 0;
    if (sbars.length) { dayO = sbars[0].o; dayH = Math.max(...sbars.map((b) => b.h)); dayL = Math.min(...sbars.map((b) => b.l)); sbars.forEach((b) => { const tp = (b.h + b.l + b.c) / 3; vsum += b.v; pv += tp * b.v; }); vwap = vsum > 0 ? pv / vsum : null; const o3 = sbars.slice(0, 3); orbH = Math.max(...o3.map((b) => b.h)); orbL = Math.min(...o3.map((b) => b.l)); }
    const yr = hist.slice(-252), hi52 = Math.max(...yr.map((b) => b.h)), lo52 = Math.min(...yr.map((b) => b.l));
    const ref = hist[k], dayInProgress = live && lastS === today;
    const piv = JCE.pivots(ref.h, ref.l, ref.c);
    const sc = JCE.scoreDay(x, null);
    let plan = null; if (!idx) { try { plan = JCE.dayPlanFor(hist, k, mkt); } catch (e) {} }
    const vol20 = x.rv == null ? null : x.rv;
    const ret = (n) => (k >= n ? (hist[k].c / hist[k - n].c - 1) * 100 : null);
    return { y, idx, name: meta.longName || meta.shortName || label(y), cur: meta.currency || '', cmp, prevClose, chg: prevClose ? (cmp / prevClose - 1) * 100 : null, live: dayInProgress, lastS, dayO, dayH, dayL, vwap, orbH, orbL, hi52, lo52, x, piv, sc, plan, vol20, hist, k, sbars, I, r5: ret(5), r20: ret(20), r60: ret(60), at: Date.now() };
  }

  /* ---------- small SVG charts ---------- */
  function candles(hist, I, n) {
    const W = 640, H = 210, pad = 6, b = hist.slice(-n), off = hist.length - b.length; if (b.length < 5) return '';
    const hi = Math.max(...b.map((q) => q.h)), lo = Math.min(...b.map((q) => q.l)), rg = hi - lo || 1, sx = (W - pad * 2) / b.length, y = (v) => pad + (1 - (v - lo) / rg) * (H - pad * 2);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="xr-svg" preserveAspectRatio="none">`;
    b.forEach((q, i) => { const xx = pad + i * sx + sx / 2, up = q.c >= q.o, col = up ? '#0f8a4b' : '#c41e3c'; s += `<line x1="${xx.toFixed(1)}" x2="${xx.toFixed(1)}" y1="${y(q.h).toFixed(1)}" y2="${y(q.l).toFixed(1)}" stroke="${col}" stroke-width="1"/><rect x="${(xx - sx * 0.32).toFixed(1)}" y="${Math.min(y(q.o), y(q.c)).toFixed(1)}" width="${(sx * 0.64).toFixed(1)}" height="${Math.max(1, Math.abs(y(q.o) - y(q.c))).toFixed(1)}" fill="${col}"/>`; });
    const line = (arr, col) => { const pts = []; arr.slice(off).forEach((v, i) => { if (num(v)) pts.push(`${(pad + i * sx + sx / 2).toFixed(1)},${y(v).toFixed(1)}`); }); return pts.length > 2 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.4"/>` : ''; };
    s += line(I.e20, '#e08a00') + line(I.e50, '#2b59c3') + line(I.e200, '#7a4db5');
    return s + '</svg>';
  }
  function intraday(sb, vwap, plan) {
    const W = 640, H = 150, pad = 6; if (!sb || sb.length < 3) return '<div class="xr-na">Intraday candles not available (market closed or no 5-minute feed for this symbol).</div>';
    const hi = Math.max(...sb.map((q) => q.h)), lo = Math.min(...sb.map((q) => q.l)), rg = hi - lo || 1, sx = (W - pad * 2) / Math.max(sb.length, 75), y = (v) => pad + (1 - (v - lo) / rg) * (H - pad * 2);
    const pts = sb.map((q, i) => `${(pad + i * sx).toFixed(1)},${y(q.c).toFixed(1)}`).join(' '), up = sb[sb.length - 1].c >= sb[0].o;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="xr-svg" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${up ? '#0f8a4b' : '#c41e3c'}" stroke-width="1.8"/>`;
    if (num(vwap) && vwap >= lo && vwap <= hi) s += `<line x1="0" x2="${W}" y1="${y(vwap).toFixed(1)}" y2="${y(vwap).toFixed(1)}" stroke="#7a4db5" stroke-dasharray="4 3"/>`;
    return s + '</svg>';
  }

  /* ---------- rendering ---------- */
  const chip = (t, c) => `<span class="xr-chip ${c || ''}">${E(t)}</span>`;
  const row = (a, b, c, tone) => `<tr><td class="xr-k">${a}</td><td class="xr-v">${b}</td><td class="xr-s ${tone || ''}">${c || ''}</td></tr>`;
  function ladder(d) {
    const p = d.piv, L = [['R3', p.R3], ['R2', p.R2], ['R1', p.R1], ['CPR top', p.cprTop], ['Pivot', p.P], ['CPR bottom', p.cprBot], ['S1', p.S1], ['S2', p.S2], ['S3', p.S3], ['Camarilla H4', p.H4], ['Camarilla H3', p.H3], ['Camarilla L3', p.L3], ['Camarilla L4', p.L4], ['Prev high', d.x.h], ['Prev low', d.x.l], ['Prev close', d.x.c], ['20-day high', d.x.hi20], ['20-day low', d.x.lo20]];
    if (num(d.vwap)) L.push(['VWAP (today)', d.vwap]); if (num(d.orbH)) { L.push(['15-min range high', d.orbH]); L.push(['15-min range low', d.orbL]); }
    L.push(['▶ LTP', d.cmp]); L.sort((a, b) => b[1] - a[1]);
    return `<table class="xr-t">${L.map((l) => `<tr class="${l[0] === '▶ LTP' ? 'xr-ltp' : ''}"><td class="xr-k">${E(l[0])}</td><td class="xr-v">${f2(l[1])}</td><td class="xr-s">${l[0] === '▶ LTP' ? '' : sg((l[1] / d.cmp - 1) * 100) + '% from LTP'}</td></tr>`).join('')}</table>`;
  }
  function verdict(d) {
    const x = d.x, up = x.c > x.e20 && x.e20 > x.e50, dn = x.c < x.e20 && x.e20 < x.e50;
    const trend = up ? ['UPTREND', 'g'] : dn ? ['DOWNTREND', 'r'] : ['SIDEWAYS / MIXED', 'a'];
    const mom = x.rsi >= 60 ? ['STRONG MOMENTUM', 'g'] : x.rsi <= 40 ? ['WEAK MOMENTUM', 'r'] : ['NEUTRAL MOMENTUM', 'a'];
    const str = num(x.adx) ? (x.adx >= 25 ? ['TRENDING (ADX ' + x.adx.toFixed(0) + ')', 'g'] : x.adx >= 18 ? ['DEVELOPING (ADX ' + x.adx.toFixed(0) + ')', 'a'] : ['CHOPPY (ADX ' + x.adx.toFixed(0) + ')', 'r']) : null;
    const pos = d.cmp > x.piv.cprTop ? ['ABOVE CPR', 'g'] : d.cmp < x.piv.cprBot ? ['BELOW CPR', 'r'] : ['INSIDE CPR', 'a'];
    const vw = num(d.vwap) ? (d.cmp >= d.vwap ? ['ABOVE VWAP', 'g'] : ['BELOW VWAP', 'r']) : null;
    return [trend, mom, str, pos, vw].filter(Boolean).map((v) => chip(v[0], v[1])).join('');
  }
  function planHtml(d) {
    if (d.idx) return '<div class="xr-note">Index / commodity / FX — the stock call engine is not applied here. Use the level ladder, trend and momentum above; the dashboard shows the live move.</div>';
    const p = d.plan; if (!p) return '<div class="xr-note">Plan unavailable.</div>';
    const pts = `<table class="xr-t xr-pts">${(p.pts || []).map((q) => `<tr><td class="xr-k">${E(q.label)}</td><td class="xr-v ${q.v > 0 ? 'g' : q.v < 0 ? 'r' : ''}">${sg(q.v, 1)}</td><td class="xr-s">${E(q.txt)}</td></tr>`).join('')}</table>`;
    if (!p.sides.length) return `<div class="xr-nocall"><b>NO TRADE for the next session</b><span>${E((p.reasons || []).join(' · ') || 'confluence not met')}</span></div>${pts}<div class="xr-note">Confluence score ${sg(p.score, 1)} · a call needs ≥ ${JCE.CFG.minScore} (more when VIX is high or the Nifty regime disagrees).</div>`;
    const s = p.sides[0], buy = s.dir > 0;
    return `<div class="xr-call ${buy ? 'g' : 'r'}"><div class="xr-cs">${buy ? '▲ BUY' : '▼ SELL'} <small>grade ${E(p.grade)} · score ${Math.abs(p.score).toFixed(1)}</small></div>
      <div class="xr-cg"><div><i>Entry</i><b>${f2(s.entry)}</b><small>5-min close ${buy ? 'above' : 'below'}</small></div><div><i>Stop-loss</i><b class="r">${f2(s.sl)}</b><small>${sg((s.sl / s.entry - 1) * 100)}%</small></div><div><i>Target 1</i><b class="g">${f2(s.t1)}</b><small>${E(s.t1Why)}</small></div><div><i>Target 2</i><b class="g">${f2(s.t2)}</b><small>${E(s.t2Why)}</small></div><div><i>R : R</i><b>${s.rr1.toFixed(1)} / ${s.rr2.toFixed(1)}</b><small>to T1 / T2</small></div></div></div>${pts}`;
  }

  /* ---------- trend behaviour: where this move can stop, and what kind of reversal to expect ---------- */
  function trendData(d) {
    const H = d.hist, n = H.length, I = d.I || {}, x = d.x, cmp = d.cmp, atr = num(x.atr) ? x.atr : cmp * 0.015, e20 = x.e20, e50 = x.e50, e200 = x.e200;
    if (n < 40) return null;
    const K = 3, lo0 = Math.max(K, n - 140), sw = [];
    for (let i = lo0; i < n - K; i++) { let hi = true, lw = true; for (let j = 1; j <= K; j++) { if (H[i].h <= H[i - j].h || H[i].h <= H[i + j].h) hi = false; if (H[i].l >= H[i - j].l || H[i].l >= H[i + j].l) lw = false; } if (hi) sw.push({ i, t: 'H', p: H[i].h }); if (lw) sw.push({ i, t: 'L', p: H[i].l }); }
    const sH = sw.filter((s) => s.t === 'H'), sL = sw.filter((s) => s.t === 'L'), lastH = sH[sH.length - 1], prevH = sH[sH.length - 2], lastL = sL[sL.length - 1], prevL = sL[sL.length - 2];
    const up = cmp > e20 && e20 > e50, dn = cmp < e20 && e20 < e50, belowSlow = cmp < e50 && !(cmp > e20);
    const hh = !!(lastH && prevH && lastH.p > prevH.p), hl = !!(lastL && prevL && lastL.p > prevL.p), lh = !!(lastH && prevH && lastH.p < prevH.p), ll = !!(lastL && prevL && lastL.p < prevL.p);
    // volume: average on up days vs down days, last 20 sessions
    let uv = 0, dv = 0, un = 0, dnn = 0; for (let i = n - 20; i < n; i++) { const b = H[i], pc = H[i - 1].c, v = b.v || 0; if (b.c >= pc) { uv += v; un++; } else { dv += v; dnn++; } }
    const vr = un && dnn && dv ? (uv / un) / (dv / dnn) : null;
    const s20 = H.slice(-20), hi20 = Math.max(...s20.map((b) => b.h)), lo20 = Math.min(...s20.map((b) => b.l)), rangePct = (hi20 - lo20) / ((hi20 + lo20) / 2) * 100;
    const l10 = Math.min(...H.slice(-10).map((b) => b.l)), lp10 = Math.min(...H.slice(-20, -10).map((b) => b.l)), h10 = Math.max(...H.slice(-10).map((b) => b.h)), hp10 = Math.max(...H.slice(-20, -10).map((b) => b.h));
    const stretch = (cmp - e20) / atr, rsi = x.rsi, e20s = I.e20 ? I.e20[n - 1] - I.e20[n - 6] : 0;
    // last down-leg (for bounce size) and last up-leg (for pull-back size)
    const w60 = H.slice(-120), iH = w60.reduce((m, b, i) => (b.h >= w60[m].h ? i : m), 0), Hleg = w60[iH].h; let Lleg = Infinity, iL = -1; for (let i = iH; i < w60.length; i++) if (w60[i].l < Lleg) { Lleg = w60[i].l; iL = i; }
    const bounce = iL > iH && Hleg > Lleg && (Hleg - Lleg) / Hleg > 0.08 ? (cmp - Lleg) / (Hleg - Lleg) : null;
    const iL2 = w60.reduce((m, b, i) => (b.l <= w60[m].l ? i : m), 0), Lleg2 = w60[iL2].l; let Hleg2 = -Infinity, iH2 = -1; for (let i = iL2; i < w60.length; i++) if (w60[i].h > Hleg2) { Hleg2 = w60[i].h; iH2 = i; }
    const pull = iH2 > iL2 && Hleg2 > Lleg2 && (Hleg2 - Lleg2) / Lleg2 > 0.08 ? (Hleg2 - cmp) / (Hleg2 - Lleg2) : null;
    // RSI divergence on the last two swing points
    let div = null; if (I.rsi && lastH && prevH && lastH.p > prevH.p && num(I.rsi[lastH.i]) && num(I.rsi[prevH.i]) && I.rsi[lastH.i] < I.rsi[prevH.i] - 2) div = 'bear'; else if (I.rsi && lastL && prevL && lastL.p < prevL.p && num(I.rsi[lastL.i]) && num(I.rsi[prevL.i]) && I.rsi[lastL.i] > I.rsi[prevL.i] + 2) div = 'bull';
    const ev = [], T = { H, sw, lastH, prevH, lastL, prevL, vr, rangePct, stretch, bounce, pull, div, atr };
    let state, tone, kind; // kind: up | down | side
    // bigger picture: a bounce inside a larger fall (price under a falling 200-day average, last leg down not yet recovered) is still a down-trend until proven otherwise
    const bigDown = num(e200) && cmp < e200 && e50 < e200 && bounce != null && bounce < 0.62;
    const b0 = H.slice(-45, -8), b0hi = Math.max(...b0.map((b) => b.h)), b0lo = Math.min(...b0.map((b) => b.l)), baseW = (b0hi - b0lo) / ((b0hi + b0lo) / 2) * 100;
    const fresh = up && !bigDown && baseW < 16 && cmp > b0hi && vr != null && vr >= 1.1;
    if (dn || (belowSlow && lh) || bigDown) {
      kind = 'down';
      const dead = [vr != null && vr < 0.95, cmp < e20 || e20s < 0, num(rsi) && rsi < 50, lh || (bounce != null && bounce < 0.5)].filter(Boolean).length;
      const acc = [l10 > lp10, rangePct < 12, vr != null && vr > 1.1, cmp > e20, num(rsi) && rsi > 50, !ll].filter(Boolean).length;
      if (acc >= 4 && vr != null && vr > 1.1) { state = 'DOWNTREND → BASE / ACCUMULATION forming'; tone = 'a'; T.type = 'acc'; }
      else if (bounce != null && bounce > 0.12 && dead >= 2) { state = 'DOWNTREND — relief bounce in progress (dead-cat risk)'; tone = 'r'; T.type = 'dead'; }
      else { state = 'DOWNTREND — still falling, no base yet'; tone = 'r'; T.type = 'down'; }
      ev.push(`Lower highs ${lh ? 'yes' : 'no'}, lower lows ${ll ? 'yes' : 'no'}; price ${cmp < e20 ? 'below' : 'above'} a ${e20s < 0 ? 'falling' : 'rising'} 20-day average and ${cmp < e50 ? 'below' : 'above'} the 50-day.`);
      if (bounce != null) ev.push(`The bounce so far has retraced <b>${(bounce * 100).toFixed(0)}%</b> of the last fall (${f2(Hleg)} → ${f2(Lleg)}); dead-cat bounces usually stall below 38–50%.`);
      if (vr != null) ev.push(`Volume on up days is ${vr.toFixed(2)}× the volume on down days over 20 sessions — ${vr < 0.95 ? 'buyers are weaker than sellers (relief-bounce sign)' : vr > 1.1 ? 'buyers are stronger than sellers (accumulation sign)' : 'balanced'}.`);
      ev.push(`Base test: ${acc}/6 accumulation signs (higher 10-day low, tight range, up-volume, above 20-day, RSI>50, no new low) · dead-cat test: ${dead}/4 relief signs.`);
    } else if (up) {
      kind = 'up';
      const dist = [vr != null && vr < 0.9, div === 'bear', stretch > 2.5, num(rsi) && rsi > 72].filter(Boolean).length;
      if (fresh) { state = 'UPTREND — fresh breakout from a base (accumulation-zone breakout)'; tone = 'g'; T.type = 'brk'; }
      else if (dist >= 3) { state = 'UPTREND — topping / distribution risk'; tone = 'r'; T.type = 'top'; }
      else if (stretch > 2.5 || (num(rsi) && rsi > 72)) { state = 'UPTREND — extended (pause or pull-back likely)'; tone = 'a'; T.type = 'ext'; }
      else if (pull != null && pull > 0.12) { state = 'UPTREND — pull-back in progress'; tone = 'g'; T.type = 'pull'; }
      else { state = 'UPTREND — healthy'; tone = 'g'; T.type = 'up'; }
      ev.push(`Higher highs ${hh ? 'yes' : 'no'}, higher lows ${hl ? 'yes' : 'no'}; price ${stretch.toFixed(1)} ATR ${stretch >= 0 ? 'above' : 'below'} the 20-day average${stretch > 2.5 ? ' — stretched' : ''}.`);
      if (fresh) ev.push(`The ~35 sessions before this move were a base only <b>${baseW.toFixed(0)}%</b> wide (${f2(b0lo)} – ${f2(b0hi)}); price has now closed above it with up-day volume ${vr.toFixed(1)}× down-day volume — the signature of an accumulation-zone breakout. It fails if price closes back inside the base (below ${f2(b0hi)}).`);
      if (pull != null) ev.push(`Pull-back from the last high retraced <b>${(pull * 100).toFixed(0)}%</b> of the up-leg (${f2(Lleg2)} → ${f2(Hleg2)}); healthy pull-backs hold above 38–50%.`);
      if (vr != null) ev.push(`Volume on up days is ${vr.toFixed(2)}× the volume on down days — ${vr > 1.1 ? 'accumulation continues' : vr < 0.9 ? 'distribution creeping in' : 'balanced'}${div === 'bear' ? '; RSI is making lower highs while price makes higher highs (bearish divergence)' : ''}.`);
    } else {
      kind = 'side';
      const acc = [rangePct < 12, vr != null && vr > 1.15, cmp > (hi20 + lo20) / 2, l10 > lp10].filter(Boolean).length, dis = [vr != null && vr < 0.87, cmp < (hi20 + lo20) / 2, h10 < hp10].filter(Boolean).length;
      if (acc >= 3) { state = 'SIDEWAYS — accumulation bias (breakout candidate)'; tone = 'g'; T.type = 'acc'; }
      else if (dis >= 2) { state = 'SIDEWAYS — distribution bias (breakdown risk)'; tone = 'r'; T.type = 'dist'; }
      else { state = 'SIDEWAYS — no edge yet'; tone = 'a'; T.type = 'side'; }
      ev.push(`20-day range ${f2(lo20)} – ${f2(hi20)} (${rangePct.toFixed(1)}% wide); price ${cmp > (hi20 + lo20) / 2 ? 'in the upper' : 'in the lower'} half.`);
      if (vr != null) ev.push(`Volume on up days is ${vr.toFixed(2)}× the volume on down days — ${vr > 1.15 ? 'buyers are quietly stronger' : vr < 0.87 ? 'sellers are quietly stronger' : 'balanced'}.`);
    }
    // where this move can stop
    const stops = [];
    if (kind === 'up' || (kind === 'side' && T.type === 'acc')) {
      sH.filter((s) => s.p > cmp * 1.003).forEach((s) => stops.push([s.p, 'Earlier swing high (' + (H[s.i].date || '') + ')']));
      if (lastL && lastH && lastL.i > lastH.i) { const st = sL.filter((s) => s.i < lastH.i).pop(); if (st) { const tg = lastL.p + (lastH.p - st.p); if (tg > cmp) stops.push([tg, 'Measured move (equal to the last up-leg)']); } }
      if (d.hi52 > cmp * 1.003) stops.push([d.hi52, '52-week high']);
      stops.push([e20 + 3 * atr, 'Stretch zone (3 ATR above the 20-day average)']);
    } else if (kind === 'down') {
      sL.filter((s) => s.p < cmp * 0.997).forEach((s) => stops.push([s.p, 'Earlier swing low (' + (H[s.i].date || '') + ')']));
      if (lastH && lastL && lastH.i > lastL.i) { const st = sH.filter((s) => s.i < lastL.i).pop(); if (st) { const tg = lastH.p - (st.p - lastL.p); if (tg < cmp) stops.push([tg, 'Measured move (equal to the last down-leg)']); } }
      if (d.lo52 < cmp * 0.997) stops.push([d.lo52, '52-week low']);
      stops.push([e20 - 3 * atr, 'Stretch zone (3 ATR below the 20-day average)']);
    }
    const ordered = stops.filter((q) => num(q[0]) && q[0] > 0).sort((a, b) => (kind === 'down' ? b[0] - a[0] : a[0] - b[0])).filter((q, i, a) => !i || Math.abs(q[0] - a[i - 1][0]) > 0.35 * atr).slice(0, 4);
    // what a real reversal needs (live checklist)
    const chk = [];
    if (kind === 'down') {
      const rec = lastH ? lastH.p : e50; chk.push(['Closes above the 20-day average', cmp > e20], ['Closes above the last lower high ' + f2(rec), cmp > rec], ['Higher low formed', hl], ['Up-day volume ≥ 1.1× down-day volume', vr != null && vr >= 1.1], ['RSI above 50', num(rsi) && rsi > 50], ['Closes above the 50-day average ' + f2(e50), cmp > e50], ['Breakout-day volume ≥ 1.5× average', num(x.rv) && x.rv >= 1.5]);
      T.invalid = lastH ? lastH.p : e50; T.invalidTxt = 'A close above ' + f2(T.invalid) + ' (the last lower high) on rising volume would end the down-trend; until then rallies are for selling or lightening.';
    } else if (kind === 'up') {
      const hl2 = lastL ? lastL.p : e50; chk.push(['Closes below the 20-day average', cmp < e20], ['Closes below the last higher low ' + f2(hl2), cmp < hl2], ['Lower high formed', lh], ['Down-day volume ≥ 1.1× up-day volume', vr != null && vr > 0 && vr <= 0.9], ['RSI below 50', num(rsi) && rsi < 50], ['Closes below the 50-day average ' + f2(e50), cmp < e50], ['Breakdown-day volume ≥ 1.5× average', num(x.rv) && x.rv >= 1.5 && H[n - 1].c < H[n - 2].c]);
      T.invalid = fresh ? b0hi : hl2; T.invalidTxt = fresh ? 'Breakout fails on a close back below ' + f2(b0hi) + ' (the base high); the trend ends below the last higher low ' + f2(hl2) + '.' : 'A close below ' + f2(hl2) + ' (the last higher low) would break the up-trend; below the 50-day average (' + f2(e50) + ') the trend is clearly over.';
    } else {
      chk.push(['Closes above the range high ' + f2(hi20), cmp > hi20], ['Closes below the range low ' + f2(lo20), cmp < lo20], ['Up-day volume ≥ 1.15× down-day volume (accumulation)', vr != null && vr >= 1.15], ['Breakout-day volume ≥ 1.5× average', num(x.rv) && x.rv >= 1.5]);
      T.invalid = null; T.invalidTxt = 'Direction is decided by a close beyond ' + f2(hi20) + ' (up) or ' + f2(lo20) + ' (down), ideally on 1.5× volume.';
    }
    Object.assign(T, { state, tone, kind, ev, ordered, chk, hi20, lo20 });
    return T;
  }
  const TXT = {
    dead: 'A <b>dead-cat (relief) bounce</b> stays below the falling 20/50-day averages, retraces less than 50% of the fall, comes on weaker volume than the selling, and RSI stays under 50. Treat it as a place to sell or lighten, not to buy.',
    acc: 'An <b>accumulation-zone breakout</b> needs a base first: sideways trade with higher lows, tight range and heavier volume on up-days — then a close above the base high on about 1.5× volume.',
    down: 'No base has formed yet. A bounce from here is more likely a relief move than a trend change; wait for the checklist below to turn green.',
    brk: 'A breakout from a base is strongest when volume is heavy on the breakout day and the base high holds as support on any retest. A close back inside the base would make it a failed breakout.',
    up: 'Trend is intact. The usual next phases are a pause at the stop zones below, a pull-back that holds the last higher low, then another leg — or, if the checklist turns green, a trend change.',
    pull: 'A pull-back is healthy while it holds the last higher low and the 50-day average on lighter volume; heavy selling below those levels turns it into a reversal.',
    ext: 'The stock is stretched above its averages. Stretched trends can run further, but the next move is more often a pause or pull-back than a fresh surge — avoid chasing.',
    top: 'Several distribution signs (weak up-volume, RSI divergence, stretch) together warn of a top. It is not confirmed until the last higher low breaks.',
    dist: 'Sellers are quietly stronger inside the range; a close below the range low would confirm a breakdown.',
    side: 'The stock is in a range with no clear volume edge; wait for a close beyond the range, ideally on 1.5× volume.',
  };
  function trendHtml(T) {
    if (!T) return '';
    const chk = T.chk.map((c) => `<tr><td class="xr-v ${c[1] ? 'g' : 'r'}" style="width:26px">${c[1] ? '✔' : '✖'}</td><td class="xr-k" style="white-space:normal;font-weight:700">${c[0]}</td></tr>`).join('');
    const stops = T.ordered.length ? `<table class="xr-t">${T.ordered.map((s) => `<tr><td class="xr-k">${f2(s[0])}</td><td class="xr-s">${E(s[1])}</td><td class="xr-s">${sg((s[0] / T.H[T.H.length - 1].c - 1) * 100, 1)}% from last close</td></tr>`).join('')}</table>` : '<div class="xr-note">No clear levels in this direction.</div>';
    return `<div class="xr-tr ${T.tone}"><div class="xr-ts">${E(T.state)}</div><ul class="jb-ul">${T.ev.map((q) => `<li>${q}</li>`).join('')}</ul></div>
      <h5 class="xr-h5">${T.kind === 'down' ? 'Where the fall can stop (support zones, nearest first)' : T.kind === 'up' ? 'Where the rise can stall (resistance zones, nearest first)' : 'Range edges'}</h5>${T.kind === 'side' ? `<table class="xr-t"><tr><td class="xr-k">${f2(T.hi20)}</td><td class="xr-s">Range high — breakout trigger</td></tr><tr><td class="xr-k">${f2(T.lo20)}</td><td class="xr-s">Range low — breakdown trigger</td></tr></table>` : stops}
      <h5 class="xr-h5">What kind of reversal to expect</h5><div class="xr-note">${TXT[T.type] || ''}</div>
      <h5 class="xr-h5">Reversal checklist (live) — ${T.kind === 'down' ? 'down-trend turning up' : T.kind === 'up' ? 'up-trend turning down' : 'range resolving'}</h5><table class="xr-t">${chk}</table><div class="xr-note"><b>Trend verdict line:</b> ${T.invalidTxt}</div>`;
  }

  /* ---------- Why? · what next · what to do (same idea as the Why? pop-ups of the dashboard tiles) ---------- */
  function briefHtml(d) {
    const J = window.jcBrief; if (!J || !J.scenCore || d.err) return '';
    const x = d.x, cmp = d.cmp, p = d.piv, f = (v) => f2(v), nm = E(d.name || label(d.y)), atr = num(x.atr) ? x.atr : cmp * 0.015;
    const C = { fmtN: (v, dp) => f2(v, dp) };
    // ----- levels: nearest above / below, and the next meaningful one beyond
    const hi20 = num(x.hi20) ? x.hi20 : null, lo20 = num(x.lo20) ? x.lo20 : null;
    const res = [['Pivot R1', p.R1], ['Pivot R2', p.R2], ['Pivot R3', p.R3], ['CPR top', p.cprTop], ['Pivot', p.P], ['Camarilla H3', p.H3], ['Camarilla H4', p.H4], ['Previous high', x.h], ['Day high', d.dayH], ['15-min range high', d.orbH], ['VWAP', d.vwap], ['20-day high', hi20], ['52-week high', d.hi52], ['20-day EMA', x.e20], ['50-day EMA', x.e50], ['200-day EMA', x.e200]].filter((l) => num(l[1]) && l[1] > cmp * 1.001).sort((a, b) => a[1] - b[1]);
    const sup = [['Pivot S1', p.S1], ['Pivot S2', p.S2], ['Pivot S3', p.S3], ['CPR bottom', p.cprBot], ['Pivot', p.P], ['Camarilla L3', p.L3], ['Camarilla L4', p.L4], ['Previous low', x.l], ['Day low', d.dayL], ['15-min range low', d.orbL], ['VWAP', d.vwap], ['20-day low', lo20], ['52-week low', d.lo52], ['20-day EMA', x.e20], ['50-day EMA', x.e50], ['200-day EMA', x.e200]].filter((l) => num(l[1]) && l[1] < cmp * 0.999).sort((a, b) => b[1] - a[1]);
    const nr = res[0], ns = sup[0], mr = res.find((l) => nr && l[1] >= nr[1] + 0.6 * atr), ms = sup.find((l) => ns && l[1] <= ns[1] - 0.6 * atr);
    const up = x.c > x.e20 && x.e20 > x.e50, dn = x.c < x.e20 && x.e20 < x.e50, tc = up ? 1 : dn ? -1 : 0;
    const o = { px: cmp, atr, nr: nr && nr[1], nrn: nr && nr[0], ns: ns && ns[1], nsn: ns && ns[0], mr: mr && mr[1], mrn: mr && mr[0], ms: ms && ms[1], msn: ms && ms[0], tc };
    const sc = J.scenCore({ dp: 2, kind: 'idx', inv: 0 }, o, C) || [];
    // ----- why
    const W = [], pos52 = (cmp - d.lo52) / ((d.hi52 - d.lo52) || 1) * 100;
    W.push(`${nm} is <b class="${(d.chg || 0) >= 0 ? 'g' : 'r'}">${sg(d.chg)}%</b> (${sg(cmp - d.prevClose)}) ${d.live ? 'in the live session' : 'in the last session'}${num(d.r5) ? '; 5-day ' + sg(d.r5, 1) + '%' : ''}${num(d.r20) ? ', 20-day ' + sg(d.r20, 1) + '%' : ''}${num(d.r60) ? ', 60-day ' + sg(d.r60, 1) + '%' : ''}.`);
    W.push(`Trend: price is ${cmp > x.e20 ? 'above' : 'below'} the 20-day, ${cmp > x.e50 ? 'above' : 'below'} the 50-day${num(x.e200) ? ' and ' + (cmp > x.e200 ? 'above' : 'below') + ' the 200-day' : ''} average — <b>${up ? 'uptrend' : dn ? 'downtrend' : 'sideways / mixed'}</b>${up ? ' (dips have been bought)' : dn ? ' (rallies have been sold)' : ' (no clear direction)'}.`);
    if (num(x.rsi)) W.push(`Momentum: RSI ${x.rsi.toFixed(0)} — ${x.rsi >= 70 ? 'overbought, a rest or pull-back is common here' : x.rsi >= 55 ? 'positive' : x.rsi <= 30 ? 'oversold, a bounce is common but a falling stock can stay oversold' : x.rsi <= 45 ? 'weak' : 'neutral'}${num(x.adx) ? '; trend strength (ADX) ' + x.adx.toFixed(0) + ' — ' + (x.adx >= 25 ? 'strong trend, follow it' : x.adx >= 18 ? 'trend developing' : 'choppy, breakouts fail more often') : ''}.`);
    if (num(x.rv) && x.rv >= 1.3) W.push(`Volume was ${x.rv.toFixed(1)}× its 20-day average — ${x.rv >= 2 ? 'a heavy-volume move is more reliable than a quiet one' : 'above-average participation'}.`);
    const intra = []; if (num(d.vwap)) intra.push(`${cmp >= d.vwap ? 'above' : 'below'} VWAP (${f(d.vwap)}) — ${cmp >= d.vwap ? 'buyers in control of the day' : 'sellers in control of the day'}`); intra.push(cmp > p.cprTop ? 'above the CPR band' : cmp < p.cprBot ? 'below the CPR band' : 'inside the CPR band (undecided)'); if (num(d.orbH) && cmp > d.orbH) intra.push('broke above the opening 15-minute range'); else if (num(d.orbL) && cmp < d.orbL) intra.push('broke below the opening 15-minute range');
    W.push(`Today: ${intra.join('; ')}.`);
    W.push(`Year range: sitting at ${pos52.toFixed(0)}% of the 52-week range (${f(d.lo52)} – ${f(d.hi52)})${pos52 >= 95 ? ' — at a 52-week high, strong but extended' : pos52 <= 5 ? ' — at a 52-week low, weak; wait for a base' : ''}.`);
    try { const Cx = window.jdCtx && window.jdCtx(), nf = Cx && Cx.pctOf('^NSEI'), vx = Cx && Cx.S.q['^INDIAVIX']; if (!d.idx && nf != null) W.push(`Market: Nifty is ${sg(nf)}%${vx && vx.p != null ? ', India VIX ' + vx.p.toFixed(1) : ''} — the stock is moving ${((d.chg || 0) >= 0) === (nf >= 0) ? 'with' : 'against'} the market${Math.abs((d.chg || 0) - nf) >= 1.5 ? ' and ' + ((d.chg || 0) > nf ? 'out-performing' : 'under-performing') + ' it by ' + Math.abs((d.chg || 0) - nf).toFixed(1) + '% — a stock-specific reason (news, results, a sector move) is likely; check before trading it' : ''}.`); } catch (e) { }
    if (d.plan && d.plan.pts) { const t = d.plan.pts.slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3).filter((q) => q.v); if (t.length) W.push('The call engine’s strongest signals: ' + t.map((q) => E(q.label) + ' (' + E(q.txt) + ')').join(' · ') + '.'); }
    // ----- what to do
    const A = [], lv = (v) => (v == null ? '—' : f(v));
    if (tc > 0) { A.push(`<b>Holding:</b> stay with it while it holds ${lv(o.ns)}; trail the stop up under each new higher low and do not add into a vertical spike — add on a pull-back that holds support.`); A.push(`<b>No position yet:</b> wait for a dip to ${lv(o.ns)} with a bounce candle, or a close above ${lv(o.nr)}; do not chase the top of the day’s range.`); }
    else if (tc < 0) { A.push(`<b>Holding:</b> the trend is down — keep size small and treat ${lv(o.ns)} as the line; if it closes below, exit rather than average down.`); A.push(`<b>No position yet:</b> avoid bottom-fishing; better entries are a close back above ${lv(o.nr)} or a clearly failed breakdown.`); }
    else { A.push(`<b>Holding:</b> range-bound — book part near ${lv(o.nr)} and hold the rest with a stop under ${lv(o.ns)}.`); A.push(`<b>No position yet:</b> trade the edges with small size, or wait for a confirmed close beyond the range.`); }
    if (num(x.rsi) && x.rsi >= 70) A.push('<b>Overbought:</b> consider booking some profit or tightening the stop; new buying here has less cushion.'); else if (num(x.rsi) && x.rsi <= 30) A.push('<b>Oversold:</b> do not short into it blindly; a bounce is likely at some point, but wait for it to turn up first.');
    if (d.plan && d.plan.sides && d.plan.sides.length) A.push(`<b>Day-trading call:</b> see the call box below — it uses the same engine as Today’s Calls, so both always agree.`);
    A.push('<b>Position size:</b> risk a fixed small share of capital per trade (distance from entry to stop-loss × quantity), and move the stop only in the direction of the trade.');
    const sch = sc.map((s) => { const l = s.lv ? '<table class="jb-lv">' + s.lv.map((r) => `<tr><td>${E(r[0])}</td><td>${E(r[1])}</td></tr>`).join('') + '</table>' : ''; return `<div class="jb-sc ${s.c}"><h5>${E(s.h)}</h5>${l}<p>${s.t}</p></div>`; }).join('');
    return `<section class="xr-wide xr-why"><h4>Why is it moving? · what next · what to do</h4>
      <h4 class="jb-h" style="margin-top:6px">1 · Why is it behaving like this?</h4><ul class="jb-ul">${W.map((q) => `<li>${q}</li>`).join('')}</ul>
      <h4 class="jb-h">2 · What can come next — how far this trend can run, and what kind of reversal to expect</h4>${trendHtml(trendData(d))}<h4 class="jb-h" style="margin-top:12px">Trade levels — breakout, breakdown and reversal zones with stops</h4>${sch || '<div class="xr-note">Levels unavailable.</div>'}<div class="xr-note">Stops sit about ⅓–½ of the stock’s average daily range (${f(atr)}) beyond the level. Levels: pivots, CPR, Camarilla, previous and day high/low, 15-minute range, VWAP, 20-day and 52-week extremes, 20/50/200-day averages.</div>
      <h4 class="jb-h">3 · How to handle positions</h4><ul class="jb-ul">${A.map((q) => `<li>${q}</li>`).join('')}</ul>
      <div class="xr-note"><b>Please read:</b> a rule-based reading of delayed data — not investment advice or a forecast; levels can fail. Decide your own size and stops, or consult a registered adviser.</div></section>`;
  }
  function render(d) {
    if (d.err) return `<div class="xr-err">${E(d.err)}</div>`;
    const x = d.x, up = (d.chg || 0) >= 0, rng52 = d.hi52 - d.lo52 || 1, pos52 = Math.max(0, Math.min(100, ((d.cmp - d.lo52) / rng52) * 100));
    const tone = (c, v) => (c ? 'g' : v ? 'r' : '');
    const ma = (n, v) => row(`${n} EMA`, f2(v), num(v) ? (d.cmp > v ? 'price above' : 'price below') + ' · ' + sg((d.cmp / v - 1) * 100) + '%' : 'n/a', num(v) ? (d.cmp > v ? 'g' : 'r') : '');
    const snap = `<table class="xr-t">${row('Open / High / Low (today)', `${f2(d.dayO)} / ${f2(d.dayH)} / ${f2(d.dayL)}`, d.live ? 'live session' : 'last session')}${row('Previous close', f2(d.prevClose))}${row('VWAP', f2(d.vwap), num(d.vwap) ? (d.cmp >= d.vwap ? 'LTP above VWAP' : 'LTP below VWAP') : 'no intraday volume', num(d.vwap) ? (d.cmp >= d.vwap ? 'g' : 'r') : '')}${row('15-min opening range', `${f2(d.orbL)} – ${f2(d.orbH)}`, num(d.orbH) ? (d.cmp > d.orbH ? 'broken UP' : d.cmp < d.orbL ? 'broken DOWN' : 'inside range') : '', num(d.orbH) ? (d.cmp > d.orbH ? 'g' : d.cmp < d.orbL ? 'r' : '') : '')}${row('1W / 1M / 3M return', `${sg(d.r5, 1)}% / ${sg(d.r20, 1)}% / ${sg(d.r60, 1)}%`)}</table>
      <div class="xr-52"><span>52W low ${f2(d.lo52)}</span><div class="xr-bar"><i style="left:${pos52.toFixed(1)}%"></i></div><span>52W high ${f2(d.hi52)}</span></div>`;
    const ind = `<table class="xr-t">${ma(20, x.e20)}${ma(50, x.e50)}${ma(200, x.e200)}${row('RSI (14)', num(x.rsi) ? x.rsi.toFixed(1) : '—', x.rsi >= 70 ? 'overbought' : x.rsi <= 30 ? 'oversold' : x.rsi >= 55 ? 'bullish' : x.rsi <= 45 ? 'bearish' : 'neutral', x.rsi >= 55 && x.rsi < 70 ? 'g' : x.rsi <= 45 && x.rsi > 30 ? 'r' : '')}${row('MACD histogram', num(x.mh) ? sg(x.mh, 2) : '—', num(x.mh) ? (x.mh > 0 ? 'positive' : 'negative') + (num(x.mhPrev) ? (x.mh > x.mhPrev ? ' · rising' : ' · falling') : '') : '', tone(x.mh > 0, x.mh < 0))}${row('ADX · +DI · −DI', num(x.adx) ? `${x.adx.toFixed(0)} · ${x.pdi.toFixed(0)} · ${x.mdi.toFixed(0)}` : '—', num(x.adx) ? (x.adx >= 25 ? 'strong trend' : x.adx >= 18 ? 'developing' : 'no trend') : '', num(x.adx) ? (x.adx >= 25 ? (x.pdi > x.mdi ? 'g' : 'r') : '') : '')}${row('ATR (14)', f2(x.atr), num(x.atr) ? (x.atr / x.c * 100).toFixed(2) + '% of price — typical daily range' : '')}${d.idx ? '' : row('Volume vs 20-day avg', num(d.vol20) ? d.vol20.toFixed(2) + '×' : '—', num(d.vol20) ? (d.vol20 >= 1.3 ? 'heavy' : d.vol20 < 0.7 ? 'thin' : 'normal') : '')}</table>`;
    return `<div class="xr-top"><div class="xr-px"><b>${f2(d.cmp)}</b><span class="${up ? 'g' : 'r'}">${sg(d.cmp - d.prevClose)} (${sg(d.chg)}%)</span></div><div class="xr-chips">${verdict(d)}</div><div class="xr-meta">${d.live ? '<i class="xr-live"></i>LIVE' : 'Last session'} · updated ${new Date(d.at).toLocaleTimeString('en-IN')} · Yahoo data, delayed</div></div>
    <div class="xr-grid">${briefHtml(d)}<section><h4>Today · snapshot</h4>${snap}</section><section><h4>Trend &amp; momentum</h4>${ind}</section>
    <section class="xr-wide"><h4>Daily chart · 90 sessions <small><b style="color:#e08a00">— 20</b> <b style="color:#2b59c3">— 50</b> <b style="color:#7a4db5">— 200</b> EMA</small></h4>${candles(d.hist, d.I, 90)}</section>
    <section class="xr-wide"><h4>Intraday · 5-minute ${num(d.vwap) ? '<small><b style="color:#7a4db5">- - VWAP</b></small>' : ''}</h4>${intraday(d.sbars, d.vwap)}</section>
    <section><h4>Levels · pivot · CPR · Camarilla</h4>${ladder(d)}</section><section><h4>${d.idx ? 'Read-through' : 'Day-trading call · next / current session'}</h4>${planHtml(d)}</section></div>
    <div class="xr-foot">Rule-based analysis of delayed market data — research input, not investment advice. Levels come from the previous session; the call needs several parameters to agree (trend, ADX, RSI, MACD, volume, CPR, 20-day range, Nifty/VIX regime).</div>`;
  }

  /* ---------- overlay ---------- */
  const CSS = `
  #jcxr{position:fixed;inset:0;z-index:99999;background:rgba(8,16,40,.62);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;backdrop-filter:blur(2px)}
  #jcxr.on{display:flex}.xr-box{background:#f3f6fc;border-radius:16px;width:min(1100px,100%);box-shadow:0 20px 60px rgba(0,0,0,.45);overflow:hidden;color:#0a1430;font:13px/1.4 'Segoe UI',-apple-system,Roboto,sans-serif}
  .xr-hd{background:linear-gradient(120deg,#17388a,#0b1d4d);color:#fff;padding:12px 18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.xr-hd h3{margin:0;font-size:19px;letter-spacing:.3px}.xr-hd small{opacity:.8;font-weight:600}.xr-hd .sp{flex:1}
  .xr-hd button{border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.12);color:#fff;border-radius:8px;padding:5px 11px;font-weight:800;font-size:12px;cursor:pointer}.xr-hd button:hover{background:rgba(255,255,255,.28)}
  .xr-body{padding:14px 18px 16px}.xr-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px}.xr-px b{font:900 30px ui-monospace,Consolas,monospace}.xr-px span{margin-left:10px;font-weight:800;font-size:15px}
  .g{color:#08783a}.r{color:#c0102e}.a{color:#a86a00}.xr-chips{display:flex;gap:6px;flex-wrap:wrap}.xr-chip{font-size:10.5px;font-weight:900;letter-spacing:.4px;padding:3px 9px;border-radius:99px;background:#e6ebf7;color:#34456a}.xr-chip.g{background:#c9f0da;color:#06612f}.xr-chip.r{background:#fbd0d8;color:#a10b27}.xr-chip.a{background:#fbe9c0;color:#7a4e00}
  .xr-meta{margin-left:auto;font-size:11px;color:#34456a;font-weight:700}.xr-live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#12b866;margin-right:5px;animation:xrp 1.2s infinite}@keyframes xrp{50%{opacity:.25}}
  .xr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.xr-grid section{background:#fff;border:1px solid #c9d3e8;border-radius:12px;padding:9px 12px;box-shadow:0 1px 5px rgba(20,48,110,.08);min-width:0}.xr-grid .xr-wide{grid-column:1/-1}
  .xr-grid h4{margin:0 0 6px;font-size:12.5px;color:#0b2260;letter-spacing:.3px;border-bottom:2px solid #dfe7f6;padding-bottom:4px}.xr-grid h4 small{font-weight:700;color:#34456a}
  .xr-t{width:100%;border-collapse:collapse;font-size:12px}.xr-t td{padding:3.5px 3px;border-bottom:1px solid #e8edf8}.xr-t tr:last-child td{border-bottom:0}.xr-k{font-weight:800;color:#24365e;white-space:nowrap;text-align:left}.xr-s{text-align:left}.xr-v{text-align:right;font:800 12.5px ui-monospace,Consolas,monospace}.xr-s{color:#34456a;font-size:11px;padding-left:8px}.xr-s.g{color:#08783a;font-weight:800}.xr-s.r{color:#c0102e;font-weight:800}
  .xr-ltp td{background:#fff3c4;font-weight:900}.xr-svg{width:100%;height:auto;display:block;background:#fbfcff;border-radius:8px}
  .xr-52{display:flex;align-items:center;gap:8px;font-size:10.5px;color:#34456a;font-weight:800;margin-top:8px}.xr-bar{flex:1;height:7px;border-radius:4px;background:linear-gradient(90deg,#c0102e,#e9bd2d,#08783a);position:relative}.xr-bar i{position:absolute;top:-4px;width:3px;height:15px;background:#0a1430;border-radius:2px}
  .xr-call{border-radius:10px;padding:9px 11px;margin-bottom:8px}.xr-call.g{background:#e3f6ec}.xr-call.r{background:#fde6ea}.xr-cs{font-weight:900;font-size:17px}.xr-cs small{font-size:11px;color:#34456a;margin-left:6px}.xr-cg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:6px}.xr-cg div{background:#fff;border-radius:8px;padding:5px 7px}.xr-cg i{display:block;font-style:normal;font-size:9.5px;letter-spacing:.7px;text-transform:uppercase;color:#34456a;font-weight:800}.xr-cg b{display:block;font:900 14px ui-monospace,Consolas,monospace}.xr-cg small{display:block;font-size:9.5px;color:#34456a}
  .xr-nocall{background:#eef1f8;border-radius:10px;padding:10px 12px;margin-bottom:8px}.xr-nocall b{display:block;font-size:15px;color:#34456a}.xr-nocall span{font-size:11.5px;color:#34456a}.xr-note,.xr-na,.xr-foot{font-size:11px;color:#34456a;padding:6px 2px}.xr-foot{margin-top:8px}.xr-err{padding:30px;text-align:center;color:#c0102e;font-weight:800}.xr-ld{padding:50px;text-align:center;color:#34456a;font-weight:800}
  .xr-pts .xr-v{width:44px}
  .xr-tr{border-radius:10px;padding:8px 12px;margin-bottom:6px;border:1px solid #dbe3f4;border-left:6px solid #8a96b5;background:#f8faff}.xr-tr.g{border-left-color:#12a05a}.xr-tr.r{border-left-color:#e03a3a}.xr-tr.a{border-left-color:#e0a30a}.xr-ts{font-weight:900;font-size:14px;color:#0b1330;margin-bottom:3px}.xr-h5{margin:10px 0 4px;font-size:11.5px;letter-spacing:.04em;color:#14306e}
  .xrbtn,.jd-xr{border:1px solid #b8c6e6;background:#eef3ff;color:#14306e;border-radius:6px;font-size:9.5px;font-weight:900;padding:1px 6px;margin-left:5px;cursor:pointer;letter-spacing:.4px;line-height:1.5}.xrbtn:hover,.jd-xr:hover{background:#14306e;color:#fff}.jd-xr{padding:0 4px;font-size:8.5px;margin-left:4px;opacity:.85}
  @media(max-width:760px){.xr-grid{grid-template-columns:1fr}.xr-cg{grid-template-columns:repeat(2,minmax(0,1fr))}.xr-px b{font-size:24px}.xr-meta{margin-left:0}}
  @media print{body.xr-printing>*:not(#jcxr){display:none!important}body.xr-printing{overflow:visible!important;background:#fff!important}body.xr-printing #jcxr{position:static!important;display:block!important;background:none!important;padding:0!important;overflow:visible!important;backdrop-filter:none!important}
    body.xr-printing .xr-box{box-shadow:none!important;width:100%!important;border-radius:0!important;background:#fff!important}body.xr-printing .xr-hd button{display:none!important}body.xr-printing .xr-hd,body.xr-printing .xr-chip,body.xr-printing .xr-call,body.xr-printing .jb-sc,body.xr-printing .xr-tr{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body.xr-printing .jb-sc,body.xr-printing .xr-tr,body.xr-printing .xr-t tr,body.xr-printing .xr-call{break-inside:avoid}body.xr-printing .xr-grid section{break-inside:auto!important;page-break-inside:auto!important;margin-bottom:6px}body.xr-printing .xr-grid{display:block!important;column-count:1}body.xr-printing .xr-hd,body.xr-printing .xr-grid section>:first-child{break-after:avoid}body.xr-printing .xr-box *{max-height:none!important}body:not(.xr-printing) #jcxr{display:none!important}}`;

  function ensure() {
    if ($('jcxr')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const o = document.createElement('div'); o.id = 'jcxr'; o.innerHTML = '<div class="xr-box"><div class="xr-hd"><h3 id="xrT">X-ray</h3><small id="xrS"></small><span class="sp"></span><button id="xrRef" title="Refresh now">⟳ Refresh</button><button id="xrPdf" title="Print or save this X-ray as a PDF">🖨 PDF</button><button id="xrRep" title="Open the full Stock Analyst report">Full report</button><button id="xrX" title="Close (Esc)">✕ Close</button></div><div class="xr-body" id="xrB"></div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o) close(); });
    $('xrPdf').onclick = printXr; $('xrX').onclick = close; $('xrRef').onclick = () => run(true); $('xrRep').onclick = () => { const s = X.sym; close(); if (s && !isIndexLike(s) && typeof loadSymbol === 'function') loadSymbol(s); else alert('The full Stock Analyst report is for stocks — use the X-ray for indices.'); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && o.classList.contains('on')) close(); });
  }

  /* print / save as PDF: only the X-ray is printed (everything else on the page is hidden while printing) */
  function printXr() {
    const o = $('jcxr'); if (!o || !o.classList.contains('on')) return; const old = document.title, t = ($('xrT') ? $('xrT').textContent : 'X-ray').replace(/[^\w .&-]/g, ''), d = new Date(Date.now() + 19800000).toISOString().slice(0, 16).replace('T', ' ');
    document.title = t + ' X-ray ' + d + ' IST'; document.body.classList.add('xr-printing');
    const done = () => { document.body.classList.remove('xr-printing'); document.title = old; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(() => window.print(), 80); setTimeout(done, 60000);
  }
  function close() { clearInterval(X.timer); X.timer = null; const o = $('jcxr'); if (o) o.classList.remove('on'); document.body.style.overflow = ''; }
  /* shared progress meter: every "processing" screen shows an estimated % (eases to 92 %, jumps to 100 % when the data is in) */
  window.jcProgress = function (host, label, floating) {
    const id = 'jcp' + Math.round(Math.random() * 1e6), css = '<style>.jcp{background:#fffdf6;border:2px solid #D4AF37;border-radius:14px;padding:14px 16px;color:#14213d;font:600 14px system-ui,sans-serif;box-shadow:0 10px 30px -12px rgba(0,0,0,.5)}.jcp-t{display:flex;justify-content:space-between;align-items:baseline;gap:10px}.jcp-t span{font-size:22px;font-weight:800;color:#14306e;font-variant-numeric:tabular-nums}.jcp-b{height:10px;border-radius:6px;background:#e8ecf6;overflow:hidden;margin:10px 0 6px}.jcp-b i{display:block;height:100%;width:0;background:linear-gradient(90deg,#D4AF37,#f4dc8d);border-radius:6px;transition:width .3s}.jcp small{color:#52607f;font-weight:600}.jcpF{position:fixed;left:50%;top:18%;transform:translateX(-50%);width:min(92vw,420px);z-index:99998}</style>';
    let box = host; if (floating) { box = document.createElement('div'); box.className = 'jcpF'; document.body.appendChild(box); }
    box.innerHTML = css + '<div class="jcp" id="' + id + '"><div class="jcp-t"><b>' + E(label) + '</b><span>0%</span></div><div class="jcp-b"><i></i></div><small>Please wait — estimated progress, stays on this screen until ready.</small></div>';
    const t0 = Date.now(); let p = 0; const set = (v) => { p = v; const r = document.getElementById(id); if (!r) return; r.querySelector('span').textContent = Math.round(v) + '%'; r.querySelector('i').style.width = v + '%'; };
    const iv = setInterval(() => { set(Math.max(p, 92 * (1 - Math.exp(-(Date.now() - t0) / 8000)))); }, 250);
    return { done() { clearInterval(iv); set(100); if (floating) setTimeout(() => box.remove(), 350); }, fail() { clearInterval(iv); if (floating) box.remove(); } };
  };
  async function run(manual) {
    const tok = ++X.token, y = X.sym; if (!y) return;
    if (!X.data || X.data.y !== y) $('xrB').innerHTML = '';
    const pg = (!X.data || X.data.y !== y) ? window.jcProgress($('xrB'), 'Building X-ray for ' + label(y), false) : null;
    try { const d = await load(y); if (tok !== X.token) return; if (pg) pg.done(); X.data = d; $('xrT').textContent = (d.name || label(y)); $('xrS').textContent = y + (d.cur ? ' · ' + d.cur : ''); $('xrB').innerHTML = render(d); }
    catch (e) { if (pg) pg.fail(); if (tok !== X.token) return; $('xrB').innerHTML = '<div class="xr-err">X-ray failed for ' + E(y) + ': ' + E((e && e.message) || e) + '</div>'; }
  }
  window.jcXrayApi = { load, trendData, norm };
  window.jcXray = function (sym) {
    const y = norm(sym); if (!y || y === '.NS') return; ensure(); X.sym = y; X.data = null; $('xrT').textContent = label(y); $('xrS').textContent = y; $('jcxr').classList.add('on'); document.body.style.overflow = 'hidden'; $('jcxr').scrollTop = 0;
    run(false); clearInterval(X.timer); X.timer = setInterval(() => { if (document.hidden || !$('jcxr').classList.contains('on')) return; if (X.data && X.data.live) run(false); }, 45000);
  };

  /* ---------- buttons everywhere ---------- */
  /* A press that starts on an X-ray control opens it on release, even if the control moved or was redrawn
     in between (3D-tilt tiles, the dashboard's periodic repaint) — browsers drop the 'click' in those cases.
     Touch/pen keep using the normal click so scrolling a list never opens anything by accident. */
  let xrDown = null, xrOpenedAt = 0;
  // Where a control sits when its tilting tile is flat (offsets ignore CSS transforms).
  function restingHit(e) {
    const tile = e.target.closest && e.target.closest('.j3'); if (!tile) return null;
    const r = tile.getBoundingClientRect();
    for (const b of tile.querySelectorAll('[data-xr]')) {
      let x = 0, y = 0, n = b;
      while (n && n !== tile) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      if (n !== tile) continue;
      const px = e.clientX - r.left, py = e.clientY - r.top, pad = 6;
      if (px >= x - pad && px <= x + b.offsetWidth + pad && py >= y - pad && py <= y + b.offsetHeight + pad) return b;
    }
    return null;
  }
  document.addEventListener('pointerdown', (e) => {
    const b = e.pointerType === 'mouse' && e.button === 0 && e.target.closest && (e.target.closest('[data-xr]') || restingHit(e));
    xrDown = b ? { sym: b.getAttribute('data-xr'), x: e.clientX, y: e.clientY, t: Date.now() } : null;
  }, true);
  document.addEventListener('pointerup', (e) => {
    const d = xrDown; xrDown = null;
    if (!d || e.pointerType !== 'mouse' || e.button !== 0) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12 || Date.now() - d.t > 1500) return;
    xrOpenedAt = Date.now(); window.jcXray(d.sym);
  }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-xr]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (Date.now() - xrOpenedAt < 700) return; // already opened on pointerup
    window.jcXray(b.getAttribute('data-xr'));
  }, true);
  function decorate(root) {
    (root || document).querySelectorAll('a.symlink').forEach((a) => {
      if (a.dataset.xrd) return; a.dataset.xrd = '1';
      const m = /loadSymbol\('([^']+)'\)/.exec(a.getAttribute('onclick') || ''); if (!m) return;
      const nx = a.nextElementSibling; if (nx && (nx.classList.contains('xrbtn') || nx.hasAttribute('data-xr'))) return;
      const b = document.createElement('button'); b.className = 'xrbtn'; b.type = 'button'; b.textContent = 'X-ray'; b.title = 'Live X-ray'; b.setAttribute('data-xr', m[1]); a.insertAdjacentElement('afterend', b);
    });
  }
  function addTopButton() {
    const go = document.querySelector('button.goBtn, #goBtn, button[onclick*="runAnalysis"]'); if (!go || $('xrTop')) return;
    const b = document.createElement('button'); b.id = 'xrTop'; b.type = 'button'; b.className = 'ghostBtn'; b.textContent = 'X-ray'; b.title = 'Live X-ray of the symbol typed here'; b.style.marginLeft = '6px';
    b.onclick = () => { const s = $('symbolInput') ? $('symbolInput').value.trim() : ''; const ex = $('exchangeInput') ? $('exchangeInput').value : 'NS'; if (!s) { alert('Type a symbol first.'); return; } window.jcXray(/\.(NS|BO)$/.test(s.toUpperCase()) || /^[\^]/.test(s) ? s : (ex === 'BO' ? 'BSE:' : '') + s); };
    go.insertAdjacentElement('afterend', b);
  }
  function init() { ensure(); decorate(); addTopButton(); new MutationObserver((ml) => { for (const m of ml) { if (m.addedNodes.length) { decorate(); break; } } }).observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
