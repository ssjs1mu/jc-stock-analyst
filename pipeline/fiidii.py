#!/usr/bin/env python3
"""Collects FII/DII cash-market flows into data/fiidii.json for the dashboard (free sources only).

Sources
  * NSE  /api/fiidiiTradeReact          - latest provisional day (FII/FPI + DII buy, sell, net)
  * Moneycontrol fii-dii-data/cash page - last ~30 sessions of the same provisional numbers
  * NSDL Yearwise report                - official monthly FPI net investment in equity (calendar year)

Daily rows accumulate in the file, so monthly / YTD DII totals fill in as days are collected.
Values are Rs crore. Nothing is estimated: a missing source is simply skipped.
"""
import datetime as dt
import http.cookiejar
import json
import os
import re
import sys
import urllib.request
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "fiidii.json")
IST = ZoneInfo("Asia/Kolkata")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
KEEP_DAYS = 800

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def get(url, accept="*/*", referer=None):
    h = {"User-Agent": UA, "Accept": accept, "Accept-Language": "en-US,en;q=0.9"}
    if referer:
        h["Referer"] = referer
    with opener.open(urllib.request.Request(url, headers=h), timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def num(s):
    if s is None:
        return None
    s = str(s).replace(",", "").strip()
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        v = float(s)
    except ValueError:
        return None
    return round(-v if neg else v, 2)


def day_row(fb, fs, fn, db, ds, dn, src):
    row = {"fii_buy": num(fb), "fii_sell": num(fs), "fii_net": num(fn), "dii_buy": num(db), "dii_sell": num(ds), "dii_net": num(dn), "src": src}
    if row["fii_net"] is None and row["fii_buy"] is not None and row["fii_sell"] is not None:
        row["fii_net"] = round(row["fii_buy"] - row["fii_sell"], 2)
    if row["dii_net"] is None and row["dii_buy"] is not None and row["dii_sell"] is not None:
        row["dii_net"] = round(row["dii_buy"] - row["dii_sell"], 2)
    return row


def from_moneycontrol():
    h = get("https://www.moneycontrol.com/markets/fii-dii-data/cash/", accept="text/html")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    rows = json.loads(m.group(1))["props"]["pageProps"]["FiiDiiData"]["fiiDiiData"]
    out = {}
    for r in rows:
        d = r.get("date")
        if d and re.match(r"\d{4}-\d{2}-\d{2}$", d):
            out[d] = day_row(r.get("fiiPurchase"), r.get("fiiSales"), r.get("fiiNet"), r.get("diiPurchase"), r.get("diiSale"), r.get("diiNet"), "moneycontrol")
    return out


def from_nse():
    last = None
    for attempt in range(3):
        try:
            return _from_nse()
        except Exception as e:  # NSE's bot filter sometimes refuses a first visit
            last = e
            import time
            time.sleep(4 + attempt * 4)
    raise last


def _from_nse():
    get("https://www.nseindia.com/", accept="text/html")
    get("https://www.nseindia.com/reports/fii-dii", accept="text/html")
    rows = json.loads(get("https://www.nseindia.com/api/fiidiiTradeReact", accept="application/json", referer="https://www.nseindia.com/reports/fii-dii"))
    by = {}
    for r in rows:
        d = dt.datetime.strptime(r["date"], "%d-%b-%Y").date().isoformat()
        by.setdefault(d, {})["dii" if r["category"].upper().startswith("DII") else "fii"] = r
    out = {}
    for d, x in by.items():
        f, i = x.get("fii", {}), x.get("dii", {})
        out[d] = day_row(f.get("buyValue"), f.get("sellValue"), f.get("netValue"), i.get("buyValue"), i.get("sellValue"), i.get("netValue"), "nse")
    return out


def from_nsdl():
    """Monthly FPI net investment in equity, current calendar year (first column of each month row)."""
    h = get("https://www.fpi.nsdl.co.in/web/Reports/Yearwise.aspx?RptType=6", accept="text/html")
    yr = re.search(r"Calendar Year\s*-\s*(\d{4})", h)
    if not yr:
        raise ValueError("NSDL page layout changed (no calendar year)")
    year = int(yr.group(1))
    flat = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", h))
    upto = re.search(r"up to (\d{1,2} \w{3} \d{4})", flat)
    out = {}
    for i, name in enumerate(MONTHS):
        m = re.search(r"\b%s[\s|]+([-()\d.,]+)\s*\|" % name, flat)
        if m and num(m.group(1)) is not None:
            out["%d-%02d" % (year, i + 1)] = num(m.group(1))
    if not out:
        i = flat.find("January")
        print("::warning title=nsdl layout::" + flat[max(0, i - 200):i + 600].replace("%", "%25"))
        raise ValueError("NSDL monthly rows not found")
    return year, out, (upto.group(1) if upto else "")


def main():
    try:
        data = json.load(open(OUT))
    except Exception:
        data = {}
    daily = data.get("daily", {})
    fpi = data.get("fpi_equity_monthly", {})
    status = {}
    for name, fn in [("moneycontrol", from_moneycontrol), ("nse", from_nse)]:  # NSE last so it wins for its day
        try:
            got = fn()
            for d, row in got.items():
                if row["fii_net"] is not None and row["dii_net"] is not None:
                    daily[d] = row
            status[name] = "ok (%d days)" % len(got)
        except Exception as e:
            status[name] = "failed: %s" % str(e)[:160]
    try:
        year, months, upto = from_nsdl()
        fpi.update(months)
        data["fpi_equity_upto"] = upto
        status["nsdl"] = "ok (%d months of %d)" % (len(months), year)
    except Exception as e:
        status["nsdl"] = "failed: %s" % str(e)[:160]
    days = sorted(daily)[-KEEP_DAYS:]
    new = {
        "updated_at": dt.datetime.now(IST).isoformat(timespec="seconds"),
        "unit": "Rs crore",
        "notes": "Daily FII/DII = NSE provisional cash-market data (via NSE and Moneycontrol). "
                 "FPI monthly = NSDL net investment in equity (all routes, includes primary market).",
        "daily": {d: daily[d] for d in days},
        "fpi_equity_monthly": dict(sorted(fpi.items())),
        "fpi_equity_upto": data.get("fpi_equity_upto", ""),
        "sources": status,
    }
    print(json.dumps(status))
    for k, v in status.items():
        if not v.startswith("ok"):
            print("::warning title=%s::%s" % (k, v))
    if not days:
        sys.exit("No FII/DII data from any source.")
    same = {k: v for k, v in data.items() if k not in ("updated_at", "sources")} == {k: v for k, v in new.items() if k not in ("updated_at", "sources")}
    if same and os.path.exists(OUT):
        print("No new figures; file left unchanged.")
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(new, f, separators=(",", ":"))
    print("Wrote %s: %d days, latest %s" % (OUT, len(days), days[-1]))


if __name__ == "__main__":
    main()
