/* Joshi's Corner — Today's Outlook (client view). Gold-framed day outlook built from the MORNING SCHEDULED REPORTS (reports/<id>/…json written by pipeline/auto_reports.py),
   today's calls (data/calls/latest.json) and the stock board (data/calls/board.json). Frames:
   1 Outlook for the day · 2 World / commodities / currency / bonds · 3 Important news · 4 Intraday & investment calls · 5 Watchlist Buy / Sell / Avoid pop-ups
   then a scrip search that opens the X-ray first and offers the Intraday, Short term and Long term reports.
   Everything is computed from published files and delayed data; no client names or lists are stored here (the watchlist is read from this browser, as elsewhere).
   Rule-based research information — not investment advice, not a guaranteed outcome. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v, d) => (num(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '—');
  const O = { rep: {}, calls: null, board: null, listId: null, loaded: false, busy: false, sym: '', err: '' };
  const IDS = { brief: 'morning-brief', det: 'morning-detailed', news: 'premarket-news', pulse: 'morning-pulse' };
  const pf = (s) => { const v = parseFloat(String(s).replace(/[,%+]/g, '')); return isFinite(v) ? v : null; };
  const clean = (s) => String(s || '').replace(/\.(NS|BO)$/i, '').toUpperCase();

  async function jget(url) { const r = await fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
  async function loadRep(key) {
    try {
      const ix = await jget('reports/' + IDS[key] + '/index.json'), runs = ix.runs || [];
      const run = runs.find((r) => r.status === 'ok' && (r.files || []).some((f) => f.type === 'json'));
      const hol = runs[0] && runs[0].status === 'holiday' ? runs[0] : null;
      if (!run) return { holiday: hol };
      const f = run.files.find((x) => x.type === 'json'), pdf = run.files.find((x) => x.type === 'pdf');
      const cfg = await jget(f.path);
      return { cfg, date: run.date, at: run.generated_at, pdf: pdf && pdf.path, holiday: hol };
    } catch (e) { return null; }
  }
  const sec = (rep, re) => ((rep && rep.cfg && rep.cfg.sections) || []).filter((s) => re.test(s.heading));
  const tabs = (rep, re) => sec(rep, re).flatMap((s) => s.blocks.filter((b) => b.type === 'table').map((b) => b.rows));
  const bul = (rep, re) => sec(rep, re).flatMap((s) => s.blocks.filter((b) => b.type === 'bullets').flatMap((b) => b.items));
  const para = (rep, re) => sec(rep, re).flatMap((s) => s.blocks.filter((b) => b.type === 'paragraph').map((b) => b.text)).join(' ');
  const pick = (rows, nm) => (rows || []).find((r) => r[0].toLowerCase().indexOf(nm.toLowerCase()) === 0);
  const arrow = (p) => (p == null ? '' : p > 0 ? '<b class="up">▲</b>' : p < 0 ? '<b class="dn">▼</b>' : '■');
  const cls = (p) => (p > 0 ? 'up' : p < 0 ? 'dn' : '');

  async function loadAll() {
    if (O.busy) return; O.busy = true;
    const [brief, det, news, calls, board] = await Promise.all([loadRep('brief'), loadRep('det'), loadRep('news'), jget('data/calls/latest.json').catch(() => null), jget('data/calls/board.json').catch(() => null)]);
    O.rep = { brief, det, news }; O.calls = calls; O.board = board; O.loaded = true; O.busy = false; draw();
  }

  /* ---------- pieces ---------- */
  const tile = (nm, r, d) => { if (!r) return ''; const p = pf(r[2]); return `<div class="olT"><small>${E(nm)}</small><b>${E(r[1])}</b><span class="${cls(p)}">${arrow(p)} ${E(r[2])}</span></div>`; };
  const mini = (title, rows) => rows && rows.length ? `<div class="olC"><h5>${E(title)}</h5>${rows.map((r) => { const p = pf(r[2]); return `<div class="olR"><span>${E(r[0])}</span><i>${E(r[1])}</i><u class="${cls(p)}">${arrow(p)} ${E(r[2])}</u></div>`; }).join('')}</div>` : '';
  function worldRead(g, a, c, x) {
    const ps = (rows) => (rows || []).map((r) => pf(r[2])).filter((v) => v != null);
    const gp = ps(g), ap = ps(a), L = [];
    const upN = (v) => v.filter((q) => q > 0).length;
    if (gp.length) L.push(`US/Europe: ${upN(gp)} of ${gp.length} indices higher.`);
    if (ap.length) L.push(`Asia: ${upN(ap)} of ${ap.length} higher.`);
    const br = pick(c, 'Brent'), gd = pick(c, 'Gold'), inr = pick(x, 'USD/INR'), y10 = pick(x, 'US 10'), dx = pick(x, 'Dollar');
    if (br) L.push(`Brent ${pf(br[2]) < 0 ? 'fell' : 'rose'} ${E(br[2].replace(/^[+-]/, ''))} to ${E(br[1])}.`);
    if (gd) L.push(`Gold ${E(gd[2])}.`);
    if (inr) L.push(`USD/INR ${E(inr[1])} (${E(inr[2])}).`);
    if (y10) L.push(`US 10-yr yield ${E(y10[1])}%.`);
    return L.join(' ');
  }
  function frame1() {
    const b = O.rep.brief, d = O.rep.det, n = O.rep.news, R = b || d;
    if (!R || !R.cfg) return `<section class="olF dbl"><h3>OUTLOOK FOR THE DAY</h3><div class="olN">The morning report has not been published yet${O.rep.brief && O.rep.brief.holiday ? ' — ' + E(O.rep.brief.holiday.note) : ''}. It appears here automatically after the 07:30–08:30 IST build.</div></section>`;
    const ind = tabs(R, /India VIX|Indian Markets/)[0] || [];
    const lv = tabs(R, /Key Levels/)[0] || [];
    const out = bul(d, /^Outlook/).filter((x) => x.length > 25), al = [...bul(R, /Alerts/), ...bul(n, /Calendar/)].filter((x, i, a) => a.indexOf(x) === i && x.length > 3);
    const t = new Date(R.at); const when = isNaN(t) ? R.date : t.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST';
    return `<section class="olF dbl"><h3>OUTLOOK FOR THE DAY <small>${E(R.date)}</small></h3>
      <p class="olBias">${E(para(R, /Bias/) || 'Bias not available.')}</p>
      <div class="olTiles">${tile('Nifty 50', pick(ind, 'Nifty 50'))}${tile('Sensex', pick(ind, 'Sensex'))}${tile('Bank Nifty', pick(ind, 'Bank Nifty'))}${tile('Nifty 500', pick(ind, 'Nifty 500'))}${tile('India VIX', pick(ind, 'India VIX'))}</div>
      ${lv.length ? `<div class="olLv">${lv.map((r) => `<div><small>${E(r[0])}</small><span class="dn">Support ${E(r[1])}</span><span class="up">Resistance ${E(r[2])}</span></div>`).join('')}</div>` : ''}
      ${out.length ? `<div class="olBl"><b>Outlook</b>${out.map((x) => `<p>${E(x)}</p>`).join('')}</div>` : ''}
      ${al.length ? `<div class="olAl">${al.map((x) => `<span>📅 ${E(x)}</span>`).join('')}</div>` : ''}
      <div class="olSrc">From the Morning Updates report · built ${E(when)}${R.date !== new Date(Date.now() + 19800000).toISOString().slice(0, 10) ? ' · <b>not today’s report yet</b>' : ''} ${R.pdf ? `· <a href="${E(R.pdf)}" target="_blank" rel="noopener">open PDF</a>` : ''}</div></section>`;
  }
  function frame2() {
    const d = O.rep.det, b = O.rep.brief, n = O.rep.news, R = d || b;
    if (!R || !R.cfg) return `<section class="olF"><h3>WORLD · COMMODITIES · CURRENCY · BONDS</h3><div class="olN">Waiting for the morning report.</div></section>`;
    let g = tabs(R, /^Global/)[0], a = tabs(R, /^Asian/)[0];
    if (!g || !a) { const all = tabs(R, /Global & Asian|Overnight Global/)[0] || tabs(n, /Overnight Global/)[0] || []; g = g || all.slice(0, 5); a = a || all.slice(5); }
    const cm = tabs(R, /Commodit/)[0] || [];
    const c = cm.filter((r) => /Brent|WTI|Gold|Silver|crude/i.test(r[0])), x = cm.filter((r) => !/Brent|WTI|Gold|Silver|crude/i.test(r[0]));
    const cur = x.filter((r) => /USD|INR|Dollar|DXY/i.test(r[0])), bond = x.filter((r) => /yield|10-yr|bond/i.test(r[0]));
    return `<section class="olF"><h3>WORLD · COMMODITIES · CURRENCY · BONDS <small>outlook for the day</small></h3>
      <p class="olBias sm">${worldRead(g, a, c, x)}</p>
      <div class="olGrid">${mini('US & Europe', g)}${mini('Asia', a)}${mini('Commodities', c)}${mini('Currency', cur)}${mini('Bonds', bond)}</div>
      <div class="olSrc">GIFT Nifty and MCX are not available to the free data pipeline.</div></section>`;
  }
  function frame3() {
    const d = O.rep.det, n = O.rep.news;
    const heads = [...bul(n, /Headlines/), ...bul(d, /^Headlines/)].map((x) => x.trim()).filter((x, i, a) => x.length > 20 && a.findIndex((y) => y.slice(0, 40) === x.slice(0, 40)) === i).slice(0, 8);
    const sf = (tabs(d, /Stocks in Focus/)[0] || []), gain = sf.filter((r) => pf(r[2]) > 0).slice(0, 5), lose = sf.filter((r) => pf(r[2]) < 0).slice(0, 5);
    return `<section class="olF"><h3>IMPORTANT NEWS <small>from the pre-market news &amp; morning reports</small></h3>
      ${heads.length ? `<ul class="olNews">${heads.map((h) => { const m = /^(.*?)\s*\[([^\]]+)\]\.?$/.exec(h); return `<li>${E(m ? m[1] : h)}${m ? ` <em>${E(m[2])}</em>` : ''}</li>`; }).join('')}</ul>` : '<div class="olN">No headlines published yet.</div>'}
      ${sf.length ? `<div class="olGrid">${mini('Top gainers (Nifty 50, prev. session)', gain)}${mini('Top losers', lose)}</div>` : ''}</section>`;
  }
  const lvl = (c) => ['entry', 'sl', 't1', 't2'].map((k) => (num(c[k]) ? `<td>${f2(c[k], c[k] < 100 ? 2 : 1)}</td>` : '<td>—</td>')).join('');
  function frame4() {
    const C = O.calls; if (!C) return `<section class="olF"><h3>INTRADAY &amp; INVESTMENT CALLS</h3><div class="olN">Calls file not available.</div></section>`;
    const day = (C.calls || []).filter((c) => c.type === 'DAY'), inv = (C.calls || []).filter((c) => c.type !== 'DAY');
    const tbl = (rows, k) => rows.length ? `<div class="olScroll"><table class="olTb"><thead><tr><th>Side</th><th>Stock</th><th>Entry</th><th>Stop</th><th>T1</th><th>T2</th><th>Grade</th><th></th></tr></thead><tbody>${rows.map((c) => `<tr><td><b class="${c.side === 'BUY' ? 'up' : 'dn'}">${E(c.side)}</b></td><td><b>${E(c.sym)}</b></td>${lvl(c)}<td>${E(c.grade || '')}</td><td><button class="olX" data-x="${E(c.sym)}">X-ray</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="olN">No ${k} calls today — the rules found nothing that passed. Quiet days are normal.</div>`;
    const cx = C.ctx || {};
    return `<section class="olF"><h3>INTRADAY &amp; INVESTMENT CALLS <small>${E(C.date || '')} · ${E(String(C.scanned || ''))} stocks scanned · market ${E(cx.regime || '—')}, VIX ${f2(cx.vix, 1)}</small></h3>
      <h5 class="olH">Intraday (today only — square off the same day)</h5>${tbl(day, 'intraday')}
      <h5 class="olH">Investment (positional / long-term)</h5>${tbl(inv, 'investment')}
      <div class="olSrc">Rule-based levels from delayed data; a stop is part of every call. Not advice and not a guaranteed outcome.</div></section>`;
  }
  /* ---------- watchlist Buy / Sell / Avoid ---------- */
  const lists = () => { try { wlEnsure(); return WL.store.lists || []; } catch (e) { return []; } };
  function classify(list) {
    const B = (O.board && O.board.rows) || {}, calls = {}; ((O.calls && O.calls.calls) || []).forEach((c) => { calls[clean(c.sym)] = c; });
    const out = { BUY: [], SELL: [], AVOID: [] };
    (list ? list.syms : []).forEach((s0) => {
      const s = clean(s0), r = B[s], c = calls[s];
      if (c && (c.side === 'BUY' || c.side === 'SELL')) { out[c.side].push({ s, r, c, tag: c.type === 'DAY' ? 'Intraday call' : 'Investment call', conv: r ? r.conv : c.score }); return; }
      if (!r) { out.AVOID.push({ s, r: null, why: 'Not in the scanned list — no rule-based view' }); return; }
      if (r.b === 'BUY' || r.b === 'SELL') out[r.b].push({ s, r, tag: 'Signal', conv: r.conv });
      else if (r.lean === 'BUY' && r.conv >= 60) out.BUY.push({ s, r, tag: 'Leaning buy · wait for trigger', conv: r.conv });
      else if (r.lean === 'SELL' && r.conv >= 60) out.SELL.push({ s, r, tag: 'Leaning sell · wait for trigger', conv: r.conv });
      else out.AVOID.push({ s, r, why: r.no || 'No clean set-up', conv: r.conv });
    });
    Object.values(out).forEach((a) => a.sort((x, y) => (y.conv || 0) - (x.conv || 0)));
    return out;
  }
  function frame5() {
    const L = lists(); if (!O.listId || !L.find((l) => l.id === O.listId)) O.listId = (typeof WL !== 'undefined' && WL.store && WL.store.active) || (L[0] && L[0].id);
    const l = L.find((x) => x.id === O.listId), k = classify(l);
    return `<section class="olF"><h3>MY WATCHLIST — BUY · SELL · AVOID</h3>
      <div class="olSel"><label>Watchlist <select id="olList">${L.map((x) => `<option value="${E(x.id)}"${x.id === O.listId ? ' selected' : ''}>${E(x.name)} (${x.syms.length})</option>`).join('')}</select></label>
        <small>${O.board ? 'Board as of ' + E(String(O.board.date || '')) : 'Board not loaded'}</small></div>
      <div class="olBtns"><button class="olB buy" data-k="BUY">BUY<b>${k.BUY.length}</b></button><button class="olB sell" data-k="SELL">SELL<b>${k.SELL.length}</b></button><button class="olB avoid" data-k="AVOID">AVOID<b>${k.AVOID.length}</b></button></div>
      <div class="olSrc">Tap a button to see the stocks from this watchlist. Buy / Sell = a rule-based signal or call (or a strong lean, marked); Avoid = no clean set-up today.</div></section>`;
  }
  function popup(kind) {
    const l = lists().find((x) => x.id === O.listId), k = classify(l)[kind], T = { BUY: 'Buy', SELL: 'Sell', AVOID: 'Avoid' }[kind];
    const body = k.length ? `<div class="olScroll"><table class="olTb"><thead><tr><th>Stock</th><th>Price</th><th>Why / levels</th><th>Conv.</th><th></th></tr></thead><tbody>${k.map((x) => {
      const r = x.r, c = x.c, chg = r && r.pc ? (r.c / r.pc - 1) * 100 : null;
      const lv = c ? `Entry ${f2(c.entry)} · Stop ${f2(c.sl)} · T1 ${f2(c.t1)} · T2 ${f2(c.t2)}` : (r && r.pv && kind !== 'AVOID' ? `Support ${f2(r.pv.S1)} · Resistance ${f2(r.pv.R1)}` : '');
      const why = x.why || ((c && c.why) || (r && r.why) || []).slice(0, 2).join(' · ');
      return `<tr><td><b>${E(x.s)}</b><br><small>${E(x.tag || '')}</small></td><td>${r ? f2(r.c) : '—'}${chg != null ? `<br><small class="${cls(chg)}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</small>` : ''}</td><td><small>${E(lv)}${lv && why ? '<br>' : ''}${E(why)}</small></td><td>${num(x.conv) ? Math.round(x.conv) : '—'}</td><td><button class="olX" data-x="${E(x.s)}">X-ray</button></td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="olN">No stocks in this group for the selected watchlist today.</div>`;
    let m = $('olPop'); if (!m) { m = document.createElement('div'); m.id = 'olPop'; document.body.appendChild(m); }
    m.innerHTML = `<div class="olBox"><div class="olHd"><h3>${T} — ${E(l ? l.name : '')} <small>${k.length} stock${k.length === 1 ? '' : 's'}</small></h3><button class="olClose" data-close="1">✕</button></div>${body}<div class="olSrc">Rule-based, from delayed data. Conv. = signal-agreement score, not a probability. Not investment advice.</div></div>`;
    m.className = 'on'; document.body.style.overflow = 'hidden';
  }
  const closePop = () => { const m = $('olPop'); if (m) m.className = ''; document.body.style.overflow = ''; };
  /* ---------- scrip search → X-ray first, then the reports ---------- */
  function frame6() {
    return `<section class="olF"><h3>SCRIP SEARCH · X-RAY &amp; FULL REPORT</h3>
      <div class="olSearch"><input id="olSym" placeholder="Symbol e.g. RELIANCE, TFCILTD" value="${E(O.sym)}" autocomplete="off"><select id="olEx"><option value="NS">NSE</option><option value="BO">BSE</option></select><button class="olB go" id="olGo">Generate report</button></div>
      <div class="olSrc">Opens the graphical X-ray first, then builds the Quick summary, Intraday, Short term and Long term reports.</div>
      <div id="olRep">${O.sym && O.gen ? repStrip() : ''}</div></section>`;
  }
  const repStrip = () => `<div class="olStrip"><b>${E(O.sym)}</b> reports: <button data-x="${E(O.sym)}">① X-ray</button><button data-tab="pSummary">② Quick summary</button><button data-tab="pIntraday">③ Intraday</button><button data-tab="pSwing">④ Short term</button><button data-tab="pLong">⑤ Long term</button></div>`;
  async function go() {
    const inp = $('olSym'); const s = clean((inp && inp.value) || ''); if (!s) return; O.sym = s; O.gen = true;
    const si = $('symbolInput'), ex = $('exchangeInput'); if (si) si.value = s; if (ex && $('olEx')) ex.value = $('olEx').value;
    const rp = $('olRep'); if (rp) rp.innerHTML = repStrip() + '<div class="olN">Building the full report in the background…</div>';
    if (window.jcXray) window.jcXray(s + ($('olEx') && $('olEx').value === 'BO' ? '.BO' : ''));
    try { if (typeof runAnalysis === 'function') await runAnalysis(); } catch (e) { }
    const r2 = $('olRep'); if (r2) r2.innerHTML = repStrip();
  }
  /* ---------- paint ---------- */
  function draw() {
    const p = $('pOutlook'); if (!p || !p.classList.contains('active')) return;
    const keep = $('olSym') ? $('olSym').value : O.sym; O.sym = keep || O.sym;
    p.innerHTML = css() + `<div class="olWrap"><div class="olTop"><h2>Today’s Outlook</h2><button class="olB sm" id="olRef">↻ Refresh</button></div>${O.loaded ? frame1() + frame2() + frame3() + frame4() + frame5() + frame6() : '<div class="olN">Loading the morning reports…</div>'}
      <div class="olLegal">Prepared from delayed market data and published morning reports with fixed, rule-based formulas. Research information for discussion with your adviser — not investment advice, not a recommendation, and no outcome is guaranteed.</div></div>`;
  }
  const css = () => `<style>
  .olWrap{max-width:1100px;margin:0 auto}.olTop{display:flex;align-items:center;justify-content:space-between}.olTop h2{margin:6px 0;color:#14306e}
  .olF{position:relative;margin:14px 0;padding:14px 16px;background:linear-gradient(180deg,#fffdf6,#fff8e6);border:2px solid #D4AF37;border-radius:14px;box-shadow:0 8px 24px -14px rgba(138,109,31,.55)}
  .olF.dbl{border:3px double #D4AF37;outline:1px solid #E4C97A;outline-offset:3px;padding:18px 20px}
  .olF h3{margin:0 0 8px;font-size:14px;letter-spacing:.09em;color:#8A6D1F;border-bottom:1.6px solid #C7A03C;padding-bottom:6px}.olF h3 small{font-weight:600;letter-spacing:0;color:#52607f;margin-left:8px;font-size:11px}
  .olBias{font-size:14px;line-height:1.5;color:#14213d;margin:6px 0 10px}.olBias.sm{font-size:12.5px}
  .olTiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.olT{background:#fff;border:1px solid #ecd9a0;border-radius:10px;padding:8px 10px}.olT small{display:block;color:#8A6D1F;font-weight:700}.olT b{font-size:16px;display:block}
  .up{color:#12894b}.dn{color:#c11d3d}b.up,b.dn{font-weight:800}
  .olLv{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:10px 0}.olLv div{background:#fff;border:1px dashed #D4AF37;border-radius:10px;padding:6px 10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}.olLv small{font-weight:700;color:#14306e;min-width:70px}
  .olBl p{margin:4px 0;font-size:12.5px;line-height:1.45}.olAl{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.olAl span{background:#fff;border:1px solid #ecd9a0;border-radius:99px;padding:3px 10px;font-weight:600}
  .olGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:8px}.olC{background:#fff;border:1px solid #ecd9a0;border-radius:10px;padding:8px 10px}.olC h5{margin:0 0 4px;color:#8A6D1F;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em}
  .olR{display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:3px 0;border-top:1px solid #f3ead0}.olR:first-of-type{border-top:0}.olR i{font-style:normal;font-variant-numeric:tabular-nums}.olR u{text-decoration:none;font-weight:700;min-width:74px;text-align:right}
  .olNews{margin:4px 0 6px;padding-left:18px}.olNews li{margin:5px 0;line-height:1.4}.olNews em{color:#8A6D1F;font-style:normal;font-size:11px;border:1px solid #ecd9a0;border-radius:99px;padding:0 7px;margin-left:4px}
  .olH{margin:10px 0 4px;color:#14306e}.olScroll{overflow-x:auto}.olTb{border-collapse:collapse;width:100%;background:#fff}.olTb th{background:#f6ecc9;color:#6b5314;text-align:left;padding:5px 8px;font-size:11px}.olTb td{padding:5px 8px;border-top:1px solid #f0e6c4;vertical-align:top}
  .olN{padding:8px 10px;background:#fff;border:1px dashed #D4AF37;border-radius:8px;color:#52607f}.olSrc{margin-top:8px;font-size:11px;color:#6a7694}
  .olSel{display:flex;gap:12px;align-items:center;margin-bottom:8px}.olBtns{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .olB{cursor:pointer;border:1px solid #1f3a85;background:#fff;color:#0b1c45;border-radius:10px;padding:8px 14px;font-weight:800;font-size:13px}.olB.sm{padding:4px 10px;font-size:12px}
  .olB b{display:block;font-size:24px}.olB.buy{background:#e6f6ec;border-color:#12894b;color:#0a6b38}.olB.sell{background:#fdecef;border-color:#c11d3d;color:#9b1231}.olB.avoid{background:#f3f4f8;border-color:#7a859e;color:#46526e}.olB.go{background:#14306e;color:#fff}
  .olB:hover,.olX:hover{filter:brightness(.95)}.olX{cursor:pointer;border:1px solid #D4AF37;background:#fff8e6;border-radius:8px;padding:3px 8px;font-weight:700;color:#6b5314}
  .olSearch{display:flex;gap:8px;flex-wrap:wrap}.olSearch input{flex:1;min-width:200px;padding:8px 10px;border:1px solid #D4AF37;border-radius:8px;font-size:14px}.olSearch select{padding:8px;border:1px solid #D4AF37;border-radius:8px}
  .olStrip{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.olStrip button{cursor:pointer;border:1px solid #D4AF37;background:#fff;border-radius:8px;padding:6px 12px;font-weight:700}
  .olLegal{font-size:10.5px;color:#6a7694;margin:10px 0 24px}
  #olPop{position:fixed;inset:0;z-index:60;background:rgba(10,20,45,.55);display:none;align-items:center;justify-content:center;padding:14px}#olPop.on{display:flex}
  .olBox{background:#fffdf6;border:3px double #D4AF37;border-radius:14px;max-width:880px;width:100%;max-height:88vh;overflow:auto;padding:14px 16px}.olHd{display:flex;justify-content:space-between;align-items:center}.olHd h3{margin:0;color:#8A6D1F}.olHd small{color:#52607f}.olClose{cursor:pointer;border:0;background:#14306e;color:#fff;border-radius:8px;padding:4px 10px;font-size:14px}
  #olBack{position:fixed;left:12px;bottom:12px;z-index:40;display:none;background:#14306e;color:#fff;border:2px solid #D4AF37;border-radius:99px;padding:8px 16px;font-weight:800;cursor:pointer;box-shadow:0 8px 20px -8px rgba(0,0,0,.5)}
  @media(max-width:640px){.olBtns{grid-template-columns:1fr 1fr 1fr}.olB b{font-size:20px}.olF{padding:10px 11px}}
  </style>`;
  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target, c = (q) => t.closest && t.closest(q);
    if (c('#olBack')) { showTab('pOutlook'); return; }
    if (c('[data-close]') || t.id === 'olPop') { closePop(); return; }
    const k = c('#pOutlook [data-k]'); if (k) { popup(k.getAttribute('data-k')); return; }
    const x = c('#pOutlook [data-x], #olPop [data-x]'); if (x) { if (window.jcXray) { if ($('olPop')) closePop(); window.jcXray(x.getAttribute('data-x')); } return; }
    const tb = c('#pOutlook [data-tab]'); if (tb) { O.fromOutlook = true; showTab(tb.getAttribute('data-tab')); return; }
    if (c('#olGo')) { go(); return; }
    if (c('#olRef')) { O.loaded = false; O.busy = false; draw(); loadAll(); }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'olList') { O.listId = e.target.value; draw(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'olSym') go(); if (e.key === 'Escape') closePop(); });
  function init() {
    const sel = $('viewSel'), anchor = document.querySelector('details.datasec'); if (!sel || !anchor || $('pOutlook') || typeof showTab !== 'function') return false;
    const o = document.createElement('option'); o.value = 'pOutlook'; o.textContent = '🌅 Today’s Outlook (client)'; const g = sel.querySelector('optgroup'); (g || sel).insertBefore(o, g ? g.firstChild : sel.firstChild);
    const p = document.createElement('div'); p.className = 'panel'; p.id = 'pOutlook'; p.innerHTML = '<div class="note">Loading…</div>'; anchor.parentNode.insertBefore(p, anchor);
    const bk = document.createElement('button'); bk.id = 'olBack'; bk.textContent = '← Back to Today’s Outlook'; document.body.appendChild(bk);
    const orig = window.showTab; window.showTab = function (id) { orig(id); bk.style.display = O.fromOutlook && /^p(Summary|Intraday|Swing|Long)$/.test(id) ? 'block' : 'none'; if (id === 'pOutlook') { O.fromOutlook = false; draw(); if (!O.loaded) loadAll(); } };
    return true;
  }
  const t0 = setInterval(() => { if (init()) clearInterval(t0); }, 400);
  window.jcOutlook = { reload: () => { O.loaded = false; loadAll(); draw(); }, state: O };
})();
