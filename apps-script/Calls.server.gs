
/* =====================================================================
   CALL BOOK (server side) — uses JCE from calls_engine.js (appended below by pipeline/build_gs.py)
   • callsBuild_      08:10–08:25 IST trigger: scans watchlists + Nifty 50, writes today's day-trading & investment calls to Drive (JC_Calls.json)
   • callsReconcile_  16:00–16:15 IST trigger: settles every day call on the real 5-minute candles and updates open investment calls on daily bars
   • callsLoad_ / callsSave_  the terminal reads the book and writes its live tracking back (record-level merge, final results are never overwritten)
   Run installCallsTriggers() ONCE from the editor (Run ▸ authorise) to create the two daily triggers.
   ===================================================================== */
var CALLS_FILE = 'JC_Calls.json';
var NIFTY50_ = 'RELIANCE TCS HDFCBANK ICICIBANK INFY BHARTIARTL ITC SBIN LT HINDUNILVR KOTAKBANK AXISBANK BAJFINANCE MARUTI SUNPHARMA HCLTECH ASIANPAINT NTPC ULTRACEMCO TITAN ONGC POWERGRID M&M BAJAJFINSV WIPRO ADANIENT ADANIPORTS COALINDIA JSWSTEEL TATASTEEL NESTLEIND TECHM GRASIM HINDALCO CIPLA DRREDDY EICHERMOT BPCL APOLLOHOSP BRITANNIA TATACONSUM SBILIFE HDFCLIFE INDUSINDBK HEROMOTOCO TRENT BAJAJ-AUTO SHRIRAMFIN ADANIPOWER JIOFIN ETERNAL'.split(' ');
var FINAL_ = { 'SL': 1, 'T1': 1, 'T2': 1, 'NT': 1, 'SKIP': 1, 'EOD+': 1, 'EOD−': 1, 'EXPIRED': 1 };

function istToday_() { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'); }
function istDow_() { return Number(Utilities.formatDate(new Date(), 'Asia/Kolkata', 'u')); } // 1=Mon … 7=Sun
function callsFile_() { var it = DriveApp.getFilesByName(CALLS_FILE); return it.hasNext() ? it.next() : null; }
function callsRead_() { var f = callsFile_(); if (!f) return { v: 1, updated: 0, days: {}, calls: [] }; try { var o = JSON.parse(f.getBlob().getDataAsString()); o.days = o.days || {}; o.calls = o.calls || []; return o; } catch (e) { return { v: 1, updated: 0, days: {}, calls: [] }; } }
function callsWrite_(o) { o.updated = Date.now(); var txt = JSON.stringify(o), f = callsFile_(); if (f) f.setContent(txt); else DriveApp.createFile(CALLS_FILE, txt, MimeType.PLAIN_TEXT); }
function callsLoad_() { return JSON.stringify(callsRead_()); }
function withLock_(fn) { var lock = LockService.getScriptLock(); lock.waitLock(25000); try { return fn(); } finally { lock.releaseLock(); } }
function mergeRec_(ex, rec) {
  if (FINAL_[ex.status] && !FINAL_[rec.status]) return ex;   // a settled call is never reopened
  for (var k in rec) ex[k] = rec[k]; return ex;
}
function callsSave_(data) {
  return withLock_(function () {
    var cur = callsRead_(), byId = {}; cur.calls.forEach(function (c, i) { byId[c.id] = i; });
    ((data && data.calls) || []).slice(0, 400).forEach(function (r) { if (!r || !r.id) return; if (byId[r.id] == null) { cur.calls.push(r); byId[r.id] = cur.calls.length - 1; } else cur.calls[byId[r.id]] = mergeRec_(cur.calls[byId[r.id]], r); });
    var d = (data && data.days) || {}; for (var k in d) if (!cur.days[k]) cur.days[k] = d[k];
    if (cur.calls.length > 4000) cur.calls = cur.calls.slice(-4000);
    callsWrite_(cur); return JSON.stringify({ ok: true, updated: cur.updated, n: cur.calls.length });
  });
}

/* ---- Yahoo chart → bars (batched, no crumb needed) ---- */
function chartUrl_(sym, range, interval) { return 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=' + range + '&interval=' + interval + '&includePrePost=false'; }
function parseBars_(txt) {
  try {
    var j = JSON.parse(txt), r = j.chart.result[0], ts = r.timestamp || [], q = r.indicators.quote[0], out = [];
    for (var i = 0; i < ts.length; i++) { var c = q.close[i]; if (c == null) continue; out.push({ t: ts[i], o: q.open[i] == null ? c : q.open[i], h: q.high[i] == null ? c : q.high[i], l: q.low[i] == null ? c : q.low[i], c: c, v: q.volume[i] || 0 }); }
    return out;
  } catch (e) { return null; }
}
function fetchBarsMany_(syms, range, interval) {
  var out = {}, CH = 20;
  for (var i = 0; i < syms.length; i += CH) {
    var part = syms.slice(i, i + CH), reqs = part.map(function (s) { return { url: chartUrl_(s, range, interval), muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Accept': '*/*' } }; }), rs;
    try { rs = UrlFetchApp.fetchAll(reqs); } catch (e) { rs = []; }
    part.forEach(function (s, k) { var r = rs[k]; out[s] = r && r.getResponseCode() === 200 ? parseBars_(r.getContentText()) : null; });
  }
  return out;
}
function yfOf_(s) { return /\.BO$/.test(s) ? s : s.replace(/\.NS$/, '') + '.NS'; }
function universe_() {
  var seen = {}, list = [];
  var add = function (s) { s = String(s).toUpperCase(); if (s && !seen[s]) { seen[s] = 1; list.push(s); } };
  try { var wl = JSON.parse(wlLoad_()); (wl.lists || []).forEach(function (l) { (l.syms || []).forEach(add); }); } catch (e) {}
  NIFTY50_.forEach(add);
  return list;
}
function addDays_(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/* ---- 08:xx IST: build today's call book ---- */
function callsBuild_(force) {
  var today = istToday_(), dow = istDow_();
  if (dow >= 6 && !force) return JSON.stringify({ ok: true, skipped: 'weekend' });
  return withLock_(function () {
    var cur = callsRead_(); if (cur.days[today] && !force) return JSON.stringify({ ok: true, skipped: 'already built', day: cur.days[today] });
    var uni = universe_(), yf = uni.map(yfOf_), data = fetchBarsMany_(yf.concat(['^NSEI', '^INDIAVIX']), '2y', '1d');
    var stocks = [], missing = [];
    uni.forEach(function (s, i) { var d = data[yf[i]]; if (d && d.length) stocks.push({ sym: s.replace(/\.BO$/, ''), ex: /\.BO$/.test(s) ? 'BO' : 'NS', daily: d }); else missing.push(s); });
    var book = JCE.buildBook({ dateIso: today, stocks: stocks, nifty: data['^NSEI'] || [], vix: data['^INDIAVIX'] || [], maxDay: 10, maxInv: 5 });
    var now = new Date().toISOString(), open = {};
    cur.calls.forEach(function (c) { if (c.type === 'INV' && !FINAL_[c.status]) open[c.sym + '.' + (c.ex || 'NS')] = 1; });
    var recs = [];
    book.day.forEach(function (c) { c.id = 'D-' + today + '-' + c.sym + (c.ex === 'BO' ? '.BO' : ''); c.status = 'WAIT'; c.createdAt = now; c.lockedAt = now; c.src = 'server'; recs.push(c); });
    book.inv.forEach(function (c) { if (open[c.sym + '.' + (c.ex || 'NS')]) return; c.id = 'I-' + today + '-' + c.sym + (c.ex === 'BO' ? '.BO' : ''); c.status = 'WAIT'; c.createdAt = now; c.lockedAt = now; c.src = 'server'; c.expires = addDays_(c.refDate, Math.ceil(c.tenureSessions * 7 / 5) + 2); recs.push(c); });
    var have = {}; cur.calls.forEach(function (c) { have[c.id] = 1; }); recs.forEach(function (r) { if (!have[r.id]) cur.calls.push(r); });
    cur.days[today] = { generatedAt: now, source: 'server', scanned: stocks.length, missing: missing.length, dayCalls: book.day.length, invCalls: book.inv.length, noTrade: book.skipped.length, ctx: book.ctx };
    callsWrite_(cur);
    return JSON.stringify({ ok: true, day: cur.days[today], calls: recs.length });
  });
}

/* ---- 16:xx IST: settle the day ---- */
function callsReconcile_() {
  var today = istToday_();
  return withLock_(function () {
    var cur = callsRead_(), dayOpen = cur.calls.filter(function (c) { return c.type === 'DAY' && c.date === today && !FINAL_[c.status]; }), inv = cur.calls.filter(function (c) { return c.type === 'INV' && !FINAL_[c.status]; });
    var syms5 = {}, symsD = {}; dayOpen.forEach(function (c) { syms5[(c.ex === 'BO' ? c.sym + '.BO' : c.sym + '.NS')] = 1; }); inv.forEach(function (c) { symsD[(c.ex === 'BO' ? c.sym + '.BO' : c.sym + '.NS')] = 1; });
    var b5 = fetchBarsMany_(Object.keys(syms5), '5d', '5m'), bd = fetchBarsMany_(Object.keys(symsD), '1y', '1d'), n1 = 0, n2 = 0, now = new Date().toISOString();
    dayOpen.forEach(function (c) {
      var bars = (b5[(c.ex === 'BO' ? c.sym + '.BO' : c.sym + '.NS')] || []).filter(function (b) { return JCE.istDate(b.t) === today; }); if (bars.length < 20) return;
      var sd = { dir: c.side === 'BUY' ? 1 : -1, entry: c.entry, sl: c.sl, t1: c.t1, t2: c.t2 }, ev = JCE.evalDay(sd, bars, c.atr, true);
      c.status = ev.state; c.fill = ev.fill; c.exitPx = ev.exitPx; c.R = ev.R; c.retPct = ev.retPct; c.daysHeld = 0; c.exitDate = today; c.settledAt = now; c.settledBy = 'server'; n1++;
    });
    inv.forEach(function (c) {
      var d = bd[(c.ex === 'BO' ? c.sym + '.BO' : c.sym + '.NS')]; if (!d) return;
      var ev = JCE.evalInvest(c, d, c.expires); c.status = ev.state; c.fill = ev.fill; c.exitPx = ev.exitPx; c.exitDate = ev.exitDate; c.R = ev.R; c.retPct = ev.retPct; c.daysHeld = ev.daysHeld; c.cmp = ev.cmp; c.checkedAt = now; n2++;
    });
    if (n1 || n2) callsWrite_(cur);
    return JSON.stringify({ ok: true, day: n1, invest: n2 });
  });
}

/* ---- triggers ---- */
function callsBuildTrigger() { callsBuild_(false); }
function callsReconcileTrigger() { if (istDow_() <= 5) callsReconcile_(); }
function installCallsTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); if (h === 'callsBuildTrigger' || h === 'callsReconcileTrigger') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('callsBuildTrigger').timeBased().atHour(8).nearMinute(10).everyDays(1).inTimezone('Asia/Kolkata').create();
  ScriptApp.newTrigger('callsReconcileTrigger').timeBased().atHour(16).nearMinute(5).everyDays(1).inTimezone('Asia/Kolkata').create();
  return 'Triggers installed: call book ≈ 08:10–08:25 IST, reconciliation ≈ 16:05–16:20 IST (weekdays).';
}
