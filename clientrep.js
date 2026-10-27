/* Joshi's Corner — Client Reports: personalised Morning Update (auto-built 08:45 IST) and Closing Bell (auto-built 16:00 IST) for each watchlist (= one client).
   Per stock: conviction rate (stocks are sorted by it), trend and its road-map (where the trend turns), day-trading verdict — TRADE with levels or AVOID — brief view,
   and a news diary from Google News. Everything is computed here in the browser from delayed Yahoo data with the same engine as X-ray and Today's Calls.
   PRIVACY: client names and watchlists never leave this browser / your own Google Drive (the existing watchlist sync); nothing is written to the public repository.
   The automatic build runs while this page is open (a closed browser cannot build anything); otherwise press the button — a list of 15 stocks takes about a minute.
   Rule-based research input — not investment advice and not a guaranteed outcome. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v, d) => (num(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '—');
  const sg = (v, d) => (num(v) ? (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) : '—');
  const LS = 'jc_cr_v1', LSC = 'jc_cr_cache_v1';
  const ist = () => new Date(Date.now() + 19800000), istDay = () => ist().toISOString().slice(0, 10), istMinNow = () => ist().getUTCHours() * 60 + ist().getUTCMinutes();
  let P = { names: {}, auto: true }; try { P = Object.assign(P, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { }
  const saveP = () => { try { localStorage.setItem(LS, JSON.stringify(P)); } catch (e) { } };
  let CACHE = {}; try { CACHE = JSON.parse(localStorage.getItem(LSC) || '{}') || {}; } catch (e) { }
  const saveC = () => { try { const k = Object.keys(CACHE).sort(); while (k.length > 14) delete CACHE[k.shift()]; localStorage.setItem(LSC, JSON.stringify(CACHE)); } catch (e) { try { CACHE = {}; localStorage.removeItem(LSC); } catch (e2) { } } };
  const R = { busy: false, msg: '', cur: null, mode: 'morning', listId: null, prog: '' };

  /* ---------- analysis of one stock ---------- */
  const FLAGS = [[/result|earning|profit|loss|q[1-4]\b|quarter/i, 'Results'], [/order|contract|wins|bags|awarded/i, 'Order / contract'], [/upgrade|downgrade|target price|rating|initiat/i, 'Broker call'], [/block deal|bulk deal|stake|promoter|pledge/i, 'Stake / deal'], [/dividend|bonus|split|buyback|rights issue/i, 'Corporate action'], [/sebi|probe|raid|fraud|penalty|fine|notice|ed \b/i, 'Regulatory'], [/merger|acquisition|acquire|demerger|takeover|ipo|listing/i, 'M&A / listing']];
  async function getNews(base, hours) {
    try {
      const items = await fetchNews(base), now = Date.now(), out = [];
      items.forEach((it) => { const t = Date.parse(it.date) || 0; if (!t || now - t > hours * 3600e3) return; const m = /^(.*) - ([^-]+)$/.exec(it.title || ''), title = m ? m[1] : it.title, src = m ? m[2] : ''; const flags = FLAGS.filter((f) => f[0].test(title)).map((f) => f[1]); out.push({ t, title, src, flags, link: it.link }); });
      return out.sort((a, b) => b.t - a.t).slice(0, 4);
    } catch (e) { return null; }
  }
  function conviction(d) {
    const p = d.plan, pts = p && p.pts ? p.pts : []; let S = p && num(p.score) ? p.score : 0;
    if (!pts.length) { const x = d.x; S = (x.c > x.e20 ? 1 : -1) + (x.e20 > x.e50 ? 1 : -1) + (num(x.rsi) ? (x.rsi > 55 ? 1 : x.rsi < 45 ? -1 : 0) : 0); }
    const tot = pts.reduce((a, q) => a + Math.abs(q.v), 0), same = pts.reduce((a, q) => a + (q.v * S > 0 ? Math.abs(q.v) : 0), 0), agree = tot ? same / tot : 0.5;
    let conv = Math.round(Math.min(1, Math.abs(S) / 9) * 60 + agree * 40), dir = S > 1.5 ? 'Bullish' : S < -1.5 ? 'Bearish' : 'Neutral';
    const ts = d.trend ? ({ up: 1, pull: 1, brk: 1, ext: 1, top: 0, acc: 0, dead: -1, down: -1, dist: -1, side: 0 }[d.trend.type] || 0) : 0;
    if (ts && dir !== 'Neutral' && (ts > 0) !== (S > 0)) { conv = Math.round(conv * 0.6); dir = 'Mixed (day vs trend)'; }
    return { S, conv, dir };
  }
  function stanceOf(T, cv, d) {
    const ns = T.ordered[0] ? T.ordered[0][0] : null, inv = T.invalid;
    switch (T.type) {
      case 'up': return ['Positive', 'g', `Hold; add only on dips that hold ${f2(inv)}. Stop-loss below ${f2(inv)}.`];
      case 'pull': return ['Positive — pull-back', 'g', `Pull-back inside an up-trend: accumulate near support while ${f2(inv)} holds; exit below it.`];
      case 'brk': return ['Positive — fresh breakout', 'g', `Breakout from a base: hold; it fails on a close back below ${f2(inv)}.`];
      case 'ext': return ['Positive but stretched', 'a', `Avoid chasing; protect profits with a stop under ${f2(inv)}.`];
      case 'top': return ['Cautious — topping risk', 'r', `Book part profits; trend breaks below ${f2(inv)}.`];
      case 'acc': return ['Neutral → positive', 'a', `Base/accumulation: wait for a close above ${f2(T.hi20)} on volume before adding.`];
      case 'dead': return ['Negative — relief bounce', 'r', `Avoid fresh buying; rallies toward ${f2(inv)} are for lightening. Weakness below ${ns ? f2(ns) : 'recent lows'}.`];
      case 'down': return ['Negative', 'r', `Avoid; no base yet. Reconsider only above ${f2(inv)}.`];
      case 'dist': return ['Cautious', 'r', `Sellers quietly stronger; a close below ${f2(T.lo20)} confirms weakness.`];
      default: return ['Neutral', 'a', `Range ${f2(T.lo20)} – ${f2(T.hi20)}: wait for a close beyond it.`];
    }
  }
  function roadmap(T, d) {
    const lv = (a) => a.slice(0, 3).map((s) => f2(s[0])).join(' · ');
    if (T.kind === 'down') return { up: T.invalid, dn: T.ordered[0] ? T.ordered[0][0] : null, txt: `Trend turns <b>bullish only above ${f2(T.invalid)}</b> (last lower high), confirmed by volume. Weakness resumes below ${T.ordered[0] ? f2(T.ordered[0][0]) : 'recent lows'}${T.ordered.length ? '; support zones: ' + lv(T.ordered) : ''}.` };
    if (T.kind === 'up') return { up: T.ordered[0] ? T.ordered[0][0] : null, dn: T.invalid, txt: `Trend <b>stays bullish while above ${f2(T.invalid)}</b>; it turns <b>bearish on a close below it</b>. Resistance / stall zones: ${T.ordered.length ? lv(T.ordered) : 'none above (all-time or 52-week high zone)'}.` };
    return { up: T.hi20, dn: T.lo20, txt: `Range-bound: turns <b>bullish above ${f2(T.hi20)}</b>, <b>bearish below ${f2(T.lo20)}</b> (closing basis, ideally on 1.5× volume).` };
  }
  function dayBox(d) {
    const p = d.plan; if (d.idx) return { go: false, why: ['not applicable to indices'], lv: [] };
    const piv = d.piv, lv = [['R1', piv.R1], ['CPR top', piv.cprTop], ['Pivot', piv.P], ['CPR bottom', piv.cprBot], ['S1', piv.S1], ['Prev high', d.x.h], ['Prev low', d.x.l]].filter((q) => num(q[1])).sort((a, b) => b[1] - a[1]);
    if (!p) return { go: false, why: ['plan unavailable'], lv };
    if (p.sides && p.sides.length) { const s = p.sides[0]; return { go: true, side: s.dir > 0 ? 'BUY' : 'SELL', entry: s.entry, sl: s.sl, t1: s.t1, t2: s.t2, rr: s.rr1, grade: p.grade, lv }; }
    return { go: false, why: p.reasons && p.reasons.length ? p.reasons : ['confluence not met'], lv, score: p.score };
  }
  async function today(d, mkt) { // Closing Bell: what happened to this morning's plan
    try {
      const k = d.hist.length - 1, last = d.hist[k], td = istDay(); if (!last || last.date !== td || !d.sbars || d.sbars.length < 25 || d.idx) return null;
      const pl = JCE.dayPlanFor(d.hist, k - 1, mkt || {}); if (!pl || !pl.sides || !pl.sides.length) return { call: false };
      const sd = pl.sides[0], ev = JCE.evalDay(sd, d.sbars, pl.atr, true);
      return { call: true, side: sd.side, entry: sd.entry, sl: sd.sl, t1: sd.t1, t2: sd.t2, state: ev.state, R: ev.R, retPct: ev.retPct };
    } catch (e) { return null; }
  }
  const dayMove = (d) => (num(d.chg) ? d.chg : null);
  async function analyse(sym, mode, mkt) {
    const yf = symYf(sym), base = symBase(sym);
    try {
      const [d, news] = await Promise.all([window.jcXrayApi.load(yf), getNews(base, mode === 'morning' ? 96 : 30)]);
      if (d.err) return { sym: base, err: d.err, news };
      const T = window.jcXrayApi.trendData(d); if (!T) return { sym: base, err: 'not enough history', news };
      d.trend = T; const cv = conviction(d), st = stanceOf(T, cv, d), rm = roadmap(T, d), day = dayBox(d), tdy = mode === 'closing' ? await today(d, mkt) : null;
      const pos = num(d.dayH) && num(d.dayL) && d.dayH > d.dayL ? (d.cmp - d.dayL) / (d.dayH - d.dayL) : null;
      return { sym: base, name: d.name || base, cmp: d.cmp, chg: dayMove(d), conv: cv.conv, dir: cv.dir, S: cv.S, T, st, rm, day, tdy, news, pos, rv: d.x.rv, rsi: d.x.rsi, hi52: d.hi52, lo52: d.lo52 };
    } catch (e) { return { sym: base, err: (e && e.message) || 'fetch failed', news: null }; }
  }

  /* ---------- report HTML ---------- */
  const CSS = `.cr{font:12px/1.45 'Segoe UI',-apple-system,Roboto,sans-serif;color:#0a1430;max-width:900px;margin:0 auto;background:#fff}
  .cr *{box-sizing:border-box}.cr .crhd{background:linear-gradient(120deg,#17388a,#0b1d4d);color:#fff;padding:14px 18px;border-bottom:3px solid #c9a24a;-webkit-print-color-adjust:exact;print-color-adjust:exact}.cr .crhd b{font-size:20px;letter-spacing:.3px;display:block}.cr .crhd small{opacity:.85;font-weight:600}.cr .crhd .rt{float:right;text-align:right;font-size:11px;opacity:.95}
  .cr h3{margin:14px 0 6px;font-size:13.5px;color:#0b2260;border-bottom:2px solid #c9a24a;padding-bottom:3px}.cr .pad{padding:0 14px 14px}.cr .mk{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}.cr .mk div{border:1px solid #d6def0;border-radius:8px;padding:5px 8px;background:#f6f8fd}.cr .mk small{display:block;font-size:9.5px;letter-spacing:.06em;color:#5a6a8e;font-weight:800}.cr .mk b{font-size:13px}
  .cr table{width:100%;border-collapse:collapse}.cr th{text-align:left;font-size:10px;letter-spacing:.05em;color:#5a6a8e;border-bottom:1px solid #cdd6ea;padding:4px 5px}.cr td{padding:4px 5px;border-bottom:1px solid #e7ecf6;vertical-align:top}
  .cr .g{color:#08783a}.cr .r{color:#c0102e}.cr .a{color:#a86a00}.cr .bar{display:inline-block;width:60px;height:7px;border-radius:4px;background:#e3e8f4;vertical-align:middle;margin-right:5px;overflow:hidden}.cr .bar i{display:block;height:100%;background:#2b59c3}
  .cr .chip{display:inline-block;font-size:10px;font-weight:900;padding:2px 8px;border-radius:99px;background:#e6ebf7;color:#34456a;letter-spacing:.3px}.cr .chip.g{background:#c9f0da;color:#06612f}.cr .chip.r{background:#fbd0d8;color:#a10b27}.cr .chip.a{background:#fdeab6;color:#7a4b00}
  .cr .card{border:1px solid #cdd6ea;border-radius:10px;margin:9px 0;overflow:hidden;break-inside:avoid;page-break-inside:avoid}.cr .crh{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 11px;background:#eef2fb;border-bottom:1px solid #cdd6ea;flex-wrap:wrap}.cr .crh b{font-size:14px}.cr .crc{padding:8px 11px}.cr .crc p{margin:4px 0}
  .cr .go{border-radius:8px;padding:6px 9px;margin:6px 0}.cr .go.g{background:#e3f6ec}.cr .go.r{background:#fde6ea}.cr .go.n{background:#eef1f8}.cr .go b{font-size:13px}.cr .lv{display:flex;gap:6px;flex-wrap:wrap;margin-top:3px}.cr .lv span{background:#fff;border:1px solid #d6def0;border-radius:6px;padding:1px 6px;font-size:10.5px}
  .cr .nw{margin:2px 0;font-size:11.5px}.cr .nw small{color:#5a6a8e}.cr .ft{font-size:10px;color:#5a6a8e;border-top:1px solid #cdd6ea;margin-top:12px;padding-top:6px}
  @media(max-width:700px){.cr .mk{grid-template-columns:repeat(2,1fr)}.cr table{font-size:11px}}
  .cr .crhd{background:linear-gradient(180deg,#fffdf6,#fff8e6)!important;border:3px double #D4AF37!important;outline:1px solid #E4C97A;outline-offset:3px;border-radius:14px;margin:12px 14px}.cr .crhd,.cr .crhd b,.cr .crhd small,.cr .crhd .rt{color:#6b5314!important}
  .cr h3{color:#8A6D1F!important;letter-spacing:.06em;text-transform:uppercase;border-bottom-color:#C7A03C!important}.cr .card{border:2px solid #D4AF37!important;border-radius:14px!important;background:linear-gradient(180deg,#fffdf6,#fff8e6)}.cr .crh{background:#f6ecc9!important}
  .cr th{background:#f6ecc9;color:#6b5314!important}.cr .olWrap{padding:0}.cr .olF h3{text-transform:none}
  @media print{.cr{max-width:none}.cr .card{break-inside:avoid}}`;
  function mktStrip() {
    try {
      const C = window.jdCtx && window.jdCtx(); if (!C) return ''; const q = C.S.q, md = C.moodScore(), g = (s) => q[s] && q[s].p != null ? q[s] : null;
      const it = (n, s, dp) => { const x = g(s); if (!x) return ''; const p = x.pc ? (x.p - x.pc) / x.pc * 100 : null; return `<div><small>${n}</small><b>${f2(x.p, dp)}</b> <span class="${p >= 0 ? 'g' : 'r'}">${p == null ? '' : sg(p) + '%'}</span></div>`; };
      return `<div class="mk">${it('NIFTY 50', '^NSEI', 2)}${it('BANK NIFTY', '^NSEBANK', 2)}${it('SENSEX', '^BSESN', 2)}${it('INDIA VIX', '^INDIAVIX', 2)}${it('USD / INR', 'USDINR=X', 3)}${it('BRENT', 'BZ=F', 2)}${md ? `<div><small>MARKET MOOD</small><b>${md.score} / 100</b> <span>${C.moodLabel(md.score)[0].toLowerCase()}</span></div>` : ''}${it('US 10Y', '^TNX', 2)}</div>`;
    } catch (e) { return ''; }
  }
  const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 90 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  function reportHTML(listName, client, recs, mode, note, frames) {
    const dt = ist(), dstr = dt.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), tstr = dt.toISOString().slice(11, 16);
    const ok = recs.filter((r) => !r.err).sort((a, b) => b.conv - a.conv || Math.abs(b.S) - Math.abs(a.S)), bad = recs.filter((r) => r.err);
    const title = mode === 'morning' ? 'Morning Update' : 'Closing Bell';
    const glance = ok.map((r, i) => `<tr><td>${i + 1}</td><td><b>${E(r.sym)}</b></td><td>${f2(r.cmp)}</td><td class="${(r.chg || 0) >= 0 ? 'g' : 'r'}">${sg(r.chg)}%</td><td><span class="bar"><i style="width:${r.conv}%"></i></span><b>${r.conv}%</b> <small>${r.dir}</small></td><td><span class="chip ${r.st[1]}">${E(r.st[0])}</span></td><td>${r.day.go ? `<b class="${r.day.side === 'BUY' ? 'g' : 'r'}">${r.day.side}</b> ${f2(r.day.entry)}` : '<b class="a">AVOID</b>'}</td><td>${E(r.T.state.replace('UPTREND — ', '↑ ').replace('DOWNTREND — ', '↓ ').replace('SIDEWAYS — ', '↔ '))}</td></tr>`).join('');
    const card = (r) => {
      const dbx = r.day.go
        ? `<div class="go ${r.day.side === 'BUY' ? 'g' : 'r'}"><b>DAY TRADE: ${r.day.side === 'BUY' ? '▲ BUY' : '▼ SELL'}</b> (grade ${E(r.day.grade)}) — enter on a 5-minute close ${r.day.side === 'BUY' ? 'above' : 'below'} <b>${f2(r.day.entry)}</b> · stop-loss <b class="r">${f2(r.day.sl)}</b> · target 1 <b class="g">${f2(r.day.t1)}</b> · target 2 <b class="g">${f2(r.day.t2)}</b> · R:R ${num(r.day.rr) ? r.day.rr.toFixed(1) : '—'}. Square off by 3:15 PM; skip it if the stock gaps beyond the entry.</div>`
        : `<div class="go n"><b>DAY TRADE: AVOID</b> — ${E((r.day.why || []).join(' · '))}.${r.day.lv.length ? `<div class="lv">${r.day.lv.map((l) => `<span>${E(l[0])} ${f2(l[1])}</span>`).join('')}</div>` : ''}</div>`;
      const tdy = mode === 'closing' && r.tdy ? `<p><b>Today:</b> ${sg(r.chg)}% · closed in the ${r.pos == null ? '' : r.pos >= 0.66 ? 'top third' : r.pos <= 0.33 ? 'bottom third' : 'middle'} of the day range${num(r.rv) ? ' · volume ' + r.rv.toFixed(1) + '× average' : ''}. ${r.tdy.call ? `Morning plan (${r.tdy.side} above ${f2(r.tdy.entry)}): <b>${E({ T2: 'Target 2 reached', T1: 'Target 1 reached', SL: 'Stop-loss hit', NT: 'not triggered', SKIP: 'skipped (gap/chase)', WAIT: 'not triggered', LIVE: 'still open', 'EOD+': 'closed in profit at the bell', 'EOD−': 'closed at a loss at the bell' }[r.tdy.state] || r.tdy.state)}</b>${r.tdy.state !== 'NT' && r.tdy.state !== 'SKIP' && r.tdy.state !== 'WAIT' && num(r.tdy.R) ? ' (' + sg(r.tdy.R, 2) + 'R)' : ''}.` : 'No day-trade call was issued today.'}</p>` : mode === 'closing' ? `<p><b>Today:</b> ${sg(r.chg)}%${num(r.rv) ? ' · volume ' + r.rv.toFixed(1) + '× average' : ''}.</p>` : '';
      const nw = r.news && r.news.length ? `<p class="nw">📰 <b>${E(r.news[0].title)}</b> <small>${E(r.news[0].src)} · ${ago(r.news[0].t)}${r.news.length > 1 ? ' · +' + (r.news.length - 1) + ' more in the News Diary' : ''}</small></p>` : '<p class="nw"><small>📰 No fresh headlines found.</small></p>';
      return `<div class="card"><div class="crh"><span><b>${E(r.sym)}</b> <small>${E(r.name)}</small> &nbsp; ${f2(r.cmp)} <b class="${(r.chg || 0) >= 0 ? 'g' : 'r'}">${sg(r.chg)}%</b></span><span><span class="bar"><i style="width:${r.conv}%"></i></span><b>Conviction ${r.conv}%</b> <small>${r.dir}</small> &nbsp; <span class="chip ${r.st[1]}">${E(r.st[0])}</span></span></div>
        <div class="crc"><p><b>View:</b> trend — <b>${E(r.T.state)}</b>. ${E(r.st[2])}</p>${tdy}${dbx}
        <p><b>Trend road-map:</b> ${r.rm.txt}</p>${r.T.ev[0] ? `<p><small>${r.T.ev[0]}</small></p>` : ''}${nw}</div></div>`;
    };
    const diary = ok.concat(bad).filter((r) => r.news && r.news.length).map((r) => `<h4 style="margin:8px 0 2px;font-size:12px">${E(r.sym)}</h4>` + r.news.map((n) => `<div class="nw">• ${E(n.title)} <small>— ${E(n.src)} · ${ago(n.t)}${n.flags.length ? ' · <b>' + n.flags.map(E).join(', ') + '</b>' : ''}</small></div>`).join('')).join('') || '<div class="nw"><small>No news found in the window for these stocks (or the news feed was unreachable).</small></div>';
    return `<div class="cr"><div class="crhd"><span class="rt">${E(dstr)}<br>built ${tstr} IST</span><b>Joshi’s Corner · SSJ Finance</b><small>${title} — prepared for <b>${E(client || listName)}</b> · watchlist “${E(listName)}” · ${recs.length} stocks</small></div><div class="pad">
      ${note ? `<p style="background:#fff8e1;border:1px solid #ecd88a;border-radius:8px;padding:6px 10px"><b>Note:</b> ${E(note)}</p>` : ''}${frames || mktStrip()}<!--BSA-->
      <h3>Watchlist at a glance — sorted by conviction</h3><div style="overflow-x:auto"><table><thead><tr><th>#</th><th>Stock</th><th>CMP</th><th>Day</th><th>Conviction</th><th>Stance</th><th>Day trade</th><th>Trend</th></tr></thead><tbody>${glance}</tbody></table></div>
      <p style="font-size:10.5px;color:#5a6a8e;margin:4px 0">Conviction = how strongly and how consistently trend, ADX, RSI, MACD, volume, CPR and the 20-day range agree (0–100). It measures agreement of signals, not the chance of profit.</p>
      <h3>${mode === 'morning' ? 'Stock-by-stock views, levels and road-map for today' : 'Stock-by-stock review of today and road-map for the next session'}</h3>${ok.map(card).join('')}
      ${bad.length ? `<p><small>Could not analyse: ${bad.map((r) => E(r.sym) + ' (' + E(r.err) + ')').join(', ')}.</small></p>` : ''}
      <h3>News diary</h3>${diary}
      <!--SRCH--><div class="ft"><b>Important:</b> prepared from delayed market data with fixed, rule-based formulas. It is research information for discussion with your adviser — not investment advice, not a recommendation to buy or sell and not a guarantee of any outcome. Levels can fail; markets carry risk. Decide your position size and stop-loss yourself, and review before acting. Past behaviour of a stock does not assure future results.</div></div></div>`;
  }

  /* ---------- building ---------- */
  /* STRICTLY LOCKED: client reports use only the stock list saved on the client record (Drive, behind the admin passcode). Terminal watchlists are never used here. */
  const CDs = () => (window.jcClients && window.jcClients.S) || null;
  const isOpen = () => { const c = CDs(); return !!(c && c.ok); };
  const listsAll = () => { const c = CDs(); return c && c.ok ? (c.clients || []).map((x) => ({ id: x.listId || x.id, cid: x.id, name: x.name || x.listName, syms: (x.syms || []).slice(), chat: x.chat || '' })) : []; };
  async function build(list, mode, quiet) {
    const syms = (list.syms || []).slice(); if (!syms.length) return null;
    let mkt = {}; try { mkt = (await wlMkt(false)) || {}; } catch (e) { }
    const out = [], q = syms.slice(); let n = 0;
    const w = async () => { while (q.length) { const s = q.shift(); out.push(await analyse(s, mode, mkt)); n++; R.prog = `${list.name}: ${n}/${syms.length} stocks`; if (!quiet) paintStatus(); else await new Promise((r) => setTimeout(r, 2500)); } };
    await Promise.all(quiet ? [w()] : [w(), w(), w()]);
    let frames = ''; try { if (window.jcOutlook) frames = await window.jcOutlook.snapshot(mode); } catch (e) { }
    const html = reportHTML(list.name, list.name, out, mode, P.notes && P.notes[list.id], frames);
    CACHE[istDay() + '|' + mode + '|' + list.id] = { t: Date.now(), html, n: out.length, bad: out.filter((r) => r.err).length }; saveC();
    return html;
  }
  async function run(listIds, mode, auto) {
    if (R.busy) return; R.auto = !!auto; R.busy = true; R.mode = mode; R.msg = 'Building…'; paintStatus();
    try { let last = null; for (const id of listIds) { const l = listsAll().find((x) => x.id === id); if (!l) continue; const h = await build(l, mode, R.auto); if (h) { last = id; } } R.msg = last ? 'Done ' + ist().toISOString().slice(11, 16) + ' IST' : 'Nothing to build — the list is empty.'; if (last) { R.cur = { id: last, mode }; } }
    catch (e) { R.msg = 'Failed: ' + ((e && e.message) || e); } finally { R.busy = false; R.prog = ''; paint(); }
  }
  function openPrint(html) {
    const old = $('crFrame'); if (old) old.remove(); const f = document.createElement('iframe'); f.id = 'crFrame'; f.style.cssText = 'position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;z-index:-1'; document.body.appendChild(f);
    const d = f.contentWindow.document; d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>Client report ${istDay()}</title><style>@page{size:A4;margin:10mm}body{margin:0}${CSS}</style></head><body>${html}</body></html>`); d.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { alert('Print failed: ' + e.message); } }, 500);
  }

  /* ---------- panel ---------- */
  function paintStatus() { const el = $('crSt'); if (el) el.innerHTML = R.busy ? `⏳ ${E(R.prog || R.msg)}` : E(R.msg || ''); }
  function paint() {
    const el = $('pClient'); if (!el || !el.classList.contains('active')) return; const L = listsAll(), td = istDay(), open = isOpen();
    if (!R.listId || !L.find((l) => l.id === R.listId)) R.listId = L[0] && L[0].id;
    const key = (m, id) => CACHE[td + '|' + m + '|' + id], cur = L.find((l) => l.id === R.listId), kc = cur ? key(R.mode, cur.id) : null;
    if (cur && window.jcOutlook) window.jcOutlook.setList({ id: cur.id, name: cur.name, syms: cur.syms }); else if (window.jcOutlook) window.jcOutlook.setList(null);
    const tm = (c) => new Date(c.t + 19800000).toISOString().slice(11, 16);
    const rows = L.map((l) => { const a = key('morning', l.id), b = key('closing', l.id); return `<tr><td><b>${E(l.name)}</b></td><td>${l.syms.length}</td><td>${l.chat ? '✓ linked' : '<small style="color:#b3261e">no chat id</small>'}</td><td>${a ? `<button class="ghostBtn" data-cropen="morning|${E(l.id)}">Open ${tm(a)}</button>` : '<small>—</small>'}</td><td>${b ? `<button class="ghostBtn" data-cropen="closing|${E(l.id)}">Open ${tm(b)}</button>` : '<small>—</small>'}</td></tr>`; }).join('');
    const body = !open ? `<div class="note">🔒 <b>Client reports are locked to each client’s saved watchlist.</b> Enter the admin passcode in <b>Client dashboards (Telegram)</b> just below — your linked clients and their locked stock lists then appear here. Terminal watchlists are never used for client reports.</div>`
      : !L.length ? `<div class="note">No client is linked yet. Link a watchlist to a client in <b>Client dashboards (Telegram)</b> below; its stock list is then locked and used here.</div>`
      : `<div class="bar2"><label>Client <select class="sel" id="crList">${L.map((l) => `<option value="${E(l.id)}" ${l.id === R.listId ? 'selected' : ''}>${E(l.name)} (${l.syms.length})</option>`).join('')}</select></label>
        <button class="goBtn ${R.mode === 'morning' ? 'on' : ''}" data-crrun="morning" ${R.busy ? 'disabled' : ''}>☀ Morning Update</button><button class="goBtn ${R.mode === 'closing' ? 'on' : ''}" data-crrun="closing" ${R.busy ? 'disabled' : ''}>🔔 Closing Bell</button><button class="ghostBtn" data-crrun="all" ${R.busy ? 'disabled' : ''}>Build ${R.mode === 'closing' ? 'Closing Bell' : 'Morning Update'} for ALL clients</button>
        <label style="font-size:12px"><input type="checkbox" id="crAuto" ${P.auto ? 'checked' : ''}> auto-build 08:45 &amp; 16:00 IST (page must be open)</label><span id="crSt" style="font-size:12px;color:#34456a"></span></div>
        ${(() => { const u = (window.jcClients && window.jcClients.unlinked && window.jcClients.unlinked()) || []; return u.length ? `<div class="note" style="font-size:12px">⚠ Not shown here because not linked to a client yet: ${u.map((x) => '<b>' + E(x.name) + '</b> (' + x.n + ')').join(', ')}. Open <b>Client dashboards (Telegram)</b> below, pick the Telegram chat and press <b>Link client</b> — it then appears in this list.</div>` : ''; })()}
        <table class="cl"><thead><tr><th>Client (locked list)</th><th>Stocks</th><th>Telegram</th><th>Morning (today)</th><th>Closing (today)</th></tr></thead><tbody>${rows}</tbody></table>
        ${kc ? `<div class="bar2"><b>${E(cur.name)} · ${R.mode === 'closing' ? 'Closing Bell' : 'Morning Update'}</b><span style="font-size:12px;color:#5a6a8e">built ${tm(kc)} IST${kc.bad ? ' · ' + kc.bad + ' stock(s) failed' : ''}</span><button class="goBtn" data-crtg="${E(cur.cid)}">📨 Send dashboard to ${E(cur.name)} on Telegram</button><button class="goBtn" data-crprint="1">🖨 Print / Save as PDF</button></div><div class="pre">${kc.html.replace('<!--BSA-->', window.jcOutlook ? window.jcOutlook.buttons() : '').replace('<!--SRCH-->', window.jcOutlook ? window.jcOutlook.search() : '')}</div>` : `<div class="note">Press <b>${R.mode === 'closing' ? 'Closing Bell' : 'Morning Update'}</b> to build ${E(cur.name)}’s report for today (about a minute for 15 stocks).</div>`}`;
    el.innerHTML = `<style>${CSS}.crb{padding:10px 14px}.crb .bar2{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}.crb table.cl{width:100%;border-collapse:collapse;font-size:12.5px}.crb table.cl td,.crb table.cl th{border-bottom:1px solid #dfe5f2;padding:5px 6px;text-align:left}.crb .sel{padding:5px 8px;border:1px solid #b8c6e6;border-radius:8px}.crb .goBtn.on{box-shadow:0 0 0 2px #D4AF37}
      .crb .pre{border:2px solid #D4AF37;border-radius:14px;margin-top:10px;overflow:hidden;background:#fffdf6}</style>
      <div class="crb"><h2 style="margin:0 0 4px;color:#8A6D1F">📋 Client Reports <small style="font-weight:600;color:#5a6a8e">— Morning Update and Closing Bell, one locked client list at a time</small></h2>
      <div style="font-size:12px;color:#34456a">Each report opens with the day’s outlook drawn from the scheduled morning / evening reports, then the client’s Buy · Sell · Avoid view and stock-by-stock reports. The stock list comes only from the client’s locked record (Drive, passcode-protected) and is delivered through Telegram — client names and lists never go to the public repository.</div>
      ${body}</div>`;
    paintStatus();
    if (window.jcOutlook && open && kc && !window.jcOutlook.loaded()) window.jcOutlook.load().then(() => paint());
  }
  window.addEventListener('jc-clients', () => paint());
  document.addEventListener('click', (e) => {
    const c = (q) => e.target.closest && e.target.closest(q); if (!c('#pClient')) return;
    const r = c('[data-crrun]'); if (r) { const m = r.getAttribute('data-crrun'), ids = m === 'all' ? listsAll().map((l) => l.id) : [R.listId]; run(ids, m === 'all' ? R.mode : m); if (m !== 'all') R.mode = m; return; }
    const o = c('[data-cropen]'); if (o) { const [m, id] = o.getAttribute('data-cropen').split('|'); R.mode = m; R.listId = id; paint(); return; }
    const tg = c('[data-crtg]'); if (tg) { (async () => { R.msg = 'Sending…'; paintStatus(); try { const j = await window.jcClients.send(tg.getAttribute('data-crtg')); R.msg = j && j.ok ? 'Dashboard sent on Telegram ✓' : 'Telegram said: ' + ((j && j.msg) || 'failed') + ' — the client must open the bot and press Start first'; } catch (e) { R.msg = 'Not sent: ' + ((e && e.message) || e); } paintStatus(); })(); return; }
    if (c('[data-crprint]')) { const kc = CACHE[istDay() + '|' + R.mode + '|' + R.listId]; if (kc) openPrint(kc.html); }
  });
  document.addEventListener('change', (e) => {
    if (!e.target.closest || !e.target.closest('#pClient')) return;
    if (e.target.id === 'crList') { R.listId = e.target.value; paint(); } else if (e.target.id === 'crAuto') { P.auto = e.target.checked; saveP(); } else if (e.target.dataset && e.target.dataset.crn) { P.names[e.target.dataset.crn] = e.target.value.trim(); saveP(); }
  });

  /* ---------- automatic build: 08:45 and 16:00 IST on weekdays while the page is open ---------- */
  async function autoTick() {
    if (!P.auto || R.busy || document.hidden === undefined) return; const d = ist(), dow = d.getUTCDay(), m = istMinNow(); if (dow < 1 || dow > 5 || typeof WL === 'undefined') return;
    const td = istDay(); let mode = null; if (m >= 525 && m < 560) mode = 'morning'; else if (m >= 935 && m < 1080) mode = 'closing'; if (!mode) return; /* only just before the open / after the close — never while the market is live and the dashboard needs every request */
    const ids = listsAll().filter((l) => l.syms.length && !CACHE[td + '|' + mode + '|' + l.id]).map((l) => l.id); if (!ids.length) return;
    if (R.autoTried && R.autoTried[td + mode] && Date.now() - R.autoTried[td + mode] < 600000) return; (R.autoTried = R.autoTried || {})[td + mode] = Date.now();
    await run(ids, mode, true); R.mode = mode;
  }
  function build0() {
    const sel = $('viewSel'), anchor = document.querySelector('details.datasec'); if (!sel || !anchor || $('pClient')) return;
    const o = document.createElement('option'); o.value = 'pClient'; o.textContent = '📋 Client reports (Morning / Closing)'; const g = sel.querySelector('optgroup'); (g || sel).appendChild(o);
    const p = document.createElement('div'); p.className = 'panel'; p.id = 'pClient'; p.innerHTML = '<div class="note">Loading…</div>'; anchor.parentNode.insertBefore(p, anchor);
    const orig = window.showTab; window.showTab = function (id) { orig(id); if (id === 'pClient') { paint(); } };
    setInterval(autoTick, 30000); setTimeout(autoTick, 45000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build0); else build0();
  window.jcClientRep = { build, reportHTML, analyse, run, state: R, cache: () => CACHE };
})();
