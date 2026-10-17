/* Joshi's Corner — FII / DII cash-flow card for the dashboard (sits between the heatmap and live news).
 * Reads data/fiidii.json from this site (built daily by the "FII/DII data" GitHub workflow from NSE,
 * Moneycontrol and NSDL). No backend call, no paid service. Values are ₹ crore. */
(function () {
  'use strict';
  const S = { d: null, at: 0, busy: false, err: '', tab: 'daily' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const FII_C = '#1f4fbf', DII_C = '#d97706';
  const cr = (v, dp = 0) => v == null || isNaN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const cls = (v) => (v == null ? '' : v > 0 ? 'fd-up' : v < 0 ? 'fd-dn' : '');
  const dShort = (iso) => { const [y, m, d] = iso.split('-'); return `${+d} ${MON[+m - 1]}`; };
  const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

  async function load(force) {
    if (S.busy || (!force && S.d && Date.now() - S.at < 15 * 60000)) return;
    S.busy = true;
    try {
      const r = await fetch('data/fiidii.json?h=' + Math.floor(Date.now() / 600000), { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      S.d = await r.json(); S.err = ''; S.at = Date.now();
    } catch (e) { S.err = 'FII/DII data unavailable right now'; S.at = Date.now(); }
    finally { S.busy = false; if (window.jdRepaint) window.jdRepaint(); }
  }

  function days() { const d = (S.d && S.d.daily) || {}; return Object.keys(d).sort().map((k) => Object.assign({ date: k }, d[k])); }
  function months(list) {
    const by = {};
    list.forEach((r) => { const k = r.date.slice(0, 7); const m = by[k] || (by[k] = { k, fii: 0, dii: 0, n: 0, first: r.date }); m.fii += r.fii_net || 0; m.dii += r.dii_net || 0; m.n++; });
    return by;
  }

  function chart(list) {
    const L = list.slice(-20); if (!L.length) return '';
    const W = 420, H = 132, top = 10, bot = 18, mid = top + (H - top - bot) / 2;
    const mx = Math.max(1, ...L.map((r) => Math.max(Math.abs(r.fii_net || 0), Math.abs(r.dii_net || 0))));
    const sc = (H - top - bot) / 2 / mx, slot = W / L.length, bw = Math.max(2, slot * 0.36);
    let bars = '', labs = '';
    L.forEach((r, i) => {
      const x0 = i * slot + slot * 0.12;
      [[r.fii_net, FII_C, 'FII/FPI'], [r.dii_net, DII_C, 'DII']].forEach((b, j) => {
        const v = b[0] || 0, h = Math.max(1, Math.abs(v) * sc), y = v >= 0 ? mid - h : mid;
        bars += `<rect x="${(x0 + j * bw).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 0.6).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${b[1]}"><title>${dShort(r.date)} · ${b[2]} net ${cr(v, 2)} cr</title></rect>`;
      });
      const last = i === L.length - 1;
      if ((i % 5 === 0 && i < L.length - 3) || last) labs += `<text x="${last ? W - 1 : (x0 + bw).toFixed(1)}" y="${H - 4}" text-anchor="${last ? 'end' : i === 0 ? 'start' : 'middle'}">${dShort(r.date)}</text>`;
    });
    return `<svg class="fd-ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="FII and DII net flows, last ${L.length} sessions">
      <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="fd-zero"/>${bars}${labs}
      <text x="2" y="${top + 2}" class="fd-ax">+${Math.round(mx).toLocaleString('en-IN')}</text><text x="2" y="${H - bot - 1}" class="fd-ax">−${Math.round(mx).toLocaleString('en-IN')}</text></svg>`;
  }

  const tone = (v) => v == null ? 'fl' : v > 0 ? 'up' : v < 0 ? 'dn' : 'fl';
  const gtile = (lab, net, sub, wide, extra) => `<div class="fdg ${tone(net)}${wide ? ' wide' : ''}"><div class="fdg-in"><span class="fdg-l">${lab}</span><b class="fdg-v">${cr(net, 2)}</b><small>${sub}</small>${extra || ''}</div></div>`;
  function miniBars(list) {
    const L = list.slice(-20); if (!L.length) return '';
    const W = 300, H = 40, mid = H / 2, mx = Math.max(1, ...L.map((r) => Math.max(Math.abs(r.fii_net || 0), Math.abs(r.dii_net || 0)))), sc = (mid - 2) / mx, slot = W / L.length, bw = Math.max(2, slot * 0.36);
    let bars = ''; L.forEach((r, i) => { const x0 = i * slot + slot * 0.12;[[r.fii_net, '#6aa0ff'], [r.dii_net, '#ffb347']].forEach((b, j) => { const v = b[0] || 0, h = Math.max(1, Math.abs(v) * sc); bars += `<rect x="${(x0 + j * bw).toFixed(1)}" y="${(v >= 0 ? mid - h : mid).toFixed(1)}" width="${(bw - 0.6).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${b[1]}"><title>${dShort(r.date)} · ${j ? 'DII' : 'FII/FPI'} ${cr(v, 2)} cr</title></rect>`; }); });
    return `<svg class="fdg-sv" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="rgba(255,255,255,.35)"/>${bars}</svg><div class="fdg-lg"><i style="background:#6aa0ff"></i>FII/FPI <i style="background:#ffb347"></i>DII · last ${L.length} sessions</div>`;
  }
  function dailyHTML(list) {
    const r = list[list.length - 1]; if (!r) return '<div class="jd-fn">No figures yet.</div>';
    const comb = (r.fii_net || 0) + (r.dii_net || 0), old = r.date !== istToday(), bs = (b, s2) => `Buy ${cr(b, 0).replace('+', '')} · Sell ${cr(s2, 0).replace('+', '')}`;
    return `<div class="fd-day">${dShort(r.date)}${old ? ' <em>(latest available)</em>' : ''} · ₹ crore</div><div class="fdg-g">${gtile('FII / FPI NET', r.fii_net, bs(r.fii_buy, r.fii_sell))}${gtile('DII NET', r.dii_net, bs(r.dii_buy, r.dii_sell))}${gtile('COMBINED NET', comb, 'FII/FPI + DII', 1, miniBars(list))}</div>`;
  }

  // true when weekdays earlier in the same month are missing from the history (month only partly covered)
  function missedStart(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    for (let i = 1; i < d; i++) { const wd = new Date(Date.UTC(y, m - 1, i)).getUTCDay(); if (wd !== 0 && wd !== 6) return true; }
    return false;
  }
  function monthlyHTML(list) {
    const by = months(list), fpi = (S.d && S.d.fpi_equity_monthly) || {};
    const keys = [...new Set(Object.keys(by).concat(Object.keys(fpi)))].sort().reverse().slice(0, 6), cur = istToday().slice(0, 7), firstDay = list.length ? list[0].date : '';
    const mt = (k) => {
      const m = by[k], [y, mm] = k.split('-'), partial = m && m.first === firstDay && missedStart(firstDay) ? 'from ' + dShort(m.first) : k === cur ? 'MTD' : '', t = tone(m ? m.fii + m.dii : fpi[k]);
      const line = (n, v) => `<div class="fdg-r"><span>${n}</span><b class="${cls(v)}">${v == null ? '—' : cr(v)}</b></div>`;
      return `<div class="fdg ${t}"><div class="fdg-in"><span class="fdg-l">${MON[+mm - 1].toUpperCase()} ${y.slice(2)} <em>${partial}</em></span>${line('FII/FPI', m ? m.fii : null)}${line('DII', m ? m.dii : null)}${line('FPI equity·NSDL', fpi[k] != null ? fpi[k] : null)}</div></div>`;
    };
    return `<div class="fdg-g g3">${keys.map(mt).join('')}</div>`;
  }

  function ytdHTML(list) {
    const yr = istToday().slice(0, 4), fpi = (S.d && S.d.fpi_equity_monthly) || {}, ks = Object.keys(fpi).filter((k) => k.startsWith(yr)).sort(), ytd = ks.reduce((s, k) => s + fpi[k], 0);
    const yl = list.filter((r) => r.date.startsWith(yr)), since = yl.length ? yl[0].date : '', fs = yl.reduce((s, r) => s + (r.fii_net || 0), 0), ds = yl.reduce((s, r) => s + (r.dii_net || 0), 0), mx = Math.max(1, ...ks.map((k) => Math.abs(fpi[k])));
    const bars = ks.map((k) => { const v = fpi[k], h = Math.round(Math.abs(v) / mx * 38); return `<div class="fdg-mb" title="${MON[+k.slice(5) - 1]} ${yr}: FPI equity ${cr(v)} cr"><i class="${v >= 0 ? 'p' : 'n'}" style="height:${h}px"></i><span>${MON[+k.slice(5) - 1].slice(0, 1)}</span></div>`; }).join('');
    const fullYear = since && since <= yr + '-01-05';
    return `<div class="fdg-g">${gtile('FPI EQUITY YTD · NSDL', ytd, ks.length + ' months' + (S.d && S.d.fpi_equity_upto ? ' · to ' + esc(S.d.fpi_equity_upto) : ''))}${gtile('DII ' + (fullYear ? 'YTD' : 'SINCE ' + (since ? dShort(since).toUpperCase() : '—')), yl.length ? ds : null, 'FII/FPI same period ' + (yl.length ? cr(fs) : '—'))}`
      + `<div class="fdg wide fl"><div class="fdg-in"><span class="fdg-l">FPI EQUITY BY MONTH</span><div class="fdg-mbs">${bars}</div></div></div></div>${fullYear ? '' : `<div class="jd-fn">DII history on this site starts ${since ? dShort(since) : 'soon'}; the DII total grows into a full YTD as each session is added.</div>`}`;
  }

  function html() {
    if (!S.d && !S.err) load(false);
    else if (Date.now() - S.at > 15 * 60000) load(false);
    const list = S.d ? days() : [];
    const tabs = [['daily', 'Daily'], ['monthly', 'Monthly'], ['ytd', 'YTD']].map((t) => `<button type="button" class="fd-tab${S.tab === t[0] ? ' on' : ''}" data-fdtab="${t[0]}">${t[1]}</button>`).join('');
    const body = !S.d ? `<div class="jd-fn">${S.err ? esc(S.err) : 'Loading FII / DII flows…'}</div>`
      : S.tab === 'monthly' ? monthlyHTML(list) : S.tab === 'ytd' ? ytdHTML(list) : dailyHTML(list);
    const upd = S.d && S.d.updated_at ? new Date(S.d.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST' : '';
    return `<section class="jd-card jd-tc fd-card fdg-card"><h3><span class="jd-ic">🏦</span>FII / DII cash flows <small>₹ crore</small><span class="fd-tabs">${tabs}</span></h3>${body}
      <div class="jd-fn">Provisional NSE cash-market figures; monthly FPI equity from NSDL (includes primary market).${upd ? ' Updated ' + upd + '.' : ''}</div></section>`;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fdtab]'); if (!b) return;
    S.tab = b.getAttribute('data-fdtab'); if (window.jdRepaint) window.jdRepaint();
  });

  const css = document.createElement('style');
  css.textContent = `
  .fd-card h3{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.fd-tabs{margin-left:auto;display:inline-flex;gap:3px;background:#e6ecf8;border-radius:8px;padding:2px}
  .fd-tab{border:0;background:none;font:800 10.5px inherit;font-family:inherit;color:#34456a;padding:3px 9px;border-radius:6px;cursor:pointer}.fd-tab.on{background:#fff;color:#0b2260;box-shadow:0 1px 3px rgba(20,48,110,.18)}
  .fd-up{color:#06612f}.fd-dn{color:#a10b27}
  .fd-day{font-size:11.5px;color:#34456a;font-weight:700;margin:2px 0 6px}.fd-day em{font-style:normal;color:#8a5200}.fd-day b{font-weight:900}
  .fd-ts{display:grid;grid-template-columns:1fr 1fr;gap:6px}.fd-t{border:1px solid #d5ddef;border-left:4px solid var(--fc);border-radius:8px;padding:6px 9px;background:#f7f9fd;display:flex;flex-direction:column;gap:1px;min-width:0}
  .fd-t span{font-size:10px;font-weight:800;color:#34456a;letter-spacing:.3px}.fd-t span small{font-weight:700;color:#7b88a6}.fd-t b{font:900 18px ui-monospace,Consolas,monospace}.fd-t>small{font-size:10px;color:#4a5878;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .fd-lg{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:800;color:#34456a;margin:8px 0 2px}.fd-lg i{width:9px;height:9px;border-radius:2px;display:inline-block}.fd-lg span{margin-left:auto;color:#7b88a6;font-weight:700}
  .fd-ch{width:100%;height:auto;display:block}.fd-ch text{font:700 8.5px system-ui,sans-serif;fill:#4a5878}.fd-ch .fd-ax{fill:#9aa6c2;font-size:8px}.fd-zero{stroke:#9aa6c2;stroke-width:1}
  .fd-tb{width:100%;border-collapse:collapse;font-size:12px}.fd-tb th{font-size:9.5px;color:#4a5878;text-align:right;border-bottom:1.5px solid #c9d3e8;padding:3px 4px;line-height:1.15}.fd-tb th:first-child,.fd-tb td:first-child{text-align:left}
  .fd-tb th small{font-weight:700;color:#7b88a6;font-size:8.5px}.fd-tb td{padding:5px 4px;border-bottom:1px solid #e3e9f5;text-align:right;font:800 12px ui-monospace,Consolas,monospace}.fd-tb td:first-child{font-family:inherit;color:#10204a}.fd-tb td small{color:#8a5200;font-weight:700;font-size:9.5px;margin-left:3px}
  .fd-mbs{display:flex;align-items:flex-end;gap:4px;height:62px;margin:10px 0 2px;padding:0 2px;border-bottom:1px solid #c9d3e8}.fd-mb{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%}
  .fd-mb i{width:100%;max-width:22px;border-radius:3px 3px 0 0;display:block}.fd-mb i.p{background:#1e9a5a}.fd-mb i.n{background:#c1243e}.fd-mb span{font-size:8.5px;font-weight:800;color:#4a5878}`;
  css.textContent += `
  .fdg-g{display:grid;grid-template-columns:1fr 1fr;gap:10px;perspective:900px}.fdg-g.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.fdg.wide{grid-column:1 / -1}
  .fdg-in{position:relative;overflow:hidden;isolation:isolate;border-radius:14px;padding:10px 12px;color:#eef3ff;display:flex;flex-direction:column;gap:2px;height:100%;
    background:linear-gradient(150deg,#27345c 0%,#111a37 52%,#070b1a 100%);border:1px solid rgba(190,205,255,.3);
    box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 -8px 14px rgba(0,0,0,.45) inset,0 6px 0 -2px #0a1128,0 7px 0 -2px rgba(150,170,230,.25),0 16px 18px -10px rgba(5,12,40,.75);transition:transform .15s}
  .fdg:hover .fdg-in{transform:translateY(-2px)}
  .fdg-in::before{content:'';position:absolute;inset:-30%;z-index:-1;filter:blur(13px);animation:fdgs 11s ease-in-out infinite alternate;background:radial-gradient(38% 34% at 16% 85%,var(--g1),transparent 70%),radial-gradient(34% 30% at 88% 22%,rgba(150,175,255,.32),transparent 70%),radial-gradient(40% 28% at 55% 55%,rgba(255,255,255,.09),transparent 72%)}
  .fdg-in::after{content:'';position:absolute;left:0;right:0;top:0;height:46%;z-index:0;pointer-events:none;border-radius:14px 14px 55% 55%/14px 14px 22px 22px;background:linear-gradient(180deg,rgba(255,255,255,.32),rgba(255,255,255,.1) 48%,rgba(255,255,255,0))}
  .fdg-in>*{position:relative;z-index:1}@keyframes fdgs{0%{transform:translate(-4%,2%) rotate(0)}100%{transform:translate(3%,-3%) rotate(8deg)}}
  .fdg.up{--g1:rgba(30,214,120,.5);--ac:#42f0a0}.fdg.up .fdg-in{border-color:rgba(66,240,160,.55)}.fdg.dn{--g1:rgba(255,70,95,.48);--ac:#ff8a9b}.fdg.dn .fdg-in{border-color:rgba(255,122,142,.55)}.fdg.fl{--g1:rgba(120,150,255,.38);--ac:#c5d1f7}
  .fdg-l{font-size:10px;font-weight:800;letter-spacing:.08em;color:#dfe8ff;text-shadow:0 1px 2px rgba(0,0,0,.6)}.fdg-l em{font-style:normal;font-weight:600;opacity:.7;letter-spacing:0;margin-left:3px}
  .fdg-v{font:900 22px ui-monospace,Consolas,monospace;color:var(--ac);text-shadow:0 2px 6px rgba(0,0,0,.55),0 0 14px var(--g1)}.fdg-in>small{font-size:10px;font-weight:700;color:#cfd9f7;text-shadow:0 1px 2px rgba(0,0,0,.5)}
  .fdg-sv{display:block;width:100%;height:42px;margin-top:6px}.fdg-lg{display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;color:#cfd9f7;margin-top:2px}.fdg-lg i{width:8px;height:8px;border-radius:2px;display:inline-block}
  .fdg-r{display:flex;justify-content:space-between;gap:6px;font-size:10.5px;margin-top:3px;padding:2px 6px;border-radius:6px;background:rgba(0,0,0,.3)}.fdg-r span{color:#cfd9f7;font-weight:700}.fdg-r b{font:800 11px ui-monospace,Consolas,monospace}.fdg-r .fd-up{color:#54f5aa}.fdg-r .fd-dn{color:#ff8da0}
  .fdg-mbs{display:flex;align-items:flex-end;gap:5px;height:50px;margin-top:6px}.fdg-mb{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%}.fdg-mb i{width:100%;max-width:20px;border-radius:3px 3px 0 0;display:block}.fdg-mb i.p{background:#42f0a0}.fdg-mb i.n{background:#ff7a8e}.fdg-mb span{font-size:8.5px;font-weight:800;color:#cfd9f7}
  @media(max-width:700px){.fdg-g.g3{grid-template-columns:1fr 1fr}}`;
  document.head.appendChild(css);

  window.jcFD = { html, load };
  load(false);
})();
