#!/usr/bin/env python3
"""Morning Breeze booklet: 4 phone pages (1080x1800) in smoky mood-coloured gradients, no cartoons.
  1 Cover (tree logo, brand, report title, date, expected opening)
  2 Opening summary (snapshots, estimated-today chart, key technical levels)
  3 Global markets, commodities, currency, volatility
  4 Corporate action & alerts, stocks to watch, headlines, technical calls for the day
Input is the pulse config JSON (its "book" block). Any number of extra pages can be appended to PAGES later."""
import html
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import brand  # noqa: E402

W, H = 1080, 1800
e = lambda s: html.escape(str(s if s is not None else ""))

PAL = {  # smoky mood palettes: base, three smoke hues, accent (chips/lines), up, down
    "bull": dict(base="#031a12", s1="#0f6b46", s2="#0b3d5c", s3="#7a5c12", acc="#34d399", up="#34d399", dn="#fb7185", word="BULLISH TONE"),
    "bear": dict(base="#1a050a", s1="#8a1b32", s2="#3b0a2a", s3="#7a4a0a", acc="#fb7185", up="#34d399", dn="#fb7185", word="CAUTIOUS TONE"),
    "neutral": dict(base="#070b24", s1="#27408f", s2="#4b2a8a", s3="#0b5a73", acc="#7aa2ff", up="#34d399", dn="#fb7185", word="BALANCED TONE"),
}
GOLD = "#E2B84A"


def css(p):
    return brand.font_css() + """
*{box-sizing:border-box;margin:0}
body{width:%(W)dpx;height:%(H)dpx;overflow:hidden;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#f5f1e6;background:%(base)s;position:relative}
.smoke{position:absolute;inset:0;overflow:hidden}
.smoke i{position:absolute;border-radius:50%%;filter:blur(110px);opacity:.75}
.smoke i:nth-child(1){width:900px;height:760px;left:-260px;top:-180px;background:%(s1)s}
.smoke i:nth-child(2){width:820px;height:700px;right:-300px;top:380px;background:%(s2)s}
.smoke i:nth-child(3){width:760px;height:560px;left:-120px;bottom:-240px;background:%(s3)s;opacity:.55}
.grain{position:absolute;inset:0;background:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1.4px) 0 0/22px 22px;opacity:.55}
.pg{position:relative;z-index:2;height:100%%;display:flex;flex-direction:column;padding:0 46px 0}
.hd{display:flex;align-items:center;gap:18px;height:112px;flex:none;border-bottom:2px solid %(gold)s55}
.hd img{height:78px;border-radius:12px;border:1.5px solid %(gold)s}
.brand{font-family:%(script)s;font-weight:700;font-size:54px;color:%(gold)s;line-height:1;text-shadow:0 0 1px #F6DC8A}
.hd .sub{font-size:22px;color:#e8e2d0;opacity:.85;margin-top:3px;font-weight:600}
.hd .n{margin-left:auto;font-size:26px;font-weight:800;border:2px solid %(gold)s;border-radius:24px;padding:4px 16px;color:%(gold)s}
.bd{flex:1;min-height:0;padding-top:20px;display:flex;flex-direction:column;gap:16px}
.ft{flex:none;height:46px;display:flex;align-items:center;justify-content:center;font-size:19px;opacity:.8;border-top:1px solid #ffffff22}
h2.s{font-size:27px;letter-spacing:1.3px;text-transform:uppercase;color:%(gold)s;font-weight:800;padding-bottom:7px;border-bottom:2px solid %(acc)s66}
.chip{display:inline-block;background:%(acc)s;color:#04120c;font-weight:900;font-size:25px;padding:7px 22px;border-radius:26px;letter-spacing:.8px}
.card{background:linear-gradient(135deg,#ffffff1c,#ffffff0a);border:1.5px solid #ffffff2e;border-radius:22px;padding:16px 20px;backdrop-filter:blur(2px)}
.up{color:%(up)s}.dn{color:%(dn)s}
table{width:100%%;border-collapse:collapse}
td,th{padding:10px 10px;text-align:left;font-size:25px}th{font-size:19px;letter-spacing:1px;text-transform:uppercase;color:#d9d2bd;font-weight:700;border-bottom:1.5px solid #ffffff33}
tr+tr td{border-top:1px solid #ffffff1c}td.r,th.r{text-align:right;white-space:nowrap}td b{font-weight:800}
.small{font-size:20px;opacity:.85}
""" % dict(W=W, H=H, gold=GOLD, script=brand.SCRIPT_STACK, **p)


def shell(p, inner, n, total, title, cover=False):
    head = ("" if cover else
            '<div class="hd"><img src="%s"><div><div class="brand">%s</div><div class="sub">%s</div></div><div class="n">%d / %d</div></div>'
            % (brand.logo_original(), e(brand.BRAND), title, n, total))
    return ('<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">'
            '<style>%s</style></head><body><div class="smoke"><i></i><i></i><i></i></div><div class="grain"></div>'
            '<div class="pg">%s<div class="bd" id="bd">%s</div><div class="ft">%s</div></div>'
            '<script>(function(){var b=document.getElementById("bd"),z=1;while(b.scrollHeight>b.clientHeight+1&&z>0.7){z-=0.02;b.style.zoom=z;}})();</script></body></html>'
            % (css(p), head, inner, e(brand.SHORT_DISCLAIMER)))


def pc(x):
    try:
        v = float(str(x).replace("%", "").replace("+", ""))
    except Exception:
        return 0.0
    return v


def chg(x):
    v = pc(x)
    return '<b class="%s">%s %s</b>' % ("up" if v >= 0 else "dn", e(x), "&#9650;" if v >= 0 else "&#9660;")


def bar(x, p, scale=3.0):
    v = max(-scale, min(scale, pc(x)))
    w = abs(v) / scale * 50
    col = p["up"] if v >= 0 else p["dn"]
    pos = "left:50%%;width:%.1f%%" % w if v >= 0 else "left:%.1f%%;width:%.1f%%" % (50 - w, w)
    return '<div style="position:relative;height:14px;border-radius:7px;background:#ffffff1c;width:200px"><div style="position:absolute;top:0;bottom:0;%s;background:%s;border-radius:7px"></div><div style="position:absolute;left:50%%;top:-3px;bottom:-3px;width:2px;background:#fff9"></div></div>' % (pos, col)


def chart(vals, proj, p, w=948, h=250):
    vals = [v for v in vals if isinstance(v, (int, float))]
    if len(vals) < 3:
        return ""
    allv = vals + ([proj] if isinstance(proj, (int, float)) else [])
    lo, hi = min(allv), max(allv)
    rng = (hi - lo) or 1
    n = len(allv)
    top, bot = 38, 14
    pts = [(10 + i * (w - 20) / (n - 1), h - bot - (v - lo) / rng * (h - top - bot)) for i, v in enumerate(allv)]
    bw = (w / n) * .56
    bars = ""
    for i in range(len(vals)):
        x, y = pts[i]
        c = p["up"] if i == 0 or vals[i] >= vals[i - 1] else p["dn"]
        bars += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="4" fill="%s" opacity=".85"/>' % (x - bw / 2, y, bw, h - bot - y, c)
    line = " ".join("%.1f,%.1f" % q for q in pts[:len(vals)])
    ex = ""
    if len(pts) > len(vals):
        (ax, ay), (px, py) = pts[len(vals) - 1], pts[-1]
        c = p["up"] if proj >= vals[-1] else p["dn"]
        ex = ('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="4" stroke-dasharray="9 7" stroke-linecap="round"/>'
              '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="4" fill="%s" fill-opacity=".25" stroke="%s" stroke-width="3" stroke-dasharray="7 5"/>'
              '<text x="%.1f" y="%.1f" text-anchor="end" font-size="26" font-weight="800" fill="#fff">Today (est.)</text>'
              % (ax, ay, px, py, GOLD, px - bw / 2, py, bw, h - bot - py, c, c, px + bw / 2, max(26, py - 12)))
    ax, ay = pts[len(vals) - 1]
    return ('<svg style="flex:none;display:block" viewBox="0 0 %d %d" width="100%%" height="%d">%s<polyline points="%s" fill="none" stroke="%s" stroke-width="5" stroke-linejoin="round"/>'
            '<circle cx="%.1f" cy="%.1f" r="9" fill="%s" stroke="#fff" stroke-width="3"/>%s</svg>' % (w, h, h, bars, line, GOLD, ax, ay, GOLD, ex))


def gauge(frac, size=250):
    frac = min(1, max(0, frac))
    cx, cy, r = 100, 100, 80
    segs = [("#fb7185", 0, .25), ("#fb923c", .25, .5), ("#fde047", .5, .7), ("#34d399", .7, 1)]
    paths = ""
    for c, a, b in segs:
        a0, a1 = math.pi * (1 - a), math.pi * (1 - b)
        paths += '<path d="M%.1f %.1f A%d %d 0 0 1 %.1f %.1f" stroke="%s" stroke-width="22" fill="none"/>' % (cx + r * math.cos(a0), cy - r * math.sin(a0), r, r, cx + r * math.cos(a1), cy - r * math.sin(a1), c)
    ang = math.pi * (1 - frac)
    return ('<svg viewBox="0 0 200 118" width="%d" height="%d">%s<line x1="100" y1="100" x2="%.1f" y2="%.1f" stroke="#fff" stroke-width="7" stroke-linecap="round"/><circle cx="100" cy="100" r="11" fill="#fff"/></svg>'
            % (size, size * .59, paths, cx + 62 * math.cos(ang), cy - 62 * math.sin(ang)))


def photo(c, key_sc):
    try:
        import render_pulse_board as r
        return r.mood_photo(key_sc)
    except Exception:
        return None


# ------------------------------------------------------------------ pages
def gift_cover(b):
    g = b.get("gift")
    if not g:
        return e(("Nifty opening zone " + b["zone"]) if b.get("zone") else "Opening view from overnight cues")
    up = pc(g["vs"]) >= 0
    return ('<div style="font-size:22px;letter-spacing:4px;color:#d9d2bd;font-weight:700">GIFT NIFTY</div>'
            '<div style="font-size:64px;font-weight:900;line-height:1">%s <span class="%s" style="font-size:36px">%s %s</span></div>'
            '<div style="font-size:26px;font-weight:600;margin-top:4px">Expected Nifty opening zone %s</div>'
            % (e(g["last"]), "up" if up else "dn", e(g["vs"]), "&#9650;" if up else "&#9660;", e(b["zone"])))


def p1(b, p, total, ph):
    bg = ('<div style="position:absolute;inset:0;background:linear-gradient(180deg,%s00 0%%,%s 100%%),url(%s) center/cover;opacity:.55"></div>' % (p["base"], p["base"], ph)) if ph else ""
    spark = chart(b.get("spark", []), b.get("proj"), p, 1080, 200).replace('height="200"', 'height="200" style="position:absolute;left:0;bottom:14px;opacity:.2"').replace('Today (est.)', '') if b.get("spark") else ""
    inner = ('<div style="position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;text-align:center">%s%s'
             '<img src="%s" style="width:360px;border-radius:26px;border:3px solid %s;box-shadow:0 24px 70px #000a;position:relative">'
             '<div class="brand" style="font-size:118px;position:relative">%s</div>'
             '<div style="position:relative;text-align:center">%s</div>'
             '<div style="width:420px;height:2px;background:%s;opacity:.6;position:relative"></div>'
             '<div style="font-size:64px;font-weight:900;line-height:1.05;position:relative">Morning<br>Breeze</div>'
             '<div style="font-size:34px;font-weight:700;color:#efe9d6;position:relative">for %s</div>'
             '<div style="position:relative"><span class="chip">%s</span></div>'
             '<div style="font-size:36px;font-weight:800;position:relative;max-width:900px">%s</div>'
             '<div style="font-size:24px;opacity:.75;position:relative">Tap the page to turn &rarr;</div></div>'
             % (bg, spark, brand.logo_original(), GOLD, e(brand.BRAND), brand.tagline_html(23, 5), GOLD, e(b["date_txt"]), e(b["label"].upper()),
                gift_cover(b)))
    return shell(p, inner, 1, total, "", cover=True)


def p2(b, p, total):
    snap = "".join('<tr><td><b>%s</b> <span class="small">%s</span></td><td class="r"><b>%s</b></td><td class="r">%s</td><td class="r">%s</td></tr>'
                   % (e(r["name"]), e(r.get("sub", "")), e(r["level"]), chg(r["pct"]), bar(r["pct"], p, 2.5)) for r in b["snapshot"])
    lv = "".join('<div class="card"><div style="display:flex;align-items:center;gap:18px"><div style="font-size:29px;font-weight:900;width:190px">%s</div>'
                 '<div style="flex:1"><div class="small">Support zone</div><div class="up" style="font-size:31px;font-weight:900;white-space:nowrap">%s</div></div>'
                 '<div style="flex:1"><div class="small">Resistance zone</div><div class="dn" style="font-size:31px;font-weight:900;white-space:nowrap">%s</div></div></div>'
                 '<div class="small" style="margin-top:6px;font-size:21px">%s</div></div>' % (e(l["name"]), e(l["s"]), e(l["r"]), e(l["note"])) for l in b["levels"][:2])
    yd = ""
    g = b.get("gift")
    gcard = ""
    if g:
        up = pc(g["vs"]) >= 0
        gcard = ('<div class="card" style="display:flex;align-items:center;gap:22px"><div><div class="small" style="letter-spacing:3px">GIFT NIFTY</div><div style="font-size:50px;font-weight:900;line-height:1.05">' + e(g["last"]) + '</div></div>'
                 '<div style="flex:1"><div style="font-size:30px;font-weight:800" class="' + ("up" if up else "dn") + '">' + e(g["vs"]) + ' vs Nifty close ' + ("&#9650;" if up else "&#9660;") + '</div>'
                 '<div class="small">' + ("Premium " if up else "Discount ") + e(g["premium"]) + ((" &middot; as of " + e(g["asof"])) if g.get("asof") else "") + '</div></div></div>')
    sp = b.get("spark", [])
    chart_html = ('<h2 class="s">Nifty 50 &mdash; last %d sessions &amp; today (est.)</h2>%s' % (len(sp), chart(sp, b.get("proj"), p, 988, 250))) if len(sp) > 2 else ""
    inner = ('<div><span class="chip">' + e(b["label"].upper()) + '</span></div>' + gcard +
             '<div style="font-size:50px;font-weight:900;line-height:1.08">' + e(b["headline"]) + '</div>'
             '<div style="font-size:26px;line-height:1.38;opacity:.95">' + e(b["open_text"]) + '</div>'
             '<h2 class="s">Market snapshot</h2><table>' + snap + '</table>' + chart_html +
             '<h2 class="s">Key technical levels to watch</h2><div style="display:flex;flex-direction:column;gap:12px">' + lv + '</div>')
    return shell(p, inner, 2, total, "Opening summary &middot; " + e(b["date_txt"]))


def p3(b, p, total):
    code = {"Dow Jones": "US", "S&P 500": "US", "Nasdaq Composite": "US", "FTSE 100": "UK", "DAX": "DE", "Nikkei 225": "JP", "Hang Seng": "HK", "Shanghai Composite": "CN", "Kospi": "KR"}
    bench = ""
    for r in b["bench"]:
        v = pc(r["pct"])
        col = p["up"] if v >= 0 else p["dn"]
        bench += ('<div style="display:flex;align-items:center;gap:14px;height:56px;border-radius:30px;padding:0 20px 0 8px;background:linear-gradient(90deg,%s55,%s15);border:1.5px solid #ffffff2a">'
                  '<span style="width:42px;height:42px;border-radius:50%%;background:#fff;color:#111;font-weight:900;font-size:17px;display:flex;align-items:center;justify-content:center">%s</span>'
                  '<span style="font-size:27px;font-weight:800;flex:1">%s</span><span style="font-size:27px;font-weight:700">%s</span><span style="width:210px;text-align:right;font-size:27px">%s</span></div>'
                  % (col, col, code.get(r["name"], ""), e(r["name"]), e(r["level"]), chg(r["pct"])))
    tiles = "".join('<div class="card" style="padding:12px 16px"><div class="small">%s</div><div style="font-size:35px;font-weight:900">%s</div><div style="font-size:25px">%s</div></div>'
                    % (e(t["name"]), e(t["level"]), chg(t["pct"])) for t in b["cmd"])
    v = b["vix"]
    inner = ('<h2 class="s">Global &amp; Asian equity markets</h2><div style="display:flex;flex-direction:column;gap:9px">%s</div>'
             '<h2 class="s">Commodities, currency &amp; bonds</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">%s</div>'
             '<h2 class="s">Volatility</h2><div class="card" style="display:flex;align-items:center;gap:24px">%s<div><div style="font-size:42px;font-weight:900">India VIX %s <span style="font-size:30px">%s</span></div>'
             '<div style="font-size:24px;line-height:1.35;opacity:.92;margin-top:4px">%s</div></div></div>'
             % (bench, tiles, gauge(v["gauge"], 240), e(v["level"]), chg(v["pct"]), e(v["text"])))
    return shell(p, inner, 3, total, "Global markets &middot; " + e(b["date_txt"]))


def p4(b, p, total):
    ev = "".join('<div style="font-size:25px;line-height:1.4;margin-top:6px">&bull; %s</div>' % e(x) for x in b["events"])
    wl = "".join('<tr><td><b>%s</b></td><td>%s</td><td class="small" style="font-size:22px">%s</td></tr>' % (e(r[0]), e(r[1]), e(r[2])) for r in b["watch"][:8]) or '<tr><td colspan="3">No specific triggers flagged for the open.</td></tr>'
    hd = "".join('<div style="font-size:24px;line-height:1.32;margin-top:9px">&bull; %s</div>' % e(x) for x in b["headlines"][:8])
    inner = ('<h2 class="s">Corporate action &amp; market alerts</h2><div class="card">%s</div>'
             '<h2 class="s">Stocks to watch</h2><div class="card" style="padding:6px 14px"><table>%s</table></div>'
             '<h2 class="s">Headlines to track</h2><div class="card">%s</div>' % (ev, wl, hd))
    return shell(p, inner, 4, total, "Alerts &amp; watchlist &middot; " + e(b["date_txt"]))


def _day_index(b):
    from datetime import datetime
    try:
        d = datetime.strptime(b.get("date_iso") or "", "%Y-%m-%d")
    except Exception:
        d = datetime.now()
    return d.toordinal()


def _data(name):
    import os
    return json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "lic", name)))


def _ul(items, color, size=27):
    return "".join('<div style="font-size:%dpx;line-height:1.35;margin-top:9px;display:flex;gap:12px"><span style="color:%s;font-weight:900">%s</span><span>%s</span></div>'
                   % (size, color, "&#10003;" if color == "#43e08a" else "&#9679;" if color == "#ffb454" else "!", e(x)) for x in items)


def p5(b, p, total):
    plans = _data("plans.json")
    pl = plans[_day_index(b) % len(plans)]
    inner = ('<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><span class="chip" style="background:#F7FF00">PLAN OF THE DAY</span><span class="chip" style="background:#4DEBFF">%s</span></div>'
             '<div style="font-size:60px;font-weight:900;line-height:1.1">%s</div>'
             '<div style="font-size:33px;opacity:.92;line-height:1.35">%s</div>'
             '<div style="display:flex;gap:12px"><div class="card" style="flex:1;padding:12px 16px"><div class="small">ENTRY AGE</div><div style="font-size:30px;font-weight:800">%s</div></div>'
             '<div class="card" style="flex:1;padding:12px 16px"><div class="small">TERM</div><div style="font-size:30px;font-weight:800">%s</div></div>'
             '<div class="card" style="flex:1;padding:12px 16px"><div class="small">TYPE</div><div style="font-size:24px;font-weight:800">%s</div></div></div>'
             '<div class="card" style="border-color:#F7FF0088"><div class="small" style="letter-spacing:1.4px">BEST FOR AGE GROUP</div><div style="font-size:40px;font-weight:900;color:#F7FF00">%s years</div></div>'
             '<h2 class="s" style="color:#43e08a">Advantages</h2><div>%s</div>'
             '<h2 class="s" style="color:#ffb454">Drawbacks</h2><div>%s</div>'
             '<div class="card" style="border:2.5px solid #ff6b6b;background:#ff6b6b22"><div style="font-size:32px;font-weight:900;color:#ff8f8f;letter-spacing:1.2px">WARNINGS</div>%s</div>'
             '<div style="font-size:30px;line-height:1.35;opacity:.95"><b style="color:#4DEBFF">Outlook:</b> %s</div>'
             '<div class="small" style="opacity:.7;font-size:23px">Check the latest brochure with LIC or your agent before buying. General information, not advice.</div>'
             % (e(pl["cat"].upper()), e(pl["name"]), e(pl["line"]), e(pl["entry"]), e(pl["term"]), e(pl["kind"]), e(pl["ages"]),
                _ul(pl["benefits"], "#43e08a", 34), _ul(pl["drawbacks"], "#ffb454", 33), _ul(pl["warnings"], "#ff8f8f", 32), e(pl["outlook"])))
    return shell(p, inner, 5, total, "Insurance &middot; Plan of the day")


GRADS = [("#ff2fa6", "#7b2cff", "#00e5ff"), ("#ff7a00", "#ffe600", "#ff2d55"), ("#00ff9d", "#0077ff", "#7b2cff"), ("#ff3d00", "#ff00c8", "#ffd400")]


def p6(b, p, total):
    """Last page: the Parents' Week promotion, the app's own A4 poster artwork (pipeline/branding/parents_week_a4.jpg) shown unchanged."""
    import base64
    import os
    img = os.path.join(os.path.dirname(os.path.abspath(__file__)), "branding", "parents_week_a4.jpg")
    d = "data:image/jpeg;base64," + base64.b64encode(open(img, "rb").read()).decode()
    inner = ('<div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding-bottom:10px">'
             '<img src="%s" style="max-width:100%%;max-height:100%%;border-radius:18px;box-shadow:0 20px 60px #000a"></div>' % d)
    return shell(p, inner, 6, total, "Joshi's Corner &middot; Restaurant")


PAGES = [p2, p3, p4, p5, p6]


def render(cfg, png_base):
    from playwright.sync_api import sync_playwright
    b = cfg["book"]
    p = PAL.get((b.get("mood") or {}).get("key", "neutral"), PAL["neutral"])
    total = 1 + len(PAGES)
    sc = float(cfg.get("mood_score") or 0) * 1.4
    pages = [p1(b, p, total, photo(cfg, sc))] + [f(b, p, total) for f in PAGES]
    outs = []
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        pg = br.new_page(viewport={"width": W, "height": H})
        for i, doc in enumerate(pages, 1):
            pg.set_content(doc, wait_until="load")
            try:
                pg.wait_for_load_state("networkidle", timeout=6000)
            except Exception:
                pass
            f = png_base[:-4] + "_%d.png" % i
            pg.screenshot(path=f)
            outs.append(f)
        br.close()
    return outs


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    print(render(json.load(open(a.config)), a.out))
