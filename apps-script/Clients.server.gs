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
  if (a === 'cl_invite') return cliTx_(function () { // invite link: t.me/<bot>?start=<code>; pressing Start links the client's chat automatically
    var d = cliRead_(), c = d.clients[String(b.id)]; if (!c) throw new Error('client not found');
    if (!c.inv) { c.inv = 'j' + Utilities.getUuid().replace(/-/g, '').slice(0, 15); c.updated = Date.now(); cliWrite_(d); }
    var bot = tgBotName_(); if (!bot) throw new Error('Telegram bot not reachable - check TG_TOKEN');
    return JSON.stringify({ ok: true, bot: bot, code: c.inv, link: 'https://t.me/' + bot + '?start=' + c.inv, linked: !!c.chat, name: c.name });
  });
  if (a === 'cl_send') { var d2 = cliRead_(), c2 = d2.clients[String(b.id)]; if (!c2) throw new Error('client not found'); if (!c2.chat) throw new Error('no Telegram chat id for this client'); var s = tgProps_(); var r = tgClientMsg_(s, c2, b.mode === 'closing'); return JSON.stringify(r); }
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
  if (a === 'pf_save' || a === 'pf_load') {   // client trade books / ledgers / DP holdings <-> Drive (Uploads.server.gs)
    if (!admLocked_()) return JSON.stringify({ error: 'set an admin passcode first' });
    if (!admOk_(b.key)) return JSON.stringify({ error: 'bad passcode' });
    return a === 'pf_save' ? pfSave_(b) : pfLoad_();
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
  try { var keep = JSON.parse(s.p.getProperty('TG_SEEN') || '{}'); Object.keys(keep).forEach(function (k) { if (!seen[k]) seen[k] = keep[k]; }); } catch (e) { }
  return JSON.stringify({ ok: true, bot: me.result && me.result.username || '', chats: Object.keys(seen).map(function (k) { return seen[k]; }) });
}
function tgBotName_() {
  var p = PropertiesService.getScriptProperties(), b = p.getProperty('TG_BOT'); if (b) return b;
  try { var s = tgProps_(), me = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/getMe', { muteHttpExceptions: true }).getContentText()); b = me.result && me.result.username; if (b) p.setProperty('TG_BOT', b); return b || ''; } catch (e) { return ''; }
}
/* every 5 minutes: a client who opened the invite link and pressed Start sends "/start <code>" - store that chat id on the client, welcome them and send today's dashboard.
   Updates are read from the last processed id onward (Telegram then drops older ones), and every private chat seen is remembered (TG_SEEN) for "Find Telegram users". */
function tgAutoLink_(s) {
  var last = parseInt(s.p.getProperty('TG_UPD') || '0', 10);
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/getUpdates?timeout=0&limit=100' + (last ? '&offset=' + (last + 1) : '') + '&allowed_updates=' + encodeURIComponent('["message"]'), { muteHttpExceptions: true });
  var j = {}; try { j = JSON.parse(r.getContentText() || '{}'); } catch (e) { } if (!j.ok || !(j.result || []).length) return;
  var seen = {}; try { seen = JSON.parse(s.p.getProperty('TG_SEEN') || '{}'); } catch (e) { }
  var starts = [];
  j.result.forEach(function (u) {
    if (u.update_id > last) last = u.update_id; var m = u.message; if (!m || !m.chat || m.chat.type !== 'private') return;
    seen[String(m.chat.id)] = { chat: String(m.chat.id), name: [m.chat.first_name, m.chat.last_name].filter(Boolean).join(' '), username: m.chat.username || '', date: m.date || 0 };
    var g = /^\/start\s+([A-Za-z0-9_-]{6,64})/.exec(String(m.text || '')); if (g) starts.push({ code: g[1], chat: String(m.chat.id) });
  });
  var ks = Object.keys(seen).sort(function (a, b) { return (seen[b].date || 0) - (seen[a].date || 0); }).slice(0, 60), keep = {}; ks.forEach(function (k) { keep[k] = seen[k]; });
  s.p.setProperty('TG_SEEN', JSON.stringify(keep)); s.p.setProperty('TG_UPD', String(last));
  if (!starts.length) return;
  var linked = [];
  cliTx_(function () {
    var d = cliRead_(), ch = false;
    starts.forEach(function (st) { Object.keys(d.clients).forEach(function (k) { var c = d.clients[k]; if (c.inv && c.inv === st.code) { if (c.chat !== st.chat) { c.chat = st.chat; c.updated = Date.now(); c.joined = c.joined || Date.now(); ch = true; } linked.push(c); } }); });
    if (ch) cliWrite_(d);
  });
  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'), sent = {}; try { sent = JSON.parse(s.p.getProperty('TG_CL') || '{}'); } catch (e) { }
  linked.forEach(function (c) {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/sendMessage', { method: 'post', payload: { chat_id: c.chat, parse_mode: 'HTML', text: '\u2705 <b>Namaste ' + tgEsc_(cliHello_(c.name)) + ', you are connected to Joshi\u2019s Corner.</b>\nYour personal pre-market report will now arrive here automatically every trading morning (from 8:15 AM IST). Today\u2019s report follows below.' }, muteHttpExceptions: true });
    var ist = new Date(Date.now() + 19800000), mi = ist.getUTCHours() * 60 + ist.getUTCMinutes(), eve = mi >= 990 && cliEveReady_(today);
    var o = tgClientMsg_(s, c, eve); if (o.ok && !eve) sent[c.id] = today;
  });
  s.p.setProperty('TG_CL', JSON.stringify(sent));
}
/* the client's greeting name: first name + "ji" (titles like Mr / Shri / Dr dropped, no double "ji") */
function cliHello_(name) {
  var w = String(name || '').trim().split(/\s+/).filter(function (x) { return !/^(mr|mrs|ms|miss|shri|sri|smt|dr|prof|sh)\.?$/i.test(x); });
  var f = w[0] || 'Investor'; f = f.charAt(0).toUpperCase() + f.slice(1);
  return /ji$/i.test(f) || (w[1] && /^ji$/i.test(w[1])) ? f + (w[1] && /^ji$/i.test(w[1]) ? ' ji' : '') : f + ' ji';
}
/* thumbnail: today's Morning Sunrise cover - used ONLY when the morning report is dated today, else the brand banner (no date on it) */
function cliThumb_(today) {
  var base = 'https://ssjs1mu.github.io/jc-stock-analyst/';
  try { var ix = JSON.parse(UrlFetchApp.fetch(base + 'reports/morning-pulse/index.json?t=' + Date.now(), { muteHttpExceptions: true }).getContentText() || '{}'), r = (ix.runs || [])[0];
    if (r && r.status === 'ok' && r.date === today) return base + 'updates/sunrise.jpg?d=' + today; } catch (e) { }
  return base + 'assets/jc-banner.png';
}
function tgClientMsg_(s, c, eve) {
  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  if (eve) return tgClientEveMsg_(s, c, today);
  if (!s.__thumb || s.__thumbD !== today) { s.__thumb = cliThumb_(today); s.__thumbD = today; }
  var url = CL_PAGE + '?k=' + c.token, txt = '🙏 <b>Namaste ' + tgEsc_(cliHello_(c.name)) + '</b>\n'
    + 'Your pre-market report for <b>' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'EEE, d MMM yyyy') + '</b> is ready — today’s outlook, world cues, news, calls and your stocks with levels.\n\n'
    + '<b>📖 How to read your report</b>\n'
    + '🟡 <b>Market mood dial</b> (top): below 40 = Bearish, 40-60 = Neutral, above 60 = Bullish. It decides how aggressive to be today.\n'
    + '🔵 <b>Outlook for the day</b>: expected Nifty opening zone, support and resistance.\n'
    + '🟢 <b>World · commodities · currency · bonds</b>: overnight cues. A rise in crude, the US dollar or US bond yields is negative for India.\n'
    + '🟣 <b>Important news</b>: headlines that can move the opening.\n'
    + '🟠 <b>Calls</b>: Entry is a trigger — act only after a 5-minute candle closes beyond it. Exit at Stop, book profit at T1 / T2. Intraday trades close by 3:15 PM.\n'
    + '🟤 <b>Wait-and-buy plans</b> (weak days): Plan A = buy the dip at support, Plan B = breakout only after Nifty recovers. Rules are written above the table.\n'
    + '⚪ <b>Your stocks</b>: Buy / Sell / Avoid with levels. Tap any stock name for its full Master report — a tree grows while it is built.\n'
    + '🔴 <b>Every trade needs a stop-loss.</b> No trigger, no trade.\n\n'
    + '<i>Educational information, not investment advice.</i>';
  return tgClientSend_(s, c, txt, s.__thumb, url);
}
function tgClientSend_(s, c, txt, thumb, url) {
  var lp = JSON.stringify({ url: thumb, prefer_large_media: true, show_above_text: true });
  var kb = { inline_keyboard: [[{ text: '📱 Open my dashboard', web_app: { url: url } }], [{ text: '🌐 Open in browser', url: url }]] };
  var send = function (markup) { var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/sendMessage', { method: 'post', payload: { chat_id: c.chat, text: txt, parse_mode: 'HTML', link_preview_options: lp, reply_markup: JSON.stringify(markup) }, muteHttpExceptions: true }); var j = {}; try { j = JSON.parse(r.getContentText() || '{}'); } catch (e) { } return { ok: r.getResponseCode() === 200, code: r.getResponseCode(), msg: r.getResponseCode() === 200 ? 'sent' : (j.description || 'failed') }; };
  var o = send(kb);
  if (!o.ok && /button|web_app|url/i.test(o.msg)) { o = send({ inline_keyboard: [[{ text: '\uD83D\uDCF1 Open my dashboard', url: url }]] }); if (o.ok) o.msg = 'sent (link button)'; }
  if (!o.ok && /chat not found|bot was blocked|user is deactivated|Forbidden/i.test(o.msg)) o.msg += ' \u2014 the client must open the bot and press Start first, and the chat id must be theirs';
  return o;
}
/* EVENING: Closing Bell - sent once per trading day 16:30-18:30 IST, only after today's Evening Breeze is published (its cover = thumbnail).
   The dashboard link opens in closing mode: how the client's stocks did against this morning's plan, and today's call results (settled by the server at ~16:10). */
function cliEveReady_(today) {
  try { var ix = JSON.parse(UrlFetchApp.fetch(TG_SITE + 'reports/evening-breeze/index.json?t=' + Date.now(), { muteHttpExceptions: true }).getContentText() || '{}'), r = (ix.runs || [])[0];
    return !!(r && r.status === 'ok' && r.date === today); } catch (e) { return false; }
}
function tgClientEveMsg_(s, c, today) {
  var url = CL_PAGE + '?k=' + c.token + '&m=closing', thumb = cliEveReady_(today) ? TG_SITE + 'evening/' + today + '/og.jpg?d=' + today : TG_SITE + 'assets/jc-banner.png';
  var txt = '🌇 <b>Namaste ' + tgEsc_(cliHello_(c.name)) + '</b>\n'
    + 'Your Closing Bell for <b>' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'EEE, d MMM yyyy') + '</b> is ready — how your stocks did against this morning’s plan, and how today’s calls performed.\n\n'
    + '<b>📖 How to read your Closing Bell</b>\n'
    + '🟡 <b>Mood at the close</b> (top dial): how the market finished the day.\n'
    + '🔵 <b>Closing outlook</b>: where Nifty closed, support and resistance for tomorrow.\n'
    + '🟢 <b>World · commodities · currency · bonds</b>: how global cues closed.\n'
    + '🟠 <b>Your stocks today</b>: this morning’s view for each stock and what happened — trigger hit or not, Target 1 / Target 2 reached, or stop-loss hit, with the day’s move.\n'
    + '🟣 <b>Today’s calls — results</b>: every call with its outcome. Not triggered = no trade, no loss.\n'
    + '⚪ <b>Tap any stock name</b> for its full Master report.\n'
    + '🔴 <b>Results are checked against the day’s actual high / low</b> — the same rules as the morning plan.\n\n'
    + '<i>Educational information, not investment advice.</i>';
  return tgClientSend_(s, c, txt, thumb, url);
}
function tgClientsEve_(s, today) {
  var sent = {}; try { sent = JSON.parse(s.p.getProperty('TG_CLE') || '{}'); } catch (e) { }
  var d = cliRead_(), due = Object.keys(d.clients).filter(function (id) { return d.clients[id].chat && sent[id] !== today; }); if (!due.length) return;
  if (!cliEveReady_(today)) return; // wait for today's Evening Breeze - never post a stale evening report
  due.forEach(function (id) { var c = d.clients[id], r = tgClientMsg_(s, c, true); if (r.ok || r.code === 403 || r.code === 400) sent[id] = today; if (!r.ok) Logger.log('client eve ' + c.name + ' ' + r.msg); });
  s.p.setProperty('TG_CLE', JSON.stringify(sent));
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
