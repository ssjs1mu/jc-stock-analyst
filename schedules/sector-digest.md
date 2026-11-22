# Sector Digest — evening booklet, Mon–Fri (id: `sector-digest`)

Built by GitHub (`.github/workflows/sector-digest.yml`, started by the ticker every 15 min from 19:00 IST until published)
with `pipeline/sector_digest.py`. No Claude session, no paid API. Replaces the Circuit Watch PDF.

## Data — the exchange's own end-of-day files only (nsearchives.nseindia.com)
sec_bhavdata_full (price, volume, turnover, delivery %), PR zip (`bh` price-band hitters, `an` announcements),
sec_list.csv (price bands), CM_52_wk_High_low (52-week marks as of the session start), ind_close_all (all NSE indices,
VIX), F&O UDiFF bhavcopy (strike-wise OI), fao_participant_oi (FII / DII / Pro / Client). History for RSI-14 and
20-day averages: data/ohlc.json + data/delivery.json. Sensex from data/dash_snapshot.json, FII / DII cash from data/fiidii.json.
Missing figures are shown as '-' and listed in the verification notes — never estimated.

## Pages (light booklet, SSJ Finance colours: olive #676300, cream #F1EED6, #A7A15D, green #1C820D, red #D00000)
1. Cover: date, session snapshot (Sensex, Nifty, Bank Nifty, Midcap, Smallcap, VIX), breadth, FII / DII cash,
   money flowing in / exiting, at-a-glance tiles (index PCR + OI range, FII index-futures long %, circuit / 52-week /
   RSI counts), sector chips.
2. Sector money flow: net flow = turnover × ((C−L)−(H−C))/(H−L) summed over each sector index's members; share of
   turnover, turnover vs 20-day avg, advances / declines, delivery %, IN / OUT / WEAK / MIXED.
3. Money IN: top 3 core sectors, 4 stocks each — close, % move, volume ×, delivery %, RSI-14 with direction,
   PCR + OI range (highest put-OI strike below / call-OI strike above), futures build-up.
4. Money OUT: weakest 3 sectors the same way + biggest single-stock outflows.
5. F&O positioning: Nifty / Bank Nifty PCR, OI walls, top strikes, fresh writing; participant index-futures
   positions with change; long build-up / short covering / short build-up / long unwinding lists.
6. RSI-14 reversal watch: oversold turning up, overbought turning down, still oversold / overbought.
7. Circuit watch (Circuit Watch rules kept): fixed-band stocks whose band hit is confirmed by the day's high / low,
   locked vs off-band; table Stock | Move | Recommendation | Reason, hedged language only, catalyst named only from
   an exchange filing (else "catalyst unverified"); F&O names (no fixed band) excluded and counted in the notes.
8. Fresh 52-week highs / lows on ≥1.5× volume + full list of band hitters.
9. Data verification notes + the Circuit Watch disclaimer, verbatim.

Files: `Sector_Digest_Mobile_<date>_<n>.png` (1080×1800) and `Sector_Digest_<date>.pdf`; published with
`publish.py sector-digest --date <session date>`. Manual run / preview: Actions → Sector Digest → Run (dry = previews
pushed to the `sd-preview` branch).
