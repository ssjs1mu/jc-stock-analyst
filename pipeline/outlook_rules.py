"""Forward-looking, rule-based content for the morning reports (no paid API, nothing invented).

opening_view(): indicative opening call from overnight cues (GIFT Nifty is NOT available, so this is a model-free
weighted read of US / Asian indices, crude, rupee, VIX and US yield, stated as indicative).
events_today() / watch_list(): what is scheduled today and which stocks have a catalyst (results today, today's
published setups, headlines naming a Nifty 50 stock, volume shocks).
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ALIAS = {"RELIANCE": "Reliance", "TCS": "TCS", "HDFCBANK": "HDFC Bank", "ICICIBANK": "ICICI Bank", "INFY": "Infosys",
         "BHARTIARTL": "Airtel|Bharti", "ITC": "ITC", "SBIN": "SBI|State Bank", "LT": "L&T|Larsen", "HINDUNILVR": "HUL|Hindustan Unilever",
         "KOTAKBANK": "Kotak", "AXISBANK": "Axis Bank", "BAJFINANCE": "Bajaj Finance", "MARUTI": "Maruti", "SUNPHARMA": "Sun Pharma",
         "TATAMOTORS": "Tata Motors", "TATASTEEL": "Tata Steel", "NTPC": "NTPC", "ONGC": "ONGC", "ADANIENT": "Adani Enterprises",
         "ADANIPORTS": "Adani Ports", "WIPRO": "Wipro", "HCLTECH": "HCL Tech", "ASIANPAINT": "Asian Paints", "TITAN": "Titan",
         "ULTRACEMCO": "UltraTech", "M&M": "Mahindra", "POWERGRID": "Power Grid", "COALINDIA": "Coal India", "JSWSTEEL": "JSW Steel",
         "HEROMOTOCO": "Hero MotoCorp", "TECHM": "Tech Mahindra", "TRENT": "Trent", "BAJAJFINSV": "Bajaj Finserv", "NESTLEIND": "Nestle",
         "DRREDDY": "Dr Reddy", "CIPLA": "Cipla", "EICHERMOT": "Eicher", "GRASIM": "Grasim", "HINDALCO": "Hindalco", "INDUSINDBK": "IndusInd",
         "APOLLOHOSP": "Apollo Hospitals", "BRITANNIA": "Britannia", "TATACONSUM": "Tata Consumer", "BPCL": "BPCL", "SBILIFE": "SBI Life",
         "HDFCLIFE": "HDFC Life", "SHRIRAMFIN": "Shriram Finance", "BEL": "Bharat Electronics|BEL", "JIOFIN": "Jio Financial", "ETERNAL": "Eternal|Zomato"}


def _pc(qs, k):
    q = qs.get(k)
    try:
        return float(q["pct"])
    except Exception:
        return None


def _clip(x, lo, hi):
    return max(lo, min(hi, x))


def opening_view(qs, pv=None):
    W = [("^GSPC", 1.0), ("^IXIC", 0.6), ("^DJI", 0.4), ("^N225", 0.3), ("^HSI", 0.3), ("^KS11", 0.2), ("^FTSE", 0.1), ("^GDAXI", 0.1)]
    num = den = 0.0
    for k, w in W:
        v = _pc(qs, k)
        if v is not None:
            num += _clip(v, -3, 3) * w
            den += w
    base = (num / den) if den else 0.0
    adj = 0.0
    br, fx, vx, ty = _pc(qs, "BZ=F"), _pc(qs, "USDINR=X"), _pc(qs, "^INDIAVIX"), _pc(qs, "^TNX")
    if br is not None:
        adj -= 0.12 * _clip(br, -4, 4)
    if fx is not None:
        adj -= 0.35 * _clip(fx, -1, 1)
    if vx is not None:
        adj -= 0.03 * _clip(vx, -10, 10)
    if ty is not None:
        adj -= 0.05 * _clip(ty, -4, 4)
    est = _clip(0.55 * (base + adj), -1.3, 1.3)       # indicative Nifty opening move, %
    if est >= 0.6:
        label, mood = "Gap-up opening likely", "bull"
    elif est >= 0.2:
        label, mood = "Positive start likely", "bull"
    elif est > -0.2:
        label, mood = "Flat to marginally mixed start", "neutral"
    elif est > -0.6:
        label, mood = "Weak start likely", "bear"
    else:
        label, mood = "Gap-down opening likely", "bear"
    sp, nq, ni, hs = _pc(qs, "^GSPC"), _pc(qs, "^IXIC"), _pc(qs, "^N225"), _pc(qs, "^HSI")
    ph = []
    if sp is not None:
        ph.append("Wall Street %s" % ("firm" if sp > 0.3 else "weak" if sp < -0.3 else "steady"))
    asia = [v for v in (ni, hs, _pc(qs, "^KS11")) if v is not None]
    if asia:
        a = sum(asia) / len(asia)
        ph.append("Asia %s" % ("positive" if a > 0.3 else "negative" if a < -0.3 else "mixed"))
    if br is not None and abs(br) >= 1.0:
        ph.append("crude %s" % ("easing" if br < 0 else "rising"))
    if fx is not None and abs(fx) >= 0.15:
        ph.append("rupee %s" % ("firmer" if fx < 0 else "softer"))
    headline = label + (": " + ", ".join(ph[:3]) if ph else "")
    last = None
    try:
        last = float(qs["^NSEI"]["last"])
    except Exception:
        pass
    zone = ""
    if last:
        lo, hi = sorted([last * (1 + est / 100 - 0.0025), last * (1 + est / 100 + 0.0025)])
        zone = "%s - %s" % (format(round(lo), ","), format(round(hi), ","))
    drivers = []
    def d(txt):
        drivers.append(txt)
    if sp is not None:
        d("US: S&P 500 %+.2f%%, Nasdaq %s, Dow %s." % (sp, "%+.2f%%" % nq if nq is not None else "n/a", "%+.2f%%" % _pc(qs, "^DJI") if _pc(qs, "^DJI") is not None else "n/a"))
    if asia:
        d("Asia this morning: Nikkei %s, Hang Seng %s, Kospi %s." % tuple(("%+.2f%%" % v) if v is not None else "n/a" for v in (ni, hs, _pc(qs, "^KS11"))))
    bits = []
    if br is not None:
        bits.append("Brent %s (%+.2f%%)" % (format(float(qs["BZ=F"]["last"]), ",.2f"), br))
    if fx is not None:
        bits.append("USD/INR %s (%+.2f%%)" % (format(float(qs["USDINR=X"]["last"]), ".3f"), fx))
    if vx is not None:
        bits.append("India VIX %s (%+.2f%%)" % (format(float(qs["^INDIAVIX"]["last"]), ".2f"), vx))
    if bits:
        d("Currency, crude and volatility: " + "; ".join(bits) + ".")
    # yesterday only if it changes today's opening
    yday = None
    n = _pc(qs, "^NSEI")
    if n is not None and abs(n) >= 0.8:
        yday = "Nifty's %+.2f%% move in the last session is large enough to shape today's opening; expect follow-through or profit-taking near the first hour." % n
    elif pv and last:
        for nm, lv in (("support", pv["s1"]), ("resistance", pv["r1"])):
            if abs(last - lv) / last < 0.003:
                yday = "Nifty closed within 0.3%% of its %s pivot (%s), so that level decides the early direction." % (nm, format(round(lv), ","))
    return dict(est=round(est, 2), mood=mood, label=label, headline=headline, zone=zone, drivers=drivers, yday=yday,
                score=est)


def events_today(now, exp_text, qs=None):
    ev = [exp_text]
    today = now.date().isoformat()
    try:
        up = json.load(open(os.path.join(ROOT, "data", "results.json"))).get("upcoming", {})
        core = set()
        try:
            core = set(json.load(open(os.path.join(ROOT, "data", "constituents.json"))).get("idx", {}).get("NIFTY 50", []) or [])
        except Exception:
            pass
        today_syms = sorted(s for s, rows in up.items() if any(r.get("date") == today for r in rows))
        big = [s for s in today_syms if s in ALIAS]
        rest = [s for s in today_syms if s not in big]
        if today_syms:
            names = big + rest[:10]
            ev.append("Results today (%d companies): %s%s." % (len(today_syms), ", ".join(names), " and others" if len(rest) > 10 else ""))
        else:
            ev.append("No major quarterly results flagged for today.")
    except Exception:
        pass
    return ev


def watch_list(qs, heads, gain, lose, shock, now, nifty50, limit=8):
    rows, seen = [], set()
    today = now.date().isoformat()
    def add(sym, trig, note):
        if sym in seen or len(rows) >= limit:
            return
        seen.add(sym)
        rows.append([sym, trig, note])
    # 1. results today
    try:
        up = json.load(open(os.path.join(ROOT, "data", "results.json"))).get("upcoming", {})
        for s, r in sorted(up.items()):
            if any(x.get("date") == today for x in r) and s in ALIAS:
                add(s, "Results today", "Reaction to earnings at the open")
    except Exception:
        pass
    # 2. headlines naming a Nifty 50 stock
    for _, t, src in heads[:40]:
        for sym in nifty50:
            pat = ALIAS.get(sym, sym)
            if re.search(r"\b(%s)\b" % pat, t, re.I):
                add(sym, "In the news", re.sub(r"\s*[-|]\s*[^-|]{3,40}$", "", t)[:90])
                break
    # 3. today's published setups
    try:
        c = json.load(open(os.path.join(ROOT, "data", "calls", "latest.json")))
        if c.get("date") == today:
            for x in sorted([x for x in c.get("calls", []) if x.get("type") == "DAY"], key=lambda z: -z.get("score", 0))[:4]:
                add(x["sym"], "Setup: %s (%s)" % (x["side"], x.get("grade", "")),
                    "Entry %s, stop %s, target %s" % (format(x["entry"], ",.1f"), format(x["sl"], ",.1f"), format(x["t1"], ",.1f")))
    except Exception:
        pass
    # 4. volume shock from the last session (only as a carry-over trigger)
    for s, q in shock[:2]:
        add(s, "Volume surge (last session)", "%.1fx average volume, %s" % (q["vol"] / q["avgvol"], "%+.2f%%" % q["pct"]))
    return rows
