/* Joshi's Corner - "Setup & reasons": one scored checklist for the selected stock. Rules (owner's framework): every factor is mirrored (what is bullish for an
   uptrend is the exact reverse for a downtrend); precise technical levels for intraday AND delivery carry the most weight; for F&O stocks the biggest call / put
   open-interest strikes are the trading range and the nearest heavy strikes are resistance / support - whether they break is decided by the technical build-up;
   news helps trend and momentum; global factors (crude, dollar/rupee, bond yields, world markets) set the market regime - in a bearish market a stock cannot
   stand alone without strong news or strong accumulation (and the reverse). Reasons are shown factor by factor; this is a checklist, not a guarantee. */
(function (root) {
  'use strict';
  const isN = (x) => typeof x === 'number' && isFinite(x), clamp = (v, a, b) => Math.max(a == null ? -1 : a, Math.min(b == null ? 1 : b, v));
  const fx = (v, d) => (isN(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) : '-');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wImp = (name) => (typeof impOf === 'function' ? impOf(name) : 1);
  /* importance-weighted mirrored tally of a signal table: precise (high-importance) levels count more */
  function tallyW(rows) { let n = 0, d = 0, up = 0, dn = 0; (rows || []).forEach((r) => { if (r.v == null) return; const w = wImp(r.name); n += w * r.v; d += w; if (r.v > 0) up++; else if (r.v < 0) dn++; }); return d ? { s: n / d, up, dn, n: up + dn } : null; }
  const BULL = /\b(surge|surges|jump|jumps|rally|rallies|gain|gains|rises?|soars?|record|beat|beats|upgrade|upgraded|buy|bullish|order win|wins?|bags?|profit (up|jumps|rises)|strong|outperform|breakout|hits? (52|high)|dividend|bonus|buyback|target raised|growth)\b/i;
  const BEAR = /\b(falls?|fell|drops?|slumps?|plunges?|tumbles?|crash|miss(es|ed)?|downgrade|downgraded|sell|bearish|loss|losses|weak|probe|fraud|penalty|fine|cuts?|lowers?|warning|decline|declines|slips?|sinks?|resigns?|raid|default|target cut|selloff|sell-off)\b/i;
  let OI = null, OIp = null;
  function loadOI() { if (OI) return Promise.resolve(OI); if (!OIp) OIp = root.fetch('data/fno_oi.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => (OI = j || { stocks: {} })).catch(() => (OI = { stocks: {} })); return OIp; }

  function factors(R, oi, mood) {
    const F = [], add = (grp, name, reading, s, w, note) => F.push({ grp, name, reading, s: s == null ? null : clamp(s), w, note });
    const I = R.intraday && R.intraday.ok ? R.intraday : null, S = R.swing || null;
    const ti = I ? tallyW(I.rows) : null, ts = S && S.rows ? tallyW(S.rows) : null;
    add('Technical', 'Intraday levels (VWAP, opening range, CPR, EMA, Supertrend, RSI)', ti ? `${ti.up} bullish / ${ti.dn} bearish, importance-weighted ${ti.s >= 0 ? '+' : ''}${fx(ti.s)}` : 'Not loaded - generate the Intraday report', ti ? ti.s : null, 3);
    add('Technical', 'Delivery levels (20/50/200-day, MACD, ADX, breakout, volume)', ts ? `${ts.up} bullish / ${ts.dn} bearish, importance-weighted ${ts.s >= 0 ? '+' : ''}${fx(ts.s)}` : 'Not loaded - generate the Short-term report', ts ? ts.s : null, 2.5);
    const L = R.long; if (L && L.tone) add('Technical', 'Long-term / positional trend', `${L.rating || ''}`, L.tone === 'bull' ? .6 : L.tone === 'bear' ? -.6 : 0, 1);
    const tech = (ti ? ti.s * 3 : 0) + (ts ? ts.s * 2.5 : 0), techW = (ti ? 3 : 0) + (ts ? 2.5 : 0), techDir = techW ? tech / techW : 0;
    /* F&O open-interest range */
    let oiNote = null;
    if (oi && oi.callWall && oi.putWall) {
      const cmp = R.cmp, lo = oi.putWall, hi = oi.callWall, pos = (cmp - lo) / (hi - lo), edge = (hi - lo) * .22;
      let s = 0, txt;
      if (cmp > hi) { s = techDir > .1 ? .8 : -.2; txt = `above the call wall ${fx(hi, 0)} - ${techDir > .1 ? 'breakout confirmed by technicals' : 'technicals do not support the breakout: trap risk'}`; }
      else if (cmp < lo) { s = techDir < -.1 ? -.8 : .2; txt = `below the put wall ${fx(lo, 0)} - ${techDir < -.1 ? 'breakdown confirmed by technicals' : 'technicals do not confirm: bounce risk'}`; }
      else if (cmp >= hi - edge) { s = techDir > .35 ? .4 : -.5; txt = `at the top of the OI range, resistance ${fx(oi.nearRes || hi, 0)} / wall ${fx(hi, 0)} - ${techDir > .35 ? 'strong build-up, may break' : 'build-up not strong enough, likely capped'}`; }
      else if (cmp <= lo + edge) { s = techDir < -.35 ? -.4 : .5; txt = `at the bottom of the OI range, support ${fx(oi.nearSup || lo, 0)} / wall ${fx(lo, 0)} - ${techDir < -.35 ? 'weak build-up, may break down' : 'likely holds'}`; }
      else { s = 0; txt = `inside the range, mid-way (${Math.round(pos * 100)}% from put wall to call wall) - range-bound until a wall is tested`; }
      add('F&O open interest', `OI range ${fx(lo, 0)} - ${fx(hi, 0)} (put wall to call wall)`, txt, s, 2);
      if (isN(oi.pcr)) add('F&O open interest', 'Stock put/call OI ratio', `${fx(oi.pcr)} - ${oi.pcr >= 1.2 ? 'put writers defending (bullish)' : oi.pcr <= .7 ? 'call writers capping (bearish)' : 'balanced'}`, (oi.pcr - 1) / .45, 1);
      oiNote = oi;
    } else add('F&O open interest', 'OI range', 'Not an F&O stock (or OI file not loaded)', null, 2);
    /* accumulation / distribution */
    const dm = R.delivM, lat = dm && dm.latest, up = R.dayPct >= 0;
    if (lat && isN(lat.pct) && isN(dm.avgPct) && dm.avgPct > 0) {
      const r = lat.pct / dm.avgPct, s = (up ? 1 : -1) * clamp((r - 1) * 1.6);
      add('Accumulation', 'Delivery % vs its average', `${fx(lat.pct, 1)}% vs avg ${fx(dm.avgPct, 1)}% on a ${up ? 'rising' : 'falling'} price - ${s > .3 ? 'accumulation (buyers taking delivery)' : s < -.3 ? 'distribution (sellers handing over)' : 'no clear accumulation'}`, s, 1.5);
    } else add('Accumulation', 'Delivery % vs its average', 'Delivery data not available', null, 1.5);
    /* news */
    const nws = (R.news || []).slice(0, 8);
    if (nws.length) { let b = 0, e = 0; nws.forEach((n) => { const t = n.title || ''; if (BULL.test(t)) b++; if (BEAR.test(t)) e++; }); const s = (b - e) / (b + e + 1) * 1.4;
      add('News', 'Headlines (tone)', `${nws.length} recent: ${b} positive / ${e} negative`, s, 1, 'news helps the trend and momentum, it does not create one'); }
    else add('News', 'Headlines (tone)', 'No headlines loaded', null, 1);
    /* global / market regime */
    if (mood) {
      add('Market & global', 'Market mood (Nifty, breadth, VIX, world markets, rupee, crude, US yields, PCR)', `${mood.score}/100 - ` + (mood.top || []).map((p) => p.name + ' ' + p.txt).join(', '), (mood.score - 50) / 40, 2);
    } else add('Market & global', 'Market mood', 'Dashboard feed not loaded', null, 2);
    return { F, techDir, oiNote };
  }

  function verdict(F, mood) {
    let n = 0, d = 0, up = 0, dn = 0; F.forEach((f) => { if (f.s == null) return; n += f.s * f.w; d += f.w; if (f.s > .15) up++; else if (f.s < -.15) dn++; });
    const sc = d ? n / d : 0; let call = sc >= .25 ? 'BULLISH' : sc <= -.25 ? 'BEARISH' : 'NEUTRAL', strong = Math.abs(sc) >= .5, gate = null;
    const acc = (F.find((f) => f.grp === 'Accumulation') || {}).s, nws = (F.find((f) => f.grp === 'News') || {}).s;
    if (mood && mood.score < 40 && call === 'BULLISH') { const solid = (acc != null && acc >= .6) || (nws != null && nws >= .5); if (!solid) { call = 'NEUTRAL'; gate = 'Market is bearish (' + mood.score + '/100): a stock cannot move alone without solid news or strong accumulation - neither is present, so the bullish setup is held back.'; } else gate = 'Market is bearish (' + mood.score + '/100) but this stock has ' + (acc >= .6 ? 'strong accumulation' : 'solid positive news') + ' - it can stand against the market.'; }
    if (mood && mood.score > 60 && call === 'BEARISH') { const solid = (acc != null && acc <= -.6) || (nws != null && nws <= -.5); if (!solid) { call = 'NEUTRAL'; gate = 'Market is bullish (' + mood.score + '/100): a weak stock is lifted by the tide without strong distribution or bad news - the bearish setup is held back.'; } else gate = 'Market is bullish (' + mood.score + '/100) but this stock shows ' + (acc <= -.6 ? 'strong distribution' : 'bad news') + ' - it can fall against the market.'; }
    return { sc, call, strong, up, dn, gate, n: F.filter((f) => f.s != null).length };
  }

  function html(R, oi, mood) {
    const { F, oiNote } = factors(R, oi, mood), V = verdict(F, mood), col = V.call === 'BULLISH' ? '#12894b' : V.call === 'BEARISH' ? '#c0102e' : '#8a6d1a';
    const bar = (s) => { if (s == null) return '<span style="color:#9aa6bf">n/a</span>'; const w = Math.round(Math.abs(s) * 48); return `<span style="display:inline-block;width:100px;height:8px;background:#eef1f8;border-radius:4px;position:relative;vertical-align:middle"><span style="position:absolute;${s >= 0 ? 'left:50px' : 'right:50px'};width:${w}px;height:8px;background:${s >= 0 ? '#12894b' : '#c0102e'};border-radius:4px"></span></span> <b style="color:${s > .15 ? '#12894b' : s < -.15 ? '#c0102e' : '#6b7794'}">${s >= 0 ? '+' : ''}${fx(s)}</b>`; };
    const rows = F.map((f) => `<tr><td style="padding:4px 8px;border-top:1px solid #eef1f8;color:#5b6b8c;font-size:11px;white-space:nowrap">${esc(f.grp)}</td><td style="padding:4px 8px;border-top:1px solid #eef1f8;font-weight:700">${esc(f.name)}</td><td style="padding:4px 8px;border-top:1px solid #eef1f8;color:#34456a">${esc(f.reading)}${f.note ? ` <span style="color:#8a94ad">(${esc(f.note)})</span>` : ''}</td><td style="padding:4px 8px;border-top:1px solid #eef1f8;white-space:nowrap">${bar(f.s)}</td><td style="padding:4px 8px;border-top:1px solid #eef1f8;text-align:right;color:#8a94ad">x${f.w}</td></tr>`).join('');
    const chip = `<span style="display:inline-block;padding:4px 12px;border-radius:14px;font-weight:900;font-size:13px;background:${col};color:#fff">${V.call}${V.strong && V.call !== 'NEUTRAL' ? ' · STRONG' : ''}</span>`;
    const oiBox = oiNote ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0"><div style="flex:1;min-width:150px;padding:6px 10px;border:1px solid #d9e1f0;border-radius:10px;background:#fff"><div style="font-size:11px;color:#5b6b8c;font-weight:700">Resistance (call OI)</div><b style="color:#c0102e">${fx(oiNote.nearRes, 0)}</b> <span style="font-size:11px;color:#5b6b8c">nearest · wall ${fx(oiNote.callWall, 0)} · ${(oiNote.callOi || []).map((x) => fx(x[0], 0) + ' (' + fx(x[1] / 1e5, 1) + 'L)').join(', ')}</span></div><div style="flex:1;min-width:150px;padding:6px 10px;border:1px solid #d9e1f0;border-radius:10px;background:#fff"><div style="font-size:11px;color:#5b6b8c;font-weight:700">Support (put OI)</div><b style="color:#12894b">${fx(oiNote.nearSup, 0)}</b> <span style="font-size:11px;color:#5b6b8c">nearest · wall ${fx(oiNote.putWall, 0)} · ${(oiNote.putOi || []).map((x) => fx(x[0], 0) + ' (' + fx(x[1] / 1e5, 1) + 'L)').join(', ')}</span></div></div>` : '';
    return `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:6px"><b style="font-size:15px;color:#14306e">${esc(R.sym)} · FACTOR READING (not a forecast)</b>${chip}<span style="font-size:12px;color:#34456a">net ${V.sc >= 0 ? '+' : ''}${fx(V.sc)} · ${V.up} factors bullish, ${V.dn} bearish of ${V.n} available</span></div>` +
      (V.gate ? `<div style="margin:4px 0 8px;padding:6px 10px;border-left:4px solid ${col};background:#fff8e6;font-size:12px;font-weight:700;color:#5a4300">${esc(V.gate)}</div>` : '') + oiBox +
      `<div class="scrollx"><table style="border-collapse:collapse;font-size:12px;background:#fff;border:1px solid #d9e1f0;width:100%"><tr style="color:#5b6b8c;font-size:11px"><th style="padding:3px 8px;text-align:left">Group</th><th style="padding:3px 8px;text-align:left">Factor</th><th style="padding:3px 8px;text-align:left">Reading</th><th style="padding:3px 8px;text-align:left">Lean (bearish ◀ ▶ bullish)</th><th style="padding:3px 8px;text-align:right">Weight</th></tr>${rows}</table></div>` +
      `<div style="font-size:11px;color:#5b6b8c;margin-top:6px">Mirrored scoring: each factor leans bullish or bearish by the same rule reversed. Precise technical levels (VWAP, opening range, CPR, 20/200-day, MACD, ADX) carry the most weight. F&amp;O walls come from open interest as of the last close (nearest expiry). Back-test (88 stocks, 2 years, walk-forward, rules fixed in advance): this score called next-day direction right only 49-52% and 5-day 48-53% - no better than chance - so it is shown as a reading of the CURRENT setup and its reasons, not as a forecast. The statistical range box above (limits held 73-82%, day-high/low break calls 73-80%) is the part that was proven.</div>`;
  }

  async function run(R) {
    const box = root.document && root.document.getElementById('setupPanel'); if (!box) return;
    box.style.display = 'block'; const body = box.querySelector('.pbody');
    try {
      const oi = (await loadOI()).stocks[R.sym] || null;
      let mood = null; try { mood = root.__jd && root.__jd.moodScore ? root.__jd.moodScore() : null; } catch (e) { mood = null; }
      body.innerHTML = html(R, oi, mood);
    } catch (e) { body.innerHTML = '<div class="note">Setup score could not be built (' + esc((e && e.message) || e) + ').</div>'; }
  }
  root.JCSetup = { run, factors, verdict, html, tallyW };
  if (typeof module !== 'undefined') module.exports = root.JCSetup;
})(typeof window !== 'undefined' ? window : globalThis);
