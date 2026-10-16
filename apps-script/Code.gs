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
    if (p.action === 'ping') out = JSON.stringify({ ok: true, v: 15, ts: new Date().toISOString() });
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
/* live quotes for up to ~500 symbols in a handful of Yahoo v7/quote calls (crumb auth): [price, prevClose, open, dayHigh, dayLow, dayVolume, avgVol10d, marketTime, 52wHigh, 52wLow] */
function liveQ_(symbols) {
  var syms = String(symbols || '').split(',').filter(String).slice(0, 520), out = {}, codes = [];
  for (var attempt = 0; attempt < 2 && !Object.keys(out).length; attempt++) {
    var a = yahooAuth_(attempt > 0), reqs = [];
    for (var i = 0; i < syms.length; i += 100) reqs.push({ url: 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(syms.slice(i, i + 100).join(',')) + '&crumb=' + encodeURIComponent(a.crumb), muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Accept': '*/*', 'Cookie': a.cookies } });
    var rs = UrlFetchApp.fetchAll(reqs); codes = [];
    rs.forEach(function (r) {
      codes.push(r.getResponseCode());
      try { (JSON.parse(r.getContentText()).quoteResponse.result || []).forEach(function (q) { if (q.regularMarketPrice != null) out[q.symbol] = [q.regularMarketPrice, q.regularMarketPreviousClose, q.regularMarketOpen, q.regularMarketDayHigh, q.regularMarketDayLow, q.regularMarketVolume, q.averageDailyVolume10Day, q.regularMarketTime, q.fiftyTwoWeekHigh, q.fiftyTwoWeekLow]; }); } catch (e) {}
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
function pcrUpstox_() {
  var r = UrlFetchApp.fetch('https://upstox.com/option-chain/nifty/', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept': 'text/html' }, muteHttpExceptions: true });
  var h = r.getContentText();
  if (r.getResponseCode() !== 200 || h.length < 20000) throw new Error('Upstox ' + r.getResponseCode());
  var rows = h.match(/<tr[\s\S]*?<\/tr>/g) || [], ce = 0, pe = 0, n = 0;
  rows.forEach(function (x) {
    var t = [], m, re = /<td[^>]*>([\s\S]*?)<\/td>/g;
    while ((m = re.exec(x))) t.push(m[1].replace(/<[^>]+>/g, '').replace(/,/g, '').trim());
    if (t.length >= 19) { var a = parseFloat(t[6]), b = parseFloat(t[12]); if (!isNaN(a) && !isNaN(b)) { ce += a; pe += b; n++; } }
  });
  if (n < 20 || !ce) throw new Error('Upstox table not found');
  var ts = (h.match(/Updated:\s*([^<]{5,40})/) || [])[1];
  var ex = (h.match(/>\s*(\d{1,2} [A-Z][a-z]{2})\s*</) || [])[1];
  return { pcr: pe / ce, ce: ce * 1e5, pe: pe * 1e5, expiry: ex, ts: ts && ts.trim(), src: 'Upstox (weekly expiry chain)', n: n };
}
function pcrNifty_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('pcr'); if (hit) return hit;
  if (cache.get('pcr_busy')) throw new Error('PCR request in progress');
  cache.put('pcr_busy', '1', 60);
  try {
    var out;
    try { out = JSON.stringify(pcrUpstox_()); }
    catch (e1) {
      if (cache.get('pcr_fail')) throw e1;
      var h = nseHeaders_('https://www.nseindia.com/option-chain');
      var r = UrlFetchApp.fetch('https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY', { headers: h, muteHttpExceptions: true });
      var j = parseJson_(r), f = j && j.filtered;
      if (!f || !f.CE || !f.PE || !f.CE.totOI) { cache.put('pcr_fail', '1', 900); throw new Error('Upstox: ' + String(e1).slice(0, 50) + '; NSE ' + r.getResponseCode()); }
      out = JSON.stringify({ pcr: f.PE.totOI / f.CE.totOI, ce: f.CE.totOI, pe: f.PE.totOI, expiry: j.records && j.records.expiryDates && j.records.expiryDates[0], ts: j.records && j.records.timestamp, u: j.records && j.records.underlyingValue, src: 'NSE' });
    }
    cache.put('pcr', out, 120); return out;
  } finally { cache.remove('pcr_busy'); }
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

/* ===================== calls_engine.js (JCE) — generated, do not edit here ===================== */
/* ============================================================
   Joshi's Corner — CALLS ENGINE (JCE)
   One pure-JS file, no DOM, no network. It runs in three places with identical results:
     • the terminal (index.html)  • Node (tests / back-tests)  • Google Apps Script (8:30 AM call book, post-close reconciliation)
   Bars are {t (unix seconds), o, h, l, c, v}. Daily bars must END at the previous completed session.
   Nothing here "predicts" — it only issues a call when several independent parameters agree, and it replays the same rules on
   real 5-minute candles so every call carries its own track record.
   ============================================================ */
var JCE = (function () {
  'use strict';
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var last = function (a) { return a[a.length - 1]; };
  var istDate = function (t) { return new Date((t + 19800) * 1000).toISOString().slice(0, 10); };
  var istMin = function (t) { return Math.floor(((t + 19800) % 86400) / 60); };

  /* ---------- indicators ---------- */
  function ema(a, n) { var o = new Array(a.length).fill(null), k = 2 / (n + 1), s = 0, c = 0, p = null; for (var i = 0; i < a.length; i++) { var v = a[i]; if (!isNum(v)) continue; if (p === null) { s += v; c++; if (c === n) { p = s / n; o[i] = p; } } else { p = v * k + p * (1 - k); o[i] = p; } } return o; }
  function wilder(a, n) { var o = new Array(a.length).fill(null), f = -1; for (var i = 0; i < a.length; i++) if (isNum(a[i])) { f = i; break; } if (f < 0 || a.length - f < n) return o; var s = 0; for (var j = f; j < f + n; j++) s += a[j]; o[f + n - 1] = s / n; for (var q = f + n; q < a.length; q++) o[q] = (o[q - 1] * (n - 1) + a[q]) / n; return o; }
  function rsi(c, n) { n = n || 14; var g = [null], l = [null]; for (var i = 1; i < c.length; i++) { var d = c[i] - c[i - 1]; g.push(d > 0 ? d : 0); l.push(d < 0 ? -d : 0); } var ag = wilder(g, n), al = wilder(l, n); return ag.map(function (x, i) { return x == null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + x / al[i]); }); }
  function trs(b) { return b.map(function (x, i) { return i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)); }); }
  function atr(b, n) { return wilder(trs(b), n || 14); }
  function adx(b, n) {
    n = n || 14; var pd = [0], md = [0], tr = trs(b);
    for (var i = 1; i < b.length; i++) { var up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l; pd.push(up > dn && up > 0 ? up : 0); md.push(dn > up && dn > 0 ? dn : 0); }
    var str = wilder(tr, n), sp = wilder(pd, n), sm = wilder(md, n), pdi = [], mdi = [], dx = [];
    for (var j = 0; j < b.length; j++) { if (str[j] == null || !str[j]) { pdi.push(null); mdi.push(null); dx.push(null); continue; } var a = 100 * sp[j] / str[j], m = 100 * sm[j] / str[j]; pdi.push(a); mdi.push(m); dx.push(a + m === 0 ? 0 : 100 * Math.abs(a - m) / (a + m)); }
    return { adx: wilder(dx, n), pdi: pdi, mdi: mdi };
  }
  function macdHist(c) { var ef = ema(c, 12), es = ema(c, 26), m = c.map(function (_, i) { return ef[i] != null && es[i] != null ? ef[i] - es[i] : null; }), sg = ema(m, 9); return m.map(function (v, i) { return v != null && sg[i] != null ? v - sg[i] : null; }); }
  function sma(a, n, k) { if (k + 1 < n) return null; var s = 0; for (var i = k - n + 1; i <= k; i++) s += a[i]; return s / n; }
  function pivots(h, l, c) { var P = (h + l + c) / 3, BC = (h + l) / 2, TC = 2 * P - BC, r = h - l; return { P: P, R1: 2 * P - l, R2: P + r, R3: h + 2 * (P - l), S1: 2 * P - h, S2: P - r, S3: l - 2 * (h - P), cprTop: Math.max(BC, TC), cprBot: Math.min(BC, TC), cprPct: Math.abs(TC - BC) / P * 100, H3: c + r * 1.1 / 4, H4: c + r * 1.1 / 2, L3: c - r * 1.1 / 4, L4: c - r * 1.1 / 2 }; }
  function dedupe(arr) { var o = []; arr.forEach(function (l) { if (!o.length || Math.abs(l.v - last(o).v) / l.v > 0.002) o.push(l); }); return o; }
  var below = function (L, x, gap, k) { return dedupe(L.filter(function (l) { return isNum(l.v) && l.v < x - gap; }).sort(function (a, b) { return b.v - a.v; })).slice(0, k); };
  var above = function (L, x, gap, k) { return dedupe(L.filter(function (l) { return isNum(l.v) && l.v > x + gap; }).sort(function (a, b) { return a.v - b.v; })).slice(0, k); };

  /* ---------- tunables ---------- */
  var CFG = {
    minScore: 6.0,        // |confluence score| needed for a day-trading call (max ≈ 12)
    gradeA: 7.5, gradeAA: 9.0,
    minAdx: 15,           // below this the stock is chopping — no call (unless score ≥ gradeAA)
    minAtrPct: 0.9, maxAtrPct: 6.5,
    minTurnover: 3e7,     // avg 20-day ₹ turnover (price × volume)
    minPrice: 50,
    vixHigh: 24,          // above this India VIX demands a stronger score
    slMin: 0.40, slMax: 0.75, t1MinAtr: 0.55, t2MinGap: 0.45,
    entryBuf: 0.03,       // trigger = prev high/low ± 3 % of ATR
    chaseMax: 0.25,       // skip if the confirming candle closes > 25 % ATR beyond the trigger
    gapSkip: 0.30,        // skip if the day opens > 30 % ATR beyond the trigger
    noEntryAfter: 14 * 60 + 30, firstEntryBar: 1, squareOff: 15 * 60 + 15,
    minRR1: 1.5,          // first target must pay at least 1.5× the risk (back-test: calls with R:R<1.5 had no edge after costs)
    costPct: 0.05         // brokerage + STT + slippage, % of price (round trip) charged against every triggered trade
  };

  /* ---------- market regime (Nifty trend + India VIX), keyed by the date of the last completed session ---------- */
  function mktSeries(nifty, vix) {
    var out = {}; if (!nifty || nifty.length < 60) return out;
    var c = nifty.map(function (b) { return b.c; }), e20 = ema(c, 20), e50 = ema(c, 50), r = rsi(c, 14), mh = macdHist(c);
    var vmap = {}, vc = (vix || []).map(function (b) { return b.c; }), vidx = {};
    (vix || []).forEach(function (b, i) { var d = istDate(b.t); vmap[d] = b.c; vidx[d] = i; });
    nifty.forEach(function (b, i) {
      if (e50[i] == null || r[i] == null) return; var d = istDate(b.t);
      var s = (c[i] > e20[i] ? 1 : -1) + (e20[i] > e50[i] ? 1 : -1) + (r[i] > 54 ? 1 : r[i] < 46 ? -1 : 0) + (mh[i] != null ? (mh[i] > 0 ? 0.5 : -0.5) : 0);
      var v = vmap[d], vi = vidx[d], vAvg = isNum(vi) && vi >= 20 ? sma(vc, 20, vi) : null;
      out[d] = { reg: s, bias: s >= 2 ? 'Bullish' : s <= -2 ? 'Bearish' : 'Neutral', rsi: r[i], vix: isNum(v) ? v : null, vixHigh: isNum(v) && v > CFG.vixHigh, vixRising: isNum(v) && isNum(vAvg) && v > vAvg * 1.12, chg: i ? (c[i] / c[i - 1] - 1) * 100 : 0 };
    });
    return out;
  }

  /* ---------- everything we know about a stock as of the close of bar k ---------- */
  function ctxAt(dd, k) {
    if (!dd._ind) {
      var c = dd.map(function (b) { return b.c; }), A = adx(dd, 14);
      dd._ind = { e20: ema(c, 20), e50: ema(c, 50), e200: ema(c, 200), rsi: rsi(c, 14), atr: atr(dd, 14), adx: A.adx, pdi: A.pdi, mdi: A.mdi, mh: macdHist(c) };
    }
    var I = dd._ind, b = dd[k], p = dd[k - 1] || b, rng = Math.max(1e-9, b.h - b.l);
    var vol20 = 0, n20 = 0; for (var i = Math.max(0, k - 20); i < k; i++) { vol20 += dd[i].v; n20++; } vol20 = n20 ? vol20 / n20 : 0;
    var hi20 = -Infinity, lo20 = Infinity; for (var j = Math.max(0, k - 19); j <= k; j++) { hi20 = Math.max(hi20, dd[j].h); lo20 = Math.min(lo20, dd[j].l); }
    return { i: k, date: b.date || istDate(b.t), o: b.o, h: b.h, l: b.l, c: b.c, pc: p.c, e20: I.e20[k], e50: I.e50[k], e200: I.e200[k], rsi: I.rsi[k], atr: I.atr[k], adx: I.adx[k], pdi: I.pdi[k], mdi: I.mdi[k], mh: I.mh[k], mhPrev: I.mh[k - 1],
      pos: (b.c - b.l) / rng, green: b.c > b.o, rv: vol20 ? b.v / vol20 : null, turnover: vol20 * b.c, hi20: hi20, lo20: lo20, piv: pivots(b.h, b.l, b.c), chgPct: p.c ? (b.c / p.c - 1) * 100 : 0 };
  }

  /* ---------- confluence score for a day-trading call ---------- */
  function scoreDay(x, m) {
    var pts = [], S = 0, add = function (label, v, txt) { pts.push({ label: label, v: v, txt: txt }); S += v; };
    var stack = (x.c > x.e20 ? 1 : -1) + (x.e20 > x.e50 ? 1 : -1) + (isNum(x.e200) ? (x.e50 > x.e200 ? 1 : -1) : 0);
    add('Trend', stack, stack >= 2 ? 'price > 20 > 50' + (isNum(x.e200) ? ' > 200 DMA' : ' DMA') : stack <= -2 ? 'price < 20 < 50' + (isNum(x.e200) ? ' < 200 DMA' : ' DMA') : 'mixed moving averages');
    var dirDI = x.pdi > x.mdi ? 1 : -1, aPts = x.adx >= 25 ? 2 * dirDI : x.adx >= 18 ? dirDI : 0;
    add('ADX ' + (isNum(x.adx) ? x.adx.toFixed(0) : '–'), aPts, x.adx >= 25 ? 'strong trend, ' + (dirDI > 0 ? '+DI' : '−DI') + ' leads' : x.adx >= 18 ? 'developing trend' : 'no trend (chop)');
    var rp = x.rsi >= 55 && x.rsi <= 72 ? 1 : x.rsi <= 45 && x.rsi >= 28 ? -1 : 0;
    add('RSI ' + (isNum(x.rsi) ? x.rsi.toFixed(0) : '–'), rp, rp > 0 ? 'bullish momentum, not stretched' : rp < 0 ? 'bearish momentum, not washed-out' : x.rsi > 72 ? 'overbought — no fresh longs' : x.rsi < 28 ? 'oversold — no fresh shorts' : 'neutral');
    var mp = isNum(x.mh) ? (x.mh > 0 ? (x.mh > (x.mhPrev || 0) ? 1 : 0.5) : (x.mh < (x.mhPrev || 0) ? -1 : -0.5)) : 0;
    add('MACD', mp, mp > 0 ? 'histogram positive' + (mp === 1 ? ' & rising' : '') : mp < 0 ? 'histogram negative' + (mp === -1 ? ' & falling' : '') : 'flat');
    var cp = x.pos > 0.7 && x.green ? 1 : x.pos < 0.3 && !x.green ? -1 : 0;
    add('Prev-day close', cp, cp > 0 ? 'closed in top 30 % of its range, green candle' : cp < 0 ? 'closed in bottom 30 % of its range, red candle' : 'mid-range close');
    var vp = isNum(x.rv) && x.rv >= 1.3 ? (x.green ? 1 : -1) : 0;
    add('Volume', vp, vp ? (x.rv.toFixed(1) + '× average volume on a ' + (x.green ? 'green' : 'red') + ' day') : 'volume normal');
    var cpr = x.c > x.piv.cprTop ? 1 : x.c < x.piv.cprBot ? -1 : 0;
    add('CPR', cpr, cpr > 0 ? 'closed above CPR' : cpr < 0 ? 'closed below CPR' : 'closed inside CPR');
    var nearHi = x.c >= x.hi20 * 0.99, nearLo = x.c <= x.lo20 * 1.01, px = nearHi ? 1 : nearLo ? -1 : 0;
    add('20-day range', px, nearHi ? 'at 20-day high (breakout fuel)' : nearLo ? 'at 20-day low (breakdown risk)' : 'inside the 20-day range');
    var mv = 0, mtxt = 'index data n/a';
    if (m) { mv = m.reg >= 3 ? 1.5 : m.reg >= 2 ? 1 : m.reg <= -3 ? -1.5 : m.reg <= -2 ? -1 : 0; mtxt = 'Nifty ' + m.bias.toLowerCase() + (isNum(m.vix) ? ' · VIX ' + m.vix.toFixed(1) : ''); }
    add('Market', mv, mtxt);
    return { S: S, pts: pts, narrowCpr: x.piv.cprPct < 0.4 };
  }

  /* ---------- plan for one session from the previous session's data ---------- */
  function dayPlanFor(dd, k, mkt) {
    var x = ctxAt(dd, k), m = (mkt && mkt[x.date]) || null, a = x.atr;
    var out = { date: x.date, ref: { h: x.h, l: x.l, c: x.c }, atr: a, ctx: x, mkt: m, sides: [], bias: 'No trade', score: 0, grade: '', pts: [], reasons: [] };
    if (!isNum(a) || !isNum(x.e50)) { out.reasons.push('not enough history'); return out; }
    var sc = scoreDay(x, m); out.pts = sc.pts; out.score = sc.S; out.narrowCpr = sc.narrowCpr;
    var abs = Math.abs(sc.S), dir = sc.S > 0 ? 1 : -1, atrPct = a / x.c * 100, why = out.reasons;
    var need = CFG.minScore; if (m && m.vixHigh) need += 1.5; if (m && m.vixRising) need += 0.5; if (m && ((dir > 0 && m.reg <= -2) || (dir < 0 && m.reg >= 2))) need += 2; if (sc.narrowCpr) need -= 0.5;
    if (abs < need) why.push('confluence ' + abs.toFixed(1) + ' < ' + need.toFixed(1) + ' needed');
    if (isNum(x.adx) && x.adx < CFG.minAdx && abs < CFG.gradeAA) why.push('ADX ' + x.adx.toFixed(0) + ' — chopping');
    if (atrPct < CFG.minAtrPct) why.push('range too small (ATR ' + atrPct.toFixed(1) + '%)'); if (atrPct > CFG.maxAtrPct) why.push('too volatile (ATR ' + atrPct.toFixed(1) + '%)');
    if (x.turnover < CFG.minTurnover) why.push('thin liquidity'); if (x.c < CFG.minPrice) why.push('price below ₹' + CFG.minPrice);
    if (dir > 0 && x.rsi > 78) why.push('RSI stretched'); if (dir < 0 && x.rsi < 22) why.push('RSI washed-out');
    if (why.length) { out.bias = 'No trade'; return out; }
    var lv = [], addL = function (v, l) { if (isNum(v)) lv.push({ v: v, label: l }); }, rp = x.piv;
    ['R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3'].forEach(function (q) { addL(rp[q], 'Pivot ' + q); }); addL(rp.cprTop, 'CPR top'); addL(rp.cprBot, 'CPR bottom'); addL(rp.H3, 'Camarilla H3'); addL(rp.H4, 'Camarilla H4'); addL(rp.L3, 'Camarilla L3'); addL(rp.L4, 'Camarilla L4'); addL(x.h, 'Prev high'); addL(x.l, 'Prev low'); addL(x.hi20, '20-day high'); addL(x.lo20, '20-day low');
    var entry = dir > 0 ? x.h + CFG.entryBuf * a : x.l - CFG.entryBuf * a;
    var near = (dir > 0 ? below(lv, entry, 0.2 * a, 1) : above(lv, entry, 0.2 * a, 1))[0];
    var risk = near ? Math.abs(entry - near.v) + 0.1 * a : 0.55 * a; risk = Math.min(CFG.slMax * a, Math.max(CFG.slMin * a, risk));
    var minGap = Math.max(CFG.t1MinAtr * a, 1.0 * risk), ups = dir > 0 ? above(lv, entry, minGap, 2) : below(lv, entry, minGap, 2);
    var t1 = ups[0] ? ups[0].v : entry + dir * Math.max(0.75 * a, 1.3 * risk);
    var t2 = ups[1] ? ups[1].v : t1 + dir * Math.max(0.6 * a, 1.0 * risk); if (dir * (t2 - t1) < CFG.t2MinGap * a) t2 = t1 + dir * 0.6 * a;
    var sd = { dir: dir, side: dir > 0 ? 'BUY' : 'SELL', entry: entry, sl: entry - dir * risk, t1: t1, t2: t2, risk: risk, rr1: Math.abs(t1 - entry) / risk, rr2: Math.abs(t2 - entry) / risk, t1Why: ups[0] ? ups[0].label : 'ATR projection', t2Why: ups[1] ? ups[1].label : 'ATR projection' };
    if (sd.rr1 < CFG.minRR1) { why.push('first target too close for the risk (R:R ' + sd.rr1.toFixed(2) + ' < ' + CFG.minRR1 + ')'); return out; }
    out.sides = [sd]; out.bias = dir > 0 ? 'Bullish' : 'Bearish'; out.grade = abs >= CFG.gradeAA ? 'A+' : abs >= CFG.gradeA ? 'A' : 'B';
    return out;
  }

  /* ---------- one call evaluated on 5-minute candles ----------
     Entry = a 5-min candle CLOSING beyond the trigger (wicks don't count), not before 09:20, not after 14:30, not if the day gaps/chases past it.
     Stop moves to cost after T1; half booked at T1, half at T2 / stop-at-cost / 15:15 square-off. Stop & target in one bar → stop first. */
  function evalDay(sd, bars, atrv, final) {
    var d = sd.dir, fill = null, fi = -1, cfg = CFG, i, b;
    for (i = 0; i < bars.length; i++) {
      b = bars[i]; var mn = istMin(b.t);
      if (i === 0) { var gapBy = d > 0 ? b.o - sd.entry : sd.entry - b.o; if (gapBy > cfg.gapSkip * atrv) return { state: 'SKIP', fill: null, R: 0, fi: 0 }; }
      if (i < cfg.firstEntryBar) continue;
      if (mn >= cfg.noEntryAfter) break;
      var beyond = d > 0 ? b.c >= sd.entry : b.c <= sd.entry;
      if (beyond) { var over = d > 0 ? b.c - sd.entry : sd.entry - b.c; if (over > cfg.chaseMax * atrv) return { state: 'SKIP', fill: null, R: 0, fi: i }; fill = b.c; fi = i; break; }
    }
    var lastB = last(bars);
    if (fi < 0) return { state: final || (lastB && istMin(lastB.t) >= cfg.noEntryAfter) ? 'NT' : 'WAIT', fill: null, R: 0, fi: -1, cmp: lastB ? lastB.c : null };
    var risk = Math.abs(fill - sd.sl) || atrv * 0.3, pr = function (px) { return d * (px - fill) / risk; }, costR = (cfg.costPct / 100 * fill) / risk;
    var t1hit = false, outcome = null, stop = sd.sl, exitPx = null, exitI = -1;
    for (i = fi + 1; i < bars.length; i++) {
      b = bars[i]; var slH = d > 0 ? b.l <= stop : b.h >= stop, t1H = d > 0 ? b.h >= sd.t1 : b.l <= sd.t1, t2H = d > 0 ? b.h >= sd.t2 : b.l <= sd.t2;
      if (!t1hit) { if (slH) { outcome = 'SL'; exitPx = stop; exitI = i; break; } if (t1H) { t1hit = true; stop = fill; if (t2H) { outcome = 'T2'; exitPx = sd.t2; exitI = i; break; } } }
      else { if (slH) { outcome = 'T1'; exitPx = stop; exitI = i; break; } if (t2H) { outcome = 'T2'; exitPx = sd.t2; exitI = i; break; } }
      if (istMin(b.t) >= cfg.squareOff) { outcome = 'EOD'; exitPx = b.c; exitI = i; break; }
    }
    var R, state;
    if (outcome === 'SL') { R = -1; state = 'SL'; }
    else if (outcome === 'T2') { R = (pr(sd.t1) + pr(sd.t2)) / 2; state = 'T2'; }
    else if (outcome === 'T1') { R = pr(sd.t1) / 2; state = 'T1'; }
    else if (outcome === 'EOD') { R = t1hit ? (pr(sd.t1) + pr(exitPx)) / 2 : pr(exitPx); state = t1hit ? 'T1' : R >= 0 ? 'EOD+' : 'EOD−'; }
    else { R = t1hit ? (pr(sd.t1) + pr(lastB.c)) / 2 : pr(lastB.c); state = final ? (t1hit ? 'T1' : R >= 0 ? 'EOD+' : 'EOD−') : 'LIVE'; if (final) exitPx = lastB.c; }
    var live = !final && !outcome; if (!live) R -= costR;
    return { state: state, fill: fill, fi: fi, R: R, t1hit: t1hit, live: live, pnlPct: d * (lastB.c - fill) / fill * 100, cmp: lastB.c, exitPx: exitPx, retPct: (R * risk / fill) * 100, riskPct: risk / fill * 100, exitT: exitI >= 0 ? bars[exitI].t : null };
  }

  /* ---------- replay: the same rules on past sessions ---------- */
  function sessionsOf(m5) { var s = {}; m5.forEach(function (x) { var d = istDate(x.t); (s[d] = s[d] || []).push(x); }); return s; }
  function replay(dd, m5, mkt, opts) {
    opts = opts || {}; var sess = sessionsOf(m5), dates = Object.keys(sess).sort(), res = [];
    var idxBefore = function (d) { var k = -1; for (var i = 0; i < dd.length; i++) { if (dd[i].date < d) k = i; else break; } return k; };
    dates.forEach(function (d) {
      if (sess[d].length < 25 || (opts.upTo && d >= opts.upTo)) return; var k = idxBefore(d); if (k < 60) return;
      var plan = dayPlanFor(dd, k, mkt), r = { date: d, plan: plan, sd: plan.sides[0] || null, ev: null };
      if (r.sd) r.ev = evalDay(r.sd, sess[d], plan.atr, true); res.push(r);
    });
    return res;
  }
  function summarize(rs) {
    var a = { sessions: rs.length, calls: 0, trig: 0, tgt: 0, sl: 0, eodP: 0, eodN: 0, nt: 0, skip: 0, netR: 0, netPct: 0, wins: 0, grossW: 0, grossL: 0 };
    rs.forEach(function (r) { if (!r.sd) return; a.calls++; var s = r.ev.state; if (s === 'NT') { a.nt++; return; } if (s === 'SKIP') { a.skip++; return; } a.trig++; a.netR += r.ev.R; a.netPct += r.ev.retPct; if (r.ev.R > 0) { a.wins++; a.grossW += r.ev.R; } else a.grossL += -r.ev.R; if (s === 'T1' || s === 'T2') a.tgt++; else if (s === 'SL') a.sl++; else if (s === 'EOD+') a.eodP++; else a.eodN++; });
    a.hit = a.trig ? a.tgt / a.trig : null; a.slRate = a.trig ? a.sl / a.trig : null; a.win = a.trig ? a.wins / a.trig : null; a.avgR = a.trig ? a.netR / a.trig : null; a.pf = a.grossL ? a.grossW / a.grossL : null; return a;
  }

  /* ---------- investment (positional) call — long-only, delivery ---------- */
  function investFor(dd, k, nifty, mkt) {
    var x = ctxAt(dd, k); if (k < 210 || !isNum(x.e200) || !isNum(x.atr)) return null;
    var I = dd._ind, e200Prev = I.e200[k - 20], why = [], pts = 0;
    if (!(x.c > x.e50 && x.e50 > x.e200 && isNum(e200Prev) && x.e200 > e200Prev)) return null;
    if (x.turnover < 1e8 || x.c < 100) return null;
    var ret63 = k >= 63 ? x.c / dd[k - 63].c - 1 : null, nret = null;
    if (nifty && nifty.length > 70) { var ni = -1; for (var q = nifty.length - 1; q >= 0; q--) { if (istDate(nifty[q].t) <= x.date) { ni = q; break; } } if (ni >= 63) nret = nifty[ni].c / nifty[ni - 63].c - 1; }
    var rs = isNum(ret63) && isNum(nret) ? ret63 - nret : null;
    pts += 2; why.push('Stage-2 uptrend: price > 50 DMA > rising 200 DMA');
    if (x.adx >= 18 && x.pdi > x.mdi) { pts += 1; why.push('ADX ' + x.adx.toFixed(0) + ' with +DI leading'); }
    if (isNum(rs) && rs > 0.02) { pts += 1; why.push('Outperforming Nifty by ' + (rs * 100).toFixed(0) + ' pts over 3 months'); } else if (isNum(rs) && rs < -0.03) return null;
    var hi55 = -Infinity; for (var j = Math.max(0, k - 54); j <= k; j++) hi55 = Math.max(hi55, dd[j].h);
    var dd20 = (x.hi20 - x.c) / x.hi20, setup = null, entry, mode;
    if (x.c <= x.e20 * 1.025 && x.c >= x.e50 * 0.985 && x.rsi >= 38 && x.rsi <= 58 && dd20 >= 0.03 && dd20 <= 0.14) { setup = 'Pullback to the 20/50 DMA support inside an uptrend (RSI ' + x.rsi.toFixed(0) + ')'; entry = x.c; mode = 'limit'; pts += 2; }
    else if (x.c >= hi55 * 0.99 && isNum(x.rv) && x.rv >= 1.2 && x.c <= x.e20 * 1.08) { setup = 'Breakout at the 55-day high on ' + x.rv.toFixed(1) + '× volume'; entry = hi55 * 1.003; mode = 'stop'; pts += 2; }
    if (!setup) return null; why.push(setup);
    if (isNum(x.rv) && x.rv >= 1.0 && x.green) pts += 0.5;
    var m = mkt && mkt[x.date]; if (m) { if (m.reg >= 1) { pts += 1; why.push('Nifty regime ' + m.bias.toLowerCase()); } else if (m.reg <= -2) { pts -= 1.5; why.push('Nifty regime weak (−)'); } }
    if (pts < 5.5) return null;
    var low10 = Math.min.apply(null, dd.slice(k - 9, k + 1).map(function (b) { return b.l; })), sl = Math.min(low10 - 0.1 * x.atr, x.e50 - 0.5 * x.atr), rp = (entry - sl) / entry * 100;
    if (rp > 9) { sl = entry * 0.91; rp = 9; } if (rp < 3.5) { sl = entry * 0.965; rp = 3.5; }
    var risk = entry - sl, t1 = entry + 2 * risk, t2 = entry + 3.5 * risk, sessions = Math.max(10, Math.ceil((t2 - entry) / (0.3 * x.atr)));
    var label = sessions <= 15 ? '2–3 weeks' : sessions <= 30 ? '1–1.5 months' : sessions <= 60 ? '2–3 months' : '3–6 months';
    return { type: 'INV', side: 'BUY', mode: mode, entry: entry, entryLo: entry * 0.99, entryHi: entry * 1.005, sl: sl, t1: t1, t2: t2, risk: risk, riskPct: rp, rr1: 2, rr2: 3.5, score: pts, grade: pts >= 7 ? 'A+' : pts >= 6 ? 'A' : 'B', tenureSessions: sessions, tenure: label, why: why, atr: x.atr, refDate: x.date, refClose: x.c };
  }
  /* daily bars after the issue date → state of a positional call. 'limit' = buy when price trades down to entry, 'stop' = buy when it trades up through it.
     Not filled within 5 sessions → NT. Stop-loss on any session low; half off at T1 (stop → cost), rest at T2; unresolved at the tenure date → EXPIRED at that close. */
  function evalInvest(call, daily, expiryIso) {
    var bars = daily.filter(function (b) { return istDate(b.t) > call.refDate; }), out = { state: 'WAIT', fill: null, exitPx: null, exitDate: null, R: 0, retPct: 0, daysHeld: 0, cmp: null };
    var fill = null, entryIdx = -1, t1hit = false, stop = call.sl, i, b, day, risk, pr, held;
    for (i = 0; i < bars.length; i++) {
      b = bars[i]; day = istDate(b.t); out.cmp = b.c;
      if (fill === null) {
        var trig = call.mode === 'stop' ? b.h >= call.entry : b.l <= call.entry;
        if (!trig) { if (i + 1 >= 5) { out.state = 'NT'; out.exitDate = day; } continue; }
        fill = call.mode === 'stop' ? Math.max(call.entry, b.o) : Math.min(call.entry, b.o); entryIdx = i; out.fill = fill; out.state = 'OPEN';
        risk = Math.max(fill - call.sl, fill * 0.02); pr = (function (f, r) { return function (px) { return (px - f) / r; }; })(fill, risk);
        if (b.l <= stop && b.c < fill) { out.state = 'SL'; out.exitPx = stop; out.exitDate = day; out.R = -1; out.retPct = (stop - fill) / fill * 100; out.daysHeld = 1; return out; }
        continue;
      }
      if (out.state === 'NT') return out;
      held = i - entryIdx + 1;
      var slH = b.l <= stop, t1H = b.h >= call.t1, t2H = b.h >= call.t2;
      var fin = function (state, px, R) { out.state = state; out.exitPx = px; out.exitDate = day; out.R = R; out.retPct = R * risk / fill * 100; out.daysHeld = held; return out; };
      if (!t1hit) { if (slH) { var sx = Math.min(stop, b.o); return fin('SL', sx, Math.max(-1.3, pr(sx))); } if (t1H) { t1hit = true; stop = fill; if (t2H) return fin('T2', call.t2, (pr(call.t1) + pr(call.t2)) / 2); } }
      else { if (slH) return fin('T1', stop, pr(call.t1) / 2); if (t2H) return fin('T2', call.t2, (pr(call.t1) + pr(call.t2)) / 2); }
      var Rm = t1hit ? (pr(call.t1) + pr(b.c)) / 2 : pr(b.c);
      if (expiryIso && day >= expiryIso) return fin('EXPIRED', b.c, Rm);
      out.state = t1hit ? 'T1·OPEN' : 'OPEN'; out.daysHeld = held; out.R = Rm; out.retPct = Rm * risk / fill * 100;
    }
    if (fill === null && out.state !== 'NT') out.state = bars.length >= 5 ? 'NT' : 'WAIT';
    if (fill !== null && out.state === 'OPEN' && out.cmp != null) { out.R = (t1hit ? (pr(call.t1) + pr(out.cmp)) / 2 : pr(out.cmp)); out.retPct = out.R * risk / fill * 100; }
    return out;
  }

  /* ---------- the call book for one morning ---------- */
  function buildBook(inputs) {
    // inputs: { dateIso, stocks: [{sym, ex, daily:[...]}], nifty:[...], vix:[...], maxDay, maxInv }
    var mkt = mktSeries(inputs.nifty, inputs.vix), today = inputs.dateIso, day = [], inv = [], skipped = [];
    inputs.stocks.forEach(function (s) {
      var dd = (s.daily || []).filter(function (b) { return istDate(b.t) < today; }).map(function (b) { return Object.assign({ date: istDate(b.t) }, b); });
      if (dd.length < 80) { skipped.push({ sym: s.sym, why: 'only ' + dd.length + ' sessions of history' }); return; }
      var k = dd.length - 1, plan = dayPlanFor(dd, k, mkt);
      if (plan.sides.length) {
        var sd = plan.sides[0], m = plan.mkt;
        day.push({ type: 'DAY', sym: s.sym, ex: s.ex || 'NS', date: today, side: sd.side, entry: sd.entry, sl: sd.sl, t1: sd.t1, t2: sd.t2, rr1: sd.rr1, rr2: sd.rr2, t1Why: sd.t1Why, t2Why: sd.t2Why, risk: sd.risk, atr: plan.atr, score: Math.abs(plan.score), grade: plan.grade,
          why: plan.pts.filter(function (p) { return Math.sign(p.v) === sd.dir; }).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); }).slice(0, 6).map(function (p) { return p.label + ': ' + p.txt; }), cmp0: plan.ref.c, regime: m ? m.bias : null });
      } else skipped.push({ sym: s.sym, why: plan.reasons.join('; ') || 'no edge' });
      var iv = investFor(dd, k, inputs.nifty, mkt);
      if (iv) inv.push(Object.assign(iv, { sym: s.sym, ex: s.ex || 'NS', date: today }));
    });
    day.sort(function (a, b) { return b.score - a.score; }); inv.sort(function (a, b) { return b.score - a.score; });
    var keys = Object.keys(mkt).filter(function (d) { return d < today; }).sort(), m0 = keys.length ? mkt[keys[keys.length - 1]] : null;
    return { day: day.slice(0, inputs.maxDay || 12), inv: inv.slice(0, inputs.maxInv || 5), skipped: skipped, ctx: m0 ? { regime: m0.bias, reg: m0.reg, vix: m0.vix, vixHigh: m0.vixHigh, niftyRsi: m0.rsi, niftyChg: m0.chg } : null };
  }

  return { CFG: CFG, isNum: isNum, istDate: istDate, istMin: istMin, ema: ema, rsi: rsi, atr: atr, adx: adx, macdHist: macdHist, pivots: pivots, ctxAt: ctxAt, scoreDay: scoreDay, mktSeries: mktSeries, dayPlanFor: dayPlanFor, evalDay: evalDay, sessionsOf: sessionsOf, replay: replay, summarize: summarize, investFor: investFor, evalInvest: evalInvest, buildBook: buildBook };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = JCE;

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
var UNI500_ = 'ABB ADANIENSOL ADANIENT ADANIGREEN ADANIPORTS ADANIPOWER AMBUJACEM APOLLOHOSP ASIANPAINT DMART AXISBANK BSE BAJAJ-AUTO BAJFINANCE BAJAJFINSV BAJAJHLDNG BANKBARODA BEL BPCL BHARTIARTL BOSCHLTD BRITANNIA CGPOWER CANBK CHOLAFIN CIPLA COALINDIA CUMMINSIND DLF DIVISLAB DRREDDY EICHERMOT ETERNAL GAIL GODREJCP GRASIM HCLTECH HDFCAMC HDFCBANK HDFCLIFE HINDALCO HAL HINDUNILVR HINDZINC POWERINDIA HYUNDAI ICICIBANK ITC IOC IRFC INFY INDIGO JSWSTEEL JINDALSTEL JIOFIN KOTAKBANK LTM LT M&M MARUTI MAXHEALTH MAZDOCK MUTHOOTFIN NTPC NESTLEIND ONGC PIDILITIND POLYCAB PFC POWERGRID PNB RELIANCE SBILIFE MOTHERSON SHRIRAMFIN ENRIN SIEMENS SOLARINDS SBIN SUNPHARMA TVSMOTOR TATACAP TCS TATACONSUM TMCV TMPV TATAPOWER TATASTEEL TECHM TITAN TORNTPHARM TRENT ULTRACEMCO UNIONBANK VBL VAML VEDL IDEA WIPRO ZYDUSLIFE 360ONE ACC ACMESOLAR AIAENG APLAPOLLO AUBANK AWL AADHARHFC AARTIIND AAVAS ABBOTINDIA ACE ACUTAAS ATGL ABCAPITAL ABREL ABSLAMC CPPLUS AEGISLOG AEGISVOPAK AETHER AFCONS AFFLE AJANTPHARM ALKEM ABDL ARE&M AMBER ANANDRATHI ANANTRAJ ANGELONE ANTHEM ANURAS APARINDS APOLLOTYRE APTUS ASAHIINDIA ASHOKLEY ASTERDM ASTRAL ATHERENERG ATUL AUROPHARMA AIIL AVANTIFEED AZAD BEML BLS BAGMANE BAJAJHFL BALKRISIND BALRAMCHIN BANDHANBNK BANKINDIA MAHABANK BATAINDIA BELRISE BERGEPAINT BHARATCOAL BDL BHARATFORG BHEL BHARTIHEXA GROWW BIOCON BSOFT BBOX BLUESTARCO FIRSTCRY BRIGADE BIRET CCL CESC CIEINDIA CRISIL CANFINHOME CANHLIFE CAPLIPOINT CGCL CARBORUNIV CARTRADE CASTROLIND CEATLTD CEMPRO CENTRALBK CDSL CMPDI CHAMBLFERT CHENNPETRO CHOICEIN CHOLAHLDNG CUB CLEANMAX CLEAN COCHINSHIP COFORGE COHANCE COLPAL CAMS CONCORDBIO CONCOR COROMANDEL CRAFTSMAN CREDITACC CROMPTON CUPID CYIENT DOMS DABUR DALBHARAT DATAPATTNS DEEPAKFERT DEEPAKNTR DELHIVERY DEVYANI DIXON LALPATHLAB EIDPARRY EMBASSY ELECON ELGIEQUIP EMAMILTD EMCURE EMMVEE ENDURANCE ENGINERSIN ESCORTS EXIDEIND NYKAA FEDERALBNK FACT FINCABLES FSL FIVESTAR FORCEMOT FORTIS FRACTAL GVT&D GMRAIRPORT GABRIEL GALLANTT GRSE GICRE GILLETTE GLAND GLAXO GLENMARK MEDANTA GPIL GODFRYPHLP GODREJIND GODREJPROP GRANULES GRAPHITE GRAVITA GESHIP FLUOROCHEM GMDCLTD HBLENGINE HDBFS HEGAM HFCL HAVELLS HEROMOTOCO HEXT HSCL HINDCOPPER HINDPETRO HOMEFIRST HONASA HONAUT HUDCO ICICIGI ICICIAMC ICICIPRULI IDBI IDFCFIRSTB IFCI IIFL INOXINDIA IRB IRCON ITCHOTELS ITI INDIACEM INDIAMART INDIANB IEX INDHOTEL IOB IRCTC IREDA IGL INDUSTOWER INDUSINDBK NAUKRI INOXWIND INTELLECT IGIL IKS IPCALAB JKCEMENT JBMA JKTYRE JMFINANCIL JSWCEMENT JSWENERGY JSWINFRA JAINREC JPPOWER J&KBANK JINDALSAW JSL JUBLFOOD JUBLINGREA JWL JYOTICNC KPRMILL KEI KPITTECH KSB KAJARIACER KPIL KALYANKJIL KARURVYSYA KAYNES KEC KFINTECH KIRLOSBROS KIRLOSENG KIMS LTF LTTS LGEINDIA LICHSGFIN LTFOODS LAURUSLABS LEMONTREE LENSKART LICI LINDEINDIA LLOYDSME LODHA LUPIN MMTC MRF MTARTECH MGL M&MFIN MANAPPURAM MRPL MANKIND MARICO MFSL MEESHO MINDACORP MSUMI MOTILALOFS MPHASIS MCX NATCOPHARM NBCC NCC NHPC NLCINDIA NMDC NSLNISP NTPCGREEN NH NATIONALUM NAVA NAVINFLUOR NETWEB NEULANDLAB NAM-INDIA NUVAMA NUVOCO OBEROIRLTY OIL OLAELEC OLECTRA PAYTM ONESOURCE OFSS POLICYBZR PCBL PGEL PIIND PNBHOUSING PTCIL PVRINOX PAGEIND PARADEEP PATANJALI PERSISTENT PETRONET PHOENIXLTD PWL PINELABS PIRAMALFIN PPLPHARMA POLYMED POONAWALLA PREMIERENE PRESTIGE PFOCUS PRIVISCL RRKABEL RBLBANK RECLTD RHIM RITES RADICO RVNL RAILTEL RAINBOW RKFORGE REDINGTON RPOWER RUBICON SBICARD SJVN SHRIPISTON SRF SAGILITY SAILIFE SAMMAANCAP SANSERA SARDAEN SCHAEFFLER SCHNEIDER SCI SHREECEM SHYAMMETL SIGNATURE SOBHA SONACOMS STARHEALTH SAIL STLTECH SUMICHEM SUNTV SUNDARMFIN SUPREMEIND SUZLON SWANCORP SWIGGY SYNGENE SYRMA TBOTEK TDPOWERSYS TATACHEM TATACOMM TATAELXSI TATAINVEST TATATECH TTML TECHNOE TEGA TEJASNET TENNIND THANGAMAYL NIACL RAMCOCEM THERMAX TIMKEN TITAGARH TORNTPOWER TARIL TRIDENT TRITURBINE TIINDIA UCOBANK UNOMINDA UPL UTIAMC UBL UNITDSPR URBANCO USHAMART VTL VISL VOGL VEDPOWER VIJAYA VMM VOLTAS WAAREEENER WELCORP WELSPUNLIV WHIRLPOOL WOCKPHARMA YESBANK ZFCVINDIA ZEEL ZENTEC ZENSARTECH ZYDUSWELL ECLERX';
function universe_() {
  var seen = {}, list = [];
  var add = function (s) { s = String(s).toUpperCase(); if (s && !seen[s]) { seen[s] = 1; list.push(s); } };
  try { var wl = JSON.parse(wlLoad_()); (wl.lists || []).forEach(function (l) { (l.syms || []).forEach(add); }); } catch (e) {}
  NIFTY50_.forEach(add);
  UNI500_.split(' ').forEach(add);
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


/* ===================== Telegram auto-poster =====================
   Every 5 minutes, looks at the GitHub Pages report indexes and posts each newly published report (today's date, status ok)
   to your Telegram channel. Runs on Google's servers - needs no Claude session, no subscription.
   ONE-TIME SETUP (you do this, so the bot token never passes through chat):
     1. In Telegram, talk to @BotFather -> /newbot -> copy the token. Add the bot as an ADMINISTRATOR of your channel.
     2. Apps Script editor -> Project Settings (gear) -> Script properties -> add:
          TG_TOKEN = <bot token>      TG_CHAT = @yourchannelname   (or the numeric id like -100123456789)
     3. Run installTelegramTrigger() once (authorise when asked). Run tgTest() to send a test line.            */
var TG_SITE = 'https://ssjs1mu.github.io/jc-stock-analyst/';
var TG_IDS = ['premarket-news', 'morning-brief', 'morning-detailed', 'morning-pulse', 'evening-market-wrap', 'evening-news-wrap', 'closing-auction', 'circuit-watch'];
function tgProps_() { var p = PropertiesService.getScriptProperties(); var t = p.getProperty('TG_TOKEN'), c = p.getProperty('TG_CHAT'); if (!t || !c) throw new Error('Set TG_TOKEN and TG_CHAT in Script properties first'); return { p: p, t: t, c: c }; }
function tgTest() { var s = tgProps_(); var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/sendMessage', { method: 'post', payload: { chat_id: s.c, text: "Joshi's Corner report feed connected." }, muteHttpExceptions: true }); Logger.log(r.getContentText()); return r.getContentText(); }
function installTelegramTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tgPostReports') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tgPostReports').timeBased().everyMinutes(5).create();
}
function tgPostReports() {
  var s = tgProps_(), sent = {}; try { sent = JSON.parse(s.p.getProperty('TG_SENT') || '{}'); } catch (e) { }
  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'), n = 0;
  TG_IDS.forEach(function (id) {
    try {
      var r = UrlFetchApp.fetch(TG_SITE + 'reports/' + id + '/index.json?t=' + Date.now(), { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) return;
      var runs = (JSON.parse(r.getContentText()).runs || []).filter(function (x) { return x.date === today && x.status === 'ok' && x.files && x.files.length; });
      if (!runs.length) return;
      runs.sort(function (a, b) { return a.generated_at < b.generated_at ? 1 : -1; });
      var run = runs[0]; if (sent[id] && sent[id] >= run.generated_at) return;
      var f = run.files.filter(function (x) { return x.type === 'png'; })[0] || run.files[0];
      var blob = UrlFetchApp.fetch(TG_SITE + f.path, { muteHttpExceptions: true }).getBlob().setName(f.name);
      var cap = (run.caption || f.name).slice(0, 900);
      var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/' + (f.type === 'png' ? 'sendPhoto' : 'sendDocument'), { method: 'post', payload: { chat_id: s.c, caption: cap, [f.type === 'png' ? 'photo' : 'document']: blob }, muteHttpExceptions: true });
      if (res.getResponseCode() === 200) { sent[id] = run.generated_at; n++; } else Logger.log(id + ' ' + res.getContentText());
    } catch (e) { Logger.log(id + ' ' + e); }
  });
  s.p.setProperty('TG_SENT', JSON.stringify(sent)); return n;
}
