# Research 5 - iteration: other horizons, reversal, trade-outcome (88 stocks; train < 2026-02-12: 22614, test: 15136 stock-days)

Mode is chosen on the TRAIN period only, then scored on the untouched TEST period. 'momentum' = follow the score, 'reversal' = fade it.

| Target | Strength | Mode picked on train | Train acc % | TEST acc % (all stocks) | Test calls | TEST acc % (20 random stocks) | calls |
|---|---|---|---|---|---|---|---|
| next-day up | 0.00 | reversal | 50.8 | 50.4 | 15136 | 50.1 | 3440 |
| next-day up | 0.25 | reversal | 50.9 | 51.3 | 9907 | 52.4 | 2249 |
| next-day up | 0.45 | reversal | 51.7 | 51.4 | 4631 | 53.5 | 1066 |
| 5-day up | 0.00 | reversal | 52.0 | 48.7 | 15136 | 48.8 | 3440 |
| 5-day up | 0.25 | reversal | 52.9 | 48.4 | 9907 | 48.9 | 2249 |
| 5-day up | 0.45 | reversal | 53.2 | 48.5 | 4631 | 49.2 | 1066 |
| 20-day up | 0.00 | reversal | 51.1 | 51.9 | 13816 | 55.1 | 3140 |
| 20-day up | 0.25 | reversal | 51.8 | 52.4 | 9007 | 57.1 | 2045 |
| 20-day up | 0.45 | reversal | 53.1 | 53.1 | 4160 | 57.6 | 951 |
| 20-day beats Nifty | 0.00 | reversal | 51.0 | 50.4 | 13816 | 52.2 | 3140 |
| 20-day beats Nifty | 0.25 | reversal | 51.0 | 50.7 | 9007 | 53.5 | 2045 |
| 20-day beats Nifty | 0.45 | reversal | 51.9 | 51.9 | 4160 | 53.9 | 951 |
| +1xATR before -1xATR (5d, long side) | 0.00 | reversal | 51.2 | 49.0 | 12951 | 48.7 | 2962 |
| +1xATR before -1xATR (5d, long side) | 0.25 | reversal | 51.0 | 48.6 | 8410 | 49.3 | 1922 |
| +1xATR before -1xATR (5d, long side) | 0.45 | reversal | 51.4 | 48.7 | 3939 | 48.8 | 909 |

Base rates in the test period (share of stock-days where the target is true): next-day up: 48.3%, 5-day up: 46.1%, 20-day up: 45.0%, 20-day beats Nifty: 52.3%, +1xATR before -1xATR (5d, long side): 46.3%