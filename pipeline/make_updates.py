#!/usr/bin/env python3
"""One shareable 'daily reports' message: Morning Sunrise + Evening Breeze together.
Builds updates/index.html (page with both thumbnails, links, update times, WhatsApp/copy buttons),
updates/og.jpg (one preview card showing both thumbnails - what WhatsApp/Telegram show for the link),
updates/sunrise.jpg + breeze.jpg thumbnails and updates/message.txt (the plain-text message).
Run automatically by publish.py after Morning Sunrise or Evening Breeze is published; or by hand: python3 pipeline/make_updates.py"""
import html, json, os, sys, urllib.parse
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brand  # noqa: E402

BASE = "https://ssjs1mu.github.io/jc-stock-analyst/"
SHORT = "https://tinyurl.com/JoshisCorner-Reports"   # short link to the updates/ page
IST = timezone(timedelta(hours=5, minutes=30))
REP = [  # key, schedule id, name, icon, url folder, due text, accent
    ("sunrise", "morning-pulse", "Morning Sunrise", "\U0001F305", "morning/", "8:45 AM", "#F5A623"),
    ("breeze", "evening-breeze", "Evening Breeze", "\U0001F307", "evening/", "4:30 PM", "#7C6CF0"),
]


def latest(sid):
    try:
        runs = json.load(open(os.path.join(ROOT, "reports", sid, "index.json")))["runs"]
    except Exception:
        return None
    for r in runs:
        if r.get("status") == "ok":
            pngs = sorted(f["path"] for f in r["files"] if "_Mobile_" in f["name"] and f["type"] == "png")
            return {"date": r["date"], "gen": datetime.fromisoformat(r["generated_at"]), "page1": pngs[0] if pngs else None}
    return None


def fmt_gen(d):
    return d.strftime("%a %d %b, %I:%M %p").replace(" 0", " ") + " IST"


def thumb(src, dst, w=380):
    from PIL import Image
    im = Image.open(os.path.join(ROOT, src)).convert("RGB")
    im.thumbnail((w, int(w * 1.7)))
    im.save(dst, "JPEG", quality=84, optimize=True)


def _b64(path):
    import base64
    return "data:image/jpeg;base64," + base64.b64encode(open(path, "rb").read()).decode()


def build():
    out = os.path.join(ROOT, "updates")
    os.makedirs(out, exist_ok=True)
    now = datetime.now(IST)
    items, lines = [], []
    for key, sid, name, icon, folder, due, acc in REP:
        L = latest(sid)
        if not L or not L["page1"]:
            continue
        thumb(L["page1"], os.path.join(out, key + ".jpg"))
        fresh = L["date"] == now.strftime("%Y-%m-%d")
        items.append(dict(key=key, name=name, icon=icon, url=BASE + folder, due=due, acc=acc, gen=L["gen"], date=L["date"], fresh=fresh))
        lines.append("%s %s - ready by %s IST on every trading day\n%s\nLatest: %s" % (icon, name, due, BASE + folder, fmt_gen(L["gen"])))
    if not items:
        return None
    msg = ("Joshi's Corner - daily reports (Mon-Fri, NSE trading days)\n\n" + "\n\n".join(lines) +
           "\n\nBoth reports in one place: " + SHORT)
    open(os.path.join(out, "message.txt"), "w").write(msg)
    # ---- preview card 1200x630 with both thumbnails ----
    cards = "".join(
        "<div class='c' style='border-color:%s'><img src='%s'><div><div class='n' style='color:%s'>%s %s</div><div class='d'>Ready by <b>%s IST</b></div>"
        "<div class='g'>Latest: %s</div><div class='go'>Tap the link &rarr;</div></div></div>"
        % (i["acc"], _b64(os.path.join(out, i["key"] + ".jpg")), i["acc"], i["icon"], html.escape(i["name"]), i["due"], html.escape(fmt_gen(i["gen"])))
        for i in items)
    page = ("<html><head><style>%s*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:linear-gradient(135deg,#17306b,#0d0a18 75%%);font-family:Inter,Arial,sans-serif;color:#f4efe0;padding:26px 44px;overflow:hidden}"
            ".top{display:flex;align-items:baseline;gap:22px}.b{font-family:%s;font-size:60px;font-weight:700;color:#E2B84A}.s{font-size:26px;font-weight:700;color:#efe9d6}"
            ".row{display:flex;gap:26px;margin-top:14px}.c{flex:1;min-width:0;display:flex;gap:18px;align-items:center;background:#ffffff14;border:3px solid;border-radius:20px;padding:16px}"
            ".c img{height:420px;flex:none;border-radius:12px;border:2px solid #E2B84A;box-shadow:0 12px 30px #000a}.n{font-size:29px;font-weight:800;line-height:1.15}.d{font-size:22px;margin-top:12px}.g{font-size:16px;color:#d9d2bd;margin-top:10px}.go{margin-top:16px;font-size:19px;color:#E2B84A;font-weight:800}"
            "</style></head><body><div class='top'><div class='b'>Joshi's Corner</div><div class='s'>Daily reports &middot; Mon-Fri trading days</div></div><div class='row'>%s</div></body></html>"
            % (brand.font_css(), brand.SCRIPT_STACK, cards))
    from playwright.sync_api import sync_playwright
    tmp = os.path.join(out, "og.png")
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.set_content(page, wait_until="load")
        try:
            pg.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass
        pg.screenshot(path=tmp)
        b.close()
    from PIL import Image
    im = Image.open(tmp).convert("RGB")
    q = 86
    while True:
        im.save(os.path.join(out, "og.jpg"), "JPEG", quality=q, optimize=True)
        if os.path.getsize(os.path.join(out, "og.jpg")) < 250000 or q <= 55:
            break
        q -= 6
    os.remove(tmp)
    # ---- the page ----
    tiles = "".join(
        "<a class='t' href='%s' style='--a:%s'><img src='%s.jpg' alt='%s'><div class='tx'><h2>%s %s</h2><p>Ready by <b>%s IST</b> every trading day</p><p class='g'>Latest: %s%s</p><span class='btn'>Open the report &rarr;</span></div></a>"
        % (i["url"], i["acc"], i["key"], html.escape(i["name"]), i["icon"], html.escape(i["name"]), i["due"], html.escape(fmt_gen(i["gen"])),
           "" if i["fresh"] else " <em>(next update on the next trading day)</em>") for i in items)
    wa = "https://wa.me/?text=" + urllib.parse.quote(msg)
    title = "Joshi's Corner - Morning Sunrise & Evening Breeze"
    doc = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s</title><meta name="description" content="Morning Sunrise by 8:45 AM and Evening Breeze by 4:30 PM IST, every trading day.">
<meta property="og:type" content="website"><meta property="og:title" content="%(title)s"><meta property="og:description" content="Morning Sunrise - ready by 8:45 AM IST. Evening Breeze - ready by 4:30 PM IST. Every trading day.">
<meta property="og:url" content="%(base)supdates/"><meta property="og:image" content="%(base)supdates/og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
<style>%(font)s*{box-sizing:border-box}body{margin:0;background:radial-gradient(120%% 90%% at 0 0,#1d3f8f,#0d0a18 70%%);min-height:100vh;color:#f4efe0;font-family:Inter,Arial,sans-serif;padding:20px 16px 40px}
.w{max-width:900px;margin:0 auto}.b{font-family:%(script)s;font-size:54px;color:#E2B84A;line-height:1.1}.sub{color:#d9d2bd;margin:2px 0 18px;font-weight:600}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:640px){.grid{grid-template-columns:1fr}}
.t{display:flex;gap:14px;align-items:center;text-decoration:none;color:inherit;background:#ffffff14;border:2px solid var(--a);border-radius:18px;padding:14px}.t img{height:190px;border-radius:10px;border:2px solid #E2B84A}
.t h2{margin:0 0 6px;font-size:21px;color:var(--a)}.t p{margin:4px 0;font-size:14px}.t .g{color:#cfc8b2;font-size:12.5px}.btn{display:inline-block;margin-top:8px;background:var(--a);color:#fff;font-weight:800;padding:7px 14px;border-radius:20px;font-size:13.5px}
.m{margin-top:18px;background:#00000040;border-radius:14px;padding:14px;white-space:pre-wrap;font-size:13px;line-height:1.5;color:#e8e2cf}.act{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.act a,.act button{border:0;border-radius:22px;padding:10px 18px;font-weight:800;font-size:14px;cursor:pointer;text-decoration:none;color:#fff}.wa{background:#25D366}.cp{background:#E2B84A;color:#2a1c00!important}</style></head><body><div class="w">
<div class="b">Joshi's Corner</div><div class="sub">Daily reports &middot; Mon-Fri, NSE trading days</div><div class="grid">%(tiles)s</div>
<div class="m" id="msg">%(msg)s</div><div class="act"><a class="wa" href="%(wa)s" target="_blank" rel="noopener">Share on WhatsApp</a><button class="cp" onclick="navigator.clipboard.writeText(document.getElementById('msg').innerText).then(function(){this.textContent='Copied'}.bind(this))">Copy message</button></div>
<p class="sub" style="margin-top:18px;font-size:12.5px">Updated %(now)s. Not investment advice.</p></div></body></html>""" % dict(
        title=html.escape(title), base=BASE, font=brand.font_css(), script=brand.SCRIPT_STACK.replace('"', "'"), tiles=tiles, msg=html.escape(msg), wa=wa, now=fmt_gen(now))
    open(os.path.join(out, "index.html"), "w").write(doc)
    return BASE + "updates/"


if __name__ == "__main__":
    print(build())
