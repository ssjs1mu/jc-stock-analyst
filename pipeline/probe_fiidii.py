#!/usr/bin/env python3
"""Temporary probe: monthly / yearly views on Moneycontrol and NSDL."""
import json
import re
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def get(url):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"}), timeout=25)
        return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", "ERR"), str(e)


def warn(t, s):
    print("::warning title=%s::%s" % (t, s.replace("%", "%25").replace("\r", " ").replace("\n", " ")[:3900]))


st, h = get("https://www.moneycontrol.com/markets/fii-dii-data/cash/")
ctx = sorted(set(m.group(0) for m in re.finditer(r".{0,80}(?:[Mm]onthly|[Yy]early|YTD|[Yy]ear to).{0,80}", h)))
warn("mc_cash_words", " ## ".join(ctx)[:3800])
bid = re.search(r'"buildId":"([^"]+)"', h)
warn("mc_build", bid.group(1) if bid else "no buildId")
for q in ["?type=monthly", "?period=monthly", "?view=month", "?duration=monthly", "?type=yearly"]:
    s2, h2 = get("https://www.moneycontrol.com/markets/fii-dii-data/cash/" + q)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h2, re.S)
    rows = []
    if m:
        pp = json.loads(m.group(1))["props"]["pageProps"]
        d = (pp.get("FiiDiiData") or {}).get("fiiDiiData") or []
        rows = [x.get("date") for x in d]
        extra = [k for k in pp.keys()]
    warn("mc_" + q, "%s n=%d first=%s last=%s keys=%s" % (s2, len(rows), rows[:2], rows[-2:], extra if m else ""))
s3, h3 = get("https://www.fpi.nsdl.co.in/web/Reports/Yearwise.aspx?RptType=6")
t3 = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", h3))
i = t3.find("2026")
warn("nsdl_yearwise", "%s %s" % (s3, t3[max(0, i - 300):i + 2500]))
s4, h4 = get("https://www.fpi.nsdl.co.in/web/Reports/Monthly.aspx")
t4 = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", h4))
i = t4.find("2026")
warn("nsdl_monthly", "%s %s" % (s4, t4[max(0, i - 300):i + 2500]))
