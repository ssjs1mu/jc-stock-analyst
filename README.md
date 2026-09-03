# Joshi's Corner — Stock Analyst Terminal

A single-page tool: enter an NSE/BSE symbol, get a full technical + fundamental
readout — 3D gradient snapshot tiles, pivot levels, a Fibonacci map, an 8-horizon
trading call matrix (Intraday → 5 Years), and a plain-English outlook — computed
live in the browser from freshly fetched data. Nothing is pre-baked into the file.

## Why this needs to run on GitHub Pages (not opened as a local file)

Opening `index.html` directly via `file://` blocks every cross-origin fetch, so
the CORS proxy chain this tool relies on (corsproxy.io → allorigins.win →
codetabs) can't reach Yahoo Finance or Google News. Serving the file over HTTPS
(GitHub Pages) is what makes the fetch chain — and therefore the data accuracy
cross-checks — actually work.

## Data sources & how accuracy is protected

| Data | Source | Accuracy safeguard |
|---|---|---|
| Live quote, day range, volume | Yahoo Finance `chart` endpoint | — |
| Fundamentals (PE, EPS, market cap, beta) | Yahoo Finance `quoteSummary` endpoint | Used as a second source: if its price disagrees with the chart endpoint's price by >2%, the snapshot tile shows a "single source" amber flag instead of a silent "verified" green one |
| 2-year daily OHLCV history | Yahoo Finance `chart` endpoint | Feeds every computed indicator, pivot, and Fibonacci level directly — no third-party "signal" API is used, so there's no black box between the raw candles and the levels shown |
| News headlines | Google News RSS | — |
| F&O open interest, delivery % (NSE-native) | *Not fetched* | NSE's Akamai bot-protection blocks these from a static client-side fetch. Rather than approximate or fake them, the tool omits them. Wiring these up reliably needs a dedicated Apps Script backend acting as a proxy — consistent with the approach used across the other Joshi's Corner tools. |

Every number you see (pivots, Fibonacci retracements, the trading call matrix,
the move-summary %s) is computed client-side, in your browser, from the raw
OHLCV series at page-load time — so the repo file itself can never go "stale"
the way a pre-rendered snapshot would.

## Deploying

```bash
git init
git add index.html engine.js README.md
git commit -m "JC Stock Analyst Terminal"
git branch -M main
git remote add origin https://github.com/<your-username>/jc-stock-analyst.git
git push -u origin main
```

Then: repo **Settings → Pages → Source: Deploy from branch → main / (root)**.
Your live tool will be at `https://<your-username>.github.io/jc-stock-analyst/`.

## Known limitations

- Free CORS proxies (corsproxy.io, allorigins.win, codetabs) are rate-limited.
  Under heavy use, add your own Apps Script-based proxy for reliability — the
  same fix already used for NSE gating in the other JC tools.
- Yahoo's unofficial endpoints can change shape without notice. If a fetch
  fails, the tool surfaces the raw error rather than silently showing wrong
  numbers.
- Trading call levels are a systematic volatility-scaling model (σ√T off
  1-year historical volatility, ATR for the intraday row), not personalized
  advice — treat the matrix as a structured starting point, not a signal to
  execute blindly.
