/* ============================================================
   Joshi's Corner — TODAY'S CALLS  +  OUR RECOMMENDATIONS
   • Today's Calls: the morning call book (day-trading calls + investment calls with tenure), locked at the time it is issued and tracked live.
     The Apps Script backend builds it at ≈ 8:10–8:25 AM IST (trigger) and settles it after the close; if it has not run by 8:30 AM the terminal builds it itself.
   • Our Recommendations: the permanent, date-wise record of every call with its reconciliation — days held and % return.
   Calls come from calls_engine.js (JCE): a call is issued only when trend, ADX, RSI, MACD, volume, CPR, 20-day range and the Nifty/VIX regime agree.
   ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v, d) => (num(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '—');
  const sg = (v, d) => (num(v) ? (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) : '—');
  const NIFTY50 = 'RELIANCE TCS HDFCBANK ICICIBANK INFY BHARTIARTL ITC SBIN LT HINDUNILVR KOTAKBANK AXISBANK BAJFINANCE MARUTI SUNPHARMA HCLTECH ASIANPAINT NTPC ULTRACEMCO TITAN ONGC POWERGRID M&M BAJAJFINSV WIPRO ADANIENT ADANIPORTS COALINDIA JSWSTEEL TATASTEEL NESTLEIND TECHM GRASIM HINDALCO CIPLA DRREDDY EICHERMOT APOLLOHOSP BPCL BRITANNIA DIVISLAB HEROMOTOCO INDUSINDBK SBILIFE HDFCLIFE TATACONSUM BAJAJ-AUTO SHRIRAMFIN TRENT'.split(' ');
  const FINAL = { SL: 1, T1: 1, T2: 1, NT: 1, SKIP: 1, 'EOD+': 1, 'EOD−': 1, EXPIRED: 1 };
  const LS = 'jc_calls_v1';
  const C = { book: { days: {}, calls: [], updated: 0 }, loaded: false, busy: false, msg: '', err: '', src: '', dirty: {}, saveT: null, trackAt: 0, invAt: 0, timer: null, recF: (() => { try { return JSON.parse(localStorage.getItem('jc_recf') || 'null') || { t: 'all', r: 'all' }; } catch (e) { return { t: 'all', r: 'all' }; } })() };

  /* ---------- time ---------- */
  const istMin = () => { const d = new Date(Date.now() + 19800000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const istToday = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  const istDow = () => new Date(Date.now() + 19800000).getUTCDay(); // 0 Sun … 6 Sat
  const isWeekday = () => istDow() >= 1 && istDow() <= 5;
  const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const fmtD = (iso) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00Z'); return d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: '2-digit', weekday: 'short' }); };
  const yfOf = (c) => (c.ex === 'BO' ? c.sym + '.BO' : c.sym + '.NS');
  const symKey = (c) => (c.ex === 'BO' ? c.sym + '.BO' : c.sym);

  /* ---------- backend ---------- */
  async function api(qs) { const be = getBackend(); if (!be) throw new Error('No backend URL'); const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=' + qs), 28000)); if (j && j.error) throw new Error(j.error); return j; }
  async function post(action, data) { const be = getBackend(); if (!be) return; const r = await fetch(be, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, data }) }); const j = JSON.parse(await r.text()); if (j && j.error) throw new Error(j.error); return j; }
  const cacheBook = () => { try { localStorage.setItem(LS, JSON.stringify(C.book)); } catch (e) {} };
  const readCache = () => { try { const j = JSON.parse(localStorage.getItem(LS) || 'null'); if (j && Array.isArray(j.calls)) { j.days = j.days || {}; return j; } } catch (e) {} return null; };
  function mergeBook(b) {
    const byId = {}; C.book.calls.forEach((c, i) => { byId[c.id] = i; });
    (b.calls || []).forEach((r) => { if (byId[r.id] == null) { C.book.calls.push(r); byId[r.id] = C.book.calls.length - 1; } else { const ex = C.book.calls[byId[r.id]]; if (FINAL[ex.status] && !FINAL[r.status]) return; if (C.dirty[r.id] && !FINAL[r.status]) return; C.book.calls[byId[r.id]] = Object.assign(ex, r); } });
    Object.keys(b.days || {}).forEach((d) => { if (!C.book.days[d]) C.book.days[d] = b.days[d]; }); C.book.updated = Math.max(C.book.updated || 0, b.updated || 0);
  }
  async function loadBook() {
    try { const j = await api('calls_load'); mergeBook(j); C.src = 'drive'; C.err = ''; cacheBook(); }
    catch (e) { C.err = /unknown action/i.test(e.message || '') ? 'The Apps Script backend is the old version — redeploy Code.gs as a New version (call book needs v9).' : (e && e.message) || 'backend not reachable'; const c = readCache(); if (c && !C.loaded) mergeBook(c); C.src = 'browser'; }
    C.loaded = true;
  }
  function queueSave(rec) { C.dirty[rec.id] = rec; clearTimeout(C.saveT); C.saveT = setTimeout(flush, 2500); cacheBook(); }
  async function flush() {
    const recs = Object.values(C.dirty); if (!recs.length) return; const days = {}; Object.keys(C.book.days).forEach((d) => { days[d] = C.book.days[d]; });
    try { await post('calls_save', { calls: recs, days }); recs.forEach((r) => { if (C.dirty[r.id] === r) delete C.dirty[r.id]; }); C.err = ''; } catch (e) { C.err = 'Could not save to Drive: ' + ((e && e.message) || e); }
  }

  /* ---------- building today's book in the browser (fallback when the 8:10 trigger has not run) ---------- */
  async function mapLimit(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } } })); return out; }
  function universe() {
    const seen = new Set(), list = []; const add = (s) => { s = String(s || '').toUpperCase(); if (s && !seen.has(s)) { seen.add(s); list.push(s); } };
    try { if (typeof wlEnsure === 'function') wlEnsure(); (WL.store ? WL.store.lists : []).forEach((l) => l.syms.forEach(add)); } catch (e) {}
    NIFTY50.forEach(add); try { (window.jcUni ? window.jcUni() : []).forEach(add); } catch (e) {} return list;
  }
  async function buildClient(force) {
    if (C.busy) return; C.busy = true; const today = istToday();
    try {
      C.msg = 'Building today’s call book…'; paint();
      await loadBook(); if (C.book.days[today] && !force) return;
      const uni = universe(), yf = uni.map((s) => (/\.BO$/.test(s) ? s : s.replace(/\.NS$/, '') + '.NS')); let done = 0;
      const res = new Array(yf.length).fill(null), be = getBackend && getBackend(), bt = []; for (let i = 0; i < yf.length; i += 25) bt.push(i);
      await mapLimit(bt, 3, async (i0) => {
        const part = yf.slice(i0, i0 + 25);
        try {
          if (!be) throw new Error('no backend');
          const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=dailyb&range=2y&symbols=' + encodeURIComponent(part.join(','))), 60000));
          part.forEach((y, k) => { const b = j.bars && j.bars[y]; if (b && b.t.length >= 150) res[i0 + k] = b.t.map((t, q) => ({ t, o: b.o[q], h: b.h[q], l: b.l[q], c: b.c[q], v: b.v[q] })); });
        } catch (e) { await Promise.all(part.map(async (y, k) => { try { res[i0 + k] = (await fetchChart(y, '2y', '1d')).bars; } catch (e2) { } })); }
        await Promise.all(part.map(async (y, k) => { if (!res[i0 + k]) { try { res[i0 + k] = (await fetchChart(y, '2y', '1d')).bars; } catch (e2) { } } }));
        done += part.length; C.msg = `Scanning ${done}/${yf.length} stocks…`; paint();
      });
      const nifty = (await fetchChart('^NSEI', '2y', '1d')).bars; let vix = []; try { vix = (await fetchChart('^INDIAVIX', '2y', '1d')).bars; } catch (e) {}
      const stocks = [], missing = []; uni.forEach((s, i) => { if (res[i] && res[i].length) stocks.push({ sym: s.replace(/\.BO$/, ''), ex: /\.BO$/.test(s) ? 'BO' : 'NS', daily: res[i] }); else missing.push(s); });
      const book = JCE.buildBook({ dateIso: today, stocks, nifty, vix, maxDay: 10, maxInv: 5 }), now = new Date().toISOString(), openInv = {};
      C.book.calls.forEach((c) => { if (c.type === 'INV' && !FINAL[c.status]) openInv[symKey(c)] = 1; });
      const recs = [];
      book.day.forEach((c) => { c.id = 'D-' + today + '-' + symKey(c); c.status = 'WAIT'; c.createdAt = now; c.lockedAt = now; c.src = 'terminal'; recs.push(c); });
      book.inv.forEach((c) => { if (openInv[symKey(c)]) return; c.id = 'I-' + today + '-' + symKey(c); c.status = 'WAIT'; c.createdAt = now; c.lockedAt = now; c.src = 'terminal'; c.expires = addSessions(c.refDate, c.tenureSessions); recs.push(c); });
      const have = new Set(C.book.calls.map((c) => c.id)); recs.forEach((r) => { if (!have.has(r.id)) C.book.calls.push(r); });
      C.book.days[today] = { generatedAt: now, source: 'terminal', scanned: stocks.length, missing: missing.length, dayCalls: book.day.length, invCalls: book.inv.length, noTrade: book.skipped.length, ctx: book.ctx };
      recs.forEach((r) => { C.dirty[r.id] = r; }); cacheBook(); await flush(); C.msg = '';
    } catch (e) { C.err = 'Could not build the call book: ' + ((e && e.message) || e); C.msg = ''; }
    finally { C.busy = false; paint(); }
  }
  function addSessions(iso, n) { let d = new Date(iso + 'T00:00:00Z'), c = 0; while (c < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) c++; } return d.toISOString().slice(0, 10); }

  /* ---------- live tracking ---------- */
  function applyEv(c, ev, extra) { c.status = ev.state; c.fill = ev.fill; c.exitPx = ev.exitPx; c.R = ev.R; c.retPct = ev.retPct; c.cmp = ev.cmp; c.t1hit = !!ev.t1hit; if (extra) Object.assign(c, extra); queueSave(c); }
  async function trackDay() {
    const today = istToday(), min = istMin(), recs = C.book.calls.filter((c) => c.type === 'DAY' && !FINAL[c.status]); if (!recs.length) return;
    const bySym = {}; recs.forEach((c) => { (bySym[yfOf(c)] = bySym[yfOf(c)] || []).push(c); });
    await mapLimit(Object.keys(bySym), 4, async (y) => {
      const r = await fetchChart(y, '5d', '5m'), bars = r.bars;
      bySym[y].forEach((c) => {
        const day = bars.filter((b) => JCE.istDate(b.t) === c.date); if (!day.length) return;
        const past = c.date < today, final = past || (isWeekday() && min >= 930) || !isWeekday(); if (day.length < 12 && !final) return;
        const sd = { dir: c.side === 'BUY' ? 1 : -1, entry: c.entry, sl: c.sl, t1: c.t1, t2: c.t2 }, ev = JCE.evalDay(sd, day, c.atr, final);
        applyEv(c, ev, final ? { exitDate: c.date, settledAt: new Date().toISOString(), settledBy: 'terminal', daysHeld: 0 } : null);
      });
    });
    C.trackAt = Date.now();
  }
  async function trackInv() {
    const recs = C.book.calls.filter((c) => c.type === 'INV' && !FINAL[c.status]); if (!recs.length) return;
    const bySym = {}; recs.forEach((c) => { (bySym[yfOf(c)] = bySym[yfOf(c)] || []).push(c); });
    await mapLimit(Object.keys(bySym), 3, async (y) => {
      const r = await fetchChart(y, '1y', '1d'); bySym[y].forEach((c) => { const ev = JCE.evalInvest(c, r.bars, c.expires); applyEv(c, ev, { exitDate: ev.exitDate, daysHeld: ev.daysHeld }); });
    });
    C.invAt = Date.now();
  }
  async function tick(force) {
    if (C.busy) return; const now = Date.now(), mkt = isWeekday() && istMin() >= 555 && istMin() <= 945;
    try {
      if (force || (mkt && now - C.trackAt > 55e3) || (!mkt && now - C.trackAt > 600e3)) { await trackDay(); }
      if (force || now - C.invAt > (mkt ? 600e3 : 1800e3)) { await trackInv(); }
    } catch (e) { C.err = (e && e.message) || String(e); }
    paint();
  }

  /* ---------- presentation helpers ---------- */
  const ST = { WAIT: ['Waiting for trigger', 'w'], LIVE: ['LIVE', 'l'], T1: ['T1 hit', 'g'], T2: ['T2 hit', 'g'], SL: ['Stop-loss', 'r'], 'EOD+': ['Closed +', 'g2'], 'EOD−': ['Closed −', 'r2'], NT: ['Not triggered', 'n'], SKIP: ['Skipped (gap)', 'n'], OPEN: ['Open', 'l'], 'T1·OPEN': ['T1 hit · running', 'g'], EXPIRED: ['Expired', 'n'] };
  const badge = (c) => { const s = ST[c.status] || [c.status || '—', 'n']; const extra = c.status === 'LIVE' && c.t1hit ? ' · T1 hit' : ''; return `<span class="cl-b cl-${s[1]}">${E(s[0] + extra)}</span>`; };
  const isTrig = (c) => num(c.fill) && c.status !== 'NT' && c.status !== 'SKIP' && c.status !== 'WAIT';
  const retTxt = (c) => (isTrig(c) && num(c.retPct) ? `<b class="${c.retPct >= 0 ? 'g' : 'r'}">${sg(c.retPct)}%</b><small>${sg(c.R, 2)}R</small>` : '<small>—</small>');
  const whyTxt = (c) => (c.why && c.why.length ? `<details class="cl-why"><summary>why</summary><ul>${c.why.map((w) => `<li>${E(w)}</li>`).join('')}</ul></details>` : '');
  const stockCell = (c) => { const k = symKey(c); return `<a href="#" class="symlink" onclick="loadSymbol('${E(k)}');return false">${E(c.sym)}</a>${c.ex === 'BO' ? '<em class="bsetag">BSE</em>' : ''}<button class="xrbtn" type="button" data-xr="${E(yfOf(c))}" title="Live X-ray">X-ray</button>`; };
  const gradeTag = (c) => `<span class="cl-g cl-g${(c.grade || 'B').replace('+', 'p')}">${E(c.grade || '')}</span>`;

  /* ---------- Today's Calls ---------- */
  const todayDay = () => C.book.calls.filter((c) => c.type === 'DAY' && c.date === istToday());
  function kpi(l, v, s, cl) { return `<div class="cl-k"><i>${l}</i><b class="${cl || ''}">${v}</b><small>${s || ''}</small></div>`; }
  function trackRecord(days) {
    const cut = new Date(Date.now() + 19800000 - days * 86400000).toISOString().slice(0, 10), rs = C.book.calls.filter((c) => c.date >= cut && isTrig(c) && FINAL[c.status]);
    if (!rs.length) return '<small>Track record builds from the first settled call.</small>';
    const w = rs.filter((c) => c.retPct > 0).length, avg = rs.reduce((a, c) => a + (c.retPct || 0), 0) / rs.length;
    return `Last ${days} days · <b>${rs.length}</b> settled trades · <b>${Math.round((w / rs.length) * 100)}%</b> profitable · avg <b class="${avg >= 0 ? 'g' : 'r'}">${sg(avg)}%</b> per trade`;
  }
  function renderToday() {
    const today = istToday(), min = istMin(), wd = isWeekday(), d = C.book.days[today], dayCalls = todayDay().sort((a, b) => (b.score || 0) - (a.score || 0));
    const closed = wd && min >= 935, early = wd && min < 8 * 60 + 10, build = C.busy;
    let status;
    if (!wd) status = `<span class="cl-s off">MARKET CLOSED</span> Weekend — the next call book arrives on the next trading day by 8:30 AM IST.`;
    else if (d) status = `<span class="cl-s ok">CALLS LOCKED</span> Issued ${new Date(d.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} IST by the ${d.source === 'server' ? 'Apps Script 8:10 AM trigger' : 'terminal'} · ${d.scanned} stocks scanned · ${d.dayCalls} day calls · ${d.invCalls} investment calls · ${d.noTrade} stocks with no edge.`;
    else if (build) status = `<span class="cl-s wait">BUILDING…</span> ${E(C.msg)}`;
    else if (early) status = `<span class="cl-s wait">AWAITING 8:10 AM</span> The call book is built automatically between 8:10 and 8:25 AM IST and is final by 8:30 AM.`;
    else status = `<span class="cl-s wait">NOT BUILT YET</span> The backend trigger has not run — the terminal builds it automatically; you can also press <b>Build now</b>.`;
    const ctx = d && d.ctx ? `Nifty regime <b>${E(d.ctx.regime)}</b> · India VIX <b>${num(d.ctx.vix) ? d.ctx.vix.toFixed(1) : '—'}</b>${d.ctx.vixHigh ? ' <span class="r">(high — stricter filters)</span>' : ''} · prior session ${sg(d.ctx.niftyChg)}%` : '';
    const trig = dayCalls.filter(isTrig), tgt = dayCalls.filter((c) => c.status === 'T1' || c.status === 'T2'), slc = dayCalls.filter((c) => c.status === 'SL'), wait = dayCalls.filter((c) => c.status === 'WAIT'), liveN = dayCalls.filter((c) => c.status === 'LIVE');
    const avg = trig.length ? trig.reduce((a, c) => a + (c.retPct || 0), 0) / trig.length : null;
    let h = `<div class="cl-head"><div><h2>Today’s Calls <small>${fmtD(today)}</small></h2><div class="cl-status">${status}</div>${ctx ? `<div class="cl-ctx">${ctx}</div>` : ''}</div><div class="cl-acts"><button class="cl-btn" onclick="jcCalls.refresh()">⟳ Refresh</button><button class="cl-btn" onclick="jcCalls.build()" ${wd && !build ? '' : 'disabled'}>${d ? 'Rebuild (unlock)' : 'Build now'}</button><button class="cl-btn" onclick="showTab('pRecs')">Our Recommendations ▸</button></div></div>`;
    if (C.err) h += `<div class="cl-err">⚠ ${E(C.err)}</div>`;
    h += `<div class="cl-kp">${kpi('Day calls', dayCalls.length, 'issued this morning')}${kpi('Triggered', trig.length, `${liveN.length} live now`)}${kpi('Targets hit', tgt.length, 'T1 / T2', tgt.length ? 'g' : '')}${kpi('Stop-loss', slc.length, 'hit today', slc.length ? 'r' : '')}${kpi('Waiting', wait.length, 'entry not confirmed')}${kpi('Day P&L', avg == null ? '—' : sg(avg) + '%', avg == null ? 'no trade yet' : 'avg per triggered call (after costs when closed)', avg == null ? '' : avg >= 0 ? 'g' : 'r')}</div><div class="cl-tr">${trackRecord(30)}</div>`;
    // ---- day calls
    if (closed && dayCalls.length) {
      h += `<section class="cl-card"><h3>Day-trading calls <span class="cl-chip">SETTLED · MOVED TO OUR RECOMMENDATIONS</span></h3><div class="cl-note">The market has closed. Today’s ${dayCalls.length} day calls have been settled on the real 5-minute candles and recorded date-wise in <a href="#" onclick="showTab('pRecs');return false"><b>Our Recommendations</b></a> with their % returns. A fresh call book arrives tomorrow by 8:30 AM IST.</div>${(!dayCalls.every((c) => FINAL[c.status])) ? '<div class="cl-note">Settling the remaining calls…</div>' : ''}<div class="cl-sum">${dayCalls.map((c) => `<span class="cl-pill ${isTrig(c) ? (c.retPct >= 0 ? 'p' : 'n') : 'z'}">${E(c.sym)} ${c.side === 'BUY' ? '▲' : '▼'} ${isTrig(c) ? sg(c.retPct) + '%' : (ST[c.status] || [c.status])[0]}</span>`).join('')}</div></section>`;
    } else if (!wd) { /* weekend: nothing */ }
    else {
      const rows = dayCalls.map((c, i) => `<tr class="${c.side === 'BUY' ? 'bull' : 'bear'}"><td class="cl-n">${i + 1}</td><td class="cl-st">${stockCell(c)}<small>${gradeTag(c)} score ${num(c.score) ? c.score.toFixed(1) : '—'}</small></td><td><span class="stance ${c.side === 'BUY' ? 'bull' : 'bear'}">${c.side === 'BUY' ? '▲ BUY' : '▼ SELL'}</span></td><td class="cl-px">${f2(c.cmp)}${num(c.cmp) && num(c.cmp0) ? `<small class="${c.cmp >= c.cmp0 ? 'g' : 'r'}">${sg((c.cmp / c.cmp0 - 1) * 100)}% vs close</small>` : `<small>prev ${f2(c.cmp0)}</small>`}</td><td><b>${f2(c.entry)}</b><small>5-min close ${c.side === 'BUY' ? 'above' : 'below'}</small></td><td class="r"><b>${f2(c.sl)}</b><small>${sg((c.sl / c.entry - 1) * 100)}%</small></td><td class="g"><b>${f2(c.t1)}</b><small>${sg((c.t1 / c.entry - 1) * 100)}% · ${E(c.t1Why || '')}</small></td><td class="g"><b>${f2(c.t2)}</b><small>${sg((c.t2 / c.entry - 1) * 100)}% · ${E(c.t2Why || '')}</small></td><td>${num(c.rr1) ? c.rr1.toFixed(1) + ' / ' + c.rr2.toFixed(1) : '—'}</td><td>${badge(c)}</td><td class="cl-px">${retTxt(c)}</td><td class="cl-w">${whyTxt(c)}</td></tr>`).join('');
      h += `<section class="cl-card"><h3>Day-trading calls <small>intraday · square-off 3:15 PM · new entries only 9:20 AM – 2:30 PM</small></h3>${rows ? `<div class="cl-sc"><table class="cl-t"><thead><tr><th>#</th><th>Stock</th><th>Side</th><th>LTP</th><th>Entry</th><th>Stop-loss</th><th>Target 1</th><th>Target 2</th><th>R:R</th><th>Status</th><th>P&amp;L</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="cl-note">${d ? 'No stock met the confluence rules this morning — <b>no day-trading call is issued rather than a forced one</b>.' : 'Call book not built yet.'}</div>`}<div class="cl-note">Entry only on a 5-minute <b>close</b> beyond the trigger (a wick does not count) — not before 9:20, not after 2:30 PM, not if the stock gaps/chases past it. Stop moves to cost after T1; half is booked at T1, half at T2. A call that does not trigger is shown as <i>Not triggered</i> and costs nothing.</div></section>`;
    }
    // ---- investment calls
    const inv = C.book.calls.filter((c) => c.type === 'INV' && !FINAL[c.status]).sort((a, b) => (a.date < b.date ? 1 : -1) || (b.score || 0) - (a.score || 0));
    const invRows = inv.map((c) => { const age = dayDiff(c.date, today), left = c.expires ? dayDiff(today, c.expires) : null, run = c.fill != null; return `<tr><td class="cl-st">${stockCell(c)}<small>${gradeTag(c)} score ${num(c.score) ? c.score.toFixed(1) : '—'} · issued ${fmtD(c.date)}</small></td><td><b>${c.mode === 'stop' ? 'Buy above ' + f2(c.entry) : 'Buy ' + f2(c.entryLo) + ' – ' + f2(c.entryHi)}</b><small>${c.mode === 'stop' ? 'breakout trigger' : 'pullback zone'}${run ? ' · filled ' + f2(c.fill) : ''}</small></td><td class="r"><b>${f2(c.sl)}</b><small>${sg((c.sl / c.entry - 1) * 100)}%</small></td><td class="g"><b>${f2(c.t1)}</b><small>${sg((c.t1 / c.entry - 1) * 100)}%</small></td><td class="g"><b>${f2(c.t2)}</b><small>${sg((c.t2 / c.entry - 1) * 100)}%</small></td><td><b>${E(c.tenure || '—')}</b><small>till ${fmtD(c.expires)}${left != null ? ' · ' + Math.max(0, left) + ' days left' : ''}</small></td><td>${badge(c)}<small>${run ? (c.daysHeld || 0) + ' sessions held' : 'day ' + age + ' of 5 to fill'}</small></td><td class="cl-px">${run && num(c.retPct) ? `<b class="${c.retPct >= 0 ? 'g' : 'r'}">${sg(c.retPct)}%</b><small>${num(c.cmp) ? 'LTP ' + f2(c.cmp) : ''}</small>` : '<small>—</small>'}</td><td class="cl-w">${whyTxt(c)}</td></tr>`; }).join('');
    h += `<section class="cl-card"><h3>Investment calls <small>positional · delivery · long-only · tracked until target, stop-loss or the tenure date</small></h3>${invRows ? `<div class="cl-sc"><table class="cl-t"><thead><tr><th>Stock</th><th>Entry</th><th>Stop-loss</th><th>Target 1</th><th>Target 2</th><th>Tenure</th><th>Status</th><th>Open return</th><th></th></tr></thead><tbody>${invRows}</tbody></table></div>` : `<div class="cl-note">${wd || d ? 'No investment call is open. A stock qualifies only in a confirmed stage-2 uptrend (price &gt; 50 DMA &gt; rising 200 DMA, outperforming the Nifty) at a pullback to support or a volume breakout, with a score of at least 5.5.' : ''}</div>`}<div class="cl-note">Half is booked at Target 1 (stop moves to cost), the rest at Target 2. If neither stop nor target is reached by the tenure date the call is closed at that day’s close (<i>Expired</i>). Closed calls move to <a href="#" onclick="showTab('pRecs');return false"><b>Our Recommendations</b></a>.</div></section>`;
    h += `<div class="cl-legal">Rule-based research output from delayed market data — not personalised investment advice, and no rule set can promise daily profit. Every call is locked when issued and reconciled on real candles so the record is honest, including the losses. Position-size so that one stop-loss costs a small, fixed share of capital.</div>`;
    return h;
  }

  /* ---------- Our Recommendations ---------- */
  function recRows() {
    const f = C.recF, cut = f.r === 'all' ? '' : new Date(Date.now() + 19800000 - parseInt(f.r, 10) * 86400000).toISOString().slice(0, 10), today = istToday(), min = istMin();
    return C.book.calls.filter((c) => (f.t === 'all' || c.type === f.t) && (!cut || c.date >= cut) && (FINAL[c.status] || c.type === 'INV' || c.date < today || (isWeekday() && min >= 935) || !isWeekday())).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.score || 0) - (a.score || 0)));
  }
  function summarizeDay(rs) {
    const trig = rs.filter((c) => isTrig(c) && FINAL[c.status]), open = rs.filter((c) => !FINAL[c.status] && c.type === 'INV');
    return { calls: rs.length, trig: trig.length, tgt: trig.filter((c) => c.status === 'T1' || c.status === 'T2').length, sl: trig.filter((c) => c.status === 'SL').length, eod: trig.filter((c) => /^EOD|EXPIRED/.test(c.status)).length, nt: rs.filter((c) => c.status === 'NT' || c.status === 'SKIP').length, open: open.length, win: trig.filter((c) => c.retPct > 0).length, net: trig.reduce((a, c) => a + (c.retPct || 0), 0), avg: trig.length ? trig.reduce((a, c) => a + (c.retPct || 0), 0) / trig.length : null, R: trig.reduce((a, c) => a + (c.R || 0), 0) };
  }
  function renderRecs() {
    const rows = recRows(), f = C.recF, byDate = {}; rows.forEach((c) => { (byDate[c.date] = byDate[c.date] || []).push(c); });
    const dates = Object.keys(byDate).sort().reverse(), all = summarizeDay(rows), settled = rows.filter((c) => isTrig(c) && FINAL[c.status]);
    const gw = settled.filter((c) => c.retPct > 0).reduce((a, c) => a + c.retPct, 0), gl = -settled.filter((c) => c.retPct <= 0).reduce((a, c) => a + c.retPct, 0), pf = gl ? gw / gl : null;
    const best = settled.slice().sort((a, b) => b.retPct - a.retPct)[0], worst = settled.slice().sort((a, b) => a.retPct - b.retPct)[0];
    // equal-weight day P&L, cumulative oldest → newest
    let cum = 0; const cumMap = {}; dates.slice().reverse().forEach((d) => { const s = summarizeDay(byDate[d]); cum += s.avg == null ? 0 : s.avg; cumMap[d] = cum; });
    const chip = (grp, v, l) => `<button class="cl-fc${f[grp] === v ? ' on' : ''}" onclick="jcCalls.setF('${grp}','${v}')">${l}</button>`;
    let h = `<div class="cl-head"><div><h2>Our Recommendations <small>date-wise record &amp; reconciliation</small></h2><div class="cl-status">Every call issued from Today’s Calls is recorded here after the market closes — day calls the same evening, investment calls when they close (target / stop-loss / tenure) — with days held and % return. Nothing is edited after settlement.</div></div><div class="cl-acts"><button class="cl-btn" onclick="jcCalls.refresh()">⟳ Refresh</button><button class="cl-btn" onclick="jcCalls.csv()">⬇ CSV</button><button class="cl-btn" onclick="showTab('pCalls')">◂ Today’s Calls</button></div></div>`;
    if (C.err) h += `<div class="cl-err">⚠ ${E(C.err)}</div>`;
    h += `<div class="cl-fl"><span>Type</span>${chip('t', 'all', 'All')}${chip('t', 'DAY', 'Day-trading')}${chip('t', 'INV', 'Investment')}<span style="margin-left:14px">Period</span>${chip('r', '7', '7 days')}${chip('r', '30', '30 days')}${chip('r', '90', '90 days')}${chip('r', 'all', 'All')}</div>`;
    h += `<div class="cl-kp">${kpi('Calls issued', all.calls, `${all.trig} triggered · ${all.nt} not triggered`)}${kpi('Win rate', settled.length ? Math.round((all.win / settled.length) * 100) + '%' : '—', `${all.win} of ${settled.length} settled trades`, settled.length && all.win / settled.length >= 0.5 ? 'g' : settled.length ? 'r' : '')}${kpi('Target hit', all.trig ? Math.round((all.tgt / all.trig) * 100) + '%' : '—', `${all.tgt} of ${all.trig}`)}${kpi('Stop-loss', all.trig ? Math.round((all.sl / all.trig) * 100) + '%' : '—', `${all.sl} of ${all.trig}`, all.sl ? 'r' : '')}${kpi('Avg per trade', all.avg == null ? '—' : sg(all.avg) + '%', 'after costs', all.avg == null ? '' : all.avg >= 0 ? 'g' : 'r')}${kpi('Cumulative', dates.length ? sg(cum) + '%' : '—', 'sum of daily avg %', cum >= 0 ? 'g' : 'r')}${kpi('Profit factor', pf == null ? '—' : pf.toFixed(2), 'gross win ÷ gross loss', pf != null && pf >= 1 ? 'g' : pf != null ? 'r' : '')}${kpi('Open calls', all.open, 'investment, running')}</div>`;
    if (best) h += `<div class="cl-tr">Best <b class="g">${E(best.sym)} ${sg(best.retPct)}%</b> (${fmtD(best.date)}) · Worst <b class="r">${E(worst.sym)} ${sg(worst.retPct)}%</b> (${fmtD(worst.date)})</div>`;
    if (!dates.length) h += `<section class="cl-card"><div class="cl-note">No recommendations recorded yet. Today’s calls move here after the 3:30 PM close; investment calls move here when they close.</div></section>`;
    else {
      h += `<section class="cl-card"><h3>Daily reconciliation <small>equal capital per trade · day return = average % of that day’s triggered trades</small></h3><div class="cl-sc"><table class="cl-t cl-rec"><thead><tr><th>Date</th><th>Calls</th><th>Triggered</th><th>Target</th><th>Stop-loss</th><th>Closed/Exp.</th><th>Not trig.</th><th>Open</th><th>Win %</th><th>Net R</th><th>Day return</th><th>Cumulative</th></tr></thead><tbody>${dates.map((d) => { const s = summarizeDay(byDate[d]); return `<tr><td>${fmtD(d)}</td><td>${s.calls}</td><td>${s.trig}</td><td class="g">${s.tgt}</td><td class="r">${s.sl}</td><td>${s.eod}</td><td>${s.nt}</td><td>${s.open}</td><td>${s.trig ? Math.round((s.win / s.trig) * 100) + '%' : '—'}</td><td class="${s.R >= 0 ? 'g' : 'r'}">${s.trig ? sg(s.R, 2) : '—'}</td><td class="${(s.avg || 0) >= 0 ? 'g' : 'r'}"><b>${s.avg == null ? '—' : sg(s.avg) + '%'}</b></td><td class="${cumMap[d] >= 0 ? 'g' : 'r'}">${sg(cumMap[d])}%</td></tr>`; }).join('')}</tbody></table></div></section>`;
      h += dates.map((d) => { const s = summarizeDay(byDate[d]); return `<section class="cl-card"><h3>${fmtD(d)} <small>${s.calls} calls · ${s.trig} triggered · day return <b class="${(s.avg || 0) >= 0 ? 'g' : 'r'}">${s.avg == null ? '—' : sg(s.avg) + '%'}</b></small></h3><div class="cl-sc"><table class="cl-t"><thead><tr><th>Type</th><th>Stock</th><th>Side</th><th>Entry</th><th>Stop-loss</th><th>T1</th><th>T2</th><th>Filled</th><th>Exit</th><th>Result</th><th>Days</th><th>Return</th></tr></thead><tbody>${byDate[d].map((c) => { const hold = c.type === 'INV' ? (c.exitDate ? dayDiff(c.date, c.exitDate) + 'd' : dayDiff(c.date, istToday()) + 'd <small>running</small>') : 'intraday'; return `<tr><td>${c.type === 'DAY' ? 'Day' : 'Invest'}${c.type === 'INV' ? `<small>${E(c.tenure || '')}</small>` : ''}</td><td class="cl-st">${stockCell(c)}${gradeTag(c)}</td><td><span class="stance ${c.side === 'BUY' ? 'bull' : 'bear'}">${c.side === 'BUY' ? '▲ BUY' : '▼ SELL'}</span></td><td>${c.type === 'INV' && c.mode !== 'stop' ? f2(c.entryLo) + '–' + f2(c.entryHi) : f2(c.entry)}</td><td class="r">${f2(c.sl)}</td><td class="g">${f2(c.t1)}</td><td class="g">${f2(c.t2)}</td><td>${num(c.fill) ? f2(c.fill) : '—'}</td><td>${num(c.exitPx) ? f2(c.exitPx) + (c.exitDate && c.type === 'INV' ? `<small>${fmtD(c.exitDate)}</small>` : '') : '—'}</td><td>${badge(c)}</td><td>${hold}</td><td class="cl-px">${retTxt(c)}</td></tr>`; }).join('')}</tbody></table></div></section>`; }).join('');
    }
    return h + '<div class="cl-legal">Returns are on the traded price, after an assumed 0.05% round-trip cost per triggered trade, on equal capital per call. Past reconciliation is a record of how the rules behaved — it does not guarantee future results.</div><div class="cl-legal"><b>Honest back-test of the day-call rules</b> (60 sessions × 39 Nifty stocks, run 16 Oct 2026 on real 5-minute candles): 344 triggered trades, about 50% winners, average ≈ +0.03% per trade after costs — roughly break-even, with about half the days positive. Requiring the first target to pay ≥ 1.5× the risk (now built in) lifted it to ≈ +0.07% on 246 trades. The edge is thin and not guaranteed: the live record above is the real judge, and sizing each trade so one stop-loss is a small fixed share of capital matters more than any single call.</div>';
  }
  function csv() {
    const rows = recRows(), cols = ['date', 'type', 'sym', 'ex', 'side', 'entry', 'sl', 't1', 't2', 'grade', 'score', 'status', 'fill', 'exitPx', 'exitDate', 'daysHeld', 'retPct', 'R', 'tenure'];
    const out = [cols.join(',')].concat(rows.map((c) => cols.map((k) => { let v = c[k]; if (typeof v === 'number') v = Math.round(v * 10000) / 10000; return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' })); a.download = 'Our_Recommendations_' + istToday() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- wiring ---------- */
  function paint() {
    const t = window.__curTab, st = window.scrollY;
    if (t === 'pCalls' && $('pCalls')) { $('pCalls').innerHTML = renderToday() + '<div id="clRadar"></div><div id="clBig"></div>'; if (window.jcRadar) window.jcRadar.paint(); if (window.jcBig) window.jcBig.paint(); window.scrollTo(0, st); }
    if (t === 'pRecs' && $('pRecs')) { $('pRecs').innerHTML = renderRecs(); window.scrollTo(0, st); }
  }
  async function onShow(first) {
    paint(); if (!C.loaded || first) await loadBook(); paint();
    const today = istToday(); if (isWeekday() && istMin() >= 8 * 60 + 30 && !C.book.days[today] && !C.busy) await buildClient(false);
    await tick(true);
  }
  window.jcCalls = {
    refresh: async () => { C.err = ''; await loadBook(); paint(); await tick(true); },
    build: async () => { const t = istToday(); if (C.book.days[t] && !confirm('Rebuild today’s call book? Calls already issued today will be kept; only new stocks are added. Use this only if the 8:10 AM build failed.')) return; await buildClient(true); },
    setF: (g, v) => { C.recF[g] = v; try { localStorage.setItem('jc_recf', JSON.stringify(C.recF)); } catch (e) {} paint(); },
    csv, state: C,
  };
  const CSS = `
  #pCalls,#pRecs{--g:#08783a;--r:#c0102e;--ink:#0a1430;--ink2:#34456a;background:linear-gradient(180deg,#e4ebf8,#edf1fa 60%,#e4ebf8);border-radius:16px;padding:10px}
  .cl-head{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;background:linear-gradient(120deg,#17388a,#0b1d4d);color:#fff;border-radius:14px;padding:14px 18px;margin-bottom:10px}.cl-head>div:first-child{flex:1;min-width:260px}.cl-head h2{margin:0 0 4px;font-size:22px;letter-spacing:.3px}.cl-head h2 small{font-size:12px;color:#c9d6f7;font-weight:700;margin-left:8px}
  .cl-status{font-size:12.5px;color:#e5ecff;line-height:1.5}.cl-ctx{font-size:12px;color:#c9d6f7;margin-top:4px}.cl-ctx b{color:#fff}.cl-acts{display:flex;gap:6px;flex-wrap:wrap}.cl-btn{border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.12);color:#fff;border-radius:8px;padding:6px 12px;font-weight:800;font-size:12px;cursor:pointer}.cl-btn:hover:not([disabled]){background:rgba(255,255,255,.28)}.cl-btn[disabled]{opacity:.45;cursor:default}
  .cl-s{display:inline-block;font-size:10.5px;font-weight:900;letter-spacing:.8px;padding:2px 9px;border-radius:99px;margin-right:6px}.cl-s.ok{background:#c9f0da;color:#06612f}.cl-s.wait{background:#fbe9c0;color:#7a4e00}.cl-s.off{background:#dfe5f3;color:#34456a}
  .cl-err{background:#fde6ea;color:#a10b27;border-radius:10px;padding:8px 12px;margin-bottom:8px;font-weight:700;font-size:12.5px}
  .cl-kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:6px}.cl-k{background:#fff;border:1px solid #bccae6;border-left:4px solid #14306e;border-radius:10px;padding:6px 10px;box-shadow:0 1px 5px rgba(20,48,110,.1)}.cl-k i{display:block;font-style:normal;font-size:9.5px;letter-spacing:.8px;text-transform:uppercase;color:#34456a;font-weight:800}.cl-k b{display:block;font:900 20px ui-monospace,Consolas,monospace;color:#0b2260}.cl-k b.g,.g{color:#08783a}.cl-k b.r,.r{color:#c0102e}.cl-k small{color:#34456a;font-size:10.5px}
  .cl-tr{font-size:12px;color:#24365e;margin:2px 2px 10px}.cl-card{background:#fff;border:1px solid #bccae6;border-radius:14px;padding:10px 12px;margin-bottom:10px;box-shadow:0 2px 8px rgba(20,48,110,.1)}.cl-card h3{margin:0 0 8px;font-size:15px;color:#0b2260;border-bottom:2px solid #dfe7f6;padding-bottom:6px}.cl-card h3 small{font-weight:700;color:#34456a;font-size:11.5px;margin-left:6px}
  .cl-chip{font-size:9.5px;letter-spacing:.8px;background:#dff5e8;color:#06612f;border-radius:99px;padding:2px 9px;margin-left:8px;font-weight:900}.cl-sc{overflow-x:auto}.cl-t{width:100%;border-collapse:collapse;font-size:12.5px;min-width:900px}.cl-t th{font-size:9.5px;letter-spacing:.7px;text-transform:uppercase;color:#34456a;text-align:left;padding:4px 6px;border-bottom:1.5px solid #c9d3e8;white-space:nowrap}.cl-t td{padding:6px;border-bottom:1px solid #e3e9f5;vertical-align:top;font-family:ui-monospace,Consolas,monospace}.cl-t td small{display:block;font:600 10.5px 'Segoe UI',sans-serif;color:#34456a}.cl-t tr.bull td:first-child,.cl-t tr.bear td:first-child{border-left:3px solid transparent}.cl-t tr.bull td:first-child{border-left-color:#0f8a4b}.cl-t tr.bear td:first-child{border-left-color:#c41e3c}
  .cl-st{font-family:'Segoe UI',sans-serif!important;font-weight:800;min-width:120px}.cl-st a{font-size:13.5px;color:#0b2260;text-decoration:none}.cl-st a:hover{text-decoration:underline}.cl-n{color:#34456a;font-weight:800;width:24px}.cl-px{white-space:nowrap}.cl-px b{font-size:13px}.cl-w{min-width:60px}
  .cl-b{display:inline-block;font:900 10.5px 'Segoe UI',sans-serif;letter-spacing:.3px;padding:3px 8px;border-radius:99px;white-space:nowrap}.cl-w .cl-b{margin:0}.cl-l{background:#dbe7ff;color:#14306e;animation:clp 1.6s infinite}@keyframes clp{50%{opacity:.6}}.cl-g{background:#c9f0da;color:#06612f}.cl-g2{background:#e3f6ec;color:#06612f}.cl-r{background:#fbd0d8;color:#a10b27}.cl-r2{background:#fde6ea;color:#a10b27}.cl-w{background:transparent}td .cl-w,.cl-b.cl-w{background:#fbe9c0;color:#7a4e00}.cl-n{}.cl-b.cl-n{background:#e6ebf7;color:#34456a}
  span.cl-g.cl-gAp,span.cl-g.cl-gA,span.cl-g.cl-gB{display:inline-block;font:900 9.5px 'Segoe UI',sans-serif;border-radius:5px;padding:0 5px;margin-right:4px}.cl-gAp{background:#14306e!important;color:#fff!important}.cl-gA{background:#2b59c3!important;color:#fff!important}.cl-gB{background:#e6ebf7!important;color:#34456a!important}
  .cl-why summary{cursor:pointer;color:#2b59c3;font:800 10.5px 'Segoe UI',sans-serif}.cl-why ul{margin:4px 0 0 14px;padding:0;font:600 11px 'Segoe UI',sans-serif;color:#24365e}.cl-note{font-size:11.5px;color:#34456a;margin-top:8px;line-height:1.5}.cl-legal{font-size:11px;color:#34456a;padding:6px 4px 2px}
  .cl-sum{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.cl-pill{font:800 11.5px 'Segoe UI',sans-serif;padding:3px 10px;border-radius:99px}.cl-pill.p{background:#c9f0da;color:#06612f}.cl-pill.n{background:#fbd0d8;color:#a10b27}.cl-pill.z{background:#e6ebf7;color:#34456a}
  .cl-fl{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;font-size:10.5px;color:#34456a;font-weight:800;text-transform:uppercase;letter-spacing:.7px}.cl-fc{border:1px solid #bccae6;background:#fff;border-radius:16px;padding:4px 12px;font-weight:800;color:#14306e;cursor:pointer;font-size:12px;text-transform:none;letter-spacing:0}.cl-fc.on{background:#14306e;color:#fff;border-color:#14306e}
  .cl-rec td,.cl-rec th{text-align:right}.cl-rec td:first-child,.cl-rec th:first-child{text-align:left}.cl-rec{min-width:760px}
  @media(max-width:700px){.cl-head h2{font-size:18px}.cl-k b{font-size:17px}}`;
  function build() {
    if ($('pCalls')) return; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const anchor = document.querySelector('details.datasec'); if (!anchor) return;
    [['pCalls', 'Loading today’s calls…'], ['pRecs', 'Loading recommendations…']].forEach(([id, t]) => { const p = document.createElement('div'); p.className = 'panel'; p.id = id; p.innerHTML = '<div class="note">' + t + '</div>'; anchor.parentNode.insertBefore(p, anchor); });
    const sel = $('viewSel'); if (sel) { const og = document.createElement('optgroup'); og.label = 'Calls'; [['pCalls', '🎯 Today’s Calls — day & investment'], ['pRecs', '📒 Our Recommendations — record & returns']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; og.appendChild(o); }); sel.insertBefore(og, sel.children[1] || null); sel.value = window.__curTab || 'pSummary'; }
    const prev = window.showTab; window.showTab = function (id) { prev(id); if (id === 'pCalls' || id === 'pRecs') onShow(false); };
    const pp = window.printPDF; window.printPDF = function () { const t = window.__curTab; if (t === 'pCalls' || t === 'pRecs') { window.print(); return; } return pp.apply(this, arguments); };
    clearInterval(C.timer); C.timer = setInterval(() => { const t = window.__curTab; if ((t === 'pCalls' || t === 'pRecs') && !document.hidden) tick(false); }, 30000);
    document.addEventListener('visibilitychange', () => { const t = window.__curTab; if (!document.hidden && (t === 'pCalls' || t === 'pRecs')) tick(true); });
    const h = (location.hash || '').slice(1); if (h === 'calls') window.showTab('pCalls'); else if (h === 'recs' || h === 'recommendations') window.showTab('pRecs');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
