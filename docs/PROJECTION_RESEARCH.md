# 5-minute projection — strategy research (2 Nov 2026)

Method: 56 liquid NSE stocks, 60 days of Yahoo 5-minute bars, pooled, walk-forward (train on the earlier 55 % of days, test on the later 45 %, ~6,000 test cases per row). Code: `pipeline/proj_research.py` (direction), `pipeline/proj_research2.py` (ranges, extremes, timing + calibration export to `projection_cal.js`). Run by workflow `proj-research.yml` (read-only, writes to the `research` branch).

## Direction — nothing works
Always-up 45.7–50.7 %, momentum 48–50 %, VWAP reversion 49–50 %, gap fill 45–49 %, continue-the-day 50.7–53.2 %, pooled ridge 48–51 %, pooled logistic 50–53 % (54 % on the most confident fifth, 1-hour horizon). Edge is ≤ 0.06 daily-ranges per call, i.e. below costs. **Conclusion: stop forecasting candle direction.**

## What is predictable (out-of-sample)
| Claim | Old model | New |
|---|---|---|
| Remaining high stays under the upper limit | 65–71 % | 73–81 % (target 80) |
| Remaining low stays above the lower limit | 59–69 % | 71–82 % |
| "Will today's high / low be broken again?" | – | 73–80 % right, 89–98 % when confident (base rate 27–54 %) |
| When the extremes print | – | day high: 43 % in first 30 min, 20 % last 75 min; day low 36 % / 28 % |

Best band method: daily-range (avg of last 20 sessions) × √(time left), multiplied by pooled calibration constants per cut-off (`CAL.bands`). Today's 5-minute volatility gave better coverage but ~40 % wider bands (less useful).

## Caveats
Only 57 sessions (10 Aug–30 Oct 2026): one market regime. Constants should be re-fitted monthly (rerun `proj-research.yml`, commit `projection_cal.js`). "Broken again" accuracy is partly structural (a stock sitting at its high at 10:15 usually makes another); the confident-bucket numbers are the useful ones.

## Round 3-5: the owner's multi-factor framework (3 Nov 2026)
Factors: importance-weighted mirrored technicals (intraday-strength + delivery levels), accumulation (OBV / close-location x volume), market + global regime (Nifty, VIX, rupee, crude, US yields, dollar index, world markets) with the "bearish market needs strong accumulation" gate. 88 stocks, 2 years, rules fixed in advance, train on the first 60 % of days, test on the rest, 20 random held-out stocks.
- Next-day direction: 46-50 % (V1-V4), strongest-signal bucket is *worse* than a coin (mean reversion). 5-day 48-52 %.
- Iteration (momentum vs reversal picked on train only): next-day 50-51 %, 5-day 48-49 %, 20-day 52-53 % (base rate 45 %), trade outcome (+1xATR before -1xATR) 49 % (base 46 %).
- Conclusion: no tradeable edge for direction from this factor family on daily history; further tuning would only overfit. F&O OI and news cannot be back-tested (no history), so they are shown as reasons, not scored for accuracy.
- Measured, usable: range limits (73-82 % held) and day-high/low break calls (73-80 %, 90 %+ when confident).
- OI collector: the public source throttles after ~30 pages per run; `fno-oi.yml` is manual-only until a resumable/backend fetch is built.
