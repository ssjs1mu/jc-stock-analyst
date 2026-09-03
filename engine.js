/* ============================================================
   Joshi's Corner — Stock Analyst Terminal
   Multi-source fetch chain + client-side quant engine + UI render
   ============================================================ */

/* ---------- clock ---------- */
function tickClock(){
  const now = new Date();
  document.getElementById('clockTime').textContent =
    now.toLocaleTimeString('en-IN',{hour12:true});
  document.getElementById('clockDate').textContent =
    now.toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
}
setInterval(tickClock,1000); tickClock();

/* ---------- CORS proxy chain (GitHub Pages HTTPS is required for these to work) ---------- */
const PROXIES = [
  (u)=>`https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u)=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u)=>`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

async function fetchThrough(url, asJson=true){
  // try direct first (works if target sends permissive CORS headers), then proxy chain
  const attempts = [url, ...PROXIES.map(p=>p(url))];
  let lastErr = null;
  for (const attemptUrl of attempts){
    try{
      const res = await fetch(attemptUrl, {cache:'no-store'});
      if (!res.ok) throw new Error('HTTP '+res.status);
      return asJson ? await res.json() : await res.text();
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('All sources unreachable');
}

function setStatus(msg, cls){
  const el = document.getElementById('statusLine');
  el.className = 'statusline show'+(cls?(' '+cls):'');
  document.getElementById('statusText').textContent = msg;
}

/* ---------- data sources ---------- */
async function fetchYahooChart(ySymbol){
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ySymbol}?range=2y&interval=1d&events=div,splits`;
  const data = await fetchThrough(url, true);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No chart data for '+ySymbol);
  return result;
}

async function fetchYahooQuoteSummary(ySymbol){
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ySymbol}?modules=defaultKeyStatistics,summaryDetail,financialData,price`;
  try{
    const data = await fetchThrough(url, true);
    return data?.quoteSummary?.result?.[0] || null;
  }catch(e){ return null; }
}

async function fetchNews(query){
  try{
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query+' stock')}&hl=en-IN&gl=IN&ceid=IN:en`;
    const text = await fetchThrough(url, false);
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const items = Array.from(xml.querySelectorAll('item')).slice(0,8);
    return items.map(it=>({
      title: it.querySelector('title')?.textContent || '',
      link: it.querySelector('link')?.textContent || '#',
      date: it.querySelector('pubDate')?.textContent || ''
    }));
  }catch(e){ return []; }
}

/* ---------- math helpers ---------- */
function sma(arr, period, endIdx){
  if (endIdx - period + 1 < 0) return null;
  let s=0; for(let i=endIdx-period+1;i<=endIdx;i++) s+=arr[i];
  return s/period;
}
function emaSeries(arr, period){
  const k = 2/(period+1);
  const out = new Array(arr.length).fill(null);
  let prev = null;
  for (let i=0;i<arr.length;i++){
    if (arr[i]==null){ out[i]=prev; continue; }
    if (prev===null){ prev = arr[i]; out[i]=prev; continue; }
    prev = arr[i]*k + prev*(1-k);
    out[i]=prev;
  }
  return out;
}
function rsi14(closes){
  const period=14;
  if (closes.length < period+1) return null;
  let gains=0, losses=0;
  for (let i=closes.length-period;i<closes.length;i++){
    const chg = closes[i]-closes[i-1];
    if (chg>=0) gains+=chg; else losses-=chg;
  }
  let avgGain=gains/period, avgLoss=losses/period;
  if (avgLoss===0) return 100;
  const rs = avgGain/avgLoss;
  return 100 - (100/(1+rs));
}
function atr14(highs, lows, closes){
  const period=14;
  if (closes.length < period+1) return null;
  const trs=[];
  for (let i=closes.length-period;i<closes.length;i++){
    const tr = Math.max(
      highs[i]-lows[i],
      Math.abs(highs[i]-closes[i-1]),
      Math.abs(lows[i]-closes[i-1])
    );
    trs.push(tr);
  }
  return trs.reduce((a,b)=>a+b,0)/trs.length;
}
function stdev(arr){
  const n=arr.length; if(n<2) return 0;
  const mean = arr.reduce((a,b)=>a+b,0)/n;
  const v = arr.reduce((a,b)=>a+(b-mean)*(b-mean),0)/(n-1);
  return Math.sqrt(v);
}
function fmt(n, dec=2){
  if (n===null || n===undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function fmtPct(n, dec=2){
  if (n===null || n===undefined || isNaN(n)) return '—';
  const s = (n>=0?'+':'') + n.toFixed(dec) + '%';
  return s;
}
function fmtBig(n){
  if (n===null||n===undefined||isNaN(n)) return '—';
  if (Math.abs(n) >= 1e7) return (n/1e7).toFixed(2)+' Cr';
  if (Math.abs(n) >= 1e5) return (n/1e5).toFixed(2)+' L';
  return fmt(n,0);
}

/* ---------- main pipeline ---------- */
async function runAnalysis(){
  const rawSym = document.getElementById('symbolInput').value.trim().toUpperCase();
  const exch = document.getElementById('exchangeInput').value; // NS or BO
  if (!rawSym){ alert('Enter a symbol first.'); return; }

  const goBtn = document.getElementById('goBtn');
  goBtn.disabled = true;
  document.getElementById('errArea').innerHTML='';
  document.getElementById('results').classList.remove('show');
  setStatus('Fetching live quote & 2-year history from Yahoo Finance…');

  const ySymbol = `${rawSym}.${exch}`;

  try{
    const chart = await fetchYahooChart(ySymbol);
    setStatus('Cross-checking with fundamentals feed…');
    const summary = await fetchYahooQuoteSummary(ySymbol);
    setStatus('Pulling news flow…');
    const companyName = chart.meta?.longName || chart.meta?.shortName || rawSym;
    const news = await fetchNews(companyName);

    setStatus('Computing indicators, pivots, Fibonacci levels & trading calls…');
    const model = buildModel(chart, summary, news, rawSym, exch);
    renderAll(model);

    setStatus('Live · sourced from Yahoo Finance + Google News · '+new Date().toLocaleTimeString('en-IN'), 'ok');
    document.getElementById('results').classList.add('show');
  }catch(e){
    console.error(e);
    setStatus('Fetch failed', 'err');
    document.getElementById('errArea').innerHTML = `<div class="errbox">
      Could not retrieve live data for <b>${rawSym}.${exch==='NS'?'NSE':'BSE'}</b>.
      This usually means the CORS proxy chain is rate-limited or the symbol is wrong.
      Try again in a few seconds, double-check the ticker (use the NSE/BSE trading symbol, not the company name),
      or open this page over GitHub Pages HTTPS rather than a local file if you haven't already.
      <br><br><span style="color:var(--text-faint)">Technical detail: ${(e && e.message)||e}</span>
    </div>`;
  }finally{
    goBtn.disabled = false;
  }
}

function buildModel(chart, summary, news, rawSym, exch){
  const ts = chart.timestamp || [];
  const q = chart.indicators.quote[0];
  const closes = q.close, highs=q.high, lows=q.low, opens=q.open, vols=q.volume;
  const meta = chart.meta;

  // clean trailing nulls (today's incomplete candle sometimes has nulls)
  let n = closes.length;
  while(n>0 && (closes[n-1]==null || highs[n-1]==null)) n--;
  const C=closes.slice(0,n), H=highs.slice(0,n), L=lows.slice(0,n), O=opens.slice(0,n), V=vols.slice(0,n), T=ts.slice(0,n);

  const cmp = meta.regularMarketPrice ?? C[n-1];
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? C[n-2];
  const dayChange = cmp - prevClose;
  const dayChangePct = (dayChange/prevClose)*100;

  // cross-check flag
  const summaryPrice = summary?.price?.regularMarketPrice?.raw;
  const verified = summaryPrice!=null && Math.abs(summaryPrice - cmp) / cmp < 0.02;

  // indicators
  const sma20 = sma(C,20,n-1), sma50 = sma(C,50,n-1), sma100 = sma(C,100,n-1), sma200 = sma(C,200,n-1);
  const ema12s = emaSeries(C,12), ema26s = emaSeries(C,26);
  const macdLine = C.map((_,i)=> (ema12s[i]!=null && ema26s[i]!=null) ? ema12s[i]-ema26s[i] : null);
  const macdSignalSeries = emaSeries(macdLine.map(v=>v==null?0:v), 9);
  const macd = macdLine[n-1], macdSignal = macdSignalSeries[n-1];
  const macdHist = (macd!=null && macdSignal!=null) ? macd-macdSignal : null;
  const rsi = rsi14(C);
  const atr = atr14(H,L,C);
  const bbMid = sma20;
  const bbStdArr = C.slice(Math.max(0,n-20), n);
  const bbStd = stdev(bbStdArr);
  const bbUpper = bbMid!=null ? bbMid + 2*bbStd : null;
  const bbLower = bbMid!=null ? bbMid - 2*bbStd : null;

  // annualised volatility from daily log returns (last ~252d)
  const lookback = Math.min(252, n-1);
  const logRets=[];
  for (let i=n-lookback;i<n;i++){ if(i>0) logRets.push(Math.log(C[i]/C[i-1])); }
  const dailyVol = stdev(logRets);
  const annualVol = dailyVol * Math.sqrt(252);

  // 52w high/low
  const w52start = Math.max(0, n-252);
  const wk52High = meta.fiftyTwoWeekHigh ?? Math.max(...H.slice(w52start,n));
  const wk52Low = meta.fiftyTwoWeekLow ?? Math.min(...L.slice(w52start,n));

  // pivots from previous completed session
  const pH = H[n-2], pL = L[n-2], pC = C[n-2];
  const P = (pH+pL+pC)/3;
  const pivots = {
    P,
    R1: 2*P-pL, R2: P+(pH-pL), R3: pH+2*(P-pL),
    S1: 2*P-pH, S2: P-(pH-pL), S3: pL-2*(pH-P)
  };

  // Fibonacci — swing over last 60 trading days
  const fibWin = Math.min(60, n);
  const start = n-fibWin;
  let maxIdx=start, minIdx=start;
  for(let i=start;i<n;i++){
    if (H[i] > H[maxIdx]) maxIdx=i;
    if (L[i] < L[minIdx]) minIdx=i;
  }
  const swingHigh = H[maxIdx], swingLow = L[minIdx];
  const range = swingHigh - swingLow;
  const uptrend = maxIdx >= minIdx; // most recent extreme is the high => last leg was up
  const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map(pct=>{
    const level = uptrend ? swingHigh - pct*range : swingLow + pct*range;
    return {pct, level};
  });
  const fibExt = [1.272, 1.618].map(pct=>{
    const level = uptrend ? swingHigh + (pct-1)*range : swingLow - (pct-1)*range;
    return {pct, level};
  });

  // trend / bias score
  let score = 0;
  score += cmp > sma50 ? 1 : -1;
  score += cmp > sma200 ? 1 : -1;
  score += (macdHist!=null && macdHist>0) ? 1 : -1;
  score += (rsi!=null && rsi>50) ? 1 : -1;
  const bias = score>=2 ? 'Bullish' : score<=-2 ? 'Bearish' : 'Range-bound';

  // trading calls across horizons using vol-scaling
  const horizons = [
    {label:'Intraday', days:1},
    {label:'15 Days', days:15},
    {label:'1 Month', days:21},
    {label:'3 Months', days:63},
    {label:'6 Months', days:126},
    {label:'1 Year', days:252},
    {label:'2 Years', days:504},
    {label:'5 Years', days:1260},
  ];
  const calls = horizons.map(h=>{
    const Tyears = h.days/252;
    let expMove = annualVol * Math.sqrt(Tyears);
    if (h.label==='Intraday') expMove = Math.max(expMove, (atr/cmp)*1.1);
    let entryLow, entryHigh, sl, t1, t2, dir;
    if (bias==='Bullish'){
      dir='Long';
      entryLow = cmp*(1-expMove*0.15); entryHigh = cmp*(1+expMove*0.05);
      sl = cmp*(1-expMove*0.6);
      t1 = cmp*(1+expMove); t2 = cmp*(1+expMove*1.6);
    } else if (bias==='Bearish'){
      dir='Short';
      entryLow = cmp*(1-expMove*0.05); entryHigh = cmp*(1+expMove*0.15);
      sl = cmp*(1+expMove*0.6);
      t1 = cmp*(1-expMove); t2 = cmp*(1-expMove*1.6);
    } else {
      dir='Range';
      entryLow = cmp*(1-expMove*0.2); entryHigh = cmp*(1+expMove*0.2);
      sl = cmp*(1-expMove*0.7);
      t1 = cmp*(1+expMove*0.7); t2 = cmp*(1-expMove*0.7);
    }
    return {label:h.label, dir, entryLow, entryHigh, sl, t1, t2, expMovePct: expMove*100};
  });

  // move summary
  const idxWeek = Math.max(0, n-1-5), idxMonth = Math.max(0, n-1-21), idxQtr = Math.max(0, n-1-63);
  const chgFrom = (idx)=> ((cmp - C[idx]) / C[idx]) * 100;
  const moves = {
    day: dayChangePct,
    week: chgFrom(idxWeek),
    month: chgFrom(idxMonth),
    quarter: chgFrom(idxQtr)
  };

  // fundamentals
  const sd = summary?.summaryDetail || {};
  const dks = summary?.defaultKeyStatistics || {};
  const fd = summary?.financialData || {};
  const fundamentals = {
    pe: sd.trailingPE?.raw ?? null,
    eps: dks.trailingEps?.raw ?? null,
    marketCap: sd.marketCap?.raw ?? summary?.price?.marketCap?.raw ?? null,
    dividendYield: sd.dividendYield?.raw ?? null,
    beta: dks.beta?.raw ?? null,
    bookValue: dks.bookValue?.raw ?? null,
    targetMeanPrice: fd.targetMeanPrice?.raw ?? null,
    recommendationKey: fd.recommendationKey ?? null,
  };

  return {
    rawSym, exch, companyName, cmp, prevClose, dayChange, dayChangePct, verified,
    volume: V[n-1], avgVol20: sma(V,20,n-1),
    dayHigh: H[n-1], dayLow: L[n-1], wk52High, wk52Low,
    sma20, sma50, sma100, sma200, macd, macdSignal, macdHist, rsi, atr,
    bbUpper, bbMid, bbLower, annualVol,
    pivots, fibLevels, fibExt, swingHigh, swingLow, uptrend,
    bias, score, calls, moves, fundamentals, news, currency: meta.currency || 'INR',
    lastDate: new Date(T[n-1]*1000)
  };
}

/* ---------- render ---------- */
function tileHTML(cls, label, val, sub){
  return `<div class="tile ${cls}"><div class="tlabel">${label}</div><div class="tval">${val}</div>${sub?`<div class="tsub">${sub}</div>`:''}</div>`;
}

function renderAll(m){
  document.getElementById('asOfTag').textContent = 'as of ' + m.lastDate.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});

  /* --- snapshot tiles --- */
  const upDown = m.dayChangePct>=0 ? 'up':'down';
  const srcTag = m.verified ? '✓ 2-source verified' : '⚠ single source';
  let tiles = '';
  tiles += tileHTML(upDown, m.rawSym+' · '+ (m.exch==='NS'?'NSE':'BSE'), '₹'+fmt(m.cmp), fmtPct(m.dayChangePct)+' today · '+srcTag);
  tiles += tileHTML(upDown, 'Day Range', fmt(m.dayLow)+' – '+fmt(m.dayHigh), 'Prev close ₹'+fmt(m.prevClose));
  tiles += tileHTML('neutral', 'Volume', fmtBig(m.volume), '20D avg '+fmtBig(m.avgVol20));
  tiles += tileHTML('gold', '52W Range', fmt(m.wk52Low)+' – '+fmt(m.wk52High), 'CMP is '+(((m.cmp-m.wk52Low)/(m.wk52High-m.wk52Low))*100).toFixed(0)+'% of range');
  tiles += tileHTML(m.bias==='Bullish'?'up':m.bias==='Bearish'?'down':'violet', 'Trend Bias', m.bias, 'Score '+m.score+'/4 signals aligned');
  tiles += tileHTML('violet', 'Annualised Volatility', (m.annualVol*100).toFixed(1)+'%', 'from 1Y daily returns');
  document.getElementById('snapshotTiles').innerHTML = tiles;

  /* --- pivot table --- */
  const p = m.pivots;
  const pivotRows = [
    ['R3', p.R3, 'res'], ['R2', p.R2, 'res'], ['R1', p.R1, 'res'],
    ['Pivot', p.P, 'piv'],
    ['S1', p.S1, 'sup'], ['S2', p.S2, 'sup'], ['S3', p.S3, 'sup'],
  ];
  let pivotHTML = `<tr><th>Level</th><th>Price</th><th>Distance from CMP</th><th>Type</th></tr>`;
  pivotRows.forEach(([label, val, type])=>{
    const dist = ((val-m.cmp)/m.cmp)*100;
    pivotHTML += `<tr><td class="lbl">${label}</td><td>${fmt(val)}</td>
      <td class="${dist>=0?'num-red':'num-green'}">${fmtPct(dist)}</td>
      <td><span class="pill ${type}">${type==='res'?'Resistance':type==='sup'?'Support':'Pivot'}</span></td></tr>`;
  });
  document.getElementById('pivotTable').innerHTML = pivotHTML;

  /* --- fibonacci table --- */
  document.getElementById('fibRangeTag').textContent =
    (m.uptrend?'Retracing down from ':'Retracing up from ') + '₹'+fmt(m.uptrend?m.swingHigh:m.swingLow) +
    ' · 60-session range ₹'+fmt(m.swingHigh-m.swingLow);
  let fibHTML = `<tr><th>Retracement %</th><th>Price Level</th><th>Distance from CMP</th></tr>`;
  m.fibLevels.forEach(f=>{
    const dist = ((f.level-m.cmp)/m.cmp)*100;
    fibHTML += `<tr><td class="lbl">${(f.pct*100).toFixed(1)}%</td><td class="num-gold">${fmt(f.level)}</td>
      <td class="${dist>=0?'num-red':'num-green'}">${fmtPct(dist)}</td></tr>`;
  });
  m.fibExt.forEach(f=>{
    const dist = ((f.level-m.cmp)/m.cmp)*100;
    fibHTML += `<tr><td class="lbl">${(f.pct*100).toFixed(1)}% ext.</td><td>${fmt(f.level)}
      <span class="pill ${m.uptrend?'res':'sup'}">${m.uptrend?'New High Trigger':'New Low Trigger'}</span></td>
      <td class="${dist>=0?'num-red':'num-green'}">${fmtPct(dist)}</td></tr>`;
  });
  document.getElementById('fibTable').innerHTML = fibHTML;
  document.getElementById('fibNote').textContent =
    `A sustained close beyond the ${m.uptrend?'161.8% extension above the recent swing high':'161.8% extension below the recent swing low'} `+
    `(₹${fmt(m.fibExt[1].level)}) confirms a fresh breakout rather than a retracement bounce.`;

  /* --- trading call matrix --- */
  let callHTML = `<tr><th>Horizon</th><th>Bias</th><th>Entry Range</th><th>Stoploss</th><th>Target 1</th><th>Target 2</th><th>Expected Move</th></tr>`;
  m.calls.forEach(c=>{
    const pillCls = c.dir==='Long'?'buy':c.dir==='Short'?'sell':'wait';
    callHTML += `<tr>
      <td class="lbl">${c.label}</td>
      <td><span class="pill ${pillCls}">${c.dir}</span></td>
      <td>${fmt(Math.min(c.entryLow,c.entryHigh))} – ${fmt(Math.max(c.entryLow,c.entryHigh))}</td>
      <td class="num-red">${fmt(c.sl)}</td>
      <td class="num-green">${fmt(c.t1)}</td>
      <td class="num-green">${fmt(c.t2)}</td>
      <td>±${c.expMovePct.toFixed(1)}%</td>
    </tr>`;
  });
  document.getElementById('callTable').innerHTML = callHTML;

  /* --- technical & fundamental tiles --- */
  const f = m.fundamentals;
  let tt = '';
  tt += tileHTML(m.cmp>m.sma50?'up':'down','50 DMA', fmt(m.sma50), m.cmp>m.sma50?'Price above':'Price below');
  tt += tileHTML(m.cmp>m.sma200?'up':'down','200 DMA', fmt(m.sma200), m.cmp>m.sma200?'Price above':'Price below');
  tt += tileHTML(m.rsi>70?'down':m.rsi<30?'up':'neutral','RSI (14)', m.rsi?m.rsi.toFixed(1):'—', m.rsi>70?'Overbought zone':m.rsi<30?'Oversold zone':'Neutral zone');
  tt += tileHTML(m.macdHist>0?'up':'down','MACD Histogram', m.macdHist?m.macdHist.toFixed(2):'—', m.macdHist>0?'Bullish momentum':'Bearish momentum');
  tt += tileHTML('gold','ATR (14)', fmt(m.atr), ((m.atr/m.cmp)*100).toFixed(1)+'% of price');
  tt += tileHTML('neutral','Bollinger Band', fmt(m.bbLower)+' – '+fmt(m.bbUpper), 'Mid '+fmt(m.bbMid));
  tt += tileHTML('violet','P/E (TTM)', f.pe?f.pe.toFixed(1):'—', f.eps?('EPS ₹'+f.eps.toFixed(2)):'');
  tt += tileHTML('violet','Market Cap', f.marketCap?fmtBig(f.marketCap):'—', f.beta?('Beta '+f.beta.toFixed(2)):'');
  document.getElementById('techTiles').innerHTML = tt;

  /* --- summary grid --- */
  const sg = [
    ['Today', m.moves.day], ['Last 1 Week', m.moves.week],
    ['Last 1 Month', m.moves.month], ['Last 1 Quarter', m.moves.quarter]
  ];
  document.getElementById('summaryGrid').innerHTML = sg.map(([label,val])=>
    `<div class="summarycard"><div class="slabel">${label}</div>
     <div class="sval ${val>=0?'num-green':'num-red'}">${fmtPct(val)}</div></div>`
  ).join('');

  /* --- outlook --- */
  const nearestSup = [p.S1,p.S2,p.S3].filter(v=>v<m.cmp).sort((a,b)=>b-a)[0];
  const nearestRes = [p.R1,p.R2,p.R3].filter(v=>v>m.cmp).sort((a,b)=>a-b)[0];
  const distTo52wHigh = ((m.wk52High-m.cmp)/m.cmp*100).toFixed(1);
  const distTo52wLow = ((m.cmp-m.wk52Low)/m.cmp*100).toFixed(1);
  document.getElementById('outlookBox').innerHTML = `
    <b>${m.companyName} (${m.rawSym})</b> is trading at <b>₹${fmt(m.cmp)}</b>, ${fmtPct(m.dayChangePct)} on the day,
    with a <b>${m.bias}</b> structural bias (${m.score}/4 trend signals aligned: price vs 50/200 DMA, MACD momentum, RSI).
    The stock sits ${distTo52wHigh}% below its 52-week high and ${distTo52wLow}% above its 52-week low.
    Immediate support is layered near <b>₹${fmt(nearestSup)}</b>, with resistance capping upside near <b>₹${fmt(nearestRes)}</b>.
    RSI at ${m.rsi?m.rsi.toFixed(1):'—'} is in ${m.rsi>70?'overbought':m.rsi<30?'oversold':'neutral'} territory,
    and MACD histogram is ${m.macdHist>0?'positive, favouring continued upside momentum':'negative, favouring continued downside pressure'}.
    <br><br>
    <b>From here:</b> ${
      m.bias==='Bullish'
        ? `a hold-above ₹${fmt(nearestSup)} keeps the structure intact for a push toward the ${m.uptrend?'161.8% extension at ₹'+fmt(m.fibExt[1].level):'R2/R3 pivot band'}; a break below flips the bias toward the pivot-support cluster.`
        : m.bias==='Bearish'
        ? `a failure to reclaim ₹${fmt(nearestRes)} keeps pressure toward the ${m.uptrend?'S2/S3 pivot band':'161.8% extension at ₹'+fmt(m.fibExt[1].level)}; a strong reclaim of the 50 DMA would be the first sign of a bias shift.`
        : `the stock is oscillating without a clear trend — the 15-day and 1-month call rows above frame both the breakout-up and breakdown-down triggers to watch rather than a single directional bet.`
    }
  `;

  /* --- news --- */
  if (m.news.length){
    document.getElementById('newsBox').innerHTML = m.news.map(n=>{
      let d = n.date ? new Date(n.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '';
      return `<div class="newsitem"><a href="${n.link}" target="_blank" rel="noopener">${n.title}</a><div class="newsdate">${d}</div></div>`;
    }).join('');
  } else {
    document.getElementById('newsBox').innerHTML = `<div class="newsitem" style="color:var(--text-faint)">No recent headlines retrieved — news source may be rate-limited right now.</div>`;
  }
}

/* allow Enter key to trigger search */
document.addEventListener('DOMContentLoaded', ()=>{
  const inp = document.getElementById('symbolInput');
  if (inp) inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter') runAnalysis(); });
});
