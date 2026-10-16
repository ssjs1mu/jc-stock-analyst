> **Now built automatically** by `.github/workflows/auto-reports.yml` (`pipeline/auto_reports.py morning-pulse`,
> design in `pipeline/render_pulse_board.py`, landscape PNG + PDF), independent of any Claude run.
> The Claude task for this id is retired; the notes below describe the older layout only.

# JCGG Morning Pulse Infographic — 08:45 IST, Mon–Fri  (id: `morning-pulse`)

Follow `schedules/RUNBOOK.md`. Vibrant companion to the gold-letterhead brief —
deliver it independently; don't wait on the other task.

Holiday: no PDF; record `--status holiday` (runbook step 2).

## Research (same data as the Brief)
- Global close: Dow, S&P 500, Nasdaq, FTSE 100, DAX — level + % change + 1–2 sentence driver.
- Asia today: Nikkei, Hang Seng, Shanghai, Kospi — level + % change.
- GIFT Nifty level + implied gap. Commodities: Brent, Gold spot, Gold MCX.
- India VIX, USD/INR — level + % change.
- Key levels for Nifty 50, Bank Nifty, Sensex, plus actual last-close for Nifty and Sensex
  (for the range-bar marker; Bank Nifty marker may be null if no precise close).
- Alerts: 2–3 items or none flagged. F&O expiry: use the runbook mapping (never call a
  Thursday "Nifty expiry" or a Tuesday "Sensex expiry").

## Config for `pipeline/render_infographic_pdf.py`
- `eyebrow` plain text ("Joshi's Corner · Pre-Market", no HTML entities); `headline` "Morning Pulse";
  `subline` raw HTML (date · `<b>Generated hh:mm AM IST</b>` · …).
- `mood` {tag plain, text HTML}; `hero` = GIFT Nifty {label, value, chip HTML, dir up/down by sign}.
- `tile_groups`, in order: "Global & Asian Markets" (cols 3, scale_max 1.5, 9 items);
  "GIFT Nifty & Commodities" (cols 3, scale_max 2.5: GIFT Nifty, Brent, Gold Spot, Gold MCX);
  "India VIX & USD/INR" (cols 2, scale_max 5). Items {name, sub, level, chg float}; plain text
  (write a literal "&", never "&amp;"). Each group has a 1–2 sentence `note`.
- `levels`: Nifty 50 / Bank Nifty / Sensex {name, cur_label, cur_value float|null, low, high, low_label, high_label, caption?}.
- `alerts`: [{tag, tag_class geo|data|deriv|earnings, text HTML}].

Run: `python3 $REPO/pipeline/render_infographic_pdf.py --config infographic.json --output JCGG_Morning_Pulse_Infographic_<YYYY-MM-DD>.pdf`

Check: no double-escaped entities, vivid gradient title and mood pill, glossy cards and
section icons present, markers sensible, expiry wording correct, **fits in 2 pages**
(spilling to 4 = spacing bug, fix it).

## Delivery
Chat → `publish.py morning-pulse` (git handles the size, so this report now reaches the terminal too).
Drive/Telegram: **skip** — the file is too large for the Drive tool's base64 parameter;
mention once in the summary.
