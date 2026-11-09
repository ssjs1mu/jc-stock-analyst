/* Joshi's Corner - report analytics + feedback poll (free, no subscription).
   Sends anonymous view events, page depth and the reader's rating/comment to a Google Apps Script
   web app that appends them to a Google Sheet (see apps_script/README.md). Until ENDPOINT is set the
   events are kept on the reader's device and sent as soon as it is. Branding is never touched. */
(function () {
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbyAgkJHcFQUYOXfvqRYnrk5RXPGjDMHeAoqRosXbFlRnN2NIQC8zB-JkNx6fDbI4Tw/exec";   /* paste the Apps Script web-app URL here (apps_script/README.md) */
  var S = {
    en: {rate: "Rate this report", q: "How did you like this report?", u: "Was it useful?", y: "Yes", n: "Not really", nm: "Your name (optional)", c: "Any suggestion? (optional)", send: "Send", thanks: "Thank you! Your feedback is recorded.", close: "Close", sel: "Please pick a rating"},
    hi: {rate: "रिपोर्ट को रेट करें", q: "यह रिपोर्ट आपको कैसी लगी?", u: "क्या यह उपयोगी रही?", y: "हाँ", n: "खास नहीं", nm: "आपका नाम (वैकल्पिक)", c: "कोई सुझाव? (वैकल्पिक)", send: "भेजें", thanks: "धन्यवाद! आपकी राय दर्ज हो गई।", close: "बंद करें", sel: "कृपया रेटिंग चुनें"},
    bn: {rate: "রিপোর্টটি রেট করুন", q: "রিপোর্টটি কেমন লাগল?", u: "এটি কি কাজে লেগেছে?", y: "হ্যাঁ", n: "তেমন নয়", nm: "আপনার নাম (ঐচ্ছিক)", c: "কোনো পরামর্শ? (ঐচ্ছিক)", send: "পাঠান", thanks: "ধন্যবাদ! আপনার মতামত নথিভুক্ত হয়েছে।", close: "বন্ধ করুন", sel: "অনুগ্রহ করে রেটিং বেছে নিন"}
  };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  var dev = ls("jc_dev"); if (!dev) { dev = "d" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); ls("jc_dev", dev); }
  var path = location.pathname.replace(/index\.html$/, "");
  var m = path.match(/\/(morning|evening|muhurat|updates)\/(\d{4}-\d{2}-\d{2})?/);
  var kind = m ? m[1] : (document.body && document.body.getAttribute("data-report")) || "app";
  var rdate = m && m[2] ? m[2] : new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  function lang() { var l = document.documentElement.lang || "en"; return S[l] ? l : "en"; }
  function T(k) { return (S[lang()] || S.en)[k]; }
  function ist() { return new Date(Date.now() + 19800000).toISOString().replace("T", " ").slice(0, 19); }
  function q() { try { return JSON.parse(ls("jc_q") || "[]"); } catch (e) { return []; } }
  function flush() {
    var a = q(); if (!ENDPOINT || !a.length) return;
    ls("jc_q", "[]");
    try {
      var body = JSON.stringify({events: a});
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], {type: "text/plain"}))) return;
      fetch(ENDPOINT, {method: "POST", mode: "no-cors", body: body, keepalive: true}).catch(function () { ls("jc_q", JSON.stringify(a.concat(q()))); });
    } catch (e) { ls("jc_q", JSON.stringify(a.concat(q()))); }
  }
  function send(type, extra) {
    var e = {type: type, ts: ist(), report: kind, rdate: rdate, lang: lang(), dev: dev, name: ls("jc_name") || "", ref: document.referrer ? document.referrer.split("/")[2] || "" : "", w: window.innerWidth};
    for (var k in extra) e[k] = extra[k];
    var a = q(); a.push(e); ls("jc_q", JSON.stringify(a.slice(-200))); flush();
  }
  window.JCA = {track: send, flush: flush};
  /* one view per device per report per day */
  var vk = "jc_v_" + kind + "_" + rdate + "_" + ist().slice(0, 10);
  if (!ls(vk)) { ls(vk, "1"); send("view", {}); }
  flush();
  /* page depth (booklets) */
  var maxp = 0, total = 0;
  function dots() { var d = document.getElementById("dots"); if (!d) return; total = d.children.length; for (var i = 0; i < total; i++) if (d.children[i].className === "on" && i + 1 > maxp) maxp = i + 1; return maxp; }
  var d0 = document.getElementById("dots");
  if (d0 && window.MutationObserver) {
    new MutationObserver(function () { dots(); if (maxp >= total && total && !asked) { asked = true; setTimeout(open, 1200); } }).observe(d0, {subtree: true, attributes: true, childList: true});
    dots();
  }
  var asked = false;
  function sendDepth() { if (maxp) send("depth", {pages: maxp, of: total}); }
  window.addEventListener("pagehide", sendDepth); document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") sendDepth(); });
  /* downloads / opens from the Reports tab and the updates card */
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[href]"); if (!a) return;
    var h = a.getAttribute("href") || "";
    var mm = h.match(/(reports\/[^\/]+|morning|evening|muhurat)\/.*?(\.pdf|\.png|\/)(?:$|\?)/);
    if (mm && /\.(pdf|png)|\/(morning|evening|muhurat)\//.test(h)) send("open", {target: h.slice(-90)});
  }, true);
  /* feedback poll */
  var css = ".jca{position:fixed;inset:0;z-index:9999;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,'Noto Sans Devanagari','Noto Sans Bengali',sans-serif}" +
    ".jca div.c{background:#171226;color:#f4efe0;border:1px solid #E2B84A66;border-radius:16px;max-width:380px;width:100%;padding:18px;box-shadow:0 10px 40px #000}" +
    ".jca h3{margin:0 0 10px;font-size:17px;color:#E2B84A}.jca .st{display:flex;gap:6px;justify-content:center;margin:6px 0 12px}" +
    ".jca .st button{font-size:30px;background:none;border:0;cursor:pointer;opacity:.35;padding:2px}.jca .st button.on{opacity:1}" +
    ".jca .yn{display:flex;gap:8px;margin:6px 0 12px;align-items:center;font-size:14px}.jca .yn button{border:1px solid #ffffff44;background:#ffffff14;color:#f4efe0;border-radius:14px;padding:6px 14px;font:700 13px inherit;cursor:pointer}.jca .yn button.on{background:#E2B84A;color:#241a05;border-color:#E2B84A}" +
    ".jca input,.jca textarea{width:100%;box-sizing:border-box;background:#ffffff12;color:#f4efe0;border:1px solid #ffffff33;border-radius:10px;padding:9px;margin:4px 0;font:14px inherit}" +
    ".jca .go{display:flex;gap:8px;margin-top:8px}.jca .go button{flex:1;border:0;border-radius:18px;padding:10px;font:700 14px inherit;cursor:pointer;background:#E2B84A;color:#241a05}.jca .go button.g{background:#ffffff1f;color:#f4efe0}.jca p{margin:6px 0;font-size:13px;color:#E2B84A}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  var rate = 0, useful = "";
  function open() {
    if (document.getElementById("jca")) return;
    var w = document.createElement("div"); w.className = "jca"; w.id = "jca";
    var stars = ["😞", "😐", "🙂", "😀", "🤩"].map(function (e, i) { return '<button data-r="' + (i + 1) + '" aria-label="' + (i + 1) + '">' + e + "</button>"; }).join("");
    w.innerHTML = '<div class="c"><h3>' + T("q") + '</h3><div class="st">' + stars + '</div><div class="yn">' + T("u") + ' <button data-u="yes">' + T("y") + '</button><button data-u="no">' + T("n") + '</button></div>' +
      '<input id="jcn" maxlength="60" placeholder="' + T("nm") + '" value="' + (ls("jc_name") || "").replace(/"/g, "") + '"><textarea id="jcc" rows="2" maxlength="400" placeholder="' + T("c") + '"></textarea>' +
      '<p id="jcm"></p><div class="go"><button class="g" id="jcx">' + T("close") + '</button><button id="jcs">' + T("send") + "</button></div></div>";
    document.body.appendChild(w);
    w.addEventListener("click", function (e) {
      e.stopPropagation(); var t = e.target;
      if (t.getAttribute("data-r")) { rate = +t.getAttribute("data-r"); [].forEach.call(w.querySelectorAll(".st button"), function (b) { b.className = +b.getAttribute("data-r") <= rate ? "on" : ""; }); }
      if (t.getAttribute("data-u")) { useful = t.getAttribute("data-u"); [].forEach.call(w.querySelectorAll(".yn button"), function (b) { b.className = b.getAttribute("data-u") === useful ? "on" : ""; }); }
      if (t.id === "jcx" || t === w) { w.remove(); ls("jc_fb_" + kind + "_" + rdate, "x"); }
      if (t.id === "jcs") {
        if (!rate) { w.querySelector("#jcm").textContent = T("sel"); return; }
        var nm = w.querySelector("#jcn").value.trim(); if (nm) ls("jc_name", nm);
        send("feedback", {rating: rate, useful: useful, comment: w.querySelector("#jcc").value.trim(), name: nm || ls("jc_name") || ""});
        ls("jc_fb_" + kind + "_" + rdate, "1"); w.querySelector(".c").innerHTML = '<h3>' + T("thanks") + '</h3><div class="go"><button id="jcx">' + T("close") + "</button></div>";
      }
    });
  }
  window.JCA.poll = open;
  /* "Rate" button in the booklet toolbar */
  var bar = document.querySelector(".bar");
  if (bar) { var b = document.createElement("button"); b.className = "g"; b.id = "jcrate"; b.textContent = "★"; b.title = T("rate"); b.setAttribute("aria-label", T("rate")); b.onclick = open; bar.appendChild(b);
    new MutationObserver(function () { b.title = T("rate"); }).observe(document.documentElement, {attributes: true, attributeFilter: ["lang"]}); }
  if (ls("jc_fb_" + kind + "_" + rdate)) asked = true;
})();
