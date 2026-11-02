"""Time-of-day / weather scenes painted over the bull-bear photos so opening and closing reports read differently at a glance.
Opening (morning) = sunrise / cold dawn fog.  Closing (evening) = sunset / moonlit night / storm / snow.
Pure Pillow; any failure returns the untouched photo."""
import io
import random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

W_MAX = 1600


def _glow(size, cx, cy, r, color, alpha, blur=None):
    lay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (alpha,))
    return lay.filter(ImageFilter.GaussianBlur(blur or r * 0.6))


def _vgrad(size, top, bottom, a_top, a_bottom, left_bias=True):
    w, h = size
    g = Image.linear_gradient("L").resize((w, h))              # black top -> white bottom
    ramp = g.point(lambda v: int(a_top + (a_bottom - a_top) * v / 255))
    if left_bias:                                              # keep the animal (right side) cleaner
        hb = Image.linear_gradient("L").rotate(90).resize((w, h)).point(lambda v: int(255 - v * 0.55))  # strong left, weaker right
        ramp = ImageChops.multiply(ramp, hb)
    col = Image.new("RGB", size, bottom)
    col_top = Image.new("RGB", size, top)
    col = Image.composite(col, col_top, g)
    out = col.convert("RGBA")
    out.putalpha(ramp)
    return out


def _stars(size, rnd, n=90, left=0.62):
    lay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    w, h = size
    for _ in range(n):
        x, y = rnd.random() * w * left, rnd.random() * h * 0.55
        r = rnd.choice([1, 1, 1, 2])
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, rnd.randint(110, 230)))
    return lay.filter(ImageFilter.GaussianBlur(0.6))


def _moon(size, cx, cy, r, crescent):
    lay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(238, 242, 250, 255))
    if crescent:
        d.ellipse([cx - r * 0.55, cy - r * 1.05, cx + r * 1.35, cy + r * 0.95], fill=(0, 0, 0, 0))
        lay2 = Image.new("RGBA", size, (0, 0, 0, 0))
        d2 = ImageDraw.Draw(lay2)
        d2.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(238, 242, 250, 255))
        cut = Image.new("L", size, 0)
        ImageDraw.Draw(cut).ellipse([cx - r * 0.45, cy - r * 1.05, cx + r * 1.4, cy + r * 0.95], fill=255)
        lay2.putalpha(ImageChops.subtract(lay2.split()[3], cut))
        lay = lay2
    halo = _glow(size, cx, cy, r * 2.6, (190, 210, 255), 90)
    return Image.alpha_composite(halo, lay)


def _streaks(size, rnd, n, length, slant, alpha, color=(190, 205, 235), left=0.75):
    lay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    w, h = size
    for _ in range(n):
        x, y = rnd.random() * w * left, rnd.random() * h
        d.line([x, y, x + slant, y + length], fill=color + (rnd.randint(alpha // 2, alpha),), width=1)
    return lay


def _flakes(size, rnd, n, left=0.8):
    lay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    w, h = size
    for _ in range(n):
        x, y, r = rnd.random() * w * left, rnd.random() * h, rnd.choice([1, 2, 2, 3])
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, rnd.randint(120, 240)))
    return lay.filter(ImageFilter.GaussianBlur(0.8))


def _clouds(size, rnd, color, alpha, n=7):
    lay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    w, h = size
    for _ in range(n):
        cx, cy = rnd.random() * w * 0.7, rnd.random() * h * 0.32
        rw, rh = rnd.randint(int(w * 0.14), int(w * 0.3)), rnd.randint(int(h * 0.05), int(h * 0.11))
        d.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], fill=color + (alpha,))
    return lay.filter(ImageFilter.GaussianBlur(h * 0.035))


def paint(img, scene, seed):
    img = img.convert("RGBA")
    size = img.size
    w, h = size
    rnd = random.Random(seed)
    L = []
    if scene == "sunrise":          # warm golden dawn, low sun on the left
        L += [_vgrad(size, (255, 190, 90), (255, 120, 40), 0, 120), _glow(size, w * 0.2, h * 0.66, h * 0.55, (255, 200, 110), 150),
              _glow(size, w * 0.2, h * 0.66, h * 0.13, (255, 245, 205), 255, h * 0.04)]
    elif scene == "dawn_fog":       # cold grey-blue dawn with fog bands (cautious opening)
        L += [_vgrad(size, (120, 150, 200), (205, 215, 230), 40, 135), _glow(size, w * 0.2, h * 0.7, h * 0.4, (235, 225, 215), 120),
              _glow(size, w * 0.2, h * 0.7, h * 0.09, (255, 250, 240), 230, h * 0.04), _glow(size, w * 0.35, h * 0.9, h * 0.5, (225, 232, 240), 90)]
    elif scene == "sunset":         # fiery dusk, big sun sinking
        L += [_vgrad(size, (120, 40, 90), (255, 110, 30), 40, 170), _glow(size, w * 0.18, h * 0.74, h * 0.6, (255, 120, 40), 150),
              _glow(size, w * 0.18, h * 0.74, h * 0.17, (255, 210, 120), 255, h * 0.05)]
    elif scene == "moon":           # calm moonlit night
        L += [_vgrad(size, (10, 30, 70), (20, 70, 100), 80, 120), _stars(size, rnd), _moon(size, w * 0.1, h * 0.17, h * 0.06, False)]
    elif scene == "storm":          # stormy purple-crimson dusk with rain
        L += [_vgrad(size, (50, 15, 70), (150, 30, 40), 90, 150), _clouds(size, rnd, (20, 10, 30), 190), _glow(size, w * 0.12, h * 0.8, h * 0.35, (220, 50, 40), 90),
              _streaks(size, rnd, 260, h * 0.07, -h * 0.02, 120)]
    elif scene == "snow":           # cold snowy night
        L += [_vgrad(size, (20, 35, 75), (110, 135, 175), 90, 120), _moon(size, w * 0.1, h * 0.17, h * 0.055, False), _flakes(size, rnd, 220)]
    for lay in L:
        img = Image.alpha_composite(img, lay)
    return img.convert("RGB")


def scene_for(edition, key, seed):
    """-> scene name. edition 'evening' = closing; anything else = opening."""
    bull = key.startswith("bull")
    roar = key.endswith("roar")
    over = "over" in key
    alt = (seed // 2) % 2
    if edition == "evening":
        if bull and roar:
            return "sunset"
        if bull and not over:
            return "sunset" if alt else "moon"
        if bull and over:                      # bulls fought back: sun breaking through
            return "sunset"
        if roar:
            return "storm"
        if over:                               # bears ahead
            return "storm" if alt else "snow"
        return "snow" if alt else "moon"
    if bull:
        return "sunrise"
    if over:
        return "dawn_fog" if alt else "sunrise"
    return "dawn_fog"


def graded_jpeg(path, edition, key, seed):
    try:
        im = Image.open(path).convert("RGB")
        if im.width > W_MAX:
            im = im.resize((W_MAX, int(im.height * W_MAX / im.width)))
        out = paint(im, scene_for(edition, key, seed), seed)
        b = io.BytesIO()
        out.save(b, "JPEG", quality=86)
        return b.getvalue(), "jpeg"
    except Exception:
        return None
