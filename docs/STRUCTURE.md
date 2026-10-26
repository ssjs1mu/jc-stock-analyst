# Structure & how to modify (hand-over guide)

Public GitHub Pages app `ssjs1mu/jc-stock-analyst` + a Google Apps Script backend. Static front end, no build step except the Apps Script bundle.

## Front end (repo root)
- `index.html` — terminal shell. Script tags carry `?v=N` cache-busters: **bump N when you edit that file.**
- `engine.js` (data/analysis, watchlist sync), `dashboard.js` (live dashboard), `calls.js` / `calls_engine.js` (day-trading call engine), `clientrep.js` + `clientdash.js` (Client reports page + client manager UI), `intro.js` (splash), `schedules.js`.
- `c/index.html` — mobile client page (opened from Telegram). Token via `?k=` (24 hex) or localStorage. No client data in the repo; fetched from the backend by token.
- `data/calls/board.json` — generic public per-stock board (no client data).
- `reports/<id>/index.json` + `schedules.json` — report runs published by GitHub Actions.

## Pipeline (GitHub Actions)
- `.github/workflows/day-calls.yml`, `auto-reports.yml`; scripts in `pipeline/` (`build_calls.js`, `auto_reports.py` with `NSE_HOLIDAYS`, `publish.py`).

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
