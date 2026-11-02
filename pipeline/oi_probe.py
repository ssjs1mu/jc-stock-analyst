import re, urllib.request, http.cookiejar, json
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "Accept": "text/html,application/json"}
def get(u, h=None):
    return urllib.request.urlopen(urllib.request.Request(u, headers=h or UA), timeout=30).read().decode("utf-8", "replace")
out = []
for u in ("https://www.topstockresearch.com/rt/ViewOptionChain/RELIANCE", "https://anandrathi.com/stocks/reliance-industries-ltd/option-chain", "https://www.kotakneo.com/futures-and-options/stocks-options/reliance-industries-option-chain/",
          "https://stockmojo.in/option-chain/reliance", "https://www.sahi.com/products/options/option-chain/reliance/", "https://www.indmoney.com/options/reliance-industries-ltd", "https://www.motilaloswal.com/futures-and-options/reliance-industries-ltd"):
    try:
        h = get(u); rows = re.findall(r"<tr[\s\S]*?</tr>", h); nums = re.findall(r"\b\d{1,3}(?:,\d{3})+\b", h)
        wide = []
        for r in rows:
            t = [re.sub(r"<[^>]+>", "", x).replace(",", "").strip() for x in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", r)]
            if len(t) >= 7: wide.append(t[:14])
        out.append(f"{u}\n  len={len(h)} rows={len(rows)} wide={len(wide)} bignums={len(nums)} sample={wide[2:4]}")
    except Exception as e: out.append(f"{u}\n  {e}")
try:   # NSE with cookie warm-up
    cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)); op.addheaders = list(UA.items()) + [("Referer", "https://www.nseindia.com/option-chain")]
    op.open("https://www.nseindia.com/option-chain", timeout=30).read()
    j = op.open("https://www.nseindia.com/api/option-chain-equities?symbol=RELIANCE", timeout=30).read().decode()
    out.append("NSE: " + j[:300])
except Exception as e: out.append("NSE: " + str(e))
open("/tmp/research.md", "w").write("\n".join(out)); print("\n".join(out))
