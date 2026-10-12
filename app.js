/* Only the Project URL and Publishable key belong here. Never add a secret key. */
const SUPABASE_URL = "https://zqhpjbtatdlqbdiukhdq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cVWoSNbeJHIvFCqOvlmGew_IlIR9ECt";

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const today = () => new Date().toISOString().slice(0, 10);
const configured = !SUPABASE_URL.startsWith("DEINE_") && !SUPABASE_PUBLISHABLE_KEY.startsWith("DEIN_");
const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
const state = { filter:"all", authMode:"login", entryType:"quote", editingEntryId:null, user:null, profile:null, entries:[] };

function escapeHTML(value = "") { const el = document.createElement("div"); el.textContent = value; return el.innerHTML; }
function formatDate(date) { return new Intl.DateTimeFormat("de-DE", { day:"2-digit", month:"short", year:"numeric" }).format(new Date(`${date}T12:00:00`)); }
function isAdmin() { return Boolean(state.profile?.is_admin); }
function canManage(entry) { return isAdmin() || entry.author_id === state.user?.id; }
function notifyError(error, fallback) { console.error(error); alert(error?.message || fallback); }
function setAuthMessage(text, success = false) { const el = $(".form-message", $("#auth-form")); if (el) { el.textContent = text; el.classList.toggle("success", success); } }

async function fetchProfile() {
  if (!state.user) { state.profile = null; return; }
  const { data, error } = await db.from("profiles").select("id, full_name, username, is_admin, is_active").eq("id", state.user.id).single();
  if (error) throw error;
  state.profile = data;
  if (!data.is_active) { await db.auth.signOut(); state.user = null; state.profile = null; alert("Dieses Konto wurde deaktiviert."); }
}
async function fetchEntries() {
  if (!state.user || !state.profile?.is_active) { state.entries = []; return; }
  const { data, error } = await db.from("entries").select("*, profiles!entries_author_id_fkey(full_name, username)").order("created_at", { ascending:false });
  if (error) throw error;
  state.entries = data || [];
}
async function refresh() { try { await fetchProfile(); await fetchEntries(); render(); } catch (error) { notifyError(error, "Die gemeinsamen Daten konnten nicht geladen werden."); } }

function render() {
  const signedIn = Boolean(state.user && state.profile?.is_active);
  $("#account-button").textContent = signedIn ? `${isAdmin() ? "Admin" : state.profile.full_name} · Abmelden` : "Anmelden";
  $("#account-settings-button").hidden = !signedIn || isAdmin();
  $("#admin-panel-button").hidden = !isAdmin();
  $("#stat-strip").hidden = !signedIn;
  $("#quote-count").textContent = state.entries.filter(e => e.entry_type === "quote").length;
  $("#situation-count").textContent = state.entries.filter(e => e.entry_type === "situation").length;
  $("#member-count").textContent = isAdmin() ? "•" : "–";
  $("#all-count").textContent = state.entries.length;
  $("#quote-tab-count").textContent = state.entries.filter(e => e.entry_type === "quote").length;
  $("#situation-tab-count").textContent = state.entries.filter(e => e.entry_type === "situation").length;
  const ownCount = state.entries.filter(e => e.author_id === state.user?.id).length;
  $("#management-filter").innerHTML = `${isAdmin() ? "Verwaltung" : "Eigene"} <span>${isAdmin() ? state.entries.length : ownCount}</span>`;
  renderEntries(signedIn);
}
function renderEntries(signedIn) {
  const grid = $("#entry-grid"), empty = $("#empty-state"), toolbar = $("#archive-toolbar"), locked = $("#locked-state");
  grid.hidden = !signedIn; toolbar.hidden = !signedIn; locked.hidden = signedIn; $("#add-entry-button").hidden = isAdmin();
  if (!signedIn) { grid.innerHTML = ""; empty.hidden = true; return; }
  const management = state.filter === "own";
  const entries = state.entries.filter(e => state.filter === "all" || e.entry_type === state.filter || (management && (isAdmin() || e.author_id === state.user.id)));
  grid.innerHTML = ""; empty.hidden = entries.length !== 0;
  entries.forEach((entry, index) => {
    const quote = entry.entry_type === "quote";
    const details = quote ? `<p class="entry-detail"><b>${escapeHTML(entry.quote_author)}</b> · an ${escapeHTML(entry.quote_target)}</p>` : `<p class="entry-detail"><b>Dabei:</b> ${(entry.people || []).map(escapeHTML).join(", ")}</p>`;
    const author = entry.profiles?.full_name || "Unbekannt";
    const credit = isAdmin() ? `<span class="author-line"><span class="avatar">${escapeHTML(author.charAt(0).toUpperCase())}</span> von ${escapeHTML(author)} <small>@${escapeHTML(entry.profiles?.username || "")}</small></span>` : `<span>${quote ? "Zitat" : "Situation"} aus der Kursstufe</span>`;
    const controls = management && canManage(entry) ? `<div class="entry-actions"><button data-copy="${entry.id}">⧉ Kopieren</button><button data-edit="${entry.id}">✎ Bearbeiten</button><button class="entry-delete-button" data-delete="${entry.id}">⌫ Löschen</button></div>` : "";
    grid.insertAdjacentHTML("beforeend", `<article class="entry-card ${index % 5 === 0 ? "wide" : ""}"><div class="card-top"><span class="entry-kind"><span class="kind-icon">${quote ? "“" : "✦"}</span>${quote ? "LEHRERZITAT" : "SITUATION"}</span><span class="date">${formatDate(entry.event_date)}</span></div><h3>${quote ? `„${escapeHTML(entry.content)}“` : escapeHTML(entry.content)}</h3>${details}${controls}<div class="card-footer">${credit}</div></article>`);
  });
  $$('[data-copy]').forEach(b => b.addEventListener("click", () => copyEntry(b.dataset.copy, b)));
  $$('[data-edit]').forEach(b => b.addEventListener("click", () => openEditEntry(b.dataset.edit)));
  $$('[data-delete]').forEach(b => b.addEventListener("click", () => deleteEntry(b.dataset.delete)));
}

const authModal = $("#auth-modal"), entryModal = $("#entry-modal"), adminModal = $("#admin-modal"), accountSettingsModal = $("#account-settings-modal");
function addPasswordToggles(parent) { $$(".show-password", parent).forEach(button => button.addEventListener("click", () => { const input = $("input", button.parentElement); input.type = input.type === "password" ? "text" : "password"; button.textContent = input.type === "password" ? "Anzeigen" : "Verbergen"; })); }
function passwordField(label, autocomplete) { return `<label>${label}<span class="password-wrap"><input required name="password" type="password" autocomplete="${autocomplete}" minlength="8" placeholder="Mindestens 8 Zeichen" /><button class="show-password" type="button">Anzeigen</button></span></label>`; }
function openAuth(mode = "login") { state.authMode = mode; renderAuth(); authModal.showModal(); }
function renderAuth() {
  const register = state.authMode === "register";
  $("#auth-title").textContent = register ? "Teil des Kursbuchs werden." : "Willkommen zurück.";
  $("#auth-subtitle").textContent = register ? "Für sichere Konten wird eine E-Mail-Adresse benötigt." : "Melde dich an, um die Chronik zu lesen.";
  $$('[data-auth-mode]').forEach(b => b.classList.toggle("active", b.dataset.authMode === state.authMode));
  const form = $("#auth-form");
  form.innerHTML = register ? `<label>Dein Name<input required name="name" maxlength="50" autocomplete="name" /></label><label>Benutzername<input required name="username" maxlength="30" pattern="[A-Za-z0-9_.-]+" placeholder="z. B. lena.schmidt" /></label><label>E-Mail-Adresse<input required name="email" type="email" autocomplete="email" placeholder="name@beispiel.de" /></label>${passwordField("Passwort", "new-password")}<p class="form-message" aria-live="polite"></p><button class="primary-button form-submit" type="submit">Konto erstellen <span>↗</span></button><p class="auth-switch">Schon registriert? <button type="button" data-auth-mode="login">Jetzt anmelden</button></p>` : `<label>E-Mail-Adresse<input required name="email" type="email" autocomplete="email" placeholder="name@beispiel.de" /></label>${passwordField("Passwort", "current-password")}<p class="form-message" aria-live="polite"></p><button class="primary-button form-submit" type="submit">Anmelden <span>↗</span></button><p class="auth-switch">Noch kein Account? <button type="button" data-auth-mode="register">Konto erstellen</button></p>`;
  $$('[data-auth-mode]', form).forEach(b => b.addEventListener("click", () => { state.authMode = b.dataset.authMode; renderAuth(); })); addPasswordToggles(form); form.addEventListener("submit", submitAuth);
}
async function submitAuth(event) {
  event.preventDefault(); if (!configured) return setAuthMessage("Bitte zuerst SUPABASE_SETUP.md befolgen.");
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    if (state.authMode === "register") { const { data:result, error } = await db.auth.signUp({ email:data.email.trim(), password:data.password, options:{ data:{ full_name:data.name.trim(), username:data.username.trim().toLowerCase() } } }); if (error) throw error; if (!result.session) return setAuthMessage("Konto erstellt. Bitte bestätige die E-Mail und melde dich danach an.", true); }
    else { const { error } = await db.auth.signInWithPassword({ email:data.email.trim(), password:data.password }); if (error) throw error; }
    authModal.close();
  } catch (error) { setAuthMessage(error.message || "Anmeldung nicht möglich."); }
}

function openEntry() { if (!state.user || isAdmin()) return; state.editingEntryId = null; renderEntryForm(); entryModal.showModal(); }
function openEditEntry(id) { const entry = state.entries.find(e => e.id === id); if (!entry || !canManage(entry)) return; state.editingEntryId = id; state.entryType = entry.entry_type; renderEntryForm(); entryModal.showModal(); }
function renderEntryForm() {
  const editing = state.entries.find(e => e.id === state.editingEntryId); $("#entry-title").textContent = editing ? "Eintrag bearbeiten" : "Was ist passiert?"; $("#entry-type-picker").hidden = Boolean(editing);
  $$('[data-entry-type]').forEach(b => b.classList.toggle("active", b.dataset.entryType === state.entryType)); const form = $("#entry-form"), template = document.getElementById(`${state.entryType}-form-template`); form.innerHTML = template.innerHTML; $("[name=date]", form).value = editing?.event_date || today();
  if (state.entryType === "quote") { if (editing) { $("[name=author]", form).value = editing.quote_author; $("[name=target]", form).value = editing.quote_target; $("[name=content]", form).value = editing.content; } }
  else { if (editing) $("#people-count", form).value = String(editing.people.length); updatePeopleFields(); if (editing) { editing.people.forEach((person, i) => { $(`[name=person${i}]`, form).value = person; }); $("[name=content]", form).value = editing.content; } $("#people-count", form).addEventListener("change", updatePeopleFields); }
  form.addEventListener("submit", saveEntry);
}
function updatePeopleFields() { const count = Number($("#people-count").value); $(".people-grid").innerHTML = Array.from({length:count}, (_, i) => `<input required name="person${i}" maxlength="50" placeholder="Name von Person ${i + 1}" />`).join(""); }
async function saveEntry(event) {
  event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)), editing = state.entries.find(e => e.id === state.editingEntryId);
  const payload = { entry_type:state.entryType, event_date:form.date, content:form.content.trim(), quote_author:state.entryType === "quote" ? form.author.trim() : null, quote_target:state.entryType === "quote" ? form.target.trim() : null, people:state.entryType === "situation" ? Object.keys(form).filter(k => k.startsWith("person")).map(k => form[k].trim()) : [] };
  try { const { error } = editing ? await db.from("entries").update(payload).eq("id", editing.id) : await db.from("entries").insert({ ...payload, author_id:state.user.id }); if (error) throw error; state.editingEntryId = null; entryModal.close(); state.filter = editing ? "own" : "all"; await refresh(); } catch (error) { notifyError(error, "Der Eintrag konnte nicht gespeichert werden."); }
}
async function deleteEntry(id) { const entry = state.entries.find(e => e.id === id); if (!entry || !canManage(entry) || !confirm("Diesen Eintrag wirklich löschen?")) return; try { const { error } = await db.from("entries").delete().eq("id", id); if (error) throw error; await refresh(); } catch (error) { notifyError(error, "Der Eintrag konnte nicht gelöscht werden."); } }
function copyEntry(id, button) { const entry = state.entries.find(e => e.id === id); if (!entry) return; const text = entry.entry_type === "quote" ? `„${entry.content}“ — ${entry.quote_author}, ${entry.event_date}` : `${entry.content} — ${entry.event_date}`; const done = () => { button.textContent = "✓ Kopiert"; setTimeout(() => { button.textContent = "⧉ Kopieren"; }, 1200); }; const fallback = () => { const area = document.createElement("textarea"); area.value = text; document.body.append(area); area.select(); document.execCommand("copy"); area.remove(); done(); }; if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(fallback); else fallback(); }

function openAccountSettings() { $("#password-change-form").reset(); $("#password-change-message").textContent = ""; accountSettingsModal.showModal(); }
async function changePassword(event) { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)), message = $("#password-change-message"); message.classList.remove("success"); if (form.newPassword !== form.confirmPassword) { message.textContent = "Die neuen Passwörter stimmen nicht überein."; return; } const { error:signInError } = await db.auth.signInWithPassword({ email:state.user.email, password:form.oldPassword }); if (signInError) { message.textContent = "Das alte Passwort ist nicht korrekt."; return; } const { error } = await db.auth.updateUser({ password:form.newPassword }); if (error) return (message.textContent = error.message); event.currentTarget.reset(); message.textContent = "Passwort wurde gespeichert."; message.classList.add("success"); }
async function openAdminPanel() { if (!isAdmin()) return; try { const { data, error } = await db.from("profiles").select("id, full_name, username, is_active, created_at").order("created_at", { ascending:false }); if (error) throw error; $("#admin-account-count").textContent = data.length; $("#account-list").innerHTML = data.map(p => `<article class="account-row"><span class="account-avatar">${escapeHTML(p.full_name.charAt(0).toUpperCase())}</span><div><h3>${escapeHTML(p.full_name)}</h3><p>@${escapeHTML(p.username)} · ${p.is_active ? "aktiv" : "deaktiviert"}</p></div>${p.id !== state.user.id ? `<button class="delete-account" data-deactivate="${p.id}" ${p.is_active ? "" : "disabled"}>${p.is_active ? "Deaktivieren" : "Deaktiviert"}</button>` : ""}</article>`).join(""); $$('[data-deactivate]').forEach(b => b.addEventListener("click", () => deactivateAccount(b.dataset.deactivate))); adminModal.showModal(); } catch (error) { notifyError(error, "Konten konnten nicht geladen werden."); } }
async function deactivateAccount(id) { if (!confirm("Dieses Konto deaktivieren?")) return; try { const { error } = await db.from("profiles").update({ is_active:false }).eq("id", id); if (error) throw error; adminModal.close(); await openAdminPanel(); } catch (error) { notifyError(error, "Konto konnte nicht deaktiviert werden."); } }
async function exportAllData() { if (!isAdmin()) return; try { const [{ data:konten, error:a }, { data:eintraege, error:b }] = await Promise.all([db.from("profiles").select("id, full_name, username, is_active, created_at"), db.from("entries").select("*")]); if (a || b) throw a || b; const blob = new Blob([JSON.stringify({ kursbuchSicherung:true, exportiertAm:new Date().toISOString(), konten, zitateUndSituationen:eintraege }, null, 2)], { type:"application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `kursbuch-sicherung-${today()}.json`; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(link.href); } catch (error) { notifyError(error, "Sicherung konnte nicht erstellt werden."); } }

$("#account-button").addEventListener("click", async () => { if (!state.user) return openAuth("login"); await db.auth.signOut(); });
$$('[data-open-auth]').forEach(b => b.addEventListener("click", () => openAuth(b.dataset.openAuth)));
$("#add-entry-button").addEventListener("click", openEntry); $("#admin-panel-button").addEventListener("click", openAdminPanel); $("#account-settings-button").addEventListener("click", openAccountSettings); $("#password-change-form").addEventListener("submit", changePassword); $("#export-data-button").addEventListener("click", exportAllData); addPasswordToggles($("#password-change-form"));
$$('[data-entry-type]').forEach(b => b.addEventListener("click", () => { state.entryType = b.dataset.entryType; renderEntryForm(); }));
$$('[data-filter]').forEach(b => b.addEventListener("click", () => { state.filter = b.dataset.filter; $$('[data-filter]').forEach(t => { const active = t === b; t.classList.toggle("active", active); t.setAttribute("aria-selected", String(active)); }); renderEntries(Boolean(state.user && state.profile?.is_active)); }));
$$('[data-close-modal]').forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));
$("#menu-button").addEventListener("click", () => { const nav = $("#mobile-nav"), button = $("#menu-button"), open = nav.hidden; nav.hidden = !open; button.setAttribute("aria-expanded", String(open)); button.textContent = open ? "×" : "☰"; });

if (!configured) $("#auth-subtitle").textContent = "Supabase muss noch verbunden werden. Folge SUPABASE_SETUP.md.";
if (configured) { db.auth.onAuthStateChange(async (_event, session) => { state.user = session?.user || null; state.profile = null; state.filter = "all"; await refresh(); }); db.auth.getSession().then(({ data }) => { state.user = data.session?.user || null; refresh(); }); } else render();
