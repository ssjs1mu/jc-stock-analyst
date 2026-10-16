#!/usr/bin/env python3
"""Renders the JCGG 'Closing Auction Divergence' infographic.

Usage: python3 render_cas_infographic.py --config cas.json --output out.png [--pdf out.pdf]

The PNG is the Telegram picture; --pdf also writes the same page as a PDF for
the terminal's scheduled-reports tab.

Config: title, subline (raw HTML), threshold, and EITHER not_published (plain
note) OR stocks [{symbol, ref_price, final_price, pct_chg (float), catalyst, flag?}].
Neither present = "no qualifying moves" empty state.
"""
import argparse
import base64
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BRANDING = os.path.join(HERE, "branding")


def logo_b64():
    from PIL import Image
    im = Image.open(os.path.join(BRANDING, "tree_logo_transparent.png"))
    w, h = im.size
    im = im.resize((260, int(260 * h / w)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def esc(s):
    if s is None:
        return ""
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def stock_card(s):
    chg = float(s["pct_chg"])
    d = "up" if chg >= 0 else "down"
    arrow = "&#9650;" if chg >= 0 else "&#9660;"
    sign = "+" if chg > 0 else ""
    flag = f'<span class="flag-badge">{esc(s["flag"])}</span>' if s.get("flag") else ""
    return f'''<div class="card"><div class="card-top"><div class="card-symbol">{esc(s["symbol"])}{flag}</div>
      <div class="chg-badge {d}"><span class="arrow">{arrow}</span>{sign}{chg:.2f}%</div></div>
      <div class="price-row"><div class="price-block"><span class="price-label">3:15 PM Ref</span><span class="price-val num">{esc(s["ref_price"])}</span></div>
      <div class="price-arrow">&#8594;</div>
      <div class="price-block"><span class="price-label">CAS Close</span><span class="price-val num hl-{d}">{esc(s["final_price"])}</span></div></div>
      <p class="catalyst">{esc(s.get("catalyst", "No clear catalyst identified for this session"))}</p></div>'''


CSS = """
:root{--void:#0b0a17;--panel:#15132a;--hair:rgba(139,92,246,.28);--violet:#8b5cf6;--cyan:#22d3ee;--gold:#e8b54d;--ink:#f4f2ff;--ink-dim:#d6d0f0;--ink-faint:#b7b0dd;--up-a:#22c55e;--up-b:#a3e635;--down-a:#fb7185;--down-b:#dc2626}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--void);color:var(--ink)}
body{width:1000px;font-family:'IBM Plex Sans',Arial,sans-serif;background:radial-gradient(60rem 34rem at 82% -8%,rgba(139,92,246,.30),transparent 60%),radial-gradient(50rem 30rem at -10% 10%,rgba(34,211,238,.16),transparent 55%),var(--void);-webkit-font-smoothing:antialiased;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{padding:0 0 40px}.num{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.hero{position:relative;padding:40px 44px 28px;overflow:hidden;border-bottom:1px solid var(--hair)}
.hero::before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(139,92,246,.22),rgba(34,211,238,.10) 45%,transparent 75%)}
.logo-mark{position:absolute;right:-30px;top:-26px;width:250px;opacity:.11}
.eyebrow{position:relative;display:flex;align-items:center;gap:10px;font:700 13.5px/1 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin:0 0 16px}
.eyebrow .dot{width:6px;height:6px;border-radius:50%;background:var(--gold);box-shadow:0 0 8px var(--gold)}
h1{position:relative;font-family:'Unbounded',sans-serif;font-weight:800;font-size:44px;line-height:1.04;margin:0 0 10px;background:linear-gradient(100deg,#fff 10%,var(--cyan) 60%,var(--violet) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero-sub{position:relative;color:var(--ink-dim);font-size:15.5px;margin:0}.hero-sub b{color:var(--ink)}
section{padding:30px 44px 6px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.card{background:var(--panel);border:1px solid var(--hair);border-radius:18px;padding:20px 20px 16px;display:flex;flex-direction:column;gap:12px;break-inside:avoid}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.card-symbol{font-family:'Unbounded',sans-serif;font-weight:700;font-size:19px;display:flex;align-items:center;gap:8px}
.flag-badge{font:700 10.5px/1 'IBM Plex Mono',monospace;padding:4px 8px;border-radius:6px;background:linear-gradient(100deg,var(--violet),var(--cyan));color:#0b0a17}
.chg-badge{display:flex;align-items:center;gap:5px;font:700 16px/1 'IBM Plex Mono',monospace;padding:6px 12px;border-radius:10px;color:#fff}
.chg-badge.up{background:linear-gradient(100deg,var(--up-a),var(--up-b))}.chg-badge.down{background:linear-gradient(100deg,var(--down-b),var(--down-a))}
.arrow{font-size:12px}.price-row{display:flex;align-items:center;gap:12px}.price-block{display:flex;flex-direction:column;gap:3px;flex:1}
.price-label{font:600 10px/1 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint)}
.price-val{font-size:18px;font-weight:600}.hl-up{color:#8ff0b0}.hl-down{color:#ffb0bd}.price-arrow{color:var(--ink-faint);font-size:18px;padding-top:14px}
.catalyst{margin:0;font-size:12.5px;line-height:1.5;color:var(--ink-dim);font-style:italic;border-top:1px solid var(--hair);padding-top:10px}
.empty-state{text-align:center;padding:60px 20px 70px}.empty-icon{font-size:44px;margin-bottom:14px;opacity:.7}
.empty-title{font-family:'Unbounded',sans-serif;font-weight:700;font-size:22px;margin-bottom:10px;color:var(--cyan)}
.empty-text{color:var(--ink-dim);font-size:14.5px;max-width:560px;margin:0 auto;line-height:1.55}
footer{margin:30px 44px 0;padding-top:18px;border-top:1px solid var(--hair);display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
.foot-firm{font-family:'Unbounded',sans-serif;font-weight:700;font-size:14px;color:var(--gold)}.foot-addr{font-size:12px;color:var(--ink-faint);margin-top:4px}
.disclaimer{max-width:480px;font-size:10.5px;line-height:1.5;color:var(--ink-faint)}
"""


def build_html(cfg):
    stocks = cfg.get("stocks", [])
    if cfg.get("not_published"):
        body = f'<div class="empty-state"><div class="empty-icon">&#9203;</div><div class="empty-title">CAS Data Not Yet Published</div><p class="empty-text">{esc(cfg["not_published"])}</p></div>'
    elif not stocks:
        body = f'<div class="empty-state"><div class="empty-icon">&#128202;</div><div class="empty-title">No Qualifying Moves Today</div><p class="empty-text">No F&amp;O stock closed &plusmn;{esc(cfg.get("threshold", "1"))}% or more from its 3:15 PM reference price at today\'s auction close.</p></div>'
    else:
        body = '<div class="grid">' + "".join(stock_card(s) for s in stocks) + "</div>"
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{esc(cfg.get("title", "Closing Auction Divergence"))}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800;900&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>{CSS}</style></head><body><div class="wrap">
<div class="hero"><img class="logo-mark" src="data:image/png;base64,{logo_b64()}" alt="">
<p class="eyebrow"><span class="dot"></span>Joshi's Corner &middot; Closing Session</p><h1>Closing Auction Divergence</h1><p class="hero-sub">{cfg["subline"]}</p></div>
<section>{body}</section>
<footer><div><div class="foot-firm">JOSHI'S CORNER</div><div class="foot-addr">9/25C, Bijoygarh Colony, Jadavpur, Kolkata-32 &middot; Tel: 9477030987</div></div>
<p class="disclaimer">For informational purposes only; not investment advice. Data sourced from NSE's published Closing Auction Session report.</p></footer>
</div></body></html>"""


def render(cfg, png_path, pdf_path=None):
    html_path = png_path + ".render.html"
    with open(html_path, "w") as f:
        f.write(build_html(cfg))
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1000, "height": 400})
        page.goto("file://" + os.path.abspath(html_path))
        page.wait_for_timeout(400)
        page.screenshot(path=png_path, full_page=True)
        if pdf_path:
            h = page.evaluate("document.documentElement.scrollHeight")
            page.pdf(path=pdf_path, width="1000px", height=f"{h + 2}px", print_background=True,
                     margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
        browser.close()
    os.remove(html_path)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--pdf")
    a = ap.parse_args()
    with open(a.config) as f:
        render(json.load(f), a.output, a.pdf)
    print("Wrote", a.output, a.pdf or "")
