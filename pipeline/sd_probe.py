"""One-off probe: which NSE archive files the runner can fetch (for the Sector Digest)."""
import urllib.request, zipfile, io, sys
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "Accept": "*/*", "Referer": "https://www.nseindia.com/"}
D = sys.argv[1] if len(sys.argv) > 1 else "20112026"      # ddmmyyyy
dd, mm, yy, yyyy = D[:2], D[2:4], D[6:], D[4:]
U = {
 "PR zip": f"https://nsearchives.nseindia.com/archives/equities/bhavcopy/pr/PR{dd}{mm}{yy}.zip",
 "52wk HL": f"https://nsearchives.nseindia.com/content/CM_52_wk_High_low_{D}.csv",
 "FO UDiFF": f"https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{yyyy}{mm}{dd}_F_0000.csv.zip",
 "sec_list bands": "https://nsearchives.nseindia.com/content/equities/sec_list.csv",
 "index close": f"https://nsearchives.nseindia.com/content/indices/ind_close_all_{D}.csv",
 "sec_bhav": f"https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{D}.csv",
 "FII deriv stats": f"https://nsearchives.nseindia.com/content/fo/fii_stats_{dd}-{['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][int(mm)]}-{yyyy}.xls",
 "participant OI": f"https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{D}.csv",
}
for k, u in U.items():
    try:
        b = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read()
        print(f"### {k}: OK {len(b)} bytes  {u}")
        if b[:2] == b"PK":
            z = zipfile.ZipFile(io.BytesIO(b)); print("  files:", z.namelist()[:20])
            for n in z.namelist():
                if n.lower().startswith(("bh", "pr", "hl", "gl", "an", "bhavcopy")) or n.endswith(".csv"):
                    t = z.read(n).decode("latin-1").splitlines(); print("  --", n, len(t), "lines"); [print("   ", x[:220]) for x in t[:4]]
        elif not k.endswith("stats"):
            t = b.decode("latin-1").splitlines(); [print("   ", x[:220]) for x in t[:4]]
    except Exception as e:
        print(f"### {k}: FAIL {str(e)[:120]}  {u}")
