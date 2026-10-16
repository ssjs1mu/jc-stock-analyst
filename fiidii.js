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

  function dailyHTML(list) {
    const r = list[list.length - 1]; if (!r) return '<div class="jd-fn">No figures yet.</div>';
    const tile = (lab, c, net, buy, sell) => `<div class="fd-t" style="--fc:${c}"><span>${lab}</span><b class="${cls(net)}">${cr(net, 2)}</b><small>Buy ${cr(buy, 0).replace('+', '')} · Sell ${cr(sell, 0).replace('+', '')}</small></div>`;
    const comb = (r.fii_net || 0) + (r.dii_net || 0);
    const old = r.date !== istToday();
    return `<div class="fd-day">${dShort(r.date)}${old ? ' <em>(latest available)</em>' : ''} · combined <b class="${cls(comb)}">${cr(comb, 0)}</b></div>
      <div class="fd-ts">${tile('FII / FPI net', FII_C, r.fii_net, r.fii_buy, r.fii_sell)}${tile('DII net', DII_C, r.dii_net, r.dii_buy, r.dii_sell)}</div>
      <div class="fd-lg"><i style="background:${FII_C}"></i>FII/FPI <i style="background:${DII_C}"></i>DII <span>net ₹ cr · last ${Math.min(20, list.length)} sessions</span></div>${chart(list)}`;
  }

  // true when weekdays earlier in the same month are missing from the history (month only partly covered)
  function missedStart(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    for (let i = 1; i < d; i++) { const wd = new Date(Date.UTC(y, m - 1, i)).getUTCDay(); if (wd !== 0 && wd !== 6) return true; }
    return false;
  }
  function monthlyHTML(list) {
    const by = months(list), fpi = (S.d && S.d.fpi_equity_monthly) || {};
    const keys = [...new Set(Object.keys(by).concat(Object.keys(fpi)))].sort().reverse().slice(0, 6);
    const cur = istToday().slice(0, 7), firstDay = list.length ? list[0].date : '';
    const rows = keys.map((k) => {
      const m = by[k], [y, mm] = k.split('-');
      const partial = m && m.first === firstDay && missedStart(firstDay) ? `<small>from ${dShort(m.first)}</small>` : k === cur ? '<small>MTD</small>' : '';
      return `<tr><td>${MON[+mm - 1]} ${y.slice(2)} ${partial}</td><td class="${cls(m && m.fii)}">${m ? cr(m.fii) : '—'}</td><td class="${cls(m && m.dii)}">${m ? cr(m.dii) : '—'}</td><td class="${cls(fpi[k])}">${fpi[k] != null ? cr(fpi[k]) : '—'}</td></tr>`;
    }).join('');
    return `<table class="fd-tb"><thead><tr><th>Month</th><th>FII/FPI<br><small>NSE prov.</small></th><th>DII<br><small>NSE prov.</small></th><th>FPI equity<br><small>NSDL</small></th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function ytdHTML(list) {
    const yr = istToday().slice(0, 4), fpi = (S.d && S.d.fpi_equity_monthly) || {};
    const ks = Object.keys(fpi).filter((k) => k.startsWith(yr)).sort();
    const ytd = ks.reduce((s, k) => s + fpi[k], 0);
    const yl = list.filter((r) => r.date.startsWith(yr)), since = yl.length ? yl[0].date : '';
    const fs = yl.reduce((s, r) => s + (r.fii_net || 0), 0), ds = yl.reduce((s, r) => s + (r.dii_net || 0), 0);
    const mx = Math.max(1, ...ks.map((k) => Math.abs(fpi[k])));
    const bars = ks.map((k) => { const v = fpi[k], h = Math.round(Math.abs(v) / mx * 42); return `<div class="fd-mb" title="${MON[+k.slice(5) - 1]} ${yr}: FPI equity ${cr(v)} cr"><i class="${v >= 0 ? 'p' : 'n'}" style="height:${h}px"></i><span>${MON[+k.slice(5) - 1][0]}</span></div>`; }).join('');
    const fullYear = since && since <= yr + '-01-05';
    return `<div class="fd-ts"><div class="fd-t" style="--fc:${FII_C}"><span>FPI equity YTD <small>NSDL</small></span><b class="${cls(ytd)}">${cr(ytd)}</b><small>${ks.length} months${S.d && S.d.fpi_equity_upto ? ' · to ' + esc(S.d.fpi_equity_upto) : ''}</small></div>
      <div class="fd-t" style="--fc:${DII_C}"><span>DII ${fullYear ? 'YTD' : 'since ' + (since ? dShort(since) : '—')} <small>NSE prov.</small></span><b class="${cls(ds)}">${yl.length ? cr(ds) : '—'}</b><small>FII/FPI same period ${yl.length ? cr(fs) : '—'}</small></div></div>
      <div class="fd-mbs">${bars}</div>
      ${fullYear ? '' : `<div class="jd-fn">DII history on this site starts ${since ? dShort(since) : 'soon'}; the DII total grows into a full YTD as each session is added.</div>`}`;
  }

  function html() {
    if (!S.d && !S.err) load(false);
    else if (Date.now() - S.at > 15 * 60000) load(false);
    const list = S.d ? days() : [];
    const tabs = [['daily', 'Daily'], ['monthly', 'Monthly'], ['ytd', 'YTD']].map((t) => `<button type="button" class="fd-tab${S.tab === t[0] ? ' on' : ''}" data-fdtab="${t[0]}">${t[1]}</button>`).join('');
    const body = !S.d ? `<div class="jd-fn">${S.err ? esc(S.err) : 'Loading FII / DII flows…'}</div>`
      : S.tab === 'monthly' ? monthlyHTML(list) : S.tab === 'ytd' ? ytdHTML(list) : dailyHTML(list);
    const upd = S.d && S.d.updated_at ? new Date(S.d.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST' : '';
    return `<section class="jd-card jd-tc fd-card"><h3><span class="jd-ic">🏦</span>FII / DII cash flows <small>₹ crore</small><span class="fd-tabs">${tabs}</span></h3>${body}
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
  document.head.appendChild(css);

  window.jcFD = { html, load };
  load(false);
})();
