#!/usr/bin/env python3
"""Renders the JCGG 'Morning Pulse' vibrant-gradient infographic as a PDF.

Usage: python3 render_infographic_pdf.py --config infographic.json --output out.pdf

Dark fintech-terminal design (Unbounded / IBM Plex Sans / IBM Plex Mono),
violet-cyan hero gradient, green/red diverging bars, real-position range bars.
Design rules tuned after client feedback -- do not regress: compact spacing
(fits 2 pages, not 4), bright --ink-dim/--ink-faint (#d6d0f0 / #b7b0dd),
glossy 3D cards with sentiment-tinted borders and glows, icon badges per
section, coloured left edges on alert cards.

Config: title, eyebrow (plain), headline, subline (raw HTML), mood {tag, text(HTML)},
hero {label, value, chip(HTML), dir up|down}, tile_groups [{heading, cols, scale_max,
note, items [{name, sub, level, chg(float)}]}], levels [{name, cur_label, cur_value
(float|null), low, high, low_label, high_label, caption?}], alerts [{tag, tag_class
geo|data|deriv|earnings, text(HTML)}], firm_address?, disclaimer?
"""
import argparse
import base64
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BRANDING = os.path.join(HERE, "branding")


def logo_b64(width=300):
    from PIL import Image
    im = Image.open(os.path.join(BRANDING, "tree_logo_transparent.png"))
    w, h = im.size
    im = im.resize((width, int(width * h / w)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def esc(s):
    if s is None:
        return ""
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


ICONS = {
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
    "drop": '<path d="M12 3c4 5 7 8.6 7 12a7 7 0 1 1-14 0c0-3.4 3-7 7-12z"/>',
    "gauge": '<path d="M4 15a8 8 0 0 1 16 0"/><path d="M12 15l4.5-5"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/>',
    "target": '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    "bell": '<path d="M6 16v-4.5A6 6 0 0 1 18 11.5V16l1.6 2.4H4.4L6 16z"/><path d="M10 19.5a2 2 0 0 0 4 0"/>',
}


def sec_icon(heading):
    h = heading.lower()
    key = "globe"
    if "commodit" in h or "gift" in h:
        key = "drop"
    elif "vix" in h or "inr" in h:
        key = "gauge"
    elif "level" in h:
        key = "target"
    elif "alert" in h:
        key = "bell"
    return ('<span class="sec-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICONS[key]}</svg></span>')


def tile_html(item, scale_max):
    chg = float(item["chg"])
    d = "up" if chg >= 0 else "down"
    arrow = "&#9650;" if chg >= 0 else "&#9660;"
    pct = min(abs(chg) / scale_max, 1) * 50
    sign = "+" if chg > 0 else ""
    return f'''<div class="tile tile-{d}">
      <div class="tile-top"><div class="tile-name">{esc(item["name"])}<br><span class="tile-sub">{esc(item.get("sub", ""))}</span></div>
      <div class="tile-level num">{esc(item["level"])}</div></div>
      <div class="bar-track"><div class="bar-mid"></div><div class="bar-fill {d}" style="width:{pct}%"></div></div>
      <div class="tile-chg {d}"><span class="arrow">{arrow}</span><span class="chg-val num">{sign}{chg:.2f}%</span></div>
    </div>'''


def group_html(g):
    grid = "grid3" if g.get("cols", 3) == 3 else "grid2"
    tiles = "".join(tile_html(it, g["scale_max"]) for it in g["items"])
    note = f'<p class="sec-note">{esc(g["note"])}</p>' if g.get("note") else ""
    return f'''<section><div class="sec-head">{sec_icon(g["heading"])}<h2>{esc(g["heading"])}</h2><div class="rule"></div></div>
      <div class="{grid}">{tiles}</div>{note}</section>'''


def level_html(lv):
    marker = ""
    if lv.get("cur_value") is not None:
        pct = max(0, min(1, (lv["cur_value"] - lv["low"]) / (lv["high"] - lv["low"]))) * 100
        marker = f'<div class="level-marker" style="left:{pct:.2f}%"></div>'
    cap = f'<p class="level-caption">{esc(lv["caption"])}</p>' if lv.get("caption") else ""
    return f'''<div class="level-row">
      <div class="level-top"><span class="level-name">{esc(lv["name"])}</span><span class="level-cur num">{esc(lv.get("cur_label", ""))}</span></div>
      <div class="level-track">{marker}</div>
      <div class="level-labels"><span class="lo">{esc(lv["low_label"])}</span><span class="hi">{esc(lv["high_label"])}</span></div>{cap}
    </div>'''


def alert_html(a):
    tc = esc(a.get("tag_class", "data"))
    return f'<div class="alert alert-edge-{tc}"><span class="alert-tag tag-{tc}">{esc(a["tag"])}</span><p>{a["text"]}</p></div>'


CSS = """
:root{--void:#0b0a17;--panel:#15132a;--panel-2:#1d1a38;--hair:rgba(139,92,246,.28);--violet:#8b5cf6;--cyan:#22d3ee;--gold:#e8b54d;
--ink:#f4f2ff;--ink-dim:#d6d0f0;--ink-faint:#b7b0dd;--up-a:#22c55e;--up-b:#a3e635;--down-a:#fb7185;--down-b:#dc2626;}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--void);color:var(--ink)}
body{font-family:'IBM Plex Sans',Arial,sans-serif;background:radial-gradient(60rem 34rem at 82% -8%,rgba(139,92,246,.28),transparent 60%),radial-gradient(50rem 30rem at -10% 10%,rgba(34,211,238,.14),transparent 55%),var(--void);-webkit-font-smoothing:antialiased}
.wrap{max-width:960px;margin:0 auto;padding:0 0 18px}.num{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.hero{position:relative;padding:24px 28px 16px;overflow:hidden;border-bottom:1px solid var(--hair)}
.hero::before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(139,92,246,.20),rgba(34,211,238,.10) 45%,transparent 75%);pointer-events:none}
.logo-mark{position:absolute;right:-40px;top:-30px;width:280px;opacity:.10;filter:saturate(1.4);pointer-events:none}
.eyebrow{position:relative;z-index:1;display:flex;align-items:center;gap:10px;font:700 13.5px/1 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin:0 0 10px}
.eyebrow .dot{width:6px;height:6px;border-radius:50%;background:var(--gold);box-shadow:0 0 8px var(--gold)}
h1{position:relative;z-index:1;font-family:'Unbounded',sans-serif;font-weight:800;font-size:44px;line-height:1.02;margin:0 0 4px;background:linear-gradient(100deg,#fff 10%,var(--cyan) 60%,var(--violet) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero-sub{position:relative;z-index:1;color:var(--ink-dim);font-size:15px;margin:0 0 14px}.hero-sub b{color:var(--ink);font-weight:600}
.hero-grid{position:relative;z-index:1;display:grid;grid-template-columns:1.1fr 1fr;gap:12px}
.mood-card{position:relative;overflow:hidden;border-radius:18px;padding:14px 18px;background:linear-gradient(160deg,rgba(251,113,133,.26),rgba(220,38,38,.08) 60%,#100e22 130%);border:1px solid rgba(251,113,133,.45);display:flex;flex-direction:column;gap:6px;justify-content:center;box-shadow:0 14px 28px -14px rgba(220,38,38,.45),inset 0 1px 0 rgba(255,255,255,.12)}
.mood-card::before,.stat-card::before,.tile::before,.level-row::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 48%);pointer-events:none}
.mood-card.up{background:linear-gradient(160deg,rgba(34,197,94,.26),rgba(163,230,53,.08) 60%,#100e22 130%);border-color:rgba(34,197,94,.45);box-shadow:0 14px 28px -14px rgba(34,197,94,.45),inset 0 1px 0 rgba(255,255,255,.12)}
.mood-pill{position:relative;z-index:1;align-self:flex-start;font:800 13px/1 'Unbounded',sans-serif;letter-spacing:.04em;padding:6px 12px;border-radius:999px;color:#fff;background:linear-gradient(100deg,var(--down-a),var(--down-b));box-shadow:0 6px 20px -6px rgba(220,38,38,.6),inset 0 1px 0 rgba(255,255,255,.35)}
.mood-card.up .mood-pill{background:linear-gradient(100deg,var(--up-a),var(--up-b));box-shadow:0 6px 20px -6px rgba(34,197,94,.6),inset 0 1px 0 rgba(255,255,255,.35)}
.mood-text{position:relative;z-index:1;font-size:14px;color:var(--ink-dim);line-height:1.45;margin:0}.mood-text b{color:var(--ink)}
.stat-card{position:relative;overflow:hidden;border-radius:18px;padding:14px 18px;background:linear-gradient(160deg,var(--panel-2),var(--panel) 60%,#100e22 130%);border:1px solid rgba(139,92,246,.4);display:flex;flex-direction:column;gap:4px;justify-content:center;box-shadow:0 14px 28px -16px rgba(139,92,246,.5),inset 0 1px 0 rgba(255,255,255,.10)}
.stat-label{position:relative;z-index:1;font:700 12px/1 'IBM Plex Mono',monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}
.stat-value{position:relative;z-index:1;font-size:34px;font-weight:600}
.stat-chip{position:relative;z-index:1;align-self:flex-start;font:700 13.5px/1 'IBM Plex Mono',monospace;padding:4px 9px;border-radius:8px;color:#fff;background:linear-gradient(100deg,var(--down-a),var(--down-b))}
.stat-chip.up{background:linear-gradient(100deg,var(--up-a),var(--up-b))}
section{padding:16px 28px 4px}.sec-head{display:flex;align-items:center;gap:10px;margin:0 0 10px}
.sec-head h2{font-family:'Unbounded',sans-serif;font-weight:700;font-size:17px;margin:0;color:var(--ink)}
.sec-head .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--hair),transparent)}
.sec-icon{flex:0 0 auto;width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(139,92,246,.35),rgba(34,211,238,.25));color:var(--cyan);box-shadow:0 0 0 1px var(--hair) inset}
.sec-icon svg{width:15px;height:15px}.sec-note{font-size:13px;color:var(--ink-dim);line-height:1.5;margin:10px 0 0}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.tile{position:relative;overflow:hidden;background:linear-gradient(160deg,var(--panel-2) 0%,var(--panel) 55%,#100e22 130%);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:11px 12px 10px;display:flex;flex-direction:column;gap:6px;box-shadow:0 10px 22px -14px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.08)}
.tile-up{background:linear-gradient(160deg,rgba(34,197,94,.22) 0%,var(--panel) 55%,#100e22 130%);border-color:rgba(34,197,94,.4);box-shadow:0 10px 24px -14px rgba(34,197,94,.5),inset 0 1px 0 rgba(255,255,255,.10)}
.tile-down{background:linear-gradient(160deg,rgba(251,113,133,.22) 0%,var(--panel) 55%,#100e22 130%);border-color:rgba(251,113,133,.4);box-shadow:0 10px 24px -14px rgba(251,113,133,.5),inset 0 1px 0 rgba(255,255,255,.10)}
.tile-top{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.tile-name{font-size:12.5px;color:var(--ink-dim);font-weight:600;line-height:1.3}.tile-sub{color:var(--ink-faint);font-size:11px}
.tile-level{font-size:17px;font-weight:700;white-space:nowrap}.tile-chg{position:relative;z-index:1;display:flex;align-items:center;gap:6px}
.arrow{font-size:13px;line-height:1}.chg-val{font:700 14px 'IBM Plex Mono',monospace}
.up .chg-val,.up .arrow{color:#7bffb0}.down .chg-val,.down .arrow{color:#ffa2b4}
.bar-track{position:relative;z-index:1;height:6px;border-radius:5px;background:var(--panel-2);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.5)}
.bar-fill{position:absolute;top:0;bottom:0;border-radius:5px}
.bar-fill.up{left:50%;background:linear-gradient(90deg,var(--up-a),var(--up-b));box-shadow:0 0 8px rgba(163,230,53,.8)}
.bar-fill.down{right:50%;background:linear-gradient(90deg,var(--down-b),var(--down-a));box-shadow:0 0 8px rgba(251,113,133,.8)}
.bar-mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--ink-faint);opacity:.5}
.level-row{position:relative;overflow:hidden;background:linear-gradient(160deg,var(--panel-2) 0%,var(--panel) 55%,#100e22 130%);border:1px solid rgba(139,92,246,.35);border-radius:14px;padding:11px 16px;margin-bottom:8px;box-shadow:0 12px 24px -16px rgba(139,92,246,.4),inset 0 1px 0 rgba(255,255,255,.08)}
.level-top{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
.level-name{font-family:'Unbounded',sans-serif;font-weight:700;font-size:15px}.level-cur{font:700 14px 'IBM Plex Mono',monospace;color:var(--ink-dim)}
.level-track{position:relative;z-index:1;height:9px;border-radius:6px;background:linear-gradient(90deg,var(--cyan),var(--violet));box-shadow:inset 0 1px 2px rgba(0,0,0,.35),0 0 10px rgba(139,92,246,.35)}
.level-marker{position:absolute;top:-3px;width:3px;height:15px;background:#fff;border-radius:2px;box-shadow:0 0 10px rgba(255,255,255,.9),0 0 3px #fff}
.level-labels{position:relative;z-index:1;display:flex;justify-content:space-between;margin-top:6px;font:600 12.5px 'IBM Plex Mono',monospace;color:var(--ink-dim)}
.level-labels .lo{color:var(--cyan)}.level-labels .hi{color:var(--violet)}.level-caption{position:relative;z-index:1;margin-top:7px;font-size:12px;color:var(--ink-faint)}
.alerts{display:flex;flex-direction:column;gap:7px}
.alert{position:relative;overflow:hidden;display:flex;gap:12px;align-items:flex-start;background:linear-gradient(160deg,var(--panel-2) 0%,var(--panel) 60%,#100e22 130%);border:1px solid var(--hair);border-left:4px solid var(--hair);border-radius:12px;padding:10px 14px;box-shadow:0 8px 18px -12px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.07)}
.alert-edge-geo{border-left-color:#f87171}.alert-edge-data{border-left-color:#22d3ee}.alert-edge-deriv{border-left-color:#8b5cf6}.alert-edge-earnings{border-left-color:#fbbf24}
.alert-tag{flex:0 0 auto;font:700 11.5px/1 'IBM Plex Mono',monospace;letter-spacing:.08em;padding:6px 9px;border-radius:8px;color:var(--void);text-transform:uppercase;white-space:nowrap}
.tag-geo{background:linear-gradient(100deg,#fca5a5,#f87171)}.tag-data{background:linear-gradient(100deg,#67e8f9,#22d3ee)}
.tag-deriv{background:linear-gradient(100deg,#c4b5fd,#8b5cf6)}.tag-earnings{background:linear-gradient(100deg,#fde68a,#fbbf24)}
.alert p{margin:0;font-size:13.5px;line-height:1.45;color:var(--ink-dim)}.alert p b{color:var(--ink);font-weight:600}
footer{margin:18px 28px 0;padding-top:12px;border-top:1px solid var(--hair);display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
.foot-firm{font-family:'Unbounded',sans-serif;font-weight:700;font-size:14px;color:var(--gold)}.foot-addr{font-size:12px;color:var(--ink-faint);margin-top:3px}
.disclaimer{max-width:520px;font-size:11px;line-height:1.5;color:var(--ink-faint)}
@media print{@page{size:A4;margin:0}body{background:var(--void)!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hero,.tile,.stat-card,.mood-card,.level-row,.alert,footer{break-inside:avoid}section{break-inside:avoid-page}.wrap{max-width:100%}}
"""


def build_html(cfg):
    hero_dir = "up" if cfg["hero"]["dir"] == "up" else "down"
    groups = "".join(group_html(g) for g in cfg["tile_groups"])
    levels = "".join(level_html(lv) for lv in cfg["levels"])
    alerts = "".join(alert_html(a) for a in cfg["alerts"])
    addr = cfg.get("firm_address", "9/25C, Bijoygarh Colony, Jadavpur, Kolkata-32 · Tel: 9477030987")
    disc = cfg.get("disclaimer", "For informational purposes only; not investment advice. Data sourced from public market reports at time of writing and may not reflect real-time prices - verify with live terminals before trading.")
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{esc(cfg.get("title", "JCGG Morning Pulse"))}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800;900&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>{CSS}</style></head><body><div class="wrap">
  <div class="hero"><img class="logo-mark" src="data:image/png;base64,{logo_b64()}" alt="">
    <p class="eyebrow"><span class="dot"></span>{esc(cfg.get("eyebrow", "Joshi's Corner · Pre-Market"))}</p>
    <h1>{esc(cfg.get("headline", "Morning Pulse"))}</h1><p class="hero-sub">{cfg["subline"]}</p>
    <div class="hero-grid">
      <div class="mood-card {hero_dir}"><span class="mood-pill">{esc(cfg["mood"]["tag"])}</span><p class="mood-text">{cfg["mood"]["text"]}</p></div>
      <div class="stat-card"><span class="stat-label">{esc(cfg["hero"]["label"])}</span><span class="stat-value num">{esc(cfg["hero"]["value"])}</span><span class="stat-chip {hero_dir}">{cfg["hero"]["chip"]}</span></div>
    </div></div>
  {groups}
  <section><div class="sec-head">{sec_icon("Key Levels")}<h2>Key Levels to Watch</h2><div class="rule"></div></div>{levels}</section>
  <section><div class="sec-head">{sec_icon("Alerts")}<h2>Alerts for the Day</h2><div class="rule"></div></div><div class="alerts">{alerts}</div></section>
  <footer><div><div class="foot-firm">JOSHI'S CORNER</div><div class="foot-addr">{esc(addr)}</div></div><p class="disclaimer">{esc(disc)}</p></footer>
</div></body></html>"""


def render_pdf(cfg, output_path):
    html_path = output_path + ".render.html"
    with open(html_path, "w") as f:
        f.write(build_html(cfg))
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.emulate_media(media="print")
        page.goto("file://" + os.path.abspath(html_path))
        page.wait_for_timeout(400)
        page.pdf(path=output_path, format="A4", print_background=True, margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
        browser.close()
    os.remove(html_path)
    return output_path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--output", required=True)
    a = ap.parse_args()
    with open(a.config) as f:
        print("Wrote", render_pdf(json.load(f), a.output))
