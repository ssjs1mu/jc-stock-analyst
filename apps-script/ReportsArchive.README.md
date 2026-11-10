# Drive archive - one-time setup (about 3 minutes, free)
1. Open script.google.com -> New project -> name it "JC Reports Archive".
2. Delete the sample code, paste all of `ReportsArchive.standalone.gs`, Save.
3. Choose the function `setup` in the toolbar and press Run. Allow access when Google asks (Drive + external requests).
   This creates the Drive folder "JC Reports Archive", starts an hourly copy and copies the first batch.
4. Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone -> Deploy. Copy the /exec URL.
5. Put the URL into `data/archive.json` ("url"), or send it to Claude.
From then on: Drive receives every new report file within the hour; the website keeps the last 15 days.
