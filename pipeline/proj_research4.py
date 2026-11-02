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
        d = D[i]; hi20 = H[i - 20:i].max(); lo20 = L[i - 20:i].min(); rng = H[i] - L[i] + 1e-9
        T = [(3, sig(C[i] - e20[i])), (3, sig(e20[i] - e50[i])), (3, sig(mh[i])), (3, sig(pdi[i] - mdi[i]) if adx[i] > 20 else 0), (3, 1 if C[i] > hi20 else -1 if C[i] < lo20 else 0),
             (2, 1 if r14[i] > 55 else -1 if r14[i] < 45 else 0), (2, sig(C[i] - s50[i])), (3, 1 if (C[i] - L[i]) / rng > .7 else -1 if (C[i] - L[i]) / rng < .3 else 0),   # close near high/low of the day (intraday strength)
             (3, (1 if C[i] > C[i - 1] else -1) if V[i] > 1.5 * vavg[i - 1] else 0), (2, sig(C[i] - (H[i - 1] + L[i - 1] + C[i - 1]) / 3))]   # volume confirms; close vs previous pivot
        tech = sum(w * v for w, v in T) / sum(w for w, _ in T)
        dC = np.diff(C[i - 20:i + 1]); vv = V[i - 19:i + 1]; obv = float(np.sum(np.sign(dC) * vv) / (vv.sum() + 1)); clv = float(np.mean(((C[i - 19:i + 1] - L[i - 19:i + 1]) - (H[i - 19:i + 1] - C[i - 19:i + 1])) / (H[i - 19:i + 1] - L[i - 19:i + 1] + 1e-9)))
        acc = np.clip(obv * 2.5, -1, 1) * .6 + np.clip(clv * 1.5, -1, 1) * .4
        mk = mood(d)
        rows.append(dict(d=d, s=s, tech=tech, acc=acc, mk=mk, up1=float(C[i + 1] > C[i]), up5=float(C[i + 5] > C[i]), r1=C[i + 1] / C[i] - 1, r5=C[i + 5] / C[i] - 1, dayup=C[i] > C[i - 1]))
ds = sorted({r["d"] for r in rows}); sp = ds[int(len(ds) * .6)]; test = [r for r in rows if r["d"] >= sp]
random.seed(7); rnd = set(random.sample(sorted(data), 20))
out = [f"# Research 4 - framework score back-test ({len(data)} stocks, {len(rows)} stock-days, test from {sp}: {len(test)} stock-days)\n", "Target: close next day / 5 days later higher than today's close. Rules fixed in advance, nothing fitted. Coverage = share of stock-days where a call is made.\n"]
def variant(nm, f, gate=False):
    out.append(f"### {nm}\n| Min strength | Coverage % | Next-day accuracy % | 5-day accuracy % | Calls |\n|---|---|---|---|---|")
    for th in (0.0, .15, .25, .35, .45, .6):
        c1 = c5 = n = 0
        for r in test:
            sc = f(r)
            if gate:
                if r["mk"] < -.15 and sc > 0 and not (r["acc"] >= .6): sc = 0          # bearish market: a bullish stock needs strong accumulation to stand alone
                if r["mk"] > .15 and sc < 0 and not (r["acc"] <= -.6): sc = 0          # bullish market: a weak stock is lifted unless strong distribution
            if abs(sc) <= th or sc == 0: continue
            n += 1; c1 += (sc > 0) == bool(r["up1"]); c5 += (sc > 0) == bool(r["up5"])
        out.append(f"| {th:.2f} | {n * 100 / len(test):.0f} | {c1 * 100 / n if n else 0:.1f} | {c5 * 100 / n if n else 0:.1f} | {n} |")
    out.append("")
variant("V1 technicals only (importance-weighted, mirrored)", lambda r: r["tech"])
variant("V2 technicals + accumulation", lambda r: (r["tech"] * 5.5 + r["acc"] * 1.5) / 7)
variant("V3 + market/global regime as a factor", lambda r: (r["tech"] * 5.5 + r["acc"] * 1.5 + r["mk"] * 2) / 9)
variant("V4 = V3 + the gate (bearish market needs strong accumulation to stay bullish; reverse for bullish market)", lambda r: (r["tech"] * 5.5 + r["acc"] * 1.5 + r["mk"] * 2) / 9, gate=True)
# the same V4 on 20 random stocks only
test_all = test; test = [r for r in test_all if r["s"] in rnd]
out.append(f"## Same V4 on 20 random stocks only ({', '.join(sorted(rnd))})\n"); variant("V4 on random 20", lambda r: (r["tech"] * 5.5 + r["acc"] * 1.5 + r["mk"] * 2) / 9, gate=True)
# single stock demo BEL
test = [r for r in test_all if r["s"] == "BEL"]
if test: variant("V4 on BEL alone", lambda r: (r["tech"] * 5.5 + r["acc"] * 1.5 + r["mk"] * 2) / 9, gate=True)
open("/tmp/research.md", "w").write("\n".join(out)); print("\n".join(out))
