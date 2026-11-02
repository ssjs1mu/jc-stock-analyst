#!/usr/bin/env python3
"""F&O open-interest walls per stock -> data/fno_oi.json  (source: public option-chain page, strike-wise OI as of the last close, nearest expiry).
callWall = strike with the highest call OI at/above spot (resistance), putWall = highest put OI at/below spot (support); next walls = next two biggest."""
import json, re, sys, time, urllib.request, datetime, concurrent.futures as cf
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "Accept": "text/html"}
def num(x):
    try: return float(x.replace(",", ""))
    except ValueError: return None
def one(sym):
    try:
        h = urllib.request.urlopen(urllib.request.Request("https://www.topstockresearch.com/rt/ViewOptionChain/" + sym.replace("&", "%26"), headers=UA), timeout=30).read().decode("utf-8", "replace")
    except Exception:
        return sym, None
    tx = re.sub(r"\s+", " ", re.sub(r"&nbsp;", " ", re.sub(r"<[^>]+>", " ", h)))
    m = re.search(r"Spot Close\s*:\s*([\d.]+)", tx); e = re.search(r"Expiry date\s*:\s*(\d{2}/\d{2}/\d{4})", tx)
    if not m: return sym, None
    spot = float(m.group(1)); rows = []
    for r in re.findall(r"<tr[\s\S]*?</tr>", h):
        t = [re.sub(r"<[^>]+>", "", x).replace("&nbsp;", " ").strip() for x in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", r)]
        if len(t) == 11 and num(t[0]) is not None:
            rows.append((num(t[0]), num(t[4]) or 0, num(t[7]) or 0))     # strike, call OI, put OI
    if len(rows) < 8: return sym, None
    ce, pe = sum(r[1] for r in rows), sum(r[2] for r in rows)
    ab = sorted([r for r in rows if r[0] >= spot and r[1] > 0], key=lambda r: -r[1])[:3]; be = sorted([r for r in rows if r[0] <= spot and r[2] > 0], key=lambda r: -r[2])[:3]
    near = lambda side, up: sorted([r for r in rows if (r[0] >= spot if up else r[0] <= spot) and r[side] >= 0.35 * max(x[side] for x in rows)], key=lambda r: abs(r[0] - spot))[:1]
    nr, ns = near(1, True), near(2, False)
    return sym, {"spot": spot, "expiry": e.group(1) if e else None, "pcr": round(pe / ce, 2) if ce else None, "ce": ce, "pe": pe,
                 "callWall": ab[0][0] if ab else None, "putWall": be[0][0] if be else None, "callOi": [[a[0], a[1]] for a in ab], "putOi": [[b[0], b[2]] for b in be],
                 "nearRes": nr[0][0] if nr else None, "nearSup": ns[0][0] if ns else None}
def main():
    c = json.load(open("data/constituents.json"))["idx"]; syms = sorted(set(c.get("^CNX200", []) + c.get("NIFTY_MIDCAP_100.NS", []) + c.get("^NSEI", []) + c.get("^NSEBANK", [])))
    out = {}
    with cf.ThreadPoolExecutor(6) as ex:
        for s, d in ex.map(one, syms):
            if d: out[s] = d
    print(len(out), "F&O stocks of", len(syms), file=sys.stderr)
    if len(out) < 30: sys.exit("too few chains parsed - keeping the old file")
    json.dump({"asof": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), "source": "public option-chain page (OI as of last close, nearest expiry)", "stocks": out}, open("data/fno_oi.json", "w"), separators=(",", ":"))
main()
