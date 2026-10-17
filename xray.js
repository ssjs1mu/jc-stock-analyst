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
  function render(d) {
    if (d.err) return `<div class="xr-err">${E(d.err)}</div>`;
    const x = d.x, up = (d.chg || 0) >= 0, rng52 = d.hi52 - d.lo52 || 1, pos52 = Math.max(0, Math.min(100, ((d.cmp - d.lo52) / rng52) * 100));
    const tone = (c, v) => (c ? 'g' : v ? 'r' : '');
    const ma = (n, v) => row(`${n} EMA`, f2(v), num(v) ? (d.cmp > v ? 'price above' : 'price below') + ' · ' + sg((d.cmp / v - 1) * 100) + '%' : 'n/a', num(v) ? (d.cmp > v ? 'g' : 'r') : '');
    const snap = `<table class="xr-t">${row('Open / High / Low (today)', `${f2(d.dayO)} / ${f2(d.dayH)} / ${f2(d.dayL)}`, d.live ? 'live session' : 'last session')}${row('Previous close', f2(d.prevClose))}${row('VWAP', f2(d.vwap), num(d.vwap) ? (d.cmp >= d.vwap ? 'LTP above VWAP' : 'LTP below VWAP') : 'no intraday volume', num(d.vwap) ? (d.cmp >= d.vwap ? 'g' : 'r') : '')}${row('15-min opening range', `${f2(d.orbL)} – ${f2(d.orbH)}`, num(d.orbH) ? (d.cmp > d.orbH ? 'broken UP' : d.cmp < d.orbL ? 'broken DOWN' : 'inside range') : '', num(d.orbH) ? (d.cmp > d.orbH ? 'g' : d.cmp < d.orbL ? 'r' : '') : '')}${row('1W / 1M / 3M return', `${sg(d.r5, 1)}% / ${sg(d.r20, 1)}% / ${sg(d.r60, 1)}%`)}</table>
      <div class="xr-52"><span>52W low ${f2(d.lo52)}</span><div class="xr-bar"><i style="left:${pos52.toFixed(1)}%"></i></div><span>52W high ${f2(d.hi52)}</span></div>`;
    const ind = `<table class="xr-t">${ma(20, x.e20)}${ma(50, x.e50)}${ma(200, x.e200)}${row('RSI (14)', num(x.rsi) ? x.rsi.toFixed(1) : '—', x.rsi >= 70 ? 'overbought' : x.rsi <= 30 ? 'oversold' : x.rsi >= 55 ? 'bullish' : x.rsi <= 45 ? 'bearish' : 'neutral', x.rsi >= 55 && x.rsi < 70 ? 'g' : x.rsi <= 45 && x.rsi > 30 ? 'r' : '')}${row('MACD histogram', num(x.mh) ? sg(x.mh, 2) : '—', num(x.mh) ? (x.mh > 0 ? 'positive' : 'negative') + (num(x.mhPrev) ? (x.mh > x.mhPrev ? ' · rising' : ' · falling') : '') : '', tone(x.mh > 0, x.mh < 0))}${row('ADX · +DI · −DI', num(x.adx) ? `${x.adx.toFixed(0)} · ${x.pdi.toFixed(0)} · ${x.mdi.toFixed(0)}` : '—', num(x.adx) ? (x.adx >= 25 ? 'strong trend' : x.adx >= 18 ? 'developing' : 'no trend') : '', num(x.adx) ? (x.adx >= 25 ? (x.pdi > x.mdi ? 'g' : 'r') : '') : '')}${row('ATR (14)', f2(x.atr), num(x.atr) ? (x.atr / x.c * 100).toFixed(2) + '% of price — typical daily range' : '')}${d.idx ? '' : row('Volume vs 20-day avg', num(d.vol20) ? d.vol20.toFixed(2) + '×' : '—', num(d.vol20) ? (d.vol20 >= 1.3 ? 'heavy' : d.vol20 < 0.7 ? 'thin' : 'normal') : '')}</table>`;
    return `<div class="xr-top"><div class="xr-px"><b>${f2(d.cmp)}</b><span class="${up ? 'g' : 'r'}">${sg(d.cmp - d.prevClose)} (${sg(d.chg)}%)</span></div><div class="xr-chips">${verdict(d)}</div><div class="xr-meta">${d.live ? '<i class="xr-live"></i>LIVE' : 'Last session'} · updated ${new Date(d.at).toLocaleTimeString('en-IN')} · Yahoo data, delayed</div></div>
    <div class="xr-grid"><section><h4>Today · snapshot</h4>${snap}</section><section><h4>Trend &amp; momentum</h4>${ind}</section>
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
  .xrbtn,.jd-xr{border:1px solid #b8c6e6;background:#eef3ff;color:#14306e;border-radius:6px;font-size:9.5px;font-weight:900;padding:1px 6px;margin-left:5px;cursor:pointer;letter-spacing:.4px;line-height:1.5}.xrbtn:hover,.jd-xr:hover{background:#14306e;color:#fff}.jd-xr{padding:0 4px;font-size:8.5px;margin-left:4px;opacity:.85}
  @media(max-width:760px){.xr-grid{grid-template-columns:1fr}.xr-cg{grid-template-columns:repeat(2,minmax(0,1fr))}.xr-px b{font-size:24px}.xr-meta{margin-left:0}}
  @media print{#jcxr{display:none!important}}`;

  function ensure() {
    if ($('jcxr')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const o = document.createElement('div'); o.id = 'jcxr'; o.innerHTML = '<div class="xr-box"><div class="xr-hd"><h3 id="xrT">X-ray</h3><small id="xrS"></small><span class="sp"></span><button id="xrRef" title="Refresh now">⟳ Refresh</button><button id="xrRep" title="Open the full Stock Analyst report">Full report</button><button id="xrX" title="Close (Esc)">✕ Close</button></div><div class="xr-body" id="xrB"></div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o) close(); });
    $('xrX').onclick = close; $('xrRef').onclick = () => run(true); $('xrRep').onclick = () => { const s = X.sym; close(); if (s && !isIndexLike(s) && typeof loadSymbol === 'function') loadSymbol(s); else alert('The full Stock Analyst report is for stocks — use the X-ray for indices.'); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && o.classList.contains('on')) close(); });
  }
  function close() { clearInterval(X.timer); X.timer = null; const o = $('jcxr'); if (o) o.classList.remove('on'); document.body.style.overflow = ''; }
  async function run(manual) {
    const tok = ++X.token, y = X.sym; if (!y) return;
    if (!X.data || X.data.y !== y) $('xrB').innerHTML = '<div class="xr-ld">Fetching live data for ' + E(label(y)) + '…</div>';
    try { const d = await load(y); if (tok !== X.token) return; X.data = d; $('xrT').textContent = (d.name || label(y)); $('xrS').textContent = y + (d.cur ? ' · ' + d.cur : ''); $('xrB').innerHTML = render(d); }
    catch (e) { if (tok !== X.token) return; $('xrB').innerHTML = '<div class="xr-err">X-ray failed for ' + E(y) + ': ' + E((e && e.message) || e) + '</div>'; }
  }
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
