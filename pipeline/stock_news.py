#!/usr/bin/env python3
"""Stocks in the news (Morning Sunrise pages).

Company-specific news published since the previous session's close (15:30 IST of the last trading day), from
free public sources only:
  * publisher RSS feeds (Economic Times, Moneycontrol, Business Standard, Mint, BusinessLine, Financial Express, NDTV Profit)
  * BSE corporate announcements (the companies' own exchange filings)
Each item is matched to a listed company of the tracked universe (data/weights.json, ~300 large and mid caps) by
company name, then ranked by expected price impact:
  impact class of the news (results, orders, deals, regulator action ... > brokerage calls, launches ... > other)
  x company size (free-float market cap) + extra publishers carrying the same story + official filing.
Nothing is invented: the brief is the publisher's own summary (or the filing's own text), cut to two sentences, and
every item names its source. Items with no usable summary keep the headline only.

  python pipeline/stock_news.py --out /tmp/sn/news.json [--raw /tmp/sn/raw] [--now 2026-11-23T08:00]
"""
import argparse
import datetime as dt
import email.utils
import html
import io
import csv
import json
import math
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept": "application/rss+xml, application/xml, text/xml, application/json, */*", "Accept-Language": "en-IN,en;q=0.9"}

FEEDS = [
    ("Economic Times", "https://economictimes.indiatimes.com/markets/stocks/news/rssfeeds/2146842.cms"),
    ("Economic Times", "https://economictimes.indiatimes.com/markets/stocks/earnings/rssfeeds/2143429.cms"),
    ("Economic Times", "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms"),
    ("Economic Times", "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"),
    ("Moneycontrol", "https://www.moneycontrol.com/rss/buzzingstocks.xml"),
    ("Moneycontrol", "https://www.moneycontrol.com/rss/results.xml"),
    ("Moneycontrol", "https://www.moneycontrol.com/rss/business.xml"),
    ("Moneycontrol", "https://www.moneycontrol.com/rss/marketreports.xml"),
    ("Moneycontrol", "https://www.moneycontrol.com/rss/latestnews.xml"),
    ("Business Standard", "https://www.business-standard.com/rss/markets-106.rss"),
    ("Business Standard", "https://www.business-standard.com/rss/companies-101.rss"),
    ("Mint", "https://www.livemint.com/rss/companies"),
    ("Mint", "https://www.livemint.com/rss/markets"),
    ("BusinessLine", "https://www.thehindubusinessline.com/markets/stock-markets/feeder/default.rss"),
    ("BusinessLine", "https://www.thehindubusinessline.com/companies/feeder/default.rss"),
    ("Financial Express", "https://www.financialexpress.com/market/feed/"),
    ("NDTV Profit", "https://feeds.feedburner.com/ndtvprofit-latest"),
]

# ---------------------------------------------------------------- impact classes (first match wins inside a class)
A = [  # moves prices on the day
    ("RESULTS", r"\b(q[1-4]|quarter(ly)?|results?|earnings|net profit|profit (jumps|rises|falls|drops|surges|slumps|declines|grows)|pat\b|ebitda|revenue (jumps|rises|falls|drops|grows|declines)|margin)"),
    ("ORDER", r"\b(orders?|contracts?|bags|wins|letter of (award|intent)|loa\b|l1 bidder|tender)"),
    ("DEAL", r"\b(acquir\w*|acquisition|merger|merge|demerg\w*|amalgamat\w*|takeover|open offer|stake (buy|sale|in)|buys .*stake|sells .*stake|joint venture|jv\b|divest\w*)"),
    ("FUNDS", r"\b(block deal|bulk deal|ofs\b|offer for sale|qip\b|rights issue|fund ?rais\w*|raises? rs|ncd\b|preferential|ipo\b|listing)"),
    ("REGULATOR", r"\b(sebi|rbi|usfda|fda|warning letter|import alert|observations?|form 483|penalty|fine[ds]?\b|ban(s|ned)?\b|raid|probe|investigation|ed\b|cbi\b|show[- ]cause|tax demand|gst (notice|demand)|nclt|insolven\w*|court|tribunal|cci\b)"),
    ("CORP ACTION", r"\b(buyback|bonus|stock split|split|dividend|record date)"),
    ("MANAGEMENT", r"\b(resign\w*|steps down|appoint\w*|ceo|managing director|\bmd\b|cfo|chairman|promoter (sells|buys|pledge\w*)|pledge)"),
    ("RATING", r"\b(moody'?s|fitch|s&p|crisil|icra|care ratings|india ratings)\b.*\b(upgrade|downgrade|rating|outlook)|\b(upgrades?|downgrades?)\b.*\brating"),
    ("OPERATIONS", r"\b(fire|explosion|blast|shutdown|shut down|strike|plant (closure|halt)|outage|accident|recall)"),
    ("APPROVAL", r"\b(approval|approves|nod|licen[cs]e|patent|clearance)"),
    ("GUIDANCE", r"\b(guidance|outlook (raised|cut)|forecast)"),
]
B = [  # can move prices
    ("BROKERAGE", r"\b(target price|price target|\btarget\b|overweight|underweight|outperform|underperform|neutral|initiates? coverage|jefferies|morgan stanley|clsa|goldman|nomura|macquarie|jp ?morgan|citi\b|bernstein|ubs\b|hsbc|motilal|kotak institutional|nuvama|emkay)"),
    ("BUSINESS", r"\b(sales|volumes?|business update|deliveries|dispatches|market share|subscribers)\b"),
    ("EXPANSION", r"\b(expansion|capacity|capex|new plant|commission\w*|launch\w*|unveil\w*|partnership|partners|tie[- ]up|mou\b|collaborat\w*|agreement|deal)\b"),
    ("SHARES", r"\b(shares? (jump|surge|rally|soar|rise|gain|fall|drop|slump|tank|plunge|crash|decline)\w*|hits? (52|record|upper|lower)|upper circuit|lower circuit|52-week)"),
]
POS = r"\b(jump|surge|rall|soar|rise|rises|gain|wins|bags|beat|record high|upgrade|approval|approves|nod|buy\b|overweight|outperform|bonus|buyback|dividend|profit (jumps|rises|surges|grows)|order|expan|raises target)"
NEG = r"\b(fall|falls|drop|slump|tank|plunge|crash|declin|miss|downgrade|penalty|fine[ds]?\b|ban|raid|probe|warning letter|import alert|resign|steps down|sell\b|underweight|underperform|loss|cuts target|fire|shutdown|strike|default|pledge|insolven|show[- ]cause|tax demand)"
ROUNDUP = r"(stocks? to (watch|buy|sell)|buzzing stocks|top (gainers|losers|picks)|stocks in (news|focus)|market (live|wrap|close|update)|sensex|nifty \d|nifty (today|ends|closes|opens)|trade setup|stock picks|stocks that|shares to buy|f&o ban)"
STOP = {"india", "indian", "national", "bharat", "hindustan", "general", "united", "central", "global", "power", "bank", "asian", "oriental", "eastern",
        "western", "southern", "northern", "premier", "super", "grand", "great", "royal", "golden", "silver", "diamond", "crystal", "prime", "first",
        "supreme", "standard", "universal", "international", "capital", "finance", "steel", "metal", "energy", "shree", "shri", "sri", "star", "gold",
        "sun", "life", "home", "data", "tech", "info", "city", "trust", "union", "state", "new", "best", "focus", "sigma", "globe", "crown", "alpha",
        "delta", "ideal", "vision", "future", "smart", "modern", "classic", "cement", "motors", "auto", "paints", "chemicals", "pharma", "health",
        "foods", "textiles", "industries", "housing", "ports", "green", "solar", "wind", "cable", "cables", "infra", "projects", "systems", "network",
        "computer", "aditya", "birla", "tata", "adani", "bajaj", "mahindra", "godrej", "reliance", "jindal", "jsw", "hdfc", "icici", "kotak",
        "torrent", "sundaram", "kirloskar", "murugappa", "shriram", "muthoot", "piramal", "hero", "max", "apollo", "fortis", "indus", "punjab",
        "kalyan", "jubilant", "ambuja", "ultra", "titan", "voltas", "havells", "dixon", "trent", "eicher", "cipla", "lupin", "astral", "page",
        "aster", "metro", "phoenix", "prestige", "brigade", "sobha", "oberoi", "lodha", "zydus", "glenmark", "alkem", "natco", "granules"}
SHORT = {  # well-known short names used in headlines (only for stocks in the universe)
    "RELIANCE": ["Reliance Industries", "Reliance", "RIL"], "SBIN": ["State Bank of India", "SBI"], "LT": ["Larsen & Toubro", "L&T"],
    "M&M": ["Mahindra & Mahindra", "M&M"], "HINDUNILVR": ["Hindustan Unilever", "HUL"], "BHARTIARTL": ["Bharti Airtel", "Airtel"],
    "MARUTI": ["Maruti Suzuki", "Maruti"], "ETERNAL": ["Eternal", "Zomato"], "PAYTM": ["Paytm", "One 97"], "NYKAA": ["Nykaa"],
    "KOTAKBANK": ["Kotak Mahindra Bank", "Kotak Bank"], "BAJFINANCE": ["Bajaj Finance"], "BAJAJFINSV": ["Bajaj Finserv"], "BAJAJ-AUTO": ["Bajaj Auto"],
    "SUNPHARMA": ["Sun Pharma"], "DRREDDY": ["Dr Reddy's", "Dr. Reddy's", "Dr Reddy"], "TCS": ["TCS", "Tata Consultancy"], "HCLTECH": ["HCLTech", "HCL Tech"],
    "TECHM": ["Tech Mahindra"], "INFY": ["Infosys"], "WIPRO": ["Wipro"], "ADANIENT": ["Adani Enterprises", "Adani Ent"], "ADANIPORTS": ["Adani Ports"],
    "ADANIPOWER": ["Adani Power"], "ADANIGREEN": ["Adani Green"], "ADANIENSOL": ["Adani Energy Solutions"], "INDIGO": ["IndiGo", "InterGlobe"],
    "VEDL": ["Vedanta"], "COALINDIA": ["Coal India"], "POWERGRID": ["Power Grid"], "HEROMOTOCO": ["Hero MotoCorp"], "EICHERMOT": ["Eicher Motors", "Royal Enfield"],
    "ASIANPAINT": ["Asian Paints"], "ULTRACEMCO": ["UltraTech"], "NESTLEIND": ["Nestle India"], "TATASTEEL": ["Tata Steel"], "TATAPOWER": ["Tata Power"],
    "TATACONSUM": ["Tata Consumer"], "JIOFIN": ["Jio Financial"], "LICI": ["LIC", "Life Insurance Corporation"], "IDFCFIRSTB": ["IDFC First"],
    "BANKBARODA": ["Bank of Baroda"], "CANBK": ["Canara Bank"], "UNIONBANK": ["Union Bank"], "PNB": ["Punjab National Bank", "PNB"],
    "DMART": ["DMart", "Avenue Supermarts"], "LTM": ["LTIMindtree"], "HYUNDAI": ["Hyundai Motor India", "Hyundai India"], "LGEINDIA": ["LG Electronics India"],
    "OLAELEC": ["Ola Electric"], "SWIGGY": ["Swiggy"], "JSWSTEEL": ["JSW Steel"], "JSWENERGY": ["JSW Energy"], "HDFCBANK": ["HDFC Bank"], "HDFCLIFE": ["HDFC Life"],
    "HDFCAMC": ["HDFC AMC"], "ICICIBANK": ["ICICI Bank"], "ICICIPRULI": ["ICICI Prudential Life"], "ICICIGI": ["ICICI Lombard"], "AXISBANK": ["Axis Bank"],
    "INDUSINDBK": ["IndusInd Bank"], "YESBANK": ["Yes Bank"], "APOLLOHOSP": ["Apollo Hospitals"], "MAXHEALTH": ["Max Healthcare"], "TITAN": ["Titan"],
    "TRENT": ["Trent"], "GODREJPROP": ["Godrej Properties"], "GODREJCP": ["Godrej Consumer"], "SHRIRAMFIN": ["Shriram Finance"], "BEL": ["Bharat Electronics", "BEL"],
    "HAL": ["Hindustan Aeronautics", "HAL"], "BHEL": ["BHEL", "Bharat Heavy Electricals"], "ONGC": ["ONGC"], "NTPC": ["NTPC"], "IOC": ["Indian Oil", "IOC"],
    "BPCL": ["BPCL", "Bharat Petroleum"], "HINDPETRO": ["HPCL", "Hindustan Petroleum"], "GAIL": ["GAIL"], "ITC": ["ITC"], "IRFC": ["IRFC"], "RVNL": ["RVNL", "Rail Vikas"],
    "IRCTC": ["IRCTC"], "SUZLON": ["Suzlon"], "WAAREEENER": ["Waaree Energies"], "TMPV": ["Tata Motors Passenger", "TMPV"], "TMCV": ["Tata Motors CV", "TMCV"],
    "HINDALCO": ["Hindalco"], "GRASIM": ["Grasim"], "CIPLA": ["Cipla"], "DIVISLAB": ["Divi's Lab", "Divis Lab"], "BRITANNIA": ["Britannia"], "DABUR": ["Dabur"],
}


def http(url, data=None, headers=None, t=25):
    h = dict(UA, **(headers or {}))
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.read()


def clean(s):
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return re.sub(r"\s+", " ", s).strip()


def brief_of(desc, title):
    d = clean(desc)
    if not d:
        return ""
    k = lambda x: re.sub(r"\W+", "", x.lower())
    if k(d)[:60] == k(title)[:60] or len(d) < 40:
        return ""
    sents = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])", d)
    out = ""
    for s_ in sents:
        if k(s_)[:50] == k(title)[:50]:
            continue
        if len(out) + len(s_) > 260 and out:
            break
        out = (out + " " + s_).strip()
        if len(out) > 140:
            break
    if len(out) > 300:
        out = out[:297].rsplit(" ", 1)[0] + "..."
    return out


def parse_date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
        return d if d.tzinfo else d.replace(tzinfo=IST)
    except Exception:
        pass
    for f in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%d %b %Y %H:%M:%S"):
        try:
            d = dt.datetime.strptime(s[:26], f)
            return d if d.tzinfo else d.replace(tzinfo=IST)
        except Exception:
            continue
    return None


def rss(pub, url, raw=None):
    body = http(url)
    if raw:
        os.makedirs(raw, exist_ok=True)
        open(os.path.join(raw, re.sub(r"\W+", "_", url)[-80:] + ".xml"), "wb").write(body)
    root = ET.fromstring(body)
    out = []
    for it in root.iter("item"):
        t = clean(it.findtext("title"))
        if not t:
            continue
        d = it.findtext("description") or ""
        for ch in it:
            if ch.tag.endswith("encoded") and not d:
                d = ch.text or ""
        out.append(dict(title=t, brief=brief_of(d, t), source=pub, when=parse_date(it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date")),
                        link=(it.findtext("link") or "").strip(), official=False))
    return out


def bse(since, now, raw=None):
    """BSE corporate announcements (company filings) between two dates."""
    a, z = since.strftime("%Y%m%d"), now.strftime("%Y%m%d")
    out, page = [], 1
    hdr = {"Referer": "https://www.bseindia.com/", "Origin": "https://www.bseindia.com", "Accept": "application/json, text/plain, */*"}
    while page <= 12:
        url = ("https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=%d&strCat=-1&strPrevDate=%s&strScrip=&strSearch=P"
               "&strToDate=%s&strType=C&subcategory=-1" % (page, a, z))
        j = json.loads(http(url, headers=hdr))
        rows = j.get("Table") or []
        if raw:
            os.makedirs(raw, exist_ok=True)
            json.dump(j, open(os.path.join(raw, "bse_%d.json" % page), "w"))
        for r in rows:
            t = clean(r.get("NEWSSUB") or r.get("HEADLINE"))
            body = clean(r.get("HEADLINE") or "")
            more = clean(r.get("MORE") or "")
            out.append(dict(title=t, brief=brief_of(more or body, t), source="BSE filing", when=parse_date(r.get("NEWS_DT") or r.get("DT_TM")),
                            link=("https://www.bseindia.com/xml-data/corpfiling/AttachLive/" + r["ATTACHMENTNAME"]) if r.get("ATTACHMENTNAME") else "",
                            official=True, company=clean(r.get("SLONGNAME") or ""), cat=clean(r.get("CATEGORYNAME") or "")))
        tot = (rows[0].get("TotalPageCnt") if rows else 0) or 0
        if not rows or page >= int(tot or 1):
            break
        page += 1
    return out


# ---------------------------------------------------------------- universe and name matching
def universe(raw=None):
    w = json.load(open(os.path.join(ROOT, "data", "weights.json")))["w"]
    names = {}
    try:
        body = http("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv").decode("latin-1")
        if raw:
            os.makedirs(raw, exist_ok=True)
            open(os.path.join(raw, "EQUITY_L.csv"), "w").write(body)
        for r in csv.DictReader(io.StringIO(body)):
            r = {k.strip(): (v or "").strip() for k, v in r.items()}
            if r.get("SYMBOL") in w:
                names[r["SYMBOL"]] = r.get("NAME OF COMPANY", "")
    except Exception as ex:
        print("EQUITY_L.csv:", ex)
    return w, names


def aliases(w, names):
    al = {}   # alias -> sym
    first = {}
    for s in w:
        n = names.get(s, "")
        base = re.sub(r"\b(limited|ltd\.?)\s*$", "", n, flags=re.I).strip(" .,")
        base = re.sub(r"^the\s+", "", base, flags=re.I)
        base = re.sub(r"\s*\(india\)\s*", " ", base, flags=re.I).strip()
        cand = set()
        if len(base) >= 5:
            cand.add(base)
            b2 = re.sub(r"\s+(india|of india)$", "", base, flags=re.I)
            if b2 != base and len(b2) >= 6 and b2.lower() not in STOP:
                cand.add(b2)
        cand.update(SHORT.get(s, []))
        if re.fullmatch(r"[A-Z]{3,}", s) and s.lower() not in STOP and len(s) >= 3 and s not in ("IOB", "BSE", "IEX", "MCX"):
            cand.add(s)
        for c in cand:
            al.setdefault(c, s)
        fw = base.split(" ")[0] if base else ""
        if len(fw) >= 6 and fw.lower() not in STOP and fw.isalpha():
            first.setdefault(fw, set()).add(s)
    for fw, ss in first.items():
        if len(ss) == 1:
            al.setdefault(fw, next(iter(ss)))
    for x in ("BSE", "IEX", "MCX"):  # exchanges that are also listed companies: only the company sense
        if x in w:
            al["%s Ltd" % x] = x
            al["%s shares" % x] = x
    keys = sorted(al, key=len, reverse=True)
    rx = re.compile(r"(?<![\w&])(" + "|".join(re.escape(k) for k in keys) + r")(?![\w&])")
    return al, rx


def match(text, al, rx):
    found = []
    for m in rx.finditer(text):
        s = al[m.group(1)]
        if s not in found:
            found.append(s)
    return found


def classify(t):
    lo = t.lower()
    for tag, r_ in A:
        if re.search(r_, lo):
            return tag, 100
    for tag, r_ in B:
        if re.search(r_, lo):
            return tag, 60
    return "NEWS", 30


def tone(t):
    lo = t.lower()
    p, n = len(re.findall(POS, lo)), len(re.findall(NEG, lo))
    return "up" if p > n else "dn" if n > p else ""


# ---------------------------------------------------------------- session window
def last_close(now):
    try:
        sys.path.insert(0, os.path.join(ROOT, "pipeline"))
        from auto_reports import is_trading_day
    except Exception:
        is_trading_day = lambda d: d.weekday() < 5
    d = now.date()
    if now.hour * 60 + now.minute < 15 * 60 + 30 or not is_trading_day(d):
        d -= dt.timedelta(days=1)
        while not is_trading_day(d):
            d -= dt.timedelta(days=1)
    return dt.datetime(d.year, d.month, d.day, 15, 30, tzinfo=IST)


def collect(now=None, raw=None, limit=20, log=print):
    now = now or dt.datetime.now(IST)
    since = last_close(now)
    w, names = universe(raw)
    if not names:
        log("stock news: company names unavailable")
        return {"since": since.isoformat(), "items": [], "status": {}}
    al, rx = aliases(w, names)
    status, items = {}, []

    def one(f):
        try:
            r = rss(f[0], f[1], raw)
            return f, r, None
        except Exception as ex:
            return f, [], str(ex)[:80]
    with ThreadPoolExecutor(8) as ex:
        for f, r, err in ex.map(one, FEEDS):
            status[f[1]] = err or len(r)
            items += r
    try:
        b = bse(since, now, raw)
        status["bse"] = len(b)
        items += b
    except Exception as ex_:
        status["bse"] = str(ex_)[:80]
    log("feeds:", json.dumps(status))
    lc = {s: re.sub(r"\W+", "", names.get(s, "").lower()) for s in w}
    per = {}
    for it in items:
        if not it["when"] or it["when"] < since or it["when"] > now + dt.timedelta(minutes=30):
            continue
        if it.get("official"):
            # filings: name match on the filing company; skip routine compliance filings
            c = re.sub(r"\W+", "", re.sub(r"\b(limited|ltd)\b", "", it.get("company", ""), flags=re.I).lower())
            sy = [s for s in w if lc.get(s) and (lc[s].replace("limited", "").replace("ltd", "") == c)]
            if not sy:
                continue
            if re.search(r"(trading window|newspaper|duplicate share|loss of share|certificate under reg|reg\.? ?74|74\(5\)|compliance certificate|investor (meet|conference)|analyst|earnings call|transcript|audio recording|closure of trading|esop|esos|allotment of (equity|shares) under|intimation of record date for interest|change in (address|rta)|press release$|shareholding pattern)", (it["title"] + " " + it.get("cat", "")).lower()):
                continue
        else:
            if re.search(ROUNDUP, it["title"].lower()):
                continue
            sy = match(it["title"], al, rx)
            if not sy or len(sy) > 2:          # roundups that name many stocks say little about each
                continue
        tag, base = classify(it["title"] + " " + (it.get("cat") or ""))
        for s in sy[:1]:
            mc = w.get(s) or 1e10
            size = 1 + 0.18 * max(-2, min(3, math.log10(mc / 1e11)))
            sc = base * size + (6 if it.get("official") else 0) + (4 if it["brief"] else 0)
            e = per.setdefault(s, {"sym": s, "name": names.get(s, s), "items": [], "pubs": set()})
            e["items"].append(dict(it, tag=tag, score=sc, tone=tone(it["title"] + " " + it["brief"])))
            e["pubs"].add(it["source"])
    out = []
    for s, e in per.items():
        e["items"].sort(key=lambda x: (-x["score"], -(x["when"].timestamp())))
        top = e["items"][0]
        # prefer the best item that has a summary when its score is close
        for x in e["items"]:
            if x["brief"] and x["score"] >= top["score"] - 8:
                top = x
                break
        sc = top["score"] + 8 * (len(e["pubs"]) - 1)
        others = sorted({x["source"] for x in e["items"]} - {top["source"]})
        out.append({"sym": s, "name": e["name"], "headline": top["title"], "brief": top["brief"], "source": top["source"],
                    "time": top["when"].astimezone(IST).strftime("%d %b %H:%M"), "tag": top["tag"], "tone": top["tone"], "score": round(sc, 1),
                    "also": others[:3], "n": len(e["items"]), "link": top.get("link", "")})
    out.sort(key=lambda x: -x["score"])
    return {"since": since.isoformat(), "asof": now.isoformat(), "items": out[:limit], "status": status, "matched": len(out)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--raw")
    ap.add_argument("--now", help="YYYY-MM-DDTHH:MM (IST)")
    ap.add_argument("--limit", type=int, default=20)
    a = ap.parse_args()
    now = dt.datetime.strptime(a.now, "%Y-%m-%dT%H:%M").replace(tzinfo=IST) if a.now else None
    r = collect(now, a.raw, a.limit)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(r, open(a.out, "w"), indent=1, default=str)
    print("matched %d stocks; top:" % r.get("matched", 0))
    for x in r["items"]:
        print(" %6.1f %-11s %-11s %s | %s" % (x["score"], x["sym"], x["tag"], x["headline"][:90], x["source"]))
