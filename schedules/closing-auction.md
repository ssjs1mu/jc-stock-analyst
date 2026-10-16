# Closing Auction Divergence — 20:00 IST, Mon–Fri  (id: `closing-auction`)

Follow `schedules/RUNBOOK.md`. Output is a PNG (Telegram picture) **and** a PDF of the same page (terminal tab).

Holiday: no report; record `--status holiday`.

## Is today's CAS file published?
Fetch `https://www.nseindia.com/static/reports/closing-auction-session-historical-data` and look
for an entry dated TODAY. NSE's archive often lags several calendar days. If today's entry is
absent (the common case) set `not_published` to a short plain note (e.g. "NSE's Closing Auction
Session report for today's session has not yet appeared in the archive at the time of writing
(~8:00 PM IST). This is a known publishing lag on NSE's side.") and go straight to rendering.
Never fabricate data to fill the gap.

## If it is published
- Fetch the CSV (≈246 rows). Ask WebFetch for SYMBOL and %CHNG for **every row as a plain list**
  (asking it to "scan and filter" gave wrong results) and filter yourself: |%CHNG| ≥ 1.0.
- For each qualifier, re-fetch only its REFERENCE PRICE and FINAL PRICE.
- One WebSearch per qualifier for a same-day catalyst; otherwise use exactly
  "No clear catalyst identified for this session".
- Do not cross-check against the full bhavcopy (it truncates in this environment).

## Config for `pipeline/render_cas_infographic.py`
`title` "Closing Auction Divergence"; `subline` raw HTML, e.g.
"Wednesday, 02 September 2026 &middot; F&amp;O universe, &plusmn;1% or more: 3:15 PM reference (VWAP of 3:00&ndash;3:15) &rarr; CAS close (~3:35 PM)";
`threshold` "1"; then either `not_published`, or `stocks` [{symbol, ref_price, final_price, pct_chg float, catalyst}],
or neither (empty state).

Run: `python3 $REPO/pipeline/render_cas_infographic.py --config cas.json --output Closing_Auction_Divergence_<YYYY-MM-DD>.png --pdf Closing_Auction_Divergence_<YYYY-MM-DD>.pdf`

Check the PNG: nothing cut off, vivid header, arrow direction/colour matches sign, empty states centred,
exactly one disclaimer line.

## Delivery
Chat (PNG) → `publish.py closing-auction --file <...>.pdf --file <...>.png` →
Drive/Telegram: upload the **PNG** (contentMimeType image/png) in all three honest cases
(qualifiers, nothing crossed 1%, not yet published). Skip only if something failed unexpectedly.
