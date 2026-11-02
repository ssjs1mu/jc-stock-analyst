"""Research 3: multi-factor 'event' model. Daily bars, 2y, ~90 NSE stocks + Nifty. Question: after a news-style open (gap) or a big move day, can accumulation,
volume, the stock's own history of fading/continuing moves and the market predict the day's close vs open, and the NEXT day? Accuracy vs coverage (abstaining) reported."""
import json, sys, urllib.request, datetime as dt
import numpy as np
from sklearn.linear_model import LogisticRegression
SYMS = "RELIANCE TCS HDFCBANK ICICIBANK INFY SBIN BHARTIARTL ITC LT KOTAKBANK AXISBANK HCLTECH MARUTI SUNPHARMA TATAMOTORS TATASTEEL NTPC POWERGRID ONGC COALINDIA BEL HAL BAJFINANCE ADANIPORTS JSWSTEEL M&M WIPRO TECHM TITAN ULTRACEMCO HINDALCO GRASIM CIPLA DRREDDY EICHERMOT HEROMOTOCO BPCL IOC GAIL VEDL PNB BANKBARODA CANBK IRFC RVNL NHPC SJVN IDEA YESBANK DLF TATAPOWER INDIGO TRENT PFC RECLTD BHEL SAIL BAJAJ-AUTO ASIANPAINT NESTLEIND BRITANNIA DIVISLAB APOLLOHOSP SBILIFE HDFCLIFE ADANIENT ADANIGREEN TVSMOTOR BOSCHLTD CUMMINSIND SIEMENS ABB POLYCAB DIXON PERSISTENT COFORGE MPHASIS LTIM FEDERALBNK IDFCFIRSTB AUBANK LICHSGFIN MUTHOOTFIN CHOLAFIN LUPIN AUROPHARMA TORNTPHARM ZYDUSLIFE JINDALSTEL NMDC".split()
def get(s):
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{s.replace('&','%26')}{'' if s.startswith('^') else '.NS'}?range=2y&interval=1d"
    r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30))["chart"]["result"][0]
    q = r["indicators"]["quote"][0]; rows = []
    for i, t in enumerate(r["timestamp"]):
        if None in (q["open"][i], q["high"][i], q["low"][i], q["close"][i]): continue
        rows.append((dt.datetime.utcfromtimestamp(t + 19800).date(), q["open"][i], q["high"][i], q["low"][i], q["close"][i], q["volume"][i] or 0))
    return rows
nifty = {r[0]: r for r in get("^NSEI")}; nd = sorted(nifty)
nprev = {d: nifty[nd[i - 1]][4] for i, d in enumerate(nd) if i}
data = {}
for s in SYMS:
    try: data[s] = get(s)
    except Exception as e: print("skip", s, e, file=sys.stderr)
rows = []
for s, a in data.items():
    O, H, L, C, V = (np.array([x[j] for x in a], float) for j in (1, 2, 3, 4, 5)); D = [x[0] for x in a]
    n = len(a); sgn_hist = []  # past event outcomes: +1 if the event-day closed in gap direction else -1
    for i in range(60, n - 1):
        pc = C[i - 1]; gap = O[i] / pc - 1; atr = np.mean((H[i - 20:i] - L[i - 20:i]) / C[i - 20:i]); g = gap / atr
        rng_ok = abs(g) >= 0.5   # a 'news-style' open: gap at least half a typical daily range
        if not rng_ok:
            if abs(g) >= 0.5: pass
        # accumulation proxies from the previous 20 sessions (known at the open)
        dC = np.diff(C[i - 21:i]); vv = V[i - 20:i]; obv = np.sum(np.sign(dC) * vv) / (vv.sum() + 1)
        clv = np.mean(((C[i - 20:i] - L[i - 20:i]) - (H[i - 20:i] - C[i - 20:i])) / (H[i - 20:i] - L[i - 20:i] + 1e-9))   # close location: +1 closes at highs (accumulation), -1 at lows
        volx = V[i - 1] / (np.mean(V[i - 21:i - 1]) + 1)
        trend5 = C[i - 1] / C[i - 6] - 1; trend20 = C[i - 1] / C[i - 21] - 1; hi52 = C[i - 1] / np.max(C[max(0, i - 250):i]) - 1
        # stock's own habit: of its last 10 gap events, how often did the day close in the gap direction (continue) vs against (fade / sell-on-news)
        habit = np.mean(sgn_hist[-10:]) if len(sgn_hist) >= 4 else 0.0
        nm = nifty.get(D[i]); mk = (nm[1] / nprev[D[i]] - 1) / 0.01 if nm and D[i] in nprev else 0
        sg = np.sign(gap)
        if rng_ok:
            res = np.sign(C[i] - O[i])          # day closes above/below its own open
            fut = np.sign(C[i + 1] - C[i])
            cont = (np.sign(C[i] - pc) == sg)   # close still on the gap side of prev close
            rows.append(dict(d=D[i], s=s, g=g * sg, sg=sg, habit=habit, obv=obv * sg, clv=clv * sg, volx=volx, t5=trend5 * sg / atr, t20=trend20 * sg / atr, hi52=hi52, mk=mk * sg, res=res * sg, fut=fut * sg, cont=float(cont), big=float(abs(g) >= 1.0)))
            sgn_hist.append(res * sg)
ds = sorted({r["d"] for r in rows}); sp = ds[int(len(ds) * .6)]
tr = [r for r in rows if r["d"] < sp]; te = [r for r in rows if r["d"] >= sp]
F = ["g", "habit", "obv", "clv", "volx", "t5", "t20", "hi52", "mk"]
out = [f"# Research 3 - multi-factor event model ({len(data)} stocks, {len(rows)} gap events, train < {sp}, test {len(te)})\n",
       "Event = open gaps by >= 0.5 x the stock's typical daily range. Positive = in the direction of the gap (continues), negative = fades (sell-on-news / buy-the-dip).\n"]
def fit(target, nm):
    X = np.array([[r[f] for f in F] for r in tr]); y = np.array([r[target] > 0 for r in tr]).astype(int)
    mu, sd = X.mean(0), X.std(0) + 1e-9; m = LogisticRegression(C=0.3, max_iter=1000).fit((X - mu) / sd, y)
    Xt = np.array([[r[f] for f in F] for r in te]); yt = np.array([r[target] > 0 for r in te]); p = m.predict_proba((Xt - mu) / sd)[:, 1]
    base = max(yt.mean(), 1 - yt.mean())
    out.append(f"### {nm}\nBase rate of 'continues' = {yt.mean() * 100:.1f}% (majority-guess accuracy {base * 100:.1f}%). Coefficients: " + ", ".join(f"{f}={c:+.2f}" for f, c in zip(F, m.coef_[0])) + "\n")
    out.append("| Keep only the most confident | Calls | Accuracy % | Calls per 100 events |\n|---|---|---|---|")
    conf = np.abs(p - .5)
    for q in (0, .5, .7, .8, .9, .95):
        k = conf >= np.quantile(conf, q) if q else np.ones(len(p), bool); pr = p > .5
        out.append(f"| top {int((1 - q) * 100)}% | {k.sum()} | {(pr[k] == yt[k]).mean() * 100:.1f} | {k.mean() * 100:.0f} |")
    # simple rule-based comparators
    out.append("")
    return m, mu, sd
fit("res", "Day closes above its own open (gap direction)")
fit("cont", "Day still closes beyond the previous close, on the gap side")
fit("fut", "NEXT day's close continues the same way")
# does stock habit alone work?
for thr in (.4, .6):
    sel = [r for r in te if abs(r["habit"]) >= thr]
    if sel: out.append(f"Habit alone: stocks whose last 10 gaps continued/faded >= {thr:.0%}-ish (|habit|>={thr}): {len(sel)} events, predicted by habit sign -> {np.mean([np.sign(r['habit']) == np.sign(r['res']) for r in sel]) * 100:.1f}% right")
# big events with volume and accumulation agreeing
sel = [r for r in te if r["big"] and r["obv"] > 0 and r["clv"] > 0 and r["habit"] >= 0]
if sel: out.append(f"\nBig gap (>=1 range) + accumulation (OBV>0, closes near highs) + stock habit continues: {len(sel)} events, day closes in gap direction {np.mean([r['res'] > 0 for r in sel]) * 100:.1f}%, still beyond prev close {np.mean([r['cont'] for r in sel]) * 100:.1f}%")
sel = [r for r in te if r["big"] and r["obv"] < 0 and r["clv"] < 0 and r["habit"] <= 0]
if sel: out.append(f"Big gap + distribution (OBV<0, closes near lows) + stock habit fades: {len(sel)} events, day FADES (closes against gap) {np.mean([r['res'] < 0 for r in sel]) * 100:.1f}%")
open("/tmp/research.md", "w").write("\n".join(out)); print("\n".join(out))
