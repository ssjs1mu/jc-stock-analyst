/* Joshi's Corner — Client dashboards: link each client watchlist to a Telegram chat and a private dashboard link, from the Client reports page.
   - Admin passcode (set here once) locks the watchlists on the Drive backend; it is kept only in this browser (localStorage) and typed by you.
   - A linked client's stock list is stored separately (Drive: JC_Clients.json) with dated backups (Drive folder JC_Backups). Editing/deleting the terminal
     watchlist never removes it: the terminal only ADDS new stocks; removing stocks or the client is an explicit action here, and removed clients are kept in a trash copy.
   - No client names or lists are ever written to the public repository. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { draft: {}, locked: null, ok: false, clients: [], trash: 0, msg: '', err: '', chats: [], bot: '', edit: null, busy: false, synced: false };
  async function api(action, extra) {
    const be = getBackend(); if (!be) throw new Error('Data backend not set');
    let r, txt;
    try { r = await fetch(be, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, key: admKey() }, extra || {})) }); txt = await r.text(); }
    catch (e) { throw new Error(await diagnose(be, e)); }
    let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('The backend answered with a web page instead of data (' + txt.slice(0, 80).replace(/\s+/g, ' ') + '…). It is usually a sign-in or permission page — open the backend link in this browser once, or redeploy it as "Anyone".'); } if (j.error) { const e = new Error(j.error); e.code = j.error; throw e; } return j;
  }
  async function diagnose(be, e) {
    const tail = '…' + String(be).slice(-14);
    let ping = null; try { const r = await fetch(be + (be.indexOf('?') < 0 ? '?' : '&') + 'action=ping&t=' + Date.now()); ping = JSON.parse(await r.text()); } catch (x) { ping = null; }
    if (ping && ping.ok) return 'The backend (' + tail + ') answers reads but refused the secure request (' + (e.message || 'failed') + '). Reload the page with Ctrl+F5 so the newest files load; if it stays, sign out of other Google accounts in this browser and retry.';
    return 'Cannot reach the data backend (' + tail + ') — ' + (e.message || 'failed') + '. Check the internet connection and that the Data backend link saved in this terminal is the current /exec URL (Settings › Data backend). Ad-blockers or a VPN can also block script.google.com.';
  }
  const lists = () => (typeof WL !== 'undefined' && WL.store && WL.store.lists) || [];
  async function load() {
    if (S.busy) return; S.busy = true; S.err = '';
    try {
      const st = await api('adm_status'); S.locked = !!st.locked; S.ok = false;
      if (S.locked && admKey()) { try { const j = await api('cl_list'); S.clients = j.clients || []; S.trash = j.trash || 0; S.ok = true; await autoSync(); } catch (e) { if (/passcode/.test(e.message)) { S.err = 'That passcode was not accepted.'; } else throw e; } }
    } catch (e) { S.err = e.message || 'failed'; if (/unknown action/.test(S.err)) S.err = 'The data backend is the old version — redeploy Code.gs.'; }
    S.busy = false; draw();
  }
  /* additive only: new stocks in a terminal watchlist are copied to its linked client; nothing is ever removed this way */
  async function autoSync() {
    let changed = false;
    for (const c of S.clients) { const l = lists().find((x) => x.id === c.listId); if (!l) continue; const have = new Set(c.syms); const add = l.syms.filter((s) => !have.has(s)); if (add.length) { try { await api('cl_merge', { id: c.id, syms: add }); changed = true; } catch (e) { } } }
    if (changed) { const j = await api('cl_list'); S.clients = j.clients || []; }
  }
  const msg = (m, bad) => { S.msg = (bad ? '⚠ ' : '✓ ') + m; draw(); };
  const row = (l, c) => {
    const dv = (f, d) => { const k = l.id + '|' + f; return S.draft[k] != null ? S.draft[k] : d; };
    const nm = dv('name', c ? c.name : l.name), ch = dv('chat', c ? c.chat || '' : '');
    return `<tr data-l="${E(l.id)}"><td><b>${E(l.name)}</b><br><small>${l.syms.length} in terminal</small></td>
      <td><input class="cdn" data-f="name" value="${E(nm)}" style="width:120px"></td>
      <td><input class="cdn" data-f="chat" list="cdChats" value="${E(ch)}" placeholder="Telegram chat id" style="width:140px">${c && !c.chat && !ch ? '<br><small style="color:#b3261e">no chat id saved yet</small>' : ''}</td>
      <td>${c ? `<span class="pos">● Linked</span> · ${c.syms.length} stocks kept<br><small>safe in Drive + backups</small>` : '<span style="color:#8a94ad">Not linked</span>'}</td>
      <td>${c ? `<button class="ghostBtn" data-a="save">Save</button> <button class="ghostBtn" data-a="send">📨 Send dashboard now</button> <button class="ghostBtn" data-a="copy">🔗 Copy link</button> <button class="ghostBtn" data-a="stocks">✎ Stocks</button> <button class="ghostBtn" data-a="del" style="color:#b3261e">Remove client</button>` : `<button class="goBtn" data-a="link">Link client</button>`}</td></tr>
      ${S.edit && c && S.edit === c.id ? `<tr><td colspan="5"><div class="note">Stocks kept for ${E(c.name)} (comma separated). Saving here <b>replaces</b> the client's list — this is the only place stocks are removed.<br><textarea id="cdSyms" style="width:100%;height:70px">${E(c.syms.join(', '))}</textarea><br><button class="goBtn" data-a="saveSyms" data-c="${E(c.id)}">Save stocks</button> <button class="ghostBtn" data-a="cancel">Cancel</button></div></td></tr>` : ''}`;
  };
  function draw() {
    const el = $('cdBox'); if (!el) return; let h = `<h3 style="margin:14px 0 4px">📱 Client dashboards (Telegram)</h3>`;
    if (S.locked === null) h += `<div class="note">${S.err ? '⚠ ' + E(S.err) : 'Loading…'}</div>`;
    else if (!S.locked) h += `<div class="note"><b>Watchlists are not locked yet.</b> Anyone holding your data-backend link can read them. Choose an admin passcode (8+ characters, you will type it on each device you use). It is stored only as a salted hash on the backend.<br><input type="password" id="cdPass" placeholder="New admin passcode" style="padding:5px 8px"> <button class="goBtn" data-a="claim">Set passcode &amp; lock</button><br><small>Forgot it later? Delete the Script properties ADM_H and ADM_S in Apps Script to reset — your data is not touched.</small></div>`;
    else if (!S.ok) h += `<div class="note">🔒 Locked. Enter the admin passcode to manage client dashboards and to sync watchlists on this device.${S.err ? '<br><b>' + E(S.err) + '</b>' : ''}<br><input type="password" id="cdPass" placeholder="Admin passcode" style="padding:5px 8px"> <button class="goBtn" data-a="unlock">Unlock</button></div>`;
    else {
      const used = new Set(S.clients.map((c) => c.listId)), orphan = S.clients.filter((c) => !lists().some((l) => l.id === c.listId));
      h += `<div class="note" style="font-size:12px">Pick the Telegram chat for each client, press <b>Link client</b>, then <b>Send dashboard now</b>. The client sees a button in Telegram that opens their private dashboard; every weekday morning (08:20–10:00 IST) the button is sent again automatically.
        <br>🔒 Watchlists are locked behind your passcode. 🗄 A linked client's stocks are stored separately and backed up automatically — editing or deleting the terminal watchlist never removes them; new stocks you add are copied across, removals and client deletion happen only here.
        <br><button class="ghostBtn" data-a="chats">🔎 Find Telegram users who pressed Start on the bot</button>${S.bot ? ` <small>Bot: <b>@${E(S.bot)}</b> — each client must open it and press Start once.</small>` : ''}</div>
        <datalist id="cdChats">${S.chats.map((c) => `<option value="${E(c.chat)}">${E(c.name)}${c.username ? ' @' + E(c.username) : ''}</option>`).join('')}</datalist>
        ${S.chats.length ? `<div style="font-size:12px;margin:4px 0">Chats that started the bot: ${S.chats.map((c) => `<code>${E(c.chat)}</code> ${E(c.name)}`).join(' · ')}</div>` : ''}
        <table class="cl"><thead><tr><th>Watchlist</th><th>Client first name</th><th>Telegram chat id</th><th>Status</th><th></th></tr></thead><tbody>${lists().map((l) => row(l, S.clients.find((c) => c.listId === l.id))).join('')}${orphan.map((c) => row({ id: c.listId, name: (c.listName || c.name) + ' (terminal list gone — client kept)', syms: [] }, c)).join('')}</tbody></table>
        ${S.trash ? `<div style="font-size:11px;color:#5a6a8e">${S.trash} removed client(s) are kept in the Drive trash copy of JC_Clients.json and in JC_Backups.</div>` : ''}`;
    }
    if (S.msg) h += `<div style="font-size:12.5px;margin:6px 0">${E(S.msg)}</div>`;
    el.innerHTML = h;
  }
  async function act(a, tr, t) {
    const lid = tr && tr.getAttribute('data-l'), c = S.clients.find((x) => x.listId === lid), g = (f) => { const i = tr && tr.querySelector('[data-f="' + f + '"]'); return i ? i.value.trim() : ''; };
    try {
      if (a === 'claim' || a === 'unlock') { const k = ($('cdPass') || {}).value || ''; if (a === 'claim') { if (k.length < 8) return msg('Use at least 8 characters', 1); const r = await (async () => { const be = getBackend(); const x = await fetch(be, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'adm_claim', key: k }) }); return JSON.parse(await x.text()); })(); if (r.error) return msg(r.error, 1); }
        try { localStorage.setItem('jc_admin_key', k); } catch (e) { } S.msg = ''; await load(); if (S.ok) { msg(a === 'claim' ? 'Locked. Watchlists now need this passcode.' : 'Unlocked.'); if (typeof wlDriveSync === 'function') wlDriveSync(); } return; }
      if (a === 'chats') { const j = await api('tg_updates'); S.chats = j.chats || []; S.bot = j.bot || ''; return msg(S.chats.length ? S.chats.length + ' chat(s) found' : 'No one has pressed Start on the bot recently (Telegram keeps this list for 24 hours)', !S.chats.length); }
      if (a === 'link') { const l = lists().find((x) => x.id === lid); if (!l) return; const lk = { listId: l.id, listName: l.name, name: g('name') || l.name, syms: l.syms }; if (g('chat')) lk.chat = g('chat'); const j = await api('cl_link', lk); S.clients = (await api('cl_list')).clients; return msg('Linked ' + j.client.name + ' — ' + j.client.syms.length + ' stocks saved to Drive' + (j.client.chat ? '' : ' (add the Telegram chat id to send messages)')); }
      if (!c && a !== 'cancel') return;
      if (a === 'save') { const sv = {}; if (g('name')) sv.name = g('name'); if (g('chat')) sv.chat = g('chat'); await api('cl_set', Object.assign({ id: c.id }, sv)); S.clients = (await api('cl_list')).clients; if (sv.chat) delete S.draft[lid + '|chat']; return msg('Saved' + (sv.chat ? ' — chat id stored' : ' (no chat id entered)')); }
      if (a === 'send') { const sv = {}; if (g('name')) sv.name = g('name'); if (g('chat')) sv.chat = g('chat'); await api('cl_set', Object.assign({ id: c.id }, sv)); S.clients = (await api('cl_list')).clients; const cc = S.clients.find((x) => x.id === c.id); if (!cc || !cc.chat) return msg('No Telegram chat id is saved for ' + c.name + '. Type the chat id in the row (or use “Find Telegram users”), then press Send again.', 1); const j = await api('cl_send', { id: c.id }); S.clients = (await api('cl_list')).clients; return msg(j.ok ? 'Dashboard sent to ' + c.name + ' on Telegram' : 'Telegram said: ' + j.msg + (/chat not found|blocked|Forbidden/i.test(j.msg) ? ' — the client must open the bot and press Start first' : ''), !j.ok); }
      if (a === 'copy') { try { await navigator.clipboard.writeText(c.link); msg('Link copied — private to ' + c.name + ', do not post it publicly'); } catch (e) { prompt('Copy this private link', c.link); } return; }
      if (a === 'stocks') { S.edit = c.id; return draw(); }
      if (a === 'cancel') { S.edit = null; return draw(); }
      if (a === 'saveSyms') { const arr = ($('cdSyms').value || '').split(/[\s,;]+/).filter(Boolean); await api('cl_set', { id: t.getAttribute('data-c'), syms: arr }); S.edit = null; S.clients = (await api('cl_list')).clients; return msg('Stocks saved'); }
      if (a === 'del') { if (!confirm('Remove client "' + c.name + '"?\n\nTheir dashboard link stops working. Their record is kept in the backup trash, and the terminal watchlist is not touched.')) return; await api('cl_delete', { id: c.id }); const j = await api('cl_list'); S.clients = j.clients; S.trash = j.trash; return msg('Client removed (kept in backup trash)'); }
    } catch (e) { msg(e.message || 'failed', 1); }
  }
  document.addEventListener('input', (e) => { const i = e.target; if (i && i.matches && i.matches('#cdBox input[data-f]')) { const tr = i.closest('tr'); S.draft[tr.getAttribute('data-l') + '|' + i.getAttribute('data-f')] = i.value; } });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('#cdBox [data-a]'); if (b) act(b.getAttribute('data-a'), b.closest('tr'), b); });
  function mount() {
    const p = $('pClient'); if (!p) return; if (!$('cdBox')) { const d = document.createElement('div'); d.id = 'cdBox'; d.className = 'crb'; p.appendChild(d); draw(); if (!S.synced && p.classList.contains('active')) { S.synced = true; load(); } }
  }
  setInterval(mount, 1500); /* cheap: clientrep repaints #pClient and wipes the box, so it is re-added and redrawn from state */
})();
