"""Free, quota-less fallback for the Joshi's Dashboard: fetches every dashboard symbol from Yahoo (real data,
from the GitHub runner, not from Apps Script) and writes data/dash_snapshot.json in the same row shape as the
backend 'dash' action. The app uses it only when the Apps Script backend is out of quota; it is labelled delayed."""
import json, re, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
src = open('dashboard.js', encoding='utf8').read().split('const SETS', 1)[0]
syms = list(dict.fromkeys(re.findall(r"\['([^'\s]+)',\s*'[^']*'", src) + ['EURINR=X', 'GBPINR=X', 'JPYINR=X', 'DX-Y.NYB', 'EURUSD=X']))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept': '*/*'}
def get(s):
    u = 'https://query1.finance.yahoo.com/v8/finance/chart/%s?range=1d&interval=15m&includePrePost=false' % urllib.parse.quote(s)
    for a in range(3):
        try:
            j = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=15))
            x = j['chart']['result'][0]; m = x.get('meta', {}); q = (x.get('indicators', {}).get('quote') or [{}])[0]
            c = [round(v, 4) for v in (q.get('close') or []) if v is not None][-40:]
            p = m.get('regularMarketPrice')
            if p is None: return None
            return {'s': s, 'p': p, 'pc': m.get('chartPreviousClose', m.get('previousClose')), 't': m.get('regularMarketTime'), 'sp': c}
        except Exception:
            time.sleep(1 + a)
    return None
with ThreadPoolExecutor(8) as ex: rows = [r for r in ex.map(get, syms) if r]
print('symbols', len(syms), 'got', len(rows))
if len(rows) < len(syms) * 0.5: sys.exit('too few rows - keeping the previous snapshot')
json.dump({'ts': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'rows': rows}, open('data/dash_snapshot.json', 'w'), separators=(',', ':'))
