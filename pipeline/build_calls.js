#!/usr/bin/env node
/* Joshi's Corner — build today's call book (day + investment calls) without the browser or Apps Script triggers.
   Same engine (calls_engine.js), same universe (Nifty 50 + the Nifty-500 list in apps-script/Calls.server.gs), same rules.
   Daily bars come from the Apps Script "dailyb" relay (Google's servers are not blocked by Yahoo) and, when that fails,
   from Yahoo directly. Writes data/calls/latest.json (+ data/calls/<date>.json) and, best effort, pushes the records to the
   Drive call book so the 4 PM settlement and the Our Recommendations page see them.
   Usage: node pipeline/build_calls.js [--force] [--date YYYY-MM-DD] [--dry] */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const JCE = require(path.join(ROOT, 'calls_engine.js'));
const args = process.argv.slice(2), has = (f) => args.includes(f), val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const FORCE = has('--force'), DRY = has('--dry');
const istNow = () => new Date(Date.now() + 19800000);
const today = val('--date') || istNow().toISOString().slice(0, 10);
const dow = new Date(today + 'T00:00:00Z').getUTCDay();
const BACKEND = process.env.JC_BACKEND || (fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8').match(/DEFAULT_BACKEND_URL\s*=\s*'([^']+)'/) || [])[1];
const OUT_DIR = path.join(ROOT, 'data', 'calls'), LATEST = path.join(OUT_DIR, 'latest.json');
const FINAL = { SL: 1, T1: 1, T2: 1, NT: 1, SKIP: 1, 'EOD+': 1, 'EOD−': 1, EXPIRED: 1 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url, ms, opts) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, Object.assign({ signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json,*/*' } }, opts || {}));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return JSON.parse(await r.text());
  } finally { clearTimeout(t); }
}
async function mapLimit(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } } })); return out; }

function universe() {
  const src = fs.readFileSync(path.join(ROOT, 'apps-script', 'Calls.server.gs'), 'utf8');
  const grab = (n) => ((src.match(new RegExp('var ' + n + '\\s*=\\s*\'([^\']+)\'')) || [])[1] || '').split(/\s+/).filter(Boolean);
  const seen = new Set(), list = []; [...grab('NIFTY50_'), ...grab('UNI500_')].forEach((s) => { s = s.toUpperCase(); if (!seen.has(s)) { seen.add(s); list.push(s); } });
  return list;
}
const yfOf = (s) => (/\.BO$/.test(s) ? s : s.replace(/\.NS$/, '') + '.NS');
const toBars = (b) => b.t.map((t, i) => ({ t, o: b.o[i], h: b.h[i], l: b.l[i], c: b.c[i], v: b.v[i] }));
function parseYahoo(j) {
  const r = j.chart.result[0], q = r.indicators.quote[0], out = [];
  (r.timestamp || []).forEach((t, i) => { const c = q.close[i]; if (c == null) return; out.push({ t, o: q.open[i] == null ? c : q.open[i], h: q.high[i] == null ? c : q.high[i], l: q.low[i] == null ? c : q.low[i], c, v: q.volume[i] || 0 }); });
  return out;
}
async function yahoo(sym) {
  for (let a = 0; a < 3; a++) {
    for (const host of ['query1', 'query2']) {
      try { return parseYahoo(await getJSON(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d&includePrePost=false`, 20000)); } catch (e) { /* try next */ }
    }
    await sleep(800 * (a + 1));
  }
  return null;
}
async function viaBackend(syms) { // returns {sym: bars}
  if (!BACKEND) return {};
  const j = await getJSON(BACKEND + '?action=dailyb&range=2y&symbols=' + encodeURIComponent(syms.join(',')), 70000);
  const out = {}; Object.keys(j.bars || {}).forEach((k) => { const b = j.bars[k]; if (b && b.t && b.t.length >= 150) out[k] = toBars(b); }); return out;
}
function addSessions(iso, n) { const d = new Date(iso + 'T00:00:00Z'); let c = 0; while (c < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) c++; } return d.toISOString().slice(0, 10); }

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (dow === 0 || dow === 6) { console.log('Weekend — no call book.'); return; }
  let prev = null; try { prev = JSON.parse(fs.readFileSync(LATEST, 'utf8')); } catch (e) { /* none */ }
  if (prev && prev.date === today && !FORCE) { console.log('Call book for ' + today + ' already built (' + prev.dayCalls + ' day, ' + prev.invCalls + ' investment). Nothing to do.'); return; }

  const uni = universe(), yf = uni.map(yfOf); console.log('Universe: ' + uni.length + ' symbols, date ' + today);
  const bars = {}, parts = []; for (let i = 0; i < yf.length; i += 25) parts.push(yf.slice(i, i + 25));
  let viaBe = 0, viaYh = 0;
  await mapLimit(parts, 3, async (part) => {
    let got = {}; try { got = await viaBackend(part); } catch (e) { /* relay failed — Yahoo direct below */ }
    Object.assign(bars, got); viaBe += Object.keys(got).length;
    const miss = part.filter((y) => !bars[y]);
    await mapLimit(miss, 6, async (y) => { const b = await yahoo(y); if (b && b.length >= 150) { bars[y] = b; viaYh++; } });
  });
  console.log('Daily bars: ' + viaBe + ' via backend relay, ' + viaYh + ' via Yahoo direct, ' + (yf.length - viaBe - viaYh) + ' missing');
  const minOk = Math.max(60, Math.floor(yf.length * 0.5));
  if (viaBe + viaYh < minOk) { console.error('::error::Only ' + (viaBe + viaYh) + ' of ' + yf.length + ' symbols returned data — not publishing a partial call book.'); process.exit(1); }

  const idx = {}; for (const s of ['^NSEI', '^INDIAVIX']) { try { const g = await viaBackend([s]); idx[s] = g[s] || null; } catch (e) { idx[s] = null; } if (!idx[s]) idx[s] = await yahoo(s); }
  if (!idx['^NSEI'] || idx['^NSEI'].length < 150) { console.error('::error::Nifty history unavailable — cannot judge the market regime.'); process.exit(1); }

  const stocks = [], missing = [];
  uni.forEach((s, i) => { const b = bars[yf[i]]; if (b && b.length) stocks.push({ sym: s.replace(/\.BO$/, ''), ex: /\.BO$/.test(s) ? 'BO' : 'NS', daily: b }); else missing.push(s); });
  const book = JCE.buildBook({ dateIso: today, stocks, nifty: idx['^NSEI'], vix: idx['^INDIAVIX'] || [], maxDay: 10, maxInv: 5 });
  const now = new Date().toISOString(), symKey = (c) => (c.ex === 'BO' ? c.sym + '.BO' : c.sym), recs = [];
  book.day.forEach((c) => { c.id = 'D-' + today + '-' + symKey(c); c.status = 'WAIT'; c.createdAt = now; c.lockedAt = now; c.src = 'github'; recs.push(c); });
  book.inv.forEach((c) => { c.id = 'I-' + today + '-' + symKey(c); c.status = 'WAIT'; c.createdAt = now; c.lockedAt = now; c.src = 'github'; c.expires = addSessions(c.refDate, c.tenureSessions); recs.push(c); });
  const day = { generatedAt: now, source: 'github', scanned: stocks.length, missing: missing.length, dayCalls: book.day.length, invCalls: book.inv.length, noTrade: book.skipped.length, ctx: book.ctx };
  const doc = Object.assign({ date: today }, day, { calls: recs });
  console.log('Built: ' + day.dayCalls + ' day calls, ' + day.invCalls + ' investment calls, ' + day.noTrade + ' stocks with no edge. Regime: ' + (day.ctx ? day.ctx.regime : 'n/a'));
  if (DRY) { console.log('Dry run — not writing.'); console.log(recs.slice(0, 3).map((c) => c.sym + ' ' + c.side + ' ' + c.entry).join(' | ')); return; }
  fs.writeFileSync(LATEST, JSON.stringify(doc)); fs.writeFileSync(path.join(OUT_DIR, today + '.json'), JSON.stringify(doc));
  console.log('Wrote data/calls/latest.json');

  // best effort: put the records in the Drive call book too (same call the browser makes), so settlement and history see them
  if (BACKEND) {
    try {
      const r = await fetch(BACKEND, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'calls_save', data: { calls: recs, days: { [today]: day } } }), redirect: 'follow' });
      console.log('Drive call book: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
    } catch (e) { console.log('Drive call book not updated (' + ((e && e.message) || e) + ') — the terminal will save it when opened.'); }
  }
})().catch((e) => { console.error('::error::' + ((e && e.stack) || e)); process.exit(1); });
