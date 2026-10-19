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
  /* Yahoo has no feed for some NSE sector indices: estimate their % change as the equal-weight average of the constituents' live change (marked "est.") */
  const IDXC = { 'NIFTY_CONSR_DURBL.NS': 'AMBER BATAINDIA BLUESTARCO CROMPTON DIXON HAVELLS KAJARIACER KALYANKJIL LGEINDIA PGEL THANGAMAYL TITAN VOLTAS WHIRLPOOL', 'NIFTY_HEALTHCARE.NS': 'ABBOTINDIA ALKEM APOLLOHOSP AUROPHARMA BIOCON CIPLA DIVISLAB DRREDDY FORTIS GLAND GLENMARK IPCALAB KIMS LAURUSLABS LUPIN MANKIND MAXHEALTH SUNPHARMA TORNTPHARM ZYDUSLIFE', 'NIFTY_IND_DEFENCE.NS': 'AXISCADES AEQUS APOLLO ASTRAMICRO BEML BDL BEL BHARATFORG CENTUM COCHINSHIP DATAPATTNS DYNAMATECH GRSE HAL MTARTECH MAZDOCK MIDHANI PARAS SIGMAADV SOLARINDS UNIMECH ZENTEC', 'NIFTY_IND_DIGITAL.NS': 'AFFLE BLS BHARTIARTL BHARTIHEXA BSOFT BBOX FIRSTCRY CARTRADE COFORGE CYIENT ETERNAL NYKAA FRACTAL HCLTECH HEXT ITI INDIAMART IRCTC NAUKRI INFY INTELLECT IKS KPITTECH LTTS LTM MEESHO MPHASIS NETWEB PAYTM OFSS POLICYBZR PERSISTENT PWL PINELABS RAILTEL SAGILITY STLTECH SWIGGY TBOTEK TATACOMM TCS TATAELXSI TATATECH TTML TECHM TEJASNET URBANCO IDEA WIPRO ZENSARTECH', 'NIFTY_MIDCAP_100.NS': '360ONE APLAPOLLO AUBANK ATGL ABCAPITAL APARINDS ASHOKLEY ASTRAL AUROPHARMA BANKINDIA MAHABANK BDL BHARATFORG BHEL GROWW BIOCON BLUESTARCO COCHINSHIP COFORGE COLPAL CONCOR DABUR DIXON EXIDEIND NYKAA FEDERALBNK FORTIS GVT&D GMRAIRPORT GLENMARK GODFRYPHLP GODREJPROP HAVELLS HEROMOTOCO HINDCOPPER HINDPETRO ICICIGI ICICIAMC IDFCFIRSTB INDIANB INDHOTEL IRCTC IREDA INDUSTOWER INDUSINDBK NAUKRI JSWENERGY JUBLFOOD KEI KALYANKJIL LTF LGEINDIA LICHSGFIN LAURUSLABS LENSKART LICI LODHA LUPIN MRF M&MFIN MANKIND MARICO MFSL MEESHO MOTILALOFS MPHASIS MCX NHPC NLCINDIA NMDC NATIONALUM OBEROIRLTY OIL PAYTM OFSS POLICYBZR PIIND PAGEIND PATANJALI PERSISTENT PHOENIXLTD PREMIERENE PRESTIGE RECLTD RADICO RVNL SBICARD SRF SAIL SUPREMEIND SUZLON SWIGGY TATACOMM TIINDIA UPL UNITDSPR VMM VOLTAS WAAREEENER YESBANK', 'NIFTY_OIL_AND_GAS.NS': 'ATGL AEGISLOG AEGISVOPAK BPCL CASTROLIND CHENNPETRO GAIL HINDPETRO IOC IGL MGL ONGC OIL PETRONET RELIANCE', 'NIFTY_PVT_BANK.NS': 'AXISBANK BANDHANBNK FEDERALBNK HDFCBANK ICICIBANK IDFCFIRSTB INDUSINDBK KOTAKBANK RBLBANK YESBANK' };
  async function deriveIdx(ms, w) {
    const be = getBackend(); if (!be || S.estBusy || (S.estDue && ms < S.estDue)) return; S.estBusy = true;
    try {
      const miss = Object.keys(IDXC).filter((k) => !(S.q[k] && !S.q[k].est)); if (!miss.length) return;
      const syms = [...new Set(miss.flatMap((k) => IDXC[k].split(' ')))].map((x) => x + '.NS');
      const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=liveq&symbols=' + encodeURIComponent(syms.join(','))), 30000)); if (!j || !j.ok) return;
      miss.forEach((k) => { const L = IDXC[k].split(' '), ps = L.map((x) => j.q[x + '.NS']).filter((q) => q && q[1]).map((q) => (q[0] / q[1] - 1) * 100); if (ps.length >= Math.max(3, L.length * 0.6)) { const a = ps.reduce((x, y) => x + y, 0) / ps.length; S.q[k] = { s: k, p: 100 * (1 + a / 100), pc: 100, t: Math.floor(Date.now() / 1000), sp: [], est: true, n: ps.length }; } });
    } catch (e) { } finally { S.estBusy = false; S.estDue = ms + (w.ist.cls !== 'off' ? 90000 : 900000); paint(); }
  }
  async function refresh(force) {
    if (S.busy && Date.now() - (S.busyAt || 0) > 70000) { S.busy = false; } // a hung request must never lock the button
    if (S.busy) { if (force) S.again = true; return; } const ms = Date.now(), w = wantNow(ms); S.busy = true; S.busyAt = ms; setBusy(true);
    try {
      const sets = SETS.filter((g) => force || !S.due[g.id] || ms >= S.due[g.id]);
      const syms = []; sets.forEach((g) => syms.push(...g.syms));
      if (syms.length) {
        /* the eight top tiles + the map come first: fetch their symbols on their own and paint, then the long tail (other indices, world markets, commodities) */
        const top = sets.some((g) => g.id === 'in5') ? IN_TOP.map((x) => x[0]).concat(['BZ=F']) : [], first = syms.filter((x) => top.includes(x)), rest = syms.filter((x) => !top.includes(x)); let ok = 0;
        const apply = (rows) => rows.forEach((r) => { if (r && !r.err && r.p != null) { const old = S.q[r.s]; S.q[r.s] = Object.assign({}, r, { flash: old && old.p !== r.p ? (r.p > old.p ? 'up' : 'dn') : '' }); ok++; } });
        if (first.length && rest.length) { apply(await fetchBatch(first)); S.last = Date.now(); paint(); }
        else if (first.length) apply(await fetchBatch(first));
        if (rest.length) apply(await fetchBatch(rest));
        sets.forEach((g) => { S.due[g.id] = ms + cadence(g, w) * 1000; });
        S.last = ms; S.err = ok ? '' : 'No quotes returned — check the Data backend box or your connection.';
      }
    } catch (e) { S.err = (e && e.message) || 'Refresh failed'; }
    finally { S.busy = false; setBusy(false); paint(); }
    if (S.again) { S.again = false; setTimeout(() => refresh(true), 60); }
    extras(false); news(false); deriveIdx(Date.now(), wantNow(Date.now())); loadHist(false); loadBonds(false); if (S.pop && S.pop.t === 'idx') loadMovers(S.pop.k);
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
  function gaugeSVG(score) { // horizontal heartbeat bar with a needle at the level
    const sc = score == null ? 50 : Math.max(0, Math.min(100, score));
    return `<div class="jd-mbar" aria-hidden="true" style="--pos:${sc}%"><div class="jd-mtrack" style="background:${moodGrad()}"><i></i><i></i><i></i><i></i><i></i></div><div class="jd-mneedle"><b></b></div></div><div class="jd-mscale"><span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span></div>`;
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
    return window.jcSig ? window.jcSig.html(ms) : '';
  }

  const ago = (ts, ms) => { const m = Math.max(0, Math.round((ms - ts) / 60000)); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'; };
  function colNews(ms) {
    const items = S.news.map((n) => `<a class="jd-nw" href="${esc(n.link)}" target="_blank" rel="noopener"><span class="jd-nt t-${n.tag}">${n.tag}</span><span class="jd-nb">${esc(n.t)}<small>${esc(n.src)} · ${n.ts ? ago(n.ts, ms) : ''}</small></span></a>`).join('');
    return `<section class="jd-card jd-tc jd-newsc"><h3><span class="jd-ic">📰</span>Live news <span class="jd-chip on">● LIVE</span></h3>
      <div class="jd-nlist">${items || `<div class="jd-fn">${S.newsErr ? esc(S.newsErr) : 'Loading headlines…'}</div>`}</div><div class="jd-fn">Headlines via Google News · tap to open the source.${S.newsAt ? ' Updated ' + new Date(S.newsAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST.' : ''}</div></section>`;
  }

  function heatHTML(ms) {
    const all = [['^NSEI', 'NIFTY 50'], ['^NSEBANK', 'BANK NIFTY'], ['^BSESN', 'SENSEX']].concat(NIFTY_OTHERS.map((x) => [x[0], x[1].replace(/^NIFTY /, '')]));
    const items = all.map((it) => { const q = S.q[it[0]]; const pct = q && q.pc ? (q.p - q.pc) / q.pc * 100 : null; return { n: it[1], sym: it[0], p: pct, px: q ? q.p : null, est: !!(q && q.est), big: it[0] === '^NSEI' || it[0] === '^NSEBANK' || it[0] === '^BSESN' }; });
    const have = items.filter((i) => i.p != null); const mx = Math.max(1.5, ...have.map((i) => Math.abs(i.p)));
    const col = (p) => { if (p == null) return ['#e9edf5', '#7b88a6']; const a = Math.min(1, Math.abs(p) / mx), t = Math.pow(a, .7); if (Math.abs(p) < 0.03) return ['#eef1f7', '#4a5878']; return p > 0 ? [`rgb(${Math.round(226 - t * 196)},${Math.round(244 - t * 90)},${Math.round(234 - t * 150)})`, t > .55 ? '#fff' : '#0b5a31'] : [`rgb(${Math.round(253 - t * 60)},${Math.round(228 - t * 190)},${Math.round(232 - t * 180)})`, t > .55 ? '#fff' : '#8f1228']; };
    const tiles = items.slice().sort((a, b) => (b.big - a.big) || ((b.p == null ? -99 : b.p) - (a.p == null ? -99 : a.p))).map((i) => { const c = col(i.p); return `<div class="jd-hmt${i.big ? ' big' : ''}" data-hm="${esc(i.sym)}" style="background:${c[0]};color:${c[1]}" title="${esc(i.n)} · ${i.px == null ? '—' : fmtN(i.px, 2)} · click for its strongest &amp; weakest stocks"><b>${esc(i.n)}</b><em class="jd-hmv">${i.px == null ? '' : i.est ? '≈ est.' : fmtN(i.px, i.px >= 1000 ? 0 : 2)}</em><span>${i.p == null ? '—' : (i.p > 0 ? '+' : '') + i.p.toFixed(2) + '%'}</span></div>`; }).join('');
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
      <div class="jd-left"><div class="jd-clk"><div class="jd-time" id="jdTime">--:--:--</div><div class="jd-date">${esc(dateStr)}</div><div class="jd-tz">INDIAN STANDARD TIME · UTC+5:30</div><div class="jd-livebox"><a class="jd-pill st-${cls} ${blink ? 'jd-blink' : ''}" href="#jd-in" data-jdgo="jd-in" title="Jump to Indian markets"><span class="jd-dot"></span><span class="jd-pl"><small>INDIA · NSE / BSE</small><b>${esc(label)}</b></span></a></div></div>
      </div>
      ${biasHTML()}
      <div class="jd-mid"><img class="jd-ban" src="assets/jc-banner.png" alt="Joshi’s Corner — Shares ◆ Insurance ◆ Restaurant · Connecting People Thru Services…S.I.R" draggable="false"></div>
      <div class="jd-tv" aria-label="Live business TV">${tvTiles()}<div class="jd-sess"><div class="jd-sub">${sub}</div><div class="jd-sub jd-sn">${esc(note)}</div></div></div></div>`;
  }



  /* ---------- Market bias (moved here from Today's Calls ▸ Trade desk) + India map that takes the bias colour ---------- */
  const IMAP = { w: 89.1, d: "M33.0 12.4L33.5 12.7L34.6 12.9L34.3 13.3L34.4 13.6L34.2 13.7L35.1 14.6L34.6 15.2L34.2 15.0L33.6 15.4L33.4 15.7L33.1 15.8L32.5 15.4L32.4 14.9L31.4 15.2L31.6 16.2L32.5 17.1L32.2 17.7L32.7 18.2L32.3 18.5L32.5 18.7L32.5 19.2L33.0 19.3L33.4 18.7L33.6 18.8L34.4 20.1L35.0 20.4L35.8 20.3L36.9 21.1L36.8 21.6L38.0 22.0L39.3 22.8L38.9 22.8L37.4 24.2L37.4 24.7L36.9 25.4L37.0 26.1L36.6 26.4L36.4 27.2L37.2 27.9L37.7 28.1L37.7 27.8L37.9 27.8L39.0 28.5L39.8 28.8L40.2 29.5L40.5 29.4L41.8 30.5L42.4 30.3L43.5 31.0L44.3 31.0L44.6 31.6L45.7 31.8L46.2 32.1L46.5 31.7L47.9 32.1L47.8 31.8L48.7 31.6L49.2 32.0L50.2 32.2L50.3 33.1L50.8 33.2L52.2 34.1L53.2 33.7L53.8 34.6L54.4 34.4L55.2 34.5L56.5 35.1L57.5 34.6L57.7 35.2L58.3 35.4L58.6 35.1L59.2 35.3L60.0 35.0L60.4 35.3L60.9 34.1L60.3 32.9L60.5 31.6L60.9 30.7L60.7 30.2L62.2 29.6L62.8 29.9L63.0 30.4L62.6 31.5L63.1 32.2L62.6 32.7L62.9 32.9L63.0 33.4L63.1 33.3L63.7 33.8L64.5 33.7L65.2 33.9L65.3 34.2L65.9 34.2L66.8 34.0L67.5 33.6L68.6 34.0L70.4 34.0L70.7 33.6L71.0 33.9L72.0 33.7L72.1 33.9L72.2 33.6L72.7 33.6L72.4 32.8L72.8 32.3L72.4 31.7L71.7 31.7L71.3 31.5L71.4 30.7L71.2 30.5L72.3 30.9L73.2 30.4L73.4 30.7L73.7 30.4L74.2 30.5L74.7 30.0L74.4 29.8L74.5 29.5L76.1 28.9L76.1 28.6L76.5 28.0L76.9 27.8L78.3 27.7L78.5 27.2L79.6 26.6L79.4 26.2L80.3 25.7L80.9 26.2L82.7 26.6L83.0 26.5L83.2 25.9L83.7 26.0L83.9 25.6L85.0 25.5L85.3 25.9L85.6 25.8L85.6 26.1L85.1 26.4L85.2 26.9L85.7 26.6L85.9 26.7L86.4 27.7L86.1 27.7L85.5 28.6L85.7 28.7L86.7 28.5L87.5 28.9L87.9 28.8L88.6 29.3L88.5 29.7L88.7 30.0L88.6 30.3L88.3 30.3L87.2 31.3L87.2 31.8L87.9 32.9L87.2 32.7L86.7 32.0L85.0 32.4L82.8 34.2L81.9 34.5L81.7 34.9L81.7 35.5L82.0 36.3L81.5 36.7L81.6 37.3L80.4 38.5L80.2 39.1L80.6 39.3L80.7 39.7L79.4 41.9L78.9 43.5L77.7 43.0L76.9 43.1L76.6 42.7L76.4 42.8L76.8 44.0L76.6 45.8L76.3 46.2L75.9 46.2L76.0 46.6L75.7 47.3L76.0 48.7L75.9 48.9L75.6 48.9L75.4 49.5L75.2 49.5L75.1 49.7L74.5 49.0L74.2 49.6L74.0 47.2L73.6 46.5L73.3 44.0L73.1 44.1L72.9 43.9L72.5 44.2L72.2 43.9L72.3 44.6L71.7 45.4L71.9 46.0L71.2 46.4L70.7 45.4L70.6 46.0L70.4 45.9L70.3 45.1L69.9 44.2L70.1 43.3L70.6 42.7L71.2 42.7L71.4 42.3L71.6 42.5L71.7 42.2L72.1 42.5L72.2 41.9L72.8 41.7L73.2 40.1L73.6 40.3L73.9 40.0L72.6 39.1L71.4 39.3L70.2 39.1L67.5 39.3L65.9 38.8L65.9 36.5L65.4 35.8L65.1 36.0L65.3 36.2L65.1 36.6L64.4 36.5L63.8 36.0L63.6 35.2L63.2 35.1L63.1 35.2L63.5 35.7L62.4 35.6L62.6 35.4L62.4 35.1L61.6 34.7L61.6 34.5L61.4 35.0L61.8 35.0L61.9 35.3L60.9 36.0L60.7 37.0L61.2 37.2L62.0 38.1L62.7 38.1L62.9 38.7L63.4 38.8L63.2 39.2L61.7 39.1L61.4 40.1L61.0 39.9L60.7 40.0L60.8 40.2L60.5 40.9L60.7 41.4L61.8 42.0L62.6 42.1L62.5 42.5L62.6 43.2L62.1 43.5L62.0 44.1L62.6 44.7L62.7 44.7L62.5 45.4L63.3 45.6L62.9 46.3L63.3 46.7L63.2 47.7L63.7 49.0L63.6 49.7L63.1 49.6L63.5 50.0L63.7 50.8L63.1 50.6L63.0 50.3L63.0 50.7L62.8 50.7L62.9 50.5L62.8 50.9L62.5 50.9L62.5 50.0L62.7 49.5L62.5 49.3L62.7 49.1L62.5 49.2L62.5 49.7L62.3 49.7L62.4 48.8L62.1 51.0L61.9 51.0L61.9 49.7L61.8 50.7L61.6 50.8L61.4 50.4L61.3 50.8L61.2 50.2L61.3 50.9L61.2 51.0L60.8 49.6L61.1 49.3L61.0 49.0L60.4 48.7L60.1 48.1L60.3 48.7L60.8 48.9L60.9 49.2L59.9 50.4L58.0 51.0L57.1 51.7L56.9 52.5L57.3 53.4L57.0 53.5L57.3 53.6L57.2 53.8L57.5 53.8L56.6 54.4L56.5 54.8L56.8 54.7L56.5 55.1L56.6 55.0L55.9 55.4L55.6 56.0L54.8 55.6L55.5 56.1L55.2 56.3L52.8 57.1L52.6 57.0L53.1 56.9L53.1 56.4L52.7 56.4L52.2 56.7L51.7 57.7L52.0 57.5L52.1 57.1L52.5 57.0L52.5 57.3L52.2 57.3L52.3 57.4L53.1 57.0L51.9 57.7L50.7 58.9L50.6 58.8L50.6 59.2L49.6 60.5L49.1 60.8L49.4 60.7L48.7 61.6L46.7 62.8L46.3 63.5L46.0 63.5L46.2 63.6L45.9 63.7L46.0 63.9L43.4 65.4L43.0 66.0L43.2 66.3L43.4 66.1L43.2 67.2L41.6 68.0L40.5 67.8L40.0 68.0L39.7 69.2L39.3 69.6L39.3 69.8L39.0 69.5L38.9 69.0L38.7 70.0L38.6 69.4L38.3 69.4L37.1 70.0L36.4 72.0L36.7 73.7L36.8 73.7L36.8 74.4L36.4 74.9L36.7 74.8L37.2 77.4L36.7 76.5L36.7 76.8L36.5 76.6L36.4 76.8L36.6 77.2L37.2 77.4L37.2 78.2L36.8 80.3L35.8 82.0L35.5 83.5L35.7 84.1L35.3 84.4L35.7 84.2L35.8 87.6L35.1 87.5L35.5 87.8L34.9 87.6L35.0 87.5L34.1 87.8L33.9 88.1L34.1 88.5L33.2 89.7L33.0 90.3L33.4 90.9L34.3 90.8L34.6 91.3L34.1 91.0L33.2 91.0L31.4 91.5L30.8 92.3L30.7 92.7L30.9 92.6L30.5 93.0L30.6 93.5L30.4 93.9L28.9 94.8L28.1 94.7L27.2 93.9L25.8 92.1L26.2 91.8L25.7 92.0L25.1 90.3L24.9 88.8L25.2 89.6L25.1 89.1L25.2 89.2L25.2 90.2L25.7 90.1L25.4 90.0L25.4 89.1L24.9 88.3L24.9 88.6L24.7 88.3L24.9 87.8L24.6 87.9L23.4 84.1L22.1 82.3L22.3 82.3L22.3 82.2L22.1 82.2L22.1 81.9L22.0 82.2L21.7 82.0L20.6 79.4L21.0 79.2L20.6 79.3L20.2 77.6L20.1 76.8L20.3 76.7L20.2 76.5L20.1 76.7L19.6 75.5L19.4 74.8L19.7 74.8L19.4 74.6L19.2 73.9L19.4 74.0L19.2 73.7L19.0 73.9L19.1 73.6L19.0 73.6L18.9 73.2L18.4 73.0L18.8 72.7L18.5 72.8L17.9 72.1L18.0 71.8L17.8 71.2L17.5 71.0L18.0 71.1L17.5 70.9L17.7 70.6L17.4 70.6L17.3 70.4L17.6 70.2L17.3 70.3L17.1 69.9L16.5 68.9L16.6 68.4L16.5 68.7L16.0 67.4L16.2 67.4L16.1 67.1L16.2 67.1L16.0 67.0L15.7 64.8L15.9 64.9L15.5 64.0L15.7 63.9L15.5 63.8L15.1 62.5L15.2 62.3L15.1 62.3L14.9 61.8L14.9 61.6L15.3 61.9L15.3 61.7L14.8 61.4L14.8 60.8L15.1 61.0L14.7 60.3L14.9 59.8L15.1 60.2L15.0 59.7L14.8 59.6L15.3 59.2L15.1 59.3L15.0 58.8L14.6 59.6L14.4 59.5L14.6 59.1L14.5 58.3L15.0 58.3L15.3 58.6L14.4 58.0L14.4 57.7L14.7 57.5L14.3 57.5L14.3 56.7L14.1 56.9L14.0 56.5L14.9 53.6L14.8 53.2L14.6 53.3L14.8 52.8L14.4 52.7L14.6 52.6L14.5 52.3L14.2 52.5L14.2 52.2L13.9 52.4L14.3 52.1L13.9 51.9L13.9 51.7L14.0 51.6L13.8 51.5L14.3 51.3L13.8 51.4L14.6 50.7L15.5 50.3L13.7 50.6L13.8 50.0L14.3 49.5L13.7 49.8L13.6 49.6L13.8 48.9L14.3 49.0L14.9 48.6L13.8 48.6L13.5 48.8L13.3 48.7L13.3 48.3L13.1 48.7L12.5 48.6L13.0 48.8L13.0 49.3L12.6 49.6L12.4 49.5L12.4 49.7L12.2 49.7L12.6 49.8L12.6 50.0L12.3 49.8L12.4 50.0L12.1 50.0L12.1 50.2L12.6 50.2L13.0 50.7L12.4 51.7L12.4 52.1L9.5 53.5L8.3 53.7L6.2 52.3L2.9 48.6L3.2 47.9L3.2 48.2L3.6 48.2L3.7 48.6L4.5 48.4L4.6 48.1L4.9 48.4L5.2 47.9L5.4 48.1L6.0 47.7L6.6 47.7L7.2 46.6L7.6 46.3L7.6 45.9L7.2 46.0L7.2 46.4L6.4 46.3L6.4 46.5L5.5 46.7L5.2 47.1L4.8 47.0L2.6 46.2L2.0 45.7L1.9 45.4L1.7 45.4L1.8 45.2L1.6 44.9L1.3 44.8L1.5 44.6L1.3 44.5L1.2 44.6L1.2 44.2L1.5 44.2L1.4 44.1L2.5 43.4L1.3 43.9L1.0 44.3L0.4 44.3L0.8 44.1L0.5 43.8L0.8 43.2L2.2 43.1L2.3 41.9L2.5 42.2L2.7 42.0L2.9 42.2L4.7 42.1L5.2 42.4L6.0 42.5L6.3 42.0L7.3 41.7L7.7 41.6L7.8 42.1L8.3 42.2L9.3 41.7L9.0 41.5L8.9 41.1L9.3 40.8L8.6 39.2L8.0 38.4L8.0 37.5L6.8 37.4L6.2 36.5L6.5 34.8L5.5 34.6L4.5 34.1L4.6 32.8L7.1 29.9L7.7 29.9L8.2 30.8L8.6 30.9L11.7 30.1L11.8 29.5L12.5 28.8L13.2 27.5L14.9 26.6L15.8 25.0L16.2 23.7L18.0 22.8L17.7 22.2L18.3 21.7L19.1 20.5L20.1 19.9L19.7 19.6L20.0 18.7L19.6 17.9L19.8 17.5L20.6 16.9L22.0 16.5L22.2 16.1L21.2 15.4L20.2 15.4L20.0 15.0L20.1 14.2L19.9 14.5L19.2 14.4L17.9 13.6L17.5 13.6L17.0 13.3L16.8 12.4L17.0 11.9L16.8 11.6L16.9 10.7L16.3 9.2L16.4 8.7L17.0 8.6L17.3 7.9L18.2 7.6L18.5 6.8L17.3 6.5L17.2 6.0L17.4 5.5L16.0 5.2L15.5 4.8L15.6 4.5L15.4 4.3L14.5 4.4L13.6 4.2L13.9 3.9L13.7 3.6L13.9 3.1L15.1 2.4L15.4 1.9L15.3 1.6L16.4 1.5L17.8 1.6L17.8 1.4L17.3 1.0L18.2 1.3L20.1 0.5L20.8 1.0L21.4 0.7L22.2 0.9L22.4 1.6L23.3 1.6L24.1 2.5L26.3 3.4L26.7 4.4L28.6 5.0L28.8 5.6L30.5 5.4L31.0 4.9L32.2 4.4L33.1 4.3L33.6 4.4L34.1 4.0L35.4 4.6L36.3 4.4L36.6 5.0L37.1 5.2L37.2 5.6L36.4 8.2L35.8 8.3L35.3 8.7L35.4 9.1L34.8 9.0L34.9 9.7L34.4 10.4L32.9 10.5L33.3 11.6L32.9 11.7L33.0 12.4ZM78.3 98.3L78.2 99.0L78.0 99.2L77.8 98.6L77.6 98.4L77.5 98.3L77.5 97.8L78.0 97.6L78.3 98.3ZM77.7 97.2L77.4 97.5L77.3 97.3L77.6 96.9L77.7 97.2ZM76.8 95.3L76.9 95.5L76.6 95.5L76.6 95.4L76.4 95.3L76.5 95.1L76.8 95.3ZM77.2 95.1L77.2 95.4L77.0 95.1L77.2 95.1ZM77.1 95.0L77.0 95.1L77.1 94.9L76.9 94.9L76.9 94.6L77.1 94.4L77.1 95.0ZM15.3 94.1L15.2 94.3L15.3 94.1ZM75.9 94.3L76.0 94.4L75.8 94.4L75.7 94.2L75.8 94.0L75.9 94.3ZM77.3 93.3L77.3 93.7L77.3 93.3ZM74.9 91.1L74.9 91.5L74.7 91.4L74.6 91.2L74.8 91.0L74.9 91.1ZM74.3 86.1L74.1 86.9L73.6 86.9L73.7 86.7L73.6 86.1L73.8 85.8L74.1 85.7L74.3 86.1ZM74.5 84.0L74.6 84.1L74.4 84.2L74.3 84.0L74.4 83.7L74.6 83.9L74.5 84.0ZM73.3 83.4L73.3 83.6L73.2 83.6L73.1 83.4L73.3 83.4ZM75.6 82.2L75.7 82.4L75.4 82.2L75.4 82.1L75.5 82.0L75.6 82.2ZM75.8 81.5L75.8 81.8L75.7 81.7L75.7 81.5L75.8 81.5ZM74.7 78.9L74.6 79.5L74.5 79.3L74.5 79.0L74.7 78.9ZM75.7 77.9L75.6 78.6L75.4 78.7L75.4 78.6L75.3 78.6L75.4 78.9L75.2 78.9L75.1 79.1L75.4 79.3L75.5 80.4L75.3 80.7L75.0 80.7L75.2 81.0L75.1 81.1L75.2 81.4L74.8 81.8L74.9 82.0L74.7 82.1L74.7 82.5L74.8 82.3L74.9 82.5L74.8 83.0L74.5 83.3L74.6 83.3L74.8 83.1L74.7 83.6L74.6 83.7L74.5 83.6L74.4 83.4L74.4 83.3L74.2 83.0L74.2 82.6L74.1 82.5L74.2 82.3L74.3 82.5L74.5 81.4L74.7 81.3L74.7 81.5L74.9 81.4L74.8 81.2L74.9 81.1L74.7 80.9L74.7 80.1L74.8 79.9L74.7 79.5L74.9 79.3L75.0 78.8L75.0 77.8L75.4 77.1L75.5 76.9L75.7 77.1L75.7 77.5L75.4 77.7L75.7 77.9ZM75.6 76.7L75.5 76.7L75.6 76.7ZM17.0 88.3h.9v.9h-.9zM17.1 88.1h.9v.9h-.9zM14.0 86.8h.9v.9h-.9zM13.7 86.1h.9v.9h-.9zM17.1 85.9h.9v.9h-.9zM14.3 85.0h.9v.9h-.9zM15.1 83.7h.9v.9h-.9zM14.2 83.1h.9v.9h-.9zM12.6 85.8h.9v.9h-.9zM14.5 84.6h.9v.9h-.9z" };
  const BCOL = { 2: '#19b865', 1: '#8bd04a', 0: '#f2b61f', '-1': '#f28a2e', '-2': '#e5384c' };
  function biasInfo() { // macro-only read (PCR · VIX · crude · yields) — one input of the mood, and what the Trade desk uses for carry / exit
    const J = window.jcMgr; if (!J || !J.outlook) return null;
    try {
      const M = J.state; ['^INDIAVIX', 'BZ=F', '^TNX'].forEach((k) => { const q = S.q[k]; if ((!M.mac[k] || !M.mac[k].length) && q && q.p != null && q.pc) M.mac[k] = [q.p, q.pc, q.p, q.p, q.p]; });
      const o = J.outlook(); if (!o.F.some((f) => f[1] !== '—')) return null; return o;
    } catch (e) { return null; }
  }
  /* Colour of the mood, graded light → deep inside every band: the further a reading is from neutral, the deeper the shade */
  const MSTOPS = [[0, '#7d0b20'], [20, '#ee6b73'], [20.01, '#d9501a'], [40, '#f8b27a'], [40.01, '#f4a65a'], [50, '#f2c21f'], [60, '#f6dd5a'], [60.01, '#d3ed95'], [80, '#7cc43c'], [80.01, '#62d48c'], [100, '#08753a']];
  const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function moodColor(sc) {
    sc = Math.max(0, Math.min(100, sc)); for (let i = 1; i < MSTOPS.length; i++) { const a = MSTOPS[i - 1], b = MSTOPS[i]; if (sc <= b[0]) { const t = b[0] === a[0] ? 0 : (sc - a[0]) / (b[0] - a[0]), x = hex2(a[1]), y = hex2(b[1]); return '#' + x.map((v, k) => Math.round(v + (y[k] - v) * t).toString(16).padStart(2, '0')).join(''); } }
    return MSTOPS[MSTOPS.length - 1][1];
  }
  const moodGrad = () => 'linear-gradient(90deg,' + [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => moodColor(v) + ' ' + v + '%').join(',') + ')';
  const moodLvl = (s) => (s >= 80 ? 2 : s >= 60 ? 1 : s >= 40 ? 0 : s >= 20 ? -1 : -2);
  /* The header shows ONE reading: the Market Mood (Nifty move, breadth, VIX, global markets, rupee, crude, yields, PCR). Badge text, colour and map all follow it. */
  function biasHTML() {
    const md = moodScore(), col = md ? moodColor(md.score) : '#8a94ad', lab = md ? moodLabel(md.score)[0] : 'LOADING', sc = md ? 'mood ' + md.score + ' / 100' : 'reading the market…';
    return `<div class="jd-bias" role="button" tabindex="0" data-jdbias="1" style="--bc:${col}" title="Market bias = the Market Mood reading (Nifty, breadth, VIX, global markets, rupee, crude, yields, PCR) — tap for the drivers"><small>MARKET BIAS</small>`
      + `<svg class="jd-imap" viewBox="0 0 ${IMAP.w} 100" aria-label="Map of India coloured by market mood"><defs><linearGradient id="jdMg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs><path class="mp" d="${IMAP.d}"/><path d="${IMAP.d}" fill="url(#jdMg)" stroke="rgba(255,255,255,.7)" stroke-width=".35" stroke-linejoin="round"/></svg>`
      + `<b>${esc(lab)}</b><span>${esc(sc)}</span>${md ? `<i class="jd-bs" style="background:${moodGrad()}"><u style="left:${Math.max(0, Math.min(100, md.score))}%"></u></i>` : ''}</div>`;
  }
  function biasPopHTML() {
    const md = moodScore(), o = biasInfo(), top = (inner) => `<div class="jd-pm-h"><div class="jd-pm-t"><b>🧭 Market bias</b><small>the same reading as the Market Mood gauge — mechanical, not advice</small></div><div class="jd-pm-bt">${inner}<button type="button" class="jd-mvb" data-popx="1" title="Close (Esc)">✕</button></div></div>`;
    if (!md) return top('') + '<div class="jd-pm-b"><div class="jd-fn">The reading is still loading — it needs a few live quotes. Try again in a moment.</div></div>';
    const col = moodColor(md.score), sg = (v, d) => (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d);
    const vote = (v) => (v > 0.15 ? '<span style="color:#12a05a;font-weight:800">▲ bullish</span>' : v < -0.15 ? '<span style="color:#e03a3a;font-weight:800">▼ bearish</span>' : '<span style="color:#7a869f;font-weight:800">● flat</span>');
    const rows = md.parts.slice().sort((a, b) => Math.abs(b.w * b.v) - Math.abs(a.w * a.v)).map((p) => `<tr><td>${esc(p.name)}</td><td><b>${esc(p.txt || '—')}</b></td><td>${vote(p.v)}</td><td>${Math.round(p.w / md.parts.reduce((a, q) => a + q.w, 0) * 100)}%</td></tr>`).join('');
    const mac = o ? `<h4 class="jd-bph">Macro positioning detail <small>PCR · India VIX · Brent · yields — one input above, and what the Trade desk uses for carry / exit</small></h4><div class="jd-bpm">Macro read on its own: <b style="color:${BCOL[Math.max(-2, Math.min(2, o.sc))]}">${esc(o.lab[0])}</b> (score ${o.sc > 0 ? '+' : ''}${o.sc} of ±4). ${esc(o.lab[2])}${o.trend ? ` Nifty is ${sg(o.trend.ch)} % at ${fmtN(o.trend.p, 2)}.` : ''}</div><table class="jd-bpx"><thead><tr><th>Factor</th><th>Reading</th><th>Vote</th><th>Meaning</th></tr></thead><tbody>${o.F.map((f) => `<tr><td>${esc(f[0])}</td><td><b>${esc(f[1])}</b></td><td style="font-weight:800;color:${f[2] > 0 ? '#12a05a' : f[2] < 0 ? '#e03a3a' : '#7a869f'}">${f[2] > 0 ? '▲ +1' : f[2] < 0 ? '▼ −1' : '● 0'}</td><td>${esc(f[3])}<div style="font-size:10.5px;color:#7a869f">${esc(f[4])}</div></td></tr>`).join('')}</tbody></table>` : '';
    return top('<button type="button" class="jd-mvb" onclick="window.jdBiasGo()">Trade desk ▸</button>')
      + `<div class="jd-pm-b"><div class="jd-bpop"><div class="jd-bpb" style="background:${col}"><i>MARKET BIAS = MARKET MOOD</i><b>${esc(moodLabel(md.score)[0])}</b><span>${md.score} / 100</span><i class="jd-bs" style="background:${moodGrad()}"><u style="left:${Math.max(0, Math.min(100, md.score))}%"></u></i></div><div class="jd-bpt">One reading, shown two ways: this badge and the India map colour. It blends the Nifty move, breadth of the Indian indices, India VIX, global markets, rupee, crude, US yields and PCR.</div></div>`
      + `<table class="jd-bpx"><thead><tr><th>Driver</th><th>Reading</th><th>Tone</th><th>Weight</th></tr></thead><tbody>${rows}</tbody></table>${mac}`
      + `<div class="jd-fn"><b>Bands:</b> 0–20 very bearish (red) · 20–40 bearish (orange) · 40–60 neutral (amber) · 60–80 bullish (lime) · 80–100 very bullish (green). <b>Shade:</b> inside each band the colour runs from light (close to neutral) to deep (the extreme), so a deep red or deep green means a strong, one-sided market and a pale one a mild lean. Delayed data; a reading of tone, not a forecast or advice.</div></div>`;
  }
  window.jdBiasGo = () => { S.pop = null; renderPop(); if (typeof window.showTab === 'function') window.showTab('pCalls'); };

  /* ---------- live business TV: tiles in the header + one persistent docked player (lives on <body>, so it keeps playing when the tab/view changes) ---------- */
  const TV = [
    { k: 'zee', n: 'Zee Business', c: 'UCkXopQ3ubd-rnXnStZqCl2w', h: 'ZeeBusiness', col: '#e53935' },
    { k: 'cnbc', n: 'CNBC Awaaz', c: 'UCQIycDaLsBpMKjOCeaKUYVg', h: 'CNBCAwaaz', col: '#f9a825' },
    { k: 'ndtv', n: 'NDTV Profit', c: 'UC3uJIdRFTGgLWrUziaHbzrg', h: 'NDTVProfitIndia', col: '#1e88e5' },
    { k: 'etnow', n: 'ET Now', c: 'UCWmUOYVa7ETRkJ63YaZRhhA', alt: ['UCI_mwTKUhicNzFrhm33MzBQ'], h: 'ETNOWlive', col: '#d81b60' },
  ];
  const tvYt = (t) => 'https://www.youtube.com/' + (t.h ? '@' + t.h : 'channel/' + t.c) + '/live';
  const tvCur = () => { try { return window.__jdtv && window.__jdtv.cur; } catch (e) { return null; } };
  const tvStat = (t) => { const c = tvVid[t.k]; return c && c.live === true ? '● LIVE' : c && c.live === false ? '○ OFFLINE?' : '▶ WATCH'; };
  function tvTiles() {
    const cur = tvCur();
    return '<div class="jd-tvh">LIVE TV <small>tap to watch · keeps playing on every tab</small></div><div class="jd-tvg">' + TV.map((t) => `<button type="button" class="jd-tvb${cur === t.k ? ' on' : ''}" data-jdtv="${t.k}" style="--tc:${t.col}" title="Watch ${esc(t.n)} live"><i class="jd-tvd"></i><b>${esc(t.n)}</b><span>${cur === t.k ? 'NOW PLAYING' : tvStat(t)}</span></button>`).join('') + '</div>';
  }
  const tvSrc = (t, cid) => (t.vid ? 'https://www.youtube.com/embed/' + t.vid + '?' : 'https://www.youtube.com/embed/live_stream?channel=' + (cid || t.cc || t.c) + '&') + 'autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
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
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const a = b.getAttribute('data-tvact'), k = b.getAttribute('data-tvch'); if (k) tvPlay(k); else if (a === 'x') tvStop(); else if (a === 'min') { el.classList.toggle('min'); b.textContent = el.classList.contains('min') ? '▢' : '▁'; } else if (a === 'pop') tvPop(); else if (a === 'yt') { const t = TV.find((x) => x.k === tvCur()); if (t) window.open(tvYt(t), '_blank', 'noopener'); } });
    return el;
  }
  function tvMark(k) { document.querySelectorAll('.jd-tvb').forEach((b) => { const on = b.getAttribute('data-jdtv') === k; b.classList.toggle('on', on); const sp = b.querySelector('span'); if (sp) { const t = TV.find((x) => x.k === b.getAttribute('data-jdtv')); sp.textContent = on ? 'NOW PLAYING' : t ? tvStat(t) : '▶ WATCH'; } }); }
  const tvVid = {};
  async function tvResolve(t) {
    const c = tvVid[t.k]; if (c && Date.now() - c.at < 180000) return c.vid;
    try { const u = typeof getBackend === 'function' ? getBackend() : ''; if (u) { const j = JSON.parse(await fetchWithTimeout(beUrl(u, 'action=ytlive&channel=' + t.c), 20000)); if (j && j.ok && j.vid) { tvVid[t.k] = { vid: j.vid, live: !!j.live, at: Date.now() }; return j.live ? j.vid : null; } } } catch (e) { }
    return null;
  }
  function tvFail(t, why) {
    const box = document.getElementById('jdTvBox'); if (!box) return;
    box.innerHTML = '<div class="tvld" style="flex-direction:column;gap:8px;text-align:center;padding:10px"><b>' + esc(t.n) + ' will not play inside this page</b><span style="color:#9fb3e6">' + esc(why) + '</span><a href="' + tvYt(t) + '" target="_blank" rel="noopener" style="color:#fff;background:#e53935;border-radius:8px;padding:6px 12px;font-weight:800;text-decoration:none">Open ' + esc(t.n) + ' on YouTube ↗</a></div>';
  }
  async function tvPlay(k) {
    const t = TV.find((x) => x.k === k); if (!t) return; const el = tvEnsure(); window.__jdtv = window.__jdtv || {}; window.__jdtv.cur = k; const tok = (window.__jdtv.tok = (window.__jdtv.tok || 0) + 1);
    el.classList.add('on'); el.classList.remove('min');
    document.getElementById('jdTvT').textContent = t.n + ' · LIVE';
    document.getElementById('jdTvCh').innerHTML = TV.map((x) => `<button type="button" data-tvch="${x.k}" class="${x.k === k ? 'on' : ''}">${esc(x.n)}</button>`).join('');
    const box = document.getElementById('jdTvBox'); box.innerHTML = '<div class="tvld">Connecting to ' + esc(t.n) + '…</div>'; tvMark(k);
    const vid = await tvResolve(t); if (window.__jdtv.tok !== tok || window.__jdtv.cur !== k) return;
    t.vid = vid; tvMark(k);
    const cands = vid ? [null] : [t.c].concat(t.alt || []); let i = 0, why = 'The broadcaster may have switched off embedded playback, or the stream is offline right now.';
    const tryNext = () => {
      if (window.__jdtv.tok !== tok || window.__jdtv.cur !== k) return;
      if (i >= cands.length) { tvFail(t, why); return; }
      const cid = cands[i++]; t.cc = cid || t.c;
      box.innerHTML = '<iframe title="' + esc(t.n) + ' live" src="' + tvSrc(t, cid) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      const f = box.querySelector('iframe'); let done = false;
      const off = () => { window.removeEventListener('message', on); clearTimeout(tm); };
      const on = (ev) => {
        if (!f || ev.source !== f.contentWindow || !/youtube(-nocookie)?\.com$/.test(String(ev.origin).replace(/^https?:\/\//, ''))) return;
        let d = ev.data; try { if (typeof d === 'string') d = JSON.parse(d); } catch (e) { return; }
        if (d && d.event === 'onError') { const c = +d.info; if (c === 101 || c === 150) why = 'YouTube reports that this broadcaster has blocked embedding of its live stream.'; else if (c === 100) why = 'YouTube reports this stream is not available (offline or private).'; if (!done) { done = true; off(); tryNext(); } }
        else if (d && d.event === 'onStateChange' && (+d.info === 1 || +d.info === 3)) { done = true; off(); const c = tvVid[t.k] = tvVid[t.k] || { at: Date.now() }; c.live = true; tvMark(k); }
      };
      window.addEventListener('message', on);
      f.addEventListener('load', () => { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'jdtv', channel: 'widget' }), '*'); f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onError'], id: 'jdtv' }), '*'); f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 'jdtv' }), '*'); } catch (e) { } });
      const tm = setTimeout(() => { if (!done) { done = true; off(); /* no signal: leave the player as is (autoplay may be waiting for a tap) */ } }, 20000);
    };
    tryNext();
  }
  async function tvProbe() { for (const t of TV) { try { await tvResolve(t); } catch (e) { } } tvMark(tvCur()); }
  setTimeout(tvProbe, 6000); setInterval(() => { if (!document.hidden) tvProbe(); }, 240000);
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
      <div><span class="jd-mini-g">MARKET BIAS</span><p>India map + 0–100 mood built from today’s Nifty move, breadth of the Indian indices, India VIX, global markets, rupee, crude, US yields and PCR. <b>0–20</b> very bearish · <b>20–40</b> bearish · <b>40–60</b> neutral · <b>60–80</b> bullish · <b>80–100</b> very bullish. Tap the map for the weights. It describes tone, not a forecast.</p></div>
      <div><span class="jd-live on"></span> <span class="jd-live off"></span><p>Dot beside a name: <b>green</b> = a tick in the last 20 minutes; <b>grey</b> = market closed, showing the last session. Hover a row for its last-tick time.</p></div>
      <div><b style="color:#12894b">▲</b> <b style="color:#c11d3d">▼</b><p>Change vs previous close. <b>India VIX</b> and <b>USD/INR</b> are inverted (a rise is red). India 10Y yield up = red.</p></div>
      <div><b>PCR &amp; India 10Y</b><p>Nifty put-call ratio (open interest, nearest expiry): above 1 leans bullish, below 0.8 bearish. NSE and some bond sites refuse cloud servers — when a feed is blocked you can type today’s value in the box (saved on this device).</p></div>
      <div><b>Refresh</b><p>India indices every minute in session, other Nifty indices every 2 min, global every 3 min, closed markets every 15–20 min; news every 5 min. Quotes are delayed Yahoo Finance data.</p></div></div></div>`;
  }

  function paint() {
    try { if (window.jcBrief) window.jcBrief.check(briefCtx()); } catch (e) { }
    const el = $('pDash'); if (!el || !el.classList.contains('active')) return; const ms = Date.now(), w = wantNow(ms);
    const keep = window.scrollY, sc = [...el.querySelectorAll('.jd-scroll,.jd-nlist')].map((n) => n.scrollTop), act = document.activeElement;
    if (act && act.classList && act.classList.contains('jd-man') && act.value) return; if (act && act.tagName === 'SELECT' && el.contains(act)) return; // don't wipe a value being typed
    el.innerHTML = heroHTML(w, ms)
      + `<div class="jd-status"><span class="jd-ring ${S.busy ? 'spin' : ''}"></span><span id="jdSt">${S.err ? '<b class="jd-er">' + esc(S.err) + '</b>' : S.last ? 'Updated ' + new Date(S.last).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }) + ' IST · via ' + esc(S.mode) : 'Loading live quotes…'}</span><button class="jd-btn${S.busy ? ' busy' : ''}" id="jdRf" type="button" onclick="window.jdRefresh()">${S.busy ? '⟳ Refreshing…' : '⟳ Refresh now'}</button></div>`
      + tiles3d(ms) + callTiles()
      + `<div class="jd-board"><div class="jd-col jd-c1">${colIndia(ms)}</div><div class="jd-col jd-c2">${heatHTML(ms)}</div><div class="jd-col jd-c3">${window.jcFD ? window.jcFD.html(ms) : ''}${catButtons(ms)}</div><div class="jd-newsrow">${colNews(ms)}</div></div>`
      + timetableHTML(ms) + hoursHTML(ms) + legendHTML()
      + `<div class="legal">Delayed market data from Yahoo Finance and headlines from Google News, for information only — not investment advice. MCX prices and GIFT Nifty are not available on this feed (see the morning &amp; evening reports).</div>`;
    Object.keys(S.q).forEach((k) => { S.q[k].flash = ''; });
    [...el.querySelectorAll('.jd-scroll,.jd-nlist')].forEach((n, i) => { if (sc[i]) n.scrollTop = sc[i]; });
    window.scrollTo(0, keep); tickClock(); renderPop();
  }
  function setBusy(b) { const r = document.querySelector('#pDash .jd-ring'); if (r) r.classList.toggle('spin', b); const f = $('jdRf'); if (f) { f.textContent = b ? '⟳ Refreshing…' : '⟳ Refresh now'; f.classList.toggle('busy', b); } }
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
  .jd-mood{width:210px!important;margin-top:7px!important;text-align:left!important}.jd-mood .jd-mh{display:inline}.jd-mood .jd-mv{display:inline-block;margin:0 0 0 8px!important;float:right}.jd-mood .jd-mv b{font-size:15px!important}.jd-mood .jd-mv span{font-size:10px!important}.jd-mbar{margin:4px 2px 0!important}.jd-mscale{margin-top:3px!important}.jd-mbar{position:relative;margin:7px 4px 0;animation:jdbeat 1.15s ease-in-out infinite;transform-origin:center}.jd-mtrack{display:grid;grid-template-columns:repeat(5,1fr);gap:2px;height:13px;border-radius:7px;overflow:hidden;box-shadow:0 0 14px rgba(255,255,255,.22)}.jd-mtrack i:nth-child(1){background:#b3162f}.jd-mtrack i:nth-child(2){background:#e0643a}.jd-mtrack i:nth-child(3){background:#e9bd2d}.jd-mtrack i:nth-child(4){background:#7bc47a}.jd-mtrack i:nth-child(5){background:#0b7a3f}
  .jd-mneedle{position:absolute;top:-6px;bottom:-4px;left:var(--pos);width:0;transition:left 1.2s cubic-bezier(.3,1.4,.5,1)}.jd-mneedle:before{content:'';position:absolute;left:-1.5px;top:5px;bottom:0;width:3px;border-radius:2px;background:#fff;box-shadow:0 0 8px #fff}.jd-mneedle b{position:absolute;left:-6px;top:-1px;border:6px solid transparent;border-top:8px solid #fff;border-bottom:0;filter:drop-shadow(0 0 4px #fff)}
  .jd-mscale{display:flex;justify-content:space-between;margin:5px 2px 0;font-size:8.5px;color:#8fa3d6;font-weight:700}@keyframes jdbeat{0%,100%{transform:scale(1)}12%{transform:scale(1.045)}24%{transform:scale(1)}38%{transform:scale(1.03)}55%{transform:scale(1)}}
  .jd-livebox{margin-top:8px!important;max-width:210px!important}.jd-livebox .jd-pill{padding:4px 10px!important;gap:7px!important;border-radius:10px!important}.jd-livebox .jd-pl b{font-size:14px!important;letter-spacing:.8px!important}.jd-livebox .jd-pl small{font-size:8px!important;letter-spacing:1px!important}.jd-livebox .jd-dot{width:8px!important;height:8px!important}
  .jd-sess{margin-top:7px;text-align:left}.jd-sess .jd-sub{font-size:10.5px;text-align:left;line-height:1.4}.jd-sess .jd-sn{opacity:.8;font-size:10px;margin-top:1px}
  .jd-hmt .jd-hmv{font:700 10px ui-monospace,Consolas,monospace;font-style:normal;opacity:.85}.jd-hmg{grid-auto-rows:66px!important}
  .jd-hero{grid-template-columns:auto minmax(0,1fr) 270px}.jd-left{gap:12px}.jd-livebox .jd-sn{font-size:10.5px;opacity:.85;margin-top:-2px}.jd-mid{justify-content:center;align-items:center;text-align:center}.jd-mid .jd-ban{margin:0 auto}
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

  /* ---------- top row: 3D smoky-glass tiles (replaces the Indian markets table) ----------
     Trend = price vs 20/50-day averages. Levels are mechanical, from the last year of daily bars:
       nearest S/R  = closest of classic pivots (S1,S2,R1,R2,P), previous-day high/low, 5-day high/low, round number
       major S/R    = next level beyond that from 20/60-session and 52-week extremes, 50/200-day averages, S2/R2 */
  const T3 = [
    { s: '^NSEI', n: 'NIFTY 50', lv: 1, rnd: 100 }, { s: '^NSEBANK', n: 'BANK NIFTY', lv: 1, rnd: 500 }, { s: '^BSESN', n: 'SENSEX', lv: 1, rnd: 500 },
    { s: '^INDIAVIX', n: 'INDIA VIX', lv: 1, rnd: 1, inv: 1 }, { s: 'USDINR=X', n: 'USD / INR', lv: 1, rnd: 0.5, inv: 1, dp: 3 },
    { s: 'BZ=F', n: 'BRENT CRUDE', lv: 1, rnd: 1, dp: 2 }, { combo: 1 },
  ];
  S.h = {};
  async function loadHist(force) { if (force) T3.forEach((t) => { if (t.lv && S.h[t.s]) S.h[t.s].due = 0; }); await Promise.all(T3.filter((t) => t.lv).map((t) => histOne(t.s, true))); paint(); }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  function levels(t, px) {
    const h = S.h[t.s]; if (!h || !h.bars || h.bars.length < 30 || px == null) return null;
    const ist = new Date(Date.now() + 19800000), today = ist.toISOString().slice(0, 10), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    const done = h.bars.slice(); let forming = false;
    if (done[done.length - 1].d >= today && mins < 960) { done.pop(); forming = true; }
    if (done.length < 30) return null;
    const pv = done[done.length - 1], cl = done.map((b) => b.c).concat(forming ? [px] : []);
    const hi = (n) => Math.max(px, ...done.slice(-n).map((b) => b.h)), lo = (n) => Math.min(px, ...done.slice(-n).map((b) => b.l));
    const sma = (n) => avg(cl.slice(-n)), s20 = sma(20), s50 = sma(50), s200 = cl.length >= 150 ? sma(Math.min(200, cl.length)) : null;
    const P = (pv.h + pv.l + pv.c) / 3, R1 = 2 * P - pv.l, S1 = 2 * P - pv.h, R2 = P + (pv.h - pv.l), S2 = P - (pv.h - pv.l), rd = t.rnd;
    const gap = px * 0.0006;
    const nS = [[S1, 'Pivot S1'], [S2, 'Pivot S2'], [P, 'Pivot'], [pv.l, 'Prev-day low'], [Math.min(...done.slice(-5).map((b) => b.l)), '5-day low'], [Math.floor(px / rd) * rd, 'Round level']].filter((x) => x[0] < px - gap);
    const nR = [[R1, 'Pivot R1'], [R2, 'Pivot R2'], [P, 'Pivot'], [pv.h, 'Prev-day high'], [Math.max(...done.slice(-5).map((b) => b.h)), '5-day high'], [Math.ceil(px / rd) * rd, 'Round level']].filter((x) => x[0] > px + gap);
    const ns = nS.sort((a, b) => b[0] - a[0])[0] || null, nr = nR.sort((a, b) => a[0] - b[0])[0] || null;
    const mS = [[lo(20), '20-session low'], [lo(60), '60-session low'], [lo(252), '52-week low'], [s50, '50-day avg'], [s200, '200-day avg'], [S2, 'Pivot S2']].filter((x) => x[0] != null && x[0] < (ns ? ns[0] : px) - gap);
    const mR = [[hi(20), '20-session high'], [hi(60), '60-session high'], [hi(252), '52-week high'], [s50, '50-day avg'], [s200, '200-day avg'], [R2, 'Pivot R2']].filter((x) => x[0] != null && x[0] > (nr ? nr[0] : px) + gap);
    const ms = mS.sort((a, b) => b[0] - a[0])[0] || null, mr = mR.sort((a, b) => a[0] - b[0])[0] || null;
    let tr, tc;
    if (px > s20 && s20 > s50) { tr = 'UPTREND'; tc = 1; } else if (px < s20 && s20 < s50) { tr = 'DOWNTREND'; tc = -1; }
    else if (px > s50 && px < s20) { tr = 'PULLBACK IN UPTREND'; tc = 0.5; } else if (px < s50 && px > s20) { tr = 'RELIEF BOUNCE'; tc = -0.5; } else { tr = 'SIDEWAYS'; tc = 0; }
    return { ns, nr, ms, mr, tr, tc, a20: px >= s20, a50: px >= s50, at52h: px >= hi(252) * 0.999 };
  }
  function spark(sp, up) {
    if (!sp || sp.length < 4) return '<svg class="j3-sp" viewBox="0 0 100 22"></svg>';
    const mn = Math.min(...sp), mx = Math.max(...sp), rg = mx - mn || 1, pts = sp.map((v, i) => (i / (sp.length - 1) * 100).toFixed(1) + ',' + (20 - (v - mn) / rg * 18).toFixed(1)).join(' ');
    return `<svg class="j3-sp ${up}" viewBox="0 0 100 22" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function tile3(t, ms) {
    const dp0 = t.dp, xr = t.lv ? `<span class="jb-btns"><button class="jd-br" type="button" data-brief="${esc(t.s)}" title="Why is ${esc(t.n)} moving, what next, what to do">Why?</button><button class="jd-xr" type="button" data-xr="${esc(t.s)}" title="Live X-ray of ${esc(t.n)}">X-ray</button></span>` : '';
    let q = null, px = null, chg = null, pct = null, cls = '', body = '', dirTxt = '', extra = '', chtxt = '—', pxtxt = '…';
    if (t.lv) { q = S.q[t.s]; if (q && q.p != null) { px = q.p; if (q.pc) { chg = q.p - q.pc; pct = chg / q.pc * 100; } } }
    else if (t.x === 'in10y') { const x = S.x.in10y, m = manual().in10y; if (x && x.p != null) { px = x.p; if (x.pc != null) chg = (x.p - x.pc) * 100; } else if (m) px = m.v; }
    else { const x = S.x.pcr, m = manual().pcr; px = x && x.pcr != null ? x.pcr : m ? m.v : null; }
    const dp = dp0 != null ? dp0 : t.x === 'in10y' ? 3 : t.x === 'pcr' ? 2 : dpOf(px);
    const dir = chg == null || (pct != null && Math.abs(pct) < 0.005) ? 0 : chg > 0 ? 1 : -1, good = t.inv || t.x === 'in10y' ? -dir : dir;
    cls = good > 0 ? 'up' : good < 0 ? 'dn' : 'fl';
    if (t.x === 'pcr' && px != null) { const g = pcrTag(px)[1]; cls = g === 'g' ? 'up' : g === 'r' ? 'dn' : 'fl'; }
    if (px != null) pxtxt = fmtN(px, dp) + (t.x === 'in10y' ? '<i>%</i>' : '');
    if (t.lv) chtxt = chg == null ? '—' : `<b>${dir > 0 ? '▲' : dir < 0 ? '▼' : '■'}</b> ${chg > 0 ? '+' : ''}${fmtN(chg, dp)} <span>(${pct > 0 ? '+' : ''}${pct.toFixed(2)}%)</span>`;
    else if (t.x === 'in10y') chtxt = chg == null ? '<span>manual / last value</span>' : `<b>${dir > 0 ? '▲' : dir < 0 ? '▼' : '■'}</b> ${chg >= 0 ? '+' : ''}${chg.toFixed(1)} bp`;
    else chtxt = px == null ? '' : `<b>${pcrTag(px)[1] === 'g' ? '▲' : pcrTag(px)[1] === 'r' ? '▼' : '■'}</b> <span>${pcrTag(px)[0]}</span>`;
    if (t.x && px == null) { pxtxt = manIn(t.x, t.x === 'pcr' ? 'PCR' : 'yield %'); chtxt = '<span>feed unavailable · enter value</span>'; }
    if (t.lv) {
      const L = levels(t, px), f = (v) => fmtN(v, dp), dist = (v) => (v / px - 1) * 100, row = (k, c, x) => x ? `<div class="j3-r ${c}" title="${esc(x[1])}"><i>${k}</i><b>${f(x[0])}</b><u>${dist(x[0]) > 0 ? '+' : ''}${dist(x[0]).toFixed(1)}%</u></div>` : `<div class="j3-r ${c}"><i>${k}</i><b>—</b><u></u></div>`;
      if (!px) body = '';
      else if (!L) body = '<div class="j3-tr t0">levels loading…</div>';
      else {
        const tcls = (t.inv ? -L.tc : L.tc) > 0 ? 'up' : (t.inv ? -L.tc : L.tc) < 0 ? 'dn' : 'fl';
        body = `<div class="j3-tr ${tcls}" title="Price ${L.a20 ? 'above' : 'below'} 20-day average, ${L.a50 ? 'above' : 'below'} 50-day average"><span>TREND</span> ${L.tr}</div>`
          + `<div class="j3-lv">${row('Major R', 'r mj', L.mr || (L.at52h ? ['', '52-week high zone'] : null))}${row('Near R', 'r', L.nr)}${row('Near S', 's', L.ns)}${row('Major S', 's mj', L.ms)}</div>`;
        if (!L.mr && L.at52h) body = body.replace('<b>—</b><u></u>', '<b>ATH zone</b><u></u>');
      }
    } else body = '<div class="j3-tr t0">levels n/a for this series</div>';
    return `<div class="j3 ${cls}${q && q.flash ? ' fl-' + q.flash : ''}"><div class="j3-in"><div class="j3-top"><span class="j3-nm">${t.s === 'BZ=F' ? '🛢 ' : t.lv ? flag(t.s === 'USDINR=X' ? 'us' : 'in') : ''}${esc(t.n)}</span>${xr}</div>`
      + `<div class="j3-px">${pxtxt}</div><div class="j3-ch">${chtxt}</div>${t.lv && q ? spark(q.sp, cls) : ''}${body}</div></div>`;
  }
  function callTiles() { try { if (!window.jcCalls || !window.jcCalls.tiles) return ''; window.jcCalls.ensure(() => { if ((window.__curTab || '') === 'pDash') paint(); }); return window.jcCalls.tiles(); } catch (e) { return ''; } }
  function tiles3d(ms) { return `<div class="j3-row">${T3.map((t) => t.combo ? comboTile() : tile3(t, ms)).join('')}</div>`; }
  const CSS3 = `
  .j3-row{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px;margin:12px 0 10px;perspective:1300px}
  .j3{position:relative;transform-style:preserve-3d}
  .j3-in{position:relative;overflow:hidden;border-radius:15px;padding:10px 11px 9px;color:#eef3ff;min-height:214px;isolation:isolate;
    background:linear-gradient(150deg,#27345c 0%,#121b38 48%,#070b1a 100%);border:1px solid rgba(190,205,255,.28);
    box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 -10px 18px rgba(0,0,0,.45) inset,0 7px 0 -2px #0a1128,0 8px 0 -2px rgba(150,170,230,.25),0 20px 24px -12px rgba(5,12,40,.75),0 0 0 1px rgba(8,14,40,.6);
    transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .18s ease-out,box-shadow .2s}
  .j3:hover .j3-in{box-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 -10px 18px rgba(0,0,0,.45) inset,0 7px 0 -2px #0a1128,0 8px 0 -2px rgba(150,170,230,.3),0 28px 30px -12px rgba(5,12,40,.85)}
  .j3-in::before{content:'';position:absolute;inset:-30%;z-index:-1;filter:blur(14px);opacity:.95;animation:j3smoke 11s ease-in-out infinite alternate;
    background:radial-gradient(38% 34% at 18% 82%,var(--g1),transparent 70%),radial-gradient(34% 30% at 86% 24%,rgba(150,175,255,.34),transparent 70%),radial-gradient(40% 28% at 55% 55%,rgba(255,255,255,.10),transparent 72%)}
  .j3-in::after{content:'';position:absolute;left:0;right:0;top:0;height:46%;z-index:0;pointer-events:none;border-radius:15px 15px 55% 55%/15px 15px 26px 26px;
    background:linear-gradient(180deg,rgba(255,255,255,.34) 0%,rgba(255,255,255,.12) 45%,rgba(255,255,255,0) 100%)}
  .j3.up{--g1:rgba(30,214,120,.50);--ac:#42f0a0}.j3.dn{--g1:rgba(255,70,95,.48);--ac:#ff7a8e}.j3.fl{--g1:rgba(120,150,255,.38);--ac:#b9c8f5}
  .j3.up .j3-in{border-color:rgba(66,240,160,.55)}.j3.dn .j3-in{border-color:rgba(255,122,142,.55)}
  @keyframes j3smoke{0%{transform:translate(-4%,2%) rotate(0deg) scale(1)}50%{transform:translate(3%,-3%) rotate(8deg) scale(1.08)}100%{transform:translate(-2%,4%) rotate(-6deg) scale(1.02)}}
  .j3-in>*{position:relative;z-index:1}
  .j3-top{display:flex;justify-content:space-between;align-items:center;gap:4px}.j3-nm{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:800;letter-spacing:.06em;color:#dfe8ff;text-shadow:0 1px 2px rgba(0,0,0,.6);white-space:nowrap}
  .j3-nm .jd-flag{width:19px;height:13px}
  .j3 .jd-xr{font-size:10px;font-weight:800;padding:3px 8px;border-radius:7px;flex:none;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;cursor:pointer}
  .j3-px{font-size:21px;font-weight:800;letter-spacing:.01em;margin-top:3px;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.55),0 0 14px var(--g1);font-variant-numeric:tabular-nums}.j3-px i{font-size:12px;font-style:normal;opacity:.8}
  .j3-px .jd-man{width:90px;font-size:13px;padding:2px 4px;border-radius:5px;border:1px solid rgba(255,255,255,.4);background:rgba(0,0,0,.35);color:#fff}
  .j3-ch{font-size:11.5px;font-weight:700;color:var(--ac);text-shadow:0 1px 2px rgba(0,0,0,.55)}.j3-ch span{color:#cfd9f7;font-weight:600}.j3-ch b{font-size:10px}
  .j3-sp{display:block;width:100%;height:20px;margin:3px 0 1px}.j3-sp polyline{stroke:var(--ac);filter:drop-shadow(0 0 3px var(--ac))}
  .j3-tr{margin-top:3px;font-size:9.5px;font-weight:800;letter-spacing:.07em;padding:2px 7px;border-radius:20px;display:inline-block;background:rgba(0,0,0,.38);border:1px solid rgba(255,255,255,.2);color:#e6ecff}
  .j3-tr span{opacity:.6;font-weight:700;margin-right:3px}.j3-tr.up{color:#54f5aa;border-color:rgba(84,245,170,.5)}.j3-tr.dn{color:#ff8da0;border-color:rgba(255,141,160,.5)}.j3-tr.t0{font-weight:600;opacity:.75;letter-spacing:.02em}
  .j3-lv{margin-top:5px;display:flex;flex-direction:column;gap:2px;border-top:1px solid rgba(255,255,255,.18);padding-top:4px}
  .j3-r{display:grid;grid-template-columns:50px 1fr auto;gap:4px;align-items:baseline;font-size:10.5px;padding:1px 5px;border-radius:5px;background:rgba(0,0,0,.28)}
  .j3-r i{font-style:normal;font-size:9px;font-weight:700;opacity:.8;letter-spacing:.03em}.j3-r b{text-align:right;font-variant-numeric:tabular-nums;font-size:11px}.j3-r u{text-decoration:none;font-size:9px;opacity:.75;min-width:34px;text-align:right}
  .j3-r.r{color:#ffa9b6}.j3-r.s{color:#86f5bd}.j3-r.mj{background:rgba(255,255,255,.12);box-shadow:0 0 0 1px rgba(255,255,255,.12) inset}.j3-r.mj b{font-weight:900}
  .j3.fl-up .j3-px{animation:j3f 1s}.j3.fl-dn .j3-px{animation:j3f 1s}@keyframes j3f{0%{text-shadow:0 0 18px #fff}100%{}}
  @media(max-width:1480px){.j3-row{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:700px){.j3-row{grid-template-columns:repeat(2,minmax(0,1fr))}.j3-px{font-size:18px}}
  @media(prefers-reduced-motion:reduce){.j3-in::before{animation:none}.j3-in{transition:none}}
  @media print{.j3-in{-webkit-print-color-adjust:exact;print-color-adjust:exact;transform:none!important}}`;
  document.addEventListener('mousemove', (e) => { const t = e.target.closest && e.target.closest('.j3'); if (!t) return; const r = t.getBoundingClientRect(), i = t.firstChild, hd = t.querySelector('.j3-top');
    /* keep the tile flat while the pointer is on its header band (name + X-ray button) or any control, so the button never slides out from under the cursor */
    if (e.target.closest('button,input,a,[data-xr]') || (hd && e.clientY - r.top < hd.offsetTop + hd.offsetHeight + 10)) { i.style.setProperty('--rx', '0deg'); i.style.setProperty('--ry', '0deg'); return; }
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; i.style.setProperty('--ry', (x * 14).toFixed(1) + 'deg'); i.style.setProperty('--rx', (-y * 14).toFixed(1) + 'deg'); }, { passive: true });
  document.addEventListener('mouseout', (e) => { const t = e.target.closest && e.target.closest('.j3'); if (t && !t.contains(e.relatedTarget)) { t.firstChild.style.setProperty('--rx', '0deg'); t.firstChild.style.setProperty('--ry', '0deg'); } }, { passive: true });

  /* ---------- 10-year yields of Japan / UK / Germany (CNBC quote feed, called straight from the browser) ---------- */
  S.bd = {}; S.bdAt = 0;
  async function loadBonds(force) {
    const ms = Date.now(); if (S.bdBusy || (!force && ms - S.bdAt < 300000)) return; S.bdBusy = 1;
    try {
      const u = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=JP10Y|UK10Y|DE10Y|IN10Y&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1';
      const j = JSON.parse(await fetchWithTimeout(u, 12000)); let fq = j && j.FormattedQuoteResult && j.FormattedQuoteResult.FormattedQuote; fq = Array.isArray(fq) ? fq : fq ? [fq] : [];
      const num = (v) => v == null ? NaN : parseFloat(String(v).replace(/[%,]/g, ''));
      fq.forEach((q) => { const p = num(q.last), pc = num(q.previous_day_closing); if (q.symbol && !isNaN(p)) S.bd[q.symbol] = { p, pc: isNaN(pc) ? null : pc, d: q.last_time || '' }; });
      if (Object.keys(S.bd).length) { S.bdAt = ms; if (!S.x.in10y && S.bd.IN10Y) S.x.in10y = S.bd.IN10Y; }
    } catch (e) { S.bdAt = ms - 240000; } finally { S.bdBusy = 0; paint(); }
  }
  function bondRow(name, fc, x) {
    if (!x) return `<tr class="jd-na"><td class="jd-nm">${flag(fc)}<span class="jd-live off"></span>${name}</td><td class="jd-px">…</td><td class="jd-ch"></td><td class="jd-pc"></td></tr>`;
    const chg = x.pc != null ? (x.p - x.pc) * 100 : null, pp = x.pc ? (x.p - x.pc) / x.pc * 100 : null, cls = chg == null || Math.abs(chg) < .05 ? '' : chg > 0 ? 'd' : 'u';
    return `<tr class="${cls}" title="${esc(name)} · ${esc(x.d || '')} · CNBC quote feed"><td class="jd-nm">${flag(fc)}<span class="jd-live on"></span>${name}</td><td class="jd-px">${fmtN(x.p, 3)}<i>%</i></td><td class="jd-ch"><b>${chg == null ? '■' : chg > 0 ? '▲' : '▼'}</b> ${chg == null ? '—' : (chg >= 0 ? '+' : '') + chg.toFixed(1) + ' bp'}</td><td class="jd-pc"><span>${pp == null ? '—' : (pp > 0 ? '+' : '') + pp.toFixed(2) + '%'}</span></td></tr>`;
  }

  /* ---------- heatmap drill-down: click an index tile to see its strongest and weakest stocks ---------- */
  S.hm = null; S.hmAll = false; S.cons = null; S.mv = {};
  async function loadCons() {
    if (S.cons || S.consBusy) return; S.consBusy = 1;
    try { const r = await fetch('data/constituents.json?h=' + Math.floor(Date.now() / 3600000)); S.cons = (await r.json()).idx || {}; } catch (e) { S.cons = {}; } finally { S.consBusy = 0; }
  }
  const consOf = (sym) => S.cons ? S.cons[sym === '^BSESN' ? '^NSEI' : sym] : null; // BSE does not publish the Sensex list; Nifty 50 holds almost all of its stocks
  async function loadMovers(sym) {
    const list = consOf(sym) || []; if (!list.length) return;
    const m = S.mv[sym]; if (m && (m.busy || Date.now() - m.t < 45000)) return;
    S.mv[sym] = Object.assign(m || { rows: null, t: 0 }, { busy: 1 }); let rows = null;
    try {
      const be = getBackend();
      if (be) { const out = []; for (let i = 0; i < list.length; i += 100) { const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=liveq&symbols=' + encodeURIComponent(list.slice(i, i + 100).map((x) => x + '.NS').join(','))), 40000)); if (j && j.ok) Object.keys(j.q).forEach((k) => { const a = j.q[k]; if (a && a[0] && a[1]) out.push({ s: k.replace(/\.NS$/, ''), p: a[0], pc: a[1] }); }); } if (out.length) rows = out; }
    } catch (e) { }
    if (!rows) { try { const rr = await fetchBatch(list.map((x) => x + '.NS')); rows = rr.filter((r) => r && r.p != null && r.pc).map((r) => ({ s: r.s.replace(/\.NS$/, ''), p: r.p, pc: r.pc })); } catch (e) { } }
    S.mv[sym] = { rows: rows && rows.length ? rows : null, t: Date.now(), n: list.length }; paint(); renderPop();
  }
  const CSS4 = `
  .jd-hmt[data-hm]{cursor:pointer;transition:transform .12s,box-shadow .12s}.jd-hmt[data-hm]:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(20,48,110,.25)}.jd-hmt.sel{outline:3px solid #14306e;outline-offset:1px}
  .jd-mvh{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}.jd-mvh b{font-size:13.5px;color:#0b2260}.jd-mvh span{font-size:10.5px;color:#4a5878;font-weight:600;flex:1}
  .jd-mvb{font:700 10px "Segoe UI",sans-serif;border:1px solid #bccae6;background:#fff;color:#14306e;border-radius:6px;padding:2px 8px;cursor:pointer}.jd-mvb:hover{background:#eef3ff}
  .jd-mvg{display:grid;grid-template-columns:1fr 1fr;gap:10px}.jd-mvg h5{margin:0 0 4px;font-size:11px;letter-spacing:.04em}.jd-mvg h5.u{color:#0c7a42}.jd-mvg h5.d{color:#b3162f}
  .jd-mvr{position:relative;display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:3px 6px;margin-bottom:2px;border-radius:5px;font-size:11.5px;cursor:pointer;overflow:hidden;background:#f3f6fc}
  .jd-mvr i{position:absolute;left:0;bottom:0;height:2px;opacity:.7}.jd-mvr.u i{background:#16a05a}.jd-mvr.d i{background:#d12a47}.jd-mvr:hover{background:#e9effb}
  .jd-mvn{font-weight:800;color:#14213d}.jd-mvp{font:600 11px ui-monospace,Consolas,monospace;color:#4a5878}.jd-mvc{font:800 11.5px ui-monospace,Consolas,monospace;min-width:58px;text-align:right}.jd-mvr.u .jd-mvc{color:#0c7a42}.jd-mvr.d .jd-mvc{color:#b3162f}
  .jd-mvf{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:10.5px;color:#4a5878}
  @media(max-width:700px){.jd-mvg{grid-template-columns:1fr}}`;
  /* ---------- small glass tiles for Global markets / Commodities / Currencies / Bonds, and the popups ---------- */
  const PM = {}; // popup items by key
  const GLOBAL_T = GLOBAL.map((g) => [g[0], g[1].map((it) => (PM[it[0]] = { k: it[0], n: it[1], fc: it[2] }))]);
  const COMM_T = COMM.map((it) => (PM[it[0]] = { k: it[0], n: it[1].replace(/\s+/g, ' '), cat: 'comm' }));
  const FX_T = [['EURINR=X', 'EUR / INR', 3], ['GBPINR=X', 'GBP / INR', 3], ['JPYINR=X', 'JPY / INR', 4], ['DX-Y.NYB', 'US DOLLAR INDEX', 3], ['EURUSD=X', 'EUR / USD', 4]].map((it) => (PM[it[0]] = { k: it[0], n: it[1], dp: it[2], cat: 'fx' }));
  const BOND_T = [{ k: 'cnbc:IN10Y', cn: 'IN10Y', n: 'INDIA 10Y G-SEC', fc: 'in' }, { k: 'cnbc:JP10Y', cn: 'JP10Y', n: 'JAPAN 10Y JGB', fc: 'jp' }, { k: 'cnbc:UK10Y', cn: 'UK10Y', n: 'UK 10Y GILT', fc: 'gb' }, { k: 'cnbc:DE10Y', cn: 'DE10Y', n: 'GERMANY 10Y BUND', fc: 'de' }]
    .concat(BONDS.map((it) => ({ k: it[0], n: it[1].replace(' YIELD', ''), fc: 'us', yld: 1 }))).map((it) => (PM[it.k] = Object.assign(it, { yld: 1, cat: 'bond' })));
  function quoteOf(it) {
    if (it.cn) { const x = it.cn === 'IN10Y' ? (S.x.in10y || S.bd.IN10Y || (manual().in10y ? { p: manual().in10y.v, pc: null } : null)) : S.bd[it.cn]; return x ? { p: x.p, pc: x.pc, sp: null, live: false, d: x.d } : null; }
    const q = S.q[it.k]; return q ? { p: q.p, pc: q.pc, sp: q.sp, live: q.t ? (Date.now() / 1000 - q.t) / 60 < 20 : false, d: '' } : null;
  }
  /* ---- history analytics + signals for the instrument popup ---- */
  async function histOne(sym, quiet) {
    const h = S.h[sym], ms = Date.now(); if (h && (h.busy || ms < h.due)) return; S.h[sym] = Object.assign(h || {}, { busy: 1 });
    try {
      const j = await fetchData(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d&includePrePost=false`, { kind: 'json', validate: (x) => !!(x && x.chart && x.chart.result && x.chart.result[0]) });
      const r = j.chart.result[0], q = r.indicators.quote[0], ts = r.timestamp || [], bars = [];
      ts.forEach((tt, i) => { if (q.close[i] != null && q.high[i] != null && q.low[i] != null) bars.push({ d: new Date((tt + 19800) * 1000).toISOString().slice(0, 10), h: q.high[i], l: q.low[i], c: q.close[i] }); });
      S.h[sym] = { bars, due: ms + 30 * 60000 };
    } catch (e) { S.h[sym] = { bars: (h && h.bars) || null, due: ms + 3 * 60000, err: 1 }; }
    if (!quiet) renderPop();
  }
  function ana(sym, px) {
    const h = S.h[sym]; if (!h || !h.bars || h.bars.length < 60 || px == null) return null;
    const B = h.bars, cl = B.map((b) => b.c); cl[cl.length - 1] = px; const n = cl.length, last = px, sma = (k) => n >= k ? avg(cl.slice(-k)) : null, s20 = sma(20), s50 = sma(50), s200 = sma(200);
    const ema = (a, k) => { const m = 2 / (k + 1); let e = a[0]; const o = [e]; for (let i = 1; i < a.length; i++) { e = a[i] * m + e * (1 - m); o.push(e); } return o; };
    const e12 = ema(cl, 12), e26 = ema(cl, 26), macd = e12.map((v, i) => v - e26[i]), sg = ema(macd, 9), mh = macd[n - 1] - sg[n - 1], mhp = macd[n - 4] - sg[n - 4];
    let g = 0, l = 0; for (let i = 1; i <= 14; i++) { const d = cl[i] - cl[i - 1]; if (d >= 0) g += d; else l -= d; } g /= 14; l /= 14;
    for (let i = 15; i < n; i++) { const d = cl[i] - cl[i - 1]; g = (g * 13 + Math.max(d, 0)) / 14; l = (l * 13 + Math.max(-d, 0)) / 14; } const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    const ret = (k) => n > k ? (last / cl[n - 1 - k] - 1) * 100 : null, yr = new Date(Date.now() + 19800000).getUTCFullYear() + '-01-01', iy = B.findIndex((b) => b.d >= yr), ytd = iy > 0 ? (last / cl[iy - 1] - 1) * 100 : null;
    const hi52 = Math.max(...B.map((b) => b.h), last), lo52 = Math.min(...B.map((b) => b.l), last), pH = Math.max(...B.slice(-21, -1).map((b) => b.h)), pL = Math.min(...B.slice(-21, -1).map((b) => b.l));
    const tr = (cur, ma, prev) => ma == null ? null : cur > ma && ma >= prev ? 1 : cur < ma && ma <= prev ? -1 : 0;
    const T = { s: tr(last, s20, avg(cl.slice(-25, -5))), m: tr(last, s50, avg(cl.slice(-65, -15))), l: s200 == null ? null : tr(last, s200, avg(cl.slice(-230, -30).length ? cl.slice(-230, -30) : cl)) };
    const S2 = []; // [text, tone g/r/a/n]
    if (s200 != null) S2.push(s50 > s200 ? ['50-DMA above 200-DMA — golden-cross zone', 'g'] : ['50-DMA below 200-DMA — death-cross zone', 'r']);
    S2.push(rsi >= 70 ? ['RSI ' + rsi.toFixed(0) + ' — overbought, stretched', 'a'] : rsi >= 55 ? ['RSI ' + rsi.toFixed(0) + ' — bullish momentum', 'g'] : rsi <= 30 ? ['RSI ' + rsi.toFixed(0) + ' — oversold, washed out', 'a'] : rsi <= 45 ? ['RSI ' + rsi.toFixed(0) + ' — bearish momentum', 'r'] : ['RSI ' + rsi.toFixed(0) + ' — neutral', 'n']);
    S2.push(mh > 0 ? [mhp <= 0 ? 'MACD fresh bullish crossover' : 'MACD above signal line — bullish', 'g'] : [mhp >= 0 ? 'MACD fresh bearish crossover' : 'MACD below signal line — bearish', 'r']);
    if (last > pH) S2.push(['Breakout above the 20-day high', 'g']); else if (last < pL) S2.push(['Breakdown below the 20-day low', 'r']);
    if (last >= hi52 * 0.98) S2.push(['Within 2% of the 52-week high', 'g']); else if (last <= lo52 * 1.02) S2.push(['Within 2% of the 52-week low', 'r']);
    const r1 = ret(21); if (r1 != null && r1 >= 5) S2.push(['Strong 1-month momentum (' + r1.toFixed(1) + '%)', 'g']); else if (r1 != null && r1 <= -5) S2.push(['Weak 1-month momentum (' + r1.toFixed(1) + '%)', 'r']);
    const score = [T.s, T.m, T.l].reduce((a, v) => a + (v || 0), 0) + S2.reduce((a, v) => a + (v[1] === 'g' ? 1 : v[1] === 'r' ? -1 : 0), 0);
    return { s20, s50, s200, rsi, mh, ret1w: ret(5), ret1m: ret(21), ret3m: ret(63), ret1y: n > 240 ? ret(n - 1) : null, ytd, hi52, lo52, pos: (last - lo52) / ((hi52 - lo52) || 1) * 100, T, sig: S2, bias: score >= 3 ? ['BULLISH BIAS', 'g'] : score <= -3 ? ['BEARISH BIAS', 'r'] : ['NEUTRAL / MIXED', 'n'], B, cl };
  }
  function chartSVG(A, L, dp) {
    const N = Math.min(120, A.cl.length), pr = A.cl.slice(-N), sm = (k) => A.cl.map((_, i) => i >= k - 1 ? avg(A.cl.slice(i - k + 1, i + 1)) : null).slice(-N), s20 = sm(20), s50 = sm(50);
    const lv = [[L && L.mr, 'r'], [L && L.nr, 'r'], [L && L.ns, 's'], [L && L.ms, 's']].filter((x) => x[0]).map((x) => [x[0][0], x[1]]);
    const base = pr.concat(s20.filter((v) => v != null), s50.filter((v) => v != null)); let mn = Math.min(...base), mx = Math.max(...base); const pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
    const W = 640, H = 190, X = (i) => (i / (N - 1) * W).toFixed(1), Y = (v) => (H - 10 - (v - mn) / ((mx - mn) || 1) * (H - 20)).toFixed(1), line = (a, c, w, d) => `<polyline fill="none" stroke="${c}" stroke-width="${w}" ${d ? 'stroke-dasharray="4 3"' : ''} points="${a.map((v, i) => v == null ? null : X(i) + ',' + Y(v)).filter(Boolean).join(' ')}"/>`;
    const hl = lv.filter((x) => x[0] > mn && x[0] < mx).map((x) => `<line x1="0" x2="${W}" y1="${Y(x[0])}" y2="${Y(x[0])}" stroke="${x[1] === 'r' ? '#d12a47' : '#16a05a'}" stroke-width="1" stroke-dasharray="5 4" opacity=".75"/><text x="${W - 3}" y="${(+Y(x[0]) - 3).toFixed(1)}" text-anchor="end" font-size="10" fill="${x[1] === 'r' ? '#b3162f' : '#0c7a42'}">${x[1] === 'r' ? 'R' : 'S'} ${fmtN(x[0], dp)}</text>`).join('');
    return `<svg class="jd-pch" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><rect width="${W}" height="${H}" fill="#f6f8fd"/>${hl}${line(s50, '#2f5fd0', 1.4)}${line(s20, '#e08a00', 1.4)}${line(pr, '#0b2260', 2)}</svg><div class="jd-pleg"><span style="--c:#0b2260">price</span><span style="--c:#e08a00">20-DMA</span><span style="--c:#2f5fd0">50-DMA</span><span style="--c:#d12a47">resistance</span><span style="--c:#16a05a">support</span> · last ${N} sessions</div>`;
  }
  const roundStep = (p) => { let s = Math.pow(10, Math.floor(Math.log10(Math.abs(p) || 1)) - 1); if (p / s < 20) s /= 2; return s; };
  const sgn = (v, d) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%';
  const tcol = (v) => v == null ? 'n' : v > 0 ? 'g' : v < 0 ? 'r' : 'a';
  function instPopHTML(P) {
    const it = P.it, x = quoteOf(it), top = (inner) => `<div class="jd-pm-h"><div class="jd-pm-t">${it.fc ? flag(it.fc) : ''}<b>${esc(it.n)}</b><small>${it.cn ? 'CNBC quote feed' : esc(it.k)}</small></div><div class="jd-pm-bt">${P.back ? '<button type="button" class="jd-mvb" data-popback="1">← Back</button>' : ''}${it.cn ? '' : `<button type="button" class="jd-mvb" data-xr="${esc(it.k)}">X-ray</button>`}<button type="button" class="jd-mvb" data-popx="1" title="Close (Esc)">✕</button></div></div><div class="jd-pm-b">${inner}</div>`;
    if (!x || x.p == null) return top('<div class="jd-fn">Waiting for the first quote…</div>');
    const dp = it.dp != null ? it.dp : it.yld ? 3 : dpOf(x.p), chg = x.pc != null ? x.p - x.pc : null, pct = x.pc ? chg / x.pc * 100 : null, dir = chg == null ? 0 : chg > 0 ? 1 : chg < 0 ? -1 : 0, good = it.yld ? -dir : dir;
    const head = `<div class="jd-pk ${good > 0 ? 'u' : good < 0 ? 'd' : ''}"><span class="jd-pkp">${fmtN(x.p, dp)}${it.yld ? '<u>%</u>' : ''}</span><span class="jd-pkc">${chg == null ? '' : (dir > 0 ? '▲ ' : dir < 0 ? '▼ ' : '■ ') + (it.yld ? (chg >= 0 ? '+' : '') + (chg * 100).toFixed(1) + ' bp' : (chg > 0 ? '+' : '') + fmtN(chg, dp) + ' (' + sgn(pct) + ')')}</span>${x.live ? '<span class="jd-pkl">● live</span>' : '<span class="jd-pkl off">last session</span>'}</div>`;
    if (it.cn) return top(head + '<div class="jd-fn">Price history is not available for this yield on the free feed, so trend signals and levels are not shown. Change is versus the previous close.</div>');
    const h = S.h[it.k];
    if (!h || !h.bars) return top(head + `<div class="jd-fn">${h && h.err ? 'History could not be loaded right now — retrying.' : 'Loading 1-year history for trend signals…'}</div>`);
    const A = ana(it.k, x.p); if (!A) return top(head + '<div class="jd-fn">Not enough history for signals.</div>');
    const L = levels({ s: it.k, rnd: roundStep(x.p) }, x.p), f = (v) => fmtN(v, dp);
    const chip = (v, k) => `<span class="jd-tc2 ${A.T[v] == null ? 'n' : tcol(A.T[v])}"><i>${k}</i>${A.T[v] == null ? 'n/a' : A.T[v] > 0 ? '▲ UP' : A.T[v] < 0 ? '▼ DOWN' : '■ FLAT'}</span>`;
    const dist = (v) => ((v / x.p - 1) * 100).toFixed(1), lrow = (k, c, v) => `<div class="j3-r ${c}"><i>${k}</i><b>${v ? f(v[0]) : '—'}</b><u>${v ? (v[0] > x.p ? '+' : '') + dist(v[0]) + '%' : ''}</u></div>`;
    const stat = (k, v) => `<div class="jd-st"><span>${k}</span><b>${v}</b></div>`;
    const body = head + `<div class="jd-pbias ${A.bias[1]}">${A.bias[0]}</div><div class="jd-tcs">${chip('s', 'Short · 20D')}${chip('m', 'Medium · 50D')}${chip('l', 'Long · 200D')}</div>`
      + `<h5>Trend signals</h5><div class="jd-sig">${A.sig.map((s) => `<span class="jd-sg ${s[1]}">${esc(s[0])}</span>`).join('')}</div>`
      + chartSVG(A, L, dp)
      + `<div class="jd-pgrid"><div><h5>Support &amp; resistance</h5><div class="j3-lv jd-lvl">${lrow('Major R', 'r mj', L && (L.mr || (L.at52h ? [A.hi52, ''] : null)))}${lrow('Near R', 'r', L && L.nr)}${lrow('Near S', 's', L && L.ns)}${lrow('Major S', 's mj', L && L.ms)}</div><div class="jd-fn">Pivot points, previous-day and 5-day extremes, round numbers; major from 20/60-session and 52-week extremes and the 50/200-day averages.</div></div>`
      + `<div><h5>Key numbers</h5>${stat('52-week high / low', f(A.hi52) + ' / ' + f(A.lo52))}${stat('Position in 52-week range', A.pos.toFixed(0) + '%')}${stat('1W · 1M · 3M', sgn(A.ret1w, 1) + ' · ' + sgn(A.ret1m, 1) + ' · ' + sgn(A.ret3m, 1))}${stat('YTD · 1Y', sgn(A.ytd, 1) + ' · ' + sgn(A.ret1y, 1))}${stat('20 / 50 / 200-DMA', f(A.s20) + ' / ' + f(A.s50) + ' / ' + (A.s200 ? f(A.s200) : '—'))}${stat('RSI (14)', A.rsi.toFixed(0))}</div></div>`
      + '<div class="jd-fn">Mechanical, rule-based signals from delayed daily data — research input, not advice; no outcome is guaranteed.</div>';
    return top(body);
  }

  /* ---- index popup: weights and contribution to the index move ---- */
  const HN = {}; [['^NSEI', 'NIFTY 50'], ['^NSEBANK', 'BANK NIFTY'], ['^BSESN', 'SENSEX']].concat(NIFTY_OTHERS.map((x) => [x[0], x[1]])).forEach((x) => { HN[x[0]] = x[1]; });
  async function loadWeights() { if (S.wt || S.wtBusy) return; S.wtBusy = 1; try { const j = await (await fetch('data/weights.json?h=' + Math.floor(Date.now() / 3600000))).json(); S.wt = j.w || {}; S.wtSrc = j.source || ''; S.wtAt = (j.updated || '').slice(0, 10); } catch (e) { S.wt = {}; } finally { S.wtBusy = 0; renderPop(); } }
  function idxCalc(sym) {
    const list = consOf(sym), m = S.mv[sym]; if (!list || !m || !m.rows) return null;
    const have = list.filter((s) => S.wt && S.wt[s]).length, eq = have < list.length * 0.7; let tot = 0; const cap = {}; list.forEach((s) => { cap[s] = eq ? 1 : (S.wt[s] || 0); tot += cap[s]; });
    const q = S.q[sym], pc = q && q.pc ? q.pc : null;
    return { eq, pc, rows: m.rows.map((r) => { const w = tot ? cap[r.s] / tot : 0, c = (r.p / r.pc - 1) * 100; return { s: r.s, p: r.p, c, w: w * 100, pts: pc ? w * c / 100 * pc : null }; }) };
  }
  function idxPopHTML(P) {
    const sym = P.k, nm = HN[sym] || sym, q = S.q[sym], px = q ? q.p : null, chg = q && q.pc ? q.p - q.pc : null, pct = q && q.pc ? chg / q.pc * 100 : null;
    const top = (inner) => `<div class="jd-pm-h"><div class="jd-pm-t"><b>${esc(nm)}</b><small>what is moving the index</small></div><div class="jd-pm-bt"><button type="button" class="jd-mvb" data-xr="${esc(sym)}">X-ray index</button><button type="button" class="jd-mvb" data-popx="1" title="Close (Esc)">✕</button></div></div><div class="jd-pm-b">${inner}</div>`;
    const head = px == null ? '' : `<div class="jd-pk ${chg > 0 ? 'u' : chg < 0 ? 'd' : ''}"><span class="jd-pkp">${fmtN(px, 2)}</span><span class="jd-pkc">${chg == null ? '' : (chg > 0 ? '▲ +' : '▼ ') + fmtN(chg, 2) + ' pts (' + sgn(pct) + ')'}</span></div>`;
    const list = consOf(sym); if (!S.cons) return top(head + '<div class="jd-fn">Loading constituents…</div>');
    if (!list) return top(head + '<div class="jd-fn">The stock list for this index isn’t available yet.</div>');
    const C = idxCalc(sym); if (!C) { const m = S.mv[sym]; return top(head + `<div class="jd-fn">${!m || m.busy ? 'Loading live quotes for ' + list.length + ' stocks…' : 'Quotes are unavailable right now — they retry automatically.'}</div>`); }
    const R = C.rows.slice(), dp = C.pc && C.pc >= 1000 ? 1 : 2, haveP = C.pc != null;
    R.sort((a, b) => haveP ? b.pts - a.pts : b.c - a.c);
    const pos = R.filter((r) => (haveP ? r.pts : r.c) > 0), neg = R.filter((r) => (haveP ? r.pts : r.c) < 0).reverse(), sumP = pos.reduce((a, r) => a + (r.pts || 0), 0), sumN = neg.reduce((a, r) => a + (r.pts || 0), 0);
    const mxp = Math.max(0.0001, ...R.map((r) => Math.abs(haveP ? r.pts : r.c))), N = P.all ? R.length : 8;
    const line = (r) => `<div class="jd-cr ${(haveP ? r.pts : r.c) >= 0 ? 'u' : 'd'}" data-xr="${esc(r.s)}.NS" title="${esc(r.s)} · click for live X-ray"><span class="n">${esc(r.s)}</span><span class="w">${r.w.toFixed(2)}%</span><span class="c">${sgn(r.c)}</span><span class="p">${haveP ? (r.pts > 0 ? '+' : '') + r.pts.toFixed(dp) : ''}</span><i style="width:${(Math.abs(haveP ? r.pts : r.c) / mxp * 100).toFixed(0)}%"></i></div>`;
    const hdr = '<div class="jd-cr jd-crh"><span class="n">Stock</span><span class="w">Weight</span><span class="c">Chg</span><span class="p">Pts</span></div>';
    const bar = haveP ? `<div class="jd-net"><div class="jd-nb2"><i class="d" style="flex:${Math.max(0.0001, -sumN)}"></i><i class="u" style="flex:${Math.max(0.0001, sumP)}"></i></div><div class="jd-nl"><span class="d">Dragging ${fmtN(sumN, dp)} pts</span><b>Net ${(sumP + sumN > 0 ? '+' : '') + fmtN(sumP + sumN, dp)} pts${chg != null ? ' · index moved ' + (chg > 0 ? '+' : '') + fmtN(chg, dp) : ''}</b><span class="u">Lifting +${fmtN(sumP, dp)} pts</span></div></div>` : '';
    const body = head + bar + `<div class="jd-mvg"><div><h5 class="u">▲ Lifting the index</h5>${hdr}${pos.slice(0, N).map(line).join('') || '<div class="jd-fn">none</div>'}</div><div><h5 class="d">▼ Dragging the index</h5>${hdr}${neg.slice(0, N).map(line).join('') || '<div class="jd-fn">none</div>'}</div></div>`
      + `<div class="jd-mvf"><span>${pos.length} up · ${neg.length} down · ${R.length}/${list.length} stocks priced</span><button type="button" class="jd-mvb" data-popall="1">${P.all ? 'Show top 8' : 'Show all stocks'}</button></div>`
      + `<div class="jd-fn">${C.eq ? 'Weights unavailable right now — equal weights assumed, so points are only indicative. ' : 'Weight = free-float market-cap share of the stocks in this index' + (S.wtAt ? ' (data of ' + esc(S.wtAt) + ')' : '') + '; points = weight × stock move × index close — an estimate, index caps and rebalancing not applied. '}${sym === '^BSESN' ? 'BSE does not publish the Sensex list, so Nifty 50 stocks are used — treat as approximate. ' : ''}Tap a stock for its X-ray.</div>`;
    return top(body);
  }
  function briefCtx() { return { S, levels, T3, moodScore, moodLabel, pcrVal, pcrTag, pctOf, fmtN, manual }; }
  window.jdRepaintPop = () => renderPop();
  function renderPop() {
    const el = $('jdPop'); if (!el) return; const P = S.pop;
    if (!P) { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; el.__sig = ''; document.body.style.overflow = ''; } return; }
    const html = P.t === 'idx' ? idxPopHTML(P) : P.t === 'cat' ? catPopHTML(P) : P.t === 'bias' ? biasPopHTML() : P.t === 'brief' ? (window.jcBrief ? window.jcBrief.html(P.k, briefCtx()) : '') : instPopHTML(P); if (el.__sig === html && !el.hidden) return; el.__sig = html;
    const sc = el.querySelector('.jd-pm-b'), st = sc ? sc.scrollTop : 0; el.innerHTML = `<div class="jd-pm" role="dialog" aria-modal="true">${html}</div>`; el.hidden = false; document.body.style.overflow = 'hidden';
    const sc2 = el.querySelector('.jd-pm-b'); if (sc2) sc2.scrollTop = st;
  }
  function openIdx(sym) { S.pop = { t: 'idx', k: sym, all: false }; renderPop(); loadCons().then(() => { loadMovers(sym); renderPop(); }); loadWeights(); }
  function openInst(k) { const it = PM[k]; if (!it) return; S.pop = { t: 'inst', k, it, back: S.pop && S.pop.t === 'cat' ? S.pop : null }; if (!it.cn) histOne(it.k); renderPop(); }

  /* ---- top-row combined tile: India 10Y G-Sec + Nifty PCR ---- */
  function comboTile() {
    const x = S.x.in10y || S.bd.IN10Y, m = manual().in10y, y = x && x.p != null ? x.p : m ? m.v : null, yc = x && x.pc != null ? (x.p - x.pc) * 100 : null, dy = yc == null || Math.abs(yc) < 0.05 ? 0 : yc > 0 ? 1 : -1;
    const px = S.x.pcr, mp = manual().pcr, pv = px && px.pcr != null ? px.pcr : mp ? mp.v : null, tag = pv != null ? pcrTag(pv) : null, cls = dy ? (dy > 0 ? 'dn' : 'up') : tag ? (tag[1] === 'g' ? 'up' : tag[1] === 'r' ? 'dn' : 'fl') : 'fl';
    return `<div class="j3 ${cls}"><div class="j3-in"><div class="j3-top"><span class="j3-nm">${flag('in')}INDIA 10Y G-SEC</span><span class="jb-btns"><button class="jd-br" type="button" data-brief="IN10Y" title="Why is the 10Y yield moving, what next, what to do">Why?</button></span></div><div class="j3-px">${y == null ? manIn('in10y', 'yield %') : fmtN(y, 3) + '<i>%</i>'}</div>`
      + `<div class="j3-ch">${yc == null ? '<span>' + (y == null ? 'feed unavailable · enter value' : m && !x ? 'manual value' : '—') + '</span>' : `<b>${dy > 0 ? '▲' : dy < 0 ? '▼' : '■'}</b> ${yc >= 0 ? '+' : ''}${yc.toFixed(1)} bp`}</div><div class="j3-sep"></div>`
      + `<div class="j3-top"><span class="j3-nm">NIFTY PCR (OI)${px && px.expiry ? '<small> · ' + esc(px.expiry) + '</small>' : ''}</span><span class="jb-btns"><button class="jd-br" type="button" data-brief="PCR" title="What does PCR say, what next, what to do">Why?</button></span></div><div class="j3-px">${pv == null ? manIn('pcr', 'PCR') : pv.toFixed(2)}</div>`
      + `<div class="j3-tr ${tag ? (tag[1] === 'g' ? 'up' : tag[1] === 'r' ? 'dn' : 'fl') : 't0'}">${tag ? tag[0] : 'feed unavailable · enter value'}</div></div></div>`;
  }
  const CSS5 = `
  .j3-sep{height:1px;margin:9px 0 6px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent)}.j3-nm small{font-weight:600;opacity:.7;letter-spacing:0}
  .j3m-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px;margin:2px 0 8px}.j3m-sub{margin:8px 0 5px;font-size:9.5px;font-weight:800;letter-spacing:.14em;color:#52607f;text-align:center;border-bottom:1px solid #dfe7f6;padding-bottom:3px}
  .j3m{position:relative;overflow:hidden;isolation:isolate;text-align:left;font:inherit;color:#eef3ff;cursor:pointer;border-radius:12px;padding:6px 9px 6px;min-height:62px;display:flex;flex-direction:column;justify-content:space-between;gap:1px;
    background:linear-gradient(150deg,#27345c,#111a37 55%,#070b1a);border:1px solid rgba(190,205,255,.3);box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 -6px 10px rgba(0,0,0,.4) inset,0 4px 0 -1px #0a1128,0 10px 12px -6px rgba(5,12,40,.7);transition:transform .12s,box-shadow .12s}
  .j3m:hover{transform:translateY(-2px);box-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 -6px 10px rgba(0,0,0,.4) inset,0 4px 0 -1px #0a1128,0 16px 16px -8px rgba(5,12,40,.8)}
  .j3m::before{content:'';position:absolute;inset:-25%;z-index:-1;filter:blur(9px);background:radial-gradient(40% 40% at 15% 90%,var(--g1),transparent 70%),radial-gradient(35% 35% at 90% 20%,rgba(150,175,255,.3),transparent 70%)}
  .j3m::after{content:'';position:absolute;left:0;right:0;top:0;height:44%;z-index:0;pointer-events:none;border-radius:12px 12px 50% 50%/12px 12px 14px 14px;background:linear-gradient(180deg,rgba(255,255,255,.32),rgba(255,255,255,0))}
  .j3m>*{position:relative;z-index:1}.j3m.up{--g1:rgba(30,214,120,.5);--ac:#42f0a0;border-color:rgba(66,240,160,.5)}.j3m.dn{--g1:rgba(255,70,95,.48);--ac:#ff8a9b;border-color:rgba(255,122,142,.5)}.j3m.fl{--g1:rgba(120,150,255,.38);--ac:#c5d1f7}
  .j3m-n{display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:800;letter-spacing:.05em;color:#dfe8ff;text-shadow:0 1px 2px rgba(0,0,0,.6);min-width:0}.j3m-n em{font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.j3m .jd-flag{width:16px;height:11px;flex:none}
  .j3m-l{width:6px;height:6px;border-radius:50%;background:#42f0a0;box-shadow:0 0 6px #42f0a0;flex:none;margin-left:auto}
  .j3m-p{font-size:15.5px;font-weight:800;color:#fff;text-shadow:0 2px 5px rgba(0,0,0,.55),0 0 12px var(--g1);font-variant-numeric:tabular-nums}.j3m-p u{text-decoration:none;font-size:10px;opacity:.8;margin-left:1px}
  .j3m-c{font-size:10.5px;font-weight:700;color:var(--ac);text-shadow:0 1px 2px rgba(0,0,0,.5)}.j3m-c b{font-size:8.5px}
  .j3m.fl-up .j3m-p,.j3m.fl-dn .j3m-p{animation:j3f 1s}
  .jd-pop{position:fixed;inset:0;z-index:99000;background:rgba(6,12,32,.6);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px}.jd-pop[hidden]{display:none}
  .jd-pm{width:min(900px,100%);max-height:calc(100vh - 36px);display:flex;flex-direction:column;border-radius:16px;background:#fff;box-shadow:0 30px 70px -20px rgba(0,0,0,.7);overflow:hidden;animation:jdpop .18s ease-out}@keyframes jdpop{from{transform:translateY(12px) scale(.98);opacity:0}}
  .jd-pm-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;color:#fff;background:linear-gradient(135deg,#1b2f66,#0b1330);border-bottom:2px solid #c9a24a}.jd-pm-t{display:flex;align-items:center;gap:9px;min-width:0}.jd-pm-t b{font-size:16px;letter-spacing:.03em}.jd-pm-t small{opacity:.7;font-size:11px}.jd-pm-t .jd-flag{width:28px;height:19px}
  .jd-pm-bt{display:flex;gap:6px}.jd-pm-h .jd-mvb{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.35);color:#fff}.jd-pm-h .jd-mvb:hover{background:rgba(255,255,255,.25)}
  .jd-pm-b{padding:12px 16px 14px;overflow:auto}.jd-pm-b h5{margin:10px 0 5px;font-size:11px;letter-spacing:.06em;color:#14306e}.jd-pm-b h5.u{color:#0c7a42}.jd-pm-b h5.d{color:#b3162f}
  .jd-pk{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.jd-pkp{font:800 30px "Segoe UI",sans-serif;color:#0b2260;font-variant-numeric:tabular-nums}.jd-pkp u{text-decoration:none;font-size:16px;opacity:.7}.jd-pkc{font-size:14px;font-weight:700}.jd-pk.u .jd-pkc{color:#0c7a42}.jd-pk.d .jd-pkc{color:#b3162f}.jd-pkl{font-size:10.5px;font-weight:700;color:#0c7a42}.jd-pkl.off{color:#7b88a6}
  .jd-pbias{display:inline-block;margin:8px 0 4px;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:.08em;background:#eef1f7;color:#4a5878}.jd-pbias.g{background:#dff5e8;color:#0c7a42}.jd-pbias.r{background:#fde3e8;color:#b3162f}
  .jd-tcs{display:flex;gap:8px;flex-wrap:wrap}.jd-tc2{display:flex;flex-direction:column;gap:1px;padding:5px 12px;border-radius:10px;font-size:12px;font-weight:800;border:1px solid #d5ddf0;background:#f6f8fd}.jd-tc2 i{font-style:normal;font-size:9px;letter-spacing:.06em;color:#52607f;font-weight:700}.jd-tc2.g{background:#e6f7ee;border-color:#9fdcbb;color:#0c7a42}.jd-tc2.r{background:#fdeaee;border-color:#f0a8b5;color:#b3162f}.jd-tc2.a{background:#fff4dc;border-color:#ecc77a;color:#8a5a00}
  .jd-sig{display:flex;flex-wrap:wrap;gap:6px}.jd-sg{font-size:11px;font-weight:700;padding:3px 9px;border-radius:14px;background:#eef1f7;color:#34456a;border:1px solid #d5ddf0}.jd-sg.g{background:#e6f7ee;border-color:#9fdcbb;color:#0c7a42}.jd-sg.r{background:#fdeaee;border-color:#f0a8b5;color:#b3162f}.jd-sg.a{background:#fff4dc;border-color:#ecc77a;color:#8a5a00}
  .jd-pch{display:block;width:100%;height:190px;margin-top:10px;border:1px solid #dde3f0;border-radius:8px}.jd-pleg{display:flex;flex-wrap:wrap;gap:12px;font-size:10px;color:#52607f;margin:3px 2px 0}.jd-pleg span::before{content:'';display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:4px;vertical-align:middle;background:var(--c)}
  .jd-pgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px}.jd-lvl .j3-r{color:#14213d;background:#f3f6fc}.jd-lvl .j3-r.r{color:#b3162f}.jd-lvl .j3-r.s{color:#0c7a42}.jd-lvl .j3-r.mj{background:#e6ecfa}.jd-lvl{border-top:0;padding-top:0}
  .jd-st{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;padding:3px 0;border-bottom:1px solid #eef1f7}.jd-st span{color:#52607f}.jd-st b{color:#14213d;text-align:right}
  .jd-net{margin:10px 0 2px}.jd-nb2{display:flex;height:12px;border-radius:7px;overflow:hidden;gap:2px}.jd-nb2 i{display:block}.jd-nb2 i.u{background:linear-gradient(90deg,#4fd28b,#12894b)}.jd-nb2 i.d{background:linear-gradient(90deg,#c1243e,#ff7a8e)}
  .jd-nl{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11px;margin-top:3px;font-weight:700}.jd-nl .u{color:#0c7a42}.jd-nl .d{color:#b3162f}.jd-nl b{color:#14213d}
  .jd-cr{position:relative;display:grid;grid-template-columns:1fr 54px 58px 62px;gap:6px;align-items:center;padding:3px 6px;margin-bottom:2px;border-radius:5px;font-size:11.5px;cursor:pointer;overflow:hidden;background:#f3f6fc}.jd-cr:hover{background:#e9effb}
  .jd-cr i{position:absolute;left:0;bottom:0;height:2px;opacity:.75}.jd-cr.u i{background:#16a05a}.jd-cr.d i{background:#d12a47}.jd-cr .n{font-weight:800;color:#14213d}.jd-cr .w,.jd-cr .c,.jd-cr .p{text-align:right;font:700 11px ui-monospace,Consolas,monospace}.jd-cr .w{color:#52607f}
  .jd-cr.u .c,.jd-cr.u .p{color:#0c7a42}.jd-cr.d .c,.jd-cr.d .p{color:#b3162f}.jd-cr .p{font-weight:800}.jd-crh{background:none;cursor:default;font-size:9.5px;color:#7b88a6;padding-bottom:0}.jd-crh span{font:700 9.5px "Segoe UI",sans-serif!important;color:#7b88a6!important}
  @media(max-width:700px){.jd-pgrid{grid-template-columns:1fr}.jd-pkp{font-size:24px}.jd-cr{grid-template-columns:1fr 46px 50px 50px}}`;
  /* ---------- category buttons (Global / Commodities / Currencies / Bonds) -> popup with every instrument, trend signals and X-ray ---------- */
  const CATS = {
    global: { n: 'GLOBAL MARKETS', ic: '🌍', groups: GLOBAL_T },
    comm: { n: 'COMMODITIES', ic: '🛢', groups: [['', COMM_T]] },
    fx: { n: 'CURRENCIES', ic: '💱', sub: 'vs rupee & dollar', groups: [['', FX_T]] },
    bond: { n: 'BONDS & YIELDS', ic: '🏦', groups: [['INDIA', BOND_T.slice(0, 1)], ['GLOBAL 10-YEAR', BOND_T.slice(1, 4)], ['UNITED STATES', BOND_T.slice(4)]] },
  };
  const catItems = (k) => CATS[k].groups.reduce((a, g) => a.concat(g[1]), []);
  function catButtons(ms) {
    const w = wantNow(ms), live = { global: ['jp', 'kr', 'cn', 'hk', 'uk', 'de', 'fr', 'us'].some((k) => w.open[k]), comm: w.fut, fx: w.fut, bond: w.open.us };
    return '<div class="jd-cats">' + Object.keys(CATS).map((k) => {
      const C = CATS[k], arr = catItems(k).map((it) => { const x = quoteOf(it); if (!x || x.p == null || x.pc == null || !x.pc) return null; const pct = it.yld ? (x.p - x.pc) * 100 : (x.p / x.pc - 1) * 100; return { n: it.n, v: pct, yld: !!it.yld }; }).filter(Boolean);
      const up = arr.filter((a) => a.v > 0.005).length, dn = arr.filter((a) => a.v < -0.005).length, good = k === 'bond' ? 0 : up - dn, tn = good > 0 ? 'up' : good < 0 ? 'dn' : 'fl';
      const best = arr.length ? arr.reduce((a, b) => b.v > a.v ? b : a) : null, worst = arr.length ? arr.reduce((a, b) => b.v < a.v ? b : a) : null, fv = (a) => a.yld ? (a.v >= 0 ? '+' : '') + a.v.toFixed(1) + 'bp' : (a.v >= 0 ? '+' : '') + a.v.toFixed(2) + '%', sh = (n) => esc(n.replace(/ (YIELD|10Y.*)$/, '').slice(0, 15));
      return `<button type="button" class="jd-cat ${tn}" data-cat="${k}"><span class="jd-cat-h"><span class="jd-cat-i">${C.ic}</span><span class="jd-cat-t">${C.n}</span>${k === 'bond' ? '' : `<span class="jd-cat-l ${live[k] ? 'on' : ''}">${live[k] ? '● LIVE' : 'CLOSED'}</span>`}</span>`
        + `<span class="jd-cat-s">${arr.length ? `<b class="u">${up} ▲</b> <b class="d">${dn} ▼</b>` : '…'}</span><span class="jd-cat-b">${best ? `<span>Best <b>${sh(best.n)}</b> ${fv(best)}</span><span>Weakest <b>${sh(worst.n)}</b> ${fv(worst)}</span>` : ''}</span><span class="jd-cat-o">Tap for details ›</span></button>`;
    }).join('') + '</div>';
  }
  async function histMany(keys) {
    const q = keys.slice(); await Promise.all(Array.from({ length: 5 }, async () => { while (q.length) { await histOne(q.shift()); } }));
  }
  function openCat(k) { S.pop = { t: 'cat', k }; renderPop(); histMany(catItems(k).filter((it) => !it.cn).map((it) => it.k)); }
  function catRow(it) {
    const x = quoteOf(it), fl = it.fc ? flag(it.fc) : '', nm = it.cn ? `<span class="n">${fl}${esc(it.n)}</span>` : `<span class="n lnk" data-xr="${esc(it.k)}" title="Open the X-ray report">${fl}${esc(it.n)}</span>`;
    if (!x || x.p == null) return `<div class="jd-ir">${nm}<span class="l">…</span></div>`;
    const dp = it.dp != null ? it.dp : it.yld ? 3 : dpOf(x.p), chg = x.pc != null ? x.p - x.pc : null, pct = x.pc ? chg / x.pc * 100 : null, dir = chg == null || Math.abs(pct) < 0.005 ? 0 : chg > 0 ? 1 : -1, good = it.yld ? -dir : dir;
    const A = it.cn ? null : ana(it.k, x.p), loading = !it.cn && !A && !(S.h[it.k] && S.h[it.k].err);
    const ch = (v) => v == null ? '<span class="jd-tr n">–</span>' : `<span class="jd-tr ${tcol(v)}">${v > 0 ? '▲' : v < 0 ? '▼' : '■'}</span>`;
    const trend = A ? `<span class="jd-trs" title="Short (20-day) · Medium (50-day) · Long (200-day)">${ch(A.T.s)}${ch(A.T.m)}${ch(A.T.l)}</span>` : `<span class="jd-trs na">${it.cn ? 'n/a' : loading ? '…' : '–'}</span>`;
    const bias = A ? `<span class="jd-pbias sm ${A.bias[1]}" title="${esc(A.sig.map((s) => s[0]).join(' · '))}">${A.bias[0].replace(' BIAS', '').replace(' / MIXED', '')}</span>` : '<span class="jd-pbias sm"></span>';
    return `<div class="jd-ir ${good > 0 ? 'u' : good < 0 ? 'd' : ''}">${nm}<span class="l">${fmtN(x.p, dp)}${it.yld ? '<u>%</u>' : ''}</span><span class="c">${chg == null ? '' : it.yld ? (chg >= 0 ? '+' : '') + (chg * 100).toFixed(1) + ' bp' : (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'}</span>${trend}${bias}<span class="a">${it.cn ? '' : `<button type="button" class="jd-mvb" data-xr="${esc(it.k)}">X-ray</button>`}<button type="button" class="jd-mvb" data-pop="${esc(it.k)}">Signals</button></span></div>`;
  }
  function catPopHTML(P) {
    const C = CATS[P.k], hdr = '<div class="jd-ir jd-irh"><span class="n">Instrument</span><span class="l">Last</span><span class="c">Change</span><span class="jd-trs">Trend S·M·L</span><span>Bias</span><span class="a"></span></div>';
    const body = C.groups.map((g) => (g[0] ? `<div class="jd-isub">${esc(g[0])}</div>` : '') + g[1].map(catRow).join('')).join('');
    return `<div class="jd-pm-h"><div class="jd-pm-t"><b>${C.ic} ${C.n}</b><small>${C.sub || 'tap a name for its X-ray report'}</small></div><div class="jd-pm-bt"><button type="button" class="jd-mvb" data-popx="1" title="Close (Esc)">✕</button></div></div><div class="jd-pm-b">${hdr}${body}<div class="jd-fn">Trend arrows: Short = price vs 20-day average, Medium = 50-day, Long = 200-day (▲ rising above it, ▼ falling below, ■ flat). Bias combines trend, RSI, MACD, breakouts and 52-week position — mechanical, from delayed daily data, not advice. Tap a name or X-ray for the full report; “Signals” shows levels and a chart.${CATS[P.k] === CATS.bond ? ' Japan, UK, Germany and India 10Y come from the CNBC quote feed and have no free price history, so no trend is shown for them.' : ''}</div></div>`;
  }
  const CSS6 = `
  .jd-board{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,.95fr)!important;grid-template-areas:"a m r" "n n n"!important;align-items:stretch!important}
  .jd-c1{grid-area:a}.jd-c2{grid-area:m}.jd-c3{grid-area:r}.jd-newsrow{grid-area:n;min-width:0}.jd-c2>.jd-heat{flex:1}.jd-c3{display:flex;flex-direction:column;gap:10px}
  .jd-newsrow .jd-nlist{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px 18px;max-height:300px;overflow:auto}.jd-newsrow .jd-newsc{display:block}
  @media(max-width:1280px){.jd-board{grid-template-columns:1fr 1fr!important;grid-template-areas:"a m" "r r" "n n"!important}.jd-newsrow .jd-nlist{grid-template-columns:1fr 1fr}}
  @media(max-width:700px){.jd-board{grid-template-columns:1fr!important;grid-template-areas:"m" "a" "r" "n"!important}.jd-newsrow .jd-nlist{grid-template-columns:1fr}}
  .jd-cats{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:minmax(104px,1fr);gap:10px;perspective:900px}
  .jd-cat{position:relative;overflow:hidden;isolation:isolate;text-align:left;font:inherit;color:#eef3ff;cursor:pointer;border-radius:15px;padding:10px 12px;display:flex;flex-direction:column;gap:3px;
    background:linear-gradient(150deg,#27345c 0%,#111a37 52%,#070b1a 100%);border:1px solid rgba(190,205,255,.3);
    box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 -8px 14px rgba(0,0,0,.45) inset,0 6px 0 -2px #0a1128,0 7px 0 -2px rgba(150,170,230,.25),0 16px 18px -10px rgba(5,12,40,.75);transition:transform .15s,box-shadow .15s}
  .jd-cat:hover{transform:translateY(-3px);box-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 -8px 14px rgba(0,0,0,.45) inset,0 6px 0 -2px #0a1128,0 7px 0 -2px rgba(150,170,230,.3),0 24px 24px -10px rgba(5,12,40,.85)}
  .jd-cat::before{content:'';position:absolute;inset:-30%;z-index:-1;filter:blur(13px);animation:j3smoke 11s ease-in-out infinite alternate;background:radial-gradient(38% 34% at 16% 85%,var(--g1),transparent 70%),radial-gradient(34% 30% at 88% 22%,rgba(150,175,255,.32),transparent 70%),radial-gradient(40% 28% at 55% 55%,rgba(255,255,255,.09),transparent 72%)}
  .jd-cat::after{content:'';position:absolute;left:0;right:0;top:0;height:46%;z-index:0;pointer-events:none;border-radius:15px 15px 55% 55%/15px 15px 24px 24px;background:linear-gradient(180deg,rgba(255,255,255,.32),rgba(255,255,255,.1) 48%,rgba(255,255,255,0))}
  .jd-cat>*{position:relative;z-index:1}.jd-cat.up{--g1:rgba(30,214,120,.5);border-color:rgba(66,240,160,.55)}.jd-cat.dn{--g1:rgba(255,70,95,.48);border-color:rgba(255,122,142,.55)}.jd-cat.fl{--g1:rgba(120,150,255,.38)}
  .jd-cat-h{display:flex;align-items:center;gap:6px}.jd-cat-i{font-size:18px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}.jd-cat-t{font-size:11px;font-weight:900;letter-spacing:.09em;text-shadow:0 1px 2px rgba(0,0,0,.6)}
  .jd-cat-l{margin-left:auto;font-size:8.5px;font-weight:800;letter-spacing:.06em;padding:1px 6px;border-radius:99px;background:rgba(0,0,0,.4);color:#aab6d8}.jd-cat-l.on{color:#42f0a0}
  .jd-cat-s{font:900 19px ui-monospace,Consolas,monospace;display:flex;gap:10px;text-shadow:0 2px 5px rgba(0,0,0,.55)}.jd-cat-s b.u{color:#42f0a0}.jd-cat-s b.d{color:#ff8a9b}
  .jd-cat-b{display:flex;flex-direction:column;gap:1px;font-size:9.5px;color:#cfd9f7;text-shadow:0 1px 2px rgba(0,0,0,.5)}.jd-cat-b b{color:#fff}.jd-cat-o{margin-top:auto;font-size:9px;font-weight:800;letter-spacing:.06em;color:#9fb0e0}
  .jd-ir{display:grid;grid-template-columns:minmax(120px,1.5fr) 1fr 1fr 78px 82px auto;gap:8px;align-items:center;padding:5px 8px;margin-bottom:3px;border-radius:8px;background:#f5f7fc;font-size:12px}.jd-ir:hover{background:#e9effb}
  .jd-ir .n{display:flex;align-items:center;gap:6px;font-weight:800;color:#14213d;min-width:0}.jd-ir .n .jd-flag{width:20px;height:13px;flex:none}.jd-ir .n.lnk{cursor:pointer;text-decoration:underline dotted #9fb0d8;text-underline-offset:3px}
  .jd-ir .l{text-align:right;font:800 12.5px ui-monospace,Consolas,monospace;color:#0b2260}.jd-ir .l u{text-decoration:none;font-size:9px;opacity:.7}.jd-ir .c{text-align:right;font:800 12px ui-monospace,Consolas,monospace}.jd-ir.u .c{color:#0c7a42}.jd-ir.d .c{color:#b3162f}
  .jd-ir.u{box-shadow:inset 4px 0 #12a05a}.jd-ir.d{box-shadow:inset 4px 0 #c0102e}.jd-ir .a{display:flex;gap:4px;justify-content:flex-end}
  .jd-trs{display:flex;gap:4px;justify-content:center}.jd-trs.na{color:#9aa6c2;font-size:10px}.jd-tr{width:20px;height:18px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;background:#e6ebf7;color:#52607f}.jd-tr.g{background:#d6f3e3;color:#0c7a42}.jd-tr.r{background:#fbdce2;color:#b3162f}.jd-tr.a{background:#fff0c7;color:#8a5a00}
  .jd-pbias.sm{margin:0;padding:2px 8px;font-size:9px;text-align:center}.jd-irh{background:none!important;box-shadow:none!important;font-size:9.5px;font-weight:800;letter-spacing:.06em;color:#7b88a6;padding-bottom:0}.jd-irh span{font:800 9.5px "Segoe UI",sans-serif!important;color:#7b88a6!important;text-align:inherit}.jd-irh .l,.jd-irh .c{text-align:right}
  .jd-isub{margin:10px 0 4px;font-size:9.5px;font-weight:800;letter-spacing:.14em;color:#52607f;border-bottom:1px solid #dfe7f6;padding-bottom:3px}
  @media(max-width:700px){#viewSel{max-width:calc(100vw - 100px)}.jd-ir{grid-template-columns:1fr 1fr 1fr}.jd-ir .jd-trs,.jd-ir .jd-pbias{display:none}.jd-ir .a{grid-column:1 / -1}.jd-irh{display:none}.jd-cats{grid-template-columns:1fr 1fr}}`;
  /* ---------- wiring ---------- */

  const CSS7 = `
  .jd-btn.busy{opacity:.7;cursor:progress}
  .jd-mtrack{gap:0!important}.jd-mtrack i{background:transparent!important;border-right:1px solid rgba(255,255,255,.45)}.jd-mtrack i:last-child{border-right:0}
  .jd-bias{position:relative;z-index:1;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:132px;padding:7px 12px 8px;border-radius:16px;background:linear-gradient(160deg,rgba(255,255,255,.13),rgba(255,255,255,.03) 55%,rgba(0,0,0,.18));border:1px solid color-mix(in srgb,var(--bc) 55%,#fff 15%);box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 -8px 14px rgba(0,0,0,.35) inset,0 0 22px -4px var(--bc),0 8px 0 -3px rgba(0,0,0,.35);transition:box-shadow .6s,border-color .6s,transform .15s;-webkit-tap-highlight-color:transparent}
  .jd-bias:hover{transform:translateY(-2px)}.jd-bias:focus-visible{outline:2px solid #e4c97a;outline-offset:2px}
  .jd-bias small{font-size:9.5px;font-weight:800;letter-spacing:.14em;opacity:.85}
  .jd-imap{display:block;height:116px;width:auto;overflow:visible;filter:drop-shadow(0 0 9px var(--bc)) drop-shadow(0 3px 3px rgba(0,0,0,.45));animation:jdMapGlow 3.2s ease-in-out infinite}
  .jd-imap .mp{fill:var(--bc);transition:fill 1.4s ease}
  .jd-bias b{font-size:13.5px;letter-spacing:.04em;color:#fff;text-shadow:0 0 10px var(--bc);text-align:center;line-height:1.15}
  .jd-bias span{font-size:10px;opacity:.8;text-align:center}
  @keyframes jdMapGlow{0%,100%{filter:drop-shadow(0 0 6px var(--bc)) drop-shadow(0 3px 3px rgba(0,0,0,.45))}50%{filter:drop-shadow(0 0 14px var(--bc)) drop-shadow(0 3px 3px rgba(0,0,0,.45))}}
  @media(prefers-reduced-motion:reduce){.jd-imap{animation:none}}
  .jd-hero{grid-template-columns:auto auto minmax(0,1fr) 270px}
  @media(max-width:1180px){.jd-hero{grid-template-columns:auto auto minmax(0,1fr)}}
  @media(max-width:900px){.jd-hero{grid-template-columns:1fr}.jd-bias{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:4px 12px;width:min(320px,100%);margin:0 auto;box-sizing:border-box;padding:7px 14px}.jd-bias small{flex:0 0 100%;text-align:center}.jd-imap{height:84px}.jd-bias b,.jd-bias span{flex:0 1 auto;text-align:left}}
  .jd-bs{position:relative;display:block;width:100%;min-width:104px;height:7px;border-radius:5px;margin-top:3px;box-shadow:0 0 0 1px rgba(255,255,255,.35) inset,0 1px 3px rgba(0,0,0,.4)}.jd-bs u{position:absolute;top:-3px;width:3px;height:13px;margin-left:-1.5px;border-radius:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.55),0 0 6px #fff;transition:left 1s ease}
  .jd-bpb .jd-bs{margin-top:7px;min-width:140px}
  .jd-bpop{display:flex;gap:12px;align-items:stretch;flex-wrap:wrap;margin-bottom:10px}.jd-bpb{border-radius:12px;padding:10px 18px;text-align:center;color:#fff;min-width:150px}.jd-bpb i{display:block;font-style:normal;font-size:10px;letter-spacing:1px;opacity:.9}.jd-bpb b{display:block;font-size:19px}.jd-bpb span{font-size:11px;opacity:.95}
  .jd-bpt{flex:1;min-width:220px;background:#fff7e0;border:1px solid #f0d58a;border-radius:10px;padding:9px 12px;line-height:1.5;color:#3a2e00;font-size:13px}
  .jd-bph{margin:14px 0 4px;font-size:14px}.jd-bph small{font-weight:400;color:#7b88a6;font-size:11px}.jd-bpm{margin:0 0 6px;font-size:12.5px;line-height:1.5}
  .jd-bpx{width:100%;border-collapse:collapse;font-size:12.5px}.jd-bpx th{text-align:left;font-size:10.5px;letter-spacing:.06em;color:#7b88a6;padding:5px 6px;border-bottom:1px solid #dfe5f2}.jd-bpx td{padding:6px;border-bottom:1px solid #eef1f7;vertical-align:top}
  @media(prefers-color-scheme:dark){.jd-bpt{background:#2a2410;border-color:#6b5a1c;color:#f3e3a4}.jd-bpx td{border-color:#26304a}.jd-bpx th{border-color:#26304a}}`;
  function build() {
    if ($('pDash')) return;
    const st = document.createElement('style'); st.id = 'jdcss'; st.textContent = CSS; document.head.appendChild(st); const st3 = document.createElement('style'); st3.id = 'jdcss3'; st3.textContent = CSS3; document.head.appendChild(st3); const st4 = document.createElement('style'); st4.id = 'jdcss4'; st4.textContent = CSS4; document.head.appendChild(st4); const st5 = document.createElement('style'); st5.id = 'jdcss5'; st5.textContent = CSS5; document.head.appendChild(st5); const st6 = document.createElement('style'); st6.id = 'jdcss6'; st6.textContent = CSS6; document.head.appendChild(st6); const st7 = document.createElement('style'); st7.id = 'jdcss7'; st7.textContent = CSS7; document.head.appendChild(st7); if (!$('jdPop')) { const pm = document.createElement('div'); pm.id = 'jdPop'; pm.className = 'jd-pop'; pm.hidden = true; document.body.appendChild(pm); }
    const anchor = document.querySelector('details.datasec'); const p = document.createElement('div'); p.className = 'panel'; p.id = 'pDash'; p.innerHTML = '<div class="note">Loading dashboard…</div>'; anchor.parentNode.insertBefore(p, anchor);
    const sel = $('viewSel'); const og = document.createElement('optgroup'); og.label = "Joshi's Dashboard";
    const o = document.createElement('option'); o.value = 'pDash'; o.textContent = "📊 Joshi's Dashboard — live markets"; og.appendChild(o); sel.insertBefore(og, sel.firstChild); sel.value = window.__curTab || 'pSummary';
  }
  const origShow = window.showTab;
  function biasKick() { const J = window.jcMgr; if (!J || !J.refresh || !J.state) return; const n = Date.now(); if ((S.bk && n - S.bk < 120000) || (J.state.last && n - J.state.last < 300000)) return; S.bk = n; Promise.resolve(J.refresh()).then(() => { try { paint(); } catch (e) { } }); }
  window.showTab = function (id) { origShow(id); if (id !== 'pDash' && S.pop) { S.pop = null; renderPop(); } if (id === 'pDash') { paint(); refresh(!S.last); startTimer(); biasKick(); } };
  const origPrint = window.printPDF;
  window.printPDF = function () { if ((window.__curTab || '') === 'pDash') { window.print(); return; } return origPrint.apply(this, arguments); };
  window.jdRefresh = () => { S.due = {}; S.xDue = 0; S.xNext = {}; S.newsAt = 0; S.err = ''; refresh(true); try { if (window.jcMgr && window.jcMgr.refresh) Promise.resolve(window.jcMgr.refresh()).then(() => window.jdRepaint()); } catch (e) { } try { if (window.jcCalls && window.jcCalls.ensure) window.jcCalls.ensure(() => window.jdRepaint()); } catch (e) { } };
  window.jdMan = (k, v) => setManual(k, v);
  function startTimer() {
    if (S.timer) return;
    S.timer = setInterval(() => {
      const on = (window.__curTab || '') === 'pDash' && !document.hidden; if (!on) return;
      tickClock();
      const sec = Math.floor(Date.now() / 1000);
      if (sec % 30 === 0) { biasKick(); paint(); }
      if (!S.busy && sec % 10 === 0) { const ms = Date.now(); if (SETS.some((g) => !S.due[g.id] || ms >= S.due[g.id])) refresh(false); else { extras(false); news(false); } }
    }, 1000);
  }
  document.addEventListener('click', (e) => {
    const c = (q) => e.target.closest && e.target.closest(q), hm = c('[data-hm]'); if (hm) { openIdx(hm.getAttribute('data-hm')); return; }
    const bf = c('[data-brief]'); if (bf) { S.pop = { t: 'brief', k: bf.getAttribute('data-brief') }; renderPop(); return; }
    const bz = c('[data-jdbias]'); if (bz) { S.pop = { t: 'bias' }; renderPop(); return; }
    const ct = c('[data-cat]'); if (ct) { openCat(ct.getAttribute('data-cat')); return; }
    if (c('[data-popback]') && S.pop && S.pop.back) { S.pop = S.pop.back; renderPop(); return; }
    const pp = c('[data-pop]'); if (pp) { openInst(pp.getAttribute('data-pop')); return; }
    if (c('[data-popx]') || e.target.id === 'jdPop') { S.pop = null; renderPop(); return; }
    if (c('[data-popall]') && S.pop) { S.pop.all = !S.pop.all; renderPop(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.pop) { S.pop = null; renderPop(); } const b = e.target && e.target.closest && e.target.closest('[data-jdbias]'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); S.pop = { t: 'bias' }; renderPop(); } });
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-jdgo]'); if (!a) return; e.preventDefault(); const t = $(a.getAttribute('data-jdgo')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (window.__curTab || '') === 'pDash') refresh(false); });
  function init() { build(); const h = (location.hash || '').slice(1); if (h === 'dashboard' || !h) window.showTab('pDash'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.__jdS = S; window.jdRepaint = () => { try { paint(); } catch (e) { } };
  window.__jd = { indiaState, mktDef, isOpen, moodScore };
})();
