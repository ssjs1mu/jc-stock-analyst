"""Brand constants shared by every report renderer (see docs/REPORT_RULES.md)."""
import base64
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND = "Joshi's Corner"
TAGLINE = "Connecting People Thru Services...S.I.R"
SCRIPT_STACK = "'Brush Script MT','Brush Script Std','JC Script','Kaushan Script',cursive"
GOLD_TEXT = "linear-gradient(180deg,#F6DC8A 0%,#E2B84A 55%,#B8892B 100%)"
SHORT_DISCLAIMER = "For information only. Not investment advice. Markets carry risk."


def _b64(p):
    return base64.b64encode(open(p, "rb").read()).decode()


def font_css():
    p = os.path.join(HERE, "branding", "fonts", "KaushanScript-Regular.ttf")
    try:
        return "@font-face{font-family:'JC Script';src:url(data:font/ttf;base64,%s) format('truetype');font-weight:400;font-style:normal}" % _b64(p)
    except Exception:
        return ""


def logo_original():
    """Tree logo exactly as supplied (gold on its own black field)."""
    return "data:image/png;base64," + _b64(os.path.join(HERE, "branding", "tree_logo.png"))


def name_css(cls="brand", size="44px"):
    return (".%s{font-family:%s;font-weight:700;font-size:%s;line-height:1;white-space:nowrap;background:%s;-webkit-background-clip:text;background-clip:text;"
            "color:#E2B84A;-webkit-text-fill-color:transparent;letter-spacing:.5px;text-shadow:none;-webkit-text-stroke:.6px rgba(226,184,74,.55)}" % (cls, SCRIPT_STACK, size, GOLD_TEXT))
