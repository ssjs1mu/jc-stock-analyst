#!/usr/bin/env python3
"""Trend read for 'Stocks in the news' (Morning Sunrise): direction, strength and measured odds per stock.

Inputs (already in the repo, no paid data):
  data/ohlc.json         daily O/H/L/C, ~500 stocks (refreshed every evening by delivery.yml)
  data/delivery.json     daily delivered / traded quantity
  data/stock_stats.json  last evening's Sector Digest facts: futures OI build-up, stock PCR, sector money flow
  the news item (impact class, tone) and the morning's market mood.

1. Measured part (odds). Every stock-day in the stored history is put in a "setup" cell:
     RSI-14 zone (<30, 30-45, 45-60, 60-70, >=70) x the day's move (<-3 %, -3..-1, -1..+1, +1..+3, >+3 %)
     x price above / below its 20-DMA x market breadth (share of stocks above their 20-DMA: <45 %, 45-55, >55 %),
     with high-volume days (>= 1.5x the 20-day average) counted in their own cells.
   For each cell: how often the close 3 sessions later was higher / lower, and the average move. Today's setup is looked up;
   cells with < 150 cases fall back to a coarser cell (without breadth, then without the 20-DMA, then without volume).
2. Context (not in the stored history, so it shifts the view but not the odds): futures OI build-up (long build-up +1,
   short covering +0.5, short build-up -1, long unwinding -0.5), stock PCR (>= 1.2 +0.5, <= 0.6 -0.5), sector money flow
   (IN +0.5 / OUT -0.5), the news (results / orders / deals / regulator ... +-1, other company news +-0.5 by tone),
   morning mood (+-0.5).
   The odds shown are walk-forward TESTED odds: setups learnt on the first half of the history, scored on the unseen second half
   (per band of predicted odds, the up / down rate actually seen there). Edge = tested up-rate minus the all-stock up-rate of that half.
   View score = edge / 2 + context: >= 1.5 bullish, <= -1.5 bearish, else range-bound; strength from its size.
The evening facts are archived daily (data/stock_stats_hist.json) so the OI / PCR part can be measured once enough days exist."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = 3
MIN_N = 150


def _load(name):
    try:
        return json.load(open(os.path.join(ROOT, "data", name)))
    except Exception:
        return None


def series():
    o = (_load("ohlc.json") or {}).get("d", {})
    dv = (_load("delivery.json") or {}).get("d", {})
    days = sorted(o)
    S = {}
    for d in days:
        for s, v in o[d].items():
            S.setdefault(s, []).append((d, v[3], (dv.get(d) or {}).get(s)))
    return days, S


def feats(rows):
    """per index: technical inputs (None until 50 clean sessions); history restarts after a > 25 % gap (split / bonus)."""
    out = [None] * len(rows)
    c = [r[1] for r in rows]
    start, g, l, rsi = 0, None, None, None
    for i in range(1, len(c)):
        if not c[i] or not c[i - 1] or abs(c[i] / c[i - 1] - 1) > 0.25:
            start, g, l, rsi = i, None, None, None
            continue
        n = i - start
        dlt = c[i] - c[i - 1]
        rsip = rsi
        if n < 14:
            g = (g or 0) + max(dlt, 0); l = (l or 0) + max(-dlt, 0)
            continue
        if n == 14:
            g = (g + max(dlt, 0)) / 14; l = (l + max(-dlt, 0)) / 14
        else:
            g = (g * 13 + max(dlt, 0)) / 14; l = (l * 13 + max(-dlt, 0)) / 14
        rsi = 100 - 100 / (1 + g / l) if l else 100
        if n < 50:
            continue
        s20 = sum(c[i - 19:i + 1]) / 20
        s50 = sum(c[i - 49:i + 1]) / 50
        q = [rows[k][2][1] for k in range(i - 20, i) if rows[k][2] and rows[k][2][1]]
        dq = rows[i][2]
        vm = (dq[1] / (sum(q) / len(q))) if dq and dq[1] and len(q) >= 10 else None
        dp = (dq[0] / dq[1] * 100) if dq and dq[1] else None
        out[i] = dict(c=c[i], pct=dlt / c[i - 1] * 100, s20=s20, s50=s50, rsi=rsi, rsip=rsip, vm=vm, dp=dp)
    return out


def zr(r):
    return 0 if r < 30 else 1 if r < 45 else 2 if r < 60 else 3 if r < 70 else 4


def zm(p):
    return 0 if p < -3 else 1 if p < -1 else 2 if p <= 1 else 3 if p <= 3 else 4


def zb(b):
    return None if b is None else 0 if b < 45 else 1 if b <= 55 else 2


def keys(f, br):
    """most to least specific setup keys"""
    base = (zr(f["rsi"]), zm(f["pct"]))
    a20 = int(f["c"] > f["s20"])
    b = zb(br)
    ks = []
    if f["vm"] and f["vm"] >= 1.5:
        ks += [("v",) + base + (a20, b), ("v",) + base + (a20,), ("v",) + base]
    ks += [base + (a20, b), base + (a20,), base]
    return ks


def build_model():
    days, S = series()
    F = {s: feats(rows) for s, rows in S.items()}
    br = {}
    for s, rows in S.items():
        for (d, _, _), f in zip(rows, F[s]):
            if f:
                a = br.setdefault(d, [0, 0]); a[0] += f["c"] > f["s20"]; a[1] += 1
    br = {d: a[0] / a[1] * 100 for d, a in br.items() if a[1] >= 50}
    cells = {}
    base = [0, 0, 0, 0.0]
    for s, rows in S.items():
        f = F[s]
        for i in range(len(rows) - H):
            if not f[i]:
                continue
            c0, c1 = rows[i][1], rows[i + H][1]
            if not c0 or not c1 or abs(c1 / c0 - 1) > 0.25:
                continue
            m = (c1 / c0 - 1) * 100
            base[0] += 1; base[1] += m > 0; base[2] += m < 0; base[3] += m
            for k in keys(f[i], br.get(rows[i][0])):
                x = cells.setdefault(k, [0, 0, 0, 0.0]); x[0] += 1; x[1] += m > 0; x[2] += m < 0; x[3] += m
    last = {s: (S[s][-1][0], F[s][-1]) for s in S if F[s] and F[s][-1]}
    cal = calibrate(days, S, F, br)
    return {"days": days, "breadth": br.get(days[-1]) if days else None, "cells": cells, "base": base, "last": last, "cal": cal}


GB = [(0, 45), (45, 50), (50, 55), (55, 60), (60, 101)]


def gbin(p):
    return next(i for i, (a, b) in enumerate(GB) if a <= p < b)


def calibrate(days, S, F, br):
    """walk-forward test: cells from the first half of the history, scored on the second half.
    -> per predicted-odds band: the up-rate actually seen on the unseen half (what the page shows)."""
    if len(days) < 120:
        return None
    mid = days[len(days) // 2]
    cells, test = {}, []
    for s, rows in S.items():
        f = F[s]
        for i in range(len(rows) - H):
            if not f[i]:
                continue
            c0, c1 = rows[i][1], rows[i + H][1]
            if not c0 or not c1 or abs(c1 / c0 - 1) > 0.25:
                continue
            m = (c1 / c0 - 1) * 100
            d = rows[i][0]
            if rows[i + H][0] < mid:
                for k in keys(f[i], br.get(d)):
                    x = cells.setdefault(k, [0, 0]); x[0] += 1; x[1] += m > 0
            elif d > mid:
                test.append((f[i], br.get(d), m))
    out = [[0, 0, 0, 0.0] for _ in GB]
    allt = [0, 0, 0]
    for f, b, m in test:
        p = None
        for k in keys(f, b):
            x = cells.get(k)
            if x and x[0] >= MIN_N:
                p = 100 * x[1] / x[0]; break
        if p is None:
            continue
        o = out[gbin(p)]; o[0] += 1; o[1] += m > 0; o[2] += m < 0; o[3] += m
        allt[0] += 1; allt[1] += m > 0; allt[2] += m < 0
    return {"mid": mid, "bands": out, "base_up": 100 * allt[1] / allt[0] if allt[0] else None, "n": allt[0]}


def lookup(M, f):
    for k in keys(f, M["breadth"]):
        x = M["cells"].get(k)
        if x and x[0] >= MIN_N:
            return x, k
    return M["base"], None


def read(sym, M, ctx, item=None, mood=None):
    if sym not in M["last"]:
        return None
    d, f = M["last"][sym]
    (n, up, dn, sm), k = lookup(M, f)
    pu, pd = 100 * up / n, 100 * dn / n
    cal = M.get("cal")
    tu = td = tn = tavg = None
    if cal and cal["base_up"] is not None:
        cb = cal["bands"][gbin(pu)]
        if cb[0] >= 300:
            tn, tu, td, tavg = cb[0], 100 * cb[1] / cb[0], 100 * cb[2] / cb[0], cb[3] / cb[0]
    edge = (tu - cal["base_up"]) if tu is not None else (pu - 100 * M["base"][1] / M["base"][0]) / 3
    x = (ctx or {}).get(sym) or {}
    c = 0.0
    bu = x.get("bu")
    c += {"Long build-up": 1, "Short covering": 0.5, "Short build-up": -1, "Long unwinding": -0.5}.get(bu, 0)
    pcr = x.get("pcr")
    if pcr is not None:
        c += 0.5 if pcr >= 1.2 else -0.5 if pcr <= 0.6 else 0
    c += {"IN": 0.5, "OUT": -0.5}.get(x.get("flow"), 0)
    if item:
        w = 0.5 if item.get("tag") in ("NEWS", "BUSINESS", "EXPANSION", "BROKERAGE", "SHARES") else 1
        c += w if item.get("tone") == "up" else -w if item.get("tone") == "dn" else 0
    c += 0.5 if mood == "bull" else -0.5 if mood == "bear" else 0
    v = edge / 2 + c
    dirn = "up" if v >= 1.5 else "dn" if v <= -1.5 else "flat"
    a = abs(v)
    strength = "Strong" if a >= 3.5 else "Moderate" if a >= 2.25 else "Mild" if a >= 1.5 else "Weak"
    bars = 4 if a >= 4.5 else 3 if a >= 3.5 else 2 if a >= 2.25 else 1 if a >= 1.5 else 0
    return {"dir": dirn, "strength": strength, "bars": bars, "view": round(v, 1), "ctx": round(c, 1),
            "p_up": round(pu), "p_dn": round(pd), "avg": round(sm / n, 2), "n": n, "fine": bool(k and len(k) >= 3),
            "t_up": None if tu is None else round(tu), "t_dn": None if td is None else round(td), "t_n": tn, "t_avg": None if tavg is None else round(tavg, 2),
            "edge": round(edge, 1),
            "rsi": round(f["rsi"]), "rsi_up": (f["rsip"] is not None and f["rsi"] > f["rsip"]), "vm": f["vm"], "dp": f["dp"], "pct": f["pct"],
            "above20": f["c"] > f["s20"], "bu": bu, "pcr": pcr, "flow": x.get("flow"), "sec": x.get("sec"), "asof": d}


def enrich(items, mood=None, log=print):
    """adds 'trend' to each item in place; returns a summary for the page note. Never raises."""
    try:
        M = build_model()
    except Exception as ex:
        log("trend model failed:", ex)
        return None
    st = _load("stock_stats.json") or {}
    ctx = st.get("stocks", {})
    if not st.get("date") or (M["days"] and st["date"] != M["days"][-1]):
        log("stock_stats.json is for %s, prices for %s: OI / PCR / sector flow left out" % (st.get("date"), M["days"][-1] if M["days"] else None))
        ctx = {}
    for it in items:
        try:
            it["trend"] = read(it["sym"], M, ctx, it, mood)
        except Exception as ex:
            log("trend", it.get("sym"), ex)
            it["trend"] = None
    b = M["base"]
    cal = M.get("cal") or {}
    return {"test_from": cal.get("mid"), "test_base_up": None if cal.get("base_up") is None else round(cal["base_up"]), "test_n": cal.get("n"),
            "asof": M["days"][-1] if M["days"] else None, "from": M["days"][0] if M["days"] else None, "sessions": len(M["days"]),
            "cases": b[0], "base_up": round(100 * b[1] / b[0]) if b[0] else None, "horizon": H, "ctx": bool(ctx), "breadth": M["breadth"]}


if __name__ == "__main__":
    M = build_model()
    b = M["base"]
    print("sessions %d (%s .. %s), cases %d, base up %.1f%%, breadth now %.0f%%" % (len(M["days"]), M["days"][0], M["days"][-1], b[0], 100 * b[1] / b[0], M["breadth"] or 0))
    rows = sorted(((k, v) for k, v in M["cells"].items() if len(k) == 2 and v[0] >= MIN_N), key=lambda kv: -kv[1][1] / kv[1][0])
    RZ = ["RSI<30", "RSI30-45", "RSI45-60", "RSI60-70", "RSI>=70"]; MZ = ["<-3%", "-3..-1", "-1..+1", "+1..+3", ">+3%"]
    for k, (n, u, d_, s) in rows:
        print("  %-9s %-7s n=%6d  up %4.1f%%  down %4.1f%%  avg %+.2f%%" % (RZ[k[0]], MZ[k[1]], n, 100 * u / n, 100 * d_ / n, s / n))
    c = M["cal"]
    print("walk-forward test from", c["mid"], "base up %.1f%%" % c["base_up"])
    for (a_, b_), (n, u, d_, s_) in zip(GB, c["bands"]):
        print("  predicted %3d-%-3d  test n=%6d up %.1f%% down %.1f%% avg %+.2f%%" % (a_, b_, n, 100 * u / max(n, 1), 100 * d_ / max(n, 1), s_ / max(n, 1)))
    for s in ("TATASTEEL", "ASHOKLEY", "PNB", "INDUSINDBK", "HEROMOTOCO"):
        print(s, read(s, M, {}))
