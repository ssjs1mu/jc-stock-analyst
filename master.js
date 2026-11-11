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
    const suf = ySym.slice(ySym.lastIndexOf('.')), r = (o) => (o && o.raw != null ? o.raw : null);
    let myInd = null, mySec = null; try { const me = await fetchSummary(ySym); myInd = me.assetProfile && me.assetProfile.industry; mySec = me.assetProfile && me.assetProfile.sector; } catch (e) {}
    const j = await fetchData('https://query1.finance.yahoo.com/v6/finance/recommendationsbysymbol/' + encodeURIComponent(ySym), { kind: 'json', validate: (j) => !!(j && j.finance && j.finance.result) });
    const recs = ((j.finance.result[0] || {}).recommendedSymbols || []).map((x) => x.symbol).filter((s) => s && s.endsWith(suf) && s !== ySym).slice(0, 10);
    if (!recs.length) return null;
    const rows = await Promise.all(recs.map(async (s) => {
      try {
        const sm = await fetchSummary(s), p = sm.price || {}, d = sm.summaryDetail || {}, k = sm.defaultKeyStatistics || {}, fd = sm.financialData || {}, ap = sm.assetProfile || {};
        return { sym: s.replace(/\.(NS|BO)$/, ''), name: p.shortName || p.longName || s, price: r(p.regularMarketPrice), mcap: r(p.marketCap), pe: r(d.trailingPE), pb: r(k.priceToBook), roe: r(fd.returnOnEquity), dy: r(d.dividendYield), ind: ap.industry || null, sec: ap.sector || null };
      } catch (e) { return null; }
    }));
    const ok = rows.filter(Boolean);
    let pick = myInd ? ok.filter((x) => x.ind === myInd) : [], basis = 'same industry (' + myInd + ')';
    if (pick.length < 3 && mySec) { const more = ok.filter((x) => x.sec === mySec && !pick.includes(x)); if (pick.length + more.length >= 2) { pick = pick.concat(more); basis = pick.length ? 'same industry first, then same sector (' + mySec + ')' : 'same sector (' + mySec + ')'; } }
    if (!pick.length) pick = ok.slice(0, 5), basis = 'nearest similar names (industry not confirmed)';
    return pick.length ? { rows: pick.slice(0, 6), basis } : null;
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
      const h = hz(R)[m.horizon], sw = m.horizon === 'Swing' ? ticket(R) : null;
      if (h) rows.push({ h: m.horizon, t: (h.t1 / R.cmp - 1) * 100, s: (h.stop / R.cmp - 1) * 100 });
      else if (sw) rows.push({ h: m.horizon, t: (sw.T1 / R.cmp - 1) * 100, s: (sw.S / R.cmp - 1) * 100 });
      else if (t1 && num(t1.n) && num(R.cmp)) rows.push({ h: m.horizon, t: (t1.n / R.cmp - 1) * 100, s: st && num(st.n) ? (st.n / R.cmp - 1) * 100 : null });
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
  const cut = (t, n) => { t = String(t || ''); if (t.length <= n) return t; const k = t.slice(0, n), i = Math.max(k.lastIndexOf('. '), k.lastIndexOf('; '), k.lastIndexOf(', ')); return (i > n * 0.5 ? k.slice(0, i) : k.replace(/\s+\S*$/, '')) + '…'; };
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
    if (sw && sw.call && !/INCOMPLETE|n\/a/i.test(sw.call)) parts.push(`The short-term (swing) read is <b>${E(sw.call)}</b>${sw.conf && sw.conf !== '—' ? ` (confidence ${E(sw.conf)})` : ''}: ${E(cut(strip(sw.basis), 150))}`);
    if (lt && lt.call && !/INCOMPLETE|n\/a/i.test(lt.call)) parts.push(`On the long-term view, results and fundamentals currently point to <b>${E(lt.call)}</b>${lt.conf && lt.conf !== '—' ? ` (confidence ${E(lt.conf)})` : ''}: ${E(cut(strip(lt.basis), 150))}`);
    else parts.push('Long-term call is withheld because the results / fundamentals feed was incomplete for this symbol — no call is issued from the chart alone.');
    const ne = R.nextEarnings || (R.resultInfo && R.resultInfo.next);
    if (ne && num(ne.days) && ne.days >= 0) parts.push(`<b>Result due in ${ne.days} day${ne.days === 1 ? '' : 's'}</b>${R.resultInfo && num(R.resultInfo.expMove) ? ` — the model-implied move around the number is about ±${R.resultInfo.expMove.toFixed(1)}% (${E(R.resultInfo.basis || '')}). A daily-close stop does not protect against a result-day gap, so position size should reflect it.` : '.'}`);
    return '<ul class="bl">' + parts.map((p) => `<li>${p}</li>`).join('') + '</ul>';
  }


  /* ---------- level engine: clustered support / resistance ladder, reconciled swing ticket, valuation scenarios ---------- */
  function ladder(R) {
    const lv = [], add = (v, l) => { if (num(v) && v > 0) lv.push({ v, l }); };
    ((R.swing && R.swing.levels) || []).forEach((x) => add(x.v, x.label));
    const dp = R.pivots && R.pivots.daily && R.pivots.daily.set, mp = R.pivots && R.pivots.monthly && R.pivots.monthly.set;
    if (dp) ['R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3'].forEach((k) => add(dp[k], 'Daily ' + (k === 'P' ? 'pivot' : k)));
    if (mp) ['R1', 'S1'].forEach((k) => add(mp[k], 'Monthly ' + k));
    const atr = (R.swing && R.swing.metrics && R.swing.metrics.atr) || 0, tol = Math.max(R.cmp * 0.003, atr * 0.2);
    lv.sort((a, b) => a.v - b.v);
    const cl = []; lv.forEach((x) => { const c = cl[cl.length - 1]; if (c && x.v - c.hi <= tol) { c.hi = x.v; c.items.push(x); } else cl.push({ lo: x.v, hi: x.v, items: [x] }); });
    cl.forEach((c) => { c.v = c.items.reduce((a, x) => a + x.v, 0) / c.items.length; c.labels = c.items.map((x) => x.l); });
    return { sup: cl.filter((c) => c.v < R.cmp * 0.9995), res: cl.filter((c) => c.v > R.cmp * 1.0005), atr };
  }
  const short = (c) => c.labels.slice(0, 3).join(' + ') + (c.labels.length > 3 ? ' +' + (c.labels.length - 3) : '');
  function ticket(R) {
    const atr = R.swing && R.swing.metrics && R.swing.metrics.atr, cmp = R.cmp; if (!num(atr) || !num(cmp)) return null;
    const L = ladder(R), plan = (R.swing && R.swing.plan) || {}, sup = L.sup.slice().sort((a, b) => b.v - a.v), res = L.res.slice().sort((a, b) => a.v - b.v);
    const near = sup.find((c) => cmp - c.v >= 0.25 * atr && cmp - c.v <= 1.6 * atr), eLo = near ? near.v : cmp - 0.8 * atr, eHi = cmp, E = (eLo + eHi) / 2;
    const below = sup.find((c) => c.hi < eLo - 0.3 * atr); let S = below ? below.lo - 0.25 * atr : eLo - 1.2 * atr, sWhy = below ? 'below ' + short(below) + ' − 0.25×ATR' : '1.2×ATR under the entry zone (no support cluster found)';
    if (E - S > 3 * atr) { S = E - 3 * atr; sWhy = 'capped at 3×ATR below entry'; }
    const t1c = res.find((c) => c.lo - E >= 0.6 * atr), T1 = t1c ? t1c.lo : E + 1.2 * atr, t2c = res.find((c) => c.lo - T1 >= 0.5 * atr), T2 = t2c ? t2c.lo : T1 + 1.3 * atr;
    const ext = [plan.t1, plan.t2].filter((x) => num(x) && x > T2 * 1.002).sort((a, b) => a - b), T3 = ext.length ? ext[0] : null;
    const risk = Math.max(1e-9, E - S), rr = (t) => (t - E) / risk;
    const reqEntry = (T, k) => (T + k * S) / (1 + k);
    return { eLo, eHi, E, S, sWhy, T1, T1w: t1c ? short(t1c) : 'ATR projection', T2, T2w: t2c ? short(t2c) : 'ATR projection', T3, T3w: T3 ? 'engine extension target (needs a close above ' + f2(T2) + ')' : null, rr1: rr(T1), rr2: rr(T2), rr3: T3 ? rr(T3) : null, req2: reqEntry(T2, 3), req3: T3 ? reqEntry(T3, 3) : null, near: near ? short(near) : 'ATR-based', atr, obstacles: res.filter((c) => c.v < (T3 || T2) * 0.9999).slice(0, 5), engine: { t1: plan.t1, t1w: plan.t1Why, t2: plan.t2, t2w: plan.t2Why, sl: plan.sl, slw: plan.slWhy } };
  }
  function scen(R) {
    const pe = parseFloat(Fv(R, /^P\/E \(trailing\)/)); if (!num(pe) || pe <= 0 || !num(R.cmp)) return null;
    const cg = Fv(R, /^Net income CAGR/), rg = Fv(R, /^Revenue CAGR/); let g = cg ? parseFloat(cg) : NaN, src = 'net-income CAGR';
    if (!num(g)) { g = rg ? parseFloat(rg) : NaN; src = 'revenue CAGR'; }
    if (!num(g)) return null;
    g = Math.max(0, Math.min(20, g)); const gf = Math.max(0, g - 3), eps = R.cmp / pe;
    const H = [{ k: '1Y', y: 1, m: [0.8, 1, 1.15] }, { k: '3Y', y: 3, m: [0.68, 0.92, 1.1] }, { k: '5Y', y: 5, m: [0.58, 0.85, 1.05] }];
    return { eps, pe, g, gf, src, H, rows: H.map((h) => { const e = eps * (1 + g / 100) * Math.pow(1 + gf / 100, h.y - 1), v = h.m.map((m) => e * pe * m); return { k: h.k, y: h.y, eps: e, mult: h.m.map((m) => pe * m), v, cagr: v.map((x) => (Math.pow(x / R.cmp, 1 / h.y) - 1) * 100) }; }) };
  }
  const call = (R, h) => { const m = (R.matrix || []).find((x) => x.horizon === h); return m && m.call && !/INCOMPLETE|n\/a/i.test(m.call) ? m.call : '—'; };
  function horizonTable(R) {
    const P = R.pivots || {}, d = P.daily && P.daily.set, w = P.weekly && P.weekly.set, m = P.monthly && P.monthly.set, M = (R.swing && R.swing.metrics) || {}, fb = R.fib || {}, wk = (R.long && R.long.wk) || {}, S = scen(R);
    const two = (a, b) => (!num(a) && !num(b) ? '—' : num(a) && num(b) ? `₹${f2(a)} / ₹${f2(b)}` : num(a) ? '₹' + f2(a) : num(b) ? '₹' + f2(b) : '—');
    const up = (a, b) => two.apply(null, [a, b].filter((x) => num(x) && x > R.cmp).sort((p, q) => p - q)), dn = (a, b) => two.apply(null, [a, b].filter((x) => num(x) && x < R.cmp).sort((p, q) => q - p));
    const rows = [];
    if (d) rows.push(['<b>Day</b>', two(d.S1, d.S2), two(d.R1, d.R2), 'Daily pivots (previous session H/L/C)', call(R, 'Intraday')]);
    if (w) rows.push(['<b>Week</b>', two(w.S1, w.S2), two(w.R1, w.R2), 'Weekly pivots', call(R, 'Swing')]);
    rows.push(['<b>1 Month</b>', two(m && m.S1, R.swing && R.swing.ll20), two(m && m.R1, R.swing && R.swing.hh20), 'Monthly pivot; 20-day low / high', call(R, 'Swing')]);
    rows.push(['<b>3 Months</b>', dn(M.s50, M.s100), up(R.w52H, fb.s60 && fb.s60.ext && fb.s60.ext[0] && fb.s60.ext[0].level), '50 / 100-day SMA; 52-week high; 60-day Fib ext 1.272', call(R, 'Positional')]);
    rows.push(['<b>6 Months</b>', dn(M.s200, wk.w40), up(R.w52H, fb.s2y && fb.s2y.ext && fb.s2y.ext[0] && fb.s2y.ext[0].level), '200-day / 40-week SMA; 52-week high; 2-year Fib ext 1.272', call(R, 'Medium term')]);
    if (S) S.rows.forEach((r) => rows.push([`<b>${r.k === '1Y' ? '1 Year' : r.k === '3Y' ? '3 Years' : '5 Years'}</b>`, `₹${f0(r.v[0])} <span class="mut">(bear)</span>`, `<b>₹${f0(r.v[1])}</b> base / ₹${f0(r.v[2])} bull`, `EPS ₹${f2(r.eps)} × ${r.mult.map((x) => x.toFixed(0)).join(' / ')}x · base ${pc(r.cagr[1])} p.a.`, call(R, r.k === '1Y' ? 'Medium term' : 'Long term')]));
    return tbl(['Horizon', 'Support / floor', 'Resistance / target', 'Basis of levels', 'Engine call'], rows, 'grid', ['10%', '19%', '24%', '37%', '10%']) + (S ? note(`1Y–5Y rows are earnings × multiple <b>scenarios</b>, not forecasts: EPS ₹${f2(S.eps)} (= price ÷ trailing P/E ${S.pe.toFixed(1)}), grown at ${S.g.toFixed(0)}% a year for year 1 (trailing ${S.src}, capped 0–20%) then ${S.gf.toFixed(0)}% a year; exit P/E (bear / base / bull) assumed at ${S.H.map((h) => h.k + ' ' + h.m.map((x) => Math.round(x * 100)).join('/') + '%').join(', ')} of today's multiple — base holds the multiple for year 1 and fades it later. Change the assumption and the numbers change.`) : note('1Y–5Y scenarios need trailing P/E and a growth rate from filed results — not available for this symbol, so none is shown.'));
  }
  function derivation(R) {
    const T = ticket(R), rows = [], live = R.live, ld = R.lastDate ? new Date(R.lastDate).toISOString().slice(0, 10).split('-').reverse().join('-') : '';
    rows.push(['CMP', rs(R.cmp), live ? 'Live quote, delayed (not a close); previous close ' + rs(R.prevClose) : 'Last close ' + ld]);
    if (T) {
      rows.push(['ATR (14)', rs(T.atr), 'Wilder ATR on daily candles — scales every distance below']);
      rows.push(['Entry zone', `${rs(T.eLo)} – ${rs(T.eHi)}`, `Nearest support cluster ${E(T.near)} up to CMP; average ${rs(T.E)}`]);
      rows.push(['Stop (daily close)', rs(T.S), T.sWhy]);
      rows.push(['Target 1', `${rs(T.T1)} · 1:${T.rr1.toFixed(1)}`, 'Nearest resistance cluster: ' + E(T.T1w)]);
      rows.push(['Target 2', `${rs(T.T2)} · 1:${T.rr2.toFixed(1)}`, 'Next resistance cluster: ' + E(T.T2w)]);
      if (T.T3) rows.push(['Target 3 (extension)', `${rs(T.T3)} · 1:${T.rr3.toFixed(1)}`, T.T3w]);
      if (num(T.engine.t1)) rows.push(['Engine swing targets', `${rs(T.engine.t1)} / ${rs(T.engine.t2)}`, 'Short-term tab: first level at least 1.5×ATR above entry (' + E(T.engine.t1w || '') + '), so nearer resistance is skipped there; the ticket here keeps it']);
    }
    return tbl(['Item', 'Value', 'Derived from'], rows, 'grid', ['20%', '22%', '58%']);
  }
  function auditTable(R) {
    const a = (R.audit || []).slice(-5).reverse(); if (!a.length) return '';
    const d = (t) => (t ? new Date(t).toISOString().slice(5, 10).split('-').reverse().join('-') : '—');
    return tbl(['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'Source'], a.map((x) => [d(x.date), f2(x.o), f2(x.h), f2(x.l), f2(x.c), f0(x.v), E(String(x.src || '').replace(/Yahoo 2Y feed/,'Yahoo 2Y').slice(0, 12)) + (x.approx ? ' ~' : '')]), 'grid num audit');
  }

  /* one source for Medium / Long term numbers: risk line = engine review line (weekly close), targets = scenarios */
  function hz(R) {
    const S = scen(R), out = {}, mm = (R.matrix || []).find((x) => x.horizon === 'Medium term'), rl = mm && mm.levels.find((l) => /^Risk line/.test(l.label)), w40 = mm && mm.levels.find((l) => /40-week/.test(l.label)), pv = rl && parseFloat(String(rl.v).replace(/[^0-9.]/g, '')), stop = rl && num(rl.n) ? rl.n : num(pv) ? pv : w40 && num(w40.n) ? w40.n : null;
    if (!S || !stop) return out;
    const r1 = S.rows.find((r) => r.k === '1Y'), r3 = S.rows.find((r) => r.k === '3Y'), r5 = S.rows.find((r) => r.k === '5Y'), risk = R.cmp - stop;
    const mk = (a, b, la, lb) => ({ stop, t1: a, t2: b, la, lb, rr1: (a - R.cmp) / risk, rr2: (b - R.cmp) / risk });
    if (r1) out['Medium term'] = mk(r1.v[1], r1.v[2], '1Y base', '1Y bull');
    if (r3 && r5) out['Long term'] = mk(r3.v[1], r5.v[1], '3Y base', '5Y base');
    return out;
  }
  function matrixTable(R) {
    const T = ticket(R), S = scen(R), H = hz(R), sc = (k) => (S ? S.rows.find((r) => r.k === k) : null);
    const rows = (R.matrix || []).map((m) => {
      let ent = lvl(m, /^(Entry|Buy zone|Accumulate)/), stp = lvl(m, /^(Stop|Risk line)/) || lvl(m, /^Hard floor/), t1 = lvl(m, /^Target( 1)?( ·|$)/), t2 = lvl(m, /^Target 2/), basis = E(strip(m.basis)).slice(0, 130), tag = '';
      if (m.horizon === 'Swing' && T) { ent = { v: `₹${f2(T.eLo)} – ₹${f2(T.eHi)}`, sub: 'avg ' + rs(T.E) }; stp = { v: rs(T.S), sub: pc((T.S / R.cmp - 1) * 100) + ' · daily close' }; t1 = { v: rs(T.T1), sub: pc((T.T1 / R.cmp - 1) * 100) + ' · 1:' + T.rr1.toFixed(1) }; t2 = { v: rs(T.T2), sub: pc((T.T2 / R.cmp - 1) * 100) + ' · 1:' + T.rr2.toFixed(1) }; tag = ' <span class="mut">reconciled</span>'; }
      const h = H[m.horizon]; if (h) { stp = { v: rs(h.stop), sub: pc((h.stop / R.cmp - 1) * 100) + ' · weekly close' }; t1 = { v: rs(h.t1), sub: pc((h.t1 / R.cmp - 1) * 100) + ' · ' + h.la + ' · 1:' + h.rr1.toFixed(1) }; t2 = { v: rs(h.t2), sub: pc((h.t2 / R.cmp - 1) * 100) + ' · ' + h.lb + ' · 1:' + h.rr2.toFixed(1) }; tag = ' <span class="mut">scenario targets</span>'; if (m.horizon === 'Long term') { const hf = lvl(m, /^Hard floor/); basis = hf ? 'Thesis-break floor ' + E(hf.v) + ' (' + pc((hf.n / R.cmp - 1) * 100) + ') — a review level, not a stop.' : basis; } }
            return [`<b>${E(m.horizon)}</b>${tag}<small>${E(m.sub)}</small>`, `<span class="cb ${tone(m.tone)}">${E(m.call)}</span><small>${E(m.conf && m.conf !== '—' ? 'conf. ' + m.conf : '')}</small>`, cell(ent), `<span class="r">${cell(stp)}</span>`, `<span class="g">${cell(t1)}</span>`, `<span class="g">${cell(t2)}</span>`, `<span class="mut">${basis}</span>`];
    });
    return tbl(['Horizon', 'Call', 'Entry', 'Stop / risk', 'Target 1', 'Target 2', 'Basis'], rows, 'grid', ['13%', '11%', '15%', '12%', '14%', '14%', '21%']);
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
    const idm = (R.matrix || []).find((m) => m.horizon === 'Intraday'), T = ticket(R), rows = [];
    if (idm && idm.levels.length) {
      const ent = lvl(idm, /^(Entry|Buy zone|Accumulate)/), stp = lvl(idm, /^(Stop|Risk line)/), t1 = lvl(idm, /^Target( 1)?( ·|$)/), t2 = lvl(idm, /^Target 2/);
      rows.push([`<b>Intraday</b><small>${E(idm.call)}</small>`, cell(ent), `<span class="r">${cell(stp)}</span>`, `<span class="g">${cell(t1)}</span>`, `<span class="g">${cell(t2)}</span>`, '<span class="mut">—</span>', E([t1, t2].map((t) => (t && /R:R/.test(t.sub || '') ? '1 : ' + t.sub.split('R:R ')[1] : '')).filter(Boolean).join(' · ')) || '—', 'Square off by 3:15 PM IST']);
    }
    if (T) rows.push([`<b>Swing</b><small>${E(call(R, 'Swing'))}</small>`, `<b>${rs(T.eLo)} – ${rs(T.eHi)}</b><small>avg ${rs(T.E)}</small>`, `<span class="r"><b>${rs(T.S)}</b><small>${pc((T.S / R.cmp - 1) * 100)} · daily close</small></span>`, `<span class="g"><b>${rs(T.T1)}</b><small>${pc((T.T1 / R.cmp - 1) * 100)}</small></span>`, `<span class="g"><b>${rs(T.T2)}</b><small>${pc((T.T2 / R.cmp - 1) * 100)}</small></span>`, T.T3 ? `<span class="g"><b>${rs(T.T3)}</b><small>${pc((T.T3 / R.cmp - 1) * 100)} · on breakout</small></span>` : '<span class="mut">—</span>', `1 : ${T.rr1.toFixed(1)} · 1 : ${T.rr2.toFixed(1)}${T.T3 ? ' · 1 : ' + T.rr3.toFixed(1) : ''}`, 'Re-assess in 5–20 sessions or on a daily close beyond the stop']);
    if (!rows.length) return note('Intraday / swing levels are not available for this symbol right now (feed incomplete) — no plan is issued.');
    let test = '';
    if (T) {
      const verdictTxt = T.rr2 >= 3 ? '<b class="g">passes on Target 2</b>' : T.rr3 != null && T.rr3 >= 3 ? '<b class="a">fails on Targets 1–2 and passes only on Target 3</b>, which needs a daily close above ' + rs(T.T2) + ' first' : '<b class="r">is not met on any target from this entry</b>';
      test = note(`<b>R:R ≥ 1 : 3 test</b> (average entry ${rs(T.E)}, stop ${rs(T.S)}): ${verdictTxt}. A 1 : 3 on Target 2 needs an entry at or below ${rs(T.req2)} (${pc((T.req2 / R.cmp - 1) * 100)} from CMP)${T.req3 != null ? '; on Target 3, at or below ' + rs(T.req3) + ' (' + pc((T.req3 / R.cmp - 1) * 100) + ')' : ''}. Resistance on the way up: ${T.obstacles.map((c) => rs(c.v) + ' (' + E(short(c)) + ')').join(' · ') || 'none mapped'}.`);
    }
    return tbl(['Plan', 'Entry zone', 'Stop', 'Target 1', 'Target 2', 'Target 3', 'Reward : risk (T1 · T2 · T3)', 'Review'], rows, 'grid', ['9%', '15%', '13%', '12%', '12%', '13%', '14%', '12%']) + test;
  }
  function optionsTable(R) {
    const T = ticket(R); if (!T) return '';
    const st = stepFor(R.cmp), rd = (v) => Math.round(v / st) * st, atm = rd(R.cmp), up = rd(T.T2 > R.cmp + st ? T.T2 : T.T3 || T.T2), dn = rd(T.S), dn2 = dn - st * 2;
    const rows = [['<b>Bull call spread</b>', `Buy ${atm} CE / Sell ${up} CE`, 'Swing long toward Target 2', `Risk = net debit; profit capped at ₹${f0(Math.max(0, up - atm))} less debit`],
      ['<b>Bull put spread</b>', `Sell ${dn} PE / Buy ${dn2} PE`, 'Income while the stop level holds', `Profit = credit; max loss ₹${f0(dn - dn2)} less credit`],
      ['<b>Protective collar</b> <span class="mut">(holders)</span>', `Buy ${dn} PE / Sell ${up} CE`, 'Hedge an existing holding', 'Low net cost; floor below the put, cap above the call']];
    return tbl(['Strategy', 'Indicative structure', 'Use-case', 'Risk / reward'], rows, 'grid', ['20%', '28%', '24%', '28%']) + note('Strikes are rounded from this report’s ticket and are indicative only. Confirm the stock is in F&amp;O, and check lot size, listed strikes, expiry, premium and implied volatility on the live option chain before any order. Avoid buying premium into a result date.');
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
    const PP = R.extra && R.extra.peers, P = PP && PP.rows;
    if (!P || !P.length) return note('Peer comparison is not available for this symbol (no peer list returned).');
    const pv = parseFloat(Fv(R, /^P\/E \(trailing\)/)), me = { sym: R.sym, name: R.name, mcap: R.mcap, pe: num(pv) ? pv : null, pb: parseFloat(Fv(R, /^P\/B/)), roe: parseFloat(Fv(R, /^ROE/)) / 100, me: true };
    const all = [me].concat(P.slice(0, 5)), pes = P.map((x) => x.pe).filter(num).sort((a, b) => a - b), med = pes.length ? (pes.length % 2 ? pes[(pes.length - 1) / 2] : (pes[pes.length / 2 - 1] + pes[pes.length / 2]) / 2) : null;
    const rows = all.map((x) => [x.me ? `<b>${E(x.sym)}</b>` : E(x.sym), `<span class="mut">${E(String(x.name).slice(0, 26))}</span>`, num(x.mcap) ? cr(x.mcap) : '—', num(x.pe) ? x.pe.toFixed(1) + 'x' : '—', num(x.pb) ? x.pb.toFixed(1) + 'x' : '—', num(x.roe) ? (x.roe * 100).toFixed(1) + '%' : '—']);
    return tbl(['Symbol', 'Company', 'Mkt cap', 'P/E (TTM)', 'P/B', 'ROE'], rows, 'grid num') + note(`Peer set: ${E(PP.basis)} — nearest similar names returned for this stock, not a curated list. ${med && num(me.pe) ? `Peer median P/E ${med.toFixed(1)}x; ${E(R.sym)} trades at ${pc((me.pe / med - 1) * 100)} versus it.` : ''}`);
  }
  function riskTable(R) {
    const rows = [], T = ticket(R);
    const ne = R.nextEarnings; if (ne && num(ne.days) && ne.days >= 0 && ne.days <= 20) rows.push([`Result event in ${ne.days} day${ne.days === 1 ? '' : 's'}`, '<span class="r"><b>High</b></span>', '<span class="r"><b>High</b></span>', R.resultInfo && num(R.resultInfo.expMove) ? `Model-implied move ±${R.resultInfo.expMove.toFixed(1)}% (${E(R.resultInfo.basis || '')}); wait for the reaction candle` : 'Gap risk through a daily-close stop']);
    const pe = parseFloat(Fv(R, /^P\/E \(trailing\)/)); if (num(pe)) rows.push([`Valuation (P/E ${pe.toFixed(1)}x)`, pe > 40 ? 'Medium' : 'Low', pe > 40 ? '<b>High</b>' : pe > 25 ? 'Medium' : 'Low', 'De-rating risk if growth slows; compare with peers']);
    const de = Fv(R, /^Debt \/ Equity/), den = de ? parseFloat(de) : NaN; if (num(den)) rows.push([`Leverage (debt / equity ${E(de)})`, den < 0.5 ? 'Low' : den < 1.5 ? 'Medium' : '<b>High</b>', den < 0.5 ? 'Low' : 'Medium', den < 0.5 ? 'Balance sheet is not a constraint; watch cash conversion' : 'Track interest cover and refinancing']);
    const s200 = ((R.swing && R.swing.maRows) || []).find((m) => m.name === 'SMA 200'); if (s200 && num(s200.val)) rows.push([`Trend: price ${R.cmp > s200.val ? 'above' : 'below'} the 200-day average (${f2(s200.val)})`, R.cmp > s200.val ? 'Low' : '<b>High</b>', 'Medium', R.cmp > s200.val ? 'A daily close below it would weaken the structure' : 'Counter-trend longs need tighter risk']);
    if (T) rows.push([`Stop distance ${pc((T.S / T.E - 1) * 100)} from average entry`, 'Medium', 'Medium', 'Size so that a stop-out stays inside the client’s risk budget']);
    if (T && T.rr2 < 3) rows.push([`Reward : risk below 1 : 3 on Targets 1–2 (1 : ${T.rr1.toFixed(1)} / 1 : ${T.rr2.toFixed(1)})`, '<b>High</b>', 'Medium', 'Resistance sits close above price; wait for a pullback entry or a breakout close']);
    if (num(R.avgVol) && num(R.vol) && !R.live) rows.push([`Liquidity (last session ${f0(R.vol)} vs average ${f0(R.avgVol)})`, R.avgVol < 2e5 ? 'High' : 'Low', 'Medium', 'Use limit orders; avoid oversized positions in thin stocks']);
    if (R.delivM && R.delivM.today && num(R.delivM.today.pct) && R.delivM.prev && num(R.delivM.prev.pct)) rows.push([`Delivery share (model estimate) ${R.delivM.today.pct.toFixed(0)}% vs ${R.delivM.prev.pct.toFixed(0)}% previous`, 'Low', 'Low', 'Rising delivery supports a move; falling delivery on a rally suggests intraday-driven buying']);
    rows.push(['Market / sector shock', 'Medium', 'Medium', 'Watch Nifty and India VIX; index sell-offs hit most stocks together']);
    return tbl(['Risk', 'Likelihood', 'Impact', 'Monitor / mitigant'], rows, 'grid', ['36%', '11%', '11%', '42%']);
  }
  function sizing(R) {
    const T = ticket(R), z = T ? `${rs(T.eLo)} – ${rs(T.eHi)}` : 'the entry zone', sTxt = T ? 'stop ' + rs(T.S) : 'the stop in the swing plan';
    return tbl(['Profile', 'Position size', 'Deployment', 'Risk control', 'Horizon'], [
      ['<b>Conservative</b>', '<b>4 – 5%</b>', 'Three tranches: after the next result is absorbed, on dips toward support, and on a confirmed close above Target 2', 'Review if the long-term risk line breaks; optional collar', '3–5 yrs'],
      ['<b>Balanced</b>', '<b>6 – 8%</b>', `Half in the entry zone (${z}), a quarter on a retest, a quarter on a breakout close`, `Swing sleeve: ${sTxt} (daily close)`, '1–3 yrs'],
      ['<b>Tactical Alpha</b>', '<b>8 – 10%</b>', 'Two tranches per the swing ticket; optional bull-call-spread overlay', 'Hard stop on a daily close; no averaging down', '2–8 wks'],
    ], 'grid', ['14%', '11%', '39%', '28%', '8%']) + note('Bands are caps, not targets. Respect each client’s concentration limits in the stock’s sector.');
  }
  function verdict(R) {
    const m = R.matrix || [], sw = m.find((x) => x.horizon === 'Swing') || m[0] || {}, lt = m.find((x) => x.horizon === 'Long term'), T = ticket(R), S = scen(R), b1 = S && S.rows.find((r) => r.k === '1Y');
    const head = sw.call && !/INCOMPLETE|n\/a/i.test(sw.call) ? sw.call : 'WAIT — INCOMPLETE DATA';
    const k = (a, b, c) => `<div><b style="color:${c}">${a}</b>${b}</div>`;
    const rrTxt = T ? (T.rr2 >= 3 ? 'The swing ticket meets the 1 : 3 reward-to-risk test on Target 2.' : T.rr3 != null && T.rr3 >= 3 ? `The 1 : 3 test is met only on the breakout extension (${rs(T.T3)}); on Targets 1–2 it is 1 : ${T.rr1.toFixed(1)} / 1 : ${T.rr2.toFixed(1)}, so a pullback entry near ${rs(T.req3)} or a confirmed close above ${rs(T.T2)} is the better trigger.` : `The 1 : 3 test is not met from this entry (1 : ${T.rr2.toFixed(1)} on Target 2); waiting for a better entry is the more conservative route.`) : '';
    const ne = R.nextEarnings && R.nextEarnings.days >= 0 && R.nextEarnings.days <= 15 ? `A result is due in ${R.nextEarnings.days} day${R.nextEarnings.days === 1 ? '' : 's'}; staging entries after the reaction is read is the more conservative route.` : '';
    return `<div class="big">${E(head)}${lt && lt.call && !/INCOMPLETE|n\/a/i.test(lt.call) ? ' · LONG TERM: ' + E(lt.call) : ''}</div><div class="k">${k(T ? rs(T.eLo) + ' – ' + rs(T.eHi) : '—', 'Entry zone', '#f8e7a1')}${k(T ? rs(T.S) : '—', 'Stop (daily close)', '#fca5a5')}${k(T ? rs(T.T1) + ' · ' + rs(T.T2) : '—', 'Targets 1 · 2', '#86efac')}${k(b1 ? rs(b1.v[1]) : '—', '12-month base scenario' + (b1 ? ' (' + pc(b1.cagr[1]) + ')' : ''), '#e2e8f0')}</div><ul class="bl vb"><li>${E(cut(strip(sw.basis || ''), 170))}</li><li>${rrTxt}</li>${ne ? '<li>' + ne + '</li>' : ''}<li>A daily close beyond the stop invalidates the view; levels are rule-based reference zones and may fail.</li></ul><div class="disc">${DISC} For information only. Not investment advice. Markets carry risk.</div>`;
  }

  /* ---------- v11 additions: quant scorecard, intraday setups, swing plans A/B, checklist ---------- */
  const rowVal = (R, re) => { const rows = ((R.swing && R.swing.rows) || []).concat((R.long && R.long.tech) || []); return rows.find((x) => re.test(x.name)); };
  function scorecard(R) {
    const sw = (R.swing && R.swing.rows) || [], lt = (R.long && R.long.tech) || [], all = sw.concat(lt), rows = [];
    const b = all.filter((x) => x.v > 0).length, br = all.filter((x) => x.v < 0).length, n = all.length - b - br;
    const sc = (v) => (v > 0 ? '<span class="g">+1</span>' : v < 0 ? '<span class="r">−1</span>' : '<span class="a">0</span>'), tot = [];
    const add = (name, reading, v) => { rows.push([name, reading, sc(v)]); tot.push(v); };
    if (all.length) add('Technical signals', `${b} bullish · ${br} bearish · ${n} neutral (of ${all.length})`, b - br > 2 ? 1 : br - b > 2 ? -1 : 0);
    const ma = (R.swing && R.swing.maRows) || [];
    if (ma.length) { const up = ma.filter((m) => R.cmp > m.val).length; add('Trend vs moving averages', `Above ${up} of ${ma.length} averages`, up / ma.length >= 0.75 ? 1 : up / ma.length <= 0.25 ? -1 : 0); }
    if (R.benchRet && num(R.benchRet.y1) && R.ret && num(R.ret.y1)) { const a = R.ret.y1 - R.benchRet.y1; add('Relative strength (1Y)', `${pc(a)} alpha vs Nifty 50`, a > 5 ? 1 : a < -5 ? -1 : 0); }
    const pe = parseFloat(Fv(R, /^P\/E \(trailing\)/)), P = R.extra && R.extra.peers && R.extra.peers.rows, pes = (P || []).map((x) => x.pe).filter(num).sort((x, y) => x - y);
    if (num(pe) && pes.length) { const med = pes[Math.floor(pes.length / 2)], d = (pe / med - 1) * 100; add('Valuation vs peers', `P/E ${pe.toFixed(1)}x vs peer median ${med.toFixed(1)}x (${pc(d, 0)})`, d < -10 ? 1 : d > 25 ? -1 : 0); }
    else if (num(pe)) add('Valuation', `P/E ${pe.toFixed(1)}x`, pe < 18 ? 1 : pe > 40 ? -1 : 0);
    const roe = parseFloat(Fv(R, /^ROE/)), de = parseFloat(Fv(R, /^Debt \/ Equity/));
    if (num(roe)) add('Quality · returns', `ROE ${roe.toFixed(1)}%${num(de) ? ' · D/E ' + de.toFixed(2) : ''}`, roe >= 18 && (!num(de) || de < 1) ? 1 : roe < 8 ? -1 : 0);
    const T = ticket(R); if (T) add('Reward : risk (swing)', `1:${T.rr1.toFixed(1)} / 1:${T.rr2.toFixed(1)} on T1 / T2`, T.rr2 >= 3 ? 1 : T.rr2 < 1.5 ? -1 : 0);
    const ne = R.nextEarnings; if (ne && num(ne.days) && ne.days >= 0) add('Event risk', `Result in ${ne.days} day${ne.days === 1 ? '' : 's'}`, ne.days <= 7 ? -1 : 0);
    if (!rows.length) return note('Scorecard unavailable (inputs incomplete).');
    const t = tot.reduce((x, y) => x + y, 0), lab = t >= 3 ? 'POSITIVE' : t <= -2 ? 'NEGATIVE' : 'NEUTRAL';
    return tbl(['Factor', 'Reading', 'Score'], rows, 'grid', ['30%', '54%', '16%']) + note(`Net score <b>${t > 0 ? '+' : ''}${t}</b> of ${tot.length} → <b>${lab}</b>. Equal-weight, rule-based; for orientation, not a trade signal.`);
  }
  function intradaySetups(R) {
    const d = R.pivots && R.pivots.daily && R.pivots.daily.set; if (!d || !num(d.P)) return note('Daily pivots unavailable for this symbol — no intraday setups issued.');
    const mk = (nm, trig, sl, t1, t2, side) => { const risk = Math.abs(trig - sl) || 1e-9, r = (t) => Math.abs(t - trig) / risk; return { nm, trig, sl, t1, t2, side, r1: r(t1), r2: r(t2) }; };
    const S = [mk('Breakout long', d.R1, d.P, d.R2, d.R3, 'L'), mk('Pivot pullback long', d.P, d.S1, d.R1, d.R2, 'L'), mk('Breakdown short', d.S1, d.P, d.S2, d.S3, 'S')].filter((x) => [x.trig, x.sl, x.t1, x.t2].every(num));
    const act = (x) => (x.side === 'L' ? (R.cmp >= d.P ? 'Bias: with price above pivot' : 'Counter-trend today') : (R.cmp < d.P ? 'Bias: with price below pivot' : 'Counter-trend today'));
    const rows = S.map((x) => [`<b>${x.nm}</b><small>${act(x)}</small>`, x.side === 'L' ? `Buy on 15-min close ${x.nm.startsWith('Break') ? 'above ' : 'near '}<b>${rs(x.trig)}</b>` : `Sell on 15-min close below <b>${rs(x.trig)}</b>`, `<span class="r"><b>${rs(x.sl)}</b></span>`, `<span class="g"><b>${rs(x.t1)}</b></span>`, `<span class="g"><b>${rs(x.t2)}</b></span>`, `1 : ${x.r1.toFixed(1)} · 1 : ${x.r2.toFixed(1)}`]);
    return tbl(['Setup', 'Trigger', 'Stop', 'Target 1', 'Target 2', 'R : R (T1 · T2)'], rows, 'grid', ['21%', '25%', '12%', '12%', '12%', '18%']) + note('Classic pivots from the previous session’s high / low / close. Intraday positions are squared off by 3:15 PM IST; no overnight carry. Short setups apply to F&amp;O / intraday-eligible stocks only.');
  }
  function swingPlans(R) {
    const T = ticket(R); if (!T) return note('Swing plans need ATR and levels — unavailable right now.');
    const L = ladder(R), res = L.res.slice().sort((a, b) => a.v - b.v), atr = T.atr, trig = res.length ? res[0].hi : R.cmp + atr, rest = res.filter((c) => c.lo > trig + 0.4 * atr);
    const bE = trig, bS = trig - atr, bT1 = rest.length ? rest[0].lo : trig + 1.5 * atr, bT2 = rest.length > 1 ? rest[1].lo : bT1 + 1.5 * atr, bRisk = Math.max(1e-9, bE - bS);
    const aBl = (T.rr1 + T.rr2) / 2, bBl = ((bT1 - bE) / bRisk + (bT2 - bE) / bRisk) / 2;
    const ok = (v) => (v >= 3 ? `<b class="g">1 : ${v.toFixed(1)} ✔</b>` : `<b class="r">1 : ${v.toFixed(1)} ✖</b>`);
    const rows = [[`<b>Plan A · Buy the pullback</b><small>${E(short(L.sup.length ? { labels: [T.near] } : { labels: ['ATR zone'] }))}</small>`, `${rs(T.eLo)} – ${rs(T.eHi)}`, `<span class="r">${rs(T.S)}</span><small>daily close</small>`, `<span class="g">${rs(T.T1)}</span> / <span class="g">${rs(T.T2)}</span>`, ok(aBl)],
      [`<b>Plan B · Buy the breakout</b><small>close above ${rs(trig)}</small>`, `${rs(bE)} on close`, `<span class="r">${rs(bS)}</span><small>daily close · 1×ATR</small>`, `<span class="g">${rs(bT1)}</span> / <span class="g">${rs(bT2)}</span>`, ok(bBl)]];
    return tbl(['Plan', 'Entry', 'Stop', 'Target 1 / 2', 'Blended R : R'], rows, 'grid', ['24%', '20%', '19%', '23%', '14%']) + note('Blended R : R assumes a 50 / 50 exit at Target 1 and Target 2 and must be ≥ 1 : 3 to pass. A plan that fails is a wait, not a trade; entry levels are reference zones, not guarantees.');
  }
  function checklist(R) {
    const T = ticket(R), ma = (R.swing && R.swing.maRows) || [], g = (n) => ma.find((m) => m.name === n), s50 = g('SMA 50'), s200 = g('SMA 200'), rsi = rowVal(R, /^RSI/), ne = R.nextEarnings;
    const rows = [], add = (c, ok, why) => rows.push([c, ok === null ? '<span class="a">n/a</span>' : ok ? '<b class="g">✔ Pass</b>' : '<b class="r">✖ Fail</b>', why]);
    if (s50) add('Price above 50-day average', R.cmp > s50.val, `${rs(R.cmp)} vs ${rs(s50.val)}`);
    if (s200) add('Price above 200-day average', R.cmp > s200.val, `${rs(R.cmp)} vs ${rs(s200.val)}`);
    if (rsi) add('Momentum not stretched', rsi.v >= 0, E(strip(rsi.reading)).slice(0, 48));
    if (T) { add('Blended R : R ≥ 1 : 3 (Plan A)', (T.rr1 + T.rr2) / 2 >= 3, `1:${T.rr1.toFixed(1)} / 1:${T.rr2.toFixed(1)}`); add('Stop within 3×ATR of entry', (T.E - T.S) <= 3 * T.atr + 1e-6, `${pc((T.S / T.E - 1) * 100)} from average entry`); }
    if (ne && num(ne.days) && ne.days >= 0) add('No result inside 5 sessions', ne.days > 5, `Result in ${ne.days} day${ne.days === 1 ? '' : 's'}`);
    if (num(R.vol) && num(R.avgVol) && !R.live) add('Volume ≥ 80% of average', R.vol >= 0.8 * R.avgVol, `${f0(R.vol)} vs ${f0(R.avgVol)}`);
    if (!rows.length) return note('Checklist unavailable.');
    const p = rows.filter((r) => /Pass/.test(r[1])).length;
    return tbl(['Condition', 'Status', 'Reading'], rows, 'grid', ['40%', '16%', '44%']) + note(`${p} of ${rows.length} conditions met. Enter only when the plan’s own trigger is hit <i>and</i> the failed items above are understood.`);
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
.page{width:210mm;height:296.5mm;padding:6mm 8mm 9mm;background:#f1f5f9;position:relative;overflow:hidden;display:flex;flex-direction:column;gap:1.7mm;page-break-after:always;break-after:page;font-size:var(--fs)}.page:last-child{page-break-after:auto;break-after:auto}
.wm{position:absolute;left:8mm;right:8mm;top:50%;transform:translateY(-50%);opacity:.045;pointer-events:none;z-index:50}.wm img{width:100%;display:block}
.hdr{background:rgba(15,23,42,.95);border:1.3px solid #D4AF37;border-radius:3mm;padding:2.4mm 4mm 0;text-align:center;color:#e2e8f0}
.brand{font-family:'Brush Script MT','Brush Script Std','Kaushan Script','Segoe Script',cursive;font-style:italic;color:#D4AF37;font-size:26pt;line-height:1}
.sub{font-size:6.2pt;letter-spacing:1.6px;text-transform:uppercase;color:#cbd5e1;margin-top:.7mm}.logo{width:14mm;height:14mm;margin:1.4mm auto 1.2mm}.logo svg{width:100%;height:100%;display:block}
.mood{display:inline-block;margin-left:6px;padding:.4mm 2mm;border-radius:2mm;font:800 5.8pt Inter,Arial,sans-serif;font-style:normal;letter-spacing:1px;color:#fff;vertical-align:middle}
.meta{display:flex;flex-wrap:wrap;border-top:1px solid rgba(212,175,55,.55);margin:0 -4mm}.meta div{flex:1 1 14%;padding:1.2mm 1mm;font-size:6pt;border-right:1px solid rgba(212,175,55,.25)}.meta div:last-child{border-right:0}.meta b{display:block;color:#D4AF37;font-size:5.4pt;letter-spacing:1px;text-transform:uppercase;font-weight:600}.meta span{color:#f8fafc;font-weight:600}
.runhdr{background:rgba(15,23,42,.95);border:1.1px solid #D4AF37;border-radius:2.4mm;padding:1.3mm 4mm;display:flex;justify-content:space-between;align-items:center;color:#e2e8f0;font-size:6.2pt}.runhdr .rb{font-family:'Brush Script MT','Kaushan Script',cursive;font-style:italic;color:#D4AF37;font-size:13pt;line-height:1}.runhdr .rt{letter-spacing:1.3px;text-transform:uppercase}.runhdr .rp{color:#D4AF37}
.panel{background:#fff;border:1px solid #e2e8f0;border-radius:2.2mm;padding:1.5mm 2.3mm;position:relative}.panel>h2{font-size:7.6pt;font-weight:700;color:#0f172a;letter-spacing:.3px;text-transform:uppercase;padding-bottom:.8mm;margin-bottom:1mm;border-bottom:1.2px solid #D4AF37}.panel>h2 span{color:#B8860B}
p,li{text-align:justify;hyphens:auto;-webkit-hyphens:auto}p{margin-bottom:1mm}p:last-child{margin-bottom:0}ul{padding-left:3.2mm}li{margin-bottom:.4mm}
.row{display:flex;gap:1.8mm;align-items:stretch}.col{min-width:0}.stack>*+*{margin-top:1.1mm}
table{border-collapse:collapse;width:100%;table-layout:auto}table.grid th{background:#0f172a;color:#D4AF37;font-weight:600;font-size:.92em;text-transform:uppercase;letter-spacing:.4px;padding:.6mm 1mm;text-align:left;border:1px solid #0f172a}table.grid td{padding:.5mm 1mm;border:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere}table.grid tbody tr:nth-child(even) td{background:#f8fafc}table.num td:not(:first-child){text-align:right}table.audit td,table.audit th{white-space:nowrap;padding:.5mm .7mm}table.num th:not(:first-child){text-align:right}
table.kv td{padding:.5mm 1mm;border:1px solid #e2e8f0;vertical-align:top}table.kv td.k{background:#f8fafc;color:#475569;font-weight:600;width:19%}
small{display:block;color:#64748b;font-size:.88em;font-weight:400}.g{color:#15803d;font-weight:600}.r{color:#b91c1c;font-weight:600}.a{color:#a16207;font-weight:600}.mut{color:#64748b;font-weight:400}
.cb{display:inline-block;padding:.2mm 1.4mm;border-radius:1.2mm;font-weight:800;font-size:.9em;border:1px solid currentColor}
.bl{list-style:none;padding:0}.bl li{position:relative;padding-left:3mm;margin-bottom:.9mm;text-align:left}.bl li:before{content:'';position:absolute;left:.4mm;top:.55em;width:1.5mm;height:1.5mm;border-radius:50%;background:#D4AF37}.vb li{color:#e2e8f0}.chips{display:flex;gap:1.3mm}.chip{flex:1;border-radius:2mm;padding:1.1mm 1.3mm;color:#fff;text-align:center}.chip b{display:block;font-size:.8em;letter-spacing:.6px;text-transform:uppercase;opacity:.9}.chip i{display:block;font-style:normal;font-weight:800;font-size:1.05em;line-height:1.15;margin-top:.3mm}.chip span{display:block;font-size:.8em;opacity:.9}.discbox{border:1.2px solid #D4AF37;background:#fffbeb;border-radius:2mm;padding:1.8mm 2.6mm;font-size:.9em;color:#334155;text-align:justify}.discbox b{color:#7a5b00;letter-spacing:.6px}.note{font-size:.86em;color:#64748b;margin-top:.8mm;text-align:justify}svg{display:block}
.verdict{background:rgba(15,23,42,.96);border:1.4px solid #D4AF37;border-radius:2.4mm;color:#e2e8f0;padding:2mm 3mm}.verdict h2{color:#D4AF37;font-size:8pt;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid rgba(212,175,55,.6);padding-bottom:.8mm;margin-bottom:1.2mm}.verdict .big{font-size:10pt;font-weight:800;color:#f8e7a1;margin-bottom:.8mm}.verdict .k{display:flex;gap:1.6mm;margin:1mm 0}.verdict .k div{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(212,175,55,.4);border-radius:1.4mm;padding:.8mm 1.4mm;text-align:center;font-size:.95em}.verdict .k b{display:block;font-size:1.25em}.verdict .disc{font-size:.92em;color:#94a3b8;margin-top:1mm}
.pf{position:absolute;bottom:3mm;left:8mm;right:8mm;font-size:5.4pt;color:#64748b;display:flex;justify-content:space-between;z-index:5}`;

  function dash(R) {
    const T = ticket(R), m = R.matrix || [], W = 420;
    const tc = (x) => (x.tone === 'bull' ? '#15803d' : x.tone === 'bear' ? '#be123c' : '#1d4ed8');
    const chips = '<div class="chips">' + m.map((x) => `<div class="chip" style="background:${tc(x)}"><b>${E(x.horizon)}</b><i>${E(String(x.call || 'n/a').replace(/INCOMPLETE DATA/i, 'NO CALL'))}</i><span>${x.conf && x.conf !== '—' ? 'conf ' + E(x.conf) : '&nbsp;'}</span></div>`).join('') + '</div>';
    let ruler = '';
    if (T) {
      const pts = [T.S, T.eLo, R.cmp, T.T1, T.T2].concat(T.T3 ? [T.T3] : []), lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), pad = (hi - lo) * 0.06, x0 = lo - pad, x1 = hi + pad, X = (v) => 14 + (v - x0) / (x1 - x0) * (W - 28);
      const mk = (v, col, top, lab) => `<line x1="${X(v)}" y1="20" x2="${X(v)}" y2="46" stroke="${col}" stroke-width="2"/><text x="${X(v)}" y="${top ? 14 : 58}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${col}">${lab}</text><text x="${X(v)}" y="${top ? 7 : 68}" text-anchor="middle" font-size="7.5" fill="#475569">${rs(v)}</text>`;
      ruler = `<svg viewBox="0 0 ${W} 74" width="100%"><rect x="14" y="31" width="${W - 28}" height="4" rx="2" fill="#e2e8f0"/><rect x="${X(T.S)}" y="29" width="${X(T.eLo) - X(T.S)}" height="8" fill="#fecaca"/><rect x="${X(T.eLo)}" y="27" width="${Math.max(2, X(T.eHi) - X(T.eLo))}" height="12" rx="2" fill="#D4AF37" opacity=".85"/><rect x="${X(R.cmp)}" y="29" width="${X(T.T2) - X(R.cmp)}" height="8" fill="#bbf7d0"/>${mk(T.S, '#b91c1c', 0, 'STOP')}${mk(T.eLo, '#a16207', 1, 'ENTRY')}${mk(R.cmp, '#0f172a', 0, 'CMP')}${mk(T.T1, '#15803d', 1, 'T1')}${mk(T.T2, '#15803d', 0, 'T2')}${T.T3 ? mk(T.T3, '#15803d', 1, 'T3') : ''}</svg>`;
    }
    let range = '';
    if (num(R.w52H) && num(R.w52L) && R.w52H > R.w52L) {
      const pf = Math.max(0, Math.min(1, (R.cmp - R.w52L) / (R.w52H - R.w52L))), p = pf * (W - 28) + 14;
      range = `<svg viewBox="0 0 ${W} 40" width="100%"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#ef4444"/><stop offset=".5" stop-color="#facc15"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs><rect x="14" y="14" width="${W - 28}" height="7" rx="3.5" fill="url(#rg)"/><path d="M${p - 4} 8 L${p + 4} 8 L${p} 15 Z" fill="#0f172a"/><text x="14" y="34" font-size="8" fill="#475569">52W low ${rs(R.w52L)}</text><text x="${W - 14}" y="34" font-size="8" text-anchor="end" fill="#475569">52W high ${rs(R.w52H)}</text><text x="${Math.min(W - 40, Math.max(40, p))}" y="5" font-size="8" text-anchor="middle" font-weight="700" fill="#0f172a">${(pf * 100).toFixed(0)}% of range</text></svg>`;
    }
    let bars = '';
    if (R.ret) {
      const it = [['1M', R.ret.m1], ['3M', R.ret.m3], ['6M', R.ret.m6], ['1Y', R.ret.y1]].filter((x) => num(x[1])), mx = Math.max.apply(null, it.map((x) => Math.abs(x[1])).concat([1])), bw = (W - 28) / (it.length || 1);
      bars = `<svg viewBox="0 0 ${W} 74" width="100%">${it.map((x, i) => { const h = Math.abs(x[1]) / mx * 22, up = x[1] >= 0, cx = 14 + i * bw + bw / 2; return `<rect x="${cx - 14}" y="${up ? 36 - h : 36}" width="28" height="${Math.max(1, h)}" fill="${up ? '#16a34a' : '#dc2626'}" rx="1.5"/><text x="${cx}" y="${up ? 33 - h : 48 + h}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${up ? '#15803d' : '#b91c1c'}">${pc(x[1])}</text><text x="${cx}" y="72" text-anchor="middle" font-size="8" fill="#475569">${x[0]}</text>`; }).join('')}<line x1="14" x2="${W - 14}" y1="36" y2="36" stroke="#cbd5e1"/></svg>`;
    }
    return chips + `<div class="row" style="margin-top:1.2mm"><div class="col" style="flex:1.25"><div class="note" style="margin:0 0 .4mm"><b>Swing trade ruler</b> — stop · entry · CMP · targets</div>${ruler || note('n/a')}</div><div class="col" style="flex:1"><div class="note" style="margin:0 0 .4mm"><b>Price within its 52-week range</b></div>${range}<div class="note" style="margin:0"><b>Returns</b></div>${bars}</div></div>`;
  }
  const istNow = () => new Date(Date.now() + 19800000).toISOString();
  const stampTxt = () => { const t = istNow(); return t.slice(8, 10) + '-' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+t.slice(5, 7) - 1] + '-' + t.slice(0, 4) + ' ' + t.slice(11, 16) + ' IST'; };
  const fileStamp = (R) => { const t = istNow(); return R.sym + '_' + t.slice(2, 4) + t.slice(5, 7) + t.slice(8, 10) + '-' + t.slice(11, 13) + t.slice(14, 16); };
  function pageHdr(n, R) { return `<div class="runhdr"><span class="rb">Joshi's Corner</span><span class="rt">${E(R.sym)} · ${R_EX} · ${stampTxt()}</span><span class="rp">Page ${n} of 5</span></div>`; }
  let SYM_NOW = '';
  const pfoot = (n) => `<div class="pf"><span>${E(SYM_NOW)} · ${stampTxt()} · Joshi's Corner · SSJ Finance · Not investment advice</span><span>Page ${n} of 5</span></div>`;

  function build(R) {
    R_EX = R.exch === 'BO' ? 'BSE' : 'NSE'; SYM_NOW = R.sym;
    const ml = moodOf(R), wm = `<div class="wm"><img src="${logoUrl()}" alt=""></div>`, now = new Date(Date.now() + 19800000).toISOString().slice(0, 16).replace('T', ' ');
    const pe = Fv(R, /^P\/E \(trailing\)/), pb = Fv(R, /^P\/B/), dy = Fv(R, /^Dividend yield/), de = Fv(R, /^Debt \/ Equity/), roe = Fv(R, /^ROE/), prom = Fv(R, /^Promoter/), mt = Fv(R, /^Mean target/);
    const ne = R.nextEarnings, dpr = R.dpr && typeof R.dpr === 'object' ? R.dpr : null;
    const snap = kv([
      [R.live ? 'CMP (live, delayed)' : 'CMP (last close)', `<b>${rs(R.cmp)}</b> <span class="${R.dayPct >= 0 ? 'g' : 'r'}">${pc(R.dayPct, 2)}</span>`, 'Previous close', rs(R.prevClose)],
      ['Day range', `${rs(R.dayL)} – ${rs(R.dayH)}`, '52-week range', `${rs(R.w52L)} – ${rs(R.w52H)}`],
      ['vs 52W high / low', `<span class="r">${pc((R.cmp / R.w52H - 1) * 100)}</span> / <span class="g">${pc((R.cmp / R.w52L - 1) * 100)}</span>`, R.live ? 'Volume so far (avg)' : 'Volume (avg)', `${f0(R.vol)}${num(R.avgVol) ? ' (' + f0(R.avgVol) + ')' : ''}`],
      ['Market cap', num(R.mcap) ? cr(R.mcap) : '—', 'P/E (TTM) · P/B', `${pe || '—'} · ${pb || '—'}`],
      ['Dividend yield', dy || '—', 'Debt / equity', de || '—'],
      ['ROE', roe || '—', 'Promoter / insider', prom || '—'],
      ['Delivery % (est.)', R.delivM && R.delivM.today && num(R.delivM.today.pct) ? R.delivM.today.pct.toFixed(0) + '% vs ' + (R.delivM.prev && num(R.delivM.prev.pct) ? R.delivM.prev.pct.toFixed(0) + '% prev' : '—') : '—', 'Next result', ne && num(ne.days) && ne.days >= 0 ? `in ${ne.days} day${ne.days === 1 ? '' : 's'}` : '—'],
      ['Street mean target', mt || '—', 'Price band (DPR)', dpr && (dpr.lo != null || dpr.lower != null) ? `${rs(dpr.lo != null ? dpr.lo : dpr.lower)} – ${rs(dpr.hi != null ? dpr.hi : dpr.upper)}` : '—'],
    ]);
    const intr = R.intraday && R.intraday.ok;
    const sigRows = (R.swing && R.swing.rows) || [], lTech = (R.long && R.long.tech) || [];
    const p1 = `<section class="page">${wm}<div class="hdr"><div class="brand">Joshi's Corner</div><div class="sub">Private Client Research Report · Equity Research &amp; Quantitative Strategy<span class="mood" style="background:${ml.c}">${ml.name}</span></div><div class="logo">${monogram(R.sym)}</div><div class="meta"><div style="flex-basis:13%"><b>Script / Exchange</b><span>${E(R.sym)} · ${R_EX}</span></div><div style="flex-basis:21%"><b>Company</b><span>${E(R.name)}</span></div><div style="flex-basis:14%"><b>Sector</b><span>${E(R.sector || '—')}</span></div><div><b>CMP</b><span>${rs(R.cmp)}</span></div><div><b>Market cap</b><span>${num(R.mcap) ? cr(R.mcap) : '—'}</span></div><div><b>Generated (IST)</b><span>${now}</span></div><div><b>Data basis</b><span>${R.live ? 'Market live · delayed' : 'Last close'}</span></div></div></div>
<div class="row"><div class="col stack" style="flex:1.55">${panel('1 · Executive Snapshot <span>&amp; Investment Thesis</span>', snap + `<div style="height:1.2mm"></div>${thesis(R)}`)}</div><div class="col stack" style="flex:1">${panel('Key levels', chartLevels(R) || note('Levels unavailable.'))}</div></div>
${panel('2 · Master Multi-Horizon Strategic Execution Matrix <span>· Intraday to Long term</span>', matrixTable(R) + note('Rule-based calls; “INCOMPLETE DATA” where inputs are missing. Swing row = ticket in section 4; Medium / Long = scenarios in section 5.'))}
${panel('At a glance', dash(R))}
${pfoot(1)}</section>`;

    const p2 = `<section class="page">${wm}${pageHdr(2, R)}
${panel('3 · Intraday Desk <span>· Today’s trading plan (pivot setups)</span>', intradaySetups(R) + (intr ? '' : note('Intraday feed unavailable right now — pivot levels come from daily candles.')))}
<div class="row"><div class="col" style="flex:1">${panel('Pivot points', pivotTable(R) || note('n/a'))}</div><div class="col" style="flex:1">${panel('Fibonacci (60-day swing)', fibTable(R) || note('n/a'))}</div></div>
<div class="row"><div class="col" style="flex:1.25">${panel('Trend', chartPrice(R) || note('Not enough history.'))}</div><div class="col" style="flex:1">${panel('Moving averages', maTable(R) || note('n/a'))}</div></div>
${panel('Quant scorecard <span>· multi-factor, equal weight</span>', scorecard(R))}
${panel('Intraday read <span>· from the matrix</span>', (() => { const m = (R.matrix || []).find((x) => x.horizon === 'Intraday'); return m ? `<p><b>${E(m.call)}</b>${m.conf && m.conf !== '—' ? ' (confidence ' + E(m.conf) + ')' : ''} — ${E(strip(m.basis))}</p>` : note('n/a'); })())}
${pfoot(2)}</section>`;

    const p3 = `<section class="page">${wm}${pageHdr(3, R)}
${panel('4 · Swing Playbook <span>· 1–4 weeks · entry zone, daily-close stop, targets, R:R</span>', playbook(R) + '<div style="height:1mm"></div>' + swingPlans(R))}
<div class="row"><div class="col" style="flex:1.2">${panel('How the ticket was derived', derivation(R))}</div><div class="col" style="flex:1">${panel('Swing checklist', checklist(R))}</div></div>
<div class="row"><div class="col" style="flex:1">${panel('Short-term signals', signalTable(sigRows, 11) || note('n/a'))}</div><div class="col" style="flex:1.3">${panel('Options structures', optionsTable(R) || note('n/a'))}</div></div>
${pfoot(3)}</section>`;

    const p4 = `<section class="page">${wm}${pageHdr(4, R)}
${panel('5 · Long-Term View <span>· Support &amp; target ladder, Day to 5 Years</span>', horizonTable(R))}
<div class="row"><div class="col stack" style="flex:1">${panel('Results <span>· quarterly &amp; annual</span>', (quarterTable(R) || note('Quarterly results unavailable.')) + '<div style="height:1mm"></div>' + (annualTable(R) || note('Annual statements unavailable.')) + note('Annual figures are vendor-standardised and can differ from company-reported revenue; filed results prevail.'))}</div><div class="col stack" style="flex:1">${panel('Revenue &amp; profit trend', chartFin(R) || note('Annual statements unavailable.'))}${panel('Returns vs Nifty 50', returnsTable(R))}</div></div>
${panel('Fundamentals &amp; valuation', fundTable(R) || note('Fundamentals unavailable.'))}
<div class="row"><div class="col" style="flex:1.35">${panel('Peer Valuation Matrix', peerTable(R))}</div><div class="col" style="flex:1">${panel('Long-term signals', signalTable(lTech, 9) || note('n/a'))}</div></div>
${pfoot(4)}</section>`;

    const p5 = `<section class="page">${wm}${pageHdr(5, R)}
${panel('6 · Corporate Actions <span>· last 3 years</span>', corpTable(R))}
${panel('7 · Risk Matrix', riskTable(R))}
${panel('8 · Portfolio Sizing <span>· % of equity portfolio</span>', sizing(R))}
<section class="verdict"><h2>9 · Final Wealth Advisory Verdict</h2>${verdict(R)}</section>
<div class="discbox"><b>DISCLAIMER</b> — ${DISC} Calls, levels and scenarios are rule-based reference zones computed from delayed market data and company filings; they are not guaranteed and not personalised advice. Investments in securities are subject to market risk; past performance is not indicative of future returns. Please consult your adviser and size positions to your own risk budget. © Joshi's Corner · SSJ Finance.</div>${pfoot(5)}</section>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${fileStamp(R)}_Master</title><style>${CSS}</style></head><body>${p1}${p2}${p3}${p4}${p5}</body></html>`;
  }

  /* shrink or grow type so each page is full and nothing is clipped */
  function fit(doc) {
    doc.querySelectorAll('.page').forEach((pg) => {
      const lo = 5.6, hi = 10.2; let a = lo, b = hi;
      const ok = (fs) => { pg.style.setProperty('--fs', fs + 'pt'); const items = pg.querySelectorAll(':scope > *:not(.wm):not(.pf)'); let bottom = 0; items.forEach((c) => { bottom = Math.max(bottom, c.getBoundingClientRect().bottom); }); const pf = pg.querySelector('.pf').getBoundingClientRect().top; return pg.scrollHeight <= pg.clientHeight + 1 && bottom <= pf - 5; };
      if (ok(hi)) return;
      for (let i = 0; i < 9; i++) { const mid = (a + b) / 2; if (ok(mid)) a = mid; else b = mid; }
      ok(a);
    });
  }

  /* ---------- NotebookLM source pack ---------- */
  function pack(R) {
    const t = (rows) => rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n');
    const m = (R.matrix || []).map((x) => { const e = lvl(x, /^(Entry|Buy zone|Accumulate)/), s = lvl(x, /^(Stop|Risk line|Hard floor)/), a = lvl(x, /^Target( 1)?( ·|$)/), b = lvl(x, /^Target 2/); const h = hz(R)[x.horizon], T = x.horizon === 'Swing' ? ticket(R) : null; if (h) return [x.horizon, x.call, e ? e.v : '—', f2(h.stop), f2(h.t1) + ' (' + h.la + ')', f2(h.t2) + ' (' + h.lb + ')']; if (T) return [x.horizon, x.call, f2(T.eLo) + ' – ' + f2(T.eHi), f2(T.S), f2(T.T1), f2(T.T2)]; return [x.horizon, x.call, e ? e.v : '—', s ? s.v : '—', a ? a.v : '—', b ? b.v : '—']; });
    const md = [`# ${R.name} (${R.sym}, ${R.exch === 'BO' ? 'BSE' : 'NSE'}) — Joshi's Corner source pack`, '', `Generated ${stampTxt()}. Close ${rs(R.cmp)} (${pc(R.dayPct, 2)}). 52W ${rs(R.w52L)} – ${rs(R.w52H)}.`, '', '## Multi-horizon calls', '| Horizon | Call | Entry | Stop | Target 1 | Target 2 |', '|---|---|---|---|---|---|', t(m), '', '## Thesis', strip(thesis(R).replace(/<\/p>/g, '\n')), '', '## Risks', strip(riskTable(R).replace(/<\/tr>/g, '\n').replace(/<\/td>/g, ' | ')), '', '## Instruction for NotebookLM', 'Create a one-page infographic presentation: header with the stock and CMP, a horizon-by-horizon call table, a levels ladder, results trend, risks and the verdict. Use only the figures in this source. Add the line: ' + DISC].join('\n');
    return md;
  }

  /* ---------- viewer overlay ---------- */
  let lastR = null;
  function ensure() {
    if (document.getElementById('jcMaster')) return;
    const st = document.createElement('style');
    st.textContent = '#jcMaster{position:fixed;inset:0;z-index:9000;background:rgba(2,6,23,.78);display:none;flex-direction:column}#jcMaster.on{display:flex}#jcMaster .mb{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#0f172a;border-bottom:2px solid #D4AF37;color:#e2e8f0;font:600 13px system-ui,sans-serif;flex-wrap:wrap}#jcMaster .mb b{color:#D4AF37}#jcMaster .mb button,#jcMaster .mb a{background:#D4AF37;color:#0f172a;border:0;border-radius:8px;padding:6px 12px;font:800 12px system-ui,sans-serif;cursor:pointer;text-decoration:none}#jcMaster .mb .sp{flex:1}#jcMaster .vw{flex:1;overflow:auto;background:#cbd5e1;position:relative}#jcMaster .vi{margin:0 auto;position:relative}#jcMaster iframe{border:0;background:#cbd5e1;width:794px;position:absolute;left:0;top:0;transform-origin:0 0}';
    document.head.appendChild(st);
    const o = document.createElement('div'); o.id = 'jcMaster';
    o.innerHTML = '<div class="mb"><b id="jcmT">Master report</b><span class="sp"></span><button id="jcmPdf">⬇ Save PDF</button><button id="jcmNb" title="Downloads a source file and opens NotebookLM">📊 NotebookLM infographic</button><button id="jcmX">✕ Close</button></div><div class="vw" id="jcmW"><div class="vi" id="jcmI"><iframe id="jcmF" title="Master report"></iframe></div></div>';
    document.body.appendChild(o);
    document.getElementById('jcmX').onclick = () => o.classList.remove('on');
    document.getElementById('jcmPdf').onclick = () => { const f = document.getElementById('jcmF'); const t0 = document.title; try { document.title = f.contentDocument.title; f.contentWindow.focus(); f.contentWindow.print(); document.title = t0; } catch (e) { alert('Print failed: ' + e.message); } };
    document.getElementById('jcmNb').onclick = () => {
      if (!lastR) return; const md = pack(lastR), a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = fileStamp(lastR) + '_NotebookLM_source.md'; document.body.appendChild(a); a.click(); a.remove();
      try { navigator.clipboard.writeText(md); } catch (e) {}
      window.open('https://notebooklm.google.com/', '_blank');
      alert('Source file downloaded (and copied). In NotebookLM: create a notebook → Add source → upload the file → Studio → Infographic / Slide deck.');
    };
    window.addEventListener('resize', () => { if (o.classList.contains('on')) scaleView(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') o.classList.remove('on'); });
  }
  function scaleView() {
    const w = document.getElementById('jcmW'), i = document.getElementById('jcmI'), f = document.getElementById('jcmF'); if (!w || !f) return;
    let h = 1123 * 5; try { const d = f.contentDocument; h = Math.max(d.documentElement.scrollHeight, d.body.scrollHeight); } catch (e) {}
    const k = Math.min(1, (w.clientWidth - 16) / 794);
    f.style.height = h + 'px'; f.style.transform = 'scale(' + k + ')'; i.style.width = 794 * k + 'px'; i.style.height = h * k + 'px';
  }
  function show(R) {
    ensure(); lastR = R;
    const o = document.getElementById('jcMaster'), f = document.getElementById('jcmF'); document.getElementById('jcmT').textContent = R.name + ' · Master report';
    const html = build(R); o.classList.add('on'); scaleView();
    f.onload = () => { try { const d = f.contentDocument; (d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve()).then(() => { fit(d); scaleView(); }); } catch (e) {} };
    f.srcdoc = html;
  }
  window.JCMaster = { build, fit, pack, show, fetchCorp, fetchPeers };
  if (typeof module !== 'undefined') module.exports = { build, pack };
})();
