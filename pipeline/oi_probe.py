import re, urllib.request, json, sys
def get(u, h=None):
    rq = urllib.request.Request(u, headers=h or {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "Accept": "text/html"})
    return urllib.request.urlopen(rq, timeout=30).read().decode("utf-8", "replace")
out = []
for sym in ("reliance", "bel", "sbin"):
    for u in (f"https://upstox.com/option-chain/{sym}/", f"https://upstox.com/option-chain/{sym}-share-price/"):
        try:
            h = get(u); rows = re.findall(r"<tr[\s\S]*?</tr>", h); parsed = []
            for r in rows:
                t = [re.sub(r"<[^>]+>", "", x).replace(",", "").strip() for x in re.findall(r"<td[^>]*>([\s\S]*?)</td>", r)]
                if len(t) >= 15: parsed.append(t)
            out.append(f"{u}: len={len(h)} rows={len(rows)} wide={len(parsed)} sample={parsed[:2]}")
        except Exception as e: out.append(f"{u}: {e}")
for u in ("https://www.nseindia.com/api/option-chain-equities?symbol=BEL",):
    try: out.append(u + " -> " + get(u, {"User-Agent": "Mozilla/5.0", "Accept": "application/json"})[:200])
    except Exception as e: out.append(u + " -> " + str(e))
open("/tmp/research.md", "w").write("\n".join(out)); print("\n".join(out))
