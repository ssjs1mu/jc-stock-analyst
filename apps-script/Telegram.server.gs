/* ===================== Telegram auto-poster =====================
   Every 5 minutes, looks at the GitHub Pages report indexes and posts each newly published report (today's date, status ok)
   to your Telegram channel. Runs on Google's servers - needs no Claude session, no subscription.
   ONE-TIME SETUP (you do this, so the bot token never passes through chat):
     1. In Telegram, talk to @BotFather -> /newbot -> copy the token. Add the bot as an ADMINISTRATOR of your channel.
     2. Apps Script editor -> Project Settings (gear) -> Script properties -> add:
          TG_TOKEN = <bot token>      TG_CHAT = @yourchannelname   (or the numeric id like -100123456789)
     3. Run installTelegramTrigger() once (authorise when asked). Run tgTest() to send a test line.            */
var TG_SITE = 'https://ssjs1mu.github.io/jc-stock-analyst/';
var TG_MORNING = { 'premarket-news': 1, 'morning-brief': 1, 'morning-detailed': 1, 'morning-pulse': 1 }; // posted one by one from 08:15 IST, at least 10 minutes apart, in this order
var TG_IDS = ['premarket-news', 'morning-brief', 'morning-detailed', 'morning-pulse', 'evening-market-wrap', 'evening-news-wrap', 'circuit-watch'];
function tgProps_() { var p = PropertiesService.getScriptProperties(); var t = p.getProperty('TG_TOKEN'), c = p.getProperty('TG_CHAT'); if (!t || !c) throw new Error('Set TG_TOKEN and TG_CHAT in Script properties first'); return { p: p, t: t, c: c }; }
function tgTest() { var s = tgProps_(); var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/sendMessage', { method: 'post', payload: { chat_id: s.c, text: "Joshi's Corner report feed connected." }, muteHttpExceptions: true }); Logger.log(r.getContentText()); return r.getContentText(); }
function installTelegramTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tgPostReports') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tgPostReports').timeBased().everyMinutes(5).create();
}
/* NSE equity trading holidays 2026 (exchange circular; cross-checked on two sources). A holiday is treated exactly like a non-trading day: no 5-minute signals, no morning sequence, no client daily post - news only, every 30 minutes. KEEP IN SYNC with NSE_HOLIDAYS in pipeline/auto_reports.py. ADD NEXT YEAR'S LIST EACH DECEMBER. Weekend entries (15-Feb, 21-Mar, 15-Aug) need no entry: weekends are already non-trading. Muhurat session (Sun 08-Nov-2026, timings TBA) is NOT treated as trading. */
var TG_HOLIDAYS = {
  '2026-01-15': 1, '2026-01-26': 1, '2026-03-03': 1, '2026-03-26': 1, '2026-03-31': 1, '2026-04-03': 1, '2026-04-14': 1, '2026-05-01': 1,
  '2026-05-28': 1, '2026-06-26': 1, '2026-09-14': 1, '2026-10-02': 1, '2026-10-20': 1, '2026-11-10': 1, '2026-11-24': 1, '2026-12-25': 1
};
function tgTradingDay_(ymd, dow) { return dow >= 1 && dow <= 5 && !TG_HOLIDAYS[ymd]; }
// Watchdog: GitHub's own cron is often hours late. If GH_TOKEN (fine-grained token, repo ssjs1mu/jc-stock-analyst, Actions: read & write only)
// is set in Script properties, this asks GitHub to build any report that is due but not yet published today. No token = does nothing.
var GH_DUE = [['premarket-news', 460, 900], ['morning-brief', 490, 900], ['morning-detailed', 490, 900], ['morning-pulse', 505, 900], ['evening-market-wrap', 1060, 1439], ['evening-news-wrap', 1120, 1439]];
function ghWatchdog_() {
  try {
    var p = PropertiesService.getScriptProperties(), tok = p.getProperty('GH_TOKEN'); if (!tok) return;
    var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'), ist = new Date(Date.now() + 19800000), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (!tgTradingDay_(today, ist.getUTCDay())) return;
    var last = parseInt(p.getProperty('GH_LAST') || '0', 10); if (Date.now() - last < 12 * 60000) return; // at most one nudge per 12 minutes
    var due = [];
    GH_DUE.forEach(function (d) {
      if (mins < d[1] || mins > d[2]) return;
      var r = UrlFetchApp.fetch(TG_SITE + 'reports/' + d[0] + '/index.json?t=' + Date.now(), { muteHttpExceptions: true }); if (r.getResponseCode() !== 200) return;
      var runs = (JSON.parse(r.getContentText()).runs || []);
      if (!runs.some(function (x) { return x.date === today && (x.status === 'ok' || x.status === 'holiday'); })) due.push(d[0]);
    });
    if (!due.length) return;
    p.setProperty('GH_LAST', String(Date.now()));
    var res = UrlFetchApp.fetch('https://api.github.com/repos/ssjs1mu/jc-stock-analyst/actions/workflows/auto-reports.yml/dispatches', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' }, payload: JSON.stringify({ ref: 'main', inputs: { ids: due.join(' '), force: 'false' } }), muteHttpExceptions: true });
    Logger.log('watchdog ' + due.join(',') + ' -> ' + res.getResponseCode());
  } catch (e) { Logger.log('watchdog ' + e); }
}
function tgPostReports() {
  ghWatchdog_();
  var pp = PropertiesService.getScriptProperties(); if (!pp.getProperty('TG_TOKEN') || !pp.getProperty('TG_CHAT')) return 0; // not configured yet - stay quiet
  var s = tgProps_(), sent = {}; try { sent = JSON.parse(s.p.getProperty('TG_SENT') || '{}'); } catch (e) { }
  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'), n = 0;
  var ist0 = new Date(Date.now() + 19800000), dow0 = ist0.getUTCDay(), min0 = ist0.getUTCHours() * 60 + ist0.getUTCMinutes(), tradingDay = tgTradingDay_(today, dow0);
  var mq = {}; try { mq = JSON.parse(s.p.getProperty('TG_MQ') || '{}'); } catch (e) { } if (mq.d !== today) mq = { d: today, t: 0 };
  var morningDone = false;
  TG_IDS.forEach(function (id) {
    try {
      if (TG_MORNING[id] && tradingDay) { if (min0 < 495 || morningDone || Date.now() - mq.t < 540000) return; } // 08:15 start, one report per turn, 10-minute gap
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
      if (res.getResponseCode() === 200) { sent[id] = run.generated_at; n++; if (TG_MORNING[id] && tradingDay) { morningDone = true; mq.t = Date.now(); s.p.setProperty('TG_MQ', JSON.stringify(mq)); } } else Logger.log(id + ' ' + res.getContentText());
    } catch (e) { Logger.log(id + ' ' + e); }
  });
  s.p.setProperty('TG_SENT', JSON.stringify(sent));
  try { tgLive_(s); } catch (e) { Logger.log('live ' + e); }
  return n;
}

/* ---------- live news + live stock signals (same 5-minute trigger) ---------- */
function tgSend_(s, html) { var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + s.t + '/sendMessage', { method: 'post', payload: { chat_id: s.c, text: html, parse_mode: 'HTML', disable_web_page_preview: 'true' }, muteHttpExceptions: true }); if (r.getResponseCode() !== 200) Logger.log('send ' + r.getContentText()); return r.getResponseCode() === 200; }
function tgEsc_(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function tgNum_(v, d) { return Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); }
function tgLive_(s) {
  var ist = new Date(Date.now() + 19800000), dow = ist.getUTCDay(), m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  var today = ist.toISOString().slice(0, 10), hhmm = ist.toISOString().slice(11, 16), wk = tgTradingDay_(today, dow); // false on weekends AND NSE holidays
  var trading = wk && m >= 555 && m <= 930; // 09:15-15:30 IST
  /* trading hours: live news + live stock signals every 5 minutes. Outside trading hours: live news every 30 minutes (06:00-23:00 IST, every day), quiet overnight. */
  if (trading) { tgNews_(s); if (m >= 560 && m <= 940) tgSignals_(s, m, today, hhmm); }
  else if (m >= 360 && m <= 1380) {
    var last = parseInt(s.p.getProperty('TG_LT') || '0', 10);
    if (Date.now() - last >= 28 * 60000) { s.p.setProperty('TG_LT', String(Date.now())); tgNews_(s); }
  }
  if (wk) { try { tgAccum_(s, m, today); } catch (e) { Logger.log('accum ' + e); } }
  if (wk && m >= 495 && m <= 600) { try { tgClients_(s, today); } catch (e) { Logger.log('clients ' + e); } }
}
/* ---------- pre-market accumulation list (08:45-09:30) and 10 AM live confirmation (10:00-11:00) from data/accum.json ---------- */
function tgAccum_(s, m, today) {
  var phase = (m >= 525 && m <= 570) ? 'LIST' : (m >= 600 && m <= 660) ? 'CONF' : ''; if (!phase) return;
  var st = {}; try { st = JSON.parse(s.p.getProperty('TG_ACC') || '{}'); } catch (e) { } if (st[phase] === today) return;
  var r = UrlFetchApp.fetch(TG_SITE + 'data/accum.json?t=' + Date.now(), { muteHttpExceptions: true }); if (r.getResponseCode() !== 200) return;
  var j = JSON.parse(r.getContentText()), P = j.picks || [], X = j.exits || [], W = j.results_watch || [], NM = { SURGEQ: 'Quality surge', SURGEHOLD: 'Surge holding', RUNLOWDEL: 'Retail-heavy run', ABSORB: 'Absorption', SHAKE: 'Shakeout then quiet', HHHL: 'Higher highs/lows', FIBDRY: 'Fib level, volume dry', CLIMAX: 'Climax reversal', REDHEAVY: 'Red on heavy volume' };
  var nm = function (a) { return a.map(function (k) { return NM[k] || k; }).join(', '); };
  if (phase === 'LIST') {
    var L = ['🌅 <b>Pre-market list</b> · data as of ' + tgEsc_(j.asof) + ' (NSE delivery + prices, ' + j.stocks + ' stocks)', ''];
    if (P.length) { L.push('<b>Accumulation / continuation candidates</b>'); P.slice(0, 8).forEach(function (p) { L.push('• <b>' + tgEsc_(p.sym) + '</b> ' + tgNum_(p.close) + ' — ' + tgEsc_(nm(p.sigs)) + '\n   above ' + tgNum_(p.trigger) + ' · stop ' + tgNum_(p.stop) + ' · plan exit by ~session ' + p.exit_by + (p.results ? ' · ⚠ results ' + tgEsc_(p.results) : '')); }); }
    else L.push('No candidate from the tested signals today.');
    if (X.length) { L.push('', '<b>Exit / avoid watch</b>'); X.slice(0, 6).forEach(function (p) { L.push('• <b>' + tgEsc_(p.sym) + '</b> ' + tgNum_(p.close) + ' — ' + tgEsc_(nm(p.sigs))); }); }
    if (W.length) { L.push('', '<b>Results due within a week after a run-up</b> (a risk flag, not a sell signal)'); W.slice(0, 6).forEach(function (p) { L.push('• <b>' + tgEsc_(p.sym) + '</b> results ' + tgEsc_(p.date) + ' — ' + tgEsc_(p.why)); }); }
    L.push('', 'Confirmation check follows at about 10 AM.', '<i>Back-tested rule-based signals (modest edge, not certainty). Not advice; no outcome is guaranteed. Track record: terminal → Accumulation &amp; Exit.</i>');
    if (tgSend_(s, L.join('\n'))) { st.LIST = today; s.p.setProperty('TG_ACC', JSON.stringify(st)); }
    return;
  }
  var syms = {}; P.concat(X).forEach(function (p) { syms[p.sym] = 1; }); syms = Object.keys(syms); if (!syms.length) { st.CONF = today; s.p.setProperty('TG_ACC', JSON.stringify(st)); return; }
  var q = JSON.parse(liveQ_(syms.map(function (x) { return x + '.NS'; }).join(','))); if (!q.ok) return; q = q.q;
  var frac = Math.min(1, Math.max((m - 555) / 375, 0.06));
  var stat = function (p) {
    var a = q[p.sym + '.NS']; if (!a) return '— no quote'; var px = a[0], pc = a[1], v = a[5], av = a[6], pace = av > 0 ? v / (av * frac) : null, t = tgNum_(px) + ' (' + ((px / pc - 1) * 100).toFixed(1) + '%)' + (pace != null ? ' · vol ' + pace.toFixed(1) + '×' : '');
    if (p.stop && px <= p.stop) return '❌ FAILED (at/below stop) ' + t; if (p.trigger && px >= p.trigger) return '✅ TRIGGERED ' + t;
    if (px >= p.close * 0.995 && (pace == null || pace >= 0.8)) return '🟦 CONFIRMED (holding the close) ' + t; return '🟧 WAIT ' + t;
  };
  var C = ['🕙 <b>10 AM confirmation</b>', ''];
  P.slice(0, 8).forEach(function (p) { C.push('• <b>' + tgEsc_(p.sym) + '</b> — ' + stat(p) + '\n   above ' + tgNum_(p.trigger) + ' · stop ' + tgNum_(p.stop)); });
  if (X.length) { C.push('', '<b>Exit / avoid watch</b>'); X.slice(0, 6).forEach(function (p) { var a = q[p.sym + '.NS']; C.push('• <b>' + tgEsc_(p.sym) + '</b> ' + (a ? tgNum_(a[0]) + ' (' + ((a[0] / a[1] - 1) * 100).toFixed(1) + '%)' : '')); }); }
  C.push('', '<i>Confirmation rules are not back-tested (no intraday history). Not advice; no outcome is guaranteed.</i>');
  if (tgSend_(s, C.join('\n'))) { st.CONF = today; s.p.setProperty('TG_ACC', JSON.stringify(st)); }
}
function tgNews_(s) {
  var qs = ['Sensex OR Nifty OR "Bank Nifty" when:1d', 'RBI OR rupee OR "FII" OR "crude oil" India when:1d', '"Wall Street" OR Nasdaq OR "Fed" stocks when:1d'], tags = ['INDIA', 'MACRO', 'GLOBAL'], items = [];
  qs.forEach(function (q, i) {
    try {
      var x = UrlFetchApp.fetch('https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-IN&gl=IN&ceid=IN:en', { muteHttpExceptions: true }).getContentText();
      var doc = XmlService.parse(x), its = doc.getRootElement().getChild('channel').getChildren('item');
      its.slice(0, 12).forEach(function (it) {
        var t = it.getChildText('title') || '', src = it.getChildText('source') || ''; if (src && t.slice(-(src.length + 3)) === ' - ' + src) t = t.slice(0, -(src.length + 3));
        items.push({ t: t, src: src, link: it.getChildText('link') || '', ts: Date.parse(it.getChildText('pubDate') || '') || 0, tag: tags[i] });
      });
    } catch (e) { }
  });
  var seen = {}, first = false; try { seen = JSON.parse(s.p.getProperty('TG_NEWS') || 'null'); } catch (e) { } if (!seen) { seen = {}; first = true; }
  items.sort(function (a, b) { return b.ts - a.ts; });
  var fresh = [], cut = Date.now() - 3 * 3600000;
  items.forEach(function (n) { var k = n.t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50); if (!n.t || seen[k]) return; seen[k] = Date.now(); if (!first && n.ts > cut) fresh.push(n); });
  Object.keys(seen).forEach(function (k) { if (Date.now() - seen[k] > 2 * 86400000) delete seen[k]; });
  s.p.setProperty('TG_NEWS', JSON.stringify(seen));
  if (!fresh.length) return;
  fresh = fresh.slice(0, 6);
  tgSend_(s, '📰 <b>Live news</b>\n\n' + fresh.map(function (n) { return '• <b>' + tgEsc_(n.tag) + '</b> — <a href="' + tgEsc_(n.link) + '">' + tgEsc_(n.t) + '</a>' + (n.src ? ' <i>(' + tgEsc_(n.src) + ')</i>' : ''); }).join('\n'));
}
function tgSignals_(s, m, today, hhmm) {
  var uni = universe_(); if (!uni.length) return;
  var r = JSON.parse(liveQ_(uni.map(function (x) { return x + '.NS'; }).join(',')));
  if (!r.ok) return; var q = r.q;
  var seen = {}; try { seen = JSON.parse(s.p.getProperty('TG_SIG') || '{}'); } catch (e) { } if (seen.d !== today) seen = { d: today, k: {} };
  var prev = {}; try { prev = JSON.parse(CacheService.getScriptCache().get('tgq') || '{}'); } catch (e) { }
  var el = Math.max(1, m - 555), frac = Math.min(1, Math.max(el / 375, 0.06)), now = Date.now(), snap = {};
  var G = { BRK: [], BURST: [], VOL: [], RATE: [], H52: [], L52: [] };
  Object.keys(q).forEach(function (k) {
    var a = q[k], px = a[0], pc = a[1], o = a[2], h = a[3], l = a[4], v = a[5], av = a[6], h52 = a[8], l52 = a[9], sym = k.replace(/\.NS$/, '');
    if (!(px > 50 && pc > 0 && av > 2e5 && v > 0)) return;
    snap[sym] = [px, v, now];
    var chg = (px / pc - 1) * 100, pace = v / (av * frac), P = prev[sym], key;
    if (chg >= 2.5 && pace >= 3 && px >= h * 0.985) { G.BRK.push({ sym: sym, px: px, chg: chg, pace: pace }); return; }
    if (P && now - P[2] >= 150000 && now - P[2] <= 720000) { var dpx = (px / P[0] - 1) * 100, dv = v - P[1]; if (dpx >= 1.5 && dv >= 0.1 * av && chg >= 1.5) { G.BURST.push({ sym: sym, px: px, chg: chg, pace: pace, d: dpx, mins: Math.round((now - P[2]) / 60000) }); return; } }
    if (Math.abs(chg) >= 4) G.RATE.push({ sym: sym, px: px, chg: chg, pace: pace });
    else if (pace >= 3) G.VOL.push({ sym: sym, px: px, chg: chg, pace: pace });
    if (h52 && px >= h52 * 0.999) G.H52.push({ sym: sym, px: px, chg: chg, pace: pace }); else if (l52 && px <= l52 * 1.001) G.L52.push({ sym: sym, px: px, chg: chg, pace: pace });
  });
  try { CacheService.getScriptCache().put('tgq', JSON.stringify(snap), 1800); } catch (e) { }
  var lines = [], cap = { BRK: 4, BURST: 4, RATE: 4, VOL: 4, H52: 3, L52: 3 }, title = { BRK: '🚀 BREAKOUT', BURST: '⚡ VOLUME BURST', RATE: '📊 RATE BLAST', VOL: '🔊 VOLUME BLAST', H52: '🏔 52-WEEK HIGH', L52: '🕳 52-WEEK LOW' };
  Object.keys(G).forEach(function (t) {
    var arr = G[t].filter(function (x) { return !seen.k[x.sym + ':' + t]; });
    arr.sort(function (a, b) { return t === 'RATE' ? Math.abs(b.chg) - Math.abs(a.chg) : b.pace - a.pace; });
    arr.slice(0, cap[t]).forEach(function (x) {
      seen.k[x.sym + ':' + t] = 1;
      var base = '<b>' + tgEsc_(x.sym) + '</b> ' + tgNum_(x.px) + ' (' + (x.chg >= 0 ? '+' : '') + x.chg.toFixed(1) + '%)';
      if (t === 'BRK' || t === 'BURST') { var slp = x.chg >= 6 ? 2 : 1.5; base += (t === 'BURST' ? ' +' + x.d.toFixed(1) + '% in ' + x.mins + 'm' : '') + ' · vol ' + x.pace.toFixed(1) + '×\n   Entry ' + tgNum_(x.px) + ' · SL ' + tgNum_(x.px * (1 - slp / 100)) + ' · T1 ' + tgNum_(x.px * 1.015) + ' · T2 ' + tgNum_(x.px * 1.03) + ' · T3 ' + tgNum_(x.px * 1.05); }
      else if (t === 'VOL' || t === 'RATE') base += ' · vol ' + x.pace.toFixed(1) + '×';
      lines.push(title[t] + '  ' + base);
    });
  });
  s.p.setProperty('TG_SIG', JSON.stringify(seen));
  if (!lines.length) return;
  tgSend_(s, '📡 <b>Live stock signals</b> · ' + hhmm + ' IST\n\n' + lines.join('\n') + '\n\n<i>Rule-based scan of ~500 NSE stocks, delayed quotes. Not advice — levels are mechanical; no outcome is guaranteed.</i>');
}
