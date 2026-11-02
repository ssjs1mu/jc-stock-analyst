/* =====================================================================
   VISITOR COUNTER + DAILY USAGE (shared by jc-stock-analyst and JCGG)
   • ?action=hit&site=stock|jcgg&new=1&city=&region=&country=   one page visit (no IP or personal data is stored — only counts by place)
   • ?action=vstats&site=...                                    totals, today, top places and today's quota use
   • ?action=usage&site=jcgg&r=<reads>&w=<writes>               Firestore operations reported by the JCGG app (batched)
   Quota use is COUNTED by this app (Google = URL-fetch calls made by this script; Firebase = Firestore reads/writes reported by JCGG),
   shown against the free-plan daily limits. It is an in-app estimate, not Google's billing meter.
   ===================================================================== */
var VC_LIMITS_ = { uf: 20000, fr: 50000, fw: 20000 };   // consumer Apps Script URL-fetch/day; Firestore Spark reads/day, writes/day

function istDay_() { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'); }
function vcClean_(s, n) { return String(s || '').replace(/[^A-Za-z0-9 .'\-]/g, '').slice(0, n || 40).trim(); }
function qInc_(k, n) {
  try {
    var P = PropertiesService.getScriptProperties(), d = istDay_(), key = 'qt_' + d, o = {};
    try { o = JSON.parse(P.getProperty(key) || '{}'); } catch (e) {}
    o[k] = (o[k] || 0) + (n || 1);
    P.setProperty(key, JSON.stringify(o));
  } catch (e) {}
}
// count every UrlFetchApp call this project makes (once per execution)
(function () {
  try {
    if (UrlFetchApp.__q) return;
    var f = UrlFetchApp.fetch, fa = UrlFetchApp.fetchAll;
    UrlFetchApp.fetch = function () { qInc_('uf'); return f.apply(UrlFetchApp, arguments); };
    UrlFetchApp.fetchAll = function (rs) { qInc_('uf', (rs && rs.length) || 1); return fa.apply(UrlFetchApp, arguments); };
    UrlFetchApp.__q = 1;
  } catch (e) {}
})();

function vcSite_(s) { return /^(stock|jcgg)$/.test(s) ? s : 'stock'; }
function vcLoad_(site) {
  var o = {};
  try { o = JSON.parse(PropertiesService.getScriptProperties().getProperty('vc_' + site) || '{}'); } catch (e) {}
  if (!o.since) { o = { since: istDay_(), total: 0, uniq: 0, days: {}, places: {} }; }
  return o;
}
function vcHit_(p) {
  var site = vcSite_(p.site), lock = LockService.getScriptLock();
  if (!lock.tryLock(4000)) return JSON.stringify({ ok: false, busy: true });
  try {
    var o = vcLoad_(site), d = istDay_();
    o.total++; if (p['new'] === '1') o.uniq++;
    o.days[d] = (o.days[d] || 0) + 1;
    var ks = Object.keys(o.days).sort(); while (ks.length > 120) delete o.days[ks.shift()];
    var city = vcClean_(p.city), reg = vcClean_(p.region), cc = vcClean_(p.country, 40) || 'Unknown';
    var pk = (city || reg || 'Unknown') + '|' + (reg && city ? reg : '') + '|' + cc;
    o.places[pk] = (o.places[pk] || 0) + 1;
    var pks = Object.keys(o.places);
    if (pks.length > 220) { pks.sort(function (a, b) { return o.places[b] - o.places[a]; }); pks.slice(160).forEach(function (k) { delete o.places[k]; }); }
    o.last = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('vc_' + site, JSON.stringify(o));
    qInc_('req');
    return JSON.stringify({ ok: true });
  } finally { lock.releaseLock(); }
}
function vcUsage_(p) {
  var r = Math.min(Math.max(parseInt(p.r, 10) || 0, 0), 200000), w = Math.min(Math.max(parseInt(p.w, 10) || 0, 0), 100000);
  if (r) qInc_('fr', r); if (w) qInc_('fw', w);
  return JSON.stringify({ ok: true });
}
function vcStats_(p) {
  var site = vcSite_(p.site), o = vcLoad_(site), d = istDay_(), q = {};
  try { q = JSON.parse(PropertiesService.getScriptProperties().getProperty('qt_' + d) || '{}'); } catch (e) {}
  var places = Object.keys(o.places).map(function (k) { var a = k.split('|'); return { city: a[0], region: a[1], country: a[2], n: o.places[k] }; })
    .sort(function (a, b) { return b.n - a.n; }).slice(0, 40);
  var pct = function (v, l) { return Math.round((v || 0) / l * 1000) / 10; };
  return JSON.stringify({
    ok: true, site: site, since: o.since, total: o.total, uniq: o.uniq, today: o.days[d] || 0, last: o.last || null, places: places, date: d,
    google: { used: q.uf || 0, limit: VC_LIMITS_.uf, pct: pct(q.uf, VC_LIMITS_.uf), requests: q.req || 0 },
    firebase: { reads: q.fr || 0, readLimit: VC_LIMITS_.fr, readPct: pct(q.fr, VC_LIMITS_.fr), writes: q.fw || 0, writeLimit: VC_LIMITS_.fw, writePct: pct(q.fw, VC_LIMITS_.fw) }
  });
}
// housekeeping: drop daily usage keys older than 3 days (add to any daily trigger, or run by hand)
function vcPrune_() {
  var P = PropertiesService.getScriptProperties(), all = P.getProperties(), keep = {};
  [0, 1, 2].forEach(function (i) { keep['qt_' + Utilities.formatDate(new Date(Date.now() - i * 864e5), 'Asia/Kolkata', 'yyyy-MM-dd')] = 1; });
  Object.keys(all).forEach(function (k) { if (/^qt_/.test(k) && !keep[k]) P.deleteProperty(k); });
}
