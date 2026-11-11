/* Joshi's Corner — Client Reports in Excel (.xlsx), built in the browser with a tiny built-in writer (no library, no network).
   Morning workbook : Day Trading calls + Short-Term (swing) calls + Key levels, every row with CMP.
   Closing workbook : Next-Day plan + Short-Term calls + Key levels + Today's review, every row with CMP.
   Clear calls only (BUY / SELL / NO TRADE …) with entry, stop-loss, targets and the levels to watch. No news. Rule-based research input, not advice. */
(function () {
  'use strict';
  const num = (v) => typeof v === 'number' && isFinite(v);
  const r2 = (v) => (num(v) ? Math.round(v * 100) / 100 : null);

  /* ---------- minimal xlsx writer: zip (stored) + SpreadsheetML ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder();
  function zip(files) {
    const parts = [], cen = []; let off = 0;
    const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    files.forEach((f) => {
      const nm = enc.encode(f.name), d = enc.encode(f.data), c = crc32(d);
      const lh = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nm.length), 0, 0]);
      parts.push(lh, nm, d);
      cen.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nm.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), nm);
      off += lh.length + nm.length + d.length;
    });
    let cs = 0; cen.forEach((b) => { cs += b.length; });
    const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), 0, 0]);
    return new Blob(parts.concat(cen, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const X = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const colL = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  /* styles: 0 plain · 1 header · 2 number 0.00 · 3 green bold · 4 red bold · 5 amber bold · 6 title · 7 wrap · 8 percent-ish number 0.00 · 9 note(small grey) · 10 bold */
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="8"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFF8E7A1"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FF15803D"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFB91C1C"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFA16207"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF8A6D1F"/><name val="Calibri"/></font><font><sz val="8"/><color rgb="FF64748B"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="7" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  function sheetXml(sh) {
    const rows = sh.rows, ncol = Math.max.apply(null, rows.map((r) => r.length).concat([1]));
    let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0">${sh.freeze ? `<pane xSplit="${sh.freeze[0]}" ySplit="${sh.freeze[1]}" topLeftCell="${colL(sh.freeze[0])}${sh.freeze[1] + 1}" activePane="bottomRight" state="frozen"/>` : ''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${(sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>`;
    rows.forEach((r, ri) => {
      x += `<row r="${ri + 1}"${r.h ? ` ht="${r.h}" customHeight="1"` : ''}>`;
      r.forEach((c, ci) => {
        if (c == null) return; const o = typeof c === 'object' ? c : { v: c }, ref = colL(ci) + (ri + 1), s = o.s != null ? o.s : (num(o.v) ? 2 : 0);
        if (o.v == null || o.v === '') x += `<c r="${ref}" s="${s}"/>`; else if (num(o.v)) x += `<c r="${ref}" s="${s}"><v>${o.v}</v></c>`; else x += `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${X(o.v)}</t></is></c>`;
      });
      x += '</row>';
    });
    x += `</sheetData>${sh.filter ? `<autoFilter ref="A${sh.filter}:${colL(ncol - 1)}${rows.length}"/>` : ''}<pageMargins left=".4" right=".4" top=".5" bottom=".5"/><pageSetup orientation="landscape" fitToHeight="0"/></worksheet>`;
    return x;
  }
  function workbook(sheets) {
    const f = [{ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${X(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: STYLES }].concat(sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })));
    return zip(f);
  }

  /* ---------- one record -> plain trading rows (JSON-safe, kept in the cache so the file can be re-downloaded) ---------- */
  function levelsOf(r) {
    const cmp = r.cmp, p = r.piv || {}, L = [['Pivot R2', p.R2], ['Pivot R1', p.R1], ['CPR top', p.cprTop], ['Pivot', p.P], ['CPR bottom', p.cprBot], ['Pivot S1', p.S1], ['Pivot S2', p.S2], ['Prev high', r.ph], ['Prev low', r.pl], ['20-day high', r.hi20], ['20-day low', r.lo20], ['52-week high', r.hi52], ['52-week low', r.lo52], ['20-day EMA', r.e20], ['50-day EMA', r.e50], ['200-day EMA', r.e200]].filter((l) => num(l[1]));
    return { res: L.filter((l) => l[1] > cmp * 1.001).sort((a, b) => a[1] - b[1]), sup: L.filter((l) => l[1] < cmp * 0.999).sort((a, b) => b[1] - a[1]) };
  }
  function swing(r) {
    const cmp = r.cmp, a = num(r.atr) ? r.atr : cmp * 0.02, kind = r.T.kind, type = r.T.type, Lv = levelsOf(r), res = Lv.res, sup = Lv.sup, st = r.st[0];
    const out = { call: 'WAIT', entryLo: null, entryHi: null, sl: null, t1: null, t2: null, rr: null, note: '', trig: null };
    const buyType = kind === 'up' && type !== 'ext' && type !== 'top' && type !== 'dist';
    if (type === 'ext') { out.call = 'HOLD — DON’T CHASE'; out.note = 'Stretched: add only on a dip toward ' + (sup[0] ? sup[0][0] + ' ' + r2(sup[0][1]) : 'support'); }
    else if (type === 'top' || type === 'dist') { out.call = 'BOOK PROFIT / REDUCE'; out.note = 'Topping risk: trend breaks on a close below ' + r2(r.T.invalid || (sup[0] && sup[0][1])); }
    else if (kind === 'down') { out.call = type === 'dead' ? 'AVOID — SELL ON RISE' : 'AVOID'; out.note = 'No base yet. Reconsider only on a close above ' + r2(r.T.invalid); }
    else if (kind === 'side') { out.call = 'WAIT — BUY ABOVE ' + r2(r.hi20); out.trig = r.hi20; out.note = 'Range ' + r2(r.lo20) + ' – ' + r2(r.hi20) + ': act on a close beyond it, ideally on 1.5× volume'; }
    if (buyType || kind === 'side') {
      let eLo, eHi, E;
      if (buyType) { const near = sup.find((l) => cmp - l[1] >= 0.25 * a && cmp - l[1] <= 1.6 * a); eLo = near ? near[1] : cmp - 0.8 * a; eHi = cmp; out.call = type === 'pull' ? 'BUY ON DIPS (pull-back)' : type === 'brk' ? 'BUY / HOLD (fresh breakout)' : 'BUY ON DIPS'; }
      else { eLo = r.hi20; eHi = r.hi20 + 0.15 * a; }
      E = (eLo + eHi) / 2;
      const below = sup.find((l) => l[1] < eLo - 0.3 * a); let S = below ? below[1] - 0.25 * a : eLo - 1.2 * a; if (E - S > 3 * a) S = E - 3 * a; if (num(r.T.invalid) && r.T.invalid < eLo && E - r.T.invalid <= 3 * a && kind === 'up') S = Math.min(S, r.T.invalid - 0.1 * a);
      const risk = Math.max(1e-9, E - S), t1c = res.find((l) => l[1] - E >= 0.6 * a), T1 = t1c ? t1c[1] : E + 1.2 * a, t2c = res.find((l) => l[1] - T1 >= 0.5 * a), T2 = t2c ? t2c[1] : T1 + 1.3 * a;
      Object.assign(out, { entryLo: r2(eLo), entryHi: r2(eHi), sl: r2(S), t1: r2(T1), t2: r2(T2), rr: Math.round(((T1 - E) / risk + (T2 - E) / risk) / 2 * 10) / 10, t1w: t1c ? t1c[0] : 'ATR', t2w: t2c ? t2c[0] : 'ATR' });
      if (out.rr < 1.5 && buyType) { out.call = 'WAIT — ENTRY NOT ATTRACTIVE'; out.note = 'Trend is up but reward:risk is only 1:' + out.rr + ' from here; buy only near ' + r2(eLo) + ' or on a fresh breakout. ' + out.note; }
      if (kind === 'side') out.note = 'Enter only on a close above ' + r2(r.hi20) + '. ' + out.note;
      if (buyType && !out.note) out.note = 'Stop on a daily CLOSE below ' + r2(S) + '. Trend stays up while ' + r2(r.T.invalid) + ' holds';
    }
    out.stance = st; out.conv = r.conv; out.trend = r.T.state;
    return out;
  }
  function rows(recs, mode) {
    const ok = recs.filter((r) => !r.err).sort((a, b) => b.conv - a.conv || Math.abs(b.S) - Math.abs(a.S));
    return ok.map((r) => {
      const lv = levelsOf(r), s = swing(r), p = r.piv || {}, d = r.day;
      const day = d.go ? { call: d.side, entry: r2(d.entry), sl: r2(d.sl), t1: r2(d.t1), t2: r2(d.t2), rr: num(d.rr) ? Math.round(d.rr * 10) / 10 : null, grade: d.grade, note: (d.side === 'BUY' ? 'Buy on a 5-min close above ' : 'Sell on a 5-min close below ') + r2(d.entry) + '; skip if it gaps beyond the entry; square off by 3:15 PM' } : { call: 'NO TRADE', note: (d.why || []).join(' · ') || 'confluence not met', grade: '' };
      const tdy = r.tdy ? (r.tdy.call ? { s: r.tdy.side + ' above ' + r2(r.tdy.entry), res: ({ T2: 'Target 2 reached', T1: 'Target 1 reached', SL: 'Stop-loss hit', NT: 'Not triggered', SKIP: 'Skipped (gap)', WAIT: 'Not triggered', LIVE: 'Still open', 'EOD+': 'Closed in profit', 'EOD−': 'Closed at a loss' }[r.tdy.state] || r.tdy.state) } : { s: 'No call issued', res: '—' }) : null;
      return { sym: r.sym, name: r.name, cmp: r2(r.cmp), chg: r2(r.chg), conv: r.conv, dir: r.dir, day, sw: s, up: lv.res.slice(0, 3).map((l) => l[0] + ' ' + r2(l[1])), dn: lv.sup.slice(0, 3).map((l) => l[0] + ' ' + r2(l[1])), piv: { R2: r2(p.R2), R1: r2(p.R1), cprTop: r2(p.cprTop), P: r2(p.P), cprBot: r2(p.cprBot), S1: r2(p.S1), S2: r2(p.S2) }, ph: r2(r.ph), pl: r2(r.pl), pc: r2(r.pc), hi20: r2(r.hi20), lo20: r2(r.lo20), hi52: r2(r.hi52), lo52: r2(r.lo52), e20: r2(r.e20), e50: r2(r.e50), e200: r2(r.e200), tdy, rv: r2(r.rv), rsi: r2(r.rsi) };
    });
  }

  /* ---------- sheets ---------- */
  const H = (a) => a.map((t) => ({ v: t, s: 1 }));
  const cs = (call) => (/^BUY|^HOLD|^BUY/.test(call) && !/AVOID/.test(call) ? 3 : /^SELL|AVOID|REDUCE|PROFIT/.test(call) ? 4 : 5);
  function build(D, mode, listName) {
    const dt = new Date(Date.now() + 19800000), ds = dt.toISOString().slice(0, 10).split('-').reverse().join('-'), ts = dt.toISOString().slice(11, 16), morning = mode === 'morning';
    const title = (t) => [{ v: `Joshi’s Corner · SSJ Finance — ${t}`, s: 6 }];
    const info = [{ v: `${listName} · ${ds} ${ts} IST · CMP = last price at build time (delayed)`, s: 9 }];
    const foot = [{ v: 'Rule-based research input from delayed market data. Not investment advice. Levels can fail; apply your own stop-loss and position size.', s: 9 }];
    // sheet 1: day / next day
    const h1 = [morning ? 'Today’s day-trading plan' : 'Next-session plan'];
    const s1 = { name: morning ? 'Day Trading' : 'Next Day', freeze: [2, 4], filter: 4, widths: [11, 10, 8, 14, 10, 10, 10, 10, 7, 7, 32, 30, 30, 52], rows: [title(morning ? 'Day Trading calls' : 'Next-day view'), info, [],
      H(['Stock', 'CMP', 'Day %', 'Call', 'Entry (trigger)', 'Stop-loss', 'Target 1', 'Target 2', 'R:R', 'Grade', 'Support to watch (nearest first)', 'Resistance to watch (nearest first)', morning ? 'Conviction' : 'Today’s result of this morning’s call', 'How to trade it'])] };
    s1.rows[3].h = 30;
    D.forEach((x) => { const d = x.day; s1.rows.push([{ v: x.sym, s: 10 }, x.cmp, { v: x.chg, s: x.chg >= 0 ? 3 : 4 }, { v: d.call, s: d.call === 'BUY' ? 3 : d.call === 'SELL' ? 4 : 5 }, d.entry, d.sl, d.t1, d.t2, { v: d.rr, s: 2 }, { v: d.grade || '', s: 0 }, { v: x.dn.join('  |  '), s: 7 }, { v: x.up.join('  |  '), s: 7 }, morning ? { v: x.conv + '% · ' + x.dir, s: 0 } : { v: x.tdy ? x.tdy.s + ' → ' + x.tdy.res : '—', s: 7 }, { v: d.note, s: 7 }]); });
    s1.rows.push([], foot);
    // sheet 2: short term
    const s2 = { name: 'Short Term', freeze: [2, 4], filter: 4, widths: [11, 10, 8, 26, 10, 10, 10, 10, 10, 8, 9, 22, 60], rows: [title('Short-term (swing, 1–4 weeks) calls'), info, [], H(['Stock', 'CMP', 'Day %', 'Call', 'Entry from', 'Entry to', 'Stop-loss (daily close)', 'Target 1', 'Target 2', 'R:R', 'Conv. %', 'Trend', 'Note / trigger'])] };
    s2.rows[3].h = 30;
    D.forEach((x) => { const w = x.sw; s2.rows.push([{ v: x.sym, s: 10 }, x.cmp, { v: x.chg, s: x.chg >= 0 ? 3 : 4 }, { v: w.call, s: cs(w.call) }, w.entryLo, w.entryHi, w.sl, w.t1, w.t2, { v: w.rr, s: 2 }, { v: x.conv, s: 0 }, { v: String(w.trend || '').replace('UPTREND — ', '↑ ').replace('DOWNTREND — ', '↓ ').replace('SIDEWAYS — ', '↔ '), s: 7 }, { v: w.note, s: 7 }]); });
    s2.rows.push([], [{ v: 'Stop-loss on a daily CLOSE basis. Targets are the nearest resistance levels above entry; R:R is the average of Target 1 and Target 2.', s: 9 }], foot);
    // sheet 3: levels
    const s3 = { name: 'Key Levels', freeze: [2, 4], filter: 4, widths: [11, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], rows: [title(morning ? 'Key levels for today' : 'Key levels for the next session'), info, [], H(['Stock', 'CMP', 'Pivot R2', 'Pivot R1', 'CPR top', 'Pivot', 'CPR bottom', 'Pivot S1', 'Pivot S2', 'Prev high', 'Prev low', 'Prev close', '20-day high', '20-day low', '20 EMA', '50 EMA', '200 EMA', '52-wk high', '52-wk low'])] };
    s3.widths.push(10); s3.rows[3].h = 30;
    D.forEach((x) => s3.rows.push([{ v: x.sym, s: 10 }, { v: x.cmp, s: 8 }, x.piv.R2, x.piv.R1, x.piv.cprTop, x.piv.P, x.piv.cprBot, x.piv.S1, x.piv.S2, x.ph, x.pl, x.pc, x.hi20, x.lo20, x.e20, x.e50, x.e200, x.hi52, x.lo52]));
    s3.rows.push([], [{ v: 'Pivots, CPR and previous high / low / close are for ' + (morning ? 'today’s session (from yesterday’s bar)' : 'the NEXT session (from today’s bar)') + '. Above R1 / CPR top = strength; below S1 / CPR bottom = weakness.', s: 9 }], foot);
    return [s1, s2, s3];
  }
  function download(D, mode, listName) {
    const sheets = build(D, mode, listName), blob = workbook(sheets), t = new Date(Date.now() + 19800000).toISOString(), nm = (mode === 'morning' ? 'Morning' : 'Closing') + '_' + String(listName).replace(/[^A-Za-z0-9]+/g, '_') + '_' + t.slice(2, 4) + t.slice(5, 7) + t.slice(8, 10) + '-' + t.slice(11, 13) + t.slice(14, 16) + '.xlsx';
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nm; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return nm;
  }
  const api = { rows, build, workbook, download };
  if (typeof window !== 'undefined') window.JCXL = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
