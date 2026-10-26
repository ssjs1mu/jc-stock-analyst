/* ---------- Early-Mover Radar: candidate screening data (added 2026-10-26 by Claude) ----------
   qstat  : ?action=qstat&symbols=A.NS,B.NS (<=100)  one Yahoo quote call -> [price, mcap, eps, pe, avgVol3m, avgVol10d, ma50, ma200, hi52, lo52]
   qfund  : ?action=qfund&symbols=A.NS,...  (<=30)   Yahoo quoteSummary financialData per symbol -> [revGrowth, profitMargin, roe, debtToEquity, opCashFlow]
   Used only to decide which extra (non-NSE-500) stocks the radar scans; the thresholds live in radarcore.js (JCRadarCore.eligible). */
function qStat_(symbols) {
  var syms = String(symbols || '').split(',').filter(String).slice(0, 100);
  var ck = 'qs:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, syms.join(','))).slice(0, 40), cc = CacheService.getScriptCache();
  try { var h = cc.get(ck); if (h) return h; } catch (e) { }
  var out = {}, codes = [];
  for (var attempt = 0; attempt < 2 && !Object.keys(out).length; attempt++) {
    var a = yahooAuth_(attempt > 0);
    var r = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(syms.join(',')) + '&crumb=' + encodeURIComponent(a.crumb), { muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Accept': '*/*', 'Cookie': a.cookies } });
    codes.push(r.getResponseCode());
    try { (JSON.parse(r.getContentText()).quoteResponse.result || []).forEach(function (q) { if (q.regularMarketPrice != null) out[q.symbol] = [q.regularMarketPrice, q.marketCap, q.epsTrailingTwelveMonths, q.trailingPE, q.averageDailyVolume3Month, q.averageDailyVolume10Day, q.fiftyDayAverage, q.twoHundredDayAverage, q.fiftyTwoWeekHigh, q.fiftyTwoWeekLow]; }); } catch (e) { }
  }
  var res = JSON.stringify({ ok: Object.keys(out).length > 0, n: Object.keys(out).length, codes: codes, q: out, ts: Date.now() });
  try { if (res.indexOf('"ok":true') > -1 && res.length < 95000) cc.put(ck, res, 21600); } catch (e) { }
  return res;
}
function qFund_(symbols) {
  var syms = String(symbols || '').split(',').filter(String).slice(0, 30), out = {}, a = yahooAuth_(false);
  var reqs = syms.map(function (s) { return { url: 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(s) + '?modules=financialData&crumb=' + encodeURIComponent(a.crumb), muteHttpExceptions: true, headers: { 'User-Agent': UA, 'Accept': '*/*', 'Cookie': a.cookies } }; });
  var rs = UrlFetchApp.fetchAll(reqs), codes = [];
  rs.forEach(function (r, i) {
    codes.push(r.getResponseCode());
    try { var f = JSON.parse(r.getContentText()).quoteSummary.result[0].financialData, g = function (k) { return f[k] && f[k].raw != null ? f[k].raw : null; }; out[syms[i]] = [g('revenueGrowth'), g('profitMargins'), g('returnOnEquity'), g('debtToEquity'), g('operatingCashflow')]; } catch (e) { }
  });
  return JSON.stringify({ ok: Object.keys(out).length > 0, n: Object.keys(out).length, codes: codes.slice(0, 5), f: out, ts: Date.now() });
}
