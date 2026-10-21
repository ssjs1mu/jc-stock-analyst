import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import results_cal as rc
op = rc.opener()
V = ['https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol=HSCL&period=Quarterly',
     'https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol=HSCL',
     'https://www.nseindia.com/api/results-comparision?symbol=HSCL',
     'https://www.nseindia.com/api/top-corp-info?symbol=HSCL&market=equities',
     'https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=HSCL&subject=Financial%20Results',
     'https://www.nseindia.com/api/event-calendar?index=equities&symbol=HSCL']
out = {}
import urllib.error, gzip
for u in V:
    try:
        r = op.open(u, timeout=40); raw = r.read()
        if r.headers.get('Content-Encoding') == 'gzip': raw = gzip.decompress(raw)
        out[u[-70:]] = {'code': r.status, 'len': len(raw), 'head': raw.decode('utf-8', 'replace')[:900]}
    except Exception as e:
        out[u[-70:]] = {'err': str(e)}
json.dump(out, open(os.path.join(rc.ROOT, 'data', 'probe.json'), 'w'), indent=1)
print(json.dumps(out)[:1500])
