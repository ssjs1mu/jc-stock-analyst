#!/usr/bin/env python3
"""Free up the website: remove report files older than KEEP_DAYS that Google Drive already holds (confirmed by the
archive web app: same path, same size), and point the Reports tab and old booklets at the Drive copies.
Does nothing until data/archive.json has the web-app URL:  {"url": "https://script.google.com/macros/s/.../exec"}"""
import datetime as dt, glob, json, os, re, subprocess, sys, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
KEEP_DAYS = int(os.environ.get("KEEP_DAYS", "15"))
try:
    conf = json.load(open(os.path.join(ROOT, "data", "archive.json")))
except Exception:
    conf = {}
if not conf.get("url"):
    print("archive not connected yet (data/archive.json has no url) - nothing pruned."); sys.exit(0)
try:
    urllib.request.urlopen(conf["url"] + "?action=sync", timeout=330).read()   # let Drive catch up first
except Exception as ex:
    print("sync call:", ex)
arch = json.loads(urllib.request.urlopen(conf["url"] + "?action=list", timeout=120).read())
held = arch.get("files", {})
conf["folder"] = arch.get("folder", conf.get("folder", ""))
cut = (dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).date() - dt.timedelta(days=KEEP_DAYS)).isoformat()
view = lambda i: "https://drive.google.com/file/d/%s/view" % i
img = lambda i: "https://lh3.googleusercontent.com/d/%s=w1080" % i
moved = freed = 0
for ip in glob.glob(os.path.join(ROOT, "reports", "*", "index.json")):
    idx = json.load(open(ip)); ch = False
    for run in idx.get("runs", []):
        if run.get("date", "9999") >= cut:
            continue
        for f in run.get("files", []):
            p = f.get("path"); h = held.get(p or "")
            full = os.path.join(ROOT, p) if p else None
            if not p or f.get("drive") or f.get("type") not in ("png", "pdf") or not h or not os.path.exists(full) or os.path.getsize(full) != h.get("bytes"):
                continue   # not confirmed in Drive at the same size: keep it on the site
            f["drive"] = view(h["id"]); f["drive_id"] = h["id"]; f["site_path"] = p
            f["path"] = img(h["id"]) if f["type"] == "png" else view(h["id"])   # the Reports tab keeps working from Drive
            os.remove(full); moved += 1; freed += h["bytes"]; ch = True
    if ch:
        json.dump(idx, open(ip, "w"), indent=1)
# old dated booklets: load their page images from Drive
ids = {}
for ip in glob.glob(os.path.join(ROOT, "reports", "*", "index.json")):
    for run in json.load(open(ip)).get("runs", []):
        for f in run.get("files", []):
            if f.get("drive_id"):
                ids[f.get("site_path") or f["path"]] = f["drive_id"]
for kind in ("morning", "evening", "muhurat"):
    for hp in glob.glob(os.path.join(ROOT, kind, "20*", "index.html")):
        s = open(hp).read()
        n = re.sub(r'(?:\.\./)+(reports/[a-z-]+/[A-Za-z0-9_.\-]+\.png)', lambda m: img(ids[m.group(1)]) if m.group(1) in ids else m.group(0), s)
        if n != s:
            open(hp, "w").write(n)
json.dump(conf, open(os.path.join(ROOT, "data", "archive.json"), "w"), indent=1)
print("moved %d files to Drive-only, %.1f MB freed on the site (kept the last %d days)" % (moved, freed / 1e6, KEEP_DAYS))
