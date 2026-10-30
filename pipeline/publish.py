#!/usr/bin/env python3
"""Publish a scheduled report into the repo so the terminal's schedule tab shows it.

Usage (run from anywhere inside the repo clone):
  python3 pipeline/publish.py <schedule_id> --file Report_2026-10-16.pdf [--file extra.png] \
      [--caption "one line"] [--status ok|holiday|failed|skipped] [--note "why"]

  For a holiday or a failed run, omit --file and pass --status/--note so the
  tab says what happened instead of silently showing yesterday's report.

Each schedule writes only to reports/<schedule_id>/, so tasks that fire at the
same minute never edit the same file. Push retries with rebase on conflict.
"""
import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEEP = 90  # entries kept in each schedule's index (older files stay in git history)


def git(*args, check=True):
    return subprocess.run(["git", "-C", ROOT, *args], check=check, capture_output=True, text=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("schedule_id")
    ap.add_argument("--file", action="append", default=[])
    ap.add_argument("--caption", default="")
    ap.add_argument("--status", default="ok", choices=["ok", "holiday", "failed", "skipped"])
    ap.add_argument("--note", default="")
    a = ap.parse_args()

    with open(os.path.join(ROOT, "schedules.json")) as f:
        ids = {s["id"] for s in json.load(f)["schedules"]}
    if a.schedule_id not in ids:
        sys.exit(f"Unknown schedule id {a.schedule_id!r}; valid: {sorted(ids)}")
    if a.status == "ok" and not a.file:
        sys.exit("--status ok needs at least one --file")

    ist = dt.timezone(dt.timedelta(hours=5, minutes=30))
    now = dt.datetime.now(ist)
    folder = os.path.join(ROOT, "reports", a.schedule_id)
    os.makedirs(folder, exist_ok=True)

    files = []
    for src in a.file:
        if not os.path.isfile(src):
            sys.exit(f"File not found: {src}")
        name = os.path.basename(src)
        shutil.copyfile(src, os.path.join(folder, name))
        files.append({"name": name, "path": f"reports/{a.schedule_id}/{name}",
                      "type": os.path.splitext(name)[1].lstrip(".").lower(),
                      "bytes": os.path.getsize(src)})

    entry = {"generated_at": now.isoformat(timespec="seconds"), "date": now.strftime("%Y-%m-%d"),
             "status": a.status, "caption": a.caption, "note": a.note, "files": files}

    idx_path = os.path.join(folder, "index.json")
    try:
        with open(idx_path) as f:
            idx = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        idx = {"schedule_id": a.schedule_id, "runs": []}
    # A successful run replaces an earlier holiday/failed marker for the same day.
    runs = [r for r in idx["runs"] if not (a.status == "ok" and r["date"] == entry["date"] and r["status"] != "ok")]
    runs.insert(0, entry)
    idx["runs"] = runs[:KEEP]
    idx["updated_at"] = entry["generated_at"]
    with open(idx_path, "w") as f:
        json.dump(idx, f, indent=1)

    book_added = False
    if a.schedule_id in ("morning-pulse", "evening-breeze") and a.status == "ok":
        kind = "evening" if a.schedule_id == "evening-breeze" else "morning"
        pages = sorted(x["path"] for x in files if "_Mobile_" in x["name"] and x["type"] == "png")
        if pages:
            try:   # booklet page (flip-book) + preview card, so a shared link shows as a picture card
                sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
                import make_book
                head, mood = "", "neutral"
                for src in a.file:
                    if src.endswith(".json"):
                        cj = json.load(open(src))
                        head = cj.get("headline", "")
                        mood = (cj.get("mood") or {}).get("key", "neutral")
                make_book.build(entry["date"], pages, head, mood, kind=kind)
                book_added = True
            except Exception as ex:
                print("booklet not built:", ex)
    git("config", "user.name", "Joshi's Corner scheduler", check=False)
    git("config", "user.email", "joshiscorner.group@gmail.com", check=False)
    git("add", f"reports/{a.schedule_id}")
    if book_added:
        git("add", "evening" if a.schedule_id == "evening-breeze" else "morning")
    msg = f"report: {a.schedule_id} {entry['date']} ({a.status})"
    git("commit", "-m", msg)
    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    for attempt in range(6):
        push = git("push", "origin", f"HEAD:{branch}", check=False)
        if push.returncode == 0:
            print("Published", msg, "->", ", ".join(x["path"] for x in files) or "(status only)")
            print("Visible at https://ssjs1mu.github.io/jc-stock-analyst/ (View menu) within ~1-2 minutes.")
            return
        print("Push rejected, rebasing and retrying:", push.stderr.strip()[:200])
        # Other schedules only touch their own reports/<id>/ folder, so a rebase never conflicts with them.
        git("pull", "--rebase", "origin", branch, check=False)
        time.sleep(3 + attempt * 4)
    sys.exit("Push failed after 6 attempts")


if __name__ == "__main__":
    main()
