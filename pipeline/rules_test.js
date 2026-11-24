#!/usr/bin/env node
/* Joshi's Corner — test YOUR RULES (Rules tab of the master sheet "JC Logic & Formula Reference") on real 5-minute candles.
   For every row: the day-call engine is replayed over the last ~60 sessions (Yahoo keeps 60 days of 5-min data) on Nifty 50 + part of
   the Nifty 500, once WITHOUT the row and once WITH it, on top of the rows that are Live now. Same entry, stop, targets, 15:15 exit and
   0.05 % cost as the live calls. Proposed / Testing rows: "would it help?". Live rows: "is it still earning its place?".
   Writes data/rules_test.csv (shown in the sheet's "Rule Tests" tab) and data/rules.json (copy of the rows, used if the backend is down).
   The pre-open market mood is not kept historically, so it is left out of both sides of every test.
   Usage: node pipeline/rules_test.js            env RT_N = how many Nifty-500 names besides the Nifty 50 (default 150) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), JCE = require(path.join(ROOT, 'calls_engine.js'));
const BACKEND = process.env.JC_BACKEND || (fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8').match(/DEFAULT_BACKEND_URL\s*=\s*'([^']+)'/) || [])[1];
const N_EXTRA = parseInt(process.env.RT_N || '150', 10), MIN_TRADES = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json,*/*' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return JSON.parse(await r.text()); }
  finally { clearTimeout(t); }
}
function parseYahoo(j) {
  const r = j.chart.result[0], q = r.indicators.quote[0], out = [];
  (r.timestamp || []).forEach((t, i) => { const c = q.close[i]; if (c == null) return; out.push({ t, o: q.open[i] == null ? c : q.open[i], h: q.high[i] == null ? c : q.high[i], l: q.low[i] == null ? c : q.low[i], c, v: q.volume[i] || 0 }); });
  return out;
}
async function yahoo(sym, range, interval) {
  const u = (h) => `https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false`;
  for (let a = 0; a < 3; a++) {
    for (const h of ['query1', 'query2']) { try { return parseYahoo(await getJSON(u(h), 25000)); } catch (e) { } }
    if (BACKEND) { try { const j = await getJSON(BACKEND + '?action=fetch&url=' + encodeURIComponent(u('query1')), 40000); return parseYahoo(j.body ? JSON.parse(j.body) : j); } catch (e) { } }
    await sleep(1000 * (a + 1));
  }
  return null;
}
async function mapLimit(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } } })); return out; }
function universe() {
  const src = fs.readFileSync(path.join(ROOT, 'apps-script', 'Calls.server.gs'), 'utf8');
  const grab = (n) => ((src.match(new RegExp('var ' + n + '\\s*=\\s*\'([^\']+)\'')) || [])[1] || '').split(/\s+/).filter(Boolean);
  const seen = new Set(), out = []; [...grab('NIFTY50_'), ...grab('UNI500_').slice(0, N_EXTRA)].forEach((s) => { s = s.toUpperCase().replace(/\.(NS|BO)$/, ''); if (!seen.has(s)) { seen.add(s); out.push(s); } });
  return out;
}
const pct = (v) => (v == null ? '' : (v * 100).toFixed(1));
const r2 = (v) => (v == null ? '' : v.toFixed(2));
const csvq = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function describe(o) { const rt = o.R === 'Number' ? o.val : (o.val && o.val !== 1 ? o.val + '× ' : '') + o.R + (o.Rn ? '(' + o.Rn + ')' : ''); return o.side + ' · ' + o.stage + ': ' + o.L + (o.Ln ? '(' + o.Ln + ')' : '') + ' ' + o.op + ' ' + rt + ' · ' + o.eff + (o.eff === 'Points' ? ' ' + o.pts : ''); }

(async () => {
  /* 1. the rows */
  let rows = null, src = '';
  try { const j = await getJSON(BACKEND + '?action=rules', 30000); if (j && Array.isArray(j.rules)) { rows = j.rules; src = 'sheet'; } else console.log('backend: ' + JSON.stringify(j).slice(0, 200)); } catch (e) { console.log('backend rules unavailable: ' + e.message); }
  if (!rows) { try { rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rules.json'), 'utf8')).rules || []; src = 'data/rules.json'; } catch (e) { rows = []; } }
  if (src === 'sheet') fs.writeFileSync(path.join(ROOT, 'data', 'rules.json'), JSON.stringify({ at: new Date().toISOString(), note: 'copy of the Rules tab (master sheet); used when the backend cannot be reached', rules: rows }, null, 1));
  const norm = rows.map((r) => Object.assign(JCE.normRule(r), { raw: r }));
  const good = norm.filter((o) => !o.bad && /^Intraday/i.test(o.use || 'Intraday') && o.status !== 'Retired');
  console.log(`Rows from ${src}: ${rows.length} · testable ${good.length} · to fix ${norm.filter((o) => o.bad).length}`);
  const HEAD = ['Rule ID', 'Status', 'Rule', 'Tested (IST)', 'Sessions', 'Without: Calls', 'Without: Trades', 'Without: Target %', 'Without: SL %', 'Without: Avg R', 'Without: Net R', 'With: Calls', 'With: Trades', 'With: Target %', 'With: SL %', 'With: Avg R', 'With: Net R', 'Verdict'];
  const stamp = new Date(Date.now() + 19800000).toISOString().slice(0, 16).replace('T', ' ');
  const out = [HEAD];
  norm.filter((o) => o.bad).forEach((o) => out.push([o.id, (o.raw && o.raw.Status) || '', '', stamp, '', '', '', '', '', '', '', '', '', '', '', '', '', 'Fix row: ' + o.bad]));
  if (!good.length) { fs.writeFileSync(path.join(ROOT, 'data', 'rules_test.csv'), out.map((r) => r.map(csvq).join(',')).join('\n') + '\n'); console.log('No rows to test.'); return; }

  /* 2. candles: 2 years daily (indicators) + 60 days of 5-minute (the sessions replayed) */
  const uni = universe(); console.log('Universe ' + uni.length + ' stocks');
  const idx = {}; for (const s of ['^NSEI', '^INDIAVIX']) idx[s] = await yahoo(s, '2y', '1d');
  if (!idx['^NSEI'] || idx['^NSEI'].length < 150) { console.error('::error::Nifty history unavailable'); process.exit(1); }
  const data = await mapLimit(uni, 6, async (s) => { const y = s + '.NS', d = await yahoo(y, '2y', '1d'); if (!d || d.length < 150) return null; const m = await yahoo(y, '60d', '5m'); if (!m || m.length < 500) return null; return { s, dd: d.map((b) => Object.assign({ date: JCE.istDate(b.t) }, b)), m5: m }; });
  const S = data.filter(Boolean); console.log('With data: ' + S.length);
  if (S.length < 40) { console.error('::error::Too few stocks with data (' + S.length + ')'); process.exit(1); }
  const mkt = JCE.mktSeries(idx['^NSEI'], idx['^INDIAVIX'] || []);

  /* 3. replay */
  const live = good.filter((o) => o.status === 'Live').map((o) => o.raw);
  const run = (rowsOn) => { JCE.setRules(rowsOn.map((r) => Object.assign({}, r, { Status: 'Live' }))); let rs = []; S.forEach((x) => { rs = rs.concat(JCE.replay(x.dd.map((b) => Object.assign({}, b)), x.m5, mkt)); }); return JCE.summarize(rs); };
  const cache = {}; const sumOf = (rowsOn) => { const k = rowsOn.map((r) => r['Rule ID']).sort().join('|'); return cache[k] || (cache[k] = run(rowsOn)); };
  for (const o of good) {
    const isLive = o.status === 'Live', without = sumOf(isLive ? live.filter((r) => r !== o.raw) : live), withR = sumOf(isLive ? live : live.concat([o.raw]));
    let v; const dR = (withR.avgR || 0) - (without.avgR || 0);
    if ((withR.trig || 0) < MIN_TRADES) v = `Too few trades with the rule (${withR.trig || 0}) — keep testing`;
    else if (dR >= 0.05) v = isLive ? 'Still useful (Avg R +' + dR.toFixed(2) + ')' : 'Better (Avg R +' + dR.toFixed(2) + ') — can go Live';
    else if (dR <= -0.05) v = isLive ? 'Hurting now (Avg R ' + dR.toFixed(2) + ') — consider Retired' : 'Worse (Avg R ' + dR.toFixed(2) + ') — do not use';
    else v = 'No clear change (Avg R ' + (dR >= 0 ? '+' : '') + dR.toFixed(2) + ')';
    out.push([o.id, o.status, describe(o), stamp, without.sessions, without.calls, without.trig, pct(without.hit), pct(without.slRate), r2(without.avgR), r2(without.netR), withR.calls, withR.trig, pct(withR.hit), pct(withR.slRate), r2(withR.avgR), r2(withR.netR), v]);
    console.log(o.id + ': ' + v);
  }
  fs.writeFileSync(path.join(ROOT, 'data', 'rules_test.csv'), out.map((r) => r.map(csvq).join(',')).join('\n') + '\n');
})().catch((e) => { console.error(e); process.exit(1); });
