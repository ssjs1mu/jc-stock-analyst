#!/usr/bin/env python3
"""Temporary probe: dig into Moneycontrol's FII/DII page for history."""
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
    print("::warning title=%s::%s" % (t, s.replace("%", "%25").replace("\r", " ").replace("\n", " ")[:3800]))


for name, url in [("mc_new", "https://www.moneycontrol.com/markets/fii-dii-data/"),
                  ("mc_old", "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/index.php")]:
    st, h = get(url)
    apis = sorted(set(re.findall(r"https?://[a-z0-9.-]*moneycontrol\.com/[^\"'\s<>]*(?:fii|dii|FII)[^\"'\s<>]*", h)))
    warn(name + "_status", "%s %d bytes; api-like urls: %s" % (st, len(h), " , ".join(apis)[:2500]))
    nd = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    if nd:
        j = nd.group(1)
        warn(name + "_next", "NEXT_DATA %d chars: %s" % (len(j), j[:3500]))
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S)
    txt = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", r)).strip() for r in rows]
    txt = [t for t in txt if re.search(r"\d", t)]
    warn(name + "_rows", "%d rows: %s" % (len(txt), " ## ".join(txt[:40])))
