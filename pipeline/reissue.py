#!/usr/bin/env python3
"""Re-issue an Evening Breeze whose changes were measured from the wrong previous close (a special session such
as Diwali Muhurat missing from the daily feed). Runs on the GitHub runner, before the next session opens:
    python3 pipeline/reissue.py evening-breeze 2026-11-09
Indian-market figures are rebuilt with the normal pipeline; the global, commodity, news, next-day and risk
sections are kept exactly as first published (they were right, and are time-of-day specific)."""
import datetime as dt, glob, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import auto_reports as A, special_session

sid, date = sys.argv[1], sys.argv[2]
assert sid == "evening-breeze", "only the Evening Breeze can be re-issued"
folder = os.path.join(ROOT, "reports", sid)
cfg_path = os.path.join(folder, "JCGG_Evening_Breeze_%s.json" % date)
saved = json.load(open(cfg_path)); ob = saved["book"]
m = re.match(r"(\d+):(\d+) (AM|PM)", ob.get("asof", "04:10 PM"))
hh = int(m.group(1)) % 12 + (12 if m.group(3) == "PM" else 0)
now = dt.datetime.fromisoformat(date).replace(hour=hh, minute=int(m.group(2)), tzinfo=A.IST)

qs, heads = A.gather()
n = qs.get("^NSEI")
if not n or n["date"] != date:
    sys.exit("::error::Latest Nifty bar is %s, not %s - too late (or too early) to re-issue from live data." % (n and n["date"], date))
sp = [D for D in special_session.dates() if D < date]
D = sp[-1] if sp else None
fixed = [s for s in A.NIFTY50 if (qs.get(s + ".NS") or {}).get("pdate") == D]
idx_ok = [k for k in ("^NSEI", "^BSESN", "^NSEBANK", "^CRSLDX", "^INDIAVIX") if (qs.get(k) or {}).get("pdate") == D]
print("re-based on %s: %d Nifty-50 stocks, indices %s" % (D, len(fixed), idx_ok))
if not D or len(fixed) < 45 or len(idx_ok) < 4:
    sys.exit("::error::Special-session closes incomplete (%d stocks, %d indices) - nothing re-issued." % (len(fixed), len(idx_ok)))

cfg = A.build(sid, qs, heads, now); b = cfg["book"]
for k in ("bench", "cmd", "headlines", "opening", "nextday", "risks", "events", "flows", "asof"):
    if k in ob:
        b[k] = ob[k]
old_s, new_s = ob["summary"].split(". "), b["summary"].split(". ")
b["summary"] = ". ".join(o if o.startswith("Brent") else x for o, x in zip(old_s, new_s)) if len(old_s) == len(new_s) else b["summary"]
dtxt = dt.date.fromisoformat(D).strftime("%-d %b")
b["gen"] = "%s; corrected %s" % (ob.get("asof", "").replace(" IST", ""), dt.datetime.now(A.IST).strftime("%-d %b, %I:%M %p"))   # cover line: "Report generated 04:07 PM; corrected 10 Nov, 12:49 PM IST"
b["corrected"] = {"on": dt.datetime.now(A.IST).isoformat(timespec="seconds"), "base": D}
json.dump(cfg, open(cfg_path, "w"), indent=1)

for f in glob.glob(os.path.join(folder, "JCGG_Evening_Breeze_Mobile_*%s_*.png" % date)):
    os.remove(f)
base = os.path.join(folder, "JCGG_Evening_Breeze_Mobile_%s.png" % date)
subprocess.check_call([sys.executable, os.path.join(HERE, "render_booklet.py"), "--config", cfg_path, "--out", base, "--langs", "en,hi,bn"])
idx_path = os.path.join(folder, "index.json"); idx = json.load(open(idx_path))
run = next(r for r in idx["runs"] if r["date"] == date and r["status"] == "ok")
pages = sorted(glob.glob(os.path.join(folder, "JCGG_Evening_Breeze_Mobile_*%s_*.png" % date)))
run["files"] = [{"name": os.path.basename(f), "path": "reports/%s/%s" % (sid, os.path.basename(f)), "type": "png", "bytes": os.path.getsize(f)} for f in pages] \
    + [f for f in run["files"] if f["type"] != "png"]
run["note"] = "Corrected edition (changes measured from the %s special-session close)." % dtxt
json.dump(idx, open(idx_path, "w"), indent=1)
files = [f["path"] for f in run["files"] if f["type"] == "png"]
en = sorted(p for p in files if not re.search(r"_Mobile_(HI|BN)_", p))
lp = {L.lower(): sorted(p for p in files if "_Mobile_%s_" % L in p) for L in ("HI", "BN")}
import make_book, make_updates
make_book.build(date, en, cfg.get("headline", ""), (cfg.get("mood") or {}).get("key", "neutral"), kind="evening", lang_pages=lp)
try:
    make_updates.build()
except Exception as ex:
    print("updates card not built:", ex)
print("re-issued", sid, date, len(en), {k: len(v) for k, v in lp.items()}, "|", b["headline"], "|", b["summary"])
