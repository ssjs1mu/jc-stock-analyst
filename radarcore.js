/* Early-Mover Radar — detection core (pure functions, no DOM). Shared by radar.js (live) and the back-test harness.
   [Claude 2026-10-26] Added after studying 26 Oct 2026 movers APOLLO (Apollo Micro), STERTOOLS, BSE, TFCILTD.
   Signals:  RUSH     open-session volume rush with a price move (catalyst gap / first-hour surge)
             SURGE    up >= 2.5 % on >= 3x volume pace, near day high            (unchanged from radar v3)
             BURST    +1.5 % within 8 min on a burst of volume                   (unchanged)
             STEALTH  heavy volume while price is still flat/inside a tight band = accumulation heads-up; trigger = break of day high
             WATCH    kept for back-compat (volume >= 2.5x, price flat, above open, near high)
   A snapshot is [px, prevClose, open, high, low, cumVolume, avgDailyVolume]. Nothing here is advice; thresholds come from back-tests, see docs. */
(function (root) {
  'use strict';
  const num = (v) => typeof v === 'number' && isFinite(v);
  const CFG = {
    minPx: 30, minTurn: 2.5e6,       /* average daily turnover (price x avg volume) >= Rs 25 lakh; replaces the old "avg volume >= 2 lakh shares" gate that hid thin small caps */
    thinTurn: 2e7,                   /* below Rs 2 crore a day = THIN: wide spreads, circuits, size small */
    surgeChg: 2.5, surgePace: 3, burstPx: 1.5, burstVol: 0.1, burstMs: 8 * 60000, watchPace: 2.5,
    rushChg: 2.0, rushPace: 6, rushUntil: 615,            /* RUSH only until 10:15 */
    stealthPace: 5, stealthBand: 1.3, stealthRange: 3.2, stealthFrom: 580, stealthUntil: 840,   /* from 09:40 to 14:00 */
    t1: 1.5, t2: 3, t3: 5, sl: 1.5
  };
  /* fraction of the day's normal volume expected to have traded by minute-of-day m (flat profile with a floor so the first minutes are not over-weighted) */
  function frac(m) { const el = Math.max(1, m - 555); return Math.min(1, Math.max(el / 375, 0.06)); }
  /* st = { hist:[{t,px,v}], seen:{} } per run. now = ms; m = IST minute of day. Returns an alert object or null. */
  function judge(sym, a, now, m, st, cfg) {
    cfg = cfg || CFG; const [px, pc, o, h, l, v, av] = a;
    if (![px, pc, o, h, l, v, av].every(num) || !(px > cfg.minPx && pc > 0 && v > 0 && av > 0)) return null;
    const turn = av * px; if (turn < cfg.minTurn) return null;
    const chg = (px / pc - 1) * 100, pace = v / (av * frac(m)), band = Math.abs(chg), rng = (h - l) / pc * 100;
    const H = st.hist[sym] || (st.hist[sym] = []); H.push({ t: now, px, v }); while (H.length > 14) H.shift();
    const old = H.find((x) => now - x.t <= cfg.burstMs && now - x.t >= 60000);
    const dpx = old ? (px / old.px - 1) * 100 : 0, dv = old ? v - old.v : 0;
    let kind = null, why = '';
    if (chg >= cfg.rushChg && pace >= cfg.rushPace && m <= cfg.rushUntil && px >= h * 0.985) { kind = 'RUSH'; why = 'opening rush: ' + (chg >= 0 ? '+' : '') + chg.toFixed(1) + ' % on ' + pace.toFixed(1) + '× normal volume pace in the first hour'; }
    else if (chg >= cfg.surgeChg && pace >= cfg.surgePace && px >= h * 0.985) { kind = 'SURGE'; why = 'up ' + chg.toFixed(1) + ' % on ' + pace.toFixed(1) + '× normal volume pace, holding near the day high'; }
    else if (old && dpx >= cfg.burstPx && dv >= cfg.burstVol * av && chg >= 1.5) { kind = 'BURST'; why = '+' + dpx.toFixed(1) + ' % in ' + Math.round((now - old.t) / 60000) + ' min with ' + (dv / av * 100).toFixed(0) + ' % of a normal day’s volume traded in that burst'; }
    else if (pace >= cfg.stealthPace && band <= cfg.stealthBand && rng <= cfg.stealthRange && m >= cfg.stealthFrom && m <= cfg.stealthUntil) { kind = 'STEALTH'; why = 'volume running ' + pace.toFixed(1) + '× normal while price is stuck within ' + chg.toFixed(1) + ' % — heavy buying/selling with no move yet; a break above ' + h.toFixed(2) + ' would trigger'; }
    if (!kind) return null;
    if (st.seen[sym + ':' + kind]) return null; if (kind === 'STEALTH' && (st.seen[sym + ':SURGE'] || st.seen[sym + ':BURST'] || st.seen[sym + ':RUSH'])) return null;
    st.seen[sym + ':' + kind] = 1;
    const entry = kind === 'STEALTH' ? h * 1.002 : px, late = chg >= 6, slp = late ? 2 : cfg.sl;
    return { sym, kind, t: now, m, px, chg, pace, hi: h, why, entry, slp, sl: entry * (1 - slp / 100), t1: entry * (1 + cfg.t1 / 100), t2: entry * (1 + cfg.t2 / 100), t3: entry * (1 + cfg.t3 / 100), late, thin: turn < cfg.thinTurn, gap: (o / pc - 1) * 100, lo: l, info: kind === 'STEALTH', mx: px };
  }
  /* the OLD radar-v3 rules, kept only so the back-test can compare like with like */
  function judgeOld(sym, a, now, m, st) {
    const [px, pc, o, h, l, v, av] = a; if (!(px > 50 && pc > 0 && av > 2e5 && v > 0)) return null;
    const chg = (px / pc - 1) * 100, pace = v / (av * frac(m)); const H = st.hist[sym] || (st.hist[sym] = []); H.push({ t: now, px, v }); while (H.length > 14) H.shift();
    const old = H.find((x) => now - x.t <= 8 * 60000 && now - x.t >= 60000), dpx = old ? (px / old.px - 1) * 100 : 0, dv = old ? v - old.v : 0; let kind = null;
    if (chg >= 2.5 && pace >= 3 && px >= h * 0.985) kind = 'SURGE'; else if (old && dpx >= 1.5 && dv >= 0.1 * av && chg >= 1.5) kind = 'BURST'; else if (pace >= 2.5 && chg > -0.5 && chg < 2.5 && px >= o && m >= 585 && px >= h * 0.99) kind = 'WATCH';
    if (!kind) return null; if (st.seen[sym + ':' + kind]) return null; if (kind === 'WATCH' && (st.seen[sym + ':SURGE'] || st.seen[sym + ':BURST'])) return null; st.seen[sym + ':' + kind] = 1;
    const entry = kind === 'WATCH' ? h * 1.002 : px; return { sym, kind, t: now, m, px, chg, pace, hi: h, entry, slp: chg >= 6 ? 2 : 1.5, mx: px };
  }
  const api = { CFG, frac, judge, judgeOld };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JCRadarCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
