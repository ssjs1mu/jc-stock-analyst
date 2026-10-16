#!/usr/bin/env python3
"""Temporary probe: NSDL 2026 monthly rows."""
import re
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
h = urllib.request.urlopen(urllib.request.Request("https://www.fpi.nsdl.co.in/web/Reports/Yearwise.aspx?RptType=6", headers={"User-Agent": UA}), timeout=25).read().decode("utf-8", "replace")
rows = re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S | re.I)
out = []
for r in rows:
    cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S | re.I)]
    if any(re.search(r"\d", c) for c in cells):
        out.append(" | ".join(cells))
print("::warning title=nsdl_rows::" + (" ## ".join(out[:40])).replace("%", "%25")[:3900])
print("::warning title=nsdl_forms::" + " ## ".join(sorted(set(re.findall(r'name="([^"]+)"', h))))[:1500])
