# Pre-Market News — 08:00 IST, Mon–Fri  (id: `premarket-news`)

Follow `schedules/RUNBOOK.md` for workspace, checks, rendering rules and delivery.
Must be posted by 08:45 IST.

## Framing (decide every run from the real clock)
- Before ~09:15 IST → title **"Pre-Market News"**, filename `PreMarket_News_<YYYY-MM-DD>.pdf`.
- During market hours or later → never use the word "pre-market"; title **"Market News"**,
  filename `Market_News_<YYYY-MM-DD>.pdf`, framed as a same-day catch-up.
- Holiday: render a short one-page notice in the same template naming the next session.

## Research — stock-level only (skip generic Sensex/Nifty commentary)
Sources: Economic Times Markets, BusinessLine Markets, Moneycontrol, NSE, BSE; searches like
"top stocks in news today", "brokerage stock calls today", "stocks to trade today key levels",
"promoter stake pledge" for today's date.
1. **Stock-Specific News** — results, IPO listings, block/bulk deals, M&A, contract wins; company + concrete fact.
2. **FII/FPI Desk Calls** — foreign brokerages (Morgan Stanley, CLSA, Jefferies, Citi, UBS, Nomura, JPMorgan, BofA, Bernstein…): rating + target + one line of reasoning, 2–3 different stocks.
3. **Technical Trade Levels** — entry/breakout, target range, stop-loss for a few actively-called stocks, with the source desk if named.
4. **Promoter & Insider Activity** — stake changes, pledges, insider buy/sell: company, person/entity, specific change.
5. **FII Stock-Wise Activity** — stocks FIIs net bought/sold in the latest session, ending with overall net FII/DII cash figures.
Do not repeat a company across groups.

## Layout
`render_pdf.py`; report_title per framing above; one section per group, each a bullets
block (1–2 lines per bullet). No trend columns.

## Delivery
Chat → `publish.py premarket-news` → Drive/Telegram (yes).
