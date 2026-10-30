#!/usr/bin/env python3
"""Morning Pulse infographic (landscape 2000x1116) -> PNG + PDF. Daily-varying design: 3 layouts x 10 themes picked from the date and the day's mood.

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
import sys
sys.path.insert(0, HERE)
import brand
W, H = 2000, 1116
BAR = ["#1f6fa8", "#d6336c", "#1b9a77", "#2b5f9e", "#f2711c", "#2a9d8f", "#c2255c", "#e8590c", "#3b6fb6"]


def e(x):
    return html.escape(str(x), quote=True)


def logo():
    return brand.logo_original()


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



# ---------------------------------------------------------------- daily design system
THEMES = {
    "bull": [
        dict(name="Emerald Gold", bg="linear-gradient(135deg,#04241d,#0b4a3a 55%,#0d3b30)", ink="#eafff6", mut="#9fd9c3", card="rgba(255,255,255,.07)", cardb="rgba(255,215,120,.35)", acc="#f5c451", acc2="#34d399", up="#4ade80", dn="#fb7185", upbg="rgba(74,222,128,.16)", dnbg="rgba(251,113,133,.16)", top="#031a15", topink="#f5c451", panel="rgba(0,0,0,.28)", deco="rings", bars=["#10b981", "#f5c451", "#14b8a6", "#84cc16", "#22c55e", "#eab308", "#06b6d4", "#16a34a", "#fbbf24"]),
        dict(name="Aurora", bg="linear-gradient(135deg,#071a3a,#0a3d62 50%,#0f5c63)", ink="#effcff", mut="#9ccbe0", card="rgba(255,255,255,.08)", cardb="rgba(120,255,230,.35)", acc="#5eead4", acc2="#a3e635", up="#86efac", dn="#fda4af", upbg="rgba(134,239,172,.16)", dnbg="rgba(253,164,175,.16)", top="#06122b", topink="#5eead4", panel="rgba(2,12,40,.45)", deco="glow", bars=["#0ea5e9", "#14b8a6", "#6366f1", "#22d3ee", "#10b981", "#8b5cf6", "#06b6d4", "#38bdf8", "#34d399"]),
        dict(name="Sunrise Saffron", bg="linear-gradient(135deg,#fff7e6,#ffe9c2 55%,#ffd9a0)", ink="#3a2200", mut="#8a5a1a", card="rgba(255,255,255,.75)", cardb="rgba(214,120,20,.35)", acc="#e8590c", acc2="#15803d", up="#15803d", dn="#c2255c", upbg="#dcf7e3", dnbg="#fde2e7", top="#7a3b00", topink="#fff3da", panel="rgba(255,255,255,.72)", deco="sun", bars=["#b45309", "#15803d", "#c2410c", "#0f766e", "#a16207", "#166534", "#9a3412", "#4d7c0f", "#b91c1c"]),
    ],
    "bear": [
        dict(name="Crimson Dusk", bg="linear-gradient(135deg,#25040f,#4a0d24 55%,#2d0a1e)", ink="#fff0f3", mut="#e5a3b4", card="rgba(255,255,255,.07)", cardb="rgba(255,150,160,.35)", acc="#ffb347", acc2="#ff6b81", up="#6ee7b7", dn="#ff7a90", upbg="rgba(110,231,183,.15)", dnbg="rgba(255,122,144,.18)", top="#1a0209", topink="#ffb347", panel="rgba(0,0,0,.32)", deco="rings", bars=["#e11d48", "#f97316", "#be185d", "#fb923c", "#9f1239", "#f59e0b", "#db2777", "#ea580c", "#dc2626"]),
        dict(name="Ember Slate", bg="linear-gradient(135deg,#14181f,#232b38 55%,#1a1f29)", ink="#f4f6fa", mut="#a7b2c4", card="rgba(255,255,255,.06)", cardb="rgba(255,140,60,.40)", acc="#ff8a3d", acc2="#ffd166", up="#5eead4", dn="#ff6b6b", upbg="rgba(94,234,212,.14)", dnbg="rgba(255,107,107,.18)", top="#0b0e13", topink="#ff8a3d", panel="rgba(0,0,0,.35)", deco="stripes", bars=["#f97316", "#ef4444", "#f59e0b", "#e11d48", "#fb923c", "#dc2626", "#eab308", "#c2410c", "#ea580c"]),
        dict(name="Storm Violet", bg="linear-gradient(135deg,#1a1033,#2c1a52 55%,#1d1240)", ink="#f6f0ff", mut="#baa7e0", card="rgba(255,255,255,.07)", cardb="rgba(190,150,255,.38)", acc="#ff9ecb", acc2="#c4b5fd", up="#86efac", dn="#ff8fa3", upbg="rgba(134,239,172,.15)", dnbg="rgba(255,143,163,.18)", top="#0f0a22", topink="#ff9ecb", panel="rgba(0,0,0,.30)", deco="glow", bars=["#8b5cf6", "#ec4899", "#6366f1", "#f43f5e", "#a855f7", "#d946ef", "#7c3aed", "#f472b6", "#9333ea"]),
    ],
    "neutral": [
        dict(name="Midnight Royal", bg="linear-gradient(135deg,#0a1a3a,#12306b 55%,#0e2556)", ink="#f1f6ff", mut="#9fb4d8", card="rgba(255,255,255,.07)", cardb="rgba(245,196,81,.35)", acc="#f5c451", acc2="#7dd3fc", up="#4ade80", dn="#fb7185", upbg="rgba(74,222,128,.16)", dnbg="rgba(251,113,133,.17)", top="#071230", topink="#f5c451", panel="rgba(0,0,0,.28)", deco="rings", bars=["#2563eb", "#f5c451", "#0ea5e9", "#6366f1", "#14b8a6", "#f59e0b", "#3b82f6", "#8b5cf6", "#06b6d4"]),
        dict(name="Ocean Neon", bg="linear-gradient(135deg,#031b34,#06406b 50%,#082a4d)", ink="#eefaff", mut="#8fc3e0", card="rgba(255,255,255,.07)", cardb="rgba(34,211,238,.40)", acc="#22d3ee", acc2="#f472b6", up="#34d399", dn="#fb7185", upbg="rgba(52,211,153,.16)", dnbg="rgba(251,113,133,.17)", top="#021325", topink="#22d3ee", panel="rgba(0,10,30,.45)", deco="glow", bars=["#06b6d4", "#ec4899", "#3b82f6", "#14b8a6", "#8b5cf6", "#0ea5e9", "#f472b6", "#2dd4bf", "#6366f1"]),
        dict(name="Indigo Pearl", bg="linear-gradient(135deg,#f3f1ff,#e4e8ff 55%,#eef3ff)", ink="#1b1f4a", mut="#5a6190", card="rgba(255,255,255,.85)", cardb="rgba(99,102,241,.30)", acc="#4f46e5", acc2="#db2777", up="#047857", dn="#be123c", upbg="#d9f7e8", dnbg="#fde2e8", top="#1b1f4a", topink="#ffffff", panel="rgba(255,255,255,.85)", deco="dots", bars=["#4f46e5", "#db2777", "#0891b2", "#7c3aed", "#059669", "#d97706", "#2563eb", "#c026d3", "#0d9488"]),
        dict(name="Teal Copper", bg="linear-gradient(135deg,#06262b,#0b4b52 55%,#0a353c)", ink="#effffd", mut="#9bd0cd", card="rgba(255,255,255,.07)", cardb="rgba(255,160,100,.38)", acc="#ffa566", acc2="#5eead4", up="#5eead4", dn="#ff8a80", upbg="rgba(94,234,212,.16)", dnbg="rgba(255,138,128,.17)", top="#041a1e", topink="#ffa566", panel="rgba(0,0,0,.28)", deco="stripes", bars=["#14b8a6", "#f97316", "#0ea5e9", "#f59e0b", "#10b981", "#fb923c", "#06b6d4", "#d97706", "#22c55e"]),
    ],
}

THEMES["bull"] += [
    dict(name="Neon Lime", bg="linear-gradient(135deg,#050b05,#0c2410 55%,#0a1a0c)", ink="#f3fff0", mut="#a8d8a0", card="rgba(190,255,60,.07)", cardb="rgba(190,255,60,.55)", acc="#b6ff2e", acc2="#00f5d4", up="#7dff6a", dn="#ff5d8f", upbg="rgba(125,255,106,.16)", dnbg="rgba(255,93,143,.18)", top="#020602", topink="#b6ff2e", panel="rgba(0,0,0,.40)", deco="glow", bars=["#76e600", "#00e5c0", "#c6f600", "#00d084", "#a3ff12", "#14f1d9", "#5be300", "#00bfa5", "#d4ff3a"]),
    dict(name="Electric Blue", bg="linear-gradient(135deg,#02102e,#0437a8 55%,#062a7a)", ink="#f0f6ff", mut="#a9c4f5", card="rgba(255,255,255,.08)", cardb="rgba(0,229,255,.55)", acc="#00e5ff", acc2="#ffe14d", up="#5dffb0", dn="#ff7a9c", upbg="rgba(93,255,176,.16)", dnbg="rgba(255,122,156,.18)", top="#010a20", topink="#00e5ff", panel="rgba(0,6,30,.45)", deco="glow", bars=["#1e6bff", "#00c2ff", "#6a5cff", "#00e0c6", "#2f8bff", "#8a6bff", "#00a8ff", "#3dd9ff", "#4f7dff"]),
]
THEMES["bear"] += [
    dict(name="Purple Haze", bg="linear-gradient(135deg,#150528,#3b0f6b 55%,#26094a)", ink="#fbf3ff", mut="#d0a8f0", card="rgba(255,255,255,.08)", cardb="rgba(255,70,220,.55)", acc="#ff4de0", acc2="#ffd84d", up="#6bffc4", dn="#ff6f91", upbg="rgba(107,255,196,.15)", dnbg="rgba(255,111,145,.20)", top="#0d0220", topink="#ff4de0", panel="rgba(10,0,30,.45)", deco="glow", bars=["#a21cff", "#ff2bd6", "#6d28d9", "#ff5fa2", "#c026d3", "#7c3aed", "#f43f9e", "#9333ea", "#e11d9b"]),
    dict(name="Neon Magenta", bg="linear-gradient(135deg,#1a0212,#52052f 55%,#33031f)", ink="#fff0f8", mut="#f0a3cc", card="rgba(255,255,255,.07)", cardb="rgba(0,255,230,.50)", acc="#00ffe0", acc2="#ff3db2", up="#6bffc4", dn="#ff5fa2", upbg="rgba(107,255,196,.15)", dnbg="rgba(255,95,162,.20)", top="#100008", topink="#00ffe0", panel="rgba(0,0,0,.38)", deco="stripes", bars=["#ff1f9c", "#00e5cc", "#d6006f", "#00c8b4", "#ff4db8", "#00f0d6", "#b80062", "#12d8c0", "#ff7ad0"]),
]
THEMES["neutral"] += [
    dict(name="Electric Violet", bg="linear-gradient(135deg,#0b0630,#2a12a0 55%,#1b0d78)", ink="#f4f1ff", mut="#b9aef5", card="rgba(255,255,255,.08)", cardb="rgba(120,255,240,.50)", acc="#7dfff0", acc2="#ff9bf0", up="#6bffc4", dn="#ff7a9c", upbg="rgba(107,255,196,.16)", dnbg="rgba(255,122,156,.18)", top="#060320", topink="#7dfff0", panel="rgba(5,0,40,.45)", deco="glow", bars=["#5b3dff", "#00d8c8", "#8a4dff", "#ff6bd8", "#3d6bff", "#b36bff", "#00bfe8", "#d44dff", "#2fd6ff"]),
    dict(name="Cyber Cyan", bg="linear-gradient(135deg,#02161a,#05424d 55%,#032d36)", ink="#effffe", mut="#97d9e0", card="rgba(255,255,255,.07)", cardb="rgba(255,60,200,.50)", acc="#2dffe8", acc2="#ff3cc8", up="#5dffb0", dn="#ff6f91", upbg="rgba(93,255,176,.16)", dnbg="rgba(255,111,145,.19)", top="#010c0f", topink="#2dffe8", panel="rgba(0,0,0,.38)", deco="rings", bars=["#00d9c0", "#ff2bb8", "#00a8c8", "#ff6bd0", "#00f0d0", "#c020a0", "#00b8e0", "#ff4dc4", "#14e8c8"]),
]
LAYOUTS = ["board", "hero", "magazine"]


def fnum(p):
    try:
        return float(str(p).replace("%", "").replace("+", "").replace(",", ""))
    except Exception:
        return None


def mood_of(c):
    """-> ('bull'|'bear'|'neutral', score -3..3) from the config's own numbers only"""
    vals = [fnum(b.get("pct")) for b in c.get("bench", [])]
    vals = [v for v in vals if v is not None]
    nif = None
    for t in c.get("tiles", []):
        if "nifty" in str(t.get("name", "")).lower():
            nif = fnum(t.get("pct"))
            break
    avg = sum(vals) / len(vals) if vals else 0.0
    sc = (nif if nif is not None else avg) * 0.6 + avg * 0.4
    if c.get("mood_score") is not None:          # morning reports: mood = expected opening, not the past session
        sc = float(c["mood_score"]) * 1.4
    return ("bull" if sc > 0.35 else ("bear" if sc < -0.35 else "neutral")), sc


def pick_design(c, force_layout=None, force_theme=None):
    mood, sc = mood_of(c)
    import datetime as _dt, re as _re
    d = None
    for src in (c.get("date"), c.get("report_date"), c.get("title"), c.get("footnote")):
        m = _re.search(r"(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})", str(src or ""))
        if m:
            try:
                d = _dt.datetime.strptime("%s %s %s" % m.groups(), "%d %b %Y").toordinal()
                break
            except Exception:
                pass
    if d is None:
        d = _dt.date.today().toordinal()
    lay = LAYOUTS[d % 3] if force_layout is None else force_layout
    lst = THEMES[mood]
    th = lst[(d // 3 + d) % len(lst)] if force_theme is None else force_theme
    return mood, sc, lay, th


def css_vars(t):
    return ";".join("--%s:%s" % (k, v) for k, v in t.items() if k not in ("name", "bars", "deco"))


def deco_css(t):
    d = t.get("deco")
    if d == "rings":
        return "background-image:radial-gradient(circle at 92% 8%,transparent 0 120px,rgba(255,255,255,.05) 121px 124px,transparent 125px 190px,rgba(255,255,255,.04) 191px 194px,transparent 195px),radial-gradient(circle at 4% 96%,rgba(255,255,255,.05) 0 3px,transparent 4px);background-size:auto,34px 34px"
    if d == "glow":
        return "background-image:radial-gradient(900px 500px at 85% -10%,rgba(94,234,212,.20),transparent 60%),radial-gradient(700px 420px at 0% 100%,rgba(167,139,250,.18),transparent 60%)"
    if d == "sun":
        return "background-image:radial-gradient(700px 520px at 95% -8%,rgba(255,170,60,.45),transparent 62%),radial-gradient(420px 300px at 0% 100%,rgba(34,160,90,.18),transparent 70%)"
    if d == "stripes":
        return "background-image:repeating-linear-gradient(115deg,rgba(255,255,255,.035) 0 2px,transparent 2px 26px)"
    if d == "dots":
        return "background-image:radial-gradient(rgba(79,70,229,.14) 2px,transparent 2.5px);background-size:30px 30px"
    return ""


def gauge2(frac, size=150, ink="#fff"):
    frac = min(1, max(0, frac))
    cx, cy, r = 100, 100, 80
    segs = [("#ef476f", 0, .25), ("#f78c40", .25, .5), ("#ffd166", .5, .7), ("#06d6a0", .7, 1)]
    paths = ""
    for c, a, b in segs:
        a0, a1 = math.pi * (1 - a), math.pi * (1 - b)
        paths += '<path d="M%.1f %.1f A%d %d 0 0 1 %.1f %.1f" stroke="%s" stroke-width="22" fill="none"/>' % (
            cx + r * math.cos(a0), cy - r * math.sin(a0), r, r, cx + r * math.cos(a1), cy - r * math.sin(a1), c)
    ang = math.pi * (1 - frac)
    return ('<svg viewBox="0 0 200 118" width="%d" height="%d">%s<line x1="100" y1="100" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="7" '
            'stroke-linecap="round"/><circle cx="100" cy="100" r="11" fill="%s"/></svg>' % (size, size * .59, paths, cx + 62 * math.cos(ang), cy - 62 * math.sin(ang), ink, ink))


def spark2(vals, t, w=470, h=230, proj=None, proj_label="Today (est.)"):
    vals = [v for v in vals if isinstance(v, (int, float))]
    if len(vals) < 3:
        return ""
    allv = vals + ([proj] if isinstance(proj, (int, float)) else [])
    lo, hi = min(allv), max(allv)
    rng = (hi - lo) or 1
    n = len(allv)
    pts = [(10 + i * (w - 20) / (n - 1), h - 20 - (v - lo) / rng * (h - 60)) for i, v in enumerate(allv)]
    hist = pts[:len(vals)]
    bars = ""
    for i, (x, y) in enumerate(hist):
        cc = t["up"] if i == 0 or vals[i] >= vals[i - 1] else t["dn"]
        bars += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="3" fill="%s" opacity=".80"/>' % (x - (w / n) * .3, y, (w / n) * .6, h - 20 - y, cc)
    line = " ".join("%.1f,%.1f" % p for p in hist)
    ax, ay = hist[-1]
    extra = ""
    if len(pts) > len(vals):
        px, py = pts[-1]
        cc = t["up"] if proj >= vals[-1] else t["dn"]
        extra = ('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="4" stroke-dasharray="8 7" stroke-linecap="round"/>'
                 '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="3" fill="%s" fill-opacity=".22" stroke="%s" stroke-width="3" stroke-dasharray="6 5"/>'
                 '<text x="%.1f" y="%.1f" text-anchor="end" font-size="%d" font-weight="700" fill="%s">%s</text>'
                 % (ax, ay, px, py, t["acc"], px - (w / n) * .3, py, (w / n) * .6, h - 20 - py, cc, cc,
                    px + (w / n) * .3, max(18, py - 40), max(18, int(h * .12)), t["ink"], proj_label))
    return ('<svg viewBox="0 0 %d %d" width="100%%" height="%d" preserveAspectRatio="xMidYMid meet">%s<polyline points="%s" fill="none" stroke="%s" stroke-width="5" '
            'stroke-linejoin="round" stroke-linecap="round"/><circle cx="%.1f" cy="%.1f" r="9" fill="%s" stroke="%s" stroke-width="3"/>%s</svg>' % (w, h, h, bars, line, t["acc"], ax, ay, t["acc2"], t["ink"], extra))


def icon(name, t):
    a, b = t["acc"], t["acc2"]
    I = {
        "cal": '<svg viewBox="0 0 64 64" width="88" height="88"><rect x="6" y="12" width="52" height="46" rx="9" fill="none" stroke="%s" stroke-width="4"/><rect x="6" y="12" width="52" height="16" rx="9" fill="%s"/><g fill="%s"><rect x="14" y="34" width="8" height="6" rx="2"/><rect x="28" y="34" width="8" height="6" rx="2"/><rect x="42" y="34" width="8" height="6" rx="2"/><rect x="14" y="45" width="8" height="6" rx="2"/><rect x="28" y="45" width="8" height="6" rx="2"/></g></svg>' % (b, a, b),
        "list": '<svg viewBox="0 0 64 64" width="88" height="88"><rect x="10" y="8" width="44" height="52" rx="8" fill="none" stroke="%s" stroke-width="4"/><g stroke="%s" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17 24l4 4 7-8"/><path d="M17 40l4 4 7-8"/></g><g stroke="%s" stroke-width="4" stroke-linecap="round"><path d="M34 25h14"/><path d="M34 41h14"/></g></svg>' % (b, a, b),
        "chart": '<svg viewBox="0 0 64 64" width="88" height="88"><rect x="6" y="8" width="52" height="48" rx="9" fill="none" stroke="%s" stroke-width="4"/><rect x="15" y="34" width="8" height="15" rx="2" fill="%s"/><rect x="28" y="24" width="8" height="25" rx="2" fill="%s"/><rect x="41" y="16" width="8" height="33" rx="2" fill="%s"/></svg>' % (b, b, a, a),
        "chip": '<svg viewBox="0 0 64 64" width="120" height="120"><rect x="16" y="16" width="32" height="32" rx="7" fill="%s"/><rect x="24" y="24" width="16" height="16" rx="3" fill="#fff" opacity=".85"/><g stroke="%s" stroke-width="3" stroke-linecap="round"><path d="M24 8v8M32 8v8M40 8v8M24 48v8M32 48v8M40 48v8M8 24h8M8 32h8M8 40h8M48 24h8M48 32h8M48 40h8"/></g></svg>' % (a, b),
    }
    return I.get(name, I["chart"])


def pcls(p):
    s = sign(p)
    return "up" if s > 0 else ("dn" if s < 0 else "fl")


def comp_tiles(c, t, cols=3, gsize=104):
    out = ""
    for tl in c["tiles"][:6]:
        p = tl.get("pct")
        v = fnum(p)
        frac = .5 + (v / 4 if v is not None else 0)
        out += ('<div class="tile">%s<div class="tn">%s</div><div class="ts">%s</div><div class="tv">%s</div><div class="tc %s">%s</div></div>'
                % (gauge2(frac, gsize, t["ink"]), e(tl["name"]), e(tl.get("sub", "")), e(tl["value"]), pcls(p), e(chg_txt(p))))
    return '<div class="tiles" style="grid-template-columns:repeat(%d,1fr)">%s</div>' % (cols, out)


def comp_bench_bars(c, t, n=9):
    out = ""
    B = t["bars"]
    for i, b in enumerate(c["bench"][:n]):
        out += ('<div class="brow"><div class="bar" style="background:linear-gradient(90deg,%s,%s)"><span class="flag">%s</span><span class="bn">%s</span><span class="bl">%s</span></div>'
                '<div class="pill %s">%s</div></div>' % (B[i % len(B)], B[(i + 1) % len(B)], e(b.get("code", "")), e(b["name"]), e(b["level"]), pcls(b["pct"]), e(chg_txt(b["pct"]))))
    return out


def comp_bench_cards(c, t, n=9, cols=3):
    out = ""
    B = t["bars"]
    vals = [abs(fnum(b.get("pct")) or 0) for b in c["bench"][:n]]
    mx = max(vals + [0.5])
    for i, b in enumerate(c["bench"][:n]):
        v = fnum(b.get("pct")) or 0
        w = min(100, abs(v) / mx * 100)
        out += ('<div class="bcard" style="border-top:6px solid %s"><div class="bt"><span class="flag" style="background:%s">%s</span><span class="bn2">%s</span></div>'
                '<div class="bv">%s</div><div class="bpct %s">%s</div><div class="mini"><i class="%s" style="width:%.0f%%"></i></div></div>'
                % (B[i % len(B)], B[i % len(B)], e(b.get("code", "")), e(b["name"]), e(b["level"]), pcls(b["pct"]), e(chg_txt(b["pct"])), pcls(b["pct"]), w))
    return '<div class="bgrid" style="grid-template-columns:repeat(%d,1fr)">%s</div>' % (cols, out)


def comp_bench_chips(c, t, n=9):
    out = ""
    for i, b in enumerate(c["bench"][:n]):
        out += '<div class="chip %s"><span class="cc">%s</span><b>%s</b><span class="cl">%s</span><span class="cp">%s</span></div>' % (
            pcls(b["pct"]), e(b.get("code", "")), e(b["name"]), e(b["level"]), e(chg_txt(b["pct"])))
    return '<div class="chips">%s</div>' % out


def comp_levels(c, t, track=False):
    out = ""
    for lv in c["levels"][:2]:
        if track:
            out += ('<div class="lvl2"><div class="ln">%s</div><div class="track"><span class="s">%s</span><i></i><span class="r">%s</span></div><div class="lnote">%s</div></div>'
                    % (e(lv["name"]), e(lv["s"]), e(lv["r"]), e(lv["note"])))
        else:
            out += ('<div class="lvl"><div class="ln">%s</div><div class="lz"><div class="zone s"><small>Support Zone</small><b>%s</b></div><div class="zone r"><small>Resistance Zone</small><b>%s</b></div></div>'
                    '<div class="lnote">%s</div></div>' % (e(lv["name"]), e(lv["s"]), e(lv["r"]), e(lv["note"])))
    return out


def comp_alerts(c, t):
    return "".join('<div class="bp">%s<div><h4>%s</h4><p>%s</p></div></div>' % (icon(b.get("icon", "chart"), t), e(b["title"]), e(b["text"])) for b in c["bottom"][:3])


BASE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:%(W)dpx;height:%(H)dpx;font-family:Inter,'Segoe UI',Arial,Helvetica,sans-serif;color:var(--ink);background:var(--bg);position:relative;overflow:hidden}
.wrap svg{flex:none}.wrap p{flex:none}.lvl2 .lnote{display:none}.lvl2{margin-bottom:10px}.lvl2 .ln{font-size:23px;margin-bottom:2px}.cmp .ts{display:none}.cmp .mini{display:none}.cmp .vt{-webkit-line-clamp:2!important}.cmp .bcard{padding:7px 16px 9px}.cmp .tn{font-size:18px}.cmp .tv{font-size:22px}.cmp .tc{font-size:17px}.cmp .tiles{gap:2px 10px}.wrap>div{overflow:hidden}
.deco{position:absolute;inset:0;%(deco)s;pointer-events:none}
.wrap{position:absolute;inset:0;display:grid}
h1{font-weight:800;letter-spacing:-.5px;white-space:nowrap}
h2{font-size:24px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--acc)}
p{font-size:21px;line-height:1.36;color:var(--ink);opacity:.92}
.cl6{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
.cl4{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.cl2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cl3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.big{font-weight:800;line-height:1.1}
.up{color:var(--up)}.dn{color:var(--dn)}.fl{color:var(--mut)}
.top{background:var(--top);color:var(--topink);display:flex;align-items:center;gap:22px;padding:0 40px;border-bottom:3px solid var(--acc)}
.top .lg{height:78px;border-radius:12px;border:1.5px solid #C7A03C}.tt{display:flex;flex-direction:column;gap:2px;min-width:0}.art{margin-left:auto;display:flex;align-items:center;gap:14px}.art.photo{width:560px;height:92px;margin-right:-40px;background-size:cover;background-position:right 30%%;padding-left:20px}.mvs{display:flex;flex-direction:column;gap:5px}.mv{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.10);border:1.5px solid var(--cardb);border-radius:999px;padding:2px 12px 2px 3px;font-size:16px;color:var(--topink)}.mv i{width:26px;height:26px;border-radius:50%%;color:#111;font-style:normal;font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center}.mv em{font-style:normal;font-weight:800}
.panel{background:var(--panel);border:2px solid var(--cardb);border-radius:26px;padding:20px 24px}
.card{background:var(--card);border:2px solid var(--cardb);border-radius:22px;padding:18px 22px}
.tiles{display:grid;gap:8px 14px;margin-top:6px}
.tile{text-align:center}.tn{font-weight:700;font-size:20px;margin-top:-2px}.ts{font-size:14px;color:var(--mut)}.tv{font-weight:800;font-size:24px}.tc{font-weight:700;font-size:19px}
.brow{display:flex;align-items:center;gap:10px;margin-bottom:9px}
.bar{flex:1;height:46px;border-radius:23px;color:#fff;display:flex;align-items:center;padding:0 20px 0 6px;font-weight:700;font-size:22px;box-shadow:0 4px 10px rgba(0,0,0,.25)}
.flag{min-width:38px;height:38px;border-radius:50%%;background:#fff;color:#0f2747;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-right:12px}
.bn{width:235px;white-space:nowrap}.bl{margin-left:auto;font-variant-numeric:tabular-nums}
.pill{width:140px;height:42px;border-radius:21px;font-weight:800;font-size:21px;display:flex;align-items:center;justify-content:center;background:var(--card)}
.pill.up{background:var(--upbg)}.pill.dn{background:var(--dnbg)}
.bgrid{display:grid;gap:12px}.bcard{background:var(--card);border:2px solid var(--cardb);border-radius:18px;padding:9px 16px}
.bt{display:flex;align-items:center;gap:10px}.bt .flag{color:#fff;margin:0}.bn2{font-weight:700;font-size:21px}
.bv{font-size:28px;font-weight:800;margin-top:2px;font-variant-numeric:tabular-nums}.bpct{font-size:22px;font-weight:800}
.mini{height:9px;border-radius:5px;background:rgba(128,128,128,.25);margin-top:5px;overflow:hidden}.mini i{display:block;height:100%%;border-radius:5px}.mini i.up{background:var(--up)}.mini i.dn{background:var(--dn)}.mini i.fl{background:var(--mut)}
.chips{display:flex;gap:10px;flex-wrap:wrap}.chip{display:flex;align-items:center;gap:10px;background:var(--card);border:2px solid var(--cardb);border-radius:999px;padding:6px 16px 6px 6px;font-size:18px}
.chip .cc{width:34px;height:34px;border-radius:50%%;background:var(--acc);color:#111;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}.chip .cl{opacity:.8;font-variant-numeric:tabular-nums}.chip .cp{font-weight:800}.chip.up .cp{color:var(--up)}.chip.dn .cp{color:var(--dn)}
.lvl{display:grid;grid-template-columns:120px 1fr;gap:8px 14px;align-items:center;margin-bottom:12px;border-bottom:2px solid var(--cardb);padding-bottom:10px}.lnote{grid-column:1/3;font-size:17px;line-height:1.28;opacity:.9;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ln{font-size:26px;font-weight:800;line-height:1.05}.lz{display:flex;gap:16px}.zone{flex:1;text-align:center;border-top:4px solid var(--up);padding-top:6px}.zone.r{border-top-color:var(--dn)}.zone small{display:block;font-size:16px;color:var(--mut)}.zone b{font-size:22px;white-space:nowrap}
.lvl2{margin-bottom:16px}.lvl2 .ln{font-size:26px;margin-bottom:6px}.track{display:flex;align-items:center;gap:12px;font-weight:800;font-size:23px}.track i{flex:1;height:12px;border-radius:6px;background:linear-gradient(90deg,var(--up),var(--acc),var(--dn))}.track .s{color:var(--up)}.track .r{color:var(--dn)}
.bp{display:flex;gap:18px;align-items:flex-start}.bp svg{flex:none;width:72px;height:72px}.bp h4{font-size:26px;font-weight:800;margin-bottom:6px;color:var(--acc)}.bp p{font-size:19px;line-height:1.32;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.foot{background:var(--top);color:var(--topink);opacity:.95;font-size:14px;display:flex;align-items:center;padding:0 40px;gap:30px;white-space:nowrap;overflow:hidden}
.badge{display:inline-block;padding:6px 18px;border-radius:999px;background:var(--acc);color:#111;font-weight:800;font-size:22px;letter-spacing:1px}
"""


def title_size(s):
    n = len(s)
    return 48 if n <= 58 else (42 if n <= 70 else 36)


def bull_svg(c1, c2, size=84):
    return ('<svg viewBox="0 0 100 100" width="%d" height="%d"><path d="M10 22c2 14 10 22 22 24l4-10c-8-2-14-6-26-14z" fill="%s"/><path d="M90 22c-2 14-10 22-22 24l-4-10c8-2 14-6 26-14z" fill="%s"/>'
            '<path d="M28 40c0-8 10-14 22-14s22 6 22 14l-3 26c-2 10-10 18-19 18s-17-8-19-18z" fill="%s"/><ellipse cx="50" cy="72" rx="17" ry="12" fill="rgba(255,255,255,.28)"/>'
            '<circle cx="42" cy="72" r="3" fill="#222"/><circle cx="58" cy="72" r="3" fill="#222"/><circle cx="40" cy="50" r="4" fill="#fff"/><circle cx="60" cy="50" r="4" fill="#fff"/><circle cx="41" cy="51" r="2" fill="#222"/><circle cx="59" cy="51" r="2" fill="#222"/>'
            '<path d="M44 36l6 5 6-5" stroke="%s" stroke-width="3" fill="none" stroke-linecap="round"/></svg>' % (size, size, c1, c1, c2, c1))


def bear_svg(c1, c2, size=84):
    return ('<svg viewBox="0 0 100 100" width="%d" height="%d"><circle cx="24" cy="26" r="13" fill="%s"/><circle cx="76" cy="26" r="13" fill="%s"/><circle cx="24" cy="26" r="6" fill="rgba(255,255,255,.35)"/><circle cx="76" cy="26" r="6" fill="rgba(255,255,255,.35)"/>'
            '<ellipse cx="50" cy="55" rx="34" ry="32" fill="%s"/><ellipse cx="50" cy="68" rx="15" ry="11" fill="rgba(255,255,255,.32)"/><ellipse cx="50" cy="63" rx="6" ry="4.5" fill="#222"/>'
            '<circle cx="37" cy="48" r="4" fill="#fff"/><circle cx="63" cy="48" r="4" fill="#fff"/><circle cx="38" cy="49" r="2" fill="#222"/><circle cx="62" cy="49" r="2" fill="#222"/>'
            '<path d="M44 74q6 4 12 0" stroke="#222" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>' % (size, size, c1, c1, c2))


def parse_movers(c):
    m = c.get("movers")
    if m:
        return m
    import re as _re
    txt = ""
    for b in c.get("bottom", []):
        if "Movers" in str(b.get("title", "")):
            txt = str(b.get("text", ""))
    up, dn = [], []
    if "Top losers" in txt:
        a, b = txt.split("Top losers", 1)
        up = [dict(sym=x, pct=y) for x, y in _re.findall(r"([A-Z&\-]{2,20})\s+([+-]?\d+\.?\d*%)", a)]
        dn = [dict(sym=x, pct=y) for x, y in _re.findall(r"([A-Z&\-]{2,20})\s+([+-]?\d+\.?\d*%)", b)]
    return {"up": up[:3], "dn": dn[:3]}


def mover_pill(m, kind, t):
    sym = str(m["sym"]).replace(".NS", "")
    col = t["up"] if kind == "up" else t["dn"]
    mono = sym[:2].upper()
    return ('<span class="mv"><i style="background:%s">%s</i><b>%s</b><em style="color:%s">%s %s</em></span>'
            % (col, e(mono), e(sym[:11]), col, "&#9650;" if kind == "up" else "&#9660;", e(chg_txt(m["pct"]).replace("+", "").replace("-", ""))))


def mood_photo(sc):
    key = ("bull_roar" if sc > 1.0 else "bull_calm" if sc > 0.35 else "bear_roar" if sc < -1.0 else "bear_calm" if sc < -0.35
           else ("bull_over_bear" if sc >= 0 else "bear_over_bull"))
    d = os.path.join(HERE, "branding", "mood")
    import datetime as _dt
    alt = _dt.date.today().toordinal() % 2  # two pictures per mood, rotated daily
    names = [key + "_2", key] if alt else [key, key + "_2"]
    for nm in names:
        for ext in (".jpg", ".jpeg", ".png", ".webp"):
            f = os.path.join(d, nm + ext)
            if os.path.exists(f):
                mt = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "webp": "webp"}[ext[1:]]
                return "data:image/%s;base64,%s" % (mt, base64.b64encode(open(f, "rb").read()).decode())
    return None


def top_art(c, t, mood, sc=0.0, banner=True):
    mv = parse_movers(c)
    art = {"bull": bull_svg(t["up"], t["acc"]), "bear": bear_svg(t["dn"], t["acc"]),
           "neutral": ''}[mood]
    pills = ""
    if mv.get("up"):
        pills += mover_pill(mv["up"][0], "up", t)
    if mv.get("dn"):
        pills += mover_pill(mv["dn"][0], "dn", t)
    ph = mood_photo(sc) if banner else None
    if not banner and mood_photo(sc):
        return '<div class="art"><div class="mvs">%s</div></div>' % pills
    if ph:
        return ('<div class="art photo" style="background-image:linear-gradient(90deg,var(--top) 0,rgba(0,0,0,0) 45%%),url(%s)"><div class="mvs">%s</div></div>' % (ph, pills))
    return '<div class="art"><div class="mvs">%s</div></div>' % pills   # no cartoon fallback: realistic photos only


def build_html(c, force_layout=None, force_theme=None):
    mood, sc, lay, t = pick_design(c, force_layout, force_theme)
    mood_word = {"bull": "BULLISH TONE", "bear": "CAUTIOUS TONE", "neutral": "BALANCED TONE"}[mood]
    v = c["vix"]
    vg = v.get("gauge", .5)
    top = ('<div class="top" style="grid-area:top"><img class="lg" src="%s"><div class="tt"><div class="brand">%s</div><h1 style="font-size:%dpx">%s</h1></div>%s</div>'
           % (logo(), e(brand.BRAND), 30, e(c["title"]), top_art(c, t, mood, sc, lay != 'board')))
    foot = '<div class="foot" style="grid-area:foot"><span>%s</span></div>' % e(brand.SHORT_DISCLAIMER)
    sp = spark2(c.get("spark", []), t, h=(150 if lay == 'magazine' else 230))
    spl = '<div style="font-size:15px;color:var(--mut)">%s</div>' % e(c.get("spark_label", ""))
    asia = ('<div style="display:flex;gap:16px;align-items:flex-start">%s<div><div class="big" style="font-size:30px">%s</div><p class="cl6" style="font-size:20px;margin-top:6px">%s</p></div></div>'
            % (icon("chip", t), e(c["asia"]["head"]), e(c["asia"]["text"])))
    vixb = ('<div style="display:flex;gap:12px;align-items:center">%s<div class="big" style="font-size:27px">%s</div></div><p class="cl4 vt" style="font-size:19px;margin-top:8px">%s</p>' % (gauge2(vg, 120, t["ink"]), e(v["headline"]), e(v["text"])))
    vixc = ('<div style="display:flex;gap:16px;align-items:center">%s<div><div class="big" style="font-size:25px">%s</div><p class="cl2" style="font-size:17px;margin-top:4px">%s</p></div></div>'
            % (gauge2(vg, 104, t["ink"]), e(v["headline"]), e(v["text"])))
    ph_card = ""
    if lay == "board":
        _ph = mood_photo(sc)
        if _ph:
            ph_card = ('<div style="flex:1;min-height:110px;border-radius:22px;border:2px solid var(--cardb);background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,0) 55%%),url(%s) right 30%%/cover;display:flex;align-items:flex-end;padding:12px 16px"><span class="badge" style="font-size:18px">%s</span></div>' % (_ph, mood_word))
    if lay == "board":
        body = """<div class="wrap" style="grid-template-columns:470px 1fr 530px;grid-template-rows:92px minmax(0,1fr) 172px 30px;grid-template-areas:'top top top' 'l c r' 'b b b' 'foot foot foot';gap:0 40px;padding:0">
%(top)s
<div style="grid-area:l;padding:24px 0 0 40px;display:flex;flex-direction:column;gap:14px;min-width:0"><h2>Today's Market Bias<br>&amp; Macro Highlights</h2><div>%(sp)s%(spl)s</div>%(asia)s%(phc)s</div>
<div style="grid-area:c;padding:22px 0 0;min-width:0"><div style="display:grid;grid-template-columns:1fr 330px;gap:26px;height:240px"><div><div class="big" style="font-size:34px">%(hl)s</div><p class="cl6" style="font-size:19px;margin-top:10px">%(bias)s</p></div><div>%(vixb)s</div></div><h2 style="text-align:center;margin:6px 0 10px;font-size:26px">Global &amp; Asian Equity Benchmarks</h2>%(bench)s</div>
<div style="grid-area:r;padding:20px 40px 0 0;display:flex;flex-direction:column;gap:14px;min-width:0"><div class="panel"><h2 style="font-size:19px;margin-bottom:4px">Commodities, Currency &amp; Volatility</h2>%(tiles)s</div><h2 style="text-align:center;font-size:22px">Key Technical Levels to Watch</h2><div>%(lvl)s</div></div>
<div style="grid-area:b;padding:12px 40px 0;border-top:3px solid var(--cardb);margin:0 40px"><h2 style="font-size:26px;margin-bottom:8px">Corporate Action &amp; Market Alerts</h2><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px">%(al)s</div></div>
%(foot)s</div>""" % dict(top=top, phc=ph_card, sp=sp, spl=spl, asia=asia, hl=e(c["headline"]), bias=e(c["bias_text"]), vixb=vixb, bench=comp_bench_bars(c, t), tiles=comp_tiles(c, t), lvl=comp_levels(c, t), al=comp_alerts(c, t), foot=foot)
    elif lay == "hero":
        arc = gauge2(min(1, max(0, .5 + sc / 4)), 190, t["ink"])
        body = """<div class="wrap cmp" style="grid-template-columns:640px 1fr;grid-template-rows:92px minmax(0,1fr) 172px 30px;grid-template-areas:'top top' 'l r' 'b b' 'foot foot';gap:18px 30px">
%(top)s
<div style="grid-area:l;padding:22px 0 0 40px;display:flex;flex-direction:column;gap:14px;min-width:0"><div class="card" style="text-align:center;padding:12px"><div style="display:flex;justify-content:center">%(arc)s</div><div style="margin-top:6px"><span class="badge">%(mw)s</span></div></div><div class="big" style="font-size:34px">%(hl)s</div><p class="cl4" style="font-size:19px">%(bias)s</p>%(asia)s<div class="card" style="padding:12px 18px">%(vixb)s</div></div>
<div style="grid-area:r;padding:22px 40px 0 0;display:flex;flex-direction:column;gap:14px;min-width:0"><h2 style="font-size:26px">Global &amp; Asian Equity Benchmarks</h2>%(bench)s<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px"><div class="panel"><h2 style="font-size:18px">Commodities, Currency &amp; Volatility</h2>%(tiles)s</div><div class="card"><h2 style="font-size:20px;margin-bottom:8px">Key Levels to Watch</h2>%(lvl)s</div></div></div>
<div style="grid-area:b;padding:10px 40px 0;border-top:3px solid var(--cardb);margin:0 40px"><h2 style="font-size:26px;margin-bottom:8px">Corporate Action &amp; Market Alerts</h2><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px">%(al)s</div></div>
%(foot)s</div>""" % dict(top=top, arc=arc, mw=mood_word, hl=e(c["headline"]), bias=e(c["bias_text"]), asia=asia, bench=comp_bench_cards(c, t, 9, 3), tiles=comp_tiles(c, t, 3, 66), lvl=comp_levels(c, t, True), vixb=vixc, al=comp_alerts(c, t), foot=foot)
    else:  # magazine
        body = """<div class="wrap cmp" style="grid-template-columns:1fr 560px;grid-template-rows:92px 138px minmax(0,1fr) 172px 30px;grid-template-areas:'top top' 'tk tk' 'l r' 'b b' 'foot foot';gap:16px 36px">
%(top)s
<div style="grid-area:tk;padding:14px 40px 0">%(chips)s</div>
<div style="grid-area:l;padding:6px 0 0 40px;display:flex;flex-direction:column;gap:14px;min-width:0"><div><span class="badge">%(mw)s</span></div><div class="big" style="font-size:56px;line-height:1.04">%(hl)s</div><p class="cl4" style="font-size:22px">%(bias)s</p><div class="card" style="display:grid;grid-template-columns:1fr 300px;gap:20px;align-items:center"><div>%(asia)s</div><div>%(sp)s%(spl)s</div></div><div class="card" style="padding:12px 18px">%(vixb)s</div></div>
<div style="grid-area:r;padding:6px 40px 0 0;display:flex;flex-direction:column;gap:14px;min-width:0"><div class="panel"><h2 style="font-size:19px;margin-bottom:4px">Commodities, Currency &amp; Volatility</h2>%(tiles)s</div><div class="card"><h2 style="font-size:20px;margin-bottom:8px">Key Levels to Watch</h2>%(lvl)s</div></div>
<div style="grid-area:b;padding:10px 40px 0;border-top:3px solid var(--cardb);margin:0 40px"><h2 style="font-size:26px;margin-bottom:8px">Corporate Action &amp; Market Alerts</h2><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px">%(al)s</div></div>
%(foot)s</div>""" % dict(top=top, chips=comp_bench_chips(c, t, 9), mw=mood_word, hl=e(c["headline"]), bias=e(c["bias_text"]), asia=asia, sp=sp, spl=spl, tiles=comp_tiles(c, t, 3, 74), lvl=comp_levels(c, t, True), vixb=vixc, al=comp_alerts(c, t), foot=foot)
    return ("""<!doctype html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>%s%s:root{%s}%s</style></head><body><div class="deco"></div>%s</body></html>""" % (brand.font_css(), brand.name_css('brand', '46px'), css_vars(t), BASE_CSS % dict(W=W, H=H, deco=deco_css(t)), body))


# ---------------------------------------------------------------- mobile / social version: 2 portrait pages, 1080x1350 (4:5)
MW, MH = 1080, 1350
MOB_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;font-family:Inter,'Segoe UI',Arial,Helvetica,sans-serif;color:var(--ink);background:var(--bg);position:relative;overflow:hidden}
.deco{position:absolute;inset:0;%(deco)s}
.m{position:absolute;inset:0;display:flex;flex-direction:column}
.mh{background:var(--top);border-bottom:4px solid var(--acc);padding:0 34px;display:flex;align-items:center;gap:18px;height:112px;flex:none}
.mh .lg{height:78px;border-radius:12px;border:1.5px solid #C7A03C}.mh .brand{font-size:50px}.mh .t2{font-size:23px;color:var(--topink);opacity:.85;margin-top:3px}
.mh .pg{margin-left:auto;font-size:24px;font-weight:800;color:var(--topink);border:2px solid var(--acc);border-radius:999px;padding:4px 16px}
.mb{flex:1;padding:12px 34px 8px;display:flex;flex-direction:column;gap:8px;min-height:0;overflow:hidden}
.mb>*{flex:none}
.badge{display:inline-block;padding:5px 18px;border-radius:999px;background:var(--acc);color:#111;font-weight:800;font-size:22px;letter-spacing:1px}
.hl{font-size:48px;font-weight:800;line-height:1.06;letter-spacing:-1px}
.tx{font-size:25px;line-height:1.3;opacity:.96}
.sec{font-size:22px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--acc);border-bottom:2px solid var(--cardb);padding-bottom:2px;margin-top:4px}
table{width:100%%;border-collapse:collapse}
td,th{padding:0 12px;height:var(--rh,42px);font-size:25px;vertical-align:middle}
th{font-size:19px;color:var(--mut);font-weight:700;text-align:right;height:26px;letter-spacing:.5px;text-transform:uppercase}
th:first-child,td:first-child{text-align:left}
td{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
td:first-child{font-weight:700}td small{display:inline;font-size:19px;color:var(--mut);font-weight:600;margin-left:10px}
tr:nth-child(even) td{background:var(--card)}
tbody tr{border-bottom:1px solid var(--cardb)}
.up{color:var(--up)}.dn{color:var(--dn)}.fl{color:var(--mut)}
td.bar{width:150px;padding-right:6px}.dv{position:relative;height:14px;background:rgba(128,128,128,.18);border-radius:7px}.dv i{position:absolute;top:0;height:14px;border-radius:7px}.dv b{position:absolute;left:50%%;top:-3px;width:2px;height:20px;background:var(--mut)}
.box{background:var(--card);border:2px solid var(--cardb);border-radius:16px;padding:8px 14px}
.box h4{font-size:24px;font-weight:800;color:var(--acc);margin-bottom:2px}.box p{font-size:21px;line-height:1.26}
.lvr{display:grid;grid-template-columns:150px 1fr 1fr;gap:8px 14px;align-items:baseline}.lvr small{display:block;font-size:18px;color:var(--mut);font-weight:600}.lvr .v{font-size:24px;font-weight:800}
.mf{flex:none;background:var(--top);color:var(--topink);padding:6px 34px;font-size:16px;line-height:1.3;overflow:hidden}
"""


def _rows(items, t, mx=None, sub=False):
    vals = [abs(fnum(i.get("pct")) or 0) for i in items]
    mx = mx or max(vals + [0.5])
    out = ""
    for i in items:
        v = fnum(i.get("pct")) or 0
        w = min(50, abs(v) / mx * 50)
        side = "left:%.1f%%" % (50 if v >= 0 else 50 - w)
        col = "var(--up)" if v > 0 else ("var(--dn)" if v < 0 else "var(--mut)")
        nm = e(i["name"]) + (("<small>%s</small>" % e(i.get("sub", ""))) if sub and i.get("sub") else "")
        out += ('<tr><td>%s</td><td>%s</td><td class="%s">%s</td><td class="bar"><div class="dv"><b></b><i style="%s;width:%.1f%%;background:%s"></i></div></td></tr>'
                % (nm, e(i.get("value", i.get("level", ""))), pcls(i.get("pct")), e(chg_txt(i.get("pct"))), side, w, col))
    return out


def _table(title, items, t, sub=False):
    return ('<div class="sec">%s</div><table><thead><tr><th></th><th>Level</th><th>Change</th><th></th></tr></thead><tbody>%s</tbody></table>' % (title, _rows(items, t, None, sub)))


def build_mobile(c, page=1, force_theme=None):
    mood, sc, lay, t = pick_design(c, None, force_theme)
    mw = {"bull": "BULLISH TONE", "bear": "CAUTIOUS TONE", "neutral": "BALANCED TONE"}[mood]
    import re as _re
    m = _re.search(r"\((\d{1,2}\s+\w{3}\s+\d{4})\)", c.get("title", ""))
    dtxt = m.group(1) if m else ""
    vix = c["vix"]
    ph = mood_photo(sc)
    head = ('<div class="mh"><img class="lg" src="%s"><div><div class="brand">%s</div><div class="t2">Morning Market Pulse &middot; %s</div></div><div class="pg">%d / 2</div></div>' % (logo(), e(brand.BRAND), e(dtxt), page))
    if page == 1:
        photo = ""
        if ph:
            photo = ('<div style="height:170px;border-radius:18px;border:2px solid var(--cardb);background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,0) 55%%),url(%s) right 30%%/cover"></div>' % ph)
        tiles = [dict(name=x["name"], sub=x.get("sub", ""), value=x["value"], pct=x.get("pct")) for x in c["tiles"]]
        body = ('<div style="display:flex;align-items:center;gap:14px"><span class="badge">%s</span></div>'
                '<div class="hl">%s</div>%s<div class="tx">%s</div>%s'
                '<div class="sec">%s</div>%s'
                % (mw, e(c["headline"]), photo, e(c.get("open_text") or c["bias_text"]), _table("Market snapshot", tiles, t, True),
                   e(c.get("spark_label", "Nifty 50 trend")), spark2(c.get("spark", []), t, 1000, 250, c.get("proj"), c.get("proj_label", "Today (est.)"))))
        lv1 = ""
        for l in c["levels"][:2]:
            lv1 += ('<div class="box"><div class="lvr"><div style="font-size:26px;font-weight:800">%s</div><div><small>Support zone</small><span class="v up">%s</span></div><div><small>Resistance zone</small><span class="v dn">%s</span></div></div>'
                    '<p style="font-size:21px;margin-top:3px;opacity:.92">%s</p></div>' % (e(l["name"]), e(l["s"]), e(l["r"]), e(l["note"])))
        body += '<div class="sec">Key technical levels for today</div>' + lv1
    else:
        mv = parse_movers(c)
        lv = ""
        for l in c["levels"][:2]:
            lv += ('<div class="box"><div class="lvr"><div style="font-size:26px;font-weight:800">%s</div><div><small>Support zone</small><span class="v up">%s</span></div><div><small>Resistance zone</small><span class="v dn">%s</span></div></div>'
                   '<p style="font-size:21px;margin-top:3px;opacity:.92">%s</p></div>' % (e(l["name"]), e(l["s"]), e(l["r"]), e(l["note"])))
        al = "".join('<div class="box"><h4>%s</h4><p>%s</p></div>' % (e(b["title"]), e(b["text"])) for b in c["bottom"][:3])
        body = ('%s<div class="sec">Events, stocks &amp; headlines for the session</div>%s'
                % (_table("Global &amp; Asian equity benchmarks", c["bench"][:9], t), al))
    foot = '<div class="mf">%s</div>' % e(brand.SHORT_DISCLAIMER)
    return ("""<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>%s%s:root{%s}%s</style></head><body><div class="deco"></div><div class="m">%s<div class="mb" id="mb">%s</div>%s</div>
<script>(function(){var mb=document.getElementById('mb'),r=@R@;while(mb.scrollHeight>mb.clientHeight+1&&r>30){r-=2;document.documentElement.style.setProperty('--rh',r+'px');}var z=1;while(mb.scrollHeight>mb.clientHeight+1&&z>0.84){z-=0.02;mb.style.zoom=z;}})();</script></body></html>"""
            % (brand.font_css(), brand.name_css('brand', '46px'), css_vars(t), MOB_CSS % dict(deco=deco_css(t)), head, body, foot)).replace('@R@', str(42 if page == 1 else 38))


def render_mobile(cfg, png_base, force_theme=None):
    """-> [page1.png, page2.png]; png_base like out/Name_Mobile.png -> out/Name_Mobile_1.png, _2.png"""
    from playwright.sync_api import sync_playwright
    outs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": MW, "height": MH})
        for n in (1, 2):
            pg.set_content(build_mobile(cfg, n, force_theme), wait_until="load")
            try:
                pg.wait_for_load_state("networkidle", timeout=6000)
            except Exception:
                pass
            f = png_base[:-4] + "_%d.png" % n
            pg.screenshot(path=f, full_page=False)
            outs.append(f)
        b.close()
    return outs


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
    ap.add_argument("--png", required=False)
    ap.add_argument("--pdf")
    ap.add_argument("--mobile", help="also/only write the portrait 1080x1350 social version to this PNG")
    a = ap.parse_args()
    if a.mobile:
        print("Wrote", render_mobile(json.load(open(a.config)), a.mobile))
    else:
        print("Wrote", render(json.load(open(a.config)), a.png, a.pdf))
