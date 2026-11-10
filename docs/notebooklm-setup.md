# NotebookLM infographics - one-time setup (on your own computer, about 5 minutes)
The daily infographic is drawn by Google NotebookLM under the dedicated account **jc.group.ai@gmail.com**.
GitHub needs a login token for that account. Only you can create it; never paste it into a chat or a file in the repo.

1. Install Python 3.10+ if it is not there, then in a terminal:
   `pip install "notebooklm-py[browser,headless]"`
2. `notebooklm login --master-token --account jc.group.ai@gmail.com`  - a browser opens; sign in to that account.
3. Open the file it created: `~/.notebooklm/profiles/default/master_token.json` (Windows: `C:\\Users\\<you>\\.notebooklm\\profiles\\default\\master_token.json`) and copy ALL of its text.
4. GitHub -> repo `jc-stock-analyst` -> Settings -> Secrets and variables -> Actions -> New repository secret
   Name: `NOTEBOOKLM_MASTER_TOKEN_JSON`   Value: paste -> Add secret.
From the next report onward an "AI infographic" page appears at the end of the English booklet and in the Reports tab.

Safety built in: the picture is published only if every key figure can be read back from it; otherwise it is rejected
and the normal report is unaffected. The token gives full access to that Google account - keep it for this account only.
To switch it off: delete the secret.
