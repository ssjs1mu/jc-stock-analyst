#!/usr/bin/env python3
"""HTML -> PDF renderer for Joshi's Corner gold-letterhead reports.

Usage: python3 render_pdf.py --config report.json --output report.pdf

Config schema: report_title, report_subtitle, report_date, report_time,
generated_line, as_of_note, disclaimer, sections: [{heading, style?, blocks:
[{type: table|paragraph|bullets|note|spacer, ...}]}].
A table block takes headers, rows, align, col_widths and trend (true adds a
Bullish/Bearish column derived from the sign of the last column). A section
with "style": "framed" renders inside the approved double gold-border frame
(used for "Today's Bias in Brief").

Design notes (approved after several revisions -- do not regress): header is a
<thead> so it repeats on every page without overlap; footer bar is
position:fixed; page numbers come from the CSS @page bottom-right box.
"""
import argparse
import base64
import json
import os
import re
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brand

HERE = os.path.dirname(os.path.abspath(__file__))
BRANDING = os.path.join(HERE, "branding")

GOLD = "#C7A03C"
GOLD_LIGHT = "#E4C97A"
GOLD_DARK = "#8A6D1F"
FRAME_GOLD = "#D4AF37"
FRAME_BG = "#FDF8EA"
INK = "#232323"
BODY_GRAY = "#3A3A3A"
UP_GREEN = "#1E7A34"
DOWN_RED = "#B02A2A"
MOODS = {
    "bull":    dict(head="#1B6B34", rule="#2E9C52", bg="#F1FAF3", frame="#2E9C52", stripbg="#0F3D1F", stripfg="#9CF0B6", th="#1B6B34", stripe="rgba(233,246,237,0.95)"),
    "bear":    dict(head="#9B2230", rule="#C8404F", bg="#FDF2F3", frame="#C8404F", stripbg="#4A0F18", stripfg="#FFB3BB", th="#9B2230", stripe="rgba(252,236,238,0.95)"),
    "neutral": dict(head="#244F8F", rule="#3C7BD0", bg="#F1F5FC", frame="#3C7BD0", stripbg="#122A4F", stripfg="#A9C9FF", th="#244F8F", stripe="rgba(234,241,252,0.95)"),
}
FOOTER_ADDR = "9/25C, Bijoygarh Colony, Jadavpur, Kolkata-32, Tel: 9477030987"

BAR_HEIGHT_MM = 30
BAR_INSET_MM = 3
BANNER_HEIGHT_MM = BAR_HEIGHT_MM - 2 * BAR_INSET_MM
LOGO_HEIGHT_MM = 44
LOGO_WIDTH_MM = LOGO_HEIGHT_MM * 797 / 811
LOGO_LEFT_MM = 8
TITLE_ZONE_LEFT_MM = LOGO_LEFT_MM + LOGO_WIDTH_MM + 6
FOOTER_HEIGHT_MM = 11
PAGE_NUM_BOX_MM = 7


def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


def esc(s):
    if s is None:
        return ""
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _trend_cell(value):
    if value is None:
        return ""
    s = str(value).strip()
    negative = s.startswith("-")
    positive = s.startswith("+") or (not negative and re.search(r"[1-9]", s or ""))
    if negative:
        return f'<span style="color:{DOWN_RED}; font-weight:700;">&#9660; Bearish</span>'
    if positive:
        return f'<span style="color:{UP_GREEN}; font-weight:700;">&#9650; Bullish</span>'
    return '<span style="color:#888;">&#8212; Flat</span>'


def render_table(block):
    headers = list(block.get("headers", []))
    rows = [list(r) for r in block.get("rows", [])]
    align = block.get("align")
    widths = list(block.get("col_widths", []))
    add_trend = block.get("trend", False)

    if add_trend and headers:
        headers.append("Trend")
        if widths:
            widths = [w * 0.82 for w in widths]
            widths.append(1 - sum(widths))
        for r in rows:
            r.append(_trend_cell(r[-1] if r else ""))

    colgroup = ""
    if widths:
        colgroup = "<colgroup>" + "".join(f'<col style="width:{w*100:.2f}%">' for w in widths) + "</colgroup>"

    def cell_align(i):
        if align and i < len(align):
            return align[i]
        return "left" if i == 0 else "right"

    thead = ""
    if headers:
        ths = "".join(f'<th style="text-align:{cell_align(i)}">{esc(h)}</th>' for i, h in enumerate(headers))
        thead = f"<thead><tr>{ths}</tr></thead>"

    trs = []
    for r in rows:
        tds = []
        for i, c in enumerate(r):
            content = c if (add_trend and i == len(r) - 1) else esc(c)
            tds.append(f'<td style="text-align:{cell_align(i)}">{content}</td>')
        trs.append(f"<tr>{''.join(tds)}</tr>")
    return f'<table class="rpt-table">{colgroup}{thead}<tbody>{"".join(trs)}</tbody></table>'


def render_block(block):
    t = block.get("type")
    if t == "table":
        return render_table(block)
    if t == "pair":
        return '<div class="pair"><div>%s</div><div>%s</div></div>' % (render_block(block["left"]), render_block(block["right"]))
    if t == "paragraph":
        return f'<p class="body-p {esc(block.get("class", ""))}">{esc(block["text"])}</p>'
    if t == "bullets":
        items = "".join(f"<li>{esc(it)}</li>" for it in block.get("items", []))
        return f'<ul class="body-bullets">{items}</ul>'
    if t == "note":
        return f'<p class="as-of-note">{esc(block["text"])}</p>'
    if t == "spacer":
        return f'<div style="height:{block.get("height", 8)}px"></div>'
    return ""


def build_html(config):
    tree_logo_b64 = b64(os.path.join(BRANDING, "tree_logo.png"))
    tree_logo_transparent_b64 = b64(os.path.join(BRANDING, "tree_logo_transparent.png"))
    mk = (config.get("mood") or {}).get("key", "")
    M = MOODS.get(mk)
    scale = float(config.get("_scale", 1.0))

    report_title = esc(config.get("report_title", "Report"))
    report_subtitle = esc(config.get("report_subtitle", ""))
    report_date = esc(config.get("report_date", ""))
    report_time = esc(config.get("report_time", ""))
    generated_line = esc(config.get("generated_line", ""))
    as_of_note = config.get("as_of_note")

    sections_html = []
    for section in config.get("sections", []):
        heading = esc(section["heading"])
        blocks_html = "".join(render_block(b) for b in section.get("blocks", []))
        if section.get("style") == "framed":
            sections_html.append(
                f'''<section class="rpt-section framed-section">
                    <div class="bias-frame-outer"><div class="bias-frame-inner">
                      <h2 class="bias-frame-heading">{heading}</h2>{blocks_html}
                    </div></div></section>''')
        else:
            sections_html.append(
                f'''<section class="rpt-section"><h2 class="section-head">{heading}</h2>
                    <div class="gold-rule"></div>{blocks_html}</section>''')

    disclaimer = esc(brand.SHORT_DISCLAIMER)
    as_of_html = ""   # standing rule: never disclose data sources in a report
    mood_html = ""
    if M:
        mood_html = '<div class="mood-strip"><b>%s</b><span>%s</span></div>' % (esc(config["mood"].get("label", "")), esc(config["mood"].get("sub", "")))
    subtitle_html = f'<p class="report-subtitle">{report_subtitle}</p>' if report_subtitle else ""
    generated_html = f'<p class="report-generated">{generated_line}</p>' if generated_line else ""
    sep = " &nbsp;|&nbsp; " if report_date and report_time else ""

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{report_title}</title>
<style>
  @page {{ size: A4; margin: 0 0 {PAGE_NUM_BOX_MM}mm 0;
    @bottom-right {{ content: "Page " counter(page) " / " counter(pages); font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 9pt; color: {GOLD_LIGHT}; padding: 0 8mm 2mm 0; }} }}
  :root {{ --head: {M['head'] if M else GOLD_DARK}; --rule: {M['rule'] if M else GOLD}; --sbg: {M['stripbg'] if M else '#111'}; --sfg: {M['stripfg'] if M else GOLD_LIGHT}; --fbg: {M['bg'] if M else FRAME_BG}; --frame: {M['frame'] if M else FRAME_GOLD}; --stripe: {M['stripe'] if M else 'rgba(251,248,239,0.94)'}; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; font-family: 'DejaVu Serif', Georgia, 'Times New Roman', serif; color: {INK}; background: #ffffff; }}
  .doc-table {{ width: 100%; border-collapse: collapse; }}
  .doc-table > thead > tr > td {{ padding: 0; }}
  .header-wrap {{ position: relative; height: {LOGO_HEIGHT_MM}mm; }}
  .header-bar {{ position: absolute; top: 0; left: 0; right: 0; height: {BAR_HEIGHT_MM}mm; background: #0a0a0a; z-index: 5; }}
  {brand.font_css()}
  .header-brand {{ position: absolute; top: 0; left: {TITLE_ZONE_LEFT_MM}mm; right: 8mm; height: {BAR_HEIGHT_MM}mm; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; z-index: 10; }}
  .header-brand .bn {{ font-family: {brand.SCRIPT_STACK}; font-weight: 700; font-size: 36pt; line-height: 1.05; color: #E2B84A; text-shadow: 0 0 1px #F6DC8A; }}
  .header-brand .tg {{ font-family: 'DejaVu Sans', Arial, sans-serif; margin-top: 1mm; text-align: right; }}
  .mood-strip {{ display: flex; justify-content: space-between; align-items: center; gap: 6mm; background: var(--sbg); color: var(--sfg); border-left: 2.2mm solid var(--rule); padding: 2.2mm 4mm; margin: 0 0 3mm 0; font-family: 'DejaVu Sans', Arial, sans-serif; }}
  .mood-strip b {{ font-size: 11pt; letter-spacing: 0.8px; text-transform: uppercase; }}
  .mood-strip span {{ font-size: 8.8pt; opacity: .92; text-align: right; }}
  .fit {{ zoom: {scale}; }}
  .pair {{ display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }}
  .pair table.rpt-table {{ font-size: 8.4pt; }}
  .header-logo {{ position: absolute; top: 0; left: {LOGO_LEFT_MM}mm; height: {LOGO_HEIGHT_MM}mm; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5)); z-index: 11; }}
  .header-title-zone {{ position: absolute; top: {BAR_HEIGHT_MM}mm; bottom: 0; left: {TITLE_ZONE_LEFT_MM}mm; right: 8mm; display: flex; align-items: flex-end; justify-content: flex-end; z-index: 3; }}
  .report-title {{ font-size: 20pt; font-weight: 700; background: linear-gradient(180deg, {GOLD_LIGHT}, {GOLD_DARK}); -webkit-background-clip: text; background-clip: text; color: {GOLD_DARK}; -webkit-text-fill-color: transparent; margin: 0 0 1.5mm 0; line-height: 1.15; text-align: right; }}
  .header-gold-rule {{ position: absolute; left: 0; right: 0; bottom: 0; height: 1.6px; background: {GOLD}; }}
  .watermark {{ position: fixed; top: 56%; left: 50%; width: 145mm; transform: translate(-50%, -50%); opacity: 0.24; z-index: 0; }}
  .letterhead-footer {{ position: fixed; bottom: 0; left: 0; right: 0; height: {FOOTER_HEIGHT_MM}mm; background: #0a0a0a; color: #ffffff; display: flex; align-items: center; padding: 0 8mm; font-size: 8.2pt; font-family: 'DejaVu Sans', Arial, sans-serif; border-top: 1.5px solid {GOLD}; z-index: 10; }}
  .letterhead-footer .addr {{ font-weight: 700; letter-spacing: 0.2px; }}
  .doc-table > tbody > tr > td {{ position: relative; z-index: 1; padding: 4mm 12mm {FOOTER_HEIGHT_MM + 5}mm 12mm; }}
  .meta-block {{ text-align: right; margin-bottom: 3mm; }}
  .report-subtitle {{ font-size: 11pt; color: #6b6b6b; font-style: italic; margin: 0 0 1mm 0; }}
  .report-datetime {{ font-size: 9.5pt; color: #555; margin: 0 0 1mm 0; }}
  .report-generated {{ font-size: 9pt; color: {GOLD_DARK}; font-style: italic; margin: 0; }}
  .as-of-note {{ font-size: 8.8pt; color: #777; font-style: italic; text-align: justify; margin: 2mm 0 4mm 0; line-height: 1.35; }}
  .rpt-section {{ margin-top: 3.2mm; break-inside: avoid-page; }}
  .section-head {{ font-size: 12.5pt; color: var(--head); margin: 0 0 1mm 0; letter-spacing: 0.3px; }}
  .bias-frame-outer {{ border: 1.1pt solid var(--frame); padding: 1.3mm; }}
  .bias-frame-inner {{ border: 1.1pt solid var(--frame); background: var(--fbg); padding: 4mm 6mm 5mm 6mm; }}
  .bias-frame-heading {{ text-align: center; text-transform: uppercase; font-size: 12pt; font-weight: 700; letter-spacing: 0.8px; color: var(--head); margin: 0 0 2.5mm 0; }}
  .bias-frame-inner .body-p {{ margin: 0; }}
  .gold-rule {{ height: 1.4px; background: linear-gradient(90deg, var(--rule), rgba(150,150,150,0.12)); margin-bottom: 2mm; }}
  .body-p {{ font-size: 9.6pt; line-height: 1.38; text-align: justify; color: {BODY_GRAY}; margin: 1mm 0 2mm 0; }}
  .body-bullets {{ margin: 1mm 0 2mm 0; padding-left: 5mm; font-size: 9.4pt; line-height: 1.32; color: {BODY_GRAY}; }}
  .body-bullets li {{ margin-bottom: 0.5mm; text-align: justify; }}
  table.rpt-table {{ width: 100%; border-collapse: collapse; margin: 1mm 0 3mm 0; font-size: 8.8pt; background: rgba(255,255,255,0.92); }}
  table.rpt-table thead th {{ border-bottom: 1.3px solid var(--rule); color: var(--head); font-weight: 700; padding: 1.1mm 1.6mm; text-align: right; }}
  table.rpt-table tbody td {{ padding: 0.9mm 1.6mm; border-bottom: 0.5px solid #e2e2e2; }}
  table.rpt-table tbody tr:nth-child(even) {{ background: var(--stripe); }}
  .disclaimer {{ margin-top: 4mm; padding-top: 1.5mm; border-top: 1px solid var(--rule); font-size: 8pt; color: #666; font-style: italic; text-align: center; }}
</style></head>
<body>
  <img class="watermark" src="data:image/png;base64,{tree_logo_transparent_b64}">
  <div class="letterhead-footer"><span class="addr">{esc(FOOTER_ADDR)}</span></div>
  <table class="doc-table">
    <thead><tr><td>
      <div class="header-wrap">
        <div class="header-bar"></div>
        <div class="header-brand"><div class="bn">{esc(brand.BRAND)}</div><div class="tg">{brand.tagline_html(7, 2)}</div></div>
        <img class="header-logo" src="data:image/png;base64,{tree_logo_b64}">
        <div class="header-title-zone"><p class="report-title">{report_title}</p></div>
        <div class="header-gold-rule"></div>
      </div>
    </td></tr></thead>
    <tbody><tr><td>
      <div class="fit">{mood_html}
      <div class="meta-block">{subtitle_html}<p class="report-datetime">{report_date}{sep}{report_time}</p>{generated_html}</div>
      {as_of_html}
      {''.join(sections_html)}
      <p class="disclaimer">{disclaimer}</p></div>
    </td></tr></tbody>
  </table>
</body></html>"""


def _pages(path):
    from pypdf import PdfReader
    return len(PdfReader(path).pages)


def render_pdf(config, output_path, one_page=True):
    """Standing rule: fit on ONE page by shrinking fonts/tables step by step (floor 0.62)."""
    from playwright.sync_api import sync_playwright
    html_path = output_path + ".render.html"
    scales = [1.0, 0.95, 0.9, 0.85, 0.8, 0.76, 0.72, 0.68] if one_page else [1.0]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for sc in scales:
            cfg = dict(config, _scale=sc)
            with open(html_path, "w") as f:
                f.write(build_html(cfg))
            page = browser.new_page()
            page.goto("file://" + os.path.abspath(html_path))
            page.pdf(path=output_path, format="A4", print_background=True)
            page.close()
            if _pages(output_path) <= 1:
                break
        else:   # genuinely too long for one readable page: keep it legible over 2 pages
            cfg = dict(config, _scale=0.88)
            with open(html_path, "w") as f:
                f.write(build_html(cfg))
            page = browser.new_page()
            page.goto("file://" + os.path.abspath(html_path))
            page.pdf(path=output_path, format="A4", print_background=True)
            page.close()
            sc = 0.88
        browser.close()
    os.remove(html_path)
    print("pdf scale", sc, "pages", _pages(output_path), file=sys.stderr)
    return output_path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    with open(args.config) as f:
        cfg = json.load(f)
    print("Wrote", render_pdf(cfg, args.output))
