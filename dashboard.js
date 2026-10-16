/* Joshi's Corner — Joshi's Dashboard (top item of the View menu).
 * Four-column market board: Indian markets (+ all other Nifty indices A–Z) | Global markets with flags |
 * Commodities + Bonds & yields | Live news. Header carries the IST date-clock, the blinking India-session
 * indicator and the Market Mood sentimeter. Below: the Closing Auction Session (CAS) timetable, a 24-hour
 * market-hours chart and a "how to read" key.
 * Data: Yahoo chart feed via the Apps Script backend (action=dash → falls back to action=fetch, then direct/proxy),
 * India 10Y (action=in10y), Nifty PCR (action=pcr, best effort) and Google News RSS. Delayed quotes, refreshed while visible. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const IST = 330;
  const LS_MAN = 'jd_manual_v1';

  /* ---------- instruments ---------- */
  const NIFTY_OTHERS = [
    ['^CNX100', 'NIFTY 100'], ['^CNX200', 'NIFTY 200'], ['^CNXAUTO', 'NIFTY AUTO'], ['^CNXCMDT', 'NIFTY COMMODITIES'], ['NIFTY_CONSR_DURBL.NS', 'NIFTY CONSR DURABLES'],
    ['^CNXCONSUM', 'NIFTY CONSUMPTION'], ['^CNXENERGY', 'NIFTY ENERGY'], ['^CNXFIN', 'NIFTY FIN SERVICES'], ['^CNXFMCG', 'NIFTY FMCG'], ['NIFTY_HEALTHCARE.NS', 'NIFTY HEALTHCARE'],
    ['NIFTY_IND_DEFENCE.NS', 'NIFTY INDIA DEFENCE'], ['NIFTY_IND_DIGITAL.NS', 'NIFTY INDIA DIGITAL'], ['^CNXINFRA', 'NIFTY INFRA'], ['^CNXIT', 'NIFTY IT'], ['^CNXMEDIA', 'NIFTY MEDIA'],
    ['^CNXMETAL', 'NIFTY METAL'], ['NIFTY_MIDCAP_100.NS', 'NIFTY MIDCAP 100'], ['^NSEMDCP50', 'NIFTY MIDCAP 50'], ['^CNXMNC', 'NIFTY MNC'], ['^NSMIDCP', 'NIFTY NEXT 50'],
    ['NIFTY_OIL_AND_GAS.NS', 'NIFTY OIL & GAS'], ['^CNXPHARMA', 'NIFTY PHARMA'], ['^CNXPSE', 'NIFTY PSE'], ['^CNXPSUBANK', 'NIFTY PSU BANK'], ['NIFTY_PVT_BANK.NS', 'NIFTY PVT BANK'],
    ['^CNXREALTY', 'NIFTY REALTY'], ['^CNXSERVICE', 'NIFTY SERVICES SECTOR'],
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const IN_TOP = [['^NSEI', 'NIFTY 50'], ['^NSEBANK', 'BANK NIFTY'], ['^BSESN', 'SENSEX'], ['^INDIAVIX', 'INDIA VIX', { inv: 1 }], ['USDINR=X', 'USD / INR', { dp: 3, inv: 1 }]];
  const GLOBAL = [
    ['ASIA-PACIFIC', [['^N225', 'NIKKEI 225', 'jp'], ['^KS11', 'KOSPI', 'kr'], ['000001.SS', 'SHANGHAI COMP', 'cn'], ['^HSI', 'HANG SENG', 'hk'], ['^TWII', 'TAIEX', 'tw'], ['^STI', 'STRAITS TIMES', 'sg'], ['^AXJO', 'ASX 200', 'au']]],
    ['EUROPE', [['^FTSE', 'FTSE 100', 'gb'], ['^GDAXI', 'DAX', 'de'], ['^FCHI', 'CAC 40', 'fr']]],
    ['UNITED STATES', [['^DJI', 'DOW JONES', 'us'], ['^GSPC', 'S&P 500', 'us'], ['^IXIC', 'NASDAQ', 'us']]],
  ];
  const COMM = [['GC=F', 'GOLD  US$/oz'], ['SI=F', 'SILVER  US$/oz'], ['CL=F', 'WTI CRUDE'], ['BZ=F', 'BRENT CRUDE'], ['NG=F', 'NATURAL GAS'], ['HG=F', 'COPPER']];
  const BONDS = [['^TNX', 'US 10Y YIELD'], ['^FVX', 'US 5Y YIELD'], ['^TYX', 'US 30Y YIELD'], ['^IRX', 'US 13-WEEK BILL']];
  const SETS = [
    { id: 'in5', syms: IN_TOP.map((x) => x[0]), kind: 'in' },
    { id: 'nx', syms: NIFTY_OTHERS.map((x) => x[0]), kind: 'in2' },
    { id: 'gl', syms: GLOBAL.reduce((a, g) => a.concat(g[1].map((x) => x[0])), []), kind: 'gl' },
    { id: 'cb', syms: COMM.concat(BONDS).map((x) => x[0]).concat(['EURINR=X', 'GBPINR=X', 'JPYINR=X', 'DX-Y.NYB', 'EURUSD=X']), kind: 'fut' },
  ];

  /* ---------- flags (inline SVG, 30×20) ---------- */
  const star = (cx, cy, r, rot) => { let p = []; for (let i = 0; i < 10; i++) { const a = (rot || -90) * Math.PI / 180 + i * Math.PI / 5, rr = i % 2 ? r * 0.382 : r; p.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2)); } return `<polygon points="${p.join(' ')}"/>`; };
  const UJ = '<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.6"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/><path d="M15 0V20M0 10H30" stroke="#C8102E" stroke-width="3.4"/>';
  const FL = {
    jp: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/>',
    kr: '<rect width="30" height="20" fill="#fff"/><path d="M9.5 10a5.5 5.5 0 0 1 11 0z" fill="#CD2E3A"/><path d="M9.5 10a5.5 5.5 0 0 0 11 0z" fill="#0047A0"/><g stroke="#000" stroke-width="1.2"><path d="M3 3.5l3 -1.6M4 5.3l3 -1.6M24 16.5l3 -1.6M23 14.7l3 -1.6M24 3.5l3 1.6M23 1.9l3 1.6M3 14.7l3 1.6M4 16.5l3 1.6"/></g>',
    cn: '<rect width="30" height="20" fill="#DE2910"/><g fill="#FFDE00">' + star(5.5, 5.5, 3.2) + star(11, 2.3, 1, -70) + star(13, 4.6, 1, -45) + star(13, 7.8, 1, -20) + star(11, 10, 1, 0) + '</g>',
    hk: '<rect width="30" height="20" fill="#DE2910"/><g fill="#fff">' + [0, 1, 2, 3, 4].map((i) => `<ellipse cx="${(15 + 3.6 * Math.cos((i * 72 - 90) * Math.PI / 180)).toFixed(2)}" cy="${(10 + 3.6 * Math.sin((i * 72 - 90) * Math.PI / 180)).toFixed(2)}" rx="2.2" ry="1.4" transform="rotate(${i * 72} ${(15 + 3.6 * Math.cos((i * 72 - 90) * Math.PI / 180)).toFixed(2)} ${(10 + 3.6 * Math.sin((i * 72 - 90) * Math.PI / 180)).toFixed(2)})"/>`).join('') + '</g><circle cx="15" cy="10" r="1" fill="#DE2910"/>',
    tw: '<rect width="30" height="20" fill="#FE0000"/><rect width="15" height="10" fill="#000095"/><circle cx="7.5" cy="5" r="2.6" fill="#fff"/><circle cx="7.5" cy="5" r="1.7" fill="#000095"/><circle cx="7.5" cy="5" r="1.2" fill="#fff"/>',
    sg: '<rect width="30" height="10" fill="#EF3340"/><rect y="10" width="30" height="10" fill="#fff"/><circle cx="7" cy="5" r="3.6" fill="#fff"/><circle cx="8.4" cy="5" r="3.2" fill="#EF3340"/><g fill="#fff">' + [0, 1, 2, 3, 4].map((i) => star(11.8 + 2.2 * Math.cos((i * 72 - 90) * Math.PI / 180), 5 + 2.2 * Math.sin((i * 72 - 90) * Math.PI / 180), .7)).join('') + '</g>',
    au: '<rect width="30" height="20" fill="#00008B"/><svg x="0" y="0" width="15" height="10" viewBox="0 0 30 20">' + UJ + '</svg><g fill="#fff">' + star(7.5, 15.2, 2.6) + star(22, 4, 1.3) + star(25.5, 9, 1.3) + star(22, 16, 1.3) + star(18.2, 9.5, 1.3) + '</g>',
    in: '<rect width="30" height="7" fill="#FF9933"/><rect y="7" width="30" height="6.2" fill="#fff"/><rect y="13.2" width="30" height="6.8" fill="#138808"/><circle cx="15" cy="10" r="2.4" fill="none" stroke="#000080" stroke-width=".8"/><circle cx="15" cy="10" r=".6" fill="#000080"/>',
    gb: UJ,
    de: '<rect width="30" height="6.7" fill="#000"/><rect y="6.7" width="30" height="6.6" fill="#DD0000"/><rect y="13.3" width="30" height="6.7" fill="#FFCE00"/>',
    fr: '<rect width="10" height="20" fill="#0055A4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#EF4135"/>',
    us: '<rect width="30" height="20" fill="#fff"/>' + [0, 2, 4, 6, 8, 10, 12].map((i) => `<rect y="${(i * 20 / 13).toFixed(2)}" width="30" height="${(20 / 13).toFixed(2)}" fill="#B22234"/>`).join('') + '<rect width="13" height="10.8" fill="#3C3B6E"/><g fill="#fff">' + [0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<circle cx="${(2 + c * 3 + (r % 2) * 1.5).toFixed(1)}" cy="${(2 + r * 3).toFixed(1)}" r=".7"/>`).join('')).join('') + '</g>',
  };
  const flag = (c) => `<svg class="jd-flag" viewBox="0 0 30 20" width="24" height="16" aria-label="${c}"><g>${FL[c] || ''}</g></svg>`;

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
  const S = { q: {}, timer: null, last: 0, busy: false, due: {}, mode: '', err: '', news: [], newsAt: 0, newsBusy: false, newsErr: '', x: { in10y: null, pcr: null }, xDue: 0, xFail: { in10y: 0, pcr: 0 } };
  const manual = () => { try { return JSON.parse(localStorage.getItem(LS_MAN) || '{}') || {}; } catch (e) { return {}; } };
  const setManual = (k, v) => { try { const m = manual(); if (v == null || v === '' || isNaN(+v)) delete m[k]; else m[k] = { v: +v, t: Date.now() }; localStorage.setItem(LS_MAN, JSON.stringify(m)); } catch (e) {} paint(); };

  function parseRow(s, r) {
    const m = r.meta || {}, c = ((r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || []).filter((v) => v != null);
    return { s, p: m.regularMarketPrice, pc: m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose, t: m.regularMarketTime, sp: c.slice(-40) };
  }
  async function fetchBatch(syms) {
    const be = getBackend();
    if (be) {
      try {
        const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=dash&symbols=' + encodeURIComponent(syms.join(','))), 25000));
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

  function cadence(set, w) { // seconds between refreshes (keeps the Apps Script daily fetch quota safe)
    const active = w.ist.cls !== 'off';
    if (set.kind === 'in') return active ? 60 : 900;
    if (set.kind === 'in2') return active ? 120 : 1200;
    if (set.kind === 'gl') return ['jp', 'kr', 'cn', 'hk', 'uk', 'de', 'fr', 'us'].some((k) => w.open[k]) ? 180 : 1200;
    return (w.fut || w.open.us) ? 120 : 1200;
  }
  const wantNow = (ms) => { const defs = mktDef(ms), open = {}; defs.forEach((m) => { open[m.k] = isOpen(m, ms); }); return { open, ist: indiaState(ms), fx: FX_OPEN(ms), fut: FUT_OPEN(ms) }; };
  async function refresh(force) {
    if (S.busy) return; const ms = Date.now(), w = wantNow(ms); S.busy = true; setBusy(true);
    try {
      const sets = SETS.filter((g) => force || !S.due[g.id] || ms >= S.due[g.id]);
      const syms = []; sets.forEach((g) => syms.push(...g.syms));
      if (syms.length) {
        const rows = await fetchBatch(syms); let ok = 0;
        rows.forEach((r) => { if (r && !r.err && r.p != null) { const old = S.q[r.s]; S.q[r.s] = Object.assign({}, r, { flash: old && old.p !== r.p ? (r.p > old.p ? 'up' : 'dn') : '' }); ok++; } });
        sets.forEach((g) => { S.due[g.id] = ms + cadence(g, w) * 1000; });
        S.last = ms; S.err = ok ? '' : 'No quotes returned — check the Data backend box or your connection.';
      }
    } catch (e) { S.err = (e && e.message) || 'Refresh failed'; }
    finally { S.busy = false; setBusy(false); paint(); }
    extras(false); news(false);
  }

  /* India 10Y + Nifty PCR: best-effort extras. NSE and some bond sites refuse Google's servers, so each is retried
     rarely and a manual entry (click the dash) is always available. */
  async function extras(force) {
    const ms = Date.now(); if (!force && ms < S.xDue) return; const be = getBackend(); if (!be) return;
    S.xDue = ms + 5 * 60000;
    const go = async (k) => {
      if (!force && S.xNext && S.xNext[k] && ms < S.xNext[k]) return;
      try { const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=' + (k === 'pcr' ? 'pcr' : 'in10y')), 14000)); if (j && !j.error && (j.pcr != null || j.p != null)) { S.x[k] = j; S.xFail[k] = 0; S.xNext = Object.assign(S.xNext || {}, { [k]: ms + (k === 'pcr' ? 5 : 20) * 60000 }); } else throw new Error(j && j.error || 'bad'); }
      catch (e) { S.xFail[k]++; S.xNext = Object.assign(S.xNext || {}, { [k]: ms + Math.min(6 * 3600000, 10 * 60000 * Math.pow(2, S.xFail[k] - 1)) }); }
    };
    await Promise.all([go('in10y'), go('pcr')]); paint();
  }

  /* live news: Google News RSS through the backend allow-list (falls back to proxies) */
  const NEWS_Q = [['Sensex OR Nifty OR "Bank Nifty" when:1d', 'INDIA'], ['RBI OR rupee OR "FII" OR "crude oil" India when:1d', 'MACRO'], ['"Wall Street" OR Nasdaq OR "Fed" stocks when:1d', 'GLOBAL']];
  async function news(force) {
    const ms = Date.now(); if (S.newsBusy || (!force && S.newsAt && ms - S.newsAt < 5 * 60000)) return; S.newsBusy = true;
    try {
      const all = await Promise.all(NEWS_Q.map(async (q) => {
        try {
          const xml = await fetchData('https://news.google.com/rss/search?q=' + encodeURIComponent(q[0]) + '&hl=en-IN&gl=IN&ceid=IN:en', { kind: 'text', validate: (t) => /<item>/.test(t) });
          const d = new DOMParser().parseFromString(xml, 'text/xml'); const out = [];
          d.querySelectorAll('item').forEach((it) => { let t = (it.querySelector('title') || {}).textContent || '', src = (it.querySelector('source') || {}).textContent || ''; if (src && t.endsWith(' - ' + src)) t = t.slice(0, -(src.length + 3)); out.push({ t, src, link: (it.querySelector('link') || {}).textContent || '', ts: Date.parse((it.querySelector('pubDate') || {}).textContent || '') || 0, tag: q[1] }); });
          return out;
        } catch (e) { return []; }
      }));
      const seen = new Set(), list = []; all.flat().sort((a, b) => b.ts - a.ts).forEach((n) => { const k = n.t.toLowerCase().slice(0, 60); if (!n.t || seen.has(k)) return; seen.add(k); list.push(n); });
      if (list.length) { S.news = list.slice(0, 40); S.newsErr = ''; } else S.newsErr = 'News feed unavailable right now';
      S.newsAt = ms;
    } finally { S.newsBusy = false; paint(); }
  }

  /* ---------- market mood (0–100) ---------- */
  const cl = (v) => Math.max(-1, Math.min(1, v));
  const pctOf = (sym) => { const q = S.q[sym]; return q && q.pc ? (q.p - q.pc) / q.pc * 100 : null; };
  function moodScore() {
    const parts = []; const add = (name, v, w, txt) => { if (v != null && !isNaN(v)) parts.push({ name, v: cl(v), w, txt }); };
    const nf = pctOf('^NSEI'); add('Nifty 50', nf == null ? null : nf / 1.2, 3, nf == null ? '' : (nf >= 0 ? '+' : '') + nf.toFixed(2) + '%');
    const idx = ['^NSEBANK', '^BSESN'].concat(NIFTY_OTHERS.map((x) => x[0])).filter((s) => S.q[s] && S.q[s].pc); const up = idx.filter((s) => S.q[s].p > S.q[s].pc).length;
    if (idx.length >= 8) add('Breadth', 2 * up / idx.length - 1, 2, `${up}/${idx.length} indices up`);
    const vq = S.q['^INDIAVIX']; if (vq && vq.pc) { const vp = (vq.p - vq.pc) / vq.pc * 100; add('India VIX', -vp / 8 + (vq.p < 13 ? .3 : vq.p > 20 ? -.5 : 0), 1.8, vq.p.toFixed(1) + (vp >= 0 ? ' ▲' : ' ▼')); }
    const gl = ['^N225', '^HSI', '^KS11', '^FTSE', '^GDAXI', '^FCHI', '^DJI', '^GSPC', '^IXIC'].map(pctOf).filter((x) => x != null); if (gl.length >= 3) { const a = gl.reduce((x, y) => x + y, 0) / gl.length; add('Global', a / 0.9, 2, (a >= 0 ? '+' : '') + a.toFixed(2) + '% avg'); }
    const fx = pctOf('USDINR=X'); add('Rupee', fx == null ? null : -fx / 0.4, 1, fx == null ? '' : fx > 0 ? 'weaker' : 'firmer');
    const br = pctOf('BZ=F'); add('Crude', br == null ? null : -br / 2.5, .8, br == null ? '' : (br >= 0 ? '+' : '') + br.toFixed(1) + '%');
    const t = S.q['^TNX']; if (t && t.pc) add('US yields', -((t.p - t.pc) * 100) / 8, .7, ((t.p - t.pc) * 100 >= 0 ? '+' : '') + ((t.p - t.pc) * 100).toFixed(1) + ' bp');
    const pc = pcrVal(); if (pc != null) add('PCR', (pc - 1) / 0.4, 1, pc.toFixed(2));
    const W = parts.reduce((a, p) => a + p.w, 0); if (!W || parts.length < 3) return null;
    const sum = parts.reduce((a, p) => a + p.w * p.v, 0) / W; const score = Math.round(50 + 50 * sum);
    const top = parts.slice().sort((a, b) => Math.abs(b.w * b.v) - Math.abs(a.w * a.v)).slice(0, 3);
    return { score, top, parts };
  }
  const moodLabel = (s) => s >= 80 ? ['VERY BULLISH', '#0b7a3f'] : s >= 60 ? ['BULLISH', '#2ea05f'] : s >= 40 ? ['NEUTRAL', '#c79a1b'] : s >= 20 ? ['BEARISH', '#e0643a'] : ['VERY BEARISH', '#b3162f'];
  function gaugeSVG(score) {
    const cx = 100, cy = 92, R = 78, r = 54, cols = ['#b3162f', '#e0643a', '#e9bd2d', '#7bc47a', '#0b7a3f'];
    const arc = (a0, a1, col) => { const p = (a, rad) => [cx + rad * Math.cos(Math.PI - a * Math.PI), cy - rad * Math.sin(Math.PI - a * Math.PI)]; const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r); return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}A${r} ${r} 0 0 0 ${x3.toFixed(1)} ${y3.toFixed(1)}Z" fill="${col}"/>`; };
    const arcs = cols.map((c, i) => arc(i / 5 + .006, (i + 1) / 5 - .006, c)).join('');
    const ang = -90 + (score == null ? 50 : score) * 1.8;
    return `<svg viewBox="0 0 200 108" class="jd-gauge" aria-hidden="true">${arcs}<g class="jd-needle" style="transform:rotate(${ang}deg);transform-origin:${cx}px ${cy}px"><path d="M${cx - 3} ${cy}L${cx} ${cy - 70}L${cx + 3} ${cy}Z" fill="#fff"/></g><circle cx="${cx}" cy="${cy}" r="7" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="3" fill="#0f2352"/></svg>`;
  }

  /* ---------- PCR / 10Y values ---------- */
  function pcrVal() { if (S.x.pcr && S.x.pcr.pcr != null) return S.x.pcr.pcr; const m = manual().pcr; return m ? m.v : null; }
  const pcrTag = (v) => v >= 1.3 ? ['OVERSOLD · BULLISH', 'g'] : v >= 1.0 ? ['BULLISH', 'g'] : v >= 0.8 ? ['NEUTRAL', ''] : v >= 0.6 ? ['BEARISH', 'r'] : ['OVERBOUGHT · BEARISH', 'r'];

  /* ---------- rendering ---------- */
  function spark(sp, up, w, h) {
    if (!sp || sp.length < 2) return '<span class="jd-sp0"></span>';
    const mn = Math.min(...sp), mx = Math.max(...sp), r = mx - mn || 1;
    const pts = sp.map((v, i) => `${(i / (sp.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`);
    const col = up == null ? '#7a8699' : up ? '#12894b' : '#c11d3d';
    return `<svg class="jd-sp" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  }
  const fmtN = (v, dp) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const dpOf = (p) => p >= 1000 ? 2 : p >= 100 ? 2 : p >= 10 ? 2 : 3;
  function row(sym, name, o, ms, opts) {
    o = o || {}; opts = opts || {}; const q = S.q[sym];
    const lead = opts.flag ? flag(opts.flag) : '';
    if (!q) return `<tr class="jd-na"><td class="jd-nm">${lead}${esc(name)}<button class="jd-xr" type="button" data-xr="${esc(sym)}" title="Live X-ray of ${esc(name)}">X-ray</button></td><td class="jd-px">…</td><td class="jd-ch"></td><td class="jd-pc"></td></tr>`;
    const dp = o.dp != null ? o.dp : (opts.yield ? 3 : dpOf(q.p)); const chg = q.pc != null ? q.p - q.pc : null, pct = q.pc ? chg / q.pc * 100 : null;
    const dir = chg == null || Math.abs(pct) < 0.005 ? 0 : chg > 0 ? 1 : -1, good = (o.inv || opts.yield) ? -dir : dir;
    const age = (ms / 1000 - (q.t || 0)) / 60, live = age >= 0 && age < 20; const when = q.t ? new Date(q.t * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
    const cls = good > 0 ? 'u' : good < 0 ? 'd' : '';
    const chTxt = chg == null ? '—' : opts.yield ? `${chg >= 0 ? '+' : ''}${(chg * 100).toFixed(1)} bp` : `${chg > 0 ? '+' : ''}${fmtN(chg, dp)}`;
    return `<tr class="${cls} ${q.flash ? 'fl-' + q.flash : ''}" title="${esc(sym)} · last tick ${when} IST${live ? '' : ' · market closed, last session'}">
      <td class="jd-nm">${lead}<span class="jd-live ${live ? 'on' : 'off'}"></span>${esc(name)}<button class="jd-xr" type="button" data-xr="${esc(sym)}" title="Live X-ray of ${esc(name)}">X-ray</button></td>
      <td class="jd-px">${fmtN(q.p, dp)}${opts.yield ? '<i>%</i>' : ''}</td>
      <td class="jd-ch"><b>${dir > 0 ? '▲' : dir < 0 ? '▼' : '■'}</b> ${chTxt}</td>
      <td class="jd-pc"><span>${pct == null ? '—' : (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'}</span></td></tr>`;
  }
  const head = '<thead><tr><th>Market</th><th>Last</th><th>Change</th><th>%</th></tr></thead>';
  const manIn = (k, ph) => `<input class="jd-man" inputmode="decimal" placeholder="${ph}" title="Feed unavailable — type today's value" onchange="window.jdMan('${k}',this.value)">`;

  function in10yRow() {
    const x = S.x.in10y, m = manual().in10y;
    if (x && x.p != null) { const chg = x.pc != null ? (x.p - x.pc) * 100 : null; const cls = chg == null || Math.abs(chg) < .05 ? '' : chg > 0 ? 'd' : 'u'; // yields up = bond prices down (red for equities)
      return `<tr class="${cls}" title="India 10-year G-Sec · ${esc(x.d || '')}"><td class="jd-nm">${flag('in')}<span class="jd-live on"></span>INDIA 10Y G-SEC</td><td class="jd-px">${fmtN(x.p, 3)}<i>%</i></td><td class="jd-ch"><b>${chg == null ? '■' : chg > 0 ? '▲' : '▼'}</b> ${chg == null ? '—' : (chg >= 0 ? '+' : '') + chg.toFixed(1) + ' bp'}</td><td class="jd-pc"><span>${x.pc ? (((x.p - x.pc) / x.pc) * 100 >= 0 ? '+' : '') + (((x.p - x.pc) / x.pc) * 100).toFixed(2) + '%' : ''}</span></td></tr>`; }
    if (m) return `<tr title="Entered by you"><td class="jd-nm">${flag('in')}<span class="jd-live off"></span>INDIA 10Y G-SEC <small class="jd-tagm">manual</small></td><td class="jd-px">${fmtN(m.v, 3)}<i>%</i></td><td class="jd-ch" colspan="2"><a href="#" class="jd-clr" onclick="window.jdMan('in10y','');return false">clear</a></td></tr>`;
    return `<tr class="jd-na"><td class="jd-nm">${flag('in')}<span class="jd-live off"></span>INDIA 10Y G-SEC</td><td class="jd-px">${manIn('in10y', 'yield %')}</td><td class="jd-ch" colspan="2"><small>enter value</small></td></tr>`;
  }
  function pcrRow() {
    const x = S.x.pcr, m = manual().pcr, v = x && x.pcr != null ? x.pcr : m ? m.v : null;
    if (v != null) { const t = pcrTag(v); return `<tr class="${t[1] === 'g' ? 'u' : t[1] === 'r' ? 'd' : ''}" title="${x ? 'NSE option chain · expiry ' + esc(x.expiry || '') + ' · ' + esc(x.ts || '') : 'Entered by you'}"><td class="jd-nm"><span class="jd-live ${x ? 'on' : 'off'}"></span>NIFTY PCR (OI) ${x ? '' : '<small class="jd-tagm">manual</small>'}</td><td class="jd-px">${v.toFixed(2)}</td><td class="jd-ch" colspan="2"><span class="jd-tr ${t[1]}">${t[0]}</span>${x ? '' : ' <a href="#" class="jd-clr" onclick="window.jdMan(\'pcr\',\'\');return false">clear</a>'}</td></tr>`; }
    return `<tr class="jd-na"><td class="jd-nm"><span class="jd-live off"></span>NIFTY PCR (OI)</td><td class="jd-px">${manIn('pcr', 'PCR')}</td><td class="jd-ch" colspan="2"><small>enter value</small></td></tr>`;
  }
  const flagFor = { '^NSEI': 'in', '^NSEBANK': 'in', '^BSESN': 'in', '^INDIAVIX': 'in', 'USDINR=X': 'us' };
  function card(title, icon, body, extra) { return `<section class="jd-card jd-tc"><h3><span class="jd-ic">${icon}</span>${title}${extra || ''}</h3>${body}</section>`; }

  function colIndia(ms) {
    const top = IN_TOP.map((it) => row(it[0], it[1], it[2], ms, { flag: it[0] === 'USDINR=X' ? null : 'in' })).join('') + in10yRow() + pcrRow();
    const rest = NIFTY_OTHERS.map((it) => row(it[0], it[1], {}, ms)).join('');
    return card('Indian markets', '🇮🇳', `<table class="jd-tb" id="jd-in">${head}<tbody>${top}</tbody></table>`, `<span class="jd-chip ${indiaState(ms).cls !== 'off' ? 'on' : ''}">${indiaState(ms).cls !== 'off' ? '● LIVE' : 'CLOSED'}</span>`)
      + card('Nifty indices <small>A → Z</small>', '📈', `<div class="jd-scroll"><table class="jd-tb">${head}<tbody>${rest}</tbody></table></div>`);
  }
  function colGlobal(ms) {
    const w = wantNow(ms); const anyOpen = ['jp', 'kr', 'cn', 'hk', 'uk', 'de', 'fr', 'us'].some((k) => w.open[k]);
    const body = GLOBAL.map((g) => `<tbody><tr class="jd-sub"><td colspan="4">${g[0]}</td></tr>${g[1].map((it) => row(it[0], it[1], {}, ms, { flag: it[2] })).join('')}</tbody>`).join('');
    return card('Global markets', '🌍', `<table class="jd-tb">${head}${body}</table>`, `<span class="jd-chip ${anyOpen ? 'on' : ''}">${anyOpen ? '● LIVE' : 'CLOSED'}</span>`);
  }
  function colComm(ms) {
    const w = wantNow(ms);
    return card('Commodities', '🛢', `<table class="jd-tb">${head}<tbody>${COMM.map((it) => row(it[0], it[1], {}, ms)).join('')}</tbody></table>`, `<span class="jd-chip ${w.fut ? 'on' : ''}">${w.fut ? '● LIVE' : 'CLOSED'}</span>`)
      + card('Currencies <small>vs rupee &amp; dollar</small>', '💱', `<table class="jd-tb">${head}<tbody>${['EURINR=X', 'GBPINR=X', 'JPYINR=X', 'DX-Y.NYB', 'EURUSD=X'].map((s) => row(s, { 'EURINR=X': 'EUR / INR', 'GBPINR=X': 'GBP / INR', 'JPYINR=X': 'JPY / INR', 'DX-Y.NYB': 'US DOLLAR INDEX', 'EURUSD=X': 'EUR / USD' }[s], { dp: s === 'JPYINR=X' || s === 'EURUSD=X' ? 4 : 3 }, ms)).join('')}</tbody></table>`)
      + card('Bonds &amp; yields', '🏦', `<table class="jd-tb">${head}<tbody>${BONDS.map((it) => row(it[0], it[1], {}, ms, { yield: 1, flag: 'us' })).join('')}</tbody></table><div class="jd-fn">Yield change in basis points. India 10Y G-Sec sits in the Indian markets table.</div>`);
  }
  const ago = (ts, ms) => { const m = Math.max(0, Math.round((ms - ts) / 60000)); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'; };
  function colNews(ms) {
    const items = S.news.map((n) => `<a class="jd-nw" href="${esc(n.link)}" target="_blank" rel="noopener"><span class="jd-nt t-${n.tag}">${n.tag}</span><span class="jd-nb">${esc(n.t)}<small>${esc(n.src)} · ${n.ts ? ago(n.ts, ms) : ''}</small></span></a>`).join('');
    return `<section class="jd-card jd-tc jd-newsc"><h3><span class="jd-ic">📰</span>Live news <span class="jd-chip on">● LIVE</span></h3>
      <div class="jd-nlist">${items || `<div class="jd-fn">${S.newsErr ? esc(S.newsErr) : 'Loading headlines…'}</div>`}</div><div class="jd-fn">Headlines via Google News · tap to open the source.${S.newsAt ? ' Updated ' + new Date(S.newsAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST.' : ''}</div></section>`;
  }

  function heatHTML(ms) {
    const all = [['^NSEI', 'NIFTY 50'], ['^NSEBANK', 'BANK NIFTY'], ['^BSESN', 'SENSEX']].concat(NIFTY_OTHERS.map((x) => [x[0], x[1].replace(/^NIFTY /, '')]));
    const items = all.map((it) => { const q = S.q[it[0]]; const pct = q && q.pc ? (q.p - q.pc) / q.pc * 100 : null; return { n: it[1], sym: it[0], p: pct, px: q ? q.p : null, big: it[0] === '^NSEI' || it[0] === '^NSEBANK' || it[0] === '^BSESN' }; });
    const have = items.filter((i) => i.p != null); const mx = Math.max(1.5, ...have.map((i) => Math.abs(i.p)));
    const col = (p) => { if (p == null) return ['#e9edf5', '#7b88a6']; const a = Math.min(1, Math.abs(p) / mx), t = Math.pow(a, .7); if (Math.abs(p) < 0.03) return ['#eef1f7', '#4a5878']; return p > 0 ? [`rgb(${Math.round(226 - t * 196)},${Math.round(244 - t * 90)},${Math.round(234 - t * 150)})`, t > .55 ? '#fff' : '#0b5a31'] : [`rgb(${Math.round(253 - t * 60)},${Math.round(228 - t * 190)},${Math.round(232 - t * 180)})`, t > .55 ? '#fff' : '#8f1228']; };
    const tiles = items.slice().sort((a, b) => (b.big - a.big) || ((b.p == null ? -99 : b.p) - (a.p == null ? -99 : a.p))).map((i) => { const c = col(i.p); return `<div class="jd-hmt${i.big ? ' big' : ''}" data-xr="${esc(i.sym)}" style="cursor:pointer;background:${c[0]};color:${c[1]}" title="${esc(i.n)} · ${i.px == null ? '—' : fmtN(i.px, 2)} · click for live X-ray"><b>${esc(i.n)}</b><span>${i.p == null ? '—' : (i.p > 0 ? '+' : '') + i.p.toFixed(2) + '%'}</span></div>`; }).join('');
    const adv = have.filter((i) => i.p > 0.03).length, dec = have.filter((i) => i.p < -0.03).length;
    return `<section class="jd-card jd-tc jd-heat"><h3><span class="jd-ic">🟩</span>Indian indices heatmap <small>% change · sorted strongest → weakest</small><span class="jd-chip ${indiaState(ms).cls !== 'off' ? 'on' : ''}">${adv} ▲ · ${dec} ▼</span></h3><div class="jd-hmg">${tiles}</div><div class="jd-hml"><span>−${mx.toFixed(1)}%</span><i></i><span>0</span><i class="g"></i><span>+${mx.toFixed(1)}%</span></div></section>`;
  }
  function heroHTML(w, ms) {
    const ist = w.ist, ip = istParts(ms);
    const dateStr = new Date(ms).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const nifty = S.q['^NSEI']; const nAge = nifty ? (ms / 1000 - (nifty.t || 0)) / 60 : null;
    let label = ist.label, cls = ist.cls, blink = ist.blink, note = ist.note;
    if (cls === 'live' && nAge != null && nAge > 30) { label = 'AWAITING FEED'; cls = 'warn'; blink = false; note = 'Session hours, but Nifty’s last tick is ' + Math.round(nAge) + ' min old — possible exchange holiday or delayed feed'; }
    const SHORT = { jp: 'Japan', kr: 'Korea', cn: 'China', hk: 'Hong Kong', uk: 'UK', de: 'Germany', fr: 'France', us: 'US' }; const liveGl = mktDef(ms).filter((m) => SHORT[m.k] && isOpen(m, ms)).map((m) => SHORT[m.k]);
    let sub; if (cls === 'off') sub = `Next India open in <b>${ist.next != null ? left(ist.next) : '—'}</b> · open now: <b>${liveGl.length ? esc(liveGl.join(' · ')) : 'MCX / forex only'}</b>`;
    else sub = `${cls === 'pre' ? 'Opens in <b>' + left(9 * 60 + 15 - ip.min) + '</b>' : ip.min < 15 * 60 + 30 ? 'Cash market closes in <b>' + left(15 * 60 + 30 - ip.min) + '</b>' : ip.min < 15 * 60 + 40 ? 'F&amp;O closes in <b>' + left(15 * 60 + 40 - ip.min) + '</b>' : 'Session winding down'} · also open: <b>${liveGl.length ? esc(liveGl.join(' · ')) : 'MCX · forex'}</b>`;
    const md = moodScore(), ml = md ? moodLabel(md.score) : ['LOADING', '#8a94ad'];
    const drv = md ? md.top.map((p) => `<span>${esc(p.name)} <b style="color:${p.v >= 0 ? '#6ee7a0' : '#ff9aa9'}">${esc(p.txt)}</b></span>`).join('') : '';
    return `<div class="jd-hero">
      <div class="jd-left"><div class="jd-clk"><div class="jd-time" id="jdTime">--:--:--</div><div class="jd-date">${esc(dateStr)}</div><div class="jd-tz">INDIAN STANDARD TIME · UTC+5:30</div><div class="jd-livebox"><a class="jd-pill st-${cls} ${blink ? 'jd-blink' : ''}" href="#jd-in" data-jdgo="jd-in" title="Jump to Indian markets"><span class="jd-dot"></span><span class="jd-pl"><small>INDIA · NSE / BSE</small><b>${esc(label)}</b></span><span class="jd-pn">${esc(note)}</span></a><div class="jd-sub">${sub}</div></div></div>
      <div class="jd-mood" title="${md ? esc(md.top.map((p) => p.name + ' ' + p.txt).join(' · ')) + ' — ' : ''}Composite of Nifty move, index breadth, VIX, global markets, rupee, crude, US yields${pcrVal() != null ? ' and PCR' : ''}. A reading of today’s tone, not a forecast."><div class="jd-mh">MARKET MOOD</div>${gaugeSVG(md ? md.score : null)}<div class="jd-mv" style="color:${ml[1]}"><b>${md ? md.score : '—'}</b><span>${ml[0]}</span></div></div></div>
      <div class="jd-mid"><img class="jd-ban" src="assets/jc-banner.png" alt="Joshi’s Corner — Shares ◆ Insurance ◆ Restaurant · Connecting People Thru Services…S.I.R" draggable="false"></div>
      <div class="jd-tv" aria-label="Live business TV">${tvTiles()}</div></div>`;
  }


  /* ---------- live business TV: tiles in the header + one persistent docked player (lives on <body>, so it keeps playing when the tab/view changes) ---------- */
  const TV = [
    { k: 'zee', n: 'Zee Business', c: 'UCkXopQ3ubd-rnXnStZqCl2w', col: '#e53935' },
    { k: 'cnbc', n: 'CNBC Awaaz', c: 'UCQIycDaLsBpMKjOCeaKUYVg', col: '#f9a825' },
    { k: 'ndtv', n: 'NDTV Profit', c: 'UC3uJIdRFTGgLWrUziaHbzrg', col: '#1e88e5' },
    { k: 'etnow', n: 'ET Now', c: 'UCI_mwTKUhicNzFrhm33MzBQ', col: '#d81b60' },
  ];
  const tvCur = () => { try { return window.__jdtv && window.__jdtv.cur; } catch (e) { return null; } };
  function tvTiles() {
    const cur = tvCur();
    return '<div class="jd-tvh">LIVE TV <small>tap to watch · keeps playing on every tab</small></div><div class="jd-tvg">' + TV.map((t) => `<button type="button" class="jd-tvb${cur === t.k ? ' on' : ''}" data-jdtv="${t.k}" style="--tc:${t.col}" title="Watch ${esc(t.n)} live"><i class="jd-tvd"></i><b>${esc(t.n)}</b><span>${cur === t.k ? 'NOW PLAYING' : '● LIVE'}</span></button>`).join('') + '</div>';
  }
  const tvSrc = (t) => (t.vid ? 'https://www.youtube.com/embed/' + t.vid + '?' : 'https://www.youtube.com/embed/live_stream?channel=' + t.c + '&') + 'autoplay=1&rel=0&playsinline=1';
  function tvEnsure() {
    let el = document.getElementById('jdTvDock'); if (el) return el;
    const st = document.createElement('style'); st.textContent = `
    #jdTvDock{position:fixed;right:14px;bottom:14px;width:min(400px,calc(100vw - 28px));z-index:99990;background:#0a1736;border:1px solid #2b4a9a;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);overflow:hidden;display:none;color:#fff;font-family:inherit}
    #jdTvDock.on{display:block}#jdTvDock .tvbar{display:flex;align-items:center;gap:6px;padding:6px 8px;background:linear-gradient(90deg,#17388a,#0d2358);font-size:12px;font-weight:800;flex-wrap:wrap}
    #jdTvDock .tvbar .tt{flex:1;min-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#jdTvDock .tvbar .tt:before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff3b30;margin-right:6px;animation:jdpulse 1.4s infinite}
    #jdTvDock button{border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;border-radius:7px;padding:3px 8px;font-size:11px;font-weight:800;cursor:pointer}#jdTvDock button:hover{background:rgba(255,255,255,.28)}#jdTvDock button.on{background:#fff;color:#0a1736}
    #jdTvDock .tvch{display:flex;gap:4px;padding:5px 8px;background:#0c1e4a;flex-wrap:wrap}#jdTvDock .tvbox{position:relative;width:100%;aspect-ratio:16/9;background:#000}#jdTvDock .tvld{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#9fb3e6}#jdTvDock iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
    #jdTvDock.min .tvch{display:none}#jdTvDock.min .tvbox{position:absolute;left:-9999px;width:320px;height:180px;aspect-ratio:auto}
    @media(max-width:600px){#jdTvDock{right:8px;left:8px;bottom:8px;width:auto}}`;
    document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'jdTvDock';
    el.innerHTML = '<div class="tvbar"><span class="tt" id="jdTvT">Live TV</span><button type="button" data-tvact="min" title="Minimise (audio keeps playing)">▁</button><button type="button" data-tvact="pop" title="Open in a separate small window — keeps playing even if you minimise or leave this page">⧉ Pop out</button><button type="button" data-tvact="yt" title="Open on YouTube">YouTube ↗</button><button type="button" data-tvact="x" title="Stop and close">✕</button></div><div class="tvch" id="jdTvCh"></div><div class="tvbox" id="jdTvBox"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const a = b.getAttribute('data-tvact'), k = b.getAttribute('data-tvch'); if (k) tvPlay(k); else if (a === 'x') tvStop(); else if (a === 'min') { el.classList.toggle('min'); b.textContent = el.classList.contains('min') ? '▢' : '▁'; } else if (a === 'pop') tvPop(); else if (a === 'yt') { const t = TV.find((x) => x.k === tvCur()); if (t) window.open('https://www.youtube.com/channel/' + t.c + '/live', '_blank', 'noopener'); } });
    return el;
  }
  function tvMark(k) { document.querySelectorAll('.jd-tvb').forEach((b) => { const on = b.getAttribute('data-jdtv') === k; b.classList.toggle('on', on); const sp = b.querySelector('span'); if (sp) sp.textContent = on ? 'NOW PLAYING' : '● LIVE'; }); }
  const tvVid = {};
  async function tvResolve(t) {
    const c = tvVid[t.k]; if (c && Date.now() - c.at < 180000) return c.vid;
    try { const u = typeof getBackend === 'function' ? getBackend() : ''; if (u) { const j = JSON.parse(await fetchWithTimeout(beUrl(u, 'action=ytlive&channel=' + t.c), 20000)); if (j && j.ok && j.vid) { tvVid[t.k] = { vid: j.vid, at: Date.now() }; return j.vid; } } } catch (e) { }
    return null;
  }
  async function tvPlay(k) {
    const t = TV.find((x) => x.k === k); if (!t) return; const el = tvEnsure(); window.__jdtv = window.__jdtv || {}; window.__jdtv.cur = k; const tok = (window.__jdtv.tok = (window.__jdtv.tok || 0) + 1);
    el.classList.add('on'); el.classList.remove('min');
    document.getElementById('jdTvT').textContent = t.n + ' · LIVE';
    document.getElementById('jdTvCh').innerHTML = TV.map((x) => `<button type="button" data-tvch="${x.k}" class="${x.k === k ? 'on' : ''}">${esc(x.n)}</button>`).join('');
    const box = document.getElementById('jdTvBox'); box.innerHTML = '<div class="tvld">Connecting to ' + esc(t.n) + '…</div>'; tvMark(k);
    const vid = await tvResolve(t); if (window.__jdtv.tok !== tok || window.__jdtv.cur !== k) return;
    t.vid = vid; box.innerHTML = '<iframe title="' + esc(t.n) + ' live" src="' + tvSrc(t) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  }
  function tvStop() { const el = document.getElementById('jdTvDock'); if (!el) return; document.getElementById('jdTvBox').innerHTML = ''; el.classList.remove('on'); window.__jdtv.cur = null; tvMark(null); }
  function tvPop() {
    const t = TV.find((x) => x.k === tvCur()); if (!t) return;
    const w = window.open('', 'jcTvPop', 'width=520,height=340,menubar=no,toolbar=no,location=no,status=no'); if (!w) { alert('Your browser blocked the pop-up window. Allow pop-ups for this site and press Pop out again.'); return; }
    w.document.title = t.n + ' — Joshi’s Corner Live TV'; w.document.body.setAttribute('style', 'margin:0;background:#000'); w.document.body.innerHTML = '<iframe style="position:fixed;inset:0;width:100%;height:100%;border:0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen src="' + tvSrc(t) + '"></iframe>';
    tvStop(); // the pop-out takes over so the sound is not doubled
  }
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-jdtv]'); if (b) { e.preventDefault(); tvPlay(b.getAttribute('data-jdtv')); } });

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
      <div><span class="jd-pillmini"><span class="jd-dot"></span>LIVE</span><p>The blinking pill at the top is the <b>Indian market session</b>: green = trading, amber = pre-open, violet = closing auction, grey = closed — then it shows the countdown to the next open and which global markets are trading instead.</p></div>
      <div><span class="jd-mini-g">MARKET MOOD</span><p>0–100 gauge built from today’s Nifty move, breadth of the Indian indices, India VIX, global markets, rupee, crude, US yields and PCR. <b>0–20</b> very bearish · <b>20–40</b> bearish · <b>40–60</b> neutral · <b>60–80</b> bullish · <b>80–100</b> very bullish. Hover it for the weights. It describes tone, not a forecast.</p></div>
      <div><span class="jd-live on"></span> <span class="jd-live off"></span><p>Dot beside a name: <b>green</b> = a tick in the last 20 minutes; <b>grey</b> = market closed, showing the last session. Hover a row for its last-tick time.</p></div>
      <div><b style="color:#12894b">▲</b> <b style="color:#c11d3d">▼</b><p>Change vs previous close. <b>India VIX</b> and <b>USD/INR</b> are inverted (a rise is red). India 10Y yield up = red.</p></div>
      <div><b>PCR &amp; India 10Y</b><p>Nifty put-call ratio (open interest, nearest expiry): above 1 leans bullish, below 0.8 bearish. NSE and some bond sites refuse cloud servers — when a feed is blocked you can type today’s value in the box (saved on this device).</p></div>
      <div><b>Refresh</b><p>India indices every minute in session, other Nifty indices every 2 min, global every 3 min, closed markets every 15–20 min; news every 5 min. Quotes are delayed Yahoo Finance data.</p></div></div></div>`;
  }

  function paint() {
    const el = $('pDash'); if (!el || !el.classList.contains('active')) return; const ms = Date.now(), w = wantNow(ms);
    const keep = window.scrollY, sc = [...el.querySelectorAll('.jd-scroll,.jd-nlist')].map((n) => n.scrollTop), act = document.activeElement;
    if (act && act.classList && act.classList.contains('jd-man') && act.value) return; // don't wipe a value being typed
    el.innerHTML = heroHTML(w, ms)
      + `<div class="jd-status"><span class="jd-ring ${S.busy ? 'spin' : ''}"></span><span id="jdSt">${S.err ? '<b class="jd-er">' + esc(S.err) + '</b>' : S.last ? 'Updated ' + new Date(S.last).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }) + ' IST · via ' + esc(S.mode) : 'Loading live quotes…'}</span><button class="jd-btn" onclick="window.jdRefresh()">⟳ Refresh now</button></div>`
      + `<div class="jd-board"><div class="jd-col jd-c1">${colIndia(ms)}</div><div class="jd-col jd-c2">${heatHTML(ms)}<div class="jd-newsw">${colNews(ms)}</div></div><div class="jd-col jd-c3">${colGlobal(ms)}${colComm(ms)}</div></div>`
      + timetableHTML(ms) + hoursHTML(ms) + legendHTML()
      + `<div class="legal">Delayed market data from Yahoo Finance and headlines from Google News, for information only — not investment advice. MCX prices and GIFT Nifty are not available on this feed (see the morning &amp; evening reports).</div>`;
    Object.keys(S.q).forEach((k) => { S.q[k].flash = ''; });
    [...el.querySelectorAll('.jd-scroll,.jd-nlist')].forEach((n, i) => { if (sc[i]) n.scrollTop = sc[i]; });
    window.scrollTo(0, keep); tickClock();
  }
  function setBusy(b) { const r = document.querySelector('#pDash .jd-ring'); if (r) r.classList.toggle('spin', b); }
  function tickClock() { const t = $('jdTime'); if (!t) return; t.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }); }

  /* ---------- styles ---------- */
  const CSS = `
  #pDash{--jg:#12894b;--jr:#c11d3d}
  .jd-hero{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:18px;align-items:center;padding:14px 20px;border-radius:16px;color:#fff;background:radial-gradient(120% 160% at 0% 0%,#1d3f8f 0%,#0f2352 55%,#0a1736 100%);box-shadow:0 8px 26px rgba(15,35,82,.28);margin-bottom:8px;position:relative;overflow:hidden}
  .jd-hero::after{content:'';position:absolute;left:38%;top:-90px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(228,201,122,.16),transparent 65%);pointer-events:none}
  .jd-time{font:800 40px/1 ui-monospace,'SF Mono','Cascadia Mono',Consolas,monospace;letter-spacing:1px;text-shadow:0 0 18px rgba(120,170,255,.5)}
  .jd-date{font-size:13px;font-weight:700;margin-top:4px;color:#e4c97a}.jd-tz{font-size:9.5px;letter-spacing:1.4px;color:#9fb3e6;margin-top:2px}
  .jd-mid{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
  .jd-pill{display:flex;align-items:center;gap:12px;text-decoration:none;color:#fff;padding:9px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);max-width:100%}
  .jd-pl small{display:block;font-size:9.5px;letter-spacing:1.3px;opacity:.8}.jd-pl b{font-size:22px;letter-spacing:1px}.jd-pn{font-size:11.5px;opacity:.92;max-width:300px;line-height:1.3}
  .jd-sub{font-size:11.5px;color:#c5d3f5;text-align:center}.jd-sub b{color:#e4c97a}
  .jd-dot{width:14px;height:14px;border-radius:50%;background:#8a94ad;flex:none}
  .jd-pill.st-live{border-color:#3ddc84;background:rgba(18,137,75,.28)}.jd-pill.st-live .jd-dot{background:#3ddc84}.jd-pill.st-pre{border-color:#ffc247;background:rgba(224,168,0,.25)}.jd-pill.st-pre .jd-dot{background:#ffc247}
  .jd-pill.st-cas{border-color:#c4a3ff;background:rgba(122,76,214,.3)}.jd-pill.st-cas .jd-dot{background:#c4a3ff}.jd-pill.st-post{border-color:#7fd0ff}.jd-pill.st-post .jd-dot{background:#7fd0ff}.jd-pill.st-warn{border-color:#ffb36b;background:rgba(224,120,0,.25)}.jd-pill.st-warn .jd-dot{background:#ffb36b}
  .jd-blink .jd-dot{animation:jdpulse 1.1s infinite}.jd-blink .jd-pl b{animation:jdb 1.1s infinite}
  @keyframes jdpulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.7);opacity:1}70%{box-shadow:0 0 0 12px rgba(255,255,255,0);opacity:.5}100%{box-shadow:0 0 0 0 rgba(255,255,255,0);opacity:1}}
  @keyframes jdb{50%{opacity:.55}}
  .jd-mood{position:relative;z-index:1;width:210px;text-align:center;cursor:help}.jd-mh{font-size:9.5px;letter-spacing:1.6px;color:#9fb3e6;font-weight:800}.jd-gauge{width:100%;display:block;margin-top:2px}.jd-needle{transition:transform 1.2s cubic-bezier(.3,1.4,.5,1)}
  .jd-mv{margin-top:-6px}.jd-mv b{font-size:26px;margin-right:6px;text-shadow:0 0 10px currentColor}.jd-mv span{font-size:13px;font-weight:800;letter-spacing:.8px}
  .jd-md{display:flex;flex-wrap:wrap;gap:2px 8px;justify-content:center;font-size:9.5px;color:#aebde4;margin-top:2px}
  .jd-status{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--ink2);margin:0 2px 8px}.jd-er{color:var(--red)}
  .jd-ring{width:12px;height:12px;border-radius:50%;border:2px solid #b7c3e0;border-top-color:var(--navy)}.jd-ring.spin{animation:jdspin .8s linear infinite}@keyframes jdspin{to{transform:rotate(360deg)}}
  .jd-btn{border:1px solid #c3cde6;background:#fff;color:var(--navy);border-radius:8px;padding:4px 10px;font-weight:800;font-size:11.5px;cursor:pointer;margin-left:auto}
  .jd-board{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,1.05fr) minmax(0,1.05fr) minmax(0,.95fr);gap:10px;align-items:start}.jd-col{display:flex;flex-direction:column;gap:10px;min-width:0}
  .jd-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 12px;box-shadow:0 1px 4px rgba(20,48,110,.07);margin:0}
  .jd-card h3{margin:0 0 6px;font-size:13.5px;color:var(--navy);display:flex;align-items:center;gap:6px;flex-wrap:wrap}.jd-card h3 small{font-size:10.5px;color:var(--ink2);font-weight:600}.jd-ic{font-size:15px}
  .jd-chip{margin-left:auto;font-size:9.5px;letter-spacing:.8px;padding:2px 8px;border-radius:99px;background:#e9edf6;color:#6a7691;font-weight:800}.jd-chip.on{background:#dff5e8;color:var(--jg);animation:jdb 1.6s infinite}
  .jd-tb{width:100%;border-collapse:collapse;font-size:11.5px}.jd-tb th{font-size:9px;letter-spacing:.7px;color:#7b88a6;text-align:right;font-weight:800;padding:2px 4px;border-bottom:1px solid var(--line)}.jd-tb th:first-child{text-align:left}
  .jd-tb td{padding:4px 4px;border-bottom:1px solid #eef1f7;white-space:nowrap}.jd-tb tr:last-child td{border-bottom:0}.jd-tb tbody tr:hover{background:#f6f8fd}
  .jd-nm{font-weight:800;color:#33425f;font-size:10.8px;letter-spacing:.2px;display:flex;align-items:center;gap:5px;min-width:0;white-space:normal;line-height:1.15}
  .jd-px{text-align:right;font:800 12px ui-monospace,'SF Mono',Consolas,monospace;color:var(--ink)}.jd-px i{font-style:normal;font-size:9px;color:var(--ink2);margin-left:1px}
  .jd-ch{text-align:right;font-weight:700;font-size:11px;color:#6a7691}.jd-ch b{font-size:9px;margin-right:1px}.jd-pc{text-align:right}.jd-pc span{display:inline-block;min-width:50px;text-align:right;font-weight:800;font-size:11px;padding:1px 5px;border-radius:6px;background:#eef1f7;color:#6a7691}
  tr.u .jd-ch{color:var(--jg)}tr.u .jd-pc span{background:#dff5e8;color:var(--jg)}tr.d .jd-ch{color:var(--jr)}tr.d .jd-pc span{background:#fde3e8;color:var(--jr)}
  .jd-na{opacity:.75}.jd-sub td{background:#f3f5fa;font-size:9px;letter-spacing:1.2px;font-weight:800;color:#6a7691;padding:3px 6px}
  tr.fl-up{animation:jdfu 1.4s}tr.fl-dn{animation:jdfd 1.4s}@keyframes jdfu{0%{background:#b8f0cf}100%{}}@keyframes jdfd{0%{background:#ffc9d2}100%{}}
  .jd-live{display:inline-block;width:7px;height:7px;border-radius:50%;background:#aab3c5;flex:none}.jd-live.on{background:#12a05a;animation:jdpulse2 1.4s infinite}@keyframes jdpulse2{0%{box-shadow:0 0 0 0 rgba(18,160,90,.6)}100%{box-shadow:0 0 0 6px rgba(18,160,90,0)}}
  .jd-flag{border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.18);flex:none;display:block}
  .jd-scroll{overflow:auto}.jd-man{width:64px;font:700 11px ui-monospace,Consolas,monospace;border:1px dashed #9db0d8;border-radius:6px;padding:2px 4px;text-align:right;background:#f8faff}
  .jd-tagm{font-size:8.5px;color:#a56a00;background:#fff1d6;border-radius:4px;padding:0 4px;margin-left:3px}.jd-clr{font-size:10px;color:#2347a8}
  .jd-tr{font-size:9px;font-weight:800;letter-spacing:.5px;padding:2px 6px;border-radius:6px;background:#eef1f7;color:#6a7691}.jd-tr.g{background:#dff5e8;color:var(--jg)}.jd-tr.r{background:#fde3e8;color:var(--jr)}
  .jd-fn{font-size:10px;color:#7b88a6;margin-top:6px}
  .jd-nlist{overflow:auto;display:flex;flex-direction:column}.jd-nw{display:flex;gap:8px;text-decoration:none;color:var(--ink);padding:7px 2px;border-bottom:1px solid #eef1f7}.jd-nw:hover{background:#f6f8fd}.jd-nb{font-size:11.5px;line-height:1.3;font-weight:600}.jd-nb small{display:block;color:#7b88a6;font-weight:600;font-size:10px;margin-top:2px}
  .jd-nt{font-size:8px;font-weight:800;letter-spacing:.6px;padding:2px 5px;border-radius:5px;height:fit-content;color:#fff;background:#14306e;flex:none;margin-top:2px}.jd-nt.t-MACRO{background:#8a5a00}.jd-nt.t-GLOBAL{background:#2e7d9a}
  .jd-card h4{margin:12px 0 4px;font-size:11.5px;color:var(--ink2)}.jd-card h3 .jd-chip+small{display:none}
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
  .jd-lg{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px 18px}.jd-lg p{margin:4px 0 0;font-size:11.5px;color:var(--ink2)}.jd-pillmini{display:inline-flex;align-items:center;gap:6px;background:#0f2352;color:#fff;border-radius:99px;padding:2px 10px;font-size:10.5px;font-weight:800}.jd-pillmini .jd-dot{width:9px;height:9px;background:#3ddc84;animation:jdpulse 1.1s infinite}
  .jd-mini-g{display:inline-block;background:linear-gradient(90deg,#b3162f,#e9bd2d,#0b7a3f);color:#fff;border-radius:99px;padding:2px 10px;font-size:10.5px;font-weight:800}
  #pDash .jd-board+.jd-card,#pDash .jd-card+.jd-card{margin-top:10px}#pDash>.jd-card{margin-top:10px}
  @media(max-width:1280px){.jd-board{grid-template-areas:"a h" "a g" "c n"}}@media(max-width:640px){.jd-board{grid-template-areas:"h" "a" "g" "c" "n"}}
  /* v4 layout: India | heatmap + news | global/commodities/currencies/bonds */
  .jd-board{grid-template-columns:minmax(0,1.04fr) minmax(0,1.12fr) minmax(0,1.04fr);grid-template-areas:"a m r";align-items:stretch}.jd-c1{grid-area:a}.jd-c2{grid-area:m}.jd-c3{grid-area:r}
  .jd-board>.jd-col>.jd-card:last-child{flex:1}.jd-newsw{flex:1;position:relative;min-height:340px;display:flex}.jd-newsw>.jd-card{position:absolute;inset:0;display:flex;flex-direction:column}.jd-newsw .jd-nlist{flex:1;min-height:0;overflow:auto}
  .jd-scroll{overflow:visible}.jd-heat{display:block}
  .jd-hmg{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));grid-auto-rows:56px;gap:4px}.jd-hmt{border-radius:7px;padding:6px 8px;display:flex;flex-direction:column;justify-content:space-between;line-height:1.15;transition:background .5s}.jd-hmt b{font-size:10.6px;letter-spacing:.3px;font-weight:800}.jd-hmt span{font:800 14px ui-monospace,Consolas,monospace}.jd-hmt.big{grid-row:span 1}.jd-hmt.big span{font-size:15px}
  .jd-hml{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:9.5px;color:#4a5878;font-weight:700}.jd-hml i{flex:1;height:7px;border-radius:4px;background:linear-gradient(90deg,#c1243e,#fde3e8)}.jd-hml i.g{background:linear-gradient(90deg,#e2f4ea,#1e9a5a)}
  /* visibility: contrast, weight, page tone */
  #pDash{--jg:#08783a;--jr:#c0102e;--ink:#0a1430;--ink2:#34456a;--line:#c9d3e8}
  #pDash{background:linear-gradient(180deg,#e4ebf8 0%,#edf1fa 60%,#e4ebf8 100%);border-radius:16px;padding:10px}
  .jd-card{border:1px solid #bccae6;box-shadow:0 2px 8px rgba(20,48,110,.12)}.jd-card h3{font-size:14.5px;color:#0b2260;padding-bottom:6px;border-bottom:2px solid #dfe7f6;margin-bottom:6px}.jd-card h3 small{color:#4a5878;font-weight:700}
  .jd-tb{font-size:12.5px}.jd-tb th{color:#4a5878;font-size:9.5px;border-bottom:1.5px solid #c9d3e8}.jd-tb td{padding:5px 4px;border-bottom:1px solid #e3e9f5}.jd-nm{font-size:11.8px;color:#10204a;font-weight:800}.jd-px{font-size:13px;font-weight:800;color:#0a1430}.jd-ch{font-size:11.8px;font-weight:800;color:#34456a}.jd-pc span{font-size:11.5px;min-width:50px;font-weight:800}
  tr.u .jd-pc span{background:#c9f0da;color:#06612f}tr.d .jd-pc span{background:#fbd0d8;color:#a10b27}tr.u .jd-ch{color:#06612f}tr.d .jd-ch{color:#a10b27}.jd-sub td{background:#dfe7f6;color:#2a3b66;font-size:9.6px}
  .jd-nb{font-size:12.4px;color:#0a1430;font-weight:700}.jd-nb small{color:#4a5878}.jd-fn{color:#34456a}
  .jd-ban{display:block;width:100%;max-width:720px;max-height:230px;object-fit:contain;filter:drop-shadow(0 2px 10px rgba(0,0,0,.35))}.jd-hero{align-items:center}.jd-clk{align-self:center}
  @media(max-width:900px){.jd-ban{max-width:100%}}
  .jd-hero{grid-template-columns:minmax(300px,auto) minmax(0,1fr) auto}.jd-livebox{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:12px;max-width:400px}.jd-livebox .jd-pill{width:100%;box-sizing:border-box}.jd-livebox .jd-sub{font-size:11.5px;text-align:left}.jd-livebox .jd-pl small{white-space:nowrap}.jd-livebox .jd-pn{font-size:11px}
  .jd-left{display:flex;align-items:center;gap:18px;min-width:0}.jd-left .jd-mood{width:150px;flex:none}.jd-left .jd-mv{margin-top:-4px}.jd-left .jd-mv b{font-size:21px}.jd-left .jd-mv span{font-size:11px}.jd-left .jd-mh{font-size:9px}
  .jd-hero{grid-template-columns:auto minmax(0,1fr) 270px}
  .jd-tv{position:relative;z-index:1;min-width:0}.jd-tvh{font-size:9.5px;letter-spacing:1.6px;color:#9fb3e6;font-weight:800;margin-bottom:5px}.jd-tvh small{letter-spacing:.2px;font-weight:600;color:#7f95c9;margin-left:4px}
  .jd-tvg{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .jd-tvb{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:1px;text-align:left;cursor:pointer;color:#fff;border:1px solid rgba(255,255,255,.22);border-left:4px solid var(--tc);background:rgba(255,255,255,.08);border-radius:10px;padding:7px 9px 6px 10px;font-family:inherit;transition:background .15s,transform .15s}
  .jd-tvb:hover{background:rgba(255,255,255,.18);transform:translateY(-1px)}.jd-tvb b{font-size:12.5px;letter-spacing:.2px;line-height:1.15}.jd-tvb span{font-size:9.5px;font-weight:800;letter-spacing:.8px;color:#ff8a80}.jd-tvb.on{background:rgba(255,255,255,.95);color:#0a1736}.jd-tvb.on span{color:#0b7a3f}
  .jd-tvd{position:absolute;right:8px;top:8px;width:7px;height:7px;border-radius:50%;background:#ff3b30;animation:jdpulse 1.4s infinite}
  @media(max-width:1180px){.jd-hero{grid-template-columns:auto minmax(0,1fr)}.jd-tv{grid-column:1 / -1}.jd-tvg{grid-template-columns:repeat(4,1fr)}}
  @media(max-width:900px){.jd-left{flex-direction:column;gap:8px}.jd-left .jd-mood{margin:0 auto}.jd-tvg{grid-template-columns:1fr 1fr}.jd-hero{grid-template-columns:1fr}}
  @media(max-width:900px){.jd-livebox{align-items:center;margin-left:auto;margin-right:auto}.jd-livebox .jd-sub{text-align:center}}
  @media(max-width:1280px){.jd-board{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"a m" "a r"}.jd-newsw{min-height:0}.jd-newsw>.jd-card{position:static}.jd-newsw .jd-nlist{max-height:520px}}
  @media(max-width:900px){.jd-hero{grid-template-columns:1fr;text-align:center;padding:14px}.jd-mood{margin:0 auto}.jd-time{font-size:34px}.jd-pill{flex-wrap:wrap;justify-content:center}.jd-lane,.jd-axis,.jd-hr{grid-template-columns:90px 1fr}.jd-hours{--hn:90px}.jd-seg span{font-size:8px}}
  @media(max-width:640px){.jd-board{grid-template-columns:1fr;grid-template-areas:"m" "a" "r"}}
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
  window.jdRefresh = () => { S.due = {}; S.xDue = 0; S.xNext = {}; S.newsAt = 0; refresh(true); };
  window.jdMan = (k, v) => setManual(k, v);
  function startTimer() {
    if (S.timer) return;
    S.timer = setInterval(() => {
      const on = (window.__curTab || '') === 'pDash' && !document.hidden; if (!on) return;
      tickClock();
      const sec = Math.floor(Date.now() / 1000);
      if (sec % 30 === 0) paint();
      if (!S.busy && sec % 10 === 0) { const ms = Date.now(); if (SETS.some((g) => !S.due[g.id] || ms >= S.due[g.id])) refresh(false); else { extras(false); news(false); } }
    }, 1000);
  }
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-jdgo]'); if (!a) return; e.preventDefault(); const t = $(a.getAttribute('data-jdgo')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (window.__curTab || '') === 'pDash') refresh(false); });
  function init() { build(); const h = (location.hash || '').slice(1); if (h === 'dashboard') window.showTab('pDash'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.__jd = { indiaState, mktDef, isOpen, moodScore };
})();
