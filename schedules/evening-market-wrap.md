# Evening Market Wrap — 18:00 IST, Mon–Fri  (id: `evening-market-wrap`)

Follow `schedules/RUNBOOK.md`. Must be posted by 21:00 IST.

Holiday: short one-page notice (same template) stating markets are closed and naming the next session.

## Research (each with close/latest level, abs change, % change)
- Indian snapshot: Nifty 50, Sensex, Bank Nifty, Nifty 500, India VIX (3:30 PM close).
- Global wrap: Dow, S&P 500, Nasdaq, FTSE 100, Nikkei 225, Hang Seng — use what's genuinely available, note timing.
- Currencies, commodities & bonds: USD/INR, DXY, Brent (US$/bbl), Gold (Rs./10g 24K — state unit), 10Y G-Sec, 10Y UST.
- Stocks in Focus: single biggest Nifty 500 gainer and loser (name, close, % change) — Trendlyne/Moneycontrol/NSE.
  Fallback: BSE 'A' group, clearly labelled.
- Volume Shockers — Watch for Tomorrow: 2–4 stocks (name, close, % change, volume vs average).
- Optional broader gauges (Midcap/Smallcap/100/200) only with COMPLETE level+change+% — else omit.
- No "why the market moved" news recap (that's the News Wrap's job).

## Layout — `render_pdf.py`
report_title "Evening Market Wrap"; subtitle "Indian & Global Markets, Commodities and Bonds".
Sections: (1) Indian Market Snapshot [trend] (2) Global Market Wrap [trend]
(3) Currencies, Commodities & Bonds [trend] (4) Stocks in Focus (+ BSE fallback note if used)
(5) Volume Shockers — Watch for Tomorrow (6) Near-Term Outlook (levels, risks — not news)
(7) Summary Wrap-Up for Tomorrow (paragraph + note that this reflects data at generation time and
tomorrow morning's update covers overnight changes: US close, Asia, GIFT Nifty, crude/dollar).
Filename `Evening_Market_Wrap_<YYYY-MM-DD>.pdf`.

## Delivery
Chat → `publish.py evening-market-wrap` → Drive/Telegram (yes).
