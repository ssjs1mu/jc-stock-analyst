/* Early-Mover Radar — watches the whole Nifty 100 + MidSmallCap 400 universe every minute while the market is open and pops up an alert
   (with entry, stop-loss and intraday targets) the moment a stock shows the volume-burst / breakout signature seen in the day's big movers.
   Runs on every tab while the terminal is open. It cannot alert when the page is closed. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const f2 = (v) => (num(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  const sg = (v, d) => (num(v) ? (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) : '—');
  const ist = () => new Date(Date.now() + 19800000);
  const istMin = () => { const d = ist(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const istDow = () => ist().getUTCDay();
  const istToday = () => ist().toISOString().slice(0, 10);
  const hhmm = (t) => new Date(t + 19800000).toISOString().slice(11, 16);
  const LS = 'jc_radar_v1';
  const CFG = { minPx: 50, minAvgVol: 2e5, surgeChg: 2.5, surgePace: 3, burstPx: 1.5, burstVol: 0.1, burstMs: 8 * 60000, watchPace: 2.5, every: 60000, t1: 1.5, t2: 3, t3: 5, sl: 1.5 };
  const R = { alerts: [], seen: {}, hist: {}, q: {}, busy: false, last: 0, n: 0, err: '', src: '', mute: false, timer: null, tries: 0 };

  function load() { try { const c = JSON.parse(localStorage.getItem(LS) || 'null'); R.mute = !!(c && c.mute); if (c && c.d === istToday()) { R.alerts = c.alerts || []; R.seen = c.seen || {}; } else { R.alerts = []; R.seen = {}; } } catch (e) { } }
  function save() { try { localStorage.setItem(LS, JSON.stringify({ d: istToday(), alerts: R.alerts.slice(-80), seen: R.seen, mute: R.mute })); } catch (e) { } }
  async function be(qs, ms) { const u = getBackend(); if (!u) throw new Error('Data backend not connected'); return JSON.parse(await fetchWithTimeout(beUrl(u, qs), ms || 40000)); }

  /* ---------- data: one batched quote call per sweep (fallback: daily bars with today's partial candle) ---------- */
  async function quotes(syms) {
    const yf = syms.map((s) => s + '.NS'), out = {}; let ok = false;
    try {
      const parts = [yf.slice(0, 260), yf.slice(260)].filter((p) => p.length);
      const rs = await Promise.all(parts.map((p) => be('action=liveq&symbols=' + encodeURIComponent(p.join(',')), 45000)));
      rs.forEach((j) => { if (j && j.ok) { ok = true; Object.keys(j.q).forEach((k) => { out[k.replace(/\.NS$/, '')] = j.q[k]; }); } });
      if (ok && Object.keys(out).length > syms.length * 0.5) { R.src = 'live quotes'; return out; }
    } catch (e) { }
    if (R.tries++ % 3) return null; // the heavier fallback only every third minute
    const bt = []; for (let i = 0; i < yf.length; i += 30) bt.push(yf.slice(i, i + 30)); let i = 0; const today = istToday();
    await Promise.all([0, 1, 2].map(async () => { while (i < bt.length) { const b = bt[i++]; try { const j = await be('action=dailyb&range=1mo&symbols=' + encodeURIComponent(b.join(',')), 60000); Object.keys(j.bars || {}).forEach((k) => { const x = j.bars[k], n = x.t.length; if (n < 8 || new Date((x.t[n - 1] + 19800) * 1000).toISOString().slice(0, 10) !== today) return; let v = 0; for (let q = n - 6; q < n - 1; q++) v += x.v[q]; out[k.replace(/\.NS$/, '')] = [x.c[n - 1], x.c[n - 2], x.o[n - 1], x.h[n - 1], x.l[n - 1], x.v[n - 1], v / 5, x.t[n - 1]]; }); } catch (e) { } } }));
    R.src = 'daily-bar fallback (slower)'; return Object.keys(out).length ? out : null;
  }

  /* ---------- the signature, from studying 16 Oct 2026's movers (SOLARA +14 %, CGPOWER, APOLLO, PFOCUS) and a 1-month 5-minute back-test ---------- */
  function judge(s, a, now) {
    const [px, pc, o, h, l, v, av] = a; if (!(px > CFG.minPx && pc > 0 && av > CFG.minAvgVol && v > 0)) return null;
    const m = istMin(), el = Math.max(1, m - 555), frac = Math.min(1, Math.max(el / 375, 0.06)), chg = (px / pc - 1) * 100, pace = v / (av * frac);
    const H = R.hist[s] || (R.hist[s] = []); H.push({ t: now, px, v }); while (H.length > 14) H.shift();
    let kind = null, why = '';
    const old = H.find((x) => now - x.t <= CFG.burstMs && now - x.t >= 60000);
    const dpx = old ? (px / old.px - 1) * 100 : 0, dv = old ? v - old.v : 0;
    if (chg >= CFG.surgeChg && pace >= CFG.surgePace && px >= h * 0.985) { kind = 'SURGE'; why = `up ${chg.toFixed(1)} % on ${pace.toFixed(1)}× normal volume pace, holding near the day high`; }
    else if (old && dpx >= CFG.burstPx && dv >= CFG.burstVol * av && chg >= 1.5) { kind = 'BURST'; why = `+${dpx.toFixed(1)} % in ${Math.round((now - old.t) / 60000)} min with ${(dv / av * 100).toFixed(0)} % of a normal day’s volume traded in that burst`; }
    else if (pace >= CFG.watchPace && chg > -0.5 && chg < CFG.surgeChg && px >= o && m >= 585 && px >= h * 0.99) { kind = 'WATCH'; why = `volume running ${pace.toFixed(1)}× normal while price is still only ${sg(chg, 1)} % — accumulation; a break above ${f2(h)} would trigger`; }
    if (!kind) return null;
    const key = s + ':' + kind; if (R.seen[key]) return null; if (kind === 'WATCH' && (R.seen[s + ':SURGE'] || R.seen[s + ':BURST'])) return null;
    R.seen[key] = 1;
    const entry = kind === 'WATCH' ? h * 1.002 : px, late = chg >= 6, slp = late ? 2 : CFG.sl;
    return { id: s + '-' + kind + '-' + now, sym: s, kind, t: now, px, chg, pace, hi: h, why, entry, slp, sl: entry * (1 - slp / 100), t1: entry * (1 + CFG.t1 / 100), t2: entry * (1 + CFG.t2 / 100), t3: entry * (1 + CFG.t3 / 100), late, mx: px };
  }
  function statusOf(a) { const q = R.q[a.sym]; const px = q ? q[0] : null, hi = q ? q[3] : a.mx; if (num(hi)) a.mx = Math.max(a.mx || 0, hi); if (a.kind === 'WATCH' && !a.go) { if (num(hi) && hi >= a.entry) a.go = true; else return ['WAITING', 'w']; } if (num(px) && px <= a.sl && !(a.mx >= a.t1)) return ['STOP', 'r']; return a.mx >= a.t3 ? ['T3 ✓', 'g'] : a.mx >= a.t2 ? ['T2 ✓', 'g'] : a.mx >= a.t1 ? ['T1 ✓', 'g'] : ['LIVE', 'b']; }

  /* ---------- popup, sound, desktop notification ---------- */
  function beep() { if (R.mute) return; try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const c = R.ac || (R.ac = new C()); [0, 0.18].forEach((d) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = d ? 1180 : 880; g.gain.value = 0.08; o.connect(g); g.connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + 0.14); }); } catch (e) { } }
  function toastBox() { let b = $('jcRadarToasts'); if (b) return b; const st = document.createElement('style'); st.textContent = TCSS; document.head.appendChild(st); b = document.createElement('div'); b.id = 'jcRadarToasts'; document.body.appendChild(b); return b; }
  function popup(a) {
    const box = toastBox(); while (box.children.length >= 4) box.removeChild(box.firstChild);
    const d = document.createElement('div'); d.className = 'rt rt-' + a.kind; d.innerHTML = `<div class="rt-h"><b>⚡ ${a.kind === 'WATCH' ? 'HEADS-UP' : a.kind === 'BURST' ? 'VOLUME BURST' : 'BREAKOUT'}</b><span class="rt-s"><a href="javascript:void(0)" data-sym="${E(a.sym)}" onclick="loadSymbol('${E(a.sym)}')">${E(a.sym)}</a> ${sg(a.chg, 1)} %</span><button class="rt-x" aria-label="Dismiss">×</button></div><div class="rt-w">${E(a.why)}${a.late ? ' <b>— already a big move, this is a late entry: smaller targets, trail the stop.</b>' : ''}</div><div class="rt-g"><div><i>${a.kind === 'WATCH' ? 'BUY ABOVE' : 'ENTRY'}</i><b>${f2(a.entry)}</b></div><div><i>STOP</i><b class="r">${f2(a.sl)}</b></div><div><i>T1 +${CFG.t1}%</i><b class="g">${f2(a.t1)}</b></div><div><i>T2 +${CFG.t2}%</i><b class="g">${f2(a.t2)}</b></div><div><i>T3 +${CFG.t3}%</i><b class="g">${f2(a.t3)}</b></div></div><div class="rt-n">Intraday only — exit by 3:15 PM. In the 1-month test about 55 % of such alerts reached T1, 30 % T2, 14 % T3 and 46 % hit the stop first. Not a guarantee.</div>`;
    d.querySelector('.rt-x').onclick = () => d.remove(); box.appendChild(d); setTimeout(() => { try { d.remove(); } catch (e) { } }, 120000);
    beep();
    try { if (window.Notification && Notification.permission === 'granted') new Notification(`⚡ ${a.sym} ${sg(a.chg, 1)} % — ${a.kind}`, { body: `Entry ${f2(a.entry)} · Stop ${f2(a.sl)} · T1 ${f2(a.t1)} · T2 ${f2(a.t2)} · T3 ${f2(a.t3)}`, tag: a.id }); } catch (e) { }
    try { const t0 = document.title; let n = 0; const iv = setInterval(() => { document.title = n++ % 2 ? t0 : `⚡ ${a.sym} ${sg(a.chg, 1)} %`; if (n > 9) { clearInterval(iv); document.title = t0; } }, 800); } catch (e) { }
  }

  /* ---------- sweep ---------- */
  async function sweep(force) {
    if (R.busy) return; const m = istMin(), live = istDow() >= 1 && istDow() <= 5 && m >= 555 && m <= 935;
    if (!live && !force) { R.status = 'idle'; paint(); return; }
    const syms = window.jcUni ? window.jcUni() : []; if (!syms.length) return;
    R.busy = true; R.err = ''; paint();
    try {
      const q = await quotes(syms); const now = Date.now();
      if (q) { R.q = q; R.n = Object.keys(q).length; R.last = now; const firstSweep = !Object.keys(R.hist).length; Object.keys(q).forEach((s) => { const a = judge(s, q[s], now); if (a) { R.alerts.push(a); popup(a); } }); save(); if (window.jcMgr) window.jcMgr.run(); }
      else if (!R.last) R.err = 'No live quotes yet — check the Data backend connection.';
    } catch (e) { R.err = 'Sweep failed: ' + ((e && e.message) || e); }
    finally { R.busy = false; paint(); }
  }

  /* ---------- panel ---------- */
  function paint() {
    const el = $('clRadar'); if (!el) return; const m = istMin(), live = istDow() >= 1 && istDow() <= 5 && m >= 555 && m <= 935;
    const al = R.alerts.slice().reverse(), perm = window.Notification ? Notification.permission : 'unsupported';
    el.innerHTML = `<section class="rd"><div class="rd-h"><div><h3>⚡ Early-Mover Radar ${al.filter((a) => Date.now() - a.t < 120000).length ? '<span class="rd-nw big">' + al.filter((a) => Date.now() - a.t < 120000).length + ' NEW</span>' : ''} <small>watches ~${(window.jcUni ? window.jcUni().length : 500)} stocks every minute · pops up the moment a big move starts</small></h3><div class="rd-st">${live ? '<span class="g">● scanning</span>' : '<span>○ market closed — resumes 9:15 AM</span>'}${R.last ? ' · last sweep ' + hhmm(R.last) + ' · ' + R.n + ' quotes · ' + E(R.src) : ''}${R.busy ? ' · working…' : ''}</div></div><div class="rd-a"><button class="cl-btn" onclick="jcRadar.sweep(true)">⟳ Scan now</button><button class="cl-btn" onclick="jcRadar.mute()">${R.mute ? '🔇 Sound off' : '🔔 Sound on'}</button>${perm === 'default' ? '<button class="cl-btn" onclick="jcRadar.notify()">Enable desktop alerts</button>' : perm === 'granted' ? '<span class="rd-ok">desktop alerts on</span>' : ''}<button class="cl-btn" onclick="jcRadar.test()">Test popup</button></div></div>`
      + (R.err ? `<div class="cl-err">${E(R.err)}</div>` : '')
      + `<div class="rd-k"><b>BREAKOUT</b> up ≥ 2.5 % on ≥ 3× normal volume pace, near the day high · <b>VOLUME BURST</b> +1.5 % within 8 minutes on a surge of volume · <b>HEADS-UP</b> volume ≥ 2.5× normal while price is still flat — accumulation before a possible break.</div>`
      + (al.length ? `<div class="bf-sc"><table class="bf-t"><thead><tr><th>Time</th><th>Stock</th><th>Signal</th><th>Trigger</th><th>Chg</th><th>Vol pace</th><th>Entry</th><th>Stop</th><th>T1</th><th>T2</th><th>T3</th><th>Status</th></tr></thead><tbody>${al.map((a) => { const s = statusOf(a), q = R.q[a.sym]; const nw = Date.now() - a.t < 120000; return `<tr class="${nw ? 'rd-new' : ''}"><td>${hhmm(a.t)}${nw ? ' <span class="rd-nw">NEW</span>' : ''}</td><td class="bf-s"><a class="symlink" href="javascript:void(0)" data-sym="${E(a.sym)}" onclick="loadSymbol('${E(a.sym)}')">${E(a.sym)}</a>${a.late ? '<small>late entry</small>' : ''}</td><td><span class="rd-b ${a.kind}">${a.kind}</span></td><td>${f2(a.px)}</td><td class="${a.chg >= 0 ? 'g' : 'r'}">${sg(a.chg, 1)}%</td><td>${a.pace.toFixed(1)}×</td><td>${f2(a.entry)}</td><td class="r">${f2(a.sl)}</td><td class="g">${f2(a.t1)}</td><td class="g">${f2(a.t2)}</td><td class="g">${f2(a.t3)}</td><td><span class="rd-s ${s[1]}">${s[0]}</span>${q ? '<small>now ' + f2(q[0]) + '</small>' : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="bf-card">No signal yet today. The radar checks every minute while this page is open and will pop up here and on screen — on any tab — as soon as one fires.</div>')
      + `<div class="bf-note"><b>What 16 Oct’s big movers taught us — honestly.</b> SOLARA sat flat (+1.5 %) until 1:30 PM and then jumped to +13 % within minutes on a volume explosion; CGPOWER showed 3–4× volume from 10 AM while price crept up; APOLLO gapped and ran on volume; PFOCUS broke out on ordinary volume. Nothing in the <i>daily</i> charts could tell you which stock would run: across ~28,000 stock-days (6 months, 498 stocks) only 3.9 % touched +5 % from the previous close, and even the best pre-move watchlist (high-range, rising volume, near highs, uptrend) raised that to about 8.5 %, with an average close of −0.2 %. So the radar waits for the volume burst instead of guessing. Back-test of the trigger (68 volatile stocks, 1 month, 127 alerts): the entry already sits about 4.6 % above the previous close, then roughly 55 % of alerts reached +1.5 %, 31 % reached +3 %, 14 % reached +5 %, and 46 % hit a 1.5 % stop first; the average close was only about +0.3 % above entry. That is a thin edge, not a fortune machine — keep size small, honour the stop, and book at T1/T2. Alerts only fire while this page is open.</div></section>`;
  }
  const TCSS = `#jcRadarToasts{position:fixed;top:12px;right:12px;z-index:99995;display:flex;flex-direction:column;gap:8px;width:min(360px,calc(100vw - 24px))}.rt{background:#0a1736;color:#fff;border:1px solid #2b4a9a;border-left:6px solid #12a05a;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.5);padding:9px 11px;font:12px 'Segoe UI',sans-serif;animation:rtin .25s ease-out}.rt-WATCH{border-left-color:#f9a825}.rt-BURST{border-left-color:#ff3b6b}@keyframes rtin{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}.rt-h{display:flex;align-items:center;gap:8px}.rt-h b{font-size:11px;letter-spacing:1px;color:#ffd166}.rt-s{flex:1;font-weight:800;font-size:15px}.rt-s a{color:#fff;text-decoration:underline}.rt-x{border:0;background:rgba(255,255,255,.15);color:#fff;border-radius:6px;width:22px;height:22px;cursor:pointer;font-size:15px;line-height:1}.rt-w{margin:4px 0 7px;color:#cdd9f6;line-height:1.4}.rt-g{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}.rt-g div{background:rgba(255,255,255,.08);border-radius:7px;padding:4px 5px;text-align:center}.rt-g i{display:block;font-style:normal;font-size:8.5px;letter-spacing:.5px;color:#9fb3e6}.rt-g b{font:800 12px ui-monospace,Consolas,monospace}.rt-g .g{color:#6ee7a0}.rt-g .r{color:#ff9aa9}.rt-n{margin-top:6px;font-size:10px;color:#9fb3e6;line-height:1.35}`;
  const CSS = `.rd{margin:10px 0}.rd-h{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;background:linear-gradient(120deg,#6a1b3d,#17388a);color:#fff;border-radius:14px;padding:12px 16px;margin-bottom:8px}.rd-h>div:first-child{flex:1;min-width:240px}.rd-h h3{margin:0 0 3px;font-size:19px}.rd-h h3 small{font-size:11px;color:#d5def7;font-weight:600;margin-left:6px}.rd-st{font-size:12px;color:#e5ecff}.rd-st .g{color:#6ee7a0;font-weight:800}.rd-a{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.rd-a .cl-btn{border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.12);color:#fff;border-radius:8px;padding:5px 10px;font-weight:800;font-size:12px;cursor:pointer}.rd-ok{font-size:11px;color:#6ee7a0;font-weight:800}.rd-k{font-size:12px;color:#24365e;margin:2px 2px 8px;line-height:1.5}.rd-b{font:900 10px 'Segoe UI',sans-serif;padding:3px 8px;border-radius:99px;background:#c9f0da;color:#06612f}.rd-b.WATCH{background:#fbe9c0;color:#7a4e00}.rd-b.BURST{background:#ffd9e3;color:#a10b27}.rd-s{font:900 10.5px 'Segoe UI',sans-serif;padding:3px 8px;border-radius:99px;background:#e6ebf7;color:#34456a}.rd-s.g{background:#c9f0da;color:#06612f}.rd-s.r{background:#fde6ea;color:#a10b27}.rd-s.b{background:#dbe7ff;color:#14306e}.rd-s.w{background:#fbe9c0;color:#7a4e00}.rd-new td{background:#fff7d6}.rd-nw{font:900 9px 'Segoe UI',sans-serif;background:#e0245e;color:#fff;border-radius:99px;padding:2px 6px;animation:rdp 1s infinite}.rd-nw.big{font-size:11px;padding:3px 9px;vertical-align:middle}@keyframes rdp{50%{opacity:.45}}`;
  window.jcRadar = {
    sweep: (f) => sweep(!!f), paint, state: R,
    mute: () => { R.mute = !R.mute; save(); paint(); },
    notify: async () => { try { await Notification.requestPermission(); } catch (e) { } paint(); },
    test: () => { const px = 500, a = { id: 'test' + Date.now(), sym: 'TESTSTOCK', kind: 'BURST', t: Date.now(), px, chg: 3.2, pace: 4.1, hi: px, why: 'sample alert — this is how a real signal will look', entry: px, slp: 1.5, sl: px * 0.985, t1: px * 1.015, t2: px * 1.03, t3: px * 1.05, late: false, mx: px }; popup(a); },
  };
  function build() { if (R.built) return; R.built = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); load(); clearInterval(R.timer); R.timer = setInterval(() => sweep(false), CFG.every); setTimeout(() => sweep(false), 6000); setInterval(() => { if (window.__curTab === 'pCalls' && !document.hidden && R.alerts.length) paint(); }, 20000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
