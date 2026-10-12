/* Kursbuch is intentionally framework-free so it can be deployed on GitHub Pages. */
const STORE = { accounts: "kursbuch_accounts_v1", entries: "kursbuch_entries_v1", session: "kursbuch_session_v1" };
const ADMIN_PASSWORD = "Ameisenkacke127.3";
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const today = () => new Date().toISOString().slice(0, 10);

const state = {
  filter: "all", authMode: "login", entryType: "quote", editingEntryId: null,
  accounts: load(STORE.accounts, []), entries: load(STORE.entries, []), session: load(STORE.session, null)
};
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHTML(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function formatDate(date) { return new Intl.DateTimeFormat("de-DE", { day:"2-digit", month:"short", year:"numeric" }).format(new Date(`${date}T12:00:00`)); }

function render() { renderAccount(); renderStats(); renderEntries(); }
function renderAccount() {
  const button = $("#account-button");
  const adminButton = $("#admin-panel-button");
  const settingsButton = $("#account-settings-button");
  adminButton.hidden = !state.session?.isAdmin;
  settingsButton.hidden = !state.session || Boolean(state.session?.isAdmin);
  if (!state.session) { button.textContent = "Anmelden"; return; }
  button.textContent = state.session.isAdmin ? "Admin · Abmelden" : `${state.session.name} · Abmelden`;
}
function renderStats() {
  $("#stat-strip").hidden = !state.session;
  const quotes = state.entries.filter(e => e.type === "quote").length;
  const situations = state.entries.filter(e => e.type === "situation").length;
  $("#quote-count").textContent = quotes;
  $("#situation-count").textContent = situations;
  $("#member-count").textContent = state.accounts.length;
  $("#all-count").textContent = state.entries.length;
  $("#quote-tab-count").textContent = quotes;
  $("#situation-tab-count").textContent = situations;
  const management = $("#management-filter");
  const ownCount = state.entries.filter(e => e.username === state.session?.username).length;
  management.innerHTML = state.session?.isAdmin ? `Verwaltung <span>${state.entries.length}</span>` : `Eigene <span>${ownCount}</span>`;
}
function renderEntries() {
  const grid = $("#entry-grid"), empty = $("#empty-state"), toolbar = $("#archive-toolbar"), locked = $("#locked-state");
  const signedIn = Boolean(state.session);
  $("#add-entry-button").hidden = Boolean(state.session?.isAdmin);
  grid.hidden = !signedIn; toolbar.hidden = !signedIn; locked.hidden = signedIn;
  if (!signedIn) { grid.innerHTML = ""; empty.hidden = true; return; }
  const managementMode = state.filter === "own";
  const items = state.entries.filter(entry => state.filter === "all" || entry.type === state.filter || (managementMode && (state.session.isAdmin || entry.username === state.session.username))).sort((a,b) => b.createdAt - a.createdAt);
  grid.innerHTML = "";
  empty.hidden = items.length !== 0;
  items.forEach((entry, index) => {
    const isQuote = entry.type === "quote";
    const details = isQuote
      ? `<p class="entry-detail"><b>${escapeHTML(entry.author)}</b> · an ${escapeHTML(entry.target)}</p>`
      : `<p class="entry-detail"><b>Dabei:</b> ${entry.people.map(escapeHTML).join(", ")}</p>`;
    const createdBy = state.session?.isAdmin ? `<span class="author-line"><span class="avatar">${escapeHTML(entry.accountName.charAt(0).toUpperCase())}</span> von ${escapeHTML(entry.accountName)} <small>@${escapeHTML(entry.username)}</small></span>` : `<span>${isQuote ? "Zitat" : "Situation"} aus der Kursstufe</span>`;
    const controls = managementMode ? `<div class="entry-actions"><button data-copy-entry="${entry.id}">⧉ Kopieren</button><button data-edit-entry="${entry.id}">✎ Bearbeiten</button><button class="entry-delete-button" data-delete="${entry.id}">⌫ Löschen</button></div>` : "";
    grid.insertAdjacentHTML("beforeend", `<article class="entry-card ${index % 5 === 0 ? "wide" : ""}"><div class="card-top"><span class="entry-kind"><span class="kind-icon">${isQuote ? "“" : "✦"}</span>${isQuote ? "LEHRERZITAT" : "SITUATION"}</span><span class="date">${formatDate(entry.date)}</span></div><h3>${isQuote ? `„${escapeHTML(entry.content)}“` : escapeHTML(entry.content)}</h3>${details}${controls}<div class="card-footer">${createdBy}</div></article>`);
  });
  $$('[data-copy-entry]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); copyEntry(button.dataset.copyEntry, button); }));
  $$('[data-edit-entry]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); openEditEntry(button.dataset.editEntry); }));
  $$('[data-delete]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); deleteEntry(button.dataset.delete); }));
}
function deleteEntry(id) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry || !state.session || (!state.session.isAdmin && entry.username !== state.session.username) || !confirm("Diesen Eintrag wirklich löschen?")) return;
  state.entries = state.entries.filter(entry => entry.id !== id); save(STORE.entries, state.entries); render();
}
function copyEntry(id, button) {
  const entry = state.entries.find(item => item.id === id); if (!entry) return;
  const text = entry.type === "quote" ? `„${entry.content}“ — ${entry.author}, ${entry.date}` : `${entry.content} — ${entry.date}`;
  const finish = () => { button.textContent = "✓ Kopiert"; setTimeout(() => { button.textContent = "⧉ Kopieren"; }, 1200); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(finish).catch(() => legacyCopy(text, finish)); else legacyCopy(text, finish);
}
function legacyCopy(text, finish) { const field = document.createElement("textarea"); field.value = text; document.body.append(field); field.select(); document.execCommand("copy"); field.remove(); finish(); }
function openEditEntry(id) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry || !state.session || (!state.session.isAdmin && entry.username !== state.session.username)) return;
  state.editingEntryId = id; state.entryType = entry.type;
  renderEntryForm(); entryModal.showModal();
}

function openAdminPanel() {
  if (!state.session?.isAdmin) return;
  renderAccountList();
  adminModal.showModal();
}
function renderAccountList() {
  const list = $("#account-list");
  $("#admin-account-count").textContent = state.accounts.length;
  if (!state.accounts.length) { list.innerHTML = `<p class="no-accounts">Es gibt noch keine registrierten Konten.</p>`; return; }
  list.innerHTML = state.accounts.map(account => {
    const entryCount = state.entries.filter(entry => entry.username === account.username).length;
    return `<article class="account-row"><span class="account-avatar">${escapeHTML(account.name.charAt(0).toUpperCase())}</span><div><h3>${escapeHTML(account.name)}</h3><p>@${escapeHTML(account.username)} · ${entryCount} ${entryCount === 1 ? "Eintrag" : "Einträge"}</p><p class="account-password">Passwort: <b>${escapeHTML(account.password)}</b></p></div><button class="delete-account" data-delete-account="${account.id}">Konto löschen</button></article>`;
  }).join("");
  $$('[data-delete-account]').forEach(button => button.addEventListener('click', () => deleteAccount(button.dataset.deleteAccount)));
}
function deleteAccount(id) {
  if (!state.session?.isAdmin) return;
  const account = state.accounts.find(item => item.id === id);
  if (!account || !confirm(`Konto „${account.name}“ wirklich löschen? Bereits veröffentlichte Einträge bleiben erhalten.`)) return;
  state.accounts = state.accounts.filter(item => item.id !== id);
  save(STORE.accounts, state.accounts);
  renderAccountList(); render();
}

function openAccountSettings() {
  if (!state.session || state.session.isAdmin) return;
  $("#password-change-form").reset();
  $("#password-change-message").textContent = "";
  accountSettingsModal.showModal();
}
function changePassword(event) {
  event.preventDefault();
  if (!state.session || state.session.isAdmin) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const account = state.accounts.find(item => item.id === state.session.id);
  const message = $("#password-change-message");
  message.classList.remove("success");
  if (!account || data.oldPassword !== account.password) { message.textContent = "Das alte Passwort ist nicht korrekt."; return; }
  if (data.newPassword !== data.confirmPassword) { message.textContent = "Die neuen Passwörter stimmen nicht überein."; return; }
  if (data.newPassword === data.oldPassword) { message.textContent = "Bitte wähle ein neues Passwort."; return; }
  account.password = data.newPassword;
  save(STORE.accounts, state.accounts);
  message.textContent = "Passwort wurde gespeichert.";
  message.classList.add("success");
  event.currentTarget.reset();
}
function exportAllData() {
  if (!state.session?.isAdmin) return;
  const backup = { kursbuchSicherung: true, exportiertAm: new Date().toISOString(), konten: state.accounts, zitateUndSituationen: state.entries };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "text/plain;charset=utf-8" });
  const download = document.createElement("a");
  download.href = URL.createObjectURL(blob);
  download.download = `kursbuch-sicherung-${today()}.txt`;
  document.body.append(download); download.click(); download.remove(); URL.revokeObjectURL(download.href);
}

const authModal = $("#auth-modal"); const entryModal = $("#entry-modal"); const adminModal = $("#admin-modal"); const accountSettingsModal = $("#account-settings-modal");
function openAuth(mode = "login") { state.authMode = mode; renderAuth(); authModal.showModal(); }
function renderAuth() {
  const copy = { login:["Willkommen zurück.","Melde dich an, um Erinnerungen festzuhalten."], register:["Teil der Chronik werden.","Lege deinen persönlichen Kursbuch-Account an."], admin:["Adminzugang.","Verwalte Einträge des Kursbuchs."] }[state.authMode];
  $("#auth-title").textContent = copy[0]; $("#auth-subtitle").textContent = copy[1];
  $$("[data-auth-mode]").forEach(tab => tab.classList.toggle("active", tab.dataset.authMode === state.authMode));
  const form = $("#auth-form");
  if (state.authMode === "register") form.innerHTML = `<label>Dein Name<input required name="name" autocomplete="name" maxlength="50" placeholder="Vor- und Nachname" /></label><label>Benutzername<input required name="username" autocomplete="username" maxlength="30" pattern="[A-Za-z0-9_.-]+" placeholder="z. B. lena.schmidt" /></label>${passwordField("Passwort", "new-password")}<p class="form-message" aria-live="polite"></p><button class="primary-button form-submit" type="submit">Konto erstellen <span>↗</span></button><p class="auth-switch">Schon registriert? <button type="button" data-auth-mode="login">Jetzt anmelden</button></p>`;
  else if (state.authMode === "admin") form.innerHTML = `${passwordField("Admin-Passwort", "current-password")}<p class="form-message" aria-live="polite"></p><button class="primary-button form-submit" type="submit">Als Admin anmelden <span>↗</span></button>`;
  else form.innerHTML = `<label>Benutzername<input required name="username" autocomplete="username" maxlength="30" placeholder="Dein Benutzername" /></label>${passwordField("Passwort", "current-password")}<p class="form-message" aria-live="polite"></p><button class="primary-button form-submit" type="submit">Anmelden <span>↗</span></button><p class="auth-switch">Noch kein Account? <button type="button" data-auth-mode="register">Konto erstellen</button></p>`;
  $$('[data-auth-mode]', form).forEach(tab => tab.addEventListener('click', () => { state.authMode = tab.dataset.authMode; renderAuth(); }));
  $$('.show-password', form).forEach(button => button.addEventListener('click', () => { const input = $("input", button.parentElement); const visible = input.type === "text"; input.type = visible ? "password" : "text"; button.textContent = visible ? "Anzeigen" : "Verbergen"; button.setAttribute("aria-pressed", String(!visible)); }));
  form.addEventListener('submit', submitAuth);
}
function passwordField(label, autocomplete) { return `<label>${label}<span class="password-wrap"><input required name="password" type="password" autocomplete="${autocomplete}" minlength="6" placeholder="Mindestens 6 Zeichen" /><button class="show-password" type="button" aria-pressed="false">Anzeigen</button></span></label>`; }
function authMessage(text, ok = false) { const message = $(".form-message", $("#auth-form")); message.textContent = text; message.classList.toggle("success", ok); }
function submitAuth(event) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  if (state.authMode === "register") {
    const name = data.name.trim(), username = data.username.trim().toLowerCase();
    const duplicate = state.accounts.find(a => a.name.toLowerCase() === name.toLowerCase() || a.username.toLowerCase() === username);
    if (duplicate) return authMessage("Name oder Benutzername existiert bereits. Bitte melde dich an.");
    const account = { id:uid(), name, username, password:data.password }; state.accounts.push(account); save(STORE.accounts, state.accounts); state.session = { id:account.id, name:account.name, username:account.username }; save(STORE.session, state.session); authModal.close(); render(); openEntry();
  } else if (state.authMode === "admin") {
    if (data.password !== ADMIN_PASSWORD) return authMessage("Das Admin-Passwort ist nicht korrekt.");
    state.session = { isAdmin:true, name:"Admin", username:"admin" }; save(STORE.session, state.session); authModal.close(); render();
  } else {
    const account = state.accounts.find(a => a.username.toLowerCase() === data.username.trim().toLowerCase() && a.password === data.password);
    if (!account) return authMessage("Benutzername oder Passwort ist nicht korrekt.");
    state.session = { id:account.id, name:account.name, username:account.username }; save(STORE.session, state.session); authModal.close(); render();
  }
}

function openEntry() { if (!state.session || state.session.isAdmin) return openAuth(state.session?.isAdmin ? "admin" : "login"); state.editingEntryId = null; renderEntryForm(); entryModal.showModal(); }
function renderEntryForm() {
  const editing = state.entries.find(entry => entry.id === state.editingEntryId);
  $("#entry-title").textContent = editing ? "Eintrag bearbeiten" : "Was ist passiert?";
  $("#entry-type-picker").hidden = Boolean(editing);
  $$("[data-entry-type]").forEach(button => button.classList.toggle("active", button.dataset.entryType === state.entryType));
  const template = document.getElementById(`${state.entryType}-form-template`); const form = $("#entry-form"); form.innerHTML = template.innerHTML;
  $("input[name=date]", form).value = editing?.date || today();
  if (state.entryType === "quote") {
    if (editing) { $("input[name=author]", form).value = editing.author; $("input[name=target]", form).value = editing.target; $("textarea[name=content]", form).value = editing.content; }
  } else {
    if (editing) $("#people-count", form).value = String(editing.people.length);
    updatePeopleFields();
    if (editing) { editing.people.forEach((person, index) => { $(`[name=person${index}]`, form).value = person; }); $("textarea[name=content]", form).value = editing.content; }
    $("#people-count", form).addEventListener("change", updatePeopleFields);
  }
  form.addEventListener("submit", submitEntry);
}
function updatePeopleFields() { const count = Number($("#people-count").value); const grid = $(".people-grid"); grid.innerHTML = Array.from({length:count}, (_, i) => `<input required name="person${i}" maxlength="50" placeholder="Name von Person ${i+1}" aria-label="Name von Person ${i+1}" />`).join(""); }
function submitEntry(event) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  const base = { id:uid(), type:state.entryType, date:data.date, content:data.content.trim(), accountName:state.session.name, username:state.session.username, createdAt:Date.now() };
  const entry = state.entryType === "quote" ? { ...base, author:data.author.trim(), target:data.target.trim() } : { ...base, people:Object.keys(data).filter(key => key.startsWith("person")).map(key => data[key].trim()) };
  const existing = state.entries.find(item => item.id === state.editingEntryId);
  if (existing) {
    if (!state.session?.isAdmin && existing.username !== state.session?.username) return;
    Object.assign(existing, { type:entry.type, date:entry.date, content:entry.content, ...(entry.type === "quote" ? { author:entry.author, target:entry.target, people:undefined } : { people:entry.people, author:undefined, target:undefined }) });
  } else state.entries.push(entry);
  state.editingEntryId = null; save(STORE.entries, state.entries); entryModal.close(); state.filter = existing ? "own" : "all"; $$("[data-filter]").forEach(t => { const active=t.dataset.filter===state.filter; t.classList.toggle("active",active); t.setAttribute("aria-selected", active); }); render(); document.querySelector("#chronik").scrollIntoView({behavior:"smooth"});
}

$("#account-button").addEventListener("click", () => { if (state.session) { state.session = null; localStorage.removeItem(STORE.session); render(); } else openAuth("login"); });
$$('[data-open-auth]').forEach(button => button.addEventListener('click', () => openAuth(button.dataset.openAuth)));
$("#add-entry-button").addEventListener("click", openEntry);
$("#admin-panel-button").addEventListener("click", openAdminPanel);
$("#account-settings-button").addEventListener("click", openAccountSettings);
$("#password-change-form").addEventListener("submit", changePassword);
$("#export-data-button").addEventListener("click", exportAllData);
$$('#password-change-form .show-password').forEach(button => button.addEventListener('click', () => { const input = $("input", button.parentElement); const visible = input.type === "text"; input.type = visible ? "password" : "text"; button.textContent = visible ? "Anzeigen" : "Verbergen"; button.setAttribute("aria-pressed", String(!visible)); }));
$$("[data-auth-mode]").forEach(tab => tab.addEventListener("click", () => { state.authMode = tab.dataset.authMode; renderAuth(); }));
$$("[data-entry-type]").forEach(tab => tab.addEventListener("click", () => { state.entryType = tab.dataset.entryType; renderEntryForm(); }));
$$("[data-filter]").forEach(tab => tab.addEventListener("click", () => { state.filter = tab.dataset.filter; $$("[data-filter]").forEach(t => { const active=t===tab;t.classList.toggle("active",active);t.setAttribute("aria-selected",active); }); renderEntries(); }));
$$('[data-close-modal]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$("#menu-button").addEventListener("click", () => { const nav=$("#mobile-nav"), button=$("#menu-button"), open=nav.hidden; nav.hidden=!open; button.setAttribute("aria-expanded",String(open)); button.textContent=open ? "×" : "☰"; });
$$(".mobile-nav a").forEach(link => link.addEventListener("click", () => { $("#mobile-nav").hidden=true; $("#menu-button").setAttribute("aria-expanded","false"); $("#menu-button").textContent="☰"; }));
render();
