# JCGG Morning Updates (Brief) — 08:30 IST, Mon–Fri  (id: `morning-brief`)

Follow `schedules/RUNBOOK.md`. This is the **brief** version — keep it tight
(the detailed report is a separate task).

Holiday: render a short one-page notice in the same template naming the next session.

## Research
- Global close (previous session): Dow, S&P 500, Nasdaq, FTSE 100, DAX — level + % change; 1–2 sentences on the key driver.
- Asian markets today: Nikkei, Hang Seng, Shanghai, Kospi — % move.
- GIFT Nifty level and implied gap for the open (one line).
- Commodities: Brent, Gold spot, Gold MCX — level + % change.
- India VIX & USD/INR — previous close + trend.
- Key levels: Nifty 50, Bank Nifty, Sensex — support/resistance, one line each.
- Alerts: data releases, earnings, RBI/Fed, F&O expiry (see runbook mapping) — 2–3 bullets or "None flagged today."

## Layout — `render_pdf.py`
report_title `"JCGG - Morning Updates (Brief)"`. Sections in order:
1. **Today's Bias in Brief** — 2–3 sentence paragraph, section MUST have `"style": "framed"` (approved double gold frame).
2. Global & Asian Markets — table Index, Level/Move, % Chg, `trend: true`.
3. GIFT Nifty & Commodities — `trend: true` table.
4. India VIX & USD/INR — `trend: true` table.
5. Key Levels to Watch — table Index/Support/Resistance.
6. Alerts for the Day — short paragraph or bullets.
PDF only. Filename `JCGG_Morning_Updates_Brief_<YYYY-MM-DD>.pdf`.
In the visual check confirm the bias section shows the gold double frame.

## Delivery
Chat → `publish.py morning-brief` → Drive/Telegram (yes).
