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
 *   ?action=dash&symbols=^NSEI,GC=F,...   Joshi's Dashboard: one call returns price, previous close, last-tick time and an intraday sparkline for up to 60 Yahoo symbols (cached 20 s)
 *   ?action=in10y   India 10-year G-Sec yield (CNBC quote feed: last + previous close)
 *   ?action=pcr     Nifty put-call ratio (open interest, nearest expiry) from the NSE option chain — best effort, NSE may reject Google
 *   ?action=wl_load / POST {action:'wl_save',data}   watchlists saved as JC_Watchlists.json in YOUR Google Drive (symbols sorted A–Z)
 *   ?action=calls_load / calls_build[&force=1] / calls_reconcile / POST {action:'calls_save'}   the call book (JC_Calls.json): Today's Calls at 8:30 AM, tracking, 'Our Recommendations'
 *   ?action=upcoming&days=7       NSE event calendar + board meetings for the next N days, the Nifty 500 list, and a per-call
 *                                 'diag' report (HTTP status / rows) so a blocked or empty NSE response is visible in the app
 */
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
var ALLOW = [/^https:\/\/query[12]\.finance\.yahoo\.com\//, /^https:\/\/news\.google\.com\/rss\//];

function doGet(e) {
  var p = (e && e.parameter) || {}, out;
  try {
    if (p.action === 'ping') out = JSON.stringify({ ok: true, v: 13, ts: new Date().toISOString() });
    else if (p.action === 'earn') out = earnDates_(p.symbols);
    else if (p.action === 'dash') out = dashQuotes_(p.symbols);
    else if (p.action === 'in10y') out = in10y_();
    else if (p.action === 'pcr') out = pcrNifty_();
    else if (p.action === 'wl_load') out = wlLoad_();
    else if (p.action === 'calls_load') out = callsLoad_();
    else if (p.action === 'calls_build') out = callsBuild_(p.force === '1');
    else if (p.action === 'calls_reconcile') out = callsReconcile_();
    else if (p.action === 'fetch') out = proxyFetch_(p.url);
    else if (p.action === 'nse') out = nseBundle_(p.symbol);
    else if (p.action === 'universe') out = bfUniverse_();
    else if (p.action === 'ytlive') out = ytLive_(p.channel);
    else if (p.action === 'liveq') out = liveQ_(p.symbols);
    else if (p.action === 'dailyb') out = dailyBatch_(p.symbols, p.range);
    else if (p.action === 'preopen') out = preOpen_();
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

/* ---- Pre-Market Big Fish support: index constituents, compact daily bars in batches, NSE pre-open ---- */
function idxCsv_(file, key) {
  var cache = CacheService.getScriptCache(), hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var out = [], hosts = ['https://nsearchives.nseindia.com/content/indices/', 'https://archives.nseindia.com/content/indices/', 'https://www.niftyindices.com/IndexConstituent/'];
  for (var u = 0; u < hosts.length && !out.length; u++) {
    try {
      var r = UrlFetchApp.fetch(hosts[u] + file, { muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Accept': 'text/csv,*/*' } });
      var rows = r.getResponseCode() === 200 ? Utilities.parseCsv(r.getContentText()) : [];
      for (var i = 1; i < rows.length; i++) { var c = rows[i]; if (c.length >= 3 && c[2]) out.push({ s: String(c[2]).trim(), n: c[0], i: c[1] }); }
    } catch (e) {}
  }
  if (out.length) cache.put(key, JSON.stringify(out), 21600);
  return out;
}
function bfUniverse_() {
  var src = 'Nifty MidSmallCap 400', list = idxCsv_('ind_niftymidsmallcap400list.csv', 'msc400');
  if (!list.length) {
    var n5 = idxCsv_('ind_nifty500list.csv', 'n500b'), n1 = idxCsv_('ind_nifty100list.csv', 'n100b'), big = {};
    n1.forEach(function (x) { big[x.s] = 1; });
    if (n5.length && n1.length) { list = n5.filter(function (x) { return !big[x.s]; }); src = 'Nifty 500 minus Nifty 100 (= MidSmallCap 400)'; }
  }
  return JSON.stringify({ src: list.length ? src : '', list: list, ts: new Date().toISOString() });
}
/* live quotes for up to ~500 symbols in a handful of Yahoo v7/quote calls (crumb auth): [price, prevClose, open, dayHigh, dayLow, dayVolume, avgVol10d, marketTime] */
function liveQ_(symbols) {
  var syms = String(symbols || '').split(',').filter(String).slice(0, 520), out = {}, codes = [];
  for (var attempt = 0; attempt < 2 && !Object.keys(out).length; attempt++) {
    var a = yahooAuth_(attempt > 0), reqs = [];
    for (var i = 0; i < syms.length; i += 100) reqs.push({ url: 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(syms.slice(i, i + 100).join(',')) + '&crumb=' + encodeURIComponent(a.crumb), muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Accept': '*/*', 'Cookie': a.cookies } });
    var rs = UrlFetchApp.fetchAll(reqs); codes = [];
    rs.forEach(function (r) {
      codes.push(r.getResponseCode());
      try { (JSON.parse(r.getContentText()).quoteResponse.result || []).forEach(function (q) { if (q.regularMarketPrice != null) out[q.symbol] = [q.regularMarketPrice, q.regularMarketPreviousClose, q.regularMarketOpen, q.regularMarketDayHigh, q.regularMarketDayLow, q.regularMarketVolume, q.averageDailyVolume10Day, q.regularMarketTime]; }); } catch (e) {}
    });
  }
  return JSON.stringify({ ok: Object.keys(out).length > 0, n: Object.keys(out).length, codes: codes, q: out, ts: Date.now() });
}
function dailyBatch_(symbols, range) {
  var syms = String(symbols || '').split(',').filter(String).slice(0, 40), rg = /^(5d|1mo|3mo|6mo|1y|2y)$/.test(range) ? range : '3mo', out = {};
  var reqs = syms.map(function (s) { return { url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?range=' + rg + '&interval=1d&includePrePost=false', muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Accept': '*/*' } }; });
  var rs = UrlFetchApp.fetchAll(reqs);
  rs.forEach(function (r, i) {
    try {
      var j = JSON.parse(r.getContentText()), res = j.chart.result[0], q = res.indicators.quote[0], t = res.timestamp, o = { t: [], o: [], h: [], l: [], c: [], v: [] };
      for (var k = 0; k < t.length; k++) { if (q.close[k] == null || q.high[k] == null || q.low[k] == null || q.open[k] == null) continue; o.t.push(t[k]); o.o.push(q.open[k]); o.h.push(q.high[k]); o.l.push(q.low[k]); o.c.push(q.close[k]); o.v.push(q.volume[k] || 0); }
      if (o.t.length) out[syms[i]] = o;
    } catch (e) {}
  });
  return JSON.stringify({ n: Object.keys(out).length, bars: out });
}
/* current live video id of a YouTube channel (the live_stream?channel= embed is refused for several Indian news channels, the watch-id embed is not) */
function ytLive_(channel) {
  if (!/^UC[\w-]{22}$/.test(String(channel || ''))) return JSON.stringify({ ok: false, err: 'bad channel' });
  var cache = CacheService.getScriptCache(), key = 'ytl_' + channel, hit = cache.get(key);
  if (hit) return hit;
  var r = UrlFetchApp.fetch('https://www.youtube.com/channel/' + channel + '/live', { muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'CONSENT=YES+1; SOCS=CAI' } });
  var t = r.getContentText(), live = /"isLive":true|"isLiveNow":true|BADGE_STYLE_TYPE_LIVE_NOW|"liveBroadcastDetails":\{[^}]*"isLiveNow":true/.test(t);
  var m = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(t) || /"videoId":"([\w-]{11})"/.exec(t);
  var out = JSON.stringify({ ok: !!m, vid: m ? m[1] : '', live: live, lc: /"isLiveContent":true/.test(t), ts: new Date().toISOString() });
  if (m) cache.put(key, out, live ? 240 : 60);
  return out;
}
function preOpen_() {
  try {
    var h = nseHeaders_('https://www.nseindia.com/market-data/pre-open-market-cm-and-emerge-market');
    var r = UrlFetchApp.fetch('https://www.nseindia.com/api/market-data-pre-open?key=ALL', { muteHttpExceptions: true, headers: h });
    var j = JSON.parse(r.getContentText()), rows = {};
    (j.data || []).forEach(function (d) { var m = d.metadata || d; if (m && m.symbol) rows[m.symbol] = { p: m.previousClose, i: m.iep || m.lastPrice, c: m.pChange, q: m.finalQuantity || m.totalTradedVolume || 0, b: m.totalBuyQuantity || 0, a: m.totalSellQuantity || 0 }; });
    return JSON.stringify({ ok: Object.keys(rows).length > 0, n: Object.keys(rows).length, ts: new Date().toISOString(), rows: rows });
  } catch (e) { return JSON.stringify({ ok: false, err: String(e).slice(0, 100) }); }
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

/* ---------- Joshi's Dashboard: batched live quotes (Yahoo chart feed, 15-min bars) ---------- */
function dashQuotes_(symbols) {
  var list = String(symbols || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return /^[A-Za-z0-9\^=.\-&]+$/.test(x); }).slice(0, 60);
  if (!list.length) throw new Error('symbols required');
  var cache = CacheService.getScriptCache(), key = 'dash:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, list.join(','))).slice(0, 40), hit = cache.get(key);
  if (hit) return hit;
  var rs = UrlFetchApp.fetchAll(list.map(function (s) {
    return { url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?range=1d&interval=15m&includePrePost=false', headers: { 'User-Agent': UA, 'Accept': '*/*' }, muteHttpExceptions: true };
  }));
  var rows = rs.map(function (r, i) {
    var j = parseJson_(r), x = j && j.chart && j.chart.result && j.chart.result[0];
    if (!x) return { s: list[i], err: r.getResponseCode() };
    var m = x.meta || {}, q = (x.indicators && x.indicators.quote && x.indicators.quote[0]) || {}, c = (q.close || []).filter(function (v) { return v != null; }).slice(-40).map(function (v) { return Math.round(v * 10000) / 10000; });
    return { s: list[i], p: m.regularMarketPrice, pc: m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose, t: m.regularMarketTime, sp: c };
  });
  var out = JSON.stringify({ rows: rows, ts: new Date().toISOString() });
  if (out.length < 90000) cache.put(key, out, 20);
  return out;
}

/* ---------- India 10Y G-Sec yield + Nifty PCR (best effort; the app shows n/a when a source refuses) ---------- */
function in10y_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('in10y'); if (hit) return hit;
  if (cache.get('in10y_fail')) throw new Error('India 10Y feed unavailable (recent failure)');
  try {
    var r = UrlFetchApp.fetch('https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=IN10Y&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1', { muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    var j = parseJson_(r), q = j && j.FormattedQuoteResult && j.FormattedQuoteResult.FormattedQuote && j.FormattedQuoteResult.FormattedQuote[0];
    var num = function (v) { return v == null ? NaN : parseFloat(String(v).replace(/[%,]/g, '')); };
    var p = q ? num(q.last) : NaN, pc = q ? num(q.previous_day_closing) : NaN;
    if (isNaN(p)) throw new Error('bad response ' + r.getResponseCode());
    var out = JSON.stringify({ p: p, pc: isNaN(pc) ? null : pc, d: q.last_time || '', sp: [] });
    cache.put('in10y', out, 900); return out;
  } catch (e) { cache.put('in10y_fail', '1', 1800); throw new Error('India 10Y unavailable: ' + String(e).slice(0, 80)); }
}
function pcrNifty_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('pcr'); if (hit) return hit;
  if (cache.get('pcr_fail')) throw new Error('NSE option chain unavailable (recent failure)');
  if (cache.get('pcr_busy')) throw new Error('NSE option chain request in progress');
  cache.put('pcr_busy', '1', 120);
  try {
    var h = nseHeaders_('https://www.nseindia.com/option-chain');
    var r = UrlFetchApp.fetch('https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY', { headers: h, muteHttpExceptions: true });
    var j = parseJson_(r), f = j && j.filtered;
    if (!f || !f.CE || !f.PE || !f.CE.totOI) throw new Error('NSE ' + r.getResponseCode());
    var out = JSON.stringify({ pcr: f.PE.totOI / f.CE.totOI, ce: f.CE.totOI, pe: f.PE.totOI, expiry: j.records && j.records.expiryDates && j.records.expiryDates[0], ts: j.records && j.records.timestamp, u: j.records && j.records.underlyingValue });
    cache.put('pcr', out, 120); return out;
  } catch (e) { cache.put('pcr_fail', '1', 1800); throw new Error('NSE option chain unavailable: ' + String(e).slice(0, 80)); }
  finally { cache.remove('pcr_busy'); }
}

/* ---------- watchlists in Google Drive (needs Drive permission — approve once when redeploying) ---------- */
var WL_FILE = 'JC_Watchlists.json';
function wlFile_() { var it = DriveApp.getFilesByName(WL_FILE); return it.hasNext() ? it.next() : null; }
function wlLoad_() { var f = wlFile_(); return f ? f.getBlob().getDataAsString() : JSON.stringify({ empty: true }); }
function wlSave_(obj) {
  if (!obj || !Array.isArray(obj.lists)) throw new Error('bad watchlist payload');
  var clean = { updated: Number(obj.updated) || Date.now(), active: String(obj.active || ''), lists: obj.lists.slice(0, 50).map(function (l) {
    var seen = {}, syms = (l.syms || []).map(function (x) { var u = String(x).toUpperCase(), bo = /\.BO$/.test(u); u = u.replace(/\.(NS|BO)$/, '').replace(/[^A-Z0-9&\-]/g, ''); return u ? (bo ? u + '.BO' : u) : ''; }).filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; }).sort();
    return { id: String(l.id), name: String(l.name || 'List').slice(0, 30), syms: syms.slice(0, 300) };
  }) };
  var txt = JSON.stringify(clean), f = wlFile_();
  if (f) f.setContent(txt); else DriveApp.createFile(WL_FILE, txt, MimeType.PLAIN_TEXT);
  return JSON.stringify({ ok: true, updated: clean.updated, bytes: txt.length });
}
function doPost(e) {
  var out;
  try { var b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); out = b.action === 'wl_save' ? wlSave_(b.data) : b.action === 'calls_save' ? callsSave_(b.data) : JSON.stringify({ error: 'unknown action' }); }
  catch (err) { out = JSON.stringify({ error: String(err) }); }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.TEXT);
}
