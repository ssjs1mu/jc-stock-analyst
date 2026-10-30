# Structure & how to modify (hand-over guide)

Public GitHub Pages app `ssjs1mu/jc-stock-analyst` + a Google Apps Script backend. Static front end, no build step except the Apps Script bundle.

## Front end (repo root)
- `index.html` — terminal shell. Script tags carry `?v=N` cache-busters: **bump N when you edit that file.**
- `radarcore.js` — Early-Mover Radar detection rules (pure functions; loaded before `radar.js`); change thresholds here, then re-run the back-test (see project doc 'early-mover-study'). `radar.js` = panel, popups, universe, results tags. Extra symbols: `data/radar_extra.json` (hand list), `data/universe_extra.json` (Microcap 250, auto).
- `engine.js` (data/analysis, watchlist sync), `dashboard.js` (live dashboard), `calls.js` / `calls_engine.js` (day-trading call engine), `clientrep.js` + `clientdash.js` (Client reports page + client manager UI), `intro.js` (splash), `schedules.js`.
- `c/index.html` — mobile client page (opened from Telegram). Token via `?k=` (24 hex) or localStorage. No client data in the repo; fetched from the backend by token.
- `data/calls/board.json` — generic public per-stock board (no client data).
- `reports/<id>/index.json` + `schedules.json` — report runs published by GitHub Actions.

## Pipeline (GitHub Actions)
- `.github/workflows/day-calls.yml`, `auto-reports.yml` (every 15 min in the IST windows, builds whatever is due; no paid API; `render_pulse_board.py` = daily-varying infographic: 3 layouts x 10 themes); scripts in `pipeline/` (`build_calls.js`, `auto_reports.py` with `NSE_HOLIDAYS`, `publish.py`).

## Backend (`apps-script/`)
Edit the source parts, never `Code.gs` directly: `Code.base.gs` (routes, watchlists), `Calls.server.gs`, `Telegram.server.gs` (schedule, holidays, posts), `Clients.server.gs` (client store, passcode, backups, Telegram to clients). Run `python3 pipeline/build_gs.py` → `Code.gs` → paste into Apps Script editor → Save → Deploy › Manage deployments › edit › Version: **New version** → Deploy.
- Storage: Drive `JC_Clients.json`, `JC_Watchlists.json`, backups in `JC_Backups`. Script properties: TG_TOKEN, TG_CHAT, TG_SENT, TG_NEWS, TG_SIG, TG_ACC, TG_CL, TG_MQ, TG_LT, ADM_H, ADM_S. Never commit their values.
- Trigger: `tgPostReports` every 5 min.
- Quota: free Apps Script ≈ 20,000 URL fetches/day, shared by everything.

## Rules
1. Client names/watchlists/chat ids/tokens never go in the repo or chat. Client setup only through Client reports › Client dashboards.
2. No guaranteed-profit claims. Signal-agreement score is not a probability.
3. Every commit: update `docs/CHANGELOG.md`; end the message with the attribution lines.
4. Trading day = weekday and not in the holiday lists.

## Radar universe & screen (added 2026-10-26, radar v6 / backend v11) [Claude]
- `apps-script/Radar.server.gs`: `qstat` (price, mcap, EPS, P/E, volumes, 50/200-DMA, 52w range) and `qfund` (revenue growth, margin, ROE, D/E, op. cash flow) via Yahoo; routes in Code.base.gs.
- `radarcore.js` `POOL` + `eligible()`: the conservative screen. Change thresholds there only.
- `data/radar_pool.json`: screened extras (seed: 207 of 1,875 on 26-Oct). Re-screen from the radar panel ("re-screen"); update the file by committing the new list.
- `data/nse_equity.json` / `data/universe_extra.json`: candidate lists, written by the constituents job.
- Core 499 (`bigfish.js`) is never altered. Client/own watchlists merge from browser localStorage only; never commit them.

## Today's Outlook (added 2026-10-27) [Claude]
- `outlook.js` renders view `pOutlook`. Inputs: `reports/{morning-brief,morning-detailed,premarket-news}/index.json` → latest run's `.json` (the report config the PDF was rendered from; written by `auto_reports.py`), `data/calls/latest.json` (calls), `data/calls/board.json` (per-stock board used for Buy/Sell/Avoid).
- Frames map by section heading (e.g. "Today's Bias", "Key Levels", "Commodit…", "Headlines"). If a report's headings change in `auto_reports.py build()`, update the matchers in `outlook.js`.
- Buy/Sell/Avoid: BUY/SELL = a call or board signal (or a lean with conviction ≥ 60, marked); AVOID = everything else, including symbols not in the board.
- Search → `jcXray()` first, then `runAnalysis()`; the strip jumps to pSummary/pIntraday/pSwing/pLong with a floating "Back to Today's Outlook" button.
- **Client page (`c/index.html`, opened from the Telegram button or any browser)** loads the same `outlook.js` (it detects the client page): frames 1–4, a Buy/Sell/Avoid frame that uses the client's own list (`window.jcc.S`, exposed by the page) with pop-ups, and the scrip search which opens the terminal in a full-screen frame (`../?embed=1&sym=XYZ`) → X-ray first, then Quick summary / Intraday / Short term / Long term. The old inline watchlist section is hidden.

- **Update 27-Oct (supersedes the "view pOutlook" notes above):** there is no separate Outlook tab in the terminal. `clientrep.js` builds the report: `outlook.js` exposes `jcOutlook.snapshot(mode)` (frames 1–4 as HTML, morning or closing data), `buttons()` (Buy/Sell/Avoid, uses `setList`) and `search()`. `clientrep.js` takes its client list only from `window.jcClients.S` (exposed by `clientdash.js`, populated after the admin passcode unlocks) — see `listsAll()` — so client reports are locked to the Drive client record. Markers `<!--BSA-->` / `<!--SRCH-->` in the cached report HTML are replaced by the live buttons and search when shown (print gets neither).

## Client page update (27 Oct)
c/index.html: old s2 outlook and dashboard iframe removed (hidden #outlook stub kept). outlook.js detects the client page by #toasts. Mood panel (.olMood) uses the dashboard India map; call cards (.olCall); layer stack (pushLayer/popLayer). Live pill #livePill updated by poll().

- `deep.js` (pure analysis core, Node-testable: `JCDeep.analyse({sym,bars,deliv,intra,news,astronomy})`) and `deep/index.html` (page: fetch layer backend→direct→proxies, static `data/ohlc.json`/`delivery.json` fallback, renderer). Linked from the terminal top bar (🔬 Deep). Astro lib loaded from jsdelivr `astronomy-engine@2.1.19`.
