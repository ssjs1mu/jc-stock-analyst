#!/usr/bin/env python3
"""Morning Sunrise / Evening Breeze booklet: 4 phone pages (1080x1800) in smoky mood-coloured gradients, no cartoons.
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
    "bull": dict(base="#03160f", s1="#12b86a", s2="#0a8fb0", s3="#d99a0a", acc="#2ee59d", up="#34d399", dn="#fb7185", word="BULLISH TONE"),
    "bear": dict(base="#1a0509", s1="#d01c45", s2="#6d1fa8", s3="#e8691a", acc="#ff5c7a", up="#34d399", dn="#fb7185", word="CAUTIOUS TONE"),
    "neutral": dict(base="#070b24", s1="#3555d6", s2="#7c3aed", s3="#0ea5c4", acc="#7aa2ff", up="#34d399", dn="#fb7185", word="BALANCED TONE"),
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


CUR = [None]


def shell(p, inner, n, total, title, cover=False):
    n = CUR[0] or n
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


def eve_cover(b):
    r = (b.get("snapshot") or [{}])[0]
    if not r:
        return e(b.get("headline", ""))
    up = pc(r.get("pct", "0")) >= 0
    return ('<div style="font-size:22px;letter-spacing:4px;color:#d9d2bd;font-weight:700">NIFTY 50 CLOSE</div>'
            '<div style="font-size:64px;font-weight:900;line-height:1">%s <span class="%s" style="font-size:36px">%s %s</span></div>'
            '<div style="font-size:26px;font-weight:600;margin-top:4px">%s</div>'
            % (e(r["level"]), "up" if up else "dn", e(r["pct"]), "&#9650;" if up else "&#9660;", e(b.get("headline", ""))))


def _long_date(b):
    import datetime as _d
    try:
        return _d.datetime.strptime(b["date_iso"], "%Y-%m-%d").strftime("%A, %d %B %Y")
    except Exception:
        return b["date_txt"]


def _gen_now():
    import datetime as _d
    return _d.datetime.now(_d.timezone(_d.timedelta(hours=5, minutes=30))).strftime("%I:%M %p")


def p1(b, p, total, ph):
    # hero picture fills the top band at full width (16:9, nothing cropped), fading into the page colour
    hero = ('<div style="position:absolute;left:0;top:0;width:1080px;height:640px;background:url(%s) center/cover"></div>'
            '<div style="position:absolute;left:0;top:0;width:1080px;height:640px;background:linear-gradient(180deg,%s55 0%%,%s00 22%%,%s00 55%%,%s 100%%)"></div>' % (ph, p["base"], p["base"], p["base"], p["base"])) if ph else ""
    spark = chart(b.get("spark", []), b.get("proj"), p, 1080, 200).replace('height="200"', 'height="200" style="position:absolute;left:0;bottom:14px;opacity:.2"').replace('Today (est.)', '') if (b.get("spark") and not ph) else ""
    top = 560 if ph else 120
    inner = ('<div style="position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:18px;text-align:center;padding-top:%dpx">%s%s'
             '<img src="%s" style="width:230px;border-radius:22px;border:3px solid %s;box-shadow:0 20px 60px #000c;position:relative">'
             '<div class="brand" style="font-size:104px;position:relative;line-height:1.05">%s</div>'
             '<div style="position:relative;text-align:center">%s</div>'
             '<div style="width:420px;height:2px;background:%s;opacity:.6;position:relative"></div>'
             '<div style="font-size:84px;font-weight:900;line-height:1.04;white-space:nowrap;position:relative;text-shadow:0 4px 24px #000a;width:1040px;text-align:center">%s</div>'
             '<div style="font-size:36px;font-weight:700;color:#efe9d6;position:relative;text-align:center;width:100%%">for %s</div>'
             '<div style="font-size:26px;font-weight:600;color:#d9d2bd;position:relative">Report generated %s IST</div>'
             '<div style="position:relative"><span class="chip">%s</span></div>'
             '<div style="font-size:34px;font-weight:800;position:relative;max-width:920px">%s</div>'
             '<div style="font-size:24px;opacity:.75;position:relative;margin-top:auto;padding-bottom:6px">Tap the page to turn &rarr;</div></div>'
             % (top, hero, spark, brand.logo_original(), GOLD, e(brand.BRAND), brand.tagline_html(23, 5), GOLD, "Evening Breeze" if b.get("edition") == "evening" else "Morning Sunrise",
                e(_long_date(b)), e(b.get("gen") or _gen_now()), e(b["label"].upper()), eve_cover(b) if b.get("edition") == "evening" else gift_cover(b)))
    return shell(p, inner, 1, total, "", cover=True)


def _pts(r):
    """Points change, coloured like the percentage."""
    v = r.get("pts")
    if v is None:
        return ""
    return '<span class="%s" style="font-weight:700">%s</span>' % ("up" if float(v) >= 0 else "dn", e("{:+,.2f}".format(float(v))))


def p2(b, p, total):
    snap = "".join('<tr><td><b>%s</b> <span class="small">%s</span></td><td class="r"><b>%s</b></td><td class="r">%s</td><td class="r">%s</td></tr>'
                   % (e(r["name"]), e(r.get("sub", "")), e(r["level"]), _pts(r), chg(r["pct"])) for r in b["snapshot"])
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


SESS = {"Dow Jones": ("America/New_York", "09:30", "16:00"), "S&P 500": ("America/New_York", "09:30", "16:00"), "Nasdaq Composite": ("America/New_York", "09:30", "16:00"),
        "FTSE 100": ("Europe/London", "08:00", "16:30"), "DAX": ("Europe/Berlin", "09:00", "17:30"), "Nikkei 225": ("Asia/Tokyo", "09:00", "15:30"),
        "Hang Seng": ("Asia/Hong_Kong", "09:30", "16:00"), "Shanghai Composite": ("Asia/Shanghai", "09:30", "15:00"), "Kospi": ("Asia/Seoul", "09:00", "15:30")}


def sess_ist(name, iso):
    """Regular-session open-close in Indian time for the report date (follows daylight-saving changes). '' if unknown."""
    import datetime as _dt
    from zoneinfo import ZoneInfo
    s = SESS.get(name)
    if not s:
        return ""
    try:
        d = _dt.datetime.strptime(iso, "%Y-%m-%d").date()
        ist = ZoneInfo("Asia/Kolkata")
        t = []
        for hm in s[1:]:
            h, m = map(int, hm.split(":"))
            t.append(_dt.datetime(d.year, d.month, d.day, h, m, tzinfo=ZoneInfo(s[0])).astimezone(ist))
        nxt = " (+1)" if t[1].date() > t[0].date() else ""
        return "%s&ndash;%s%s" % (t[0].strftime("%H:%M"), t[1].strftime("%H:%M"), nxt)
    except Exception:
        return ""


DIAL_RANGE = {"Brent": 4.0, "WTI": 4.0, "Gold": 2.5, "USD": 0.8, "Dollar": 1.0, "US 10": 4.0}


def dial(frac, p, size=210):
    """Half-circle needle gauge: left = falling, right = rising, needle at the day's % change."""
    frac = min(1, max(0, frac))
    cx, cy, rr = 100, 100, 80
    paths = ""
    for k, a in enumerate((0, .25, .5, .75)):
        b_ = a + .25
        col = p["dn"] if a < .5 else p["up"]
        op = (.45, .85, .85, .45)[k] if False else (.95 if k in (0, 3) else .6)
        a0, a1 = math.pi * (1 - a), math.pi * (1 - b_)
        paths += '<path d="M%.1f %.1f A%d %d 0 0 1 %.1f %.1f" stroke="%s" stroke-opacity="%.2f" stroke-width="22" fill="none"/>' % (cx + rr * math.cos(a0), cy - rr * math.sin(a0), rr, rr, cx + rr * math.cos(a1), cy - rr * math.sin(a1), col, op)
    ang = math.pi * (1 - frac)
    return ('<svg viewBox="0 0 200 112" width="%d" height="%d">%s<line x1="100" y1="100" x2="%.1f" y2="%.1f" stroke="#fff" stroke-width="7" stroke-linecap="round"/><circle cx="100" cy="100" r="11" fill="#fff"/></svg>'
            % (size, size * .56, paths, cx + 62 * math.cos(ang), cy - 62 * math.sin(ang)))


def cmd_tiles(b, p, size=200):
    out = ""
    for t in b["cmd"]:
        v = pc(t["pct"])
        rng = next((x for k, x in DIAL_RANGE.items() if t["name"].startswith(k)), 3.0)
        out += ('<div class="card" style="padding:12px 10px 12px;text-align:center"><div class="small" style="font-weight:700;font-size:21px">%s</div>%s'
                '<div style="font-size:34px;font-weight:900;line-height:1.05">%s</div><div style="font-size:24px">%s</div></div>'
                % (e(t["name"]), dial(0.5 + v / (2 * rng), p, size), e(t["level"]), chg(t["pct"])))
    return out


def p3(b, p, total):
    code = {"Dow Jones": "US", "S&P 500": "US", "Nasdaq Composite": "US", "FTSE 100": "UK", "DAX": "DE", "Nikkei 225": "JP", "Hang Seng": "HK", "Shanghai Composite": "CN", "Kospi": "KR"}
    bench = ""
    for r in b["bench"]:
        v = pc(r["pct"])
        col = p["up"] if v >= 0 else p["dn"]
        bench += ('<div style="display:flex;align-items:center;gap:14px;height:56px;border-radius:30px;padding:0 20px 0 8px;background:linear-gradient(90deg,%s55,%s15);border:1.5px solid #ffffff2a">'
                  '<span style="width:42px;height:42px;border-radius:50%%;background:#fff;color:#111;font-weight:900;font-size:17px;display:flex;align-items:center;justify-content:center">%s</span>'
                  '<span style="font-size:27px;font-weight:800;flex:1;white-space:nowrap">%s</span><span style="font-size:21px;opacity:.85;white-space:nowrap">%s IST</span><span style="font-size:27px;font-weight:700;width:150px;text-align:right">%s</span><span style="width:185px;text-align:right;font-size:27px">%s</span></div>'
                  % (col, col, code.get(r["name"], ""), e(r["name"]), sess_ist(r["name"], b.get("date_iso") or ""), e(r["level"]), chg(r["pct"])))
    tiles = cmd_tiles(b, p)
    v = b["vix"]
    inner = ('<h2 class="s">Global &amp; Asian markets &middot; hours in IST</h2><div style="display:flex;flex-direction:column;gap:9px">%s</div>'
             '<h2 class="s">Commodities, currency &amp; bonds</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">%s</div>'
             % (bench, tiles)) if b.get("edition") == "evening" else (
            '<h2 class="s">Global &amp; Asian markets &middot; hours in IST</h2><div style="display:flex;flex-direction:column;gap:9px">%s</div>'
             '<h2 class="s">Commodities, currency &amp; bonds</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">%s</div>'
             '%s'
             % (bench, tiles, ('<h2 class="s">Volatility</h2><div class="card" style="display:flex;align-items:center;gap:24px">%s<div><div style="font-size:42px;font-weight:900">India VIX %s <span style="font-size:30px">%s</span></div>'
             '<div style="font-size:24px;line-height:1.35;opacity:.92;margin-top:4px">%s</div></div></div>'
             % (gauge(v["gauge"], 240), e(v["level"]), chg(v["pct"]), e(v["text"]))) if b.get("edition") != "evening" else ""))
    return shell(p, inner, 3, total, "Global markets &middot; " + e(b["date_txt"]))


def p4(b, p, total):
    ev = "".join('<div style="font-size:25px;line-height:1.4;margin-top:6px">&bull; %s</div>' % e(x) for x in b["events"])
    wl = "".join('<tr><td><b>%s</b></td><td>%s</td><td class="small" style="font-size:22px">%s</td></tr>' % (e(r[0]), e(r[1]), e(r[2])) for r in b["watch"][:8]) or '<tr><td colspan="3">No specific triggers flagged for the open.</td></tr>'
    hd = "".join('<div style="font-size:24px;line-height:1.32;margin-top:9px">&bull; %s</div>' % e(x) for x in b["headlines"][:8])
    fd, pr = b.get("flows"), b.get("pcr")
    def cell(nm, v):
        return '<div style="flex:1"><div class="small">%s</div><div class="%s" style="font-size:36px;font-weight:900">%+.0f Cr</div></div>' % (nm, "up" if v >= 0 else "dn", v)
    if pr:
        v_ = pr["pcr"]
        tone = "Bullish tilt (more puts written)" if v_ >= 1.1 else "Bearish tilt (more calls written)" if v_ <= 0.8 else "Balanced positioning"
        pcell = '<div style="flex:1"><div class="small">Nifty PCR (OI) &middot; %s expiry</div><div style="font-size:36px;font-weight:900">%.2f</div><div class="small" style="font-size:19px">%s</div></div>' % (e(pr["expiry"]), v_, tone)
    else:
        pcell = '<div style="flex:1"><div class="small">Nifty PCR (OI)</div><div style="font-size:36px;font-weight:900">n/a</div><div class="small" style="font-size:19px">option chain unavailable</div></div>'
    flcard = ('<h2 class="s">Institutional flows &amp; PCR%s</h2><div class="card" style="display:flex;gap:16px">%s%s%s</div>'
              % ((" &middot; " + e(fd["date"])) if fd else "", cell("FII / FPI net", fd["fii"]) if fd else "", cell("DII net", fd["dii"]) if fd else "", pcell)) if (fd or pr) else ""
    inner = (flcard + '<h2 class="s">Corporate action &amp; market alerts</h2><div class="card">%s</div>'
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
    pl = plans[(_day_index(b) + (3 if b.get('edition') == 'evening' else 0)) % len(plans)]
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


def e2(b, p, total):
    snap = "".join('<tr><td><b>%s</b> <span class="small">%s</span></td><td class="r"><b>%s</b></td><td class="r">%s</td><td class="r">%s</td></tr>'
                   % (e(r["name"]), e(r.get("sub", "")), e(r["level"]), _pts(r), chg(r["pct"])) for r in b["snapshot"])
    sp = b.get("spark", [])
    chart_html = ('<h2 class="s">Nifty 50 &mdash; last %d sessions</h2>%s' % (len(sp), chart(sp, None, p, 988, 250))) if len(sp) > 2 else ""
    fcard = ""
    br = b.get("breadth") or {}
    bcard = ""
    if br:
        tot = max(1, br["up"] + br["dn"])
        bcard = ('<h2 class="s">Nifty 50 breadth</h2><div class="card"><div style="display:flex;height:34px;border-radius:17px;overflow:hidden"><div style="width:%d%%;background:%s"></div><div style="width:%d%%;background:%s"></div></div>'
                 '<div style="display:flex;justify-content:space-between;font-size:27px;font-weight:800;margin-top:8px"><span class="up">%d advancing</span><span class="dn">%d declining</span></div></div>'
                 % (round(br["up"] * 100 / tot), p["up"], 100 - round(br["up"] * 100 / tot), p["dn"], br["up"], br["dn"]))
    v = b["vix"]
    vcard = ('<h2 class="s">India VIX &mdash; the market\'s fear gauge</h2><div class="card" style="display:flex;align-items:center;gap:24px">%s<div><div style="font-size:44px;font-weight:900">India VIX %s <span style="font-size:30px">%s</span></div>'
             '<div style="font-size:24px;line-height:1.35;opacity:.92;margin-top:4px">%s</div></div></div>' % (gauge(v["gauge"], 220), e(v["level"]), chg(v["pct"]), e(v["text"])))
    story = "".join('<div style="font-size:26px;line-height:1.4;margin-top:8px">%s</div>' % e(x) for x in b.get("story", [])) or '<div style="font-size:26px">%s</div>' % e(b["summary"])
    inner = ('<div><span class="chip">' + e(b["label"].upper()) + '</span></div>'
             '<div style="font-size:50px;font-weight:900;line-height:1.08">' + e(b["headline"]) + '</div>'
             '<h2 class="s">How the session unfolded</h2><div class="card">' + story + '</div>'
             '<h2 class="s">Closing snapshot</h2><table>' + snap + '</table>' + chart_html + vcard + fcard + bcard)
    return shell(p, inner, 2, total, "Market close &middot; " + e(b["date_txt"]))


def _tbl(b, p, rows, vol=False):
    out = ""
    for r in rows:
        out += ('<tr><td><b>%s</b></td><td class="r">%s</td>%s<td class="r">%s</td></tr>'
                % (e(r[0]), e(r[1]), ('<td class="r small">%s</td>' % e(r[2])) if vol else "", chg(r[-1])))
    return out


def e3(b, p, total):
    g, l = b["gainers"], b["losers"]
    n = max(len(g), len(l))
    rows = ""
    for i in range(n):
        def cell(r):
            return ('<td><b>%s</b></td><td class="r">%s</td><td class="r">%s</td>' % (e(r[0]), e(r[1]), chg(r[-1]))) if r else '<td></td><td></td><td></td>'
        rows += "<tr>%s<td style=\"width:26px\"></td>%s</tr>" % (cell(g[i] if i < len(g) else None), cell(l[i] if i < len(l) else None))
    head = ('<tr><th colspan="3" style="color:%s;text-align:left">TOP GAINERS</th><th></th><th colspan="3" style="color:%s;text-align:left">TOP LOSERS</th></tr>' % (p["up"], p["dn"]))
    pvu, pvd = _tbl(b, p, b.get("pv_up", []), True), _tbl(b, p, b.get("pv_dn", []), True)
    sw = _tbl(b, p, [[r[0], r[1], "range " + r[2], r[3]] for r in b.get("vol_movers", [])], True)
    inner = ('<h2 class="s">Gainers &amp; losers &middot; Nifty 50</h2><div class="card" style="padding:6px 14px"><table>%s%s</table></div>'
             '<h2 class="s">Price + volume together &middot; a 1%%+ move on above-average volume</h2><div class="card" style="padding:6px 14px"><table>%s%s</table></div>'
             '<h2 class="s">Volatility movers &middot; widest intraday swings</h2><div class="card" style="padding:6px 14px"><table>%s</table></div>'
             '<h2 class="s">Volume shockers &middot; 1.5x average volume or more</h2><div class="card" style="padding:6px 14px"><table>%s</table></div>'
             '<div class="small" style="opacity:.8;font-size:21px">Range = day high minus day low as a share of the last price.</div>'
             % (head, rows, pvu or '<tr><td>No Nifty 50 stock rose 1%+ on above-average volume.</td></tr>', pvd or '<tr><td>No Nifty 50 stock fell 1%+ on above-average volume.</td></tr>',
                sw or '<tr><td>Intraday range data not available.</td></tr>',
                _tbl(b, p, b.get("shock", []), True) or '<tr><td>No Nifty 50 stock traded at 1.5x or more of its 20-day average volume.</td></tr>'))
    return shell(p, inner, 3, total, "Movers &amp; shakers &middot; " + e(b["date_txt"]))


def e5(b, p, total):
    lv = "".join('<div class="card"><div style="display:flex;align-items:center;gap:18px"><div style="font-size:29px;font-weight:900;width:190px">%s</div>'
                 '<div style="flex:1"><div class="small">Support zone</div><div class="up" style="font-size:31px;font-weight:900;white-space:nowrap">%s</div></div>'
                 '<div style="flex:1"><div class="small">Resistance zone</div><div class="dn" style="font-size:31px;font-weight:900;white-space:nowrap">%s</div></div></div>'
                 '<div class="small" style="margin-top:6px;font-size:21px">%s</div></div>' % (e(l["name"]), e(l["s"]), e(l["r"]), e(l["note"])) for l in b["levels"][:2])
    ev = "".join('<div style="font-size:26px;line-height:1.4;margin-top:7px">&bull; %s</div>' % e(x) for x in b["events"])
    hd = "".join('<div style="font-size:25px;line-height:1.34;margin-top:10px">&bull; %s</div>' % e(x) for x in b["headlines"][:8])
    inner = ('<h2 class="s">Key levels for the next session</h2><div style="display:flex;flex-direction:column;gap:12px">%s</div>'
             '<h2 class="s">Coming up</h2><div class="card">%s</div>'
             '<h2 class="s">Headlines to track</h2><div class="card">%s</div>'
             '<div class="small" style="opacity:.75">Levels are classic pivot points from today\'s high, low and close, not a recommendation.</div>' % (lv, ev, hd))
    return shell(p, inner, 5, total, "Tomorrow &middot; " + e(b["date_txt"]))


def e4(b, p, total):
    """Global markets, commodities, currencies, bonds and volatility as of the build time."""
    pg = p3(b, p, total)
    return pg.replace("Global markets &middot; " + e(b["date_txt"]), "Global markets as of " + e(b.get("asof", "now")) + " &middot; " + e(b["date_txt"]))


def e_news(b, p, total):
    tags = (("rbi", "RBI"), ("fed", "FED"), ("crude", "CRUDE"), ("oil", "CRUDE"), ("rupee", "RUPEE"), ("fii", "FLOWS"), ("fpi", "FLOWS"), ("bank", "BANKS"), ("earn", "RESULTS"), ("profit", "RESULTS"),
            ("nifty", "INDEX"), ("sensex", "INDEX"), ("wall street", "GLOBAL"), ("nasdaq", "GLOBAL"), ("china", "GLOBAL"), ("gold", "GOLD"))
    def tag(t):
        lo = t.lower()
        for k, v in tags:
            if k in lo:
                return v
        return "MARKETS"
    hd = "".join('<div style="display:flex;gap:14px;align-items:flex-start;margin-top:14px"><span class="chip" style="flex:none;font-size:17px;padding:5px 12px">%s</span><div style="font-size:27px;line-height:1.32;font-weight:600">%s</div></div>' % (tag(x), e(x))
                 for x in b["headlines"][:8])
    rk = "".join('<div style="font-size:26px;line-height:1.38;margin-top:11px">&#9888;&#65039; %s</div>' % e(x) for x in b.get("risks", [])) or '<div style="font-size:26px">No specific overnight risks flagged.</div>'
    inner = ('<h2 class="s">News riding the markets</h2><div class="card">%s</div>'
             '<h2 class="s">Overnight risks until the next trading session</h2><div class="card">%s</div>'
             '<div class="small" style="opacity:.8;font-size:21px">Headlines that moved or can move prices; tags show the theme. For information only, not advice.</div>' % (hd, rk))
    return shell(p, inner, 5, total, "News &middot; " + e(b["date_txt"]))


def e_open(b, p, total):
    o = b["opening"]
    g = o.get("gift")
    gcard = ""
    if g:
        up = pc(g["vs"]) >= 0
        gcard = ('<div class="card" style="display:flex;align-items:center;gap:22px"><div><div class="small" style="letter-spacing:3px">GIFT NIFTY</div><div style="font-size:50px;font-weight:900;line-height:1.05">%s</div></div>'
                 '<div style="flex:1"><div style="font-size:30px;font-weight:800" class="%s">%s vs Nifty close %s</div><div class="small">%s %s%s</div></div></div>'
                 % (e(g["last"]), "up" if up else "dn", e(g["vs"]), "&#9650;" if up else "&#9660;", "Premium" if up else "Discount", e(g["premium"]), (" &middot; as of " + e(g["asof"])) if g.get("asof") else ""))
    dr = "".join('<div style="font-size:25px;line-height:1.38;margin-top:8px">&bull; %s</div>' % e(x) for x in o.get("drivers", []))
    lv = "".join('<div class="card"><div style="display:flex;align-items:center;gap:18px"><div style="font-size:29px;font-weight:900;width:190px">%s</div>'
                 '<div style="flex:1"><div class="small">Support zone</div><div class="up" style="font-size:31px;font-weight:900;white-space:nowrap">%s</div></div>'
                 '<div style="flex:1"><div class="small">Resistance zone</div><div class="dn" style="font-size:31px;font-weight:900;white-space:nowrap">%s</div></div></div></div>' % (e(l["name"]), e(l["s"]), e(l["r"])) for l in b["levels"][:2])
    ev = "".join('<div style="font-size:25px;line-height:1.4;margin-top:6px">&bull; %s</div>' % e(x) for x in b["events"])
    nd = b.get("nextday") or {}
    def line(t):
        return '<div style="font-size:24px;line-height:1.38;margin-top:6px">%s</div>' % t
    ca = nd.get("actions")
    if ca is None:
        cat = line("Ex-date list could not be fetched at build time.")
    elif not ca:
        cat = line("No dividend, split or bonus ex-dates listed for this session.")
    else:
        cat = "".join(line("<b>%s</b> &middot; %s" % (e(x["sym"]), e(x["what"]))) for x in ca[:6]) + (line("+ %d more" % (len(ca) - 6)) if len(ca) > 6 else "")
    rs = nd.get("results") or []
    rt = line("<b>Results due (%d):</b> %s%s" % (nd.get("results_n", 0), e(", ".join(rs)), " and more" if nd.get("results_n", 0) > len(rs) else "")) if rs else line("No board meetings with financial results listed for this session.")
    dd = nd.get("due")
    if dd is None:
        ddt = line("Economic calendar could not be fetched at build time.")
    elif not dd:
        ddt = line("No major scheduled releases listed for this session.")
    else:
        ddt = "".join(line("<b>%s IST</b> &middot; %s &middot; %s%s%s" % (e(x["t"]), e(x["ccy"]), e(x["title"]), (" (forecast %s)" % e(x["fc"])) if x["fc"] else "", " &#9733;" if x["hi"] else "")) for x in dd[:7])
    nxtbox = ('<h2 class="s">Corporate actions on %s</h2><div class="card">%s%s</div>'
              '<h2 class="s">Data due</h2><div class="card">%s</div>' % (e(o["next"].split(",")[0]), cat, rt, ddt))
    inner = ('<div><span class="chip">EXPECTED OPENING &middot; %s</span></div>'
             '<div style="font-size:50px;font-weight:900;line-height:1.08">%s</div>'
             '<div style="font-size:34px;font-weight:800">Nifty 50 opening zone <span class="%s">%s</span></div>%s'
             '<h2 class="s">What shapes the opening</h2><div class="card">%s</div>'
             '<h2 class="s">Key levels for the next session</h2><div style="display:flex;flex-direction:column;gap:12px">%s</div>'
             '<h2 class="s">Coming up</h2><div class="card">%s</div>%s'
             '<div class="small" style="opacity:.75;font-size:21px">Indicative, %s. Levels are classic pivot points from today\'s high, low and close, not a recommendation.</div>'
             % (e(o["next"].upper()), e(o["headline"]), "up" if o["mood"] == "bull" else "dn" if o["mood"] == "bear" else "", e(o["zone"] or "n/a"), gcard, dr or "Overnight cues are mixed.", lv, ev, nxtbox,
                "anchored on GIFT Nifty" if o.get("anchored") else "from global cues as of this evening; GIFT Nifty was not available at build time"))
    return shell(p, inner, 6, total, "Next session &middot; " + e(b["date_txt"]))


PAGES = [p2, p3, p4, p5, p6]


def render(cfg, png_base):
    from playwright.sync_api import sync_playwright
    b = cfg["book"]
    p = PAL.get((b.get("mood") or {}).get("key", "neutral"), PAL["neutral"])
    evening = b.get("edition") == "evening"
    pagelist = [e2, e3, e4, e_news, e_open, p5, p6] if evening else PAGES
    total = 1 + len(pagelist)
    sc = float(cfg.get("mood_score") or 0) * 1.4
    try:
        import render_pulse_board as _r
        _r.PIC[0] = cfg.get("mood_pic")
    except Exception:
        pass
    pages = [p1(b, p, total, photo(cfg, sc))]
    for k, f in enumerate(pagelist):
        CUR[0] = k + 2
        pages.append(f(b, p, total))
    CUR[0] = None
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
