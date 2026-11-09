#!/usr/bin/env python3
"""Hindi / Bengali editions of the picture reports (free: no paid AI, no key).

localize(html_doc, lang) turns a finished report page (English) into lang ('hi' or 'bn'):
  1. text goes through: fixed glossary (below) -> cache (data/i18n_cache.json) -> Google's free web translate endpoint
     (runner only; unofficial but keyless) -> English left as is if every route fails (never blocks a report)
  2. every digit becomes the language's own numeral (Hindi ०१२३४५६७८९, Bengali ০১২৩৪৫৬৭৮৯), also inside chart labels
  3. the page gets the matching Noto font (bundled in pipeline/branding/fonts), caps/letter-spacing switched off
Brand name, tagline, tickers and index symbols stay as they are (branding is never changed).
"""
import base64
import concurrent.futures as cf
import html as _h
import json
import os
import re
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE_PATH = os.path.join(ROOT, "data", "i18n_cache.json")
LANGS = {"en": "English", "hi": "हिन्दी", "bn": "বাংলা"}
DIGITS = {"hi": "०१२३४५६७८९", "bn": "০১২৩৪৫৬৭৮৯"}
FONT = {"hi": ("Noto Sans Devanagari", "NotoSansDevanagari.ttf"), "bn": ("Noto Sans Bengali", "NotoSansBengali.ttf")}

MON = {"hi": ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
       "bn": ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"]}
MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONF = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
DAY = {"hi": ["सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार"],
       "bn": ["সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার", "রবিবার"]}
DAY3 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
DAYF = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DAY_SHORT = {"hi": ["सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि", "रवि"], "bn": ["সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি", "রবি"]}
MON_SHORT = {"hi": ["जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुला", "अग", "सित", "अक्टू", "नव", "दिस"],
             "bn": ["জানু", "ফেব", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"]}

# fixed labels: (hindi, bengali). Looked up by exact text first, so the frequent headings never depend on the network.
G = {
    "Opening summary": ("शुरुआती सारांश", "সূচনা সারসংক্ষেপ"),
    "Global markets": ("वैश्विक बाज़ार", "বিশ্ব বাজার"),
    "Alerts & watchlist": ("अलर्ट और वॉचलिस्ट", "সতর্কতা ও ওয়াচলিস্ট"),
    "Insurance": ("बीमा", "বিমা"),
    "Diwali Muhurat session": ("दिवाली मुहूर्त सत्र", "দীপাবলি মুহূর্ত সেশন"),
    "Market close": ("बाज़ार बंद", "বাজার বন্ধ"),
    "Movers & shakers": ("तेज़ी-मंदी वाले शेयर", "বড় ওঠানামার শেয়ার"),
    "News": ("समाचार", "সংবাদ"),
    "Next session": ("अगला सत्र", "পরবর্তী সেশন"),
    "Morning Sunrise": ("मॉर्निंग सनराइज़", "মর্নিং সানরাইজ"),
    "Evening Breeze": ("ईवनिंग ब्रीज़", "ইভনিং ব্রিজ"),
    "TRADING HOLIDAYS": ("ट्रेडिंग अवकाश", "ট্রেডিং ছুটি"),
    "MARKET HOLIDAYS NEARBY": ("आसपास के बाज़ार अवकाश", "কাছাকাছি বাজার ছুটি"),
    "This week:": ("इस सप्ताह:", "এই সপ্তাহে:"),
    "Next week:": ("अगले सप्ताह:", "পরের সপ্তাহে:"),
    "Tap the page to turn →": ("पन्ना पलटने के लिए टैप करें →", "পাতা ওল্টাতে ট্যাপ করুন →"),
    "For information only. Not investment advice. Markets carry risk.": ("केवल जानकारी के लिए। निवेश सलाह नहीं। बाज़ार में जोखिम होता है।", "শুধুমাত্র তথ্যের জন্য। বিনিয়োগ পরামর্শ নয়। বাজারে ঝুঁকি আছে।"),
    "BULLISH TONE": ("तेज़ी का रुझान", "তেজির সুর"),
    "CAUTIOUS TONE": ("सतर्क रुझान", "সতর্ক সুর"),
    "BALANCED TONE": ("संतुलित रुझान", "ভারসাম্যপূর্ণ সুর"),
    "POSITIVE CLOSE": ("सकारात्मक बंद", "ইতিবাচক সমাপ্তি"),
    "NEGATIVE CLOSE": ("नकारात्मक बंद", "নেতিবাচক সমাপ্তি"),
    "FLAT CLOSE": ("सपाट बंद", "সমতল সমাপ্তি"),
    "WEAK START LIKELY": ("कमज़ोर शुरुआत संभव", "দুর্বল সূচনার সম্ভাবনা"),
    "POSITIVE START LIKELY": ("सकारात्मक शुरुआत संभव", "ইতিবাচক সূচনার সম্ভাবনা"),
    "FLAT START LIKELY": ("सपाट शुरुआत संभव", "সমতল সূচনার সম্ভাবনা"),
    "NIFTY 50 CLOSE": ("निफ्टी 50 क्लोज़", "নিফটি 50 ক্লোজ"),
    "GIFT NIFTY": ("गिफ्ट निफ्टी", "গিফট নিফটি"),
    "Nifty 50": ("निफ्टी 50", "নিফটি 50"), "Nifty 500": ("निफ्टी 500", "নিফটি 500"), "Bank Nifty": ("बैंक निफ्टी", "ব্যাংক নিফটি"),
    "Sensex": ("सेंसेक्स", "সেনসেক্স"),
    "close": ("क्लोज़", "ক্লোজ"), "prev close": ("पिछला क्लोज़", "আগের ক্লোজ"),
    "TOP GAINERS": ("शीर्ष बढ़त", "শীর্ষ লাভ"), "TOP LOSERS": ("शीर्ष गिरावट", "শীর্ষ ক্ষতি"),
    "Support zone": ("सपोर्ट ज़ोन", "সাপোর্ট জোন"), "Resistance zone": ("रेज़िस्टेंस ज़ोन", "রেজিস্ট্যান্স জোন"),
    "Market snapshot": ("बाज़ार झलक", "বাজার ঝলক"), "Closing snapshot": ("क्लोज़िंग झलक", "ক্লোজিং ঝলক"),
    "Advantages": ("फ़ायदे", "সুবিধা"), "Drawbacks": ("कमियाँ", "অসুবিধা"), "WARNINGS": ("चेतावनियाँ", "সতর্কতা"),
    "ENTRY AGE": ("प्रवेश आयु", "প্রবেশের বয়স"), "TERM": ("अवधि", "মেয়াদ"), "TYPE": ("प्रकार", "ধরন"),
    "BEST FOR AGE GROUP": ("सर्वोत्तम आयु वर्ग", "সেরা বয়সসীমা"), "PLAN OF THE DAY": ("आज की योजना", "আজকের পরিকল্পনা"),
    "Outlook:": ("निष्कर्ष:", "মূল্যায়ন:"),
    "Stocks to watch": ("नज़र रखने वाले शेयर", "নজরে রাখার শেয়ার"), "Headlines to track": ("ध्यान देने योग्य सुर्खियाँ", "নজরে রাখার শিরোনাম"),
    "Corporate action & market alerts": ("कॉरपोरेट एक्शन और बाज़ार अलर्ट", "কর্পোরেট অ্যাকশন ও বাজার সতর্কতা"),
    "Corporate actions": ("कॉरपोरेट एक्शन", "কর্পোরেট অ্যাকশন"),
    "FII / FPI net": ("एफआईआई / एफपीआई नेट", "এফআইআই / এফপিআই নেট"), "DII net": ("डीआईआई नेट", "ডিআইআই নেট"),
    "Commodities, currency & bonds": ("कमोडिटी, मुद्रा और बॉन्ड", "পণ্য, মুদ্রা ও বন্ড"),
    "Global & Asian markets · hours in IST": ("वैश्विक और एशियाई बाज़ार · समय IST में", "বিশ্ব ও এশীয় বাজার · সময় IST-তে"),
    "Dow Jones": ("डाउ जोन्स", "ডাউ জোনস"), "S&P 500": ("एसएंडपी 500", "এসঅ্যান্ডপি 500"), "Nasdaq Composite": ("नैस्डैक कंपोज़िट", "ন্যাসড্যাক কম্পোজিট"),
    "FTSE 100": ("एफटीएसई 100", "এফটিএসই 100"), "DAX": ("डैक्स", "ড্যাক্স"), "Nikkei 225": ("निक्केई 225", "নিক্কেই 225"),
    "Hang Seng": ("हैंग सेंग", "হ্যাং সেং"), "Shanghai Composite": ("शंघाई कंपोज़िट", "সাংহাই কম্পোজিট"), "Kospi": ("कोस्पी", "কোস্পি"),
    "Brent crude US$/bbl": ("ब्रेंट क्रूड US$/बैरल", "ব্রেন্ট ক্রুড US$/ব্যারেল"), "WTI crude US$/bbl": ("डब्ल्यूटीआई क्रूड US$/बैरल", "ডব্লিউটিআই ক্রুড US$/ব্যারেল"),
    "Gold US$/oz": ("सोना US$/औंस", "সোনা US$/আউন্স"), "USD / INR": ("डॉलर / रुपया", "ডলার / টাকা"), "Dollar index": ("डॉलर इंडेक्स", "ডলার সূচক"),
    "US 10-yr yield %": ("अमेरिकी 10-वर्षीय यील्ड %", "মার্কিন ১০-বছরের ইল্ড %"), "Volatility": ("अस्थिरता", "অস্থিরতা"),
    "Key technical levels to watch": ("देखने योग्य प्रमुख तकनीकी स्तर", "নজরে রাখার প্রধান টেকনিক্যাল স্তর"),
    "Key levels for the next session": ("अगले सत्र के प्रमुख स्तर", "পরবর্তী সেশনের প্রধান স্তর"),
    "Good to know": ("जानने योग्य", "জেনে রাখুন"), "Full timetable": ("पूरी समय-सारणी", "পূর্ণ সময়সূচি"),
    "Coming up": ("आगे आने वाला", "আসছে"), "Data due": ("आने वाले आँकड़े", "আসন্ন তথ্য"), "Results due": ("नतीजे अपेक्षित", "ফলাফল প্রত্যাশিত"),
    "How the session unfolded": ("सत्र कैसा रहा", "সেশন কেমন গেল"), "TOP GAINERS & LOSERS": ("शीर्ष बढ़त और गिरावट", "শীর্ষ লাভ ও ক্ষতি"),
    "What shapes the opening": ("शुरुआत को क्या तय करेगा", "সূচনা কীসে নির্ধারিত হবে"),
    "Overnight risks until the next trading session": ("अगले ट्रेडिंग सत्र तक रात भर के जोखिम", "পরবর্তী ট্রেডিং সেশন পর্যন্ত রাতের ঝুঁকি"),
    "Nifty 50 opening zone": ("निफ्टी 50 की शुरुआती रेंज", "নিফটি 50 সূচনা পরিসর"),
    "Report generated": ("रिपोर्ट तैयार", "রিপোর্ট তৈরি"),
    "NASDAQ": ("नैस्डैक", "ন্যাসড্যাক"), "DOW": ("डाउ", "ডাউ"), "US VIX": ("यूएस VIX", "ইউএস VIX"), "WTI CRUDE": ("WTI क्रूड", "WTI ক্রুড"),
    "US 10-YR": ("अमेरिकी 10-वर्ष", "মার্কিন 10-বছর"), "DOLLAR INDEX": ("डॉलर इंडेक्स", "ডলার সূচক"), "GOLD $/oz": ("सोना $/औंस", "সোনা $/আউন্স"),
    "BRENT": ("ब्रेंट", "ব্রেন্ট"), "GOLD": ("सोना", "সোনা"), "SILVER": ("चाँदी", "রুপো"), "USD/INR": ("डॉलर/रुपया", "ডলার/টাকা"),
}
UNITS = {"cr": ("करोड़", "কোটি"), "Cr": ("करोड़", "কোটি"), "Wk": ("सप्ताह", "সপ্তাহ"), "wk": ("सप्ताह", "সপ্তাহ"), "bp": ("बीपी", "বিপি"), "pts": ("अंक", "পয়েন্ট"), "vol": ("वॉल्यूम", "ভলিউম"), "avg vol": ("औसत वॉल्यूम", "গড় ভলিউম"), "range": ("रेंज", "পরিসর")}
KEEP = {"Joshi's Corner", "Connecting People Thru Services...", "S", ".", "I", "R", "hares  •", "nsurance  •", "estaurant", "·", "•", "●", "✓", "!", "★"}
TOKEN_FALLBACK = {"AM": ("पूर्वाह्न", "পূর্বাহ্ণ"), "PM": ("अपराह्न", "অপরাহ্ণ"), "IST": ("IST", "IST"), "Cr": ("करोड़", "কোটি"), "pts": ("अंक", "পয়েন্ট"),
                  "vs": ("बनाम", "বনাম"), "and": ("और", "ও"), "and more": ("और अन्य", "এবং আরও")}

_cache = {}
_dirty = [False]


def _load():
    if _cache:
        return
    try:
        _cache.update(json.load(open(CACHE_PATH, encoding="utf-8")))
    except Exception:
        pass
    for l in ("hi", "bn"):
        _cache.setdefault(l, {})


def save_cache():
    if not _dirty[0]:
        return
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(_cache, f, ensure_ascii=False, indent=0, sort_keys=True)
    _dirty[0] = False


def digits(s, lang):
    d = DIGITS.get(lang)
    return s if not d else re.sub(r"[0-9]", lambda m: d[int(m.group())], s)


def _clients5(text, lang):
    """Google's browser-extension endpoint: keyless, and (unlike translate_a/single) not blocked for GitHub's runners."""
    url = "https://clients5.google.com/translate_a/t?" + urllib.parse.urlencode({"client": "dict-chrome-ex", "sl": "en", "tl": lang, "q": text})
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    d = json.loads(urllib.request.urlopen(req, timeout=15).read().decode("utf-8"))
    r = d[0] if isinstance(d, list) else d
    if isinstance(r, list):
        r = r[0]
    return str(r).strip()


def _mymemory(text, lang):
    url = "https://api.mymemory.translated.net/get?" + urllib.parse.urlencode({"q": text[:480], "langpair": "en|" + lang})
    d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=15).read().decode("utf-8"))
    r = (d.get("responseData") or {}).get("translatedText", "")
    if not r or "MYMEMORY WARNING" in r.upper() or d.get("quotaFinished"):
        raise RuntimeError("mymemory refused")
    return r.strip()


def _gtx(text, lang):
    for fn in (_clients5, _mymemory, _gtx_single):
        try:
            r = fn(text, lang)
            if r:
                return r
        except Exception:
            continue
    raise RuntimeError("no translator reachable")


def _gtx_single(text, lang):
    url = "https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode({"client": "gtx", "sl": "en", "tl": lang, "dt": "t", "q": text})
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    d = json.loads(urllib.request.urlopen(req, timeout=15).read().decode("utf-8"))
    return "".join(seg[0] for seg in d[0] if seg and seg[0]).strip()


_ticker = re.compile(r"^[A-Z0-9&.\-\s,/+%▲▼()’']+$")
_date_for = re.compile(r"^for (%s), (\d{1,2}) (%s) (\d{4})$" % ("|".join(DAYF), "|".join(MONF)))
_gen = re.compile(r"^Report generated (\d{1,2}:\d{2}) (AM|PM) IST$")
_exp = re.compile(r"^EXPECTED OPENING · (%s), (\d{1,2}) (%s) (\d{4})$" % ("|".join(d.upper() for d in DAYF), "|".join(m.upper() for m in MONF)))
_hm = re.compile(r"(\d{1,2}:\d{2})\s?(AM|PM)")


def _fixed(t, lang):
    """glossary + patterns that have a fixed shape; None if the text needs real translation."""
    k = 0 if lang == "hi" else 1
    if t in G:
        return G[t][k]
    m = _date_for.match(t)
    if m:
        wd, dd, mo, yy = m.groups()
        s = "%s, %s %s %s" % (DAY[lang][DAYF.index(wd)], dd, MON[lang][MONF.index(mo)], yy)
        return s + (" के लिए" if lang == "hi" else " এর জন্য")
    m = _gen.match(t)
    if m:
        return "%s: %s %s IST" % (G["Report generated"][k], m.group(1), TOKEN_FALLBACK[m.group(2)][k])
    m = _exp.match(t)
    if m:
        wd, dd, mo, yy = m.groups()
        pre = "अपेक्षित शुरुआत" if lang == "hi" else "প্রত্যাশিত সূচনা"
        return "%s · %s, %s %s %s" % (pre, DAY[lang][DAYF.index(wd.title())], dd, MON[lang][MONF.index(mo.title())], yy)
    return None


def _units(t, lang):
    k = 0 if lang == "hi" else 1
    t = re.sub(r"(?<![A-Za-z])(avg vol|cr|Cr|Wk|wk|bp|pts|vol|range)(?![A-Za-z])", lambda m: UNITS[m.group(1)][k], t)
    m = re.match(r"^at (\d{1,2}:\d{2}) (AM|PM) ET\.?$", t.strip())
    if m:
        t = ("%s %s ET पर" if lang == "hi" else "ET %s %s-এ") % (m.group(1), TOKEN_FALLBACK[m.group(2)][k])
    return t


def _fallback(t, lang):
    """offline route: translate only dates, times and a few words, leave the rest in English."""
    k = 0 if lang == "hi" else 1
    t = _hm.sub(lambda m: "%s %s" % (m.group(1), TOKEN_FALLBACK[m.group(2)][k]), t)
    t = re.sub(r"\b(%s)\b" % "|".join(DAY3), lambda m: DAY_SHORT[lang][DAY3.index(m.group())], t)
    t = re.sub(r"\b(%s)\b" % "|".join(MON3), lambda m: MON_SHORT[lang][MON3.index(m.group())], t)
    return t


def translate_many(texts, lang):
    """texts: set of English strings -> {english: translated}; fills the cache. Never raises."""
    _load()
    out, todo = {}, []
    for t in texts:
        fx = _fixed(t, lang)
        if fx is not None:
            out[t] = fx
        elif t in _cache[lang]:
            out[t] = _cache[lang][t]
        else:
            todo.append(t)
    if todo:
        fails = [0]

        def one(t):
            if fails[0] >= 6:           # route is down: stop hammering it
                return t, None
            for _ in range(2):
                try:
                    r = _gtx(t, lang)
                    if r:
                        return t, r
                except Exception:
                    pass
            fails[0] += 1
            return t, None
        with cf.ThreadPoolExecutor(6) as ex:
            for t, r in ex.map(one, todo):
                if r:
                    _cache[lang][t] = r
                    _dirty[0] = True
                    out[t] = r
                else:
                    out[t] = _fallback(t, lang)
        miss = sum(1 for t in todo if t not in _cache[lang])
        if miss:
            print("i18n[%s]: %d of %d strings left in English (translator unreachable)" % (lang, miss, len(todo)))
    return out


_prot = re.compile(r"(<style\b.*?</style>|<script\b.*?</script>|<svg\b.*?</svg>)", re.S | re.I)
_node = re.compile(r">([^<>]+)<")


_tag = re.compile(r"^(hares|nsurance|estaurant)\b")   # pieces of the S.I.R tagline: brand text, never translated


def _needs(t):
    t = re.sub(r"\s+", " ", t.replace("\xa0", " ")).strip()
    if _tag.match(t) or t in KEEP:
        return False
    if t in G or _date_for.match(t) or _gen.match(t) or _exp.match(t):
        return True
    if len(re.findall(r"\b[A-Za-z]{3,}\b", t)) >= 2 and re.search(r"[A-Z]{3,}", t) and _ticker.match(t):
        return True                       # shouty label such as "FLAT TO MARGINALLY MIXED START" (not a lone ticker)
    return bool(re.search(r"[A-Za-z]{3,}", t)) and not _ticker.match(t)


def font_css(lang):
    fam, fn = FONT[lang]
    b = base64.b64encode(open(os.path.join(HERE, "branding", "fonts", fn), "rb").read()).decode()
    return ("@font-face{font-family:'%s';src:url(data:font/ttf;base64,%s) format('truetype');font-weight:100 900}"
            "body *:not(.brand):not(.bn):not(.b):not(.bignum):not([style*='JC Script']){font-family:'%s','Noto Sans',Inter,sans-serif !important;text-transform:none !important;letter-spacing:0 !important}"
            "body *{line-height:1.32}" % (fam, b, fam))


def _svg_text(seg, lang):
    def f(m):
        inner = m.group(2)
        inner = re.sub(r"\b(%s)\b" % "|".join(MON3), lambda x: MON_SHORT[lang][MON3.index(x.group())], inner)
        return m.group(1) + digits(inner, lang) + m.group(3)
    return re.sub(r"(<text\b[^>]*>)([^<]*)(</text>)", f, seg)


def localize(doc, lang):
    if lang not in DIGITS:
        return doc
    parts = _prot.split(doc)
    nodes = set()
    for i in range(0, len(parts), 2):
        for m in _node.finditer(parts[i]):
            t = _h.unescape(m.group(1)).strip()
            if t and _needs(t):
                nodes.add(t)
    tr = translate_many(nodes, lang)

    def fix(m):
        raw = m.group(1)
        t = _h.unescape(raw)
        s = t.strip()
        if s and _needs(s):
            new = tr.get(s, s)
            lead, trail = t[:len(t) - len(t.lstrip())], t[len(t.rstrip()):]
            t = lead + new + trail
        t = digits(_units(t, lang), lang)
        return ">" + _h.escape(t, quote=False) + "<"
    for i in range(len(parts)):
        if i % 2 == 0:
            parts[i] = _node.sub(fix, parts[i])
        elif parts[i].lower().startswith("<svg"):
            parts[i] = _svg_text(parts[i], lang)
    out = "".join(parts)
    save_cache()
    css = "<style>%s</style>" % font_css(lang)
    return out.replace("</head>", css + "</head>", 1) if "</head>" in out else css + out
