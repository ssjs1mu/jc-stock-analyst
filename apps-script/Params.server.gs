/* ===================== Logic parameters from the master Google Sheet ("JC Logic & Formula Reference", tab Parameters) =====================
   GET ?action=params -> { ok, at, params: { KEY: value, ... } }. Read with the script owner's Drive access (no new permission),
   cached 10 min so a sheet edit reaches the apps within 10 minutes. Pages fall back to data/params.json, then to their built-in values. */
var PARAMS_SHEET_ID = '1XCFbXaUEs5cs9hii09dXg5zDweEaYsXnb-ORAzzK7Fg', PARAMS_GID = '1652969610';
function paramsGet_() {
  var c = CacheService.getScriptCache(), hit = c.get('jc_params_v1');
  if (hit) return hit;
  try {
    var r = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + PARAMS_SHEET_ID + '/export?format=csv&gid=' + PARAMS_GID,
      { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
    if (r.getResponseCode() !== 200) return JSON.stringify({ error: 'sheet ' + r.getResponseCode() });
    var rows = Utilities.parseCsv(r.getContentText()), p = {}, n = 0;
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
