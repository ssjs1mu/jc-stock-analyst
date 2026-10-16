# Scheduled report runbook (shared by every report task)

Each scheduled task's prompt says: clone this repo, then follow `schedules/<id>.md`.
That file holds the report-specific research and layout; this file holds the steps
common to all of them. Read both before doing anything.

## 1. Workspace
- Repo is cloned at `$REPO` (the clone path from the prompt). Work in a scratch
  folder **outside** the repo (e.g. `~/run`) so drafts never get committed.
- Branding PNGs are already committed in `pipeline/branding/` — do NOT re-extract or
  hand-draw a logo. Renderers in `pipeline/` already point at them.
- Check tools once: `python3 -c "import playwright, PIL, numpy"` and `which pdfimages pdftoppm`.
  If missing: `pip install playwright --break-system-packages && python3 -m playwright install chromium`
  / `apt-get install -y poppler-utils`. Never skip the branded pipeline.

## 2. Date and trading-day check
- Get the real time first: `TZ='Asia/Kolkata' date`. Never reuse a date from a prior run.
- Confirm by web search whether today is an NSE/BSE trading day. The schedule
  already excludes weekends; weekday holidays still need checking.
- On a holiday follow the report file's holiday rule. If it says "no report",
  record it so the terminal tab shows why nothing appeared:
  `python3 $REPO/pipeline/publish.py <id> --status holiday --note "NSE holiday: <name>"`
- First trading day after a holiday/weekend: proceed normally; "previous close"
  means the actual last trading session.

## 3. Research rules (all reports)
- Read `schedules/SOURCES.md` first: it lists the genuine sources to use and the no-waiting rules for unattended runs.
- Fresh session, no memory: research every figure live (WebSearch/WebFetch).
- Never fabricate a number, company, call, IPO or corporate action. An honest
  "none scheduled" / "n/a — not verifiable" row is correct.
- F&O expiry mapping (SEBI 2025): Nifty weekly = **Tuesday** (monthly last Tuesday),
  Sensex weekly = **Thursday** (monthly last Thursday), Bank Nifty = monthly only,
  last Tuesday. Check the weekday before writing any expiry text.

## 4. Render
- Letterhead reports: build a JSON config and run
  `python3 $REPO/pipeline/render_pdf.py --config cfg.json --output <File>.pdf`
  (schema in the script's docstring; `"trend": true` on level/%-change tables;
  `"style": "framed"` on a "Today's Bias in Brief" section).
- `generated_line` = `"Generated: <date>, <time> IST"` from the real clock.
- Infographics use `render_infographic_pdf.py` / `render_cas_infographic.py` as
  the report file says.

## 5. Check before delivering (mandatory)
- Page count via `pypdf`; render pages with `pdftoppm -png -r 100 file.pdf preview`
  and actually look at every page: nothing cut off, no overlap with header/footer/
  watermark, no literal `&amp;`/`&middot;`, no black-box glyphs, numbers match the config.
- Fix and re-render if anything is off. Delete preview PNGs afterwards.

## 6. Deliver — three places, in this order
1. **Chat:** `SendUserFile` with a one-line caption (primary deliverable).
2. **Terminal tab (GitHub):**
   `cd $REPO && python3 pipeline/publish.py <id> --file <File>.pdf --caption "<same one line>"`
   (add a second `--file` for a PNG companion). This commits to
   `reports/<id>/` and pushes; the page's View menu shows it within ~2 minutes.
   If the push fails, say so in the summary — don't retry endlessly.
3. **Google Drive → Telegram** (only where the report file says so): upload with
   `mcp__Google_Drive__create_file` — title = exact filename, parentId
   `1R49rV9xL7ifcadXA--3kZDTaErOFt2Ee`, base64Content = file bytes,
   contentMimeType `application/pdf` (or `image/png`), disableConversionToGoogleType true.
   Only upload when every figure came from genuine live research this run; if
   research failed broadly, skip it and say why. Treat it as best-effort.

## 7. If the run fails
Still try to record it: `python3 $REPO/pipeline/publish.py <id> --status failed --note "<short reason>"`,
then explain in the final summary. This is unattended — make reasonable judgment
calls and note them in the report or summary instead of asking questions.
