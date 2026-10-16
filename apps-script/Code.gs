/**
 * Joshi's Corner — Stock Analyst data backend (Google Apps Script Web App)
 * Deploy: Extensions ▸ Apps Script ▸ paste ▸ Deploy ▸ New deployment ▸ Web app
 *         Execute as: Me · Who has access: Anyone ▸ copy the /exec URL into the terminal's "Data backend" box.
 *         After editing this file: Deploy ▸ Manage deployments ▸ Edit ▸ Version: New version ▸ Deploy.
 * Actions:
 *   ?action=ping
 *   ?action=fetch&url=<encoded Yahoo / Google News URL>   allow-listed hosts only; adds Yahoo crumb+cookie where needed
 *   ?action=nse&symbol=RELIANCE   NSE: circuit band (DPR), delivery history, board-meeting (result) dates,
 *                                 quarterly + annual filed results, promoter holding  — best effort, NSE may reject cookies
 *   ?action=earn&symbols=A,B,C     Yahoo calendarEvents (next earnings date) for up to 40 NSE symbols in parallel — fallback when NSE blocks Google
 *   ?action=wl_load / POST {action:'wl_save',data}   watchlists saved as JC_Watchlists.json in YOUR Google Drive (symbols sorted A–Z)
 *   ?action=upcoming&days=7       NSE event calendar + board meetings for the next N days, the Nifty 500 list, and a per-call
 *                                 'diag' report (HTTP status / rows) so a blocked or empty NSE response is visible in the app
 */
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
var ALLOW = [/^https:\/\/query[12]\.finance\.yahoo\.com\//, /^https:\/\/news\.google\.com\/rss\//];

function doGet(e) {
  var p = (e && e.parameter) || {}, out;
  try {
    if (p.action === 'ping') out = JSON.stringify({ ok: true, v: 6, ts: new Date().toISOString() });
    else if (p.action === 'earn') out = earnDates_(p.symbols);
    else if (p.action === 'wl_load') out = wlLoad_();
    else if (p.action === 'fetch') out = proxyFetch_(p.url);
    else if (p.action === 'nse') out = nseBundle_(p.symbol);
    else if (p.action === 'upcoming') out = upcomingResults_(Math.min(Math.max(parseInt(p.days, 10) || 7, 1), 14));
    else out = JSON.stringify({ error: 'unknown action' });
  } catch (err) { out = JSON.stringify({ error: String(err) }); }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.TEXT);
}

function cookiesFrom_(resp) {
  var sc = resp.getAllHeaders()['Set-Cookie'];
  return [].concat(sc || []).map(function (s) { return String(s).split(';')[0]; }).join('; ');
}

function yahooAuth_(force) {
  var cache = CacheService.getScriptCache(), hit = force ? null : cache.get('yh_auth');
  if (hit) return JSON.parse(hit);
  var r1 = UrlFetchApp.fetch('https://fc.yahoo.com', { muteHttpExceptions: true, followRedirects: false, headers: { 'User-Agent': UA } });
  var cookies = cookiesFrom_(r1);
  var r2 = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Cookie': cookies } });
  var auth = { cookies: cookies, crumb: r2.getContentText() };
  cache.put('yh_auth', JSON.stringify(auth), 1500);
  return auth;
}

function proxyFetch_(url) {
  if (!url || !ALLOW.some(function (re) { return re.test(url); })) throw new Error('host not allowed');
  var needsCrumb = /quoteSummary|fundamentals-timeseries/.test(url);
  for (var attempt = 0; attempt < 2; attempt++) {
    var headers = { 'User-Agent': UA, 'Accept': '*/*' }, u = url;
    if (needsCrumb) { var a = yahooAuth_(attempt > 0); headers['Cookie'] = a.cookies; u += (u.indexOf('?') > -1 ? '&' : '?') + 'crumb=' + encodeURIComponent(a.crumb); }
    var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, headers: headers });
    var code = r.getResponseCode();
    if (code === 200) return r.getContentText();
    if (!(needsCrumb && (code === 401 || code === 403))) return r.getContentText();
  }
  throw new Error('Yahoo rejected the request');
}

/* ---------- NSE ---------- */
var NSE_UA_HEADERS = { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', 'Connection': 'keep-alive' };
function nseHeaders_(referer) {
  var cookies = '';
  [ 'https://www.nseindia.com/', referer ].forEach(function (u) {
    try {
      var h = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' };
      if (cookies) h['Cookie'] = cookies;
      var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, headers: h });
      var c = cookiesFrom_(r); if (c) cookies = cookies ? cookies + '; ' + c : c;
    } catch (e) {}
  });
  var o = {}; for (var k in NSE_UA_HEADERS) o[k] = NSE_UA_HEADERS[k];
  o['Referer'] = referer; o['Cookie'] = cookies; o['X-Requested-With'] = 'XMLHttpRequest';
  return o;
}
function parseJson_(r) { try { return JSON.parse(r.getContentText()); } catch (e) { return null; } }
function rowsIn_(j) { return Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : []); }
function diagOf_(name, r) {
  var txt = ''; try { txt = r.getContentText() || ''; } catch (e) {}
  var j = null; try { j = JSON.parse(txt); } catch (e) {}
  return { name: name, status: r.getResponseCode(), bytes: txt.length, json: !!j, rows: rowsIn_(j).length, sample: j ? '' : txt.replace(/\s+/g, ' ').slice(0, 90) };
}

function nseBundle_(sym) {
  if (!sym) throw new Error('symbol required');
  var S = encodeURIComponent(sym), B = 'https://www.nseindia.com/api/';
  var h = nseHeaders_('https://www.nseindia.com/get-quotes/equity?symbol=' + S);
  var tz = 'Asia/Kolkata', now = new Date(), from = new Date(now.getTime() - 35 * 86400000);
  var f = Utilities.formatDate(from, tz, 'dd-MM-yyyy'), t = Utilities.formatDate(now, tz, 'dd-MM-yyyy');
  var rq = function (u) { return { url: B + u, headers: h, muteHttpExceptions: true }; };
  var rs = UrlFetchApp.fetchAll([
    rq('quote-equity?symbol=' + S),
    rq('quote-equity?symbol=' + S + '&section=trade_info'),
    rq('historical/securityArchives?from=' + f + '&to=' + t + '&symbol=' + S + '&dataType=priceVolumeDeliverable&series=EQ'),
    rq('corporate-board-meetings?index=equities&symbol=' + S),
    rq('corporates-financial-results?index=equities&symbol=' + S + '&period=Quarterly'),
    rq('corporates-financial-results?index=equities&symbol=' + S + '&period=Annual'),
    rq('corporate-share-holdings-master?index=equities&symbol=' + S)
  ]);
  var names = ['quote', 'trade_info', 'delivery history', 'board meetings', 'results Q', 'results A', 'shareholding'];
  return JSON.stringify({ quote: parseJson_(rs[0]), trade: parseJson_(rs[1]), hist: parseJson_(rs[2]), meetings: parseJson_(rs[3]), resQ: parseJson_(rs[4]), resA: parseJson_(rs[5]), hold: parseJson_(rs[6]),
    diag: rs.map(function (r, i) { return diagOf_(names[i], r); }) });
}

function nifty500_(diag) {
  var cache = CacheService.getScriptCache(), hit = cache.get('n500');
  if (hit) { diag.push({ name: 'Nifty 500 list (cached)', status: 200, rows: JSON.parse(hit).length }); return JSON.parse(hit); }
  var out = [];
  var urls = ['https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv', 'https://archives.nseindia.com/content/indices/ind_nifty500list.csv', 'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv'];
  for (var u = 0; u < urls.length && !out.length; u++) {
    try {
      var r = UrlFetchApp.fetch(urls[u], { muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Accept': 'text/csv,*/*' } });
      var rows = r.getResponseCode() === 200 ? Utilities.parseCsv(r.getContentText()) : [];
      for (var i = 1; i < rows.length; i++) { var c = rows[i]; if (c.length >= 3 && c[2]) out.push({ symbol: String(c[2]).trim(), company: c[0], industry: c[1] }); }
      diag.push({ name: 'Nifty 500 list #' + (u + 1), status: r.getResponseCode(), rows: out.length });
    } catch (e) { diag.push({ name: 'Nifty 500 list #' + (u + 1), status: 0, rows: 0, sample: String(e).slice(0, 80) }); }
  }
  if (out.length) cache.put('n500', JSON.stringify(out), 21600);
  return out;
}

function upcomingResults_(days) {
  var tz = 'Asia/Kolkata', now = new Date(), to = new Date(now.getTime() + days * 86400000);
  var f = Utilities.formatDate(now, tz, 'dd-MM-yyyy'), t = Utilities.formatDate(to, tz, 'dd-MM-yyyy');
  var h = nseHeaders_('https://www.nseindia.com/companies-listing/corporate-filings-event-calendar'), B = 'https://www.nseindia.com/api/';
  var calls = [
    ['event-calendar (dated)', 'event-calendar?index=equities&from_date=' + f + '&to_date=' + t],
    ['event-calendar (default)', 'event-calendar?index=equities'],
    ['board-meetings (dated)', 'corporate-board-meetings?index=equities&from_date=' + f + '&to_date=' + t],
    ['board-meetings (default)', 'corporate-board-meetings?index=equities']
  ];
  var rs = UrlFetchApp.fetchAll(calls.map(function (c) { return { url: B + c[1], headers: h, muteHttpExceptions: true }; }));
  var diag = [], events = [], meetings = [];
  rs.forEach(function (r, i) { diag.push(diagOf_(calls[i][0], r)); var rows = rowsIn_(parseJson_(r)); if (i < 2) events = events.concat(rows); else meetings = meetings.concat(rows); });
  var n500 = nifty500_(diag);
  return JSON.stringify({ from: f, to: t, events: events, meetings: meetings, nifty500: n500, diag: diag });
}

/* ---------- Yahoo earnings dates (fallback calendar) ---------- */
function earnDates_(symbols) {
  var list = String(symbols || '').split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(function (x) { return /^[A-Z0-9&\-]+$/.test(x); }).slice(0, 40);
  if (!list.length) throw new Error('symbols required');
  var tz = 'Asia/Kolkata', out = [], pending = list.slice();
  for (var attempt = 0; attempt < 2 && pending.length; attempt++) {
    var a = yahooAuth_(attempt > 0), bad = [];
    var rs = UrlFetchApp.fetchAll(pending.map(function (s) {
      return { url: 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(s) + '.NS?modules=calendarEvents,price&crumb=' + encodeURIComponent(a.crumb), headers: { 'User-Agent': UA, 'Cookie': a.cookies }, muteHttpExceptions: true };
    }));
    rs.forEach(function (r, i) {
      var code = r.getResponseCode();
      if (code === 401 || code === 403) { bad.push(pending[i]); return; }
      var j = parseJson_(r), res = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
      if (!res) { out.push({ s: pending[i], d: [], err: code }); return; }
      var e = (res.calendarEvents && res.calendarEvents.earnings) || {}, ds = (e.earningsDate || []).map(function (x) { return Utilities.formatDate(new Date(x.raw * 1000), tz, 'yyyy-MM-dd'); });
      out.push({ s: pending[i], d: ds, est: !!e.isEarningsDateEstimate, name: (res.price && (res.price.longName || res.price.shortName)) || '' });
    });
    pending = bad;
  }
  pending.forEach(function (s) { out.push({ s: s, d: [], err: 401 }); });
  return JSON.stringify({ rows: out });
}

/* ---------- watchlists in Google Drive (needs Drive permission — approve once when redeploying) ---------- */
var WL_FILE = 'JC_Watchlists.json';
function wlFile_() { var it = DriveApp.getFilesByName(WL_FILE); return it.hasNext() ? it.next() : null; }
function wlLoad_() { var f = wlFile_(); return f ? f.getBlob().getDataAsString() : JSON.stringify({ empty: true }); }
function wlSave_(obj) {
  if (!obj || !Array.isArray(obj.lists)) throw new Error('bad watchlist payload');
  var clean = { updated: Number(obj.updated) || Date.now(), active: String(obj.active || ''), lists: obj.lists.slice(0, 50).map(function (l) {
    var seen = {}, syms = (l.syms || []).map(function (x) { return String(x).toUpperCase().replace(/[^A-Z0-9&\-]/g, ''); }).filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; }).sort();
    return { id: String(l.id), name: String(l.name || 'List').slice(0, 30), syms: syms.slice(0, 300) };
  }) };
  var txt = JSON.stringify(clean), f = wlFile_();
  if (f) f.setContent(txt); else DriveApp.createFile(WL_FILE, txt, MimeType.PLAIN_TEXT);
  return JSON.stringify({ ok: true, updated: clean.updated, bytes: txt.length });
}
function doPost(e) {
  var out;
  try { var b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); out = b.action === 'wl_save' ? wlSave_(b.data) : JSON.stringify({ error: 'unknown action' }); }
  catch (err) { out = JSON.stringify({ error: String(err) }); }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.TEXT);
}
