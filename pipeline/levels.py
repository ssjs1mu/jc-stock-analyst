"""Morning support / resistance anchored on the GIFT Nifty opening zone.

Classic pivot levels come from the LAST session's high/low/close. When GIFT Nifty points to an open outside the normal pivot band
(S1..R1), those levels no longer sit on the right side of the market (e.g. 'resistance' below the open). This module checks that every
morning and, when needed, re-anchors: supports = the nearest levels BELOW the open zone, resistances = the nearest levels ABOVE it.
Candidate levels: S3 S2 S1 P R1 R2 R3 and the last session's high / low; if fewer than two exist on a side (big gap), round numbers fill in.
"""
import math


def _ladder(q):
    hi, lo, last = q["hi"], q["lo"], q["last"]
    p = (hi + lo + last) / 3
    return {"S3": lo - 2 * (hi - p), "S2": p - (hi - lo), "S1": 2 * p - hi, "P": p, "R1": 2 * p - lo, "R2": p + (hi - lo), "R3": hi + 2 * (p - lo),
            "Prev low": lo, "Prev high": hi}


def parse_zone(z):
    try:
        a, b = [float(x.replace(",", "")) for x in str(z).split("-")]
        return min(a, b), max(a, b)
    except Exception:
        return None


def anchored(q, zone, step=100):
    """q: quote dict with hi/lo/last. zone: (lo, hi) expected opening zone for THIS index.
    -> dict(re_anchored, below=[(value,label)...nearest first], above=[...], inside=[labels], reason)"""
    if not q or not zone:
        return None
    L = _ladder(q)
    zl, zh = zone
    classic = L["S1"] <= zl and zh <= L["R1"]
    out = dict(re_anchored=not classic, ladder=L, zone=zone)
    if classic:
        return out
    cand = sorted(((v, k) for k, v in L.items()), key=lambda t: t[0])
    below = [(v, k) for v, k in cand if v < zl][::-1]
    above = [(v, k) for v, k in cand if v > zh]
    inside = [k for v, k in cand if zl <= v <= zh]
    # de-duplicate levels closer than ~0.12% (e.g. P and Prev high)
    def thin(lst):
        res = []
        for v, k in lst:
            if all(abs(v - u) / v > 0.0012 for u, _ in res):
                res.append((v, k))
        return res
    below, above = thin(below), thin(above)
    r = math.floor(zl / step) * step
    while len(below) < 2:
        below.append((r, "round")); r -= step
    r = math.ceil(zh / step) * step
    while len(above) < 2:
        if all(abs(r - u) / r > 0.0012 for u, _ in above):
            above.append((r, "round"))
        r += step
    out.update(below=below[:2], above=above[:2], inside=inside,
               reason="Open zone %s-%s is %s the pivot band %s-%s" % (format(round(zl), ","), format(round(zh), ","), "above" if zl > L["R1"] else "below", format(round(L["S1"]), ","), format(round(L["R1"]), ",")))
    return out


def fmt(v):
    return format(round(v), ",")


def zone_str(pair):
    a, b = sorted([pair[0][0], pair[1][0]])
    return "%s - %s" % (fmt(a), fmt(b))


def level_row(name, q, zone, step=100, est=False):
    """-> dict(name, s, r, note, flag) in the booklet's format, or None when no data."""
    a = anchored(q, zone, step)
    if not a:
        return None
    L = a["ladder"]
    if not a["re_anchored"]:
        return dict(name=name, s="%s - %s" % (fmt(L["S2"]), fmt(L["S1"])), r="%s - %s" % (fmt(L["R1"]), fmt(L["R2"])),
                    note="A sustained move above %s opens up %s; a slide below %s would expose %s." % (fmt(L["R1"]), fmt(L["R2"]), fmt(L["S1"]), fmt(L["S2"])), flag="")
    b1, b2 = a["below"]; a1, a2 = a["above"]
    up = zone[0] > L["R1"]
    lab = lambda t: ("%s %s" % (t[1], fmt(t[0]))) if t[1] != "round" else fmt(t[0])
    note = ("Gap %s expected: yesterday's %s now act as %s. Support %s / %s; a hold above %s targets %s."
            % ("up" if up else "down", "resistance levels" if up else "support levels", "support" if up else "resistance", lab(b1), lab(b2), fmt(a1[0]), fmt(a2[0])))
    if not up:
        note = ("Gap down expected: yesterday's support levels now act as resistance. Resistance %s / %s; a slide below %s exposes %s."
                % (lab(a1), lab(a2), fmt(b1[0]), fmt(b2[0])))
    if a["inside"]:
        note += " (%s inside the open zone.)" % ", ".join(a["inside"])
    return dict(name=name, s=zone_str((b1, b2)), r=zone_str((a1, a2)), note=note + (" Estimated from the Nifty gap." if est else ""),
                flag="Re-anchored to GIFT open zone")
