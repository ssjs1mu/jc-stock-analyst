/* Master report — institutional 3-page A4 research note for ANY searched stock.
   Built only from data the six in-app reports already fetch (intraday, short term, long term, quick summary,
   X-ray inputs, deep-research inputs) plus corporate actions and peers fetched in the same progress run.
   Nothing is invented: a block with no data is shown as "not available" or left out.            */
(function () {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v) => (num(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  const f0 = (v) => (num(v) ? Math.round(v).toLocaleString('en-IN') : '—');
  const rs = (v) => (num(v) ? '₹' + f2(v) : '—');
  const pc = (v, d) => (num(v) ? (v >= 0 ? '+' : '') + v.toFixed(d == null ? 1 : d) + '%' : '—');
  const cr = (v) => (num(v) ? '₹' + Math.round(v / 1e7).toLocaleString('en-IN') + ' Cr' : '—');
  const strip = (x) => String(x == null ? '' : x).replace(/<[^>]*>/g, '');
  const tone = (t) => (t === 'bull' ? 'g' : t === 'bear' ? 'r' : 'a');
  const DISC = 'This report is for informational purposes only and does not constitute investment advice.';

  /* ---------- corporate actions + peers (called from engine.js feed pipeline) ---------- */
  async function fetchCorp(ySym, trace) {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ySym) + '?range=5y&interval=1mo&includePrePost=false&events=div%7Csplit';
    const j = await fetchData(url, { kind: 'json', trace, validate: (j) => !!(j && j.chart && j.chart.result && j.chart.result[0]) });
    const ev = j.chart.result[0].events || {}, cutoff = Date.now() - 3 * 365.25 * 864e5;
    const div = Object.values(ev.dividends || {}).map((d) => ({ ts: d.date * 1000, amt: d.amount })).filter((d) => d.ts >= cutoff).sort((a, b) => b.ts - a.ts);
    const spl = Object.values(ev.splits || {}).map((s) => ({ ts: s.date * 1000, num: s.numerator, den: s.denominator, txt: s.splitRatio })).filter((s) => s.ts >= cutoff).sort((a, b) => b.ts - a.ts);
    return { div, spl };
  }
  async function fetchPeers(ySym) {
    const suf = ySym.slice(ySym.lastIndexOf('.'));
    const j = await fetchData('https://query1.finance.yahoo.com/v6/finance/recommendationsbysymbol/' + encodeURIComponent(ySym), { kind: 'json', validate: (j) => !!(j && j.finance && j.finance.result) });
    const recs = ((j.finance.result[0] || {}).recommendedSymbols || []).map((x) => x.symbol).filter((s) => s && s.endsWith(suf) && s !== ySym).slice(0, 5);
    if (!recs.length) return null;
    const rows = await Promise.all(recs.map(async (s) => {
      try {
        const sm = await fetchSummary(s), r = (o) => (o && o.raw != null ? o.raw : null), p = sm.price || {}, d = sm.summaryDetail || {}, k = sm.defaultKeyStatistics || {}, fd = sm.financialData || {};
        return { sym: s.replace(/\.(NS|BO)$/, ''), name: p.shortName || p.longName || s, price: r(p.regularMarketPrice), mcap: r(p.marketCap), pe: r(d.trailingPE), pb: r(k.priceToBook), roe: r(fd.returnOnEquity), dy: r(d.dividendYield) };
      } catch (e) { return null; }
    }));
    const ok = rows.filter(Boolean);
    return ok.length ? ok : null;
  }

  /* ---------- SVG charts (inline, vector — stay sharp in the PDF) ---------- */
  const GOLD = '#D4AF37', NAVY = '#0f172a', GREEN = '#15803d', RED = '#b91c1c', SL = '#64748b';
  function chartLevels(R) {
    const L = [];
    const add = (label, v, c) => { if (num(v)) L.push({ label, v, c }); };
    add('52W high', R.w52H, RED); add('52W low', R.w52L, RED);
    const d = R.pivots && R.pivots.daily && R.pivots.daily.set, w = R.pivots && R.pivots.weekly && R.pivots.weekly.set;
    if (d) { add('Daily R2', d.R2, SL); add('Daily R1', d.R1, SL); add('Daily pivot', d.P, SL); add('Daily S1', d.S1, SL); add('Daily S2', d.S2, SL); }
    if (w) { add('Weekly R1', w.R1, SL); add('Weekly S1', w.S1, SL); }
    const sw = (R.matrix || []).find((m) => m.horizon === 'Swing');
    if (sw) sw.levels.forEach((l) => { if (num(l.n)) add(l.label, l.n, /Stop/.test(l.label) ? RED : GREEN); });
    add('CMP', R.cmp, GOLD);
    const seen = new Set(), rows = L.filter((x) => { const k = x.label + x.v.toFixed(2); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.v - a.v);
    if (rows.length < 3) return '';
    const lo = Math.min(...rows.map((r) => r.v)), hi = Math.max(...rows.map((r) => r.v)), rg = Math.max(1e-9, hi - lo), W = 340, rh = 15, H = rows.length * rh + 22, x0 = 92, bw = 170;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Key price levels"><text x="0" y="10" font-size="9.5" font-weight="800" fill="${NAVY}">KEY PRICE LEVELS (₹)</text>`;
    rows.forEach((r, i) => {
      const y = 18 + i * rh, w = 8 + ((r.v - lo) / rg) * (bw - 8), isC = r.label === 'CMP';
      s += `<text x="${x0 - 4}" y="${y + 9}" text-anchor="end" font-size="8" fill="#334155" ${isC ? 'font-weight="800"' : ''}>${E(r.label)}</text><rect x="${x0}" y="${y}" width="${w.toFixed(1)}" height="11" rx="2" fill="${r.c}" opacity="${isC ? 1 : 0.78}"/><text x="${x0 + w + 4}" y="${y + 9}" font-size="8" font-weight="700" fill="${r.c === SL ? '#334155' : r.c}">₹${f2(r.v)}</text>`;
    });
    return s + '</svg>';
  }
  function sma(a, n) { return a.map((_, i) => (i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n)); }
  function chartPrice(R) {
    const c = R.closes || []; if (c.length < 120) return '';
    const N = Math.min(c.length, 260), a = c.slice(-N), s50 = sma(c, 50).slice(-N), s200 = sma(c, 200).slice(-N);
    const vals = a.concat(s50.filter(num), s200.filter(num)), lo = Math.min(...vals), hi = Math.max(...vals), rg = Math.max(1e-9, hi - lo), W = 340, H = 150, px = 30, py = 14;
    const X = (i) => px + (i / (N - 1)) * (W - px - 4), Y = (v) => H - 14 - ((v - lo) / rg) * (H - 14 - py);
    const path = (arr) => { let d = '', pen = false; arr.forEach((v, i) => { if (!num(v)) return; d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); return d; };
    let g = ''; for (let k = 0; k <= 3; k++) { const v = lo + (rg * k) / 3, y = Y(v); g += `<line x1="${px}" x2="${W - 4}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width=".6"/><text x="${px - 3}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#64748b">${f0(v)}</text>`; }
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Price with 50 and 200 day averages"><text x="0" y="9" font-size="9.5" font-weight="800" fill="${NAVY}">PRICE · SMA 50 · SMA 200 (last ${N} sessions)</text>${g}<path d="${path(a)}" fill="none" stroke="${NAVY}" stroke-width="1.3"/><path d="${path(s50)}" fill="none" stroke="${GOLD}" stroke-width="1.1"/><path d="${path(s200)}" fill="none" stroke="${RED}" stroke-width="1.1" stroke-dasharray="3 2"/><text x="${px}" y="${H - 3}" font-size="7.5" fill="${NAVY}">— Price</text><text x="${px + 48}" y="${H - 3}" font-size="7.5" fill="#B8860B">— SMA 50</text><text x="${px + 100}" y="${H - 3}" font-size="7.5" fill="${RED}">-- SMA 200</text></svg>`;
  }
  function chartFin(R) {
    const T = (R.long && R.long.fin && R.long.fin.tables) || [], rev = T.find((t) => t.key === 'annualTotalRevenue'), ni = T.find((t) => t.key === 'annualNetIncome');
    if (!rev && !ni) return '';
    const base = rev || ni, yrs = base.rows.map((r) => r.date.slice(0, 4)), get = (t, y) => { const r = t && t.rows.find((x) => x.date.slice(0, 4) === y); return r ? r.val : null; };
    const A = yrs.map((y) => get(rev, y)), B = yrs.map((y) => get(ni, y)), mx = Math.max(1, ...A.filter(num), ...B.filter(num)), W = 340, H = 140, bw = 20, gap = (W - 20) / yrs.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Annual revenue and net income"><text x="0" y="9" font-size="9.5" font-weight="800" fill="${NAVY}">ANNUAL REVENUE &amp; NET INCOME (₹ Cr)</text>`;
    yrs.forEach((y, i) => {
      const x = 10 + i * gap + gap / 2 - bw;
      [[A[i], NAVY, 0], [B[i], GOLD, bw]].forEach(([v, c, off]) => { if (!num(v)) return; const h = Math.max(1, (Math.max(0, v) / mx) * (H - 44)), yy = H - 18 - h; s += `<rect x="${x + off}" y="${yy.toFixed(1)}" width="${bw - 2}" height="${h.toFixed(1)}" fill="${c}"/><text x="${x + off + (bw - 2) / 2}" y="${(yy - 2).toFixed(1)}" text-anchor="middle" font-size="7" fill="#334155">${f0(v / 1e7)}</text>`; });
      s += `<text x="${x + bw}" y="${H - 7}" text-anchor="middle" font-size="8" fill="#334155">FY${E(y.slice(2))}</text>`;
    });
    return s + `<rect x="${W - 90}" y="2" width="8" height="8" fill="${NAVY}"/><text x="${W - 79}" y="9" font-size="8" fill="#334155">Revenue</text><rect x="${W - 44}" y="2" width="8" height="8" fill="${GOLD}"/><text x="${W - 33}" y="9" font-size="8" fill="#334155">PAT</text></svg>`;
  }
  function chartTargets(R) {
    const rows = [];
    (R.matrix || []).forEach((m) => {
      const t1 = m.levels.find((l) => /^Target( 1)?( ·|$)/.test(l.label)), st = m.levels.find((l) => /^(Stop|Risk line|Hard floor)/.test(l.label));
      if (t1 && num(t1.n) && num(R.cmp)) rows.push({ h: m.horizon, t: (t1.n / R.cmp - 1) * 100, s: st && num(st.n) ? (st.n / R.cmp - 1) * 100 : null });
    });
    if (!rows.length) return '';
    const mx = Math.max(5, ...rows.map((r) => Math.abs(r.t)), ...rows.map((r) => Math.abs(r.s || 0))), W = 340, rh = 22, H = rows.length * rh + 22, mid = 150, sc = 110 / mx;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Distance to target and stop by horizon"><text x="0" y="10" font-size="9.5" font-weight="800" fill="${NAVY}">% TO TARGET 1 vs % TO STOP — BY HORIZON</text><line x1="${mid}" x2="${mid}" y1="14" y2="${H}" stroke="#94a3b8" stroke-width=".7"/>`;
    rows.forEach((r, i) => {
      const y = 18 + i * rh, tw = Math.abs(r.t) * sc;
      s += `<text x="4" y="${y + 9}" font-size="8" fill="#334155">${E(r.h)}</text><rect x="${r.t >= 0 ? mid : mid - tw}" y="${y}" width="${tw.toFixed(1)}" height="8" fill="${GREEN}"/><text x="${(r.t >= 0 ? mid + tw + 3 : mid - tw - 3).toFixed(1)}" y="${y + 7}" text-anchor="${r.t >= 0 ? 'start' : 'end'}" font-size="7.5" font-weight="700" fill="${GREEN}">${pc(r.t)}</text>`;
      if (num(r.s)) { const sw = Math.abs(r.s) * sc; s += `<rect x="${r.s >= 0 ? mid : mid - sw}" y="${y + 9}" width="${sw.toFixed(1)}" height="6" fill="${RED}" opacity=".8"/><text x="${(r.s >= 0 ? mid + sw + 3 : mid - sw - 3).toFixed(1)}" y="${y + 15}" text-anchor="${r.s >= 0 ? 'start' : 'end'}" font-size="7" fill="${RED}">${pc(r.s)}</text>`; }
    });
    return s + '</svg>';
  }

  /* ---------- helpers that read the report object ---------- */
  const F = (R, re) => ((R.long && R.long.F) || []).find((x) => re.test(x.name));
  const Fv = (R, re) => { const x = F(R, re); return x && strip(x.value) !== '—' ? strip(x.value) : null; };
  const lvl = (m, re) => (m ? m.levels.find((l) => re.test(l.label)) : null);
  const cell = (l) => (l ? `<b>${E(l.v)}</b>${l.sub ? `<small>${E(l.sub)}</small>` : ''}` : '<span class="mut">—</span>');
  const tbl = (head, rows, cls, widths) => `<table class="${cls || 'grid'}">${widths ? '<colgroup>' + widths.map((w) => `<col style="width:${w}">`).join('') + '</colgroup>' : ''}<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const kv = (rows) => '<table class="kv"><tbody>' + rows.map((r) => '<tr>' + r.map((c, i) => `<td class="${i % 2 === 0 ? 'k' : ''}">${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
  const panel = (title, body, st) => `<section class="panel"${st ? ` style="${st}"` : ''}><h2>${title}</h2>${body}</section>`;
  const note = (t) => `<div class="note">${t}</div>`;
  const stepFor = (p) => (p < 100 ? 2.5 : p < 250 ? 5 : p < 500 ? 10 : p < 1000 ? 20 : p < 2500 ? 50 : p < 5000 ? 100 : 200);

  function moodOf(R) {
    const m = R.matrix || [], pick = m.find((x) => x.horizon === 'Swing') || m[0] || {};
    return pick.tone === 'bull' ? { name: 'BULLISH LEAN', c: '#15803d' } : pick.tone === 'bear' ? { name: 'CAUTIOUS LEAN', c: '#be123c' } : { name: 'BALANCED / WAIT', c: '#1d4ed8' };
  }

  function thesis(R) {
    const L = R.long || {}, m = R.matrix || [], sw = m.find((x) => x.horizon === 'Swing'), lt = m.find((x) => x.horizon === 'Long term');
    const parts = [];
    parts.push(`<b>${E(R.name)}</b> (${E(R.sym)}, ${R.exch === 'BO' ? 'BSE' : 'NSE'}${R.sector ? ' · ' + E(R.sector) : ''}${R.industry ? ' · ' + E(R.industry) : ''}) last closed at <b>${rs(R.cmp)}</b> (${pc(R.dayPct, 2)} on the day), ${num(R.w52H) && num(R.w52L) ? `${pc((R.cmp / R.w52H - 1) * 100)} from its 52-week high of ${rs(R.w52H)} and ${pc((R.cmp / R.w52L - 1) * 100)} above the low of ${rs(R.w52L)}` : ''}.`);
    if (R.ret) parts.push(`Returns: 1M ${pc(R.ret.m1)}, 3M ${pc(R.ret.m3)}, 6M ${pc(R.ret.m6)}, 1Y ${pc(R.ret.y1)}${num(R.benchRet && R.benchRet.y1) ? ` against Nifty 50 at ${pc(R.benchRet.y1)} over 1Y` : ''}.`);
    if (sw && sw.call && !/INCOMPLETE|n\/a/i.test(sw.call)) parts.push(`The short-term (swing) read is <b>${E(sw.call)}</b>${sw.conf && sw.conf !== '—' ? ` (confidence ${E(sw.conf)})` : ''}: ${E(strip(sw.basis))}`);
    if (lt && lt.call && !/INCOMPLETE|n\/a/i.test(lt.call)) parts.push(`On the long-term view, results and fundamentals currently point to <b>${E(lt.call)}</b>${lt.conf && lt.conf !== '—' ? ` (confidence ${E(lt.conf)})` : ''}: ${E(strip(lt.basis))}`);
    else parts.push('Long-term call is withheld because the results / fundamentals feed was incomplete for this symbol — no call is issued from the chart alone.');
    const ne = R.nextEarnings || (R.resultInfo && R.resultInfo.next);
    if (ne && num(ne.days) && ne.days >= 0) parts.push(`<b>Result due in ${ne.days} day${ne.days === 1 ? '' : 's'}</b>${R.resultInfo && num(R.resultInfo.expMove) ? ` — the model-implied move around the number is about ±${R.resultInfo.expMove.toFixed(1)}% (${E(R.resultInfo.basis || '')}). A daily-close stop does not protect against a result-day gap, so position size should reflect it.` : '.'}`);
    return parts.map((p) => `<p>${p}</p>`).join('');
  }

  function matrixTable(R) {
    const rows = (R.matrix || []).map((m) => {
      const ent = lvl(m, /^(Entry|Buy zone|Accumulate)/), stp = lvl(m, /^(Stop|Risk line)/) || lvl(m, /^Hard floor/), t1 = lvl(m, /^Target( 1)?( ·|$)/), t2 = lvl(m, /^Target 2/);
      return [`<b>${E(m.horizon)}</b><small>${E(m.sub)}</small>`, `<span class="cb ${tone(m.tone)}">${E(m.call)}</span><small>${E(m.conf && m.conf !== '—' ? 'conf. ' + m.conf : '')}</small>`, cell(ent), `<span class="r">${cell(stp)}</span>`, `<span class="g">${cell(t1)}</span>`, `<span class="g">${cell(t2)}</span>`, `<span class="mut">${E(strip(m.basis)).slice(0, 150)}</span>`];
    });
    return tbl(['Horizon', 'Call', 'Entry', 'Stop / risk', 'Target 1', 'Target 2', 'Basis'], rows, 'grid', ['12%', '12%', '15%', '12%', '15%', '14%', '20%']);
  }
  function pivotTable(R) {
    const P = R.pivots || {}, cols = ['daily', 'weekly', 'monthly'].filter((k) => P[k] && P[k].set), keys = ['R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3'];
    if (!cols.length) return '';
    return tbl(['Level'].concat(cols.map((k) => k[0].toUpperCase() + k.slice(1))), keys.map((k) => [`<b>${k === 'P' ? 'Pivot' : k}</b>`].concat(cols.map((c) => `<span class="${/^R/.test(k) ? 'r' : /^S/.test(k) ? 'g' : ''}">${f2(P[c].set[k])}</span>`))), 'grid num');
  }
  function fibTable(R) {
    const fb = R.fib && R.fib.s60; if (!fb) return '';
    return tbl(['Fib (60D swing)', 'Level', 'vs CMP'], fb.levels.map((l) => [(l.pct * 100).toFixed(1) + '%', f2(l.level), `<span class="${l.level >= R.cmp ? 'g' : 'r'}">${pc((l.level / R.cmp - 1) * 100)}</span>`]), 'grid num');
  }
  function maTable(R) {
    const rows = (R.swing && R.swing.maRows) || [];
    return rows.length ? tbl(['Average', 'Value', 'vs CMP', 'Price'], rows.map((m) => [m.name, f2(m.val), pc((m.val / R.cmp - 1) * 100), `<span class="${R.cmp > m.val ? 'g' : 'r'}">${R.cmp > m.val ? 'Above' : 'Below'}</span>`]), 'grid num') : '';
  }
  function signalTable(rows, max) {
    return rows && rows.length ? tbl(['Indicator', 'Reading', 'Signal'], rows.slice(0, max).map((r) => [E(r.name), E(strip(r.reading)), r.v > 0 ? '<span class="g">Bullish</span>' : r.v < 0 ? '<span class="r">Bearish</span>' : '<span class="a">Neutral</span>']), 'grid') : '';
  }
  function returnsTable(R) {
    const r = R.ret || {}, b = R.benchRet || {}, row = (l, s, n) => [l, `<span class="${s >= 0 ? 'g' : 'r'}">${pc(s)}</span>`, num(n) ? pc(n) : '—', num(s) && num(n) ? `<span class="${s - n >= 0 ? 'g' : 'r'}">${pc(s - n)}</span>` : '—'];
    return tbl(['Period', 'Stock', 'Nifty 50', 'Alpha'], [row('1 week', r.w1, b.w1), row('1 month', r.m1, b.m1), row('3 months', r.m3, b.m3), row('6 months', r.m6, b.m6), row('1 year', r.y1, b.y1), ['3 yrs', pc(r.y3), '—', num(r.cagr3) ? 'CAGR ' + pc(r.cagr3) : '—'], ['5 yrs', pc(r.y5), '—', num(r.cagr5) ? 'CAGR ' + pc(r.cagr5) : '—']], 'grid num');
  }
  function quarterTable(R) {
    const qi = (R.long && R.long.res && R.long.res.info && R.long.res.info.quarters) || [];
    if (!qi.length) return '';
    const m = (v) => (num(v) ? f0(v / 1e7) : '—'), h = ['₹ Cr'].concat(qi.map((q) => q.date.slice(0, 7)));
    return tbl(h, [['Revenue'].concat(qi.map((q) => m(q.rev))), ['Op. income'].concat(qi.map((q) => m(q.opi))), ['Net profit'].concat(qi.map((q) => m(q.ni))), ['Net margin'].concat(qi.map((q) => (num(q.rev) && num(q.ni) && q.rev > 0 ? ((q.ni / q.rev) * 100).toFixed(1) + '%' : '—'))), ['EPS ₹'].concat(qi.map((q) => (num(q.eps) ? f2(q.eps) : '—')))], 'grid num');
  }
  function annualTable(R) {
    const T = (R.long && R.long.fin && R.long.fin.tables) || [];
    if (!T.length) return '';
    const nm = { annualTotalRevenue: 'Revenue', annualNetIncome: 'Net income', annualDilutedEPS: 'Diluted EPS ₹', annualOperatingCashFlow: 'Op. cash flow', annualFreeCashFlow: 'Free cash flow', annualTotalDebt: 'Total debt', annualStockholdersEquity: 'Equity' };
    return tbl(['₹ Cr'].concat(T[0].rows.map((r) => 'FY' + r.date.slice(2, 4))), T.map((t) => [nm[t.key] || t.key].concat(t.rows.map((r) => (t.key === 'annualDilutedEPS' ? f2(r.val) : f0(r.val / 1e7))))), 'grid num');
  }
  function fundTable(R) {
    const rows = ((R.long && R.long.F) || []).filter((x) => strip(x.value) !== '—' && x.group !== 'Recent results');
    if (!rows.length) return '';
    const cellsOf = (x) => (x ? [E(x.name), `<b>${E(strip(x.value))}</b>`, `<span class="${x.v > 0 ? 'g' : x.v < 0 ? 'r' : ''}">${E(strip(x.reading)).slice(0, 60)}</span>`] : ['', '', '']);
    const h = Math.ceil(rows.length / 2), out = [];
    for (let i = 0; i < h; i++) out.push(cellsOf(rows[i]).concat(cellsOf(rows[i + h])));
    return tbl(['Metric', 'Value', 'Reading', 'Metric', 'Value', 'Reading'], out, 'grid', ['16%', '9%', '25%', '16%', '9%', '25%']);
  }
  function playbook(R) {
    const sw = (R.matrix || []).find((m) => m.horizon === 'Swing'), idm = (R.matrix || []).find((m) => m.horizon === 'Intraday');
    const rows = [];
    const addPlan = (m, tag) => {
      if (!m || !m.levels.length) return;
      const ent = lvl(m, /^(Entry|Buy zone|Accumulate)/), stp = lvl(m, /^(Stop|Risk line)/), t1 = lvl(m, /^Target( 1)?( ·|$)/), t2 = lvl(m, /^Target 2/);
      const e = ent && ent.n != null ? ent.n : null, s = stp && stp.n, a = t1 && t1.n, b = t2 && t2.n;
      let rr = '';
      const mid = e != null ? e : R.cmp;
      if (num(s) && num(mid) && mid > s) { const risk = mid - s; rr = [a, b].filter(num).map((t, i) => `T${i + 1} 1 : ${((t - mid) / risk).toFixed(1)}`).join(' · '); }
      rows.push([`<b>${tag}</b><small>${E(m.call)}</small>`, cell(ent), `<span class="r">${cell(stp)}</span>`, `<span class="g">${cell(t1)}</span>`, `<span class="g">${cell(t2)}</span>`, E(rr) || '—', E(m.review || '')]);
    };
    addPlan(idm, 'Intraday'); addPlan(sw, 'Swing');
    return rows.length ? tbl(['Plan', 'Entry zone', 'Stop (daily close for swing)', 'Target 1', 'Target 2', 'Reward : risk', 'Review'], rows, 'grid', ['10%', '16%', '15%', '15%', '15%', '14%', '15%']) : note('Intraday / swing levels are not available for this symbol right now (feed incomplete) — no plan is issued.');
  }
  function optionsTable(R) {
    const sw = (R.matrix || []).find((m) => m.horizon === 'Swing'), st = stepFor(R.cmp), rd = (v) => Math.round(v / st) * st;
    const t1 = sw && lvl(sw, /^Target( 1)?( ·|$)/), t2 = sw && lvl(sw, /^Target 2/), sl = sw && lvl(sw, /^Stop/);
    if (!t1 || !num(t1.n)) return '';
    const atm = rd(R.cmp), up = rd(t2 && num(t2.n) ? t2.n : t1.n), dn = sl && num(sl.n) ? rd(sl.n) : null, dn2 = dn ? dn - st * 2 : null;
    const rows = [
      ['<b>Bull call spread</b>', `Buy ${atm} CE / Sell ${up} CE`, 'Swing long toward targets', `Risk = net debit; profit capped at ₹${f0(up - atm)} less debit`],
    ];
    if (dn) rows.push(['<b>Bull put spread</b>', `Sell ${dn} PE / Buy ${dn2} PE`, 'Income while the stop level holds', `Profit = credit; max loss ₹${f0(dn - dn2)} less credit`]);
    if (dn) rows.push(['<b>Protective collar</b> <span class="mut">(holders)</span>', `Buy ${dn} PE / Sell ${up} CE`, 'Hedge an existing holding', 'Low net cost; floor below the put, cap above the call']);
    return tbl(['Strategy', 'Indicative structure', 'Use-case', 'Risk / reward'], rows, 'grid', ['20%', '28%', '24%', '28%']) + note('Strikes are rounded from this report’s levels and are indicative only. Confirm the stock is in F&amp;O, and check lot size, listed strikes, expiry, premium and implied volatility on the live option chain before any order. Avoid buying premium into a result date.');
  }
  function corpTable(R) {
    const C = R.extra && R.extra.corp; if (!C) return note('Corporate-action history (dividends / splits / bonus) could not be retrieved for this symbol right now.');
    const d = (t) => new Date(t + 19800000).toISOString().slice(0, 10).split('-').reverse().join('-');
    const rows = [];
    C.spl.forEach((s) => rows.push([d(s.ts), '<span class="mut">n/a</span>', s.num > s.den ? 'Split / bonus (share-count increase)' : 'Reverse split / consolidation', E(s.txt || s.num + ' : ' + s.den)]));
    C.div.forEach((x) => rows.push([d(x.ts), '<span class="mut">n/a</span>', 'Dividend', '₹' + f2(x.amt) + ' / share']));
    rows.sort((a, b) => (a[0].split('-').reverse().join('') < b[0].split('-').reverse().join('') ? 1 : -1));
    const tot = C.div.reduce((a, x) => a + x.amt, 0);
    return (rows.length ? tbl(['Ex-date', 'Record date', 'Action', 'Detail / ratio'], rows, 'grid', ['16%', '16%', '34%', '34%']) : note('No dividend, split or bonus recorded in the last 3 years.')) + note(`Window: last 3 years. ${C.div.length ? `Dividends: ${C.div.length}, total ₹${f2(tot)} / share. ` : ''}${C.spl.length ? '' : 'No split or bonus issue recorded. '}Record dates are not published in the price feed — confirm on the exchange announcement. A bonus issue appears in the feed as a share-count split (e.g. 1 : 1 bonus = 2-for-1).`);
  }
  function peerTable(R) {
    const P = R.extra && R.extra.peers;
    const me = { sym: R.sym, name: R.name, mcap: R.mcap, pe: num(parseFloat(Fv(R, /^P\/E \(trailing\)/))) ? parseFloat(Fv(R, /^P\/E \(trailing\)/)) : null, pb: parseFloat(Fv(R, /^P\/B/)), roe: null, dy: null, me: true };
    if (!P) return note('Peer comparison is not available for this symbol (no peer list returned).');
    const all = [me].concat(P), pes = P.map((x) => x.pe).filter(num).sort((a, b) => a - b), med = pes.length ? pes[Math.floor(pes.length / 2)] : null;
    const rows = all.map((x) => [x.me ? `<b>${E(x.sym)}</b>` : E(x.sym), `<span class="mut">${E(String(x.name).slice(0, 28))}</span>`, num(x.mcap) ? cr(x.mcap) : '—', num(x.pe) ? x.pe.toFixed(1) + 'x' : '—', num(x.pb) ? x.pb.toFixed(1) + 'x' : '—', num(x.roe) ? (x.roe * 100).toFixed(1) + '%' : '—']);
    return tbl(['Symbol', 'Company', 'Mkt cap', 'P/E (TTM)', 'P/B', 'ROE'], rows, 'grid num') + note(med && num(me.pe) ? `Peer median P/E ${med.toFixed(1)}x — ${E(R.sym)} trades at ${pc((me.pe / med - 1) * 100)} versus the peer median. Peers are the nearest similar names returned for this stock, not a curated sector list.` : 'Peers are the nearest similar names returned for this stock, not a curated sector list.');
  }
  function riskTable(R) {
    const rows = [], sw = (R.matrix || []).find((m) => m.horizon === 'Swing'), stp = sw && lvl(sw, /^Stop/);
    const ne = R.nextEarnings; if (ne && num(ne.days) && ne.days >= 0 && ne.days <= 20) rows.push([`Result event in ${ne.days} day${ne.days === 1 ? '' : 's'}`, '<span class="r"><b>High</b></span>', '<span class="r"><b>High</b></span>', R.resultInfo && num(R.resultInfo.expMove) ? `Model-implied move ±${R.resultInfo.expMove.toFixed(1)}%; wait for the reaction candle` : 'Gap risk through a daily-close stop']);
    const pe = parseFloat(Fv(R, /^P\/E \(trailing\)/)); if (num(pe)) rows.push([`Valuation (P/E ${pe.toFixed(1)}x)`, pe > 40 ? 'High' : pe > 25 ? 'Medium' : 'Low', pe > 40 ? '<b>High</b>' : 'Medium', 'De-rating risk if growth slows; compare with peers']);
    const de = Fv(R, /^Debt \/ Equity/); if (de) rows.push([`Leverage (${E(de)})`, 'Medium', 'Medium', 'Track interest cover and refinancing']);
    const s200 = ((R.swing && R.swing.maRows) || []).find((m) => m.name === 'SMA 200'); if (s200 && num(s200.val)) rows.push([`Trend: price ${R.cmp > s200.val ? 'above' : 'below'} the 200-day average (${f2(s200.val)})`, R.cmp > s200.val ? 'Low' : '<b>High</b>', 'Medium', R.cmp > s200.val ? 'A close below it would weaken the structure' : 'Counter-trend longs need tighter risk']);
    if (stp && num(stp.n)) rows.push([`Stop distance ${pc((stp.n / R.cmp - 1) * 100)}`, 'Medium', 'Medium', 'Size so that a stop-out stays within the client’s risk budget']);
    if (num(R.avgVol) && num(R.vol)) rows.push([`Liquidity (today ${f0(R.vol)} vs avg ${f0(R.avgVol)})`, R.avgVol < 2e5 ? 'High' : 'Low', 'Medium', 'Use limit orders; avoid oversized positions in thin stocks']);
    if (R.delivM && R.delivM.today && num(R.delivM.today.pct)) rows.push([`Delivery share (${R.delivM.today.kind}) ${R.delivM.today.pct.toFixed(0)}%`, 'Low', 'Low', 'Low delivery on a rally suggests intraday-driven moves']);
    rows.push(['Market / sector shock', 'Medium', 'Medium', 'Watch Nifty and India VIX; index sell-offs hit most stocks together']);
    return tbl(['Risk', 'Likelihood', 'Impact', 'Monitor / mitigant'], rows, 'grid', ['36%', '11%', '11%', '42%']);
  }
  function sizing(R) {
    const sw = (R.matrix || []).find((m) => m.horizon === 'Swing'), stp = sw && lvl(sw, /^Stop/), ent = sw && lvl(sw, /^(Entry|Buy zone|Accumulate)/);
    const sTxt = stp ? `stop ${E(stp.v)}` : 'the stop in the swing plan';
    return tbl(['Profile', 'Position size', 'Deployment', 'Risk control', 'Horizon'], [
      ['<b>Conservative</b>', '<b>4 – 5%</b>', `Three tranches: after the next result is absorbed, on dips toward support, and on a confirmed close above Target 1`, 'Review at the long-term risk line; optional collar', '3–5 yrs'],
      ['<b>Balanced</b>', '<b>6 – 8%</b>', `Half now${ent ? ' in the entry zone (' + E(ent.v) + ')' : ''}, a quarter on a retest, a quarter on a breakout`, `Swing sleeve: ${sTxt} (daily close)`, '1–3 yrs'],
      ['<b>Tactical Alpha</b>', '<b>8 – 10%</b>', 'Two tranches per the swing ticket; optional bull-call-spread overlay', 'Hard stop; no averaging down', '2–8 wks'],
    ], 'grid', ['14%', '11%', '39%', '28%', '8%']) + note('Bands are caps, not targets. Respect each client’s concentration limits in the stock’s sector.');
  }
  function verdict(R) {
    const m = R.matrix || [], pick = m.find((x) => x.horizon === 'Swing') || m[0] || {}, lt = m.find((x) => x.horizon === 'Long term');
    const sw = pick, stp = lvl(sw, /^Stop/), t1 = lvl(sw, /^Target( 1)?( ·|$)/), ent = lvl(sw, /^(Entry|Buy zone|Accumulate)/);
    const head = sw.call && !/INCOMPLETE|n\/a/i.test(sw.call) ? sw.call : 'WAIT — INCOMPLETE DATA';
    const k = (a, b, c) => `<div><b style="color:${c}">${a}</b>${b}</div>`;
    return `<div class="big">${E(head)}${lt && lt.call && !/INCOMPLETE|n\/a/i.test(lt.call) ? ' · LONG TERM: ' + E(lt.call) : ''}</div><div class="k">${k(ent ? E(ent.v) : '—', 'Entry zone', '#f8e7a1')}${k(stp ? E(stp.v) : '—', 'Stop (daily close)', '#fca5a5')}${k(t1 ? E(t1.v) : '—', 'Target 1', '#86efac')}${k(rs(R.cmp), 'CMP', '#e2e8f0')}</div><p>${E(strip(sw.basis || ''))} ${R.resultInfo && R.nextEarnings && R.nextEarnings.days >= 0 && R.nextEarnings.days <= 15 ? 'A result is due shortly, so staging entries after the reaction is read is the more conservative route. ' : ''}Levels are rule-based reference zones from price, volume and results data — they may fail, and a close beyond the stop invalidates the view.</p><div class="disc">${DISC} For information only. Not investment advice. Markets carry risk.</div>`;
  }

  /* ---------- the document ---------- */
  function logoUrl() { try { return new URL('assets/jc-logo-3d.png', location.href).href; } catch (e) { return 'assets/jc-logo-3d.png'; } }
  function monogram(sym) {
    const t = E(String(sym).replace(/[^A-Z0-9&-]/gi, '').slice(0, 6).toUpperCase());
    return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e293b"/><stop offset="1" stop-color="#020617"/></linearGradient></defs><circle cx="60" cy="60" r="56" fill="url(#mg)" stroke="#D4AF37" stroke-width="3"/><circle cx="60" cy="60" r="48" fill="none" stroke="#D4AF37" stroke-width=".8" opacity=".7"/><text x="60" y="${t.length > 4 ? 66 : 70}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="${t.length > 5 ? 19 : t.length > 4 ? 22 : t.length > 3 ? 26 : 32}" fill="#f8e7a1" letter-spacing="1">${t}</text><text x="60" y="88" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="600" font-size="8" fill="#D4AF37" letter-spacing="2">${R_EX}</text></svg>`;
  }
  let R_EX = 'NSE';
  const CSS = `@page{size:A4;margin:0}*{box-sizing:border-box;margin:0;padding:0}html,body{background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Inter,'Segoe UI','Liberation Sans',Arial,sans-serif;color:#1e293b;line-height:1.28;--fs:6.6pt}
.page{width:210mm;height:297mm;padding:6mm 8mm 9mm;background:#f1f5f9;position:relative;overflow:hidden;display:flex;flex-direction:column;gap:1.7mm;page-break-after:always;break-after:page;font-size:var(--fs)}.page:last-child{page-break-after:auto;break-after:auto}
.wm{position:absolute;left:8mm;right:8mm;top:50%;transform:translateY(-50%);opacity:.045;pointer-events:none;z-index:50}.wm img{width:100%;display:block}
.hdr{background:rgba(15,23,42,.95);border:1.3px solid #D4AF37;border-radius:3mm;padding:2.4mm 4mm 0;text-align:center;color:#e2e8f0}
.brand{font-family:'Brush Script MT','Brush Script Std','Kaushan Script','Segoe Script',cursive;font-style:italic;color:#D4AF37;font-size:26pt;line-height:1}
.sub{font-size:6.2pt;letter-spacing:1.6px;text-transform:uppercase;color:#cbd5e1;margin-top:.7mm}.logo{width:14mm;height:14mm;margin:1.4mm auto 1.2mm}.logo svg{width:100%;height:100%;display:block}
.mood{display:inline-block;margin-left:6px;padding:.4mm 2mm;border-radius:2mm;font-size:5.8pt;font-weight:800;letter-spacing:1px;color:#fff;vertical-align:middle}
.meta{display:flex;flex-wrap:wrap;border-top:1px solid rgba(212,175,55,.55);margin:0 -4mm}.meta div{flex:1 1 14%;padding:1.2mm 1mm;font-size:6pt;border-right:1px solid rgba(212,175,55,.25)}.meta div:last-child{border-right:0}.meta b{display:block;color:#D4AF37;font-size:5.4pt;letter-spacing:1px;text-transform:uppercase;font-weight:600}.meta span{color:#f8fafc;font-weight:600}
.runhdr{background:rgba(15,23,42,.95);border:1.1px solid #D4AF37;border-radius:2.4mm;padding:1.3mm 4mm;display:flex;justify-content:space-between;align-items:center;color:#e2e8f0;font-size:6.2pt}.runhdr .rb{font-family:'Brush Script MT','Kaushan Script',cursive;font-style:italic;color:#D4AF37;font-size:13pt;line-height:1}.runhdr .rt{letter-spacing:1.3px;text-transform:uppercase}.runhdr .rp{color:#D4AF37}
.panel{background:#fff;border:1px solid #e2e8f0;border-radius:2.2mm;padding:1.5mm 2.3mm;position:relative}.panel>h2{font-size:7.6pt;font-weight:700;color:#0f172a;letter-spacing:.3px;text-transform:uppercase;padding-bottom:.8mm;margin-bottom:1mm;border-bottom:1.2px solid #D4AF37}.panel>h2 span{color:#B8860B}
p,li{text-align:justify;hyphens:auto;-webkit-hyphens:auto}p{margin-bottom:1mm}p:last-child{margin-bottom:0}ul{padding-left:3.2mm}li{margin-bottom:.4mm}
.row{display:flex;gap:1.8mm;align-items:stretch}.col{min-width:0}.stack>*+*{margin-top:1.1mm}
table{border-collapse:collapse;width:100%;table-layout:auto}table.grid th{background:#0f172a;color:#D4AF37;font-weight:600;font-size:.92em;text-transform:uppercase;letter-spacing:.4px;padding:.6mm 1mm;text-align:left;border:1px solid #0f172a}table.grid td{padding:.5mm 1mm;border:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere}table.grid tbody tr:nth-child(even) td{background:#f8fafc}table.num td:not(:first-child){text-align:right}table.num th:not(:first-child){text-align:right}
table.kv td{padding:.5mm 1mm;border:1px solid #e2e8f0;vertical-align:top}table.kv td.k{background:#f8fafc;color:#475569;font-weight:600;width:19%}
small{display:block;color:#64748b;font-size:.88em;font-weight:400}.g{color:#15803d;font-weight:600}.r{color:#b91c1c;font-weight:600}.a{color:#a16207;font-weight:600}.mut{color:#64748b;font-weight:400}
.cb{display:inline-block;padding:.2mm 1.4mm;border-radius:1.2mm;font-weight:800;font-size:.9em;border:1px solid currentColor}
.note{font-size:.86em;color:#64748b;margin-top:.8mm;text-align:justify}svg{display:block}
.verdict{background:rgba(15,23,42,.96);border:1.4px solid #D4AF37;border-radius:2.4mm;color:#e2e8f0;padding:2mm 3mm}.verdict h2{color:#D4AF37;font-size:8pt;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid rgba(212,175,55,.6);padding-bottom:.8mm;margin-bottom:1.2mm}.verdict .big{font-size:10pt;font-weight:800;color:#f8e7a1;margin-bottom:.8mm}.verdict .k{display:flex;gap:1.6mm;margin:1mm 0}.verdict .k div{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(212,175,55,.4);border-radius:1.4mm;padding:.8mm 1.4mm;text-align:center;font-size:.95em}.verdict .k b{display:block;font-size:1.25em}.verdict .disc{font-size:.92em;color:#94a3b8;margin-top:1mm}
.pf{position:absolute;bottom:3mm;left:8mm;right:8mm;font-size:5.4pt;color:#64748b;display:flex;justify-content:space-between;z-index:5}`;

  function pageHdr(n, R) { return `<div class="runhdr"><span class="rb">Joshi's Corner</span><span class="rt">${E(R.sym)} · ${R_EX} · Private Client Research</span><span class="rp">Page ${n} of 3</span></div>`; }
  const pfoot = (n) => `<div class="pf"><span>Joshi's Corner · SSJ Finance · Private Client Research</span><span>Page ${n} of 3</span></div>`;

  function build(R) {
    R_EX = R.exch === 'BO' ? 'BSE' : 'NSE';
    const ml = moodOf(R), wm = `<div class="wm"><img src="${logoUrl()}" alt=""></div>`, now = new Date(Date.now() + 19800000).toISOString().slice(0, 16).replace('T', ' ');
    const pe = Fv(R, /^P\/E \(trailing\)/), pb = Fv(R, /^P\/B/), dy = Fv(R, /^Dividend yield/), de = Fv(R, /^Debt \/ Equity/), roe = Fv(R, /^ROE/), prom = Fv(R, /^Promoter/), mt = Fv(R, /^Mean target/);
    const ne = R.nextEarnings, dpr = R.dpr && typeof R.dpr === 'object' ? R.dpr : null;
    const snap = kv([
      ['CMP (last close)', `<b>${rs(R.cmp)}</b> <span class="${R.dayPct >= 0 ? 'g' : 'r'}">${pc(R.dayPct, 2)}</span>`, 'Previous close', rs(R.prevClose)],
      ['Day range', `${rs(R.dayL)} – ${rs(R.dayH)}`, '52-week range', `${rs(R.w52L)} – ${rs(R.w52H)}`],
      ['vs 52W high / low', `<span class="r">${pc((R.cmp / R.w52H - 1) * 100)}</span> / <span class="g">${pc((R.cmp / R.w52L - 1) * 100)}</span>`, 'Volume (avg)', `${f0(R.vol)}${num(R.avgVol) ? ' (' + f0(R.avgVol) + ')' : ''}`],
      ['Market cap', num(R.mcap) ? cr(R.mcap) : '—', 'P/E (TTM) · P/B', `${pe || '—'} · ${pb || '—'}`],
      ['Dividend yield', dy || '—', 'Debt / equity', de || '—'],
      ['ROE', roe || '—', 'Promoter / insider', prom || '—'],
      ['Delivery % (est.)', R.delivM && R.delivM.today && num(R.delivM.today.pct) ? R.delivM.today.pct.toFixed(0) + '% vs ' + (R.delivM.prev && num(R.delivM.prev.pct) ? R.delivM.prev.pct.toFixed(0) + '% prev' : '—') : '—', 'Next result', ne && num(ne.days) && ne.days >= 0 ? `in ${ne.days} day${ne.days === 1 ? '' : 's'}` : '—'],
      ['Street mean target', mt || '—', 'Price band (DPR)', dpr && (dpr.lo != null || dpr.lower != null) ? `${rs(dpr.lo != null ? dpr.lo : dpr.lower)} – ${rs(dpr.hi != null ? dpr.hi : dpr.upper)}` : '—'],
    ]);
    const intr = R.intraday && R.intraday.ok;
    const sigRows = (R.swing && R.swing.rows) || [], lTech = (R.long && R.long.tech) || [];
    const p1 = `<section class="page">${wm}<div class="hdr"><div class="brand">Joshi's Corner<span class="mood" style="background:${ml.c}">${ml.name}</span></div><div class="sub">Private Client Research Report · Equity Research &amp; Quantitative Strategy</div><div class="logo">${monogram(R.sym)}</div><div class="meta"><div style="flex-basis:13%"><b>Script / Exchange</b><span>${E(R.sym)} · ${R_EX}</span></div><div style="flex-basis:21%"><b>Company</b><span>${E(R.name)}</span></div><div style="flex-basis:14%"><b>Sector</b><span>${E(R.sector || '—')}</span></div><div><b>CMP</b><span>${rs(R.cmp)}</span></div><div><b>Market cap</b><span>${num(R.mcap) ? cr(R.mcap) : '—'}</span></div><div><b>Generated (IST)</b><span>${now}</span></div><div><b>Data basis</b><span>${R.live ? 'Market live · delayed' : 'Last close'}</span></div></div></div>
<div class="row"><div class="col stack" style="flex:1.55">${panel('1 · Executive Snapshot <span>&amp; Investment Thesis</span>', snap + `<div style="height:1.2mm"></div>${thesis(R)}`)}</div><div class="col stack" style="flex:1">${panel('Key levels', chartLevels(R) || note('Levels unavailable.'))}</div></div>
${panel('2 · Master Multi-Horizon Strategic Execution Matrix <span>· Intraday to Long term</span>', matrixTable(R) + note('Calls and levels are produced by fixed rules on price, volume, results and fundamentals; a horizon shows “INCOMPLETE DATA” rather than a guess when its inputs are missing. Reference zones, not guarantees.'))}
<div class="row"><div class="col" style="flex:1">${panel('% to target vs stop', chartTargets(R) || note('Targets unavailable.'))}</div><div class="col" style="flex:1">${panel('Trend', chartPrice(R) || note('Not enough history.'))}</div></div>
${pfoot(1)}</section>`;

    const p2 = `<section class="page">${wm}${pageHdr(2, R)}
${panel('3 · Tactical Trading Playbook <span>· Intraday and swing</span>', playbook(R) + (intr ? '' : note('Intraday feed unavailable right now — intraday levels may be missing.')) + '<div style="height:1mm"></div>' + (optionsTable(R) || ''))}
<div class="row"><div class="col" style="flex:1">${panel('Short-term signals', signalTable(sigRows, 14) || note('n/a'))}</div><div class="col" style="flex:1">${panel('Long-term signals', signalTable(lTech, 14) || note('n/a'))}</div></div>
<div class="row"><div class="col stack" style="flex:1">${panel('4 · Structural deep dive <span>· results</span>', (quarterTable(R) || note('Quarterly results unavailable.')) + '<div style="height:1mm"></div>' + (annualTable(R) || note('Annual statements unavailable.')))}</div><div class="col stack" style="flex:1">${panel('Revenue &amp; profit trend', chartFin(R) || note('Annual statements unavailable.'))}${panel('Returns vs Nifty 50', returnsTable(R))}</div></div>
<div class="row"><div class="col" style="flex:1">${panel('Pivot levels', pivotTable(R) || note('n/a'))}</div><div class="col" style="flex:1">${panel('Fibonacci map', fibTable(R) || note('n/a'))}</div><div class="col" style="flex:1">${panel('Moving averages', maTable(R) || note('n/a'))}</div></div>${pfoot(2)}</section>`;

    const p3 = `<section class="page">${wm}${pageHdr(3, R)}
${panel('5 · Fundamentals &amp; valuation', fundTable(R) || note('Fundamentals unavailable.'))}
${panel('6 · Peer Valuation Matrix', peerTable(R))}
${panel('7 · Corporate Actions <span>· last 3 years</span>', corpTable(R))}
${panel('8 · Risk Matrix', riskTable(R))}
${panel('9 · Portfolio Sizing <span>· % of equity portfolio</span>', sizing(R))}
<section class="verdict"><h2>10 · Final Wealth Advisory Verdict</h2>${verdict(R)}</section>${pfoot(3)}</section>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${E(R.sym)} — Joshi's Corner Master Report</title><style>${CSS}</style></head><body>${p1}${p2}${p3}</body></html>`;
  }

  /* shrink or grow type so each page is full and nothing is clipped */
  function fit(doc) {
    doc.querySelectorAll('.page').forEach((pg) => {
      const lo = 4.6, hi = 8.2; let a = lo, b = hi;
      const ok = (fs) => { pg.style.setProperty('--fs', fs + 'pt'); const items = pg.querySelectorAll(':scope > *:not(.wm):not(.pf)'); let bottom = 0; items.forEach((c) => { bottom = Math.max(bottom, c.getBoundingClientRect().bottom); }); const pf = pg.querySelector('.pf').getBoundingClientRect().top; return pg.scrollHeight <= pg.clientHeight + 1 && bottom <= pf - 2; };
      if (ok(hi)) return;
      for (let i = 0; i < 9; i++) { const mid = (a + b) / 2; if (ok(mid)) a = mid; else b = mid; }
      ok(a);
    });
  }

  /* ---------- NotebookLM source pack ---------- */
  function pack(R) {
    const t = (rows) => rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n');
    const m = (R.matrix || []).map((x) => { const e = lvl(x, /^(Entry|Buy zone|Accumulate)/), s = lvl(x, /^(Stop|Risk line|Hard floor)/), a = lvl(x, /^Target( 1)?( ·|$)/), b = lvl(x, /^Target 2/); return [x.horizon, x.call, e ? e.v : '—', s ? s.v : '—', a ? a.v : '—', b ? b.v : '—']; });
    const md = [`# ${R.name} (${R.sym}, ${R.exch === 'BO' ? 'BSE' : 'NSE'}) — Joshi's Corner source pack`, '', `Generated ${new Date().toISOString()}. Close ${rs(R.cmp)} (${pc(R.dayPct, 2)}). 52W ${rs(R.w52L)} – ${rs(R.w52H)}.`, '', '## Multi-horizon calls', '| Horizon | Call | Entry | Stop | Target 1 | Target 2 |', '|---|---|---|---|---|---|', t(m), '', '## Thesis', strip(thesis(R).replace(/<\/p>/g, '\n')), '', '## Risks', strip(riskTable(R).replace(/<\/tr>/g, '\n').replace(/<\/td>/g, ' | ')), '', '## Instruction for NotebookLM', 'Create a one-page infographic presentation: header with the stock and CMP, a horizon-by-horizon call table, a levels ladder, results trend, risks and the verdict. Use only the figures in this source. Add the line: ' + DISC].join('\n');
    return md;
  }

  /* ---------- viewer overlay ---------- */
  let lastR = null;
  function ensure() {
    if (document.getElementById('jcMaster')) return;
    const st = document.createElement('style');
    st.textContent = '#jcMaster{position:fixed;inset:0;z-index:9000;background:rgba(2,6,23,.78);display:none;flex-direction:column}#jcMaster.on{display:flex}#jcMaster .mb{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#0f172a;border-bottom:2px solid #D4AF37;color:#e2e8f0;font:600 13px system-ui,sans-serif;flex-wrap:wrap}#jcMaster .mb b{color:#D4AF37}#jcMaster .mb button,#jcMaster .mb a{background:#D4AF37;color:#0f172a;border:0;border-radius:8px;padding:6px 12px;font:800 12px system-ui,sans-serif;cursor:pointer;text-decoration:none}#jcMaster .mb .sp{flex:1}#jcMaster iframe{flex:1;border:0;background:#cbd5e1;width:100%}';
    document.head.appendChild(st);
    const o = document.createElement('div'); o.id = 'jcMaster';
    o.innerHTML = '<div class="mb"><b id="jcmT">Master report</b><span class="sp"></span><button id="jcmPdf">⬇ Save PDF</button><button id="jcmNb" title="Downloads a source file and opens NotebookLM">📊 NotebookLM infographic</button><button id="jcmX">✕ Close</button></div><iframe id="jcmF" title="Master report"></iframe>';
    document.body.appendChild(o);
    document.getElementById('jcmX').onclick = () => o.classList.remove('on');
    document.getElementById('jcmPdf').onclick = () => { const f = document.getElementById('jcmF'); try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { alert('Print failed: ' + e.message); } };
    document.getElementById('jcmNb').onclick = () => {
      if (!lastR) return; const md = pack(lastR), a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = lastR.sym + '_NotebookLM_source.md'; document.body.appendChild(a); a.click(); a.remove();
      try { navigator.clipboard.writeText(md); } catch (e) {}
      window.open('https://notebooklm.google.com/', '_blank');
      alert('Source file downloaded (and copied). In NotebookLM: create a notebook → Add source → upload the file → Studio → Infographic / Slide deck.');
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') o.classList.remove('on'); });
  }
  function show(R) {
    ensure(); lastR = R;
    const o = document.getElementById('jcMaster'), f = document.getElementById('jcmF'); document.getElementById('jcmT').textContent = R.name + ' · Master report';
    const html = build(R); o.classList.add('on');
    f.onload = () => { try { const d = f.contentDocument; (d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve()).then(() => fit(d)); } catch (e) {} };
    f.srcdoc = html;
  }
  window.JCMaster = { build, fit, pack, show, fetchCorp, fetchPeers };
  if (typeof module !== 'undefined') module.exports = { build, pack };
})();
