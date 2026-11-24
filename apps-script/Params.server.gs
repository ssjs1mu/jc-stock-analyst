/* ===================== Master Google Sheet "JC Logic & Formula Reference" =====================
   GET ?action=params -> { ok, at, params: { KEY: value } }          (tab Parameters)
   GET ?action=rules  -> { ok, at, rules: [ { 'Rule ID':…, Stage, Side, Left, … } ] }   (tab Rules — your own conditions)
   Read with the script owner's Drive access (no new permission), cached 10 min, so a sheet edit reaches the apps within 10 minutes.
   Pages and jobs fall back to data/params.json / data/rules.json, then to their built-in values. */
var PARAMS_SHEET_ID = '1XCFbXaUEs5cs9hii09dXg5zDweEaYsXnb-ORAzzK7Fg', PARAMS_GID = '1652969610', RULES_GID = '2050886606';
function sheetRows_(gid) {
  var r = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + PARAMS_SHEET_ID + '/export?format=csv&gid=' + gid,
    { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  if (r.getResponseCode() !== 200) throw new Error('sheet ' + r.getResponseCode());
  return Utilities.parseCsv(r.getContentText());
}
function paramsGet_() {
  var c = CacheService.getScriptCache(), hit = c.get('jc_params_v1'); if (hit) return hit;
  try {
    var rows = sheetRows_(PARAMS_GID), p = {}, n = 0;
    for (var i = 1; i < rows.length; i++) {
      var k = String(rows[i][0] || '').trim(), v = String(rows[i][1] || '').trim();
      if (!/^[A-Z][A-Z0-9_]+$/.test(k) || v === '') continue;
      var x = Number(v.replace(/,/g, '')); p[k] = isFinite(x) && /^-?[\d.,]+$/.test(v) ? x : v; n++;
    }
    var out = JSON.stringify({ ok: true, n: n, at: new Date().toISOString(), params: p });
    if (n) c.put('jc_params_v1', out, 600);
    return out;
  } catch (e) { return JSON.stringify({ error: String(e) }); }
}
function rulesList_() {   /* every filled row of the Rules tab (all statuses; the engine keeps only Live ones) */
  var rows = sheetRows_(RULES_GID), h = rows[0].map(function (x) { return String(x).trim(); }), out = [];
  for (var i = 1; i < rows.length; i++) {
    var o = {}; h.forEach(function (k, j) { if (k) o[k] = String(rows[i][j] == null ? '' : rows[i][j]).trim(); });
    if (o['Rule ID'] && o['Left']) out.push(o);
  }
  return out;
}
function rulesGet_() {
  var c = CacheService.getScriptCache(), hit = c.get('jc_rules_v1'); if (hit) return hit;
  try { var r = rulesList_(), out = JSON.stringify({ ok: true, n: r.length, at: new Date().toISOString(), rules: r }); c.put('jc_rules_v1', out, 600); return out; }
  catch (e) { return JSON.stringify({ error: String(e) }); }
}
function rulesLive_() { try { var j = JSON.parse(rulesGet_()); return j.rules || []; } catch (e) { return []; } }
