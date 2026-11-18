/* Tree-growth progress: the Joshi's Corner tree logo grows from its roots to the full canopy as a report is built, with the % on top.
   The logo itself is never altered - the real image is revealed bottom-up over a faint outline of the full tree.
   window.jcTree.set(pct, label)  real progress (auto-opens the overlay; 100 closes it)
   window.jcTree.start(label) / done(label) / fail()
   window.jcTree.inline(host, label) -> { set, done, fail }  same tree drawn inside a box (X-ray loading screen)
   Between real updates the bar creeps slowly (never past the next real step, never to 100) so the page never looks frozen. */
(function () {
  const here = (document.currentScript && document.currentScript.src) || location.href;
  const LOGO = new URL('assets/jc-logo-3d.png', here).href;
  const CSS = `.jtg-ov{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,rgba(20,48,110,.92),rgba(5,12,32,.96));backdrop-filter:blur(2px)}
.jtg-ov.on{display:flex}.jtg-c{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px;max-width:92vw;text-align:center;color:#f6e7b8;font:600 14px system-ui,-apple-system,Segoe UI,sans-serif}
.jtg-t{position:relative;width:min(220px,46vw);aspect-ratio:450/680}.jtg-t img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none}
.jtg-g{opacity:.13;filter:grayscale(1) brightness(1.6)}.jtg-r{clip-path:inset(100% 0 0 0);transition:clip-path .45s ease-out;filter:drop-shadow(0 0 10px rgba(212,175,55,.55))}
.jtg-p{font:800 34px/1 system-ui,sans-serif;color:#D4AF37;font-variant-numeric:tabular-nums;text-shadow:0 2px 12px rgba(212,175,55,.35)}
.jtg-b{width:min(320px,80vw);height:8px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden}.jtg-b i{display:block;height:100%;width:0;background:linear-gradient(90deg,#8A6D1F,#D4AF37,#f6e7b8);transition:width .4s}
.jtg-l{max-width:min(420px,86vw);min-height:2.6em;color:#e9dcb0}.jtg-s{font-size:11.5px;font-weight:500;color:#b9b08f}
.jtg-in{background:linear-gradient(180deg,#14306e,#0a1838);border:2px solid #D4AF37;border-radius:14px;padding:12px;display:flex;justify-content:center}.jtg-in .jtg-t{width:min(150px,40vw)}.jtg-in .jtg-p{font-size:26px}`;
  let st = false;
  const style = () => { if (st) return; st = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const body = (label, sub) => `<div class="jtg-c"><div class="jtg-t"><img class="jtg-g" src="${LOGO}" alt=""><img class="jtg-r" src="${LOGO}" alt="Joshi's Corner"></div>
    <div class="jtg-p">0%</div><div class="jtg-b"><i></i></div><div class="jtg-l">${E(label || 'Preparing the report')}</div><div class="jtg-s">${E(sub || 'Growing your report from the roots up - please stay on this screen.')}</div></div>`;

  /* one meter = one drawn tree; real % from the caller, creep in between */
  function meterOn(root, free) {
    let real = 0, shown = 0, t = Date.now(), iv = null, over = false;
    const paint = () => {
      const r = root.querySelector('.jtg-r'), p = root.querySelector('.jtg-p'), b = root.querySelector('.jtg-b i'); if (!r) return;
      const v = Math.max(0, Math.min(100, shown));
      r.style.clipPath = `inset(${(100 - v).toFixed(1)}% 0 0 0)`; p.textContent = Math.round(v) + '%'; b.style.width = v + '%';
    };
    const tick = () => { if (over) return; const cap = free ? 92 : Math.min(97, real + Math.max(6, (100 - real) * 0.35)); const dt = (Date.now() - t) / 1000; const tgt = real + (cap - real) * (1 - Math.exp(-dt / 9)); if (tgt > shown) { shown = tgt; paint(); } };
    return {
      start() { real = 0; shown = 0; over = false; t = Date.now(); paint(); clearInterval(iv); iv = setInterval(tick, 300); },
      set(pct, label) { pct = Math.max(0, Math.min(100, +pct || 0)); if (pct > real) { real = pct; t = Date.now(); } if (real > shown) shown = real; paint(); if (label) { const l = root.querySelector('.jtg-l'); if (l) l.textContent = label; } },
      end() { over = true; clearInterval(iv); real = shown = 100; paint(); },
      stop() { over = true; clearInterval(iv); },
    };
  }

  let ov = null, M = null, hideT = null;
  const ensure = () => { style(); if (ov) return; ov = document.createElement('div'); ov.className = 'jtg-ov'; ov.setAttribute('role', 'progressbar'); ov.innerHTML = body(); document.body.appendChild(ov); M = meterOn(ov); };
  const open = (label) => { ensure(); clearTimeout(hideT); if (!ov.classList.contains('on')) { ov.innerHTML = body(label); ov.classList.add('on'); M.start(); } else if (label) M.set(0, label); };
  const api = {
    start(label) { open(label); },
    set(pct, label) {
      if (pct >= 100) { api.done(label); return; }
      if (!ov || !ov.classList.contains('on')) open(label); M.set(pct, label);
    },
    done(label) { if (!ov || !ov.classList.contains('on')) return; M.set(100, label); M.end(); hideT = setTimeout(() => ov.classList.remove('on'), 650); },
    fail() { if (!ov) return; M.stop(); ov.classList.remove('on'); },
    free(label) { open(label); M.stop(); const m2 = meterOn(ov, true); M = m2; m2.start(); },
    inline(host, label) {
      style(); if (!host) return { set() {}, done() {}, fail() {} };
      host.innerHTML = '<div class="jtg-in">' + body(label, 'Building - please wait, this screen fills by itself.') + '</div>';
      const m = meterOn(host, true); m.start();
      return { set: (p, l) => m.set(p, l), done: () => { m.end(); }, fail: () => { m.stop(); } };
    },
  };
  window.jcTree = api;
})();
