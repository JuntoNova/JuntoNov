/* Client portal. No inline script or inline handlers: the page's Content-Security-Policy allows
   only scripts from this origin and the Google sign-in script. Server data is escaped with esc()
   before it reaches innerHTML, and actions are wired by data-act attributes and one delegated listener. */
(function () {
"use strict";
var GOOGLE_CLIENT_ID = "696574706151-9qjv11se3a3us5k86o2fodtktb4m5r2d.apps.googleusercontent.com";
var API = "https://portal-api.juntonova.com";
var token = "";
var room = null;
var view = "home";
var denied = false;
var addingNew = false;
var ideaFilter = "";
var lensFilter = "";
var editingIdea = "";
var manageIssue = "";
var manageOpen = false;
var lastStatus = 0;
var error = "";
var reading = null;
var ideaIssue = "";
var openItem = "";
var editingItem = "";
var addingItem = false;
var addLens = "practical";
var clientSaved = "";
var issueOpen = false;
var ideaLens = "practical";
var editingName = "";
var msEnabled = false;
/* Email sign-in (code by email, then an authenticator app). Shown only when the API says it is on. */
var emailEnabled = false;
var emailStep = "";
var emailNote = "";
var emailAddr = "";
var setup = null;
var recoveryCodes = null;
var useRecovery = false;
var busyNow = false;
/* Sign-in is a server session cookie on portal-api (HttpOnly). The page never holds a token:
   `token` is only "session" when signed in, "" when not. Old Google tokens are cleared. */
try {
  if (sessionStorage.getItem("jn_google")) {
    sessionStorage.removeItem("jn_google");
    error = "Sign-in has changed. Please sign in once more.";
  }
} catch (e) {}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    if (c === "&") return "&" + "amp;";
    if (c === "<") return "&" + "lt;";
    if (c === ">") return "&" + "gt;";
    if (c === '"') return "&" + "quot;";
    return "&" + "#39;";
  });
}
function signedOut() {
  token = "";
  room = null;
  reading = null;
  try { if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.disableAutoSelect(); } catch (e) {}
  render();
}
async function logout() {
  var ok = false;
  try {
    var res = await fetch(API + "/auth/logout", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
    ok = res.ok;
  } catch (e) {}
  if (!ok) { error = "Sign out didn't finish. Try again."; render(); return; }
  error = "";
  signedOut();
}
async function api(body) {
  if (previewKind()) return previewMutate(body);
  var res = await fetch(API + "/api/portal", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  var data = await res.json().catch(function () { return { error: "The portal can't be reached." }; });
  lastStatus = res.status;
  if (res.status === 401) { signedOut(); throw new Error(""); }
  return data;
}
var PAGE_VIEWS = ["home", "ideas", "proposals", "research", "billing", "admin"];
function pathFor(id) { return id === "home" ? "/portal" : "/portal/" + id; }
function viewFromLocation() {
  var path = location.pathname || "";
  if (path.endsWith("/portal.html")) path = "/portal";
  path = path.replace(/\/+$/, "") || "/";
  if (path === "/portal") return "home";
  var match = /\/portal\/([a-z]+)$/.exec(path);
  if (!match || PAGE_VIEWS.indexOf(match[1]) < 0 || match[1] === "home") return "home";
  return match[1];
}
function pathIsKnown() {
  var path = (location.pathname || "").replace(/\/+$/, "");
  if (path.endsWith("/portal.html") || path === "/portal") return true;
  var match = /\/portal\/([a-z]+)$/.exec(path);
  return Boolean(match && PAGE_VIEWS.indexOf(match[1]) >= 0 && match[1] !== "home");
}
function dateWord(value) {
  var text = String(value || "");
  return text.length >= 10 ? text.slice(0, 10) : "";
}
function lensWord(value) {
  return { practical: "Practical", structural: "Structural", cultural: "Cultural" }[value] || "No lens";
}
function visWord(value) {
  return { clients: "All clients", org: "This organization", director: "Director", board: "Board", billing: "Billing" }[value] || value || "";
}
function sectionBody() {
  var action = view === "home" ? "loadHome" : view === "ideas" ? "loadIdeas" : view === "admin" ? "loadAdmin" : "loadDocuments";
  var body = { action: action };
  if (action === "loadDocuments") body.section = view;
  return body;
}
function clearSectionData() {
  if (!room) return;
  room.documents = [];
  room.issues = [];
  room.directory = undefined;
  room.assignments = undefined;
  room.disclosures = {};
  room.counts = undefined;
  var own = {};
  if (room.person && room.person.orgId && room.person.orgName) own[room.person.orgId] = room.person.orgName;
  room.orgs = own;
}
function applySection(data) {
  if (lastStatus === 403 && data && data.error === "You can't open that.") {
    denied = true;
    error = "";
    clearSectionData();
    return;
  }
  if (!data || data.access === "none") { room = null; error = (data && data.email) || ""; return; }
  if (data.error) { error = data.error; return; }
  denied = false;
  room = data;
  error = "";
}
async function loadCurrent() {
  if (previewKind()) return;
  denied = false;
  var data = await api(sectionBody());
  applySection(data);
}
async function refresh() {
  await loadCurrent();
}
var NOT_LISTED = "This account doesn't have portal access. Ask your Junto Nova contact to add it.";
var SIGNIN_FAILED = "Sign-in didn't work. Try again.";
async function onGoogle(response) {
  error = "";
  try {
    var res = await fetch(API + "/auth/google", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential }),
    });
    if (res.status === 403) { error = NOT_LISTED; render(); return; }
    if (!res.ok) { error = SIGNIN_FAILED; render(); return; }
    token = "session";
    await refresh();
  } catch (e) {
    if (!error) error = SIGNIN_FAILED;
  }
  render();
}
/* Microsoft sign-in returns here with #signin=<outcome>. Read it once, then clear it. */
function readSigninOutcome() {
  var m = /^#signin=([a-z_]+)$/.exec(location.hash || "");
  if (!m) return;
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  if (m[1] === "not_listed") error = NOT_LISTED;
  else if (m[1] !== "ok" && m[1] !== "cancelled") error = SIGNIN_FAILED;
}
function loadProviders() {
  return fetch(API + "/auth/providers", { credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (p) { msEnabled = Boolean(p && p.microsoft); emailEnabled = Boolean(p && p.email); })
    .catch(function () { msEnabled = false; emailEnabled = false; });
}
async function authPost(path, body) {
  var res = await fetch(API + path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  var data = await res.json().catch(function () { return {}; });
  return { status: res.status, ok: res.ok, data: data || {} };
}
function resetEmail(msg) {
  emailStep = ""; emailNote = ""; setup = null; useRecovery = false;
  error = msg || "";
}
async function emailFlow(kind, form) {
  if (busyNow) return;
  busyNow = true;
  error = "";
  try {
    var input = form.querySelector("input");
    var value = input ? input.value.trim() : "";
    var r;
    if (kind === "email-start") {
      r = await authPost("/auth/email/start", { email: value });
      if (r.ok) { emailAddr = value; emailStep = "code"; emailNote = r.data.message || ""; }
      else error = r.data.error || SIGNIN_FAILED;
    } else if (kind === "email-code") {
      r = await authPost("/auth/email/verify", { code: value });
      if (r.ok && r.data.next === "enroll") {
        var s = await authPost("/auth/totp/setup", {});
        if (s.ok) { setup = s.data; emailStep = "enroll"; }
        else resetEmail(s.data.error || SIGNIN_FAILED);
      } else if (r.ok) { emailStep = "totp"; }
      else error = r.data.error || SIGNIN_FAILED;
    } else if (kind === "totp-enroll") {
      r = await authPost("/auth/totp/confirm", { code: value });
      if (r.ok) { setup = null; recoveryCodes = r.data.recoveryCodes || []; emailStep = "codes"; }
      else if (r.data.restart) resetEmail(r.data.error);
      else error = r.data.error || SIGNIN_FAILED;
    } else if (kind === "totp") {
      r = await authPost("/auth/totp/verify", useRecovery ? { recoveryCode: value } : { code: value });
      if (r.ok) { resetEmail(""); token = "session"; await refresh(); }
      else if (r.data.restart) resetEmail(r.data.error);
      else error = r.data.error || SIGNIN_FAILED;
    }
  } catch (e) {
    error = "The portal can't be reached. Try again.";
  }
  busyNow = false;
  render();
  var next = document.querySelector("#app form[data-form] input");
  if (next) next.focus();
}
async function finishRecovery() {
  recoveryCodes = null;
  resetEmail("");
  token = "session";
  try { await refresh(); } catch (e) {}
  render();
}
function copyRecovery(btn) {
  var text = (recoveryCodes || []).join("\n");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { btn.textContent = "Copied"; }, function () {});
  }
}
function emailCard() {
  var err = error ? '<div class="err" role="alert">' + esc(error) + "</div>" : "";
  var head = function (title) { return '<main class="wrap"><div class="login-shell"><div class="login-card card signin-card"><div class="kicker">Client portal</div><h1 class="display t-lg">' + title + "</h1>" + err; };
  var foot = "</div></div></main>";
  var codeInput = function (id, label) {
    return '<label class="code-field">' + label + '<input id="' + id + '" class="code-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7" required></label>';
  };
  var back = '<button type="button" class="link-btn" data-act="email-back">Start over</button>';
  if (emailStep === "code") {
    return head("Check your email") + '<p class="muted note">' + esc(emailNote) + '</p><form class="form signin-form" data-form="email-code">' + codeInput("e-code", "Code") + '<button class="btn wide" type="submit">Continue</button></form>' + back + foot;
  }
  if (emailStep === "enroll" && setup) {
    var qr = /^data:image\/svg\+xml;base64,[A-Za-z0-9+\/=]+$/.test(setup.qr || "") ? setup.qr : "";
    return head("Set up your authenticator app") +
      '<ol class="steps"><li>Open an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator.</li><li>Scan this code.</li></ol>' +
      (qr ? '<img class="qr" src="' + qr + '" width="208" height="208" alt="QR code for your authenticator app">' : "") +
      '<details class="key"><summary>Can\'t scan the code? Type this key instead</summary><code class="secret">' + esc(setup.secret) + '</code><div class="muted small">Account: ' + esc(setup.account) + "</div></details>" +
      '<form class="form signin-form" data-form="totp-enroll">' + codeInput("t-code", "Code from the app") + '<button class="btn wide" type="submit">Continue</button></form>' + back + foot;
  }
  if (emailStep === "codes" && recoveryCodes) {
    return head("Save your recovery codes") +
      '<p class="muted note">If you lose your phone, each code signs you in once. Keep them somewhere safe. You won\'t see them again.</p>' +
      '<ul class="recovery">' + recoveryCodes.map(function (c) { return "<li><code>" + esc(c) + "</code></li>"; }).join("") + "</ul>" +
      '<div class="row-actions"><button type="button" class="btn ghost wide" data-act="copy-recovery">Copy codes</button><button type="button" class="btn wide" data-act="recovery-done">I saved them</button></div>' + foot;
  }
  if (emailStep === "totp") {
    var form = useRecovery
      ? '<form class="form signin-form" data-form="totp"><label class="code-field">Recovery code<input id="r-code" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="20" required></label><button class="btn wide" type="submit">Continue</button></form><button type="button" class="link-btn" data-act="use-app">Use the app instead</button>'
      : '<form class="form signin-form" data-form="totp">' + codeInput("t-code", "Code from your authenticator app") + '<button class="btn wide" type="submit">Continue</button></form><button type="button" class="link-btn" data-act="use-recovery">Use a recovery code</button>';
    return head("Enter your app code") + form + back + foot;
  }
  return "";
}
function emailForm() {
  if (!emailEnabled) return "";
  return '<div class="or" aria-hidden="true"><span>or</span></div><form class="form signin-form" data-form="email-start"><label>Email<input id="e-email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" required value="' + esc(emailAddr) + '"></label><button class="btn wide" type="submit">Email me a code</button></form>';
}
function initGoogle() {
  var host = document.getElementById("google-btn");
  if (!host || host.dataset.ready === "1") return;
  if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
  /* Full width of the card, up to Google's 400px maximum, so it lines up with the email button. */
  var width = Math.max(200, Math.min(400, Math.floor((host.parentElement ? host.parentElement.clientWidth : 320))));
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: onGoogle,
    ux_mode: "popup",
    auto_select: false,
    context: "signin",
    itp_support: true,
  });
  window.google.accounts.id.renderButton(host, {
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "rectangular",
    logo_alignment: "left",
    width: width,
  });
  host.dataset.ready = "1";
  var fallback = document.getElementById("google-fallback");
  if (fallback) fallback.hidden = true;
}
function signInGoogle() {
  if (!window.google || !window.google.accounts) {
    error = "Sign-in is still loading. Try again in a second.";
    render();
    return;
  }
  initGoogle();
  window.google.accounts.id.prompt();
}
function docs(section) {
  return (room.documents || []).filter(function (doc) { return doc.section === section; });
}
function isAdmin() { return Boolean(room && room.person && room.person.role === "admin"); }
var SECTION_TABS = ["ideas", "proposals", "research", "billing"];
function canOpenTab(id) {
  if (id === "home") return true;
  if (!room || !room.person) return false;
  if (room.staff) return true;
  var granted = room.person.sections;
  if (!granted) {
    if (id === "admin") return false;
    if (id === "billing") return Boolean(room.person.billing);
    return id === "ideas" || id === "proposals" || id === "research";
  }
  if (id === "admin") return Boolean(room.person.clientAdmin);
  return granted.indexOf(id) !== -1;
}
function sections() {
  return ["home", "ideas", "proposals", "research", "billing", "admin"].filter(canOpenTab);
}
function sectionLabel(id) { return id[0].toUpperCase() + id.slice(1); }
function nav() {
  return sections().map(function (id) {
    var current = view === id;
    return '<a href="' + pathFor(id) + '" data-act="view" data-view="' + id + '" class="' + (current ? "active" : "") + '"' + (current ? ' aria-current="page"' : "") + ">" + sectionLabel(id) + "</a>";
  }).join("");
}
function showAddNew() {
  if (!room || !room.person || view === "home" || denied) return false;
  if (room.staff) return true;
  return room.person.role === "director" && view === "ideas";
}
function addNewButton() {
  if (!showAddNew() || addingNew) return "";
  if (view === "ideas") return '<p class="page-action"><button type="button" class="btn" data-act="add-new">Add idea</button></p>';
  return '<p class="page-action"><button type="button" class="btn" data-act="add-new">Add new</button></p>';
}
function dataGrid(headers, rows) {
  if (!rows.length) return '<p class="muted">Nothing here yet.</p>';
  var head = "<thead><tr>" + headers.map(function (label) { return "<th>" + esc(label) + "</th>"; }).join("") + "</tr></thead>";
  var body = "<tbody>" + rows.map(function (row) {
    return "<tr>" + row.map(function (cell, i) {
      return '<td data-label="' + esc(headers[i]) + '">' + cell + "</td>";
    }).join("") + "</tr>";
  }).join("") + "</tbody>";
  return '<table class="section-grid">' + head + body + "</table>";
}
function ideaTable() {
  var items = [];
  (room.issues || []).forEach(function (issue) {
    (issue.items || []).forEach(function (item) { items.push({ issue: issue, item: item }); });
  });
  var headers = ["Title", "Lens", "Status", "Date"];
  if (room.staff) headers.push("Public");
  return dataGrid(headers, items.map(function (row) {
    var item = row.item;
    var cells = [
      '<button type="button" data-act="open-idea" data-id="' + esc(item.id) + '" data-issue="' + esc(row.issue.id) + '">' + esc(item.title) + "</button>",
      esc(lensWord(item.lens)),
      esc(item.status === "vetted" ? "Vetted" : "Untested"),
      esc(dateWord(item.createdAt)),
    ];
    if (room.staff) cells.push(esc(item.publicState === "published" ? "Published" : item.publicState === "queued" ? "Queued" : "Private"));
    return cells;
  }));
}
function docRows(section) {
  var headers = ["Title", "Who can see it", "Date"];
  if (room.staff) headers.splice(1, 0, "Client");
  var rows = (room.documents || []).filter(function (doc) { return doc.section === section; }).map(function (doc) {
    var title = '<button type="button" data-act="open" data-id="' + esc(doc.id) + '">' + esc(doc.title) + "</button>";
    var cells = [title, esc(visWord(doc.visibility)), esc(dateWord(doc.createdAt))];
    if (room.staff) cells.splice(1, 0, esc((room.orgs || {})[doc.orgId] || "All clients"));
    return cells;
  });
  return dataGrid(headers, rows);
}
function paintMenu() {
  var slot = document.getElementById("portal-menu");
  if (!slot) return;
  var signedIn = Boolean(token && room);
  document.querySelectorAll('#mobile-menu a.login, #mobile-menu a[href="project.html"]').forEach(function (a) { a.hidden = signedIn; });
  document.body.classList.toggle("signed-in", signedIn);
  slot.innerHTML = ""; slot.hidden = true;
  var who = document.getElementById("portal-who");
  if (!who) return;
  who.hidden = !signedIn;
  who.innerHTML = signedIn ? '<span class="who-name" title="' + esc(room.person.name) + '">' + esc(room.person.name) + '</span><button type="button" data-act="logout">Sign out</button>' : "";
}
function setView(id) {
  if (PAGE_VIEWS.indexOf(id) < 0) id = "home";
  view = id;
  reading = null;
  addingNew = false;
  editingIdea = "";
  addingItem = false;
  denied = false;
  menu(false);
  var next = pathFor(id);
  var current = (location.pathname || "").replace(/\/+$/, "");
  if (current.endsWith("/portal.html")) current = "/portal";
  if (current !== next) {
    try { history.pushState({ view: id }, "", next + location.search); } catch (e) {}
  }
  if (!token || previewKind()) { render(); return; }
  loadCurrent().then(function () { render(); }).catch(fail);
}
function ideaTotal() {
  var n = 0;
  (room.issues || []).forEach(function (issue) { n += (issue.items || []).length; });
  return n;
}
function lensLabel(id) {
  return { practical: "Practical", structural: "Structural", cultural: "Cultural" }[id] || "No lens";
}
function badge(value) {
  var labels = { idea: "Idea", poll: "Poll", opposition: "Opposition", vetted: "Vetted", untested: "Untested" };
  var cls = "pill";
  if (value === "opposition") cls += " oppose";
  else if (value === "untested" || value === "poll") cls += " open";
  else if (value === "vetted") cls += " paid";
  return '<span class="' + cls + '">' + esc(labels[value] || value) + "</span>";
}
function selectOptions(values, current, labels) {
  return values.map(function (value) {
    return '<option value="' + esc(value) + '"' + (value === current ? " selected" : "") + ">" + esc(labels[value] || value) + "</option>";
  }).join("");
}
function currentIssue() {
  var list = room.issues || [];
  if (!list.length) return null;
  for (var i = 0; i < list.length; i++) if (list[i].id === ideaIssue) return list[i];
  ideaIssue = list[0].id;
  return list[0];
}
function issueDrawer() {
  var current = currentIssue();
  var name = current ? current.name : "Issue";
  var button = '<button type="button" class="drawer-btn" data-act="issue-drawer" aria-expanded="' + (issueOpen ? "true" : "false") + '">' + esc(name) + "</button>";
  if (!issueOpen) return '<div class="drawer">' + button + "</div>";
  var list = (room.issues || []).map(function (issue) {
    var on = current && issue.id === current.id;
    return '<button type="button" data-act="idea" data-id="' + esc(issue.id) + '" class="' + (on ? "active" : "") + '"' + (on ? ' aria-current="true"' : "") + ">" + esc(issue.name) + "</button>";
  }).join("");
  return '<div class="drawer">' + button + '<div class="drawer-list">' + list + "</div></div>";
}
function lensSelect() {
  var lenses = [["practical", "Practical"], ["structural", "Structural"], ["cultural", "Cultural"], ["none", "No lens"]];
  if (!ideaLens || lenses.every(function (p) { return p[0] !== ideaLens; })) ideaLens = "practical";
  return '<label class="lens-field"><span class="kicker">Lens</span><span class="lens-wrap"><select class="lens-select" data-lens-select>' + lenses.map(function (pair) {
    return '<option value="' + esc(pair[0]) + '"' + (ideaLens === pair[0] ? " selected" : "") + ">" + pair[1] + "</option>";
  }).join("") + "</select></span></label>";
}
function itemGroups(items) {
  var order = ["practical", "structural", "cultural", ""];
  var map = {};
  items.forEach(function (item) {
    var key = item.lens || "";
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  return order.filter(function (key) { return map[key] && map[key].length; }).map(function (key) {
    return { lens: key, items: map[key] };
  });
}
function itemForm(item) {
  var row = item || {};
  var urls = (row.sourceUrls || []).map(function (source) { return source.url; }).join("\n");
  return '<form class="form" data-form="item" data-id="' + esc(row.id || "") + '" data-issue="' + esc(ideaIssue) + '"><label>Title<input id="i-title" required value="' + esc(row.title || "") + '"></label><div class="row2"><label>Type<select id="i-type">' + selectOptions(["idea", "poll", "opposition"], row.type || "idea", { idea: "Idea", poll: "Poll", opposition: "Opposition" }) + '</select></label><label>Status<select id="i-status">' + selectOptions(["untested", "vetted"], row.status || "untested", { untested: "Untested", vetted: "Vetted" }) + '</select></label></div><div class="row2"><label>Lens<select id="i-lens"><option value="">No lens</option>' + selectOptions(["practical", "structural", "cultural"], row.lens || "", { practical: "Practical", structural: "Structural", cultural: "Cultural" }) + '</select></label><label>Empiricism<select id="i-emp"><option value=""> </option>' + selectOptions(["cited", "indirect", "none"], row.empiricism || "", { cited: "Cited", indirect: "Indirect", none: "Not confirmed" }) + '</select></label></div>' + scaleField(row.scoreAxis === "how widely held" ? "held" : "effort", row.scoreAxis === "how widely held" ? "How widely held" : "Effort", row.scoreAxis === "how widely held" ? row.held : row.ease) + scaleField("impact", "Impact", row.impact) + ' <label>Text<textarea id="i-text" rows="3">' + esc(row.body || "") + '</textarea></label><label>Evidence<textarea id="i-evidence" rows="3">' + esc(row.evidence || "") + '</textarea></label><label>Source links<textarea id="i-sources" rows="2" placeholder="https://">' + esc(urls) + '</textarea></label><div class="row-actions"><button class="btn" type="submit">' + (row.id ? "Save" : "Add item") + "</button>" + (row.id ? '<button class="btn ghost" type="button" data-act="cancel-item">Cancel</button>' : "") + (row.id ? '<button class="btn ghost" type="button" data-act="remove-item" data-id="' + esc(row.id) + '">Remove</button>' : "") + "</div></form>";
}
function publicControls(item) {
  if (!room.staff) return "";
  var state = item.publicState || "private";
  var on = state === "queued" || state === "published";
  var word = state === "queued" ? "Queued" : state === "published" ? "Published" : "";
  var pill = word ? '<span class="pill">' + word + "</span>" : "";
  var toggle = '<label class="switch"><input type="checkbox" data-public="' + esc(item.id) + '"' + (on ? " checked" : "") + "><span>Public</span></label>";
  var extra = "";
  var eligible = item.status === "vetted" && item.type !== "opposition" && item.source !== "client";
  if (state === "queued" && eligible) {
    extra = '<form class="form" data-form="clear-gate" data-id="' + esc(item.id) + '"><label>Note<input required maxlength="500"></label><button class="btn" type="submit">Publish</button></form>';
  } else if (state === "published" && item.publicClearedBy && item.publicClearedBy.name) {
    var when = item.publicClearedAt ? " · " + esc(item.publicClearedAt) : "";
    var note = item.publicClearNote ? " · " + esc(item.publicClearNote) : "";
    extra = '<p class="muted">' + esc(item.publicClearedBy.name) + when + note + "</p>";
  }
  return '<div class="public-row">' + toggle + pill + "</div>" + extra;
}
function clientNames(item) {
  if (!room.staff) return [];
  var names = [];
  (room.assignments || []).forEach(function (row) {
    if ((row.itemIds || []).indexOf(item.id) === -1) return;
    var name = (room.orgs || {})[row.orgId];
    if (name && names.indexOf(name) === -1) names.push(name);
  });
  return names;
}
function clientChips(item) {
  var names = clientNames(item);
  if (!names.length) return "";
  return '<div class="client-chips">' + names.map(function (name) {
    return '<span class="pill">' + esc(name) + "</span>";
  }).join("") + "</div>";
}
function clientAssign(item) {
  if (!room.staff) return "";
  var orgs = room.orgs || {};
  var ids = Object.keys(orgs);
  if (!ids.length) return "";
  var saved = clientSaved === item.id ? '<span class="saved">Saved</span>' : "";
  var boxes = ids.map(function (orgId) {
    var on = false;
    (room.assignments || []).forEach(function (row) {
      if (row.orgId === orgId && (row.itemIds || []).indexOf(item.id) !== -1) on = true;
    });
    return '<label class="check tap"><input type="checkbox" data-client="' + esc(item.id) + '" data-org="' + esc(orgId) + '"' + (on ? " checked" : "") + "><span>" + esc(orgs[orgId]) + "</span></label>";
  }).join("");
  return '<div class="clients"><div class="clients-head"><div class="kicker">Clients</div>' + saved + '</div><div class="checks">' + boxes + "</div></div>";
}
function scaleStep(stored) {
  if (stored == null || stored === "") return null;
  var n = Number(stored);
  if (!Number.isInteger(n) || n < 10 || n > 100 || n % 10 !== 0) return null;
  return n / 10;
}
function scaleField(group, label, stored, plain) {
  var step = scaleStep(stored);
  var storedAttr = stored == null || stored === "" ? "" : String(stored);
  var note = stored != null && stored !== "" && step == null ? '<p class="muted scale-note">Stored ' + esc(String(stored)) + "</p>" : "";
  var buttons = "";
  for (var n = 1; n <= 10; n++) {
    var on = step === n;
    buttons += '<button type="button" data-act="pick-scale" data-value="' + n + '" class="' + (on ? "active" : "") + '" aria-pressed="' + (on ? "true" : "false") + '">' + n + "</button>";
  }
  var caption = plain ? '<span class="field-label">' + esc(label) + "</span>" : '<span class="kicker">' + esc(label) + "</span>";
  return '<div class="field">' + caption + '<div class="scale" role="group" aria-label="' + esc(label) + '" data-scale-group="' + esc(group) + '" data-stored="' + esc(storedAttr) + '">' + buttons + "</div>" + note + "</div>";
}
function scoreFields(item) {
  if (!room.staff) return "";
  var axisHeld = item.scoreAxis === "how widely held";
  var xLabel = axisHeld ? "How widely held" : "Effort";
  var xGroup = axisHeld ? "held" : "effort";
  var xVal = axisHeld ? item.held : item.ease;
  return '<form class="form scores" data-form="scores" data-id="' + esc(item.id) + '">' + scaleField(xGroup, xLabel, xVal) + scaleField("impact", "Impact", item.impact) + "</form>";
}
function canEditIdeas() {
  return Boolean(room && room.person && (room.staff || room.person.role === "director"));
}
function findIdea(id) {
  var found = null;
  (room.issues || []).forEach(function (issue) {
    (issue.items || []).forEach(function (item) {
      if (item.id === id) found = { issue: issue, item: item };
    });
  });
  return found;
}
function ideaForm() {
  if (!addingNew || !canEditIdeas()) return "";
  var editing = editingIdea ? findIdea(editingIdea) : null;
  if (editingIdea && !editing) return "";
  var picked = editing ? editing.issue.id : activeIssueFilter();
  var lens = editing && editing.item.lens ? editing.item.lens : "practical";
  if (lens !== "practical" && lens !== "structural" && lens !== "cultural") lens = "practical";
  var options = (room.issues || []).map(function (issue) {
    var on = picked ? issue.id === picked : false;
    return '<option value="' + esc(issue.id) + '"' + (on ? " selected" : "") + ">" + esc(issue.name) + "</option>";
  }).join("");
  var lenses = [["practical", "Practical"], ["structural", "Structural"], ["cultural", "Cultural"]];
  var lensOptions = lenses.map(function (pair) {
    return '<option value="' + pair[0] + '"' + (pair[0] === lens ? " selected" : "") + ">" + pair[1] + "</option>";
  }).join("");
  var title = editing ? esc(editing.item.title || "") : "";
  var text = editing ? esc(editing.item.body || "") : "";
  var ease = editing ? (editing.item.scoreAxis === "how widely held" ? editing.item.held : editing.item.ease) : null;
  var impact = editing ? editing.item.impact : null;
  var kind = editing ? "edit-idea" : (room.staff ? "add-idea" : "submit-idea");
  var idAttr = editing ? ' data-id="' + esc(editing.item.id) + '"' : "";
  var staffBits = "";
  if (room.staff) {
    var isPublic = editing && (editing.item.publicState === "published" || editing.item.publicState === "queued");
    var selected = {};
    if (editing) {
      (room.assignments || []).forEach(function (row) {
        if ((row.itemIds || []).indexOf(editing.item.id) !== -1) selected[row.orgId] = true;
      });
    }
    var boxes = Object.keys(room.orgs || {}).map(function (orgId) {
      return '<label class="check tap"><input type="checkbox" data-org="' + esc(orgId) + '"' + (selected[orgId] ? " checked" : "") + "><span>" + esc(room.orgs[orgId]) + "</span></label>";
    }).join("");
    var clients = boxes ? '<div class="clients"><div class="kicker">Clients</div><div class="checks">' + boxes + "</div></div>" : "";
    staffBits = '<label class="switch"><input type="checkbox" id="s-public"' + (isPublic ? " checked" : "") + "><span>Public</span></label>" + clients;
  }
  return '<form class="form card idea-form" data-form="' + kind + '"' + idAttr + '><label>Issue<select id="s-issue" required>' + options + '</select></label><label>Lens<select id="s-lens" required>' + lensOptions + '</select></label><label>Title<input id="s-title" required maxlength="200" value="' + title + '"></label><label>Text<textarea id="s-text" rows="3">' + text + "</textarea></label>" + scaleField("effort", "Effort", ease, true) + scaleField("impact", "Impact", impact, true) + staffBits + '<div class="form-actions"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" data-act="cancel-new">Cancel</button></div></form>';
}
function researchHtml(text) {
  var parts = String(text).split(/(https:\/\/\S+)/i);
  return parts.map(function (part) {
    if (/^https:\/\/\S+$/i.test(part)) {
      return '<a href="' + esc(part) + '" target="_blank" rel="noopener noreferrer">' + esc(part) + "</a>";
    }
    return esc(part);
  }).join("");
}
function researchList(item) {
  var rows = [];
  String(item.evidence || "").split("\n").forEach(function (line) {
    var text = line.trim();
    if (text) rows.push(researchHtml(text));
  });
  (item.sourceUrls || []).forEach(function (source) {
    var url = source && source.url ? source.url : "";
    if (!/^https:\/\/\S+$/i.test(url)) return;
    var label = source.label || url;
    rows.push('<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + "</a>");
  });
  if (!rows.length) return "";
  return '<div class="research"><div class="kicker">Research</div><ul>' + rows.map(function (row) {
    return "<li>" + row + "</li>";
  }).join("") + "</ul></div>";
}
function chartItems(items, lens) {
  var rows = [];
  (items || []).forEach(function (item) {
    if ((item.lens || "") !== lens) return;
    var axisHeld = item.scoreAxis === "how widely held";
    var x = axisHeld ? item.held : item.ease;
    var y = item.impact;
    if (x == null || y == null) return;
    x = Number(x);
    y = Number(y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    rows.push({ id: item.id, name: item.title, x: x, y: y });
  });
  return rows;
}
function paintIssueGrid() {
  var root = document.getElementById("issue-grid");
  if (!root || !window.JNIssueGrid) return;
  var issue = currentIssue();
  if (!issue) { root.innerHTML = ""; return; }
  JNIssueGrid.paint(root, {
    items: chartItems(issue.items, ideaLens || "practical"),
    lens: ideaLens || "practical",
    selectedId: openItem || null,
    matchIds: null,
  });
}
function itemCard(item) {
  var open = openItem === item.id;
  var titleHtml;
  var nameActions = "";
  if (room.staff && editingName === item.id) {
    var editor = '<div class="name-edit"><input class="title-edit" value="' + esc(item.title) + '" data-name-input="' + esc(item.id) + '" maxlength="200" aria-label="Name"><div class="name-actions"><button type="button" class="link-btn plain" data-act="cancel-name">Cancel</button><button type="button" class="btn tiny" data-act="save-name" data-id="' + esc(item.id) + '">Save</button></div></div>';
    titleHtml = "";
    nameActions = editor;
  } else {
    titleHtml = '<b>' + esc(item.title) + '</b>';
    if (room.staff) nameActions = '<button type="button" class="icon-btn" data-act="edit-name" data-id="' + esc(item.id) + '" aria-label="Edit name"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>';
  }
  var head = titleHtml
    ? '<div class="item-head"><button type="button" class="item-open" data-act="toggle-item" data-id="' + esc(item.id) + '">' + titleHtml + '<span class="badges">' + badge(item.type) + badge(item.status) + "</span></button>" + nameActions + "</div>"
    : nameActions;
  var cls = "item" + (item.type === "opposition" ? " opposition" : "");
  var gate = publicControls(item);
  var clients = clientAssign(item);
  if (!open) return '<article class="' + cls + '">' + head + clientChips(item) + gate + "</article>";
  if (room.staff && editingItem === item.id) return '<article class="' + cls + '">' + head + itemForm(item) + gate + clients + "</article>";
  var bits = "";
  var axisHeld = item.scoreAxis === "how widely held";
  if (!room.staff && (item.ease != null || item.impact != null || (axisHeld && item.held != null))) {
    var scores = [];
    if (axisHeld && item.held != null) scores.push("How widely held " + item.held);
    else if (item.ease != null) scores.push("Effort " + item.ease);
    if (item.impact != null) scores.push("Impact " + item.impact);
    bits += "<p><b>" + esc(scores.join(" · ")) + "</b></p>";
  }
  if (item.stance) bits += '<p class="badges"><span class="pill">' + esc(item.stance) + "</span></p>";
  if (item.empiricism) {
    var empiricism = { cited: "Cited", indirect: "Indirect", none: "Not confirmed" }[item.empiricism] || item.empiricism;
    bits += '<p class="badges"><span class="pill">' + esc(empiricism) + "</span></p>";
  }
  if (item.body) bits += '<p class="muted pre">' + esc(item.body) + "</p>";
  bits += researchList(item);
  if (room.staff) bits += '<p class="mt-s"><button type="button" class="btn ghost" data-act="edit-item" data-id="' + esc(item.id) + '">Edit</button></p>';
  return '<article class="' + cls + '">' + head + bits + gate + (room.staff ? scoreFields(item) : "") + clients + "</article>";
}
function submitIdeaForm(issue) {
  if (room.staff) return "";
  return '<form class="form short card" data-form="submit-idea" data-issue="' + esc(issue.id) + '"><div class="kicker">Add idea</div><label>Title<input id="s-title" required></label><label>Text<textarea id="s-text" rows="3"></textarea></label><label>Source<input id="s-source" type="url" placeholder="https://"></label><button class="btn" type="submit">Add idea</button></form>';
}
function newIssueForm() {
  if (!room.staff) return "";
  return '<details class="new-issue"><summary>New issue</summary><form class="form" data-form="issue"><label>Issue name<input id="n-issue" required maxlength="80"></label><button class="btn" type="submit">Add issue</button></form></details>';
}
function countPhrase(n, one, many) {
  return n + " " + (n === 1 ? one : many);
}
function issueImpact(issue) {
  var ideas = 0;
  var polls = 0;
  var opposition = 0;
  (issue.items || []).forEach(function (item) {
    if (item.type === "idea") ideas += 1;
    else if (item.type === "poll") polls += 1;
    else if (item.type === "opposition") opposition += 1;
  });
  var grants = 0;
  (room.assignments || []).forEach(function (row) {
    if (row.issueId !== issue.id) return;
    grants += 1 + (row.itemIds || []).length;
  });
  return { ideas: ideas, polls: polls, opposition: opposition, grants: grants };
}
function attachedSentence(n) {
  return "This issue still has " + countPhrase(n.ideas, "idea", "ideas") + ", " + countPhrase(n.polls, "poll", "polls") + ", " + countPhrase(n.opposition, "opposition item", "opposition items") + ", and " + countPhrase(n.grants, "grant", "grants") + ". Remove the ideas, polls, and opposition first.";
}
function dangerZone(issue) {
  if (!room.person || room.person.role !== "admin") return "";
  var n = issueImpact(issue);
  var head = '<details class="danger-zone"><summary>Danger zone</summary>';
  if (n.ideas || n.polls || n.opposition) {
    return head + '<p class="muted">' + esc(attachedSentence(n)) + "</p></details>";
  }
  return head + '<form class="form" data-form="remove-issue" data-id="' + esc(issue.id) + '" data-name="' + esc(issue.name) + '"><p class="muted">' + esc(countPhrase(n.grants, "grant", "grants") + " would be removed with this issue.") + '</p><label>Type the issue name to confirm<input data-confirm-name autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="80"></label><button class="link-btn" type="submit" disabled>Delete this issue</button></form></details>';
}
function activeIssueFilter() {
  if (!ideaFilter) return "";
  var found = (room.issues || []).some(function (issue) { return issue.id === ideaFilter; });
  return found ? ideaFilter : "";
}
function activeLensFilter() {
  if (lensFilter === "practical" || lensFilter === "structural" || lensFilter === "cultural") return lensFilter;
  return "";
}
function tenWord(value) {
  var step = scaleStep(value);
  if (step != null) return String(step);
  if (value == null || value === "") return "";
  return String(value);
}
function effortWord(item) {
  if (item.scoreAxis === "how widely held") return tenWord(item.held);
  return tenWord(item.ease);
}
function ideaGrid(items) {
  return dataGrid(["Idea", "Lens", "Effort", "Impact"], items.map(function (item) {
    var name = '<div class="idea-line"><span>' + esc(item.title || "") + "</span>";
    if (canEditIdeas()) name += '<button type="button" class="icon-btn" data-act="edit-idea" data-id="' + esc(item.id) + '" aria-label="Edit idea"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>';
    name += "</div>";
    return [name, esc(lensWord(item.lens)), esc(effortWord(item)), esc(tenWord(item.impact))];
  }));
}
function ideaGroups() {
  var filter = activeIssueFilter();
  var lens = activeLensFilter();
  var groups = [];
  (room.issues || []).forEach(function (issue) {
    if (filter && issue.id !== filter) return;
    var items = (issue.items || []).filter(function (item) {
      return !lens || (item.lens || "") === lens;
    });
    if (!filter && !items.length) return;
    groups.push({ issue: issue, items: items });
  });
  return groups;
}
function managedIssue() {
  var list = room.issues || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === manageIssue) return list[i];
  return list[0] || null;
}
function manageIssues() {
  if (!room || !room.staff) return "";
  var current = managedIssue();
  var existing = "";
  if (current) {
    var options = (room.issues || []).map(function (issue) {
      return '<option value="' + esc(issue.id) + '"' + (issue.id === current.id ? " selected" : "") + ">" + esc(issue.name) + "</option>";
    }).join("");
    existing = '<label class="issue-filter">Existing issue<select data-manage-issue>' + options + "</select></label>" + dangerZone(current);
  }
  return '<details class="manage-issues"' + (manageOpen ? " open" : "") + '><summary>Manage issues</summary><p class="muted manage-note">An issue is a topic, like Education.</p><form class="form" data-form="issue"><label>New issue<input id="n-issue" required maxlength="80"></label><button class="btn" type="submit">Add issue</button></form>' + existing + "</details>";
}
function ideasPage() {
  var filter = activeIssueFilter();
  var groups = ideaGroups();
  var grid = groups.map(function (group) {
    var body = group.items.length ? ideaGrid(group.items) : '<p class="muted">No ideas yet.</p>';
    return '<section class="issue-group"><h2>' + esc(group.issue.name) + "</h2>" + body + "</section>";
  }).join("");
  if (!grid) grid = '<p class="muted">No ideas yet.</p>';
  var filterOptions = '<option value="">All issues</option>' + (room.issues || []).map(function (issue) {
    return '<option value="' + esc(issue.id) + '"' + (filter === issue.id ? " selected" : "") + ">" + esc(issue.name) + "</option>";
  }).join("");
  var lens = activeLensFilter();
  var lensOptions = [["", "All"], ["practical", "Practical"], ["structural", "Structural"], ["cultural", "Cultural"]].map(function (pair) {
    return '<option value="' + pair[0] + '"' + (lens === pair[0] ? " selected" : "") + ">" + pair[1] + "</option>";
  }).join("");
  return '<h1 class="display">Ideas</h1>' + addNewButton() + ideaForm() + '<div class="filter-row"><label class="issue-filter">Issue<select data-idea-filter>' + filterOptions + '</select></label><label class="issue-filter">Lens<select data-lens-filter>' + lensOptions + "</select></label></div>" + grid + manageIssues();
}
function table(headers, rows) {
  if (!rows.length) return '<p class="muted">Nothing here yet.</p>';
  return '<div class="stack">' + rows.map(function (row) {
    return '<article class="card list-card">' + row.map(function (cell, i) {
      var label = headers[i] ? '<div class="kicker">' + headers[i] + "</div>" : "";
      return "<div>" + label + cell + "</div>";
    }).join("") + "</article>";
  }).join("") + "</div>";
}
function docTable(section) {
  return table(["Item", "Who can see it"], docs(section).map(function (doc) {
    var who = { clients: "All clients", org: "This organization", director: "Director", board: "Board", billing: "Billing" }[doc.visibility] || doc.visibility;
    return ['<button type="button" data-act="open" data-id="' + esc(doc.id) + '"><b>' + esc(doc.title) + "</b></button>", esc(who)];
  }));
}
function offerCard(doc) {
  var bits = [];
  if (doc.city) bits.push(esc(doc.city));
  if (doc.when) bits.push(esc(doc.when));
  if (doc.cost) bits.push(esc(doc.cost));
  var link = /^https:\/\/\S+$/i.test(doc.link || "") ? esc(doc.link) : "";
  return '<article class="card mb-m"><h2 class="display t-card">' + esc(doc.title) + "</h2>" +
    (bits.length ? "<p><b>" + bits.join(" · ") + "</b></p>" : "") +
    (doc.body ? '<p class="muted pre">' + esc(doc.body) + "</p>" : "") +
    (link ? '<p class="mt-m"><a class="btn" href="' + link + '" target="_blank" rel="noopener noreferrer">Fund this</a></p>' : "") +
    (doc.hasFile ? '<p class="mt-s"><button class="btn ghost" type="button" data-act="open" data-id="' + esc(doc.id) + '">Open file</button></p>' : "") +
    "</article>";
}
function orgOptions(placeholder) {
  return (placeholder ? '<option value="" selected>Choose an organization</option>' : "") +
    Object.keys(room.orgs || {}).map(function (id) {
      return '<option value="' + esc(id) + '">' + esc(room.orgs[id]) + "</option>";
    }).join("") + '<option value="new">New organization</option>';
}
/* Every staff-post section starts on "This organization". Widening to all clients is a choice. */
function addForm(section) {
  if (!room.staff) return "";
  var offer = section === "proposals" || section === "research";
  var extra = offer
    ? '<label>City<input id="d-city" placeholder="Phoenix"></label><label>Dates<input id="d-when" placeholder="March 12–14"></label><label>Cost<input id="d-cost" placeholder="$18,500" required></label><label>Link to fund it<input id="d-link" type="url" placeholder="https://"></label>'
    : "";
  return '<form class="form" data-form="doc" data-section="' + esc(section) + '"><div class="kicker">' + (offer ? "Add something they can fund" : "Add a document") + '</div><label>' + (offer ? "What" : "Title") + '<input id="d-title" required placeholder="' + (offer ? "Focus group" : "") + '"></label>' + extra +
    '<label>Who can see it<select id="d-vis"><option value="clients">All clients</option><option value="org" selected>This organization</option><option value="director">Director</option><option value="board">Board</option><option value="billing">Billing</option></select></label>' +
    '<div id="d-org-wrap"><label>Organization<select id="d-org" required>' + orgOptions(true) + '</select></label><label>New organization name<input id="d-org-name" placeholder="Only if you chose New organization"></label></div>' +
    '<label>Comment<textarea id="d-body" rows="4" placeholder="' + (offer ? "What they get, and why it is worth funding." : "") + '"></textarea></label><label>File, if there is one<input id="d-file" type="file"></label><button class="btn" type="submit">' + (offer ? "Post this" : "Save document") + "</button></form>";
}
function syncOrgWrap() {
  var vis = document.getElementById("d-vis");
  var wrap = document.getElementById("d-org-wrap");
  var org = document.getElementById("d-org");
  if (!vis || !wrap) return;
  var all = vis.value === "clients";
  wrap.hidden = all;
  if (org) org.required = !all;
}
function disclosureBlock() {
  var map = room.disclosures || {};
  var ids = Object.keys(map);
  if (!ids.length) return "";
  var head = '<div class="card mb-l"><div class="kicker">' + (room.staff ? "Client identity" : "Can Junto Nova say you are a client?") + "</div>";
  if (room.staff) {
    return head + table(["Client", "Setting"], ids.map(function (id) { return [esc(room.orgs[id] || id), esc(map[id].label)]; })) + "</div>";
  }
  var d = map[room.person.orgId] || map[ids[0]];
  return head + '<p><span class="pill">' + esc(d.label) + '</span></p><p class="muted">We will not name you or describe you in a way people could recognize.</p></div>';
}
function safeB64(s) { return String(s || "").replace(/[^A-Za-z0-9+\/=]/g, ""); }
function sectionClosed() {
  if (!room || !room.person) return denied;
  if (denied) return true;
  if (view === "home") return false;
  return !canOpenTab(view);
}
function page() {
  if (!token && emailStep) {
    var step = emailCard();
    if (step) return step;
  }
  if (!token) {
    var ms = msEnabled ? '<a class="btn signin ms" href="' + API + '/auth/microsoft/start"><svg class="signin-logo" viewBox="0 0 21 21" aria-hidden="true"><path fill="#f25022" d="M0 0h10v10H0z"/><path fill="#7fba00" d="M11 0h10v10H11z"/><path fill="#00a4ef" d="M0 11h10v10H0z"/><path fill="#ffb900" d="M11 11h10v10H11z"/></svg><span>Sign in with Microsoft</span></a>' : "";
    ms += emailForm();
    return '<main class="wrap"><div class="login-shell"><div class="login-card card signin-card"><div class="kicker">Client portal</div><h1 class="display t-lg">Sign in</h1>' + (error ? '<div class="err" role="alert">' + esc(error) + "</div>" : "") + '<div class="signin-stack"><div id="google-btn"></div><button type="button" class="btn signin google" id="google-fallback" data-act="google"><svg class="signin-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg><span>Sign in with Google</span></button>' + ms + '</div></div></div></main>';
  }
  if (!room && denied) {
    return '<main class="wrap"><h1 class="display">You can\'t open that.</h1><p class="mt-s"><a href="/portal">Home</a></p></main>';
  }
  if (!room) {
    return '<main class="wrap"><div class="login-card card"><h1 class="display t-lg">This account isn\'t on the list</h1><p class="muted">' + esc(error || "Ask Junto Nova to add this Google account.") + '</p><button type="button" class="btn ghost" data-act="logout">Sign out</button></div></main>';
  }
  var org = room.staff ? "All clients" : (room.person.orgName || "Your organization");
  var main = "";
  if (sectionClosed()) {
    main = '<h1 class="display">You can\'t open that.</h1>';
  } else if (view === "home") {
    main = '<div class="kicker">Workspace</div><h1 class="display">' + esc(org) + '</h1><div class="grid">' + homeCards() + "</div>";
  } else if (view === "ideas") {
    main = ideasPage();
  } else if (view === "admin") {
    main = admin();
  } else {
    var titles = { proposals: "Proposals", research: "Research", billing: "Billing" };
    var form = addingNew && room.staff ? addForm(view) : "";
    main = '<div class="kicker">' + esc(org) + '</div><h1 class="display">' + titles[view] + "</h1>" + (view === "research" ? disclosureBlock() : "") + addNewButton() + form + docRows(view);
  }
  if (reading && !sectionClosed()) {
    var download = "";
    if (reading.contentB64) {
      download = '<p class="mt-m"><a class="btn" download="' + esc(reading.filename || "document") + '" href="data:' + esc(reading.mime || "application/octet-stream") + ";base64," + safeB64(reading.contentB64) + '">Download</a></p>';
    }
    main += '<article class="card mt-l"><h2 class="display t-md">' + esc(reading.title) + '</h2><p class="muted pre">' + esc(reading.body) + "</p>" + download + "</article>";
  }
  return '<div class="portal-tabs"><nav class="wrap" aria-label="Portal sections">' + nav() + '</nav></div><main class="wrap">' + (error ? '<div class="err" role="alert">' + esc(error) + "</div>" : "") + main + "</main>";
}
function card(label, n, id) {
  return '<a class="card home-card" href="' + pathFor(id) + '" data-act="view" data-view="' + id + '"><div class="muted">' + label + '</div><div class="stat">' + esc(n) + '</div><span class="btn ghost">Open</span></a>';
}
function homeCards() {
  return ["ideas", "proposals", "research", "billing", "admin"].filter(canOpenTab).map(function (id) {
    var n = (room.counts || {})[id];
    return card(sectionLabel(id), n == null ? "0" : String(n), id);
  }).join("");
}
function personForm() {
  // Only an admin can grant staff (the Worker enforces it; the page just doesn't offer it).
  var admin = isAdmin();
  return '<form class="form" data-form="person"><div class="row2"><label>Name<input id="c-name" required></label><label>Email<input id="c-email" type="email" required></label></div><label>Role<select id="c-role"><option value="director">Director</option><option value="board">Board</option><option value="member">Member</option>' + (admin ? '<option value="jn">Junto Nova staff</option>' : "") + '</select></label><label>Organization<select id="c-org">' + orgOptions(false) + '</select></label><label>New organization name<input id="c-org-name" placeholder="Only if you chose New organization"></label><label class="check"><input id="c-bill" type="checkbox"> Billing</label><button class="btn" type="submit">Give access</button></form>';
}
function accessEditedLine(person) {
  if (!person.accessEditedBy || !person.accessEditedAt) return "";
  return '<p class="access-edited">Last edited by ' + esc(person.accessEditedBy) + ", " + esc(dateWord(person.accessEditedAt)) + "</p>";
}
function grantedSections(person) {
  if (person.sections) return person.sections;
  var granted = ["ideas", "proposals", "research"];
  if (person.billing) granted.push("billing");
  return granted;
}
function accessForm(person) {
  var boxes = [["ideas", "Ideas"], ["proposals", "Proposals"], ["research", "Research"], ["billing", "Billing"]].map(function (pair) {
    var on = grantedSections(person).indexOf(pair[0]) !== -1;
    return '<label class="check tap"><input type="checkbox" value="' + pair[0] + '"' + (on ? " checked" : "") + "><span>" + pair[1] + "</span></label>";
  }).join("");
  return '<form class="form access-form" data-form="section-access" data-id="' + esc(person.id) + '"><div class="checks">' + boxes + "</div>" + accessEditedLine(person) + '<div class="form-actions"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" data-act="cancel-access">Cancel</button></div></form>';
}
function admin() {
  if (!canOpenTab("admin")) return '<h1 class="display">You can\'t open that.</h1>';
  var adminRole = isAdmin();
  var headers = ["Name", "Organization", "Access", "Added"];
  var rows = (room.directory || []).map(function (person) {
    var staffRow = person.role === "jn" || person.role === "admin";
    var action = "";
    if (room.staff && !(staffRow && !adminRole)) {
      action = '<button type="button" class="btn ghost" data-act="remove-person" data-id="' + esc(person.id) + '">Remove</button>' + (emailEnabled ? ' <button type="button" class="btn ghost" data-act="reset-2fa" data-id="' + esc(person.id) + '">Reset app</button>' : "");
    }
    var name = esc(person.name) + '<div class="file-meta">' + esc(person.email) + "</div>" + action;
    var access = staffRow ? "<p>Every section</p>" : accessForm(person);
    return [name, esc(person.orgId ? (room.orgs || {})[person.orgId] : "None"), access, esc(dateWord(person.createdAt))];
  });
  var give = room.staff ? addNewButton() + (addingNew ? personForm() : "") : "";
  return '<div class="kicker">Junto Nova</div><h1 class="display">Admin</h1>' + give + dataGrid(headers, rows);
}
/* Editors (inline rename and the full edit form) keep what was typed. Any re-render while one is
   open carries the typed values over, and nothing else closes an editor that has unsaved text.
   Only Save sends it; only Cancel or Escape throws it away. */
var EDITOR_SELECTOR = "[data-name-input], form[data-form='item'] input, form[data-form='item'] textarea, form[data-form='item'] select";
function editorSnapshot() {
  var out = [];
  var els = document.querySelectorAll("#app " + EDITOR_SELECTOR.split(", ").join(", #app "));
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var key = el.getAttribute("data-name-input") ? "name:" + el.getAttribute("data-name-input") : el.id ? "form:" + el.id : "";
    if (!key) continue;
    out.push({ key: key, value: el.type === "checkbox" ? el.checked : el.value, dirty: fieldDirty(el), focused: document.activeElement === el, start: el.selectionStart, end: el.selectionEnd });
  }
  return out;
}
function fieldDirty(el) {
  if (el.type === "checkbox") return el.checked !== el.defaultChecked;
  if (el.tagName === "SELECT") {
    for (var i = 0; i < el.options.length; i++) if (el.options[i].selected !== el.options[i].defaultSelected) return true;
    return false;
  }
  return el.value !== el.defaultValue;
}
function editorDirty() {
  return editorSnapshot().some(function (f) { return f.dirty; });
}
function editorRestore(snap) {
  snap.forEach(function (f) {
    var el = f.key.indexOf("name:") === 0
      ? document.querySelector("#app [data-name-input='" + (window.CSS && CSS.escape ? CSS.escape(f.key.slice(5)) : f.key.slice(5)) + "']")
      : document.getElementById(f.key.slice(5));
    if (!el || !el.closest("#app")) return;
    if (!f.dirty) { /* untouched: take the fresh value */ } else if (el.type === "checkbox") el.checked = f.value; else el.value = f.value;
    if (f.focused) {
      el.focus();
      try { if (f.start != null) el.setSelectionRange(f.start, f.end); } catch (e) {}
    }
  });
}
function render() {
  var snap = editorSnapshot();
  document.getElementById("app").innerHTML = page();
  editorRestore(snap);
  paintMenu();
  var activeTab = document.querySelector('.portal-tabs a[aria-current="page"]');
  if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
  paintIssueGrid();
  if (!token) initGoogle();
  else syncOrgWrap();
}
async function saveSectionAccess(form) {
  var sections = [];
  form.querySelectorAll("input[type=checkbox]").forEach(function (box) {
    if (box.checked && SECTION_TABS.indexOf(box.value) !== -1) sections.push(box.value);
  });
  var data = await api({ action: "setSectionAccess", id: form.getAttribute("data-id"), sections: sections });
  if (!await takeRoom(data)) return;
  render();
}
async function savePerson() {
  var data = await api({
    action: "savePerson",
    name: document.getElementById("c-name").value,
    email: document.getElementById("c-email").value,
    role: document.getElementById("c-role").value,
    orgId: document.getElementById("c-org").value,
    orgName: document.getElementById("c-org-name").value,
    billing: document.getElementById("c-bill").checked,
  });
  if (!await takeRoom(data)) return;
  addingNew = false;
  render();
}
async function resetTwoFactor(id, btn) {
  var data = await api({ action: "resetTwoFactor", id: id });
  if (data.error) { error = data.error; render(); return; }
  if (btn) { btn.textContent = "Reset"; btn.disabled = true; }
}
async function removePerson(id) {
  var data = await api({ action: "removePerson", id: id });
  if (!await takeRoom(data)) return;
  render();
}
function field(id) { var el = document.getElementById(id); return el ? el.value : ""; }
async function saveDoc(section) {
  var fileEl = document.getElementById("d-file");
  var file = fileEl && fileEl.files ? fileEl.files[0] : null;
  var contentB64 = "";
  var filename = null;
  var mime = null;
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      error = "That file is too large. Keep it under 5 megabytes.";
      render();
      return;
    }
    contentB64 = await new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var raw = String(reader.result || "");
        var cut = raw.indexOf(",");
        resolve(cut >= 0 ? raw.slice(cut + 1) : raw);
      };
      reader.onerror = function () { reject(new Error("Couldn't read that file.")); };
      reader.readAsDataURL(file);
    });
    filename = file.name;
    mime = file.type || "application/octet-stream";
  }
  try {
    var data = await api({
      action: "saveDocument",
      title: field("d-title"),
      section: section,
      visibility: field("d-vis"),
      orgId: document.getElementById("d-org") ? field("d-org") : "new",
      orgName: field("d-org-name"),
      body: field("d-body"),
      city: field("d-city"),
      when: field("d-when"),
      cost: field("d-cost"),
      link: field("d-link"),
      contentB64: contentB64,
      filename: filename,
      mime: mime,
    });
    if (!await takeRoom(data)) return;
    reading = null;
    addingNew = false;
    render();
  } catch (e) {
    error = e.message || "Couldn't save that.";
    render();
  }
}
async function takeRoom(data) {
  if (!data || data.error) { error = (data && data.error) || "Something went wrong. Try again."; render(); return false; }
  error = "";
  if (previewKind()) { room = data; previewCounts(); return true; }
  await loadCurrent();
  if (denied || error) { render(); return false; }
  return true;
}
async function saveIssueName() {
  var data = await api({ action: "saveIssue", name: field("n-issue") });
  if (!await takeRoom(data)) return;
  var match = (room.issues || []).filter(function (issue) { return issue.name === field("n-issue"); })[0];
  if (match) {
    ideaIssue = match.id;
    manageIssue = match.id;
    manageOpen = true;
  }
  render();
}
/* Source links compared in order. The form sends URLs only, so a label on a saved link counts as
   a change (the save would drop it). */
function sourcesChanged(before, after) {
  var a = (before || []).map(function (x) { return typeof x === "string" ? { url: x, label: "" } : { url: x.url, label: x.label || "" }; });
  var b = (after || []).map(function (x) { return typeof x === "string" ? { url: x, label: "" } : { url: x.url, label: x.label || "" }; });
  if (a.length !== b.length) return true;
  for (var i = 0; i < a.length; i++) if (a[i].url !== b[i].url || a[i].label !== b[i].label) return true;
  return false;
}
function formAlert(form, message) {
  if (!form) return;
  var note = form.querySelector(".scale-error");
  if (!note) {
    note = document.createElement("p");
    note.className = "err scale-error";
    note.setAttribute("role", "alert");
    form.insertBefore(note, form.firstChild);
  }
  note.textContent = message;
}
function pickedStep(group) {
  var root = document.querySelector('#app [data-scale-group="' + group + '"]');
  if (!root) return undefined;
  var on = root.querySelector('[aria-pressed="true"]');
  if (!on) return null;
  var n = Number(on.getAttribute("data-value"));
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}
function storedNumber(group) {
  var root = document.querySelector('#app [data-scale-group="' + group + '"]');
  if (!root) return undefined;
  var raw = root.getAttribute("data-stored");
  if (raw == null || raw === "") return null;
  var n = Number(raw);
  return Number.isInteger(n) ? n : null;
}
function axisPayload() {
  var xName = document.querySelector('#app [data-scale-group="held"]') ? "held" : "effort";
  var xPick = pickedStep(xName);
  var yPick = pickedStep("impact");
  if (xPick === undefined || yPick === undefined) return "Pick effort and impact.";
  var xStored = storedNumber(xName);
  var yStored = storedNumber("impact");
  if ((xPick == null && xStored == null) || (yPick == null && yStored == null)) return "Pick effort and impact.";
  if (xPick != null && yPick != null) return { held: xName === "held", scoreScale: "1-10", x: xPick, y: yPick };
  return { held: xName === "held", scoreScale: "", x: xPick != null ? xPick * 10 : xStored, y: yPick != null ? yPick * 10 : yStored };
}
async function saveItemForm(form) {
  var lines = field("i-sources").split(/\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  var axis = axisPayload();
  if (typeof axis === "string") { formAlert(form, axis); return; }
  var body = {
    action: "saveItem",
    issueId: form.getAttribute("data-issue"),
    type: field("i-type"),
    status: field("i-status"),
    lens: field("i-lens"),
    title: field("i-title"),
    text: field("i-text"),
    evidence: field("i-evidence"),
    empiricism: field("i-emp"),
    ease: axis.held ? null : axis.x,
    impact: axis.y,
    sourceUrls: lines,
  };
  if (axis.held) body.held = axis.x;
  if (axis.scoreScale) body.scoreScale = axis.scoreScale;
  var id = form.getAttribute("data-id");
  if (id) body.id = id;
  /* A published idea whose title, text or evidence changes goes back to the publishing queue
     first, so the change is never public before the gate is cleared again. */
  var prev = null;
  if (id) (room.issues || []).forEach(function (issue) { (issue.items || []).forEach(function (row) { if (row.id === id) prev = row; }); });
  if (prev && prev.publicState === "published" && (body.title !== (prev.title || "") || body.text !== (prev.body || "") || body.evidence !== (prev.evidence || "") || sourcesChanged(prev.sourceUrls, body.sourceUrls))) {
    var queued = await api({ action: "setItemPublic", id: id, on: true });
    if (!await takeRoom(queued)) return;
  }
  var data = await api(body);
  if (!await takeRoom(data)) return;
  editingItem = "";
  addingItem = false;
  openItem = id || "";
  render();
}
async function saveScores(itemId) {
  var form = document.querySelector('form[data-form="scores"]');
  var item = null;
  var issueId = "";
  (room.issues || []).forEach(function (issue) {
    (issue.items || []).forEach(function (row) {
      if (row.id === itemId) { item = row; issueId = issue.id; }
    });
  });
  if (!item) return;
  var axis = axisPayload();
  if (typeof axis === "string") { formAlert(form, axis); return; }
  var data = await api({
    action: "saveItem",
    id: item.id,
    issueId: issueId,
    type: item.type,
    status: item.status,
    lens: item.lens || "",
    title: item.title,
    text: item.body || "",
    evidence: item.evidence || "",
    empiricism: item.empiricism || "",
    ease: axis.held ? null : axis.x,
    held: axis.held ? axis.x : undefined,
    impact: axis.y,
    scoreScale: axis.scoreScale || undefined,
  });
  if (!await takeRoom(data)) return;
  openItem = itemId;
  render();
}
function grantIds(orgId, issueId) {
  var ids = [];
  (room.assignments || []).forEach(function (row) {
    if (row.orgId === orgId && row.issueId === issueId) ids = (row.itemIds || []).slice();
  });
  return ids;
}
function ideaStaffExtras(form) {
  var pub = form.querySelector("#s-public");
  if (!pub) return null;
  var orgIds = [];
  form.querySelectorAll("input[data-org]").forEach(function (box) {
    if (box.checked) orgIds.push(box.getAttribute("data-org"));
  });
  return { public: pub.checked, orgIds: orgIds };
}
function ideaFields(form) {
  var issueId = field("s-issue");
  if (!issueId) return "Choose an issue.";
  var title = field("s-title").trim();
  if (!title) return "Write the idea.";
  var axis = axisPayload();
  if (typeof axis === "string") return axis;
  return {
    issueId: issueId,
    title: title,
    text: field("s-text").trim(),
    lens: field("s-lens") || "practical",
    ease: axis.x,
    impact: axis.y,
    scoreScale: axis.scoreScale === "1-10" ? "1-10" : "",
  };
}
async function addStaffIdea(form) {
  var fields = ideaFields(form);
  if (typeof fields === "string") { formAlert(form, fields); return; }
  var extra = ideaStaffExtras(form) || { public: false, orgIds: [] };
  var data = await api({
    action: "saveItem",
    issueId: fields.issueId,
    type: "idea",
    status: extra.public ? "vetted" : "untested",
    lens: fields.lens,
    title: fields.title,
    text: fields.text,
    evidence: "",
    empiricism: "",
    ease: fields.ease,
    impact: fields.impact,
    scoreScale: fields.scoreScale || undefined,
    sourceUrls: [],
    public: extra.public,
    orgIds: extra.orgIds,
  });
  if (!await takeRoom(data)) return;
  addingItem = false;
  addingNew = false;
  editingIdea = "";
  ideaIssue = fields.issueId;
  ideaFilter = fields.issueId;
  ideaLens = fields.lens;
  openItem = "";
  editingItem = "";
  render();
}
async function toggleClient(itemId, orgId, checked) {
  var issueId = "";
  (room.issues || []).forEach(function (issue) {
    (issue.items || []).forEach(function (item) {
      if (item.id === itemId) issueId = issue.id;
    });
  });
  if (!issueId) return;
  var ids = grantIds(orgId, issueId).filter(function (id) { return id !== itemId; });
  if (checked) ids.push(itemId);
  var data = await api({
    action: "setAssignment",
    orgId: orgId,
    issueId: issueId,
    assigned: ids.length > 0,
    itemIds: ids,
  });
  if (!await takeRoom(data)) return;
  clientSaved = itemId;
  openItem = itemId;
  render();
}
async function setItemPublic(id, on) {
  var data = await api({ action: "setItemPublic", id: id, on: on });
  if (!await takeRoom(data)) return;
  render();
}
async function clearPublicGate(form) {
  var note = form.querySelector("input");
  var data = await api({ action: "clearPublicGate", id: form.getAttribute("data-id"), note: note ? note.value : "" });
  if (!await takeRoom(data)) return;
  render();
}
async function patchIdea(id, payload) {
  if (previewKind()) return previewPatchIdea(id, payload);
  var res = await fetch(API + "/ideas/" + encodeURIComponent(id), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  var data = await res.json().catch(function () { return null; });
  lastStatus = res.status;
  if (res.status === 401) { signedOut(); throw new Error(""); }
  if (!res.ok) return { error: (data && data.error) || "Couldn't save that idea." };
  return data || { ok: true };
}
async function saveEditedIdea(form) {
  var id = (form && form.getAttribute("data-id")) || editingIdea;
  var fields = ideaFields(form);
  if (typeof fields === "string") { formAlert(form, fields); return; }
  var payload = {
    issueId: fields.issueId,
    lens: fields.lens,
    title: fields.title,
    text: fields.text,
    ease: fields.ease,
    impact: fields.impact,
  };
  if (fields.scoreScale) payload.scoreScale = fields.scoreScale;
  var extra = ideaStaffExtras(form);
  if (extra) {
    payload.public = extra.public;
    payload.orgIds = extra.orgIds;
  }
  var data = await patchIdea(id, payload);
  if (!await takeRoom(data)) return;
  addingNew = false;
  editingIdea = "";
  render();
}
async function submitIdea(form) {
  var fields = ideaFields(form);
  if (typeof fields === "string") { formAlert(form, fields); return; }
  var data = await api({
    action: "submitIdea",
    issueId: fields.issueId,
    title: fields.title,
    text: fields.text,
    source: "",
    lens: fields.lens,
    ease: fields.ease,
    impact: fields.impact,
    scoreScale: fields.scoreScale || undefined,
  });
  if (!await takeRoom(data)) return;
  addingNew = false;
  editingIdea = "";
  ideaFilter = fields.issueId;
  render();
}
async function removeIdeaItem(id) {
  var data = await api({ action: "removeItem", id: id });
  if (!await takeRoom(data)) return;
  if (openItem === id) openItem = "";
  editingItem = "";
  render();
}
async function removeIdeaIssue(id, confirmName) {
  var data = await api({ action: "removeIssue", id: id, confirmName: confirmName });
  if (!await takeRoom(data)) return;
  if (ideaIssue === id) ideaIssue = "";
  openItem = "";
  editingItem = "";
  render();
}
async function openDoc(id) {
  var data = await api({ action: "open", id: id });
  if (data.error) { error = "That document isn't available."; render(); return; }
  reading = data;
  error = "";
  render();
}
function menu(open) {
  var panel = document.getElementById("mobile-menu");
  var button = document.getElementById("menu-toggle");
  var isOpen = typeof open === "boolean" ? open : !panel.classList.contains("open");
  panel.classList.toggle("open", isOpen);
  document.getElementById("menu-icon").classList.toggle("hidden", isOpen);
  document.getElementById("close-icon").classList.toggle("hidden", !isOpen);
  button.setAttribute("aria-expanded", isOpen ? "true" : "false");
  button.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}
function fail(e) { error = (e && e.message) || "Something went wrong. Try again."; render(); }

document.addEventListener("click", function (event) {
  var target = event.target.closest ? event.target.closest("[data-act]") : null;
  var panel = document.getElementById("mobile-menu");
  if (panel && panel.classList.contains("open")) {
    var inside = panel.contains(event.target) || document.getElementById("menu-toggle").contains(event.target);
    if (!inside) menu(false);
  }
  var dot = event.target.closest ? event.target.closest("#issue-grid button[data-id]") : null;
  if (dot && editorDirty()) return;
  if (dot) {
    var dotId = dot.getAttribute("data-id") || "";
    openItem = dotId;
    editingItem = "";
    render();
    var opened = document.querySelector("#app .item-open[data-id='" + (window.CSS && CSS.escape ? CSS.escape(dotId) : dotId) + "']");
    if (opened && opened.scrollIntoView) opened.scrollIntoView({ block: "nearest" });
    return;
  }
  if (!target) return;
  var act = target.getAttribute("data-act");
  if (act === "menu") menu();
  else if (act === "menu-close") menu(false);
  else if (act === "view") { event.preventDefault(); setView(target.getAttribute("data-view")); }
  else if (act === "add-new") {
    if (!showAddNew()) return;
    addingNew = true;
    if (view === "ideas") { addingItem = false; editingItem = ""; editingIdea = ""; openItem = ""; }
    render();
  }
  else if (act === "cancel-new") { addingNew = false; editingIdea = ""; render(); }
  else if (act === "cancel-access") {
    var accessFormEl = target.closest("form");
    if (accessFormEl) accessFormEl.reset();
  }
  else if (act === "edit-idea") {
    if (!canEditIdeas()) return;
    editingIdea = target.getAttribute("data-id") || "";
    addingNew = true;
    render();
    var ideaFormEl = document.querySelector(".idea-form");
    if (ideaFormEl && ideaFormEl.scrollIntoView) ideaFormEl.scrollIntoView({ block: "nearest" });
    var titleInput = document.getElementById("s-title");
    if (titleInput) titleInput.focus();
  }
  else if (act === "open-idea") {
    if (editorDirty()) return;
    ideaIssue = target.getAttribute("data-issue") || "";
    openItem = target.getAttribute("data-id") || "";
    editingItem = "";
    editingName = "";
    render();
    var openedIdea = document.querySelector("#app .item-open[data-id='" + (window.CSS && CSS.escape ? CSS.escape(openItem) : openItem) + "']");
    if (openedIdea && openedIdea.scrollIntoView) openedIdea.scrollIntoView({ block: "nearest" });
  }
  else if (act === "logout") logout();
  else if (act === "google") signInGoogle();
  else if (act === "email-back") { resetEmail(""); render(); }
  else if (act === "use-recovery") { useRecovery = true; error = ""; render(); }
  else if (act === "use-app") { useRecovery = false; error = ""; render(); }
  else if (act === "copy-recovery") copyRecovery(target);
  else if (act === "recovery-done") finishRecovery();
  else if (act === "open") openDoc(target.getAttribute("data-id")).catch(fail);
  else if (act === "remove-person") removePerson(target.getAttribute("data-id")).catch(fail);
  else if (act === "reset-2fa") resetTwoFactor(target.getAttribute("data-id"), target).catch(fail);
  else if (act === "idea") { ideaIssue = target.getAttribute("data-id") || ""; issueOpen = false; openItem = ""; editingItem = ""; addingItem = false; view = "ideas"; render(); }
  else if (act === "issue-drawer") { issueOpen = !issueOpen; render(); }
  else if (act === "lens") { ideaLens = target.getAttribute("data-lens") || ""; openItem = ""; editingItem = ""; render(); }
  else if (act === "add-lens") {
    addLens = target.getAttribute("data-lens") || "practical";
    var group = target.parentElement;
    if (!group) return;
    var chips = group.querySelectorAll("[data-act='add-lens']");
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i] === target;
      chips[i].classList.toggle("active", on);
      chips[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  else if (act === "toggle-item") {
    if (editorDirty()) return;
    var itemId = target.getAttribute("data-id");
    openItem = openItem === itemId ? "" : itemId;
    if (openItem !== itemId) editingItem = "";
    editingName = "";
    render();
  }
  else if ((act === "edit-item" || act === "edit-name") && editorDirty()) return;
  else if (act === "cancel-item") { editingItem = ""; render(); }
  else if (act === "edit-item") { editingItem = target.getAttribute("data-id"); openItem = editingItem; editingName = ""; render(); }
  else if (act === "edit-name") { editingName = target.getAttribute("data-id"); openItem = ""; editingItem = ""; render(); setTimeout(function () { var inp = document.querySelector("[data-name-input]"); if (inp) { inp.focus(); inp.select(); } }, 0); }
  else if (act === "cancel-name") { editingName = ""; render(); }
  else if (act === "save-name") { saveName(target.getAttribute("data-id")).catch(fail); }
  else if (act === "add-item") {
    var from = target.getAttribute("data-lens") || ideaLens || "practical";
    if (from !== "practical" && from !== "structural" && from !== "cultural") from = "practical";
    addLens = from;
    ideaLens = from;
    addingItem = true;
    editingItem = "";
    openItem = "";
    clientSaved = "";
    render();
  }
  else if (act === "pick-scale") {
    var scale = target.closest ? target.closest("[data-scale-group]") : null;
    if (!scale) return;
    var buttons = scale.querySelectorAll("[data-act='pick-scale']");
    for (var s = 0; s < buttons.length; s++) {
      var pressed = buttons[s] === target;
      buttons[s].classList.toggle("active", pressed);
      buttons[s].setAttribute("aria-pressed", pressed ? "true" : "false");
    }
    var scoreForm = target.closest("form");
    if (scoreForm && scoreForm.getAttribute("data-form") === "scores") saveScores(scoreForm.getAttribute("data-id")).catch(fail);
  }
  else if (act === "remove-item") removeIdeaItem(target.getAttribute("data-id")).catch(fail);
});
document.addEventListener("submit", function (event) {
  var form = event.target;
  var kind = form && form.getAttribute ? form.getAttribute("data-form") : null;
  if (!kind) return;
  event.preventDefault();
  if (kind === "email-start" || kind === "email-code" || kind === "totp-enroll" || kind === "totp") { emailFlow(kind, form); return; }
  if (kind === "person") savePerson().catch(fail);
  else if (kind === "section-access") saveSectionAccess(form).catch(fail);
  else if (kind === "doc") saveDoc(form.getAttribute("data-section")).catch(fail);
  else if (kind === "issue") saveIssueName().catch(fail);
  else if (kind === "item") saveItemForm(form).catch(fail);
  else if (kind === "add-idea") addStaffIdea(form).catch(fail);
  else if (kind === "edit-idea") saveEditedIdea(form).catch(fail);
  else if (kind === "submit-idea") submitIdea(form).catch(fail);
  else if (kind === "clear-gate") clearPublicGate(form).catch(fail);
  else if (kind === "remove-issue") {
    var typed = form.querySelector("[data-confirm-name]");
    var expected = form.getAttribute("data-name") || "";
    if (!typed || typed.value !== expected) return;
    removeIdeaIssue(form.getAttribute("data-id"), typed.value).catch(fail);
  }
});
document.addEventListener("input", function (event) {
  var form = event.target && event.target.closest ? event.target.closest("[data-form='remove-issue']") : null;
  if (!form || !event.target.hasAttribute || !event.target.hasAttribute("data-confirm-name")) return;
  var button = form.querySelector("button");
  if (button) button.disabled = event.target.value !== (form.getAttribute("data-name") || "");
});
document.addEventListener("toggle", function (event) {
  var node = event.target;
  if (!node || !node.classList || !node.classList.contains("manage-issues")) return;
  manageOpen = node.open;
}, true);
document.addEventListener("change", function (event) {
  if (event.target && event.target.hasAttribute && event.target.hasAttribute("data-idea-filter")) {
    ideaFilter = event.target.value || "";
    render();
    return;
  }
  if (event.target && event.target.hasAttribute && event.target.hasAttribute("data-lens-filter")) {
    lensFilter = event.target.value || "";
    render();
    return;
  }
  if (event.target && event.target.hasAttribute && event.target.hasAttribute("data-manage-issue")) {
    manageIssue = event.target.value || "";
    manageOpen = true;
    render();
    return;
  }
  if (event.target && event.target.hasAttribute && event.target.hasAttribute("data-lens-select")) {
    ideaLens = event.target.value || "practical";
    if (editorDirty()) { render(); return; }
    openItem = "";
    editingItem = "";
    editingName = "";
    render();
    return;
  }
  if (event.target && event.target.id === "d-vis") syncOrgWrap();
  if (event.target && event.target.hasAttribute && event.target.hasAttribute("data-public")) {
    setItemPublic(event.target.getAttribute("data-public"), event.target.checked).catch(fail);
  }
  if (event.target && event.target.hasAttribute && event.target.hasAttribute("data-client")) {
    toggleClient(event.target.getAttribute("data-client"), event.target.getAttribute("data-org"), event.target.checked).catch(fail);
  }
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") { menu(false); if (editingName) { editingName = ""; render(); } else if (editingIdea) { editingIdea = ""; addingNew = false; render(); } else if (editingItem) { editingItem = ""; render(); } }
  /* Enter in the name field does nothing: only the Save button saves. */
  if (event.key === "Enter" && event.target && event.target.hasAttribute && event.target.hasAttribute("data-name-input")) event.preventDefault();
});
var gridTimer = 0;
window.addEventListener("resize", function () {
  clearTimeout(gridTimer);
  gridTimer = setTimeout(paintIssueGrid, 150);
});

function previewKind() {
  try {
    var host = location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") return "";
    return new URLSearchParams(location.search).get("preview") || "";
  } catch (e) { return ""; }
}
function previewItem(id, title, type, status, lens, ease, impact) {
  return { id: id, issueId: "issue-energy", type: type, status: status, lens: lens, title: title, body: "", ease: ease, impact: impact, evidence: "", empiricism: "", source: "staff", sourceUrls: [], own: false, publicState: "private", createdAt: "2026-03-01T12:00:00.000Z" };
}
function previewRoom(kind) {
  var energy = [
    Object.assign(previewItem("E1", "Time-of-use rates", "idea", "vetted", "practical", 74, 80), { publicState: "published", body: "Charge more when the grid is busy, and less when it is not.", evidence: "Several utilities already bill this way.", empiricism: "cited", stance: "Back", sourceUrls: [{ url: "https://example.test/time-of-use", label: "Utility tariff study" }], publicClearedBy: { id: "staff", name: "Staff One", email: "staff@example.test" }, publicClearedAt: "2026-03-02", publicClearNote: "Cleared for the public list." }),
    previewItem("E2", "Block a new fuel tax", "opposition", "untested", "practical", 40, 70),
    previewItem("E3", "Who writes the grid rules", "idea", "untested", "structural", null, null),
    Object.assign(previewItem("E4", "How widely the cost is felt", "idea", "vetted", "cultural", null, 60), { publicState: "queued", held: 55, scoreAxis: "how widely held", stance: "Watch" }),
    Object.assign(previewItem("E5", "A second structural change", "idea", "untested", "structural", 20, 30), { publicState: "queued" }),
    previewItem("E6", "Ask the co-op first", "idea", "untested", "", 40, 50),
  ];
  var housing = [
    { id: "staff-starter-commission", issueId: "issue-housing", type: "idea", status: "untested", lens: "practical", title: "Real estate commission rates", body: "", ease: null, impact: null, evidence: "", empiricism: "", source: "staff", sourceUrls: [] },
    { id: "staff-starter-agents", issueId: "issue-housing", type: "idea", status: "untested", lens: "practical", title: "Number of real estate agents per transaction or market", body: "", ease: null, impact: null, evidence: "", empiricism: "", source: "staff", sourceUrls: [] },
    { id: "staff-starter-title-fees", issueId: "issue-housing", type: "idea", status: "untested", lens: "practical", title: "Title company cut and fees", body: "", ease: null, impact: null, evidence: "", empiricism: "", source: "staff", sourceUrls: [] },
    { id: "staff-starter-forced-agent", issueId: "issue-housing", type: "idea", status: "untested", lens: "structural", title: "Laws and rules that effectively force buyers and sellers to use a real estate agent and title company", body: "", ease: null, impact: null, evidence: "", empiricism: "", source: "staff", sourceUrls: [], createdAt: "2026-03-01T12:00:00.000Z" },
  ];
  housing.forEach(function (item) { if (!item.createdAt) item.createdAt = "2026-03-01T12:00:00.000Z"; });
  var staff = kind === "staff";
  var member = kind === "member";
  var issues = staff
    ? [{ id: "issue-energy", slug: "energy", name: "Energy", notes: "", drive: "", items: energy }, { id: "issue-housing", slug: "housing", name: "Housing", notes: "", drive: "", items: housing }]
    : [{ id: "issue-energy", slug: "energy", name: "Energy", items: energy.slice(0, 2).map(function (item) { return Object.assign({}, item, { own: false }); }) }];
  var clientSections = member ? ["ideas"] : ["ideas", "proposals", "research"];
  var directory = [
    { id: "ada", name: "Ada Client", email: "ada@example.test", role: "director", billing: false, orgId: "orgA", createdAt: "2026-01-15T12:00:00.000Z", sections: ["ideas", "proposals", "research"], accessEditedBy: "Staff One", accessEditedAt: "2026-03-02T12:00:00.000Z" },
    { id: "member-two", name: "Member Two", email: "member@example.test", role: "member", billing: true, orgId: "orgA", createdAt: "2026-02-01T12:00:00.000Z", sections: ["ideas", "billing"], accessEditedBy: null, accessEditedAt: null },
  ];
  if (staff) directory.push({ id: "staff", name: "Staff One", email: "staff@example.test", role: "admin", billing: false, orgId: null, createdAt: "2026-01-01T12:00:00.000Z", sections: ["ideas", "proposals", "research", "billing"], accessEditedBy: null, accessEditedAt: null });
  return {
    access: "ok",
    email: staff ? "staff@example.test" : member ? "member@example.test" : "ada@example.test",
    staff: staff,
    person: staff
      ? { id: "staff", name: "Staff One", email: "staff@example.test", role: "admin", billing: false, clientAdmin: false, sections: ["ideas", "proposals", "research", "billing"], orgId: null, orgName: "" }
      : member
        ? { id: "member-two", name: "Member Two", email: "member@example.test", role: "member", billing: true, clientAdmin: false, sections: ["ideas"], orgId: "orgA", orgName: "Example Org A" }
        : { id: "ada", name: "Ada Client", email: "ada@example.test", role: "director", billing: false, clientAdmin: true, sections: clientSections, orgId: "orgA", orgName: "Example Org A" },
    orgs: staff ? { orgA: "Example Org A", orgB: "Contoso" } : { orgA: "Example Org A" },
    disclosures: { orgA: { setting: "no", label: "No", changedAt: null } },
    documents: [
      { id: "doc-proposal", section: "proposals", title: "Spring focus group", visibility: "org", orgId: "orgA", createdAt: "2026-03-01T12:00:00.000Z", body: "A short proposal.", hasFile: false },
      { id: "doc-research", section: "research", title: "Grid cost notes", visibility: "clients", orgId: null, createdAt: "2026-02-11T12:00:00.000Z", body: "Shared notes.", hasFile: false },
    ].concat(staff ? [{ id: "doc-billing", section: "billing", title: "March invoice", visibility: "billing", orgId: "orgA", createdAt: "2026-03-04T12:00:00.000Z", body: "Invoice.", hasFile: false }] : []),
    issues: issues,
    assignments: staff ? [{ orgId: "orgA", issueId: "issue-energy", itemIds: ["E1", "E2"] }] : undefined,
    directory: staff || !member ? directory.filter(function (person) { return staff || person.orgId === "orgA"; }) : undefined,
  };
}
function previewExtra() {
  try {
    var raw = sessionStorage.getItem("jn_preview_extra");
    if (!raw) return null;
    var data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch (e) { return null; }
}
function previewStore() {
  var items = [];
  (room.issues || []).forEach(function (issue) {
    (issue.items || []).forEach(function (item) {
      if (String(item.id).indexOf("preview-") === 0) items.push(item);
    });
  });
  try {
    sessionStorage.setItem("jn_preview_extra", JSON.stringify({ items: items, assignments: room.assignments || [] }));
  } catch (e) {}
}
function previewCounts() {
  if (!room || !room.person) return;
  var ideas = 0;
  (room.issues || []).forEach(function (issue) { ideas += (issue.items || []).length; });
  var n = function (section) {
    return (room.documents || []).filter(function (doc) { return doc.section === section; }).length;
  };
  room.counts = {
    ideas: canOpenTab("ideas") ? ideas : null,
    proposals: canOpenTab("proposals") ? n("proposals") : null,
    research: canOpenTab("research") ? n("research") : null,
    billing: canOpenTab("billing") ? n("billing") : null,
  };
  if (canOpenTab("admin")) room.counts.admin = (room.directory || []).length;
}
function previewApply(kind) {
  var extra = previewExtra();
  if (!extra) return;
  if (kind === "staff") {
    (extra.items || []).forEach(function (item) {
      (room.issues || []).forEach(function (issue) {
        if (issue.id !== item.issueId) return;
        var exists = (issue.items || []).some(function (row) { return row.id === item.id; });
        if (!exists) issue.items.push(item);
      });
    });
    if (extra.assignments) room.assignments = extra.assignments;
    return;
  }
  var allowed = {};
  (extra.assignments || []).forEach(function (row) {
    if (row.orgId !== "orgA") return;
    (row.itemIds || []).forEach(function (id) { allowed[id] = row.issueId; });
  });
  (extra.items || []).forEach(function (item) {
    if (allowed[item.id] !== item.issueId) return;
    (room.issues || []).forEach(function (issue) {
      if (issue.id !== item.issueId) return;
      var copy = {
        id: item.id, issueId: item.issueId, type: item.type, status: item.status, lens: item.lens,
        title: item.title, body: item.body, ease: item.ease == null ? null : item.ease,
        impact: item.impact == null ? null : item.impact, held: item.held == null ? null : item.held,
        scoreAxis: item.scoreAxis || "ease", stance: item.stance || null, evidence: item.evidence || "",
        empiricism: item.empiricism || "", source: item.source || "staff", sourceUrls: item.sourceUrls || [], own: false,
      };
      var exists = (issue.items || []).some(function (row) { return row.id === item.id; });
      if (!exists) issue.items.push(copy);
    });
  });
}
function previewScaled(body, key) {
  if (body.scoreScale === "1-10") {
    var n = body[key];
    return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10 ? n * 10 : null;
  }
  return body[key] == null ? null : body[key];
}
function previewPatchIdea(id, body) {
  var found = null;
  var from = null;
  (room.issues || []).forEach(function (issue) {
    (issue.items || []).forEach(function (item) {
      if (item.id === id) { found = item; from = issue; }
    });
  });
  if (!found || !from) return { error: "That isn't available." };
  var dest = from;
  if (body.issueId && body.issueId !== from.id) {
    dest = null;
    (room.issues || []).forEach(function (issue) { if (issue.id === body.issueId) dest = issue; });
    if (!dest) return { error: "Choose an issue." };
  }
  found.lens = body.lens || "";
  found.title = body.title || found.title;
  found.body = body.text || "";
  found.ease = previewScaled(body, "ease");
  found.impact = previewScaled(body, "impact");
  found.issueId = dest.id;
  if (dest !== from) {
    from.items = (from.items || []).filter(function (item) { return item.id !== id; });
    dest.items = dest.items || [];
    dest.items.push(found);
  }
  previewAudience(found, dest.id, body);
  previewStore();
  return room;
}
function previewAudience(item, issueId, body) {
  if (!body) return;
  if (Object.prototype.hasOwnProperty.call(body, "public")) {
    if (body.public) {
      if (item.publicState !== "published") item.publicState = "queued";
    } else item.publicState = "private";
  }
  if (!Array.isArray(body.orgIds)) return;
  var wanted = {};
  body.orgIds.forEach(function (orgId) { wanted[orgId] = true; });
  var next = [];
  var seen = {};
  (room.assignments || []).forEach(function (row) {
    var ids = (row.itemIds || []).filter(function (id) { return id !== item.id; });
    if (row.issueId === issueId && wanted[row.orgId]) {
      ids.push(item.id);
      seen[row.orgId] = true;
    }
    if (ids.length) next.push({ orgId: row.orgId, issueId: row.issueId, itemIds: ids });
  });
  Object.keys(wanted).forEach(function (orgId) {
    if (!seen[orgId]) next.push({ orgId: orgId, issueId: issueId, itemIds: [item.id] });
  });
  room.assignments = next;
}
function previewMutate(body) {
  var action = body && body.action;
  if (!action || action === "load") return room;
  if (action === "submitIdea") {
    body = {
      action: "saveItem",
      issueId: body.issueId,
      type: "idea",
      status: "untested",
      lens: body.lens || "",
      title: body.title || "",
      text: body.text || "",
      ease: body.ease,
      impact: body.impact,
      scoreScale: body.scoreScale || "1-10",
      sourceUrls: [],
    };
    action = "saveItem";
  }
  if (action === "saveItem") {
    if (body.id) {
      (room.issues || []).forEach(function (issue) {
        (issue.items || []).forEach(function (item) {
          if (item.id !== body.id) return;
          item.type = body.type || item.type;
          item.status = body.status || item.status;
          item.lens = body.lens || "";
          item.title = body.title || item.title;
          item.body = body.text || "";
          item.evidence = body.evidence || "";
          item.empiricism = body.empiricism || "";
          item.ease = previewScaled(body, "ease");
          item.impact = previewScaled(body, "impact");
          if (body.scoreScale === "1-10" && Object.prototype.hasOwnProperty.call(body, "held")) item.held = previewScaled(body, "held");
          if (Object.prototype.hasOwnProperty.call(body, "held")) item.held = body.held;
          if (Array.isArray(body.sourceUrls)) {
            item.sourceUrls = body.sourceUrls.map(function (entry) {
              var url = typeof entry === "string" ? entry : (entry && entry.url) || "";
              var label = typeof entry === "string" || !entry ? "" : entry.label || "";
              return { url: url, label: label };
            });
          }
          previewAudience(item, item.issueId, body);
        });
      });
    } else {
      var created = {
        id: "preview-" + Date.now().toString(36),
        issueId: body.issueId,
        type: body.type || "idea",
        status: body.status || "untested",
        lens: body.lens || "",
        title: body.title || "",
        body: body.text || "",
        ease: previewScaled(body, "ease"),
        impact: previewScaled(body, "impact"),
        held: null,
        scoreAxis: "ease",
        stance: null,
        evidence: body.evidence || "",
        empiricism: body.empiricism || "",
        source: "staff",
        sourceUrls: [],
        publicState: "private",
      };
      if (Array.isArray(body.sourceUrls)) {
        created.sourceUrls = body.sourceUrls.map(function (entry) {
          var url = typeof entry === "string" ? entry : (entry && entry.url) || "";
          return { url: url, label: "" };
        });
      }
      (room.issues || []).forEach(function (issue) {
        if (issue.id === body.issueId) issue.items.push(created);
      });
      previewAudience(created, body.issueId, body);
    }
    previewStore();
    return room;
  }
  if (action === "setSectionAccess") {
    if (!room.staff && !(room.person && room.person.clientAdmin)) return { error: "You can't open that." };
    var edited = null;
    (room.directory || []).forEach(function (row) { if (row.id === body.id) edited = row; });
    if (!edited) return { error: "That isn't available." };
    if (edited.role === "jn" || edited.role === "admin") return { error: "Staff already have every section." };
    var allowed = { ideas: true, proposals: true, research: true, billing: true };
    edited.sections = (body.sections || []).filter(function (id) { return allowed[id]; });
    edited.billing = edited.sections.indexOf("billing") !== -1;
    edited.accessEditedBy = room.person.name;
    edited.accessEditedAt = "2026-10-14T12:00:00.000Z";
    if (room.person.id === edited.id) {
      room.person.sections = edited.sections.slice();
      room.person.billing = edited.billing;
    }
    previewStore();
    return room;
  }
  if (action === "saveIssue") {
    var issueName = typeof body.name === "string" ? body.name.trim() : "";
    if (!issueName) return { error: "Name is required." };
    var taken = (room.issues || []).some(function (issue) { return String(issue.name).toLowerCase() === issueName.toLowerCase(); });
    if (taken) return { error: "An issue with that name already exists." };
    room.issues = room.issues || [];
    room.issues.push({
      id: "preview-issue-" + Date.now().toString(36),
      slug: issueName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: issueName,
      notes: "",
      drive: "",
      items: [],
    });
    return room;
  }
  if (action === "removeIssue") {
    if (!room.person || room.person.role !== "admin") return { error: "Only an admin can delete an issue." };
    var targetIssue = null;
    (room.issues || []).forEach(function (issue) { if (issue.id === body.id) targetIssue = issue; });
    if (!targetIssue) return { error: "That isn't available." };
    var impact = issueImpact(targetIssue);
    if (impact.ideas || impact.polls || impact.opposition) return { error: attachedSentence(impact) };
    if (body.confirmName !== targetIssue.name) return { error: "Type the issue name exactly." };
    room.issues = room.issues.filter(function (issue) { return issue.id !== targetIssue.id; });
    room.assignments = (room.assignments || []).filter(function (row) { return row.issueId !== targetIssue.id; });
    return room;
  }
  if (action === "setAssignment") {
    var orgId = body.orgId;
    var issueId = body.issueId;
    var ids = Array.isArray(body.itemIds) ? body.itemIds.slice() : [];
    room.assignments = (room.assignments || []).filter(function (row) {
      return !(row.orgId === orgId && row.issueId === issueId);
    });
    if (body.assigned && ids.length) room.assignments.push({ orgId: orgId, issueId: issueId, itemIds: ids });
    previewStore();
    return room;
  }
  if (action === "setItemPublic") {
    (room.issues || []).forEach(function (issue) {
      (issue.items || []).forEach(function (item) {
        if (item.id !== body.id) return;
        item.publicState = body.on ? "queued" : "private";
        if (!body.on) { item.publicClearedBy = null; item.publicClearedAt = ""; item.publicClearNote = ""; }
      });
    });
    previewStore();
    return room;
  }
  if (action === "clearPublicGate") {
    (room.issues || []).forEach(function (issue) {
      (issue.items || []).forEach(function (item) {
        if (item.id !== body.id) return;
        item.publicState = "published";
        item.publicClearedBy = { id: "staff", name: "Staff One", email: "staff@example.test" };
        item.publicClearedAt = "2026-03-02";
        item.publicClearNote = body.note || "";
      });
    });
    previewStore();
    return room;
  }
  return room;
}

async function saveName(itemId) {
  var inp = document.querySelector("[data-name-input]");
  if (!inp) return;
  var title = inp.value.trim();
  if (!title) { error = "Name can't be empty."; render(); return; }
  var item = null;
  var issueId = "";
  (room.issues || []).forEach(function (issue) {
    (issue.items || []).forEach(function (row) {
      if (row.id === itemId) { item = row; issueId = issue.id; }
    });
  });
  if (!item) return;
  var body = {
    action: "saveItem",
    id: itemId,
    issueId: issueId,
    type: item.type || "idea",
    status: item.status || "untested",
    lens: item.lens || "",
    title: title,
    text: item.body || "",
    evidence: item.evidence || "",
    empiricism: item.empiricism || "",
    ease: item.ease,
    impact: item.impact,
    sourceUrls: (item.sourceUrls || []).map(function (s) { return typeof s === "string" ? s : { url: s.url, label: s.label || "" }; }),
  };
  if (item.scoreAxis === "how widely held") body.held = item.held;
  /* A published idea with a new name goes back to the publishing queue first, so the new name is
     never public until the gate is cleared again. setItemPublic on: true moves published to queued
     and clears the gate. */
  if (item.publicState === "published" && title !== item.title) {
    var queued = await api({ action: "setItemPublic", id: itemId, on: true });
    if (!await takeRoom(queued)) return;
  }
  var data = await api(body);
  if (!await takeRoom(data)) return;
  editingName = "";
  error = "";
  render();
}

window.addEventListener("popstate", function () {
  view = viewFromLocation();
  reading = null;
  addingNew = false;
  editingIdea = "";
  addingItem = false;
  denied = false;
  menu(false);
  if (!token || previewKind()) { render(); return; }
  loadCurrent().then(function () { render(); }).catch(fail);
});
function boot() {
  view = viewFromLocation();
  if (!pathIsKnown()) {
    view = "home";
    try { history.replaceState({ view: "home" }, "", "/portal" + location.search); } catch (e) {}
  }
  var preview = previewKind();
  if (preview === "staff" || preview === "client" || preview === "member") {
    token = "preview";
    room = previewRoom(preview);
    previewApply(preview);
    previewCounts();
    ideaIssue = "issue-energy";
    render();
    return;
  }
  readSigninOutcome();
  var sessionCheck = fetch(API + "/api/portal", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sectionBody()),
  }).then(function (res) {
    lastStatus = res.status;
    if (res.status === 401) return null;
    return res.json().catch(function () { return { error: "The portal can't be reached." }; });
  });
  Promise.all([sessionCheck, loadProviders()])
    .then(function (out) {
      if (lastStatus === 401 || out[0] == null) { render(); return; }
      if (lastStatus !== 200) {
        if (lastStatus === 403 && out[0].error === "You can't open that.") {
          token = "session";
          applySection(out[0]);
          render();
          return;
        }
        error = out[0].error || "The portal can't be reached. Try again.";
        token = "";
        render();
        return;
      }
      token = "session";
      applySection(out[0]);
      render();
    })
    .catch(function () { error = "The portal can't be reached. Try again."; token = ""; render(); });
}
boot();

/* The Google script loads async. Initialise on its load event, and poll briefly as a backstop. */
var gsi = document.getElementById("gsi");
if (gsi) gsi.addEventListener("load", initGoogle);
var gsiTries = 0;
var gsiTimer = setInterval(function () {
  var host = document.getElementById("google-btn");
  if (host && host.dataset.ready === "1") { clearInterval(gsiTimer); return; }
  initGoogle();
  if (++gsiTries > 40) clearInterval(gsiTimer);
}, 250);
})();
