import json, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import results_cal as rc
op = rc.opener()
out = {}
for s in ['HSCL', 'HFCL', 'TCS', 'HEROMOTORS']:
    j = rc.get(op, 'https://www.nseindia.com/api/event-calendar?index=equities&symbol=%s' % s)
    rows = rc.rows_of(j)
    rec = []
    for r in rows:
        p = rc.pdate(r.get('date'))
        if p and p.year >= 2025:
            rec.append([p.strftime('%Y-%m-%d'), str(r.get('purpose'))[:50]])
    out[s] = {'n': len(rows), 'recent': sorted(rec)[-12:]}
    time.sleep(1)
j = rc.get(op, 'https://www.nseindia.com/api/top-corp-info?symbol=HSCL&market=equities')
out['corp_keys'] = list(j.keys()) if isinstance(j, dict) else None
out['fin'] = json.dumps(j.get('financial_results'))[:700] if isinstance(j, dict) else None
json.dump(out, open(os.path.join(rc.ROOT, 'data', 'probe.json'), 'w'), indent=1)
print(json.dumps(out)[:1500])
