import json, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import results_cal as rc
op = rc.opener()
out = {}
syms = ['HSCL', 'HFCL', 'TCS', 'INFY', 'RELIANCE', 'ABB', 'DLF', 'ITC', 'SBIN', 'LT', 'ZEEL', 'MRF', 'PIIND', 'SRF', 'UPL', 'TITAN']
for gap in (0.5, 2.0):
    for s in syms:
        t = time.time()
        j = rc.get(op, 'https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol=%s&period=Quarterly' % s)
        rows = rc.rows_of(j)
        ds = [rc.pdate(r.get('broadCastDate')) for r in rows]
        ds = [d for d in ds if d]
        out['%s@%.1f' % (s, gap)] = {'n': len(rows), 'max': max(ds).strftime('%Y-%m-%d') if ds else None, 'sec': round(time.time() - t, 1)}
        time.sleep(gap)
json.dump({'out': out, 'errors': rc.status['errors'][:10]}, open(os.path.join(rc.ROOT, 'data', 'probe.json'), 'w'), indent=1)
print(json.dumps(out))
