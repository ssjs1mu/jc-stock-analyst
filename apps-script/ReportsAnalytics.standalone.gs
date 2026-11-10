/* Joshi's Corner - report analytics store. Free: Google Apps Script + a Google Sheet.
   Deploy once (see README.md). doPost appends events; doGet?action=stats returns aggregates only. */
var SHEETS = {
  view:     ['ts', 'report', 'rdate', 'lang', 'dev', 'name', 'ref', 'w'],
  depth:    ['ts', 'report', 'rdate', 'lang', 'dev', 'name', 'pages', 'of'],
  open:     ['ts', 'report', 'rdate', 'lang', 'dev', 'name', 'target'],
  feedback: ['ts', 'report', 'rdate', 'lang', 'dev', 'name', 'rating', 'useful', 'comment']
};
function sheet_(t) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(t);
  if (!sh) { sh = ss.insertSheet(t); sh.appendRow(SHEETS[t]); sh.setFrozenRows(1); }
  return sh;
}
function doPost(e) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ev = JSON.parse(e.postData.contents).events || [], by = {};
    ev.forEach(function (x) { if (SHEETS[x.type]) (by[x.type] = by[x.type] || []).push(SHEETS[x.type].map(function (c) { return String(x[c] === undefined ? '' : x[c]).slice(0, 500); })); });
    Object.keys(by).forEach(function (t) { var sh = sheet_(t); sh.getRange(sh.getLastRow() + 1, 1, by[t].length, SHEETS[t].length).setNumberFormat('@').setValues(by[t]); });
  } finally { lock.release(); }
  return ContentService.createTextOutput('ok');
}
function rows_(t) { var sh = sheet_(t), v = sh.getDataRange().getValues(); v.shift(); return v; }
function doGet(e) {
  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'), mon = today.slice(0, 7), yr = today.slice(0, 4), out = {generated: today, reports: {}};
  function R(k) { return out.reports[k] = out.reports[k] || {day: 0, month: 0, ytd: 0, total: 0, uday: {}, umon: {}, uytd: {}, rate_n: 0, rate_sum: 0, useful_yes: 0, useful_n: 0, by_lang: {}, series: {}}; }
  rows_('view').forEach(function (r) {
    var d = (r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Kolkata', 'yyyy-MM-dd') : String(r[0]).slice(0, 10)), x = R(r[1]); x.total++;
    if (d === today) { x.day++; x.uday[r[4]] = 1; } if (d.slice(0, 7) === mon) { x.month++; x.umon[r[4]] = 1; } if (d.slice(0, 4) === yr) { x.ytd++; x.uytd[r[4]] = 1; }
    x.by_lang[r[3]] = (x.by_lang[r[3]] || 0) + 1; x.series[d] = (x.series[d] || 0) + 1;
  });
  rows_('feedback').forEach(function (r) { var x = R(r[1]); x.rate_n++; x.rate_sum += +r[6] || 0; if (r[7]) { x.useful_n++; if (r[7] === 'yes') x.useful_yes++; } });
  Object.keys(out.reports).forEach(function (k) { var x = out.reports[k]; x.unique_day = Object.keys(x.uday).length; x.unique_month = Object.keys(x.umon).length; x.unique_ytd = Object.keys(x.uytd).length; delete x.uday; delete x.umon; delete x.uytd; x.avg_rating = x.rate_n ? Math.round(x.rate_sum / x.rate_n * 100) / 100 : null; delete x.rate_sum;
    var keep = Object.keys(x.series).sort().slice(-35), s = {}; keep.forEach(function (d) { s[d] = x.series[d]; }); x.series = s; });
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
