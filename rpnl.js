/* Radar P&L — daily performance book for the Early-Mover Radar triggers (Breakout, Opening Rush, Volume Burst, Heads-up).
   Every radar call is tracked from entry to its exit (initial stop, trailing stop, or 3:15 PM square-off) and written to a dated sheet:
   day summary → click a day → per-trigger result → click a trigger → every call. Stored in this browser (jc_rpnl_v1). */
(function () {
  'use strict';
  const LS = 'jc_rpnl_v1', $ = (i) => document.getElementById(i);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const istNow = () => new Date(Date.now() + 19800000), today = () => istNow().toISOString().slice(0, 10), mins = () => { const d = istNow(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const hhmm = (t) => new Date(t + 19800000).toISOString().slice(11, 16);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dFmt = (d) => DOW[new Date(d + 'T00:00:00Z').getUTCDay()] + ' ' + d.slice(8, 10) + '-' + MON[+d.slice(5, 7) - 1] + '-' + d.slice(0, 4);
  const TRIG = { SURGE: ['BREAKOUT', 'brk'], RUSH: ['OPENING RUSH', 'rush'], BURST: ['VOLUME BURST', 'burst'], WATCH: ['HEADS-UP', 'watch'], STEALTH: ['HEADS-UP', 'watch'] };
  const ORDER = ['BREAKOUT', 'OPENING RUSH', 'VOLUME BURST', 'HEADS-UP'], CLS = { 'BREAKOUT': 'brk', 'OPENING RUSH': 'rush', 'VOLUME BURST': 'burst', 'HEADS-UP': 'watch' };
  const tn = (k) => (TRIG[k] || [String(k || 'ALERT')])[0];
  const f2 = (v) => (num(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  const inr = (v) => (num(v) ? (v < 0 ? '−' : v > 0 ? '+' : '') + '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN') : '—');
  const pc = (v) => (num(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + ' %' : '—');
  const clr = (v) => (!num(v) || v === 0 ? '#556' : v > 0 ? '#0a7a3d' : '#c62828');
  const REASON = { STOP: 'Stop-loss hit', TRAIL: 'Trailing stop hit', EOD: 'Squared off 3:15 PM', OPEN: 'Open', LAST: 'Closed at last price seen' };

  let S = { v: 1, size: 100000, days: {} }, UI = { day: '', trig: '' };
  try { const x = JSON.parse(localStorage.getItem(LS) || 'null'); if (x && x.days) S = Object.assign(S, x); } catch (e) { }
  const save = () => { try { const k = Object.keys(S.days).sort(); while (k.length > 150) delete S.days[k.shift()]; localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { } };

  /* ---- tracking ---- */
  function pnl(r) { const px = r.exit != null ? r.exit : r.px; return num(px) && r.entry > 0 ? (px / r.entry - 1) * 100 : null; }
  function track() {
    const R = window.jcRadar && window.jcRadar.state, M = window.jcMgr && window.jcMgr.state; if (!R || !R.alerts || !M || !M.pos) return;
    const td = today(); let ch = false;
    const day = S.days[td] || (S.days[td] = {});
    R.alerts.forEach((a) => {
      const P = M.pos[a.id]; if (!P || a.sym === 'TEST' || (a.kind === 'WATCH' && !a.go)) return;
      let r = day[a.id]; if (!r) { r = day[a.id] = { id: a.id, sym: a.sym, trig: tn(a.kind), t: a.t, entry: a.entry, sl: a.sl, t1: a.t1, t2: a.t2, t3: a.t3, hi: a.entry, tier: 0, trail: a.sl, px: a.entry, st: 'OPEN', exit: null, xt: null }; ch = true; }
      if (r.st !== 'OPEN') return;
      if (num(P.hi)) r.hi = P.hi; r.tier = P.tier || 0; if (num(P.trail)) r.trail = P.trail; if (num(P.px)) r.px = P.px;
      if (P.closed === 'STOP' || P.closed === 'TRAIL') { r.st = P.closed; r.exit = num(P.px) ? P.px : (P.closed === 'STOP' ? r.sl : r.trail); r.xt = Date.now(); }
      else if (mins() >= 915) { r.st = 'EOD'; r.exit = r.px; r.xt = Date.now(); }
      ch = true;
    });
    Object.keys(S.days).forEach((d) => { if (d < td) Object.values(S.days[d]).forEach((r) => { if (r.st === 'OPEN') { r.st = 'LAST'; r.exit = r.px; ch = true; } }); });
    if (ch) save();
  }

  /* ---- aggregation ---- */
  function agg(list) {
    const o = { n: 0, win: 0, loss: 0, flat: 0, stop: 0, trail: 0, eod: 0, open: 0, sumPct: 0, rs: 0 };
    list.forEach((r) => { const p = pnl(r); o.n++; if (r.st === 'STOP') o.stop++; else if (r.st === 'TRAIL') o.trail++; else if (r.st === 'OPEN') o.open++; else o.eod++; if (num(p)) { o.sumPct += p; o.rs += S.size * p / 100; if (p > 0.005) o.win++; else if (p < -0.005) o.loss++; else o.flat++; } });
    o.avg = o.n ? o.sumPct / o.n : null; o.wr = o.n ? o.win / o.n * 100 : null; return o;
  }
  const byTrig = (list) => { const m = {}; list.forEach((r) => { (m[r.trig] = m[r.trig] || []).push(r); }); return m; };
  const dayList = (d) => Object.values(S.days[d] || {}).sort((a, b) => a.t - b.t);
  const allCalls = () => { const o = []; Object.keys(S.days).sort().forEach((d) => dayList(d).forEach((r) => o.push(Object.assign({ d }, r)))); return o; };
  const tile = (t) => `<span class="tg tg-${CLS[t] || 'brk'}">${E(t)}</span>`;
  const why = (r) => REASON[r.st] + (r.tier ? ' · T' + Math.min(r.tier, 3) + (r.tier > 3 ? '+' : '') + ' reached' : '');

  /* ---- UI ---- */
  function paint(force) {
    const el = $('pRpnl'); if (!el || !el.classList.contains('active')) return; if (!force && document.activeElement && document.activeElement.id === 'rpSize') return;
    const days = Object.keys(S.days).filter((d) => Object.keys(S.days[d]).length).sort().reverse();
    const all = allCalls(), A = agg(all), BT = byTrig(all);
    const head = `<section class="rp"><div class="rp-h"><div><h3>📊 Radar P&amp;L — performance by trigger <small>every radar call tracked to its exit: stop-loss, trailing stop or 3:15 PM square-off · separate from all other reports</small></h3></div><div class="rp-a"><label>₹ per call <input id="rpSize" type="number" min="1000" step="1000" value="${S.size}" onchange="jcRpnl.size(this.value)"></label><button class="cl-btn" onclick="jcRpnl.csv('days')">⬇ Daily summary (CSV)</button><button class="cl-btn" onclick="jcRpnl.csv('calls')">⬇ All calls (CSV)</button></div></div>`;
    const trigAll = `<h4>All days — by trigger</h4><div class="bf-sc"><table class="bf-t rp-t"><thead><tr><th>Trigger</th><th>Calls</th><th>Won</th><th>Lost</th><th>Win %</th><th>Stop-loss</th><th>Trail stop</th><th>3:15 exit</th><th>Avg / call</th><th>Net P&amp;L ₹</th></tr></thead><tbody>${ORDER.filter((t) => BT[t]).map((t) => { const a = agg(BT[t]); return `<tr><td>${tile(t)}</td><td>${a.n}</td><td>${a.win}</td><td>${a.loss}</td><td>${a.wr == null ? '—' : a.wr.toFixed(0) + ' %'}</td><td>${a.stop}</td><td>${a.trail}</td><td>${a.eod}</td><td style="color:${clr(a.avg)}">${pc(a.avg)}</td><td style="color:${clr(a.rs)};font-weight:800">${inr(a.rs)}</td></tr>`; }).join('') || '<tr><td colspan="10" class="rp-e">No calls tracked yet.</td></tr>'}</tbody><tfoot><tr><td><b>TOTAL</b></td><td>${A.n}</td><td>${A.win}</td><td>${A.loss}</td><td>${A.wr == null ? '—' : A.wr.toFixed(0) + ' %'}</td><td>${A.stop}</td><td>${A.trail}</td><td>${A.eod}</td><td style="color:${clr(A.avg)}">${pc(A.avg)}</td><td style="color:${clr(A.rs)};font-weight:800">${inr(A.rs)}</td></tr></tfoot></table></div>`;
    const dayT = `<h4>Daily summary <small>click a day to open it</small></h4><div class="bf-sc"><table class="bf-t rp-t"><thead><tr><th>Date</th><th>Total calls</th>${ORDER.map((t) => '<th>' + tile(t) + '<div class="rp-s">calls · ₹</div></th>').join('')}<th>Won / Lost</th><th>Day-end P&amp;L ₹</th></tr></thead><tbody>${days.map((d) => {
      const L = dayList(d), a = agg(L), bt = byTrig(L), sel = UI.day === d;
      return `<tr class="rp-r${sel ? ' sel' : ''}" onclick="jcRpnl.pick('${d}','')"><td><b>${sel ? '▾' : '▸'} ${dFmt(d)}</b>${d === today() ? ' <span class="rp-live">LIVE</span>' : ''}</td><td>${a.n}</td>${ORDER.map((t) => { const x = bt[t] ? agg(bt[t]) : null; return `<td>${x ? x.n + ' · <b style="color:' + clr(x.rs) + '">' + inr(x.rs) + '</b>' : '—'}</td>`; }).join('')}<td>${a.win} / ${a.loss}</td><td style="color:${clr(a.rs)};font-weight:800">${inr(a.rs)}</td></tr>`
        + (sel ? `<tr class="rp-x"><td colspan="${5 + ORDER.length}">${dayDetail(d, L, bt)}</td></tr>` : '');
    }).join('') || `<tr><td colspan="${5 + ORDER.length}" class="rp-e">Nothing tracked yet. Keep the dashboard open during market hours — each radar call is recorded automatically and its P&amp;L is built from the stop / trail / 3:15 PM exit.</td></tr>`}</tbody></table></div>`;
    el.innerHTML = head + trigAll + dayT + `<div class="bf-note"><b>How the P&amp;L is counted.</b> Each call is a long bought at the radar's entry price with <b>₹${S.size.toLocaleString('en-IN')}</b> per call (change it above). It exits at the first of: the initial stop-loss (before T1), the trailing stop (after T1 the stop moves to entry, after T2 to T1, after T3 to T2 …), or a 3:15 PM square-off at the last price. The exit price is the live price when the stop was seen (checked about every 30 seconds), so it can be slightly worse than the stop level. No brokerage or taxes. Stored in this browser only, and only while the dashboard is open — the days are not rebuilt later. Historical, not a promise of future returns.</div></section>`;
  }
  function dayDetail(d, L, bt) {
    const trs = ORDER.filter((t) => bt[t]);
    let h = `<div class="rp-in"><b>${dFmt(d)} — result by trigger</b><table class="bf-t rp-t"><thead><tr><th>Trigger</th><th>Calls</th><th>Won</th><th>Lost</th><th>Win %</th><th>Stop-loss</th><th>Trail stop</th><th>3:15 exit</th><th>Avg / call</th><th>P&amp;L ₹</th></tr></thead><tbody>`;
    trs.forEach((t) => { const a = agg(bt[t]), sel = UI.trig === t; h += `<tr class="rp-r${sel ? ' sel' : ''}" onclick="event.stopPropagation();jcRpnl.pick('${d}','${t}')"><td>${sel ? '▾ ' : '▸ '}${tile(t)}</td><td>${a.n}</td><td>${a.win}</td><td>${a.loss}</td><td>${a.wr == null ? '—' : a.wr.toFixed(0) + ' %'}</td><td>${a.stop}</td><td>${a.trail}</td><td>${a.eod}</td><td style="color:${clr(a.avg)}">${pc(a.avg)}</td><td style="color:${clr(a.rs)};font-weight:800">${inr(a.rs)}</td></tr>`; if (sel) h += `<tr class="rp-x"><td colspan="10">${callDetail(bt[t])}</td></tr>`; });
    const A = agg(L); h += `</tbody><tfoot><tr><td><b>DAY TOTAL</b></td><td>${A.n}</td><td>${A.win}</td><td>${A.loss}</td><td>${A.wr == null ? '—' : A.wr.toFixed(0) + ' %'}</td><td>${A.stop}</td><td>${A.trail}</td><td>${A.eod}</td><td style="color:${clr(A.avg)}">${pc(A.avg)}</td><td style="color:${clr(A.rs)};font-weight:800">${inr(A.rs)}</td></tr></tfoot></table></div>`; return h;
  }
  function callDetail(list) {
    return `<div class="bf-sc rp-six"><table class="bf-t rp-t"><thead><tr><th>Time</th><th>Stock</th><th>Entry</th><th>Stop</th><th>T1</th><th>T2</th><th>T3</th><th>Peak</th><th>Last stop</th><th>Exit</th><th>Exit time</th><th>How it ended</th><th>P&amp;L %</th><th>P&amp;L ₹</th></tr></thead><tbody>${list.map((r) => { const p = pnl(r); return `<tr class="${p > 0.005 ? 'rp-w' : p < -0.005 ? 'rp-l' : ''}"><td>${hhmm(r.t)}</td><td><b>${E(r.sym)}</b></td><td>${f2(r.entry)}</td><td>${f2(r.sl)}</td><td>${f2(r.t1)}</td><td>${f2(r.t2)}</td><td>${f2(r.t3)}</td><td>${f2(r.hi)}</td><td>${f2(r.trail)}</td><td>${f2(r.exit != null ? r.exit : r.px)}${r.exit == null ? '<div class="rp-s">live</div>' : ''}</td><td>${r.xt ? hhmm(r.xt) : '—'}</td><td>${E(why(r))}</td><td style="color:${clr(p)};font-weight:700">${pc(p)}</td><td style="color:${clr(p)};font-weight:800">${inr(num(p) ? S.size * p / 100 : null)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  const CSS = '.rp{margin:6px 0}.rp-h{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:linear-gradient(120deg,#0d2b5e,#14306e);color:#fff;border-radius:14px;padding:11px 16px;margin-bottom:8px}.rp-h>div:first-child{flex:1;min-width:240px}.rp-h h3{margin:0;font-size:18px}.rp-h small{display:block;font-size:11.5px;font-weight:400;opacity:.8;margin-top:2px}.rp-a{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rp-a label{font-size:12px}.rp-a input{width:96px;padding:5px 7px;border-radius:7px;border:1px solid #bccae6;font:inherit}.rp h4{margin:12px 2px 6px;color:#14306e}.rp h4 small{font-weight:400;color:#6a7691;font-size:11px}.rp-t{min-width:760px;font-size:12.5px}.rp-t td,.rp-t th{padding:5px 8px;white-space:nowrap;text-align:left}.rp-t tfoot td{background:#eef2fb;font-weight:700;border-top:2px solid #14306e}.rp-r{cursor:pointer}.rp-r:hover td{background:#f1f5ff}.rp-r.sel td{background:#e4ecff}.rp-x>td{background:#f7f9fe;padding:8px 10px!important;white-space:normal!important}.rp-in{border-left:4px solid #14306e;padding-left:10px}.rp-s{font-size:9.5px;font-weight:400;color:#7b88a6}.rp-live{background:#12a05a;color:#fff;border-radius:6px;padding:1px 6px;font-size:9.5px;font-weight:800}.rp-e{text-align:center!important;color:#6a7691;padding:16px!important;white-space:normal!important}.rp-six{max-height:420px;overflow:auto}.rp-six thead th{position:sticky;top:0;background:#eef2fb}.rp-w td{background:#e9fbd9}.rp-l td{background:#ffe3e3}';
  function csvText(kind) {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"', rows = [];
    if (kind === 'calls') { rows.push(['Date', 'Time', 'Trigger', 'Stock', 'Entry', 'Stop', 'T1', 'T2', 'T3', 'Peak', 'Last trail stop', 'Exit', 'Exit time', 'How it ended', 'P&L %', 'P&L Rs (per call ' + S.size + ')']); allCalls().forEach((r) => { const p = pnl(r); rows.push([r.d, hhmm(r.t), r.trig, r.sym, r.entry, r.sl, r.t1, r.t2, r.t3, r.hi, r.trail, r.exit != null ? r.exit : r.px, r.xt ? hhmm(r.xt) : '', why(r), num(p) ? p.toFixed(2) : '', num(p) ? Math.round(S.size * p / 100) : '']); }); }
    else { rows.push(['Date', 'Trigger', 'Calls', 'Won', 'Lost', 'Stop-loss', 'Trail stop', '3:15 exit', 'Avg % per call', 'P&L Rs']); Object.keys(S.days).sort().reverse().forEach((d) => { const L = dayList(d), bt = byTrig(L); ORDER.filter((t) => bt[t]).forEach((t) => { const a = agg(bt[t]); rows.push([d, t, a.n, a.win, a.loss, a.stop, a.trail, a.eod, a.avg == null ? '' : a.avg.toFixed(2), Math.round(a.rs)]); }); const A = agg(L); rows.push([d, 'DAY TOTAL', A.n, A.win, A.loss, A.stop, A.trail, A.eod, A.avg == null ? '' : A.avg.toFixed(2), Math.round(A.rs)]); }); }
    return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
  }
  window.jcRpnl = {
    pick: (d, t) => { if (!t) { UI.day = UI.day === d ? '' : d; UI.trig = ''; } else { UI.day = d; UI.trig = UI.trig === t ? '' : t; } paint(true); },
    size: (v) => { v = Math.max(1000, +v || 100000); S.size = v; save(); paint(true); },
    csv: (k) => { if (!allCalls().length) { alert('Nothing tracked yet.'); return; } const b = new Blob([csvText(k)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'JoshisCorner_radar_PnL_' + (k === 'calls' ? 'calls_' : 'daily_') + today() + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); },
    paint, track, state: () => S
  };
  function build() {
    const sel = $('viewSel'), anchor = document.querySelector('details.datasec'); if (!sel || !anchor || $('pRpnl')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const o = document.createElement('option'); o.value = 'pRpnl'; o.textContent = '📊 Radar P&L (by trigger)';
    const grp = [...sel.querySelectorAll('optgroup')].find((g) => /calls/i.test(g.label)) || sel.querySelector('optgroup') || sel; grp.appendChild(o);
    const p = document.createElement('div'); p.className = 'panel'; p.id = 'pRpnl'; anchor.parentNode.insertBefore(p, anchor);
    const orig = window.showTab; window.showTab = function (id) { orig(id); if (id === 'pRpnl') { track(); paint(true); } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  setInterval(() => { try { track(); paint(); } catch (e) { } }, 20000); setTimeout(() => { try { track(); } catch (e) { } }, 3000);
})();
