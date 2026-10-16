/* Joshi's Corner — Joshi's Dashboard (top item of the View menu).
 * Live tiles for Indian, global, commodity, bond and currency markets with trend arrows + sparklines,
 * an IST date-clock, a blinking India-session indicator, the new Closing Auction Session (CAS) timetable
 * and a 24-hour market-hours chart. Data: Yahoo chart feed via the Apps Script backend (action=dash, falling
 * back to action=fetch on older backends, then direct/proxy routes) — delayed quotes, refreshed while visible. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const IST = 330;

  /* ---------- instruments ---------- */
  const G = [
    { id: 'in', title: 'Indian markets', icon: '🇮🇳', mkt: 'in', dp: 2, items: [
      ['^NSEI', 'NIFTY 50'], ['^BSESN', 'SENSEX'], ['^NSEBANK', 'BANK NIFTY'], ['^CNXIT', 'NIFTY IT'], ['^CNXFIN', 'NIFTY FIN SERV'],
      ['^NSEMDCP50', 'NIFTY MIDCAP 50'], ['^CNXAUTO', 'NIFTY AUTO'], ['^CNXPHARMA', 'NIFTY PHARMA'], ['^CNXMETAL', 'NIFTY METAL'], ['^INDIAVIX', 'INDIA VIX', { inv: 1 }]] },
    { id: 'gl', title: 'Global markets', icon: '🌍', mkt: 'mixed', dp: 2, items: [
      ['^GSPC', 'S&P 500', { m: 'us' }], ['^IXIC', 'NASDAQ', { m: 'us' }], ['^DJI', 'DOW JONES', { m: 'us' }], ['^FTSE', 'FTSE 100', { m: 'uk' }], ['^GDAXI', 'DAX', { m: 'de' }],
      ['^FCHI', 'CAC 40', { m: 'fr' }], ['^N225', 'NIKKEI 225', { m: 'jp' }], ['^HSI', 'HANG SENG', { m: 'hk' }], ['000001.SS', 'SHANGHAI', { m: 'cn' }], ['^KS11', 'KOSPI', { m: 'kr' }]] },
    { id: 'cm', title: 'Commodities', icon: '🛢', mkt: 'fut', dp: 2, items: [
      ['GC=F', 'GOLD (US$/oz)'], ['SI=F', 'SILVER (US$/oz)'], ['CL=F', 'WTI CRUDE'], ['BZ=F', 'BRENT CRUDE'], ['NG=F', 'NATURAL GAS'], ['HG=F', 'COPPER']] },
    { id: 'bd', title: 'Bonds & yields', icon: '🏦', mkt: 'us', dp: 3, yield: 1, items: [
      ['^TNX', 'US 10Y YIELD'], ['^FVX', 'US 5Y YIELD'], ['^TYX', 'US 30Y YIELD'], ['^IRX', 'US 13W BILL']] },
    { id: 'fx', title: 'Currencies', icon: '💱', mkt: 'fx', dp: 4, items: [
      ['USDINR=X', 'USD / INR', { dp: 3 }], ['EURINR=X', 'EUR / INR', { dp: 3 }], ['GBPINR=X', 'GBP / INR', { dp: 3 }], ['JPYINR=X', 'JPY / INR', { dp: 4 }], ['DX-Y.NYB', 'US DOLLAR INDEX', { dp: 3 }], ['EURUSD=X', 'EUR / USD', { dp: 4 }]] },
  ];
  const ALL = []; G.forEach((g) => g.items.forEach((it) => ALL.push({ s: it[0], name: it[1], g, o: it[2] || {} })));

  /* ---------- time helpers (all DST-proof via Intl) ---------- */
  function partsIn(tz, ms) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const o = {}; f.formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
    return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday), min: +o.hour * 60 + +o.minute, y: +o.year, mo: +o.month, d: +o.day };
  }
  const offsetMin = (tz, ms) => { const p = partsIn(tz, ms); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, 0, p.min) - Math.floor(ms / 60000) * 60000) / 60000); };
  const istParts = (ms) => partsIn('Asia/Kolkata', ms);
  const hm = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const h12 = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const left = (min) => { min = Math.max(0, Math.round(min)); const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60; return d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
  const usDst = (ms) => offsetMin('America/New_York', ms) === -240;

  /* Market hours in the exchange's own clock → open windows in IST minutes (may run past 1440 = next day). */
  function mktDef(ms) {
    const mcxEnd = usDst(ms) ? 23 * 60 + 55 : 23 * 60 + 30;
    return [
      { k: 'jp', name: 'Japan (Tokyo)', tz: 'Asia/Tokyo', win: [[9 * 60, 11 * 60 + 30], [12 * 60 + 30, 15 * 60 + 30]], days: [1, 5], c: '#e35d5b' },
      { k: 'kr', name: 'Korea (KOSPI)', tz: 'Asia/Seoul', win: [[9 * 60, 15 * 60 + 30]], days: [1, 5], c: '#e08a3c' },
      { k: 'cn', name: 'China (Shanghai)', tz: 'Asia/Shanghai', win: [[9 * 60 + 30, 11 * 60 + 30], [13 * 60, 15 * 60]], days: [1, 5], c: '#c9a227' },
      { k: 'hk', name: 'Hong Kong', tz: 'Asia/Hong_Kong', win: [[9 * 60 + 30, 12 * 60], [13 * 60, 16 * 60]], days: [1, 5], c: '#d9822b' },
      { k: 'in', name: 'India (NSE/BSE)', tz: 'Asia/Kolkata', win: [[9 * 60 + 15, 15 * 60 + 30]], days: [1, 5], c: '#14306e', home: 1 },
      { k: 'uk', name: 'UK (London)', tz: 'Europe/London', win: [[8 * 60, 16 * 60 + 30]], days: [1, 5], c: '#2e7d9a' },
      { k: 'de', name: 'Germany (Xetra)', tz: 'Europe/Berlin', win: [[9 * 60, 17 * 60 + 30]], days: [1, 5], c: '#3a8d6e' },
      { k: 'fr', name: 'France (Paris)', tz: 'Europe/Paris', win: [[9 * 60, 17 * 60 + 30]], days: [1, 5], c: '#4a9d5a' },
      { k: 'us', name: 'US (NYSE/Nasdaq)', tz: 'America/New_York', win: [[9 * 60 + 30, 16 * 60]], days: [1, 5], c: '#6a4bbd' },
      { k: 'mcx', name: 'MCX commodities', tz: 'Asia/Kolkata', win: [[9 * 60, mcxEnd]], days: [1, 5], c: '#b8761b', ist: 1 },
      { k: 'cds', name: 'NSE currency F&O', tz: 'Asia/Kolkata', win: [[9 * 60, 17 * 60]], days: [1, 5], c: '#1c7c8c', ist: 1 },
    ];
  }
  /* is market open at ms? (weekday by exchange clock) */
  function isOpen(m, ms) {
    const p = partsIn(m.tz, ms);
    return p.dow >= m.days[0] && p.dow <= m.days[1] && m.win.some((w) => p.min >= w[0] && p.min < w[1]);
  }
  /* today's windows expressed on the IST clock for the bar chart (list of [startMin,endMin] possibly >1440) */
  function istWindows(m, ms) {
    const off = offsetMin(m.tz, ms), out = [];
    [-1, 0, 1].forEach((shift) => m.win.forEach((w) => { const a = w[0] - off + IST + shift * 1440, b = w[1] - off + IST + shift * 1440; if (b > 0 && a < 1440) out.push([Math.max(a, 0), Math.min(b, 1440)]); }));
    return out;
  }
  const FX_OPEN = (ms) => { const p = partsIn('America/New_York', ms); if (p.dow === 6) return false; if (p.dow === 0) return p.min >= 17 * 60; if (p.dow === 5) return p.min < 17 * 60; return true; };
  const FUT_OPEN = (ms) => { const p = partsIn('America/New_York', ms); if (p.dow === 6) return false; if (p.dow === 0) return p.min >= 18 * 60; if (p.dow === 5) return p.min < 17 * 60; return !(p.min >= 17 * 60 && p.min < 18 * 60); };

  /* India session state machine (from the new SEBI/NSE CAS timetable effective 3 Aug 2026) */
  function indiaState(ms) {
    const p = istParts(ms), t = p.min, wk = p.dow >= 1 && p.dow <= 5;
    const base = { label: 'CLOSED', cls: 'off', blink: false, note: '' };
    if (!wk) return Object.assign(base, { note: 'Weekend', next: nextOpen(ms) });
    const S = [
      [9 * 60, 9 * 60 + 15, 'PRE-OPEN', 'pre', true, 'Order entry & price discovery · opens 9:15 AM'],
      [9 * 60 + 15, 15 * 60 + 15, 'LIVE', 'live', true, 'Normal market · F&O stocks continue to 3:15 PM, others to 3:30 PM'],
      [15 * 60 + 15, 15 * 60 + 30, 'CLOSING AUCTION', 'cas', true, 'CAS reference price 3:15–3:20 · order entry from 3:20 · F&O stocks only; other stocks trade to 3:30'],
      [15 * 60 + 30, 15 * 60 + 35, 'CAS MATCHING', 'cas', true, 'Auction price discovery 3:30–3:35 PM (F&O stocks)'],
      [15 * 60 + 35, 15 * 60 + 40, 'F&O CLOSING', 'live', true, 'Index & stock F&O trade until 3:40 PM'],
      [15 * 60 + 50, 16 * 60, 'POST-CLOSE', 'post', false, 'Post-close session at closing price until 4:00 PM'],
    ];
    for (const s of S) if (t >= s[0] && t < s[1]) return { label: s[2], cls: s[3], blink: s[4], note: s[5] };
    if (t < 9 * 60) return Object.assign(base, { note: 'Pre-open starts 9:00 AM', next: nextOpen(ms) });
    return Object.assign(base, { note: 'Session over for today', next: nextOpen(ms) });
  }
  function nextOpen(ms) { // minutes until the next 09:15 IST weekday open
    for (let k = 0; k < 8; k++) {
      const t = ms + k * 86400000; const p = istParts(t);
      if (p.dow >= 1 && p.dow <= 5) { const mins = (9 * 60 + 15 - p.min) + k * 1440; if (mins > 0) return mins; }
    }
    return null;
  }

  /* ---------- state + data ---------- */
  const S = { q: {}, timer: null, last: 0, busy: false, due: {}, mode: '', err: '' };

  function parseRow(s, r) {
    const m = r.meta || {}, c = ((r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || []).filter((v) => v != null);
    return { s, p: m.regularMarketPrice, pc: m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose, t: m.regularMarketTime, sp: c.slice(-40) };
  }
  async function fetchBatch(syms) {
    const be = getBackend();
    if (be) {
      try {
        const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=dash&symbols=' + encodeURIComponent(syms.join(','))), 20000));
        if (j && Array.isArray(j.rows)) { S.mode = 'backend batch'; return j.rows; }
      } catch (e) { /* old backend or timeout: fall through */ }
    }
    const out = []; let i = 0; const run = async () => {
      while (i < syms.length) {
        const s = syms[i++];
        try { const j = await fetchData(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=15m&includePrePost=false`, { kind: 'json', validate: (x) => !!(x && x.chart && x.chart.result && x.chart.result[0]) }); out.push(parseRow(s, j.chart.result[0])); } catch (e) { out.push({ s, err: 1 }); }
      }
    };
    await Promise.all(Array.from({ length: 6 }, run)); S.mode = be ? 'backend (per symbol)' : 'direct / proxy'; return out;
  }

  const wantNow = (ms) => {
    const defs = mktDef(ms), open = {}; defs.forEach((m) => { open[m.k] = isOpen(m, ms); });
    const ist = indiaState(ms); return { open, ist, fx: FX_OPEN(ms), fut: FUT_OPEN(ms) };
  };
  function groupActive(g, w) {
    if (g.id === 'in') return w.open.in || w.ist.cls !== 'off';
    if (g.id === 'fx') return w.fx; if (g.id === 'cm') return w.fut;
    if (g.id === 'bd') return w.open.us; if (g.id === 'gl') return ['jp', 'kr', 'cn', 'hk', 'uk', 'de', 'fr', 'us'].some((k) => w.open[k]);
    return true;
  }
  async function refresh(force) {
    if (S.busy) return; const ms = Date.now(); const w = wantNow(ms); S.busy = true; setBusy(true);
    try {
      const groups = G.filter((g) => force || !S.due[g.id] || ms >= S.due[g.id]);
      const syms = []; groups.forEach((g) => g.items.forEach((it) => syms.push(it[0])));
      if (!syms.length) return;
      const rows = await fetchBatch(syms); let ok = 0;
      rows.forEach((r) => { if (r && !r.err && r.p != null) { const old = S.q[r.s]; S.q[r.s] = Object.assign({}, r, { flash: old && old.p !== r.p ? (r.p > old.p ? 'up' : 'dn') : '' }); ok++; } });
      groups.forEach((g) => { S.due[g.id] = ms + (groupActive(g, w) ? (g.id === 'in' ? 60 : 120) : 600) * 1000; });
      S.last = ms; S.err = ok ? '' : 'No quotes returned — check the Data backend box or your connection.';
    } catch (e) { S.err = (e && e.message) || 'Refresh failed'; }
    finally { S.busy = false; setBusy(false); paint(); }
  }

  /* ---------- rendering ---------- */
  function spark(sp, up, w, h) {
    if (!sp || sp.length < 2) return '';
    const mn = Math.min(...sp), mx = Math.max(...sp), r = mx - mn || 1;
    const pts = sp.map((v, i) => `${(i / (sp.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`);
    const col = up == null ? '#7a8699' : up ? '#12894b' : '#c11d3d';
    return `<svg class="jd-sp" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polygon points="0,${h} ${pts.join(' ')} ${w},${h}" fill="${col}" opacity=".12"/><polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  const fmtN = (v, dp) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  function tile(it, w, ms) {
    const q = S.q[it.s]; const dp = it.o.dp != null ? it.o.dp : it.g.dp;
    if (!q) return `<div class="jd-t jd-na"><div class="jd-tn">${esc(it.name)}</div><div class="jd-tp">…</div><div class="jd-tc">${S.busy ? 'loading' : 'no data'}</div></div>`;
    const chg = q.pc != null ? q.p - q.pc : null, pct = q.pc ? chg / q.pc * 100 : null;
    let dir = chg == null || Math.abs(pct) < 0.05 ? 0 : chg > 0 ? 1 : -1; const good = it.o.inv ? -dir : dir; // VIX: up = risk-off (red)
    const age = (ms / 1000 - (q.t || 0)) / 60; const live = age >= 0 && age < 20;
    const mk = it.o.m || (it.g.id === 'in' ? 'in' : it.g.id === 'bd' ? 'us' : '');
    const stale = !live; const trend = dir === 0 ? 'FLAT' : (good > 0 ? 'BULLISH' : 'BEARISH');
    const when = q.t ? new Date(q.t * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
    const yc = it.g.yield && chg != null ? ` <small>${(chg * 100).toFixed(1)} bp</small>` : '';
    return `<div class="jd-t ${good > 0 ? 'jd-up' : good < 0 ? 'jd-dn' : ''} ${q.flash ? 'jd-fl-' + q.flash : ''}" title="${esc(it.s)} · last tick ${when} IST">
      <div class="jd-th"><span class="jd-tn">${esc(it.name)}</span><span class="jd-live ${live ? 'on' : 'off'}" title="${live ? 'Live (tick within 20 min)' : 'Market closed — last session'}"></span></div>
      <div class="jd-tp">${fmtN(q.p, dp)}${it.g.yield ? '<small>%</small>' : ''}</div>
      <div class="jd-tc"><b class="jd-arrow">${dir > 0 ? '▲' : dir < 0 ? '▼' : '■'}</b> ${chg == null ? '—' : (chg > 0 ? '+' : '') + fmtN(chg, dp)}${yc} <span class="jd-pct">${pct == null ? '' : (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'}</span></div>
      <div class="jd-tf">${spark(q.sp, dir === 0 ? null : dir > 0, 120, 26)}<span class="jd-tr ${good > 0 ? 'g' : good < 0 ? 'r' : ''}">${trend}</span></div>
      <div class="jd-ts">${stale ? 'closed · ' : ''}${when ? when + ' IST' : ''}</div></div>`;
  }

  function mood(ms) { // breadth of the Indian tiles + Nifty trend → one-line read
    const items = ALL.filter((x) => x.g.id === 'in' && x.s !== '^INDIAVIX'), up = items.filter((x) => { const q = S.q[x.s]; return q && q.pc && q.p > q.pc; }).length, n = items.filter((x) => S.q[x.s]).length;
    return n ? { up, n } : null;
  }

  function heroHTML(w, ms) {
    const ist = w.ist, ip = istParts(ms);
    const dateStr = new Date(ms).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const nifty = S.q['^NSEI']; const nAge = nifty ? (ms / 1000 - (nifty.t || 0)) / 60 : null;
    let label = ist.label, cls = ist.cls, blink = ist.blink, note = ist.note;
    if (cls === 'live' && nAge != null && nAge > 30) { label = 'AWAITING FEED'; cls = 'warn'; blink = false; note = 'Session hours, but Nifty’s last tick is ' + Math.round(nAge) + ' min old — possible exchange holiday or a delayed feed'; }
    const defs = mktDef(ms); const liveGl = defs.filter((m) => m.k !== 'in' && m.k !== 'mcx' && m.k !== 'cds' && isOpen(m, ms)).map((m) => m.name.split(' ')[0]);
    let right = '';
    if (cls === 'off') right = `<div class="jd-rt"><span>Next India open</span><b>${ist.next != null ? left(ist.next) : '—'}</b></div><div class="jd-rt jd-g"><span>Open now</span><b>${liveGl.length ? esc(liveGl.join(' · ')) : 'MCX / FX only'}</b></div>`;
    else right = `<div class="jd-rt"><span>${cls === 'pre' ? 'Opens in' : 'Cash closes in'}</span><b>${cls === 'pre' ? left(9 * 60 + 15 - ip.min) : ip.min < 15 * 60 + 30 ? left(15 * 60 + 30 - ip.min) : ip.min < 15 * 60 + 40 ? left(15 * 60 + 40 - ip.min) : '—'}</b></div><div class="jd-rt jd-g"><span>Also open</span><b>${liveGl.length ? esc(liveGl.join(' · ')) : 'MCX · FX'}</b></div>`;
    const md = mood(ms); const mtxt = md ? `${md.up}/${md.n} Indian indices up` : '';
    return `<div class="jd-hero">
      <div class="jd-clk"><div class="jd-time" id="jdTime">--:--:--</div><div class="jd-date" id="jdDate">${esc(dateStr)}</div><div class="jd-tz">INDIAN STANDARD TIME · UTC+5:30</div></div>
      <a class="jd-pill st-${cls} ${blink ? 'jd-blink' : ''}" href="#jd-in" data-jdgo="jd-in" title="Jump to Indian markets"><span class="jd-dot"></span><span class="jd-pl"><small>INDIA · NSE / BSE</small><b>${esc(label)}</b></span><span class="jd-pn">${esc(note)}${mtxt ? ' · ' + mtxt : ''}</span></a>
      <div class="jd-right">${right}</div></div>`;
  }

  /* timetable: India day with CAS */
  function timetableHTML(ms) {
    const T0 = 9 * 60, T1 = 16 * 60, span = T1 - T0, ip = istParts(ms).min, wk = istParts(ms).dow >= 1 && istParts(ms).dow <= 5;
    const x = (m) => ((m - T0) / span * 100).toFixed(2); const seg = (a, b, cls, txt, tip) => `<div class="jd-seg ${cls}" style="left:${x(a)}%;width:${((b - a) / span * 100).toFixed(2)}%" title="${esc(tip || txt)}"><span>${esc(txt)}</span></div>`;
    const lanes = [
      ['F&O-listed stocks (CAS applies)', [seg(540, 555, 'pre', 'Pre-open', 'Pre-open 9:00–9:15'), seg(555, 915, 'cont', 'Continuous trading 9:15 – 3:15 PM', 'Continuous 9:15 AM–3:15 PM'), seg(915, 935, 'cas', 'CAS 3:15–3:35', 'Closing Auction Session 3:15–3:35 PM'), seg(950, 960, 'post', '', 'Post-close 3:50–4:00 PM')]],
      ['All other stocks', [seg(540, 555, 'pre', 'Pre-open'), seg(555, 930, 'cont', 'Continuous trading 9:15 – 3:30 PM', 'Continuous 9:15 AM–3:30 PM (closing price = VWAP of last 30 min)'), seg(950, 960, 'post', '', 'Post-close 3:50–4:00 PM')]],
      ['Index & stock F&O', [seg(555, 940, 'fo', 'Trading 9:15 AM – 3:40 PM', 'F&O 9:15 AM–3:40 PM (extended from 3:30)')]],
    ];
    const ticks = []; for (let h = 9; h <= 16; h++) ticks.push(`<i style="left:${x(h * 60)}%"><span>${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}</span></i>`);
    const nowX = wk && ip >= T0 && ip <= T1 ? `<div class="jd-now" style="left:${x(ip)}%"><b>${h12(ip)}</b></div>` : '';
    // zoomed CAS strip 3:00–4:00 PM
    const Z0 = 15 * 60, Z1 = 16 * 60, zx = (m) => ((m - Z0) / 60 * 100).toFixed(2), zs = (a, b, cls, t1, t2) => `<div class="jd-zs ${cls}" style="left:${zx(a)}%;width:${((b - a) / 60 * 100).toFixed(2)}%"><b>${t1}</b><small>${t2}</small></div>`;
    const zn = wk && ip >= Z0 && ip <= Z1 ? `<div class="jd-now" style="left:${zx(ip)}%"><b>${h12(ip)}</b></div>` : '';
    const zt = []; for (let m = Z0; m <= Z1; m += 5) zt.push(`<i style="left:${zx(m)}%"><span>${m % 15 === 0 ? ':' + String(m % 60).padStart(2, '0') : ''}</span></i>`);
    return `<div class="jd-card"><h3>Indian trading day &amp; the new Closing Auction Session (CAS) <small>effective 3 Aug 2026 · IST</small></h3>
      <div class="jd-tl">${lanes.map((l) => `<div class="jd-lane"><div class="jd-ln">${l[0]}</div><div class="jd-lt">${l[1].join('')}</div></div>`).join('')}
        <div class="jd-axis"><div class="jd-ln"></div><div class="jd-lt">${ticks.join('')}</div></div>${nowX ? `<div class="jd-nowwrap"><div class="jd-ln"></div><div class="jd-lt">${nowX}</div></div>` : ''}</div>
      <h4>Zoom · 3:00 – 4:00 PM</h4>
      <div class="jd-zoom"><div class="jd-zt">${zs(900, 915, 'cont', 'Last 15 min', 'VWAP window 3:00–3:15')}${zs(915, 920, 'ref', 'Reference', '3:15–3:20 · VWAP price fixed, no fresh orders')}${zs(920, 925, 'ent', 'Orders', '3:20–3:25 · market + limit')}${zs(925, 930, 'ent2', 'Limit only', '3:25–3:28/3:30 · random close')}${zs(930, 935, 'match', 'Matching', '3:30–3:35 · auction price')}${zs(935, 940, 'fo', 'F&O', 'till 3:40 PM')}${zs(950, 960, 'post', 'Post-close', '3:50–4:00 PM')}${zn}</div><div class="jd-za">${zt.join('')}</div></div>
      <div class="jd-notes"><span><b>Reference price</b> = VWAP of trades 3:00–3:15 PM.</span><span><b>Price band</b> ±3% of reference.</span><span><b>Closing price</b> for F&O stocks = auction price (not last-30-min VWAP).</span><span><b>Intraday square-off</b> brokers move earlier (≈3:10 PM) — check yours.</span></div></div>`;
  }

  /* 24h market-hours chart */
  function hoursHTML(ms) {
    const defs = mktDef(ms), ip = istParts(ms).min; const x = (m) => (m / 1440 * 100).toFixed(2);
    const rows = defs.map((m) => {
      const open = isOpen(m, ms); const wins = istWindows(m, ms).map((w) => `<div class="jd-bar" style="left:${x(w[0])}%;width:${((w[1] - w[0]) / 1440 * 100).toFixed(2)}%;background:${m.c}"></div>`).join('');
      return `<div class="jd-hr ${m.home ? 'home' : ''}"><div class="jd-hn"><span class="jd-live ${open ? 'on' : 'off'}"></span>${esc(m.name)}</div><div class="jd-ht">${wins}</div></div>`;
    });
    const fut = FUT_OPEN(ms), fx = FX_OPEN(ms);
    rows.push(`<div class="jd-hr"><div class="jd-hn"><span class="jd-live ${fut ? 'on' : 'off'}"></span>Global futures (gold, crude)</div><div class="jd-ht"><div class="jd-bar all" style="left:0;width:100%"></div></div></div>`);
    rows.push(`<div class="jd-hr"><div class="jd-hn"><span class="jd-live ${fx ? 'on' : 'off'}"></span>Forex (24 × 5)</div><div class="jd-ht"><div class="jd-bar all" style="left:0;width:100%"></div></div></div>`);
    const ticks = []; for (let h = 0; h <= 24; h += 3) ticks.push(`<i style="left:${x(h * 60)}%"><span>${h === 24 ? '' : hm(h * 60)}</span></i>`);
    return `<div class="jd-card"><h3>Market hours on the IST clock <small>who is open when · weekdays · times shift with daylight saving</small></h3>
      <div class="jd-hours"><div class="jd-hgrid">${rows.join('')}<div class="jd-hr jd-hax"><div class="jd-hn"></div><div class="jd-ht">${ticks.join('')}</div></div><div class="jd-hnow" style="left:calc(var(--hn) + 8px + (100% - var(--hn) - 8px) * ${(ip / 1440).toFixed(4)})"><b>${h12(ip)}</b></div></div></div>
      <div class="jd-notes"><span>MCX non-agri runs 9:00 AM–${usDst(ms) ? '11:55' : '11:30'} PM; NSE currency F&O 9:00 AM–5:00 PM.</span><span>Gold/crude/forex quotes here are global futures &amp; spot — they trade while Indian cash markets are shut and often set the next morning’s tone.</span></div></div>`;
  }

  function legendHTML() {
    return `<div class="jd-card jd-leg"><h3>How to read this dashboard</h3><div class="jd-lg">
      <div><span class="jd-pillmini jd-live-s"><span class="jd-dot"></span>LIVE</span><p>The blinking pill at the top is the <b>Indian market session</b>: green = trading, amber = pre-open, violet = closing auction, grey = closed (then it shows the countdown to the next open and which global markets are trading instead).</p></div>
      <div><span class="jd-live on"></span><span class="jd-live off"></span><p>Dot on each tile: <b>green</b> = a tick arrived in the last 20 minutes; <b>grey</b> = market closed, showing the last session.</p></div>
      <div><b class="jd-arrow" style="color:#12894b">▲</b> <b class="jd-arrow" style="color:#c11d3d">▼</b><p>Change vs previous close. <b>India VIX</b> is inverted: a rising VIX is shown red (fear up). Trend label is BULLISH / BEARISH / FLAT (±0.05% band).</p></div>
      <div>${spark([3, 4, 3.6, 5, 6, 5.4, 7], true, 70, 22)}<p>Sparkline = today’s intraday path (15-min bars); for closed markets, the last session.</p></div>
      <div><b>Tile flash</b><p>A tile briefly glows green/red when its price changes on refresh. Quotes are delayed Yahoo Finance data; India refreshes every minute in session, others every 2 min, closed markets every 10 min.</p></div>
      <div><b>Bonds</b><p>US yields shown in %, change in basis points. India G-Sec yield is in the Evening Market Wrap.</p></div></div></div>`;
  }

  function groupHTML(g, ms, w) {
    const act = groupActive(g, w);
    return `<section class="jd-sec" id="jd-${g.id}"><h3><span>${g.icon}</span> ${esc(g.title)} <span class="jd-chip ${act ? 'on' : ''}">${act ? '● LIVE' : 'CLOSED'}</span></h3><div class="jd-grid">${ALL.filter((x) => x.g === g).map((it) => tile(it, w, ms)).join('')}</div></section>`;
  }

  function paint() {
    const el = $('pDash'); if (!el || !el.classList.contains('active')) return; const ms = Date.now(), w = wantNow(ms);
    const keep = window.scrollY;
    el.innerHTML = heroHTML(w, ms)
      + `<div class="jd-status"><span class="jd-ring ${S.busy ? 'spin' : ''}"></span><span id="jdSt">${S.err ? '<b class="jd-er">' + esc(S.err) + '</b>' : S.last ? 'Updated ' + new Date(S.last).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }) + ' IST · via ' + esc(S.mode) : 'Loading live quotes…'}</span><button class="jd-btn" onclick="window.jdRefresh()">⟳ Refresh now</button></div>`
      + G.map((g) => groupHTML(g, ms, w)).join('') + timetableHTML(ms) + hoursHTML(ms) + legendHTML()
      + `<div class="legal">Delayed market data from Yahoo Finance for information only — not investment advice. India 10-year G-Sec, GIFT Nifty and MCX prices are not available on this feed (see the morning &amp; evening reports).</div>`;
    Object.keys(S.q).forEach((k) => { S.q[k].flash = ''; });
    window.scrollTo(0, keep); tickClock();
  }
  function setBusy(b) { const r = document.querySelector('#pDash .jd-ring'); if (r) r.classList.toggle('spin', b); }
  function tickClock() {
    const t = $('jdTime'); if (!t) return; const d = new Date();
    t.textContent = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
  }

  /* ---------- styles ---------- */
  const CSS = `
  #pDash{--jg:#12894b;--jr:#c11d3d;--jn:#14306e}
  .jd-hero{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;padding:16px 20px;border-radius:16px;color:#fff;background:radial-gradient(120% 160% at 0% 0%,#1d3f8f 0%,#0f2352 55%,#0a1736 100%);box-shadow:0 8px 26px rgba(15,35,82,.28);margin-bottom:8px;position:relative;overflow:hidden}
  .jd-hero::after{content:'';position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(228,201,122,.25),transparent 65%)}
  .jd-time{font:800 40px/1 ui-monospace,'SF Mono','Cascadia Mono',Consolas,monospace;letter-spacing:1px;text-shadow:0 0 18px rgba(120,170,255,.5)}
  .jd-date{font-size:13px;font-weight:700;margin-top:4px;color:#e4c97a}.jd-tz{font-size:9.5px;letter-spacing:1.4px;color:#9fb3e6;margin-top:2px}
  .jd-pill{position:relative;z-index:1;display:flex;align-items:center;gap:12px;text-decoration:none;color:#fff;padding:10px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);justify-self:center;max-width:100%}
  .jd-pl small{display:block;font-size:9.5px;letter-spacing:1.3px;opacity:.8}.jd-pl b{font-size:22px;letter-spacing:1px}.jd-pn{font-size:11.5px;opacity:.9;max-width:340px;line-height:1.3}
  .jd-dot{width:14px;height:14px;border-radius:50%;background:#8a94ad;flex:none;box-shadow:0 0 0 0 rgba(255,255,255,.5)}
  .jd-pill.st-live{border-color:#3ddc84;background:rgba(18,137,75,.28)}.jd-pill.st-live .jd-dot{background:#3ddc84}.jd-pill.st-pre{border-color:#ffc247;background:rgba(224,168,0,.25)}.jd-pill.st-pre .jd-dot{background:#ffc247}
  .jd-pill.st-cas{border-color:#c4a3ff;background:rgba(122,76,214,.3)}.jd-pill.st-cas .jd-dot{background:#c4a3ff}.jd-pill.st-post{border-color:#7fd0ff}.jd-pill.st-post .jd-dot{background:#7fd0ff}.jd-pill.st-warn{border-color:#ffb36b;background:rgba(224,120,0,.25)}.jd-pill.st-warn .jd-dot{background:#ffb36b}
  .jd-blink .jd-dot{animation:jdpulse 1.1s infinite}.jd-blink .jd-pl b{animation:jdb 1.1s infinite}
  @keyframes jdpulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.7);opacity:1}70%{box-shadow:0 0 0 12px rgba(255,255,255,0);opacity:.5}100%{box-shadow:0 0 0 0 rgba(255,255,255,0);opacity:1}}
  @keyframes jdb{50%{opacity:.55}}
  .jd-right{position:relative;z-index:1;display:flex;flex-direction:column;gap:6px;text-align:right}.jd-rt span{display:block;font-size:9.5px;letter-spacing:1.2px;color:#9fb3e6}.jd-rt b{font-size:17px}.jd-rt.jd-g b{font-size:12px;color:#e4c97a}
  .jd-status{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--ink2);margin:0 2px 8px}.jd-er{color:var(--red)}
  .jd-ring{width:12px;height:12px;border-radius:50%;border:2px solid #b7c3e0;border-top-color:var(--navy)}.jd-ring.spin{animation:jdspin .8s linear infinite}@keyframes jdspin{to{transform:rotate(360deg)}}
  .jd-btn{border:1px solid #c3cde6;background:#fff;color:var(--navy);border-radius:8px;padding:4px 10px;font-weight:800;font-size:11.5px;cursor:pointer;margin-left:auto}
  .jd-sec{margin:10px 0}.jd-sec h3,.jd-card h3{margin:0 0 7px;font-size:14px;color:var(--navy);display:flex;align-items:center;gap:7px;flex-wrap:wrap}.jd-card h3 small{font-size:10.5px;color:var(--ink2);font-weight:600}
  .jd-chip{font-size:9.5px;letter-spacing:.8px;padding:2px 8px;border-radius:99px;background:#e9edf6;color:#6a7691;font-weight:800}.jd-chip.on{background:#dff5e8;color:var(--jg);animation:jdb 1.6s infinite}
  .jd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(188px,1fr));gap:8px}
  .jd-t{background:#fff;border:1px solid var(--line);border-left:4px solid #b9c3d9;border-radius:12px;padding:8px 10px;box-shadow:0 1px 3px rgba(20,48,110,.06);transition:box-shadow .2s}.jd-t:hover{box-shadow:0 4px 14px rgba(20,48,110,.14)}
  .jd-t.jd-up{border-left-color:#12894b;background:linear-gradient(180deg,#f3fbf6,#fff 60%)}.jd-t.jd-dn{border-left-color:#c11d3d;background:linear-gradient(180deg,#fdf3f5,#fff 60%)}.jd-na{opacity:.6}
  .jd-fl-up{animation:jdfu 1.4s}.jd-fl-dn{animation:jdfd 1.4s}@keyframes jdfu{0%{background:#b8f0cf}100%{}}@keyframes jdfd{0%{background:#ffc9d2}100%{}}
  .jd-th{display:flex;justify-content:space-between;align-items:center}.jd-tn{font-size:10.5px;font-weight:800;letter-spacing:.5px;color:#4a5878}
  .jd-live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#aab3c5;flex:none}.jd-live.on{background:#12a05a;animation:jdpulse2 1.4s infinite}@keyframes jdpulse2{0%{box-shadow:0 0 0 0 rgba(18,160,90,.6)}100%{box-shadow:0 0 0 7px rgba(18,160,90,0)}}
  .jd-tp{font:800 20px/1.15 ui-monospace,'SF Mono',Consolas,monospace;margin-top:3px;color:var(--ink)}.jd-tp small{font-size:12px;margin-left:2px;color:var(--ink2)}
  .jd-tc{font-size:12px;font-weight:700;margin-top:1px}.jd-up .jd-tc{color:var(--jg)}.jd-dn .jd-tc{color:var(--jr)}.jd-tc small{font-weight:600;opacity:.85}.jd-pct{float:right}
  .jd-tf{display:flex;align-items:center;justify-content:space-between;margin-top:3px;gap:6px}.jd-sp{display:block;flex:1;max-width:100%}
  .jd-tr{font-size:9px;font-weight:800;letter-spacing:.7px;padding:2px 6px;border-radius:6px;background:#eef1f7;color:#6a7691}.jd-tr.g{background:#dff5e8;color:var(--jg)}.jd-tr.r{background:#fde3e8;color:var(--jr)}
  .jd-ts{font-size:9.5px;color:#8591aa;margin-top:2px}
  .jd-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:10px 0;box-shadow:0 1px 4px rgba(20,48,110,.07)}.jd-card h4{margin:12px 0 4px;font-size:11.5px;color:var(--ink2)}
  .jd-tl{position:relative;padding-top:18px}.jd-lane,.jd-axis,.jd-nowwrap,.jd-hr{display:grid;grid-template-columns:var(--hn,170px) 1fr;align-items:center;gap:8px}.jd-lane{margin:5px 0}.jd-ln{font-size:10.5px;font-weight:700;color:var(--ink2);line-height:1.15}
  .jd-lt{position:relative;height:28px}.jd-axis .jd-lt,.jd-nowwrap .jd-lt{height:16px}.jd-nowwrap{position:absolute;inset:0;pointer-events:none;grid-template-rows:1fr}.jd-nowwrap .jd-lt{height:100%}
  .jd-seg{position:absolute;top:0;bottom:0;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;overflow:hidden;white-space:nowrap;border:1px solid rgba(255,255,255,.5)}.jd-seg span{padding:0 4px;text-overflow:ellipsis;overflow:hidden}
  .jd-seg.pre,.jd-zs.pre{background:#e0a800}.jd-seg.cont,.jd-zs.cont{background:#1f7a52}.jd-seg.cas,.jd-zs.ref,.jd-zs.ent,.jd-zs.ent2,.jd-zs.match{background:#7a4cd6}.jd-seg.fo,.jd-zs.fo{background:#2a62c9}.jd-seg.post,.jd-zs.post{background:#7a8699}
  .jd-axis i,.jd-zoom i,.jd-hax i{position:absolute;top:0;width:0;border-left:1px solid #c7d0e4;height:6px}.jd-axis i span,.jd-za i span,.jd-hax i span{position:absolute;top:7px;left:-14px;width:28px;text-align:center;font-size:9.5px;color:#6a7691}
  .jd-now{position:absolute;top:-2px;bottom:-2px;width:0;border-left:2px solid #c11d3d;z-index:3}.jd-now b{position:absolute;top:-15px;left:-26px;width:52px;text-align:center;font-size:9.5px;background:#c11d3d;color:#fff;border-radius:6px;padding:1px 0}
  .jd-zt{position:relative;height:46px;background:#f3f5fa;border-radius:8px;margin-top:14px}.jd-zs{position:absolute;top:2px;bottom:2px;border-radius:6px;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;overflow:hidden;text-align:center;border:1px solid rgba(255,255,255,.5)}.jd-zs b{font-size:10.5px}.jd-zs small{font-size:8.5px;opacity:.92;line-height:1.1;padding:0 2px}
  .jd-zs.ref{background:#6a3fc0}.jd-zs.ent{background:#8456e0}.jd-zs.ent2{background:#9a74ea}.jd-zs.match{background:#52299e}
  .jd-za{position:relative;height:22px}.jd-za i{position:absolute;top:0;border-left:1px solid #c7d0e4;height:6px}
  .jd-notes{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:11px;color:var(--ink2);margin-top:10px}.jd-notes span{background:#f3f5fa;border-radius:8px;padding:4px 9px}
  .jd-hours{position:relative;--hn:170px;overflow-x:auto}.jd-hgrid{position:relative;min-width:620px;padding-top:16px}.jd-hr{margin:3px 0}.jd-hr.home .jd-hn{color:var(--navy)}.jd-hn{font-size:10.5px;font-weight:700;color:var(--ink2);display:flex;align-items:center;gap:6px}
  .jd-ht{position:relative;height:14px;background:#eef1f7;border-radius:7px;overflow:hidden}.jd-bar{position:absolute;top:0;bottom:0;border-radius:7px;opacity:.9}.jd-bar.all{background:repeating-linear-gradient(90deg,#9ab0e6 0 8px,#b8c8f0 8px 16px)}
  .jd-hax .jd-ht{background:none;height:14px;overflow:visible}.jd-hnow{position:absolute;top:0;bottom:0;width:0;border-left:2px solid #c11d3d;z-index:3;pointer-events:none}.jd-hnow b{position:absolute;top:-1px;left:-26px;width:52px;text-align:center;font-size:9.5px;background:#c11d3d;color:#fff;border-radius:6px}
  .jd-lg{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px 18px}.jd-lg p{margin:4px 0 0;font-size:11.5px;color:var(--ink2)}.jd-pillmini{display:inline-flex;align-items:center;gap:6px;background:#0f2352;color:#fff;border-radius:99px;padding:2px 10px;font-size:10.5px;font-weight:800}.jd-live-s .jd-dot{width:9px;height:9px;background:#3ddc84;animation:jdpulse 1.1s infinite}
  @media(max-width:900px){.jd-hero{grid-template-columns:1fr;text-align:center;padding:14px}.jd-right{text-align:center;flex-direction:row;justify-content:center;gap:20px}.jd-time{font-size:34px}.jd-pill{flex-wrap:wrap;justify-content:center}.jd-grid{grid-template-columns:repeat(2,1fr)}.jd-lane,.jd-axis,.jd-hr{grid-template-columns:90px 1fr}.jd-hours{--hn:90px}.jd-seg span{font-size:8px}}
  @media print{.jd-btn,.jd-status{display:none}.jd-hero{background:#0f2352!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

  /* ---------- wiring ---------- */
  function build() {
    if ($('pDash')) return;
    const st = document.createElement('style'); st.id = 'jdcss'; st.textContent = CSS; document.head.appendChild(st);
    const anchor = document.querySelector('details.datasec'); const p = document.createElement('div'); p.className = 'panel'; p.id = 'pDash'; p.innerHTML = '<div class="note">Loading dashboard…</div>'; anchor.parentNode.insertBefore(p, anchor);
    const sel = $('viewSel'); const og = document.createElement('optgroup'); og.label = "Joshi's Dashboard";
    const o = document.createElement('option'); o.value = 'pDash'; o.textContent = "📊 Joshi's Dashboard — live markets"; og.appendChild(o); sel.insertBefore(og, sel.firstChild); sel.value = window.__curTab || 'pSummary';
  }
  const origShow = window.showTab;
  window.showTab = function (id) { origShow(id); if (id === 'pDash') { paint(); refresh(!S.last); startTimer(); } };
  const origPrint = window.printPDF;
  window.printPDF = function () { if ((window.__curTab || '') === 'pDash') { window.print(); return; } return origPrint.apply(this, arguments); };
  window.jdRefresh = () => { S.due = {}; refresh(true); };
  function startTimer() {
    if (S.timer) return;
    S.timer = setInterval(() => {
      const on = (window.__curTab || '') === 'pDash' && !document.hidden; if (!on) return;
      tickClock();
      const sec = Math.floor(Date.now() / 1000);
      if (sec % 30 === 0) paint();            // re-evaluate session state, countdowns, now-lines
      if (!S.busy && sec % 10 === 0) { const ms = Date.now(); if (G.some((g) => !S.due[g.id] || ms >= S.due[g.id])) refresh(false); }
    }, 1000);
  }
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-jdgo]'); if (!a) return; e.preventDefault(); const t = $(a.getAttribute('data-jdgo')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (window.__curTab || '') === 'pDash') refresh(false); });
  function init() { build(); const h = (location.hash || '').slice(1); if (h === 'dashboard') window.showTab('pDash'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.__jd = { indiaState, mktDef, isOpen };
})();
