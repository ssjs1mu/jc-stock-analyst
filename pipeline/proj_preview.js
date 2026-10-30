// Fetches real 60-day 5-minute bars and renders the projection panel to HTML (used by the proj-preview workflow).
const fs = require('fs'), J = require('../projection.js');
(async () => {
  const syms = (process.argv[2] || 'BEL').split(/[ ,]+/), live = process.argv[3] === 'live';
  let out = '<html><body style="font-family:Arial;margin:14px;width:1000px">';
  for (const s of syms) {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${s}.NS?range=60d&interval=5m&includePrePost=false`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j = await r.json(), c = j.chart.result[0], q = c.indicators.quote[0];
    const bars = c.timestamp.map((t, i) => ({ t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] })).filter((b) => b.c != null);
    const o = J.project(bars, live);
    console.log(s, o.ok ? JSON.stringify({ label: o.label, k: o.k, fin: o.P.finalPct, sum: o.sum, sess: o.sessions }) : o.reason);
    out += `<h3>${s}</h3><div style="border:1px solid #c99a1c;padding:12px;border-radius:12px">${J.html(o, s)}</div>`;
  }
  fs.writeFileSync('/tmp/proj.html', out + '</body></html>');
})();
