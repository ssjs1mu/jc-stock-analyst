#!/usr/bin/env python3
"""Temporary probe: structure of Moneycontrol FII/DII JSON."""
import json
import re
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def nd(url):
    h = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=25).read().decode("utf-8", "replace")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    return json.loads(m.group(1))["props"]["pageProps"] if m else {}


def shape(o, path="", out=None, depth=0):
    out = [] if out is None else out
    if isinstance(o, dict):
        for k, v in o.items():
            shape(v, path + "." + k, out, depth + 1)
    elif isinstance(o, list):
        out.append("%s[list %d] first=%s last=%s" % (path, len(o), json.dumps(o[0])[:300] if o else "", json.dumps(o[-1])[:200] if o else ""))
    elif depth < 4:
        out.append("%s=%s" % (path, str(o)[:60]))
    return out


def warn(t, s):
    print("::warning title=%s::%s" % (t, s.replace("%", "%25").replace("\r", " ").replace("\n", " ## ")[:3900]))


for name, url in [("main", "https://www.moneycontrol.com/markets/fii-dii-data/"),
                  ("cash", "https://www.moneycontrol.com/markets/fii-dii-data/cash/")]:
    try:
        pp = nd(url)
        lines = [l for l in shape(pp) if "[list" in l]
        warn(name, "\n".join(lines))
    except Exception as e:
        warn(name, "ERR " + str(e))
