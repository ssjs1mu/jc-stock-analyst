# One-time setup (about 3 minutes, free)
1. Google Drive -> New -> Google Sheets -> name it "JC Reports Analytics".
2. In the sheet: Extensions -> Apps Script. Delete the sample code, paste all of `Code.gs`, Save.
3. Deploy -> New deployment -> type "Web app" -> Execute as: **Me**, Who has access: **Anyone** -> Deploy -> allow access -> copy the web-app URL.
4. Paste that URL into `ENDPOINT` at the top of `analytics.js` (or just send it to Claude), and into `stats/index.html` (`ENDPOINT`).
Sheets created automatically: view, depth, open, feedback. Every row has IST time, report, report date, language, anonymous device id and name (if the reader typed one).
