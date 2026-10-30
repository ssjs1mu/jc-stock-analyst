#!/usr/bin/env python3
"""Real-data helpers for the booklets: corporate actions and data due on a given day, and the Nifty put-call ratio.
Every function returns None / empty when the source cannot be reached - callers show 'n/a', never filler."""
import datetime as dt, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_OP = [None]


def _op():
    if _OP[0] is None:
        import results_cal
        _OP[0] = results_cal.opener()
    return _OP[0]


def _get(url):
    import results_cal
    return results_cal.get(_op(), url)


def results_due(d):
    """Board meetings with financial results on date d (from data/results.json): (big names first, total)."""
    try:
        up = json.load(open(os.path.join(ROOT, "data", "results.json"))).get("upcoming", {})
        ix = json.load(open(os.path.join(ROOT, "data", "constituents.json")))["idx"]
        big = set(ix.get("^CNX100", [])) | set(ix.get("^CNX200", []))
    except Exception:
        return [], 0
    ds = d.isoformat()
    syms = sorted(s for s, L in up.items() if any(x.get("date") == ds for x in L))
    return sorted(syms, key=lambda s: (s not in big, s)), len(syms)


def corp_actions(d):
    """Ex-dates (dividend, split, bonus, rights ...) falling on date d, from NSE. [] when unavailable."""
    f = d.strftime("%d-%m-%Y")
    j = _get("https://www.nseindia.com/api/corporates-corporateActions?index=equities&from_date=%s&to_date=%s" % (f, f))
    rows = j if isinstance(j, list) else (j or {}).get("data", []) if isinstance(j, dict) else []
    out = []
    for r in rows:
        try:
            ex = dt.datetime.strptime(str(r.get("exDate")), "%d-%b-%Y").date()
        except Exception:
            continue
        if ex == d:
            out.append({"sym": r.get("symbol"), "what": (r.get("subject") or "").strip()[:70]})
    return out


def data_due(d):
    """Scheduled macro releases on date d (India time) for INR/USD/CNY/EUR/GBP/JPY, medium+high impact. None if the feed is down."""
    import urllib.request
    seen, out, ok = set(), [], False
    for u in ("https://nfs.faireconomy.media/ff_calendar_thisweek.json", "https://nfs.faireconomy.media/ff_calendar_nextweek.json"):
        try:
            rq = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
            rows = json.loads(urllib.request.urlopen(rq, timeout=25).read().decode())
            ok = True
        except Exception as ex:
            print("data_due:", u[-22:], ex)
            continue
        for r in rows:
            try:
                t = dt.datetime.fromisoformat(r["date"]).astimezone(dt.timezone(dt.timedelta(hours=5, minutes=30)))
            except Exception:
                continue
            if t.date() != d or r.get("impact") not in ("High", "Medium") or r.get("country") not in ("USD", "INR", "CNY", "EUR", "GBP", "JPY"):
                continue
            k = (t, r["title"])
            if k in seen:
                continue
            seen.add(k)
            out.append({"t": t.strftime("%H:%M"), "ccy": r["country"], "title": r["title"][:60], "hi": r.get("impact") == "High", "fc": r.get("forecast") or ""})
    out.sort(key=lambda x: (not x["hi"], x["t"]))
    return out if ok else None


def pcr_nifty():
    """Put-call ratio by open interest for the nearest Nifty expiry (NSE option chain). None if unavailable."""
    j = _get("https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY")
    try:
        rec = j["records"]
        ex = rec["expiryDates"][0]
        ce = pe = 0
        for r in rec["data"]:
            if r.get("expiryDate") == ex:
                ce += (r.get("CE") or {}).get("openInterest", 0)
                pe += (r.get("PE") or {}).get("openInterest", 0)
        if ce > 0:
            return {"pcr": pe / ce, "expiry": ex, "ts": rec.get("timestamp", "")}
    except Exception as ex_:
        print("pcr:", ex_)
    return None
