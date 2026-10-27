/* Joshi's Corner — opening screen: the tree logo turns in 3D while the terminal loads behind it;
 * a rupee sign flies from the far background to the front and dissolves. Click / key / Esc skips.
 * Pure CSS 3D (no libraries, no video file). Shown on every fresh load, then fades into the dashboard. */
(function () {
  'use strict';
  if (/[?&]embed=1/.test(location.search)) return; /* embedded inside the client dashboard: no splash */
  var BASE = (function () { try { var sc = document.currentScript; return sc && sc.src ? sc.src.replace(/intro\.js.*$/, '') : ''; } catch (e) { return ''; } })() || '';
  var d = document, root = d.documentElement, t0 = Date.now(), MIN = 3900, MAX = 9000, done = false;
  var reduce = false; try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
  if (reduce) MIN = 900;
  var css = '#jcIntro{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;' +
    'background:radial-gradient(60% 60% at 50% 46%,#1b2f66 0%,#0d1a3d 55%,#060d22 100%);opacity:1;transition:opacity .8s ease,visibility .8s}' +
    '#jcIntro.out{opacity:0;visibility:hidden;pointer-events:none}' +
    '#jcIntro .stage{position:relative;width:100%;height:100%;perspective:1100px;perspective-origin:50% 45%;display:flex;align-items:center;justify-content:center}' +
    '#jcIntro .glow{position:absolute;left:50%;top:46%;width:56vmin;height:56vmin;margin:-28vmin 0 0 -28vmin;border-radius:50%;background:radial-gradient(circle,rgba(240,208,120,.28),rgba(240,208,120,0) 68%);animation:jcPulse 2.4s ease-in-out infinite}' +
    '#jcIntro .floor{position:absolute;left:50%;top:78%;width:46vmin;height:7vmin;margin-left:-23vmin;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.55),rgba(0,0,0,0));filter:blur(4px)}' +
    '#jcIntro .spin{position:relative;width:min(56vmin,420px);height:min(56vmin,420px);transform-style:preserve-3d;animation:jcSpin 5.2s linear infinite;animation-fill-mode:both}' +
    '#jcIntro .spin img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;backface-visibility:visible;user-select:none;-webkit-user-drag:none}' +
    '#jcIntro .rup{position:absolute;left:50%;top:46%;font:800 28vmin/1 Georgia,"Times New Roman","Segoe UI",serif;color:#f4dc8d;transform-style:preserve-3d;opacity:0;pointer-events:none;' +
    'background:linear-gradient(180deg,#fff2b8,#e3bd5a 55%,#a67c1f);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 22px rgba(240,200,90,.65));animation:jcFly 3.1s cubic-bezier(.45,.05,.7,.6) .9s both}' +
    '#jcIntro .rup.s{font-size:11vmin;animation-duration:2.9s}' +
    '#jcIntro .cap{position:absolute;left:0;right:0;bottom:9vh;text-align:center;color:#e7cf86;letter-spacing:.32em;font:600 12px/1 "Segoe UI",sans-serif;text-transform:uppercase;opacity:.85}' +
    '#jcIntro .bar{position:absolute;left:50%;bottom:6vh;width:150px;height:2px;margin-left:-75px;background:rgba(231,207,134,.2);overflow:hidden;border-radius:2px}' +
    '#jcIntro .bar i{display:block;height:100%;width:40%;background:#e7cf86;animation:jcBar 1.2s ease-in-out infinite}' +
    '#jcIntro .skip{position:absolute;right:16px;top:12px;color:#9fb0d6;font:11px "Segoe UI",sans-serif;opacity:.7}' +
    '@keyframes jcSpin{0%{transform:translateZ(-60px) scale(.82) rotateY(-90deg);opacity:0}12%{opacity:1}100%{transform:translateZ(0) scale(1) rotateY(630deg);opacity:1}}' +
    '@keyframes jcFly{0%{opacity:0;transform:translate3d(-50%,-50%,-1800px) rotateY(-70deg) scale(.5)}14%{opacity:.55}62%{opacity:.95;transform:translate3d(-50%,-50%,-180px) rotateY(-12deg) scale(1)}86%{opacity:.9;transform:translate3d(-50%,-50%,380px) rotateY(10deg) scale(1.1)}100%{opacity:0;transform:translate3d(-50%,-50%,640px) rotateY(24deg) scale(1.25)}}' +
    '@keyframes jcPulse{0%,100%{transform:scale(.94);opacity:.8}50%{transform:scale(1.06);opacity:1}}' +
    '@keyframes jcBar{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}';
  var st = d.createElement('style'); st.id = 'jcIntroCss'; st.textContent = css; (d.head || root).appendChild(st);

  var el = d.createElement('div'); el.id = 'jcIntro'; el.setAttribute('role', 'presentation');
  var layers = '', N = 16, i;
  for (i = 0; i < N; i++) { var z = (i - (N - 1) / 2) * 1.6, shade = 0.55 + 0.45 * (i / (N - 1)); layers += '<img alt="" src="' + BASE + 'assets/jc-logo-3d.png" style="transform:translateZ(' + z.toFixed(1) + 'px);filter:brightness(' + shade.toFixed(2) + ')">'; }
  var small = '';
  [[-34, -12, .0], [30, 8, .35], [-18, 20, .7], [40, -22, 1.0], [-44, 6, 1.2]].forEach(function (p, k) { small += '<span class="rup s" style="margin-left:' + p[0] + 'vmin;margin-top:' + p[1] + 'vmin;animation-delay:' + (0.9 + p[2]).toFixed(2) + 's">₹</span>'; });
  el.innerHTML = '<div class="stage"><div class="glow"></div><div class="floor"></div>' + small + '<div class="spin">' + layers + '</div><div class="rup" style="margin-left:-9vmin;margin-top:-15vmin">₹</div></div>' +
    '<div class="cap">Connecting People Thru Services</div><div class="bar"><i></i></div><div class="skip">tap to skip</div>';
  root.appendChild(el);
  try { var pre = new Image(); pre.src = BASE + 'assets/jc-logo-3d.png'; } catch (e) { }

  function finish() {
    if (done) return; done = true; el.classList.add('out');
    setTimeout(function () { try { el.remove(); st.remove(); } catch (e) { } }, 900);
  }
  function ready() { var left = MIN - (Date.now() - t0); setTimeout(finish, Math.max(0, left)); }
  if (d.readyState === 'complete') ready(); else window.addEventListener('load', ready);
  setTimeout(finish, MAX);
  el.addEventListener('click', finish);
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(); });
})();
