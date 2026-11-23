/* ===================== Client uploads -> Google Drive (Portfolio / Trade Audit pages of jcgg-dashboard) =====================
   POST {action:'pf_save', key:<admin passcode>, type:'trade'|'ledger'|'dp', name:<original file name>, files:[{client:<code>, csv:<text>}]}
   Saves one CSV per client code (codes only - the pages never send client names) under
     Joshi's Corner - Client Uploads / Trade files | Ledger | DP holdings / <CLIENT CODE> / <CODE> <type> <yyyy-mm-dd HHmm> (<original name>).csv
   POST {action:'pf_load', key} -> the newest CSV of every client code in each type folder, so an upload made on one device
   (phone app, laptop) loads on every other device: {ok, files:[{type:'trade'|'ledger'|'dp', client, id, t:<created ms>, name, csv}]}
   - every trade file and ledger of a client (oldest first: each covers its own dates, the page merges them date-wise); DP: newest only
   Needs the admin passcode (same as the client watchlists). */
var PF_ROOT_NAME = "Joshi's Corner - Client Uploads";
var PF_TYPES = { trade: 'Trade files', ledger: 'Ledger', dp: 'DP holdings' };
function pfFolder_(parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function pfRoot_() {
  var P = PropertiesService.getScriptProperties(), id = P.getProperty('PF_ROOT');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { } }
  var it = DriveApp.getFoldersByName(PF_ROOT_NAME), r = it.hasNext() ? it.next() : DriveApp.createFolder(PF_ROOT_NAME);
  P.setProperty('PF_ROOT', r.getId()); return r;
}
function pfSave_(b) {
  var type = PF_TYPES[String(b.type || '')]; if (!type) throw new Error('unknown upload type');
  var files = b.files || []; if (!files.length || files.length > 500) throw new Error('nothing to save');
  var orig = String(b.name || 'upload').replace(/[^\w .()+-]/g, '_').slice(0, 80);
  var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HHmm');
  return pfLock_(function () {
    var tf = pfFolder_(pfRoot_(), type), out = [];
    files.forEach(function (f) {
      var c = String(f.client || '').toUpperCase().trim(), csv = String(f.csv || '');
      if (!/^[A-Z0-9][A-Z0-9_\-\/.]{0,23}$/.test(c)) throw new Error('bad client code: ' + c);
      if (csv.length > 3000000) throw new Error('file too large for ' + c);
      var cf = pfFolder_(tf, c.replace(/\//g, '-'));
      var file = cf.createFile(c + ' ' + type + ' ' + stamp + ' (' + orig + ').csv', csv, MimeType.CSV);
      out.push({ client: c, id: file.getId(), url: file.getUrl(), folder: cf.getUrl() });
    });
    return JSON.stringify({ ok: true, type: type, root: pfRoot_().getUrl(), saved: out });
  });
}
function pfLock_(fn) { var lk = LockService.getScriptLock(); lk.waitLock(20000); try { return fn(); } finally { lk.releaseLock(); } }
function pfLoad_() {
  var root = pfRoot_(), out = [];
  Object.keys(PF_TYPES).forEach(function (k) {
    var it = root.getFoldersByName(PF_TYPES[k]); if (!it.hasNext()) return;
    var cf = it.next().getFolders();
    while (cf.hasNext()) {
      var f = cf.next(), fs = f.getFiles(), all = [];
      while (fs.hasNext()) { var x = fs.next(); if (!x.isTrashed() && /\.csv$/i.test(x.getName())) all.push(x); }
      all.sort(function (a, b) { return a.getDateCreated() - b.getDateCreated(); });
      if (k === 'dp') all = all.slice(-1);   // DP holdings: a snapshot - only the newest counts; trade files and ledgers: every period, oldest first
      all.forEach(function (x) { out.push({ type: k, client: f.getName(), id: x.getId(), t: x.getDateCreated().getTime(), name: x.getName(), csv: x.getBlob().getDataAsString() }); });
    }
  });
  return JSON.stringify({ ok: true, files: out });
}
/* ---------- whole-app backup: the Portfolio pages save their complete data as one JSON after every change ----------
   POST pf_state_save {key, state:<json text>} -> "App state" folder, newest kept + last 40 copies (older go to Drive trash)
   POST pf_state_load {key}                     -> {ok, t, state} newest copy, or {ok, none:true}
   POST pf_clear {key}                          -> every upload and backup moved to Drive trash (recoverable 30 days), an empty state
                                                   saved so every device clears too */
function pfStateFolder_() { return pfFolder_(pfRoot_(), 'App state'); }
function pfStateSave_(b) {
  var s = String(b.state || ''); if (!s || s.length > 25000000) throw new Error('state missing or too large');
  return pfLock_(function () {
    var fo = pfStateFolder_(), stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HHmmss');
    var f = fo.createFile('portfolio state ' + stamp + '.json', s, MimeType.PLAIN_TEXT), all = [], it = fo.getFiles();
    while (it.hasNext()) { var x = it.next(); if (!x.isTrashed()) all.push(x); }
    all.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
    for (var i = 41; i < all.length; i++) all[i].setTrashed(true);
    return JSON.stringify({ ok: true, t: f.getDateCreated().getTime(), id: f.getId() });
  });
}
function pfStateLoad_() {
  var it = pfStateFolder_().getFiles(), best = null;
  while (it.hasNext()) { var x = it.next(); if (!x.isTrashed() && (!best || x.getDateCreated() > best.getDateCreated())) best = x; }
  if (!best) return JSON.stringify({ ok: true, none: true });
  return JSON.stringify({ ok: true, t: best.getDateCreated().getTime(), state: best.getBlob().getDataAsString() });
}
function pfClear_() {
  return pfLock_(function () {
    var root = pfRoot_(), n = 0;
    (function walk(fo) { var fs = fo.getFiles(); while (fs.hasNext()) { var x = fs.next(); if (!x.isTrashed()) { x.setTrashed(true); n++; } }
      var ds = fo.getFolders(); while (ds.hasNext()) walk(ds.next()); })(root);
    var e = JSON.stringify({ v: 1, t: Date.now(), cleared: true, data: {} });
    var f = pfStateFolder_().createFile('portfolio state ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HHmmss') + ' (cleared).json', e, MimeType.PLAIN_TEXT);
    return JSON.stringify({ ok: true, trashed: n, t: f.getDateCreated().getTime() });
  });
}
