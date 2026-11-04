"""Festival decoration + trading-holiday strip for the Morning Sunrise / Evening Breeze booklets.

Rules (owner's instruction):
  * Hindu festivals  - celebrate from 2 days before, through the festival day.
  * National days    - celebrate from 1 day before, through the day.
  * Muslim holidays  - NEVER any celebration/decoration (they are only listed as trading holidays).
  * Other communities' holidays (Sikh, Christian, Jain, state) - listed as trading holidays, not decorated.
  * Every booklet lists the trading holidays from the start of its week (Monday) to the end of the next week.
"""
import datetime as dt
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEAD = {"hindu": 2, "national": 1}
_DAYS = None


def days():
    global _DAYS
    if _DAYS is None:
        try:
            _DAYS = json.load(open(os.path.join(ROOT, "data", "festivals.json")))["days"]
        except Exception:
            _DAYS = []
    return _DAYS


def _d(s):
    return dt.date.fromisoformat(s)


def celebration(date_iso):
    """-> dict(name, date, theme, days_to, line) for the festival to celebrate on this date, or None."""
    d = _d(date_iso)
    best = None
    for x in days():
        lead = LEAD.get(x["kind"])
        if lead is None:          # muslim / other: strictly no celebration
            continue
        n = (_d(x["date"]) - d).days
        if 0 <= n <= lead and (best is None or n < best["days_to"]):
            fd = _d(x["date"])
            when = fd.strftime("%a %d %b").replace(" 0", " ")
            line = ("Happy %s!" % x["name"]) if n == 0 else ("%s %s" % (x["name"], "tomorrow, " + when if n == 1 else "in 2 days, " + when))
            best = dict(name=x["name"], date=x["date"], theme=x.get("theme", "marigold"), days_to=n, line=line)
    return best


def holiday_strip(date_iso):
    """Trading holidays (and special sessions) from Monday of this week to Friday of next week -> (this_week, next_week) lists of 'Tue 10 Nov Diwali Balipratipada'."""
    d = _d(date_iso)
    mon = d - dt.timedelta(days=d.weekday())
    out = ([], [])
    for x in days():
        fd = _d(x["date"])
        if x.get("trading_holiday") and fd.weekday() < 5 and mon <= fd <= mon + dt.timedelta(days=11):
            out[0 if fd < mon + dt.timedelta(days=7) else 1].append((fd, "%s %s" % (fd.strftime("%a %d %b").replace(" 0", " "), x["name"])))
        if x.get("special") and mon <= fd <= mon + dt.timedelta(days=11):
            out[0 if fd < mon + dt.timedelta(days=7) else 1].append((fd, x["special"]))
    return [t for _, t in sorted(out[0])], [t for _, t in sorted(out[1])]


if __name__ == "__main__":
    import sys
    for s in sys.argv[1:]:
        print(s, celebration(s), holiday_strip(s))
