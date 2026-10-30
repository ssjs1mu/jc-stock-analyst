#!/usr/bin/env python3
"""Booklet (flip-book) page for the phone-size Morning Pulse.

Writes static pages so WhatsApp / Facebook / Instagram show a rich preview card (image + title) instead of a bare link:
  morning/index.html          always the latest booklet   -> https://ssjs1mu.github.io/jc-stock-analyst/morning/
  morning/<date>/index.html   the same booklet, archived
  morning/og.png (+ <date>/og.png)  1200x630 preview card
Any number of pages works: pass more PNGs and they turn like a book.
"""
import html
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import brand  # noqa: E402

BASE = "https://ssjs1mu.github.io/jc-stock-analyst/"
MOODS = {"bull": ("#16A34A", "#052e16", "BULLISH TONE"), "bear": ("#DC2626", "#450a0a", "CAUTIOUS TONE"),
         "neutral": ("#3B82F6", "#0b1e3f", "BALANCED TONE")}

PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>%(title)s</title>
<meta name="description" content="%(desc)s">
<meta property="og:type" content="website"><meta property="og:site_name" content="Joshi's Corner">
<meta property="og:title" content="%(title)s"><meta property="og:description" content="%(desc)s">
<meta property="og:url" content="%(url)s"><meta property="og:image" content="%(og)s">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="%(og)s">
<style>%(font)s
*{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%%;background:radial-gradient(120%% 90%% at 50%% 0%%,#2a2140 0%%,#0d0a18 70%%);color:#f4efe0;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;overflow:hidden}
.top{position:fixed;left:0;right:0;top:0;height:54px;display:flex;align-items:center;justify-content:center;gap:10px;z-index:50}
.top .b{font-family:%(script)s;font-size:30px;font-weight:700;color:#E2B84A;text-shadow:0 0 1px #F6DC8A}
.stage{position:fixed;left:0;right:0;top:54px;bottom:64px;display:flex;align-items:center;justify-content:center;perspective:2200px}
.book{position:relative;width:min(94vw,calc((100vh - 130px)*0.8));width:min(94vw,calc((100dvh - 130px)*0.8));aspect-ratio:1080/1350;filter:drop-shadow(0 18px 38px rgba(0,0,0,.6))}
.leaf{position:absolute;inset:0;transform-origin:left center;transition:transform .85s cubic-bezier(.45,.05,.25,1);transform-style:preserve-3d;cursor:pointer;border-radius:4px 10px 10px 4px}
.leaf img{position:absolute;inset:0;width:100%%;height:100%%;border-radius:4px 10px 10px 4px;backface-visibility:hidden;object-fit:cover;background:#fff}
.leaf .back{position:absolute;inset:0;transform:rotateY(180deg);backface-visibility:hidden;border-radius:10px 4px 4px 10px;background:linear-gradient(90deg,#d8cfb4,#efe8d4)}
.leaf.turned{transform:rotateY(-180deg)}
.leaf::after{content:"";position:absolute;inset:0;border-radius:4px 10px 10px 4px;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.28),rgba(0,0,0,0) 7%%);backface-visibility:hidden}
.spine{position:absolute;left:-3px;top:2px;bottom:2px;width:6px;background:linear-gradient(90deg,#000a,#0000);z-index:1000;pointer-events:none}
.bar{position:fixed;left:0;right:0;bottom:0;height:64px;display:flex;align-items:center;justify-content:center;gap:14px;z-index:50;padding:0 12px}
.bar button,.bar a{background:#E2B84A;color:#241a05;border:0;border-radius:22px;padding:10px 18px;font:700 15px Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer}
.bar button.g{background:#ffffff1f;color:#f4efe0}
.dots{display:flex;gap:7px;align-items:center}.dots i{width:9px;height:9px;border-radius:50%%;background:#ffffff40}.dots i.on{background:#E2B84A}
.hint{position:fixed;left:0;right:0;top:46px;text-align:center;font-size:13px;opacity:.75;pointer-events:none;transition:opacity .6s}
</style></head><body>
<div class="top"><span class="b">Joshi's Corner</span></div>
<div class="stage"><div class="book" id="book"><div class="spine"></div>%(leaves)s</div></div>
<div class="hint" id="hint">Tap the page to turn it</div>
<div class="bar"><button class="g" id="prev" aria-label="Previous page">&#8249;</button><div class="dots" id="dots"></div><button id="next" aria-label="Next page">Next page &#8250;</button><button class="g" id="share">Share</button></div>
<script>
(function(){var L=[].slice.call(document.querySelectorAll('.leaf')),n=L.length,i=0,D=document.getElementById('dots');
for(var k=0;k<n;k++){D.insertAdjacentHTML('beforeend','<i></i>')}
function z(){L.forEach(function(l,k){l.style.zIndex=k<i?k:(n-k)+n});[].forEach.call(D.children,function(d,k){d.className=k===i?'on':''});
 document.getElementById('next').textContent=i>=n-1?'Back to cover':'Next page \\u203a'}
function go(d){var j=i+d;if(j<0)return;if(j>n-1){i=0;L.forEach(function(l){l.classList.remove('turned')});z();return}
 if(d>0){L[i].classList.add('turned')}else{L[j].classList.remove('turned')}i=j;z();document.getElementById('hint').style.opacity=0}
L.forEach(function(l,k){l.addEventListener('click',function(e){var r=l.getBoundingClientRect();(e.clientX-r.left)>r.width*.35?go(1):go(-1)})});
document.getElementById('next').onclick=function(){go(1)};document.getElementById('prev').onclick=function(){go(-1)};
document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' ')go(1);if(e.key==='ArrowLeft')go(-1)});
var sx=null;document.addEventListener('touchstart',function(e){sx=e.touches[0].clientX},{passive:true});
document.addEventListener('touchend',function(e){if(sx===null)return;var dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>45)go(dx<0?1:-1);sx=null},{passive:true});
document.getElementById('share').onclick=function(){var d={title:%(jtitle)s,text:%(jtitle)s,url:location.href};if(navigator.share){navigator.share(d).catch(function(){})}else if(navigator.clipboard){navigator.clipboard.writeText(location.href);this.textContent='Link copied'}};
z();setTimeout(function(){document.getElementById('hint').style.opacity=0},6000)})();
</script></body></html>"""


def _thumb(path):
    import base64
    import io
    from PIL import Image
    im = Image.open(path).convert("RGB")
    im.thumbnail((520, 650))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _og(path, date_txt, headline, mood, thumb_abs):
    """1200x630 preview card: page-1 thumbnail + brand + headline (rendered with Chromium so fonts match)."""
    acc, bg, word = MOODS.get(mood, MOODS["neutral"])
    page = ("<html><head><style>%s*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:linear-gradient(135deg,%s,#0d0a18 70%%);"
            "font-family:Inter,Arial,sans-serif;color:#f4efe0;display:flex;align-items:center;gap:46px;padding:0 70px;overflow:hidden}"
            ".th{height:520px;aspect-ratio:1080/1350;border-radius:14px;border:3px solid #E2B84A;box-shadow:0 20px 50px #000a;transform:rotate(-3deg)}"
            ".b{font-family:%s;font-size:78px;font-weight:700;color:#E2B84A}.t{font-size:34px;font-weight:700;margin-top:4px}"
            ".h{font-size:40px;font-weight:800;line-height:1.15;margin-top:26px}.p{display:inline-block;margin-top:24px;background:%s;color:#fff;padding:9px 22px;border-radius:22px;font-weight:800;font-size:24px}"
            ".go{margin-top:26px;font-size:26px;color:#E2B84A;font-weight:700}</style></head><body>"
            "<img class='th' src='%s'><div><div class='b'>Joshi's Corner</div><div class='t'>Morning Market Pulse &middot; %s</div>"
            "<div class='h'>%s</div><span class='p'>%s</span><div class='go'>Tap to open the booklet &rarr;</div></div></body></html>"
            % (brand.font_css(), bg, brand.SCRIPT_STACK, acc, thumb_abs, html.escape(date_txt), html.escape(headline[:90]), word))
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.set_content(page, wait_until="load")
        try:
            pg.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass
        pg.screenshot(path=path)
        b.close()


def build(date, pages, headline="", mood="neutral", caption=""):
    """pages: list of repo-relative PNG paths, e.g. reports/morning-pulse/JCGG_..._1.png"""
    from datetime import datetime
    dtxt = datetime.strptime(date, "%Y-%m-%d").strftime("%d %b %Y")
    title = "Joshi's Corner - Morning Market Pulse, " + dtxt
    desc = caption or (headline + " | What to expect at the open, key levels and stocks to watch." if headline else "What to expect at the open, key levels and stocks to watch.")
    out = {}
    for sub in ("", date + "/"):
        folder = os.path.join(ROOT, "morning", sub)
        os.makedirs(folder, exist_ok=True)
        up = "../" * (1 + (1 if sub else 0))
        leaves = "".join('<div class="leaf"><img src="%s%s" alt="Page %d" %s><div class="back"></div></div>'
                         % (up, p, i + 1, 'loading="eager"') for i, p in enumerate(pages))
        url = BASE + "morning/" + sub
        og_path = os.path.join(folder, "og.png")
        _og(og_path, dtxt, headline or "What to expect at the open", mood, _thumb(os.path.join(ROOT, pages[0])))
        doc = PAGE % dict(title=html.escape(title), desc=html.escape(desc), url=url, og=url + "og.png", font=brand.font_css(),
                          script=brand.SCRIPT_STACK.replace('"', "'"), leaves=leaves, jtitle=json.dumps(title))
        with open(os.path.join(folder, "index.html"), "w") as f:
            f.write(doc)
        out[sub or "latest"] = url
    return out


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--page", action="append", required=True)
    ap.add_argument("--headline", default="")
    ap.add_argument("--mood", default="neutral")
    a = ap.parse_args()
    print(build(a.date, a.page, a.headline, a.mood))
