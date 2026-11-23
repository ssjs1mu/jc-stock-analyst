/* ===================== Client uploads -> Google Drive (Portfolio / Trade Audit pages of jcgg-dashboard) =====================
   POST {action:'pf_save', key:<admin passcode>, type:'trade'|'ledger'|'dp', name:<original file name>, files:[{client:<code>, csv:<text>}]}
   Saves one CSV per client code (codes only - the pages never send client names) under
     Joshi's Corner - Client Uploads / Trade files | Ledger | DP holdings / <CLIENT CODE> / <CODE> <type> <yyyy-mm-dd HHmm> (<original name>).csv
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
