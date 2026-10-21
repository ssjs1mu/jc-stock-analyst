#!/usr/bin/env python3
"""NSE results calendar -> data/results.json.
hist[SYMBOL] = ['YYYY-MM-DD HH:MM', ...] when quarterly/half-yearly results were broadcast (for the event study);
upcoming[SYMBOL] = [{'date':'YYYY-MM-DD','purpose':...}] board meetings that include financial results.
status carries counts/errors so a blocked source is visible instead of silent."""
import gzip, http.cookiejar, json, os, time, urllib.request, urllib.parse, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'results.json')
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
FMT = ('%d-%b-%Y %H:%M:%S', '%d-%b-%Y %H:%M', '%d-%b-%Y', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d-%m-%Y')
status = {'errors': [], 'hist_calls': 0, 'hist_rows': 0, 'up_rows': 0, 'sample_keys': None}


def opener():
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [('User-Agent', UA), ('Accept', 'application/json, text/plain, */*'), ('Accept-Language', 'en-US,en;q=0.9'),
                     ('Accept-Encoding', 'gzip'), ('Referer', 'https://www.nseindia.com/companies-listing/corporate-filings-financial-results')]
    for u in ('https://www.nseindia.com/', 'https://www.nseindia.com/companies-listing/corporate-filings-financial-results'):
        try:
            op.open(u, timeout=30).read()
        except Exception as e:
            status['errors'].append('warm %s: %s' % (u[-30:], e))
        time.sleep(1)
    return op


def get(op, url):
    for a in range(3):
        try:
            r = op.open(url, timeout=45)
            raw = r.read()
            if r.headers.get('Content-Encoding') == 'gzip':
                raw = gzip.decompress(raw)
            return json.loads(raw.decode('utf-8', 'replace'))
        except Exception as e:
            err = str(e)
            time.sleep(2 + 3 * a)
    status['errors'].append('%s: %s' % (url.split('?')[0][-40:], err))
    return None


def pdate(x):
    x = str(x or '').strip()
    for f in FMT:
        try:
            return dt.datetime.strptime(x, f)
        except Exception:
            pass
    return None


def rows_of(j):
    if isinstance(j, list):
        return j
    if isinstance(j, dict):
        for k in ('data', 'rows', 'results'):
            if isinstance(j.get(k), list):
                return j[k]
    return []


def main():
    store = {'hist': {}, 'upcoming': {}}
    if os.path.exists(OUT):
        try:
            store = json.load(open(OUT))
        except Exception:
            pass
    hist = store.setdefault('hist', {})
    op = opener()
    today = dt.date.today()

    def ingest(rows):
        for r in rows:
            if status['sample_keys'] is None:
                status['sample_keys'] = {k: str(v)[:40] for k, v in r.items()}
            sym = str(r.get('symbol') or '').upper()
            if not sym:
                continue
            best = None
            for k, v in r.items():
                if 'date' in k.lower() and any(w in k.lower() for w in ('broad', 'filing', 'exchdiss', 'submission', 'dissem', 'recei')):
                    p_ = pdate(v)
                    if p_ and (best is None or p_ > best):
                        best = p_
            if best is None or best.date() < today - dt.timedelta(days=340):
                continue
            hist.setdefault(sym, [])
            s_ = best.strftime('%Y-%m-%d %H:%M')
            if s_ not in hist[sym]:
                hist[sym].append(s_)
                status['hist_rows'] += 1

    sys_ = None
    try:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import delivery
        sys_ = sorted(delivery.universe())
    except Exception as e:
        status['errors'].append('universe: %s' % e)
    cut = today - dt.timedelta(days=340)
    if sys_ and (len(hist) < 300 or today.weekday() == 5):
        fails = 0
        hist.clear()
        for n, sym in enumerate(sys_):
            if n and n % 120 == 0:
                op = opener()
            j = get(op, 'https://www.nseindia.com/api/event-calendar?index=equities&symbol=%s' % urllib.parse.quote(sym))
            status['hist_calls'] += 1
            if j is None:
                fails += 1
                if fails >= 15 and fails > n * 0.5:
                    status['errors'].append('stopping after repeated failures at %s' % sym)
                    break
            else:
                ds = set()
                for r in rows_of(j):
                    txt = ' '.join(str(r.get(k) or '') for k in ('purpose',)).lower()
                    p_ = pdate(r.get('date'))
                    if p_ and 'result' in txt and cut <= p_.date() <= today + dt.timedelta(days=45):
                        ds.add(p_.strftime('%Y-%m-%d'))
                if ds:
                    hist[sym] = sorted(ds)
                    status['hist_rows'] += len(ds)
            time.sleep(0.5)
    up = {}
    url = 'https://www.nseindia.com/api/event-calendar?index=equities&from_date=%s&to_date=%s' % (today.strftime('%d-%m-%Y'), (today + dt.timedelta(days=30)).strftime('%d-%m-%Y'))
    j = get(op, url)
    for r in rows_of(j):
        sym = str(r.get('symbol') or '').upper()
        txt = ' '.join(str(r.get(k) or '') for k in ('purpose', 'bm_desc', 'desc')).lower()
        p = pdate(r.get('date') or r.get('bm_date'))
        if sym and p and 'result' in txt:
            up.setdefault(sym, []).append({'date': p.strftime('%Y-%m-%d'), 'purpose': str(r.get('purpose') or '')[:60]})
            status['up_rows'] += 1
    store['upcoming'] = up
    store['updated'] = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).isoformat(timespec='seconds')
    store['status'] = status
    with open(OUT, 'w') as f:
        json.dump(store, f, separators=(',', ':'), sort_keys=True)
    print(json.dumps(status)[:600])


if __name__ == '__main__':
    main()
