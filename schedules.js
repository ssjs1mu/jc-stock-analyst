/* Joshi's Corner — scheduled-report tabs.
 * Reads schedules.json, adds one View-menu tab per scheduled task plus a
 * "Schedule board" overview, and shows each task's latest PDF (from
 * reports/<id>/index.json, written by pipeline/publish.py on every run).
 * Times are IST regardless of the viewer's clock. */
(function () {
  'use strict';
  const IST_MS = 330 * 60000;
  const GRACE_MIN = 45; // after this many minutes past the slot, a missing report counts as missed
  const POLL_MS = 3 * 60000;
  const S = { list: [], idx: {}, loadedAt: 0, timer: null, seen: {} };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- IST clock helpers -------------------------------------------------
  const istNow = () => new Date(Date.now() + IST_MS); // read with getUTC* = IST wall clock
  const istDate = (d) => d.toISOString().slice(0, 10);
  const minsOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const runsOnDay = (s, dow) => s.days === 'daily' || (dow >= 1 && dow <= 5);
  function nextRun(s, from) {
    const base = from || istNow();
    for (let k = 0; k < 8; k++) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + k));
      if (!runsOnDay(s, d.getUTCDay())) continue;
      const t = new Date(d.getTime() + minsOf(s.time) * 60000);
      if (t > base) return t;
    }
    return null;
  }
  function fmtLeft(ms) {
    const m = Math.max(0, Math.round(ms / 60000)); const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`;
  }
  const fmtDay = (t) => t.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' });
  const fmt12 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const fmtStamp = (iso) => { try { return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }); } catch (e) { return iso; } };

  // ---- status for today ---------------------------------------------------
  function todayStatus(s) {
    const now = istNow(); const today = istDate(now); const dow = now.getUTCDay();
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes(); const slot = minsOf(s.time);
    if (s.kind === 'artifact') return { cls: 'info', text: 'Dashboard refresh · no PDF' };
    if (!runsOnDay(s, dow)) return { cls: 'mute', text: 'No run today (weekend)' };
    const runs = (S.idx[s.id] && S.idx[s.id].runs) || [];
    const r = runs.find((x) => x.date === today);
    if (r) {
      if (r.status === 'ok') return { cls: 'ok', text: 'Published ' + fmtStamp(r.generated_at).split(', ').pop(), run: r };
      if (r.status === 'holiday') return { cls: 'mute', text: 'Market holiday — ' + (r.note || 'no report'), run: r };
      return { cls: 'bad', text: (r.status === 'failed' ? 'Run failed' : 'Skipped') + (r.note ? ' — ' + r.note : ''), run: r };
    }
    if (nowMin < slot) return { cls: 'wait', text: `Due ${fmt12(s.time)} · in ${fmtLeft((slot - nowMin) * 60000)}` };
    if (nowMin < slot + GRACE_MIN) return { cls: 'run', text: 'Generating now…' };
    return { cls: 'bad', text: 'Missed — no report today' };
  }

  // ---- data -----------------------------------------------------------------
  async function getJSON(url) {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async function loadIndexes(ids) {
    await Promise.all(ids.map(async (id) => {
      try { S.idx[id] = await getJSON(`reports/${id}/index.json`); } catch (e) { S.idx[id] = S.idx[id] || { runs: [] }; }
    }));
    S.loadedAt = Date.now();
  }

  // ---- rendering ------------------------------------------------------------
  const daysLabel = (s) => (s.days === 'daily' ? 'Every day' : 'Mon–Fri (trading days)');
  function fileLinks(run) {
    return (run.files || []).map((f) => `<a class="sclink" href="${esc(f.path)}" target="_blank" rel="noopener">${f.type === 'png' ? '🖼' : '📄'} ${esc(f.type.toUpperCase())}</a>`).join(' ');
  }
  function latestOk(id) { return ((S.idx[id] && S.idx[id].runs) || []).find((r) => r.status === 'ok' && r.files && r.files.length); }

  function panelHTML(s) {
    const st = todayStatus(s); const nx = nextRun(s);
    const head = `<div class="schead">
      <div class="schtitle"><span class="scicon">${esc(s.icon || '🗓')}</span><div><h3>${esc(s.name)}</h3><small>${esc(s.summary || '')}</small></div></div>
      <div class="sckp">
        <div class="kpi"><span class="cap">Schedule</span><b>${fmt12(s.time)} IST</b><small>${daysLabel(s)}</small></div>
        <div class="kpi"><span class="cap">Next run</span><b data-cd="${esc(s.id)}">${nx ? fmtLeft(nx - istNow()) : '—'}</b><small>${nx ? fmtDay(nx) + ' · ' + fmt12(s.time) : ''}</small></div>
        <div class="kpi"><span class="cap">Today</span><span class="scst ${st.cls}">${esc(st.text)}</span><small>${s.telegram ? 'Also posted to Telegram' : s.kind === 'artifact' ? 'Updates the dashboard' : 'Terminal + chat only'}</small></div>
      </div></div>`;
    if (s.kind === 'artifact') {
      return head + `<div class="card"><div class="note">This scheduled task refreshes the <b>Joshi's Desk</b> dashboard rather than producing a PDF.
        <a class="goBtn sclinkbtn" href="${esc(s.artifact_url)}" target="_blank" rel="noopener">Open Joshi's Desk ↗</a></div></div>`;
    }
    const runs = (S.idx[s.id] && S.idx[s.id].runs) || [];
    const last = latestOk(s.id);
    let viewer;
    if (!last) {
      viewer = `<div class="note">No report has been published here yet. The first one appears after the next run (${nx ? fmtDay(nx) + ', ' + fmt12(s.time) + ' IST' : '—'}). Expected file: <code>${esc(s.file_pattern || '')}</code></div>`;
    } else {
      const pdf = last.files.find((f) => f.type === 'pdf'); const png = last.files.find((f) => f.type === 'png');
      const stale = last.date !== istDate(istNow());
      const bar = `<div class="scbar"><b>Latest:</b> ${esc(fmtStamp(last.generated_at))}${stale ? ' <span class="scst mute">older report</span>' : ''}
        ${last.caption ? `<span class="sccap">${esc(last.caption)}</span>` : ''}<span class="spacer"></span>${fileLinks(last)}
        ${pdf ? `<a class="goBtn sclinkbtn" href="${esc(pdf.path)}" download>⬇ Download PDF</a>` : ''}</div>`;
      // Picture first when there is one (renders everywhere); phones can't embed PDFs reliably, so give them a button.
      const body = png ? `<img class="scpng" src="${esc(png.path)}" alt="${esc(s.name)}">`
        : pdf && window.innerWidth < 700 ? `<a class="goBtn sclinkbtn scbig" href="${esc(pdf.path)}" target="_blank" rel="noopener">📄 Open ${esc(s.name)} PDF</a>`
        : pdf ? `<iframe class="scpdf" src="${esc(pdf.path)}#view=FitH" title="${esc(s.name)} PDF"></iframe>` : '';
      viewer = bar + body;
    }
    const rows = runs.slice(0, 30).map((r) => `<tr class="st-${esc(r.status)}"><td class="dt">${esc(fmtStamp(r.generated_at))}</td>
      <td><span class="scst ${r.status === 'ok' ? 'ok' : r.status === 'holiday' ? 'mute' : 'bad'}">${esc(r.status === 'ok' ? 'Published' : r.status)}</span></td>
      <td>${esc(r.caption || r.note || '')}</td><td class="r">${fileLinks(r)}</td></tr>`).join('');
    const arch = runs.length ? `<div class="card"><h4>Archive (${runs.length})</h4><table class="uptable"><thead><tr><th>Generated</th><th>Status</th><th>Note</th><th class="r">Files</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
    return head + `<div class="card scview">${viewer}</div>` + arch;
  }

  function boardHTML() {
    const now = istNow();
    const sorted = [...S.list].sort((a, b) => minsOf(a.time) - minsOf(b.time));
    const upcoming = sorted.map((s) => ({ s, t: nextRun(s) })).filter((x) => x.t).sort((a, b) => a.t - b.t)[0];
    const counts = { ok: 0, bad: 0, wait: 0 };
    const rows = sorted.map((s) => {
      const st = todayStatus(s); if (counts[st.cls] != null) counts[st.cls]++;
      const last = latestOk(s.id);
      return `<tr><td class="dt">${fmt12(s.time)}</td><td><a href="#" data-go="pS_${esc(s.id)}">${esc(s.icon || '')} ${esc(s.name)}</a><br><small>${daysLabel(s)}</small></td>
        <td><span class="scst ${st.cls}">${esc(st.text)}</span></td>
        <td>${last ? esc(fmtStamp(last.generated_at)) + ' ' + fileLinks(last) : s.kind === 'artifact' ? `<a class="sclink" href="${esc(s.artifact_url)}" target="_blank" rel="noopener">Dashboard ↗</a>` : '<small>none yet</small>'}</td></tr>`;
    }).join('');
    return `<div class="kp">
        <div class="kpi"><span class="cap">Next up</span><b>${upcoming ? esc(upcoming.s.name) : '—'}</b><small>${upcoming ? fmtDay(upcoming.t) + ' · ' + fmt12(upcoming.s.time) + ' · in ' + fmtLeft(upcoming.t - now) : ''}</small></div>
        <div class="kpi"><span class="cap">Published today</span><b class="num-green">${counts.ok}</b><small>reports</small></div>
        <div class="kpi"><span class="cap">Still due today</span><b>${counts.wait}</b><small>reports</small></div>
        <div class="kpi"><span class="cap">Missed / failed</span><b class="${counts.bad ? 'num-red' : ''}">${counts.bad}</b><small>check the tab for the reason</small></div>
      </div>
      <div class="card"><h4>Today's schedule — ${esc(fmtDay(now))} (IST)</h4><table class="uptable"><thead><tr><th>Time</th><th>Report</th><th>Today</th><th>Latest file</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="note">Each report is generated by its scheduled task at the time shown, delivered in chat, and published here automatically. This page checks for new reports every 3 minutes while open.</div></div>`;
  }

  function renderPanel(id) {
    const el = $(id); if (!el) return;
    if (id === 'pSchedBoard') el.innerHTML = boardHTML();
    else {
      const s = S.list.find((x) => 'pS_' + x.id === id); if (!s) return;
      // Keep the already-rendered PDF/picture when it is the same file, so refreshes don't re-download it.
      const old = el.querySelector('.scpdf, .scpng');
      el.innerHTML = panelHTML(s);
      const nu = el.querySelector('.scpdf, .scpng');
      if (old && nu && old.tagName === nu.tagName && old.getAttribute('src') === nu.getAttribute('src')) nu.replaceWith(old);
    }
  }
  function refreshOptionLabels() {
    const sel = $('viewSel'); if (!sel) return;
    S.list.forEach((s) => {
      const o = [...sel.options].find((x) => x.value === 'pS_' + s.id); if (!o) return;
      const st = todayStatus(s);
      const mark = st.cls === 'ok' ? ' ✓' : st.cls === 'bad' ? ' ✗' : st.cls === 'run' ? ' …' : '';
      o.textContent = `${s.time} · ${s.name}${mark}`;
    });
  }

  // ---- new-report notice ------------------------------------------------------
  function toast(msg) {
    let t = $('scToast'); if (!t) { t = document.createElement('div'); t.id = 'scToast'; document.body.appendChild(t); }
    t.innerHTML = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 9000);
  }
  function checkNew(first) {
    S.list.forEach((s) => {
      const r = latestOk(s.id); if (!r) return;
      const key = r.generated_at;
      if (!first && S.seen[s.id] && S.seen[s.id] !== key) toast(`📄 New report: <a href="#" data-go="pS_${esc(s.id)}">${esc(s.name)}</a>`);
      S.seen[s.id] = key;
    });
  }

  async function poll(first) {
    await loadIndexes(S.list.filter((s) => s.kind !== 'artifact').map((s) => s.id));
    checkNew(first); refreshOptionLabels();
    const cur = window.__curTab; if (cur === 'pSchedBoard' || (cur || '').startsWith('pS_')) renderPanel(cur);
  }

  // ---- wiring -----------------------------------------------------------------
  function build() {
    const sel = $('viewSel'); const anchor = document.querySelector('details.datasec');
    const grp = document.createElement('optgroup'); grp.label = 'Scheduled reports';
    const board = document.createElement('option'); board.value = 'pSchedBoard'; board.textContent = '🗓 Schedule board (all)'; grp.appendChild(board);
    const mk = (id) => { const p = document.createElement('div'); p.className = 'panel scpanel'; p.id = id; p.innerHTML = '<div class="note">Loading…</div>'; anchor.parentNode.insertBefore(p, anchor); };
    mk('pSchedBoard');
    [...S.list].sort((a, b) => minsOf(a.time) - minsOf(b.time)).forEach((s) => {
      const o = document.createElement('option'); o.value = 'pS_' + s.id; o.textContent = `${s.time} · ${s.name}`; grp.appendChild(o); mk('pS_' + s.id);
    });
    sel.appendChild(grp);
  }

  const origShow = window.showTab;
  window.showTab = function (id) {
    origShow(id);
    if (id === 'pSchedBoard' || (id || '').startsWith('pS_')) {
      renderPanel(id);
      if (Date.now() - S.loadedAt > 60000) poll(false);
    }
  };
  const origPrint = window.printPDF;
  window.printPDF = function () {
    const cur = window.__curTab || '';
    if (cur.startsWith('pS_')) {
      const r = latestOk(cur.slice(3)); const f = r && r.files.find((x) => x.type === 'pdf');
      if (f) { window.open(f.path, '_blank', 'noopener'); return; }
      toast('No PDF published for this schedule yet.'); return;
    }
    if (cur === 'pSchedBoard') { window.print(); return; }
    return origPrint.apply(this, arguments);
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]'); if (!a) return;
    e.preventDefault(); window.showTab(a.getAttribute('data-go'));
  });

  async function init() {
    try { S.list = (await getJSON('schedules.json')).schedules || []; } catch (e) { return; }
    build(); await poll(true);
    const h = (location.hash || '').slice(1);
    if (h === 'schedules') window.showTab('pSchedBoard');
    else if (h && $('pS_' + h)) window.showTab('pS_' + h);
    S.timer = setInterval(() => { if (!document.hidden) poll(false); }, POLL_MS);
    setInterval(() => { // live countdowns + day rollover
      document.querySelectorAll('[data-cd]').forEach((b) => { const s = S.list.find((x) => x.id === b.dataset.cd); const t = s && nextRun(s); if (t) b.textContent = fmtLeft(t - istNow()); });
      refreshOptionLabels();
    }, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
