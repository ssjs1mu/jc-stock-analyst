# Evening News Wrap (Next-Day Calendar) — 19:00 IST, Mon–Fri  (id: `evening-news-wrap`)

Follow `schedules/RUNBOOK.md`. Must be posted by 21:00 IST.

## Next trading day
If tomorrow is Sat/Sun or an NSE/BSE holiday, skip forward to the next real trading day
(verify the holiday calendar). State it explicitly, e.g. "Next Trading Day: Thursday, 04 September 2026".
If today itself was a holiday, still run, but label the news section with the actual last trading date.

## Research
1. **Day's News** — 4–6 bullets: index-moving developments, macro/policy (RBI, govt, global CBs),
   big corporate news (M&A, deals, regulatory action), biggest single-stock story — fact + why it mattered.
   (This is the only report carrying the news recap — don't skip it.)
2. **Results — Next Trading Day** — company, Nifty 50/500 membership if known, before/after hours if stated.
3. **IPO — Next Trading Day** — mainboard/SME opening, closing or listing that day; event + price band.
4. **Corporate Actions — Next Trading Day** — dividend/bonus/split/rights/buyback with ex- or record date
   that day; action + ratio/amount (check a bonus/split tracker too).
Never fabricate; an honest "None scheduled for the next trading day" is correct.

## Layout — `render_pdf.py`
report_title "Evening News Wrap"; subtitle = next-trading-day line. Sections: Day's News (bullets),
Results (table Company/Segment/Timing, or a one-line bullet if none), IPO (IPO Name/Event/Price Band),
Corporate Actions (Company/Action/Details), Closing Note (short paragraph previewing the next session).
No trend columns. Filename `Evening_News_Wrap_<YYYY-MM-DD>.pdf` (today's date).
Check the next-trading-day date is consistent across all three calendar sections.

## Delivery
Chat → `publish.py evening-news-wrap` → Drive/Telegram (yes; skip if you couldn't establish today's date or the next trading day).
