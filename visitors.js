/* Visitor counter + daily quota meters (shared file: same code in jc-stock-analyst and JCGG).
   Counts one visit per browser session; stores only counts by place (city / region / country), never an IP address.
   Place comes from the visitor's own browser asking a public IP-location service (ipwho.is) once per 12 hours.
   Quota meters are counted by the app against the free-plan daily limits (in-app estimate, not Google's billing meter). */
(function () {
  'use strict';
  const cfg = window.JCVC_CFG || {}, SITE = cfg.site || 'stock', URL0 = cfg.url;
  if (!URL0) return;
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
  const SS = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; };
  const nf = (n) => Number(n || 0).toLocaleString('en-IN');
  const q = (o) => Object.keys(o).map((k) => k + '=' + encodeURIComponent(o[k])).join('&');
  const call = async (o, ms) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 12000); try { const r = await fetch(URL0 + (URL0.includes('?') ? '&' : '?') + q(o), { signal: c.signal }); return JSON.parse(await r.text()); } finally { clearTimeout(t); } };

  async function place() {
    try { const c = JSON.parse(LS('jcvc_place') || 'null'); if (c && Date.now() - c.t < 43200000) return c.p; } catch (e) {}
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 4000);
      const j = await (await fetch('https://ipwho.is/?fields=success,city,region,country', { signal: c.signal })).json(); clearTimeout(t);
      if (j && j.success !== false) { const p = { city: j.city || '', region: j.region || '', country: j.country || '' }; LS('jcvc_place', JSON.stringify({ t: Date.now(), p })); return p; }
    } catch (e) {}
    return { city: '', region: '', country: '' };
  }
  async function hit() {
    if (SS('jcvc_hit')) return; SS('jcvc_hit', '1');
    const isNew = !LS('jcvc_vid'); if (isNew) LS('jcvc_vid', String(Date.now()));
    const p = await place();
    try { await call({ action: 'hit', site: SITE, new: isNew ? 1 : 0, city: p.city, region: p.region, country: p.country }); } catch (e) {}
  }

  /* ---- Firestore operations counted by JCGG (window.JCVC.fb(kind, n)) and sent in batches ---- */
  const fbc = { r: 0, w: 0 };
  async function flush(keep) {
    if (!fbc.r && !fbc.w) return; const r = fbc.r, w = fbc.w; fbc.r = fbc.w = 0;
    try { if (keep) fetch(URL0 + '?' + q({ action: 'usage', site: SITE, r, w }), { keepalive: true, mode: 'no-cors' }); else await call({ action: 'usage', site: SITE, r, w }); }
    catch (e) { fbc.r += r; fbc.w += w; }
  }
  window.JCVC = { fb(kind, n) { if (kind === 'r') fbc.r += n || 1; else fbc.w += n || 1; } };

  /* ---- widget ---- */
  const css = '#jcvc{position:fixed;right:12px;bottom:12px;z-index:40;font-family:Inter,"Segoe UI",Arial,sans-serif;color:#14306e}' +
    '#jcvc .pill{display:flex;align-items:baseline;gap:7px;background:#fffdf5;border:1.5px solid #c99a1c;border-radius:22px;padding:4px 14px 5px;cursor:pointer;box-shadow:0 4px 14px -6px rgba(0,0,0,.35);user-select:none}' +
    '#jcvc .n{font-size:26px;font-weight:900;line-height:1}#jcvc .l{font-size:11px;font-weight:700;color:#5b6b8c}' +
    '#jcvc .pan{display:none;position:absolute;right:0;bottom:46px;width:310px;max-width:calc(100vw - 24px);background:#fff;border:1.5px solid #c99a1c;border-radius:12px;padding:10px 12px;box-shadow:0 14px 34px -12px rgba(0,0,0,.45);font-size:11px}' +
    '#jcvc.open .pan{display:block}#jcvc table{width:100%;border-collapse:collapse;margin:4px 0}#jcvc td{padding:2px 3px;border-bottom:1px solid #eef1f8;font-size:11px}#jcvc td.r{text-align:right;font-weight:700}' +
    '#jcvc h6{margin:6px 0 2px;font-size:10px;letter-spacing:.6px;color:#8a6a10;text-transform:uppercase}#jcvc .qb{height:5px;border-radius:3px;background:#e6ebf5;overflow:hidden;margin:2px 0 5px}#jcvc .qb i{display:block;height:100%;background:#2f8f5b}' +
    '#jcvc .qb i.w{background:#d98e04}#jcvc .qb i.h{background:#c0102e}#jcvc .row{display:flex;justify-content:space-between;gap:8px;font-size:10.5px}#jcvc .mut{color:#5b6b8c}@media(max-width:820px){#jcvc{bottom:' + (SITE === 'jcgg' ? 74 : 12) + 'px}}@media print{#jcvc{display:none}}';
  function mount() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const w = document.createElement('div'); w.id = 'jcvc';
    w.innerHTML = '<div class="pan"><div class="mut" id="jcvcHead">Loading…</div><h6>Where visitors came from</h6><table id="jcvcPlaces"></table><h6>Daily quota used (free plan)</h6><div id="jcvcQuota"></div><div class="mut" style="font-size:9.5px;margin-top:4px">Counts only; no IP address is stored. Quota is counted in-app.</div></div>' +
      '<div class="pill" role="button" tabindex="0" aria-label="Visitors"><span class="n" id="jcvcN">…</span><span class="l">visitors</span></div>';
    document.body.appendChild(w);
    const toggle = () => { w.classList.toggle('open'); if (w.classList.contains('open')) refresh(true); };
    w.querySelector('.pill').addEventListener('click', toggle);
    w.querySelector('.pill').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    document.addEventListener('click', (e) => { if (!w.contains(e.target)) w.classList.remove('open'); });
    return w;
  }
  let last = 0;
  const bar = (p) => '<div class="qb"><i class="' + (p >= 80 ? 'h' : p >= 50 ? 'w' : '') + '" style="width:' + Math.min(100, p) + '%"></i></div>';
  async function refresh(force) {
    if (!force && Date.now() - last < 60000) return; last = Date.now();
    let s; try { s = await call({ action: 'vstats', site: SITE }); } catch (e) { return; }
    if (!s || !s.ok) return;
    document.getElementById('jcvcN').textContent = nf(s.total);
    document.getElementById('jcvcHead').textContent = 'Today ' + nf(s.today) + ' · New browsers ' + nf(s.uniq) + ' · Counting since ' + s.since;
    const t = document.getElementById('jcvcPlaces'); t.textContent = '';
    (s.places || []).slice(0, 12).forEach((p) => { const tr = t.insertRow(); tr.insertCell().textContent = [p.city, p.region].filter(Boolean).join(', ') || 'Unknown'; tr.insertCell().textContent = p.country; const c = tr.insertCell(); c.className = 'r'; c.textContent = nf(p.n); });
    if (!(s.places || []).length) t.insertRow().insertCell().textContent = 'No visits recorded yet.';
    const g = s.google, f = s.firebase;
    document.getElementById('jcvcQuota').innerHTML =
      '<div class="row"><span>Google (Apps Script URL fetches)</span><b>' + nf(g.used) + ' / ' + nf(g.limit) + ' · ' + g.pct + '%</b></div>' + bar(g.pct) +
      '<div class="row"><span>Firebase reads</span><b>' + nf(f.reads) + ' / ' + nf(f.readLimit) + ' · ' + f.readPct + '%</b></div>' + bar(f.readPct) +
      '<div class="row"><span>Firebase writes</span><b>' + nf(f.writes) + ' / ' + nf(f.writeLimit) + ' · ' + f.writePct + '%</b></div>' + bar(f.writePct);
  }
  function start() { mount(); hit().then(() => refresh(true)); setInterval(() => refresh(false), 120000); if (SITE === 'jcgg') { setInterval(flush, 180000); addEventListener('pagehide', () => flush(true)); document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); }); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
