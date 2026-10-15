# JCGG Morning Updates (Detailed) — 08:30 IST, Mon–Fri  (id: `morning-detailed`)

Follow `schedules/RUNBOOK.md`. This is the **detailed** report — keep full depth.
Note the as-of time of each data point (e.g. "as of previous US close", "as of 7:00 AM IST").

Holiday: render a short notice in the same template.

## Research
1. Global close: Dow, S&P 500, Nasdaq, FTSE 100, DAX, CAC 40 — % change + drivers (Fed, earnings, data, geopolitics).
2. Asian markets today: Nikkei, Hang Seng, Shanghai, Kospi — % moves.
3. GIFT Nifty level and implied gap.
4. Commodities: Brent, WTI, gold, silver, copper — overnight prices + momentum notes.
5. India VIX & USD/INR — previous close, trend, brief interpretation.
6. Key levels: Nifty 50, Bank Nifty, Sensex support/resistance.
7. Alerts: data releases, earnings, RBI/Fed, IPOs, F&O expiry (runbook mapping).
8. Sectors to watch — likely out/under-performers with reasoning.
9. Trading ideas — a short list of illustrative technical/news-based calls with entry, stop-loss, target, clearly labelled illustrative, not personalised advice.
10. Corporate actions & calendar — today's board announcements, results calendar (flag F&O names), IPOs open, upcoming listings, dividend/bonus/split ex-dates (check a bonus-specific tracker too), today's F&O ban list (nsearchives.nseindia.com/content/fo/fo_secban.csv or a broker aggregator). Say "none" plainly where empty.

## Layout — `render_pdf.py`
report_title `"JCGG - Morning Updates (Detailed)"`. Lead with **Today's Bias in Brief**
(2–3 sentences, `"style": "framed"`). Then: Global Markets Close, Asian Markets Today,
GIFT Nifty, Commodities, India VIX & USD/INR, Indian Market Outlook, Key Levels to Watch,
Alerts for the Day, Sectors to Watch, Trading Ideas, Corporate Actions & Calendar (several
small tables/bullet groups). Tables with level/% data get `trend: true`. ~2 pages is expected.
Default disclaimer. Filename `JCGG_Morning_Updates_Detailed_<YYYY-MM-DD>.pdf`.

## Delivery
Chat → `publish.py morning-detailed` → Drive/Telegram (yes).
