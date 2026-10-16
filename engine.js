/* ============================================================
   Joshi's Corner — Stock Analyst Terminal v2
   Three separate reports (Intraday · Swing/Short-term delivery · Long-term delivery)
   Live feeds only: Yahoo Finance (quote/OHLCV/fundamentals), NSE delivery % (via Apps Script),
   Google News. Anything that cannot be fetched is shown as n/a — never estimated.
   ============================================================ */
'use strict';
const IS_BROWSER = typeof document !== 'undefined';
const DEFAULT_BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwMOG9NRYk4OEDdaOEYDERgk3Fyt0zVTbuajAAe3cIAccOOGI_fLR9kYCqlARSZYJlB6Q/exec';           // paste your Apps Script /exec URL here, or set it from the page
const LS_BACKEND = 'jc_backend_url';

/* ---------- small utils ---------- */
const last = (a) => a[a.length - 1];
const at = (a, k = 0) => (a && a.length > k ? a[a.length - 1 - k] : null);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (v) => v !== null && v !== undefined && !isNaN(v) && isFinite(v);
function fmt(n, d = 2) { return isNum(n) ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'; }
function fmtPct(n, d = 2) { return isNum(n) ? (n >= 0 ? '+' : '') + n.toFixed(d) + '%' : '—'; }
function fmtVol(n) { if (!isNum(n)) return '—'; if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr'; if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L'; if (n >= 1e3) return (n / 1e3).toFixed(1) + ' K'; return fmt(n, 0); }
function fmtMoney(n) { if (!isNum(n)) return '—'; const a = Math.abs(n), s = n < 0 ? '-' : ''; if (a >= 1e12) return s + '₹' + (a / 1e12).toFixed(2) + ' L Cr'; if (a >= 1e7) return s + '₹' + (a / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' Cr'; return s + '₹' + fmt(a, 0); }
const istDate = (t) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);
function weekKey(t) { const d = new Date((t + 19800) * 1000); const diff = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - diff * 864e5).toISOString().slice(0, 10); }

/* ---------- fetch layer ---------- */
/* Public CORS proxies are last-resort only (corsproxy.io now needs a paid key, so it is gone).
   The Apps Script backend is the main route. */
const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];
function getBackend() { try { return (IS_BROWSER && localStorage.getItem(LS_BACKEND)) || DEFAULT_BACKEND_URL || ''; } catch (e) { return DEFAULT_BACKEND_URL || ''; } }
const beUrl = (be, qs) => be + (be.includes('?') ? '&' : '?') + qs;

/* Apps Script allows only ~30 simultaneous runs per script; a screen that fires 50+ chart
   requests at once overloads it and everything times out. Cap in-flight backend calls. */
const BE_MAX_INFLIGHT = 8;
let beInflight = 0; const beQueue = [];
const isBackendUrl = (u) => /^https:\/\/script\.google(usercontent)?\.com\//.test(u);
function beAcquire() { if (beInflight < BE_MAX_INFLIGHT) { beInflight++; return Promise.resolve(); } return new Promise((res) => beQueue.push(res)); }
function beRelease() { const n = beQueue.shift(); if (n) n(); else beInflight = Math.max(0, beInflight - 1); }

async function fetchWithTimeout(url, ms = 9000) {
  const gated = isBackendUrl(url);
  if (gated) await beAcquire(); // the timeout starts only once this request actually goes out
  const ctl = new AbortController(); const id = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { cache: 'no-store', signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(id); if (gated) beRelease(); }
}

/* ---- response cache: in-memory (fresh, de-duplicated) + last-good copy in localStorage ---- */
const FC_MEM = new Map(); const FC_INFLIGHT = new Map();
const FC_LS_PREFIX = 'jcfc:', FC_LS_INDEX = 'jcfc_idx', FC_LS_MAX_ITEM = 400000, FC_LS_MAX_TOTAL = 3500000;
function fcTTL(url) {
  if (/interval=(1m|2m|5m|15m|30m|60m|1h)/.test(url)) return 60e3;   // intraday bars
  if (/\/chart\//.test(url)) return 5 * 60e3;                          // daily / weekly bars
  if (/news\.google\.com/.test(url)) return 10 * 60e3;
  return 30 * 60e3;                                                    // fundamentals, timeseries
}
function fcKey(url) { let h = 0; for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0; return FC_LS_PREFIX + (h >>> 0).toString(36) + url.length.toString(36); }
function fcSaveLS(url, txt) {
  if (!IS_BROWSER || txt.length > FC_LS_MAX_ITEM) return;
  try {
    const k = fcKey(url); let idx = []; try { idx = JSON.parse(localStorage.getItem(FC_LS_INDEX) || '[]'); } catch (e) { idx = []; }
    idx = idx.filter((x) => x.k !== k); idx.push({ k, n: txt.length });
    let total = idx.reduce((s, x) => s + x.n, 0);
    while (total > FC_LS_MAX_TOTAL && idx.length > 1) { const o = idx.shift(); total -= o.n; try { localStorage.removeItem(o.k); } catch (e) {} }
    const put = () => { localStorage.setItem(k, JSON.stringify({ u: url, t: Date.now(), d: txt })); localStorage.setItem(FC_LS_INDEX, JSON.stringify(idx)); };
    try { put(); } catch (e) { // storage full: drop the oldest half and try once more
      idx.splice(0, Math.ceil(idx.length / 2)).forEach((o) => { try { localStorage.removeItem(o.k); } catch (x) {} }); try { put(); } catch (x) {}
    }
  } catch (e) {}
}
function fcLoadLS(url) {
  if (!IS_BROWSER) return null;
  try { const v = JSON.parse(localStorage.getItem(fcKey(url)) || 'null'); return v && v.u === url ? v : null; } catch (e) { return null; }
}
const fcAge = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : m < 2880 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' d'; };

/* Route order: Apps Script backend (with one retry) → direct + public proxies raced in parallel
   → last good copy saved on this device. `validate` rejects bad payloads so the next route is tried. */
async function fetchData(url, { kind = 'json', validate = null, trace = null } = {}) {
  const parse = (txt) => { const out = kind === 'json' ? JSON.parse(txt) : txt; if (validate && !validate(out)) throw new Error('no usable data returned'); return out; };
  const hit = FC_MEM.get(url);
  if (hit && Date.now() - hit.t < fcTTL(url)) { try { const out = parse(hit.d); if (trace) trace.via = hit.via + ' (cached)'; return out; } catch (e) { FC_MEM.delete(url); } }
  if (FC_INFLIGHT.has(url)) { const r = await FC_INFLIGHT.get(url); if (trace) trace.via = r.via; return parse(r.d); }

  const job = (async () => {
    const errs = []; const be = getBackend();
    const tryRoute = async (name, u, ms) => { const txt = await fetchWithTimeout(u, ms); parse(txt); return { via: name, d: txt }; };
    const note = (name, e) => errs.push(name + ': ' + (e && e.name === 'AbortError' ? 'timed out' : (e && e.message) || 'failed'));
    if (be) {
      const bu = beUrl(be, 'action=fetch&url=' + encodeURIComponent(url));
      try { return await tryRoute('backend', bu, 20000); } catch (e) { note('backend', e); }
      await new Promise((r) => setTimeout(r, 700));
      try { return await tryRoute('backend', bu, 25000); } catch (e) { note('backend retry', e); }
    }
    const alts = [{ name: 'direct', u: url }].concat(PROXIES.map((p, i) => ({ name: 'proxy' + (i + 1), u: p(url) })));
    try { return await Promise.any(alts.map((a) => tryRoute(a.name, a.u, 8000).catch((e) => { note(a.name, e); throw e; }))); } catch (e) {}
    const st = fcLoadLS(url);
    if (st) { try { parse(st.d); return { via: 'saved copy from ' + fcAge(Date.now() - st.t) + ' ago', d: st.d, stale: true }; } catch (e) {} }
    const err = new Error('Live data is unavailable right now (the data backend is busy or offline) — please try again in a minute. [' + errs.join(' · ') + ']');
    err.routes = errs; throw err;
  })();
  FC_INFLIGHT.set(url, job);
  try {
    const r = await job;
    if (!r.stale) { FC_MEM.set(url, { t: Date.now(), d: r.d, via: r.via }); if (FC_MEM.size > 400) FC_MEM.delete(FC_MEM.keys().next().value); fcSaveLS(url, r.d); }
    if (trace) trace.via = r.via;
    return parse(r.d);
  } finally { FC_INFLIGHT.delete(url); }
}
function parseChart(r) {
  const ts = r.timestamp || [], q = r.indicators?.quote?.[0] || {}; const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i], h = q.high?.[i], l = q.low?.[i], o = q.open?.[i];
    if (c == null) continue;
    if (h == null || l == null || o == null) bars.push({ t: ts[i], o: o ?? c, h: h ?? c, l: l ?? c, c, v: q.volume?.[i] || 0, approx: true });
    else bars.push({ t: ts[i], o, h, l, c, v: q.volume?.[i] || 0 });
  }
  const ev = r.events && r.events.earnings, earnEvents = ev ? Object.values(ev).map((e) => e.date ?? e.timestamp).filter(isNum) : [];
  return { meta: r.meta || {}, bars, earnEvents };
}
async function fetchChart(sym, range, interval, trace) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false${interval === '1d' ? '&events=div%7Csplit%7Cearn' : ''}`;
  const j = await fetchData(url, { kind: 'json', trace, validate: (j) => !!j?.chart?.result?.[0]?.timestamp });
  return parseChart(j.chart.result[0]);
}
const QS_MODULES = 'price,summaryDetail,defaultKeyStatistics,financialData,assetProfile,recommendationTrend,calendarEvents';
async function fetchSummary(sym, trace) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${QS_MODULES}`;
  const j = await fetchData(url, { kind: 'json', trace, validate: (j) => !!j?.quoteSummary?.result?.[0] });
  return j.quoteSummary.result[0];
}
const TS_TYPES = ['annualTotalRevenue', 'annualNetIncome', 'annualDilutedEPS', 'annualOperatingCashFlow', 'annualFreeCashFlow', 'annualTotalDebt', 'annualStockholdersEquity'];
const TSQ_TYPES = ['quarterlyTotalRevenue', 'quarterlyNetIncome', 'quarterlyOperatingIncome', 'quarterlyDilutedEPS'];
async function fetchTimeseries(sym, types, years, trace) {
  const p2 = Math.floor(Date.now() / 1000), p1 = Math.floor(p2 - years * 365.25 * 86400);
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?symbol=${encodeURIComponent(sym)}&type=${types.join(',')}&period1=${p1}&period2=${p2}`;
  const j = await fetchData(url, { kind: 'json', trace, validate: (j) => (j?.timeseries?.result?.length || 0) > 0 });
  const out = {};
  for (const r of j.timeseries.result) {
    const type = r.meta?.type?.[0]; const arr = type ? r[type] : null; if (!arr) continue;
    out[type] = arr.filter((x) => x && x.reportedValue?.raw != null).map((x) => ({ date: x.asOfDate, val: x.reportedValue.raw })).sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  return Object.keys(out).length ? out : null;
}
async function fetchNews(query, trace) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' stock')}&hl=en-IN&gl=IN&ceid=IN:en`;
  const text = await fetchData(url, { kind: 'text', trace, validate: (t) => /<item>/.test(t) });
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  return Array.from(xml.querySelectorAll('item')).slice(0, 8).map((it) => ({ title: it.querySelector('title')?.textContent || '', link: it.querySelector('link')?.textContent || '#', date: it.querySelector('pubDate')?.textContent || '' }));
}
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function toISODate(v) {
  if (!v) return null; const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dm = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dm) return `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  const m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})/);
  return m && MON[m[2].toLowerCase()] ? `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
/* NSE (via Apps Script): delivery history, latest delivery position, circuit band (DPR). Returns null if nothing usable. */
async function fetchDelivery(rawSym) {
  const be = getBackend(); if (!be) return null;
  const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=nse&symbol=' + encodeURIComponent(rawSym)), 30000));
  const num = (v) => { const x = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(x) ? x : null; };
  const hist = [];
  const hrows = j?.hist?.data || (Array.isArray(j?.hist) ? j.hist : []);
  hrows.forEach((r) => {
    const date = toISODate(r.CH_TIMESTAMP || r.mTIMESTAMP || r.TIMESTAMP), del = num(r.COP_DELIV_QTY ?? r.DELIV_QTY), traded = num(r.CH_TOT_TRADED_QTY ?? r.TTL_TRD_QNTY), pct = num(r.COP_DELIV_PERC ?? r.DELIV_PER);
    if (date && isNum(del)) hist.push({ date, del, traded, pct: isNum(pct) ? pct : traded ? (del / traded) * 100 : null });
  });
  const d = j?.trade?.securityWiseDP;
  if (d && d.deliveryQuantity != null) { const date = toISODate(d.secWiseDelPosDate); if (date && !hist.find((h) => h.date === date)) hist.push({ date, del: num(d.deliveryQuantity), traded: num(d.quantityTraded), pct: num(d.deliveryToTradedQuantity) }); }
  hist.sort((a, b) => (a.date < b.date ? -1 : 1));
  const pi = j?.quote?.priceInfo; let dpr = null;
  if (pi && (num(pi.lowerCP) != null || num(pi.upperCP) != null)) dpr = { lower: num(pi.lowerCP), upper: num(pi.upperCP), band: pi.pPriceBand ?? '' };
  const meetings = rowsOf(j.meetings).map((r) => { const d = parseNseDateTime(pickF(r, 'bm_date', 'date', 'meetingDate')), txt = `${pickF(r, 'bm_purpose', 'purpose') || ''} ${pickF(r, 'bm_desc', 'desc') || ''}`; return d && /result/i.test(txt) ? { iso: d.iso, purpose: String(pickF(r, 'bm_purpose', 'purpose') || 'Results') } : null; }).filter(Boolean).sort((a, b) => (a.iso < b.iso ? -1 : 1));
  const resQ = parseNseResults(j.resQ, false), resA = parseNseResults(j.resA, true);
  const hr = rowsOf(j.hold).map((r) => ({ d: parseNseDateTime(pickF(r, 'date', 'as_on_date', 'asOnDate')), pr: numOf(pickF(r, 'pr_and_prgrp', 'promoter', 'promoterAndPromoterGroup')) })).filter((x) => x.d && isNum(x.pr)).sort((a, b) => (a.d.iso < b.d.iso ? 1 : -1))[0];
  const holding = hr ? { promoter: hr.pr, date: hr.d.iso } : null;
  return hist.length || dpr || meetings.length || resQ || resA || holding ? { hist, dpr, meetings, resQ, resA, holding } : null;
}

/* ---------- indicator library (all computed from raw OHLCV) ---------- */
function SMA(a, p) { const o = Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) o[i] = s / p; } return o; }
function SMAn(a, p) { return a.map((_, i) => { if (i < p - 1) return null; let s = 0; for (let k = i - p + 1; k <= i; k++) { if (a[k] == null) return null; s += a[k]; } return s / p; }); }
function EMA(a, p) {
  const o = Array(a.length).fill(null), k = 2 / (p + 1), f = a.findIndex((v) => v != null);
  if (f < 0 || a.length - f < p) return o;
  let s = 0; for (let i = f; i < f + p; i++) s += a[i];
  let prev = s / p; o[f + p - 1] = prev;
  for (let i = f + p; i < a.length; i++) { prev = a[i] * k + prev * (1 - k); o[i] = prev; }
  return o;
}
function wilder(a, p) {
  const o = Array(a.length).fill(null), f = a.findIndex((v) => v != null);
  if (f < 0 || a.length - f < p) return o;
  let s = 0; for (let i = f; i < f + p; i++) s += a[i];
  o[f + p - 1] = s / p;
  for (let i = f + p; i < a.length; i++) o[i] = (o[i - 1] * (p - 1) + a[i]) / p;
  return o;
}
function RSI(c, p = 14) {
  const g = [null], l = [null];
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g.push(d > 0 ? d : 0); l.push(d < 0 ? -d : 0); }
  const ag = wilder(g, p), al = wilder(l, p);
  return ag.map((x, i) => (x == null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + x / al[i])));
}
const TRs = (b) => b.map((x, i) => (i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c))));
const ATR = (b, p = 14) => wilder(TRs(b), p);
function MACD(c, f = 12, s = 26, sg = 9) {
  const ef = EMA(c, f), es = EMA(c, s);
  const m = c.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const sig = EMA(m, sg);
  return { macd: m, signal: sig, hist: m.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null)) };
}
function BB(c, p = 20, k = 2) {
  const mid = SMA(c, p), up = [], lo = [], bw = [];
  for (let i = 0; i < c.length; i++) {
    if (mid[i] == null) { up.push(null); lo.push(null); bw.push(null); continue; }
    let v = 0; for (let j = i - p + 1; j <= i; j++) v += (c[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / p); up.push(mid[i] + k * sd); lo.push(mid[i] - k * sd); bw.push(((2 * k * sd) / mid[i]) * 100);
  }
  return { mid, up, lo, bw };
}
function STOCH(b, p = 14, s = 3) {
  const raw = b.map((x, i) => { if (i < p - 1) return null; let hh = -Infinity, ll = Infinity; for (let j = i - p + 1; j <= i; j++) { hh = Math.max(hh, b[j].h); ll = Math.min(ll, b[j].l); } return hh === ll ? 50 : (100 * (x.c - ll)) / (hh - ll); });
  const K = SMAn(raw, s); return { K, D: SMAn(K, s) };
}
function ADX(b, p = 14) {
  const pdm = [null], mdm = [null], tr = TRs(b).map((v, i) => (i === 0 ? null : v));
  for (let i = 1; i < b.length; i++) { const up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l; pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0); }
  const sp = wilder(pdm, p), sm = wilder(mdm, p), st = wilder(tr, p);
  const pdi = sp.map((v, i) => (v == null || !st[i] ? null : (100 * v) / st[i]));
  const mdi = sm.map((v, i) => (v == null || !st[i] ? null : (100 * v) / st[i]));
  const dx = pdi.map((v, i) => (v == null || mdi[i] == null ? null : v + mdi[i] === 0 ? 0 : (100 * Math.abs(v - mdi[i])) / (v + mdi[i])));
  return { adx: wilder(dx, p), pdi, mdi };
}
function OBV(b) { let o = 0; return b.map((x, i) => { if (i > 0) { if (x.c > b[i - 1].c) o += x.v; else if (x.c < b[i - 1].c) o -= x.v; } return o; }); }
function CCI(b, p = 20) {
  const tp = b.map((x) => (x.h + x.l + x.c) / 3), sm = SMA(tp, p);
  return tp.map((v, i) => { if (sm[i] == null) return null; let md = 0; for (let k = i - p + 1; k <= i; k++) md += Math.abs(tp[k] - sm[i]); md /= p; return md === 0 ? 0 : (v - sm[i]) / (0.015 * md); });
}
function MFI(b, p = 14) {
  const tp = b.map((x) => (x.h + x.l + x.c) / 3), out = Array(b.length).fill(null);
  for (let i = p; i < b.length; i++) { let pos = 0, neg = 0; for (let k = i - p + 1; k <= i; k++) { const f = tp[k] * b[k].v; if (tp[k] > tp[k - 1]) pos += f; else if (tp[k] < tp[k - 1]) neg += f; } out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg); }
  return out;
}
function SUPERTREND(b, p = 10, m = 3) {
  const atr = ATR(b, p), n = b.length, dir = Array(n).fill(null), line = Array(n).fill(null);
  let fu = null, fl = null, d = 1;
  for (let i = 0; i < n; i++) {
    if (atr[i] == null) continue;
    const hl2 = (b[i].h + b[i].l) / 2, bu = hl2 + m * atr[i], bl = hl2 - m * atr[i];
    if (fu === null) { fu = bu; fl = bl; d = b[i].c >= hl2 ? 1 : -1; }
    else { const pc = b[i - 1].c; fu = bu < fu || pc > fu ? bu : fu; fl = bl > fl || pc < fl ? bl : fl; if (d === 1 && b[i].c < fl) d = -1; else if (d === -1 && b[i].c > fu) d = 1; }
    dir[i] = d; line[i] = d === 1 ? fl : fu;
  }
  return { dir, line };
}
function swingPoints(b, k = 4, lookback = 160) {
  const hi = [], lo = [], start = Math.max(k, b.length - lookback);
  for (let i = start; i < b.length - k; i++) {
    let isH = true, isL = true;
    for (let j = i - k; j <= i + k; j++) { if (j === i) continue; if (b[j].h > b[i].h) isH = false; if (b[j].l < b[i].l) isL = false; }
    if (isH) hi.push({ v: b[i].h, t: b[i].t }); if (isL) lo.push({ v: b[i].l, t: b[i].t });
  }
  return { hi, lo };
}
function pivotSet(h, l, c) {
  const P = (h + l + c) / 3, BC = (h + l) / 2, TC = 2 * P - BC, r = h - l;
  return { P, R1: 2 * P - l, R2: P + r, R3: h + 2 * (P - l), S1: 2 * P - h, S2: P - r, S3: l - 2 * (h - P),
    cprTop: Math.max(BC, TC), cprBot: Math.min(BC, TC), cprPct: (Math.abs(TC - BC) / P) * 100,
    H3: c + (r * 1.1) / 4, H4: c + (r * 1.1) / 2, L3: c - (r * 1.1) / 4, L4: c - (r * 1.1) / 2 };
}
function dedupeLevels(arr) { const o = []; arr.forEach((l) => { if (!o.length || Math.abs(l.v - last(o).v) / l.v > 0.002) o.push(l); }); return o; }
const levelsBelow = (L, x, gap, k) => dedupeLevels(L.filter((l) => isNum(l.v) && l.v < x - gap).sort((a, b) => b.v - a.v)).slice(0, k);
const levelsAbove = (L, x, gap, k) => dedupeLevels(L.filter((l) => isNum(l.v) && l.v > x + gap).sort((a, b) => a.v - b.v)).slice(0, k);

/* signal rows: v = +1 / 0 / -1 / null (n/a) */
const S = (name, reading, v) => ({ name, reading, v: isNum(v) ? v : null });
function tally(rows) { const use = rows.filter((r) => r.v !== null); const net = use.reduce((a, r) => a + r.v, 0); return { net, cnt: use.length, total: rows.length, ratio: use.length ? net / use.length : 0 }; }

/* ---------- market status (IST) ---------- */
function marketStatus(nowMs, lastDailyT) {
  const ist = new Date(nowMs + 19800000), dow = ist.getUTCDay(), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const inHours = dow >= 1 && dow <= 5 && mins >= 555 && mins <= 930; // 09:15–15:30
  const sameDay = istDate(nowMs / 1000) === istDate(lastDailyT);
  return { live: inHours && sameDay, inHours };
}

/* ============================================================
   REPORT 1 — INTRADAY
   ============================================================ */
function buildIntraday(D, X) {
  const b5 = D.intra?.bars;
  if (!b5 || b5.length < 30) return { ok: false, reason: '5-minute intraday feed is not available for this symbol right now.' };
  const sess = {}; b5.forEach((x) => { const d = istDate(x.t); (sess[d] = sess[d] || []).push(x); });
  const dates = Object.keys(sess).sort(), today = last(dates), Sx = sess[today], prevDate = dates.length > 1 ? dates[dates.length - 2] : null;
  const dmap = {}; X.daily.forEach((x) => { dmap[istDate(x.t)] = x; });
  const agg = (a) => ({ h: Math.max(...a.map((x) => x.h)), l: Math.min(...a.map((x) => x.l)), c: last(a).c, o: a[0].o });
  const ohlc = (d, pref) => (!d ? null : pref && dmap[d] ? dmap[d] : agg(sess[d]));
  const live = X.mk.live;
  const P = ohlc(prevDate, true), T = live ? agg(Sx) : ohlc(today, true), ref = live ? P : T;
  if (!ref) return { ok: false, reason: 'Not enough session history to build reference levels.' };
  const cmp = last(Sx).c, open = Sx[0].o, atrD = X.atrD;
  const gapPct = P ? (open / P.c - 1) * 100 : null;
  const sessH = Math.max(...Sx.map((x) => x.h)), sessL = Math.min(...Sx.map((x) => x.l));
  let pv = 0, vv = 0; Sx.forEach((x) => { pv += ((x.h + x.l + x.c) / 3) * x.v; vv += x.v; });
  const vwap = vv > 0 ? pv / vv : null;
  const orDone = Sx.length >= 3, ORH = orDone ? Math.max(...Sx.slice(0, 3).map((x) => x.h)) : null, ORL = orDone ? Math.min(...Sx.slice(0, 3).map((x) => x.l)) : null;
  const c5 = b5.map((x) => x.c), e9 = EMA(c5, 9), e21 = EMA(c5, 21), r5 = RSI(c5), a5 = ATR(b5), st5 = SUPERTREND(b5, 10, 3);
  const b15 = []; dates.forEach((d) => { const s = sess[d]; for (let i = 0; i < s.length; i += 3) { const ch = s.slice(i, i + 3); b15.push({ t: ch[0].t, o: ch[0].o, h: Math.max(...ch.map((x) => x.h)), l: Math.min(...ch.map((x) => x.l)), c: last(ch).c, v: ch.reduce((a, x) => a + x.v, 0) }); } });
  const c15 = b15.map((x) => x.c), f9 = EMA(c15, 9), f21 = EMA(c15, 21), r15 = RSI(c15);
  const nB = Sx.length, todayVol = Sx.reduce((a, x) => a + x.v, 0);
  const prior = dates.slice(0, -1).map((d) => sess[d]).filter((s) => s.length >= nB).map((s) => s.slice(0, nB).reduce((a, x) => a + x.v, 0));
  const rvol = prior.length >= 2 ? todayVol / (prior.reduce((a, b) => a + b, 0) / prior.length) : null;
  const rp = pivotSet(ref.h, ref.l, ref.c);

  const rows = [];
  rows.push(S('Price vs session VWAP', vwap == null ? 'VWAP unavailable (no volume)' : `CMP ${fmt(cmp)} ${cmp > vwap ? 'above' : 'below'} VWAP ${fmt(vwap)}`, vwap == null ? null : cmp > vwap ? 1 : -1));
  rows.push(S('5-min EMA 9 vs 21', `EMA9 ${fmt(at(e9))} ${at(e9) > at(e21) ? '>' : '<'} EMA21 ${fmt(at(e21))}`, at(e9) == null || at(e21) == null ? null : at(e9) > at(e21) ? 1 : -1));
  rows.push(S('15-min EMA 9 vs 21', `EMA9 ${fmt(at(f9))} ${at(f9) > at(f21) ? '>' : '<'} EMA21 ${fmt(at(f21))}`, at(f9) == null || at(f21) == null ? null : at(f9) > at(f21) ? 1 : -1));
  rows.push(S('5-min RSI (14)', `${fmt(at(r5), 1)} — ${at(r5) > 55 ? 'bullish momentum' : at(r5) < 45 ? 'bearish momentum' : 'neutral band 45–55'}`, at(r5) == null ? null : at(r5) > 55 ? 1 : at(r5) < 45 ? -1 : 0));
  rows.push(S('5-min Supertrend (10,3)', at(st5.dir) == null ? 'n/a' : `${at(st5.dir) === 1 ? 'Uptrend' : 'Downtrend'} · line ${fmt(at(st5.line))}`, at(st5.dir)));
  rows.push(S('Opening range (first 15 min)', orDone ? `OR ${fmt(ORL)} – ${fmt(ORH)} · CMP ${cmp > ORH ? 'above (breakout)' : cmp < ORL ? 'below (breakdown)' : 'inside range'}` : 'Opening range still forming', orDone ? (cmp > ORH ? 1 : cmp < ORL ? -1 : 0) : null));
  rows.push(S('CPR (from ' + (live ? 'previous' : 'last') + ' session)', `CPR ${fmt(rp.cprBot)} – ${fmt(rp.cprTop)} (${rp.cprPct.toFixed(2)}% wide · ${rp.cprPct < 0.3 ? 'narrow → trending-day bias' : rp.cprPct > 0.7 ? 'wide → range-day bias' : 'normal'}) · CMP ${cmp > rp.cprTop ? 'above' : cmp < rp.cprBot ? 'below' : 'inside'}`, cmp > rp.cprTop ? 1 : cmp < rp.cprBot ? -1 : 0));
  const t = tally(rows);
  const thin = t.cnt < 5;
  const bias = thin ? 'Neutral' : t.ratio >= 0.4 ? 'Bullish' : t.ratio <= -0.4 ? 'Bearish' : 'Neutral';

  const levels = [];
  const add = (v, label, type) => { if (isNum(v)) levels.push({ v, label, type }); };
  add(vwap, 'Session VWAP', 'dyn'); add(at(e21), '5-min EMA 21', 'dyn'); add(ORH, 'Opening-range high', 'sess'); add(ORL, 'Opening-range low', 'sess');
  add(sessH, 'Session high', 'sess'); add(sessL, 'Session low', 'sess'); add(ref.h, (live ? 'Prev' : 'Last') + ' session high', 'ref'); add(ref.l, (live ? 'Prev' : 'Last') + ' session low', 'ref');
  ['R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3'].forEach((k) => add(rp[k], 'Pivot ' + k, 'piv'));
  add(rp.cprTop, 'CPR top', 'cpr'); add(rp.cprBot, 'CPR bottom', 'cpr'); add(rp.H4, 'Camarilla H4', 'cam'); add(rp.H3, 'Camarilla H3', 'cam'); add(rp.L3, 'Camarilla L3', 'cam'); add(rp.L4, 'Camarilla L4', 'cam');

  const plan = { bias, live };
  const buf = 0.1 * atrD;
  if (bias === 'Bullish' || bias === 'Bearish') {
    const long = bias === 'Bullish';
    const slc = (long ? levelsBelow(levels, cmp, 0.15 * atrD, 1) : levelsAbove(levels, cmp, 0.15 * atrD, 1))[0];
    const tgs = long ? levelsAbove(levels, cmp, 0.25 * atrD, 2) : levelsBelow(levels, cmp, 0.25 * atrD, 2);
    plan.dir = long ? 'BUY / Long' : 'SELL / Short';
    plan.entry = cmp;
    plan.sl = slc ? (long ? slc.v - buf : slc.v + buf) : (long ? cmp - 0.35 * atrD : cmp + 0.35 * atrD);
    plan.slWhy = slc ? `beyond ${slc.label} (${fmt(slc.v)}) with 0.1×ATR buffer` : '0.35×daily ATR (no structural level nearby)';
    const proj = (m) => (long ? cmp + m * atrD : cmp - m * atrD);
    plan.t1 = tgs[0] ? tgs[0].v : proj(0.5); plan.t1Why = tgs[0] ? tgs[0].label : 'ATR-projected (0.5×daily ATR)';
    plan.t2 = tgs[1] ? tgs[1].v : proj(0.9); plan.t2Why = tgs[1] ? tgs[1].label : 'ATR-projected (0.9×daily ATR)';
    plan.rr1 = Math.abs(plan.t1 - cmp) / Math.abs(cmp - plan.sl); plan.rr2 = Math.abs(plan.t2 - cmp) / Math.abs(cmp - plan.sl);
    plan.quality = plan.rr1 >= 1.2 ? 'Acceptable R:R' : 'Poor R:R at CMP — wait for a pullback/retest toward the stop-side level before entering';
  } else {
    plan.dir = thin ? 'INCOMPLETE DATA' : 'WAIT — no edge';
    plan.longTrigger = live ? Math.max(isNum(ORH) ? ORH : -Infinity, sessH) : ref.h;
    plan.shortTrigger = live ? Math.min(isNum(ORL) ? ORL : Infinity, sessL) : ref.l;
  }
  return { ok: true, live, today, refDate: live ? prevDate : today, cmp, open, gapPct, sessH, sessL, vwap, ORH, ORL, orDone, rsi5: at(r5), rsi15: at(r15), atr5: at(a5), atrD,
    rvol, rangeAtr: (sessH - sessL) / atrD, todayVol, rp, ref, rows, t, bias, levels: levels.sort((a, b) => b.v - a.v), plan, sessions: dates.length, bars: Sx.length, c15: b15.filter((x) => istDate(x.t) === today).slice(-10), lastBarT: last(Sx).t };
}

/* ============================================================
   REPORT 2 — SHORT-TERM DELIVERY (swing, ~1–4 weeks)
   ============================================================ */
function buildSwing(D, X) {
  const { dly, C, ind, cmp, n, mk } = X, atr = at(ind.atr);
  const volIdx = mk.live ? n - 2 : n - 1;
  const avgV = (() => { let s = 0, k = 0; for (let i = volIdx - 20; i < volIdx; i++) if (dly[i]) { s += dly[i].v; k++; } return k ? s / k : null; })();
  const volRatio = avgV ? dly[volIdx].v / avgV : null;
  const dayUp = dly[volIdx].c >= dly[volIdx - 1].c;
  const hh20 = Math.max(...dly.slice(n - 21, n - 1).map((x) => x.h)), ll20 = Math.min(...dly.slice(n - 21, n - 1).map((x) => x.l));
  const e20 = at(ind.ema20), e50 = at(ind.ema50), s50 = at(ind.sma50), s200 = at(ind.sma200), rsi = at(ind.rsi);
  const mh = at(ind.macd.hist), mh1 = at(ind.macd.hist, 1), K = at(ind.st.K), Dd = at(ind.st.D), adx = at(ind.adx.adx), pdi = at(ind.adx.pdi), mdi = at(ind.adx.mdi);
  const obv = ind.obv, obvSma = SMA(obv, 20), bbU = at(ind.bb.up), bbL = at(ind.bb.lo), bbM = at(ind.bb.mid);
  const del = X.delLatest;
  const bench = X.benchRet, stk3 = X.ret.m3;

  const rows = [];
  rows.push(S('Price vs 20-day EMA', `CMP ${fmt(cmp)} ${cmp > e20 ? 'above' : 'below'} EMA20 ${fmt(e20)}`, e20 == null ? null : cmp > e20 ? 1 : -1));
  rows.push(S('EMA 20 vs EMA 50', `${fmt(e20)} ${e20 > e50 ? '>' : '<'} ${fmt(e50)}`, e20 == null || e50 == null ? null : e20 > e50 ? 1 : -1));
  rows.push(S('Price vs 50-day SMA', `CMP ${cmp > s50 ? 'above' : 'below'} SMA50 ${fmt(s50)}`, s50 == null ? null : cmp > s50 ? 1 : -1));
  rows.push(S('MACD (12,26,9)', `Line ${fmt(at(ind.macd.macd))} · Signal ${fmt(at(ind.macd.signal))} · Hist ${fmt(mh)} (${mh > mh1 ? 'rising' : 'falling'})`, mh == null ? null : mh > 0 ? 1 : -1));
  rows.push(S('RSI (14)', `${fmt(rsi, 1)} — ${rsi > 70 ? 'overbought, stretched (momentum strong)' : rsi < 30 ? 'oversold (reversal watch)' : rsi > 55 ? 'bullish zone' : rsi < 45 ? 'bearish zone' : 'neutral'}`, rsi == null ? null : rsi > 70 || rsi < 30 ? 0 : rsi > 55 ? 1 : rsi < 45 ? -1 : 0));
  rows.push(S('Stochastic (14,3,3)', `%K ${fmt(K, 1)} / %D ${fmt(Dd, 1)}`, K == null || Dd == null ? null : K > Dd && K < 80 ? 1 : K < Dd && K > 20 ? -1 : 0));
  rows.push(S('ADX (14) / DI', `ADX ${fmt(adx, 1)} · +DI ${fmt(pdi, 1)} · −DI ${fmt(mdi, 1)} — ${adx > 25 ? 'strong trend' : adx > 20 ? 'developing trend' : 'weak / no trend'}`, adx == null ? null : adx > 20 ? (pdi > mdi ? 1 : -1) : 0));
  rows.push(S('Supertrend (10,3) daily', at(ind.sup.dir) == null ? 'n/a' : `${at(ind.sup.dir) === 1 ? 'Uptrend' : 'Downtrend'} · line ${fmt(at(ind.sup.line))}`, at(ind.sup.dir)));
  rows.push(S('Bollinger (20,2)', bbM == null ? 'n/a' : `CMP ${cmp > bbM ? 'above' : 'below'} mid ${fmt(bbM)} · bands ${fmt(bbL)}–${fmt(bbU)} · width ${fmt(at(ind.bb.bw), 1)}%`, bbM == null ? null : cmp > bbM ? 1 : -1));
  rows.push(S('OBV vs its 20-day average', obvSma[n - 1] == null ? 'n/a' : `OBV ${obv[n - 1] > obvSma[n - 1] ? 'above' : 'below'} 20D avg (accumulation ${obv[n - 1] > obvSma[n - 1] ? 'building' : 'fading'})`, obvSma[n - 1] == null ? null : obv[n - 1] > obvSma[n - 1] ? 1 : -1));
  rows.push(S('Volume on last ' + (mk.live ? 'completed ' : '') + 'session', volRatio == null ? 'n/a' : `${volRatio.toFixed(2)}× 20-day avg on a ${dayUp ? 'up' : 'down'} day`, volRatio == null ? null : volRatio >= 1.3 ? (dayUp ? 1 : -1) : 0));
  rows.push(S('20-day breakout / breakdown', `20D high ${fmt(hh20)} · 20D low ${fmt(ll20)} — ${cmp > hh20 ? 'breakout' : cmp < ll20 ? 'breakdown' : 'inside range'}`, cmp > hh20 ? 1 : cmp < ll20 ? -1 : 0));
  rows.push(S('NSE delivery % (' + (del?.date || 'n/a') + ')', del ? `${fmt(del.pct, 1)}% delivered · ${del.pct >= 50 ? 'strong' : 'ordinary'} participation` : 'needs Apps Script backend (NSE blocks browser access)', del ? (del.pct >= 50 ? (dayUp ? 1 : -1) : 0) : null));
  rows.push(S('Relative strength vs Nifty 50 (3M)', isNum(bench?.m3) && isNum(stk3) ? `Stock ${fmtPct(stk3, 1)} vs Nifty ${fmtPct(bench.m3, 1)}` : 'benchmark feed unavailable', isNum(bench?.m3) && isNum(stk3) ? (stk3 > bench.m3 ? 1 : -1) : null));
  const t = tally(rows), r = t.ratio;
  const thin = t.cnt < 10;
  const rating = thin ? 'INCOMPLETE DATA' : r >= 0.5 ? 'BUY' : r >= 0.2 ? 'ACCUMULATE' : r > -0.2 ? 'HOLD / NEUTRAL' : r > -0.5 ? 'REDUCE / AVOID' : 'AVOID / EXIT';
  const tone = thin ? 'range' : r >= 0.2 ? 'bull' : r <= -0.2 ? 'bear' : 'range';
  const rr = thin ? 0 : r;

  // levels
  const sw = swingPoints(dly, 4, 120);
  const wk = D.weekly?.bars; let wp = null;
  if (wk && wk.length > 3) { const lastW = last(wk), useIdx = weekKey(lastW.t) === weekKey(X.nowMs / 1000) ? wk.length - 2 : wk.length - 1; const w = wk[useIdx]; if (w) wp = pivotSet(w.h, w.l, w.c); }
  const w52H = X.w52H, w52L = X.w52L, fib = X.fib;
  const levels = []; const add = (v, label, type) => { if (isNum(v)) levels.push({ v, label, type }); };
  sw.hi.forEach((p) => add(p.v, 'Swing high ' + istDate(p.t).slice(5), 'swing')); sw.lo.forEach((p) => add(p.v, 'Swing low ' + istDate(p.t).slice(5), 'swing'));
  add(e20, 'EMA 20', 'ma'); add(e50, 'EMA 50', 'ma'); add(s50, 'SMA 50', 'ma'); add(at(ind.sma100), 'SMA 100', 'ma'); add(s200, 'SMA 200', 'ma');
  add(bbU, 'Bollinger upper', 'bb'); add(bbL, 'Bollinger lower', 'bb'); add(w52H, '52-week high', 'range'); add(w52L, '52-week low', 'range');
  if (wp) ['R2', 'R1', 'P', 'S1', 'S2'].forEach((k) => add(wp[k], 'Weekly pivot ' + k, 'piv'));
  fib.levels.forEach((f) => add(f.level, 'Fib ' + (f.pct * 100).toFixed(1) + '%', 'fib')); fib.ext.forEach((f) => add(f.level, 'Fib ext ' + (f.pct * 100).toFixed(1) + '%', 'fib'));
  add(hh20, '20-day high', 'swing'); add(ll20, '20-day low', 'swing');

  const plan = { rating, tone, holding: '5–20 trading sessions' };
  const earn = X.nextEarnings;
  if (rr >= 0.2) {
    const ext = (cmp - e20) / atr, extended = ext > 1.5;
    const sup = levelsBelow(levels, cmp, 0, 3);
    const zLow = extended ? e20 : e20 != null && e20 < cmp ? e20 : sup[0]?.v ?? cmp - atr;
    const zHigh = extended ? e20 + 0.5 * atr : cmp;
    const entryRef = extended ? (zLow + zHigh) / 2 : cmp;
    const slLev = levelsBelow(levels.filter((l) => l.type === 'swing' || l.label === 'EMA 50' || l.label === 'SMA 50'), zLow, 0, 1)[0];
    let sl = slLev ? slLev.v - 0.5 * atr : entryRef - 2 * atr, slWhy = slLev ? `below ${slLev.label} (${fmt(slLev.v)}) − 0.5×ATR` : '2×ATR below entry (no swing support found)';
    if (entryRef - sl > 3 * atr) { sl = entryRef - 3 * atr; slWhy = 'capped at 3×ATR below entry'; } if (entryRef - sl < atr) { sl = entryRef - atr; slWhy = '1×ATR minimum stop to avoid noise'; }
    const tg = levelsAbove(levels, entryRef, 1.5 * atr, 2);
    plan.mode = 'long'; plan.entryLow = zLow; plan.entryHigh = zHigh; plan.entryRef = entryRef; plan.extended = extended; plan.sl = sl; plan.slWhy = slWhy;
    plan.t1 = tg[0] ? tg[0].v : entryRef + 2.5 * atr; plan.t1Why = tg[0] ? tg[0].label : 'ATR-projected (2.5×ATR)';
    plan.t2 = tg[1] ? tg[1].v : entryRef + 4 * atr; plan.t2Why = tg[1] ? tg[1].label : 'ATR-projected (4×ATR)';
    plan.rr1 = (plan.t1 - entryRef) / (entryRef - sl); plan.rr2 = (plan.t2 - entryRef) / (entryRef - sl);
    plan.note = (extended ? `Price is ${ext.toFixed(1)}×ATR above EMA20 — extended; staggered buying on pullback to the zone is safer than chasing. ` : '') + 'After Target 1, trail the stop to EMA 20 / Supertrend line.';
  } else if (rr <= -0.2) {
    plan.mode = 'avoid'; plan.reclaim = levelsAbove(levels.filter((l) => l.type === 'ma' || l.type === 'swing'), cmp, 0, 1)[0];
    plan.supports = levelsBelow(levels, cmp, 0, 3); plan.holderExit = plan.supports[0];
  } else {
    plan.mode = 'wait'; plan.thin = thin; plan.longTrigger = hh20; plan.shortTrigger = ll20;
  }
  if (earn && earn.days >= 0 && earn.days <= 25) plan.earnings = earn;
  const maRows = [['EMA 9', ind.ema9], ['EMA 20', ind.ema20], ['EMA 50', ind.ema50], ['SMA 50', ind.sma50], ['SMA 100', ind.sma100], ['SMA 200', ind.sma200]].map(([name, a]) => ({ name, val: at(a), slope: at(a, 5) ? (at(a) / at(a, 5) - 1) * 100 : null }));
  return { maRows, rows, t, rating, tone, plan, levels: levels.sort((a, b) => b.v - a.v), volRatio, hh20, ll20, wp, fib, metrics: { e20, e50, s50, s100: at(ind.sma100), s200, rsi, macd: at(ind.macd.macd), macdSig: at(ind.macd.signal), mh, K, Dd, adx, pdi, mdi, atr, bbU, bbM, bbL, bw: at(ind.bb.bw), cci: at(ind.cci), mfi: at(ind.mfi), st: at(ind.sup.dir), stLine: at(ind.sup.line), obvUp: obvSma[n - 1] != null ? obv[n - 1] > obvSma[n - 1] : null } };
}

/* ============================================================
   REPORT 3 — LONG-TERM DELIVERY (12–36 months)
   ============================================================ */
function buildLong(D, X) {
  const { cmp, n, C, ind, ret, fin, fd, dks, sd, price } = X; const raw = X.raw;
  const wk = D.weekly?.bars || [], WC = wk.map((x) => x.c), wn = WC.length;
  const s200 = at(ind.sma200), s200p = ind.sma200[n - 21], s50 = at(ind.sma50);
  const w10 = SMA(WC, 10), w40 = SMA(WC, 40), w200 = SMA(WC, 200), wr = RSI(WC), wm = MACD(WC);
  const tech = [];
  tech.push(S('Price vs 200-day SMA', s200 == null ? 'n/a' : `CMP ${cmp > s200 ? 'above' : 'below'} ${fmt(s200)}`, s200 == null ? null : cmp > s200 ? 1 : -1));
  tech.push(S('200-day SMA slope (1 month)', s200 == null || s200p == null ? 'n/a' : `${s200 > s200p ? 'Rising' : 'Falling'} (${fmtPct((s200 / s200p - 1) * 100, 1)})`, s200 == null || s200p == null ? null : s200 > s200p ? 1 : -1));
  tech.push(S('50-day vs 200-day SMA', s50 == null || s200 == null ? 'n/a' : `${s50 > s200 ? 'Golden-cross regime (50 > 200)' : 'Death-cross regime (50 < 200)'}`, s50 == null || s200 == null ? null : s50 > s200 ? 1 : -1));
  tech.push(S('Price vs 40-week SMA', at(w40) == null ? 'weekly feed unavailable' : `CMP ${cmp > at(w40) ? 'above' : 'below'} ${fmt(at(w40))}`, at(w40) == null ? null : cmp > at(w40) ? 1 : -1));
  tech.push(S('10-week vs 40-week SMA', at(w40) == null ? 'n/a' : `${fmt(at(w10))} ${at(w10) > at(w40) ? '>' : '<'} ${fmt(at(w40))}`, at(w40) == null ? null : at(w10) > at(w40) ? 1 : -1));
  tech.push(S('Weekly RSI (14)', at(wr) == null ? 'n/a' : `${fmt(at(wr), 1)} — ${at(wr) > 55 ? 'bullish' : at(wr) < 45 ? 'bearish' : 'neutral'}`, at(wr) == null ? null : at(wr) > 55 ? 1 : at(wr) < 45 ? -1 : 0));
  tech.push(S('Weekly MACD histogram', at(wm.hist) == null ? 'n/a' : `${fmt(at(wm.hist))} (${at(wm.hist) > 0 ? 'positive' : 'negative'})`, at(wm.hist) == null ? null : at(wm.hist) > 0 ? 1 : -1));
  tech.push(S('1-year price return', isNum(ret.y1) ? fmtPct(ret.y1, 1) : 'n/a', isNum(ret.y1) ? (ret.y1 > 0 ? 1 : -1) : null));
  tech.push(S('Relative strength vs Nifty 50 (1Y)', isNum(X.benchRet?.y1) && isNum(ret.y1) ? `Stock ${fmtPct(ret.y1, 1)} vs Nifty ${fmtPct(X.benchRet.y1, 1)}` : 'benchmark feed unavailable', isNum(X.benchRet?.y1) && isNum(ret.y1) ? (ret.y1 > X.benchRet.y1 ? 1 : -1) : null));

  // fundamentals
  const financial = /financial/i.test(X.sector || '');
  const F = []; const addF = (group, name, value, reading, v) => F.push({ group, name, value, reading, v: isNum(v) ? v : null });
  const peOwn = raw(sd.trailingPE), pe = peOwn ?? X.derived.pe, peCalc = !isNum(peOwn) && isNum(pe), fpe = raw(sd.forwardPE) ?? raw(dks.forwardPE), pegOwn = raw(dks.pegRatio), peg = pegOwn ?? X.derived.peg, pb = raw(dks.priceToBook), ps = raw(sd.priceToSalesTrailing12Months), evE = raw(dks.enterpriseToEbitda);
  const eps = raw(dks.trailingEps), bv = raw(dks.bookValue);
  addF('Valuation', 'P/E (trailing)', isNum(pe) ? pe.toFixed(1) : '—', isNum(pe) ? (pe <= 0 ? 'loss-making' : pe < 25 ? 'reasonable (<25)' : pe > 50 ? 'expensive (>50)' : 'fair (25–50)') + (peCalc ? ' · computed: price ÷ filed EPS' : '') : 'n/a', isNum(pe) && pe > 0 ? (pe < 25 ? 1 : pe > 50 ? -1 : 0) : null);
  addF('Valuation', 'P/E (forward)', isNum(fpe) ? fpe.toFixed(1) : '—', isNum(fpe) && isNum(pe) ? (fpe < pe ? 'earnings expected to grow' : 'earnings expected to shrink') : 'n/a', null);
  addF('Valuation', 'PEG ratio', isNum(peg) ? peg.toFixed(2) : '—', isNum(peg) ? (peg < 1.5 ? 'growth-adjusted cheap (<1.5)' : peg > 3 ? 'rich (>3)' : 'fair') + (!isNum(pegOwn) ? ' · computed: P/E ÷ filed EPS growth' : '') : 'n/a', isNum(peg) && peg > 0 ? (peg < 1.5 ? 1 : peg > 3 ? -1 : 0) : null);
  addF('Valuation', 'P/B', isNum(pb) ? pb.toFixed(2) : '—', isNum(pb) ? (financial ? (pb < 2 ? 'sensible for a financial' : 'premium') : 'reference') : 'n/a', null);
  addF('Valuation', 'P/S (TTM)', isNum(ps) ? ps.toFixed(2) : '—', 'reference', null);
  addF('Valuation', 'EV/EBITDA', isNum(evE) ? evE.toFixed(1) : '—', financial ? 'not meaningful for financials' : 'reference', null);
  const graham = isNum(eps) && isNum(bv) && eps > 0 && bv > 0 ? Math.sqrt(22.5 * eps * bv) : null;
  addF('Valuation', 'Graham number', isNum(graham) ? '₹' + fmt(graham) : '—', isNum(graham) ? `CMP is ${fmtPct((cmp / graham - 1) * 100, 0)} vs Graham value (conservative yardstick, penalises growth stocks)` : 'needs positive EPS & book value', null);
  const roeOwn = raw(fd.returnOnEquity), roe = roeOwn ?? X.derived.roe, roa = raw(fd.returnOnAssets), pmOwn = raw(fd.profitMargins), pm = pmOwn ?? X.derived.pmTtm ?? X.derived.pm, om = raw(fd.operatingMargins), gm = raw(fd.grossMargins);
  addF('Profitability', 'ROE', isNum(roe) ? fmtPct(roe * 100, 1) : '—', isNum(roe) ? (roe >= 0.15 ? 'strong (≥15%)' : roe < 0.08 ? 'weak (<8%)' : 'average') + (!isNum(roeOwn) ? ' · computed: latest FY profit ÷ equity' : '') : 'n/a', isNum(roe) ? (roe >= 0.15 ? 1 : roe < 0.08 ? -1 : 0) : null);
  addF('Profitability', 'ROA', isNum(roa) ? fmtPct(roa * 100, 1) : '—', 'reference', null);
  addF('Profitability', 'Net profit margin', isNum(pm) ? fmtPct(pm * 100, 1) : '—', isNum(pm) ? (pm >= 0.10 ? 'healthy (≥10%)' : pm < 0.03 ? 'thin (<3%)' : 'moderate') + (!isNum(pmOwn) ? ' · computed from filed results' : '') : 'n/a', isNum(pm) ? (pm >= 0.10 ? 1 : pm < 0.03 ? -1 : 0) : null);
  addF('Profitability', 'Operating margin', isNum(om) ? fmtPct(om * 100, 1) : '—', 'reference', null);
  addF('Profitability', 'Gross margin', isNum(gm) ? fmtPct(gm * 100, 1) : '—', 'reference', null);
  const rg = raw(fd.revenueGrowth), eg = raw(fd.earningsGrowth);
  addF('Growth', 'Revenue CAGR (annual statements)', isNum(fin.revCagr) ? fmtPct(fin.revCagr * 100, 1) + ` over ${fin.years - 1}Y` : '—', isNum(fin.revCagr) ? (fin.revCagr >= 0.10 ? 'compounding ≥10%' : fin.revCagr < 0 ? 'shrinking' : 'slow') : 'annual statement feed unavailable', isNum(fin.revCagr) ? (fin.revCagr >= 0.10 ? 1 : fin.revCagr < 0 ? -1 : 0) : null);
  addF('Growth', 'Net income CAGR (annual statements)', isNum(fin.niCagr) ? fmtPct(fin.niCagr * 100, 1) + ` over ${fin.years - 1}Y` : '—', isNum(fin.niCagr) ? (fin.niCagr >= 0.10 ? 'compounding ≥10%' : fin.niCagr < 0 ? 'declining' : 'slow') : 'n/a (needs positive start & end)', isNum(fin.niCagr) ? (fin.niCagr >= 0.10 ? 1 : fin.niCagr < 0 ? -1 : 0) : null);
  const deOwn = raw(fd.debtToEquity), de = deOwn ?? X.derived.de, cr = raw(fd.currentRatio), fcfOwn = raw(fd.freeCashflow), fcf = fcfOwn ?? X.derived.fcf, ocf = raw(fd.operatingCashflow) ?? X.derived.ocf, debt = raw(fd.totalDebt), cash = raw(fd.totalCash);
  addF('Balance sheet & cash', 'Debt / Equity', isNum(de) ? (de / 100).toFixed(2) + '×' : '—', financial ? 'not meaningful for financials' : isNum(de) ? (de < 50 ? 'low leverage (<0.5×)' : de > 150 ? 'high leverage (>1.5×)' : 'moderate') + (!isNum(deOwn) ? ' · computed: debt ÷ equity (latest FY)' : '') : 'n/a', financial || !isNum(de) ? null : de < 50 ? 1 : de > 150 ? -1 : 0);
  addF('Balance sheet & cash', 'Current ratio', isNum(cr) ? cr.toFixed(2) : '—', financial ? 'not meaningful for financials' : 'reference', null);
  addF('Balance sheet & cash', 'Free cash flow (TTM)', isNum(fcf) ? fmtMoney(fcf) : '—', financial ? 'not meaningful for financials' : isNum(fcf) ? (fcf > 0 ? 'positive' : 'negative') + (!isNum(fcfOwn) ? ' · from annual statements' : '') : 'n/a', financial || !isNum(fcf) ? null : fcf > 0 ? 1 : -1);
  addF('Balance sheet & cash', 'Operating cash flow (TTM)', isNum(ocf) ? fmtMoney(ocf) : '—', 'reference', null);
  addF('Balance sheet & cash', 'Total debt / cash', `${fmtMoney(debt)} / ${fmtMoney(cash)}`, 'reference', null);
  const dr = raw(sd.dividendRate), dyVal = isNum(dr) && cmp ? (dr / cmp) * 100 : isNum(raw(sd.dividendYield)) ? raw(sd.dividendYield) * 100 : null, payout = raw(sd.payoutRatio);
  addF('Shareholder returns', 'Dividend yield', isNum(dyVal) ? dyVal.toFixed(2) + '%' : '—', isNum(dyVal) ? (dyVal >= 1 ? 'income support' : 'token') : 'no dividend data', null);
  addF('Shareholder returns', 'Payout ratio', isNum(payout) ? fmtPct(payout * 100, 0) : '—', 'reference', null);
  const hiOwn = raw(dks.heldPercentInsiders), hi = hiOwn ?? X.derived.promoter, hinst = raw(dks.heldPercentInstitutions);
  addF('Ownership', 'Promoter / insider holding', isNum(hi) ? fmtPct(hi * 100, 1) : '—', isNum(hi) ? (hi >= 0.5 ? 'high skin-in-the-game' : 'moderate') + (!isNum(hiOwn) ? ' · NSE shareholding pattern ' + (X.derived.holdDate || '') : '') : 'n/a (verify on exchange shareholding pattern)', null);
  addF('Ownership', 'Institutional holding', isNum(hinst) ? fmtPct(hinst * 100, 1) : '—', 'reference', null);
  const rec = raw(fd.recommendationMean), nA = raw(fd.numberOfAnalystOpinions), tgt = raw(fd.targetMeanPrice), tHi = raw(fd.targetHighPrice), tLo = raw(fd.targetLowPrice);
  const okA = isNum(nA) && nA >= 3;
  addF('Street view', 'Analyst consensus (1=Strong Buy … 5=Sell)', isNum(rec) ? `${rec.toFixed(2)} · ${esc(fd.recommendationKey || '')} · ${isNum(nA) ? nA + ' analysts' : ''}` : '—', isNum(rec) ? (okA ? (rec <= 2.5 ? 'Street positive' : rec >= 3.5 ? 'Street negative' : 'Street neutral') : 'fewer than 3 analysts — not scored') : 'n/a', okA && isNum(rec) ? (rec <= 2.5 ? 1 : rec >= 3.5 ? -1 : 0) : null);
  const upside = isNum(tgt) ? (tgt / cmp - 1) * 100 : null;
  addF('Street view', 'Mean target price', isNum(tgt) ? `₹${fmt(tgt)} (${fmtPct(upside, 1)}) · range ₹${fmt(tLo, 0)}–₹${fmt(tHi, 0)}` : '—', isNum(tgt) ? (okA ? (upside >= 15 ? 'meaningful upside (≥15%)' : upside <= 0 ? 'price above consensus target' : 'limited upside') : 'few analysts — not scored') : 'n/a', okA && isNum(tgt) ? (upside >= 15 ? 1 : upside <= 0 ? -1 : 0) : null);

  X.res.rows.forEach((r) => addF('Recent results', r.name, r.value, r.reading, r.v));
  const res = X.res;
  const tt = tally(tech), ft = tally(F.map((f) => ({ v: f.v })));
  const all = tally([...tech, ...F.map((f) => ({ v: f.v }))]);
  const othersF = tally(F.filter((f) => f.group !== 'Recent results').map((f) => ({ v: f.v })));
  const fundRatio = res.cnt >= 3 && othersF.cnt >= 3 ? 0.5 * res.ratio + 0.5 * othersF.ratio : res.cnt >= 3 ? res.ratio : othersF.ratio;
  /* Horizon-aware call: weight technicals by wT, business (recent results 50% + quality/valuation 50%) by 1-wT, then apply business gates. Delivery calls never go 'short'. */
  function horizonCall(wT, techRatio) {
    if (othersF.cnt + res.cnt < 5) return { call: 'INCOMPLETE DATA', b: null, notes: ['Fundamentals / results feed unavailable'] };
    const b = wT * techRatio + (1 - wT) * fundRatio, notes = []; let call = callFrom(b);
    if (res.weak && RANK[call] > RANK.HOLD) { call = 'HOLD'; notes.push('Capped at HOLD — recent results are deteriorating, so the chart alone cannot justify a buy'); }
    if (wT <= 0.4) {
      if (res.strong && RANK[call] < RANK.HOLD) { call = 'HOLD'; notes.push('Floored at HOLD — recent results are strong; price weakness alone is not a reason to exit'); }
      if (call === 'BUY' && techRatio <= -0.3) { call = 'ACCUMULATE'; notes.push('Stagger entries — business is strong but the price trend is still weak'); }
    }
    return { call, b, notes };
  }
  const headline = horizonCall(0.15, tt.ratio), gateNotes = headline.notes;
  const rating = tt.cnt < 4 ? 'INCOMPLETE DATA — price history short' : headline.call === 'INCOMPLETE DATA' ? 'INCOMPLETE DATA — fundamentals / results feed missing' : headline.call;
  const tone = toneOf(rating);

  // zones & references
  const lv = []; const add = (v, label) => { if (isNum(v)) lv.push({ v, label }); };
  add(s200, '200-day SMA'); add(at(w40), '40-week SMA'); add(at(w200), '200-week SMA'); add(X.w52L, '52-week low');
  X.lfib.levels.forEach((f) => { if (f.pct === 0.5 || f.pct === 0.618) add(f.level, `2-yr swing Fib ${(f.pct * 100).toFixed(1)}%`); });
  const zones = levelsBelow(lv, cmp, 0, 3);
  const refs = []; const addR = (v, label) => { if (isNum(v)) refs.push({ v, label }); };
  addR(X.w52H, '52-week high'); addR(X.tenYH, `${wn > 400 ? '10' : Math.round(wn / 52)}-yr high (weekly)`); addR(tgt, 'Analyst mean target (Street, not a forecast by this tool)'); addR(X.lfib.ext[0].level, '2-yr swing 127.2% extension (technical reference)');
  const ups = levelsAbove(refs, cmp, 0, 4);
  const trendBelow = [at(w40), s200].filter((v) => isNum(v) && v < cmp);
  const plan = { zones, ups, weeklyRisk: trendBelow.length ? Math.max(...trendBelow) : null, belowTrend: !trendBelow.length, hardFloor: X.w52L, horizon: '2–5 years', dd: X.tenYH ? Math.min(0, (cmp / X.tenYH - 1) * 100) : null };
  return { tech, F, tt, ft, all, res, fundRatio, horizonCall, gateNotes, rating, tone, plan, ret, financial, graham, fin, wk: { w10: at(w10), w40: at(w40), w200: at(w200), rsi: at(wr), hist: at(wm.hist) } };
}

/* ============================================================
   RECENT RESULTS · PIVOTS · DELIVERY · CALL MATRIX (horizon-aware)
   ============================================================ */
const qLabel = (d) => { try { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }); } catch (e) { return d; } };
const dShort = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
function analyseResults(tsq, ts, fd, raw) {
  const rows = [], q = (k) => (tsq && tsq[k] && tsq[k].length ? tsq[k] : null);
  const rev = q('quarterlyTotalRevenue'), ni = q('quarterlyNetIncome');
  const info = { quarters: [], lossQtrs: null, revY: null, niG: null, niV: null, revNeg: false, bothFalling: false, asOf: rev ? qLabel(last(rev).date) : ni ? qLabel(last(ni).date) : null };
  const add = (name, value, reading, v) => rows.push({ name, value, reading, v: isNum(v) ? v : null });
  const gv = (g) => (g >= 0.10 ? 1 : g < 0 ? -1 : 0);
  const yoy = (a) => (a && a.length >= 5 ? { x: last(a).val, y: a[a.length - 5].val } : null);
  const qtag = info.asOf ? 'Qtr ' + info.asOf + ' · ' : '';
  // revenue YoY
  const ry = yoy(rev); let revG = ry && ry.y > 0 ? ry.x / ry.y - 1 : null, revSrc = 'quarterly statements';
  if (revG == null && isNum(raw(fd.revenueGrowth))) { revG = raw(fd.revenueGrowth); revSrc = 'Yahoo summary'; }
  info.revY = revG; info.revNeg = isNum(revG) && revG < 0;
  add('Latest quarter revenue YoY', isNum(revG) ? fmtPct(revG * 100, 1) : '—', isNum(revG) ? `${qtag}${revG >= 0.10 ? 'growing ≥10%' : revG < 0 ? 'shrinking' : 'slow growth'} (${revSrc})` : 'quarterly feed unavailable', isNum(revG) ? gv(revG) : null);
  // net profit YoY
  const ny = yoy(ni); let niG = null, niV = null, niTxt = null;
  if (ny) {
    if (ny.y > 0) { niG = ny.x / ny.y - 1; niV = ny.x < 0 ? -1 : gv(niG); niTxt = ny.x < 0 ? 'swung to a loss' : niG >= 0.1 ? 'growing ≥10%' : niG < 0 ? 'declining' : 'slow growth'; }
    else if (ny.x > 0) { niV = 1; niTxt = 'turned profitable (year-ago quarter was a loss)'; }
    else { niV = -1; niTxt = 'loss-making in both periods'; }
  } else if (isNum(raw(fd.earningsGrowth))) { niG = raw(fd.earningsGrowth); niV = gv(niG); niTxt = `${niG >= 0.1 ? 'growing ≥10%' : niG < 0 ? 'declining' : 'slow growth'} (Yahoo summary)`; }
  info.niG = niG; info.niV = niV;
  add('Latest quarter net profit YoY', isNum(niG) ? fmtPct(niG * 100, 1) : niV > 0 ? 'Turnaround' : niV < 0 ? 'Loss' : '—', niTxt ? qtag + niTxt : 'quarterly feed unavailable', niV);
  // 3-quarter direction
  const trend3 = (a, name) => {
    if (!a || a.length < 3) return false;
    const t = a.slice(-3).map((x) => x.val), up = t[2] > t[1] && t[1] > t[0], dn = t[2] < t[1] && t[1] < t[0];
    add(name, t.map(fmtMoney).join(' → '), up ? 'rising two quarters in a row' : dn ? 'falling two quarters in a row' : 'mixed / sideways', up ? 1 : dn ? -1 : 0);
    return dn;
  };
  const rf = trend3(rev, 'Revenue — last 3 quarters'), nf = trend3(ni, 'Net profit — last 3 quarters');
  info.bothFalling = rf && nf;
  // margins
  if (rev && ni) {
    const m = rev.map((r) => { const n = ni.find((x) => x.date === r.date); return n && r.val > 0 ? (n.val / r.val) * 100 : null; }).filter(isNum);
    if (m.length >= 3) { const lt = last(m), pr = m.slice(Math.max(0, m.length - 4), m.length - 1), pm = pr.reduce((a, b) => a + b, 0) / pr.length, d = lt - pm; add('Net margin trend', `${lt.toFixed(1)}% vs ${pm.toFixed(1)}% prior-qtr avg`, d > 1 ? 'margins expanding' : d < -1 ? 'margins compressing' : 'margins stable', d > 1 ? 1 : d < -1 ? -1 : 0); }
  }
  if (ni && ni.length) { const l4 = ni.slice(-4), loss = l4.filter((x) => x.val < 0).length; info.lossQtrs = loss; add(`Loss-making quarters (last ${l4.length})`, String(loss), loss === 0 ? 'profitable every quarter' : `${loss} loss-making quarter(s)`, loss === 0 ? 1 : -1); }
  // latest full year
  const ann = (k) => (ts && ts[k] && ts[k].length >= 2 ? ts[k] : null), ar = ann('annualTotalRevenue'), an = ann('annualNetIncome');
  if (ar) { const a = last(ar), b = ar[ar.length - 2]; if (b.val > 0) { const g = a.val / b.val - 1; add('Latest FY revenue growth', fmtPct(g * 100, 1), `FY${a.date.slice(0, 4)} vs FY${b.date.slice(0, 4)}`, gv(g)); } }
  if (an) { const a = last(an), b = an[an.length - 2]; if (b.val > 0) { const g = a.val / b.val - 1; add('Latest FY net profit growth', fmtPct(g * 100, 1), `FY${a.date.slice(0, 4)} vs FY${b.date.slice(0, 4)}`, a.val < 0 ? -1 : gv(g)); } else if (a.val > 0) add('Latest FY net profit growth', 'Turnaround', `FY${a.date.slice(0, 4)} profitable after a loss year`, 1); }
  // table of last quarters
  const dates = [...new Set([...(rev || []), ...(ni || [])].map((x) => x.date))].sort().slice(-5), g = (a, d) => a?.find((x) => x.date === d)?.val ?? null;
  info.quarters = dates.map((d) => ({ date: d, rev: g(rev, d), ni: g(ni, d), opi: g(q('quarterlyOperatingIncome'), d), eps: g(q('quarterlyDilutedEPS'), d) }));
  const t = tally(rows);
  const strong = t.cnt >= 3 && t.ratio >= 0.4 && (info.lossQtrs === 0 || info.lossQtrs === null);
  const weak = t.cnt >= 3 && (t.ratio <= -0.3 || info.lossQtrs >= 2 || (info.revNeg && niV === -1));
  return { rows, info, t, cnt: t.cnt, ratio: t.ratio, strong, weak };
}
function groupHLC(dly, keyFn) {
  const g = []; let cur = null;
  for (const b of dly) { const k = keyFn(b.t); if (k !== cur) { g.push({ k, t: b.t, h: b.h, l: b.l, c: b.c }); cur = k; } else { const x = last(g); x.h = Math.max(x.h, b.h); x.l = Math.min(x.l, b.l); x.c = b.c; } }
  return g;
}
function buildPivots(dly, nowMs, live) {
  const n = dly.length, out = {}, ref = live ? dly[n - 2] : dly[n - 1];
  if (ref) out.daily = { set: pivotSet(ref.h, ref.l, ref.c), label: 'Daily · ' + dShort(istDate(ref.t)) };
  const ist = new Date(nowMs + 19800000), dow = ist.getUTCDay(), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const weekend = dow === 0 || dow === 6 || (dow === 5 && mins > 930);
  const wk = groupHLC(dly, weekKey), w = weekend || last(wk).k !== weekKey(nowMs / 1000) ? last(wk) : wk[wk.length - 2];
  if (w) out.weekly = { set: pivotSet(w.h, w.l, w.c), label: 'Weekly · wk of ' + dShort(w.k) };
  const mo = groupHLC(dly, (t) => istDate(t).slice(0, 7)), m = last(mo).k !== istDate(nowMs / 1000).slice(0, 7) ? last(mo) : mo[mo.length - 2];
  if (m) out.monthly = { set: pivotSet(m.h, m.l, m.c), label: 'Monthly · ' + new Date(m.k + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }) };
  return out;
}
function intradayFraction(b5) {
  if (!b5 || b5.length < 30) return null;
  const sess = {}; b5.forEach((x) => { const d = istDate(x.t); (sess[d] = sess[d] || []).push(x); });
  const dates = Object.keys(sess).sort(), nB = sess[last(dates)].length;
  const fr = dates.slice(0, -1).map((d) => sess[d]).filter((s) => s.length >= 70).map((s) => { const tot = s.reduce((a, x) => a + x.v, 0); return tot > 0 ? s.slice(0, nB).reduce((a, x) => a + x.v, 0) / tot : null; }).filter(isNum);
  return fr.length >= 2 ? fr.reduce((a, b) => a + b, 0) / fr.length : null;
}
function deliveryMetrics(deliv, X, b5) {
  if (!deliv || !deliv.hist || !deliv.hist.length) return { ok: false, latest: null, today: null, prev: null };
  const today = istDate(last(X.dly).t), hist = deliv.hist;
  const todayRow = hist.find((r) => r.date === today), prevRows = hist.filter((r) => r.date < today), prevRow = last(prevRows) || null;
  const a5 = prevRows.slice(-5).filter((r) => isNum(r.pct)), avgPct = a5.length ? a5.reduce((a, r) => a + r.pct, 0) / a5.length : null;
  const vToday = X.dly[X.n - 1].v; let proj = null, frac = null;
  if (!X.mk.live) proj = vToday; else { frac = intradayFraction(b5); if (frac) proj = vToday / frac; }
  let t = null;
  if (todayRow) t = { kind: 'Actual', qty: todayRow.del, pct: todayRow.pct };
  else if (isNum(proj) && isNum(avgPct)) t = { kind: 'Expected (est.)', qty: (proj * avgPct) / 100, pct: avgPct };
  const lat = todayRow || prevRow;
  return { ok: true, today: t, prev: prevRow ? { qty: prevRow.del, pct: prevRow.pct, date: prevRow.date } : null, latest: lat && isNum(lat.pct) ? { pct: lat.pct, date: lat.date } : null, proj, frac, avgPct };
}
const RANK = { 'AVOID / EXIT': 0, REDUCE: 1, HOLD: 2, ACCUMULATE: 3, BUY: 4 };
const callFrom = (b) => (b >= 0.45 ? 'BUY' : b >= 0.2 ? 'ACCUMULATE' : b > -0.2 ? 'HOLD' : b > -0.5 ? 'REDUCE' : 'AVOID / EXIT');
const toneOf = (c) => (/INCOMPLETE|WAIT|HOLD|n\/a/.test(c) ? 'range' : /BUY|ACCUMULATE|Long/.test(c) ? 'bull' : /AVOID|REDUCE|Short|EXIT/.test(c) ? 'bear' : 'range');
const sg = (t) => `${t.net >= 0 ? '+' : ''}${t.net}/${t.cnt}`;
function buildMatrix(R) {
  const I = R.intraday, W = R.swing, Lg = R.long, res = Lg.res, m = W.metrics, cmp = R.cmp, closes = R.closes, rows = [];
  const pc = (v) => fmtPct(((v - cmp) / cmp) * 100, 1);
  const lv = (label, v, sub) => ({ label, v: typeof v === 'string' ? v : isNum(v) ? '₹' + fmt(v) : '—', n: typeof v === 'number' && isNum(v) ? v : null, sub: sub || '' });
  const gs = [R.ret.cagr3, R.ret.cagr5, isNum(Lg.fin.niCagr) ? Lg.fin.niCagr * 100 : null, isNum(Lg.fin.revCagr) ? Lg.fin.revCagr * 100 : null, isNum(res.info.niG) ? Math.min(45, res.info.niG * 100) : null];
  const tDays = (t) => `${pc(t)} · ${fmtDays(daysToTarget(t, cmp, closes))}`, tYrs = (t) => `${pc(t)} · ${fmtYears(yearsToTarget(cmp, t, gs))}`;
  const upChips = (ups, k, fn) => ups.slice(0, k).map((u, i) => lv(`Target ${i + 1} · ${u.label.replace(/\s*\(.*?\)/g, '')}`, u.v, fn(u.v)));
  const conf = (b, cov) => (cov < 0.6 ? 'Low — data-limited' : Math.abs(b) >= 0.4 ? 'High' : Math.abs(b) >= 0.2 ? 'Medium' : 'Low — mixed signals');
  const trendTxt = `price ${m.s200 != null ? (cmp > m.s200 ? 'above' : 'below') + ' 200-DMA' : '200-DMA n/a'}, ${m.e20 > m.e50 ? 'EMA20 > EMA50' : 'EMA20 < EMA50'}, Supertrend ${m.st === 1 ? 'up' : 'down'}`;
  const i = res.info;
  const resTxt = res.cnt < 3 ? 'Recent-results feed incomplete — results not used.' : 'Results' + (i.asOf ? ' (qtr ' + i.asOf + ')' : '') + ': ' + [isNum(i.revY) ? `revenue ${fmtPct(i.revY * 100, 1)} YoY` : null, isNum(i.niG) ? `net profit ${fmtPct(i.niG * 100, 1)} YoY` : i.niV > 0 ? 'net profit turned positive' : i.niV < 0 ? 'net profit in loss' : null, i.lossQtrs === 0 ? 'no loss quarters' : i.lossQtrs > 0 ? i.lossQtrs + ' loss quarter(s)' : null].filter(Boolean).join(', ') + '.';
  // 1 intraday — % to target from entry
  if (I.ok) {
    const p = I.plan, g = (t) => (Math.abs(t - p.entry) / p.entry) * 100;
    rows.push({ horizon: 'Intraday', sub: 'same session · MIS', call: p.dir, conf: conf(I.t.ratio, I.t.cnt / I.t.total), basis: `Live technicals ${sg(I.t)} — VWAP, 5/15-min EMA, RSI, Supertrend, opening range, CPR.${I.live ? '' : ' Market closed: plan is for the next session.'}`,
      levels: p.entry != null ? [lv('Entry', p.entry, 'same session'), lv('Stop', p.sl, `${g(p.sl).toFixed(2)}% risk`), lv('Target 1', p.t1, `+${g(p.t1).toFixed(2)}% · R:R ${p.rr1.toFixed(2)}`), lv('Target 2', p.t2, `+${g(p.t2).toFixed(2)}% · R:R ${p.rr2.toFixed(2)}`)] : [lv('Long above', p.longTrigger, pc(p.longTrigger) + ' from CMP'), lv('Short below', p.shortTrigger, pc(p.shortTrigger) + ' from CMP')],
      review: 'Square off by 3:15 PM IST — valid for one session only.', notes: [] });
  } else rows.push({ horizon: 'Intraday', sub: 'same session · MIS', call: 'n/a', conf: '—', basis: I.reason, levels: [], review: '', notes: [] });
  // 2 swing — % and trading days to target
  const wp = W.plan, wr = (t) => `${fmtPct(((t - (wp.entryRef || cmp)) / (wp.entryRef || cmp)) * 100, 1)} · ${fmtDays(daysToTarget(t, cmp, closes))}`;
  rows.push({ horizon: 'Swing', sub: '1–4 weeks · delivery', call: W.rating, conf: conf(W.t.ratio, W.t.cnt / W.t.total), basis: `Technicals ${sg(W.t)} — ${trendTxt}.`,
    levels: wp.mode === 'long' ? [lv('Entry zone', `₹${fmt(wp.entryLow)} – ₹${fmt(wp.entryHigh)}`), lv('Stop', wp.sl, `−${(((wp.entryRef - wp.sl) / wp.entryRef) * 100).toFixed(1)}% risk`), lv('Target 1', wp.t1, wr(wp.t1)), lv('Target 2', wp.t2, wr(wp.t2))] : wp.mode === 'avoid' ? [lv('Re-entry above', wp.reclaim?.v, wp.reclaim ? pc(wp.reclaim.v) : ''), lv('Holder exit below', wp.holderExit?.v, wp.holderExit ? pc(wp.holderExit.v) : '')] : [lv('Buy above', wp.longTrigger, pc(wp.longTrigger) + ' from CMP'), lv('Weak below', wp.shortTrigger, pc(wp.shortTrigger) + ' from CMP')],
    review: 'Re-assess in 5–20 sessions or on a close beyond the stop.', notes: [].concat(wp.earnings ? ['Results due in ' + wp.earnings.days + ' days — gap risk inside the window'] : [], res.weak ? ['Recent business results are weak — treat as a momentum trade only, keep the stop tight and do not average down'] : []) });
  // 3-5 horizon-weighted
  const zs = (a) => (a.length ? a.map((z) => '₹' + fmt(z.v)).join(' / ') : '—');
  const risk = Lg.plan.weeklyRisk != null ? 'Weekly close < ₹' + fmt(Lg.plan.weeklyRisk) : 'Price already below both trend lines', riskSub = Lg.plan.weeklyRisk != null ? pc(Lg.plan.weeklyRisk) + ' from CMP' : '';
  const cov = Math.min(1, Lg.ft.cnt / 12);
  const zoneChips = (k) => Lg.plan.zones.slice(0, k).map((z) => lv('Accumulate · ' + z.label, z.v, pc(z.v) + ' from CMP'));
  [
    { horizon: 'Positional', sub: '1–3 months · delivery', wT: 0.65, tr: (W.t.ratio + Lg.tt.ratio) / 2, levels: [lv('Buy zone', wp.mode === 'long' ? `₹${fmt(wp.entryLow)} – ₹${fmt(wp.entryHigh)}` : zs(Lg.plan.zones.slice(0, 2))), lv('Risk line', wp.mode === 'long' ? wp.sl : risk, wp.mode === 'long' ? pc(wp.sl) + ' from CMP' : riskSub)].concat(wp.mode === 'long' ? [lv('Target', wp.t2, tDays(wp.t2))] : upChips(Lg.plan.ups, 1, tDays)), review: 'Review monthly and after the next quarterly result.' },
    { horizon: 'Medium term', sub: '6–12 months', wT: 0.4, tr: Lg.tt.ratio, levels: zoneChips(2).concat([lv('Risk line', risk, riskSub)], upChips(Lg.plan.ups, 2, tYrs)), review: 'Review after every quarterly result.' },
    { horizon: 'Long term', sub: '2–5 years · investment', wT: 0.15, tr: Lg.tt.ratio, levels: zoneChips(2).concat([lv('Business review', 'Exit only if 2 straight quarters of falling revenue AND profit'), lv('Hard floor', Lg.plan.hardFloor, pc(Lg.plan.hardFloor) + ' from CMP')], upChips(Lg.plan.ups, 3, tYrs)), review: 'Review every quarterly/annual result — price trend alone never triggers a multi-year exit.' },
  ].forEach((h) => {
    const c = Lg.horizonCall(h.wT, h.tr), incomplete = c.call === 'INCOMPLETE DATA';
    rows.push({ horizon: h.horizon, sub: h.sub, call: c.call, conf: incomplete ? '—' : conf(c.b, cov), basis: incomplete ? 'Fundamentals / results feed unavailable — no call is issued rather than guessing from the chart alone.' : `Weights: technicals ${Math.round(h.wT * 100)}% · business ${Math.round((1 - h.wT) * 100)}%. ${resTxt} Fundamentals ${sg(Lg.ft)}. Trend: ${trendTxt}.`, levels: incomplete ? [] : h.levels, review: h.review, notes: c.notes });
  });
  rows.forEach((r) => { r.tone = toneOf(r.call); });
  return rows;
}

/* ============================================================
   DATA INTEGRITY · DELIVERY ESTIMATE · RESULT REACTIONS · INDICATOR IMPORTANCE
   ============================================================ */
/* Reconcile the daily series so 'previous day' is truly the previous session: merge the 1M cross-check feed, rebuild any session that is missing/incomplete from the real 5-minute feed, rebuild today's candle if Yahoo hasn't published it, and report any weekday gaps (holiday or missing data). */
function normalizeDaily(bars, meta, b5, nowMs, extra) {
  const byDate = new Map(), src = {}, put = (b, why) => { const d = istDate(b.t); byDate.set(d, b); src[d] = why; };
  bars.slice().sort((a, b) => a.t - b.t).forEach((b) => put(b, 'Yahoo 2Y feed'));
  (extra || []).forEach((b) => { const cur = byDate.get(istDate(b.t)); if (!cur || (cur.approx && !b.approx)) put(b, 'Yahoo 1M cross-check'); });
  const rmt = meta && meta.regularMarketTime, sessDate = rmt ? istDate(rmt) : null, sess = {};
  (b5 || []).forEach((x) => { (sess[istDate(x.t)] = sess[istDate(x.t)] || []).push(x); });
  const rebuilt = [];
  Object.keys(sess).forEach((d) => {
    const sx = sess[d], cur = byDate.get(d), need = d === sessDate ? 3 : 10;
    if ((!cur || cur.approx) && sx.length >= need) { put({ t: sx[0].t, o: sx[0].o, h: Math.max(...sx.map((x) => x.h)), l: Math.min(...sx.map((x) => x.l)), c: last(sx).c, v: sx.reduce((a, x) => a + x.v, 0), rebuilt: true }, 'rebuilt from 5-min feed'); rebuilt.push(d); }
  });
  const out = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((e) => e[1]);
  const res = { bars: out, rebuilt: rebuilt.length > 0, rebuiltDates: rebuilt, stale: false, sessDate, note: '', gaps: [], src }, notes = [];
  if (rebuilt.length) notes.push('Candle for ' + rebuilt.map(dShort).join(', ') + ' was missing or incomplete in Yahoo’s daily feed — rebuilt from the 5-minute feed.');
  if (sessDate && out.length && istDate(last(out).t) < sessDate) {
    if (isNum(meta.regularMarketOpen) && isNum(meta.regularMarketDayHigh) && isNum(meta.regularMarketDayLow) && isNum(meta.regularMarketPrice)) {
      out.push({ t: rmt, o: meta.regularMarketOpen, h: meta.regularMarketDayHigh, l: meta.regularMarketDayLow, c: meta.regularMarketPrice, v: meta.regularMarketVolume || 0 }); src[sessDate] = 'Yahoo quote fields';
      notes.push("Today's candle rebuilt from Yahoo quote fields (daily candle not yet published).");
    } else { res.stale = true; notes.push("Today's daily candle is not available yet — figures show the latest completed session."); }
  }
  const tail = out.slice(-8);
  for (let i = 1; i < tail.length; i++) { let d = addDays(istDate(tail[i - 1].t), 1); const end = istDate(tail[i].t); while (d < end) { const dow = new Date(d + 'T00:00:00Z').getUTCDay(); if (dow !== 0 && dow !== 6) res.gaps.push(d); d = addDays(d, 1); } }
  if (res.gaps.length) notes.push('No candle for ' + res.gaps.map(dShort).join(', ') + ' (exchange holiday or missing data) — verify on ODIN.');
  res.note = notes.join(' ');
  return res;
}
/* Algorithmic delivery estimate (no exchange feed): baseline by market-cap tier, lowered by volume spikes and wide ranges (speculative days), clipped to 20–75%. Heuristic, ±8 pts. */
function estimateDelivery(X, b5) {
  const { dly, n, mk, mcap } = X, clip = (v, a, b) => Math.max(a, Math.min(b, v));
  const base = !isNum(mcap) ? 48 : mcap >= 1e12 ? 44 : mcap >= 2e11 ? 46 : mcap >= 5e10 ? 50 : 54;
  const one = (i, vol) => {
    if (i < 21) return null;
    let s = 0; for (let k = i - 20; k < i; k++) s += dly[k].v; const av = s / 20; if (!av) return null;
    const atr = X.ind.atr[i - 1] ?? at(X.ind.atr), rng = atr ? (dly[i].h - dly[i].l) / atr : 1;
    return clip(base - 6 * clip(vol / av - 1, -1, 2) - 5 * clip(rng - 1, -1, 1.5), 20, 75);
  };
  const vToday = dly[n - 1].v; let projV = vToday, partial = false;
  if (mk.live) { const fr = intradayFraction(b5); if (fr) projV = vToday / fr; else partial = true; }
  const pT = one(n - 1, projV), pP = one(n - 2, dly[n - 2].v);
  return {
    today: pT != null ? { kind: 'Est. (algo)', qty: (projV * pT) / 100, pct: pT, partial } : null,
    prev: pP != null ? { kind: 'Est. (algo)', qty: (dly[n - 2].v * pP) / 100, pct: pP, date: istDate(dly[n - 2].t) } : null,
  };
}
const addDays = (iso, d) => new Date(new Date(iso + 'T00:00:00Z').getTime() + d * 864e5).toISOString().slice(0, 10);
/* Past result reactions: exchange-filed announcement times when we have them (after-close announcements react next session), else Yahoo events, else the sharpest market-adjusted price+volume shock after each reported quarter-end. */
function analyseReactions(dly, bench, qDates, confirmed, cmp, atrPct, resRatio) {
  const n = dly.length, idx = {}; dly.forEach((b, i) => { idx[istDate(b.t)] = i; });
  const bmap = {}; (bench || []).forEach((b, i) => { if (i > 0) bmap[istDate(b.t)] = b.c / bench[i - 1].c - 1; });
  const istMin = (ts) => { const d = new Date((ts + 19800) * 1000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const events = [];
  const mkEv = (i, src, extra) => ({ i, date: istDate(dly[i].t), ret: dly[i].c / dly[i - 1].c - 1, base: dly[i - 1].c, runUp: i >= 6 ? dly[i - 1].c / dly[i - 6].c - 1 : null, source: src, ...extra });
  if (confirmed && confirmed.length) {
    confirmed.forEach((c) => {
      const ts = typeof c === 'number' ? c : c.ts, hasTime = typeof c === 'object' && c.hasTime, d = istDate(ts);
      let i = idx[d]; if (i == null) i = dly.findIndex((b) => istDate(b.t) > d);
      if (i == null || i < 22) return;
      let j;
      if (hasTime) j = istMin(ts) >= 930 ? i + 1 : i;
      else { const r0 = Math.abs(dly[i].c / dly[i - 1].c - 1), r1 = i + 1 < n ? Math.abs(dly[i + 1].c / dly[i].c - 1) : 0; j = r1 > r0 ? i + 1 : i; }
      if (j < n) events.push(mkEv(j, 'confirmed'));
    });
  } else {
    const today = istDate(dly[n - 1].t);
    (qDates || []).forEach((q) => {
      const from = addDays(q, 8), to = addDays(q, 75); let best = null;
      for (let i = 21; i < n; i++) {
        const d = istDate(dly[i].t); if (d < from || d > to || d > today) continue;
        let s = 0; for (let k = i - 20; k < i; k++) s += dly[k].v; const vr = s ? dly[i].v / (s / 20) : 0;
        const abn = dly[i].c / dly[i - 1].c - 1 - (bmap[d] ?? 0), score = Math.abs(abn) * 100 * Math.min(vr, 6);
        if (vr >= 1.3 && Math.abs(abn) >= 0.012 && (!best || score > best.score)) best = { i, score, abn, vr };
      }
      if (best) events.push(mkEv(best.i, 'inferred', { abn: best.abn, vr: best.vr }));
    });
  }
  const uniq = []; events.sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((e) => { if (!uniq.find((u) => u.date === e.date)) uniq.push(e); });
  const lastEv = uniq[0] || null, mags = uniq.slice(0, 4).map((e) => Math.abs(e.ret) * 100), evs = uniq.slice(0, 6);
  let exp, basis;
  if (mags.length >= 2) { exp = mean(mags); basis = `avg of last ${mags.length} result reactions`; }
  else if (mags.length === 1) { exp = mags[0]; basis = 'last result reaction only (1 sample)'; }
  else { exp = atrPct * 1.5; basis = 'volatility-based (no past result reactions found)'; }
  const ru = evs.filter((e) => isNum(e.runUp)).map((e) => e.runUp * 100);
  const stats = evs.length ? { n: evs.length, posRate: evs.filter((e) => e.ret > 0).length / evs.length, avgAbs: mean(evs.map((e) => Math.abs(e.ret) * 100)), avgRet: mean(evs.map((e) => e.ret * 100)), maxUp: Math.max(...evs.map((e) => e.ret * 100)), maxDn: Math.min(...evs.map((e) => e.ret * 100)), avgRunUp: ru.length ? mean(ru) : null } : null;
  return { last: lastEv, sinceMove: lastEv ? (cmp / lastEv.base - 1) * 100 : null, expMove: exp, expLo: cmp * (1 - exp / 100), expHi: cmp * (1 + exp / 100), basis, events: uniq.slice(0, 4), stats,
    cur5: n > 6 ? (cmp / dly[n - 6].c - 1) * 100 : null, cur10: n > 11 ? (cmp / dly[n - 11].c - 1) * 100 : null,
    bias: resRatio > 0.3 ? 'leans positive — results trend improving' : resRatio < -0.3 ? 'leans negative — results trend weakening' : 'direction uncertain', inferred: !!lastEv && lastEv.source === 'inferred' };
}
/* Indicator importance (3 = decisive, 1 = supporting) used to order every readout and table */
const IMP_RULES = [
  [/^Price vs session VWAP/, 3], [/^Opening range/, 3], [/^CPR/, 3], [/^15-min EMA/, 2], [/^5-min EMA/, 2], [/^5-min Supertrend/, 2], [/^5-min RSI/, 1],
  [/^EMA 20 vs EMA 50/, 3], [/^Price vs 20-day EMA/, 3], [/^Supertrend \(10,3\) daily/, 3], [/^MACD/, 3], [/^ADX/, 3], [/^20-day breakout/, 3], [/^Volume on last/, 3],
  [/^Price vs 50-day SMA/, 2], [/^RSI \(14\)/, 2], [/^Stochastic/, 2], [/^OBV/, 2], [/^NSE delivery/, 2], [/^Relative strength vs Nifty 50 \(3M\)/, 2], [/^Bollinger/, 1],
  [/^Price vs 200-day/, 3], [/^200-day SMA slope/, 3], [/^50-day vs 200-day/, 2], [/^Price vs 40-week/, 3], [/^10-week vs 40-week/, 2], [/^Weekly RSI/, 1], [/^Weekly MACD/, 2], [/^1-year price return/, 2], [/^Relative strength vs Nifty 50 \(1Y\)/, 2],
  [/^Latest quarter/, 3], [/^Net profit — last 3/, 3], [/^Revenue — last 3/, 2], [/^Net margin trend/, 2], [/^Loss-making/, 3], [/^Latest FY/, 3], [/^ROE/, 3], [/^Net profit margin/, 2], [/^Debt/, 3], [/^P\/E \(trailing\)/, 3], [/^PEG/, 2], [/^Free cash/, 2], [/^Revenue CAGR/, 2], [/^Net income CAGR/, 2], [/^Analyst consensus/, 1], [/^Mean target/, 1],
];
const impOf = (name) => { for (const [re, w] of IMP_RULES) if (re.test(name)) return w; return 1; };
const byImp = (rows) => rows.map((r, i) => ({ r, i, w: impOf(r.name) })).sort((a, b) => b.w - a.w || a.i - b.i).map((x) => x.r);
const dots = (w) => '●'.repeat(w) + '○'.repeat(3 - w);
const shortOf = (t) => { const s = String(t).split(' — ')[0]; return s.length > 46 ? s.slice(0, 44) + '…' : s; };

/* ============================================================
   NSE FILINGS · RESULT DATES · DERIVED FUNDAMENTALS · TENURE · PLAYBOOK · UPCOMING RESULTS
   ============================================================ */
const rowsOf = (x) => (Array.isArray(x) ? x : x && Array.isArray(x.data) ? x.data : []);
const numOf = (v) => { const x = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(x) ? x : null; };
const pickF = (r, ...ks) => { for (const k of ks) if (r[k] != null && r[k] !== '' && r[k] !== '-') return r[k]; return null; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function parseNseDateTime(v) {
  if (!v) return null; const s = String(v).trim(); let m, y, mo, d, hh = 0, mi = 0, ss = 0, hasTime = false;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) { y = +m[1]; mo = +m[2]; d = +m[3]; if (m[4] != null) { hh = +m[4]; mi = +m[5]; ss = +(m[6] || 0); hasTime = true; } }
  else if ((m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)) && MON[m[2].toLowerCase()]) { d = +m[1]; mo = MON[m[2].toLowerCase()]; y = +m[3]; if (m[4] != null) { hh = +m[4]; mi = +m[5]; ss = +(m[6] || 0); hasTime = true; } }
  else return null;
  return { iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, ts: Date.UTC(y, mo - 1, d, hh, mi, ss) / 1000 - 19800, hasTime };
}
/* Exchange-filed results. NSE reports figures in ₹ lakh (×1e5 → rupees); EPS is per share. Quarterly rows = periods ≤ ~3 months; consolidated preferred. */
function parseNseResults(raw, annual) {
  const byEnd = {};
  rowsOf(raw).forEach((r) => {
    const to = toISODate(pickF(r, 'toDate', 're_to_dt', 'to_date')), from = toISODate(pickF(r, 'fromDate', 're_from_dt', 'from_date'));
    if (!to || !from) return;
    const days = (Date.parse(to) - Date.parse(from)) / 864e5; if (annual ? days < 300 : days > 110) return;
    const ct = String(pickF(r, 'consolidated', 're_consolidated') ?? ''), cons = /consolidated/i.test(ct) && !/non/i.test(ct);
    const rec = { to, cons, income: numOf(pickF(r, 'income', 're_net_sale', 're_total_inc', 'totalIncome')), pat: numOf(pickF(r, 'proLossAftTax', 'reProLossAftTax', 're_pro_loss_aft_tax', 'netProfit')), eps: numOf(pickF(r, 'reDilEPS', 're_dil_eps', 'reBasicEPS', 're_basic_eps')), ann: parseNseDateTime(pickF(r, 'exchdisstime', 're_broadcast_timestamp', 'broadcast_date', 'filingDate', 'creation_Date')) };
    const cur = byEnd[to]; if (!cur || (rec.cons && !cur.cons)) byEnd[to] = rec;
  });
  const list = Object.values(byEnd).filter((x) => isNum(x.income) || isNum(x.pat)).sort((a, b) => (a.to < b.to ? -1 : 1));
  if (list.length < 2) return null;
  const pre = annual ? 'annual' : 'quarterly', data = {};
  [['TotalRevenue', 'income', 1e5], ['NetIncome', 'pat', 1e5], ['DilutedEPS', 'eps', 1]].forEach(([nm, k, mult]) => { const s = list.filter((x) => isNum(x[k])).map((x) => ({ date: x.to, val: x[k] * mult })); if (s.length) data[pre + nm] = s; });
  if (!data[pre + 'TotalRevenue'] && !data[pre + 'NetIncome']) return null;
  return { data, ann: list.filter((x) => x.ann).map((x) => x.ann) };
}
function pickNextResult(nse, yahooNE, nowMs) {
  const today = istDate(nowMs / 1000);
  const m = ((nse && nse.meetings) || []).filter((x) => x.iso >= today).sort((a, b) => (a.iso < b.iso ? -1 : 1))[0];
  if (m) return { date: new Date(m.iso + 'T00:00:00+05:30'), days: Math.round((Date.parse(m.iso) - Date.parse(today)) / 864e5), source: 'NSE board-meeting calendar', exchange: true };
  if (yahooNE) return Object.assign({}, yahooNE, { source: 'Yahoo calendar — tentative, verify on exchange', exchange: false });
  return null;
}
/* Ratios Yahoo often leaves empty, computed from statements we do have (filed results / annual statements) */
function deriveFundamentals(ts, tsq, cmp, nse) {
  const o = {}, A = (k) => (ts && ts[k] && ts[k].length ? ts[k] : null), Q = (k) => (tsq && tsq[k] && tsq[k].length ? tsq[k] : null);
  const rev = A('annualTotalRevenue'), ni = A('annualNetIncome'), eq = A('annualStockholdersEquity'), debt = A('annualTotalDebt'), fcf = A('annualFreeCashFlow'), ocf = A('annualOperatingCashFlow');
  if (ni && eq && last(eq).val > 0) o.roe = last(ni).val / last(eq).val;
  if (debt && eq && last(eq).val > 0) o.de = (last(debt).val / last(eq).val) * 100;
  if (rev && ni && last(rev).val > 0) o.pm = last(ni).val / last(rev).val;
  if (fcf) o.fcf = last(fcf).val; if (ocf) o.ocf = last(ocf).val;
  const qe = Q('quarterlyDilutedEPS'), qr = Q('quarterlyTotalRevenue'), qn = Q('quarterlyNetIncome');
  if (qe && qe.length >= 4) o.epsTtm = qe.slice(-4).reduce((a, x) => a + x.val, 0); else if (A('annualDilutedEPS')) o.epsTtm = last(A('annualDilutedEPS')).val;
  if (isNum(o.epsTtm) && o.epsTtm > 0 && cmp) o.pe = cmp / o.epsTtm;
  let eg = null; if (qe && qe.length >= 8) { const a = qe.slice(-4).reduce((x, y) => x + y.val, 0), b = qe.slice(-8, -4).reduce((x, y) => x + y.val, 0); if (b > 0) eg = (a / b - 1) * 100; } else if (A('annualDilutedEPS') && A('annualDilutedEPS').length >= 3) { const e = A('annualDilutedEPS'), f = e[0].val, l2 = last(e).val; if (f > 0 && l2 > 0) eg = (Math.pow(l2 / f, 1 / (e.length - 1)) - 1) * 100; }
  if (isNum(o.pe) && isNum(eg) && eg > 0) o.peg = o.pe / eg;
  if (qr && qn && qr.length >= 4 && qn.length >= 4) { const r4 = qr.slice(-4).reduce((a, x) => a + x.val, 0), n4 = qn.slice(-4).reduce((a, x) => a + x.val, 0); if (r4 > 0) o.pmTtm = n4 / r4; }
  if (nse && nse.holding) { o.promoter = nse.holding.promoter / 100; o.holdDate = nse.holding.date; }
  return o;
}
/* ---------- % to target and time-to-target ---------- */
function daysToTarget(target, price, closes) {
  const n = closes.length; if (n < 25) return null;
  const rets = []; for (let i = Math.max(1, n - 60); i < n; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mu = mean(rets), sig = Math.sqrt(mean(rets.map((r) => (r - mu) ** 2))) * price, dist = Math.abs(target - price); if (!sig) return null;
  const slow = (dist / sig) ** 2, dir = target > price ? 1 : -1, drift = mean(rets.slice(-20)) * price * dir; let lo, hi;
  if (drift > 0) { const fast = dist / drift; lo = Math.min(fast, slow); hi = Math.max(fast, slow); } else { lo = slow; hi = slow * 1.8; }
  const l = Math.max(1, Math.round(lo)); return { lo: l, hi: Math.max(l + 1, Math.round(hi)) };
}
const fmtDays = (t) => { if (!t) return ''; if (t.hi <= 40) return `≈ ${t.lo === t.hi ? t.lo : t.lo + '–' + t.hi} trading days`; if (t.hi > 250) return '≈ 1 yr+ at current pace'; const mo = (x) => Math.max(1, Math.round(x / 21)), a = mo(t.lo), b = mo(t.hi); return `≈ ${a === b ? a : a + '–' + b} months`; };
function yearsToTarget(cmp, target, gs) {
  const pos = gs.filter((g) => isNum(g) && g >= 3 && g <= 45).sort((a, b) => a - b);
  if (!pos.length || !(target > cmp)) return null;
  const ln = Math.log(target / cmp); return { lo: ln / Math.log(1 + last(pos) / 100), hi: ln / Math.log(1 + pos[0] / 100) };
}
const fmtYears = (t) => { if (!t) return 'growth base too low to time'; if (t.hi > 15) return '≈ 10+ yrs at current growth'; const f = (y) => (y < 1 ? Math.max(1, Math.round(y * 12)) + ' mo' : (y < 10 ? y.toFixed(1) : Math.round(y)) + ' yr'); return f(t.lo) === f(t.hi) ? '≈ ' + f(t.lo) : `≈ ${f(t.lo)} – ${f(t.hi)}`; };
/* ---------- result-day playbook ---------- */
function buildPlaybook(R) {
  const ne = R.nextEarnings; if (!ne || ne.days < 0 || ne.days > 15) return null;
  const ri = R.resultInfo, st = ri.stats, W = R.swing, res = R.long.res, exp = ri.expMove, cur10 = isNum(ri.cur10) ? ri.cur10 : 0, cur5 = ri.cur5, trendBad = W.t.ratio <= -0.2;
  let stance, tone, head;
  if (res.weak) { stance = 'AVOID FRESH LONGS'; tone = 'bear'; head = 'Recent results are deteriorating — a further miss would compound it. Do not add before the number; protect existing holdings with the stop.'; }
  else if (cur10 > exp && !trendBad) { stance = "PRICED-IN — DON'T CHASE"; tone = 'range'; head = `Already ${fmtPct(cur10, 1)} in 10 sessions, more than the expected ±${exp.toFixed(1)}% result move. Hold existing positions with a trailing stop and consider booking part profits before the number.`; }
  else if (trendBad) { stance = 'STAY OUT / EXIT ON WEAKNESS'; tone = 'bear'; head = 'The price trend is weak into the result. No fresh longs; exit holdings on a close below support rather than hoping for a positive surprise.'; }
  else if ((res.strong || res.ratio >= 0.3) && cur10 <= exp * 0.8) { stance = 'PRE-RESULT LONG ½'; tone = 'bull'; head = `Results trend is improving and the stock has not run (${fmtPct(cur10, 1)} in 10 sessions vs ±${exp.toFixed(1)}% expected move). Build a half-size position in tranches; add the rest only after the reaction confirms.`; }
  else { stance = 'WAIT — TRADE THE REACTION'; tone = 'range'; head = 'No clear edge going in. Stay flat and trade the post-result move once the first reaction candle is in.'; }
  const b = [];
  if (st) b.push(`Last ${st.n} result reaction${st.n > 1 ? 's' : ''}: ${Math.round(st.posRate * 100)}% closed higher · average move ±${st.avgAbs.toFixed(1)}% (best ${fmtPct(st.maxUp, 1)}, worst ${fmtPct(st.maxDn, 1)})${ri.inferred ? ' — dates inferred from price/volume shocks' : ''}.`);
  else b.push('No past result reactions could be detected — the expected move is volatility-based.');
  if (isNum(ri.sinceMove) && ri.last) b.push(`Since the last result (${dShort(ri.last.date)}): ${fmtPct(ri.sinceMove, 1)}; the reaction-day move was ${fmtPct(ri.last.ret * 100, 1)}.`);
  if (st && isNum(st.avgRunUp) && isNum(cur5)) b.push(`Typical 5-day run-up into past results: ${fmtPct(st.avgRunUp, 1)} · now ${fmtPct(cur5, 1)}${cur5 > st.avgRunUp + 2 ? ' — running hotter than usual, the “buy the rumour” leg may be done' : ''}.`);
  b.push(`Gap risk: a ±${exp.toFixed(1)}% overnight move is normal. Size so that a −${exp.toFixed(1)}% gap costs ≤1% of capital → no more than ≈ ${Math.min(100, Math.round(100 / exp))}% of capital in this stock.`);
  b.push('Do not carry intraday (MIS) positions through the announcement. If it lands in market hours, act only after the first 15-minute candle that follows it.');
  const sup = levelsBelow(W.levels, R.cmp, 0, 1)[0];
  const scen = [
    { name: 'Positive surprise', move: `+${exp.toFixed(1)}% → ₹${fmt(R.cmp * (1 + exp / 100))}`, plan: 'Gap-up that holds above the reaction-day open: buy a close above the reaction-day high, stop below the reaction-day low, first target = one more expected move.', cls: 'd-green' },
    { name: 'In line', move: `within ±${(exp / 3).toFixed(1)}%`, plan: 'No edge — stay flat and trade the follow-through from the next session.', cls: 'd-amber' },
    { name: 'Negative surprise', move: `−${exp.toFixed(1)}% → ₹${fmt(R.cmp * (1 - exp / 100))}`, plan: `Exit or avoid; re-enter only on a close back above the reaction-day high${sup ? ' (support to watch ₹' + fmt(sup.v) + ')' : ''}.`, cls: 'd-red' },
  ];
  return { days: ne.days, stance, tone, head, bullets: b, scen };
}
/* ---------- upcoming results (Nifty 500, next N days) ---------- */
async function fetchUpcoming(days) {
  const be = getBackend(); if (!be) throw new Error('NO_BACKEND');
  const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=upcoming&days=' + days), 45000));
  if (j && j.error) throw new Error(j.error);
  return j;
}
function parseUpcoming(j, nowMs, days) {
  const today = istDate(nowMs / 1000), end = addDays(today, days), nrows = rowsOf(j.nifty500), hasN = nrows.length > 0, seen = new Map();
  const n500 = new Map(nrows.map((x) => [String(x.symbol).toUpperCase(), x])), st = { rawEvents: rowsOf(j.events).length, rawMeetings: rowsOf(j.meetings).length, resultType: 0, inWindow: 0, inNifty: 0 };
  const push = (sym, company, purpose, desc, dateRaw) => {
    const key = String(sym || '').toUpperCase().trim(); if (!key || !/result/i.test(`${purpose || ''} ${desc || ''}`)) return; st.resultType++;
    const iso = toISODate(dateRaw); if (!iso || iso < today || iso > end) return; st.inWindow++;
    if (hasN && !n500.has(key)) return; st.inNifty++;
    const cur = seen.get(key); if (!cur || iso < cur.date) seen.set(key, { symbol: key, company: company || (n500.get(key) || {}).company || key, industry: (n500.get(key) || {}).industry || '', date: iso });
  };
  rowsOf(j.events).forEach((r) => push(r.symbol, r.company, r.purpose, r.bm_desc, r.date));
  rowsOf(j.meetings).forEach((r) => push(r.bm_symbol || r.symbol, r.sm_name || r.company, r.bm_purpose || r.purpose, r.bm_desc, r.bm_date || r.date));
  return { list: [...seen.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol < b.symbol ? -1 : 1)), from: today, to: end, n500: n500.size, n500Missing: !hasN, stats: st, diag: Array.isArray(j.diag) ? j.diag : [] };
}
function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out.map((x) => x.trim());
}
/* Manual fallback when NSE blocks the backend: NSE event-calendar CSV (download from the NSE page) or a pasted list "SYMBOL[,date]" per line */
function parseManualUpcoming(text, nowMs, days) {
  const today = istDate(nowMs / 1000), end = addDays(today, days), lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean), seen = new Map();
  const add = (sym, company, iso) => { const key = String(sym || '').toUpperCase().replace(/\.(NS|BO)$/, '').trim(); if (!key || !/^[A-Z0-9&\-]+$/.test(key)) return; const cur = seen.get(key); if (!cur || (iso && (!cur.date || iso < cur.date))) seen.set(key, { symbol: key, company: company || key, industry: '', date: iso || '' }); };
  if (lines.length) {
    const h = parseCsvLine(lines[0]).map((x) => x.toLowerCase());
    if (h.some((x) => /symbol/.test(x))) {
      const ix = (re) => h.findIndex((x) => re.test(x)), iS = ix(/symbol/), iC = ix(/company|name/), iP = ix(/purpose/), iD = ix(/detail|desc/), iT = ix(/date/);
      lines.slice(1).forEach((l) => { const c = parseCsvLine(l); if (iP >= 0 && !/result/i.test(`${c[iP] || ''} ${iD >= 0 ? c[iD] || '' : ''}`)) return; const iso = iT >= 0 ? toISODate(c[iT]) : null; if (iso && (iso < today || iso > end)) return; add(c[iS], iC >= 0 ? c[iC] : '', iso); });
    } else lines.forEach((l) => { const c = l.split(/[,\s;|\t]+/).filter(Boolean); add(c[0], '', c[1] ? toISODate(c[1]) : null); });
  }
  return { list: [...seen.values()].sort((a, b) => ((a.date || '9') < (b.date || '9') ? -1 : 1)), from: today, to: end, n500: 0, n500Missing: true, stats: null, diag: [], manual: true };
}
/* ---------- probability that the stock's own history would have hit the levels ---------- */
/* Replays the SAME level geometry (stop / T1 / T2 as % of entry) from every day of the last year on this stock's own daily bars.
   Conservative: if stop and target sit in one daily bar the stop is assumed first. Returns frequencies, not guarantees. */
function hitStats(bars, dir, slP, t1P, t2P, H) {
  const n = bars.length; let c1 = 0, c2 = 0, cs = 0, tot = 0;
  const first = (i, e, tgtP) => {
    const sl = dir > 0 ? e * (1 - slP) : e * (1 + slP), tg = dir > 0 ? e * (1 + tgtP) : e * (1 - tgtP);
    for (let j = i + 1; j <= Math.min(n - 1, i + H); j++) {
      const b = bars[j], slH = dir > 0 ? b.l <= sl : b.h >= sl, tgH = dir > 0 ? b.h >= tg : b.l <= tg;
      if (slH) return -1; if (tgH) return 1;
    }
    return 0;
  };
  for (let i = 15; i < n - 1; i++) {
    if (!isNum(bars[i].c) || i + 1 >= n) continue; tot++; const e = bars[i].c;
    const a = first(i, e, t1P), b = first(i, e, t2P);
    if (a === 1) c1++; if (a === -1) cs++; if (b === 1) c2++;
  }
  return tot >= 40 ? { p1: c1 / tot, p2: c2 / tot, pSL: cs / tot, pNone: 1 - cs / tot - c1 / tot, n: tot, H } : null;
}
const pct0 = (x) => (isNum(x) ? Math.round(x * 100) + '%' : '—');
function suggestResultTrade(R, it, nowMs, bars) {
  const W = R.swing, m = W.metrics, cmp = R.cmp, atr = m.atr, exp = R.resultInfo.expMove, cur10 = isNum(R.resultInfo.cur10) ? R.resultInfo.cur10 : 0, r = W.t.ratio;
  const sup = levelsBelow(W.levels, cmp, 0.4 * atr, 2), rs = levelsAbove(W.levels, cmp, 1.2 * atr, 2), rsNear = levelsAbove(W.levels, cmp, 0.3 * atr, 1);
  const pc = (v, base) => fmtPct(((v - (base || cmp)) / (base || cmp)) * 100, 1), clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  let stance, tone, dir = 1, entry, sl, t1, t2, note, entryTxt, short;
  if (r <= -0.2) {
    stance = 'AVOID · EXIT / SELL'; tone = 'bear'; dir = -1; entry = cmp;
    sl = cmp + clamp(rsNear[0] ? rsNear[0].v + 0.2 * atr - cmp : 1.2 * atr, 0.8 * atr, 1.8 * atr);
    t1 = sup[0] ? sup[0].v : cmp - 1.2 * atr; t2 = sup[1] && sup[1].v < t1 - 0.3 * atr ? sup[1].v : t1 - 0.9 * atr;
    note = 'Weak trend into the result — no fresh longs; holders exit on strength. Levels = downside map (F&O / intraday only).'; short = 'No fresh longs; exit on strength. F&O / intraday short map only.'; entryTxt = `₹${fmt(cmp)}`;
  } else if (cur10 > exp) {
    stance = 'PRICED-IN · DIP-BUY'; tone = 'range'; entry = Math.min(cmp - 0.3 * atr, m.e20);
    sl = entry - clamp(sup[0] ? entry - sup[0].v + 0.2 * atr : atr, 0.8 * atr, 1.6 * atr); t1 = cmp; t2 = cmp + 0.8 * atr;
    note = `${fmtPct(cur10, 1)} in 10 sessions (> ±${exp.toFixed(1)}% expected move) — don't chase; holders trail below EMA20 ₹${fmt(m.e20)}.`; short = `Up ${fmtPct(cur10, 1)} in 10d — don't chase; buy dips only.`; entryTxt = `₹${fmt(entry)} (dip)`;
  } else if (r >= 0.2) {
    stance = 'PRE-RESULT LONG ½'; tone = 'bull'; entry = cmp;
    sl = sup[0] ? sup[0].v - 0.3 * atr : cmp - 2 * atr; if (cmp - sl > 3 * atr) sl = cmp - 3 * atr; if (cmp - sl < atr) sl = cmp - atr;
    t1 = rs[0] ? rs[0].v : cmp + 2 * atr; t2 = rs[1] ? rs[1].v : cmp + 3.5 * atr;
    note = `Trend positive, no run-up (${fmtPct(cur10, 1)} in 10d) — half size, add after the reaction confirms.`; short = 'Half size now; add after the reaction.'; entryTxt = `₹${fmt(cmp - 0.4 * atr)} – ₹${fmt(cmp)}`;
  } else {
    stance = 'WAIT · BREAKOUT BUY'; tone = 'range'; entry = W.hh20; sl = Math.max(W.ll20, W.hh20 - 1.5 * atr); t1 = W.hh20 * (1 + exp / 100); t2 = t1 + Math.max(0.8 * atr, t1 - W.hh20);
    note = 'Mixed setup — stay flat into the number; buy only on a close above the 20-day high.'; short = 'Stay flat; buy only on a close above the 20-day high.'; entryTxt = `Close > ₹${fmt(W.hh20)}`;
  }
  const risk = Math.abs(entry - sl) || atr, rr1 = Math.abs(t1 - entry) / risk, rr2 = Math.abs(t2 - entry) / risk;
  const daysLeft = it.date ? Math.round((Date.parse(it.date) - Date.parse(istDate(nowMs / 1000))) / 864e5) : null;
  const H = clamp((daysLeft == null ? 5 : Math.max(0, daysLeft)) + 5, 5, 15);
  const p = bars && bars.length > 60 ? hitStats(bars.slice(-260), dir, Math.abs(entry - sl) / entry, Math.abs(t1 - entry) / entry, Math.abs(t2 - entry) / entry, H) : null;
  const edge = p ? p.p1 * rr1 - p.pSL : null;
  return { cmp, run5: R.ret.w1, run10: cur10, exp, rating: W.rating, stance, tone, dir, entryN: entry, slN: sl, t1N: t1, t2N: t2, rr1, rr2, p, edge, short, entry: entryTxt,
    stop: `₹${fmt(sl)} (${pc(sl, entry)})`, t1: `₹${fmt(t1)} (${pc(t1, entry)})`, t2: `₹${fmt(t2)} (${pc(t2, entry)})`, t1pct: ((t1 - entry) / entry) * 100, t2pct: ((t2 - entry) / entry) * 100, slpct: ((sl - entry) / entry) * 100,
    note: `${note} Size ≤ ${Math.min(100, Math.round(100 / exp))}% of capital (a ±${exp.toFixed(1)}% gap then costs ≈1%).`, trend: `${m.e20 > m.e50 ? 'EMA20>50' : 'EMA20<50'} · RSI ${fmt(m.rsi, 0)}`, daysLeft };
}
async function analyseUpcoming(list, bench, onProgress, nowMs) {
  const CAP = 200, cap = list.slice(0, CAP), out = [], queue = cap.slice(); let done = 0;
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift();
      try {
        const ch = await fetchChart(it.symbol + '.NS', '1y', '1d');
        const R = buildReport({ sym: it.symbol, exch: 'NS', daily: ch, intra: null, weekly: null, bench, summary: null, ts: null, tsq: null, deliv: null, news: [], feeds: [], nowMs });
        out.push(Object.assign({}, it, suggestResultTrade(R, it, nowMs, ch.bars)));
      } catch (e) { out.push(Object.assign({}, it, { error: (e && e.message) || 'no data' })); }
      done++; if (onProgress) onProgress(done, cap.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker(), worker(), worker()]);
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol < b.symbol ? -1 : 1));
  return { rows: out, analysed: out.filter((x) => !x.error).length, total: list.length, capped: list.length > cap.length, cap: CAP };
}

/* ---------- Yahoo earnings-date fallback (used when NSE blocks Google's servers) ---------- */
const NIFTY_FALLBACK = ('RELIANCE TCS HDFCBANK ICICIBANK INFY BHARTIARTL ITC SBIN LT HINDUNILVR KOTAKBANK AXISBANK BAJFINANCE MARUTI SUNPHARMA HCLTECH ASIANPAINT NTPC ULTRACEMCO TITAN ONGC POWERGRID M&M BAJAJFINSV WIPRO ADANIENT ADANIPORTS COALINDIA JSWSTEEL TATASTEEL NESTLEIND TECHM GRASIM HINDALCO CIPLA DRREDDY EICHERMOT BPCL APOLLOHOSP BRITANNIA TATACONSUM SBILIFE HDFCLIFE INDUSINDBK HEROMOTOCO BAJAJ-AUTO SHRIRAMFIN TRENT BEL ETERNAL JIOFIN TMPV TMCV ' +
  'ADANIGREEN ADANIPOWER AMBUJACEM DMART BANKBARODA BOSCHLTD CANBK CHOLAFIN COLPAL DLF DABUR GAIL GODREJCP HAVELLS HAL ICICIGI ICICIPRULI IOC INDIGO NAUKRI IRCTC IRFC JINDALSTEL LICI LODHA LTIM MARICO MOTHERSON NHPC PIDILITIND PFC PNB RECLTD SIEMENS SRF SHREECEM TORNTPHARM TVSMOTOR VEDL VBL ZYDUSLIFE ABB BAJAJHLDNG TATAPOWER TATAELXSI ' +
  'ABCAPITAL ALKEM APLAPOLLO ASHOKLEY ASTRAL AUBANK AUROPHARMA BANDHANBNK BANKINDIA BERGEPAINT BHEL BIOCON COFORGE CONCOR CUMMINSIND DALBHARAT DEEPAKNTR DIXON ESCORTS EXIDEIND FEDERALBNK FORTIS GLENMARK GMRAIRPORT GODREJPROP HDFCAMC HINDPETRO IDFCFIRSTB IGL INDHOTEL INDUSTOWER IPCALAB JSWENERGY JUBLFOOD KPITTECH LAURUSLABS LICHSGFIN LUPIN MANKIND MAXHEALTH MFSL MPHASIS MRF MUTHOOTFIN NMDC OBEROIRLTY OFSS OIL PAGEIND PATANJALI PERSISTENT PETRONET PHOENIXLTD POLICYBZR POLYCAB PRESTIGE RVNL SAIL SBICARD SJVN SOLARINDS SUPREMEIND SUZLON SYNGENE TATACOMM TATATECH TIINDIA TORNTPOWER UPL UNIONBANK VOLTAS YESBANK ACC ATGL AWL BALKRISIND BATAINDIA BHARATFORG BLUESTARCO BSE CDSL CGPOWER CROMPTON CYIENT DELHIVERY ENDURANCE FACT GICRE GRANULES HONAUT IEX INOXWIND IRB JKCEMENT JBCHEPHARM KALYANKJIL KEI KFINTECH LTTS MANAPPURAM MAZDOCK MCX NATIONALUM NAVINFLUOR NBCC NYKAA PIIND PNBHOUSING RADICO RAMCOCEM RBLBANK SONACOMS SUNDARMFIN SUNTV TATAINVEST THERMAX TIMKEN UBL UNOMINDA WHIRLPOOL ZENSARTECH ANGELONE APOLLOTYRE BRIGADE CAMS CANFINHOME CASTROLIND CESC CHAMBLFERT COCHINSHIP CRISIL DEVYANI EIDPARRY EMAMILTD FINCABLES FLUOROCHEM GILLETTE GLAXO GODFRYPHLP HUDCO IDBI IIFL INDIAMART INTELLECT IOB JKTYRE JUBLINGREA KAJARIACER KANSAINER KARURVYSYA KEC KIMS LALPATHLAB LATENTVIEW LTF MAHABANK MEDANTA METROPOLIS NATCOPHARM NCC NUVAMA PGHH POONAWALLA PVRINOX RATNAMANI ROUTE SCHAEFFLER SKFINDIA SONATSOFTW STARHEALTH SUMICHEM SUNDRMFAST TANLA TRIDENT UCOBANK UTIAMC WELCORP ZFCVINDIA CENTRALBK CLEAN').split(/\s+/).filter(Boolean);
async function fetchEarnDates(symbols, onProgress) {
  const be = getBackend(); if (!be) throw new Error('NO_BACKEND');
  const uniq = [...new Set(symbols.map((s) => String(s).toUpperCase()))], batches = []; for (let i = 0; i < uniq.length; i += 40) batches.push(uniq.slice(i, i + 40));
  const rows = [], errs = []; let done = 0, next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const b = batches[next++];
      try {
        const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=earn&symbols=' + encodeURIComponent(b.join(','))), 55000));
        if (j && j.error) throw new Error(j.error); rowsOf(j.rows).forEach((r) => rows.push(r));
      } catch (e) { errs.push((e && e.message) || 'failed'); }
      done++; if (onProgress) onProgress(done, batches.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (!rows.length) throw new Error(errs[0] === 'unknown action' ? 'OLD_BACKEND' : errs[0] || 'Yahoo returned no earnings dates');
  return { rows, checked: uniq.length, errors: errs.length };
}
function parseYahooEarn(E, nowMs, days, meta) {
  const today = istDate(nowMs / 1000), end = addDays(today, days), list = []; let withDate = 0;
  E.rows.forEach((r) => {
    const ds = (r.d || []).filter(Boolean).sort(); if (ds.length) withDate++;
    const d = ds.find((x) => x >= today && x <= end); if (!d) return;
    const mm = (meta && meta.get(r.s)) || {}; list.push({ symbol: r.s, company: r.name || mm.company || r.s, industry: mm.industry || '', date: d, tentative: true });
  });
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol < b.symbol ? -1 : 1));
  return { list, from: today, to: end, n500: E.checked, n500Missing: !(meta && meta.size), stats: null, diag: [], source: 'yahoo', checked: E.checked, withDate, batchErrors: E.errors };
}

/* ============================================================
   WATCHLISTS — day-trading levels, live tracking, call accuracy
   Levels are computed ONLY from data available before each open (previous-session pivots / CPR / Camarilla / high-low + daily ATR),
   then replayed on real 5-minute candles to show the live state and the track record of the rules.
   ============================================================ */
const LS_WL = 'jc_watchlists_v1';
const JC = (typeof JCE !== 'undefined') ? JCE : require('./calls_engine.js');
/* Day-trading calls now come from calls_engine.js (JCE): a call is issued only when trend, ADX, RSI, MACD, volume, CPR, 20-day range and the Nifty/VIX regime agree;
   entries need a 5-minute CLOSE beyond the trigger; costs are charged. Same file runs in the 8:30 AM Apps Script call book. */
function dayPlan(dd, k, mkt) { return JC.dayPlanFor(dd, k, mkt); }
function evalSide(sd, bars, atr, final) { return JC.evalDay(sd, bars, atr, final); }
function evalPlan(plan, bars, atr, final) {
  if (!plan.sides.length) return { sides: [], chosen: null, state: 'NOCALL', R: 0, live: false };
  const evs = plan.sides.map((sd) => ({ sd, ev: evalSide(sd, bars, atr, final) })), c = evs[0], st = c.ev.state;
  return { sides: evs, chosen: c.ev.fill != null ? c : null, state: st, R: c.ev.R || 0, live: !!c.ev.live };
}
function marketClock(nowMs) {
  const ist = new Date(nowMs + 19800000), dow = ist.getUTCDay(), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return { today: istDate(nowMs / 1000), open: dow >= 1 && dow <= 5 && mins >= 555 && mins <= 930, afterClose: mins > 930, preOpen: mins < 555 };
}
function analyseWatch(daily, m5, meta, nowMs, mkt) {
  const mc = marketClock(nowMs), sess = {};
  m5.forEach((x) => { const d = istDate(x.t); (sess[d] = sess[d] || []).push(x); });
  const sdates = Object.keys(sess).sort(); if (!sdates.length) return { ok: false, reason: 'No 5-minute candles returned.' };
  const lastSess = last(sdates), liveNow = mc.open && lastSess === mc.today;
  const completeSess = (d) => d < mc.today || (d === mc.today && !liveNow && (mc.afterClose || sess[d].length >= 60));
  const dmap = new Map(); daily.forEach((b) => { if (!b.approx || !dmap.has(istDate(b.t))) dmap.set(istDate(b.t), b); });
  sdates.forEach((d) => { if (!dmap.has(d) && completeSess(d) && sess[d].length >= 40) { const s = sess[d]; dmap.set(d, { t: s[0].t, o: s[0].o, h: Math.max(...s.map((x) => x.h)), l: Math.min(...s.map((x) => x.l)), c: last(s).c, v: s.reduce((a, x) => a + x.v, 0), derived: true }); } });
  const dd = [...dmap.entries()].filter(([d]) => d < mc.today || completeSess(d)).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, b]) => Object.assign({ date: d }, b));
  if (dd.length < 60) return { ok: false, reason: 'Not enough daily history (' + dd.length + ' sessions) for pivots/ATR.' };
  const at14 = ATR(dd);
  const idxBefore = (d) => { let k = -1; for (let i = 0; i < dd.length; i++) { if (dd[i].date < d) k = i; else break; } return k; };
  const hist = [];
  sdates.forEach((d) => {
    if (sess[d].length < 25) return; const k = idxBefore(d); if (k < 30 || !isNum(at14[k])) return;
    const final = completeSess(d), plan = dayPlan(dd, k, mkt), res = evalPlan(plan, sess[d], plan.atr, final);
    hist.push({ date: d, final, plan, res, bars: sess[d].length });
  });
  const kL = dd.length - 1, nextPlan = isNum(at14[kL]) ? dayPlan(dd, kL, mkt) : null, today = hist.length && last(hist).date === mc.today ? last(hist) : null;
  const active = liveNow && today ? today.plan : nextPlan, lastBar = last(sess[lastSess]);
  const cmp = isNum(meta && meta.regularMarketPrice) && liveNow ? meta.regularMarketPrice : lastBar.c, kPrev = idxBefore(lastSess), prevClose = kPrev >= 0 ? dd[kPrev].c : null;
  return { ok: true, liveNow, lastSess, cmp, prevClose, chg: isNum(prevClose) ? (cmp / prevClose - 1) * 100 : null, active, activeFor: liveNow ? mc.today : null, today, hist, nextPlan, atr: at14[kL], lastT: lastBar.t, acc: accuracy(hist.filter((h) => h.final)) };
}
function accuracy(hs) {
  const nocall = hs.filter((h) => h.res.state === 'NOCALL').length; hs = hs.filter((h) => h.res.state !== 'NOCALL');
  const a = { nocall, sessions: hs.length, trig: 0, T2: 0, T1: 0, SL: 0, eodP: 0, eodN: 0, skip: 0, nt: 0, wins: 0, netR: 0, dots: [] };
  hs.forEach((h) => {
    const s = h.res.state; a.netR += h.res.R || 0;
    if (s === 'NT' || s === 'WAIT') { a.nt++; a.dots.push(['nt', h.date, 'no trigger']); return; }
    if (s === 'SKIP') { a.skip++; a.dots.push(['nt', h.date, 'skipped (gap)']); return; }
    a.trig++; if (h.res.R > 0) a.wins++;
    if (s === 'T2') a.T2++; else if (s === 'T1') a.T1++; else if (s === 'SL') a.SL++; else if (s === 'EOD+') a.eodP++; else a.eodN++;
    a.dots.push([s === 'T2' || s === 'T1' ? 'hit' : s === 'SL' ? 'sl' : 'eod', h.date, s + ' ' + (h.res.R >= 0 ? '+' : '') + h.res.R.toFixed(2) + 'R']);
  });
  a.hit = a.trig ? (a.T1 + a.T2) / a.trig : null; a.slRate = a.trig ? a.SL / a.trig : null; a.win = a.trig ? a.wins / a.trig : null; a.avgR = a.trig ? a.netR / a.trig : null;
  return a;
}
function mergeAcc(list) { const a = { sessions: 0, trig: 0, T2: 0, T1: 0, SL: 0, eodP: 0, eodN: 0, skip: 0, nt: 0, wins: 0, netR: 0 }; list.forEach((x) => { Object.keys(a).forEach((k) => { a[k] += x[k] || 0; }); }); a.hit = a.trig ? (a.T1 + a.T2) / a.trig : null; a.slRate = a.trig ? a.SL / a.trig : null; a.win = a.trig ? a.wins / a.trig : null; a.avgR = a.trig ? a.netR / a.trig : null; return a; }
/* ---------- watchlist storage + feeds ---------- */
const symBase = (s) => String(s).replace(/\.(NS|BO)$/, '');
const symEx = (s) => (/\.BO$/.test(s) ? 'BO' : 'NS');
const symYf = (s) => symBase(s) + '.' + symEx(s);
const sortSyms = (a) => [...new Set(a)].sort((x, y) => symBase(x).localeCompare(symBase(y)) || x.localeCompare(y));
function wlLoad() { try { const j = JSON.parse(localStorage.getItem(LS_WL) || 'null'); if (j && Array.isArray(j.lists) && j.lists.length) { j.lists.forEach((l) => { l.syms = sortSyms(l.syms || []); }); return j; } } catch (e) {} return { updated: 0, lists: [{ id: 'l' + Date.now().toString(36), name: 'My watchlist', syms: [] }], active: null }; }
function wlSave(localOnly) {
  WL.store.lists.forEach((l) => { l.syms = sortSyms(l.syms); }); if (!localOnly) WL.store.updated = Date.now();
  try { localStorage.setItem(LS_WL, JSON.stringify(WL.store)); } catch (e) {}
  if (!localOnly) wlDriveQueue();
}
/* Google Drive copy (JC_Watchlists.json) via the Apps Script backend — newest copy wins */
function wlCloudSet(state, msg) { WL.cloud = { state, msg: msg || '', t: Date.now() }; if (IS_BROWSER && $('wlCloud')) $('wlCloud').innerHTML = wlCloudHtml(); }
function wlCloudHtml() { const c = WL.cloud || { state: 'off' }; const t = c.t ? new Date(c.t).toLocaleTimeString('en-IN') : ''; return { off: '💾 Saved in this browser only — add the Data backend to keep watchlists in Google Drive', saving: '☁ Saving to Google Drive…', saved: `☁ Saved to Google Drive (JC_Watchlists.json) · ${t}`, loaded: `☁ Loaded from Google Drive · ${t}`, error: `⚠ Drive save failed: ${esc(c.msg)} — kept in this browser` }[c.state] || ''; }
function wlDriveQueue() { if (!getBackend()) { wlCloudSet('off'); return; } clearTimeout(WL.pushT); wlCloudSet('saving'); WL.pushT = setTimeout(wlDrivePush, 1200); }
async function wlDrivePush() {
  const be = getBackend(); if (!be) return;
  try {
    const r = await fetch(be, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'wl_save', data: WL.store }) }), j = JSON.parse(await r.text());
    if (j.error) throw new Error(/unknown action|DriveApp|permission/i.test(j.error) ? j.error + ' — redeploy Code.gs as a New version and approve the Drive permission' : j.error); wlCloudSet('saved');
  } catch (e) { wlCloudSet('error', (e && e.message) || 'failed'); }
}
async function wlDriveSync() {
  const be = getBackend(); if (!be) { wlCloudSet('off'); return; }
  try {
    const j = JSON.parse(await fetchWithTimeout(beUrl(be, 'action=wl_load'), 20000)); if (j && j.error) throw new Error(j.error);
    if (j.empty || !Array.isArray(j.lists)) { if (WL.store.lists.some((l) => l.syms.length)) await wlDrivePush(); else wlCloudSet('saved'); return; }
    if ((j.updated || 0) > (WL.store.updated || 0)) { j.lists.forEach((l) => { l.syms = sortSyms(l.syms || []); }); WL.store = { updated: j.updated, lists: j.lists, active: j.lists.find((l) => l.id === WL.store.active) ? WL.store.active : j.active || j.lists[0].id }; wlSave(true); wlCloudSet('loaded'); if (IS_BROWSER && $('wlBar')) { wlRenderBar(); wlRenderBody(); wlRefreshAll(false); } }
    else if ((WL.store.updated || 0) > (j.updated || 0)) await wlDrivePush(); else wlCloudSet('saved');
  } catch (e) { wlCloudSet('error', /unknown action/.test(e.message || '') ? 'backend is the old version — redeploy Code.gs' : (e && e.message) || 'failed'); }
}
const WL = { ex: 'NS', view: (() => { try { return JSON.parse(localStorage.getItem('jc_wl_view') || 'null') || { f: 'all', s: 'az' }; } catch (e) { return { f: 'all', s: 'az' }; } })(), mkt: null, mktAt: 0, cloud: null, pushT: null, synced: false, store: null, data: {}, cache: {}, timer: null, auto: true, busy: false, stamp: 0 };
const wlList = () => WL.store.lists.find((l) => l.id === WL.store.active) || WL.store.lists[0];
const cleanSym = (s, ex) => { let u = String(s || '').toUpperCase().trim(), bse = ex === 'BO' || /\.BO$/.test(u) || /^BSE:/.test(u); u = u.replace(/^(NSE|BSE):/, '').replace(/\.(NS|BO)$/, '').replace(/[^A-Z0-9&\-]/g, ''); return u ? (bse ? u + '.BO' : u) : ''; };
function mergeBars(old, fresh) { if (!fresh.length) return old; const t0 = fresh[0].t; return old.filter((b) => b.t < t0).concat(fresh); }
async function wlMkt(force) {
  if (WL.mkt && !force && Date.now() - WL.mktAt < 3600e3) return WL.mkt;
  try { const [n, v] = await Promise.all([fetchChart('^NSEI', '1y', '1d'), fetchChart('^INDIAVIX', '1y', '1d').catch(() => ({ bars: [] }))]); WL.mkt = JC.mktSeries(n.bars, v.bars); WL.mktAt = Date.now(); } catch (e) { WL.mkt = WL.mkt || {}; }
  return WL.mkt;
}
async function wlLoadSym(sym, force) {
  const now = Date.now(), c = WL.cache[sym], yf = symYf(sym), mkt = await wlMkt(false);
  try {
    if (!c || force || now - c.dt > 3600e3 || !c.m5) {
      const [d, m] = await Promise.all([fetchChart(yf, '1y', '1d'), fetchChart(yf, '60d', '5m')]);
      WL.cache[sym] = { daily: d.bars, m5: m.bars, meta: m.meta, dt: now };
    } else {
      const f = await fetchChart(yf, '1d', '5m'); c.m5 = mergeBars(c.m5, f.bars); c.meta = f.meta;
    }
    const cc = WL.cache[sym]; WL.data[sym] = Object.assign({ sym, at: now }, analyseWatch(cc.daily, cc.m5, cc.meta, now, mkt));
  } catch (e) { WL.data[sym] = { sym, ok: false, reason: (e && e.message) || 'fetch failed', at: now }; }
}
async function wlRefreshAll(force) {
  if (WL.busy) return; WL.busy = true; const syms = wlList().syms.slice(), q = syms.slice();
  try { const w = async () => { while (q.length) { const s = q.shift(); await wlLoadSym(s, force); if (IS_BROWSER && $('wlBody')) wlRenderBody(); } }; await Promise.all([w(), w(), w(), w(), w()]); }
  finally { WL.busy = false; WL.stamp = Date.now(); if (IS_BROWSER && $('wlBody')) { wlRenderBody(); } }
}
/* ---------- watchlist rendering ---------- */
function svgTrack(sd, ev, cmp) {
  const d = sd.dir, lo = Math.min(sd.sl, sd.t2, cmp), hi = Math.max(sd.sl, sd.t2, cmp), W = 150, pad = 8, x = (v) => pad + ((v - lo) / (hi - lo || 1)) * (W - 2 * pad), cmpX = x(cmp);
  const mark = (v, col, lab) => `<line x1="${x(v)}" x2="${x(v)}" y1="5" y2="21" stroke="${col}" stroke-width="2"/><text x="${x(v)}" y="30" font-size="8" text-anchor="middle" fill="${col}" font-weight="700">${lab}</text>`;
  const a = Math.min(x(sd.sl), x(sd.entry)), b = Math.max(x(sd.sl), x(sd.entry)), c = Math.min(x(sd.entry), x(sd.t2)), e = Math.max(x(sd.entry), x(sd.t2));
  return `<svg viewBox="0 0 ${W} 34" width="${W}" height="34"><rect x="${a}" y="10" width="${b - a}" height="6" fill="#f3c2cb"/><rect x="${c}" y="10" width="${e - c}" height="6" fill="#bfe8d1"/>${mark(sd.sl, '#c0233f', 'SL')}${mark(sd.entry, '#14306e', 'E')}${mark(sd.t1, '#0d8a4b', 'T1')}${mark(sd.t2, '#0d8a4b', 'T2')}<path d="M${cmpX - 4} 1 L${cmpX + 4} 1 L${cmpX} 8 Z" fill="#111"/></svg>`;
}
function wlStatus(sd, ev, a) {
  const R = ev.R, rs = (R >= 0 ? '+' : '') + R.toFixed(2) + 'R';
  switch (ev.state) {
    case 'WAIT': return ['range', `Waiting — ${sd.dir > 0 ? 'triggers above' : 'triggers below'} ₹${fmt(sd.entry)}`];
    case 'LIVE': return [R >= 0 ? 'bull' : 'bear', `LIVE ${sd.side} @ ₹${fmt(ev.fill)} · ${fmtPct(ev.pnlPct, 2)} (${rs})${ev.t1hit ? ' · T1 booked' : ''}`];
    case 'T2': return ['bull', `T2 ✓ both targets (${rs})`];
    case 'T1': return ['bull', `T1 ✓ half booked (${rs})`];
    case 'SL': return ['bear', `Stop-loss hit (−1R)`];
    case 'EOD+': return ['range', `Closed in profit, no target (${rs})`];
    case 'EOD−': return ['bear', `Closed at a loss, no stop (${rs})`];
    case 'NT': return ['range', 'Never triggered'];
    case 'SKIP': return ['range', 'Skipped — gapped past trigger'];
    case 'CANCEL': return ['range', 'Cancelled — other side triggered first'];
    default: return ['range', ev.state];
  }
}
const dotCls = { hit: '#0d8a4b', sl: '#c0233f', eod: '#e0a61a', nt: '#c6cde0' };
function dotsHtml(a, n = 20) { return `<span class="dots">${a.dots.slice(-n).map((d) => `<i style="background:${dotCls[d[0]]}" title="${esc(d[1] + ' · ' + d[2])}"></i>`).join('')}</span>`; }
function accKpi(label, v, sub, cls) { return `<div class="kpi"><span class="cap">${label}</span><b class="${cls || ''}">${v}</b><small>${sub || ''}</small></div>`; }
const callSide = (r) => (r && r.active && r.active.sides && r.active.sides[0] ? r.active.sides[0].side : null);
/* what to watch when there is no pre-planned call: today's move, and the levels that would turn it into a setup */
function noTradeWatch(r, plan) {
  try {
    const x = plan.ctx, pv = x && x.piv; if (!pv || !isNum(r.cmp)) return '';
    const mv = isNum(r.chg) && Math.abs(r.chg) >= 2 ? `<span class="nt-mv ${r.chg >= 0 ? 'up' : 'dn'}">${r.chg >= 0 ? '▲' : '▼'} moving ${fmtPct(r.chg, 1)} today with no planned setup — chasing now is a late entry (no edge in back-tests); wait for a pullback or a fresh 5-min close beyond a level below</span>` : '';
    return `<small class="nt-w">${mv}Watch: above ₹${fmt(x.h)} (prev high) → long idea · below ₹${fmt(x.l)} (prev low) → short idea · pivot R1 ₹${fmt(pv.R1)} / S1 ₹${fmt(pv.S1)} · CPR ₹${fmt(pv.cprBot)}–${fmt(pv.cprTop)}</small>`;
  } catch (e) { return ''; }
}
function htmlWatchBody(list, data, stamp, busy, isLive, ui) {
  if (!list.syms.length) return '<div class="note">This watchlist is empty. Add NSE or BSE symbols above (comma or space separated) — each gets today’s day-trading call (only when several parameters agree), a live tracker and a track record.</div>';
  const all = list.syms.map((s) => data[s] || { sym: s, loading: true }), V = WL.view || { f: 'all', s: 'az' };
  const cnt = { all: all.length, buy: all.filter((r) => callSide(r) === 'BUY').length, sell: all.filter((r) => callSide(r) === 'SELL').length, none: all.filter((r) => r.ok && !callSide(r)).length };
  let rows = all.filter((r) => V.f === 'all' || r.loading || (V.f === 'buy' && callSide(r) === 'BUY') || (V.f === 'sell' && callSide(r) === 'SELL') || (V.f === 'none' && r.ok && !callSide(r)) || (!r.ok && V.f === 'none'));
  const sc = (r) => (r.active ? Math.abs(r.active.score || 0) : -1), hv = (r) => (r.acc && isNum(r.acc.hit) ? r.acc.hit : -1);
  rows = rows.slice().sort((a, b) => (V.s === 'score' ? sc(b) - sc(a) : V.s === 'acc' ? hv(b) - hv(a) : 0) || symBase(a.sym).localeCompare(symBase(b.sym)));
  const tb = ui ? `<div class="wlfilter"><span class="cap">Show</span>${[['all', 'All'], ['buy', '▲ Buy'], ['sell', '▼ Sell'], ['none', 'No trade']].map((x) => `<button class="wlchip${V.f === x[0] ? ' on' : ''}" onclick="wlSetView('f','${x[0]}')">${x[1]} <small>${cnt[x[0]]}</small></button>`).join('')}<span class="cap" style="margin-left:14px">Sort</span><select onchange="wlSetView('s',this.value)"><option value="az"${V.s === 'az' ? ' selected' : ''}>A → Z (default)</option><option value="score"${V.s === 'score' ? ' selected' : ''}>Strongest call first</option><option value="acc"${V.s === 'acc' ? ' selected' : ''}>Best track record first</option></select></div>` : '';
  const okRows = all.filter((r) => r.ok), A = mergeAcc(okRows.map((r) => r.acc));
  const live = okRows.filter((r) => r.today && r.active && r.liveNow).map((r) => r.today.res), nLive = live.filter((x) => x.live).length, nT = live.filter((x) => x.state === 'T1' || x.state === 'T2' || (x.live && x.chosen && x.chosen.ev.t1hit)).length, nS = live.filter((x) => x.state === 'SL').length, nW = live.filter((x) => x.state === 'WAIT').length;
  const kpi = `<div class="kp">${accKpi('Calls replayed', A.sessions, `${okRows.length} stocks · last ~40 sessions · only sessions where a call was issued`)}${accKpi('Triggered', A.trig, (A.sessions ? Math.round((A.trig / A.sessions) * 100) + '% of days' : ''))}${accKpi('Target hit', pct0(A.hit), `T1 or T2 · ${A.T1 + A.T2} of ${A.trig}`, A.hit >= 0.5 ? 'num-green' : 'num-red')}${accKpi('Stop-loss', pct0(A.slRate), `${A.SL} of ${A.trig}`, 'num-red')}${accKpi('Profitable', pct0(A.win), 'net R > 0 per trade')}${accKpi('Net result', (A.netR >= 0 ? '+' : '') + A.netR.toFixed(1) + 'R', isNum(A.avgR) ? 'avg ' + (A.avgR >= 0 ? '+' : '') + A.avgR.toFixed(2) + 'R / trade' : '', A.netR >= 0 ? 'num-green' : 'num-red')}${isLive ? accKpi('Right now', `${nLive} live`, `${nW} waiting · ${nT} at T1/T2 · ${nS} stopped`) : ''}</div>`;
  let trs = '';
  rows.forEach((r) => {
    const nm = symBase(r.sym) + (symEx(r.sym) === 'BO' ? ' <em class="bsetag">BSE</em>' : '');
    if (r.loading) { trs += `<tr><td class="lbl"><b>${nm}</b></td><td colspan="10" class="rd">loading…</td></tr>`; return; }
    const rm = `<button class="xbtn" title="Remove" onclick="wlRemove('${esc(r.sym)}')">✕</button>`, xr = `<button class="xrbtn" title="Live X-ray of ${esc(symBase(r.sym))}" onclick="jcXray('${esc(r.sym)}')">X-ray</button>`;
    if (!r.ok) { trs += `<tr><td class="lbl"><b>${nm}</b>${rm}</td><td colspan="10" class="rd num-red">${esc(r.reason)}</td></tr>`; return; }
    const plan = r.active; if (!plan) { trs += `<tr><td class="lbl"><b>${nm}</b>${rm}</td><td colspan="10" class="rd">No plan (ATR unavailable)</td></tr>`; return; }
    if (!plan.sides.length) { const tailN = `<td class="acc">${isNum(r.acc.hit) ? `<b>${pct0(r.acc.hit)}</b> hit<small>${r.acc.trig} trades / ${r.acc.sessions} calls</small>` : '<small>no triggered calls yet</small>'}${dotsHtml(r.acc)}</td>`; trs += `<tr class="nocall"><td class="lbl"><a href="#" class="symlink" onclick="loadSymbol('${esc(r.sym)}');return false">${nm}</a>${xr}${rm}<small>No trade</small></td><td>₹${fmt(r.cmp)}<small class="${r.chg >= 0 ? 'num-green' : 'num-red'}">${fmtPct(r.chg, 2)}</small></td><td colspan="8" class="rd" title="${esc(plan.pts.map((p) => p.label + ' ' + (p.v > 0 ? '+' : '') + p.v + ': ' + p.txt).join('\n'))}"><b>No trade</b> — ${esc((plan.reasons || []).join('; ') || 'no edge')} <small>(score ${plan.score >= 0 ? '+' : ''}${plan.score.toFixed(1)}; calls need ≥ ${JC.CFG.minScore})</small>${noTradeWatch(r, plan)}</td>${tailN}</tr>`; return; }
    const todayEv = r.liveNow && r.today ? r.today.res.sides : null;
    plan.sides.forEach((sd, i) => {
      const ev = todayEv ? (todayEv.find((x) => x.sd.dir === sd.dir) || {}).ev : null;
      const st = ev ? wlStatus(sd, ev) : ['range', r.liveNow ? 'Waiting' : `Plan for next session`];
      const head = i === 0 ? `<td class="lbl" rowspan="${plan.sides.length}"><a href="#" class="symlink" onclick="loadSymbol('${esc(r.sym)}');return false">${nm}</a>${xr}${rm}<small>${esc(plan.bias)} · grade ${esc(plan.grade)}</small></td><td rowspan="${plan.sides.length}">₹${fmt(r.cmp)}<small class="${r.chg >= 0 ? 'num-green' : 'num-red'}">${fmtPct(r.chg, 2)}</small></td>` : '';
      const tail = i === 0 ? `<td rowspan="${plan.sides.length}" class="acc">${isNum(r.acc.hit) ? `<b>${pct0(r.acc.hit)}</b> hit<small>${r.acc.trig} trades / ${r.acc.sessions} sessions</small>` : '<small>no triggered trades yet</small>'}${dotsHtml(r.acc)}</td>` : '';
      trs += `<tr class="${sd.dir > 0 ? 'bull' : 'bear'}">${head}<td title="${esc(plan.pts.map((p) => p.label + ' ' + (p.v > 0 ? '+' : '') + p.v + ': ' + p.txt).join('\n'))}"><span class="stance ${sd.dir > 0 ? 'bull' : 'bear'}">${sd.dir > 0 ? '▲ BUY' : '▼ SELL'}</span><small>score ${Math.abs(plan.score).toFixed(1)} · hover for why</small></td><td><b>${fmt(sd.entry)}</b><small>${sd.dir > 0 ? 'above prev high' : 'below prev low'}</small></td><td class="num-red">${fmt(sd.sl)}<small>${fmtPct(((sd.sl - sd.entry) / sd.entry) * 100, 2)}</small></td><td class="num-green">${fmt(sd.t1)}<small>${fmtPct(((sd.t1 - sd.entry) / sd.entry) * 100, 2)} · ${esc(sd.t1Why)}</small></td><td class="num-green">${fmt(sd.t2)}<small>${fmtPct(((sd.t2 - sd.entry) / sd.entry) * 100, 2)} · ${esc(sd.t2Why)}</small></td><td>${sd.rr1.toFixed(1)} / ${sd.rr2.toFixed(1)}</td><td><span class="stance ${st[0]}">${esc(st[1])}</span></td><td>${svgTrack(sd, ev, r.cmp)}</td>${tail}</tr>`;
    });
  });
  const main = `<div class="halfcard"><div class="rh">${isLive ? 'LIVE TRACKER' : 'PLAN FOR THE NEXT SESSION'} · DAY-TRADING LEVELS</div><div class="scrollx"><table class="uptable wl"><tr><th style="text-align:left">Stock</th><th>LTP</th><th style="text-align:left">Side</th><th>Entry</th><th>Stop-loss</th><th>Target 1</th><th>Target 2</th><th>R:R 1/2</th><th style="text-align:left">Status</th><th>Tracker (SL · E · T1 · T2 ▼ LTP)</th><th style="text-align:left">Accuracy · last 20</th></tr>${trs}</table></div></div>`;
  const accRows = okRows.slice().sort((a, b) => (b.acc.hit ?? -1) - (a.acc.hit ?? -1)).map((r) => { const a = r.acc; return `<tr><td class="lbl"><b>${esc(symBase(r.sym))}</b></td><td>${a.sessions}</td><td>${a.trig}</td><td>${a.T2}</td><td>${a.T1}</td><td>${a.SL}</td><td>${a.eodP + a.eodN}</td><td>${a.nt + a.skip}</td><td>${isNum(a.hit) ? `<div class="hb"><i style="width:${Math.round(a.hit * 100)}%"></i></div><b>${pct0(a.hit)}</b>` : '—'}</td><td>${pct0(a.win)}</td><td class="${a.netR >= 0 ? 'num-green' : 'num-red'}">${a.netR >= 0 ? '+' : ''}${a.netR.toFixed(1)}R</td><td>${dotsHtml(a, 25)}</td></tr>`; }).join('');
  const accTbl = okRows.length ? `<div class="halfcard"><div class="rh">ACCURACY OF THE CALLS · SAME RULES REPLAYED ON REAL 5-MIN CANDLES (last ~20 sessions)</div><div class="scrollx"><table class="uptable"><tr><th style="text-align:left">Stock</th><th>Sessions</th><th>Triggered</th><th>T2</th><th>T1</th><th>Stop</th><th>EOD exit</th><th>No trade</th><th style="text-align:left">Target-hit %</th><th>Profitable</th><th>Net R</th><th style="text-align:left">Each dot = a session</th></tr>${accRows}</table></div><div class="legendline"><i style="background:#0d8a4b"></i>target hit <i style="background:#c0233f"></i>stop-loss <i style="background:#e0a61a"></i>closed without target/stop <i style="background:#c6cde0"></i>no trade</div></div>` : '';
  const upd = stamp ? `Updated ${new Date(stamp).toLocaleTimeString('en-IN')}` : '';
  return `${tb}${kpi}${main}${accTbl}<div class="footnote">${busy ? 'Refreshing… ' : ''}${upd}. <b>How a call is made:</b> only when independent parameters agree — trend (20/50/200 DMA), ADX strength, RSI, MACD, prior-day close &amp; volume, CPR, the 20-day range and the Nifty / India-VIX regime. Below the confluence threshold (or in a chop, a thin or a too-wild stock) the answer is <b>No trade</b> — there are no two-sided “try both” plans any more. Stop &amp; targets snap to pivots / CPR / Camarilla / prior high-low (ATR-bounded). <b>Entry needs a 5-minute candle to close beyond the trigger</b> (a wick does not count), not before 9:20, not after 2:30 PM, and not on a gap-chase. Half is booked at T1 (stop to cost), half at T2; square-off 3:15 PM; ≈0.05 % costs are charged to every trade. <b>Accuracy</b> replays these exact rules on the last ~40 sessions using only data known before each open; if stop and target share a candle the stop counts first. It is the rules’ track record, not a forecast — sizing should assume any single call can fail.</div>`;
}

/* ============================================================
   ORCHESTRATOR — raw feeds → full report model
   ============================================================ */
function buildReport(D) {
  const nowMs = D.nowMs || Date.now();
  const meta = D.daily.meta || {}, sm = D.summary || {};
  const nd = normalizeDaily(D.daily.bars, meta, D.intra?.bars, nowMs, D.daily2 && D.daily2.bars);
  const nse = D.deliv && typeof D.deliv === 'object' ? D.deliv : null;
  const tsqM = (nse && nse.resQ && nse.resQ.data) || D.tsq || null;
  const tsM = D.ts || (nse && nse.resA) ? Object.assign({}, D.ts || {}, (nse && nse.resA && nse.resA.data) || {}) : null;
  const dly = nd.bars, n = dly.length;
  if (n < 60) throw new Error('Only ' + n + ' daily candles available — too little history for reliable indicators.');
  const C = dly.map((x) => x.c), H = dly.map((x) => x.h), L = dly.map((x) => x.l), V = dly.map((x) => x.v);
  const raw = (o) => (o && o.raw != null ? o.raw : null);
  const price = sm.price || {}, sd = sm.summaryDetail || {}, dks = sm.defaultKeyStatistics || {}, fd = sm.financialData || {}, ap = sm.assetProfile || {};
  const mk = marketStatus(nowMs, last(dly).t);
  const cmp = isNum(meta.regularMarketPrice) ? meta.regularMarketPrice : last(C);
  const prevClose = C[n - 2], dayChg = cmp - prevClose, dayPct = (dayChg / prevClose) * 100;
  const ind = { ema9: EMA(C, 9), ema20: EMA(C, 20), ema50: EMA(C, 50), sma50: SMA(C, 50), sma100: SMA(C, 100), sma200: SMA(C, 200), rsi: RSI(C), macd: MACD(C), atr: ATR(dly), bb: BB(C), st: STOCH(dly), adx: ADX(dly), obv: OBV(dly), cci: CCI(dly), mfi: MFI(dly), sup: SUPERTREND(dly, 10, 3) };
  const atrD = at(ind.atr);
  const w52s = Math.max(0, n - 252), w52H = Math.max(...H.slice(w52s)), w52L = Math.min(...L.slice(w52s));
  const fibWin = (len) => { const s = Math.max(0, n - len); let mx = s, mn = s; for (let i = s; i < n; i++) { if (H[i] > H[mx]) mx = i; if (L[i] < L[mn]) mn = i; } const hi = H[mx], lo = L[mn], rg = hi - lo, up = mx >= mn; return { hi, lo, up, range: rg, levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((p) => ({ pct: p, level: up ? hi - p * rg : lo + p * rg })), ext: [1.272, 1.618].map((p) => ({ pct: p, level: up ? hi + (p - 1) * rg : lo - (p - 1) * rg })) }; };
  const fib = fibWin(60), lfib = fibWin(Math.min(n, 500));
  const retOf = (off) => (n - 1 - off >= 0 ? (cmp / C[n - 1 - off] - 1) * 100 : null);
  const WC = (D.weekly?.bars || []).map((x) => x.c), wn = WC.length;
  const wret = (off) => (wn > off ? (last(WC) / WC[wn - 1 - off] - 1) * 100 : null);
  const ret = { d10: retOf(10), d1: dayPct, w1: retOf(5), m1: retOf(21), m3: retOf(63), m6: retOf(126), y1: retOf(252), y3: wret(156), y5: wret(260) };
  ret.cagr3 = isNum(ret.y3) ? (Math.pow(1 + ret.y3 / 100, 1 / 3) - 1) * 100 : null; ret.cagr5 = isNum(ret.y5) ? (Math.pow(1 + ret.y5 / 100, 1 / 5) - 1) * 100 : null;
  let benchRet = null;
  if (D.bench?.bars?.length > 130) { const B = D.bench.bars.map((x) => x.c), bn = B.length, bo = (o) => (bn - 1 - o >= 0 ? (last(B) / B[bn - 1 - o] - 1) * 100 : null); benchRet = { w1: bo(5), m1: bo(21), m3: bo(63), m6: bo(126), y1: bn > 252 ? bo(252) : null }; }
  const tenYH = D.weekly?.bars?.length ? Math.max(...D.weekly.bars.map((x) => x.h)) : null;
  // annual statements
  const fin = { tables: [], years: 0, revCagr: null, niCagr: null };
  if (tsM) {
    const cagr = (arr) => { if (!arr || arr.length < 3) return null; const a = arr[0].val, b = last(arr).val; return a > 0 && b > 0 ? Math.pow(b / a, 1 / (arr.length - 1)) - 1 : null; };
    fin.revCagr = cagr(tsM.annualTotalRevenue); fin.niCagr = cagr(tsM.annualNetIncome); fin.years = tsM.annualTotalRevenue?.length || tsM.annualNetIncome?.length || 0;
    fin.tables = TS_TYPES.filter((k) => tsM[k]).map((k) => ({ key: k, rows: tsM[k].slice(-5) }));
  }
  const nextEarningsRaw = sm.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
  const yNE = nextEarningsRaw ? { date: new Date(nextEarningsRaw * 1000), days: Math.ceil((nextEarningsRaw * 1000 - nowMs) / 864e5) } : null;
  const nextEarnings = pickNextResult(nse, yNE, nowMs);
  const derived = deriveFundamentals(tsM, tsqM, cmp, nse);
  // price cross-check (all Yahoo-sourced; NSE/Google feeds are separate)
  const px = [cmp, last(C)]; const sp = raw(price.regularMarketPrice); if (isNum(sp)) px.push(sp); if (D.intra?.bars?.length) px.push(last(D.intra.bars).c);
  const med = [...px].sort((a, b) => a - b)[Math.floor(px.length / 2)], agree = px.filter((p) => Math.abs(p - med) / med < 0.01).length;
  const X = { derived, dly, C, H, L, V, ind, cmp, n, mk, mcap: raw(sd.marketCap) ?? raw(price.marketCap), atrD, atr: atrD, w52H, w52L, fib, lfib, ret, benchRet, fin, fd, dks, sd, price, raw, tenYH, sector: ap.sector, nextEarnings, nowMs, daily: dly };
  X.res = analyseResults(tsqM, tsM, fd, raw);
  X.res.info.src = nse && nse.resQ ? 'NSE exchange filings' : D.tsq ? 'Yahoo statements' : null;
  X.delM = deliveryMetrics(D.deliv, X, D.intra?.bars);
  X.delLatest = X.delM.latest;
  const est = estimateDelivery(X, D.intra?.bars);
  if (!X.delM.today) X.delM.today = est.today;
  if (!X.delM.prev) X.delM.prev = est.prev;
  X.reac = analyseReactions(dly, D.bench?.bars, X.res.info.quarters.map((q) => q.date), (nse && nse.resQ && nse.resQ.ann.length ? nse.resQ.ann.map((a) => ({ ts: a.ts, hasTime: a.hasTime })) : (D.daily.earnEvents || []).map((t) => ({ ts: t, hasTime: false }))).filter((c) => c.ts < nowMs / 1000), cmp, (atrD / cmp) * 100, X.res.ratio);
  const out = {
    sym: D.sym, exch: D.exch, name: raw(price.longName) ?? price.longName ?? meta.longName ?? meta.shortName ?? D.sym, sector: ap.sector || null, industry: ap.industry || null, currency: meta.currency || 'INR',
    cmp, prevClose, dayChg, dayPct, dayH: H[n - 1], dayL: L[n - 1], vol: V[n - 1], w52H, w52L, mcap: raw(sd.marketCap) ?? raw(price.marketCap), beta: raw(sd.beta) ?? raw(dks.beta), avgVol: raw(sd.averageVolume),
    lastDate: new Date(last(dly).t * 1000), nowMs, live: mk.live, priceAgree: agree, priceN: px.length, ret, benchRet, feeds: D.feeds || [], news: D.news || [], deliv: D.deliv || null, nextEarnings,
  };
  out.res = X.res; out.delivM = X.delM; out.dpr = D.deliv?.dpr || null;
  const td = dly[n - 1], pd = dly[n - 2];
  out.resultInfo = X.reac; out.dailyNote = nd;
  out.audit = dly.slice(-6).map((b) => ({ date: istDate(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, src: nd.src[istDate(b.t)] || 'Yahoo 2Y feed', approx: !!b.approx }));
  { const pdate = istDate(dly[n - 2].t), lastDate = istDate(dly[n - 1].t), psrc = nd.src[pdate] || 'Yahoo 2Y feed', vals = [{ src: psrc, val: dly[n - 2].c }];
    const ex = ((D.daily2 && D.daily2.bars) || []).find((b) => istDate(b.t) === pdate); if (ex && !ex.approx && psrc !== 'Yahoo 1M cross-check') vals.push({ src: 'Yahoo 1M feed', val: ex.c });
    const s5 = ((D.intra && D.intra.bars) || []).filter((x) => istDate(x.t) === pdate); if (s5.length >= 20 && psrc !== 'rebuilt from 5-min feed') vals.push({ src: '5-min last close', val: last(s5).c });
    const gapDates = nd.gaps.filter((g) => g > pdate && g < lastDate), mx = Math.max(...vals.map((v) => v.val)), mn = Math.min(...vals.map((v) => v.val));
    out.prevCheck = { date: pdate, vals, gapDates, ok: (mx - mn) / mx < 0.006 && !gapDates.length, n: vals.length }; }
  const isToday = istDate(td.t) === istDate(nowMs / 1000);
  out.snap = { todayLabel: isToday ? 'TODAY' : 'LAST SESSION', prevLabel: isToday ? 'PREV DAY' : 'PRIOR SESSION', todayDate: istDate(td.t), prevDate: istDate(pd.t), open: [td.o, pd.o], high: [td.h, pd.h], low: [td.l, pd.l], vol: [td.v, pd.v] };
  out.pivots = buildPivots(dly, nowMs, mk.live); out.fib = { s60: fib, s2y: lfib };
  out.intraday = buildIntraday(D, X);
  out.swing = buildSwing(D, X);
  out.long = buildLong(D, X);
  out.closes = C; out.last5 = dly.slice(-5).map((b, i, a) => ({ date: istDate(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, chg: i === 0 ? (b.c / dly[n - 6].c - 1) * 100 : (b.c / a[i - 1].c - 1) * 100 }));
  out.matrix = buildMatrix(out);
  out.playbook = buildPlaybook(out);
  return out;
}

/* ============================================================
   HTML BUILDERS (pure — return strings)
   ============================================================ */
const pill = (v, lab) => { const l = lab || ['Bearish', 'Neutral', 'Bullish']; return v === null ? '<span class="pill na">n/a</span>' : v > 0 ? `<span class="pill buy">${l[2]}</span>` : v < 0 ? `<span class="pill sell">${l[0]}</span>` : `<span class="pill wait">${l[1]}</span>`; };
const sc = (cls, cap, val, sub, chip) => `<div class="sc ${cls}">${cap ? `<span class="cap">${cap}</span>` : ''}<b>${val}${chip || ''}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
const dchip = (a, b) => { if (!isNum(a) || !isNum(b) || b === 0) return ''; const p = (a / b - 1) * 100; return `<i class="dchip ${p >= 0 ? 'u' : 'd'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%</i>`; };
const srow = (label, a, b) => `<div class="srow"><div class="sl">${label}</div>${a}${b}</div>`;
const chipCls = (label) => (/stop|risk|exit|floor|holder|weak below|short below/i.test(label) ? 'd-red' : /target|upside/i.test(label) ? 'd-green' : /entry|buy|zone|accumulate|re-entry|long above/i.test(label) ? 'd-teal' : 'd-purple');
const chipsHtml = (levels) => levels.map((l) => sc(chipCls(l.label), esc(l.label), esc(l.v), l.sub ? esc(l.sub) : '')).join('');
function sigTable(rows, lab) {
  return `<div class="scrollx"><table class="sig"><tr><th>Imp.</th><th style="text-align:left">Indicator</th><th style="text-align:left">Reading</th><th>Signal</th></tr>${byImp(rows).map((r) => `<tr><td class="imp2">${dots(impOf(r.name))}</td><td class="lbl">${esc(r.name)}</td><td class="rd">${esc(r.reading)}</td><td>${pill(r.v, lab)}</td></tr>`).join('')}</table></div>`;
}
function levelsTable(levels, cmp) {
  const rows = [...levels, { v: cmp, label: 'CMP', type: 'cmp' }].sort((a, b) => b.v - a.v);
  return `<div class="scrollx"><table class="lvl"><tr><th style="text-align:left">Level</th><th>Price</th><th>vs CMP</th><th>Type</th></tr>${rows.map((l) => (l.type === 'cmp' ? `<tr class="cmprow"><td class="lbl">▶ CMP</td><td>${fmt(l.v)}</td><td>—</td><td>live</td></tr>` : `<tr><td class="lbl">${esc(l.label)}</td><td>${fmt(l.v)}</td><td class="${l.v > cmp ? 'num-red' : 'num-green'}">${fmtPct(((l.v - cmp) / cmp) * 100, 1)}</td><td>${l.v > cmp ? 'Resistance' : 'Support'}</td></tr>`)).join('')}</table></div>`;
}
/* ---------- tiny inline-SVG graphics (no libraries) ---------- */
let __gid = 0;
function svgGauge(ratio, title, sub) {
  const cx = 50, cy = 48, r = 38, pt = (deg, rr) => [cx + rr * Math.cos((deg * Math.PI) / 180), cy - rr * Math.sin((deg * Math.PI) / 180)];
  const arc = (a1, a2, col) => { const [x1, y1] = pt(a1, r), [x2, y2] = pt(a2, r); return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${col}" stroke-width="9" fill="none"/>`; };
  const has = isNum(ratio), ang = has ? 180 - ((Math.max(-1, Math.min(1, ratio)) + 1) / 2) * 180 : 90, [nx, ny] = pt(ang, r - 6);
  return `<div class="gaugebox"><svg viewBox="0 0 100 60" class="gauge">${arc(180, 122, '#e8788a')}${arc(120, 62, '#f2c26b')}${arc(60, 0, '#52c28a')}${has ? `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#14306e" stroke-width="2.4" stroke-linecap="round"/>` : ''}<circle cx="${cx}" cy="${cy}" r="3.6" fill="#14306e"/><text x="${cx}" y="58" text-anchor="middle" class="gv">${has ? (ratio >= 0 ? '+' : '') + ratio.toFixed(2) : 'n/a'}</text></svg><b>${esc(title)}</b><small>${esc(sub)}</small></div>`;
}
function svgRuler(cmp, items, w) {
  w = w || 340; const vals = items.map((i) => i.v).concat([cmp]).filter(isNum); if (vals.length < 2) return '';
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
  const X = (v) => 14 + ((v - lo) / (hi - lo)) * (w - 28), y0 = 40, zone = (a, b, col) => `<rect x="${Math.min(X(a), X(b)).toFixed(1)}" y="${y0 - 6}" width="${Math.abs(X(a) - X(b)).toFixed(1)}" height="12" rx="3" fill="${col}"/>`;
  const stop = items.find((i) => i.k === 's'), tg = items.filter((i) => i.k === 't');
  let g = `<line x1="8" x2="${w - 8}" y1="${y0}" y2="${y0}" stroke="#c9d2e6" stroke-width="2"/>`;
  if (stop) g += zone(stop.v, cmp, '#fbd9e0'); if (tg.length) g += zone(cmp, Math.max(...tg.map((t) => t.v)), '#d3f1e1');
  const mk = [{ label: 'CMP', v: cmp, k: 'c' }].concat(items).filter((i) => isNum(i.v)).sort((a, b) => a.v - b.v); let lastX = -99, tier = 0;
  mk.forEach((m) => {
    const x = X(m.v); tier = x - lastX < 40 ? 1 - tier : 0; lastX = x;
    const col = m.k === 's' ? '#c11d3d' : m.k === 't' ? '#12894b' : '#14306e', rel = (m.v - cmp) / cmp, pct = m.k === 'c' ? '' : fmtPct(rel * 100, Math.abs(rel) < 0.02 ? 2 : 1);
    g += `<circle cx="${x.toFixed(1)}" cy="${y0}" r="${m.k === 'c' ? 5.5 : 4.5}" fill="${col}" stroke="#fff" stroke-width="1.6"/><text x="${x.toFixed(1)}" y="${10 + tier * 11}" text-anchor="middle" class="svt" fill="${col}">${esc(m.label)}</text>${pct ? `<text x="${x.toFixed(1)}" y="${y0 + 17 + tier * 11}" text-anchor="middle" class="svp" fill="${col}">${pct}</text>` : ''}`;
  });
  return `<svg viewBox="0 0 ${w} 78" class="ruler">${g}</svg>`;
}
function svgSpark(closes, levels, w, h) {
  w = w || 340; h = h || 104; const n = Math.min(90, closes.length); if (n < 10) return '';
  const c = closes.slice(-n), e20 = EMA(closes, 20).slice(-n); let lo = Math.min(...c), hi = Math.max(...c); const span = hi - lo || 1;
  const lv = levels.filter((l) => isNum(l.v) && l.v > lo - span * 0.4 && l.v < hi + span * 0.4); lv.forEach((l) => { lo = Math.min(lo, l.v); hi = Math.max(hi, l.v); });
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad; const id = 'sg' + (++__gid), X = (i) => 4 + (i / (n - 1)) * (w - 50), Y = (v) => h - 6 - ((v - lo) / (hi - lo)) * (h - 14);
  const path = (arr) => arr.map((v, i) => (v == null ? '' : `${i && arr[i - 1] != null ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).join(' ');
  const line = path(c), area = `${line} L${X(n - 1).toFixed(1)} ${h - 6} L${X(0).toFixed(1)} ${h - 6} Z`;
  const lines = lv.map((l) => `<line x1="4" x2="${w - 46}" y1="${Y(l.v).toFixed(1)}" y2="${Y(l.v).toFixed(1)}" stroke="${l.col}" stroke-dasharray="3 3" stroke-width="1"/><text x="${w - 44}" y="${(Y(l.v) + 3).toFixed(1)}" class="svt" fill="${l.col}">${esc(l.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="spark"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2347a8" stop-opacity=".22"/><stop offset="1" stop-color="#2347a8" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#${id})"/>${lines}<path d="${path(e20)}" stroke="#d98a10" fill="none" stroke-width="1.2" stroke-dasharray="2 2"/><path d="${line}" stroke="#14306e" fill="none" stroke-width="1.8"/><circle cx="${X(n - 1).toFixed(1)}" cy="${Y(c[n - 1]).toFixed(1)}" r="3.2" fill="#14306e"/></svg>`;
}
function svgRange(lo, hi, marks, label, w) {
  w = w || 340; if (!isNum(lo) || !isNum(hi) || hi <= lo) return ''; const id = 'rg' + (++__gid), X = (v) => 8 + ((v - lo) / (hi - lo)) * (w - 16);
  const m = marks.filter((k) => isNum(k.v) && k.v >= lo && k.v <= hi); let tier = 0, lastX = -99;
  const pins = m.sort((a, b) => a.v - b.v).map((k) => { const x = X(k.v); tier = x - lastX < 30 ? 1 - tier : 0; lastX = x; const anc = x > w - 34 ? 'end' : x < 34 ? 'start' : 'middle'; return `<path d="M${x.toFixed(1)} 20 l-4 -7 h8 z" fill="${k.col}"/><text x="${x.toFixed(1)}" y="${9 - tier * 0}" text-anchor="${anc}" class="svt" fill="${k.col}">${esc(k.label)}</text>`; }).join('');
  return `<div class="rangebox"><div class="rl2">${esc(label)}</div><svg viewBox="0 0 ${w} 50" class="range"><defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#f3b5c0"/><stop offset=".5" stop-color="#f7e5b6"/><stop offset="1" stop-color="#b9e7cd"/></linearGradient></defs><rect x="8" y="22" width="${w - 16}" height="8" rx="4" fill="url(#${id})"/>${pins}<text x="8" y="46" class="svp">₹${fmt(lo)}</text><text x="${w - 8}" y="46" text-anchor="end" class="svp">₹${fmt(hi)}</text></svg></div>`;
}
function svgReactions(events, exp) {
  const w = 230, h = 78, ev = events.slice().reverse(); if (!ev.length) return '<div class="muted" style="padding:6px 0">No past result reactions detected — expected move is volatility-based.</div>';
  const m = Math.max(exp, ...ev.map((e) => Math.abs(e.ret) * 100)) * 1.2, mid = 36, scale = (v) => (v / m) * 28, slot = (w - 20) / ev.length, bw = Math.min(30, slot - 8);
  let g = `<line x1="8" x2="${w - 8}" y1="${mid}" y2="${mid}" stroke="#c9d2e6"/><line x1="8" x2="${w - 8}" y1="${(mid - scale(exp)).toFixed(1)}" y2="${(mid - scale(exp)).toFixed(1)}" stroke="#9aa7c7" stroke-dasharray="3 3"/><line x1="8" x2="${w - 8}" y1="${(mid + scale(exp)).toFixed(1)}" y2="${(mid + scale(exp)).toFixed(1)}" stroke="#9aa7c7" stroke-dasharray="3 3"/><text x="${w - 8}" y="${(mid - scale(exp) - 2).toFixed(1)}" text-anchor="end" class="svp">±${exp.toFixed(1)}% expected</text>`;
  ev.forEach((e, i) => { const x = 14 + i * slot + (slot - bw) / 2, v = e.ret * 100, hh = Math.max(2, Math.abs(scale(v))), y = v >= 0 ? mid - hh : mid; g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${hh.toFixed(1)}" rx="2" fill="${v >= 0 ? '#3cb878' : '#e0546a'}"/><text x="${(x + bw / 2).toFixed(1)}" y="${(v >= 0 ? y - 3 : y + hh + 9).toFixed(1)}" text-anchor="middle" class="svp" fill="${v >= 0 ? '#0a6b3b' : '#a3122e'}">${fmtPct(v, 1)}</text><text x="${(x + bw / 2).toFixed(1)}" y="${h - 3}" text-anchor="middle" class="svp">${dShort(e.date)}</text>`; });
  return `<svg viewBox="0 0 ${w} ${h}" class="react" width="${w}" height="${h}" style="max-width:100%;height:auto">${g}</svg>`;
}
function dotStrip(rows) {
  const rs = byImp(rows.filter((r) => r.v !== null)), up = rs.filter((r) => r.v > 0).length, dn = rs.filter((r) => r.v < 0).length, nt = rs.length - up - dn;
  return `<span class="dots">${rs.map((r) => `<i class="dot ${r.v > 0 ? 'g' : r.v < 0 ? 'r' : 'a'}${impOf(r.name) === 3 ? ' big' : ''}" title="${esc(r.name)}: ${esc(shortOf(r.reading))}"></i>`).join('')}</span><span class="dcount"><b class="gc">▲ ${up}</b> <b class="rc">▼ ${dn}</b> <b class="ac">● ${nt}</b></span>`;
}

/* ---------- verdict chips (top bar) ---------- */
function htmlVerdictChips(R) {
  const i = R.intraday, s = R.swing, l = R.long;
  const chip = (id, t, call, tone) => `<span class="vchip ${tone}" onclick="showTab('${id}')"><i>${t}</i>${esc(call)}</span>`;
  return chip('pIntraday', 'INTRADAY', i.ok ? i.plan.dir : 'n/a', i.ok ? toneOf(i.plan.dir) : 'range') + chip('pSwing', 'SWING', s.rating, s.tone) + chip('pLong', 'LONG TERM', l.rating, l.tone);
}
/* ---------- result bar: next date (blinks when near), move since last result, expected move ---------- */
function htmlResultBar(R) {
  const ri = R.resultInfo, ne = R.nextEarnings, near = ne && ne.days >= 0 && ne.days <= 15, fast = ne && ne.days >= 0 && ne.days <= 7, fd = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const nx = ne ? `<span class="rb${near ? ' alert' + (fast ? ' fast' : '') : ''}"><i>NEXT RESULT${ne.exchange ? ' · NSE ✓' : ''}${near ? ' · NEARING' : ''}</i><b>${fd(ne.date)}</b><em>${ne.days >= 0 ? 'in ' + ne.days + (ne.days === 1 ? ' day' : ' days') : 'date passed'} · ${esc(ne.source)}</em></span>` : '<span class="rb"><i>NEXT RESULT</i><b>Not listed</b><em>no date in the NSE / Yahoo calendar</em></span>';
  const ls = ri.last ? `<span class="rb"><i>SINCE LAST RESULT · ${dShort(ri.last.date)}${ri.inferred ? ' (inferred)' : ''}</i><b class="${ri.sinceMove >= 0 ? 'up' : 'dn'}">${fmtPct(ri.sinceMove, 1)}</b><em>₹${fmt(ri.last.base)} → ₹${fmt(R.cmp)} · reaction day ${fmtPct(ri.last.ret * 100, 1)}</em></span>` : '<span class="rb"><i>SINCE LAST RESULT</i><b>n/a</b><em>no past reaction detected</em></span>';
  const ex = `<span class="rb"><i>EXPECTED MOVE ON NEXT RESULT</i><b>±${ri.expMove.toFixed(1)}%</b><em>₹${fmt(ri.expLo, 0)} – ₹${fmt(ri.expHi, 0)} · ${esc(ri.basis)}</em></span>`;
  return `<div class="rbar">${nx}${ls}${ex}</div>`;
}
/* ---------- golden-frame outlook for the selected tab (deep colour = key numbers only) ---------- */
function htmlGolden(R, tab) {
  const I = R.intraday, W = R.swing, L = R.long, M = R.matrix;
  const cfg = tab === 'intraday' ? { title: 'INTRADAY OUTLOOK', call: I.ok ? I.plan.dir : 'n/a', tone: I.ok ? toneOf(I.plan.dir) : 'range', score: I.ok ? `Live technicals ${sg(I.t)}` : '', conf: M[0].conf, rows: I.ok ? I.rows : [], levels: M[0].levels, sub: 'same session · MIS · square off by 3:15 PM' }
    : tab === 'swing' ? { title: 'SHORT-TERM (SWING) OUTLOOK', call: W.rating, tone: W.tone, score: `Technicals ${sg(W.t)}`, conf: M[1].conf, rows: W.rows, levels: M[1].levels, sub: '1–4 weeks · delivery' }
      : { title: 'LONG-TERM OUTLOOK', call: L.rating, tone: L.tone, score: `Business ${sg(L.ft)} · Timing ${sg(L.tt)}`, conf: M[4].conf, rows: [...L.res.rows, ...L.tech], levels: M[4].levels.filter((l) => !/Business review/.test(l.label)), sub: '2–5 years · investment' };
  const drv = byImp(cfg.rows.filter((r) => r.v !== null)).slice(0, 5).map((r) => `<span class="drv ${r.v > 0 ? 'up' : r.v < 0 ? 'dn' : 'nt'}">${r.v > 0 ? '▲' : r.v < 0 ? '▼' : '●'} ${esc(r.name.replace(/\s*\(.*?\)/g, ''))}: <b>${esc(shortOf(r.reading))}</b></span>`).join('');
  return `<div class="golden"><div class="gtop"><div><span class="gtitle">${cfg.title}</span><span class="gsc">${esc(R.name)} · ₹${fmt(R.cmp)} <i class="${R.dayPct >= 0 ? 'up' : 'dn'}">${fmtPct(R.dayPct)}</i> · ${cfg.sub}</span></div><div class="gverdict"><span class="callbadge ${cfg.tone}">${esc(cfg.call)}</span><small>${esc(cfg.score)} · confidence ${esc(cfg.conf)}</small></div></div>${drv ? `<div class="drivers">${drv}</div>` : ''}${cfg.levels.length ? `<div class="chips">${chipsHtml(cfg.levels)}</div>` : ''}${htmlResultBar(R)}</div>`;
}
/* ---------- snapshot: ONE table ---------- */
function htmlSnapshot(R) {
  const s = R.snap, dm = R.delivM || {}, noBe = R.deliv ? '' : ' · NSE backend not connected', up = R.dayPct >= 0, d = R.dpr, pc = R.prevCheck;
  const chg = (a, b) => (isNum(a) && isNum(b) && b ? `<td class="${a >= b ? 'num-green' : 'num-red'}">${fmtPct((a / b - 1) * 100, 2)}</td>` : '<td>—</td>');
  const row = (l, a, b, f) => { f = f || fmt; return `<tr><td class="lbl">${l}</td><td class="tv">${f(a)}</td><td>${f(b)}</td>${chg(a, b)}</tr>`; };
  const dq = (x) => (x ? `${fmtVol(x.qty)} <small>${fmt(x.pct, 0)}%${x.kind === 'Actual' || !x.kind ? '' : ' est'}</small>` : '—');
  const chk = pc ? (pc.gapDates && pc.gapDates.length ? `<span class="chip warnc">⚠ no candle for ${pc.gapDates.map(dShort).join(', ')} (holiday or missing data) — “previous” shown is ${dShort(pc.date)}</span>` : pc.ok && pc.n >= 2 ? `<span class="chip ok">✓ prev close ₹${fmt(R.prevClose)} (${dShort(pc.date)}) · ${pc.n} feeds agree</span>` : pc.ok ? `<span class="chip">ℹ prev close ₹${fmt(R.prevClose)} (${dShort(pc.date)}) · single source: ${esc(pc.vals[0].src)}</span>` : `<span class="chip warnc">⚠ prev close disagrees — ${pc.vals.map((v) => esc(v.src) + ' ₹' + fmt(v.val)).join(' · ')}</span>`) : '';
  return `<div class="halfcard"><div class="rh">MARKET SNAPSHOT<span class="legend">${chk}</span></div><div class="cmprow2"><span class="cmpbig ${up ? 'up' : 'dn'}">CMP ₹${fmt(R.cmp)}</span><span class="cmpchg ${up ? 'up' : 'dn'}">${fmtPct(R.dayPct)} (${R.dayChg >= 0 ? '+' : ''}${fmt(R.dayChg)})</span><span class="cmpprev">prev close ₹${fmt(R.prevClose)} · ${R.live ? 'LIVE' : 'last close'}</span></div><table class="snap"><tr><th></th><th>${s.todayLabel} · ${dShort(s.todayDate)}</th><th>${s.prevLabel} · ${dShort(s.prevDate)}</th><th>Δ</th></tr>${row('Open', s.open[0], s.open[1])}${row('High', s.high[0], s.high[1])}${row('Low', s.low[0], s.low[1])}${row('Close / CMP', R.cmp, R.prevClose)}${row('Volume', s.vol[0], s.vol[1], fmtVol)}<tr><td class="lbl">Delivery vol</td><td class="tv">${dq(dm.today)}</td><td>${dq(dm.prev)}</td>${dm.today && dm.prev ? chg(dm.today.qty, dm.prev.qty) : '<td>—</td>'}</tr><tr><td class="lbl">DPR band</td><td colspan="3" class="rd">${d && (isNum(d.lower) || isNum(d.upper)) ? `₹${fmt(d.lower)} – ₹${fmt(d.upper)}${d.band ? ' · band ' + esc(d.band) + (/\d/.test(d.band) ? '%' : '') : ''}` : '—' + noBe}</td></tr><tr><td class="lbl">52-week range</td><td colspan="3" class="rd">₹${fmt(R.w52L)} – ₹${fmt(R.w52H)} · CMP ${fmtPct(((R.cmp - R.w52H) / R.w52H) * 100, 1)} from high, ${fmtPct(((R.cmp - R.w52L) / R.w52L) * 100, 1)} above low</td></tr></table><div class="footnote">${R.dailyNote.note ? '⚑ ' + esc(R.dailyNote.note) + ' ' : ''}“est” delivery = algorithmic (±8 pts), not exchange data.</div></div>`;
}
/* ---------- signals: ONE table per tab ---------- */
const labsF = ['Weak', 'Fair', 'Strong'];
const sigRows = (rows, labs) => byImp(rows).map((r) => ({ label: r.name, value: r.reading, v: r.v, imp: impOf(r.name), labs: r.labs || labs }));
function signalsCard(title, rows, legend) {
  const body = rows.map((r) => { const t = r.v === null ? `<span class="pill na">${r.value === '—' ? 'n/a' : 'Info'}</span>` : pill(r.v, r.labs), hot = r.imp === 3 && r.v ? ' hot' : ''; return `<tr><td class="imp2">${r.imp ? dots(r.imp) : ''}</td><td class="lbl">${esc(r.label)}</td><td class="rd">${esc(r.value)}</td><td class="sgn${hot}">${t}</td></tr>`; }).join('');
  return `<div class="halfcard"><div class="rh">${title}<span class="legend">${legend || '●●● decisive · ●○○ supporting'}</span></div><div class="scrollx"><table class="sig"><tr><th>Imp.</th><th style="text-align:left">Indicator</th><th style="text-align:left">Reading</th><th>Signal</th></tr>${body}</table></div></div>`;
}
const intraRows = (I) => sigRows(I.rows).concat([
  { label: 'Relative volume', value: I.rvol == null ? '—' : I.rvol.toFixed(2) + '× vs same time on prior sessions', v: I.rvol == null ? null : I.rvol >= 1.5 ? 1 : I.rvol < 0.7 ? -1 : 0, labs: ['Thin', 'Normal', 'Heavy'], imp: 2 },
  { label: 'Gap vs prev close', value: I.gapPct == null ? '—' : fmtPct(I.gapPct), v: null }, { label: 'Day range vs daily ATR', value: I.rangeAtr.toFixed(2) + '×', v: null }, { label: 'ATR 5-min / daily', value: `${fmt(I.atr5)} / ${fmt(I.atrD)}`, v: null }]);
const swingRows = (R) => { const m = R.swing.metrics; return sigRows(R.swing.rows).concat([{ label: 'ATR (14)', value: `${fmt(m.atr)} (${((m.atr / R.cmp) * 100).toFixed(1)}% of price)`, v: null }, { label: 'CCI (20) / MFI (14)', value: `${fmt(m.cci, 0)} / ${fmt(m.mfi, 1)}`, v: null }, { label: 'Bollinger band width', value: `${fmt(m.bw, 1)}%`, v: null }]); };
function longRows(R) {
  const L = R.long, strip = (x) => String(x).replace(/<[^>]*>/g, '');
  const f = L.F.filter((x) => x.group === 'Recent results' || x.v !== null).map((x) => ({ name: x.name, reading: strip(x.value) + (x.reading ? ' — ' + x.reading : ''), v: x.v, labs: labsF }));
  const info = L.F.filter((x) => x.v === null && x.group !== 'Recent results' && /P\/B|Dividend yield|Promoter|Mean target/.test(x.name)).map((x) => ({ label: x.name, value: strip(x.value) + (x.reading ? ' — ' + x.reading : ''), v: null }));
  return sigRows(f.concat(L.tech.map((r) => ({ name: r.name, reading: r.reading, v: r.v })))).concat(info);
}

/* ---------- pivot / fibonacci / matrix ---------- */
function htmlPivotTable(R, cols, cam) {
  const P = R.pivots, cmp = R.cmp; cols = cols.filter((k) => P[k]);
  const keys = [['R3', 'R3'], ['R2', 'R2'], ['R1', 'R1'], ['P', 'Pivot'], ['S1', 'S1'], ['S2', 'S2'], ['S3', 'S3'], ['cprTop', 'CPR top'], ['cprBot', 'CPR bottom']].concat(cam ? [['H4', 'Camarilla H4'], ['H3', 'Camarilla H3'], ['L3', 'Camarilla L3'], ['L4', 'Camarilla L4']] : []);
  const cell = (v) => `<td class="${v > cmp ? 'pres' : 'psup'}">${fmt(v)}<small>${fmtPct(((v - cmp) / cmp) * 100, 1)}</small></td>`;
  return `<div class="halfcard"><div class="rh">PIVOT TABLE<span class="legend">CMP ₹${fmt(cmp)} · red = resistance · green = support</span></div><div class="scrollx"><table class="pvt"><tr><th>Level</th>${cols.map((k) => `<th>${esc(P[k].label)}</th>`).join('')}</tr>${keys.map(([k, l]) => `<tr class="${k === 'P' ? 'pp' : ''}"><td class="lbl">${l}</td>${cols.map((c) => cell(P[c].set[k])).join('')}</tr>`).join('')}</table></div></div>`;
}
function htmlFibTable(R, key, title) {
  const f = R.fib[key], cmp = R.cmp, labs = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((p) => `${(p * 100).toFixed(1)}%`).concat(['Ext 127.2%', 'Ext 161.8%']);
  const lv = f.levels.map((x) => x.level).concat(f.ext.map((x) => x.level)); let bi = 0; lv.forEach((v, i) => { if (Math.abs(v - cmp) < Math.abs(lv[bi] - cmp)) bi = i; });
  return `<div class="halfcard"><div class="rh">FIBONACCI MAP · ${title}<span class="legend">${f.up ? 'up-swing' : 'down-swing'} ₹${fmt(f.lo)} → ₹${fmt(f.hi)}</span></div><div class="scrollx"><table class="pvt"><tr><th>Level</th><th>Price</th><th>vs CMP</th></tr>${labs.map((lb, i) => `<tr><td class="lbl">${lb}${i === 0 ? ' (swing end)' : i === 6 ? ' (swing start)' : ''}</td><td class="${lv[i] > cmp ? 'pres' : 'psup'}${bi === i ? ' near' : ''}">${fmt(lv[i])}</td><td>${fmtPct(((lv[i] - cmp) / cmp) * 100, 1)}${bi === i ? ' ◀ CMP zone' : ''}</td></tr>`).join('')}</table></div></div>`;
}
function htmlMatrixRows(R, idxs) {
  const rows = idxs.map((i) => R.matrix[i]).map((m) => `<tr class="${m.tone}"><td class="lbl"><b>${esc(m.horizon)}</b><small>${esc(m.sub)}</small></td><td><span class="callbadge ${m.tone}">${esc(m.call)}</span><small>${esc(m.conf)}</small></td><td class="rd">${esc(m.basis)}${m.notes.length ? `<div class="mn">${m.notes.map((x) => '⚑ ' + esc(x)).join('<br>')}</div>` : ''}</td><td class="lv">${m.levels.map((l) => `<span class="${/stop|risk|floor|exit|weak|short/i.test(l.label) ? 'r' : /target|upside/i.test(l.label) ? 'g' : ''}"><i>${esc(l.label)}</i> <b>${esc(l.v)}</b>${l.sub ? ` <em>${esc(l.sub)}</em>` : ''}</span>`).join('')}</td><td class="rd">${esc(m.review)}</td></tr>`).join('');
  return `<div class="halfcard"><table class="mtx"><tr><th>Horizon</th><th>Call</th><th style="text-align:left">Why — data behind the call</th><th style="text-align:left">Levels · % · time</th><th style="text-align:left">Review</th></tr>${rows}</table></div>`;
}
const MATRIX_NOTE = '<div class="footnote">Horizon-aware: technicals drive intraday and swing calls; business results (last 2–3 quarters + latest year), quality and valuation take over as the horizon lengthens (positional 35% · 6–12 months 60% · 2–5 years 85%). Shorting appears only in intraday. Weak results cap a call at HOLD; strong results turn a falling price into staggered accumulation, never a multi-year exit. Missing feeds give INCOMPLETE DATA, not a guess.</div>';
/* ---------- extra tables used to fill spare space ---------- */
const card = (html, h) => ({ html, h });
const tbl = (title, head, rows, legend) => `<div class="halfcard"><div class="rh">${title}${legend ? `<span class="legend">${legend}</span>` : ''}</div><div class="scrollx"><table class="lvl"><tr>${head.map((h, i) => `<th${i === 0 ? ' style="text-align:left"' : ''}>${h}</th>`).join('')}</tr>${rows.join('')}</table></div></div>`;
function cardLast5(R) {
  const rows = R.last5.slice().reverse().map((r) => `<tr><td class="lbl">${dShort(r.date)}</td><td>${fmt(r.o)}</td><td>${fmt(r.h)}</td><td>${fmt(r.l)}</td><td>${fmt(r.c)}</td><td class="${r.chg >= 0 ? 'num-green' : 'num-red'}">${fmtPct(r.chg, 2)}</td><td>${fmtVol(r.v)}</td></tr>`);
  return card(tbl('LAST 5 SESSIONS', ['Date', 'Open', 'High', 'Low', 'Close', 'Chg', 'Volume'], rows), 60 + 5 * 26);
}
function cardMA(R) {
  const rows = R.swing.maRows.map((m) => `<tr><td class="lbl">${m.name}</td><td>${fmt(m.val)}</td><td class="${m.val > R.cmp ? 'num-red' : 'num-green'}">${isNum(m.val) ? fmtPct(((m.val - R.cmp) / R.cmp) * 100, 1) : '—'}</td><td class="${m.slope >= 0 ? 'num-green' : 'num-red'}">${isNum(m.slope) ? fmtPct(m.slope, 2) : '—'}</td><td>${isNum(m.val) ? (R.cmp > m.val ? '<span class="pill buy">Above</span>' : '<span class="pill sell">Below</span>') : ''}</td></tr>`);
  return card(tbl('MOVING AVERAGES · DAILY', ['Average', 'Value', 'vs CMP', '5-day slope', 'Price'], rows, 'green = support below price'), 60 + 6 * 26);
}
function cardReturns(R) {
  const b = R.benchRet || {}, r = R.ret, row = (l, s, n, extra) => `<tr><td class="lbl">${l}${extra ? ` <small>CAGR ${extra.toFixed(1)}%</small>` : ''}</td><td class="${s >= 0 ? 'num-green' : 'num-red'}">${isNum(s) ? fmtPct(s, 1) : '—'}</td><td>${isNum(n) ? fmtPct(n, 1) : '—'}</td><td class="${isNum(s) && isNum(n) ? (s - n >= 0 ? 'num-green' : 'num-red') : ''}">${isNum(s) && isNum(n) ? fmtPct(s - n, 1) : '—'}</td></tr>`;
  const rows = [row('1 week', r.w1, b.w1), row('1 month', r.m1, b.m1), row('3 months', r.m3, b.m3), row('6 months', r.m6, b.m6), row('1 year', r.y1, b.y1), row('3 years', r.y3, null, r.cagr3), row('5 years', r.y5, null, r.cagr5)];
  return card(tbl('RETURNS vs NIFTY 50', ['Period', 'Stock', 'Nifty', 'Alpha'], rows), 60 + 7 * 26);
}
function cardCandles15(R) {
  const I = R.intraday; if (!I.ok || !I.c15 || !I.c15.length) return null;
  const rows = I.c15.slice(-8).reverse().map((c) => `<tr><td class="lbl">${new Date((c.t + 19800) * 1000).toISOString().slice(11, 16)}</td><td>${fmt(c.o)}</td><td>${fmt(c.h)}</td><td>${fmt(c.l)}</td><td class="${c.c >= c.o ? 'num-green' : 'num-red'}">${fmt(c.c)}</td><td>${fmtVol(c.v)}</td></tr>`);
  return card(tbl('LATEST 15-MIN CANDLES', ['IST', 'Open', 'High', 'Low', 'Close', 'Volume'], rows, 'newest first'), 60 + 8 * 26);
}
/* two equal-height columns; spare space in the shorter column is filled from the pool of extra tables */
function balanced(left, right, pool) {
  let hl = left.reduce((a, c) => a + c.h, 0), hr = right.reduce((a, c) => a + c.h, 0);
  const L = left.slice(), Rr = right.slice();
  for (let k = 0; k < pool.length;) {
    const e = pool[k], diff = Math.abs(hl - hr);
    if (diff >= e.h * 0.6) { if (hl <= hr) { L.push(e); hl += e.h; } else { Rr.push(e); hr += e.h; } pool.splice(k, 1); } else k++;
  }
  const col = (a) => `<div class="col">${a.map((c) => c.html).join('')}</div>`;
  return `<div class="split">${col(L)}${col(Rr)}</div>`;
}
const restRow = (pool) => (pool.length ? `<div class="tabrow">${pool.map((c) => c.html).join('')}</div>` : '');
/* ---------- result-day playbook ---------- */
function htmlPlaybook(R) {
  const p = R.playbook; if (!p) return '';
  return `<div class="playbook ${p.tone}"><div class="pbh"><span class="pbt">RESULT-DAY PLAYBOOK · result in ${p.days} day${p.days === 1 ? '' : 's'}</span><span class="callbadge ${p.tone}">${esc(p.stance)}</span></div><div class="pbhead">${esc(p.head)}</div><div class="pbcols"><ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul><div class="scen">${p.scen.map((s) => sc(s.cls, esc(s.name), esc(s.move), esc(s.plan))).join('')}</div></div></div>`;
}
/* ---------- upcoming results (Nifty 500, next 7 days) ---------- */
function svgWeek(U) {
  const days = []; for (let d = U.from; d <= U.to; d = addDays(d, 1)) days.push(d);
  const cnt = days.map((d) => { const o = { bull: 0, range: 0, bear: 0, n: 0 }; U.rows.filter((r) => r.date === d).forEach((r) => { o[r.error ? 'range' : r.tone]++; o.n++; }); return o; });
  const mx = Math.max(1, ...cnt.map((c) => c.n)), W = 640, colW = W / days.length, H = 150, base = 120, scale = 92 / mx;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Results per day">`;
  days.forEach((d, i) => {
    const c = cnt[i], x = i * colW + colW * 0.2, w = colW * 0.6; let y = base;
    [['bull', '#16a05d'], ['range', '#e0a61a'], ['bear', '#d02a48']].forEach(([k, col]) => { const h = c[k] * scale; if (h > 0) { y -= h; s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}" rx="2"/>`; } });
    const wd = new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
    s += `<text x="${x + w / 2}" y="${base - c.n * scale - 4}" text-anchor="middle" font-size="11" font-weight="800" fill="#14306e">${c.n || ''}</text><text x="${x + w / 2}" y="${base + 13}" text-anchor="middle" font-size="10" font-weight="700" fill="#4a5880">${esc(dShort(d))}</text><text x="${x + w / 2}" y="${base + 25}" text-anchor="middle" font-size="9" fill="#7a86a8">${wd}</text>`;
  });
  return s + '</svg>';
}
const chanceBar = (p) => (!p ? '<span class="rd">history too short</span>' : `<div class="cb"><i class="g2" style="width:${(p.p2 * 100).toFixed(1)}%"></i><i class="g1" style="width:${((p.p1 - p.p2) * 100).toFixed(1)}%"></i><i class="gn" style="width:${(Math.max(0, p.pNone) * 100).toFixed(1)}%"></i><i class="gs" style="width:${(p.pSL * 100).toFixed(1)}%"></i></div><div class="cbt"><b class="num-green">T1 ${pct0(p.p1)}</b> · T2 ${pct0(p.p2)} · <span class="num-red">SL ${pct0(p.pSL)}</span></div>`);
function htmlUpcoming(U, forPrint) {
  if (!U) return '<div class="note">Click <b>Load upcoming results</b> to list every Nifty 500 company reporting in the next 7 days, each with entry, stop-loss, two targets and the % chance of reaching them. Needs the Apps Script backend — or load an NSE Event-Calendar CSV / paste symbols above.</div>';
  if (U.error) return `<div class="errbox">${esc(U.error)}</div>`;
  const fromYahoo = U.source === 'yahoo';
  if (!U.rows.length) return `<div class="note warn"><b>No records.</b> ${U.manual ? 'No company in the uploaded / pasted list has results inside the window.' : fromYahoo ? `Yahoo was asked for the next earnings date of ${U.checked} stocks: ${U.withDate} returned a date, none falls between ${esc(dShort(U.from))} and ${esc(dShort(U.to))}${U.batchErrors ? ` (${U.batchErrors} batch(es) failed)` : ''}.` : 'No Nifty 500 company could be matched from the NSE calendar.'}</div>${htmlUpDiag(U)}`;
  const sym = (r) => (forPrint ? `<b>${esc(r.symbol)}</b>` : `<a href="#" class="symlink" onclick="loadSymbol('${esc(r.symbol)}');return false">${esc(r.symbol)}</a>`);
  const dt = (r) => (r.date ? `<span class="${r.daysLeft <= 1 ? 'blink' : ''}">${dShort(r.date)}</span><small>${r.daysLeft <= 0 ? 'TODAY' : r.daysLeft === 1 ? 'TOMORROW' : 'in ' + r.daysLeft + ' days'}${r.tentative ? ' · tentative' : U.manual ? '' : ' · NSE'}</small>` : '—<small>date n/a</small>');
  const ok = U.rows.filter((r) => !r.error), nb = ok.filter((r) => r.tone === 'bull').length, nw = ok.filter((r) => r.tone === 'range').length, nr = ok.filter((r) => r.tone === 'bear').length;
  const withP = ok.filter((r) => r.p && r.dir > 0 && r.tone !== 'bear'), avgP = withP.length ? withP.reduce((a, r) => a + r.p.p1, 0) / withP.length : null;
  const kpi = `<div class="kp"><div class="kpi"><span class="cap">Reporting</span><b>${U.total}</b><small>${U.analysed} analysed</small></div><div class="kpi"><span class="cap">Pre-result longs</span><b class="num-green">${nb}</b><small>trend-supported</small></div><div class="kpi"><span class="cap">Wait / dip-buy</span><b style="color:#a86b00">${nw}</b><small>no edge before the number</small></div><div class="kpi"><span class="cap">Avoid / exit</span><b class="num-red">${nr}</b><small>weak trend</small></div><div class="kpi"><span class="cap">Avg T1 chance (longs)</span><b>${pct0(avgP)}</b><small>own 1-yr history</small></div></div>`;
  const picks = ok.filter((r) => isNum(r.edge)).sort((a, b) => b.edge - a.edge).slice(0, 6);
  const pickTbl = picks.length ? `<div class="halfcard"><div class="rh">TOP SETUPS BY EDGE (T1 chance × reward:risk − stop chance)</div><table class="lvl uptable"><tr><th style="text-align:left">Stock</th><th>Result</th><th style="text-align:left">Call</th><th>Entry</th><th>Stop-loss</th><th>Target 1</th><th style="text-align:left">Chance</th><th>Edge</th></tr>${picks.map((r) => `<tr class="${r.tone}"><td class="lbl">${sym(r)}<small>${esc(r.company)}</small></td><td class="dt">${dShort(r.date)}</td><td><span class="stance ${r.tone}">${r.dir > 0 ? '▲' : '▼'} ${esc(r.stance)}</span></td><td>${esc(r.entry)}</td><td>${esc(r.stop)}</td><td>${esc(r.t1)}</td><td>${chanceBar(r.p)}</td><td class="${r.edge >= 0 ? 'num-green' : 'num-red'}"><b>${r.edge >= 0 ? '+' : ''}${r.edge.toFixed(2)}R</b></td></tr>`).join('')}</table></div>` : '';
  const rows = U.rows.map((r) => (r.error ? `<tr class="ur"><td class="dt">${dt(r)}</td><td class="lbl">${sym(r)}<small>${esc(r.company)}</small></td><td colspan="10" class="rd">Price data unavailable (${esc(r.error)})</td></tr>`
    : `<tr class="ur ${r.tone}"><td class="dt">${dt(r)}</td><td class="lbl">${sym(r)}<small>${esc(r.company)}${r.industry ? ' · ' + esc(r.industry) : ''}</small></td><td>₹${fmt(r.cmp)}<small class="${r.run10 >= 0 ? 'num-green' : 'num-red'}">${fmtPct(r.run5, 1)} 5d · ${fmtPct(r.run10, 1)} 10d</small></td><td><span class="stance ${r.tone}">${r.dir > 0 ? '▲' : '▼'} ${esc(r.stance)}</span><small>${esc(r.rating)} · ${esc(r.trend)}</small></td><td>${esc(r.entry)}</td><td>${esc(r.stop)}</td><td>${esc(r.t1)}</td><td>${esc(r.t2)}</td><td>${r.rr1.toFixed(1)} / ${r.rr2.toFixed(1)}</td><td class="chance">${chanceBar(r.p)}</td><td>±${r.exp.toFixed(1)}%</td><td class="rd">${esc(forPrint ? r.short : r.note)}</td></tr>`)).join('');
  const srcNote = fromYahoo ? `<div class="note warn"><b>Dates are Yahoo Finance projections (tentative)</b> — NSE’s calendar was unreachable from the backend, so ${U.checked} Nifty 500 stocks were checked on Yahoo and ${U.withDate} returned a next-earnings date. Confirm each date on the exchange before trading a result.</div>` : '';
  const capNote = U.capped ? ` · first ${U.cap || 200} by date shown` : '';
  return `${srcNote}${kpi}<div class="split up"><div class="halfcard"><div class="rh">RESULTS PER DAY (green = trend-supported · amber = wait · red = weak)</div>${svgWeek(U)}</div>${pickTbl || '<div class="halfcard"><div class="note">Not enough price history to rank setups.</div></div>'}</div><div class="halfcard"><div class="rh">RESULT-WEEK TRADE LIST · ${esc(dShort(U.from))} – ${esc(dShort(U.to))}${capNote}</div><div class="scrollx"><table class="uptable"><tr><th>Result</th><th style="text-align:left">Stock</th><th>CMP</th><th style="text-align:left">Call</th><th>Entry</th><th>Stop-loss</th><th>Target 1</th><th>Target 2</th><th>R:R 1/2</th><th style="text-align:left">Chance of hitting (T1 · T2 · SL)</th><th>Exp. gap</th><th style="text-align:left">Trading notes</th></tr>${rows}</table></div></div><div class="footnote"><b>How to read the chances:</b> the same stop / T1 / T2 distances (as % of price) are replayed from every day of this stock’s last year of daily candles, over ${(U.rows.find((r) => r.p) || { p: { H: '5–15' } }).p.H} sessions (result day + a few after). The bar shows how often T2 (dark green), only T1 (light green), neither (grey) or the stop first (red) happened — a track record of the geometry on this stock, <i>not</i> a forecast; a result gap can jump over a stop. Pre-result long = half size; “priced-in” = already moved more than the expected result move; “wait” = flat until the post-result breakout. Not investment advice — verify dates and quotes before acting.</div>`;
}
function htmlUpDiag(U) {
  const st = U.stats, dg = U.diag || [], bad = dg.some((d) => d.status === 0 || d.status >= 400 || (d.status === 200 && d.json === false));
  const rowsH = dg.map((d) => `<tr><td class="lbl">${esc(d.name)}</td><td class="${d.status === 200 ? 'num-green' : 'num-red'}">${d.status || 'no reply'}</td><td>${d.rows ?? ''}</td><td class="rd">${esc(d.sample || '')}</td></tr>`).join('');
  const funnel = st ? `<div class="funnel">NSE returned <b>${st.rawEvents + st.rawMeetings}</b> rows → <b>${st.resultType}</b> are results meetings → <b>${st.inWindow}</b> fall inside the window → <b>${st.inNifty}</b> ${U.n500Missing ? '(Nifty 500 list unavailable — not filtered)' : 'are in the Nifty 500'}</div>` : '';
  const advice = bad ? 'NSE is refusing, or not answering, requests from Google’s servers (common). The app then falls back to Yahoo earnings dates; you can also load the Event-Calendar CSV from nseindia.com (Corporates → Event Calendar).' : '';
  return `${funnel}${dg.length ? `<div class="halfcard"><div class="rh">NSE CALL DIAGNOSTICS</div><table class="lvl"><tr><th style="text-align:left">NSE call</th><th>HTTP</th><th>Rows</th><th style="text-align:left">Note</th></tr>${rowsH}</table></div>` : ''}${advice ? `<div class="note warn" style="margin-top:6px">${esc(advice)}</div>` : ''}`;
}
/* ---------- quick summary: graphics + one glance table ---------- */
function glanceTable(R) {
  const lvl = (m, re) => m.levels.find((l) => re.test(l.label)), cell = (l) => (l ? `<b>${esc(l.v)}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}` : '<span class="muted">—</span>');
  const rows = R.matrix.map((m) => { const ent = lvl(m, /^(Entry|Buy zone|Accumulate)/), stp = lvl(m, /^(Stop|Risk line)/) || lvl(m, /^Hard floor/), t1 = lvl(m, /^Target( 1)?( ·|$)/), t2 = lvl(m, /^Target 2/); return `<tr class="${m.tone}"><td class="lbl"><b>${esc(m.horizon)}</b><small>${esc(m.sub)}</small></td><td><span class="callbadge ${m.tone}">${esc(m.call)}</span></td><td>${cell(ent)}</td><td class="r">${cell(stp)}</td><td class="g">${cell(t1)}</td><td class="g">${cell(t2)}</td></tr>`; }).join('');
  return `<table class="glance"><tr><th style="text-align:left">Horizon</th><th>Call</th><th>Entry</th><th>Stop / risk</th><th>Target 1</th><th>Target 2</th></tr>${rows}</table>`;
}
function htmlSummary(R, forPrint) {
  const I = R.intraday, W = R.swing, L = R.long, m = W.metrics, cmp = R.cmp, up = R.dayPct >= 0, wp = W.plan;
  const rulerItems = (mm) => mm.levels.filter((l) => isNum(l.n)).map((l) => { const stop = /stop|risk|floor/i.test(l.label), t1 = /^Target( 1)?( ·|$)/.test(l.label), t2 = /^Target 2/.test(l.label); return stop ? { label: 'Stop', v: l.n, k: 's' } : t1 ? { label: 'T1', v: l.n, k: 't' } : t2 ? { label: 'T2', v: l.n, k: 't' } : null; }).filter(Boolean);
  const rulers = [[0, 'Intraday'], [1, 'Swing'], [4, 'Long term']].map(([i, nm]) => { const mm = R.matrix[i], it = rulerItems(mm); return `<div class="rulerrow"><span class="rn">${nm}<small>${esc(mm.call)}</small></span>${it.length ? svgRuler(cmp, it) : '<span class="muted">no active trade levels</span>'}</div>`; }).join('');
  const lv90 = wp.mode === 'long' ? [{ v: wp.sl, label: 'Stop', col: '#c11d3d' }, { v: wp.t1, label: 'T1', col: '#12894b' }, { v: wp.t2, label: 'T2', col: '#12894b' }] : [];
  const gL = L.horizonCall(0.15, L.tt.ratio).b;
  const gauges = svgGauge(I.ok ? I.t.ratio : null, 'Intraday', I.ok ? I.plan.dir : 'n/a') + svgGauge(W.t.ratio, 'Swing', W.rating) + svgGauge(isNum(gL) ? gL : null, 'Long term', L.rating);
  const dayR = I.ok ? svgRange(I.sessL, I.sessH, [{ v: I.cmp, label: 'CMP', col: '#14306e' }, { v: I.vwap, label: 'VWAP', col: '#b8860b' }, { v: I.open, label: 'Open', col: '#6b7aa6' }], 'Day range · VWAP · open') : svgRange(R.dayL, R.dayH, [{ v: cmp, label: 'CMP', col: '#14306e' }], 'Day range');
  const yrR = svgRange(R.w52L, R.w52H, [{ v: cmp, label: 'CMP', col: '#14306e' }, { v: m.s200, label: '200DMA', col: '#7236c9' }], '52-week range · 200-day average');
  const why = (rows) => byImp(rows.filter((r) => r.v !== null)).slice(0, 3).map((r) => `<span class="${r.v > 0 ? 'up' : r.v < 0 ? 'dn' : ''}">${r.v > 0 ? '▲' : r.v < 0 ? '▼' : '●'} ${esc(r.name.replace(/\s*\(.*?\)/g, ''))}</span>`).join(' · ');
  const strips = [['Intraday', I.ok ? I.rows : []], ['Swing', W.rows], ['Long term', [...L.res.rows, ...L.tech]]].map(([n, rows]) => `<div class="sigrow"><span class="sn">${n}</span>${dotStrip(rows)}<div class="why">${why(rows)}</div></div>`).join('');
  const pb = R.playbook ? `<div class="c s12 playbook small ${R.playbook.tone}"><span class="pbt">RESULT IN ${R.playbook.days} DAY${R.playbook.days === 1 ? '' : 'S'}</span> <span class="callbadge ${R.playbook.tone}">${esc(R.playbook.stance)}</span> <span class="pbs">${esc(R.playbook.head)}</span></div>` : '';
  const head = `<div class="sumhead"><div class="shl"><b class="shname">${esc(R.name)}</b><span>${esc(R.sym)} · ${R.exch === 'NS' ? 'NSE' : 'BSE'} · ${R.live ? 'market live' : 'market closed'} · data as of ${R.lastDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div><div class="shcmp"><span class="cmpbig ${up ? 'up' : 'dn'}">₹${fmt(cmp)}</span><span class="cmpchg ${up ? 'up' : 'dn'}">${fmtPct(R.dayPct)}</span><span class="cmpprev">prev close ₹${fmt(R.prevClose)} (${dShort(R.snap.prevDate)})${R.prevCheck && R.prevCheck.ok ? ' ✓' : R.prevCheck ? ' ⚠' : ''}</span></div><div class="shchips">${htmlVerdictChips(R)}</div>${R.dailyNote.note ? `<div class="shnote">⚑ ${esc(R.dailyNote.note)}</div>` : ''}</div>`;
  const cGlance = `<div class="halfcard"><div class="rh">TARGETS AT A GLANCE<span class="legend">% from entry / CMP · estimated time to reach</span></div>${glanceTable(R)}</div>`;
  const cRuler = `<div class="halfcard"><div class="rh">TRADE RULERS<span class="legend">distance of stop and targets from CMP</span></div>${rulers}</div>`;
  const cSpark = `<div class="halfcard"><div class="rh">PRICE · 90 DAYS<span class="legend">— close · - - EMA20</span></div>${svgSpark(R.closes, lv90)}</div>`;
  const cGauge = `<div class="halfcard"><div class="rh">CONVICTION<span class="legend">bearish ← → bullish</span></div><div class="gauges">${gauges}</div></div>`;
  const cRange = `<div class="halfcard"><div class="rh">WHERE PRICE SITS</div>${dayR}${yrR}</div>`;
  const cSig = `<div class="halfcard"><div class="rh">SIGNAL HEAT<span class="legend">every indicator · big dot = decisive${forPrint ? '' : ' · hover for detail'}</span></div>${strips}</div>`;
  const cRes = `<div class="halfcard"><div class="rh">RESULT WATCH<span class="legend">past reactions vs expected</span></div>${htmlResultBar(R)}<div class="reactwrap">${svgReactions(R.resultInfo.events, R.resultInfo.expMove)}</div></div>`;
  const cResBar = `<div class="halfcard"><div class="rh">RESULT WATCH<span class="legend">next date · move since last · expected move</span></div>${htmlResultBar(R)}</div>`, cReact = `<div class="halfcard"><div class="rh">PAST RESULT REACTIONS<span class="legend">vs expected</span></div>${svgReactions(R.resultInfo.events, R.resultInfo.expMove)}</div>`;
  const pbHtml = R.playbook ? `<div class="playbook small ${R.playbook.tone}"><span class="pbt">RESULT IN ${R.playbook.days} DAY${R.playbook.days === 1 ? '' : 'S'}</span> <span class="callbadge ${R.playbook.tone}">${esc(R.playbook.stance)}</span> <span class="pbs">${esc(R.playbook.head)}</span></div>` : '';
  if (forPrint) { const lay = (cells) => `<table class="lay"><tr>${cells.map(([w, c]) => `<td style="width:${w}%">${c}</td>`).join('')}</tr></table>`; return `${head}${cGlance}${lay([[56, cRuler], [44, cSpark]])}${lay([[40, cGauge], [60, cRange]])}${cSig}${lay([[62, cResBar], [38, cReact]])}${pbHtml}`; }
  return `<div class="sumgrid"><div class="c s12">${head}</div><div class="c s7 glc">${cGlance}</div><div class="c s5 rul">${cRuler}</div><div class="c s4">${cSpark}</div><div class="c s4">${cGauge}</div><div class="c s4">${cRange}</div><div class="c s7">${cSig}</div><div class="c s5">${cRes}</div>${pbHtml ? `<div class="c s12">${pbHtml}</div>` : ''}</div>`;
}
/* ---------- the three detail tabs (one table per card; extra tables fill spare space) ---------- */
function htmlIntradayTab(R, o) {
  o = o || {}; const I = R.intraday, gold = htmlGolden(R, 'intraday') + htmlPlaybook(R);
  if (!I.ok) return `${gold}<div class="errbox">${esc(I.reason)}</div>${balanced([card(htmlSnapshot(R), 330)], [], [])}`;
  const stat = I.live ? `<span class="chip live">● LIVE SESSION ${esc(I.today)} · ${I.bars} five-min candles</span>` : `<span class="chip closed">MARKET CLOSED — last session ${esc(I.today)} · plan is for the NEXT session</span>`;
  const rows = intraRows(I), pool = [cardLast5(R), cardCandles15(R), cardMA(R)].filter(Boolean);
  const top = balanced([card(htmlSnapshot(R), 330)], [card(signalsCard('INTRADAY SIGNALS — most important first', rows), 60 + rows.length * 30)], pool);
  const mid = balanced([card(htmlPivotTable(R, ['daily'], true), 60 + 13 * 30)], [card(`<div class="halfcard"><div class="rh">LIVE LEVEL LADDER<span class="legend">VWAP · opening range · pivots · CPR · session H/L</span></div>${levelsTable(I.levels, I.cmp)}</div>`, 60 + (I.levels.length + 1) * 24)], pool);
  return `${gold}<div class="statusrow">${stat}</div>${top}${mid}<div class="sect">TRADING CALL</div>${htmlMatrixRows(R, [0])}${restRow(pool)}<div class="footnote">Stops sit beyond the nearest real structural level (+0.1×ATR); targets are the next two levels in the trade direction; % is the move from entry. Pivot/CPR/Camarilla use the ${I.live ? 'previous' : 'last'} session (${esc(I.refDate)}).</div>`;
}
function htmlSwingTab(R, o) {
  o = o || {}; const W = R.swing, p = W.plan, gold = htmlGolden(R, 'swing') + htmlPlaybook(R), rows = swingRows(R), pool = [cardReturns(R), cardMA(R), cardLast5(R)];
  const sg2 = signalsCard('SHORT-TERM SIGNALS — most important first', rows, `${W.t.cnt} of ${W.t.total} scored · ●●● decisive`);
  const top = o.noSnap ? sg2 : balanced([card(htmlSnapshot(R), 330)], [card(sg2, 60 + rows.length * 30)], pool);
  const mid = balanced([card(htmlPivotTable(R, ['daily', 'weekly'], false), 60 + 9 * 30)], [card(htmlFibTable(R, 's60', '60-SESSION SWING'), 60 + 9 * 26)], pool);
  const low = balanced([card(`<div class="halfcard"><div class="rh">SUPPORT &amp; RESISTANCE MAP<span class="legend">swings · MAs · Bollinger · pivots · 52-wk · Fib</span></div>${levelsTable(W.levels, R.cmp)}</div>`, 60 + (W.levels.length + 1) * 24)], [], pool);
  return `${gold}${top}${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}${mid}<div class="sect">TRADING CALLS</div>${htmlMatrixRows(R, [1, 2])}${MATRIX_NOTE}${low}${restRow(pool)}<div class="footnote">Stop = beyond nearest swing support − 0.5×ATR (bounded 1–3×ATR); targets = next resistances ≥1.5×ATR away. Time-to-target is a range between the recent 20-day drift speed and a volatility estimate — a guide, not a promise.</div>`;
}
function htmlLongTab(R, o) {
  o = o || {}; const L = R.long, strip = (x) => String(x).replace(/<[^>]*>/g, ''), gold = htmlGolden(R, 'long') + htmlPlaybook(R);
  const gate = L.gateNotes.length ? `<div class="note warn">⚑ ${L.gateNotes.map(esc).join('<br>⚑ ')}</div>` : '';
  const groups = [...new Set(L.F.map((f) => f.group))].sort((a, b) => (a === 'Recent results' ? -1 : b === 'Recent results' ? 1 : 0));
  const fTable = groups.map((g) => `<tr class="grp"><td colspan="4">${esc(g)}</td></tr>` + L.F.filter((f) => f.group === g).map((f) => `<tr><td class="lbl">${esc(f.name)}</td><td>${esc(strip(f.value))}</td><td class="rd">${esc(f.reading)}</td><td>${pill(f.v, labsF)}</td></tr>`).join('')).join('');
  const qi = L.res.info.quarters, qn = (k, f) => qi.map((q) => `<td>${isNum(q[k]) ? f(q[k]) : '—'}</td>`).join('');
  const qTable = qi.length ? `<div class="scrollx"><table class="lvl"><tr><th style="text-align:left">Quarter</th>${qi.map((q) => `<th>${esc(qLabel(q.date))}</th>`).join('')}</tr><tr><td class="lbl">Revenue</td>${qn('rev', fmtMoney)}</tr><tr><td class="lbl">Operating income</td>${qn('opi', fmtMoney)}</tr><tr><td class="lbl">Net profit</td>${qn('ni', fmtMoney)}</tr><tr><td class="lbl">Net margin</td>${qi.map((q) => `<td>${isNum(q.rev) && isNum(q.ni) && q.rev > 0 ? ((q.ni / q.rev) * 100).toFixed(1) + '%' : '—'}</td>`).join('')}</tr><tr><td class="lbl">Diluted EPS</td>${qn('eps', (v) => '₹' + fmt(v))}</tr></table></div>` : '<div class="note warn">Quarterly results unavailable from NSE filings and Yahoo for this symbol — recent-results signals are limited to Yahoo summary growth fields (or skipped).</div>';
  const tn = { annualTotalRevenue: 'Revenue', annualNetIncome: 'Net income', annualDilutedEPS: 'Diluted EPS', annualOperatingCashFlow: 'Operating cash flow', annualFreeCashFlow: 'Free cash flow', annualTotalDebt: 'Total debt', annualStockholdersEquity: "Shareholders' equity" };
  const trend = L.fin.tables.length ? `<div class="scrollx"><table class="lvl"><tr><th style="text-align:left">Annual (FY)</th>${L.fin.tables[0].rows.map((r) => `<th>${esc(r.date.slice(0, 4))}</th>`).join('')}</tr>${L.fin.tables.map((t) => `<tr><td class="lbl">${tn[t.key]}</td>${t.rows.map((r) => `<td>${t.key === 'annualDilutedEPS' ? '₹' + fmt(r.val) : fmtMoney(r.val)}</td>`).join('')}</tr>`).join('')}</table></div>` : '<div class="note warn">Annual statements unavailable — multi-year trend not scored.</div>';
  const rows = longRows(R), pool = [cardReturns(R), cardLast5(R), cardMA(R)];
  const sg2 = signalsCard('LONG-TERM SIGNALS — business first, then trend', rows, `${L.ft.cnt} fundamentals scored · results source: ${esc(L.res.info.src || 'Yahoo summary only')}`);
  const top = o.noSnap ? sg2 : balanced([card(htmlSnapshot(R), 330)], [card(sg2, 60 + rows.length * 30)], pool);
  const mid = balanced([card(htmlPivotTable(R, ['weekly', 'monthly'], false), 60 + 9 * 30)], [card(htmlFibTable(R, 's2y', '2-YEAR SWING'), 60 + 9 * 26)], pool);
  const fund = card(`<div class="halfcard"><div class="rh">RECENT RESULTS · FUNDAMENTALS · VALUATION</div><div class="scrollx"><table class="sig"><tr><th style="text-align:left">Metric</th><th>Value</th><th style="text-align:left">Reading</th><th>Rating</th></tr>${fTable}</table></div></div>`, 60 + L.F.length * 28);
  const right = [card(`<div class="halfcard"><div class="rh">QUARTERLY RESULTS</div>${qTable}</div>`, 60 + 5 * 26), card(`<div class="halfcard"><div class="rh">ANNUAL TREND</div>${trend}</div>`, 60 + 6 * 26)];
  const low = balanced([fund], right, pool);
  return `${gold}${top}${gate}${mid}<div class="sect">TRADING CALLS</div>${htmlMatrixRows(R, [3, 4])}${low}${restRow(pool)}<div class="footnote">Thresholds (ROE ≥15%, D/E &lt;0.5×, growth ≥10%, P/E &lt;25 …) are fixed rule-of-thumb bands, not sector-relative. “computed” fields are derived from filed results / annual statements when Yahoo's ratio was empty. Time-to-target uses the stock's own growth rates (price CAGR, earnings CAGR, latest YoY) — a guide, not a forecast. Analyst targets are Street estimates.</div>`;
}
function htmlData(R) {
  const feeds = R.feeds.map((f) => `<tr><td class="lbl">${esc(f.name)}</td><td>${f.ok ? (/saved copy/.test(f.via || '') ? '<span class="pill wait">Saved copy</span>' : '<span class="pill buy">Live</span>') : '<span class="pill sell">Unavailable</span>'}</td><td class="rd">${esc(f.ok ? f.via || '' : f.err || '')}</td></tr>`).join('');
  const news = R.news.length ? R.news.map((n) => `<div class="newsitem"><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a><div class="newsdate">${n.date ? new Date(n.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}</div></div>`).join('') : '<div class="newsitem" style="color:#6b7596">No headlines retrieved.</div>';
  const au = R.audit.slice().reverse().map((a) => `<tr><td class="lbl">${dShort(a.date)}</td><td>${fmt(a.o)}</td><td>${fmt(a.h)}</td><td>${fmt(a.l)}</td><td>${fmt(a.c)}</td><td>${fmtVol(a.v)}</td><td class="rd">${esc(a.src)}${a.approx ? ' · OHLC partly missing' : ''}</td></tr>`).join('');
  return `<div class="split"><div class="col"><div class="halfcard"><div class="rh">CANDLE AUDIT — last 6 sessions &amp; source of each<span class="legend">check dates against your terminal</span></div><div class="scrollx"><table class="lvl"><tr><th style="text-align:left">Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th><th style="text-align:left">Source</th></tr>${au}</table></div></div><div class="halfcard"><div class="rh">DATA FEEDS USED</div><div class="scrollx"><table class="lvl"><tr><th style="text-align:left">Feed</th><th>Status</th><th style="text-align:left">Route / error</th></tr>${feeds}</table></div><div class="footnote">A feed marked Unavailable leaves dependent fields as “—/n/a” and removes those signals from the score — nothing is estimated except where labelled “est” or “computed”. Prices are Yahoo Finance data (typically ≤15-min delayed); verify live prices on ODIN before placing orders.</div></div></div><div class="col"><div class="halfcard"><div class="rh">NEWS FLOW</div><div class="newsbox">${news}</div></div></div></div>`;
}

/* ---------- tab-wise PDF document ---------- */
const PRINT_CSS = '@page{size:A4;margin:8mm}html,body{background:#fff!important;font-size:9.5px}body::before,body::after{display:none!important}*{animation:none!important;box-shadow:none!important;text-shadow:none!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.wrap{max-width:none;padding:0}.sc{padding:3px 6px!important}.sc b{font-size:12px!important}.sc small{font-size:8.5px!important}.sc .cap{font-size:7.5px!important}td,th{padding:2px 5px!important;font-size:9px!important}.halfcard{padding:5px 7px!important}.golden,.playbook{padding:5px 8px!important}.drv{font-size:9.5px!important}.footnote,.note{font-size:8.5px!important}.rh{font-size:9.5px!important}.phead{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #b8860b;padding-bottom:6px;margin-bottom:8px}.phead h1{margin:0;font-size:18px;color:#14306e}.phead div div{font-size:10px;color:#4a5880}.pcmp{font-size:20px;font-weight:900;color:#14306e}.ptitle{font-size:14px;font-weight:900;letter-spacing:1px;color:#fff;background:linear-gradient(90deg,#14306e,#2e4fb0);padding:5px 10px;border-radius:6px;margin:12px 0 8px;break-after:avoid;page-break-after:avoid}.tabpage.first .ptitle{margin-top:0}.split{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}.chips,.rstrip,.tabrow,.rbar{display:flex!important;flex-wrap:wrap;gap:6px}.chips>.sc{flex:1 1 22%}.tabrow>.halfcard{flex:1 1 30%}.rbar>.rb{flex:1 1 30%}table.lay{width:100%;border-collapse:separate;border-spacing:6px 0;table-layout:fixed;margin:0 -6px 6px}table.lay>tbody>tr>td{padding:0!important;border:0!important;vertical-align:top;text-align:left!important}table.lay .halfcard{height:100%}.sumhead{margin-bottom:6px}.playbook.small{margin-top:6px}.glance td b{font-size:10.5px}.glance th{font-size:8px!important}.gauges{display:flex!important}.rr,.sc,tr,.drv,.rb{break-inside:avoid}table.lay tr{break-inside:auto}.golden,.playbook,.halfcard{break-inside:auto}.blink,.hot .pill{opacity:1!important}.legal{margin-top:10px}.uptable td.rd{width:30%!important}.stance{font-size:8px!important;padding:1px 5px!important}svg{max-width:100%}.split.up{grid-template-columns:1fr!important}.kp{display:flex!important}.scrollx{overflow:visible!important}.uptable{width:100%!important;table-layout:auto!important}.uptable td,.uptable th{padding:2px 3px!important;font-size:8px!important;line-height:1.25}.uptable td:not(.lbl):not(.dt) small{display:none!important}.uptable .stance{white-space:nowrap!important;font-size:7.5px!important}.uptable td.rd{width:26%!important;font-size:7.5px!important}.uptable td.chance{min-width:0!important}.cb{min-width:70px!important}.cbt{font-size:7.5px!important;white-space:normal!important}.uptable.wl svg{width:105px;height:30px}.uptable.wl td.acc{min-width:0!important}.dots i{width:6px!important;height:6px!important}';
function buildPrintDoc(R, css, U, W) {
  const stamp = new Date().toLocaleString('en-IN'), sec = (title, body, first) => `<section class="tabpage${first ? ' first' : ''}"><div class="ptitle">${title}</div>${body}</section>`;
  const asOf = R ? R.lastDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const head = R ? `<div class="phead"><div><h1>${esc(R.name)} (${esc(R.sym)} · ${R.exch === 'NS' ? 'NSE' : 'BSE'}) — Stock Analyst Report</h1><div>Joshi's Corner · SSJ Finance · generated ${esc(stamp)} · data as of ${esc(asOf)}${R.live ? ' (market live)' : ' (market closed)'}</div></div><div class="pcmp">₹${fmt(R.cmp)} <span style="font-size:12px;color:${R.dayPct >= 0 ? '#06643a' : '#a0102c'}">${fmtPct(R.dayPct)}</span></div></div>` : `<div class="phead"><div><h1>${W ? 'Watchlist — ' + esc(W.name) : 'Upcoming Results — Nifty 500'}</h1><div>Joshi's Corner · SSJ Finance · generated ${esc(stamp)}</div></div></div>`;
  let body = '', first = true;
  if (R) { body += sec('QUICK SUMMARY', htmlSummary(R, true), first); first = false; body += sec('INTRADAY REPORT', htmlIntradayTab(R)); body += sec('SHORT-TERM DELIVERY (SWING) REPORT', htmlSwingTab(R, { noSnap: true })); body += sec('LONG-TERM DELIVERY (INVESTMENT) REPORT', htmlLongTab(R, { noSnap: true })); }
  if (U) { body += sec('UPCOMING RESULTS — NIFTY 500 · NEXT 7 DAYS', htmlUpcoming(U, true), first); first = false; }
  if (W) { body += sec('WATCHLIST — ' + esc(W.name).toUpperCase() + ' · DAY-TRADING LEVELS, LIVE STATUS &amp; ACCURACY', W.html, first); first = false; }
  if (R) body += sec('DATA SOURCES &amp; NEWS', htmlData(R));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(R ? R.sym + " — Joshi's Corner Stock Report" : (W ? 'Watchlist' : 'Upcoming Results'))} — ${esc(asOf)}</title><style>${css}${PRINT_CSS}</style></head><body><div class="wrap">${head}${body}<div class="legal">Systematic, rule-based analysis computed from fetched market data — research input, not personalised investment advice or a guarantee of returns. Prices are delayed Yahoo Finance data; result dates and filed results come from NSE where shown. “est” delivery, expected result-moves and time-to-target are model estimates. Confirm live quotes and price-band status on your trading terminal before acting.</div></div></body></html>`;
}

/* ============================================================
   BROWSER UI WIRING
   ============================================================ */
if (IS_BROWSER) { window.__R = null; window.__U = null; window.__curTab = 'pSummary'; }
const $ = (id) => document.getElementById(id);
function setStatus(msg, cls) { const el = $('statusLine'); el.className = 'statusline show' + (cls ? ' ' + cls : ''); $('statusText').textContent = msg; }
function showTab(id) { window.__curTab = id; document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === id)); const s = $('viewSel'); if (s && s.value !== id) s.value = id; if (id === 'pWatch') wlOnShow(); }
function refreshChips() { $('vchips').innerHTML = window.__R ? htmlVerdictChips(window.__R) : ''; const o = [...$('viewSel').options].find((x) => x.value === 'pUpcoming'); if (o) o.textContent = 'Results week' + (window.__U ? ` (${window.__U.rows.length})` : ''); }
function printPDF() {
  let R = window.__R, U = window.__U, W = null;
  if (window.__curTab === 'pWatch' && WL.store) { const l = wlList(); W = { name: l.name, html: htmlWatchBody(l, WL.data, WL.stamp, false, marketClock(Date.now()).open) }; R = null; U = null; }
  if (!R && !U && !W) { alert('Generate a report (or load upcoming results / open a watchlist) first.'); return; }
  const html = buildPrintDoc(R, ($('appcss') || {}).textContent || '', U, W), old = $('printFrame'); if (old) old.remove();
  const f = document.createElement('iframe'); f.id = 'printFrame'; f.style.cssText = 'position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;z-index:-1'; document.body.appendChild(f);
  const d = f.contentWindow.document; d.open(); d.write(html); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { alert('Print failed: ' + e.message); } }, 600);
}
function loadSymbol(sym) { $('symbolInput').value = symBase(sym); $('exchangeInput').value = symEx(sym); showTab('pSummary'); window.scrollTo({ top: 0, behavior: 'smooth' }); runAnalysis(); }
async function feed(name, fn) { const tr = {}; try { const d = await fn(tr); return { name, ok: d != null, data: d, via: tr.via }; } catch (e) { return { name, ok: false, data: null, err: (e && e.message) || String(e) }; } }
async function runUpcomingList(P) {
  const msg = $('upMsg'), body = $('upBody'), base = { from: P.from, to: P.to, stats: P.stats, diag: P.diag, n500Missing: P.n500Missing, manual: P.manual, source: P.source, checked: P.checked, withDate: P.withDate, batchErrors: P.batchErrors }; let U;
  if (!P.list.length) U = Object.assign({ rows: [], analysed: 0, total: 0, capped: false }, base);
  else { msg.textContent = `Analysing ${Math.min(P.list.length, 200)} stocks…`; const bench = await fetchChart('^NSEI', '1y', '1d').catch(() => null); const A = await analyseUpcoming(P.list, bench, (d, t) => { msg.textContent = `Analysing stocks… ${d}/${t}`; }, Date.now()); U = Object.assign({}, A, base); }
  window.__U = U; body.innerHTML = htmlUpcoming(U); msg.textContent = `Updated ${new Date().toLocaleTimeString('en-IN')}`; refreshChips();
}
async function loadUpcoming() {
  const btn = $('upBtn'), msg = $('upMsg'), body = $('upBody'); btn.disabled = true; msg.textContent = 'Fetching NSE calendar…';
  const fail = (html) => { msg.textContent = ''; body.innerHTML = `<div class="errbox">${html}</div>`; };
  try {
    if (!getBackend()) { fail('<b>Data backend not connected.</b> The calendar needs the Apps Script backend (NSE and Yahoo both block direct browser access). Deploy <code>Code.gs</code> as a web app and paste its /exec URL under “Data backend”, or load an NSE Event-Calendar CSV / paste symbols above.'); return; }
    let j = null, P = null, nseErr = '';
    try { j = await fetchUpcoming(7); P = parseUpcoming(j, Date.now(), 7); } catch (e) { nseErr = (e && e.message) || String(e); }
    if (!P || !P.list.length) {
      const universe = j && rowsOf(j.nifty500).length ? rowsOf(j.nifty500) : null, syms = universe ? universe.map((x) => x.symbol) : NIFTY_FALLBACK, meta = universe ? new Map(universe.map((x) => [String(x.symbol).toUpperCase(), x])) : null;
      msg.textContent = `NSE calendar ${nseErr ? 'unreachable' : 'empty'} — reading Yahoo earnings dates for ${syms.length} stocks…`;
      const E = await fetchEarnDates(syms, (d, t) => { msg.textContent = `Reading Yahoo earnings dates… ${d}/${t}`; });
      const Y = parseYahooEarn(E, Date.now(), 7, meta); Y.diag = P ? P.diag : []; Y.stats = P ? P.stats : null; if (!universe) Y.n500Missing = true; P = Y;
    }
    await runUpcomingList(P);
  } catch (e) {
    const m = (e && e.message) || String(e); let ver = 'unknown';
    if (m === 'OLD_BACKEND') { try { const pj = JSON.parse(await fetchWithTimeout(beUrl(getBackend(), 'action=ping'), 12000)); ver = pj && pj.v ? String(pj.v) : 'old (no version number)'; } catch (x) { ver = 'not reachable'; } }
    fail(m === 'OLD_BACKEND' ? `<b>Your Apps Script backend is the old version</b> (the URL you saved answers as: <b>${esc(ver)}</b>; needs 6 or higher). Saving the script is not enough — paste the new <code>Code.gs</code>, press Save, then Deploy ▸ Manage deployments ▸ pencil (Edit) ▸ Version: <b>New version</b> ▸ Deploy, and approve the permissions. Check: open your /exec URL followed by <code>?action=ping</code> — it must show <code>"v":6</code>. Meanwhile you can load an NSE Event-Calendar CSV or paste symbols above.` : 'Could not load the calendar: ' + esc(m) + '. If this says “Unexpected token <”, the backend URL is not a public web app — redeploy with “Who has access: Anyone”. You can still load an NSE Event-Calendar CSV or paste symbols above.');
  } finally { btn.disabled = false; }
}
async function loadUpcomingManual() {
  const f = $('upCsv').files[0], text = f ? await f.text() : $('upPaste').value;
  if (!String(text).trim()) { alert('Choose an NSE Event-Calendar CSV or paste symbols first.'); return; }
  $('upBtn').disabled = true; try { await runUpcomingList(parseManualUpcoming(text, Date.now(), 7)); } finally { $('upBtn').disabled = false; }
}
/* ---------- watchlist UI wiring ---------- */
function wlRenderBar() {
  const L = WL.store.lists, act = wlList().id;
  const chips = L.map((l) => { const ok = l.syms.map((s) => WL.data[s]).filter((x) => x && x.ok), A = mergeAcc(ok.map((x) => x.acc)); return `<button class="wlchip${l.id === act ? ' on' : ''}" onclick="wlSwitch('${l.id}')">${esc(l.name)} <small>${l.syms.length}${isNum(A.hit) ? ' · hit ' + pct0(A.hit) : ''}</small></button>`; }).join('');
  const prev = $('wlInput') ? $('wlInput').value : '';
  $('wlBar').innerHTML = `<div class="upbar">${chips}<button class="ghostBtn" onclick="wlNew()">＋ New list</button><button class="ghostBtn" onclick="wlRename()">Rename</button><button class="ghostBtn" onclick="wlDelete()">Delete list</button></div><div class="upbar"><select id="wlEx" title="Exchange for the symbols you type"><option value="NS"${WL.ex === 'NS' ? ' selected' : ''}>NSE</option><option value="BO"${WL.ex === 'BO' ? ' selected' : ''}>BSE</option></select><input id="wlInput" type="text" placeholder="Add symbols — NSE: RELIANCE, TCS · BSE: 500325 or RELIANCE (pick BSE)" autocomplete="off" value="${esc(prev)}"><button class="goBtn" onclick="wlAdd()">Add</button><button class="ghostBtn" onclick="wlRefreshAll(true)">⟳ Refresh now</button><label class="wlauto"><input type="checkbox" id="wlAuto" ${WL.auto ? 'checked' : ''} onchange="wlToggleAuto()"> auto-refresh every 60 s during market hours</label></div><div class="wlcloud" id="wlCloud">${wlCloudHtml()}</div>`;
  const inp = $('wlInput'); if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') wlAdd(); });
}
function wlRenderBody() { const mc = marketClock(Date.now()); $('wlBody').innerHTML = htmlWatchBody(wlList(), WL.data, WL.stamp, WL.busy, mc.open, true); }
function wlSetView(k, v) { WL.view[k] = v; try { localStorage.setItem('jc_wl_view', JSON.stringify(WL.view)); } catch (e) {} wlRenderBody(); }
function jcXray(sym) { loadSymbol(sym); }
function wlEnsure() { if (!WL.store) { WL.store = wlLoad(); if (!WL.store.active || !WL.store.lists.find((l) => l.id === WL.store.active)) WL.store.active = WL.store.lists[0].id; } }
function wlOnShow() { wlEnsure(); wlRenderBar(); wlRenderBody(); if (!WL.synced) { WL.synced = true; wlDriveSync(); } const l = wlList(); if (l.syms.some((s) => !WL.data[s]) || Date.now() - WL.stamp > 60e3) wlRefreshAll(false); }
function wlSwitch(id) { WL.store.active = id; wlSave(true); wlRenderBar(); wlRenderBody(); wlRefreshAll(false); }
function wlNew() { const n = (prompt('Name for the new watchlist?', 'Watchlist ' + (WL.store.lists.length + 1)) || '').trim(); if (!n) return; const l = { id: 'l' + Date.now().toString(36), name: n.slice(0, 30), syms: [] }; WL.store.lists.push(l); WL.store.active = l.id; wlSave(); wlRenderBar(); wlRenderBody(); }
function wlRename() { const l = wlList(), n = (prompt('Rename watchlist', l.name) || '').trim(); if (!n) return; l.name = n.slice(0, 30); wlSave(); wlRenderBar(); }
function wlDelete() { if (WL.store.lists.length < 2) { alert('Keep at least one watchlist.'); return; } const l = wlList(); if (!confirm('Delete watchlist “' + l.name + '”?')) return; WL.store.lists = WL.store.lists.filter((x) => x.id !== l.id); WL.store.active = WL.store.lists[0].id; wlSave(); wlRenderBar(); wlRenderBody(); }
async function wlAdd() {
  const exSel = $('wlEx'), ex = exSel ? exSel.value : 'NS'; WL.ex = ex; const inp = $('wlInput'), l = wlList(), add = String(inp.value || '').split(/[\s,;]+/).map((t) => cleanSym(t, ex)).filter(Boolean).filter((s, i, a) => a.indexOf(s) === i && !l.syms.includes(s));
  if (!add.length) { inp.value = ''; return; } l.syms.push(...add); inp.value = ''; wlSave(); wlRenderBar(); wlRenderBody(); wlRefreshAll(false);
}
function wlRemove(sym) { const l = wlList(); l.syms = l.syms.filter((s) => s !== sym); wlSave(); wlRenderBar(); wlRenderBody(); }
function wlToggleAuto() { WL.auto = !!$('wlAuto').checked; }
function wlTick() { if (window.__curTab !== 'pWatch' || !WL.auto || document.hidden || !WL.store) return; if (marketClock(Date.now()).open) wlRefreshAll(false); }
async function runAnalysis() {
  const sym = $('symbolInput').value.trim().toUpperCase().replace(/\.(NS|BO)$/, ''), exch = $('exchangeInput').value;
  if (!sym) { alert('Enter a symbol first.'); return; }
  const btn = $('goBtn'); btn.disabled = true; $('errArea').innerHTML = '';
  try {
    setStatus('Fetching daily history…');
    let usedExch = exch, daily = await feed('Daily OHLCV (2Y)', (tr) => fetchChart(`${sym}.${exch}`, '2y', '1d', tr));
    if (!daily.ok) { const alt = exch === 'NS' ? 'BO' : 'NS'; setStatus(`No data on ${exch === 'NS' ? 'NSE' : 'BSE'} — trying ${alt === 'NS' ? 'NSE' : 'BSE'}…`); const d2 = await feed('Daily OHLCV (2Y)', (tr) => fetchChart(`${sym}.${alt}`, '2y', '1d', tr)); if (d2.ok) { daily = d2; usedExch = alt; } }
    if (!daily.ok) throw new Error(daily.err || 'No daily data');
    const ySym = `${sym}.${usedExch}`;
    setStatus('Pulling intraday, weekly, results, fundamentals, NSE filings & news in parallel…');
    const [daily2, intra, weekly, bench, summary, ts, tsq, deliv] = await Promise.all([
      feed('Daily cross-check (1M)', (tr) => fetchChart(ySym, '1mo', '1d', tr)),
      feed('Intraday 5-min OHLCV (5D)', (tr) => fetchChart(ySym, '5d', '5m', tr)), feed('Weekly OHLCV (10Y)', (tr) => fetchChart(ySym, '10y', '1wk', tr)), feed('Nifty 50 benchmark (2Y)', (tr) => fetchChart('^NSEI', '2y', '1d', tr)),
      feed('Fundamentals & ratios (Yahoo quoteSummary)', (tr) => fetchSummary(ySym, tr)),
      feed('Annual financial statements (Yahoo timeseries)', (tr) => fetchTimeseries(ySym, TS_TYPES, 6, tr)),
      feed('Quarterly results (Yahoo timeseries)', (tr) => fetchTimeseries(ySym, TSQ_TYPES, 3.5, tr)),
      usedExch === 'NS' ? feed('NSE bundle — result dates, filed results, holding, delivery, DPR (Apps Script)', () => fetchDelivery(sym)) : Promise.resolve({ name: 'NSE bundle', ok: false, err: 'NSE-listed symbols only' }),
    ]);
    const nm = summary.data?.price?.longName || daily.data.meta.longName || daily.data.meta.shortName || sym, news = await feed('News (Google News RSS)', (tr) => fetchNews(nm, tr));
    setStatus('Computing indicators, results analysis, levels and the call matrix…');
    const feeds = [daily, daily2, intra, weekly, bench, summary, ts, tsq, deliv, news].map((f) => ({ name: f.name, ok: f.ok, via: f.via, err: f.err }));
    const R = buildReport({ sym, exch: usedExch, daily: daily.data, daily2: daily2.data, intra: intra.data, weekly: weekly.data, bench: bench.data, summary: summary.data, ts: ts.data, tsq: tsq.data, deliv: deliv.data, news: news.data || [], feeds, nowMs: Date.now() });
    window.__R = R; $('titlebar').classList.remove('hidden');
    $('asOfTag').textContent = 'data as of ' + R.lastDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + (R.live ? ' · market live' : ' · market closed'); $('coName').textContent = `${R.name} (${R.sym})`;
    $('pSummary').innerHTML = htmlSummary(R); $('pIntraday').innerHTML = htmlIntradayTab(R); $('pSwing').innerHTML = htmlSwingTab(R); $('pLong').innerHTML = htmlLongTab(R); $('pDataBody').innerHTML = htmlData(R);
    refreshChips(); showTab(window.__curTab === 'pUpcoming' ? 'pUpcoming' : window.__curTab === 'pSummary' || !$(window.__curTab) ? 'pSummary' : window.__curTab);
    setStatus('Report generated · ' + new Date().toLocaleTimeString('en-IN') + (usedExch !== exch ? ` · auto-switched to ${usedExch === 'NS' ? 'NSE' : 'BSE'}` : ''), 'ok');
  } catch (e) {
    console.error(e); setStatus('Report failed', 'err');
    const be = getBackend(), onFile = typeof location !== 'undefined' && location.protocol === 'file:';
    const hint = be ? 'A Data backend URL is set but the request still failed — open that URL with <code>?action=ping</code> in a browser tab; it must answer {"ok":true}. If not, redeploy the Apps Script web app with “Who has access: Anyone”.' : '<b>No Data backend is set.</b> Public CORS proxies are often rate-limited or blocked on your network — deploy <code>Code.gs</code> as an Apps Script web app and paste its /exec URL under “Data backend” above. That is the reliable route.';
    $('errArea').innerHTML = `<div class="errbox">Could not build a report for <b>${esc(sym)}</b> (tried ${esc(sym)}.${exch}, then the other exchange).<br><br><b>Why:</b> ${esc((e && e.message) || e)}<br><br>${hint}${onFile ? '<br><br>You opened this as a local file — open it over your GitHub Pages https:// address instead.' : ''}<br><br>Also check the symbol is the exchange trading code, not the company name (e.g. M&amp;M, BAJAJ-AUTO; BSE Ltd itself trades as BSE).</div>`;
  } finally { btn.disabled = false; }
}
if (IS_BROWSER) {
  const tick = () => { const now = new Date(); $('clockTime').textContent = now.toLocaleTimeString('en-IN', { hour12: true }); $('clockDate').textContent = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }); };
  setInterval(tick, 1000); tick(); setInterval(wlTick, 60000);
  document.addEventListener('DOMContentLoaded', () => {
    $('symbolInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') runAnalysis(); });
    $('viewSel').addEventListener('change', (e) => showTab(e.target.value));
    $('upBody').innerHTML = htmlUpcoming(null); refreshChips(); showTab('pSummary');
    const be = $('backendInput'); be.value = getBackend();
    $('saveBackend').addEventListener('click', async () => {
      const v = be.value.trim(); try { localStorage.setItem(LS_BACKEND, v); } catch (e) {}
      const out = $('backendMsg'); if (!v) { out.textContent = 'Backend cleared.'; return; }
      out.textContent = 'Testing…'; try { const j = JSON.parse(await fetchWithTimeout(beUrl(v, 'action=ping'), 15000)); out.textContent = j.ok ? '✓ Backend reachable' : 'Unexpected response'; } catch (e) { out.textContent = '✗ Not reachable: ' + e.message; }
    });
  });
}
if (typeof module !== 'undefined') module.exports = { hitStats, sortSyms, dayPlan, evalSide, evalPlan, analyseWatch, accuracy, mergeAcc, htmlWatchBody, parseYahooEarn, fetchEarnDates, NIFTY_FALLBACK, svgWeek, marketClock, buildReport, htmlSummary, htmlVerdictChips, htmlGolden, htmlSnapshot, htmlIntradayTab, htmlSwingTab, htmlLongTab, htmlData, htmlUpcoming, htmlPlaybook, buildPrintDoc, normalizeDaily, parseNseResults, parseUpcoming, parseManualUpcoming, suggestResultTrade, analyseUpcoming, parseNseDateTime, deriveFundamentals, daysToTarget, yearsToTarget, fmtDays, fmtYears, svgRuler, svgGauge, svgSpark, svgRange, svgReactions, EMA, RSI, ATR, ADX, MACD, SUPERTREND, STOCH, BB, SMA, OBV, MFI, CCI };
