"""Strategy research for the 5-minute projection: walk-forward, pooled over many NSE stocks, real Yahoo 5m data.
Question: which cheap strategy gives the best out-of-sample accuracy for 'where does the stock go from this cut-off'? Output: markdown table."""
import json, sys, urllib.request, datetime as dt
import numpy as np
SYMS = "RELIANCE TCS HDFCBANK ICICIBANK INFY SBIN BHARTIARTL ITC LT KOTAKBANK AXISBANK HCLTECH MARUTI SUNPHARMA TATAMOTORS TATASTEEL NTPC POWERGRID ONGC COALINDIA BEL HAL BAJFINANCE ADANIPORTS JSWSTEEL M&M WIPRO TECHM TITAN ULTRACEMCO HINDALCO GRASIM CIPLA DRREDDY EICHERMOT HEROMOTOCO BPCL IOC GAIL VEDL PNB BANKBARODA CANBK IRFC RVNL NHPC SJVN IDEA YESBANK DLF TATAPOWER INDIGO ZOMATO TRENT PFC RECLTD BHEL SAIL".split()
NB = 75
def fetch(s):
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{s.replace('&','%26')}.NS?range=60d&interval=5m&includePrePost=false"
    r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30))["chart"]["result"][0]
    q = r["indicators"]["quote"][0]; out = {}
    for i, t in enumerate(r["timestamp"]):
        if q["close"][i] is None: continue
        d = dt.datetime.utcfromtimestamp(t + 19800); k = ((d.hour * 60 + d.minute) - 555) // 5
        if 0 <= k < NB: out.setdefault(d.date(), {})[k] = (q["open"][i], q["high"][i], q["low"][i], q["close"][i], q["volume"][i] or 0)
    ses = []
    for d in sorted(out):
        b = out[d]
        if len(b) < 72: continue
        a = np.full((NB, 5), np.nan)
        for k, v in b.items(): a[k] = v
        for j in range(1, 5): a[:, j] = np.where(np.isnan(a[:, j]), np.nan, a[:, j])
        # forward fill gaps in close/high/low/open
        for k in range(NB):
            if np.isnan(a[k, 3]): a[k] = [a[k-1, 3]] * 4 + [0] if k else a[k]
        ses.append((d, a))
    return ses
def feats(prev, cur, k, dvol):
    c = cur[:k, 3]; o0 = cur[0, 0]; px = c[-1]
    tp = (cur[:k, 1] + cur[:k, 2] + cur[:k, 3]) / 3; v = cur[:k, 4] + 1; vw = (tp * v).sum() / v.sum()
    hi, lo = cur[:k, 1].max(), cur[:k, 2].min()
    pc = prev[-1, 3]
    f = dict(gap=(o0 / pc - 1), sofar=(px / pc - 1), vwdev=(px / vw - 1), r6=(px / c[max(0, k - 7)] - 1), r12=(px / c[max(0, k - 13)] - 1),
             rpos=((px - lo) / (hi - lo + 1e-9) - .5), pday=(prev[-1, 3] / prev[0, 0] - 1), plast=(prev[-1, 3] / prev[-13, 3] - 1))
    return {a: b / dvol for a, b in f.items()}, px
def main():
    data = {}
    for s in SYMS:
        try: ses = fetch(s)
        except Exception as e: print("skip", s, e, file=sys.stderr); continue
        if len(ses) >= 30: data[s] = ses
    print("stocks", len(data), file=sys.stderr)
    CUTS = [12, 24, 36, 48]; HOR = {"next 30m": 6, "next 1h": 12, "to close": None}
    names = ["gap", "sofar", "vwdev", "r6", "r12", "rpos", "pday", "plast"]
    rows = []  # (date, cut, feature vec, ret dict)
    for s, ses in data.items():
        rng = [abs(a[-1, 3] / a[0, 0] - 1) for _, a in ses]
        for i in range(1, len(ses)):
            d, cur = ses[i]; prev = ses[i - 1][1]
            dvol = max(1e-3, np.mean([abs(x[1][-1, 3] / x[0 if False else 1][0, 0] - 1) for x in ses[max(0, i - 20):i]]) if i > 1 else 0.01)
            for k in CUTS:
                f, px = feats(prev, cur, k, dvol)
                ret = {h: ((cur[(k - 1 + n) if n else NB - 1, 3] / px - 1) / dvol) for h, n in HOR.items()}
                rows.append((d, k, [f[n] for n in names], ret, s))
    dates = sorted({r[0] for r in rows}); split = dates[int(len(dates) * 0.55)]
    from sklearn.linear_model import Ridge, LogisticRegression
    out = ["# Projection strategy research (pooled %d stocks, %d sessions, walk-forward: train < %s, test >= %s)\n" % (len(data), len(dates), split, split)]
    out.append("Hit = direction of price after the cut-off called correctly. Confident = top 20% strongest signals. Edge = mean return (in units of the stock's daily range) when following the call.\n")
    out.append("| Horizon | Strategy | Hit % all | Hit % confident | Edge all | Edge confident | n test |\n|---|---|---|---|---|---|---|")
    for h in HOR:
        tr = [r for r in rows if r[0] < split]; te = [r for r in rows if r[0] >= split]
        Xtr = np.array([r[2] + [r[1] / 75] for r in tr]); ytr = np.array([r[3][h] for r in tr])
        Xte = np.array([r[2] + [r[1] / 75] for r in te]); yte = np.array([r[3][h] for r in te])
        sc = Xtr.std(0) + 1e-9; Xtr_, Xte_ = Xtr / sc, Xte / sc
        strat = {}
        strat["Always UP (base rate)"] = np.ones(len(te))
        strat["Momentum (last 30 min)"] = Xte[:, names.index("r6")]
        strat["Mean-reversion to VWAP"] = -Xte[:, names.index("vwdev")]
        strat["Gap fill (fade the gap)"] = -Xte[:, names.index("gap")]
        strat["Continue day's move"] = Xte[:, names.index("sofar")]
        strat["Range position reversal"] = -Xte[:, names.index("rpos")]
        m = Ridge(alpha=50).fit(Xtr_, ytr); strat["Pooled ridge (all features)"] = m.predict(Xte_)
        lg = LogisticRegression(C=0.05, max_iter=500).fit(Xtr_, (ytr > 0).astype(int)); strat["Pooled logistic"] = lg.decision_function(Xte_)
        for nm, sc_ in strat.items():
            sg = np.sign(sc_); sg[sg == 0] = 1
            hit = (sg == np.sign(yte)).mean() * 100; edge = (sg * yte).mean()
            q = np.abs(sc_) >= np.quantile(np.abs(sc_), .8) if nm != "Always UP (base rate)" else np.ones(len(te), bool)
            out.append(f"| {h} | {nm} | {hit:.1f} | {(sg[q] == np.sign(yte[q])).mean() * 100:.1f} | {edge:+.3f} | {(sg[q] * yte[q]).mean():+.3f} | {len(te)} |")
        if h == "to close":
            out.append("\nRidge coefficients (standardised, 'to close'): " + ", ".join(f"{n}={c:+.3f}" for n, c in zip(names + ['time'], m.coef_)) + "\n")
    # range / volatility: how well can we predict the size of remaining move (for bands)?
    out.append("\n## Range forecast (remaining high-low range, % of price) - cut-off 12:15\n")
    te = [r for r in rows if r[0] >= split and r[1] == 36]
    out.append("Used for the 80% projected band; model = recent daily range scaled by time left vs. naive flat band.\n")
    open("/tmp/research.md", "w").write("\n".join(out)); print("\n".join(out))
main()
