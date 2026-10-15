# Circuit Watch: Price-Band & Momentum Scanner — 21:00 IST, Mon–Fri  (id: `circuit-watch`)

Follow `schedules/RUNBOOK.md` for workspace, checks and delivery.

## Holiday
If NSE/BSE did not trade today: no PDF. Record `--status holiday` with the holiday name and send
one short chat message saying no Circuit Watch edition was generated.

## Research — today's session
Sources such as Moneycontrol, Business Standard, INDmoney, 5paisa, Groww, Economic Times:
- Stocks that hit, locked, or closed near their upper/lower price-band circuit.
- Fresh month or 52-week highs/lows on unusually heavy volume (vs average where available).
- Brief context: Sensex/Nifty close and change, sector leaders/laggards, VIX.
Cross-check across two sources where possible. Anything unverifiable (price, % move, volume multiple,
catalyst) must be stated as unverified — hard requirement, never estimate. If no confirmed
lower- (or upper-) circuit locks were found, say so explicitly.

## Table — exactly: Stock | Move | Recommendation | Reason
- Every row has a Recommendation and a Reason.
- Hedged language only ("avoid chasing", "watch for follow-through", "wait for stabilization",
  "monitor for confirmation") — no outright buy/sell.
- Circuit-locked names default to "avoid chasing" unless a specific, well-sourced reason says otherwise.
- Unverified catalyst/figure → say so inside that row's Reason.

## Layout — Python + reportlab (this report's own approved style)
- Header: "Joshi's Corner" in Times-BoldItalic, gold #B8860B; tagline "Independent Market Research &
  Trading Intelligence | NSE / BSE"; gold rule. You may also place `pipeline/branding/wordmark_banner.png`.
- Title "CIRCUIT WATCH: PRICE-BAND & MOMENTUM SCANNER" bold navy #1B2430; subtitle with session date and index levels.
- Section banners: solid gold #B8860B bars, white bold text, lighter gold #D4AF37 border — "SESSION SNAPSHOT",
  "CIRCUIT & MOMENTUM ACTIVITY — SESSION TABLE", "DATA VERIFICATION NOTES", "DISCLAIMER".
- Table: navy header with white bold text, #D4AF37 gridlines, alternating #FBF8EF rows, bold stock names,
  up moves green #2E6B3E, down moves dark red #8B2E2E, body #333333 at ~8–8.5pt.
- No ₹ symbol or Unicode sub/superscripts (base fonts show black boxes) — write "Rs.".
- DATA VERIFICATION NOTES: plain bullets of everything unverified or flagged, plus judgment calls.
- DISCLAIMER text (verbatim): "This report is prepared by Joshi's Corner for general informational and
  educational purposes only and does not constitute investment advice, a recommendation, or a solicitation
  to buy or sell any security. It does not take into account the investment objectives, financial situation,
  or particular needs of any specific person. Prices, volumes, circuit-limit status, and other data points are
  drawn from third-party and publicly available sources believed to be reliable at the time of preparation;
  they may be delayed, incomplete, or subject to revision, and no representation or warranty is made as to
  their accuracy or completeness. Where a data point could not be verified, this report says so explicitly
  rather than estimating it. Equity markets are subject to risk, including the possible loss of principal;
  past performance and single-session price or volume moves are not indicative of future results. Stocks that
  are locked at their circuit limit carry additional execution risk (illiquidity, inability to exit) and should
  not be chased on the basis of the circuit move alone. Readers should independently verify all data and consult
  a SEBI-registered investment adviser before making any investment decision. Joshi's Corner and its author
  accept no liability for any loss arising from the use of this report."
- Filename `Circuit_Watch_<YYYY-MM-DD>.pdf`.

## Delivery
Chat (brief caption naming the session date; don't restate the table) → `publish.py circuit-watch`.
No Drive/Telegram upload for this report.
