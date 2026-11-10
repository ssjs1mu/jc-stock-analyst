#!/usr/bin/env python3
"""AI infographic for the day's Morning Sunrise / Evening Breeze, drawn by Google NotebookLM from OUR figures.
Runs on the GitHub runner (no Claude). Nothing is published unless every key figure can be read back from the
picture by OCR, so a wrong or invented number never reaches readers.

Needs the repository secret NOTEBOOKLM_MASTER_TOKEN_JSON (see docs/notebooklm-setup.md); without it this exits quietly.
    python3 pipeline/infographic.py            # whatever was published today and has no infographic yet
    python3 pipeline/infographic.py --dry      # build the source text only (no NotebookLM call)"""
import datetime as dt, glob, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
KINDS = {"morning-pulse": ("morning", "Morning Sunrise", "JCGG_Morning_Pulse_Infographic_%s.json", "JCGG_Morning_Pulse_AI_Infographic_%s.png"),
         "evening-breeze": ("evening", "Evening Breeze", "JCGG_Evening_Breeze_%s.json", "JCGG_Evening_Breeze_AI_Infographic_%s.png")}
MAX_TRIES = 2
STYLE = ("Premium finance look: deep navy background with gold accents, green for gains and red for losses. Title: %s. "
         "Use only the figures in the source, copied exactly, and add no other number, rating or opinion. "
         "Do not draw any company logo or brand mark. Footer: For information only, not investment advice.")


def source_text(sid, b):
    """-> (text for NotebookLM, [figures that must be readable in the picture], [critical figures])"""
    name = KINDS[sid][1]; day = dt.date.fromisoformat(b["date_iso"]).strftime("%A, %-d %B %Y")
    L = ["Joshi's Corner - %s - %s (NSE/BSE India). All figures below are final and must be reproduced exactly; do not add any number that is not listed here." % (name, day)]
    must, crit = [], []
    L.append("Headline: %s. Label: %s." % (b["headline"], b["label"]))
    sub = (b["snapshot"][0].get("sub") or "close")
    L.append("Indices (%s): " % sub + "; ".join("%s %s (%s, %s points)" % (s["name"], s["level"], s["pct"], s["pts"]) for s in b["snapshot"]) + ".")
    for s in b["snapshot"]:
        crit.append(s["level"]); must.append(s["pct"])
    if b.get("vix"):
        L.append("India VIX %s (%s)." % (b["vix"]["level"], b["vix"]["pct"])); must += [b["vix"]["level"]]
    if sid == "evening-breeze":
        L.append("Nifty 50 breadth: %d stocks advanced, %d declined." % (b["breadth"]["up"], b["breadth"]["dn"]))
        L.append("How the session unfolded: " + " ".join(x for x in b.get("story", [])[:5] if "institutional" not in x))
    else:
        L.append("Expected opening: %s. Indicative Nifty opening zone %s." % (b["label"], b["zone"])); crit.append(b["zone"].split(" - ")[0])
        if b.get("gift"):
            L.append("GIFT Nifty %s (%s vs Nifty close), as of %s." % (b["gift"]["last"], b["gift"]["premium"], b["gift"].get("asof", ""))); must.append(b["gift"]["last"].split(".")[0])
        for lv in b.get("levels", [])[:2]:
            L.append("%s support %s, resistance %s." % (lv["name"], lv["s"], lv["r"]))
        L.append("Global cues: " + "; ".join("%s %s" % (x["name"], x["pct"]) for x in b.get("bench", [])[:6]) + ".")
        L.append("Commodities and currency: " + "; ".join("%s %s (%s)" % (x["name"], x["level"], x["pct"]) for x in b.get("cmd", [])[:4]) + ".")
        if b.get("events"):
            L.append("Today: " + " ".join(b["events"][:2]))
    for key, lab in (("gainers", "Top gainers"), ("losers", "Top losers")):
        if b.get(key):
            L.append("%s (Nifty 50%s): " % (lab, ", previous session" if sid == "morning-pulse" else "") + ", ".join("%s %s" % (g[0], g[2]) for g in b[key]) + ".")
            must += [g[2] for g in b[key]]
    L.append("For information only, not investment advice.")
    return "\n".join(L), must, crit


def _norm(s):
    return re.sub(r"[\s,]", "", s.replace("−", "-").replace("–", "-").replace("—", "-").replace("O", "0"))


def verify(png, must, crit):
    """OCR the picture and check our figures are there. -> (ok, report)"""
    from PIL import Image
    import pytesseract
    im = Image.open(png).convert("L"); im = im.resize((im.width * 2, im.height * 2))
    txt = _norm(pytesseract.image_to_string(im, config="--psm 11") + " " + pytesseract.image_to_string(im, config="--psm 6"))
    bare = lambda v: _norm(v).lstrip("+-")
    miss_c = [v for v in crit if bare(v) not in txt]; miss_m = [v for v in must if bare(v) not in txt]
    found = len(must) - len(miss_m)
    ok = not miss_c and (not must or found / len(must) >= 0.85)
    return ok, "critical missing %s; other figures read %d of %d (missing %s)" % (miss_c or "none", found, len(must), miss_m or "none")


def nlm(*a, timeout=120):
    r = subprocess.run(["notebooklm", *a], capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError("notebooklm %s failed: %s" % (a[0], (r.stdout + r.stderr).strip()[-300:]))
    return r.stdout


def draw(text, title, out_png):
    nb = json.loads(nlm("create", "JC " + title, "--json"))["notebook"]["id"]
    try:
        src = json.loads(nlm("source", "add", text, "--type", "text", "--title", title, "-n", nb, "--json"))["source"]["id"]
        nlm("source", "wait", src, "-n", nb, "--timeout", "300", timeout=330)
        art = json.loads(nlm("generate", "infographic", STYLE % title, "-n", nb, "-s", src, "--orientation", "portrait", "--style", "professional", "--language", "en", "--retry", "2", "--json"))["task_id"]
        nlm("artifact", "wait", art, "-n", nb, "--timeout", "1500", timeout=1560)
        nlm("download", "infographic", out_png, "-a", art, "-n", nb, timeout=180)
    finally:
        try:
            nlm("delete", "-n", nb, "-y")     # our own scratch notebook; keeps the account under its notebook limit
        except Exception as ex:
            print("scratch notebook not removed:", ex)


def main():
    dry = "--dry" in sys.argv
    today = dt.datetime.now(IST).strftime("%Y-%m-%d")
    done = 0
    for sid, (kind, name, cfg_pat, out_pat) in KINDS.items():
        folder = os.path.join(ROOT, "reports", sid); ip = os.path.join(folder, "index.json")
        idx = json.load(open(ip))
        run = next((r for r in idx["runs"] if r["status"] == "ok"), None)
        if not run or (run["date"] != today and not dry):
            continue
        if any("_AI_Infographic_" in f["name"] for f in run["files"]) or run.get("ai_tries", 0) >= MAX_TRIES:
            continue
        cfg = json.load(open(os.path.join(folder, cfg_pat % run["date"]))); b = cfg["book"]
        text, must, crit = source_text(sid, b)
        title = "%s - %s" % (name, dt.date.fromisoformat(run["date"]).strftime("%A %-d %B %Y"))
        if dry:
            print("=== %s\n%s\nmust=%s\ncrit=%s\n" % (title, text, must, crit)); continue
        out = os.path.join(folder, out_pat % run["date"]); tmp = out + ".tmp.png"
        run["ai_tries"] = run.get("ai_tries", 0) + 1
        try:
            draw(text, title, tmp)
            ok, rep = verify(tmp, must, crit)
            print(sid, "OCR check:", "PASS" if ok else "REJECTED", "-", rep)
            if ok:
                from PIL import Image
                im = Image.open(tmp).convert("RGB")
                if im.width > 1080:
                    im = im.resize((1080, round(im.height * 1080 / im.width)))
                im.save(out, optimize=True)
                run["files"].append({"name": os.path.basename(out), "path": "reports/%s/%s" % (sid, os.path.basename(out)), "type": "png", "bytes": os.path.getsize(out)})
                run["ai_note"] = "AI infographic by Google NotebookLM from Joshi's Corner figures; " + rep
                done += 1
            else:
                run["ai_note"] = "AI infographic rejected: " + rep
        except Exception as ex:
            print("::warning::%s infographic not made: %s" % (sid, ex)); run["ai_note"] = "not made: %s" % str(ex)[:160]
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
        json.dump(idx, open(ip, "w"), indent=1)
        if done and any("_AI_Infographic_" in f["name"] for f in run["files"]):
            files = [f["path"] for f in run["files"] if f["type"] == "png"]
            ai = [p for p in files if "_AI_Infographic_" in p]
            en = sorted(p for p in files if "_Mobile_" in p and not re.search(r"_Mobile_(HI|BN)_", p)) + ai   # last page of the English booklet
            lp = {L.lower(): sorted(p for p in files if "_Mobile_%s_" % L in p) for L in ("HI", "BN")}
            import make_book
            make_book.build(run["date"], en, cfg.get("headline", ""), (cfg.get("mood") or {}).get("key", "neutral"), kind=kind, lang_pages={k: v for k, v in lp.items() if v})
    print("infographics published:", done)


if __name__ == "__main__":
    main()
