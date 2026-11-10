/* Joshi's Corner - report archive on Google Drive. Free: Google Apps Script only, no subscription.
   Every hour it mirrors the published report files (PNG pages, PDFs, JSON) from the public site into
   Drive folder "JC Reports Archive/<report>/<yyyy-mm>/". It only ever copies FROM the fixed public site,
   so the web app needs no password. GitHub removes a file from the site only after this script confirms
   it holds a copy of the same size (action=list).
   One-time setup: paste into a new Apps Script project, run setup() once and allow access, then
   Deploy > New deployment > Web app > Execute as Me, Who has access: Anyone. Send the /exec URL. */
var SITE = 'https://ssjs1mu.github.io/jc-stock-analyst/';
var SIDS = ['morning-pulse', 'evening-breeze', 'muhurat-special', 'morning-detailed', 'circuit-watch', 'premarket-news', 'morning-brief', 'evening-market-wrap', 'evening-news-wrap'];
var ROOT_NAME = 'JC Reports Archive';

function setup() {
  root_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sync').timeBased().everyHours(1).create();
  sync();
}
function root_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('root');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder(ROOT_NAME);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);   // the reports are public already
  p.setProperty('root', f.getId());
  return f;
}
function sub_(parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function indexFile_(root) { var it = root.getFilesByName('archive_index.json'); return it.hasNext() ? it.next() : root.createFile('archive_index.json', '{}', 'application/json'); }

/* copies files that are published and not yet in Drive; stops after ~4.5 minutes and continues next hour */
function sync() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(1000)) return 'busy';
  var t0 = Date.now(), root = root_(), ixf = indexFile_(root), ix = JSON.parse(ixf.getBlob().getDataAsString() || '{}'), added = 0, left = 0;
  try {
    for (var s = 0; s < SIDS.length; s++) {
      var sid = SIDS[s], runs;
      try { runs = JSON.parse(UrlFetchApp.fetch(SITE + 'reports/' + sid + '/index.json?t=' + Date.now(), { muteHttpExceptions: true }).getContentText()).runs || []; } catch (e) { continue; }
      for (var r = 0; r < runs.length; r++) {
        var run = runs[r], files = run.files || [];
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          if (!f.path || f.drive || !/^reports\/[a-z-]+\/[A-Za-z0-9_.\-]+\.(png|pdf|json)$/.test(f.path)) continue;
          var have = ix[f.path];
          if (have && have.bytes === f.bytes) continue;
          if (Date.now() - t0 > 270000) { left++; continue; }
          var resp = UrlFetchApp.fetch(SITE + f.path, { muteHttpExceptions: true });
          if (resp.getResponseCode() !== 200) continue;
          var blob = resp.getBlob().setName(f.name), folder = sub_(sub_(root, sid), String(run.date).slice(0, 7));
          if (have) { try { DriveApp.getFileById(have.id).setTrashed(true); } catch (e) {} }   // re-issued file: keep the new one
          var df = folder.createFile(blob);
          ix[f.path] = { id: df.getId(), bytes: blob.getBytes().length, date: run.date };
          added++;
        }
      }
    }
  } finally {
    if (added) ixf.setContent(JSON.stringify(ix));
    lock.releaseLock();
  }
  return 'added ' + added + ', waiting ' + left + ', total ' + Object.keys(ix).length;
}
function doGet(e) {
  var a = (e && e.parameter && e.parameter.action) || 'list', root = root_(), out;
  if (a === 'sync') out = { result: sync() };
  else out = { folder: 'https://drive.google.com/drive/folders/' + root.getId(), files: JSON.parse(indexFile_(root).getBlob().getDataAsString() || '{}') };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
