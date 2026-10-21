#!/usr/bin/env python3
"""Accumulation / exit scanner -> data/accum.json (read by the terminal's pre-market list).

Hypothesis being tested (Joshi's market-cycle thesis): strong hands buy in size (greed), sell into the crowd (panic),
then quietly absorb the panic selling in small lots; price then trends on the supply gap; results/news are used as the exit.
Signals use NSE delivery + OHLC stored by pipeline/delivery.py. Every signal is back-tested on the stored history and the
real hit rates are published next to the picks. Research input, not advice and not a guarantee.
"""
import json, os, statistics as st, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'accum.json')
MINDAYS = 70
H1, H2 = 10, 20


def load():
    dl = json.load(open(os.path.join(ROOT, 'data', 'delivery.json')))['d']
    oh = json.load(open(os.path.join(ROOT, 'data', 'ohlc.json')))['d']
    dates = sorted(set(dl) & set(oh))
    S = {}
    syms = set()
    for d in dates:
        syms.update(oh[d].keys())
    for s in syms:
        rows = []
        for d in dates:
            a, b = oh[d].get(s), dl[d].get(s)
            if a and b and b[1] > 0:
                rows.append((d, a[0], a[1], a[2], a[3], b[1], b[0]))   # date,o,h,l,c,traded,delivered
        if len(rows) >= MINDAYS:
            S[s] = rows
    return dates, S


def mean(a):
    return sum(a) / len(a) if a else 0.0


def pivots(vals, k=3):
    """indices of local extrema (strict) with k bars each side"""
    lo, hi = [], []
    for i in range(k, len(vals) - k):
        w = vals[i - k:i + k + 1]
        if vals[i] == min(w) and w.count(vals[i]) == 1:
            lo.append(i)
        if vals[i] == max(w) and w.count(vals[i]) == 1:
            hi.append(i)
    return lo, hi


def features(R, i):
    """signals firing at index i using data up to and including i. returns dict name->info"""
    if i < 60:
        return {}
    o = [r[1] for r in R[:i + 1]]; h = [r[2] for r in R[:i + 1]]; l = [r[3] for r in R[:i + 1]]
    c = [r[4] for r in R[:i + 1]]; v = [r[5] for r in R[:i + 1]]; dq = [r[6] for r in R[:i + 1]]
    dp = [dq[j] / v[j] * 100 for j in range(i + 1)]
    av20 = mean(v[i - 19:i + 1]); dp10 = mean(dp[i - 9:i + 1]); dp40 = mean(dp[i - 49:i - 9])
    out = {}
    # S1 absorption: delivery share rising while price is contained
    rng10 = (max(h[i - 9:i + 1]) - min(l[i - 9:i + 1])) / c[i]
    if dp40 > 0 and dp10 >= 1.2 * dp40 and rng10 <= 0.09 and c[i] >= 0.85 * max(h[i - 59:i + 1]):
        out['ABSORB'] = {'stop': min(l[i - 9:i + 1]), 'info': 'delivery %.0f%% vs %.0f%% before; 10-day range %.1f%%' % (dp10, dp40, rng10 * 100)}
    # S2 shakeout then dry absorption
    for k in range(i - 15, i - 2):
        if k < 21:
            continue
        a20 = mean(v[k - 20:k])
        if c[k] / c[k - 1] - 1 <= -0.03 and a20 > 0 and v[k] >= 2 * a20:
            post = range(k + 1, i + 1)
            if min(l[j] for j in post) > l[k] * 0.995 and mean([v[j] for j in post]) <= 0.7 * a20 and mean([dp[j] for j in post]) >= dp40:
                out['SHAKE'] = {'stop': l[k], 'info': 'panic day %s on %.1fx volume, then %d quiet sessions without a new low' % (R[k][0], v[k] / a20, i - k)}
                break
    # S3 higher highs / higher lows with volume contracting on pullbacks
    seg = 60
    lo_i, hi_i = pivots(l[i - seg + 1:i + 1]), pivots(h[i - seg + 1:i + 1])
    pl, ph = lo_i[0], hi_i[1]
    if len(pl) >= 2 and len(ph) >= 2:
        L1, L2 = l[i - seg + 1 + pl[-2]], l[i - seg + 1 + pl[-1]]
        H1_, H2_ = h[i - seg + 1 + ph[-2]], h[i - seg + 1 + ph[-1]]
        if L2 > L1 and H2_ > H1_ and c[i] > L2 and mean(v[i - 4:i + 1]) <= 0.8 * mean(v[i - 29:i + 1]):
            out['HHHL'] = {'stop': L2, 'info': 'higher highs and higher lows; volume contracting (5-day %.0f%% of 30-day)' % (mean(v[i - 4:i + 1]) / mean(v[i - 29:i + 1]) * 100)}
    # S4 retracement dry-up (volume fades at a Fibonacci level after a large leg)
    wnd = range(max(0, i - 90), i + 1)
    pk = max(wnd, key=lambda j: h[j])
    if i - pk >= 4:
        lo_ = min(l[max(0, pk - 60):pk + 1]); R_ = h[pk] - lo_
        if lo_ > 0 and h[pk] / lo_ >= 1.4 and R_ > 0:
            for L in (0.382, 0.5, 0.618, 0.786):
                lv = h[pk] - R_ * L
                if abs(c[i] - lv) / c[i] <= 0.03 and mean(v[i - 4:i + 1]) <= 0.4 * mean(v[max(0, pk - 9):pk + 3]):
                    out['FIBDRY'] = {'stop': lv * 0.97, 'info': 'volume %.0f%% of peak-time at the %.1f%% level (%.1f)' % (mean(v[i - 4:i + 1]) / mean(v[max(0, pk - 9):pk + 3]) * 100, L * 100, lv)}
                    break
    # SURGEQ quality surge: >=3% up on >=2x volume with delivery share >=1.2x its 40-session norm (big hands buying in size)
    r1 = c[i] / c[i - 1] - 1
    if r1 >= 0.03 and v[i] >= 2 * av20 and dp[i] >= 1.2 * dp40:
        out['SURGEQ'] = {'stop': l[i], 'info': 'up %.1f%% on %.1fx volume with %.0f%% delivery (norm %.0f%%)' % (r1 * 100, v[i] / mean(v[i - 20:i]), dp[i], dp40)}
    # SURGEHOLD: a quality surge 3-10 sessions ago that has held, with volume gone quiet (<=60%) and no lower low
    for k in range(i - 10, i - 2):
        if k < 51:
            continue
        a_ = mean(v[k - 20:k]); d40 = mean(dp[k - 50:k - 10])
        if c[k] / c[k - 1] - 1 >= 0.03 and v[k] >= 2 * a_ and dp[k] >= 1.2 * d40 and c[i] >= c[k] * 0.97 and mean(v[k + 1:i + 1]) <= 0.6 * v[k] and min(l[k + 1:i + 1]) >= l[k]:
            out['SURGEHOLD'] = {'stop': l[k], 'info': 'quality surge on %s (%.1fx volume) is holding; volume since is %.0f%% of that day' % (R[k][0], v[k] / a_, mean(v[k + 1:i + 1]) / v[k] * 100)}
            break
    # RUNLOWDEL: >=20% in 10 sessions while delivery share is <=70% of norm (retail-heavy run) - momentum with high risk
    gain10 = c[i] / c[i - 10] - 1
    if gain10 >= 0.20 and dp10 <= 0.7 * dp40:
        out['RUNLOWDEL'] = {'stop': min(l[i - 4:i + 1]), 'info': 'up %.0f%% in 10 sessions but delivery only %.0f%% (norm %.0f%%) - retail-heavy run' % (gain10 * 100, dp10, dp40)}
    # exit watches after a >=20% run
    rng = (h[i] - l[i]) or 1e-9
    if gain10 >= 0.20 and v[i] >= 2.5 * mean(v[i - 20:i]) and (c[i] - l[i]) / rng <= 0.35:
        out['CLIMAX'] = {'stop': None, 'info': 'after +%.0f%% in 10 sessions: %.1fx volume and close in the lower third of the day range' % (gain10 * 100, v[i] / mean(v[i - 20:i]))}
    if gain10 >= 0.20 and v[i] >= 2 * mean(v[i - 20:i]) and c[i] < o[i]:
        out['REDHEAVY'] = {'stop': None, 'info': 'after +%.0f%% in 10 sessions: red candle on %.1fx volume' % (gain10 * 100, v[i] / mean(v[i - 20:i]))}
    return out


def fwd(R, i):
    """entry next open; returns r10, r20, mae20, mfe20, day of high within 20"""
    if i + 1 + H2 >= len(R):
        return None
    e = R[i + 1][1]
    if e <= 0:
        return None
    seg = R[i + 1:i + 1 + H2]
    r10 = R[i + H1][4] / e - 1
    r20 = R[i + H2][4] / e - 1
    mae = min(x[3] for x in seg) / e - 1
    mfe = max(x[2] for x in seg) / e - 1
    pkd = max(range(len(seg)), key=lambda j: seg[j][2]) + 1
    return r10, r20, mae, mfe, pkd


def summarize(rows):
    if not rows:
        return {'n': 0}
    r10 = [x[0] for x in rows]; r20 = [x[1] for x in rows]
    return {'n': len(rows), 'r10': round(mean(r10) * 100, 1), 'r20': round(mean(r20) * 100, 1), 'med20': round(st.median(r20) * 100, 1),
            'win10': round(sum(1 for x in r10 if x > 0) / len(r10) * 100), 'win20': round(sum(1 for x in r20 if x > 0) / len(r20) * 100),
            'p5_20': round(sum(1 for x in rows if x[3] >= 0.05) / len(rows) * 100),      # reached +5% at some point in 20 sessions
            'mae': round(mean([x[2] for x in rows]) * 100, 1), 'mfe': round(mean([x[3] for x in rows]) * 100, 1),
            'pkday': int(st.median([x[4] for x in rows]))}


def results_study(S):
    """event study around board-meeting (financial results) dates: pre-run vs reaction"""
    try:
        res = json.load(open(os.path.join(ROOT, 'data', 'results.json')))
    except Exception:
        return None, {}
    hist, up = res.get('hist', {}), res.get('upcoming', {})
    ev = []
    for s_, R in S.items():
        n = len(R)
        dts = [r[0] for r in R]
        for d in hist.get(s_, []):
            i0 = next((k for k in range(n) if dts[k] >= d), None)
            if i0 is None or i0 < 31 or i0 + 6 >= n:
                continue
            c = [r[4] for r in R]; v = [r[5] for r in R]
            pre = c[i0 - 1] / c[i0 - 11] - 1
            vr = mean(v[i0 - 5:i0]) / max(1.0, mean(v[i0 - 30:i0 - 5]))
            react = c[i0 + 1] / c[i0 - 1] - 1
            fol = c[i0 + 6] / c[i0 + 1] - 1
            ev.append((pre, vr, react, fol))
    def grp(rows):
        if len(rows) < 5:
            return {'n': len(rows)}
        rc_ = [x[2] for x in rows]; fl = [x[3] for x in rows]
        return {'n': len(rows), 'react': round(mean(rc_) * 100, 1), 'react_med': round(st.median(rc_) * 100, 1), 'neg': round(sum(1 for x in rc_ if x < 0) / len(rc_) * 100),
                'absmove': round(mean([abs(x) for x in rc_]) * 100, 1), 'follow5': round(mean(fl) * 100, 1)}
    out = {'all': grp(ev), 'run_up_10pct': grp([e for e in ev if e[0] >= 0.10]), 'run_up_5_10': grp([e for e in ev if 0.05 <= e[0] < 0.10]),
           'flat': grp([e for e in ev if -0.05 < e[0] < 0.05]), 'sold_off': grp([e for e in ev if e[0] <= -0.05]),
           'run_up_on_volume': grp([e for e in ev if e[0] >= 0.05 and e[1] >= 1.5])}
    return out, up


def main():
    dates, S = load()
    last = dates[-1]
    SIGS = ('SURGEQ', 'SURGEHOLD', 'RUNLOWDEL', 'ABSORB', 'SHAKE', 'HHHL', 'FIBDRY', 'CLIMAX', 'REDHEAVY')
    EXITS = ('CLIMAX', 'REDHEAVY')
    ev = {k: [] for k in SIGS}
    evd = {k: [] for k in ev}      # (date index, row) for halves
    base = []
    cool = {}
    picks, exits = [], []
    for s, R in S.items():
        n = len(R)
        for i in range(60, n):
            if i % 5 == 0:
                f = fwd(R, i)
                if f:
                    base.append(f)
            F = features(R, i)
            for k, info in F.items():
                if i == n - 1 or i == n - 2:
                    continue    # latest sessions are handled below (no forward data yet)
                if cool.get((s, k), -99) > i - 10:
                    continue
                f = fwd(R, i)
                if f:
                    ev[k].append(f); evd[k].append((R[i][0], f)); cool[(s, k)] = i
        # latest-day signals -> picks / exits
        i = n - 1
        if R[i][0] != last:
            continue
        F = features(R, i)
        F1 = features(R, i - 1) if n > 62 else {}
        sigs = {k: v for k, v in {**F1, **F}.items() if k not in EXITS}
        c = R[i][4]; av20v = mean([x[5] for x in R[i - 19:i + 1]]); val = av20v * c
        if c < 40 or val < 3e7:        # liquidity / price filter: avg traded value >= 3 crore
            continue
        if sigs:
            hi3 = max(x[2] for x in R[i - 2:i + 1]); stops = [v['stop'] for v in sigs.values() if v.get('stop')]
            stop = max(min(stops), c * 0.88)
            pr = {'sym': s, 'close': c, 'sigs': sorted(sigs), 'why': [sigs[k]['info'] for k in sorted(sigs)], 'trigger': round(hi3 * 1.001, 2), 'stop': round(stop, 2),
                  'val_cr': round(val / 1e7, 1), 'dp5': round(mean([R[j][6] / R[j][5] * 100 for j in range(i - 4, i + 1)]), 1), 'vol5x': round(mean([x[5] for x in R[i - 4:i + 1]]) / av20v, 2),
                  'chg1': round((c / R[i - 1][4] - 1) * 100, 1), 'chg10': round((c / R[i - 10][4] - 1) * 100, 1)}
            picks.append(pr)
        ex = {k: v for k, v in {**F1, **F}.items() if k in EXITS}
        if ex:
            exits.append({'sym': s, 'close': c, 'sigs': sorted(ex), 'why': [ex[k]['info'] for k in sorted(ex)], 'chg10': round((c / R[i - 10][4] - 1) * 100, 1), 'val_cr': round(val / 1e7, 1)})
    stats = {k: summarize(v) for k, v in ev.items()}
    stats['BASE'] = summarize(base)
    bw = stats['BASE']['win20']
    for k in ev:
        x = stats[k]
        if x['n'] >= 30 and x['win20'] >= bw + 5 and x['r20'] > stats['BASE']['r20']:
            x['evidence'] = 'modest edge'
        elif x['n'] >= 20 and x['win20'] <= bw - 10 and x['r20'] < stats['BASE']['r20']:
            x['evidence'] = 'weak exit tendency'
        elif x['n'] < 30:
            x['evidence'] = 'small sample'
        else:
            x['evidence'] = 'no edge'
    # stability: first half vs second half of the dates
    mid = dates[len(dates) // 2 + 30] if len(dates) > 100 else dates[len(dates) // 2]
    for k in ev:
        a = [f for d, f in evd[k] if d < mid]; b = [f for d, f in evd[k] if d >= mid]
        stats[k]['h1'] = summarize(a); stats[k]['h2'] = summarize(b)
    # rank picks by the historical 20-day win-rate of their signals, then number of signals
    def score(p):
        w = [stats[k].get('win20', 50) - bw + stats[k].get('r20', 0) - stats['BASE']['r20'] for k in p['sigs'] if stats[k]['n'] >= 20]
        return (sum(w) / len(w) if w else -99) + 4 * (len(p['sigs']) - 1)
    for p in picks:
        p['score'] = round(score(p), 1)
        p['exit_by'] = max([stats[k].get('pkday', 10) for k in p['sigs'] if stats[k]['n'] >= 20] or [10])
    rstat, upc = results_study(S)
    today_d = dt.date.today()
    watch_res = []
    for s_, R in S.items():
        ds = [x['date'] for x in upc.get(s_, []) if today_d.isoformat() <= x['date'] <= (today_d + dt.timedelta(days=7)).isoformat()]
        if not ds or R[-1][0] != last or len(R) < 40:
            continue
        c = [r[4] for r in R]; i = len(R) - 1
        pre = c[i] / c[i - 10] - 1
        val = mean([r[5] for r in R[-20:]]) * c[i]
        if pre >= 0.08 and val >= 3e7 and c[i] >= 40:
            g = (rstat or {}).get('run_up_5_10' if pre < 0.10 else 'run_up_10pct', {})
            tail = (' · after such run-ups, results-time moves averaged ±%.1f%% and %d%% fell (n=%d) — direction not predictable' % (g['absmove'], g['neg'], g['n'])) if g.get('absmove') is not None else ''
            watch_res.append({'sym': s_, 'date': min(ds), 'pre': round(pre * 100, 1), 'why': 'up %.0f%% in the last 10 sessions into results%s' % (pre * 100, tail)})
    watch_res.sort(key=lambda x: x['date'])
    for p in picks:
        d_ = [x['date'] for x in upc.get(p['sym'], []) if today_d.isoformat() <= x['date'] <= (today_d + dt.timedelta(days=12)).isoformat()]
        if d_:
            p['results'] = min(d_)
    good = [k for k in SIGS if stats[k]['evidence'] == 'modest edge']
    main_ = [p for p in picks if any(k in good for k in p['sigs'])]
    watch = [p for p in picks if not any(k in good for k in p['sigs'])]
    main_.sort(key=lambda p: -p['score']); watch.sort(key=lambda p: -p['score'])
    picks = main_
    exits.sort(key=lambda p: -p['chg10'])
    out = {'updated': dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).isoformat(timespec='seconds'), 'asof': last, 'sessions': len(dates), 'stocks': len(S),
           'stats': stats, 'picks': picks[:40], 'picks_total': len(picks), 'watch': watch[:15], 'watch_total': len(watch), 'results_stats': rstat, 'results_watch': watch_res[:15], 'exits': exits[:25],
           'method': {'ABSORB': 'delivery share up >=20% vs prior 40 sessions while 10-day range <=9% and price within 15% of its 60-day high',
                      'SHAKE': 'a >=3% fall on >=2x volume, then >=3 quiet sessions (<=70% volume, delivery held) without a new low',
                      'HHHL': 'last two swing lows and last two swing highs both rising, volume contracting',
                      'FIBDRY': '>=40% leg, price within 3% of a 38.2/50/61.8/78.6% level and 5-day volume <=40% of peak-time volume',
                      'SURGEQ': '>=3% up on >=2x volume with delivery share >=1.2x its 40-session norm',
                      'SURGEHOLD': 'a SURGEQ day 3-10 sessions ago that has held with volume <=60% of that day and no lower low',
                      'RUNLOWDEL': '>=20% in 10 sessions with delivery share <=70% of norm (retail-heavy run, high risk)',
                      'CLIMAX': 'exit watch: after >=20% in 10 sessions, >=2.5x volume and close in the lower third of the range',
                      'REDHEAVY': 'exit watch: after >=20% in 10 sessions, a red candle on >=2x volume',
                      'entry': 'next-session open', 'liquidity': 'price >= 40 and 20-day average traded value >= 3 crore'}}
    with open(OUT, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print('asof', last, 'stocks', len(S), 'picks', len(picks), 'exits', len(exits))
    for k, v in stats.items():
        print(k, {x: v[x] for x in v if x not in ('h1', 'h2')})


if __name__ == '__main__':
    main()
