/* Alert log — every dashboard pop-up alert (Early-Mover Radar, Trade-desk manager, level alerts) kept as a dated sheet:
   filter by stock / source / date, search the reason, export to Excel (CSV) or copy for Excel. Stored in this browser (jc_alog_v1). */
(function () {
  'use strict';
  const LS = 'jc_alog_v1', CAP = 3000, $ = (i) => document.getElementById(i);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ist = (t) => new Date(t + 19800000).toISOString();
  const dOf = (t) => ist(t).slice(0, 10), tOf = (t) => ist(t).slice(11, 19);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dFmt = (d) => d.slice(8, 10) + '-' + MON[+d.slice(5, 7) - 1] + '-' + d.slice(0, 4);
  const f2 = (v) => (typeof v === 'number' && isFinite(v) ? v.toFixed(2) : '');
  const plain = (s) => String(s == null ? '' : s).replace(/<[^>]+>/g, '');
  let L = [], seen = {}, F = { sym: '', src: '', day: '', q: '' };
  try { L = JSON.parse(localStorage.getItem(LS) || '[]') || []; } catch (e) { L = []; }
  L.forEach((x) => { seen[x.k] = 1; });
  const save = () => { try { if (L.length > CAP) L = L.slice(-CAP); localStorage.setItem(LS, JSON.stringify(L)); } catch (e) { } };

  function add(o) {
    if (!o || !o.k || seen[o.k]) return false; seen[o.k] = 1;
    L.push(o); L.sort((a, b) => a.t - b.t); save(); return true;
  }
  /* ---- pick up alerts from the three pop-up sources ---- */
  function ingest() {
    let n = 0;
    try {
      const R = window.jcRadar && window.jcRadar.state;
      if (R && R.alerts) R.alerts.forEach((a) => {
        if (!a || a.sym === 'TEST' || a.kind === 'TEST') return;
        const call = a.kind === 'WATCH' || a.kind === 'STEALTH' ? 'HEADS-UP (watch)' : a.kind === 'BURST' ? 'VOLUME BURST — buy' : a.kind === 'RUSH' ? 'OPENING RUSH — buy' : 'BREAKOUT — buy';
        if (add({ k: 'r:' + (a.id || a.sym + a.kind + a.t), t: a.t, sym: a.sym, src: 'Early-Mover Radar', call, chg: a.chg, px: a.px, entry: a.entry, sl: a.sl, t1: a.t1, t2: a.t2, t3: a.t3, why: plain(a.why) + (a.late ? ' — late entry: smaller targets, trail the stop' : '') })) n++;
      });
    } catch (e) { }
    try {
      const M = window.jcMgr && window.jcMgr.state;
      if (M && M.log) M.log.forEach((x) => {
        if (!x || x.who === 'TEST' || x.kind === 'TEST') return;
        const lv = {}; (x.lv || []).forEach((p) => { lv[p[0]] = p[1]; });
        if (add({ k: 'm:' + x.who + x.kind + x.t, t: x.t, sym: x.who, src: 'Trade desk', call: plain(x.title).replace(/^[^A-Za-z]+/, '').replace(/ — .*$/, ''), px: parseFloat(lv.LTP), sl: parseFloat(lv['NEW STOP']), why: plain(x.msg) + (x.lv && x.lv.length ? ' · ' + x.lv.map((p) => p[0] + ' ' + p[1]).join(' · ') : '') })) n++;
      });
    } catch (e) { }
    if (n) paint();
  }
  /* level alerts from the Brief (called by brief.js when one fires) */
  function levelAlert(o) { if (add({ k: 'b:' + o.name + o.t, t: o.t, sym: o.name, src: 'Level alert', call: 'LEVEL CROSSED ' + String(o.dir).toUpperCase(), px: o.px, why: plain(o.msg) })) paint(); }

  /* ---- sheet ---- */
  const cols = [['Date', (x) => dFmt(dOf(x.t))], ['Time (IST)', (x) => tOf(x.t)], ['Stock', (x) => x.sym], ['Source', (x) => x.src], ['Call / alert', (x) => x.call], ['Chg %', (x) => f2(x.chg)], ['Price', (x) => f2(x.px)], ['Entry', (x) => f2(x.entry)], ['Stop', (x) => f2(x.sl)], ['T1', (x) => f2(x.t1)], ['T2', (x) => f2(x.t2)], ['T3', (x) => f2(x.t3)], ['Reason', (x) => x.why || '']];
  function rows() {
    const q = F.q.toLowerCase();
    return L.filter((x) => (!F.sym || x.sym === F.sym) && (!F.src || x.src === F.src) && (!F.day || dOf(x.t) === F.day) && (!q || (x.sym + ' ' + x.call + ' ' + x.why).toLowerCase().includes(q))).sort((a, b) => b.t - a.t);
  }
  function paint(force) {
    const el = $('clAlog'); if (!el) return; if (!force && document.activeElement && document.activeElement.id === 'alQ') return;
    const R = rows(), syms = [...new Set(L.map((x) => x.sym))].sort(), srcs = [...new Set(L.map((x) => x.src))].sort(), days = [...new Set(L.map((x) => dOf(x.t)))].sort().reverse();
    const sel = (id, k, opts, lab, fmt) => `<select id="${id}" onchange="jcAlog.set('${k}',this.value)"><option value="">${lab}</option>${opts.map((o) => `<option value="${E(o)}"${F[k] === o ? ' selected' : ''}>${E(fmt ? fmt(o) : o)}</option>`).join('')}</select>`;
    el.innerHTML = `<section class="al"><div class="al-h"><div><h3>🗂️ Alert log <small>every pop-up alert with date &amp; time — filter by stock, search the reason</small></h3></div><div class="al-a"><button class="cl-btn" onclick="jcAlog.csv()">⬇ Excel (CSV)</button><button class="cl-btn" onclick="jcAlog.copy()">Copy for Excel</button><button class="cl-btn" onclick="jcAlog.clear()">Clear log</button></div></div>`
      + `<div class="al-f">${sel('alS', 'sym', syms, 'All stocks')}${sel('alSrc', 'src', srcs, 'All sources')}${sel('alD', 'day', days, 'All dates', dFmt)}<input id="alQ" value="${E(F.q)}" placeholder="Search reason / call…" oninput="jcAlog.set('q',this.value,1)"><span>${R.length} of ${L.length} alerts</span>${(F.sym || F.src || F.day || F.q) ? '<a href="javascript:void(0)" onclick="jcAlog.reset()">reset filters</a>' : ''}</div>`
      + (R.length ? `<div class="bf-sc" style="max-height:420px"><table class="bf-t al-t"><thead><tr>${cols.map((c) => '<th>' + c[0] + '</th>').join('')}</tr></thead><tbody>${R.slice(0, 400).map((x) => '<tr>' + cols.map((c, i) => `<td${i === 2 ? ' class="al-s"' : i === 12 ? ' class="al-w"' : ''}>${E(c[1](x))}</td>`).join('') + '</tr>').join('')}</tbody></table></div>${R.length > 400 ? '<div class="bf-note">Showing the latest 400 — filter, or export for the full list.</div>' : ''}` : `<div class="bf-note">${L.length ? 'No alert matches these filters.' : 'No alerts logged yet. Each time the radar, trade desk or a level alert pops up, it is added here automatically and kept in this browser.'}</div>`)
      + `</section>`;
  }
  const CSS = '.al{margin:10px 0}.al-h{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:linear-gradient(120deg,#0d2b5e,#14306e);color:#fff;border-radius:14px;padding:11px 16px;margin-bottom:8px}.al-h>div:first-child{flex:1;min-width:220px}.al-h h3{margin:0;font-size:18px}.al-h small{display:block;font-size:11.5px;font-weight:400;opacity:.8;margin-top:2px}.al-a{display:flex;gap:6px;flex-wrap:wrap}.al-f{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 8px;font-size:12.5px}.al-f select,.al-f input{padding:6px 8px;border:1px solid #bccae6;border-radius:8px;font:inherit;background:#fff;color:#14306e}.al-f input{min-width:190px}.al-t{min-width:1100px;font-size:12px}.al-t td{white-space:nowrap;padding:4px 8px}.al-t .al-s{font-weight:800;color:#14306e}.al-t .al-w{white-space:normal;min-width:340px;max-width:520px}';
  function sheet(sep) { const R = rows(); const q = (v) => { v = String(v == null ? '' : v); return sep === ',' ? '"' + v.replace(/"/g, '""') + '"' : v.replace(/[\t\r\n]+/g, ' '); }; return [cols.map((c) => q(c[0])).join(sep)].concat(R.map((x) => cols.map((c) => q(c[1](x))).join(sep))).join('\r\n'); }
  window.jcAlog = {
    set: (k, v, typing) => { F[k] = v; if (typing) { const pos = $('alQ').selectionStart; paint(true); const n = $('alQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } else paint(true); },
    reset: () => { F = { sym: '', src: '', day: '', q: '' }; paint(true); },
    csv: () => { const R = rows(); if (!R.length) { alert('Nothing to export for these filters.'); return; } const b = new Blob(['﻿' + sheet(',')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'JoshisCorner_alert_log_' + dOf(Date.now()) + (F.sym ? '_' + F.sym : '') + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); },
    copy: async () => { try { await navigator.clipboard.writeText(sheet('\t')); alert('Copied — paste into Excel (A1).'); } catch (e) { alert('Copy blocked by the browser — use Excel (CSV) instead.'); } },
    clear: () => { if (!confirm('Delete the whole alert log (' + L.length + ' alerts)? This cannot be undone.')) return; L = []; seen = {}; save(); paint(); },
    add, levelAlert, paint, ingest, state: () => L
  };
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  setInterval(ingest, 4000); setTimeout(ingest, 1500);
})();
