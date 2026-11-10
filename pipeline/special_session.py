"""Special trading sessions (Diwali Muhurat on a weekend) are missing from the daily price feed, so the next
session's change was being measured from the close before it. This module supplies the special session's own
closing prices so 'previous close' is right.

Closes live in data/special_sessions.json: {date: {"source": ..., "close": {yahoo_symbol: close}}}. Index values
that were verified by hand are seeded there; everything else is filled from the NSE archives (security-wise
bhavcopy for stocks, ind_close_all for indices) the first time it is needed, on the GitHub runner."""
import csv, datetime as dt, io, json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PATH = os.path.join(ROOT, "data", "special_sessions.json")
IDX_NAMES = {"NIFTY 50": "^NSEI", "NIFTY BANK": "^NSEBANK", "NIFTY 500": "^CRSLDX", "INDIA VIX": "^INDIAVIX"}
IDX_URL = "https://nsearchives.nseindia.com/content/indices/ind_close_all_%s.csv"


def dates():
    """ISO dates of special sessions that fall on a non-weekday (from data/festivals.json)."""
    try:
        days = json.load(open(os.path.join(ROOT, "data", "festivals.json")))["days"]
    except Exception:
        return []
    out = []
    for x in days:
        d = (x.get("muhurat") or {}).get("date") or (x["date"] if x.get("special") else None)
        if d and dt.date.fromisoformat(d).weekday() >= 5:
            out.append(d)
    return sorted(set(out))


def _load():
    try:
        return json.load(open(PATH))
    except Exception:
        return {}


def closes(date_iso, fetch=True):
    """-> {yahoo_symbol: close} for that special session (may be partial if the archives are unreachable)."""
    allj = _load()
    ent = allj.setdefault(date_iso, {"source": "", "close": {}})
    cl = ent.setdefault("close", {})
    if not fetch or ent.get("complete"):
        return cl
    import delivery
    d = dt.date.fromisoformat(date_iso)
    got_s = got_i = 0
    try:
        txt = delivery.fetch_day(d)
        if txt and txt not in ("HTTP403", "ERR") and delivery.file_date(txt) == d:
            rd = csv.reader(io.StringIO(txt)); hdr = [h.strip().upper() for h in next(rd)]; ix = {h: i for i, h in enumerate(hdr)}
            for r in rd:
                if len(r) >= len(hdr) and r[ix["SERIES"]].strip() == "EQ":
                    c = delivery.fnum(r[ix["CLOSE_PRICE"]])
                    if c:
                        cl[r[ix["SYMBOL"]].strip().upper() + ".NS"] = c; got_s += 1
    except Exception as ex:
        print("special session: stock closes not fetched:", ex)
    try:
        req = urllib.request.Request(IDX_URL % d.strftime("%d%m%Y"), headers=delivery.UA)
        txt = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")
        rd = csv.reader(io.StringIO(txt)); hdr = [h.strip().upper() for h in next(rd)]
        ni, ci = hdr.index("INDEX NAME"), hdr.index("CLOSING INDEX VALUE")
        for r in rd:
            k = IDX_NAMES.get(r[ni].strip().upper()) if len(r) > ci else None
            if k:
                cl[k] = delivery.fnum(r[ci]); got_i += 1
    except Exception as ex:
        print("special session: index closes not fetched:", ex)
    if got_s > 400 and got_i >= 3:
        ent["complete"] = True
    if got_s or got_i:
        ent["source"] = (ent.get("source") or "") + " | NSE archives (bhavcopy %d stocks, %d indices)" % (got_s, got_i)
        json.dump(allj, open(PATH, "w"), indent=1, sort_keys=True)
    print("special session %s: %d stock closes, %d index closes from NSE; %d symbols in file" % (date_iso, got_s, got_i, len(cl)))
    return cl


def fix(qs, fetch=True):
    """Re-base 'prev' on the special session's close for every quote whose last two daily bars straddle it.
    qs: {symbol: dict(last, prev, chg, pct, date, pdate, ...)}. Returns the symbols corrected."""
    done = []
    for D in dates():
        need = [s for s, q in qs.items() if q and q.get("pdate") and q["pdate"] < D < q["date"] and (s.endswith(".NS") or s in ("^NSEI", "^BSESN", "^NSEBANK", "^CRSLDX", "^INDIAVIX"))]
        if not need:
            continue
        cl = closes(D, fetch)
        for s in need:
            c = cl.get(s)
            if c:
                q = qs[s]; q["prev"] = float(c); q["chg"] = q["last"] - q["prev"]; q["pct"] = q["chg"] / q["prev"] * 100; q["pdate"] = D
                done.append(s)
        print("special session %s: previous close corrected for %d of %d symbols" % (D, len([s for s in need if cl.get(s)]), len(need)))
    return done
