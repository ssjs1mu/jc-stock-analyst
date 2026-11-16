/* Joshi's Corner — Client Stock View: type any NSE/BSE symbol, get a one-glance infographic report for a client (price card, why it moved, indicator gauges,
   Fibonacci key-levels ladder, bull/base/bear map and a reversal-confirmation tracker) on the Joshi's Corner letterhead; "Print / Save PDF" gives the A4 file.
   Built in this browser from the same delayed Yahoo data and the same engine as X-ray (jcXrayApi.load) — nothing is stored or sent anywhere.
   Rule-based research input — not investment advice and not a guaranteed outcome. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v, d) => (num(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '—');
  const sg = (v, d) => (num(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 2 : d) : '—');
  const R0 = (v) => '₹' + f2(v, 0), R2 = (v) => '₹' + f2(v, 2);
  const ist = () => new Date(Date.now() + 19800000);
  const stamp = () => { const d = ist(), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], h = d.getUTCHours(), m = d.getUTCMinutes(); return d.getUTCDate() + ' ' + M[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ' | ' + ((h + 11) % 12 + 1) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM') + ' IST'; };
  const dlab = (s) => { if (!s) return ''; const d = new Date(s + 'T00:00:00Z'), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; return W[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + M[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const sma = (H, n) => (H.length >= n ? H.slice(-n).reduce((a, b) => a + b.c, 0) / n : null);
  const G = '#12B76A', Rd = '#E5484D', NAVY = '#0B1F4B', GOLD = '#F5C242';

  const CSS = `
  .cv{font-family:'Segoe UI',Arial,sans-serif;color:#1F2937;max-width:780px;margin:0 auto;background:#fff}
  .cv *{box-sizing:border-box}
  .cv .hd{background:#000;border-radius:8px 8px 0 0;overflow:hidden}.cv .hd img{display:block;height:150px;width:auto;max-width:100%;margin:0 auto}
  .cv .tt{text-align:center;margin:10px 0 2px;font-size:22px;font-weight:800;color:#2b59c3}
  .cv .st{text-align:center;color:#d97706;font-size:12.5px;margin-bottom:6px}
  .cv .nt{font-size:11px;color:#6B7280;font-style:italic;margin:4px 2px 8px}
  .cv h3{color:#B8860B;font-size:15px;margin:14px 0 6px;letter-spacing:.3px;border-bottom:2px solid ${GOLD};padding-bottom:3px;break-after:avoid}
  .cv .hero{background:linear-gradient(135deg,#0B1F4B,#1B6FD1);color:#fff;border-radius:12px;padding:12px 14px;display:grid;grid-template-columns:1.3fr 2fr;gap:12px;align-items:center}
  .cv .hero small{color:${GOLD};font-weight:700;font-size:10.5px;letter-spacing:.4px}
  .cv .px{font-size:32px;font-weight:800;line-height:1.1;margin:4px 0}
  .cv .pill{display:inline-block;padding:3px 10px;border-radius:7px;font-weight:700;font-size:12px}.cv .pill.g{background:${G}}.cv .pill.r{background:${Rd}}
  .cv .chips{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.cv .chips div{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:6px 4px;text-align:center}
  .cv .chips i{display:block;font-style:normal;font-size:9px;opacity:.8}.cv .chips b{font-size:12.5px}
  .cv .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}.cv .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
  .cv .card{border-radius:10px;padding:9px 10px;border:1px solid #e5e7eb;break-inside:avoid}
  .cv .card h5{margin:0 0 3px;font-size:9.5px;letter-spacing:.5px;color:#374151}.cv .card b.big{font-size:18px}.cv .card p{margin:3px 0 0;font-size:10.5px;color:#4B5563;line-height:1.35}
  .cv .bar{height:8px;border-radius:5px;background:linear-gradient(90deg,${Rd},#F5C242,${G});position:relative;margin:14px 0 4px}.cv .bar u{position:absolute;top:-6px;width:3px;height:20px;background:${NAVY};border-radius:2px}
  .cv .barl{display:flex;justify-content:space-between;font-size:9.5px;color:#6B7280}
  .cv .gc{background:linear-gradient(135deg,var(--a),var(--b));color:#fff;border-radius:12px;padding:10px 12px;break-inside:avoid}.cv .gc small{color:#FDE68A;font-weight:700;font-size:9.5px;letter-spacing:.4px}
  .cv .gc b{display:block;font-size:20px;margin:3px 0}.cv .gc span{font-size:10.5px;opacity:.95;line-height:1.35;display:block}
  .cv ul{margin:6px 0 0;padding-left:0;list-style:none}.cv li{font-size:12px;line-height:1.45;margin:3px 0;padding-left:10px;border-left:3px solid ${GOLD}}
  .cv .gau{background:#F8FAFC;border:1px solid #e5e7eb;border-radius:10px;padding:8px;break-inside:avoid}.cv .gau svg{width:100%;height:auto;display:block}
  .cv .gau p{margin:0;text-align:center;font-size:10px;color:#4B5563}.cv .gau b{display:block;text-align:center;font-size:11px;color:#111}
  .cv .ma{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:8px}.cv .ma div{border-radius:8px;color:#fff;text-align:center;padding:6px 2px;font-size:10px}.cv .ma b{display:block;font-size:12px}
  .cv table{width:100%;border-collapse:collapse;font-size:11.5px;break-inside:avoid}.cv td,.cv th{padding:4px 8px;border-bottom:1px solid #f1f5f9;text-align:left}.cv th{font-size:10px;color:#6B7280}
  .cv tr.res td{background:#FDECEC}.cv tr.sup td{background:#E8F6EE}.cv tr.ltp td{background:linear-gradient(90deg,${NAVY},#1B6FD1);color:#fff;font-weight:800}.cv td.pr{text-align:right;font-weight:700}
  .cv .trk{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px;background:#FFFBEB;border:1.5px solid ${GOLD};border-radius:12px;padding:8px}
  .cv .trk div{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px;font-size:11px;display:flex;gap:7px;align-items:center}.cv .trk i{font-style:normal;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:800;flex:none}
  .cv .trk i.n{background:#FEE2E2;color:${Rd};border:1.5px solid ${Rd}}.cv .trk i.y{background:#DCFCE7;color:#15803d;border:1.5px solid #15803d}.cv .trk small{display:block;color:#6B7280;font-size:9.5px}
  .cv .sum{grid-column:1/-1;background:linear-gradient(90deg,${NAVY},#1B6FD1);color:#fff;border-radius:8px;text-align:center;font-weight:700;font-size:11px;padding:7px;display:block}
  .cv .disc{margin-top:12px;border-top:1.5px solid ${GOLD};padding-top:4px;color:#b91c1c;font-style:italic;font-size:11px}
  .cv .ft{background:#000;color:#fff;text-align:center;font-weight:700;font-size:12px;padding:7px;border-radius:0 0 8px 8px;margin-top:10px}
  @media(max-width:620px){.cv .hero,.cv .g3,.cv .trk{grid-template-columns:1fr}.cv .g4{grid-template-columns:1fr 1fr}.cv .ma{grid-template-columns:repeat(3,1fr)}}`;

  function gauge(v, lo, hi, zones, label, cap1, cap2) {
    const cx = 100, cy = 92, r = 70, ang = (p) => Math.PI * (1 - (p - lo) / (hi - lo)), pt = (p, rr) => [cx + rr * Math.cos(ang(p)), cy - rr * Math.sin(ang(p))];
    const arc = (a, b, col) => { const A = pt(a, r), B = pt(b, r); return `<path d="M${A[0].toFixed(1)} ${A[1].toFixed(1)} A${r} ${r} 0 0 1 ${B[0].toFixed(1)} ${B[1].toFixed(1)}" stroke="${col}" stroke-width="16" fill="none"/>`; };
    const vv = Math.max(lo, Math.min(hi, v)), N = pt(vv, r - 8);
    return `<div class="gau"><svg viewBox="0 0 200 112">${zones.map((z) => arc(z[0], z[1], z[2])).join('')}<line x1="${cx}" y1="${cy}" x2="${N[0].toFixed(1)}" y2="${N[1].toFixed(1)}" stroke="${NAVY}" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="6" fill="${NAVY}"/><text x="100" y="110" text-anchor="middle" font-size="17" font-weight="800" fill="#111">${E(f2(v, 1))}</text></svg><b>${E(label)}</b><p>${E(cap1)}</p><p>${E(cap2)}</p></div>`;
  }

  async function nifty() {
    try { const n = await fetchChart('^NSEI', '5d', '1d'), b = (n.bars || []).filter((q) => num(q.c)); if (b.length >= 2) return (b[b.length - 1].c / b[b.length - 2].c - 1) * 100; } catch (e) {}
    return null;
  }

  function fib(H, cmp) {
    const s = H.slice(-60), hi = Math.max(...s.map((b) => b.h)), lo = Math.min(...s.map((b) => b.l)), ih = s.findIndex((b) => b.h === hi), il = s.findIndex((b) => b.l === lo), up = ih > il, rg = hi - lo, rows = [];
    [[0.236, '23.6%'], [0.382, '38.2%'], [0.5, '50%'], [0.618, '61.8%'], [0.786, '78.6%']].forEach((q) => { const p = up ? hi - q[0] * rg : lo + q[0] * rg; rows.push({ lab: q[1] + (up ? ' pullback' : ' bounce'), p }); });
    return { rows, hi, lo, up };
  }

  function build(d, mk) {
    const x = d.x, H = d.hist, k = H.length - 1, noIntra = !d.sbars || !d.sbars.length, cmp = noIntra ? H[k].c : d.cmp, chg = noIntra ? (H[k - 1] ? (H[k].c / H[k - 1].c - 1) * 100 : null) : d.chg, prevC = noIntra ? (H[k - 1] ? H[k - 1].c : H[k].c) : d.prevClose, up = (chg || 0) >= 0, atr = num(x.atr) ? x.atr : cmp * 0.015, sym = d.name && d.y ? d.y.replace(/\.(NS|BO)$/, '') : '';
    const exch = /\.BO$/.test(d.y) ? 'BSE' : 'NSE', basis = d.live ? 'Live (delayed ~15 min), provisional' : 'Based on ' + dlab(d.lastS || H[k].date) + ' close';
    const rec = H.slice(-5), prev5 = H.slice(-10, -5), wkLo = Math.min(...rec.map((b) => b.l)), wkHi = Math.max(...rec.map((b) => b.h)), wkChg = d.r5;
    const pos = (v, lo, hi) => Math.max(2, Math.min(98, (v - lo) / ((hi - lo) || 1) * 100));
    const dH = num(d.dayH) ? d.dayH : H[k].h, dL = num(d.dayL) ? d.dayL : H[k].l, dO = num(d.dayO) ? d.dayO : H[k].o;
    const rvTxt = num(x.rv) ? (x.rv >= 1.3 ? 'Heavy trading — interest is high' : x.rv <= 0.8 ? 'Quiet trading — no panic, no rush' : 'Normal trading activity') : '';
    const gap = (hi52 => (hi52 - cmp) / hi52 * 100)(d.hi52), fromLow = (cmp / d.lo52 - 1) * 100;
    const mood = mk == null ? null : mk;
    let why1, why1t;
    if (mood != null && num(chg)) { const rel = chg - mood; why1 = sg(mood) + '%'; why1t = 'Nifty 50 for the session. ' + E(sym) + ' moved ' + sg(chg) + '% — ' + (Math.abs(rel) < 0.3 ? 'broadly in line with the market.' : rel < 0 ? 'a little weaker than the market.' : 'stronger than the market.'); } else { why1 = '—'; why1t = 'Market comparison not available right now.'; }
    const stackUp = cmp > x.e20 && x.e20 > x.e50, stackDn = cmp < x.e20 && x.e20 < x.e50;
    const trendWord = stackUp ? 'Uptrend' : stackDn ? 'Downtrend' : 'Sideways / mixed', trendTxt = stackUp ? 'Price is above its 20- and 50-day averages — buyers are in control.' : stackDn ? 'Price is below its 20- and 50-day averages — sellers are in control.' : 'Price sits between its short and medium averages — no clear direction yet.';
    const volTxt = num(x.rv) ? f2(x.rv, 1) + '× normal' : '—';
    const ma = [['5-day', sma(H, 5)], ['10-day', sma(H, 10)], ['20-day', x.e20], ['50-day', x.e50], ['100-day', sma(H, 100)], ['200-day', x.e200]].filter((m) => num(m[1]));
    // fibonacci ladder
    const F = fib(H, cmp), L = [];
    F.rows.forEach((r) => L.push({ lab: r.lab, p: r.p, kind: r.p >= cmp ? 'res' : 'sup' }));
    L.push({ lab: '52-week high', p: d.hi52, kind: 'res' }); L.push({ lab: '52-week low', p: d.lo52, kind: 'sup' });
    ma.filter((m) => /20|50|200/.test(m[0])).forEach((m) => L.push({ lab: m[0] + ' average', p: m[1], kind: 'ma' }));
    L.push({ lab: 'LTP', p: cmp, kind: 'ltp' });
    L.sort((a, b) => b.p - a.p);
    const ladRows = L.filter((r) => r.kind === 'ltp' || Math.abs(r.p / cmp - 1) <= 0.12).map((r) => {
      const cl = r.kind === 'ltp' ? 'ltp' : r.kind === 'ma' ? '' : r.p >= cmp ? 'res' : 'sup';
      return `<tr class="${cl}"><td>${r.kind === 'ltp' ? (d.live ? 'LIVE PRICE' : 'LAST CLOSE') : E(r.lab)}</td><td class="pr">${R2(r.p)}</td><td>${r.kind === 'ltp' ? '' : sg((r.p / cmp - 1) * 100, 1) + '% from price'}</td></tr>`;
    }).join('');
    const supN = L.filter((r) => r.kind !== 'ltp' && r.p < cmp).sort((a, b) => b.p - a.p), resN = L.filter((r) => r.kind !== 'ltp' && r.p > cmp).sort((a, b) => a.p - b.p);
    const s1 = supN[0], s2 = supN[1], r1 = resN[0], r2 = resN[1], r3 = resN[2];
    const bull = r1 ? `Close above ${R0(r1.p)}` : 'Price holds near highs', bullT = r2 ? `Next: ${R0(r2.p)}${r3 ? ' → ' + R0(r3.p) : ''}` : 'Fresh highs possible';
    const bear = s1 ? `Close below ${R0(s1.p)} on rising volume` : 'Support breaks', bearT = s2 ? `Next: ${R0(s2.p)}${supN[2] ? ' → ' + R0(supN[2].p) : ''}` : 'Watch next support';
    const baseLo = s1 ? s1.p : cmp - atr * 2, baseHi = r1 ? r1.p : cmp + atr * 2;
    // reversal tracker
    const trkItems = [
      ['Higher low formed', Math.min(...rec.map((b) => b.l)) > Math.min(...prev5.map((b) => b.l)), 'recent low ' + R0(wkLo)],
      ['Higher high formed', Math.max(...rec.map((b) => b.h)) > Math.max(...prev5.map((b) => b.h)), 'recent high ' + R0(wkHi)],
      ['Close above 20-day avg ' + R0(x.e20), cmp > x.e20, 'price ' + R2(cmp)],
      ['RSI back above 50', x.rsi > 50, 'now ' + f2(x.rsi, 1)],
      ['Trend strength (ADX) above 20', x.adx > 20 && x.pdi > x.mdi, 'ADX now ' + f2(x.adx, 0)],
      ['Up-day volume above normal', x.green && num(x.rv) && x.rv >= 1, 'last day ' + volTxt]
    ];
    const done = trkItems.filter((t) => t[1]).length;
    const stance = done <= 1 ? 'treat any rise as a bounce, not a reversal.' : done <= 3 ? 'early signs only — wait for more confirmation.' : 'a genuine reversal is taking shape.';
    const rsiCap = x.rsi >= 70 ? ['Overbought zone', 'chasing here is risky'] : x.rsi <= 30 ? ['Oversold zone', 'a bounce is possible'] : x.rsi > 50 ? ['Neutral-to-strong', 'buyers slightly ahead'] : ['Neutral-to-soft', 'neither overheated nor washed out'];
    const adxCap = x.adx >= 25 ? ['Strong trend', 'a clear direction is running'] : x.adx >= 18 ? ['Trend developing', 'direction is firming up'] : ['No strong trend', 'the stock is drifting, not running'];
    const mhCap = num(x.mh) ? (x.mh > 0 ? ['Medium-term pull is up', 'momentum histogram positive'] : ['Medium-term pull is down', 'momentum histogram negative']) : ['—', ''];
    const bullets1 = [`${(dH - dL) ? 'A ' + R0(dH - dL) + ' band (' + ((dH - dL) / cmp * 100).toFixed(1) + '%)' : 'Range'} for the session; ${d.live ? (up ? 'trading higher' : 'trading lower') : (up ? 'closed with a gain' : 'closed lower')} at ${R2(cmp)}.`,
      `${f2(wkChg, 1) !== '—' ? 'Over 5 sessions the stock is ' + sg(wkChg, 1) + '%' : ''}${num(gap) ? ' and ' + gap.toFixed(1) + '% below its 52-week high' : ''}${num(fromLow) ? ', ' + fromLow.toFixed(0) + '% above the 52-week low.' : '.'}`];
    const bullets2 = [`Momentum: RSI ${f2(x.rsi, 0)} — ${rsiCap[0].toLowerCase()}; trend strength ADX ${f2(x.adx, 0)} — ${adxCap[0].toLowerCase()}.`];
    const bullets3 = [`Fibonacci levels mark the classic points where a stock pauses or turns, measured from its recent swing (${R0(F.lo)} to ${R0(F.hi)}).`,
      d.plan && d.plan.sides && d.plan.sides.length ? 'Next-session day-trading call (rule-based): ' + (d.plan.sides[0].dir > 0 ? 'BUY' : 'SELL') + ' above/below ' + R2(d.plan.sides[0].entry) + ', stop-loss ' + R2(d.plan.sides[0].sl) + ', first target ' + R2(d.plan.sides[0].t1) + '.' : 'Next session: no high-confidence day-trading setup — patience is the position.',
      'Risks: a wider market sell-off, a surprise in company news or results, and a close below the first support on heavy volume. Levels are for monitoring, not a trade instruction.'];
    const li = (a) => '<ul>' + a.filter(Boolean).map((t) => '<li>' + t + '</li>').join('') + '</ul>';
    return `<div class="cv"><style>${CSS}</style>
    <div class="hd"><img src="assets/jc-banner.png" alt="Joshi's Corner"></div>
    <div class="tt">Stock View: ${E(sym)} (${exch})</div><div class="st">${E(stamp())}</div>
    <div class="nt">${E(d.name)} · ${E(basis)}. Delayed data — intraday readings are provisional while the market is open.</div>
    <h3>1. TODAY'S STOCK BEHAVIOR</h3>
    <div class="hero"><div><small>${E(sym)} · ${E((d.name || '').toUpperCase())} · ${exch}</small><div class="px">${R2(cmp)}</div><span class="pill ${up ? 'g' : 'r'}">${up ? '▲' : '▼'} ${sg(cmp - prevC)} (${sg(chg)}%)</span></div>
      <div class="chips"><div><i>PREV CLOSE</i><b>${f2(prevC)}</b></div><div><i>OPEN</i><b>${f2(dO)}</b></div><div><i>DAY HIGH</i><b>${f2(dH)}</b></div><div><i>DAY LOW</i><b>${f2(dL)}</b></div></div></div>
    <div class="g3"><div class="card" style="background:#FFF8E6"><h5>TODAY'S RANGE</h5><div class="bar"><u style="left:${pos(cmp, dL, dH)}%"></u></div><div class="barl"><span>${f2(dL, 0)}</span><span>${f2(dH, 0)}</span></div></div>
      <div class="card" style="background:#EEF4FF"><h5>5-SESSION RANGE · ${sg(wkChg, 1)}%</h5><div class="bar"><u style="left:${pos(cmp, wkLo, wkHi)}%"></u></div><div class="barl"><span>${f2(wkLo, 0)}</span><span>${f2(wkHi, 0)}</span></div></div>
      <div class="card" style="background:#F3EEFF"><h5>52-WEEK RANGE · ${gap.toFixed(1)}% off high</h5><div class="bar"><u style="left:${pos(cmp, d.lo52, d.hi52)}%"></u></div><div class="barl"><span>${f2(d.lo52, 0)}</span><span>${f2(d.hi52, 0)}</span></div></div></div>
    ${li(bullets1)}
    <h3>2. REASON FOR THE DAY'S TREND</h3>
    <div class="g3"><div class="gc" style="--a:#FF8C00;--b:#E5484D"><small>MARKET MOOD</small><b>${why1}</b><span>${why1t}</span></div>
      <div class="gc" style="--a:#2563EB;--b:#6D28D9"><small>TREND</small><b>${trendWord}</b><span>${E(trendTxt)}</span></div>
      <div class="gc" style="--a:#12B76A;--b:#0EA5A4"><small>TRADING VOLUME</small><b>${volTxt}</b><span>${E(rvTxt)}</span></div></div>
    ${li(bullets2)}
    <div class="g3">${gauge(x.rsi, 0, 100, [[0, 30, '#34D399'], [30, 70, '#CBD5E1'], [70, 100, '#F87171']], 'RSI (14) — momentum gauge', rsiCap[0], rsiCap[1])}
      ${gauge(x.adx, 0, 60, [[0, 18, '#CBD5E1'], [18, 25, '#FCD34D'], [25, 60, '#34D399']], 'ADX — trend strength', adxCap[0], adxCap[1])}
      <div class="gau" style="display:flex;flex-direction:column;justify-content:center;text-align:center"><b>MACD momentum</b><div style="font-size:26px;font-weight:800;color:${x.mh >= 0 ? G : Rd};margin:8px 0">${sg(x.mh, 1)}</div><p>${E(mhCap[0])}</p><p>${E(mhCap[1])}</p><p style="margin-top:8px"><b>Daily swing (ATR)</b>≈ ${R0(atr)} (${(atr / cmp * 100).toFixed(1)}%)</p></div></div>
    <div class="ma">${ma.map((m) => { const above = cmp > m[1]; return `<div style="background:linear-gradient(135deg,${above ? '#12B76A,#0EA5A4' : '#FF8C00,#E5484D'})"><i style="font-style:normal;opacity:.85">${m[0]} ${above ? '▲' : '▼'}</i><b>${f2(m[1], 0)}</b></div>`; }).join('')}</div>
    <div class="nt">▲ price is above the average = bigger-trend support · ▼ price is below the average = short-term weakness</div>
    <h3>3. FUTURE PREDICTION</h3>
    <div class="g3"><div class="gc" style="--a:#12B76A;--b:#0EA5A4"><small>BULL CASE</small><b>${E(bull)}</b><span>${E(bullT)}</span></div>
      <div class="gc" style="--a:#2563EB;--b:#6D28D9"><small>BASE CASE · most likely</small><b>Range-bound ${R0(baseLo)} – ${R0(baseHi)}</b><span>Between the nearest support and resistance while the market digests news.</span></div>
      <div class="gc" style="--a:#FF8C00;--b:#E5484D"><small>BEAR CASE</small><b>${E(bear)}</b><span>${E(bearT)}</span></div></div>
    <table style="margin-top:10px"><tr><th>KEY LEVEL (Fibonacci &amp; averages)</th><th style="text-align:right">PRICE</th><th>DISTANCE</th></tr>${ladRows}</table>
    <div class="nt">Red rows = selling zone (resistance) · green rows = buying zone (support). If a level breaks, the next row in that direction is the next reference.</div>
    <h3>BOUNCE OR REAL REVERSAL? — confirmation tracker</h3>
    <div class="trk">${trkItems.map((t) => `<div><i class="${t[1] ? 'y' : 'n'}">${t[1] ? '✓' : '✗'}</i><span><b>${E(t[0])}</b><small>${E(t[2])} · ${t[1] ? 'confirmed' : 'not yet'}</small></span></div>`).join('')}<span class="sum">${done} of 6 confirmed → ${stance}</span></div>
    ${li(bullets3)}
    <div class="disc">This report is for informational purposes only and does not constitute investment advice.</div>
    <div class="ft">9/25C, Bijoygarh Colony, Jadavpur, Kolkata-32 · Tel 9477030987</div></div>`;
  }

  const S = { html: '', busy: false };
  async function run() {
    const inp = $('cvSym'), st = $('cvSt'), out = $('cvOut'); if (!inp || S.busy) return;
    const raw = inp.value.trim(); if (!raw) { st.textContent = 'Type a symbol, e.g. HAL, TCS, RELIANCE or BSE:500325'; return; }
    S.busy = true; st.textContent = '⏳ Fetching data and building the report…'; $('cvPrint').disabled = true;
    try {
      const y = jcXrayApi.norm(raw), [d, mk] = await Promise.all([jcXrayApi.load(y), nifty()]);
      if (d.err) throw new Error(d.err);
      S.html = build(d, mk); out.innerHTML = S.html; st.textContent = '✔ Ready — check it, then Print / Save PDF.'; $('cvPrint').disabled = false;
    } catch (e) { st.textContent = '⚠ ' + (e && e.message ? e.message : e); }
    S.busy = false;
  }
  function print() {
    if (!S.html) return;
    const old = $('cvFrame'); if (old) old.remove(); const f = document.createElement('iframe'); f.id = 'cvFrame'; f.style.cssText = 'position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;z-index:-1'; document.body.appendChild(f);
    const base = location.href.replace(/[^/]*$/, ''), d = f.contentWindow.document; d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${E(base)}"><title>Stock View ${stamp()}</title><style>@page{size:A4;margin:8mm}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${S.html}</body></html>`); d.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { alert('Print failed: ' + e.message); } }, 700);
  }
  function build0() {
    const sel = $('viewSel'), anchor = document.querySelector('details.datasec'); if (!sel || !anchor || $('pClientView')) return;
    const o = document.createElement('option'); o.value = 'pClientView'; o.textContent = '📄 Client Stock View (infographic PDF)'; const g = sel.querySelector('optgroup'); (g || sel).appendChild(o);
    const p = document.createElement('div'); p.className = 'panel'; p.id = 'pClientView';
    p.innerHTML = `<div class="card"><h4 style="margin:0 0 6px;color:var(--navy)">Client Stock View — any NSE / BSE symbol</h4>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><input id="cvSym" placeholder="e.g. HAL, TCS, RELIANCE, BSE:500325" style="flex:1;min-width:180px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px">
      <button id="cvGo" class="btn">Build report</button><button id="cvPrint" class="btn" disabled>Print / Save PDF</button></div>
      <div id="cvSt" class="note" style="margin-top:6px">One-page client infographic from live (delayed) terminal data: today's behaviour, why it moved, indicator gauges, Fibonacci levels, bull/base/bear map and reversal tracker. Add news context by hand before sending if there is a company announcement.</div></div>
      <div id="cvOut" style="margin-top:8px"></div>`;
    anchor.parentNode.insertBefore(p, anchor);
    $('cvGo').onclick = run; $('cvPrint').onclick = print; $('cvSym').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build0); else build0();
  window.jcClientView = { run, build };
})();
