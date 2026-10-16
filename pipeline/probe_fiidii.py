#!/usr/bin/env python3
"""Temporary probe: which free FII/DII sources answer from a GitHub runner?"""
import http.cookiejar
import re
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def get(url, ref=None, accept="*/*"):
    h = {"User-Agent": UA, "Accept": accept, "Accept-Language": "en-US,en;q=0.9"}
    if ref:
        h["Referer"] = ref
    try:
        r = op.open(urllib.request.Request(url, headers=h), timeout=25)
        b = r.read()
        return r.status, b
    except Exception as e:
        return getattr(e, "code", "ERR"), str(e).encode()


def show(name, url, **kw):
    st, b = get(url, **kw)
    txt = b.decode("utf-8", "replace")
    flat = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", txt))
    out = "%s %s %d bytes | RAW: %s" % (name, st, len(b), txt[:500].replace("\n", " "))
    m = re.search(r"(FII|DII|FPI)[^|]{0,1800}", flat)
    if m:
        out += " | TEXT: " + m.group(0)[:1800]
    out = out.replace("%", "%25").replace("\r", " ").replace("\n", " ")
    print("::warning title=%s::%s" % (name, out))


get("https://www.nseindia.com/", accept="text/html")
get("https://www.nseindia.com/reports/fii-dii", accept="text/html")
show("nse_fiidiiTradeReact", "https://www.nseindia.com/api/fiidiiTradeReact", ref="https://www.nseindia.com/reports/fii-dii")
show("moneycontrol", "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/index.php", accept="text/html")
show("nsdl_latest", "https://www.fpi.nsdl.co.in/web/Reports/Latest.aspx", accept="text/html")
show("trendlyne_month", "https://trendlyne.com/macro-data/fii-dii/latest/cash-pastmonth/", accept="text/html")
show("et_fiidii", "https://economictimes.indiatimes.com/markets/stocks/fii-dii-activity", accept="text/html")
