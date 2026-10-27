/* Joshi's Corner — Today's Outlook (client view). Gold-framed day outlook built from the MORNING SCHEDULED REPORTS (reports/<id>/…json written by pipeline/auto_reports.py),
   today's calls (data/calls/latest.json) and the stock board (data/calls/board.json). Frames:
   1 Outlook for the day · 2 World / commodities / currency / bonds · 3 Important news · 4 Intraday & investment calls · 5 Watchlist Buy / Sell / Avoid pop-ups
   then a scrip search that opens the X-ray first and offers the Intraday, Short term and Long term reports.
   Everything is computed from published files and delayed data; no client names or lists are stored here (the watchlist is read from this browser, as elsewhere).
   Rule-based research information — not investment advice, not a guaranteed outcome. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v, d) => (num(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '—');
  const CL = !!document.getElementById('toasts') && !document.getElementById('viewSel'), BASE = CL ? '../' : '', EMB = /[?&]embed=1/.test(location.search);
  const O = { rep: {}, calls: null, board: null, listId: null, loaded: false, busy: false, sym: '', err: '' };
  const IDS = { brief: 'morning-brief', det: 'morning-detailed', news: 'premarket-news', mkt: 'evening-market-wrap', enews: 'evening-news-wrap' };
  const pf = (s) => { const v = parseFloat(String(s).replace(/[,%+]/g, '')); return isFinite(v) ? v : null; };
  const frmClose = () => { const m = document.getElementById('olFrm'); if (m) { m.className = ''; m.innerHTML = ''; } document.body.style.overflow = ''; };
  const xrClose = () => { O.progClose = true; try { const b = [...document.querySelectorAll('#jcxr button')].find((x) => /Close/.test(x.innerText)); if (b) b.click(); } catch (e) { } O.progClose = false; O.xrLayer = false; };
  const openX = (sym, viaPop) => {
    const lay = (f) => (viaPop ? swapLayer(f) : pushLayer(f));
    if (!CL) { if (window.jcXray) { window.jcXray(sym); O.xrLayer = true; lay(xrClose); } return; }
    let m = document.getElementById('olFrm'); if (!m) { m = document.createElement('div'); m.id = 'olFrm'; document.body.appendChild(m); }
    m.innerHTML = '<div class="olFh"><b>' + E(clean(sym)) + ' · X-ray &amp; reports</b><button class="olClose" data-closefrm="1">← Back</button></div><iframe title="X-ray" src="../?embed=1&sym=' + encodeURIComponent(clean(sym)) + '&go=xray"></iframe>'; m.className = 'on'; document.body.style.overflow = 'hidden'; lay(frmClose);
  };

  const clean = (s) => String(s || '').replace(/\.(NS|BO)$/i, '').toUpperCase();

  async function jget(url) { const r = await fetch(BASE + url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
  async function loadRep(key) {
    try {
      const ix = await jget('reports/' + IDS[key] + '/index.json'), runs = ix.runs || [];
      const run = runs.find((r) => r.status === 'ok' && (r.files || []).some((f) => f.type === 'json'));
      const hol = runs[0] && runs[0].status === 'holiday' ? runs[0] : null;
      if (!run) return { holiday: hol };
      const f = run.files.find((x) => x.type === 'json'), pdf = run.files.find((x) => x.type === 'pdf');
      const cfg = await jget(f.path);
      return { cfg, date: run.date, at: run.generated_at, pdf: pdf && BASE + pdf.path, holiday: hol };
    } catch (e) { return null; }
  }
  const sec = (rep, re) => ((rep && rep.cfg && rep.cfg.sections) || []).filter((s) => re.test(s.heading));
  const tabs = (rep, re) => sec(rep, re).flatMap((s) => s.blocks.filter((b) => b.type === 'table').map((b) => b.rows));
  const bul = (rep, re) => sec(rep, re).flatMap((s) => s.blocks.filter((b) => b.type === 'bullets').flatMap((b) => b.items));
  const para = (rep, re) => sec(rep, re).flatMap((s) => s.blocks.filter((b) => b.type === 'paragraph').map((b) => b.text)).join(' ');
  const pick = (rows, nm) => (rows || []).find((r) => r[0].toLowerCase().indexOf(nm.toLowerCase()) === 0);
  const arrow = (p) => (p == null ? '' : p > 0 ? '<b class="up">▲</b>' : p < 0 ? '<b class="dn">▼</b>' : '■');

  /* ---------- market mood (same weights as the Joshi's Dashboard header) + India map ---------- */
  const IMAP = { w: 89.1, d: "M33.0 12.4L33.5 12.7L34.6 12.9L34.3 13.3L34.4 13.6L34.2 13.7L35.1 14.6L34.6 15.2L34.2 15.0L33.6 15.4L33.4 15.7L33.1 15.8L32.5 15.4L32.4 14.9L31.4 15.2L31.6 16.2L32.5 17.1L32.2 17.7L32.7 18.2L32.3 18.5L32.5 18.7L32.5 19.2L33.0 19.3L33.4 18.7L33.6 18.8L34.4 20.1L35.0 20.4L35.8 20.3L36.9 21.1L36.8 21.6L38.0 22.0L39.3 22.8L38.9 22.8L37.4 24.2L37.4 24.7L36.9 25.4L37.0 26.1L36.6 26.4L36.4 27.2L37.2 27.9L37.7 28.1L37.7 27.8L37.9 27.8L39.0 28.5L39.8 28.8L40.2 29.5L40.5 29.4L41.8 30.5L42.4 30.3L43.5 31.0L44.3 31.0L44.6 31.6L45.7 31.8L46.2 32.1L46.5 31.7L47.9 32.1L47.8 31.8L48.7 31.6L49.2 32.0L50.2 32.2L50.3 33.1L50.8 33.2L52.2 34.1L53.2 33.7L53.8 34.6L54.4 34.4L55.2 34.5L56.5 35.1L57.5 34.6L57.7 35.2L58.3 35.4L58.6 35.1L59.2 35.3L60.0 35.0L60.4 35.3L60.9 34.1L60.3 32.9L60.5 31.6L60.9 30.7L60.7 30.2L62.2 29.6L62.8 29.9L63.0 30.4L62.6 31.5L63.1 32.2L62.6 32.7L62.9 32.9L63.0 33.4L63.1 33.3L63.7 33.8L64.5 33.7L65.2 33.9L65.3 34.2L65.9 34.2L66.8 34.0L67.5 33.6L68.6 34.0L70.4 34.0L70.7 33.6L71.0 33.9L72.0 33.7L72.1 33.9L72.2 33.6L72.7 33.6L72.4 32.8L72.8 32.3L72.4 31.7L71.7 31.7L71.3 31.5L71.4 30.7L71.2 30.5L72.3 30.9L73.2 30.4L73.4 30.7L73.7 30.4L74.2 30.5L74.7 30.0L74.4 29.8L74.5 29.5L76.1 28.9L76.1 28.6L76.5 28.0L76.9 27.8L78.3 27.7L78.5 27.2L79.6 26.6L79.4 26.2L80.3 25.7L80.9 26.2L82.7 26.6L83.0 26.5L83.2 25.9L83.7 26.0L83.9 25.6L85.0 25.5L85.3 25.9L85.6 25.8L85.6 26.1L85.1 26.4L85.2 26.9L85.7 26.6L85.9 26.7L86.4 27.7L86.1 27.7L85.5 28.6L85.7 28.7L86.7 28.5L87.5 28.9L87.9 28.8L88.6 29.3L88.5 29.7L88.7 30.0L88.6 30.3L88.3 30.3L87.2 31.3L87.2 31.8L87.9 32.9L87.2 32.7L86.7 32.0L85.0 32.4L82.8 34.2L81.9 34.5L81.7 34.9L81.7 35.5L82.0 36.3L81.5 36.7L81.6 37.3L80.4 38.5L80.2 39.1L80.6 39.3L80.7 39.7L79.4 41.9L78.9 43.5L77.7 43.0L76.9 43.1L76.6 42.7L76.4 42.8L76.8 44.0L76.6 45.8L76.3 46.2L75.9 46.2L76.0 46.6L75.7 47.3L76.0 48.7L75.9 48.9L75.6 48.9L75.4 49.5L75.2 49.5L75.1 49.7L74.5 49.0L74.2 49.6L74.0 47.2L73.6 46.5L73.3 44.0L73.1 44.1L72.9 43.9L72.5 44.2L72.2 43.9L72.3 44.6L71.7 45.4L71.9 46.0L71.2 46.4L70.7 45.4L70.6 46.0L70.4 45.9L70.3 45.1L69.9 44.2L70.1 43.3L70.6 42.7L71.2 42.7L71.4 42.3L71.6 42.5L71.7 42.2L72.1 42.5L72.2 41.9L72.8 41.7L73.2 40.1L73.6 40.3L73.9 40.0L72.6 39.1L71.4 39.3L70.2 39.1L67.5 39.3L65.9 38.8L65.9 36.5L65.4 35.8L65.1 36.0L65.3 36.2L65.1 36.6L64.4 36.5L63.8 36.0L63.6 35.2L63.2 35.1L63.1 35.2L63.5 35.7L62.4 35.6L62.6 35.4L62.4 35.1L61.6 34.7L61.6 34.5L61.4 35.0L61.8 35.0L61.9 35.3L60.9 36.0L60.7 37.0L61.2 37.2L62.0 38.1L62.7 38.1L62.9 38.7L63.4 38.8L63.2 39.2L61.7 39.1L61.4 40.1L61.0 39.9L60.7 40.0L60.8 40.2L60.5 40.9L60.7 41.4L61.8 42.0L62.6 42.1L62.5 42.5L62.6 43.2L62.1 43.5L62.0 44.1L62.6 44.7L62.7 44.7L62.5 45.4L63.3 45.6L62.9 46.3L63.3 46.7L63.2 47.7L63.7 49.0L63.6 49.7L63.1 49.6L63.5 50.0L63.7 50.8L63.1 50.6L63.0 50.3L63.0 50.7L62.8 50.7L62.9 50.5L62.8 50.9L62.5 50.9L62.5 50.0L62.7 49.5L62.5 49.3L62.7 49.1L62.5 49.2L62.5 49.7L62.3 49.7L62.4 48.8L62.1 51.0L61.9 51.0L61.9 49.7L61.8 50.7L61.6 50.8L61.4 50.4L61.3 50.8L61.2 50.2L61.3 50.9L61.2 51.0L60.8 49.6L61.1 49.3L61.0 49.0L60.4 48.7L60.1 48.1L60.3 48.7L60.8 48.9L60.9 49.2L59.9 50.4L58.0 51.0L57.1 51.7L56.9 52.5L57.3 53.4L57.0 53.5L57.3 53.6L57.2 53.8L57.5 53.8L56.6 54.4L56.5 54.8L56.8 54.7L56.5 55.1L56.6 55.0L55.9 55.4L55.6 56.0L54.8 55.6L55.5 56.1L55.2 56.3L52.8 57.1L52.6 57.0L53.1 56.9L53.1 56.4L52.7 56.4L52.2 56.7L51.7 57.7L52.0 57.5L52.1 57.1L52.5 57.0L52.5 57.3L52.2 57.3L52.3 57.4L53.1 57.0L51.9 57.7L50.7 58.9L50.6 58.8L50.6 59.2L49.6 60.5L49.1 60.8L49.4 60.7L48.7 61.6L46.7 62.8L46.3 63.5L46.0 63.5L46.2 63.6L45.9 63.7L46.0 63.9L43.4 65.4L43.0 66.0L43.2 66.3L43.4 66.1L43.2 67.2L41.6 68.0L40.5 67.8L40.0 68.0L39.7 69.2L39.3 69.6L39.3 69.8L39.0 69.5L38.9 69.0L38.7 70.0L38.6 69.4L38.3 69.4L37.1 70.0L36.4 72.0L36.7 73.7L36.8 73.7L36.8 74.4L36.4 74.9L36.7 74.8L37.2 77.4L36.7 76.5L36.7 76.8L36.5 76.6L36.4 76.8L36.6 77.2L37.2 77.4L37.2 78.2L36.8 80.3L35.8 82.0L35.5 83.5L35.7 84.1L35.3 84.4L35.7 84.2L35.8 87.6L35.1 87.5L35.5 87.8L34.9 87.6L35.0 87.5L34.1 87.8L33.9 88.1L34.1 88.5L33.2 89.7L33.0 90.3L33.4 90.9L34.3 90.8L34.6 91.3L34.1 91.0L33.2 91.0L31.4 91.5L30.8 92.3L30.7 92.7L30.9 92.6L30.5 93.0L30.6 93.5L30.4 93.9L28.9 94.8L28.1 94.7L27.2 93.9L25.8 92.1L26.2 91.8L25.7 92.0L25.1 90.3L24.9 88.8L25.2 89.6L25.1 89.1L25.2 89.2L25.2 90.2L25.7 90.1L25.4 90.0L25.4 89.1L24.9 88.3L24.9 88.6L24.7 88.3L24.9 87.8L24.6 87.9L23.4 84.1L22.1 82.3L22.3 82.3L22.3 82.2L22.1 82.2L22.1 81.9L22.0 82.2L21.7 82.0L20.6 79.4L21.0 79.2L20.6 79.3L20.2 77.6L20.1 76.8L20.3 76.7L20.2 76.5L20.1 76.7L19.6 75.5L19.4 74.8L19.7 74.8L19.4 74.6L19.2 73.9L19.4 74.0L19.2 73.7L19.0 73.9L19.1 73.6L19.0 73.6L18.9 73.2L18.4 73.0L18.8 72.7L18.5 72.8L17.9 72.1L18.0 71.8L17.8 71.2L17.5 71.0L18.0 71.1L17.5 70.9L17.7 70.6L17.4 70.6L17.3 70.4L17.6 70.2L17.3 70.3L17.1 69.9L16.5 68.9L16.6 68.4L16.5 68.7L16.0 67.4L16.2 67.4L16.1 67.1L16.2 67.1L16.0 67.0L15.7 64.8L15.9 64.9L15.5 64.0L15.7 63.9L15.5 63.8L15.1 62.5L15.2 62.3L15.1 62.3L14.9 61.8L14.9 61.6L15.3 61.9L15.3 61.7L14.8 61.4L14.8 60.8L15.1 61.0L14.7 60.3L14.9 59.8L15.1 60.2L15.0 59.7L14.8 59.6L15.3 59.2L15.1 59.3L15.0 58.8L14.6 59.6L14.4 59.5L14.6 59.1L14.5 58.3L15.0 58.3L15.3 58.6L14.4 58.0L14.4 57.7L14.7 57.5L14.3 57.5L14.3 56.7L14.1 56.9L14.0 56.5L14.9 53.6L14.8 53.2L14.6 53.3L14.8 52.8L14.4 52.7L14.6 52.6L14.5 52.3L14.2 52.5L14.2 52.2L13.9 52.4L14.3 52.1L13.9 51.9L13.9 51.7L14.0 51.6L13.8 51.5L14.3 51.3L13.8 51.4L14.6 50.7L15.5 50.3L13.7 50.6L13.8 50.0L14.3 49.5L13.7 49.8L13.6 49.6L13.8 48.9L14.3 49.0L14.9 48.6L13.8 48.6L13.5 48.8L13.3 48.7L13.3 48.3L13.1 48.7L12.5 48.6L13.0 48.8L13.0 49.3L12.6 49.6L12.4 49.5L12.4 49.7L12.2 49.7L12.6 49.8L12.6 50.0L12.3 49.8L12.4 50.0L12.1 50.0L12.1 50.2L12.6 50.2L13.0 50.7L12.4 51.7L12.4 52.1L9.5 53.5L8.3 53.7L6.2 52.3L2.9 48.6L3.2 47.9L3.2 48.2L3.6 48.2L3.7 48.6L4.5 48.4L4.6 48.1L4.9 48.4L5.2 47.9L5.4 48.1L6.0 47.7L6.6 47.7L7.2 46.6L7.6 46.3L7.6 45.9L7.2 46.0L7.2 46.4L6.4 46.3L6.4 46.5L5.5 46.7L5.2 47.1L4.8 47.0L2.6 46.2L2.0 45.7L1.9 45.4L1.7 45.4L1.8 45.2L1.6 44.9L1.3 44.8L1.5 44.6L1.3 44.5L1.2 44.6L1.2 44.2L1.5 44.2L1.4 44.1L2.5 43.4L1.3 43.9L1.0 44.3L0.4 44.3L0.8 44.1L0.5 43.8L0.8 43.2L2.2 43.1L2.3 41.9L2.5 42.2L2.7 42.0L2.9 42.2L4.7 42.1L5.2 42.4L6.0 42.5L6.3 42.0L7.3 41.7L7.7 41.6L7.8 42.1L8.3 42.2L9.3 41.7L9.0 41.5L8.9 41.1L9.3 40.8L8.6 39.2L8.0 38.4L8.0 37.5L6.8 37.4L6.2 36.5L6.5 34.8L5.5 34.6L4.5 34.1L4.6 32.8L7.1 29.9L7.7 29.9L8.2 30.8L8.6 30.9L11.7 30.1L11.8 29.5L12.5 28.8L13.2 27.5L14.9 26.6L15.8 25.0L16.2 23.7L18.0 22.8L17.7 22.2L18.3 21.7L19.1 20.5L20.1 19.9L19.7 19.6L20.0 18.7L19.6 17.9L19.8 17.5L20.6 16.9L22.0 16.5L22.2 16.1L21.2 15.4L20.2 15.4L20.0 15.0L20.1 14.2L19.9 14.5L19.2 14.4L17.9 13.6L17.5 13.6L17.0 13.3L16.8 12.4L17.0 11.9L16.8 11.6L16.9 10.7L16.3 9.2L16.4 8.7L17.0 8.6L17.3 7.9L18.2 7.6L18.5 6.8L17.3 6.5L17.2 6.0L17.4 5.5L16.0 5.2L15.5 4.8L15.6 4.5L15.4 4.3L14.5 4.4L13.6 4.2L13.9 3.9L13.7 3.6L13.9 3.1L15.1 2.4L15.4 1.9L15.3 1.6L16.4 1.5L17.8 1.6L17.8 1.4L17.3 1.0L18.2 1.3L20.1 0.5L20.8 1.0L21.4 0.7L22.2 0.9L22.4 1.6L23.3 1.6L24.1 2.5L26.3 3.4L26.7 4.4L28.6 5.0L28.8 5.6L30.5 5.4L31.0 4.9L32.2 4.4L33.1 4.3L33.6 4.4L34.1 4.0L35.4 4.6L36.3 4.4L36.6 5.0L37.1 5.2L37.2 5.6L36.4 8.2L35.8 8.3L35.3 8.7L35.4 9.1L34.8 9.0L34.9 9.7L34.4 10.4L32.9 10.5L33.3 11.6L32.9 11.7L33.0 12.4ZM78.3 98.3L78.2 99.0L78.0 99.2L77.8 98.6L77.6 98.4L77.5 98.3L77.5 97.8L78.0 97.6L78.3 98.3ZM77.7 97.2L77.4 97.5L77.3 97.3L77.6 96.9L77.7 97.2ZM76.8 95.3L76.9 95.5L76.6 95.5L76.6 95.4L76.4 95.3L76.5 95.1L76.8 95.3ZM77.2 95.1L77.2 95.4L77.0 95.1L77.2 95.1ZM77.1 95.0L77.0 95.1L77.1 94.9L76.9 94.9L76.9 94.6L77.1 94.4L77.1 95.0ZM15.3 94.1L15.2 94.3L15.3 94.1ZM75.9 94.3L76.0 94.4L75.8 94.4L75.7 94.2L75.8 94.0L75.9 94.3ZM77.3 93.3L77.3 93.7L77.3 93.3ZM74.9 91.1L74.9 91.5L74.7 91.4L74.6 91.2L74.8 91.0L74.9 91.1ZM74.3 86.1L74.1 86.9L73.6 86.9L73.7 86.7L73.6 86.1L73.8 85.8L74.1 85.7L74.3 86.1ZM74.5 84.0L74.6 84.1L74.4 84.2L74.3 84.0L74.4 83.7L74.6 83.9L74.5 84.0ZM73.3 83.4L73.3 83.6L73.2 83.6L73.1 83.4L73.3 83.4ZM75.6 82.2L75.7 82.4L75.4 82.2L75.4 82.1L75.5 82.0L75.6 82.2ZM75.8 81.5L75.8 81.8L75.7 81.7L75.7 81.5L75.8 81.5ZM74.7 78.9L74.6 79.5L74.5 79.3L74.5 79.0L74.7 78.9ZM75.7 77.9L75.6 78.6L75.4 78.7L75.4 78.6L75.3 78.6L75.4 78.9L75.2 78.9L75.1 79.1L75.4 79.3L75.5 80.4L75.3 80.7L75.0 80.7L75.2 81.0L75.1 81.1L75.2 81.4L74.8 81.8L74.9 82.0L74.7 82.1L74.7 82.5L74.8 82.3L74.9 82.5L74.8 83.0L74.5 83.3L74.6 83.3L74.8 83.1L74.7 83.6L74.6 83.7L74.5 83.6L74.4 83.4L74.4 83.3L74.2 83.0L74.2 82.6L74.1 82.5L74.2 82.3L74.3 82.5L74.5 81.4L74.7 81.3L74.7 81.5L74.9 81.4L74.8 81.2L74.9 81.1L74.7 80.9L74.7 80.1L74.8 79.9L74.7 79.5L74.9 79.3L75.0 78.8L75.0 77.8L75.4 77.1L75.5 76.9L75.7 77.1L75.7 77.5L75.4 77.7L75.7 77.9ZM75.6 76.7L75.5 76.7L75.6 76.7ZM17.0 88.3h.9v.9h-.9zM17.1 88.1h.9v.9h-.9zM14.0 86.8h.9v.9h-.9zM13.7 86.1h.9v.9h-.9zM17.1 85.9h.9v.9h-.9zM14.3 85.0h.9v.9h-.9zM15.1 83.7h.9v.9h-.9zM14.2 83.1h.9v.9h-.9zM12.6 85.8h.9v.9h-.9zM14.5 84.6h.9v.9h-.9z" };
  const MSTOPS = [[0, '#7d0b20'], [20, '#ee6b73'], [20.01, '#d9501a'], [40, '#f8b27a'], [40.01, '#f4a65a'], [50, '#f2c21f'], [60, '#f6dd5a'], [60.01, '#d3ed95'], [80, '#7cc43c'], [80.01, '#62d48c'], [100, '#08753a']];
  const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function moodColor(sc) { sc = Math.max(0, Math.min(100, sc)); for (let i = 1; i < MSTOPS.length; i++) { const a = MSTOPS[i - 1], b = MSTOPS[i]; if (sc <= b[0]) { const t = b[0] === a[0] ? 0 : (sc - a[0]) / (b[0] - a[0]), x = hex2(a[1]), y = hex2(b[1]); return '#' + x.map((v, k) => Math.round(v + (y[k] - v) * t).toString(16).padStart(2, '0')).join(''); } } return MSTOPS[MSTOPS.length - 1][1]; }
  const moodLab = (sc) => (sc >= 80 ? 'VERY BULLISH' : sc >= 60 ? 'BULLISH' : sc >= 40 ? 'NEUTRAL' : sc >= 20 ? 'BEARISH' : 'VERY BEARISH');
  function moodOf(k) { /* from the report's own numbers; the call book's pre-open mood wins when it is for the same day */
    const cx = O.calls && O.calls.ctx; if (k && cx && num(cx.mood) && O.calls.date === (k.R && k.R.date)) return { score: cx.mood, label: cx.moodLabel || moodLab(cx.mood), col: moodColor(cx.mood), parts: [], src: 'call book' };
    if (!k) return null; const P = [], cl = (v) => Math.max(-1, Math.min(1, v)), add = (n, v, w, t) => { if (v != null && isFinite(v)) P.push({ n, v: cl(v), w, t }); };
    const nf = pick(k.ind, 'Nifty 50'), vx = pick(k.ind, 'India VIX'), g = [...(k.g || []), ...(k.a || [])].map((r) => pf(r[2])).filter((x) => x != null);
    if (nf) add('Nifty 50', pf(nf[2]) / 1.2, 3, nf[2]); if (vx) { const vp = pf(vx[2]), lv = pf(vx[1]); add('India VIX', -vp / 8 + (lv < 13 ? 0.3 : lv > 20 ? -0.5 : 0), 1.8, vx[1]); }
    if (g.length >= 3) { const a = g.reduce((x, y) => x + y, 0) / g.length; add('Global', a / 0.9, 2, (a >= 0 ? '+' : '') + a.toFixed(2) + '% avg'); }
    const fx = pick(k.cm, 'USD/INR'), br = pick(k.cm, 'Brent'), tn = pick(k.cm, 'US 10');
    if (fx) add('Rupee', -pf(fx[2]) / 0.4, 1, pf(fx[2]) > 0 ? 'weaker' : 'firmer'); if (br) add('Crude', -pf(br[2]) / 2.5, 0.8, br[2]); if (tn) add('US yields', -(pf(tn[1]) * pf(tn[2])) / 8, 0.7, tn[1] + '%');
    const W = P.reduce((a, q) => a + q.w, 0); if (!W || P.length < 3) return null; const sc = Math.round(50 + 50 * P.reduce((a, q) => a + q.w * q.v, 0) / W);
    return { score: sc, label: moodLab(sc), col: moodColor(sc), parts: P.slice().sort((a, b) => Math.abs(b.w * b.v) - Math.abs(a.w * a.v)).slice(0, 4), src: 'report' };
  }
  const indiaSvg = (col, id) => `<svg class="olMap" viewBox="0 0 ${IMAP.w} 100" aria-label="Map of India coloured by market mood"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient></defs><path d="${IMAP.d}" fill="${col}"/><path d="${IMAP.d}" fill="url(#${id})" stroke="rgba(255,255,255,.8)" stroke-width=".35" stroke-linejoin="round"/></svg>`;
  function gaugeSvg(sc) { const a = -90 + Math.max(0, Math.min(100, sc)) * 1.8, stops = [0, 20, 40, 50, 60, 80, 100].map((v) => `<stop offset="${v}%" stop-color="${moodColor(v)}"/>`).join('');
    return `<svg class="olGauge" viewBox="0 0 200 112"><defs><linearGradient id="olGg" x1="0" x2="1">${stops}</linearGradient></defs><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#olGg)" stroke-width="16" stroke-linecap="round"/><g transform="rotate(${a} 100 100)"><path d="M100 100 L100 32" stroke="#14213d" stroke-width="3.2" stroke-linecap="round"/><circle cx="100" cy="100" r="7" fill="#14213d"/></g><text x="100" y="92" text-anchor="middle" font-size="26" font-weight="800" fill="#14213d" dy="-6">${Math.round(sc)}</text><text x="22" y="111" font-size="9" fill="#6a7694">0</text><text x="172" y="111" font-size="9" fill="#6a7694">100</text></svg>`; }
  function moodPanel(k) { const m = moodOf(k); if (!m) return ''; return `<div class="olMood" style="--mc:${m.col}"><div class="olMoodMap">${indiaSvg(m.col, 'olMg' + Math.round(Math.random() * 1e4))}<small>MARKET MOOD</small></div><div class="olMoodG">${gaugeSvg(m.score)}<b style="color:${m.col}">${E(m.label)}</b><small>${m.score} / 100 · ${m.src === 'call book' ? 'pre-open read' : 'from today’s report'}</small></div>${m.parts.length ? `<div class="olMoodD">${m.parts.map((q) => `<span><i style="background:${q.v >= 0 ? '#12894b' : '#c11d3d'};width:${Math.round(Math.abs(q.v) * 100)}%"></i>${E(q.n)} <em>${E(String(q.t))}</em></span>`).join('')}</div>` : ''}</div>`; }

  /* ---------- Back button: every pop-up / frame is a history layer, so Back closes the top layer instead of leaving the app ---------- */
  const LAY = [];
  function tgb() { try { const b = window.Telegram && Telegram.WebApp && Telegram.WebApp.BackButton; if (!b) return; if (!O.tgb) { O.tgb = 1; b.onClick(() => history.back()); } if (LAY.length) b.show(); else b.hide(); } catch (e) { } }
  function pushLayer(close) { LAY.push(close); try { history.pushState({ olLayer: LAY.length }, ''); } catch (e) { } tgb(); }
  function swapLayer(close) { if (LAY.length) { LAY[LAY.length - 1] = close; try { history.replaceState({ olLayer: LAY.length }, ''); } catch (e) { } } else pushLayer(close); }
  function popLayer() { if (!LAY.length) return false; try { history.back(); } catch (e) { const f = LAY.pop(); try { f(); } catch (x) { } tgb(); } return true; }
  window.addEventListener('popstate', () => { if (LAY.length) { const f = LAY.pop(); try { f(); } catch (e) { } tgb(); } });
  const cls = (p) => (p > 0 ? 'up' : p < 0 ? 'dn' : '');

  async function loadAll() {
    if (O.busy) return; O.busy = true;
    const [brief, det, news, mkt, enews, calls, board] = await Promise.all([loadRep('brief'), loadRep('det'), loadRep('news'), loadRep('mkt'), loadRep('enews'), jget('data/calls/latest.json').catch(() => null), jget('data/calls/board.json').catch(() => null)]);
    O.rep = { brief, det, news, mkt, enews }; O.calls = calls; O.board = board; O.loaded = true; O.busy = false; draw();
    if (!window.__jcReady) { window.__jcReady = true; setTimeout(() => { try { window.dispatchEvent(new Event('jc-ready')); } catch (e) { } }, 120); }
  }

  /* ---------- pieces ---------- */
  const tile = (nm, r, d) => { if (!r) return ''; const p = pf(r[2]); return `<div class="olT"><small>${E(nm)}</small><b>${E(r[1])}</b><span class="${cls(p)}">${arrow(p)} ${E(r[2])}</span></div>`; };
  const mini = (title, rows) => rows && rows.length ? `<div class="olC"><h5>${E(title)}</h5>${rows.map((r) => { const p = pf(r[2]), w = p == null ? 0 : Math.min(100, Math.abs(p) / 3 * 100); return `<div class="olR"><span>${E(r[0])}</span><i>${E(r[1])}</i><u class="${cls(p)}">${arrow(p)} ${E(r[2])}</u><s class="olBar ${p >= 0 ? 'bu' : 'bd'}" style="width:${w.toFixed(0)}%"></s></div>`; }).join('')}</div>` : ''
  function worldRead(g, a, c, x) {
    const ps = (rows) => (rows || []).map((r) => pf(r[2])).filter((v) => v != null);
    const gp = ps(g), ap = ps(a), L = [];
    const upN = (v) => v.filter((q) => q > 0).length;
    if (gp.length) L.push(`US/Europe: ${upN(gp)} of ${gp.length} indices higher.`);
    if (ap.length) L.push(`Asia: ${upN(ap)} of ${ap.length} higher.`);
    const br = pick(c, 'Brent'), gd = pick(c, 'Gold'), inr = pick(x, 'USD/INR'), y10 = pick(x, 'US 10'), dx = pick(x, 'Dollar');
    if (br) L.push(`Brent ${pf(br[2]) < 0 ? 'fell' : 'rose'} ${E(br[2].replace(/^[+-]/, ''))} to ${E(br[1])}.`);
    if (gd) L.push(`Gold ${E(gd[2])}.`);
    if (inr) L.push(`USD/INR ${E(inr[1])} (${E(inr[2])}).`);
    if (y10) L.push(`US 10-yr yield ${E(y10[1])}%.`);
    return L.join(' ');
  }
  /* one normalised "pack" per mode: morning = morning reports, closing = evening wrap reports */
  function pack(mode) {
    const r = O.rep;
    if (mode === 'closing') {
      const m = r.mkt, n = r.enews; if (!m || !m.cfg) return null;
      const g9 = tabs(m, /Global Market/)[0] || [], sf = tabs(m, /Stocks in Focus/);
      return { title: 'CLOSING OUTLOOK', R: m, ind: tabs(m, /Indian Market/)[0] || [], lv: tabs(m, /Near-Term/)[0] || [], out: bul(m, /Near-Term/).filter((x) => x.length > 25),
        al: [...bul(m, /Next Session/), ...bul(n, /Calendar/)], bias: para(m, /Close in Brief/), g: g9.slice(0, 5), a: g9.slice(5), cm: tabs(m, /Currenc|Commodit/)[0] || [],
        heads: [...bul(n, /Headlines/), ...bul(n, /What to Watch/)], gain: (sf[0] || []).slice(0, 5), lose: (sf[1] || []).slice(0, 5), src: 'Evening Market Wrap' };
    }
    const b = r.brief, d = r.det, n = r.news, R = b || d; if (!R || !R.cfg) return null;
    let g = tabs(R, /^Global/)[0], a = tabs(R, /^Asian/)[0];
    if (!g || !a) { const all = tabs(R, /Global & Asian|Overnight Global/)[0] || tabs(n, /Overnight Global/)[0] || []; g = g || all.slice(0, 5); a = a || all.slice(5); }
    const sf = tabs(d, /Stocks in Focus/)[0] || [];
    return { title: 'OUTLOOK FOR THE DAY', R, ind: tabs(R, /India VIX|Indian Markets/)[0] || [], lv: tabs(R, /Key Levels/)[0] || [], out: bul(d, /^Outlook/).filter((x) => x.length > 25),
      al: [...bul(R, /Alerts/), ...bul(n, /Calendar/)], bias: para(R, /Bias/), g, a, cm: tabs(R, /Commodit/)[0] || [], heads: [...bul(n, /Headlines/), ...bul(d, /^Headlines/)],
      gain: sf.filter((x) => pf(x[2]) > 0).slice(0, 5), lose: sf.filter((x) => pf(x[2]) < 0).slice(0, 5), src: 'Morning Updates' };
  }
  const nodata = (mode, h) => `<section class="olF${h === 1 ? ' dbl' : ''}"><h3>${h === 1 ? (mode === 'closing' ? 'CLOSING OUTLOOK' : 'OUTLOOK FOR THE DAY') : h === 2 ? 'WORLD · COMMODITIES · CURRENCY · BONDS' : 'IMPORTANT NEWS'}</h3><div class="olN">${mode === 'closing' ? 'The evening wrap is built after 17:43 IST on trading days and appears here automatically.' : 'The morning report has not been published yet — it appears here automatically after the 07:30–08:30 IST build.'}</div></section>`;
  /* F&O expiry wording: Nifty = Tuesday, Sensex = Thursday; the LAST one of a month is the MONTHLY expiry. Rewrites the stored sentence and gives a real date. */
  const lastOfMonth = (d) => new Date(d.getTime() + 7 * 864e5).getUTCMonth() !== d.getUTCMonth();
  const dfmt = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  function expFix(x, iso) {
    const base = new Date(iso + 'T00:00:00Z'); if (isNaN(base) || !/expiry/i.test(x)) return { t: x, d: null };
    let d = null, y = x.replace(/\b(Nifty|Sensex) weekly expiry today( \(moved[^)]*\))?\.?/gi, (m, idx, mv) => { const wd = /nifty/i.test(idx) ? 2 : 4, nom = new Date(base.getTime() + ((wd - base.getUTCDay() + 7) % 7) * 864e5), mo = lastOfMonth(nom); d = base; return idx + (mo ? ' MONTHLY' : ' weekly') + ' expiry today (' + dfmt(base) + ')' + (mv || '') + '.'; });
    y = y.replace(/(Next )?(Nifty|Sensex) weekly expiry: (\w+) (\d{2}) (\w{3})( \d{4})?/gi, (m, nx, idx, wk, dd, mm) => { const dt = new Date(Date.parse(dd + ' ' + mm + ' ' + base.getUTCFullYear() + ' 00:00:00 UTC')); if (isNaN(dt)) return m; if (dt < base) dt.setUTCFullYear(dt.getUTCFullYear() + 1); if (!d) d = dt; return (nx || '') + idx + (lastOfMonth(dt) ? ' MONTHLY' : ' weekly') + ' expiry: ' + dfmt(dt); });
    return { t: y, d: d || base };
  }
  const dateChip = (d) => `<i class="olDt"><u>${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()}</u><b>${d.getUTCDate()}</b></i>`;
  function frame1(k, mode) {
    if (!k) return nodata(mode, 1);
    const R = k.R, al = k.al.filter((x, i, a) => a.indexOf(x) === i && x.length > 3), ind = k.ind, lv = k.lv;
    const t = new Date(R.at); const when = isNaN(t) ? R.date : t.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST';
    return `<section class="olF dbl"><h3>${k.title} <small>${E(R.date)}</small></h3>
      <p class="olBias">${E(k.bias || 'Bias not available.')}</p>
      ${moodPanel(k)}
      <div class="olTiles">${tile('Nifty 50', pick(ind, 'Nifty 50'))}${tile('Sensex', pick(ind, 'Sensex'))}${tile('Bank Nifty', pick(ind, 'Bank Nifty'))}${tile('Nifty 500', pick(ind, 'Nifty 500'))}${tile('India VIX', pick(ind, 'India VIX'))}</div>
      ${lv.length ? `<div class="olLv">${lv.map((r) => `<div><small>${E(r[0])}</small><span class="dn">Support ${E(r[1])}</span><span class="up">Resistance ${E(r[2])}</span></div>`).join('')}</div>` : ''}
      ${k.out.length ? `<div class="olBl"><b>Outlook</b>${k.out.map((x) => `<p>${E(x)}</p>`).join('')}</div>` : ''}
      ${al.length ? `<div class="olAl">${al.map((x) => { const e = expFix(x, R.date); const dd = e.d || new Date(R.date + 'T00:00:00Z'); return `<span>${isNaN(dd) ? '📅' : dateChip(dd)} ${E(e.t)}</span>`; }).join('')}</div>` : ''}
      <div class="olSrc">From the ${E(k.src)} report · built ${E(when)}${R.date !== new Date(Date.now() + 19800000).toISOString().slice(0, 10) ? ' · <b>not today’s report yet</b>' : ''} ${R.pdf ? `· <a href="${E(R.pdf)}" target="_blank" rel="noopener">open PDF</a>` : ''}</div></section>`;
  }
  function frame2(k, mode) {
    if (!k) return nodata(mode, 2);
    const cm = k.cm, c = cm.filter((r) => /Brent|WTI|Gold|Silver|crude/i.test(r[0])), x = cm.filter((r) => !/Brent|WTI|Gold|Silver|crude/i.test(r[0]));
    const cur = x.filter((r) => /USD|INR|Dollar|DXY/i.test(r[0])), bond = x.filter((r) => /yield|10-yr|bond/i.test(r[0]));
    return `<section class="olF"><h3>WORLD · COMMODITIES · CURRENCY · BONDS <small>${mode === 'closing' ? 'how the day closed' : 'outlook for the day'}</small></h3>
      <p class="olBias sm">${worldRead(k.g, k.a, c, x)}</p>
      <div class="olGrid">${mini('US & Europe', k.g)}${mini('Asia', k.a)}${mini('Commodities', c)}${mini('Currency', cur)}${mini('Bonds', bond)}</div>
      <div class="olSrc">GIFT Nifty and MCX are not available to the free data pipeline.</div></section>`;
  }
  function frame3(k, mode) {
    if (!k) return nodata(mode, 3);
    const heads = k.heads.map((x) => x.trim()).filter((x, i, a) => x.length > 20 && a.findIndex((y) => y.slice(0, 40) === x.slice(0, 40)) === i).slice(0, 8);
    return `<section class="olF"><h3>IMPORTANT NEWS <small>from the ${mode === 'closing' ? 'evening' : 'pre-market news &amp; morning'} reports</small></h3>
      ${heads.length ? `<ul class="olNews">${heads.map((h) => { const m = /^(.*?)\s*\[([^\]]+)\]\.?$/.exec(h); return `<li>${E(m ? m[1] : h)}${m ? ` <em>${E(m[2])}</em>` : ''}</li>`; }).join('')}</ul>` : '<div class="olN">No headlines published yet.</div>'}
      ${k.gain.length || k.lose.length ? `<div class="olGrid">${mini('Top gainers (Nifty 50)', k.gain)}${mini('Top losers', k.lose)}</div>` : ''}</section>`;
  }
  const lvl2 = (v) => (num(v) ? f2(v, v < 100 ? 2 : 1) : '—');
  const against = (c, md) => md != null && ((c.side === 'BUY' && md <= 40) || (c.side === 'SELL' && md >= 60));
  function ladder(c) {
    const v = [c.sl, c.entry, c.t1, c.t2].filter(num); if (v.length < 3) return ''; const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1, ps = (x) => ((x - lo) / r * 100), seg = (a, b, k) => `<i class="${k}" style="left:${Math.min(ps(a), ps(b)).toFixed(1)}%;width:${Math.abs(ps(a) - ps(b)).toFixed(1)}%"></i>`;
    const dot = (x, t) => `<b style="left:${ps(x).toFixed(1)}%" title="${t}"></b>`;
    return `<div class="olLad"><div class="olTr">${seg(c.sl, c.entry, 'rk')}${seg(c.entry, c.t2, 'gn')}${dot(c.sl, 'Stop')}${dot(c.entry, 'Entry')}${num(c.t1) ? dot(c.t1, 'T1') : ''}${dot(c.t2, 'T2')}</div></div>`;
  }
  function callCard(c) {
    const buy = c.side === 'BUY', why = (c.why || []).slice(0, 2).join(' · ');
    return `<div class="olCall ${buy ? 'cb' : 'cs'}"><div class="olCh"><b class="olSide">${buy ? '▲ BUY' : '▼ SELL'}</b><b class="olSym">${E(c.sym)}</b>${c.grade ? `<span class="olGr">${E(c.grade)}</span>` : ''}<button class="olX" data-x="${E(c.sym)}">X-ray</button></div>${ladder(c)}
      <div class="olLv4"><span>Entry<b>${lvl2(c.entry)}</b></span><span class="dn">Stop<b>${lvl2(c.sl)}</b></span><span class="up">T1<b>${lvl2(c.t1)}</b></span><span class="up">T2<b>${lvl2(c.t2)}</b></span><span>R:R<b>${num(c.rr1) ? '1:' + c.rr1.toFixed(1) : '—'}</b></span></div>${why ? `<div class="olWhy">${E(why)}</div>` : ''}</div>`;
  }
  function frame4(k) {
    const C = O.calls; if (!C) return `<section class="olF"><h3>INTRADAY &amp; INVESTMENT CALLS</h3><div class="olN">Calls file not available.</div></section>`;
    const m = moodOf(k || pack('morning')), md = m ? m.score : null, all = C.calls || [];
    const keep = all.filter((c) => !against(c, md)), held = all.filter((c) => against(c, md));
    const day = keep.filter((c) => c.type === 'DAY'), inv = keep.filter((c) => c.type !== 'DAY'), cx = C.ctx || {};
    const grid = (rows, kind) => rows.length ? `<div class="olCalls">${rows.map(callCard).join('')}</div>` : `<div class="olN">No ${kind} call fits today’s mood and rules — staying out is a position too.</div>`;
    const bn = m ? `<div class="olMoodBar" style="--mc:${m.col}"><b>Today’s mood: ${E(m.label)} ${m.score}/100</b> — calls are matched to it: ${md >= 60 ? 'sell calls are held back' : md <= 40 ? 'buy calls are held back' : 'both sides allowed, only the strongest set-ups'}${held.length ? ` (${held.length} held back: ${E(held.slice(0, 6).map((c) => c.sym).join(', '))}${held.length > 6 ? '…' : ''})` : ''}.</div>` : '';
    return `<section class="olF"><h3>INTRADAY &amp; INVESTMENT CALLS <small>${E(C.date || '')} · ${E(String(C.scanned || ''))} stocks scanned · Nifty trend ${E(cx.regime || '—')} · VIX ${f2(cx.vix, 1)}</small></h3>${bn}
      <h5 class="olH">Intraday — today only, square off the same day</h5>${grid(day, 'intraday')}
      <h5 class="olH">Investment — positional / long-term</h5>${grid(inv, 'investment')}
      <div class="olSrc">Entry = trigger on a 5-minute close beyond the level; every call carries a stop. Rule-based levels from daily data — not advice, not a guaranteed outcome.</div></section>`;
  }
  /* ---------- watchlist Buy / Sell / Avoid ---------- */
  const lists = () => { if (O.custom) return [O.custom]; if (CL) { const j = window.jcc; return [{ id: 'me', name: 'My watchlist', syms: (j && j.S && j.S.syms) || [] }]; } try { wlEnsure(); return WL.store.lists || []; } catch (e) { return []; } };
  /* LIVE overlay: today's live price (client page polls it) can invalidate or upgrade the morning view */
  function liveAdj(s, r, c, side) {
    const L = O.live && O.live[s]; if (!L || !num(L[0])) return null; const p = L[0], hi = num(L[3]) ? L[3] : p, lo = num(L[4]) ? L[4] : p;
    const pl = c ? { e: c.entry, sl: c.sl, t1: c.t1, t2: c.t2 } : (r && r.p && r.b !== 'WAIT' ? r.p : null);
    if (pl && (side === 'BUY' || side === 'SELL')) {
      const buy = side === 'BUY', ent = buy ? hi >= pl.e : lo <= pl.e;
      if (buy ? p <= pl.sl : p >= pl.sl) return { side: 'AVOID', why: 'LIVE: stop-loss ₹' + f2(pl.sl) + ' touched (now ₹' + f2(p) + ') — plan invalid', lp: p };
      if (buy ? p >= pl.t2 : p <= pl.t2) return { side: 'AVOID', why: 'LIVE: target 2 ₹' + f2(pl.t2) + ' reached — no fresh entry', lp: p };
      return { side, tag: 'LIVE · ' + (buy ? (p >= pl.t1 ? 'target 1 reached' : ent ? 'trigger crossed — in trade' : 'waiting for ₹' + f2(pl.e)) : (p <= pl.t1 ? 'target 1 reached' : ent ? 'trigger crossed — in trade' : 'waiting for ₹' + f2(pl.e))), lp: p };
    }
    if (r) {
      if (r.lean === 'BUY' && num(r.ph) && p > r.ph * 1.003) return { side: 'BUY', tag: 'LIVE · broke above yesterday’s high ₹' + f2(r.ph), lp: p };
      if (r.lean === 'SELL' && num(r.pl) && p < r.pl * 0.997) return { side: 'SELL', tag: 'LIVE · broke below yesterday’s low ₹' + f2(r.pl), lp: p };
    }
    return { lp: p };
  }
  function classify(list) {
    const B = (O.board && O.board.rows) || {}, calls = {}; ((O.calls && O.calls.calls) || []).forEach((c) => { calls[clean(c.sym)] = c; });
    const out = { BUY: [], SELL: [], AVOID: [] }, mm = moodOf(pack('morning')), md = mm ? mm.score : null;
    const put = (side, o) => { const a = liveAdj(o.s, o.r, o.c, side); if (a) { if (a.lp != null) o.lp = a.lp; if (a.tag) o.tag = a.tag; if (a.side === 'AVOID') { out.AVOID.push(Object.assign(o, { why: a.why, tag: '' })); return; } if (a.side) side = a.side; } if (against({ side }, md)) out.AVOID.push(Object.assign(o, { why: 'Against today’s ' + mm.label.toLowerCase() + ' mood (' + md + '/100) — wait', tag: '' })); else out[side].push(o); };
    (list ? list.syms : []).forEach((s0) => {
      const s = clean(s0), r = B[s], c = calls[s];
      if (c && (c.side === 'BUY' || c.side === 'SELL')) { put(c.side, { s, r, c, tag: c.type === 'DAY' ? 'Intraday call' : 'Investment call', conv: r ? r.conv : c.score }); return; }
      if (!r) { out.AVOID.push({ s, r: null, why: 'Not in the scanned list — no rule-based view' }); return; }
      if (r.b === 'BUY' || r.b === 'SELL') put(r.b, { s, r, tag: 'Signal', conv: r.conv });
      else if (r.lean === 'BUY' && r.conv >= 60) put('BUY', { s, r, tag: 'Leaning buy · wait for trigger', conv: r.conv });
      else if (r.lean === 'SELL' && r.conv >= 60) put('SELL', { s, r, tag: 'Leaning sell · wait for trigger', conv: r.conv });
      else { const a = liveAdj(s, r, null, 'WAIT'); if (a && a.side && r.conv >= 50) put(a.side, { s, r, tag: a.tag, conv: r.conv, lp: a.lp }); else out.AVOID.push({ s, r, why: r.no || 'No clean set-up', conv: r.conv, lp: a && a.lp }); }
    });
    Object.values(out).forEach((a) => a.sort((x, y) => (y.conv || 0) - (x.conv || 0)));
    return out;
  }
  function frame5() {
    const L = lists(); if (!O.listId || !L.find((l) => l.id === O.listId)) O.listId = O.custom ? O.custom.id : CL ? 'me' : (typeof WL !== 'undefined' && WL.store && WL.store.active) || (L[0] && L[0].id);
    const l = L.find((x) => x.id === O.listId), k = classify(l);
    return `<section class="olF"><h3>MY WATCHLIST — BUY · SELL · AVOID</h3>
      <div class="olSel"><label>Watchlist <select id="olList">${L.map((x) => `<option value="${E(x.id)}"${x.id === O.listId ? ' selected' : ''}>${E(x.name)} (${x.syms.length})</option>`).join('')}</select></label>
        <small>${O.board ? 'Board as of ' + E(String(O.board.date || '')) : 'Board not loaded'}${O.liveAt ? ' · <b style="color:#12894b">● LIVE ' + new Date(O.liveAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) + '</b>' : ''}</small></div>
      <div class="olBtns"><button class="olB buy" data-k="BUY">BUY<b>${k.BUY.length}</b></button><button class="olB sell" data-k="SELL">SELL<b>${k.SELL.length}</b></button><button class="olB avoid" data-k="AVOID">AVOID<b>${k.AVOID.length}</b></button></div>
      <div class="olSrc">Tap a button to see the stocks from this watchlist. Buy / Sell = a rule-based signal or call (or a strong lean, marked); Avoid = no clean set-up today.</div></section>`;
  }
  function popup(kind) {
    const l = lists().find((x) => x.id === O.listId), k = classify(l)[kind], T = { BUY: 'Buy', SELL: 'Sell', AVOID: 'Avoid' }[kind];
    const body = k.length ? `<div class="olScroll"><table class="olTb"><thead><tr><th>Stock</th><th>Price</th><th>Why / levels</th><th>Conv.</th><th></th></tr></thead><tbody>${k.map((x) => {
      const r = x.r, c = x.c, px = num(x.lp) ? x.lp : (r ? r.c : null), chg = r && r.pc && px != null ? (px / r.pc - 1) * 100 : null;
      const lv = c ? `Entry ${f2(c.entry)} · Stop ${f2(c.sl)} · T1 ${f2(c.t1)} · T2 ${f2(c.t2)}` : (r && r.pv && kind !== 'AVOID' ? `Support ${f2(r.pv.S1)} · Resistance ${f2(r.pv.R1)}` : '');
      const why = x.why || ((c && c.why) || (r && r.why) || []).slice(0, 2).join(' · ');
      return `<tr><td><b>${E(x.s)}</b><br><small>${E(x.tag || '')}</small></td><td>${px != null ? f2(px) : '—'}${num(x.lp) ? '<br><small style="color:#12894b;font-weight:800">● live</small>' : ''}${chg != null ? `<br><small class="${cls(chg)}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</small>` : ''}</td><td><small>${E(lv)}${lv && why ? '<br>' : ''}${E(why)}</small></td><td>${num(x.conv) ? Math.round(x.conv) : '—'}</td><td><button class="olX" data-x="${E(x.s)}">X-ray</button></td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="olN">No stocks in this group for the selected watchlist today.</div>`;
    let m = $('olPop'); if (!m) { m = document.createElement('div'); m.id = 'olPop'; document.body.appendChild(m); }
    m.innerHTML = `<div class="olBox"><div class="olHd"><h3>${T} — ${E(l ? l.name : '')} <small>${k.length} stock${k.length === 1 ? '' : 's'}</small></h3><button class="olClose" data-close="1">✕</button></div>${body}<div class="olSrc">Rule-based, from delayed data. Conv. = signal-agreement score, not a probability. Not investment advice.</div></div>`;
    m.className = 'on'; document.body.style.overflow = 'hidden'; pushLayer(domClosePop);
  }
  /* client page: instant Quick summary from today's board (no heavy download), then the person chooses to proceed with the X-ray */
  function quickPop(sym) {
    const s = clean(sym), r = O.board && O.board.rows && O.board.rows[s], mm = moodOf(pack('morning')), md = mm ? mm.score : null;
    let body;
    if (!r) body = `<div class="olN"><b>${E(s)}</b> is not in today's scanned board, so there is no ready summary. The full X-ray analyses it live — it takes longer.</div>`;
    else {
      const chg = r.pc ? (r.c / r.pc - 1) * 100 : null, side = r.b === 'WAIT' ? (r.lean === 'BUY' || r.lean === 'SELL' ? 'Leaning ' + r.lean.toLowerCase() : 'Wait') : r.b, held = against({ side: r.b }, md);
      const lv = r.p && r.b !== 'WAIT' ? [['Entry', r.p.e], ['Stop', r.p.sl], ['T1', r.p.t1], ['T2', r.p.t2]] : (r.pv ? [['Support', r.pv.S1], ['Pivot', r.pv.P], ['Resist.', r.pv.R1]] : []);
      body = `<div class="olQ"><div class="olCh"><b class="olSym">${E(s)}</b><span class="olSide" style="${r.b === 'SELL' ? 'background:#c11d3d' : r.b === 'BUY' ? '' : 'background:#7a859e'}">${E(held ? 'WAIT' : side)}</span><span style="margin-left:auto;font-weight:800">₹${f2(r.c)} ${chg != null ? `<small class="${cls(chg)}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</small>` : ''}</span></div>
        ${held ? `<div class="olMoodBar" style="--mc:${mm.col}">Against today's ${E(mm.label.toLowerCase())} market mood (${md}/100) — wait.</div>` : ''}
        <div class="olLv4" style="grid-template-columns:repeat(${lv.length || 1},1fr)">${lv.map((x) => `<span>${x[0]}<b>${f2(x[1])}</b></span>`).join('')}</div>
        <div class="olWhy">Conviction <b>${num(r.conv) ? Math.round(r.conv) : '—'}</b>/100${num(r.rsi) ? ` · RSI ${Math.round(r.rsi)}` : ''}${num(r.adx) ? ` · ADX ${Math.round(r.adx)}` : ''}</div>
        ${(r.why || []).length ? `<div class="olWhy">${(r.why || []).slice(0, 3).map(E).join(' · ')}</div>` : ''}</div>`;
    }
    let m = $('olPop'); if (!m) { m = document.createElement('div'); m.id = 'olPop'; document.body.appendChild(m); }
    m.innerHTML = `<div class="olBox"><div class="olHd"><h3>Quick summary</h3><button class="olClose" data-close="1">✕</button></div>${body}<div style="display:flex;gap:8px;margin-top:12px"><button class="olX" data-x="${E(s)}" style="flex:1;padding:10px;background:#14306e;color:#fff">Proceed with X-ray →</button><button class="olX" data-close="1" style="padding:10px">Not now</button></div><div class="olSrc">Rule-based, from delayed data. Not investment advice.</div></div>`;
    m.className = 'on'; document.body.style.overflow = 'hidden'; pushLayer(domClosePop);
  }
  const domClosePop = () => { const m = $('olPop'); if (m) m.className = ''; document.body.style.overflow = ''; };
  const popOpen = () => { const m = $('olPop'); return !!(m && m.className === 'on'); };
  const closePop = () => { if (popOpen()) popLayer(); };
  /* ---------- scrip search → X-ray first, then the reports ---------- */
  function frame6() {
    return `<section class="olF"><h3>SCRIP SEARCH · X-RAY &amp; FULL REPORT</h3>
      <div class="olSearch"><input id="olSym" placeholder="Symbol e.g. RELIANCE, TFCILTD" value="${E(O.sym)}" autocomplete="off"><select id="olEx"><option value="NS">NSE</option><option value="BO">BSE</option></select><button class="olB go" id="olGo">Generate report</button></div>
      <div class="olSrc">Shows the Quick summary first, then asks whether to proceed with the graphical X-ray, followed by the Intraday, Short term and Long term reports.</div>
      <div id="olRep">${O.sym && O.gen ? repStrip(O.busyRep) : ''}</div></section>`;
  }
  /* "Proceed with X-ray?" card shown after the Quick summary */
  function proceedPrompt(sym, onYes, msg, yes) {
    const old = document.getElementById('olProceed'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'olProceed';
    d.innerHTML = '<style>#olProceed{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:55;width:min(94vw,440px);background:#fffdf6;border:2px solid #D4AF37;border-radius:14px;padding:12px 14px;box-shadow:0 14px 34px -10px rgba(0,0,0,.55);font:600 13px system-ui,sans-serif;color:#14213d}#olProceed div{display:flex;gap:8px;margin-top:10px}#olProceed button{flex:1;cursor:pointer;border:1px solid #D4AF37;background:#fff;border-radius:10px;padding:9px;font-weight:800}#olProceed .y{background:#14306e;color:#fff}</style>' + (msg || 'Proceed with the graphical X-ray of <b>' + E(clean(sym)) + '</b>?') + '<div><button class="y" data-y="1">' + (yes || 'Yes — open X-ray') + '</button><button data-n="1">Not now</button></div>';
    d.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; d.remove(); if (b.getAttribute('data-y')) onYes(); };
    document.body.appendChild(d);
  }
  const repStrip = (wait) => { const d = wait ? ' disabled title="Report still building…"' : ''; return `<div class="olStrip"><b>${E(O.sym)}</b> reports: <button data-tab="pSummary"${d}>① Quick summary</button><button data-x="${E(O.sym)}">② X-ray</button><button data-tab="pIntraday"${d}>③ Intraday</button><button data-tab="pSwing"${d}>④ Short term</button><button data-tab="pLong"${d}>⑤ Long term</button></div>`; };
  async function go() {
    const inp = $('olSym'); const s = clean((inp && inp.value) || ''); if (!s) return; O.sym = s; O.gen = true; O.busyRep = true;
    const si = $('symbolInput'), ex = $('exchangeInput'); if (CL) { O.gen = false; } if (si) si.value = s; if (ex && $('olEx')) ex.value = $('olEx').value;
    const rp = $('olRep'); if (rp) rp.innerHTML = repStrip(true) + '<div class="olN">Building the full report in the background…</div>';
    if (CL) { quickPop(s); O.busyRep = false; const r3 = $('olRep'); if (r3) r3.innerHTML = ''; return; }
    const full = s + ($('olEx') && $('olEx').value === 'BO' ? '.BO' : '');
    const pg = window.jcProgress ? window.jcProgress(null, 'Preparing the report for ' + clean(s), true) : null;
    try { if (typeof runAnalysis === 'function') await runAnalysis(); } catch (e) { }
    if (pg) pg.done(); O.busyRep = false; const r2 = $('olRep'); if (r2) r2.innerHTML = repStrip();
    proceedPrompt(full, () => {
      O.fromOutlook = true; pushLayer(() => { const q = document.getElementById('olProceed'); if (q) q.remove(); showTab(O.home || 'pClient'); }); showTab('pSummary');
      proceedPrompt(full, () => openX(full));
    }, 'The report for <b>' + E(clean(s)) + '</b> is ready. Open the Quick summary?', 'Yes — Quick summary');
  }
  /* ---------- paint ---------- */
  function draw() {
    const p = $('pOutlook'); if (!p || (!CL && !p.classList.contains('active'))) return;
    const keep = $('olSym') ? $('olSym').value : O.sym; O.sym = keep || O.sym;
    p.innerHTML = css() + `<div class="olWrap"><div class="olTop"><h2${CL ? ' style="color:#e7cf86"' : ''}>Today’s Outlook</h2><button class="olB sm" id="olRef">↻ Refresh</button></div>${O.loaded ? (() => { const k = pack('morning'); return frame1(k, 'morning') + frame2(k, 'morning') + frame3(k, 'morning'); })() + frame4(pack('morning')) + frame5() + frame6() : '<div class="olN">Loading the morning reports…</div>'}
      <div class="olLegal">Prepared from delayed market data and published morning reports with fixed, rule-based formulas. Research information for discussion with your adviser — not investment advice, not a recommendation, and no outcome is guaranteed.</div></div>`;
  }
  const css = () => `<style>
  .olWrap{max-width:1100px;margin:0 auto}.olTop{display:flex;align-items:center;justify-content:space-between}.olTop h2{margin:6px 0;color:#14306e}
  .olF{position:relative;margin:14px 0;padding:14px 16px;background:linear-gradient(180deg,#fffdf6,#fff8e6);border:2px solid #D4AF37;border-radius:14px;box-shadow:0 8px 24px -14px rgba(138,109,31,.55)}
  .olF.dbl{border:3px double #D4AF37;outline:1px solid #E4C97A;outline-offset:3px;padding:18px 20px}
  .olF h3{margin:0 0 8px;font-size:14px;letter-spacing:.09em;color:#8A6D1F;border-bottom:1.6px solid #C7A03C;padding-bottom:6px}.olF h3 small{font-weight:600;letter-spacing:0;color:#52607f;margin-left:8px;font-size:11px}
  .olBias{font-size:14px;line-height:1.5;color:#14213d;margin:6px 0 10px}.olBias.sm{font-size:12.5px}
  .olTiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.olT{background:#fff;border:1px solid #ecd9a0;border-radius:10px;padding:8px 10px}.olT small{display:block;color:#8A6D1F;font-weight:700}.olT b{font-size:16px;display:block}
  .up{color:#12894b}.dn{color:#c11d3d}b.up,b.dn{font-weight:800}
  .olLv{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:10px 0}.olLv div{background:#fff;border:1px dashed #D4AF37;border-radius:10px;padding:6px 10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}.olLv small{font-weight:700;color:#14306e;min-width:70px}
  .olBl p{margin:4px 0;font-size:12.5px;line-height:1.45}.olAl{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.olAl span{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #ecd9a0;border-radius:99px;padding:3px 10px;font-weight:600}
  .olGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:8px}.olC{background:#fff;border:1px solid #ecd9a0;border-radius:10px;padding:8px 10px}.olC h5{margin:0 0 4px;color:#8A6D1F;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em}
  .olR{display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:3px 0;border-top:1px solid #f3ead0}.olR:first-of-type{border-top:0}.olR i{font-style:normal;font-variant-numeric:tabular-nums}.olR u{text-decoration:none;font-weight:700;min-width:74px;text-align:right}
  .olNews{margin:4px 0 6px;padding-left:18px}.olNews li{margin:5px 0;line-height:1.4}.olNews em{color:#8A6D1F;font-style:normal;font-size:11px;border:1px solid #ecd9a0;border-radius:99px;padding:0 7px;margin-left:4px}
  .olH{margin:10px 0 4px;color:#14306e}.olScroll{overflow-x:auto}.olTb{border-collapse:collapse;width:100%;background:#fff}.olTb th{background:#f6ecc9;color:#6b5314;text-align:left;padding:5px 8px;font-size:11px}.olTb td{padding:5px 8px;border-top:1px solid #f0e6c4;vertical-align:top}
  .olN{padding:8px 10px;background:#fff;border:1px dashed #D4AF37;border-radius:8px;color:#52607f}.olSrc{margin-top:8px;font-size:11px;color:#6a7694}
  .olSel{display:flex;gap:12px;align-items:center;margin-bottom:8px}.olBtns{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .olB{cursor:pointer;border:1px solid #1f3a85;background:#fff;color:#0b1c45;border-radius:10px;padding:8px 14px;font-weight:800;font-size:13px}.olB.sm{padding:4px 10px;font-size:12px}
  .olB b{display:block;font-size:24px}.olB.buy{background:#e6f6ec;border-color:#12894b;color:#0a6b38}.olB.sell{background:#fdecef;border-color:#c11d3d;color:#9b1231}.olB.avoid{background:#f3f4f8;border-color:#7a859e;color:#46526e}.olB.go{background:#14306e;color:#fff}
  .olB:hover,.olX:hover{filter:brightness(.95)}.olX{cursor:pointer;border:1px solid #D4AF37;background:#fff8e6;border-radius:8px;padding:3px 8px;font-weight:700;color:#6b5314}
  .olSearch{display:flex;gap:8px;flex-wrap:wrap}.olSearch input{flex:1;min-width:200px;padding:8px 10px;border:1px solid #D4AF37;border-radius:8px;font-size:14px}.olSearch select{padding:8px;border:1px solid #D4AF37;border-radius:8px}
  .olStrip{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.olStrip button{cursor:pointer;border:1px solid #D4AF37;background:#fff;border-radius:8px;padding:6px 12px;font-weight:700}
  .olLegal{font-size:10.5px;color:#6a7694;margin:10px 0 24px}${CL ? '.olLegal{color:#9fb0d6}.olWrap{padding:0 12px}.olHdr{display:none}' : ''}
  #olFrm{position:fixed;inset:0;z-index:70;background:#0b1c45;display:none;flex-direction:column}#olFrm.on{display:flex}.olFh{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;color:#e7cf86;border-bottom:2px solid #D4AF37}#olFrm iframe{flex:1;border:0;width:100%;background:#f1f4fa}
  #olPop{position:fixed;inset:0;z-index:60;background:rgba(10,20,45,.55);display:none;align-items:center;justify-content:center;padding:14px}#olPop.on{display:flex}
  .olBox{background:#fffdf6;border:3px double #D4AF37;border-radius:14px;max-width:880px;width:100%;max-height:88vh;overflow:auto;padding:14px 16px}.olHd{display:flex;justify-content:space-between;align-items:center}.olHd h3{margin:0;color:#8A6D1F}.olHd small{color:#52607f}.olClose{cursor:pointer;border:0;background:#14306e;color:#fff;border-radius:8px;padding:4px 10px;font-size:14px}
  #olBack{position:fixed;left:12px;bottom:12px;z-index:40;display:none;background:#14306e;color:#fff;border:2px solid #D4AF37;border-radius:99px;padding:8px 16px;font-weight:800;cursor:pointer;box-shadow:0 8px 20px -8px rgba(0,0,0,.5)}
  @media(max-width:640px){.olBtns{grid-template-columns:1fr 1fr 1fr}.olB b{font-size:20px}.olF{padding:10px 11px}}
  .olDt{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:30px;height:32px;border-radius:6px;border:1.5px solid #c7d2e3;background:#fff;overflow:hidden;font-style:normal;flex:none}.olDt u{display:block;width:100%;background:#f2711c;color:#fff;font-size:8px;font-weight:800;text-decoration:none;text-align:center;line-height:11px}.olDt b{font-size:14px;line-height:19px;color:#14213d}
  .olMood{display:grid;grid-template-columns:auto 1fr;gap:10px 18px;align-items:center;margin:8px 0 12px;padding:10px 12px;border-radius:14px;background:linear-gradient(135deg,#fff,#fff7dc);border:1px solid #ecd9a0}
  .olMoodMap{text-align:center}.olMap{height:120px;width:auto;filter:drop-shadow(0 6px 8px rgba(0,0,0,.18))}.olMoodMap small{display:block;font-size:10px;letter-spacing:.14em;color:#8A6D1F;font-weight:800;margin-top:2px}
  .olMoodG{text-align:center}.olGauge{width:210px;max-width:100%}.olMoodG b{display:block;font-size:20px;letter-spacing:.06em;margin-top:-6px}.olMoodG small{color:#52607f}
  .olMoodD{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px}.olMoodD span{position:relative;background:#fff;border:1px solid #f0e6c4;border-radius:8px;padding:5px 8px 8px;font-weight:700;font-size:11.5px}.olMoodD span i{position:absolute;left:0;bottom:0;height:4px;border-radius:0 4px 4px 0;opacity:.85}.olMoodD em{font-style:normal;color:#52607f;font-weight:600;margin-left:4px}
  .olR{position:relative}.olBar{position:absolute;left:0;bottom:0;height:2px;border-radius:2px;opacity:.55}.olBar.bu{background:#12894b}.olBar.bd{background:#c11d3d}
  .olMoodBar{border-left:5px solid var(--mc,#D4AF37);background:#fff;border-radius:8px;padding:8px 12px;margin:6px 0 4px;font-size:12.5px;line-height:1.45}
  .olCalls{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.olCall{background:#fff;border:1px solid #ecd9a0;border-top:4px solid #12894b;border-radius:12px;padding:10px 12px;box-shadow:0 6px 16px -12px rgba(0,0,0,.4)}.olCall.cs{border-top-color:#c11d3d}
  .olCh{display:flex;align-items:center;gap:8px}.olSide{font-size:12px;padding:2px 8px;border-radius:99px;color:#fff;background:#12894b}.cs .olSide{background:#c11d3d}.olSym{font-size:16px;color:#14213d}.olGr{font-size:10.5px;font-weight:800;border:1px solid #D4AF37;color:#6b5314;border-radius:6px;padding:1px 6px;background:#fff8e6}.olCh .olX{margin-left:auto}
  .olLad{margin:10px 2px 6px}.olTr{position:relative;height:8px;border-radius:6px;background:#eef1f8}.olTr i{position:absolute;top:0;height:100%}.olTr i.rk{background:#f4b6bf}.olTr i.gn{background:#a8e0bf}.olTr b{position:absolute;top:-3px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#14306e;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}
  .olLv4{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;text-align:center}.olLv4 span{font-size:10px;color:#6a7694;background:#faf6e8;border-radius:8px;padding:4px 2px}.olLv4 b{display:block;font-size:12.5px;color:#14213d;font-variant-numeric:tabular-nums}.olLv4 .dn b{color:#c11d3d}.olLv4 .up b{color:#12894b}
  .olWhy{margin-top:6px;font-size:11px;color:#52607f}
  @media(max-width:520px){.olMood{grid-template-columns:1fr;justify-items:center}.olLv4{grid-template-columns:repeat(5,1fr)}.olLv4 b{font-size:11px}}
  </style>`;
  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target, c = (q) => t.closest && t.closest(q);
    if (c('[data-closefrm]')) { popLayer(); return; }
    if (c('#olBack')) { if (!popLayer()) showTab(O.home || 'pClient'); return; }
    if (c('[data-close]') || t.id === 'olPop') { closePop(); return; }
    const k = c('#pOutlook [data-k], #pClient [data-k]'); if (k) { popup(k.getAttribute('data-k')); return; }
    const x = c('#pOutlook [data-x], #pClient [data-x], #olPop [data-x]'); if (x) { const vp = popOpen(); openX(x.getAttribute('data-x'), vp); if (vp) domClosePop(); return; }
    const tb = c('#pOutlook [data-tab], #pClient [data-tab]'); if (tb) { O.fromOutlook = true; pushLayer(() => showTab(O.home || 'pClient')); showTab(tb.getAttribute('data-tab')); return; }
    if (c('#olGo')) { go(); return; }
    if (c('#olRef')) { O.loaded = false; O.busy = false; draw(); loadAll(); }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'olList') { O.listId = e.target.value; draw(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'olSym') go(); if (e.key === 'Escape') popLayer(); });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('#jcxr button'); if (b && /Close/.test(b.innerText) && !O.progClose && O.xrLayer) { e.stopImmediatePropagation(); e.preventDefault(); popLayer(); } }, true);
  function init() {
    if (typeof showTab !== 'function' || !document.body) return false; if ($('olBack')) return true;
    const bk = document.createElement('button'); bk.id = 'olBack'; bk.textContent = '← Back'; document.body.appendChild(bk);
    const orig = window.showTab; window.showTab = function (id) { orig(id); bk.style.display = O.fromOutlook && /^p(Summary|Intraday|Swing|Long)$/.test(id) ? 'block' : 'none'; if (!/^p(Summary|Intraday|Swing|Long)$/.test(id)) O.fromOutlook = false; };
    return true;
  }
  function initClient() {
    if ($('pOutlook')) return true; const err = $('err'); if (!err) return false;
    const d = document.createElement('div'); d.id = 'pOutlook'; d.className = 'panel active'; err.parentNode.insertBefore(d, err.nextSibling);
    const s4 = document.querySelector('section.s4'); if (s4) s4.style.display = 'none';
    d.innerHTML = '<div class="olWrap"><div class="olN" style="margin:12px">Loading the morning reports…</div></div>'; loadAll(); setInterval(() => { if (document.visibilityState === 'visible') { O.loaded = true; loadAll(); } }, 120000); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { O.loaded = true; loadAll(); } });
    /* repaint when the page learns the client's list (jcc.S.syms) */
    let last = -1; setInterval(() => { const n = (window.jcc && window.jcc.S && window.jcc.S.board ? 1 : 0) * 1e4 + (window.jcc ? window.jcc.S.syms.length : 0); if (n !== last && O.loaded) { last = n; draw(); } }, 1200);
    return true;
  }
  /* embedded terminal opened by the client page with ?sym=: X-ray first, then report buttons */
  function initEmbedSym() {
    const m = /[?&]sym=([^&#]{1,24})/.exec(location.search); if (!m || !EMB) return;
    const sym = decodeURIComponent(m[1]).toUpperCase(), goX = /[?&]go=xray/.test(location.search), w = setInterval(() => { if (!window.jcXray || typeof runAnalysis !== 'function' || !$('symbolInput')) return; clearInterval(w);
      $('symbolInput').value = sym.replace(/\.(NS|BO)$/, ''); if (/\.BO$/.test(sym) && $('exchangeInput')) $('exchangeInput').value = 'BO';
      const bar = document.createElement('div'); bar.id = 'olEmb'; bar.innerHTML = '<style>#olEmb{position:sticky;top:0;z-index:30;display:flex;gap:6px;flex-wrap:wrap;padding:8px;background:#fff8e6;border-bottom:2px solid #D4AF37}#olEmb button{cursor:pointer;border:1px solid #D4AF37;background:#fff;border-radius:8px;padding:6px 10px;font-weight:700}#olEmb button[disabled]{opacity:.45}</style><button data-t="pSummary" disabled>① Quick summary</button><button data-xr="' + sym + '" disabled>② X-ray</button><button data-t="pIntraday" disabled>③ Intraday</button><button data-t="pSwing" disabled>④ Short term</button><button data-t="pLong" disabled>⑤ Long term</button>';
      document.body.insertBefore(bar, document.body.firstChild);
      bar.onclick = (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; if (b.getAttribute('data-xr')) window.jcXray(sym); else showTab(b.getAttribute('data-t')); };
      const pg = !goX && window.jcProgress ? window.jcProgress(null, 'Preparing the report for ' + sym.replace(/\.(NS|BO)$/, ''), true) : null;
      if (goX) window.jcXray(sym); /* opened from the client page after its instant Quick summary: X-ray first, the other reports build behind it */
      Promise.resolve(runAnalysis()).catch(() => { }).then(() => { if (pg) pg.done(); bar.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        if (goX) { showTab('pSummary'); return; }
        proceedPrompt(sym, () => { showTab('pSummary'); proceedPrompt(sym, () => window.jcXray(sym)); }, 'The report for <b>' + E(sym.replace(/\.(NS|BO)$/, '')) + '</b> is ready. Open the Quick summary?', 'Yes — Quick summary'); });
    }, 300);
  }
  if (CL) { const t1 = setInterval(() => { if (initClient()) clearInterval(t1); }, 300); } else { const t0 = setInterval(() => { if (init()) clearInterval(t0); }, 400); initEmbedSym(); }
  async function snapshot(mode) { if (!O.loaded) await loadAll(); else if (O.busy) { for (let i = 0; i < 40 && O.busy; i++) await new Promise((r) => setTimeout(r, 250)); } const k = pack(mode); return css() + '<div class="olWrap">' + frame1(k, mode) + frame2(k, mode) + frame3(k, mode) + frame4(k) + '</div>'; }
  window.jcOutlook = { setLive: (m) => { O.live = m; O.liveAt = Date.now(); if (O.loaded) draw(); }, reload: () => { O.loaded = false; loadAll(); draw(); }, state: O, snapshot, css, setList: (c) => { O.custom = c; O.listId = c && c.id; }, buttons: () => css() + frame5(), search: () => css() + frame6(), loaded: () => O.loaded, load: loadAll };
})();
