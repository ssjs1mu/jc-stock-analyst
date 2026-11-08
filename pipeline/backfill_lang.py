#!/usr/bin/env python3
"""Add the Hindi + Bengali editions to an already published Morning Sunrise / Evening Breeze (run on the runner:
the free translators are only reachable there).  python3 pipeline/backfill_lang.py morning-pulse 2026-11-06"""
import glob, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sid, date = sys.argv[1], sys.argv[2]
stem_js = {"morning-pulse": "JCGG_Morning_Pulse_Infographic_%s.json", "evening-breeze": "JCGG_Evening_Breeze_%s.json"}[sid] % date
mob = {"morning-pulse": "JCGG_Morning_Pulse_Mobile_%s.png", "evening-breeze": "JCGG_Evening_Breeze_Mobile_%s.png"}[sid] % date
folder = os.path.join(ROOT, "reports", sid)
base = os.path.join(folder, mob)
subprocess.check_call([sys.executable, os.path.join(HERE, "render_booklet.py"), "--config", os.path.join(folder, stem_js), "--out", base, "--langs", "hi,bn"])
idx_path = os.path.join(folder, "index.json"); idx = json.load(open(idx_path))
run = next(r for r in idx["runs"] if r["date"] == date and r["status"] == "ok")
have = {f["name"] for f in run["files"]}
for f in sorted(glob.glob(os.path.join(folder, "*_Mobile_HI_%s_*.png" % date)) + glob.glob(os.path.join(folder, "*_Mobile_BN_%s_*.png" % date))):
    n = os.path.basename(f)
    if n not in have:
        run["files"].append({"name": n, "path": "reports/%s/%s" % (sid, n), "type": "png", "bytes": os.path.getsize(f)})
json.dump(idx, open(idx_path, "w"), indent=1)
files = [f["path"] for f in run["files"] if f["type"] == "png" and "_Mobile_" in f["name"]]
en = sorted(p for p in files if not re.search(r"_Mobile_(HI|BN)_", p))
lp = {L.lower(): sorted(p for p in files if "_Mobile_%s_" % L in p) for L in ("HI", "BN")}
cj = json.load(open(os.path.join(folder, stem_js)))
import make_book, make_updates
make_book.build(date, en, cj.get("headline", ""), (cj.get("mood") or {}).get("key", "neutral"), kind="evening" if sid == "evening-breeze" else "morning", lang_pages=lp)
try:
    make_updates.build()
except Exception as ex:
    print("updates card not built:", ex)
print("done", sid, date, len(en), {k: len(v) for k, v in lp.items()})
