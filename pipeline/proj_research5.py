"""Research 4: the owner's multi-factor framework as ONE mirrored score, back-tested walk-forward on daily history (2y, ~88 NSE stocks) with market/global regime.
Rules are fixed in advance (no fitting); variants only differ in which factor groups are used. Held-out = last 40% of days; 'random' = 20 random stocks.
OI and news have no history, so they are not part of the back-tested score."""
import json, sys, random, urllib.request, datetime as dt
import numpy as np
SYMS = "RELIANCE TCS HDFCBANK ICICIBANK INFY SBIN BHARTIARTL ITC LT KOTAKBANK AXISBANK HCLTECH MARUTI SUNPHARMA TATAMOTORS TATASTEEL NTPC POWERGRID ONGC COALINDIA BEL HAL BAJFINANCE ADANIPORTS JSWSTEEL M&M WIPRO TECHM TITAN ULTRACEMCO HINDALCO GRASIM CIPLA DRREDDY EICHERMOT HEROMOTOCO BPCL IOC GAIL VEDL PNB BANKBARODA CANBK IRFC RVNL NHPC SJVN IDEA YESBANK DLF TATAPOWER INDIGO TRENT PFC RECLTD BHEL SAIL BAJAJ-AUTO ASIANPAINT NESTLEIND BRITANNIA DIVISLAB APOLLOHOSP SBILIFE HDFCLIFE ADANIENT ADANIGREEN TVSMOTOR BOSCHLTD CUMMINSIND SIEMENS ABB POLYCAB DIXON PERSISTENT COFORGE MPHASIS LTIM FEDERALBNK IDFCFIRSTB AUBANK LICHSGFIN MUTHOOTFIN CHOLAFIN LUPIN AUROPHARMA TORNTPHARM ZYDUSLIFE JINDALSTEL NMDC".split()
def get(s, yahoo=None):
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo or (s.replace('&','%26') + '.NS')}?range=2y&interval=1d"
    r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30))["chart"]["result"][0]
    q = r["indicators"]["quote"][0]; out = {}
    for i, t in enumerate(r["timestamp"]):
        if None in (q["open"][i], q["high"][i], q["low"][i], q["close"][i]): continue
        out[dt.datetime.utcfromtimestamp(t + 19800).date()] = (q["open"][i], q["high"][i], q["low"][i], q["close"][i], q["volume"][i] or 0)
    return out
def ema(x, n):
    a = 2 / (n + 1); o = np.empty_like(x); o[0] = x[0]
    for i in range(1, len(x)): o[i] = a * x[i] + (1 - a) * o[i - 1]
    return o
def rsi(c, n=14):
    d = np.diff(c, prepend=c[0]); up = ema(np.maximum(d, 0), n); dn = ema(np.maximum(-d, 0), n); return 100 - 100 / (1 + up / (dn + 1e-9))
def adx_di(h, l, c, n=14):
    up = np.diff(h, prepend=h[0]); dn = -np.diff(l, prepend=l[0]); pdm = np.where((up > dn) & (up > 0), up, 0); mdm = np.where((dn > up) & (dn > 0), dn, 0)
    tr = np.maximum.reduce([h - l, np.abs(h - np.roll(c, 1)), np.abs(l - np.roll(c, 1))]); tr[0] = h[0] - l[0]; a = ema(tr, n) + 1e-9
    pdi = 100 * ema(pdm, n) / a; mdi = 100 * ema(mdm, n) / a; dx = 100 * np.abs(pdi - mdi) / (pdi + mdi + 1e-9); return ema(dx, n), pdi, mdi
def sig(x): return np.sign(x)
# ---- market / global regime (mirrors the dashboard mood: Nifty, VIX, world, rupee, crude, US yields)
G = {k: get(k, v) for k, v in {"nifty": "^NSEI", "vix": "^INDIAVIX", "crude": "BZ=F", "inr": "USDINR=X", "tnx": "^TNX", "dxy": "DX-Y.NYB", "spx": "^GSPC", "nikkei": "^N225"}.items()}
ND = sorted(G["nifty"]); 
def chg(name, d, k=1):
    s = G[name]; ds = sorted(s)
    import bisect
    i = bisect.bisect_right(ds, d) - 1
    if i < k or i < 0: return 0.0
    return (s[ds[i]][3] / s[ds[i - k]][3] - 1) * 100
def mood(d):
    """-1..+1, uses data available at d's close (US/Asia of the same date are at/before the next India open - we use d's own values only)"""
    nf = chg("nifty", d); n5 = chg("nifty", d, 5); parts = [(3, np.clip(nf / 1.2, -1, 1)), (2, np.clip(n5 / 2.5, -1, 1)), (1.8, np.clip(-chg("vix", d) / 8, -1, 1)), (1, np.clip(-chg("inr", d) / .4, -1, 1)),
             (.8, np.clip(-chg("crude", d) / 2.5, -1, 1)), (.7, np.clip(-chg("tnx", d) / 3, -1, 1)), (.7, np.clip(-chg("dxy", d) / .6, -1, 1)), (1.2, np.clip((chg("spx", d) + chg("nikkei", d)) / 2 / 1.0, -1, 1))]
    return sum(w * v for w, v in parts) / sum(w for w, _ in parts)
data = {}
for s in SYMS:
    try: data[s] = get(s)
    except Exception as e: print("skip", s, e, file=sys.stderr)
rows = []
for s, dd in data.items():
    D = sorted(dd); 
    if len(D) < 120: continue
    O, H, L, C, V = (np.array([dd[d][j] for d in D], float) for j in range(5))
    e20, e50 = ema(C, 20), ema(C, 50); s50 = np.convolve(C, np.ones(50) / 50, "full")[:len(C)]; s50[:49] = np.nan
    mac = ema(C, 12) - ema(C, 26); mh = mac - ema(mac, 9); r14 = rsi(C); adx, pdi, mdi = adx_di(H, L, C)
    vavg = np.convolve(V, np.ones(20) / 20, "full")[:len(V)]
    for i in range(60, len(D) - 5):
        if i < 20: continue
        d = D[i]; hi20 = H[i - 20:i].max(); lo20 = L[i - 20:i].min(); rng = H[i] - L[i] + 1e-9
        T = [(3, sig(C[i] - e20[i])), (3, sig(e20[i] - e50[i])), (3, sig(mh[i])), (3, sig(pdi[i] - mdi[i]) if adx[i] > 20 else 0), (3, 1 if C[i] > hi20 else -1 if C[i] < lo20 else 0),
             (2, 1 if r14[i] > 55 else -1 if r14[i] < 45 else 0), (2, sig(C[i] - s50[i])), (3, 1 if (C[i] - L[i]) / rng > .7 else -1 if (C[i] - L[i]) / rng < .3 else 0),   # close near high/low of the day (intraday strength)
             (3, (1 if C[i] > C[i - 1] else -1) if V[i] > 1.5 * vavg[i - 1] else 0), (2, sig(C[i] - (H[i - 1] + L[i - 1] + C[i - 1]) / 3))]   # volume confirms; close vs previous pivot
        tech = sum(w * v for w, v in T) / sum(w for w, _ in T)
        dC = np.diff(C[i - 20:i + 1]); vv = V[i - 19:i + 1]; obv = float(np.sum(np.sign(dC) * vv) / (vv.sum() + 1)); clv = float(np.mean(((C[i - 19:i + 1] - L[i - 19:i + 1]) - (H[i - 19:i + 1] - C[i - 19:i + 1])) / (H[i - 19:i + 1] - L[i - 19:i + 1] + 1e-9)))
        acc = np.clip(obv * 2.5, -1, 1) * .6 + np.clip(clv * 1.5, -1, 1) * .4
        mk = mood(d)
        atr = float(np.mean(np.maximum.reduce([H[i - 13:i + 1] - L[i - 13:i + 1], np.abs(H[i - 13:i + 1] - C[i - 14:i]), np.abs(L[i - 13:i + 1] - C[i - 14:i])])))
        tb = 0   # +1 if +1xATR is touched before -1xATR in the next 5 sessions, -1 if the stop side first, 0 if neither (ties: stop first)
        for j in range(i + 1, i + 6):
            hu, hd = H[j] >= C[i] + atr, L[j] <= C[i] - atr
            if hd: tb = -1; break
            if hu: tb = 1; break
        n20 = chg("nifty", D[min(i + 20, len(D) - 1)], 20) if i + 20 < len(D) else None
        rows.append(dict(d=d, s=s, tb=tb, up20=float(C[i + 20] > C[i]) if i + 20 < len(D) else None, rel20=(C[i + 20] / C[i] - 1) * 100 > n20 if n20 is not None else None, tech=tech, acc=acc, mk=mk, up1=float(C[i + 1] > C[i]), up5=float(C[i + 5] > C[i]), r1=C[i + 1] / C[i] - 1, r5=C[i + 5] / C[i] - 1, dayup=C[i] > C[i - 1]))

ds = sorted({r["d"] for r in rows}); sp = ds[int(len(ds) * .6)]; tr = [r for r in rows if r["d"] < sp]; te = [r for r in rows if r["d"] >= sp]
random.seed(7); rnd = set(random.sample(sorted(data), 20))
sc = lambda r: (r["tech"] * 5.5 + r["acc"] * 1.5 + r["mk"] * 2) / 9
out = [f"# Research 5 - iteration: other horizons, reversal, trade-outcome (88 stocks; train < {sp}: {len(tr)}, test: {len(te)} stock-days)\n",
       "Mode is chosen on the TRAIN period only, then scored on the untouched TEST period. 'momentum' = follow the score, 'reversal' = fade it.\n"]
targets = {"next-day up": lambda r: r["up1"], "5-day up": lambda r: r["up5"], "20-day up": lambda r: r["up20"], "20-day beats Nifty": lambda r: r["rel20"],
           "+1xATR before -1xATR (5d, long side)": lambda r: (1 if r["tb"] == 1 else 0 if r["tb"] == -1 else None)}
def acc(rs, tg, th, sign):
    n = c = 0
    for r in rs:
        y = tg(r); x = sc(r)
        if y is None or abs(x) <= th: continue
        n += 1; c += ((x * sign > 0) == bool(y))
    return (c * 100 / n if n else 0), n
out.append("| Target | Strength | Mode picked on train | Train acc % | TEST acc % (all stocks) | Test calls | TEST acc % (20 random stocks) | calls |\n|---|---|---|---|---|---|---|---|")
for nm, tg in targets.items():
    for th in (0.0, .25, .45):
        am, _ = acc(tr, tg, th, 1); ar, _ = acc(tr, tg, th, -1); sign = 1 if am >= ar else -1
        t1, n1 = acc(te, tg, th, sign); t2, n2 = acc([r for r in te if r["s"] in rnd], tg, th, sign)
        out.append(f"| {nm} | {th:.2f} | {'momentum' if sign == 1 else 'reversal'} | {max(am, ar):.1f} | {t1:.1f} | {n1} | {t2:.1f} | {n2} |")
base = {nm: np.mean([tg(r) for r in te if tg(r) is not None]) * 100 for nm, tg in targets.items()}
out.append("\nBase rates in the test period (share of stock-days where the target is true): " + ", ".join(f"{k}: {v:.1f}%" for k, v in base.items()))
open("/tmp/research.md", "w").write("\n".join(out)); print("\n".join(out))
