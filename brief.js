/* Joshi's Corner — "Why? ▸" brief for each first-row tile of Joshi's Dashboard.
   For Nifty 50, Bank Nifty, Sensex, India VIX, USD/INR, Brent, India 10Y and Nifty PCR it explains, from the live readings and the daily-bar levels the tile already uses:
   why it is behaving this way · what could come next (breakout / breakdown / reversal levels with stop-loss and targets) · how to handle positions · alert levels ·
   and how the eight readings add up together. Everything is rule-based and mechanical: reading of the tape, NOT a forecast, NOT advice.
   Alerts are in-page only (they work while this page is open). */
(function () {
  'use strict';
  const LSA = 'jc_tbalerts_v1';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const KEYS = {
    '^NSEI': { n: 'Nifty 50', dp: 2, kind: 'idx', w: 3 }, '^NSEBANK': { n: 'Bank Nifty', dp: 2, kind: 'idx', w: 1.5 }, '^BSESN': { n: 'Sensex', dp: 2, kind: 'idx', w: 1.5 },
    '^INDIAVIX': { n: 'India VIX', dp: 2, kind: 'vix', w: 1.8, inv: 1 }, 'USDINR=X': { n: 'USD / INR', dp: 3, kind: 'fx', w: 1, inv: 1 },
    'BZ=F': { n: 'Brent Crude', dp: 2, kind: 'oil', w: 0.8, inv: 1 }, IN10Y: { n: 'India 10Y G-Sec', dp: 3, kind: 'bond', w: 0.7, inv: 1 }, PCR: { n: 'Nifty PCR (OI)', dp: 2, kind: 'pcr', w: 1 },
  };
  const ORDER = ['^NSEI', '^NSEBANK', '^BSESN', '^INDIAVIX', 'USDINR=X', 'BZ=F', 'IN10Y', 'PCR'];

  /* ---------- reading a series ---------- */
  function read(key, C) {
    const K = KEYS[key], S = C.S, o = { key, K, px: null, chg: null, pct: null, bp: null, L: null, atr: null, pdh: null, pdl: null, r5: null, ns: null, nr: null, ms: null, mr: null, tr: '—', tc: 0 };
    if (key === 'IN10Y') {
      const x = S.x.in10y || (S.bd && S.bd.IN10Y), m = C.manual().in10y; o.px = x && x.p != null ? x.p : m ? m.v : null; if (x && x.pc != null && x.p != null) o.bp = (x.p - x.pc) * 100;
      if (o.px != null) { const st = 0.1, lo = Math.floor(o.px / st) * st, hi = Math.ceil((o.px + 1e-9) / st) * st; o.ns = lo < o.px - 0.01 ? lo : lo - st; o.nr = hi > o.px + 0.01 ? hi : hi + st; o.ms = o.ns - st; o.mr = o.nr + st; o.atr = 0.05; o.tr = 'no daily history for this series'; }
      return o;
    }
    if (key === 'PCR') {
      o.px = C.pcrVal(); if (o.px != null) { const B = [0.6, 0.8, 1.0, 1.3]; o.nr = B.find((b) => b > o.px + 1e-9) || null; o.ns = B.slice().reverse().find((b) => b < o.px - 1e-9) || null; o.tr = 'no daily history for this series'; }
      return o;
    }
    const q = S.q[key]; if (q && q.p != null) { o.px = q.p; if (q.pc) { o.chg = q.p - q.pc; o.pct = o.chg / q.pc * 100; } }
    const t = C.T3.find((x) => x.s === key);
    if (o.px != null && t) {
      const L = C.levels(t, o.px); o.L = L;
      const h = S.h[key], B = h && h.bars; if (B && B.length > 20) {
        const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10), done = B.slice(); if (done[done.length - 1].d >= today && new Date(Date.now() + 19800000).getUTCHours() * 60 + new Date(Date.now() + 19800000).getUTCMinutes() < 960) done.pop();
        const last = done.slice(-14); o.atr = avg(last.map((b) => b.h - b.l)); const pv = done[done.length - 1]; o.pdh = pv.h; o.pdl = pv.l; if (done.length > 6) o.r5 = (done[done.length - 1].c / done[done.length - 6].c - 1) * 100;
      }
      if (L) { o.ns = L.ns && L.ns[0]; o.nr = L.nr && L.nr[0]; o.ms = L.ms && L.ms[0]; o.mr = L.mr && L.mr[0]; o.tr = L.tr; o.tc = L.tc; o.nsn = L.ns && L.ns[1]; o.nrn = L.nr && L.nr[1]; o.msn = L.ms && L.ms[1]; o.mrn = L.mr && L.mr[1]; }
    }
    return o;
  }

  /* tone for the combined strip: +1 supportive for Indian equities, -1 adverse, 0 mixed */
  function tone(key, o, C) {
    const K = KEYS[key]; if (o.px == null) return { v: 0, t: 'no reading' };
    if (K.kind === 'idx') { const p = o.pct == null ? 0 : o.pct; const v = (p > 0.15 ? 1 : p < -0.15 ? -1 : 0) + (o.tc > 0 ? 0.5 : o.tc < 0 ? -0.5 : 0); return { v: Math.sign(v), t: (p >= 0 ? '+' : '') + p.toFixed(2) + '% · ' + (o.tr || '') }; }
    if (K.kind === 'vix') { const p = o.pct == null ? 0 : o.pct; const lvl = o.px > 20 ? -1 : o.px < 13 ? 0.5 : 0; const v = (p > 3 ? -1 : p < -3 ? 1 : 0) + lvl; return { v: Math.sign(v), t: o.px.toFixed(1) + (p ? (p > 0 ? ' ▲' : ' ▼') : '') }; }
    if (K.kind === 'fx') { const p = o.pct == null ? 0 : o.pct; return { v: p > 0.15 ? -1 : p < -0.15 ? 1 : 0, t: (p > 0 ? 'rupee weaker ' : p < 0 ? 'rupee firmer ' : 'flat ') + (p >= 0 ? '+' : '') + p.toFixed(2) + '%' }; }
    if (K.kind === 'oil') { const p = o.pct == null ? 0 : o.pct; return { v: p > 1 ? -1 : p < -1 ? 1 : 0, t: (p >= 0 ? '+' : '') + p.toFixed(2) + '%' }; }
    if (K.kind === 'bond') { const b = o.bp == null ? 0 : o.bp; return { v: b > 2 ? -1 : b < -2 ? 1 : 0, t: o.bp == null ? 'level only' : (b >= 0 ? '+' : '') + b.toFixed(1) + ' bp' }; }
    const g = C.pcrTag(o.px)[1]; return { v: g === 'g' ? 1 : g === 'r' ? -1 : 0, t: C.pcrTag(o.px)[0].toLowerCase() };
  }

  /* ---------- why it is behaving like this ---------- */
  function why(key, o, C) {
    const P = C.pctOf, out = [], sg = (v, d) => (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%', K = KEYS[key];
    const gl = ['^N225', '^HSI', '^KS11', '^FTSE', '^GDAXI', '^FCHI', '^DJI', '^GSPC', '^IXIC'].map(P).filter(num), ga = gl.length >= 3 ? avg(gl) : null;
    const vx = P('^INDIAVIX'), fx = P('USDINR=X'), br = P('BZ=F'), nf = P('^NSEI'), bn = P('^NSEBANK'), us = C.S.q['^TNX'], usb = us && us.pc ? (us.p - us.pc) * 100 : null;
    if (o.px == null) return ['The reading is still loading — try again in a moment.'];
    if (K.kind === 'idx') {
      out.push(`${K.n} is ${o.pct == null ? 'flat' : sg(o.pct)} on the day${o.r5 != null ? ' and ' + sg(o.r5, 1) + ' over the last 5 sessions' : ''}; the chart reads <b>${E(o.tr)}</b> (price ${o.L ? (o.L.a20 ? 'above' : 'below') + ' its 20-day and ' + (o.L.a50 ? 'above' : 'below') + ' its 50-day average' : 'vs its averages loading'}).`);
      if (ga != null) out.push(`Global markets are ${ga >= 0.15 ? 'positive' : ga <= -0.15 ? 'negative' : 'mixed'} (${sg(ga)} average of Asia, Europe and US) — ${ga >= 0.15 && (o.pct || 0) > 0 ? 'India is moving with the world' : ga <= -0.15 && (o.pct || 0) < 0 ? 'India is following global weakness' : 'India is moving on its own, so local factors matter more today'}.`);
      if (key === '^NSEBANK' && nf != null && bn != null) out.push(`Bank Nifty is ${bn - nf >= 0 ? 'out-performing' : 'under-performing'} Nifty by ${Math.abs(bn - nf).toFixed(2)}% — ${bn - nf >= 0 ? 'financials are leading the index' : 'financials are dragging the index'}.`);
      else if (key === '^NSEI' && nf != null && bn != null) out.push(`Banks are ${bn - nf >= 0 ? 'leading' : 'lagging'} (${sg(bn)} vs Nifty ${sg(nf)}) — as the heaviest weight in the index, that decides most of the day's direction.`);
      else if (key === '^BSESN' && nf != null && o.pct != null) out.push(`Sensex and Nifty overlap in most of their stocks; Sensex ${sg(o.pct)} vs Nifty ${sg(nf)} — a gap between them means the few non-common heavyweights are pulling differently.`);
      if (vx != null) out.push(`India VIX is ${vx > 0 ? 'rising' : 'falling'} (${sg(vx, 1)}): ${vx > 3 ? 'traders are paying up for protection — caution is building' : vx < -3 ? 'fear is easing, which supports risk-taking' : 'no big change in fear'}.`);
      if (fx != null || br != null) out.push(`Macro: rupee ${fx == null ? '—' : fx > 0.1 ? 'weaker' : fx < -0.1 ? 'firmer' : 'steady'}${br != null ? ', Brent ' + (br > 0.5 ? 'higher' : br < -0.5 ? 'lower' : 'steady') + ' (' + sg(br, 1) + ')' : ''}${usb != null ? ', US 10Y ' + (usb >= 0 ? '+' : '') + usb.toFixed(1) + ' bp' : ''} — ${(fx || 0) > 0.15 || (br || 0) > 1 || (usb || 0) > 4 ? 'these are a headwind for Indian equities' : (fx || 0) < -0.15 || (br || 0) < -1 || (usb || 0) < -4 ? 'these are a tailwind' : 'neutral for now'}.`);
    } else if (K.kind === 'vix') {
      const band = o.px < 13 ? 'complacent (very low)' : o.px < 18 ? 'normal' : o.px < 24 ? 'elevated — nervous' : 'fear zone';
      out.push(`India VIX is ${o.px.toFixed(2)} (${band}) and ${o.pct == null ? 'flat' : sg(o.pct)} on the day. VIX measures what option traders expect Nifty to move over the next 30 days — higher means bigger swings expected.`);
      if (nf != null) out.push(nf < -0.2 && (o.pct || 0) > 0 ? `VIX is rising as Nifty falls (${sg(nf)}) — the classic fear pattern; hedging demand is real.` : nf > 0.2 && (o.pct || 0) < 0 ? `VIX is falling as Nifty rises (${sg(nf)}) — a healthy, low-fear advance.` : nf > 0.2 && (o.pct || 0) > 2 ? `VIX is rising even as Nifty rises (${sg(nf)}) — big players are buying protection into the rally; treat the up-move with some caution.` : `Nifty ${nf == null ? '' : sg(nf)} and VIX are not telling a strong story together right now.`);
      if (o.L) out.push(`VIX chart: ${E(o.tr)}. VIX tends to spike fast and fall slowly, and to revert towards its average; very low readings often come before sharper moves in either direction.`);
    } else if (K.kind === 'fx') {
      out.push(`USD/INR is ${o.px.toFixed(3)} (${o.pct == null ? 'flat' : sg(o.pct)} on the day) — a <b>${(o.pct || 0) > 0.1 ? 'weaker' : (o.pct || 0) < -0.1 ? 'firmer' : 'steady'} rupee</b>; chart reads ${E(o.tr)}.`);
      if (br != null) out.push(`Brent ${sg(br, 1)}: India imports most of its oil, so higher crude means more dollar demand and a weaker rupee.${br > 1 ? ' That is part of today’s pressure.' : ''}`);
      if (usb != null) out.push(`US 10Y yield ${usb >= 0 ? '+' : ''}${usb.toFixed(1)} bp: rising US yields pull money towards dollar assets.${usb > 4 ? ' That is adding to the dollar’s strength.' : ''}`);
      out.push('RBI has often smoothed sharp rupee moves by selling or buying dollars, so fast one-way moves sometimes pause near round numbers — but that is a habit, not a guarantee.');
    } else if (K.kind === 'oil') {
      out.push(`Brent is $${o.px.toFixed(2)} (${o.pct == null ? 'flat' : sg(o.pct)}); chart reads ${E(o.tr)}.${o.r5 != null ? ' 5-session change ' + sg(o.r5, 1) + '.' : ''}`);
      out.push('Crude moves on global supply decisions (OPEC+), stock levels, geopolitics and demand outlook — none of which this page can see, so treat the cause as unknown and trade the level, not the story.');
      if (fx != null) out.push(`Rupee ${sg(fx)} today — ${fx > 0.1 && (o.pct || 0) > 0 ? 'oil up and rupee down is the double-hit combination for India' : 'no double-hit today'}.`);
    } else if (K.kind === 'bond') {
      out.push(`India 10Y yield is ${o.px.toFixed(3)}%${o.bp == null ? ' (level only — change not available)' : ', ' + (o.bp >= 0 ? '+' : '') + o.bp.toFixed(1) + ' bp on the day'}.`);
      if (usb != null) out.push(`US 10Y ${usb >= 0 ? '+' : ''}${usb.toFixed(1)} bp — Indian yields usually follow global yields part of the way.`);
      if (br != null) out.push(`Brent ${sg(br, 1)} — oil is an inflation input; higher crude pushes yield expectations up, cheaper crude eases them.`);
      out.push('Rising yields lower bond prices (banks hold large bond books) and raise borrowing costs for rate-sensitive sectors (real estate, NBFCs, autos); falling yields do the opposite.');
    } else {
      const tg = C.pcrTag(o.px); out.push(`PCR (put open interest ÷ call open interest) is ${o.px.toFixed(2)} — <b>${tg[0].toLowerCase()}</b>. Heavy put writing (high PCR) shows traders defending lower levels; heavy call writing (low PCR) shows them capping rallies.`);
      out.push(`Extremes are contrarian: above 1.3 the crowd is very bearish-hedged (often near a bounce); below 0.6 it is very complacent (often near a pause or dip). In between it is mostly a trend-confirming gauge.`);
      if (nf != null) out.push(`Nifty ${sg(nf)} with PCR ${o.px.toFixed(2)}: ${nf > 0 && o.px >= 1 ? 'price rising with firm put support — healthy' : nf < 0 && o.px < 0.8 ? 'price falling with few puts written — support is thin' : 'price and option positioning are not strongly aligned'}.`);
    }
    return out;
  }

  /* ---------- scenarios with levels, stop-loss, targets ---------- */
  function scen(key, o, C) {
    const K = KEYS[key], f = (v) => C.fmtN(v, K.dp), atr = o.atr || (o.px ? o.px * 0.006 : 0), px = o.px; if (px == null) return null;
    const S = [], rr = (e, sl, t) => { const r = Math.abs(sl - e); return r > 0 ? Math.abs(t - e) / r : null; }, rrT = (x) => x == null ? '' : ` · reward:risk ≈ ${x.toFixed(1)}${x < 1 ? ' (thin — not worth chasing)' : ''}`;
    const nr = o.nr, ns = o.ns, mr = o.mr || (nr ? nr + 1.5 * atr : null), ms = o.ms || (ns ? ns - 1.5 * atr : null);
    if (K.kind === 'pcr') {
      if (o.nr != null) S.push({ c: 'u', h: `Rises through ${o.nr.toFixed(1)}`, t: 'Put writing is building — option traders are defending lower levels. Supportive for Nifty; above 1.3 look for a bounce setup (needs price to confirm).' });
      if (o.ns != null) S.push({ c: 'd', h: `Falls through ${o.ns.toFixed(1)}`, t: 'Call writing is rising or puts are being unwound — rallies get capped; below 0.6 the market is crowded on the long side and a dip is easier.' });
      S.push({ c: 'n', h: 'Reversal clue', t: 'PCR reversing from an extreme (above 1.3 turning down, below 0.6 turning up) while Nifty reclaims or loses its nearest support/resistance is a stronger signal than PCR alone. Stop-loss for any trade stays on the Nifty chart, never on PCR.' });
      return S;
    }
    if (K.kind === 'bond') {
      if (nr != null) S.push({ c: 'd', h: `Yield rises above ${nr.toFixed(2)}%`, t: `Pressure on banks’ bond books and rate-sensitive sectors; next watch ${mr.toFixed(2)}%. A rise of more than 6–8 bp in a day is a sharp move.` });
      if (ns != null) S.push({ c: 'u', h: `Yield falls below ${ns.toFixed(2)}%`, t: `Relief for banks, NBFCs, real estate and autos; next watch ${ms.toFixed(2)}%.` });
      S.push({ c: 'n', h: 'Reversal clue', t: 'A yield that spikes then closes back below the level it broke (or the reverse) is a failed move — the market has rejected it. Equity positions need no stop on the yield itself; use it to decide how much risk to carry in banks and rate-sensitive stocks.' });
      return S;
    }
    const inv = !!K.inv, eq = (up) => K.kind === 'idx' ? '' : ` For equities this is ${up ? (inv ? 'a headwind' : 'a tailwind') : (inv ? 'a tailwind' : 'a headwind')}.`;
    if (nr != null) { const sl = nr - 0.35 * atr, tg = Math.max(mr != null ? mr : 0, nr + 1.2 * atr); S.push({ c: inv ? 'd' : 'u', h: `Breakout: holds above ${f(nr)}`, lv: [['Trigger', 'a daily close (or two 30-min closes) above ' + f(nr) + (o.nrn ? ' · ' + o.nrn : '')], ['Target', f(tg) + (o.mrn ? ' · ' + o.mrn : '')], ['Stop / invalidation', 'back below ' + f(sl)]], t: `A close beyond ${f(nr)} says buyers have absorbed that supply${rrT(rr(nr, sl, tg))}.${eq(true)} A poke above that falls back below ${f(sl)} is a failed breakout — treat it as a reversal signal.` }); }
    if (ns != null) { const sl = ns + 0.35 * atr, tg = Math.min(ms != null ? ms : Infinity, ns - 1.2 * atr); S.push({ c: inv ? 'u' : 'd', h: `Breakdown: closes below ${f(ns)}`, lv: [['Trigger', 'a daily close (or two 30-min closes) below ' + f(ns) + (o.nsn ? ' · ' + o.nsn : '')], ['Target', f(tg) + (o.msn ? ' · ' + o.msn : '')], ['Stop / invalidation', 'back above ' + f(sl)]], t: `A close below ${f(ns)} says sellers have taken support${rrT(rr(ns, sl, tg))}.${eq(false)} A dip below that is reclaimed above ${f(sl)} is a failed breakdown.` }); }
    if (ns != null && nr != null) {
      const bs = ns - 0.5 * atr, br = nr + 0.5 * atr;
      S.push({ c: 'n', h: `Reversal zones`, lv: [['Support (bounce zone)', f(ns) + ' — stop ' + f(bs) + ' · target ' + f(nr)], ['Resistance (rejection zone)', f(nr) + ' — stop ' + f(br) + ' · target ' + f(ns)]], t: `Price inside ${f(ns)}–${f(nr)} is a range: buying the support or selling the resistance only works with a tight stop and a visible reversal candle (long lower wick at support, long upper wick at resistance). Wait for the candle — do not guess the turn.` });
    }
    return S;
  }

  /* ---------- what to do with positions ---------- */
  function act(key, o, C) {
    const K = KEYS[key], md = C.moodScore(), vx = C.S.q['^INDIAVIX'], v = vx && vx.p != null ? vx.p : null, tc = o.tc || 0, f = (x) => C.fmtN(x, K.dp), out = [];
    if (K.kind === 'idx') {
      const base = key === '^NSEBANK' ? 'Bank Nifty' : key === '^BSESN' ? 'Sensex' : 'Nifty';
      if (tc > 0) { out.push(`<b>Holding longs:</b> keep them while ${base} stays above ${o.ns ? f(o.ns) : 'its near support'}; trail the stop up under each new higher low. Do not add on a vertical spike — add on a pull-back to support that holds.`); out.push(`<b>No position yet:</b> wait for a dip to ${o.ns ? f(o.ns) : 'support'} with a bounce candle, or a close above ${o.nr ? f(o.nr) : 'resistance'}; do not chase at the top of the day's range.`); }
      else if (tc < 0) { out.push(`<b>Holding longs:</b> the trend is down — keep position size small, respect ${o.ns ? f(o.ns) : 'support'} as the line; if it closes below, exit rather than average down.`); out.push(`<b>No position yet:</b> avoid bottom-fishing; the better entries are a close back above ${o.nr ? f(o.nr) : 'resistance'} or a clearly failed breakdown.`); }
      else { out.push(`<b>Holding longs:</b> the chart is range-bound — book part near ${o.nr ? f(o.nr) : 'resistance'}, hold the rest with a stop under ${o.ns ? f(o.ns) : 'support'}.`); out.push(`<b>No position yet:</b> trade the edges of the range with small size, or wait for the breakout to be confirmed by a close.`); }
      out.push(`<b>Fresh long idea</b> (levels only — not a recommendation): entry on a hold above ${o.nr ? f(o.nr) : '—'} or a bounce at ${o.ns ? f(o.ns) : '—'}, stop ${o.ns ? f(o.ns - 0.35 * (o.atr || 0)) : '—'}, targets ${o.nr ? f(o.nr) : '—'} then ${o.mr ? f(o.mr) : '—'}. Risk a fixed small share of capital per trade so one stop-out is survivable.`);
    } else if (K.kind === 'vix') {
      out.push(v == null ? '' : v >= 20 ? '<b>High VIX:</b> option premiums are expensive and moves are larger — cut position size, use wider stops with fewer lots, prefer defined-risk (spreads) over naked short options, and do not sell options without a hedge.' : v < 13 ? '<b>Very low VIX:</b> protection is cheap — a good time to add hedges (puts or put spreads) on a large long book; avoid naked short options because a vol spike hurts most from here.' : '<b>Normal VIX:</b> standard sizing; hedges are fairly priced.');
      out.push('<b>If VIX jumps more than 10–15% in a day:</b> expect gaps and fast moves — tighten stops, avoid fresh leveraged longs until it stops rising, and let the first spike pass before buying.');
      out.push('<b>If VIX is falling back from a spike:</b> that is usually the market stabilising — a better time to add to quality positions in stages.');
    } else if (K.kind === 'fx') {
      out.push('<b>Rupee weakening fast:</b> importers and oil-sensitive sectors (OMCs, paints, airlines, tyres) feel it; IT and pharma exporters gain. Foreign investors also see lower dollar returns, which can slow inflows. Keep an eye on banks and the broader index for follow-on selling.');
      out.push('<b>Rupee strengthening:</b> usually helps importers and risk appetite; exporters’ margins ease slightly.');
      out.push('<b>Positions:</b> do not trade this tile alone. Use it as a filter — a sharp, sustained rise above the nearest resistance is a reason to reduce risk in import-heavy and leveraged positions, a close back below support is a reason to relax.');
    } else if (K.kind === 'oil') {
      out.push('<b>Crude rising:</b> negative for OMCs, paints, airlines, tyres, chemicals and the rupee; positive for upstream oil producers. A rise of more than about 3% in a day is a risk-off flag for the index.');
      out.push('<b>Crude falling:</b> eases inflation and the import bill — a tailwind for the rupee, OMCs and consumption names.');
      out.push('<b>Positions:</b> use crude as a filter on energy-linked trades; if it breaks above resistance while the rupee is also weakening, be lighter on rate- and import-sensitive stocks.');
    } else if (K.kind === 'bond') {
      out.push('<b>Yields rising:</b> trim rate-sensitive positions (banks with big bond books, NBFCs, real estate, autos); prefer cash-rich, low-debt companies.');
      out.push('<b>Yields falling:</b> a better backdrop for banks, NBFCs and real estate; add on strength in those sectors.');
      out.push('<b>Positions:</b> yields are a slow variable — use them to set the tilt of the portfolio, not to time intraday trades.');
    } else {
      out.push('<b>PCR above 1.3:</b> the market is heavily hedged — do not add fresh shorts here; wait for Nifty to break resistance before turning bullish.');
      out.push('<b>PCR below 0.6:</b> the market is complacent — avoid chasing; lock in some profit on longs and keep stops tight.');
      out.push('<b>PCR 0.8–1.0:</b> neutral — let price and levels decide.');
    }
    if (md) out.push(`<b>Overall market mood now:</b> ${md.score}/100 — ${C.moodLabel(md.score)[0].toLowerCase()}. ${md.score >= 60 ? 'Risk-taking is supported, but still use stops.' : md.score <= 40 ? 'Defensive posture: smaller size, quick to cut losers.' : 'No edge from mood — be selective.'}`);
    return out.filter(Boolean);
  }

  /* ---------- the eight readings together ---------- */
  function together(C) {
    const rows = ORDER.map((k) => { const o = read(k, C), t = tone(k, o, C); return { k, K: KEYS[k], o, t }; });
    const tot = rows.reduce((a, r) => a + r.K.w, 0), sc = rows.reduce((a, r) => a + r.K.w * r.t.v, 0) / tot;
    const sup = rows.filter((r) => r.t.v > 0).length, adv = rows.filter((r) => r.t.v < 0).length, mix = rows.length - sup - adv;
    const verdict = sc > 0.25 ? 'leaning supportive' : sc < -0.25 ? 'leaning adverse' : 'mixed — no clear edge';
    const swing = rows.filter((r) => r.t.v * sc < 0).sort((a, b) => b.K.w - a.K.w)[0] || rows.filter((r) => r.t.v !== 0).sort((a, b) => b.K.w - a.K.w)[0];
    return { rows, sup, adv, mix, verdict, sc, swing };
  }

  /* ---------- alerts (in-page) ---------- */
  const alerts = () => { try { return JSON.parse(localStorage.getItem(LSA) || '[]') || []; } catch (e) { return []; } };
  const saveA = (a) => { try { localStorage.setItem(LSA, JSON.stringify(a.slice(-40))); } catch (e) { } };
  function toast(msg) {
    let t = document.getElementById('jbToast'); if (!t) { t = document.createElement('div'); t.id = 'jbToast'; t.setAttribute('role', 'alert'); document.body.appendChild(t); }
    t.innerHTML = '🔔 ' + msg + ' <button type="button" aria-label="Close">✕</button>'; t.className = 'on'; t.querySelector('button').onclick = () => { t.className = ''; };
    clearTimeout(t.__t); t.__t = setTimeout(() => { t.className = ''; }, 30000);
  }
  function curPx(k, C) { const o = k === 'IN10Y' ? read(k, C) : k === 'PCR' ? { px: C.pcrVal() } : { px: (C.S.q[k] || {}).p }; return o.px; }
  function check(C) {
    const A = alerts(); if (!A.length) return; let ch = false;
    A.forEach((a) => { if (a.fired) return; const px = curPx(a.k, C); if (px == null) return; if ((a.dir === 'above' && px >= a.lvl) || (a.dir === 'below' && px <= a.lvl)) { a.fired = Date.now(); ch = true; const K = KEYS[a.k]; const m = `${K.n} crossed ${a.dir === 'above' ? 'above' : 'below'} ${C.fmtN(a.lvl, K.dp)} (now ${C.fmtN(px, K.dp)}) — ${E(a.note || '')}`; toast(m); try { if ('Notification' in window && Notification.permission === 'granted') new Notification("Joshi's Corner alert", { body: m.replace(/<[^>]+>/g, '') }); } catch (e) { } } });
    if (ch) saveA(A);
  }
  function toggleAlert(k, lvl, dir, note) {
    const A = alerts(), i = A.findIndex((a) => a.k === k && Math.abs(a.lvl - lvl) < 1e-9 && a.dir === dir && !a.fired);
    if (i >= 0) A.splice(i, 1); else { A.push({ k, lvl, dir, note, at: Date.now() }); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { } }
    saveA(A);
  }

  /* ---------- the pop-up body ---------- */
  function html(key, C) {
    const K = KEYS[key]; if (!K) return '';
    const o = read(key, C), f = (v) => C.fmtN(v, K.dp), tn = tone(key, o, C), A = alerts();
    const close = '<button type="button" class="jd-mvb" data-popx="1" title="Close (Esc)">✕</button>';
    const head = `<div class="jd-pm-h"><div class="jd-pm-t"><b>🧭 ${E(K.n)} — why, what next, what to do</b><small>mechanical reading from live levels · not advice · not a forecast</small></div><div class="jd-pm-bt">${close}</div></div>`;
    if (o.px == null) return head + '<div class="jd-pm-b"><div class="jd-fn">This reading is not available yet (feed loading or unavailable). Try again in a moment' + (key === 'IN10Y' || key === 'PCR' ? ', or type a value into the tile.' : '.') + '</div></div>';
    const chgTxt = K.kind === 'bond' ? (o.bp == null ? 'level only' : (o.bp >= 0 ? '+' : '') + o.bp.toFixed(1) + ' bp') : K.kind === 'pcr' ? C.pcrTag(o.px)[0] : o.pct == null ? '—' : (o.pct >= 0 ? '+' : '') + o.pct.toFixed(2) + '%';
    const toneCls = tn.v > 0 ? 'u' : tn.v < 0 ? 'd' : 'n', toneTxt = tn.v > 0 ? 'supportive for Indian equities' : tn.v < 0 ? 'adverse for Indian equities' : 'neutral for Indian equities';
    const hero = `<div class="jb-hero ${toneCls}"><div><small>${E(K.n)}</small><b>${f(o.px)}${K.kind === 'bond' ? '%' : ''}</b></div><div><small>Day</small><b>${E(chgTxt)}</b></div><div><small>Trend</small><b>${E(o.tr)}</b></div><div><small>Right now</small><b>${toneTxt}</b></div></div>`;
    const W = why(key, o, C), sc = scen(key, o, C), ac = act(key, o, C);
    const mdp = C.moodScore(), part = mdp && mdp.parts.find((p) => ({ 'India VIX': 'India VIX', 'USD / INR': 'Rupee', 'Brent Crude': 'Crude', 'Nifty 50': 'Nifty 50', 'Nifty PCR (OI)': 'PCR' }[K.n] === p.name));
    const impact = part ? `<div class="jb-imp">Weight in the Market Mood score: <b>${Math.round(part.w / mdp.parts.reduce((a, q) => a + q.w, 0) * 100)}%</b> · this reading is currently ${part.v > 0.15 ? '<b class="u">pushing the mood up</b>' : part.v < -0.15 ? '<b class="d">pulling the mood down</b>' : '<b>not moving the mood</b>'}.</div>` : '';
    const lvRows = (sc || []).map((s) => {
      const lv = s.lv ? '<table class="jb-lv">' + s.lv.map((r) => `<tr><td>${E(r[0])}</td><td>${E(r[1])}</td></tr>`).join('') + '</table>' : '';
      return `<div class="jb-sc ${s.c}"><h5>${E(s.h)}</h5>${lv}<p>${s.t}</p></div>`;
    }).join('');
    const al = [];
    if (K.kind !== 'pcr') { if (o.nr != null) al.push([o.nr, 'above', K.kind === 'bond' ? 'yield breaking up — watch banks and rate-sensitive stocks' : K.inv ? 'breakout in a reading that is adverse for equities' : 'breakout — check the stop and target in the brief']); if (o.ns != null) al.push([o.ns, 'below', K.kind === 'bond' ? 'yield breaking down — relief for banks and rate-sensitive stocks' : K.inv ? 'breakdown in a reading that is supportive for equities' : 'breakdown — support has given way']); if (o.mr != null) al.push([o.mr, 'above', 'major resistance reached']); if (o.ms != null) al.push([o.ms, 'below', 'major support lost']); }
    else { if (o.nr != null) al.push([o.nr, 'above', 'PCR crossed up through a band']); if (o.ns != null) al.push([o.ns, 'below', 'PCR crossed down through a band']); }
    const alHTML = al.map((a) => { const on = A.some((x) => x.k === key && Math.abs(x.lvl - a[0]) < 1e-9 && x.dir === a[1] && !x.fired); return `<button type="button" class="jb-al ${on ? 'on' : ''}" data-jb-al="${E(key)}|${a[0]}|${a[1]}|${E(a[2])}">${on ? '🔔 Alert on' : '🔕 Alert me'} · ${a[1]} ${f(a[0])}${K.kind === 'bond' ? '%' : ''} <small>${E(a[2])}</small></button>`; }).join('');
    const T = together(C), trs = T.rows.map((r) => `<tr class="${r.k === key ? 'me' : ''}"><td>${E(r.K.n)}</td><td>${r.o.px == null ? '—' : C.fmtN(r.o.px, r.K.dp) + (r.K.kind === 'bond' ? '%' : '')}</td><td>${E(r.t.t)}</td><td>${r.t.v > 0 ? '<b class="u">▲ supportive</b>' : r.t.v < 0 ? '<b class="d">▼ adverse</b>' : '<b>● neutral</b>'}</td></tr>`).join('');
    const sw = T.swing ? `The biggest swing factor right now is <b>${E(T.swing.K.n)}</b> (${E(T.swing.t.t)}), because it points ${T.swing.t.v * T.sc < 0 ? 'against' : 'the same way as'} the overall lean.` : '';
    return head + '<div class="jd-pm-b">' + hero + impact
      + `<h4 class="jb-h">1 · Why is it behaving like this?</h4><ul class="jb-ul">${W.map((x) => `<li>${x}</li>`).join('')}</ul>`
      + `<h4 class="jb-h">2 · What can come next — levels, reversals, breakouts</h4>${lvRows || '<div class="jd-fn">Levels are still loading.</div>'}`
      + (o.atr ? `<div class="jd-fn">Stops use about ⅓–½ of the recent average daily range (${f(o.atr)}) beyond the level, so normal noise does not trigger them. Levels: classic pivots, previous day and 5-day high/low, 20/60-session and 52-week extremes, 50/200-day averages and round numbers.</div>` : '')
      + `<h4 class="jb-h">3 · How to handle positions in this market</h4><ul class="jb-ul">${ac.map((x) => `<li>${x}</li>`).join('')}</ul>`
      + `<h4 class="jb-h">4 · Alerts <small>fire in this page while it is open — a pop-up here and a browser notification if you allow it</small></h4><div class="jb-als">${alHTML || '<div class="jd-fn">No levels available yet.</div>'}</div>`
      + `<h4 class="jb-h">5 · All eight readings together — what decides the next move</h4><table class="jb-all"><thead><tr><th>Reading</th><th>Now</th><th>Detail</th><th>For Indian equities</th></tr></thead><tbody>${trs}</tbody></table>`
      + `<div class="jb-vd"><b>${T.sup} supportive · ${T.adv} adverse · ${T.mix} neutral → ${T.verdict}.</b> ${sw} The next big move usually starts when the swing factor flips or when Nifty itself breaks its nearest level — so watch those two together.</div>`
      + '<div class="jd-fn"><b>Please read:</b> this is a rule-based reading of delayed quotes and daily levels, built to organise information — it is not investment advice, a recommendation or a guaranteed forecast, and levels can fail. Weights used for the combined view are this dashboard’s own choice, not market laws. Decide your own size and stops, or consult a registered adviser.</div></div>';
  }

  const CSS = `
  .jb-hero{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:8px}.jb-hero>div{background:#f2f5fc;border:1px solid #dbe3f4;border-radius:10px;padding:7px 10px;min-width:0}.jb-hero small{display:block;font-size:9.5px;letter-spacing:.08em;font-weight:800;color:#5a6a8e;text-transform:uppercase}.jb-hero b{font-size:15px;color:#0b1330;word-break:break-word}
  .jb-hero.u>div:last-child{background:#e3f6ec;border-color:#9fdcb9}.jb-hero.d>div:last-child{background:#fde7ea;border-color:#f1a8b3}
  .jb-h{margin:14px 0 6px;font-size:12.5px;letter-spacing:.02em;color:#14306e;border-bottom:2px solid #c9a24a;padding-bottom:3px}.jb-h small{font-weight:600;color:#5a6a8e;letter-spacing:0}
  .jb-ul{margin:0;padding-left:18px;font-size:12.6px;line-height:1.5;color:#1a2540}.jb-ul li{margin:4px 0}
  .jb-imp{font-size:12px;background:#fff8e1;border:1px solid #ecd88a;border-radius:8px;padding:5px 9px;margin:4px 0;color:#4a3a05}.jb-imp .u,.jb-vd .u,.jb-all .u{color:#0c7a42}.jb-imp .d,.jb-vd .d,.jb-all .d{color:#b3162f}
  .jb-sc{border-radius:10px;padding:7px 11px;margin:7px 0;border:1px solid #dbe3f4;border-left:5px solid #8a96b5;background:#f8faff}.jb-sc.u{border-left-color:#12a05a}.jb-sc.d{border-left-color:#e03a3a}.jb-sc h5{margin:0 0 4px!important;font-size:12.5px!important;color:#0b1330!important}.jb-sc p{margin:4px 0 0;font-size:12.3px;line-height:1.45;color:#1a2540}
  .jb-lv{border-collapse:collapse;font-size:12px;width:100%}.jb-lv td{text-align:left;padding:2px 6px 2px 0;vertical-align:top;border-bottom:1px dashed #e1e7f5}.jb-lv td:first-child{width:150px;font-weight:800;color:#35466e}
  .jb-als{display:flex;flex-wrap:wrap;gap:6px}.jb-al{cursor:pointer;font:700 11.5px "Segoe UI",sans-serif;border:1px solid #bccae6;background:#fff;color:#14306e;border-radius:9px;padding:5px 10px;text-align:left}.jb-al small{display:block;font-weight:600;color:#5a6a8e;font-size:10.5px}.jb-al.on{background:#fff3c9;border-color:#d9b23a}
  .jb-all{width:100%;border-collapse:collapse;font-size:12.2px}.jb-all th{text-align:left;font-size:10.5px;letter-spacing:.06em;color:#7b88a6;padding:4px 6px;border-bottom:1px solid #dfe5f2}.jb-all td{padding:5px 6px;border-bottom:1px solid #eef1f7;vertical-align:top;color:#1a2540}.jb-all tr.me td{background:#eef3ff;font-weight:700}
  .jb-vd{margin-top:8px;padding:8px 11px;border-radius:9px;background:#eef3ff;border:1px solid #c9d6f2;font-size:12.6px;line-height:1.5;color:#0b1330}
  .j3 .jd-br{font-size:9.5px;font-weight:800;padding:3px 6px;border-radius:7px;flex:none;border:1px solid rgba(255,214,102,.7);background:rgba(255,214,102,.18);color:#ffe08a;cursor:pointer;white-space:nowrap}.j3 .jd-br:hover{background:rgba(255,214,102,.32)}
  .j3-top .jb-btns{display:flex;gap:3px;align-items:center;flex:none}.j3-top .j3-nm{font-size:9.5px;letter-spacing:.01em;min-width:0;overflow:hidden;text-overflow:ellipsis}.j3-top .jd-xr{padding:3px 6px!important}.j3-nm.jb-sm{font-size:10px}.j3-top.jb-sub{margin-top:2px}
  #jbToast{position:fixed;left:50%;top:14px;transform:translate(-50%,-120%);z-index:99990;max-width:min(560px,calc(100vw - 24px));padding:10px 36px 10px 14px;border-radius:12px;background:linear-gradient(150deg,#1d3f8f,#0b1330);color:#fff;border:2px solid #e4c97a;box-shadow:0 12px 30px rgba(0,0,0,.5);font:700 13px/1.4 "Segoe UI",system-ui,sans-serif;transition:transform .35s cubic-bezier(.3,1.4,.5,1)}#jbToast.on{transform:translate(-50%,0)}#jbToast button{position:absolute;right:8px;top:8px;background:transparent;border:0;color:#cfd8f3;cursor:pointer;font-size:14px}
  @media(max-width:700px){.jb-hero{grid-template-columns:repeat(2,minmax(0,1fr))}.jb-lv td:first-child{width:96px}}
  @media(prefers-color-scheme:dark){.jb-hero>div,.jb-sc,.jb-vd{background:#16203a;border-color:#2b3a63}.jb-hero b,.jb-sc h5,.jb-vd{color:#e9efff!important}.jb-ul,.jb-sc p,.jb-all td{color:#d6def5}.jb-lv td:first-child{color:#aebbe0}.jb-all tr.me td{background:#1d2a4c}.jb-imp{background:#2a2410;border-color:#6b5a1c;color:#f3e3a4}.jb-al{background:#16203a;color:#cfdcff;border-color:#34457a}.jb-al.on{background:#3a3210}.jb-h{color:#cfdcff}}
  @media print{#jbToast{display:none!important}}`;
  const st = document.createElement('style'); st.id = 'jbcss'; st.textContent = CSS; document.head.appendChild(st);

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-jb-al]'); if (!b) return; e.preventDefault(); const p = b.getAttribute('data-jb-al').split('|'); toggleAlert(p[0], parseFloat(p[1]), p[2], p.slice(3).join('|'));
    if (window.jdRepaintPop) window.jdRepaintPop();
  });
  window.jcBrief = { html, check, keys: KEYS, together, read };
})();
