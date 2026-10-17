#!/usr/bin/env python3
"""Per-stock free-float market cap -> data/weights.json (used by the dashboard to weight index constituents).
Source 1: NSE equity-stockIndices (ffmc, NIFTY 500).  Source 2 (fallback): Yahoo quote marketCap.
Index weight in the browser = stock cap / sum of caps of that index's constituents (approximate; index caps not applied)."""
import json, sys, datetime, http.cookiejar, urllib.request as ur, urllib.parse

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

def nse():
    cj = http.cookiejar.CookieJar(); op = ur.build_opener(ur.HTTPCookieProcessor(cj))
    op.addheaders = [('User-Agent', UA), ('Accept', 'application/json,text/plain,*/*'), ('Accept-Language', 'en-US,en;q=0.9'), ('Referer', 'https://www.nseindia.com/')]
    op.open('https://www.nseindia.com/', timeout=25).read(200)
    out = {}
    for idx in ('NIFTY 500', 'NIFTY MIDCAP 100', 'NIFTY SMALLCAP 100'):
        try:
            j = json.loads(op.open('https://www.nseindia.com/api/equity-stockIndices?index=' + urllib.parse.quote(idx), timeout=30).read().decode())
            for r in j.get('data', []):
                s = r.get('symbol'); f = r.get('ffmc')
                if s and f and not s.startswith('NIFTY'): out[s] = float(f)
        except Exception as e:
            print('::warning::NSE ' + idx + ' ' + str(e)[:150])
    return out

def yahoo(symbols):
    cj = http.cookiejar.CookieJar(); op = ur.build_opener(ur.HTTPCookieProcessor(cj)); op.addheaders = [('User-Agent', UA)]
    try: op.open('https://fc.yahoo.com', timeout=15).read(50)
    except Exception: pass
    crumb = op.open('https://query1.finance.yahoo.com/v1/test/getcrumb', timeout=15).read().decode()
    out = {}
    for i in range(0, len(symbols), 40):
        ch = [s + '.NS' for s in symbols[i:i + 40]]
        u = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + urllib.parse.quote(','.join(ch)) + '&crumb=' + urllib.parse.quote(crumb)
        try:
            j = json.loads(op.open(u, timeout=30).read().decode())
            for r in j['quoteResponse']['result']:
                if r.get('marketCap'): out[r['symbol'][:-3]] = float(r['marketCap'])
        except Exception as e:
            print('::warning::Yahoo chunk ' + str(e)[:120])
    return out

def main():
    cons = json.load(open('data/constituents.json'))['idx']
    uni = sorted({s for v in cons.values() for s in v})
    w, src = {}, ''
    try:
        w = nse(); src = 'NSE free-float market cap'
    except Exception as e:
        print('::warning::NSE failed ' + str(e)[:200])
    cover = lambda d: sum(1 for s in uni if s in d) / len(uni)
    print(f'::notice::NSE coverage {cover(w):.0%} of {len(uni)} constituent stocks')
    if cover(w) < 0.8:
        try:
            y = yahoo(uni); print(f'::notice::Yahoo coverage {cover(y):.0%}')
            for s, v in y.items():
                if s not in w: w[s] = v * 1.0
            if cover(w) >= 0.8 and not src: src = 'Yahoo market cap'
            elif cover(w) >= 0.8: src += ' + Yahoo market cap (gaps)'
        except Exception as e:
            print('::warning::Yahoo failed ' + str(e)[:200])
    if cover(w) < 0.5:
        print('::error::not enough weight data'); sys.exit(1)
    json.dump({'updated': datetime.datetime.utcnow().isoformat(timespec='seconds') + 'Z', 'source': src, 'w': {s: round(w[s], 2) for s in uni if s in w}}, open('data/weights.json', 'w'), separators=(',', ':'))
    print(f'::notice::weights saved for {sum(1 for s in uni if s in w)} stocks ({src})')

if __name__ == '__main__':
    main()
