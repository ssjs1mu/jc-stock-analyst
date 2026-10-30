#!/usr/bin/env python3
"""Claude-independent report generator (runs in GitHub Actions, free).

Usage: python3 pipeline/auto_reports.py <schedule_id> [--force] [--out DIR]

Data: Yahoo Finance chart API (prices) + Google News RSS (headlines).
Commentary: rule-based writer by default (no paid API). Optional LLM only when USE_LLM=1; if the key is missing or the call
fails, a plain template paragraph built only from the numbers is used instead.

Fallback behaviour: if reports/<id>/index.json already holds an ok/holiday run for today
(IST) -- e.g. the Claude scheduled task published -- this script exits without doing anything,
unless --force. Never invents numbers: anything not fetched is printed as "n/a".
Supported ids: premarket-news, morning-brief, morning-detailed, morning-pulse, evening-breeze,
evening-market-wrap, evening-news-wrap. (circuit-watch needs NSE exchange files that block cloud servers,
so it is not generated here.)
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import glob
import json
import shutil
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brand
import outlook_rules as OR
import gift as GIFT

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IST = ZoneInfo("Asia/Kolkata")
UA = {"User-Agent": "Mozilla/5.0 (compatible; JoshisCornerBot/1.0)"}
DISC = brand.SHORT_DISCLAIMER
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


def is_trading_day(d):
    return d.weekday() < 5 and d.isoformat() not in NSE_HOLIDAYS


def next_trading_day(d):
    d += dt.timedelta(days=1)
    while not is_trading_day(d):
        d += dt.timedelta(days=1)
    return d


def _expiry_on_or_after(d, wd):
    """Weekly expiry for the week holding the next `wd` weekday on/after d; a holiday moves it to the previous trading day."""
    e = d + dt.timedelta(days=(wd - d.weekday()) % 7)
    x = e
    while not is_trading_day(x):
        x -= dt.timedelta(days=1)
    if x < d:  # this week's expiry already passed (moved earlier) -> next week's
        return _expiry_on_or_after(e + dt.timedelta(days=1), wd)
    return x


def _is_monthly(x, wd):
    """The last Tuesday (Nifty) / Thursday (Sensex) of a month is the MONTHLY expiry (a holiday-moved expiry is judged by its nominal weekday)."""
    nom = x + dt.timedelta(days=(wd - x.weekday()) % 7)
    return (nom + dt.timedelta(days=7)).month != nom.month


def expiry_text(d):
    """SEBI mapping: Nifty weekly = Tuesday, Sensex weekly = Thursday; the last of the month is the MONTHLY expiry; an exchange holiday moves expiry to the previous trading day."""
    nf, sx = _expiry_on_or_after(d, 1), _expiry_on_or_after(d, 3)
    kind = lambda x, wd: "MONTHLY" if _is_monthly(x, wd) else "weekly"
    out = []
    if nf == d:
        out.append("Nifty %s expiry today (%s)%s." % (kind(nf, 1), d.strftime("%a %d %b %Y"), "" if d.weekday() == 1 else " (moved from Tuesday's holiday)"))
    if sx == d:
        out.append("Sensex %s expiry today (%s)%s." % (kind(sx, 3), d.strftime("%a %d %b %Y"), "" if d.weekday() == 3 else " (moved from Thursday's holiday)"))
    if not out:
        out.append("Next Nifty %s expiry: %s; next Sensex %s expiry: %s."
                   % (kind(nf, 1), nf.strftime("%a %d %b %Y"), kind(sx, 3), sx.strftime("%a %d %b %Y")))
    return " ".join(out)


LAST_ERR = ["no key in environment"]


def pick_model(key):
    """Newest text 'flash' model that supports generateContent (model names change; don't hardcode)."""
    try:
        req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
                                     headers={"x-goog-api-key": key})
        ms = json.loads(urllib.request.urlopen(req, timeout=30).read()).get("models", [])
        names = [m["name"].split("/")[-1] for m in ms if "generateContent" in m.get("supportedGenerationMethods", [])]
        bad = ("image", "tts", "audio", "live", "thinking", "embedding", "preview", "exp", "robotics", "computer")
        cand = [n for n in names if ("flash" in n or "pro" in n) and not any(b in n for b in bad)]
        def ver(n):
            m = re.search(r"gemini-(\d+(?:\.\d+)?)", n)
            return float(m.group(1)) if m else 0
        # plain flash first, then flash-lite, then pro; newest version first within each group
        grp = lambda n: 0 if "lite" not in n and "pro" not in n else (1 if "lite" in n else 2)
        cand.sort(key=lambda n: (grp(n), -ver(n), len(n)))
        if cand:
            print("Gemini models:", cand[:4])
            return cand[:4]
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


def claude_json(prompt):
    """Backup writer: Anthropic API (ANTHROPIC_API_KEY secret). Small model, tiny cost."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    import time
    model = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-5-5")
    body = json.dumps({"model": model, "max_tokens": 1500, "temperature": 0.3,
                       "messages": [{"role": "user", "content": prompt + "\nReturn ONLY the JSON object, no other text."}]}).encode()
    for attempt in range(3):
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
                                     headers={"Content-Type": "application/json", "x-api-key": key,
                                              "anthropic-version": "2023-06-01"})
        try:
            j = json.loads(urllib.request.urlopen(req, timeout=90).read())
            txt = "".join(b.get("text", "") for b in j["content"] if b.get("type") == "text")
            m = re.search(r"\{.*\}", txt, re.S)
            return json.loads(m.group(0))
        except urllib.error.HTTPError as e:
            LAST_ERR[0] += " | Claude HTTP %s %s" % (e.code, e.read()[:200].decode("utf8", "replace"))
            if e.code not in (429, 500, 502, 503, 504, 529):
                break
        except Exception as e:
            LAST_ERR[0] += " | Claude " + str(e)[:200]
        time.sleep(5 * (attempt + 1))
    return None


LAST_BY = ["template"]


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
    out, by = None, "template"
    if os.environ.get("USE_LLM") == "1":   # optional extra only; reports never depend on any paid/subscribed API
        out, by = gemini(prompt), "gemini"
        if not (out and isinstance(out.get("bias"), str)):
            out, by = claude_json(prompt), "claude"
    if out and isinstance(out.get("bias"), str):
        out["outlook"] = [str(x) for x in out.get("outlook", [])][:6]
        out["news"] = [str(x) for x in out.get("news", [])][:8]
        for k in ("headline", "vol_text", "asia_head", "asia_text"):
            out[k] = str(out.get(k, "")).strip()
        out["by"] = by
        LAST_BY[0] = by
        return out
    return dict(bias=facts.split("\n")[0], outlook=[], by="template", headline="", vol_text="", asia_head="", asia_text="",
                news=[clean_head(t) for _, t, s in headlines[:8]])


def clean_head(t):
    """Headline text only: no publisher name (reports never disclose sources)."""
    t = re.sub(r"\s*\((?:[^()]{2,40})\)\s*$", "", str(t))
    for _ in range(2):
        t = re.sub(r"\s+[-|\u2013\u2014]\s+[^-|\u2013\u2014]{3,45}$", "", t)
    return re.sub(r"\s+", " ", t).strip()


def cut(t, n=110):
    t = clean_head(t)
    if len(t) <= n:
        return t
    return t[:n].rsplit(" ", 1)[0].rstrip(",;:-") + "..."


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


def build_eve(qs, heads, now):
    """Evening Breeze: end-of-day booklet data (closing levels, movers, flows, next-session levels)."""
    gain, lose, shock = movers(qs)
    cm = commentary("evening-market-wrap", facts_text(qs, gain, lose), heads)
    n = qs.get("^NSEI")
    npc = float(n["pct"]) if n else 0.0
    k = "bull" if npc >= 0.3 else "bear" if npc <= -0.3 else "neutral"
    label = {"bull": "Positive close", "bear": "Weak close", "neutral": "Range-bound close"}[k]
    mood = {"key": k, "label": label, "sub": "Nifty %s in the session" % pct(npc)}
    def _q(key, d=2):
        q = qs.get(key)
        return (f2(q["last"], d), pct(q["pct"])) if q else ("n/a", "n/a")
    bn, vx = qs.get("^NSEBANK"), qs.get("^INDIAVIX")
    tone = "gains" if npc > 0.15 else "slips" if npc < -0.15 else "ends little changed"
    head = "Nifty %s %.2f%%" % (tone, abs(npc)) if abs(npc) > 0.15 else "Nifty ends little changed"
    if bn and abs(bn["pct"] - npc) >= 0.3:
        head += ", Banks %s" % ("lead" if bn["pct"] > npc else "lag")
    snapshot = []
    for nm, key in (("Nifty 50", "^NSEI"), ("Sensex", "^BSESN"), ("Bank Nifty", "^NSEBANK"), ("Nifty 500", "^CRSLDX")):
        if qs.get(key):
            lv_, pc_ = _q(key)
            snapshot.append({"name": nm, "sub": "close", "level": lv_, "pct": pc_})
    spark_vals = []
    try:
        j = json.loads(http("https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=1mo&interval=1d"))
        spark_vals = [c for c in j["chart"]["result"][0]["indicators"]["quote"][0]["close"] if c][-18:]
    except Exception:
        pass
    st = [qs.get(s_ + ".NS") for s_ in NIFTY50]
    up_n, dn_n = sum(1 for q in st if q and q["pct"] > 0), sum(1 for q in st if q and q["pct"] < 0)
    flows = None
    try:
        fj = json.load(open(os.path.join(ROOT, "data", "fiidii.json")))["daily"]
        dkey = max(fj)
        flows = {"date": dt.datetime.strptime(dkey, "%Y-%m-%d").strftime("%d %b"), "fii": fj[dkey]["fii_net"], "dii": fj[dkey]["dii_net"]}
    except Exception:
        pass
    summary = ("%s Banks: Bank Nifty %s. India VIX %s. Brent crude %s, USD/INR %s. %d of 50 Nifty stocks advanced and %d declined."
               % ((cm.get("bias") or "").split(". ")[0] + "." if False else "Nifty 50 closed at %s (%s) and Sensex at %s (%s)." % (*_q("^NSEI"), *_q("^BSESN")),
                  _q("^NSEBANK")[1], "%s (%s)" % _q("^INDIAVIX"), _q("BZ=F")[1], _q("USDINR=X", 3)[0], up_n, dn_n))
    levels = []
    def zone(a, b_):
        lo, hi = sorted([a, b_])
        return "%s - %s" % (f2(lo, 0), f2(hi, 0))
    for nm, key in (("Nifty 50", "^NSEI"), ("Bank Nifty", "^NSEBANK")):
        pvx = pivots(qs.get(key))
        if pvx:
            levels.append({"name": nm, "s": zone(pvx["s2"], pvx["s1"]), "r": zone(pvx["r1"], pvx["r2"]),
                           "note": "A close above %s opens up %s; a slide below %s would expose %s." % (f2(pvx["r1"], 0), f2(pvx["r2"], 0), f2(pvx["s1"], 0), f2(pvx["s2"], 0))})
    nxt = next_trading_day(now.date())
    events = [expiry_text(nxt)]
    codes = {**GLOBAL, **ASIA}
    bench = [{"name": k_, "code": "", "level": f2(qs[v]["last"]) if qs.get(v) else "n/a", "pct": pct(qs[v]["pct"]) if qs.get(v) else "n/a"} for k_, v in codes.items()]
    short_nm = {"Brent crude (US$/bbl)": "Brent crude US$/bbl", "WTI crude (US$/bbl)": "WTI crude US$/bbl", "Gold (US$/oz, Comex)": "Gold US$/oz",
                "USD/INR": "USD / INR", "Dollar index (DXY)": "Dollar index", "US 10-yr yield (%)": "US 10-yr yield %"}
    cmd_t = [{"name": short_nm.get(nm_, nm_), "level": _q(k_, 3 if k_ == "USDINR=X" else 2)[0], "pct": _q(k_, 3 if k_ == "USDINR=X" else 2)[1]} for nm_, k_ in CMDTY.items()]
    vv = vx["last"] if vx else None
    gfrac = 0.5 if vv is None else min(1, max(0, 1 - (vv - 10) / 20))
    vtxt = cm.get("vol_text") or "India VIX %s." % _q("^INDIAVIX")[0]
    headl = list(dict.fromkeys(cut(clean_head(x), 130) for x in cm["news"] if x)) or ["No fresh headlines could be fetched."]
    # expected next-session opening (GIFT Nifty leads when available)
    gift = None
    if not os.environ.get("AUTO_MOCK"):
        try:
            gift = GIFT.fetch(float(qs["^NSEI"]["last"]))
        except Exception as ex:
            print("gift:", ex)
    pv_ = pivots(qs.get("^NSEI"))
    ov = OR.opening_view(qs, pv_, gift)
    gtxt = None
    if gift:
        gtxt = {"last": f2(gift["last"], 1), "pct": ("%+.2f%%" % gift["pct"]) if gift.get("pct") is not None else "", "premium": "%+.0f pts" % gift.get("premium", 0),
                "vs": "%+.2f%%" % gift.get("vs_pct", 0), "asof": gift["asof"].strftime("%d %b %H:%M") if gift.get("asof") else ""}
    nxt_txt = nxt.strftime("%A, %d %B %Y")
    opening = {"label": ov["label"], "zone": ov["zone"], "headline": ov["headline"], "drivers": ov.get("drivers", [])[:5], "next": nxt_txt, "mood": ov["mood"], "gift": gtxt,
               "anchored": bool(gift)}
    # volatility movers: widest intraday swings (high-low as % of last) among Nifty 50 stocks
    swings = []
    for s_ in NIFTY50:
        q_ = qs.get(s_ + ".NS")
        try:
            if q_ and q_["hi"] and q_["lo"] and q_["last"]:
                swings.append((s_, q_, (q_["hi"] - q_["lo"]) / q_["last"] * 100))
        except Exception:
            pass
    swings.sort(key=lambda x: -x[2])
    vol_movers = [[s_, f2(q_["last"]), "%.1f%%" % r_, pct(q_["pct"])] for s_, q_, r_ in swings[:6]]
    # price + volume together: a real move (>= 1%) on above-average volume
    pv_up, pv_dn = [], []
    for s_ in NIFTY50:
        q_ = qs.get(s_ + ".NS")
        try:
            if q_ and q_["avgvol"]:
                ratio = q_["vol"] / q_["avgvol"]
                if ratio >= 1.2 and q_["pct"] >= 1.0:
                    pv_up.append((s_, q_, ratio))
                elif ratio >= 1.2 and q_["pct"] <= -1.0:
                    pv_dn.append((s_, q_, ratio))
        except Exception:
            pass
    pv_up.sort(key=lambda x: -x[2]); pv_dn.sort(key=lambda x: -x[2])
    pvrow = lambda L: [[s_, f2(q_["last"]), "%.1fx vol" % r_, pct(q_["pct"])] for s_, q_, r_ in L[:4]]
    book = {"edition": "evening", "date_txt": now.strftime("%d %b %Y"), "date_iso": now.strftime("%Y-%m-%d"), "mood": mood, "label": label, "headline": head,
            "summary": summary, "snapshot": snapshot, "spark": spark_vals, "flows": flows, "breadth": {"up": up_n, "dn": dn_n}, "levels": levels, "events": events,
            "bench": bench, "cmd": cmd_t, "vix": {"level": f2(vv), "pct": pct(vx["pct"]) if vx else "n/a", "gauge": gfrac, "text": vtxt},
            "headlines": headl, "gainers": stock_rows(gain), "losers": stock_rows(lose), "shock": stock_rows(shock, True),
            "opening": opening, "vol_movers": vol_movers, "pv_up": pvrow(pv_up), "pv_dn": pvrow(pv_dn), "asof": now.strftime("%I:%M %p IST")}
    return {"book": book, "title": "Evening Breeze (%s)" % now.strftime("%d %b %Y"), "headline": head, "mood": mood, "mood_score": npc * 1.4,
            "edition": "evening", "disclaimer": brand.SHORT_DISCLAIMER}


def build(sid, qs, heads, now):
    if sid == "evening-breeze":
        return build_eve(qs, heads, now)
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
        # rule-based headline / outlook from the numbers only
        def pc(k):
            q = qs.get(k)
            try:
                return float(q["pct"])
            except Exception:
                return None
        nf, bn, vx = pc("^NSEI"), pc("^NSEBANK"), pc("^INDIAVIX")
        if nf is not None:
            tone = "Gains" if nf > 0.15 else ("Slips" if nf < -0.15 else "Little Changed")
            tail = ""
            if bn is not None and abs(bn - nf) >= 0.3:
                tail = ", Banks %s" % ("Lead" if bn > nf else "Lag")
            cm["headline"] = ("Nifty %s %.2f%%%s" % (tone, abs(nf), tail)) if tone != "Little Changed" else "Nifty Little Changed%s" % tail
        if vx is not None:
            cm["vol_text"] += " India VIX %s %.1f%% - %s." % ("eased" if vx < 0 else "rose", abs(vx), "volatility expectations cooling" if vx < 0 else "hedging demand up")
        if not cm.get("outlook"):
            ol = []
            pv = pivots(qs.get("^NSEI"))
            if pv:
                ol.append("Nifty 50 pivot support %s / %s, resistance %s / %s from the last session." % (f2(pv["s1"], 0), f2(pv["s2"], 0), f2(pv["r1"], 0), f2(pv["r2"], 0)))
            if gain:
                ol.append("Top Nifty gainers: " + ", ".join("%s %s" % (g[0], pct(g[1]["pct"])) for g in gain[:3]) + ".")
            if lose:
                ol.append("Top Nifty losers: " + ", ".join("%s %s" % (g[0], pct(g[1]["pct"])) for g in lose[:3]) + ".")
            cm["outlook"] = ol
    pv = pivots(qs.get("^NSEI"))
    morning = sid in ("premarket-news", "morning-brief", "morning-detailed", "morning-pulse")
    gift = None
    if morning and not os.environ.get("AUTO_MOCK"):
        try:
            gift = GIFT.fetch(float(qs["^NSEI"]["last"]))
        except Exception as ex:
            print("gift:", ex)
    ov = OR.opening_view(qs, pv, gift) if morning else None
    gnote = "Opening call anchored on GIFT Nifty." if gift else "GIFT Nifty not available at build time; indicative view from overnight cues."
    if morning:
        mood = {"key": ov["mood"], "label": ov["label"],
                "sub": ("Indicative Nifty opening zone %s" % ov["zone"]) if ov["zone"] else "Indicative, from overnight global cues"}
    else:
        try:
            npc = float(qs["^NSEI"]["pct"])
        except Exception:
            npc = 0.0
        k = "bull" if npc >= 0.3 else "bear" if npc <= -0.3 else "neutral"
        mood = {"key": k, "label": {"bull": "Positive close", "bear": "Weak close", "neutral": "Range-bound close"}[k],
                "sub": "Nifty %s in the session" % pct(npc)}
    base = dict(report_subtitle="Joshi's Corner", report_date=D, report_time=TM + " IST",
                generated_line="", disclaimer=DISC, mood=mood)
    ind = [row(n, qs.get(s)) for n, s in IDX.items()]
    glo = [row(n, qs.get(s)) for n, s in GLOBAL.items()]
    asi = [row(n, qs.get(s)) for n, s in ASIA.items()]
    cmd = [row(n, qs.get(s)) for n, s in CMDTY.items()]
    lv = ([["Nifty 50", f2(pv["s1"], 0), f2(pv["r1"], 0)]] if pv else []) + \
         ([["Nifty 50 (2nd)", f2(pv["s2"], 0), f2(pv["r2"], 0)]] if pv else [])
    nxt = next_trading_day(now.date())
    exp = expiry_text(nxt if sid.startswith("evening") else now.date())
    bias = cm["bias"]
    cm["news"] = list(dict.fromkeys(cut(x, 140) for x in cm["news"] if x))
    headl = cm["news"] or ["No fresh headlines could be fetched."]
    lvl_note = {"type": "note", "text": "Levels are classic pivot points computed from the last session's high, low "
                "and close, not a recommendation."}
    if sid == "evening-market-wrap":
        return dict(base, report_title="Evening Market Wrap", sections=[
            sec("Today's Close in Brief", [P(bias)], "framed"),
            sec("Indian Markets & Key Levels", [{"type": "pair",
                "left": T(["Index", "Close", "% Chg"], ind, [.44, .28, .28], False),
                "right": T(["Nifty levels", "Support", "Resistance"], lv, [.42, .29, .29], False)}]),
            sec("Global Markets, Currencies & Commodities", [{"type": "pair",
                "left": T(["Equities", "Level", "% Chg"], glo + asi, [.46, .27, .27], False),
                "right": T(["Crude, FX, bonds", "Level", "% Chg"], cmd, [.46, .27, .27], False)}]),
            sec("Stocks in Focus (Nifty 50)", [{"type": "pair",
                "left": T(["Top gainers", "Close (Rs)", "% Chg"], stock_rows(gain), [.4, .32, .28], False),
                "right": T(["Top losers", "Close (Rs)", "% Chg"], stock_rows(lose), [.4, .32, .28], False)}]),
            sec("Volume Shockers - Watch for Tomorrow", [T(["Stock", "Close (Rs)", "Volume", "% Chg"],
                                                           stock_rows(shock, True), [.3, .25, .25, .2])]
                if shock else B(["No Nifty 50 stock traded at 1.5x or more of its 20-day average volume."])),
            sec("Outlook & Next Session", [B(cm["outlook"][:2] + [exp]), lvl_note])])
    if sid == "evening-news-wrap":
        return dict(base, report_title="Evening News Wrap", sections=[
            sec("Market Movers", [B(["%s %s (Rs %s)" % (s, pct(q["pct"]), f2(q["last"])) for s, q in gain[:3] + lose[:3]])]),
            sec("Headlines That Moved Markets", [B(headl)]),
            sec("Calendar for %s" % nxt.strftime("%A, %d %b"), [B([exp, "Pre-market global cues arrive in the 8:00 AM Pre-Market News."])]),
            sec("What to Watch", [B(cm["outlook"])])])
    if morning:
        nxt_today = now.date()
        evs = OR.events_today(now, exp, qs)
        wl = OR.watch_list(qs, heads, gain, lose, shock, now, NIFTY50)
        wl_t = T(["Stock", "Trigger", "What to watch"], wl, [.16, .26, .58], False)
        wl_t["align"] = ["left", "left", "left"]
        ocl = [gnote + " Indicative only; the actual opening can differ with domestic news."]
        open_blocks = [P("%s. Expected Nifty opening zone: %s (indicative)." % (ov["headline"], ov["zone"] or "n/a"))] + \
                      [B(ov["drivers"])]
        if ov["yday"]:
            open_blocks.append(P("Carry-over from yesterday: " + ov["yday"]))
        open_blocks.append({"type": "note", "text": ocl[0]})
        open_sec = sec("Opening Outlook", open_blocks, "framed")
        ev_sec = sec("Events Today", [B(evs)])
        wl_sec = sec("Stocks to Watch", [wl_t] if wl else [B(["No specific triggers flagged for the open."])])
        hd_sec = sec("Headlines to Track", [B(headl[:4])])
        def pr(a_, b_):
            return {"type": "pair", "left": a_, "right": b_}
        cues = pr(T(["Equities", "Level", "% Chg"], glo + asi, [.46, .27, .27], False),
                  T(["Crude, FX, bonds", "Level", "% Chg"], cmd, [.46, .27, .27], False))
        lvl_sec = sec("Key Levels for Today", [T(["Index", "Support", "Resistance"], lv, [.4, .3, .3], False), lvl_note])
    if sid == "premarket-news":
        return dict(base, report_title="Pre-Market News", sections=[open_sec, hd_sec, ev_sec, wl_sec,
                    sec("Overnight Global Cues", [cues])])
    if sid == "morning-brief":
        return dict(base, report_title="JCGG - Morning Updates (Brief)", sections=[open_sec, wl_sec, ev_sec,
                    sec("Overnight Cues", [cues]), lvl_sec])
    if sid == "morning-detailed":
        return dict(base, report_title="JCGG - Morning Updates (Detailed)", sections=[open_sec, ev_sec, wl_sec, hd_sec,
                    sec("Overnight & Asian Cues", [cues]),
                    lvl_sec])
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
        head = ov["label"] + (" - Nifty zone " + ov["zone"] if ov["zone"] else "")
        vtxt = cm.get("vol_text") or ("India VIX closed at %s (%s); USD/INR at %s."
                                      % (f2(vv), pct(vix["pct"]) if vix else "n/a", f2(qs.get("USDINR=X")["last"], 3) if qs.get("USDINR=X") else "n/a"))
        movers_txt = "Top Nifty 50 gainers: %s. Top losers: %s." % (
            ", ".join("%s %s" % (s2, pct(q["pct"])) for s2, q in gain[:3]) or "n/a",
            ", ".join("%s %s" % (s2, pct(q["pct"])) for s2, q in lose[:3]) or "n/a")
        def short(x):
            return re.sub(r"\s*[-|]\s*[^-|]{3,40}$", "", x)[:80]
        bottom = [
            {"title": "Events Today", "icon": "cal", "text": " ".join(evs)[:260]},
            {"title": "Stocks to Watch", "icon": "chart", "text": "; ".join("%s (%s)" % (r[0], r[1]) for r in wl[:6]) or "No specific triggers flagged for the open."},
            {"title": "Headlines to Track", "icon": "list", "text": " | ".join(short(x) for x in headl[:2])}]
        open_text = ((lambda t: t[0].upper() + t[1:])(ov["headline"].split(": ", 1)[1]) + ". " if ": " in ov["headline"] else "") + \
                    (("Carry-over: " + ov["yday"] + " ") if ov["yday"] else "") + gnote
        try:
            proj = round(float(n["last"]) * (1 + ov["est"] / 100), 1)
        except Exception:
            proj = None
        bias_open = ("%s%s" % ((" ".join(ov["drivers"][:2]) + " ") if ov["drivers"] else "", ("Carry-over: " + ov["yday"] + " ") if ov["yday"] else "")) + gnote
        def _q(k, d=2):
            q = qs.get(k)
            return (f2(q["last"], d), pct(q["pct"])) if q else ("n/a", "n/a")
        snapshot = []
        for nm, k in (("Nifty 50", "^NSEI"), ("Sensex", "^BSESN"), ("Bank Nifty", "^NSEBANK"), ("Nifty 500", "^CRSLDX")):
            if qs.get(k):
                lv_, pc_ = _q(k)
                snapshot.append({"name": nm, "sub": "prev close", "level": lv_, "pct": pc_})
        short_nm = {"Brent crude (US$/bbl)": "Brent crude US$/bbl", "WTI crude (US$/bbl)": "WTI crude US$/bbl", "Gold (US$/oz, Comex)": "Gold US$/oz",
                    "USD/INR": "USD / INR", "Dollar index (DXY)": "Dollar index", "US 10-yr yield (%)": "US 10-yr yield %"}
        cmd_t = []
        for nm_, k in CMDTY.items():
            lv_, pc_ = _q(k, 3 if k == "USDINR=X" else 2)
            cmd_t.append({"name": short_nm.get(nm_, nm_), "level": lv_, "pct": pc_})
        def conv_lbl(c):
            return "Very high" if c >= 85 else "High" if c >= 70 else "Moderate" if c >= 50 else "Low"
        buys, sells, watch_buy = [], [], []
        try:
            bj = json.load(open(os.path.join(ROOT, "data", "calls", "board.json")))
            if bj.get("date") == now.date().isoformat():
                for sym, r in bj["rows"].items():
                    pp = r.get("p")
                    if pp and r.get("b") in ("BUY", "SELL"):
                        ent, sl_ = pp["e"], pp["sl"]
                        crow = {"sym": sym, "side": r["b"], "entry": f2(ent), "sl": f2(sl_), "t1": f2(pp["t1"]), "t2": f2(pp["t2"]),
                               "rr": "%.1f" % pp["rr"], "risk": f2(abs(ent - sl_)), "riskpct": "%.2f%%" % (abs(ent - sl_) / ent * 100),
                               "conv": int(r["conv"]), "convl": conv_lbl(r["conv"]), "grade": r.get("g", ""), "S": abs(r["S"]),
                               "why": [re.sub(r"\s+", " ", w)[:70] for w in r.get("why", [])[:2]]}
                        (buys if r["b"] == "BUY" else sells).append(crow)
                    elif r.get("lean") == "BUY" and r.get("b") == "WAIT" and r.get("S", 0) >= r.get("need", 8) - 1.5:
                        watch_buy.append({"sym": sym, "conv": int(r["conv"]), "S": r["S"], "why": (r.get("no") or "")[:80]})
                buys.sort(key=lambda z: -z["S"]); sells.sort(key=lambda z: -z["S"]); watch_buy.sort(key=lambda z: -z["S"])
        except Exception as ex:
            print("calls board:", ex)
        calls_t = {"buy": buys[:5], "sell": sells[:5], "watch_buy": watch_buy[:4]}
        pivrows = []
        for nm, k in (("Nifty 50", "^NSEI"), ("Bank Nifty", "^NSEBANK")):
            pvx = pivots(qs.get(k))
            if pvx:
                pivrows.append({"name": nm, "vals": [f2(pvx[z], 0) for z in ("s2", "s1", "p", "r1", "r2")]})
        gtxt = None
        if gift:
            gtxt = {"last": f2(gift["last"], 1), "pct": ("%+.2f%%" % gift["pct"]) if gift.get("pct") is not None else "", "premium": "%+.0f pts" % gift.get("premium", 0),
                    "vs": "%+.2f%%" % gift.get("vs_pct", 0), "asof": gift["asof"].strftime("%d %b %H:%M") if gift.get("asof") else ""}
        book = {"date_txt": now.strftime("%d %b %Y"), "date_iso": now.strftime("%Y-%m-%d"), "mood": mood, "label": ov["label"], "zone": ov["zone"], "headline": head,
                "open_text": open_text, "yday": ov["yday"], "spark": spark_vals, "proj": proj, "snapshot": snapshot, "levels": levels,
                "bench": bench, "cmd": cmd_t, "vix": {"level": f2(vv), "pct": pct(vix["pct"]) if vix else "n/a", "gauge": gfrac, "text": vtxt},
                "events": evs, "watch": wl, "headlines": [cut(x, 130) for x in headl[:8]], "calls": calls_t, "gift": gtxt,
                "gainers": stock_rows(gain), "losers": stock_rows(lose), "shock": stock_rows(shock, True), "pivots": pivrows, "est": ov["est"]}
        return {"book": book, "title": "Morning Market Brief: Global Trends, Key Levels & Daily Alerts (%s)" % now.strftime("%d %b %Y"),
                "headline": head, "bias_text": bias_open, "open_text": open_text, "proj": proj, "proj_label": "Today (est.)", "mood": mood, "mood_score": ov["score"],
                "spark": spark_vals, "spark_label": "Nifty 50 daily closes, last %d sessions" % len(spark_vals) if spark_vals else "",
                "vix": {"gauge": gfrac, "headline": "India VIX %s (%s)" % (f2(vv), pct(vix["pct"]) if vix else "n/a"), "text": vtxt},
                "tiles": [tile("Nifty 50", "prev close", n), tile("Brent Crude", "US$/bbl", qs.get("BZ=F")),
                          tile("Gold Spot", "US$/oz", qs.get("GC=F")), tile("India VIX", "close", vix),
                          tile("USD/INR", "latest", qs.get("USDINR=X"), 3), tile("US 10-yr", "yield %", qs.get("^TNX"))],
                "bench": bench,
                "asia": {"head": cm.get("asia_head") or "Asia & Global Cues",
                         "text": cm.get("asia_text") or "Asian and global index moves are shown in the benchmark table."},
                "levels": levels, "bottom": bottom,
                "movers": {"up": [{"sym": s2, "pct": pct(q["pct"])} for s2, q in gain[:3]], "dn": [{"sym": s2, "pct": pct(q["pct"])} for s2, q in lose[:3]]},
                "footnote": "", "disclaimer": brand.SHORT_DISCLAIMER}
    raise SystemExit("unsupported id " + sid)


# NSE equity trading holidays (exchange circular). Add the next year's list each December.
NSE_HOLIDAYS = {
    "2026-01-15": "Municipal elections (Maharashtra)", "2026-01-26": "Republic Day", "2026-03-03": "Holi",
    "2026-03-26": "Shri Ram Navami", "2026-03-31": "Shri Mahavir Jayanti", "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti", "2026-05-01": "Maharashtra Day", "2026-05-28": "Bakri Id",
    "2026-06-26": "Muharram", "2026-09-14": "Ganesh Chaturthi", "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-20": "Dussehra", "2026-11-10": "Diwali Balipratipada", "2026-11-24": "Guru Nanak Jayanti",
    "2026-12-25": "Christmas",
}


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
    if a.sid.startswith("evening") and now.hour < 6 and not a.force:
        # GitHub's cron can run an evening job hours late, after IST midnight. That run belongs to the PREVIOUS day:
        # without this it recorded a bogus 'holiday' for the new date ("No NSE session today (last bar ...)").
        now = (now - dt.timedelta(days=1)).replace(hour=23, minute=59)
    if now.weekday() >= 5 and not a.force:
        print("Weekend; nothing to do.")
        return
    if not a.force and not mock and not a.dry and already_done(a.sid, now.date()):
        print("%s already published today; skipping (fallback not needed)." % a.sid)
        return
    pub = [sys.executable, os.path.join(HERE, "publish.py"), a.sid]
    hol = NSE_HOLIDAYS.get(now.date().isoformat())
    if hol and not a.force and not mock and not a.dry:
        subprocess.run(pub + ["--status", "holiday", "--note", "NSE closed today: %s." % hol])
        print("NSE holiday (%s); recorded, no report." % hol)
        return
    qs, heads = gather(mock)
    n = qs.get("^NSEI")
    if not n and not mock and not a.dry:
        subprocess.run(pub + ["--status", "failed", "--note", "Auto pipeline could not fetch index data (market data unavailable)."])
        sys.exit("No Nifty data; marked failed.")
    if a.sid.startswith("evening") and n and n["date"] != now.date().isoformat() and not a.force and not mock and not a.dry:
        subprocess.run(pub + ["--status", "holiday", "--note", "No NSE session today (last bar %s)." % n["date"]])
        return
    cfg = build(a.sid, qs, heads, now)
    if a.dry and (os.environ.get("GEMINI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")) and LAST_BY[0] == "template":
        print("::error::No AI writer used: " + LAST_ERR[0].replace("\n", " ")[:400])
        sys.exit("DRY CHECK FAILED")
    os.makedirs(a.out, exist_ok=True)
    stem = {"premarket-news": "Market_News", "morning-brief": "JCGG_Morning_Updates_Brief",
            "morning-detailed": "JCGG_Morning_Updates_Detailed", "morning-pulse": "JCGG_Morning_Pulse_Infographic",
            "evening-market-wrap": "Evening_Market_Wrap", "evening-news-wrap": "Evening_News_Wrap",
            "evening-breeze": "JCGG_Evening_Breeze"}[a.sid]
    pdf = os.path.join(a.out, "%s_%s.pdf" % (stem, now.strftime("%Y-%m-%d")))
    cj = os.path.join(a.out, a.sid + ".json")
    json.dump(cfg, open(cj, "w"), indent=1)
    png = pdf[:-4] + ".png"
    mpng = os.path.join(a.out, "JCGG_Morning_Pulse_Mobile_%s.png" % now.strftime("%Y-%m-%d"))
    if a.sid == "evening-breeze":
        mpng = os.path.join(a.out, "JCGG_Evening_Breeze_Mobile_%s.png" % now.strftime("%Y-%m-%d"))
        subprocess.check_call([sys.executable, os.path.join(HERE, "render_booklet.py"), "--config", cj, "--out", mpng])
        open(pdf, "wb").close()
        png = None
    elif a.sid == "morning-pulse":
        subprocess.check_call([sys.executable, os.path.join(HERE, "render_pulse_board.py"), "--config", cj, "--png", png, "--pdf", pdf])
        try:   # 4-page opening booklet, portrait 1080x1350, for phones / Instagram / Facebook / WhatsApp
            subprocess.check_call([sys.executable, os.path.join(HERE, "render_booklet.py"), "--config", cj, "--out", mpng])
        except Exception as ex:
            print("mobile render failed:", ex)
    else:
        subprocess.check_call([sys.executable, os.path.join(HERE, "render_pdf.py"), "--config", cj, "--output", pdf])
    if a.dry and not n:
        sys.exit("DRY: no Nifty data fetched from Yahoo")
    if mock or a.dry:
        print("DRY/MOCK run: rendered", pdf, "(not published)")
        return
    # structured copy of the report (same content as the PDF) for the terminal's Today's Outlook page
    js = pdf[:-4] + ".json"
    shutil.copyfile(cj, js)
    if a.sid == "evening-breeze":
        files = [x for f in sorted(glob.glob(mpng[:-4] + "_*.png")) for x in ("--file", f)] + ["--file", js]
        subprocess.check_call(pub + files + ["--caption", "Evening Breeze %s" % now.strftime("%d %b")])
        return
    files = ["--file", pdf] + (["--file", png] + [x for f in sorted(glob.glob(mpng[:-4] + "_*.png")) for x in ("--file", f)] if a.sid == "morning-pulse" else []) + ["--file", js]
    subprocess.check_call(pub + files + ["--caption", "%s %s" % (a.sid.replace("-", " ").title(), now.strftime("%d %b"))])


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback
        print("::warning title=trace::" + traceback.format_exc().replace("\n", " | ")[-900:])
        raise
