/* ===================== Telegram auto-poster =====================
   Every 5 minutes, looks at the GitHub Pages report indexes and posts each newly published report (today's date, status ok)
   to your Telegram channel. Runs on Google's servers - needs no Claude session, no subscription.
   ONE-TIME SETUP (you do this, so the bot token never passes through chat):
     1. In Telegram, talk to @BotFather -> /newbot -> copy the token. Add the bot as an ADMINISTRATOR of your channel.
     2. Apps Script editor -> Project Settings (gear) -> Script properties -> add:
          TG_TOKEN = <bot token>      TG_CHAT = @yourchannelname   (or the numeric id like -100123456789)
     3. Run installTelegramTrigger() once (authorise when asked). Run tgTest() to send a test line.            */
var TG_SITE = 'https://ssjs1mu.github.io/jc-stock-analyst/';
var TG_IDS = ['premarket-news', 'morning-brief', 'morning-detailed', 'morning-pulse', 'evening-market-wrap', 'evening-news-wrap', 'closing-auction', 'circuit-watch'];
function tgProps_() { var p = PropertiesService.getScriptProperties(); var t = p.getProperty('TG_TOKEN'), c = p.getProperty('TG_CHAT'); if (!t || !c) throw new Error('Set TG_TOKEN and TG_CHAT in Script properties first'); return { p: p, t: t, c: c }; }
function tgTest() { var s = tgProps_(); var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/sendMessage', { method: 'post', payload: { chat_id: s.c, text: "Joshi's Corner report feed connected." }, muteHttpExceptions: true }); Logger.log(r.getContentText()); return r.getContentText(); }
function installTelegramTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tgPostReports') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tgPostReports').timeBased().everyMinutes(5).create();
}
function tgPostReports() {
  var s = tgProps_(), sent = {}; try { sent = JSON.parse(s.p.getProperty('TG_SENT') || '{}'); } catch (e) { }
  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'), n = 0;
  TG_IDS.forEach(function (id) {
    try {
      var r = UrlFetchApp.fetch(TG_SITE + 'reports/' + id + '/index.json?t=' + Date.now(), { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) return;
      var runs = (JSON.parse(r.getContentText()).runs || []).filter(function (x) { return x.date === today && x.status === 'ok' && x.files && x.files.length; });
      if (!runs.length) return;
      runs.sort(function (a, b) { return a.generated_at < b.generated_at ? 1 : -1; });
      var run = runs[0]; if (sent[id] && sent[id] >= run.generated_at) return;
      var f = run.files.filter(function (x) { return x.type === 'png'; })[0] || run.files[0];
      var blob = UrlFetchApp.fetch(TG_SITE + f.path, { muteHttpExceptions: true }).getBlob().setName(f.name);
      var cap = (run.caption || f.name).slice(0, 900);
      var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/' + (f.type === 'png' ? 'sendPhoto' : 'sendDocument'), { method: 'post', payload: { chat_id: s.c, caption: cap, [f.type === 'png' ? 'photo' : 'document']: blob }, muteHttpExceptions: true });
      if (res.getResponseCode() === 200) { sent[id] = run.generated_at; n++; } else Logger.log(id + ' ' + res.getContentText());
    } catch (e) { Logger.log(id + ' ' + e); }
  });
  s.p.setProperty('TG_SENT', JSON.stringify(sent)); return n;
}
