#!/usr/bin/env python3
"""Claude-independent report generator (runs in GitHub Actions, free).

Usage: python3 pipeline/auto_reports.py <schedule_id> [--force] [--out DIR]

Data: Yahoo Finance chart API (prices) + Google News RSS (headlines).
Commentary: Gemini free API (GEMINI_API_KEY secret); if the key is missing or the call
fails, a plain template paragraph built only from the numbers is used instead.

Fallback behaviour: if reports/<id>/index.json already holds an ok/holiday run for today
(IST) -- e.g. the Claude scheduled task published -- this script exits without doing anything,
unless --force. Never invents numbers: anything not fetched is printed as "n/a".
Supported ids: premarket-news, morning-brief, morning-detailed, morning-pulse,
evening-market-wrap, evening-news-wrap. (closing-auction and circuit-watch need NSE
exchange files that block cloud servers, so they are not generated here.)
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IST = ZoneInfo("Asia/Kolkata")
UA = {"User-Agent": "Mozilla/5.0 (compatible; JoshisCornerBot/1.0)"}
DISC = ("For information only. Not investment advice. Levels and ideas are illustrative and not "
        "personalised; markets carry risk and no outcome is guaranteed.")
NIFTY50 = ('RELIANCE TCS HDFCBANK ICICIBANK INFY BHARTIARTL ITC SBIN LT HINDUNILVR KOTAKBANK AXISBANK '
           'BAJFINANCE MARUTI SUNPHARMA HCLTECH ASIANPAINT NTPC ULTRACEMCO TITAN ONGC POWERGRID M&M '
           'BAJAJFINSV WIPRO ADANIENT ADANIPORTS COALINDIA JSWSTEEL TATASTEEL NESTLEIND TECHM GRASIM '
           'HINDALCO CIPLA DRREDDY EICHERMOT APOLLOHOSP BPCL BRITANNIA DIVISLAB HEROMOTOCO INDUSINDBK '
           'SBILIFE HDFCLIFE TATACONSUM BAJAJ-AUTO SHRIRAMFIN TRENT').split()
IDX = {"Nifty 50": "^NSEI", "Sensex": "^BSESN", "Bank Nifty": "^NSEBANK", "Nifty 500": "^CRSLDX",
       "India VIX": "^INDIAVIX"}
GLOBAL = {"Dow Jones": "^DJI", "S&P 500": "^GSPC", "Nasdaq Composite": "^IXIC", "FTSE 100": "^FTSE",
          "DAX": "^GDAXI"}
ASIA = {"Nikkei 225": "^N225", "Hang Seng": "^HSI", "Shanghai Composite": "000001.SS", "Kospi": "^KS11"}
CMDTY = {"Brent crude (US$/bbl)": "BZ=F", "WTI crude (US$/bbl)": "CL=F", "Gold (US$/oz, Comex)": "GC=F",
         "USD/INR": "USDINR=X", "Dollar index (DXY)": "DX-Y.NYB", "US 10-yr yield (%)": "^TNX"}
NEWS_Q = ["Sensex Nifty India stock market", "RBI FII India economy crude oil rupee",
          "Wall Street Fed Asian markets stocks"]


# ---------------------------------------------------------------- fetch
def http(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def quote(sym):
    """-> dict(last, prev, chg, pct, date, hi, lo, vol, avgvol) or None"""
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%s?range=2mo&interval=1d" % urllib.parse.quote(sym)
    for attempt in range(3):
        try:
            j = json.loads(http(url))
            res = j["chart"]["result"][0]
            ts = res["timestamp"]
            q = res["indicators"]["quote"][0]
            off = res["meta"].get("gmtoffset", 0)
            rows = [(t, c, h, l, v) for t, c, h, l, v in zip(ts, q["close"], q["high"], q["low"], q["volume"])
                    if c is not None]
            if len(rows) < 2:
                return None
            t, c, h, l, v = rows[-1]
            pc = rows[-2][1]
            vols = [r[4] for r in rows[-21:-1] if r[4]]
            return dict(last=c, prev=pc, chg=c - pc, pct=(c - pc) / pc * 100 if pc else 0.0,
                        date=dt.datetime.fromtimestamp(t + off, dt.timezone.utc).strftime("%Y-%m-%d"),
                        hi=h, lo=l, vol=v or 0, avgvol=(sum(vols) / len(vols)) if vols else 0)
        except Exception:
            import time
            time.sleep(1.5 * (attempt + 1))
    return None


def fetch_all(symbols):
    out = {}
    with cf.ThreadPoolExecutor(8) as ex:
        for s, r in zip(symbols, ex.map(quote, symbols)):
            out[s] = r
    return out


def news(max_age_h=30):
    seen, items = set(), []
    now = dt.datetime.now(dt.timezone.utc)
    for q in NEWS_Q:
        url = "https://news.google.com/rss/search?q=%s&hl=en-IN&gl=IN&ceid=IN:en" % urllib.parse.quote(q + " when:1d")
        try:
            root = ET.fromstring(http(url))
        except Exception:
            continue
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()
            key = re.sub(r"\W+", "", title.lower())[:60]
            if not title or key in seen:
                continue
            try:
                pub = dt.datetime.strptime(it.findtext("pubDate"), "%a, %d %b %Y %H:%M:%S %Z").replace(tzinfo=dt.timezone.utc)
            except Exception:
                continue
            if (now - pub).total_seconds() > max_age_h * 3600:
                continue
            seen.add(key)
            src = (it.findtext("source") or "").strip()
            items.append((pub, title, src))
    items.sort(reverse=True)
    return items


# ---------------------------------------------------------------- helpers
def f2(x, d=2):
    return "n/a" if x is None else f"{x:,.{d}f}"


def pct(x):
    return "n/a" if x is None else f"{x:+.2f}%"


def row(name, q, d=2):
    return [name, f2(q["last"], d) if q else "n/a", pct(q["pct"]) if q else "n/a"]


def pivots(q):
    if not q:
        return None
    p = (q["hi"] + q["lo"] + q["last"]) / 3
    return dict(p=p, s1=2 * p - q["hi"], r1=2 * p - q["lo"], s2=p - (q["hi"] - q["lo"]), r2=p + (q["hi"] - q["lo"]))


def next_trading_day(d):
    d += dt.timedelta(days=1)
    while d.weekday() >= 5:
        d += dt.timedelta(days=1)
    return d


def expiry_text(d):
    """SEBI mapping: Nifty weekly = Tuesday, Sensex weekly = Thursday."""
    out = []
    if d.weekday() == 1:
        out.append("Nifty weekly expiry today (Tuesday).")
    if d.weekday() == 3:
        out.append("Sensex weekly expiry today (Thursday).")
    if not out:
        nxt_tue = d + dt.timedelta(days=(1 - d.weekday()) % 7)
        nxt_thu = d + dt.timedelta(days=(3 - d.weekday()) % 7)
        out.append("Next Nifty weekly expiry: Tuesday %s; next Sensex weekly expiry: Thursday %s."
                   % (nxt_tue.strftime("%d %b"), nxt_thu.strftime("%d %b")))
    return " ".join(out)


LAST_ERR = ["no key in environment"]


def pick_model(key):
    """Newest text 'flash' model that supports generateContent (model names change; don't hardcode)."""
    try:
        req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
                                     headers={"x-goog-api-key": key})
        ms = json.loads(urllib.request.urlopen(req, timeout=30).read()).get("models", [])
        names = [m["name"].split("/")[-1] for m in ms if "generateContent" in m.get("supportedGenerationMethods", [])]
        bad = ("lite", "image", "tts", "audio", "live", "thinking", "embedding", "preview", "exp", "robotics", "computer")
        cand = [n for n in names if "flash" in n and not any(b in n for b in bad)]
        def ver(n):
            m = re.search(r"gemini-(\d+(?:\.\d+)?)", n)
            return float(m.group(1)) if m else 0
        cand.sort(key=lambda n: (-ver(n), len(n)))
        if cand:
            print("Gemini models:", cand[:3])
            return cand[:3]
    except Exception as e:
        print("model list failed:", str(e)[:120])
    return ["gemini-flash-latest"]


def gemini(prompt):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    LAST_ERR[0] = "unknown"
    models = [os.environ["GEMINI_MODEL"]] if os.environ.get("GEMINI_MODEL") else pick_model(key)
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                       "generationConfig": {"temperature": 0.3, "responseMimeType": "application/json"}}).encode()
    import time
    for attempt in range(6):
        model = models[attempt % len(models)]
        url = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % model
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "x-goog-api-key": key})
        try:
            j = json.loads(urllib.request.urlopen(req, timeout=90).read())
            return json.loads(j["candidates"][0]["content"]["parts"][0]["text"])
        except urllib.error.HTTPError as e:
            LAST_ERR[0] = "HTTP %s %s" % (e.code, e.read()[:200].decode("utf8", "replace"))
            if e.code not in (429, 500, 502, 503, 504):
                break
        except Exception as e:
            LAST_ERR[0] = str(e)[:300]
        print("Gemini retry %d: %s" % (attempt + 1, LAST_ERR[0][:120]))
        time.sleep(6 * (attempt + 1))
    return None


def commentary(kind, facts, headlines):
    """-> dict(bias:str, outlook:[str], news:[str]); Gemini if possible, else template."""
    heads = "\n".join("- %s (%s)" % (t, s) for _, t, s in headlines[:25])
    prompt = (
        "You write for Joshi's Corner, an Indian stock-market research desk. Report type: %s.\n"
        "Use ONLY the facts and headlines below. Do not add any number, company, event or level that is not "
        "given. No predictions stated as certain, no guaranteed returns, no buy/sell instructions. Neutral, "
        "professional tone, plain English.\n\nFACTS:\n%s\n\nHEADLINES:\n%s\n\n"
        'Return JSON: {"bias": "3-4 sentence summary of the session/market setup", '
        '"outlook": ["3-5 short bullets on what to watch, levels and risks drawn only from the facts"], '
        '"news": ["up to 6 bullets rewriting the most market-relevant headlines in one sentence each, '
        'keeping the source name in brackets"], '
        '"headline": "max 7 words, the single main takeaway", '
        '"vol_text": "2 sentences on India VIX and the rupee from the facts", '
        '"asia_head": "max 5 words on Asian markets", '
        '"asia_text": "2-3 sentences on Asian and global cues from the facts"}' % (kind, facts, heads or "(none)"))
    out = gemini(prompt)
    if out and isinstance(out.get("bias"), str):
        out["outlook"] = [str(x) for x in out.get("outlook", [])][:6]
        out["news"] = [str(x) for x in out.get("news", [])][:8]
        for k in ("headline", "vol_text", "asia_head", "asia_text"):
            out[k] = str(out.get(k, "")).strip()
        out["by"] = "gemini"
        return out
    return dict(bias=facts.split("\n")[0], outlook=[], by="template", headline="", vol_text="", asia_head="", asia_text="",
                news=["%s (%s)" % (t, s or "news") for _, t, s in headlines[:8]])


# ---------------------------------------------------------------- build
def gather(mock=False):
    syms = sorted(set(list(IDX.values()) + list(GLOBAL.values()) + list(ASIA.values()) + list(CMDTY.values())
                      + [s + ".NS" for s in NIFTY50]))
    if mock:
        import random
        random.seed(1)
        qs = {}
        for s in syms:
            b = random.uniform(100, 20000)
            ch = random.uniform(-2, 2)
            qs[s] = dict(last=b * (1 + ch / 100), prev=b, chg=b * ch / 100, pct=ch, date=today_ist().isoformat(),
                         hi=b * 1.01, lo=b * 0.99, vol=random.uniform(1e6, 5e6), avgvol=2e6)
        return qs, [(dt.datetime.now(dt.timezone.utc), "MOCK headline for layout test", "Mock")]
    return fetch_all(syms), news()


def today_ist():
    return dt.datetime.now(IST).date()


def movers(qs):
    st = [(s, qs.get(s + ".NS")) for s in NIFTY50]
    st = [(s, q) for s, q in st if q]
    st.sort(key=lambda x: -x[1]["pct"])
    shock = [(s, q) for s, q in st if q["avgvol"] and q["vol"] / q["avgvol"] >= 1.5]
    shock.sort(key=lambda x: -(x[1]["vol"] / x[1]["avgvol"]))
    return st[:5], st[::-1][:5], shock[:4]


def stock_rows(lst, withvol=False):
    out = []
    for s, q in lst:
        r = [s, f2(q["last"]), pct(q["pct"])]
        if withvol:
            r = [s, f2(q["last"]), "%.1fx avg vol" % (q["vol"] / q["avgvol"]), pct(q["pct"])]
        out.append(r)
    return out


def T(hd, rows, w=None, trend=True):
    t = {"type": "table", "headers": hd, "rows": rows, "trend": trend}
    if w:
        t["col_widths"] = w
    return t


def sec(h, blocks, style=None):
    s = {"heading": h, "blocks": blocks}
    if style:
        s["style"] = style
    return s


def P(t):
    return {"type": "paragraph", "text": t}


def B(items):
    return {"type": "bullets", "items": items or ["None flagged from the available data."]}


def facts_text(qs, gain, lose):
    def g(n, s):
        q = qs.get(s)
        return "%s: %s (%s)" % (n, f2(q["last"]), pct(q["pct"])) if q else "%s: n/a" % n
    lines = ["; ".join(g(n, s) for n, s in IDX.items())]
    lines.append("; ".join(g(n, s) for n, s in {**GLOBAL, **ASIA}.items()))
    lines.append("; ".join(g(n, s) for n, s in CMDTY.items()))
    if gain:
        lines.append("Nifty 50 top gainers: " + ", ".join("%s %s" % (s, pct(q["pct"])) for s, q in gain))
        lines.append("Nifty 50 top losers: " + ", ".join("%s %s" % (s, pct(q["pct"])) for s, q in lose))
    n = qs.get("^NSEI")
    pv = pivots(n)
    if pv:
        lines.append("Nifty pivot levels from the last session's high/low/close: S2 %s S1 %s Pivot %s R1 %s R2 %s"
                     % tuple(f2(pv[k], 0) for k in ("s2", "s1", "p", "r1", "r2")))
    return "\n".join(lines)


def build(sid, qs, heads, now):
    D = now.strftime("%d %b %Y")
    TM = now.strftime("%H:%M")
    gain, lose, shock = movers(qs)
    facts = facts_text(qs, gain, lose)
    cm = commentary(sid, facts, heads)
    if cm["by"] == "template":
        def lv_(k): 
            q = qs.get(k)
            return "%s (%s)" % (f2(q["last"]), pct(q["pct"])) if q else "n/a"
        cm["bias"] = ("Nifty 50 at %s and Sensex at %s in the latest session; Bank Nifty %s, India VIX %s. Brent crude %s, gold %s, "
                      "USD/INR %s. Global cues: Dow %s, Nasdaq %s, Nikkei %s." % (
                          lv_("^NSEI"), lv_("^BSESN"), lv_("^NSEBANK"), lv_("^INDIAVIX"), lv_("BZ=F"), lv_("GC=F"),
                          lv_("USDINR=X"), lv_("^DJI"), lv_("^IXIC"), lv_("^N225")))
        cm["asia_head"] = "Asia & Global Cues"
        cm["asia_text"] = ("Latest closes: Nikkei %s, Hang Seng %s, Shanghai %s, Kospi %s. Wall Street: Dow %s, S&P 500 %s, "
                           "Nasdaq %s." % tuple(lv_(k) for k in ("^N225", "^HSI", "000001.SS", "^KS11", "^DJI", "^GSPC", "^IXIC")))
        cm["vol_text"] = "India VIX %s; USD/INR %s; US 10-yr yield %s." % (lv_("^INDIAVIX"), lv_("USDINR=X"), lv_("^TNX"))
    pv = pivots(qs.get("^NSEI"))
    note = ("Auto-generated at %s IST by the Joshi's Corner data pipeline (Yahoo Finance prices, Google News "
            "headlines; commentary %s). GIFT Nifty, MCX, FII/DII and option-chain data are not available to "
            "this pipeline and show as n/a." % (TM, "drafted by Gemini from those inputs only" if cm["by"] == "gemini"
                                                else "templated from the numbers only"))
    base = dict(report_subtitle="Joshi's Corner", report_date=D, report_time=TM + " IST",
                generated_line="Generated: %s, %s IST" % (D, TM), as_of_note=note, disclaimer=DISC)
    ind = [row(n, qs.get(s)) for n, s in IDX.items()]
    glo = [row(n, qs.get(s)) for n, s in GLOBAL.items()]
    asi = [row(n, qs.get(s)) for n, s in ASIA.items()]
    cmd = [row(n, qs.get(s)) for n, s in CMDTY.items()]
    lv = ([["Nifty 50", f2(pv["s1"], 0), f2(pv["r1"], 0)]] if pv else []) + \
         ([["Nifty 50 (2nd)", f2(pv["s2"], 0), f2(pv["r2"], 0)]] if pv else [])
    nxt = next_trading_day(now.date())
    exp = expiry_text(nxt if sid.startswith("evening") else now.date())
    bias = cm["bias"]
    headl = cm["news"] or ["No fresh headlines could be fetched."]
    lvl_note = {"type": "note", "text": "Levels are classic pivot points computed from the last session's high, low "
                "and close, not a recommendation."}
    if sid == "evening-market-wrap":
        return dict(base, report_title="Evening Market Wrap", sections=[
            sec("Today's Close in Brief", [P(bias)], "framed"),
            sec("Indian Market Snapshot", [T(["Index", "Close", "% Chg"], ind, [.5, .25, .25])]),
            sec("Global Market Wrap", [T(["Index", "Level", "% Chg"], glo + asi, [.5, .25, .25])]),
            sec("Currencies, Commodities & Bonds", [T(["Item", "Level", "% Chg"], cmd, [.5, .25, .25])]),
            sec("Stocks in Focus (Nifty 50)", [T(["Top gainers", "Close (Rs)", "% Chg"], stock_rows(gain), [.5, .25, .25]),
                                               T(["Top losers", "Close (Rs)", "% Chg"], stock_rows(lose), [.5, .25, .25])]),
            sec("Volume Shockers - Watch for Tomorrow", [T(["Stock", "Close (Rs)", "Volume", "% Chg"],
                                                           stock_rows(shock, True), [.3, .25, .25, .2])]
                if shock else B(["No Nifty 50 stock traded at 1.5x or more of its 20-day average volume."])),
            sec("Near-Term Outlook", [B(cm["outlook"]), T(["Index", "Support", "Resistance"], lv, [.4, .3, .3], False), lvl_note]),
            sec("Next Session", [B([exp])])])
    if sid == "evening-news-wrap":
        return dict(base, report_title="Evening News Wrap", sections=[
            sec("Market Movers", [B(["%s %s (Rs %s)" % (s, pct(q["pct"]), f2(q["last"])) for s, q in gain[:3] + lose[:3]])]),
            sec("Headlines That Moved Markets", [B(headl)]),
            sec("Calendar for %s" % nxt.strftime("%A, %d %b"), [B([exp, "Pre-market global cues arrive in the 8:00 AM Pre-Market News."])]),
            sec("What to Watch", [B(cm["outlook"])])])
    if sid == "premarket-news":
        return dict(base, report_title="Market News", sections=[
            sec("Top Headlines", [B(headl)]),
            sec("Overnight Global Cues", [T(["Index", "Level", "% Chg"], glo + asi, [.5, .25, .25])]),
            sec("Calendar", [B([exp])])])
    if sid == "morning-brief":
        return dict(base, report_title="JCGG - Morning Updates (Brief)", sections=[
            sec("Today's Bias in Brief", [P(bias)], "framed"),
            sec("Global & Asian Markets", [T(["Index", "Level", "% Chg"], glo + asi, [.5, .25, .25])]),
            sec("Commodities & Currency", [T(["Item", "Level", "% Chg"], cmd, [.5, .25, .25])]),
            sec("India VIX & Previous Close", [T(["Index", "Close", "% Chg"], ind, [.5, .25, .25])]),
            sec("Key Levels to Watch", [T(["Index", "Support", "Resistance"], lv, [.4, .3, .3], False), lvl_note]),
            sec("Alerts for the Day", [B([exp])])])
    if sid == "morning-detailed":
        return dict(base, report_title="JCGG - Morning Updates (Detailed)", sections=[
            sec("Today's Bias in Brief", [P(bias)], "framed"),
            sec("Global Markets Close", [T(["Index", "Level", "% Chg"], glo, [.5, .25, .25])]),
            sec("Asian Markets", [T(["Index", "Level", "% Chg"], asi, [.5, .25, .25])]),
            sec("Commodities, Currency & Bonds", [T(["Item", "Level", "% Chg"], cmd, [.5, .25, .25])]),
            sec("Indian Markets - Previous Session", [T(["Index", "Close", "% Chg"], ind, [.5, .25, .25])]),
            sec("Key Levels to Watch", [T(["Index", "Support", "Resistance"], lv, [.4, .3, .3], False), lvl_note]),
            sec("Outlook", [B(cm["outlook"])]),
            sec("Stocks in Focus (previous session)", [T(["Top gainers", "Close (Rs)", "% Chg"], stock_rows(gain), [.5, .25, .25]),
                                                       T(["Top losers", "Close (Rs)", "% Chg"], stock_rows(lose), [.5, .25, .25])]),
            sec("Headlines", [B(headl)]),
            sec("Alerts for the Day", [B([exp])])])
    if sid == "morning-pulse":
        n, s_, bn = qs.get("^NSEI"), qs.get("^BSESN"), qs.get("^NSEBANK")
        vix = qs.get("^INDIAVIX")
        def lv(q):
            p = pivots(q)
            return p
        def zone(a, b_):
            lo, hi = sorted([a, b_])
            return "%s - %s" % (f2(lo, 0), f2(hi, 0))
        levels = []
        for nm, q in (("Nifty 50", n), ("Bank Nifty", bn)):
            p = lv(q)
            if p:
                levels.append({"name": nm.replace(" ", "\n", 1) if False else nm, "s": zone(p["s2"], p["s1"]), "r": zone(p["r1"], p["r2"]),
                               "note": "A sustained move above %s opens up %s; a slide below %s would expose %s."
                                       % (f2(p["r1"], 0), f2(p["r2"], 0), f2(p["s1"], 0), f2(p["s2"], 0))})
            else:
                levels.append({"name": nm, "s": "n/a", "r": "n/a", "note": "Levels not available."})
        vv = vix["last"] if vix else None
        gfrac = 0.5 if vv is None else min(1, max(0, 1 - (vv - 10) / 20))  # low VIX = calm = right side
        spark_vals = []
        try:
            j = json.loads(http("https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=1mo&interval=1d"))
            spark_vals = [c for c in j["chart"]["result"][0]["indicators"]["quote"][0]["close"] if c][-18:]
        except Exception:
            pass
        def tile(nm, sub, q, d=2):
            return {"name": nm, "sub": sub, "value": f2(q["last"], d) if q else "n/a", "pct": pct(q["pct"]) if q else "n/a"}
        codes = {"Dow Jones": "US", "S&P 500": "US", "Nasdaq Composite": "US", "FTSE 100": "UK", "DAX": "DE",
                 "Nikkei 225": "JP", "Hang Seng": "HK", "Shanghai Composite": "CN", "Kospi": "KR"}
        bench = [{"name": k, "code": codes.get(k, ""), "level": f2(qs.get(v)["last"]) if qs.get(v) else "n/a",
                  "pct": pct(qs[v]["pct"]) if qs.get(v) else "n/a"} for k, v in {**GLOBAL, **ASIA}.items()]
        npct = n["pct"] if n else 0
        head = cm.get("headline") or ("Nifty %s at %s" % (pct(npct), f2(n["last"], 0)) if n else "Market snapshot")
        vtxt = cm.get("vol_text") or ("India VIX closed at %s (%s); USD/INR at %s."
                                      % (f2(vv), pct(vix["pct"]) if vix else "n/a", f2(qs.get("USDINR=X")["last"], 3) if qs.get("USDINR=X") else "n/a"))
        movers_txt = "Top Nifty 50 gainers: %s. Top losers: %s." % (
            ", ".join("%s %s" % (s2, pct(q["pct"])) for s2, q in gain[:3]) or "n/a",
            ", ".join("%s %s" % (s2, pct(q["pct"])) for s2, q in lose[:3]) or "n/a")
        bottom = [
            {"title": "Latest Headlines", "icon": "list", "text": " | ".join(re.sub(r"\s*[-|]\s*[^-|]{3,40}$", "", x)[:95] for x in headl[:2])},
            {"title": "Biggest Movers (Nifty 50)", "icon": "chart", "text": movers_txt},
            {"title": "F&O Expiry Schedule Note", "icon": "cal", "text": exp + " Bank Nifty has monthly expiry only (last Tuesday)."}]
        return {"title": "Morning Market Brief: Global Trends, Key Levels & Daily Alerts (%s)" % now.strftime("%d %b %Y"),
                "headline": head, "bias_text": bias,
                "spark": spark_vals, "spark_label": "Nifty 50 daily closes, last %d sessions" % len(spark_vals) if spark_vals else "",
                "vix": {"gauge": gfrac, "headline": "India VIX %s (%s)" % (f2(vv), pct(vix["pct"]) if vix else "n/a"), "text": vtxt},
                "tiles": [tile("Nifty 50", "prev close", n), tile("Brent Crude", "US$/bbl", qs.get("BZ=F")),
                          tile("Gold Spot", "US$/oz", qs.get("GC=F")), tile("India VIX", "close", vix),
                          tile("USD/INR", "latest", qs.get("USDINR=X"), 3), tile("US 10-yr", "yield %", qs.get("^TNX"))],
                "bench": bench,
                "asia": {"head": cm.get("asia_head") or "Asia & Global Cues",
                         "text": cm.get("asia_text") or "Asian and global index moves are shown in the benchmark table; official GIFT Nifty and MCX figures are not available to this pipeline."},
                "levels": levels, "bottom": bottom,
                "footnote": "Auto-generated %s IST | Prices: Yahoo Finance | Headlines: Google News | Commentary: %s | GIFT Nifty, MCX, FII/DII not available (n/a). Levels are classic pivots from the last session."
                            % (TM, "Gemini" if cm["by"] == "gemini" else "template"),
                "disclaimer": "Not investment advice. Markets carry risk."}
    raise SystemExit("unsupported id " + sid)


# ---------------------------------------------------------------- main
def already_done(sid, today):
    try:
        idx = json.load(open(os.path.join(ROOT, "reports", sid, "index.json")))
    except Exception:
        return False
    return any(r["date"] == today.isoformat() and r["status"] in ("ok", "holiday") for r in idx["runs"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sid")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--out", default="/tmp/auto_reports")
    ap.add_argument("--dry", action="store_true", help="fetch real data and render, but do not publish")
    a = ap.parse_args()
    mock = os.environ.get("AUTO_MOCK") == "1"
    now = dt.datetime.now(IST)
    if now.weekday() >= 5 and not a.force:
        print("Weekend; nothing to do.")
        return
    if not a.force and not mock and not a.dry and already_done(a.sid, now.date()):
        print("%s already published today; skipping (fallback not needed)." % a.sid)
        return
    qs, heads = gather(mock)
    n = qs.get("^NSEI")
    pub = [sys.executable, os.path.join(HERE, "publish.py"), a.sid]
    if not n and not mock and not a.dry:
        subprocess.run(pub + ["--status", "failed", "--note", "Auto pipeline could not fetch index data (Yahoo unavailable)."])
        sys.exit("No Nifty data; marked failed.")
    if a.sid.startswith("evening") and n and n["date"] != now.date().isoformat() and not a.force and not mock and not a.dry:
        subprocess.run(pub + ["--status", "holiday", "--note", "No NSE session today (last bar %s)." % n["date"]])
        return
    cfg = build(a.sid, qs, heads, now)
    if a.dry and os.environ.get("GEMINI_API_KEY") and "commentary: Gemini" not in json.dumps(cfg) and "drafted by Gemini" not in json.dumps(cfg):
        print("::error::Gemini not used: " + LAST_ERR[0].replace("\n", " ")[:400])
        sys.exit("DRY CHECK FAILED")
    os.makedirs(a.out, exist_ok=True)
    stem = {"premarket-news": "Market_News", "morning-brief": "JCGG_Morning_Updates_Brief",
            "morning-detailed": "JCGG_Morning_Updates_Detailed", "morning-pulse": "JCGG_Morning_Pulse_Infographic",
            "evening-market-wrap": "Evening_Market_Wrap", "evening-news-wrap": "Evening_News_Wrap"}[a.sid]
    pdf = os.path.join(a.out, "%s_%s.pdf" % (stem, now.strftime("%Y-%m-%d")))
    cj = os.path.join(a.out, a.sid + ".json")
    json.dump(cfg, open(cj, "w"), indent=1)
    png = pdf[:-4] + ".png"
    if a.sid == "morning-pulse":
        subprocess.check_call([sys.executable, os.path.join(HERE, "render_pulse_board.py"), "--config", cj, "--png", png, "--pdf", pdf])
    else:
        subprocess.check_call([sys.executable, os.path.join(HERE, "render_pdf.py"), "--config", cj, "--output", pdf])
    if a.dry and not n:
        sys.exit("DRY: no Nifty data fetched from Yahoo")
    if mock or a.dry:
        print("DRY/MOCK run: rendered", pdf, "(not published)")
        return
    files = ["--file", pdf] + (["--file", png] if a.sid == "morning-pulse" else [])
    subprocess.check_call(pub + files + ["--caption", "%s %s (auto pipeline)" % (a.sid, now.strftime("%d %b"))])


if __name__ == "__main__":
    main()
