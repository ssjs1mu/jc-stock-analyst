#!/usr/bin/env python3
"""Collect NSE daily delivery volumes into data/delivery.json.

Source: NSE 'sec_bhavdata_full_DDMMYYYY.csv' (security-wise delivery position,
published after the close). Free, no API key, no Apps Script quota.
Stored per trading day as {SYMBOL: [delivery_qty, traded_qty]} for the index
universe in data/constituents.json plus a few extra symbols. Keeps ~160 days.
"""
import csv, io, json, os, sys, time, datetime as dt, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'delivery.json')
KEEP_DAYS = 160
BACKFILL_DAYS = 100          # calendar days looked back when history is thin
EXTRA = {'HEROMOTORS', 'HSCL'}
URL = 'https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_%s.csv'
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'Accept': 'text/csv,*/*', 'Referer': 'https://www.nseindia.com/'}


def universe():
    syms = set(EXTRA)
    try:
        c = json.load(open(os.path.join(ROOT, 'data', 'constituents.json')))
        for v in c.get('idx', {}).values():
            syms.update(s.strip().upper() for s in v)
    except Exception as e:
        print('constituents unreadable:', e)
    try:  # the terminal's ~500-stock universe
        import re
        t = open(os.path.join(ROOT, 'apps-script', 'Calls.server.gs')).read()
        m = re.search(r"UNI500_\s*=\s*'([^']*)'", t)
        if m:
            syms.update(x.strip().upper() for x in m.group(1).split() if x.strip())
    except Exception as e:
        print('UNI500 unreadable:', e)
    return syms


def fetch_day(d):
    url = URL % d.strftime('%d%m%Y')
    last = None
    for a in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None if e.code == 404 else ('HTTP403')
            last = e
        except Exception as e:
            last = e
        time.sleep(2 + a * 3)
    print('  fetch failed', d, last)
    return 'ERR'


def num(x):
    try:
        return int(float(str(x).replace(',', '').strip()))
    except Exception:
        return None


def parse(txt, uni):
    rows = {}
    rd = csv.reader(io.StringIO(txt))
    hdr = [h.strip().upper() for h in next(rd)]
    ix = {h: i for i, h in enumerate(hdr)}
    need = ['SYMBOL', 'SERIES', 'TTL_TRD_QNTY', 'DELIV_QTY']
    if any(n not in ix for n in need):
        raise ValueError('unexpected header: %s' % hdr[:8])
    for r in rd:
        if len(r) < len(hdr):
            continue
        sym = r[ix['SYMBOL']].strip().upper()
        if r[ix['SERIES']].strip() not in ('EQ', 'BE', 'BZ', 'SM', 'ST') or sym not in uni:
            continue
        dq, tq = num(r[ix['DELIV_QTY']]), num(r[ix['TTL_TRD_QNTY']])
        if dq is None or tq is None:
            continue
        rows[sym] = [dq, tq]
    return rows


def file_date(txt):
    # DATE1 column carries the trading date, e.g. 20-Oct-2026
    rd = csv.reader(io.StringIO(txt))
    hdr = [h.strip().upper() for h in next(rd)]
    if 'DATE1' not in hdr:
        return None
    i = hdr.index('DATE1')
    for r in rd:
        if len(r) > i:
            try:
                return dt.datetime.strptime(r[i].strip(), '%d-%b-%Y').date()
            except Exception:
                return None
    return None


def main():
    uni = universe()
    store = {'updated': None, 'unit': 'shares', 'note': 'd[date][SYMBOL]=[delivery_qty, traded_qty]; NSE security-wise delivery position', 'd': {}}
    if os.path.exists(OUT):
        try:
            store = json.load(open(OUT))
        except Exception:
            pass
    have = store.setdefault('d', {})
    today = dt.date.today()
    start = today - dt.timedelta(days=BACKFILL_DAYS if len(have) < 60 else 7)
    got = blocked = 0
    d = start
    while d <= today:
        iso = d.isoformat()
        if d.weekday() < 5 and iso not in have:
            txt = fetch_day(d)
            if txt == 'HTTP403':
                blocked += 1
                print('blocked (403) for', iso)
                if blocked >= 3:
                    break
            elif txt and txt != 'ERR':
                try:
                    fd = file_date(txt)
                    if fd and fd != d:
                        print('date mismatch', iso, fd)
                    else:
                        rows = parse(txt, uni)
                        if len(rows) > 50:
                            have[iso] = rows
                            got += 1
                            print('ok', iso, len(rows))
                except Exception as e:
                    print('parse error', iso, e)
            time.sleep(0.6)
        d += dt.timedelta(days=1)
    for k in sorted(have)[:-KEEP_DAYS]:
        have.pop(k)
    store['updated'] = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).isoformat(timespec='seconds')
    with open(OUT, 'w') as f:
        json.dump(store, f, separators=(',', ':'), sort_keys=True)
    print('days stored: %d, newly added: %d, size: %d bytes' % (len(have), got, os.path.getsize(OUT)))
    if not have:
        sys.exit(1)


if __name__ == '__main__':
    main()
