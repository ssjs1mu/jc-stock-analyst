#!/usr/bin/env python3
"""SECTOR DIGEST - where money flowed in / out today, the stocks that show it, F&O positioning, RSI-14 reversal attempts
and the full Circuit Watch (price-band hitters, 52-week highs / lows on heavy volume) - one light phone booklet + PDF.
Replaces the Circuit Watch PDF; keeps everything it carried (session snapshot, circuit table with Stock | Move |
Recommendation | Reason in hedged language, data verification notes, the verbatim disclaimer).

Every figure comes from the exchange's own end-of-day files (nsearchives.nseindia.com), fetched by GitHub - free:
  sec_bhavdata_full   price, volume, turnover, delivery %         PR zip: bh (band hitters), an (announcements), pd
  CM_52_wk_High_low   52-week highs / lows with dates              sec_list.csv: price band of each stock
  ind_close_all       every NSE index (sectors, VIX)               F&O UDiFF bhavcopy: strike-wise OI -> PCR, OI walls, build-up
  fao_participant_oi  FII / DII / Pro / Client derivative positions  data/ohlc.json + data/delivery.json: history for RSI-14 / averages
Nothing is estimated: a figure that is missing is shown as '-' and listed in the verification notes.

  python pipeline/sector_digest.py [--date YYYY-MM-DD] [--dry --out DIR] [--raw CACHE] [--force]
"""
import argparse, csv, datetime as dt, html, io, json, math, os, re, subprocess, sys, time, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import brand  # noqa: E402

SID = "sector-digest"
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "Accept": "*/*", "Referer": "https://www.nseindia.com/"}
NOTES = []          # data verification notes (shown on the last page)
e = lambda s: html.escape(str(s if s is not None else ""))

# core sectors (index key in data/constituents.json -> label, words to find it in ind_close_all)
SECTORS = [
    ("^NSEBANK", "Bank", ["nifty bank"]), ("NIFTY_PVT_BANK.NS", "Private Bank", ["private bank"]), ("^CNXPSUBANK", "PSU Bank", ["psu bank"]),
    ("^CNXFIN", "Financial Services", ["financial services"]), ("^CNXIT", "IT", ["nifty it"]), ("^CNXAUTO", "Auto", ["nifty auto"]),
    ("^CNXFMCG", "FMCG", ["nifty fmcg"]), ("^CNXPHARMA", "Pharma", ["nifty pharma"]), ("NIFTY_HEALTHCARE.NS", "Healthcare", ["healthcare"]),
    ("^CNXMETAL", "Metal", ["nifty metal"]), ("^CNXENERGY", "Energy", ["nifty energy"]), ("NIFTY_OIL_AND_GAS.NS", "Oil & Gas", ["oil & gas", "oil and gas"]),
    ("^CNXREALTY", "Realty", ["nifty realty"]), ("^CNXINFRA", "Infrastructure", ["infrastructure", "nifty infra"]), ("^CNXMEDIA", "Media", ["nifty media"]),
    ("NIFTY_CONSR_DURBL.NS", "Consumer Durables", ["consumer durables"]), ("NIFTY_IND_DEFENCE.NS", "Defence", ["india defence", "defence"]),
    ("NIFTY_IND_DIGITAL.NS", "Digital", ["india digital"]), ("^CNXPSE", "PSE (PSU stocks)", ["nifty pse"]), ("^CNXCMDT", "Commodities", ["commodities"]),
]
# overlapping parent / theme sectors are shown in the table but not picked as the headline in / out sectors
NOT_HEADLINE = {"^NSEBANK", "^CNXFIN", "^CNXPSE", "^CNXCMDT", "NIFTY_HEALTHCARE.NS", "^CNXENERGY"}


# ------------------------------------------------------------------ fetch
def fetch(url, raw=None, name=None, tries=3):
    if raw and name and os.path.exists(os.path.join(raw, name)):
        return open(os.path.join(raw, name), "rb").read()
    last = None
    for a in range(tries):
        try:
            b = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
            if raw and name:
                os.makedirs(raw, exist_ok=True); open(os.path.join(raw, name), "wb").write(b)
            return b
        except Exception as ex:
            last = ex; time.sleep(4 * (a + 1))
            if "404" in str(ex): break
    raise RuntimeError("%s: %s" % (url.rsplit("/", 1)[-1], str(last)[:80]))


def num(x):
    try:
        x = str(x).strip().replace(",", "")
        return float(x) if x not in ("", "-", "NA", "nan") else None
    except ValueError:
        return None


def dmy(d): return d.strftime("%d%m%Y")


def load_all(d, raw):
    D, Y = dmy(d), d.strftime("%Y%m%d")
    dd, mm, yy = d.strftime("%d"), d.strftime("%m"), d.strftime("%y")
    out = {}
    # 1. security-wise full bhavcopy (required)
    t = fetch("https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_%s.csv" % D, raw, "sec_%s.csv" % D).decode("latin-1")
    sec = {}
    for r in csv.DictReader(io.StringIO(t)):
        r = {k.strip(): (v or "").strip() for k, v in r.items()}
        if r.get("SERIES") not in ("EQ", "BE", "BZ", "SM", "ST"): continue
        sec[r["SYMBOL"]] = dict(series=r["SERIES"], prev=num(r["PREV_CLOSE"]), o=num(r["OPEN_PRICE"]), h=num(r["HIGH_PRICE"]), l=num(r["LOW_PRICE"]),
                                c=num(r["CLOSE_PRICE"]), qty=num(r["TTL_TRD_QNTY"]) or 0, tlac=num(r["TURNOVER_LACS"]) or 0, dp=num(r["DELIV_PER"]))
    if len(sec) < 1000: raise RuntimeError("security bhavcopy looks incomplete (%d rows)" % len(sec))
    out["sec"] = sec
    # 2. PR zip: band hitters, announcements
    try:
        z = zipfile.ZipFile(io.BytesIO(fetch("https://nsearchives.nseindia.com/archives/equities/bhavcopy/pr/PR%s%s%s.zip" % (dd, mm, yy), raw, "PR%s.zip" % D)))
        nm = {n.lower()[:2]: n for n in z.namelist()}
        bh = list(csv.DictReader(io.StringIO(z.read(nm["bh"]).decode("latin-1"))))
        out["bh"] = [{"sym": r["SYMBOL"].strip(), "series": r["SERIES"].strip(), "name": r["SECURITY"].strip(), "hl": r["HIGH/LOW"].strip()} for r in bh]
        ann = {}
        for ln in z.read(nm["an"]).decode("latin-1").splitlines()[1:]:
            m = re.search(r"\s([A-Z0-9&\-]{2,20})\s:\s(.+?)\s\1\s:\s(.*)", ln)
            if m: ann.setdefault(m.group(1), []).append((m.group(2).strip(), m.group(3).strip()))
        out["ann"] = ann
    except Exception as ex:
        out["bh"], out["ann"] = None, {}; NOTES.append("Exchange price-band-hitter / announcement file not available (%s); circuit section left empty rather than estimated." % ex)
    # 3. price bands
    try:
        bands = {}
        for r in csv.DictReader(io.StringIO(fetch("https://nsearchives.nseindia.com/content/equities/sec_list.csv", raw, "sec_list.csv").decode("latin-1"))):
            bands[(r["Symbol"].strip(), r["Series"].strip())] = r["Band"].strip()
        out["band"] = bands
    except Exception as ex:
        out["band"] = {}; NOTES.append("Price-band list not available (%s)." % ex)
    # 4. 52-week high / low file
    try:
        t = fetch("https://nsearchives.nseindia.com/content/CM_52_wk_High_low_%s.csv" % D, raw, "52wk_%s.csv" % D).decode("latin-1").splitlines()
        i = next(k for k, l in enumerate(t) if l.startswith('"SYMBOL"'))
        w52 = {}
        for r in csv.DictReader(io.StringIO("\n".join(t[i:]))):
            if r["SERIES"] in ("EQ", "BE"): w52[r["SYMBOL"]] = (num(r["Adjusted_52_Week_High"]), r["52_Week_High_Date"], num(r["Adjusted_52_Week_Low"]), r["52_Week_Low_DT"])
        out["w52"] = w52
    except Exception as ex:
        out["w52"] = {}; NOTES.append("52-week high / low file not available (%s)." % ex)
    # 5. all NSE indices
    try:
        idx = {}
        for r in csv.DictReader(io.StringIO(fetch("https://nsearchives.nseindia.com/content/indices/ind_close_all_%s.csv" % D, raw, "ind_%s.csv" % D).decode("latin-1"))):
            idx[r["Index Name"].strip()] = dict(c=num(r["Closing Index Value"]), ch=num(r["Points Change"]), pct=num(r["Change(%)"]), to=num(r["Turnover (Rs. Cr.)"]), pe=num(r["P/E"]))
        out["idx"] = idx
    except Exception as ex:
        out["idx"] = {}; NOTES.append("Index closing file not available (%s); sector moves computed from their stocks instead." % ex)
    # 6. F&O bhavcopy (strike-wise OI)
    try:
        z = zipfile.ZipFile(io.BytesIO(fetch("https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_%s_F_0000.csv.zip" % Y, raw, "fo_%s.zip" % D)))
        out["fo"] = list(csv.DictReader(io.StringIO(z.read(z.namelist()[0]).decode("latin-1"))))
    except Exception as ex:
        out["fo"] = []; NOTES.append("F&O bhavcopy not available (%s); PCR, OI range and build-up left blank." % ex)
    return out


def participant(d, prev, raw):
    res = {}
    for k, day in (("now", d), ("prev", prev)):
        if not day: continue
        try:
            t = fetch("https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_%s.csv" % dmy(day), raw, "poi_%s.csv" % dmy(day)).decode("latin-1").splitlines()
            rows = list(csv.reader(t[1:]))
            hd = [h.strip() for h in rows[0]]
            res[k] = {r[0].strip(): {hd[i]: num(r[i]) for i in range(1, len(hd))} for r in rows[1:] if r and r[0].strip()}
        except Exception as ex:
            if k == "now": NOTES.append("Participant-wise OI not available (%s)." % ex)
    return res


# ------------------------------------------------------------------ analytics
def rsi(closes, n=14):
    if len(closes) < n + 2: return None, None
    g = l = 0.0
    for i in range(1, n + 1):
        ch = closes[i] - closes[i - 1]; g += max(ch, 0); l += max(-ch, 0)
    g /= n; l /= n; vals = []
    for i in range(n + 1, len(closes)):
        ch = closes[i] - closes[i - 1]; g = (g * (n - 1) + max(ch, 0)) / n; l = (l * (n - 1) + max(-ch, 0)) / n
        vals.append(100.0 if l == 0 else 100 - 100 / (1 + g / l))
    return (vals[-1] if vals else None), (vals[-2] if len(vals) > 1 else None)


def history(d):
    """closes and traded qty per symbol from the stored NSE history, before day d"""
    oh = json.load(open(os.path.join(ROOT, "data", "ohlc.json")))["d"]; dl = json.load(open(os.path.join(ROOT, "data", "delivery.json")))["d"]
    days = sorted(k for k in oh if k < d.isoformat())[-120:]
    cl, qt = {}, {}
    for k in days:
        for s, v in oh[k].items(): cl.setdefault(s, []).append(v[3])
        for s, v in (dl.get(k) or {}).items(): qt.setdefault(s, []).append(v[1] if isinstance(v, list) and len(v) > 1 else None)
    return cl, qt, days


def fo_stats(rows, today):
    """per underlying: PCR (nearest expiry, OI), call / put OI walls, top OI-change strikes; futures OI build-up"""
    opt, fut = {}, {}
    if rows:                                   # column names vary slightly between file versions: map by prefix
        ks = list(rows[0].keys())
        pick = lambda pre: next((k for k in ks if k and k.strip().lower().startswith(pre.lower())), pre)
        K = {"ChngInOpnInt": pick("ChngInOpnInt"), "OpnIntrst": pick("OpnIntrst")}
        if K["ChngInOpnInt"] != "ChngInOpnInt" or K["OpnIntrst"] != "OpnIntrst":
            rows = [dict(r, ChngInOpnInt=r.get(K["ChngInOpnInt"]), OpnIntrst=r.get(K["OpnIntrst"])) for r in rows]
    for r in rows:
        tp, s = r.get("FinInstrmTp"), r.get("TckrSymb")
        if tp in ("IDO", "STO"):
            opt.setdefault(s, []).append((r["XpryDt"], num(r["StrkPric"]), r["OptnTp"], num(r["OpnIntrst"]) or 0, num(r["ChngInOpnInt"]) or 0, num(r["UndrlygPric"])))
        elif tp in ("IDF", "STF"):
            fut.setdefault(s, []).append((r["XpryDt"], num(r["ClsPric"]), num(r["PrvsClsgPric"]), num(r["OpnIntrst"]) or 0, num(r["ChngInOpnInt"]) or 0, num(r["UndrlygPric"])))
    out = {}
    for s, L in opt.items():
        exps = sorted({x[0] for x in L if x[0] >= today})
        if not exps: continue
        ex = exps[0]
        if s in ("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"):      # nearest expiry with real open interest
            for x in exps:
                if sum(y[3] for y in L if y[0] == x) > 0: ex = x; break
        N = [x for x in L if x[0] == ex]
        ce = sum(x[3] for x in N if x[2] == "CE"); pe = sum(x[3] for x in N if x[2] == "PE")
        spot = next((x[5] for x in N if x[5]), None)
        cs = sorted([x for x in N if x[2] == "CE" and x[3] > 0], key=lambda x: -x[3]); ps = sorted([x for x in N if x[2] == "PE" and x[3] > 0], key=lambda x: -x[3])
        cw = next((x for x in cs if spot is None or x[1] >= spot), cs[0] if cs else None); pw = next((x for x in ps if spot is None or x[1] <= spot), ps[0] if ps else None)
        cadd = sorted([x for x in N if x[2] == "CE"], key=lambda x: -x[4])[:1]; padd = sorted([x for x in N if x[2] == "PE"], key=lambda x: -x[4])[:1]
        out[s] = {"exp": ex, "pcr": round(pe / ce, 2) if ce else None, "ceoi": ce, "peoi": pe, "spot": spot,
                  "cmax": cs[0][1] if cs else None, "pmax": ps[0][1] if ps else None, "cwall": cw[1] if cw else None, "pwall": pw[1] if pw else None,
                  "ctop": [(x[1], x[3], x[4]) for x in cs[:3]], "ptop": [(x[1], x[3], x[4]) for x in ps[:3]],
                  "cadd": cadd[0][1] if cadd and cadd[0][4] > 0 else None, "padd": padd[0][1] if padd and padd[0][4] > 0 else None}
    for s, L in fut.items():
        oi = sum(x[3] for x in L); doi = sum(x[4] for x in L)
        near = sorted(L)[0]
        pch = (near[1] / near[2] - 1) * 100 if near[1] and near[2] else None
        prev_oi = oi - doi
        oip = doi / prev_oi * 100 if prev_oi > 0 else None
        bu = None
        if pch is not None and oip is not None and abs(oip) >= 1:
            bu = ("Long build-up" if oip > 0 else "Short covering") if pch > 0 else ("Short build-up" if oip > 0 else "Long unwinding")
        out.setdefault(s, {}).update({"foi": oi, "doi": doi, "oip": oip, "fpch": pch, "bu": bu})
    return out


def build(d, raw):
    data = load_all(d, raw)
    sec = data["sec"]; cl, qt, days = history(d)
    prevday = dt.date.fromisoformat(days[-1]) if days else None
    cons = json.load(open(os.path.join(ROOT, "data", "constituents.json")))["idx"]
    fo = fo_stats(data["fo"], d.isoformat())
    poi = participant(d, prevday, raw)
    # ---- per stock
    S = {}
    gaps = []
    for s, v in sec.items():
        if v["series"] not in ("EQ", "BE", "BZ") or not v["c"] or not v["prev"]: continue
        h, l, c = v["h"], v["l"], v["c"]
        mfm = ((c - l) - (h - c)) / (h - l) if h and l and h > l else (1 if c > v["prev"] else -1 if c < v["prev"] else 0)
        tcr = v["tlac"] / 100.0                                      # Rs crore
        hc = cl.get(s, [])
        if hc and abs(v["prev"] / hc[-1] - 1) > 0.25: gaps.append(s); hc = []   # corporate action / stale history: no RSI
        r_now, r_prev = rsi(hc + [c]) if hc else (None, None)
        q = [x for x in qt.get(s, [])[-20:] if x]
        avgq = sum(q) / len(q) if len(q) >= 10 else None
        S[s] = dict(v, sym=s, pct=(c / v["prev"] - 1) * 100, tcr=tcr, mf=mfm * tcr, vm=(v["qty"] / avgq) if avgq else None,
                    avgto=(avgq * c / 1e7) if avgq else None, rsi=r_now, rsip=r_prev, **{k: fo.get(s, {}).get(k) for k in ("pcr", "cwall", "pwall", "cmax", "pmax", "bu", "oip", "exp", "fpch")})
    if gaps: NOTES.append("RSI-14 not shown for %d stock(s) whose previous close differs from the stored history by more than 25%% (likely a split / bonus / stale history): %s." % (len(gaps), ", ".join(sorted(gaps)[:12]) + (" ..." if len(gaps) > 12 else "")))
    # ---- sectors
    idx = data["idx"]
    def idxrow(words):
        for k, v in idx.items():
            kl = k.lower()
            if any(w in kl for w in words) and "equal" not in kl and "shariah" not in kl and "tr " not in kl: return k, v
        return None, None
    sectors = []
    for key, lab, words in SECTORS:
        mem = [S[x] for x in cons.get(key, []) if x in S]
        if len(mem) < 3: continue
        iname, iv = idxrow(words)
        to = sum(m["tcr"] for m in mem); ato = sum(m["avgto"] for m in mem if m["avgto"]); mf = sum(m["mf"] for m in mem)
        adv = sum(1 for m in mem if m["pct"] > 0); dec = sum(1 for m in mem if m["pct"] < 0)
        dps = [m["dp"] for m in mem if m["dp"] is not None]
        pct = iv["pct"] if iv and iv["pct"] is not None else (sum(m["pct"] * m["tcr"] for m in mem) / to if to else 0)
        sectors.append(dict(key=key, lab=lab, iname=iname, pct=pct, close=iv["c"] if iv else None, mf=mf, to=to, tor=(to / ato) if ato else None,
                            adv=adv, dec=dec, n=len(mem), dp=sum(dps) / len(dps) if dps else None, mem=mem))
    for x in sectors:
        x["fi"] = x["mf"] / x["to"] * 100 if x["to"] else 0          # flow intensity: net flow as % of the sector's turnover
        x["flow"] = "IN" if x["fi"] >= 5 and x["pct"] > 0 else "OUT" if x["fi"] <= -5 and x["pct"] < 0 else "WEAK" if x["pct"] < 0 or x["fi"] < 0 else "MIXED"
    sectors.sort(key=lambda x: -x["fi"])
    head = [x for x in sectors if x["key"] not in NOT_HEADLINE]
    s_in = [x for x in head if x["flow"] == "IN"][:3]
    s_out = ([x for x in reversed(head) if x["flow"] == "OUT"] + sorted([x for x in head if x["flow"] == "WEAK"], key=lambda x: x["pct"]))[:3]
    for grp, sign in ((s_in, 1), (s_out, -1)):
        for x in grp:
            x["focus"] = sorted([m for m in x["mem"] if (m["mf"] > 0 if sign > 0 else m["mf"] < 0) and (m["pct"] > 0 if sign > 0 else m["pct"] < 0)],
                                key=lambda m: -abs(m["mf"]))[:4]
    # ---- RSI reversal attempts (liquid names: in a sector index or F&O)
    pool = {m["sym"]: m for x in sectors for m in x["mem"]}
    for s in fo:
        if s in S: pool[s] = S[s]
    up = [m for m in pool.values() if m["rsi"] is not None and m["rsip"] is not None and m["rsip"] < 32 and m["rsi"] > m["rsip"] and m["pct"] > 0]
    dn = [m for m in pool.values() if m["rsi"] is not None and m["rsip"] is not None and m["rsip"] > 68 and m["rsi"] < m["rsip"] and m["pct"] < 0]
    up.sort(key=lambda m: -(m["vm"] or 0)); dn.sort(key=lambda m: -(m["vm"] or 0))
    # ---- F&O build-up lists (stocks)
    fos = [S[s] for s in fo if s in S and S[s].get("bu")]
    bu = {k: sorted([m for m in fos if m["bu"] == k], key=lambda m: -abs(m["oip"] or 0))[:6] for k in ("Long build-up", "Short build-up", "Short covering", "Long unwinding")}
    # ---- circuits
    circ = {"up": [], "dn": [], "sme_up": 0, "sme_dn": 0, "ok": data["bh"] is not None, "noband": 0, "unconf": []}
    today_s = d.strftime("%d-%b-%Y").upper()
    for r in data["bh"] or []:
        if r["series"] in ("SM", "ST"):
            circ["sme_up" if r["hl"] == "H" else "sme_dn"] += 1; continue
        if r["series"] not in ("EQ", "BE", "BZ"): continue
        v = sec_all(data, r["sym"], r["series"])
        band = data["band"].get((r["sym"], r["series"])) or "-"
        try: bp = float(band) / 100
        except ValueError: bp = None
        if bp is None:                       # F&O stocks have no fixed band: NSE's file still lists them (dynamic-band events) - not a circuit
            circ["noband"] += 1; continue
        if not v or not v.get("prev"): circ["unconf"].append(r["sym"]); continue
        p0 = v["prev"]; ub = math.floor(p0 * (1 + bp) * 100 + 1e-6) / 100; lb = math.ceil(p0 * (1 - bp) * 100 - 1e-6) / 100
        tick = 0.011
        if r["hl"] == "H" and not (v["h"] >= ub - tick): circ["unconf"].append(r["sym"]); continue
        if r["hl"] == "L" and not (v["l"] <= lb + tick): circ["unconf"].append(r["sym"]); continue
        locked = (v["c"] >= ub - tick) if r["hl"] == "H" else (v["c"] <= lb + tick)
        off = (v["c"] / (ub if r["hl"] == "H" else lb) - 1) * 100
        v = dict(S.get(r["sym"]) or {}, **v)
        if "pct" not in v: v["pct"] = (v["c"] / p0 - 1) * 100
        w = data["w52"].get(r["sym"])
        tag52 = "52-week high" if w and w[0] and v["h"] > w[0] else "52-week low" if w and w[2] and v["l"] < w[2] else ""
        ann = data["ann"].get(r["sym"], [])
        row = dict(sym=r["sym"], name=r["name"], series=r["series"], band=band, c=v.get("c"), pct=v.get("pct"), vm=v.get("vm"), dp=v.get("dp"), tcr=v.get("tcr") or (v.get("tlac") or 0) / 100,
                   tag52=tag52, ann=ann[0] if ann else None, hl=r["hl"], locked=locked, off=off)
        row["rec"], row["why"] = advise(row)
        circ["up" if r["hl"] == "H" else "dn"].append(row)
    for k in ("up", "dn"): circ[k].sort(key=lambda r: (not r["locked"], -r["tcr"]))
    if circ["noband"]: NOTES.append("NSE's band-hitter file also listed %d F&O stock(s); F&O stocks have no fixed price band (dynamic bands), so they are not counted as circuits here." % circ["noband"])
    if circ["unconf"]: NOTES.append("Listed as band hitters but the day's high / low did not confirm the band (left out): %s." % ", ".join(circ["unconf"][:15]))
    # ---- 52-week highs / lows on heavy volume
    today_s = d.strftime("%d-%b-%Y")
    # the 52-week file is published for the start of the session (highs / lows up to the previous day): a new extreme = today's high / low beyond it
    hi52a = [S[s] for s, w in data["w52"].items() if s in S and w[0] and S[s]["h"] > w[0]]; lo52a = [S[s] for s, w in data["w52"].items() if s in S and w[2] and S[s]["l"] < w[2]]
    hi52 = sorted([m for m in hi52a if (m["vm"] or 0) >= 1.5], key=lambda m: -(m["tcr"]))[:8]
    lo52 = sorted([m for m in lo52a if (m["vm"] or 0) >= 1.5], key=lambda m: -(m["tcr"]))[:8]
    # ---- market snapshot
    eq = [m for m in S.values() if m["series"] == "EQ"]
    snap = dict(adv=sum(1 for m in eq if m["pct"] > 0), dec=sum(1 for m in eq if m["pct"] < 0), unch=sum(1 for m in eq if m["pct"] == 0))
    def iget(*names):
        for n in names:
            for k, v in idx.items():
                if k.lower() == n.lower(): return v
        return None
    snap["idx"] = [(n, iget(n)) for n in ("Nifty 50", "Nifty Bank", "Nifty Midcap 100", "Nifty Smallcap 100", "India VIX") if iget(n)]
    try:
        ds = json.load(open(os.path.join(ROOT, "data", "dash_snapshot.json")))
        bs = next((r for r in ds["rows"] if r["s"] == "^BSESN"), None)
        if bs and dt.datetime.fromtimestamp(bs["t"], IST).date() == d:
            snap["sensex"] = dict(c=bs["p"], pct=(bs["p"] / bs["pc"] - 1) * 100)
        else:
            NOTES.append("Sensex close for this date not in the stored BSE snapshot; not shown.")
    except Exception:
        NOTES.append("Sensex close not available; not shown.")
    try:
        fd = json.load(open(os.path.join(ROOT, "data", "fiidii.json")))["daily"].get(d.isoformat())
        snap["fiidii"] = fd
        if not fd: NOTES.append("FII / DII provisional cash figures for this date not yet in the data file; not shown.")
    except Exception:
        snap["fiidii"] = None
    nifty_fo = {k: fo.get(k) for k in ("NIFTY", "BANKNIFTY") if fo.get(k) and fo[k].get("pcr") is not None}
    # still stretched (no turn yet) and the biggest single-stock outflows
    os_ = sorted([m for m in pool.values() if m["rsi"] is not None and m["rsi"] < 30 and m not in up], key=lambda m: m["rsi"])[:6]
    ob_ = sorted([m for m in pool.values() if m["rsi"] is not None and m["rsi"] > 75 and m not in dn], key=lambda m: -m["rsi"])[:6]
    outs = sorted([m for m in pool.values() if m["mf"] < 0 and m["pct"] < 0], key=lambda m: m["mf"])[:8]
    ins = sorted([m for m in pool.values() if m["mf"] > 0 and m["pct"] > 0], key=lambda m: -m["mf"])[:8]
    return dict(date=d, S=S, sectors=sectors, s_in=s_in, s_out=s_out, up=up[:8], dn=dn[:8], bu=bu, circ=circ, hi52=hi52, lo52=lo52, snap=snap,
                os=os_, ob=ob_, outs=outs, ins=ins, n52=(len(hi52a), len(lo52a)),
                idxfo=nifty_fo, poi=poi, nfo=len([s for s in fo if fo[s].get("pcr") is not None]))


def sec_all(data, sym, series):
    v = data["sec"].get(sym)
    return dict(v) if v else None


def advise(r):
    """hedged recommendation + reason for a circuit row, from exchange facts only (Circuit Watch rules)"""
    bits = []
    if r["band"] not in ("-", "No Band", ""):
        bits.append("%s%% band" % r["band"])
        try:
            if r.get("pct") is not None and abs(r["pct"]) > float(r["band"]) + 0.6: bits.append("move larger than the band - base price adjusted by the exchange (corporate action), check before acting")
        except ValueError: pass
    if r["vm"]: bits.append("volume %.1fx 20-day avg" % r["vm"])
    else: bits.append("average volume not available")
    if r["dp"] is not None: bits.append("delivery %.0f%%" % r["dp"])
    bits.insert(0, "locked at the band at close" if r.get("locked") else "touched the band, closed %s from it" % pc(r.get("off"), 1))
    if r["tag52"]: bits.append("fresh %s" % r["tag52"])
    if r["series"] == "BE": bits.append("trade-for-trade (BE) segment")
    if r["ann"]: bits.append("exchange filing today: %s" % r["ann"][0])
    else: bits.append("no exchange filing today - catalyst unverified")
    if r["hl"] == "H":
        if not r.get("locked"): rec = "Avoid chasing; supply at the band"
        elif r["vm"] and r["vm"] >= 3 and (r["dp"] or 0) >= 50: rec = "Avoid chasing; watch for follow-through"
        elif r["series"] == "BE": rec = "Avoid chasing (thin, T2T)"
        else: rec = "Avoid chasing"
    else:
        rec = ("Wait for stabilization" if r.get("locked") else "Wait for stabilization; buyers at the band") if not r["ann"] else "Wait for stabilization; read the filing"
    return rec, "; ".join(bits) + "."


# ------------------------------------------------------------------ booklet (light, SSJ Finance colours)
W, H = 1080, 1800
C = dict(bg="#FBF9EF", card="#FFFFFF", band="#676300", band2="#7B8218", soft="#F1EED6", line="#DDD7AE", acc="#A7A15D", tx="#33321F", mu="#6B696B",
         up="#1C820D", dn="#D00000", upbg="#E9F4E5", dnbg="#FCE8E6", mixbg="#F4F1DE")


def fx(v, d=2):
    if v is None or (isinstance(v, float) and math.isnan(v)): return "-"
    return "{:,.{}f}".format(v, d)


def pc(v, d=2):
    return "-" if v is None else ("+" if v > 0 else "") + "{:.{}f}%".format(v, d)


def cls(v): return "" if v is None else "up" if v > 0 else "dn" if v < 0 else ""


def css():
    return brand.font_css() + brand.name_css("brand", "50px") + """
*{box-sizing:border-box;margin:0;padding:0}
body{width:%(W)dpx;height:%(H)dpx;overflow:hidden;background:%(bg)s;color:%(tx)s;font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-variant-numeric:tabular-nums}
.pg{height:100%%;display:flex;flex-direction:column}
.hd{background:linear-gradient(180deg,%(band)s,#5a5600);display:flex;align-items:center;gap:18px;padding:18px 40px;border-bottom:6px solid %(acc)s}
.hd img{width:74px;height:74px;border-radius:12px}.hd .t{flex:1}.hd .sub{color:#F1EED6;font:700 22px Inter;letter-spacing:.06em;text-transform:uppercase;margin-top:4px}
.hd .n{color:#F1EED6;font:800 22px Inter;background:rgba(0,0,0,.18);border:1px solid rgba(241,238,214,.5);border-radius:999px;padding:6px 16px}
.bd{flex:1;padding:26px 40px 10px;overflow:hidden;display:flex;flex-direction:column;gap:18px}
.ft{padding:12px 40px 18px;color:%(mu)s;font:600 17px Inter;display:flex;justify-content:space-between;border-top:2px solid %(line)s;background:%(soft)s}
h2{font:900 40px Inter;color:%(band)s;letter-spacing:-.01em}h2 small{display:block;font:600 22px Inter;color:%(mu)s;letter-spacing:0;margin-top:6px}
h3{font:800 26px Inter;color:%(band)s;display:flex;align-items:center;gap:12px;text-transform:uppercase;letter-spacing:.05em}
h3::before{content:"";width:10px;height:28px;border-radius:3px;background:%(acc)s}
.card{background:%(card)s;border:2px solid %(line)s;border-radius:18px;padding:18px 22px;box-shadow:0 4px 14px rgba(103,99,0,.07)}
table{width:100%%;border-collapse:separate;border-spacing:0;font-size:23px}
th{background:%(band)s;color:#fff;font:800 17px Inter;text-transform:uppercase;letter-spacing:.04em;padding:9px 10px;text-align:left}
th:first-child{border-top-left-radius:10px}th:last-child{border-top-right-radius:10px}
td{padding:9px 10px;border-bottom:1px solid %(line)s;vertical-align:top}tr:nth-child(even) td{background:#FCFBF4}
td.r,th.r{text-align:right}td b{font-weight:800}.up{color:%(up)s}.dn{color:%(dn)s}.mu{color:%(mu)s}
.tag{display:inline-block;padding:3px 12px;border-radius:999px;font:800 17px Inter;white-space:nowrap}
.tag.IN{background:%(upbg)s;color:%(up)s;border:1px solid #b9dcae}.tag.OUT{background:%(dnbg)s;color:%(dn)s;border:1px solid #f1b9b3}.tag.MIXED{background:%(mixbg)s;color:#6d6a2c;border:1px solid %(line)s}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.tile{background:%(card)s;border:2px solid %(line)s;border-radius:16px;padding:14px 16px}
.tile small{display:block;font:800 16px Inter;color:%(mu)s;text-transform:uppercase;letter-spacing:.05em}.tile b{display:block;font:900 32px Inter;margin-top:4px}.tile em{font:700 19px Inter;font-style:normal}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.bar{position:relative;height:24px;background:%(soft)s;border-radius:6px;overflow:hidden}.bar i{position:absolute;top:0;bottom:0}
.note{font:600 19px Inter;color:%(mu)s;line-height:1.4}
.sx{font:600 18px Inter;color:%(mu)s}
ul.v{padding-left:28px;font:500 21px Inter;line-height:1.45}ul.v li{margin-bottom:6px}
.disc{font:500 17.5px Inter;line-height:1.45;color:#4A4A4A;text-align:justify}
.tag.WEAK{background:#FBEFE3;color:#9a4a0e;border:1px solid #efcfae}.tag.LOCK{background:#33321F;color:#F1EED6}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{padding:7px 12px;border-radius:10px;font:800 18px Inter;border:1px solid %(line)s}
td.nw{white-space:nowrap}
""" % dict(W=W, H=H, **C)


def shell(inner, n, total, title, cover=False):
    head = ('<div class="hd"><img src="%s"><div class="t"><div class="brand">%s</div><div class="sub">%s</div></div><div class="n">%d / %d</div></div>'
            % (brand.logo_original(), e(brand.BRAND), title, n, total))
    return ('<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
            '<style>%s</style></head><body><div class="pg">%s<div class="bd" id="bd">%s</div><div class="ft"><span>Sector Digest &middot; %s</span><span>%s</span></div></div>'
            '<script>(function(){var b=document.getElementById("bd"),z=1;while(b.scrollHeight>b.clientHeight+1&&z>0.62){z-=0.02;b.style.zoom=z;}})();</script></body></html>'
            % (css(), head, inner, e(DATE_TXT[0]), e(brand.SHORT_DISCLAIMER)))


DATE_TXT = [""]


def rsi_txt(m):
    if m.get("rsi") is None: return '<span class="mu">-</span>'
    a = "&#9650;" if m["rsip"] is not None and m["rsi"] > m["rsip"] else "&#9660;" if m["rsip"] is not None and m["rsi"] < m["rsip"] else ""
    c = "dn" if m["rsi"] >= 70 else "up" if m["rsi"] <= 30 else ""
    return '<b class="%s">%.0f</b> <span class="%s">%s</span>' % (c, m["rsi"], "up" if "9650" in a else "dn", a)


def oi_txt(m):
    if m.get("pcr") is None: return '<span class="mu">not in F&amp;O</span>'
    return 'PCR <b>%.2f</b><br><span class="sx">Put %s &middot; Call %s</span>' % (m["pcr"], fx(m.get("pwall"), 0), fx(m.get("cwall"), 0))


def p_cover(R, total):
    sn = R["snap"]
    tiles = "".join('<div class="tile"><small>%s</small><b>%s</b><em class="%s">%s</em></div>' % (e(n), fx(v["c"]), cls(v["pct"]), pc(v["pct"])) for n, v in sn["idx"])
    if sn.get("sensex"): tiles = '<div class="tile"><small>Sensex</small><b>%s</b><em class="%s">%s</em></div>' % (fx(sn["sensex"]["c"]), cls(sn["sensex"]["pct"]), pc(sn["sensex"]["pct"])) + tiles
    br = sn["adv"] / max(1, sn["adv"] + sn["dec"]) * 100
    fd = sn.get("fiidii")
    fii = ('<div class="two"><div class="tile"><small>FII cash (provisional)</small><b class="%s">%s cr</b></div><div class="tile"><small>DII cash (provisional)</small><b class="%s">%s cr</b></div></div>'
           % (cls(fd["fii_net"]), fx(fd["fii_net"], 0), cls(fd["dii_net"]), fx(fd["dii_net"], 0))) if fd else ""
    li = lambda L: "".join('<li><b>%s</b> <span class="%s">%s</span> <span class="tag %s">%s</span><div class="sx">net flow Rs %s cr (%s of turnover)</div></li>' % (e(x["lab"]), cls(x["pct"]), pc(x["pct"]), x["flow"], x["flow"], fx(x["mf"], 0), pc(x["fi"], 0)) for x in L) or "<li>None clear today</li>"
    inner = ("<h2>SECTOR DIGEST<small>Where money flowed in and out &middot; stocks that show it &middot; F&amp;O positioning &middot; RSI reversals &middot; Circuit watch</small></h2>"
             "<div class='card' style='background:%s'><b style='font:900 30px Inter;color:%s'>%s</b><div class='note' style='margin-top:4px'>NSE session close &middot; built from the exchange's end-of-day files</div></div>"
             "<h3>Session snapshot</h3><div class='tiles'>%s</div>"
             "<div class='card'><div style='display:flex;justify-content:space-between;font:800 22px Inter'><span class='up'>Advances %d</span><span class='mu'>Unchanged %d</span><span class='dn'>Declines %d</span></div>"
             "<div class='bar' style='margin-top:10px'><i style='left:0;width:%.1f%%;background:%s'></i><i style='left:%.1f%%;right:0;background:%s'></i></div></div>%s"
             "<div class='two'><div class='card'><h3 style='color:%s'>Money flowing in</h3><ul class='v'>%s</ul></div><div class='card'><h3 style='color:%s'>Money exiting</h3><ul class='v'>%s</ul></div></div>"
             "<h3>At a glance</h3><div class='tiles'>%s</div><h3>Sectors today</h3><div class='chips'>%s</div>"
             % (C["soft"], C["band"], e(DATE_TXT[0]), tiles, sn["adv"], sn["unch"], sn["dec"], br, "#7fbf6a", br, "#ef8f86", fii, C["up"], li(R["s_in"]), C["dn"], li(R["s_out"]),
                glance(R), chips(R)))
    return shell(inner, 1, total, "Sector Digest &middot; Session close")


def glance(R):
    t = []
    for k, lab in (("NIFTY", "Nifty"), ("BANKNIFTY", "Bank Nifty")):
        v = R["idxfo"].get(k)
        if v: t.append((lab + " PCR &middot; OI range", "%.2f" % v["pcr"], "%s &ndash; %s" % (fx(v["pwall"], 0), fx(v["cwall"], 0)), ""))
    a = (R["poi"].get("now") or {}).get("FII") or {}
    if a.get("Future Index Long") and a.get("Future Index Short"):
        lp = a["Future Index Long"] / (a["Future Index Long"] + a["Future Index Short"]) * 100
        t.append(("FII index futures long", "%.0f%%" % lp, "of their long + short", "up" if lp >= 50 else "dn"))
    c = R["circ"]
    t.append(("Circuits (main board)", '<span class="up">%d</span> / <span class="dn">%d</span>' % (len(c["up"]), len(c["dn"])), "upper / lower", ""))
    t.append(("New 52-week highs / lows", '<span class="up">%d</span> / <span class="dn">%d</span>' % R["n52"], "exchange 52-week file", ""))
    t.append(("RSI turn attempts", '<span class="up">%d</span> / <span class="dn">%d</span>' % (len(R["up"]), len(R["dn"])), "up from oversold / down from overbought", ""))
    return "".join('<div class="tile"><small>%s</small><b class="%s">%s</b><em class="mu">%s</em></div>' % (a_, c_, b_, d_) for a_, b_, d_, c_ in t)


def chips(R):
    def col(p):
        if p is None: return "#fff", C["mu"]
        k = max(-1, min(1, p / 2.5))
        return ("rgba(28,130,13,%.2f)" % (0.12 + 0.5 * k), "#0f4f06") if k > 0 else ("rgba(208,0,0,%.2f)" % (0.10 + 0.45 * -k), "#7a0000") if k < 0 else ("#F4F1DE", C["mu"])
    return "".join('<span class="chip" style="background:%s;color:%s">%s %s</span>' % (col(x["pct"])[0], col(x["pct"])[1], e(x["lab"]), pc(x["pct"])) for x in sorted(R["sectors"], key=lambda x: -x["pct"]))


def p_sectors(R, total):
    mx = max([abs(x["fi"]) for x in R["sectors"]] + [1])
    rows = "".join('<tr><td><b>%s</b></td><td class="r nw %s"><b>%s</b></td><td><div class="bar"><i style="%s:50%%;width:%.1f%%;background:%s"></i><i style="left:50%%;width:2px;background:%s"></i></div>'
                   '<div class="sx" style="display:flex;justify-content:space-between"><b class="%s">%s</b><span>Rs %s cr</span></div></td><td class="r nw">%s</td><td class="r nw">%d / %d</td><td class="r nw">%s</td><td><span class="tag %s">%s</span></td></tr>'
                   % (e(x["lab"]), cls(x["pct"]), pc(x["pct"]), "left" if x["fi"] >= 0 else "right", abs(x["fi"]) / mx * 50, "#7fbf6a" if x["fi"] >= 0 else "#ef8f86", C["mu"],
                      cls(x["fi"]), pc(x["fi"], 0) + " of turnover", fx(x["mf"], 0), ("%.1fx" % x["tor"]) if x["tor"] else "-", x["adv"], x["dec"], ("%.0f%%" % x["dp"]) if x["dp"] is not None else "-", x["flow"], x["flow"])
                   for x in R["sectors"])
    inner = ("<h2>Sector money flow<small>Net flow = turnover &times; where each stock closed in its day's range (close near the high = buying, near the low = selling), summed over the sector's index members</small></h2>"
             "<div class='card' style='padding:10px 12px'><table><tr><th>Sector</th><th class='r'>Index</th><th style='width:330px'>Net flow (share of turnover)</th><th class='r'>Turnover vs avg</th><th class='r'>Adv / Dec</th><th class='r'>Delivery</th><th>Flow</th></tr>%s</table></div>"
             "<div class='note'><b>IN</b> = net buying of 5%% or more of turnover and the index rose &middot; <b>OUT</b> = net selling of 5%% or more and the index fell &middot; <b>WEAK</b> = index fell or selling outweighed buying, but below the OUT mark &middot; <b>MIXED</b> = rose on thin buying. Sorted by flow share; Rs cr = absolute net flow. Turnover vs avg = today against the 20-day average.</div>" % rows)
    return shell(inner, 2, total, "Sector money flow")


def focus_table(L):
    return ("<table><tr><th>Stock</th><th class='r'>Close</th><th class='r'>Vol &times;</th><th class='r'>Deliv</th><th class='r'>RSI 14</th><th>Options (PCR &middot; OI range)</th><th>F&amp;O build-up</th></tr>%s</table>"
            % "".join('<tr><td><b>%s</b><br><span class="sx">flow Rs %s cr</span></td><td class="r">%s<br><b class="%s">%s</b></td><td class="r">%s</td><td class="r">%s</td><td class="r">%s</td><td>%s</td><td>%s</td></tr>'
                      % (e(m["sym"]), fx(m["mf"], 0), fx(m["c"]), cls(m["pct"]), pc(m["pct"]), ("%.1fx" % m["vm"]) if m.get("vm") else "-", ("%.0f%%" % m["dp"]) if m.get("dp") is not None else "-",
                         rsi_txt(m), oi_txt(m), bu_tag(m)) for m in L))


def bu_tag(m):
    b = m.get("bu")
    if not b: return '<span class="mu">-</span>'
    good = b in ("Long build-up", "Short covering")
    return '<span class="tag %s">%s</span><div class="sx">OI %s</div>' % ("IN" if good else "OUT", e(b), pc(m.get("oip"), 1))


def p_focus(R, total, n, which):
    L = R["s_in"] if which == "in" else R["s_out"]
    title = "Where money is flowing IN" if which == "in" else "Where money is EXITING"
    if not L:
        body = "<div class='card note'>No core sector showed %s today (flow and price did not agree). See the sector table on page 2.</div>" % ("clear net buying with a rising index" if which == "in" else "clear net selling with a falling index")
    else:
        body = "".join("<div class='card'><h3>%s <span class='tag %s'>%s &middot; Rs %s cr</span></h3><div class='sx' style='margin:6px 0 8px'>Index %s &middot; turnover %s of average &middot; %d up / %d down</div>%s</div>"
                       % (e(x["lab"]), x["flow"], pc(x["pct"]), fx(x["mf"], 0), fx(x["close"]), ("%.1fx" % x["tor"]) if x["tor"] else "-", x["adv"], x["dec"],
                          focus_table(x.get("focus") or []) if x.get("focus") else "<div class='note'>No single stock led the move.</div>") for x in L)
    if which == "out":
        body += "<div class='card'><h3 style='color:%s'>Biggest single-stock outflows (all sectors)</h3><div class='sx' style='margin:4px 0 8px'>Liquid names that fell with the heaviest net selling</div>%s</div>" % (C["dn"], focus_table(R["outs"][:6]))
    inner = ("<h2>%s<small>Stocks in focus that justify the flow &middot; Vol &times; = today's volume against the 20-day average &middot; Deliv = delivery %% &middot; RSI 14 with today's direction</small></h2>%s"
             "<div class='note'>Options: PCR = put OI &divide; call OI (nearest expiry); OI range = highest put-OI strike below the price (support) and highest call-OI strike above it (resistance).</div>" % (title, body))
    return shell(inner, n, total, title.split(" ", 2)[-1] if False else ("Money in" if which == "in" else "Money out"))


def p_fno(R, total, n):
    cards = ""
    for k, v in R["idxfo"].items():
        lab = {"NIFTY": "Nifty 50", "BANKNIFTY": "Bank Nifty"}[k]
        ex = dt.date.fromisoformat(v["exp"]).strftime("%d %b")
        tops = lambda L: " &middot; ".join("%s (%s lakh)" % (fx(s, 0), fx(o / 1e5, 1)) for s, o, _ in L)
        cards += ("<div class='card'><h3>%s &middot; expiry %s</h3><div class='tiles' style='margin-top:10px'><div class='tile'><small>PCR (OI)</small><b>%.2f</b><em class='mu'>%s</em></div>"
                  "<div class='tile'><small>Highest put OI (support)</small><b class='up'>%s</b></div><div class='tile'><small>Highest call OI (resistance)</small><b class='dn'>%s</b></div></div>"
                  "<div class='sx' style='margin-top:8px'>Call OI strikes: %s<br>Put OI strikes: %s%s</div></div>"
                  % (lab, ex, v["pcr"], "puts heavier &rarr; support below" if v["pcr"] >= 1.1 else "calls heavier &rarr; overhead supply" if v["pcr"] <= 0.8 else "balanced",
                     fx(v["pwall"], 0), fx(v["cwall"], 0), tops(v["ctop"]), tops(v["ptop"]),
                     ("<br>Fresh writing today: calls at %s, puts at %s" % (fx(v["cadd"], 0), fx(v["padd"], 0))) if v.get("cadd") or v.get("padd") else ""))
    poi = R["poi"]
    pt = ""
    if poi.get("now"):
        def row(who):
            a = poi["now"].get(who) or {}; b = (poi.get("prev") or {}).get(who) or {}
            L, S_ = a.get("Future Index Long"), a.get("Future Index Short")
            if not L or not S_: return ""
            lp = L / (L + S_) * 100; dl = (L - (b.get("Future Index Long") or L)); ds = (S_ - (b.get("Future Index Short") or S_))
            return '<tr><td><b>%s</b></td><td class="r">%s</td><td class="r">%s</td><td class="r"><b class="%s">%.0f%%</b></td><td class="r"><span class="%s">%s</span> / <span class="%s">%s</span></td></tr>' % (
                who, fx(L, 0), fx(S_, 0), "up" if lp >= 50 else "dn", lp, cls(dl), ("+" if dl > 0 else "") + fx(dl, 0), cls(-ds), ("+" if ds > 0 else "") + fx(ds, 0))
        pt = ("<div class='card'><h3>Who holds index futures</h3><table style='margin-top:8px'><tr><th>Participant</th><th class='r'>Long</th><th class='r'>Short</th><th class='r'>Long %%</th><th class='r'>Change L / S</th></tr>%s</table>"
              "<div class='sx' style='margin-top:6px'>Contracts, from the exchange's participant-wise open interest.</div></div>" % "".join(row(w) for w in ("FII", "DII", "Pro", "Client")))
    bu = R["bu"]
    blk = lambda k, good: ("<div class='card'><h3 style='color:%s'>%s</h3><table style='margin-top:6px'><tr><th>Stock</th><th class='r'>Fut price</th><th class='r'>Fut OI</th><th>PCR &middot; range</th></tr>%s</table></div>"
                           % (C["up"] if good else C["dn"], k, "".join('<tr><td><b>%s</b></td><td class="r %s">%s</td><td class="r">%s</td><td class="sx">%s</td></tr>'
                                                                       % (e(m["sym"]), cls(m.get("fpch")), pc(m.get("fpch")), pc(m["oip"], 1), ("%.2f &middot; %s&ndash;%s" % (m["pcr"], fx(m["pwall"], 0), fx(m["cwall"], 0))) if m.get("pcr") is not None else "-")
                                                                       for m in bu[k]) or "<tr><td colspan='4' class='mu'>None today</td></tr>"))
    inner = ("<h2>F&amp;O positioning<small>Open interest from the exchange's F&amp;O bhavcopy &middot; %d stocks with options read today</small></h2>%s%s"
             "<div class='two'>%s%s</div><div class='two'>%s%s</div>"
             "<div class='note'>Build-up = price change with futures OI change: price up + OI up = long build-up; price down + OI up = short build-up; price up + OI down = short covering; price down + OI down = long unwinding.</div>"
             % (R["nfo"], cards, pt, blk("Long build-up", True), blk("Short covering", True), blk("Short build-up", False), blk("Long unwinding", False)))
    return shell(inner, n, total, "F&amp;O positioning")


def p_rsi(R, total, n):
    t = lambda L, up: ("<table><tr><th>Stock</th><th class='r'>Close</th><th class='r'>RSI 14 (prev &rarr; now)</th><th class='r'>Vol &times;</th><th class='r'>Deliv</th><th>Options</th></tr>%s</table>"
                       % ("".join('<tr><td><b>%s</b></td><td class="r">%s<br><b class="%s">%s</b></td><td class="r">%.0f &rarr; <b class="%s">%.0f</b></td><td class="r">%s</td><td class="r">%s</td><td>%s</td></tr>'
                                  % (e(m["sym"]), fx(m["c"]), cls(m["pct"]), pc(m["pct"]), m["rsip"], "up" if up else "dn", m["rsi"], ("%.1fx" % m["vm"]) if m.get("vm") else "-",
                                     ("%.0f%%" % m["dp"]) if m.get("dp") is not None else "-", oi_txt(m)) for m in L) or "<tr><td colspan='6' class='mu'>No stock qualified today</td></tr>"))
    inner = ("<h2>RSI-14 reversal watch<small>Attempts to turn &middot; sector-index members and F&amp;O stocks only (liquid names)</small></h2>"
             "<div class='card'><h3 style='color:%s'>Oversold, trying to turn up</h3><div class='sx' style='margin:4px 0 8px'>RSI was below 32 yesterday, rose today, and the stock closed higher</div>%s</div>"
             "<div class='card'><h3 style='color:%s'>Overbought, trying to turn down</h3><div class='sx' style='margin:4px 0 8px'>RSI was above 68 yesterday, fell today, and the stock closed lower</div>%s</div>"
             "<div class='two'><div class='card'><h3 style='color:%s'>Still oversold (RSI &lt; 30)</h3><div class='sx'>No turn yet &middot; watch for the first up-close</div>%s</div>"
             "<div class='card'><h3 style='color:%s'>Still overbought (RSI &gt; 75)</h3><div class='sx'>Stretched &middot; trail stops, avoid fresh chasing</div>%s</div></div>"
             "<div class='note'>An attempt is not a confirmed reversal: watch for a second day in the same direction, ideally on volume above average and with the option range (put / call OI walls) agreeing.</div>"
             % (C["up"], t(R["up"], True), C["dn"], t(R["dn"], False), C["up"], mini(R["os"]), C["dn"], mini(R["ob"])))
    return shell(inner, n, total, "RSI reversal watch")


def mini(L):
    return ("<table style='margin-top:6px'><tr><th>Stock</th><th class='r'>RSI</th><th class='r'>Close</th><th>Range</th></tr>%s</table>"
            % ("".join('<tr><td><b>%s</b></td><td class="r"><b>%.0f</b></td><td class="r nw %s">%s</td><td class="sx">%s</td></tr>'
                       % (e(m["sym"]), m["rsi"], cls(m["pct"]), pc(m["pct"]), ("%s&ndash;%s" % (fx(m["pwall"], 0), fx(m["cwall"], 0))) if m.get("pcr") is not None else "-") for m in L)
               or "<tr><td colspan='4' class='mu'>None</td></tr>"))


def p_circuit(R, total, n):
    c = R["circ"]
    def t(L, up):
        if not c["ok"]: return "<div class='note'>Exchange band-hitter file not available - not estimated.</div>"
        if not L: return "<div class='note'>No confirmed %s-circuit hits on the main board today.</div>" % ("upper" if up else "lower")
        rows = "".join('<tr><td><b>%s</b><br>%s%s</td><td class="r nw">%s<br><b class="%s">%s</b></td><td><b>%s</b></td><td class="sx" style="font-size:17px">%s</td></tr>'
                       % (e(r["sym"]), '<span class="tag LOCK" style="font-size:13px">LOCKED</span> ' if r["locked"] else '<span class="tag MIXED" style="font-size:13px">OFF BAND</span> ',
                          '<span class="tag WEAK" style="font-size:13px">%s</span>' % e(r["series"]) if r["series"] != "EQ" else "", fx(r["c"]), cls(r["pct"]), pc(r["pct"]), e(r["rec"]), e(r["why"])) for r in L[:8])
        more = len(L) - 8
        return ("<table><tr><th>Stock</th><th class='r'>Move</th><th>Recommendation</th><th>Reason</th></tr>%s</table>%s"
                % (rows, "<div class='sx' style='margin-top:6px'>+ %d more (locked first, then by turnover) - full list on the next page</div>" % more if more > 0 else ""))
    inner = ("<h2>Circuit watch<small>Fixed-band stocks that hit their price band (exchange list, confirmed by the day's high / low) &middot; main board %d upper / %d lower &middot; SME %d upper / %d lower &middot; locked names first</small></h2>"
             "<div class='card'><h3 style='color:%s'>Upper circuit</h3>%s</div><div class='card'><h3 style='color:%s'>Lower circuit</h3>%s</div>"
             "<div class='note'>Circuit-locked stocks carry execution risk (no sellers / buyers at the band); the move alone is not a reason to enter.</div>"
             % (len(c["up"]), len(c["dn"]), c["sme_up"], c["sme_dn"], C["up"], t(c["up"], True), C["dn"], t(c["dn"], False)))
    return shell(inner, n, total, "Circuit watch")


def p_circuit_all(R, total, n):
    c = R["circ"]
    lst = lambda L: ", ".join("<b>%s</b> %s%s" % (e(r["sym"]), pc(r["pct"], 1), "" if r["locked"] else "*") for r in L) or "none"
    w = lambda L, hi: ("<table><tr><th>Stock</th><th class='r'>Close</th><th class='r'>Vol &times;</th><th class='r'>Deliv</th><th class='r'>RSI 14</th><th>Options</th></tr>%s</table>"
                       % ("".join('<tr><td><b>%s</b></td><td class="r">%s<br><b class="%s">%s</b></td><td class="r">%.1fx</td><td class="r">%s</td><td class="r">%s</td><td>%s</td></tr>'
                                  % (e(m["sym"]), fx(m["c"]), cls(m["pct"]), pc(m["pct"]), m["vm"], ("%.0f%%" % m["dp"]) if m.get("dp") is not None else "-", rsi_txt(m), oi_txt(m)) for m in L)
                          or "<tr><td colspan='6' class='mu'>None on heavy volume today</td></tr>"))
    inner = ("<h2>52-week extremes &amp; full circuit list<small>Fresh 52-week highs / lows on at least 1.5&times; average volume &middot; %d highs / %d lows in all today (exchange 52-week file)</small></h2>"
             "<div class='card'><h3 style='color:%s'>New 52-week highs</h3>%s</div><div class='card'><h3 style='color:%s'>New 52-week lows</h3>%s</div>"
             "<div class='card'><h3>All main-board band hitters</h3><div class='note' style='margin-top:6px'><b class='up'>Upper (%d):</b> %s</div><div class='note' style='margin-top:8px'><b class='dn'>Lower (%d):</b> %s</div><div class='sx' style='margin-top:8px'>* touched the band but closed off it</div></div>"
             % (R["n52"][0], R["n52"][1], C["up"], w(R["hi52"], True), C["dn"], w(R["lo52"], False), len(c["up"]), lst(c["up"]), len(c["dn"]), lst(c["dn"])))
    return shell(inner, n, total, "52-week &amp; circuits")


DISCLAIMER = ("This report is prepared by Joshi's Corner for general informational and educational purposes only and does not constitute investment advice, a recommendation, or a solicitation "
              "to buy or sell any security. It does not take into account the investment objectives, financial situation, or particular needs of any specific person. Prices, volumes, circuit-limit status, "
              "and other data points are drawn from third-party and publicly available sources believed to be reliable at the time of preparation; they may be delayed, incomplete, or subject to revision, "
              "and no representation or warranty is made as to their accuracy or completeness. Where a data point could not be verified, this report says so explicitly rather than estimating it. Equity "
              "markets are subject to risk, including the possible loss of principal; past performance and single-session price or volume moves are not indicative of future results. Stocks that are locked "
              "at their circuit limit carry additional execution risk (illiquidity, inability to exit) and should not be chased on the basis of the circuit move alone. Readers should independently verify all "
              "data and consult a SEBI-registered investment adviser before making any investment decision. Joshi's Corner and its author accept no liability for any loss arising from the use of this report.")


def p_notes(R, total, n):
    base = ["All prices, volumes, delivery %%, index levels, band hits, 52-week marks, open interest and participant positions are the exchange's own end-of-day files for %s (nsearchives.nseindia.com)." % DATE_TXT[0],
            "Net money flow is a calculation, not a reported figure: turnover &times; ((close &minus; low) &minus; (high &minus; close)) &divide; (high &minus; low), summed over each sector index's members (constituent lists from niftyindices.com).",
            "Volume multiple and RSI-14 (Wilder) use the stored NSE daily history (%d sessions available); averages need at least 10 sessions or are shown as '-'." % R.get("nh", 0),
            "PCR and OI walls use the nearest expiry with open interest; the OI range is the highest put-OI strike at / below the underlying and the highest call-OI strike at / above it.",
            "Circuit reasons quote only exchange facts; a catalyst is named only when the stock filed an announcement with the exchange today, otherwise the row says the catalyst is unverified.",
            "Recommendations use hedged language only (avoid chasing / watch for follow-through / wait for stabilization) - no outright buy or sell."]
    inner = ("<h2>Data verification notes</h2><div class='card'><ul class='v'>%s</ul></div><h3>Disclaimer</h3><div class='card disc'>%s</div>"
             % ("".join("<li>%s</li>" % x for x in base + [e(x) for x in NOTES]), e(DISCLAIMER)))
    return shell(inner, n, total, "Notes &amp; disclaimer")


def render(R, out_dir):
    from playwright.sync_api import sync_playwright
    DATE_TXT[0] = R["date"].strftime("%A, %d %B %Y")
    makers = [lambda t: p_cover(R, t), lambda t: p_sectors(R, t), lambda t: p_focus(R, t, 3, "in"), lambda t: p_focus(R, t, 4, "out"),
              lambda t: p_fno(R, t, 5), lambda t: p_rsi(R, t, 6), lambda t: p_circuit(R, t, 7), lambda t: p_circuit_all(R, t, 8), lambda t: p_notes(R, t, 9)]
    total = len(makers); docs = [f(total) for f in makers]
    os.makedirs(out_dir, exist_ok=True)
    ds = R["date"].isoformat(); outs = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(); pg = br.new_page(viewport={"width": W, "height": H})
        for i, doc in enumerate(docs, 1):
            pg.set_content(doc, wait_until="load")
            try: pg.wait_for_load_state("networkidle", timeout=6000)
            except Exception: pass
            f = os.path.join(out_dir, "Sector_Digest_Mobile_%s_%d.png" % (ds, i)); pg.screenshot(path=f); outs.append(f)
        br.close()
    from PIL import Image
    ims = [Image.open(f).convert("RGB") for f in outs]
    pdf = os.path.join(out_dir, "Sector_Digest_%s.pdf" % ds)
    ims[0].save(pdf, save_all=True, append_images=ims[1:], resolution=150)
    return outs, pdf


# ------------------------------------------------------------------ main
def holidays():
    t = open(os.path.join(HERE, "auto_reports.py"), encoding="utf-8").read()
    m = re.search(r"NSE_HOLIDAYS = (\{[\s\S]*?\n\})", t)
    import ast
    return ast.literal_eval(m.group(1)) if m else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date"); ap.add_argument("--dry", action="store_true"); ap.add_argument("--out", default="/tmp/sd")
    ap.add_argument("--raw"); ap.add_argument("--force", action="store_true"); ap.add_argument("--check", action="store_true", help="only say whether a build is due (exit 0 = build)")
    a = ap.parse_args()
    now = dt.datetime.now(IST)
    d = dt.date.fromisoformat(a.date) if a.date else now.date()
    idxp = os.path.join(ROOT, "reports", SID, "index.json")
    try: runs = json.load(open(idxp)).get("runs", [])
    except Exception: runs = []
    if not a.force and not a.dry and any(r.get("date") == d.isoformat() and r.get("status") in ("ok", "holiday") for r in runs):
        print("already published for", d); sys.exit(3)
    hol = holidays().get(d.isoformat())
    if d.weekday() > 4 or hol:
        if a.check: sys.exit(3)
        if hol and not a.dry:
            subprocess.run([sys.executable, os.path.join(HERE, "publish.py"), SID, "--status", "holiday", "--note", "NSE closed today: %s." % hol])
        print("no session:", hol or "weekend"); sys.exit(3)
    if a.check:       # are the evening files out yet? (cheap HEAD-like probe on the two the report cannot do without)
        try:
            fetch("https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_%s.csv" % dmy(d), tries=1)
            fetch("https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_%s_F_0000.csv.zip" % d.strftime("%Y%m%d"), tries=1)
            print("files ready"); sys.exit(0)
        except Exception as ex:
            print("not ready:", ex); sys.exit(4)
    R = build(d, a.raw)
    R["nh"] = len(history(d)[2])
    outs, pdf = render(R, a.out)
    ins = ", ".join(x["lab"] for x in R["s_in"]) or "no clear inflow"; ots = ", ".join(x["lab"] for x in R["s_out"]) or "no clear outflow"
    cap = "Sector Digest %s: money in %s; out of %s; circuits %d up / %d down" % (d.strftime("%d %b"), ins, ots, len(R["circ"]["up"]), len(R["circ"]["dn"]))
    print(cap); print("\n".join(outs + [pdf]))
    save_stats(R, a.out if a.dry else os.path.join(ROOT, "data"))
    if a.dry: return
    nf = next((v for n, v in R["snap"]["idx"] if n == "Nifty 50"), None)
    mood = "bull" if nf and nf["pct"] >= 0.3 else "bear" if nf and nf["pct"] <= -0.3 else "neutral"
    meta = os.path.join(a.out, "Sector_Digest_%s.json" % d.isoformat())
    json.dump({"headline": "Money in: %s · out: %s" % (ins, ots), "mood": {"key": mood}}, open(meta, "w"))
    cmd = [sys.executable, os.path.join(HERE, "publish.py"), SID, "--date", d.isoformat(), "--caption", cap, "--file", pdf, "--file", meta] + sum([["--file", f] for f in outs], [])
    subprocess.run(cmd, check=True)


def save_stats(R, folder):
    """Per-stock evening facts for the next morning's 'Stocks in the news' trend read (RSI, volume, delivery, OI build-up, PCR, sector flow)."""
    try:
        secflow = {}
        for x in R["sectors"]:
            for m in x["mem"]:
                secflow.setdefault(m["sym"], (x["lab"], x["flow"]))
        r2 = lambda v, n=2: None if v is None else round(v, n)
        st = {}
        for s, m in R["S"].items():
            if m.get("series") != "EQ":
                continue
            st[s] = {"c": m["c"], "pct": r2(m["pct"]), "rsi": r2(m["rsi"], 1), "rsip": r2(m["rsip"], 1), "vm": r2(m["vm"]), "dp": r2(m.get("dp"), 1),
                     "bu": m.get("bu"), "oip": r2(m.get("oip"), 1), "pcr": m.get("pcr"), "cwall": m.get("cwall"), "pwall": m.get("pwall"),
                     "sec": secflow.get(s, (None, None))[0], "flow": secflow.get(s, (None, None))[1]}
        nf = next((v for n, v in R["snap"]["idx"] if n == "Nifty 50"), None)
        mk = {"nifty_pct": r2(nf["pct"]) if nf else None, "nifty_pcr": (R["idxfo"].get("NIFTY") or {}).get("pcr"),
              "adv": R["snap"].get("adv"), "dec": R["snap"].get("dec")}
        json.dump({"date": R["date"].isoformat(), "market": mk, "stocks": st}, open(os.path.join(folder, "stock_stats.json"), "w"), separators=(",", ":"))
        # daily archive (build-up, PCR, sector flow) so their edge can be measured once enough sessions exist
        hp = os.path.join(folder, "stock_stats_hist.json")
        try:
            hist = json.load(open(hp))
        except Exception:
            hist = {"note": "per session: symbol -> [futures build-up, stock PCR, sector flow]", "d": {}}
        hist["d"][R["date"].isoformat()] = {s: [v["bu"], v["pcr"], v["flow"]] for s, v in st.items() if v["bu"] or v["pcr"] is not None or v["flow"]}
        for k in sorted(hist["d"])[:-260]:
            del hist["d"][k]
        json.dump(hist, open(hp, "w"), separators=(",", ":"))
        print("stock stats saved:", len(st))
    except Exception as ex:
        print("stock stats not saved:", ex)


if __name__ == "__main__":
    main()
