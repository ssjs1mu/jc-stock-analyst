# Genuine data sources (read with RUNBOOK.md before researching)

Every figure must come from one of these (or another named public source) fetched in THIS run.
If a figure is not found, print "n/a" and move on. Never wait, never ask, never invent.
Search with the real IST date written out, e.g. `Sensex Nifty close 16 October 2026`.

## Indian close / intraday (evening reports, morning "previous close")
- HDFC Sky daily close report: https://hdfcsky.com/news/stock-market-close-report-today-<month>-<day>-<year>-... (find via search "hdfcsky stock market close report today <date>"). Gives Sensex/Nifty, breadth, sectors, top gainers/losers with prices. Verified working 16 Oct 2026.
- PTI close story on ThePrint / Meghalayan Express / NewsOnAir ("Stock markets end higher/lower ..."): Sensex/Nifty, BSE sectoral indices, FII net flow, Brent, rupee, Asia/Europe, broker quotes. Verified working.
- Business Standard live blog (business-standard.com/markets, "Stock Market Close" posts); Angel One "top gainers and losers on <month> <day> <year>"; India TV / APAC News Network market pages.
- Official: nseindia.com and bseindia.com (indices, FII/DII provisional data, bulk deals, corporate announcements, circuit/price-band lists). Often blocked for fetch; try, then fall back to the pages above.

## Flows, derivatives, macro
- FII/DII cash flows: nseindia.com provisional FII/DII, niftytrader.in/fii-dii-data, PTI close story.
- PCR / option chain: upstox.com/option-chain/nifty/ (weekly-expiry chain; label it so).
- India VIX, Bank Nifty close: NSE index page or HDFC Sky / Business Standard blog; if absent, n/a.
- Brent, gold, US 10-yr, USD/INR: investing.com / tradingeconomics.com pages, Reuters or PTI market wraps.
- GIFT Nifty (pre-market): NSE IX / Moneycontrol / Business Standard pre-open note; give the time stamp.
- Global and Asian indices: PTI/Reuters wraps, tradingeconomics.com.

## News
- Google News RSS (news.google.com/rss/search?q=...), Business Standard, Mint, Economic Times, Moneycontrol, PTI.
- Corporate actions and results calendar: BSE/NSE corporate announcements pages; company press releases.
- SEBI circulars: sebi.gov.in.

## Rules for unattended runs
1. Do not stop for approvals or questions. Pick the reasonable reading and note it in the report footer.
2. If the run is late, say so in `as_of_note` and still publish.
3. Publish first (publish.py), deliver extras second. A missing optional step must never prevent the report.
