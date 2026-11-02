import re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "Accept": "text/html"}
out = []
for sym in ("RELIANCE", "BEL", "HDFCBANK"):
    h = urllib.request.urlopen(urllib.request.Request(f"https://www.topstockresearch.com/rt/ViewOptionChain/{sym}", headers=UA), timeout=30).read().decode("utf-8", "replace")
    txt = re.sub(r"<[^>]+>", " ", h); txt = re.sub(r"\s+", " ", txt)
    out.append(f"== {sym} len={len(h)}")
    for m in re.finditer(r"(Expiry|expiry|Spot|Last Price|LTP|As on|Updated)[^|]{0,120}", txt): out.append("  META: " + m.group(0)[:140]); break
    rows = re.findall(r"<tr[\s\S]*?</tr>", h)
    for r in rows[:6] + rows[18:24]:
        t = [re.sub(r"<[^>]+>", "", x).replace("&nbsp;", " ").strip() for x in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", r)]
        out.append("  ROW: " + " | ".join(t))
    i = h.find("Option Chain"); out.append("  CTX: " + re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h[i:i + 900]))[:500])
open("/tmp/research.md", "w").write("\n".join(out)); print("\n".join(out))
