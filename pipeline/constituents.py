#!/usr/bin/env python3
"""Index constituents for the dashboard heatmap drill-down -> data/constituents.json
Source: niftyindices.com official constituent CSVs. Keys are the Yahoo symbols used by the dashboard heatmap."""
import csv, io, json, os, sys, urllib.request, datetime

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept': '*/*'}
BASE = ['https://www.niftyindices.com/IndexConstituent/', 'https://niftyindices.com/IndexConstituent/', 'https://archives.nseindia.com/content/indices/']
IDX = {
    '^NSEI': ['ind_nifty50list.csv'], '^NSEBANK': ['ind_niftybanklist.csv'], '^CNX100': ['ind_nifty100list.csv'], '^CNX200': ['ind_nifty200list.csv'],
    '^CNXAUTO': ['ind_niftyautolist.csv'], '^CNXCMDT': ['ind_niftycommoditieslist.csv'], 'NIFTY_CONSR_DURBL.NS': ['ind_niftyconsumerdurableslist.csv'],
    '^CNXCONSUM': ['ind_niftyconsumptionlist.csv'], '^CNXENERGY': ['ind_niftyenergylist.csv'], '^CNXFIN': ['ind_niftyfinancelist.csv'], '^CNXFMCG': ['ind_niftyfmcglist.csv'],
    'NIFTY_HEALTHCARE.NS': ['ind_niftyhealthcarelist.csv'], 'NIFTY_IND_DEFENCE.NS': ['ind_niftyindiadefence_list.csv', 'ind_niftyindiadefencelist.csv', 'ind_niftyindiadefense_list.csv', 'ind_niftyindiadefence.csv', 'ind_niftyindia_defence_list.csv', 'ind_niftyindiadefencelist .csv'],
    'NIFTY_IND_DIGITAL.NS': ['ind_niftyindiadigital_list.csv', 'ind_niftyindiadigitallist.csv'], '^CNXINFRA': ['ind_niftyinfralist.csv'], '^CNXIT': ['ind_niftyitlist.csv'], '^CNXMEDIA': ['ind_niftymedialist.csv'],
    '^CNXMETAL': ['ind_niftymetallist.csv'], 'NIFTY_MIDCAP_100.NS': ['ind_niftymidcap100list.csv'], '^NSEMDCP50': ['ind_niftymidcap50list.csv'], '^CNXMNC': ['ind_niftymnclist.csv'],
    '^NSMIDCP': ['ind_niftynext50list.csv'], 'NIFTY_OIL_AND_GAS.NS': ['ind_niftyoilgaslist.csv'], '^CNXPHARMA': ['ind_niftypharmalist.csv'], '^CNXPSE': ['ind_niftypselist.csv'],
    '^CNXPSUBANK': ['ind_niftypsubanklist.csv'], 'NIFTY_PVT_BANK.NS': ['ind_nifty_privatebanklist.csv', 'ind_niftyprivatebanklist.csv'], '^CNXREALTY': ['ind_niftyrealtylist.csv'],
    '^CNXSERVICE': ['ind_niftyservicelist.csv', 'ind_niftyservicesectorlist.csv'],
}

def get(url, t=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.status, dict(r.headers), r.read().decode('utf-8', 'replace')

def main():
    out, bad = {}, []
    for sym, files in IDX.items():
        got = None
        for f in files:
            for b in BASE:
                try:
                    st, _, txt = get(b + f)
                    if 'Symbol' not in txt[:400]: raise ValueError('not a constituent csv')
                    rows = list(csv.DictReader(io.StringIO(txt.lstrip('﻿'))))
                    syms = [(r.get('Symbol') or '').strip() for r in rows if (r.get('Symbol') or '').strip()]
                    syms = [s for s in syms if not s.upper().startswith('DUMMY')]
                    if len(syms) >= 5:
                        got = syms; break
                except Exception as e:
                    last = f'{b}{f}: {type(e).__name__} {e}'
            if got: break
        if got: out[sym] = got
        else: bad.append(f'{sym} -> {last}')
    print(f'::notice::constituents ok for {len(out)}/{len(IDX)} indices')
    for b in bad: print('::warning::' + b[:300])
    for sym in ('^NSEI', '^CNXIT'):
        if sym in out: print(f'::notice::{sym} {len(out[sym])} stocks e.g. {",".join(out[sym][:6])}')
    if out:
        json.dump({'updated': datetime.datetime.utcnow().isoformat(timespec='seconds') + 'Z', 'source': 'niftyindices.com', 'idx': out}, open('data/constituents.json', 'w'), separators=(',', ':'))
    else:
        print('::error::no constituents fetched'); sys.exit(1)

if __name__ == '__main__':
    main()
