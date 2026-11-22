#!/usr/bin/env python3
"""Preview only: render the 'Stocks in the news' pages from a stock_news.py JSON (for checking layout / ranking)."""
import json, sys, os, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_booklet as R
from playwright.sync_api import sync_playwright
j = json.load(open(sys.argv[1])); out = sys.argv[2]
j.setdefault("model", None)
j["since_txt"] = dt.datetime.fromisoformat(j["since"]).strftime("%a %d %b, %H:%M")
b = {"stock_news": j, "date_txt": dt.datetime.fromisoformat(j["asof"]).strftime("%d %b %Y")}
p = R.PAL["neutral"]
pages = [f(b, p, 9) for f in R.stock_news_pages(b)]
with sync_playwright() as pw:
    br = pw.chromium.launch(); pg = br.new_page(viewport={"width": R.W, "height": R.H})
    for i, d in enumerate(pages, 1):
        pg.set_content(d, wait_until="load")
        try: pg.wait_for_load_state("networkidle", timeout=6000)
        except Exception: pass
        pg.screenshot(path="%s_%d.png" % (out, i))
    br.close()
print(len(pages), "pages")
