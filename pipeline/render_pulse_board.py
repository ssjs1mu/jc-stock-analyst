#!/usr/bin/env python3
"""Morning Pulse 'board' infographic (landscape 2000x1116) -> PNG + PDF.

Usage: python3 render_pulse_board.py --config pulse.json --png out.png [--pdf out.pdf]

Pure HTML/SVG rendered by Playwright/Chromium; no AI image service and no subscription needed.
Config keys: title, date, generated, headline, bias_text, spark[floats], spark_label,
vix{value,pct,headline,text}, tiles[{name,sub,value,pct}], bench[{name,code,level,pct}],
asia{head,text}, levels[{name,s,r,note}], bottom[{title,icon,text}], footnote, disclaimer.
Every missing number must already be the string "n/a" -- nothing is invented here.
"""
import argparse
import base64
import html
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 2000, 1116
BAR = ["#1f6fa8", "#d6336c", "#1b9a77", "#2b5f9e", "#f2711c", "#2a9d8f", "#c2255c", "#e8590c", "#3b6fb6"]


def e(x):
    return html.escape(str(x), quote=True)


def logo():
    p = os.path.join(HERE, "branding", "tree_logo_transparent.png")
    try:
        return "data:image/png;base64," + base64.b64encode(open(p, "rb").read()).decode()
    except Exception:
        return ""


def sign(p):
    try:
        v = float(str(p).replace("%", "").replace("+", ""))
    except Exception:
        return 0
    return 1 if v > 0 else (-1 if v < 0 else 0)


def chg_txt(p):
    s = sign(p)
    if p in (None, "n/a", ""):
        return "n/a"
    return "%s %s" % (p, "▲" if s > 0 else ("▼" if s < 0 else "—"))


def col(p):
    s = sign(p)
    return "#16a34a" if s > 0 else ("#dc2626" if s < 0 else "#64748b")


def gauge(frac, size=150, label=""):
    """semicircle gauge, frac 0..1 (needle position)"""
    frac = min(1, max(0, frac))
    cx, cy, r = 100, 100, 80
    segs = [("#d6336c", 0, .25), ("#f2711c", .25, .5), ("#e8c21a", .5, .7), ("#1b9a77", .7, 1)]
    paths = ""
    for c, a, b in segs:
        a0, a1 = math.pi * (1 - a), math.pi * (1 - b)
        x0, y0 = cx + r * math.cos(a0), cy - r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy - r * math.sin(a1)
        paths += '<path d="M%.1f %.1f A%d %d 0 0 1 %.1f %.1f" stroke="%s" stroke-width="22" fill="none"/>' % (x0, y0, r, r, x1, y1, c)
    ang = math.pi * (1 - frac)
    nx, ny = cx + 62 * math.cos(ang), cy - 62 * math.sin(ang)
    return ('<svg viewBox="0 0 200 118" width="%d" height="%d">%s<line x1="100" y1="100" x2="%.1f" y2="%.1f" '
            'stroke="#0f2747" stroke-width="7" stroke-linecap="round"/><circle cx="100" cy="100" r="11" fill="#0f2747"/></svg>'
            % (size, size * .59, paths, nx, ny))


def spark(vals):
    vals = [v for v in vals if isinstance(v, (int, float))]
    if len(vals) < 3:
        return ""
    lo, hi = min(vals), max(vals)
    rng = (hi - lo) or 1
    w, h, n = 470, 230, len(vals)
    pts = [(10 + i * (w - 20) / (n - 1), h - 20 - (v - lo) / rng * (h - 60)) for i, v in enumerate(vals)]
    bars = ""
    for i, (x, y) in enumerate(pts):
        c = "#1b9a77" if i == 0 or vals[i] >= vals[i - 1] else "#d6336c"
        bars += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="3" fill="%s" opacity=".85"/>' % (
            x - (w / n) * .3, y, (w / n) * .6, h - 20 - y, c)
    line = " ".join("%.1f,%.1f" % p for p in pts)
    ax, ay = pts[-1]
    return ('<svg viewBox="0 0 %d %d" width="%d" height="%d">%s<polyline points="%s" fill="none" stroke="#0f2747" '
            'stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="%.1f" cy="%.1f" r="9" '
            'fill="#1b9a77" stroke="#fff" stroke-width="3"/></svg>' % (w, h, w, h, bars, line, ax, ay))


ICON = {
    "cal": '<svg viewBox="0 0 64 64" width="92" height="92"><rect x="6" y="12" width="52" height="46" rx="8" fill="#fff" stroke="#c7d2e3" stroke-width="3"/><rect x="6" y="12" width="52" height="16" rx="8" fill="#f2711c"/><rect x="18" y="5" width="6" height="14" rx="3" fill="#0f2747"/><rect x="40" y="5" width="6" height="14" rx="3" fill="#0f2747"/><g fill="#9fb0c8"><rect x="14" y="34" width="8" height="6"/><rect x="28" y="34" width="8" height="6"/><rect x="42" y="34" width="8" height="6"/><rect x="14" y="45" width="8" height="6"/><rect x="28" y="45" width="8" height="6"/></g></svg>',
    "list": '<svg viewBox="0 0 64 64" width="92" height="92"><rect x="10" y="8" width="44" height="52" rx="6" fill="#fff" stroke="#c7d2e3" stroke-width="3"/><rect x="22" y="3" width="20" height="10" rx="4" fill="#0f2747"/><g stroke="#1b9a77" stroke-width="4" fill="none" stroke-linecap="round"><path d="M16 24l4 4 7-8"/><path d="M16 38l4 4 7-8"/></g><g stroke="#9fb0c8" stroke-width="4" stroke-linecap="round"><path d="M32 25h16"/><path d="M32 39h16"/></g></svg>',
    "chart": '<svg viewBox="0 0 64 64" width="92" height="92"><rect x="6" y="8" width="52" height="48" rx="8" fill="#fff" stroke="#c7d2e3" stroke-width="3"/><g fill="#1b9a77"><rect x="14" y="34" width="8" height="16"/><rect x="28" y="24" width="8" height="26"/></g><rect x="42" y="16" width="8" height="34" fill="#d6336c"/></svg>',
    "chip": '<svg viewBox="0 0 64 64" width="120" height="120"><rect x="16" y="16" width="32" height="32" rx="6" fill="#1b9a77"/><rect x="24" y="24" width="16" height="16" rx="3" fill="#fff" opacity=".85"/><g stroke="#0f2747" stroke-width="3" stroke-linecap="round"><path d="M24 8v8M32 8v8M40 8v8M24 48v8M32 48v8M40 48v8M8 24h8M8 32h8M8 40h8M48 24h8M48 32h8M48 40h8"/></g></svg>',
}


def build_html(c):
    tiles = ""
    for t in c["tiles"][:6]:
        p = t.get("pct")
        frac = .5 + (float(str(p).replace("%", "").replace("+", "")) / 4 if sign(p) or str(p).strip("+-%0.") == "" and p not in ("n/a", None) else 0)
        try:
            frac = .5 + float(str(p).replace("%", "").replace("+", "")) / 4
        except Exception:
            frac = .5
        tiles += ('<div class="tile">%s<div class="tn">%s</div><div class="ts">%s</div><div class="tv">%s</div>'
                  '<div class="tc" style="color:%s">%s</div></div>'
                  % (gauge(frac, 104), e(t["name"]), e(t.get("sub", "")), e(t["value"]), "#7ee2a8" if sign(p) > 0 else ("#ff8aa1" if sign(p) < 0 else "#cbd5e1"), e(chg_txt(p))))
    bench = ""
    for i, b in enumerate(c["bench"][:9]):
        bench += ('<div class="brow"><div class="bar" style="background:linear-gradient(90deg,%s,%s)"><span class="flag">%s</span>'
                  '<span class="bn">%s</span><span class="bl">%s</span></div><div class="pill" style="color:%s;background:%s">%s</div></div>'
                  % (BAR[i % len(BAR)], BAR[(i + 1) % len(BAR)], e(b.get("code", "")), e(b["name"]), e(b["level"]),
                     col(b["pct"]), "#dff5e8" if sign(b["pct"]) > 0 else ("#fde2e7" if sign(b["pct"]) < 0 else "#e8edf3"), e(chg_txt(b["pct"]))))
    levels = ""
    for lv in c["levels"][:2]:
        levels += ('<div class="lvl"><div class="ln">%s</div><div class="lz"><div class="zone"><small>Support Zone</small><b>%s</b></div>'
                   '<div class="zone"><small>Resistance Zone</small><b>%s</b></div></div><div class="lnote"><b>Upside Potential:</b> %s</div></div>'
                   % (e(lv["name"]), e(lv["s"]), e(lv["r"]), e(lv["note"])))
    bottom = ""
    for b in c["bottom"][:3]:
        bottom += '<div class="bp">%s<div><h4>%s</h4><p>%s</p></div></div>' % (ICON.get(b.get("icon", "chart"), ""), e(b["title"]), e(b["text"]))
    v = c["vix"]
    vv = v.get("gauge", .5)
    return """<!doctype html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:%dpx;height:%dpx;font-family:Inter,'Segoe UI',Arial,Helvetica,sans-serif;color:#0f2747;background:linear-gradient(180deg,#f4f8fc,#eaf1f8);position:relative;overflow:hidden}
.top{height:92px;background:#0f2747;color:#fff;display:flex;align-items:center;gap:22px;padding:0 40px}
.top img{height:70px}.top h1{font-size:48px;font-weight:700;letter-spacing:-.5px;white-space:nowrap}
h2{font-size:25px;font-weight:800;letter-spacing:.3px;text-transform:uppercase}
.abs{position:absolute}
.big{font-size:38px;font-weight:800;line-height:1.1}
p{font-size:21px;line-height:1.35;color:#1e3553}.clamp6{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;font-size:19px}.bp p{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.panel{background:#1d3a5e;border-radius:26px;padding:22px 26px;border:3px solid #2e547f}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 14px;margin-top:6px}
.tile{text-align:center;color:#fff}.tn{font-weight:700;font-size:20px;margin-top:-2px}.ts{font-size:14px;color:#a9bfdc}.tv{font-weight:800;font-size:24px}.tc{font-weight:700;font-size:19px}
.brow{display:flex;align-items:center;gap:10px;margin-bottom:9px}
.bar{flex:1;height:46px;border-radius:23px;color:#fff;display:flex;align-items:center;padding:0 18px 0 6px;font-weight:700;font-size:22px;box-shadow:0 3px 6px rgba(15,39,71,.18)}
.flag{width:36px;height:36px;border-radius:50%%;background:#fff;color:#0f2747;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-right:12px}
.bn{width:235px;white-space:nowrap}.bl{margin-left:auto;font-variant-numeric:tabular-nums}
.pill{width:140px;height:42px;border-radius:21px;font-weight:800;font-size:21px;display:flex;align-items:center;justify-content:center}
.lvl{display:grid;grid-template-columns:110px 1fr;gap:8px 14px;align-items:center;margin-bottom:12px;border-bottom:2px solid #c9d6e6;padding-bottom:10px}.lnote{grid-column:1/3}
.ln{font-size:26px;font-weight:800;line-height:1.05}.lz{display:flex;gap:18px}.zone{flex:1;text-align:center;border-top:4px solid #1b9a77;padding-top:6px}
.zone:nth-child(2){border-top-color:#d6336c}.zone small{display:block;font-size:16px;color:#4a6486}.zone b{font-size:22px;white-space:nowrap}
.lnote{font-size:17px;line-height:1.25}
.bp{display:flex;gap:18px;align-items:flex-start}.bp svg{flex:none}.bp h4{font-size:26px;font-weight:800;margin-bottom:6px}.bp p{font-size:19px;line-height:1.32}
.foot{position:absolute;left:0;right:0;bottom:0;height:30px;background:#0f2747;color:#c3d1e6;font-size:14px;display:flex;align-items:center;padding:0 40px;gap:30px;white-space:nowrap;overflow:hidden}
</style></head><body>
<div class="top"><img src="%s"><h1>%s</h1></div>

<div class="abs" style="left:40px;top:116px;width:480px"><h2>Today's Market Bias<br>&amp; Macro Highlights</h2></div>
<div class="abs" style="left:40px;top:215px">%s</div>
<div class="abs" style="left:40px;top:455px;width:470px;font-size:15px;color:#4a6486">%s</div>

<div class="abs" style="left:560px;top:118px;width:450px"><div class="big" style="font-size:34px">%s</div><p class="clamp6" style="margin-top:12px">%s</p></div>
<div class="abs" style="left:1025px;top:118px;width:2px;height:200px;background:#c9d6e6"></div>
<div class="abs" style="left:1045px;top:112px;display:flex;gap:12px;width:350px;align-items:center">%s<div><div class="big" style="font-size:26px">%s</div></div></div>
<div class="abs" style="left:1045px;top:215px;width:350px"><p style="font-size:19px">%s</p></div>

<div class="abs panel" style="left:1430px;top:112px;width:530px;height:420px"><h2 style="color:#fff;font-size:20px;margin-bottom:6px">Commodities, Currency &amp; Volatility</h2><div class="tiles">%s</div></div>

<div class="abs" style="left:540px;top:345px;width:850px"><h2 style="text-align:center;margin-bottom:12px;font-size:27px">Global &amp; Asian Equity Benchmarks</h2>%s</div>

<div class="abs" style="left:40px;top:535px;width:470px;display:flex;gap:14px">%s<div><div class="big" style="font-size:32px">%s</div></div></div>
<div class="abs" style="left:40px;top:645px;width:470px"><p style="font-size:20px">%s</p></div>

<div class="abs" style="left:1430px;top:550px;width:530px;"><h2 style="font-size:23px;text-align:center">Key Technical Levels to Watch</h2></div>
<div class="abs" style="left:1430px;top:600px;width:530px">%s</div>

<div class="abs" style="left:40px;top:890px;width:1920px;height:3px;background:#c9d6e6"></div>
<div class="abs" style="left:40px;top:905px;width:600px"><h2 style="font-size:27px">Corporate Action &amp; Market Alerts</h2></div>
<div class="abs" style="left:40px;top:950px;width:1920px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px">%s</div>
<div class="foot"><span>%s</span><span>%s</span></div>
</body></html>""" % (W, H, logo(), e(c["title"]), spark(c.get("spark", [])), e(c.get("spark_label", "")),
                     e(c["headline"]), e(c["bias_text"]), gauge(vv, 120), e(v["headline"]), e(v["text"]), tiles, bench,
                     ICON["chip"], e(c["asia"]["head"]), e(c["asia"]["text"]), levels, bottom, e(c.get("footnote", "")), e(c.get("disclaimer", "")))


def render(cfg, png, pdf=None):
    from playwright.sync_api import sync_playwright
    html_s = build_html(cfg)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": W, "height": H})
        pg.set_content(html_s, wait_until="load")
        try:
            pg.wait_for_load_state("networkidle", timeout=6000)
        except Exception:
            pass
        pg.screenshot(path=png, full_page=False)
        if pdf:
            pg.pdf(path=pdf, width="%dpx" % W, height="%dpx" % H, print_background=True)
        b.close()
    return png


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--png", required=True)
    ap.add_argument("--pdf")
    a = ap.parse_args()
    print("Wrote", render(json.load(open(a.config)), a.png, a.pdf))
