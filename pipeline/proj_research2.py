"""Part 2: what IS predictable - size of remaining move, day-high/low breaks, timing. Pooled, walk-forward."""
import sys, numpy as np
from proj_research import fetch, SYMS, NB
from sklearn.linear_model import LogisticRegression
def tm(k): m = 555 + 5 * k; return f"{m // 60:02d}:{m % 60:02d}"
data = {}
for s in SYMS:
    try: ses = fetch(s)
    except Exception as e: print("skip", s, e, file=sys.stderr); continue
    if len(ses) >= 30: data[s] = ses
CUTS = [12, 24, 36, 48]; R = []
for sname, ses in data.items():
    for i in range(2, len(ses)):
        d, cur = ses[i]
        dr = np.mean([(x[1][:, 1].max() - x[1][:, 2].min()) / x[1][0, 0] for x in ses[max(0, i - 20):i]])
        for k in CUTS:
            c = cur[:k, 3]; px = c[-1]; hi = cur[:k, 1].max(); lo = cur[:k, 2].min()
            vol = np.std(np.diff(np.log(c))) + 1e-6; left = NB - k
            R.append(dict(d=d, k=k, H=cur[k:, 1].max() / px - 1, L=cur[k:, 2].min() / px - 1, bh=float(cur[k:, 1].max() > hi), bl=float(cur[k:, 2].min() < lo),
                          sv=vol * np.sqrt(left), sd=dr * np.sqrt(left / NB), dhi=hi / px - 1, dlo=lo / px - 1, pos=(px - lo) / (hi - lo + 1e-9), rs=(hi - lo) / px, dr=dr))
ds = sorted({r['d'] for r in R}); sp = ds[int(len(ds) * .55)]; tr = [r for r in R if r['d'] < sp]; te = [r for r in R if r['d'] >= sp]
out = [f"# Part 2 - what is predictable ({len(data)} stocks, train < {sp})\n", "## Remaining HIGH / LOW band (target 80% coverage each)\n",
       "| Cut-off | Method | High covered % | Low covered % | Avg band width % | MAE high % | MAE low % |", "|---|---|---|---|---|---|---|"]
for k in CUTS:
    a = [r for r in tr if r['k'] == k]; b = [r for r in te if r['k'] == k]
    th = np.array([r['H'] for r in b]); tl = np.array([r['L'] for r in b])
    def ev(nm, fh, fl):
        ph = np.array([fh(r) for r in b]); pl = np.array([fl(r) for r in b])
        out.append(f"| {tm(k)} | {nm} | {(th <= ph).mean() * 100:.0f} | {(tl >= pl).mean() * 100:.0f} | {(ph - pl).mean() * 100:.2f} | {abs(th - ph).mean() * 100:.2f} | {abs(tl - pl).mean() * 100:.2f} |")
    ev("Old style (tight 0.5 x daily range)", lambda r: .5 * r['sd'], lambda r: -.5 * r['sd'])
    for nm, key in (("Daily-range x time left, calibrated", "sd"), ("Today's 5-min volatility, calibrated", "sv")):
        qh = np.quantile([r['H'] / r[key] for r in a], .8); ql = np.quantile([r['L'] / r[key] for r in a], .2)
        ev(nm, lambda r, qh=qh, key=key: qh * r[key], lambda r, ql=ql, key=key: ql * r[key])
    g = lambda r: np.sqrt(r['sd'] * r['sv'])
    qh = np.quantile([r['H'] / g(r) for r in a], .8); ql = np.quantile([r['L'] / g(r) for r in a], .2)
    ev("Blend (daily range x today's vol), calibrated", lambda r: qh * g(r), lambda r: ql * g(r))
out += ["\n## Will the day's HIGH / LOW be broken again before the close?\n", "| Cut-off | Question | Base rate yes % | Accuracy % | Accuracy when sure (top 30%) % | n |", "|---|---|---|---|---|---|"]
for k in CUTS:
    a = [r for r in tr if r['k'] == k]; b = [r for r in te if r['k'] == k]
    for q, key, dk in (("New day-high", "bh", "dhi"), ("New day-low", "bl", "dlo")):
        f = lambda r: [abs(r[dk]) / (r['sd'] + 1e-9), abs(r[dk]) / (r['sv'] + 1e-9), r['pos'], r['rs'] / (r['dr'] + 1e-9)]
        Xa = np.array([f(r) for r in a]); ya = np.array([r[key] for r in a]); Xb = np.array([f(r) for r in b]); yb = np.array([r[key] for r in b]).astype(bool)
        mu, sd = Xa.mean(0), Xa.std(0) + 1e-9; p = LogisticRegression(max_iter=500).fit((Xa - mu) / sd, ya).predict_proba((Xb - mu) / sd)[:, 1]
        pr = p > .5; cf = np.abs(p - .5) >= np.quantile(np.abs(p - .5), .7)
        out.append(f"| {tm(k)} | {q} | {yb.mean() * 100:.0f} | {(pr == yb).mean() * 100:.0f} | {(pr[cf] == yb[cf]).mean() * 100:.0f} | {len(yb)} |")
out += ["\n## When does the day's extreme print? (all stock-days)\n", "| Slot | Day HIGH % | Day LOW % |", "|---|---|---|"]
ex = [(int(np.argmax(a[:, 1])), int(np.argmin(a[:, 2]))) for ses in data.values() for _, a in ses]
for lo_, hi_ in ((0, 6), (6, 12), (12, 24), (24, 36), (36, 48), (48, 60), (60, 75)):
    out.append(f"| {tm(lo_)}-{tm(hi_)} | {sum(lo_ <= v[0] < hi_ for v in ex) * 100 / len(ex):.0f} | {sum(lo_ <= v[1] < hi_ for v in ex) * 100 / len(ex):.0f} |")
open("/tmp/research.md", "w").write("\n".join(out)); print("\n".join(out))
