/* ===== Client dashboards: admin passcode, client store (JC_Clients.json), rolling backups (JC_Backups), Telegram delivery =====
   - Everything is managed from the terminal: Client reports > "Client dashboards". Nothing needs editing in Script properties.
   - Admin passcode: set once from that page. Only a salted hash is stored (ADM_H / ADM_S). Once set, watchlists are no longer readable without it.
   - Linked client lists live in their OWN file (JC_Clients.json), separate from JC_Watchlists.json, so editing or deleting a terminal watchlist never erases them.
     The terminal only ever ADDS new stocks to a linked client; removing stocks or deleting a client is an explicit action, and deleted clients are kept in "trash".
   - Every change first saves the previous file as a dated copy in the Drive folder JC_Backups (watchlists too). */
var CLI_FILE = 'JC_Clients.json', BK_FOLDER = 'JC_Backups', BK_KEEP = 400;
var CL_PAGE = 'https://ssjs1mu.github.io/jc-stock-analyst/c/';
function admP_() { return PropertiesService.getScriptProperties(); }
function admLocked_() { return !!admP_().getProperty('ADM_H'); }
function admHash_(k) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, (admP_().getProperty('ADM_S') || '') + '|' + k)); }
function admOk_(k) {
  var c = CacheService.getScriptCache(), f = parseInt(c.get('adm_fail') || '0', 10);
  if (f >= 8) throw new Error('too many wrong passcodes - try again in 15 minutes');
  var h = admP_().getProperty('ADM_H'); if (!h) return false;
  if (admHash_(String(k || '')) === h) { c.remove('adm_fail'); return true; }
  c.put('adm_fail', String(f + 1), 900); return false;
}
function admClaim_(k) {
  k = String(k || ''); if (admLocked_()) return JSON.stringify({ error: 'a passcode is already set' });
  if (k.length < 8) return JSON.stringify({ error: 'use at least 8 characters' });
  admP_().setProperty('ADM_S', Utilities.getUuid()); admP_().setProperty('ADM_H', admHash_(k)); return JSON.stringify({ ok: true, locked: true });
}
/* ---- rolling backups: the previous content is saved before any overwrite; identical content is not saved twice ---- */
function bkRun_(tag, text) {
  try {
    if (!text) return;
    var it = DriveApp.getFoldersByName(BK_FOLDER), fo = it.hasNext() ? it.next() : DriveApp.createFolder(BK_FOLDER);
    var arr = [], fs = fo.searchFiles("title contains '" + tag + "_'"); while (fs.hasNext()) arr.push(fs.next());
    arr.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
    if (arr.length && arr[0].getBlob().getDataAsString() === text) return;
    fo.createFile(tag + '_' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd_HHmmss') + '.json', text, MimeType.PLAIN_TEXT);
    for (var i = BK_KEEP; i < arr.length; i++) arr[i].setTrashed(true);
  } catch (e) { Logger.log('backup ' + e); }
}
function cliFile_() { var it = DriveApp.getFilesByName(CLI_FILE); return it.hasNext() ? it.next() : null; }
function cliRead_() {
  var f = cliFile_(), d = { v: 1, updated: 0, clients: {}, trash: {} };
  if (f) { try { d = JSON.parse(f.getBlob().getDataAsString()); } catch (e) { throw new Error('client store unreadable - refusing to overwrite it (see JC_Backups)'); } }
  d.clients = d.clients || {}; d.trash = d.trash || {}; return d;
}
function cliWrite_(d) {
  d.updated = Date.now(); var t = JSON.stringify(d), f = cliFile_();
  if (f) { bkRun_('JC_Clients', f.getBlob().getDataAsString()); f.setContent(t); } else DriveApp.createFile(CLI_FILE, t, MimeType.PLAIN_TEXT);
}
function cliSyms_(a) {
  var seen = {}, out = []; (a || []).forEach(function (x) { var u = String(x).toUpperCase(), bo = /\.BO$/.test(u); u = u.replace(/\.(NS|BO)$/, '').replace(/[^A-Z0-9&\-]/g, ''); if (u) { u = bo ? u + '.BO' : u; if (!seen[u]) { seen[u] = 1; out.push(u); } } });
  return out.slice(0, 60);
}
function cliPub_(c) { return { id: c.id, name: c.name, chat: c.chat, listId: c.listId, listName: c.listName, syms: c.syms, token: c.token, link: CL_PAGE + '?k=' + c.token, created: c.created, updated: c.updated }; }
function cliTx_(fn) { var lk = LockService.getScriptLock(); lk.waitLock(20000); try { return fn(); } finally { lk.releaseLock(); } }
function cliRoute_(a, b) {
  if (a === 'cl_list') { var d = cliRead_(); return JSON.stringify({ ok: true, clients: Object.keys(d.clients).map(function (k) { return cliPub_(d.clients[k]); }), trash: Object.keys(d.trash).length }); }
  if (a === 'tg_updates') return tgUpdates_();
  if (a === 'cl_send') { var d2 = cliRead_(), c2 = d2.clients[String(b.id)]; if (!c2) throw new Error('client not found'); if (!c2.chat) throw new Error('no Telegram chat id for this client'); var s = tgProps_(); var r = tgClientMsg_(s, c2); return JSON.stringify(r); }
  return cliTx_(function () {
    var d = cliRead_(), now = Date.now(), c;
    if (a === 'cl_link') {
      var lid = String(b.listId || ''); if (!lid) throw new Error('missing list');
      Object.keys(d.clients).forEach(function (k) { if (d.clients[k].listId === lid) c = d.clients[k]; });
      if (!c) { c = { id: 'c' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), token: Utilities.getUuid().replace(/-/g, '').slice(0, 24), created: now, syms: [] }; d.clients[c.id] = c; }
      c.listId = lid; c.listName = String(b.listName || c.listName || ''); if (b.name != null && String(b.name).trim()) c.name = String(b.name).trim().slice(0, 40); c.name = c.name || c.listName;
      if (b.chat != null) c.chat = String(b.chat).replace(/[^0-9\-]/g, '');
      c.syms = cliSyms_((c.syms || []).concat(b.syms || [])); c.updated = now;
    } else {
      c = d.clients[String(b.id)]; if (!c) throw new Error('client not found');
      if (a === 'cl_merge') { var before = c.syms.length; c.syms = cliSyms_(c.syms.concat(b.syms || [])); if (c.syms.length === before) return JSON.stringify({ ok: true, same: true }); c.updated = now; }
      else if (a === 'cl_set') { if (b.name != null && String(b.name).trim()) c.name = String(b.name).trim().slice(0, 40); if (b.chat != null) c.chat = String(b.chat).replace(/[^0-9\-]/g, ''); if (Array.isArray(b.syms)) c.syms = cliSyms_(b.syms); c.updated = now; }
      else if (a === 'cl_delete') { c.deleted = now; d.trash[c.id] = c; delete d.clients[c.id]; cliWrite_(d); return JSON.stringify({ ok: true, deleted: true }); }
      else throw new Error('unknown action');
    }
    cliWrite_(d); return JSON.stringify({ ok: true, client: cliPub_(c) });
  });
}
function clGet_(k) { // public, read-only: the private link key returns only that client's first name and stock symbols
  k = String(k || ''); if (!/^[a-f0-9]{24}$/.test(k)) return JSON.stringify({ error: 'invalid link' });
  var d = cliRead_(), c = null; Object.keys(d.clients).forEach(function (x) { if (d.clients[x].token === k) c = d.clients[x]; });
  if (!c) return JSON.stringify({ error: 'link not recognised' });
  return JSON.stringify({ name: String(c.name || '').split(' ')[0], symbols: (c.syms || []).filter(function (x) { return !/\.BO$/.test(x); }).slice(0, 40) });
}
function postRoute_(b) {
  var a = String(b.action || '');
  if (a === 'calls_save') return callsSave_(b.data);
  if (a === 'adm_status') return JSON.stringify({ ok: true, locked: admLocked_(), v: 2 });
  if (a === 'adm_claim') return admClaim_(b.key);
  if (a === 'wl_load' || a === 'wl_save') {
    if (admLocked_() && !admOk_(b.key)) return JSON.stringify({ error: 'locked', locked: true });
    return a === 'wl_load' ? wlLoad_() : wlSave_(b.data);
  }
  if (/^(cl_|tg_)/.test(a)) {
    if (!admLocked_()) return JSON.stringify({ error: 'set an admin passcode first' });
    if (!admOk_(b.key)) return JSON.stringify({ error: 'bad passcode' });
    return cliRoute_(a, b);
  }
  return JSON.stringify({ error: 'unknown action' });
}
function tgUpdates_() {
  var s = tgProps_(), me = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/getMe', { muteHttpExceptions: true }).getContentText());
  var j = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/getUpdates?limit=100&timeout=0', { muteHttpExceptions: true }).getContentText());
  if (!j.ok) throw new Error(j.description || 'Telegram refused getUpdates'); var seen = {};
  (j.result || []).forEach(function (u) { var m = u.message || (u.my_chat_member && { chat: u.my_chat_member.chat, date: u.my_chat_member.date }); if (!m || !m.chat || m.chat.type !== 'private') return; seen[String(m.chat.id)] = { chat: String(m.chat.id), name: [m.chat.first_name, m.chat.last_name].filter(Boolean).join(' '), username: m.chat.username || '', date: m.date || 0 }; });
  return JSON.stringify({ ok: true, bot: me.result && me.result.username || '', chats: Object.keys(seen).map(function (k) { return seen[k]; }) });
}
function tgClientMsg_(s, c) {
  var url = CL_PAGE + '?k=' + c.token, txt = '🙏 <b>Namaste ' + tgEsc_(String(c.name || '').split(' ')[0]) + '</b>\nYour pre-market pulse is ready — world markets, today’s outlook and your stocks with levels.\n<i>Educational information, not investment advice.</i>';
  var kb = { inline_keyboard: [[{ text: '📱 Open my dashboard', web_app: { url: url } }], [{ text: '🌐 Open in browser', url: url }]] };
  var send = function (markup) { var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/sendMessage', { method: 'post', payload: { chat_id: c.chat, text: txt, parse_mode: 'HTML', reply_markup: JSON.stringify(markup) }, muteHttpExceptions: true }); var j = {}; try { j = JSON.parse(r.getContentText() || '{}'); } catch (e) { } return { ok: r.getResponseCode() === 200, code: r.getResponseCode(), msg: r.getResponseCode() === 200 ? 'sent' : (j.description || 'failed') }; };
  var o = send(kb);
  if (!o.ok && /button|web_app|url/i.test(o.msg)) { o = send({ inline_keyboard: [[{ text: '\uD83D\uDCF1 Open my dashboard', url: url }]] }); if (o.ok) o.msg = 'sent (link button)'; }
  if (!o.ok && /chat not found|bot was blocked|user is deactivated|Forbidden/i.test(o.msg)) o.msg += ' \u2014 the client must open the bot and press Start first, and the chat id must be theirs';
  return o;
}
function tgClients_(s, today) { // once per day per client, weekdays 08:20-10:00 IST (called from the 5-minute trigger)
  var d = cliRead_(), sent = {}; try { sent = JSON.parse(s.p.getProperty('TG_CL') || '{}'); } catch (e) { }
  var changed = false;
  Object.keys(d.clients).forEach(function (id) {
    var c = d.clients[id]; if (!c.chat || sent[id] === today) return;
    var r = tgClientMsg_(s, c);
    if (r.ok || r.code === 403 || r.code === 400) { sent[id] = today; changed = true; } if (!r.ok) Logger.log('client ' + c.name + ' ' + r.msg);
  });
  if (changed) s.p.setProperty('TG_CL', JSON.stringify(sent));
}
