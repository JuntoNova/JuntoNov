/* Client portal. No inline script or inline handlers: the page's Content-Security-Policy allows
   only this file and the Google sign-in script. Server data is escaped with esc() before it
   reaches innerHTML, and actions are wired by data-act attributes and one delegated listener. */
(function () {
"use strict";
var GOOGLE_CLIENT_ID = "696574706151-9qjv11se3a3us5k86o2fodtktb4m5r2d.apps.googleusercontent.com";
var API = "https://portal-api.juntonova.com";
var token = "";
var room = null;
var view = "home";
var error = "";
var reading = null;
try { token = sessionStorage.getItem("jn_google") || ""; } catch (e) {}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    if (c === "&") return "&" + "amp;";
    if (c === "<") return "&" + "lt;";
    if (c === ">") return "&" + "gt;";
    if (c === '"') return "&" + "quot;";
    return "&" + "#39;";
  });
}
function logout() {
  token = "";
  room = null;
  reading = null;
  try { sessionStorage.removeItem("jn_google"); } catch (e) {}
  try { if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.disableAutoSelect(); } catch (e) {}
  render();
}
async function api(body) {
  var res = await fetch(API + "/api/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  var data = await res.json().catch(function () { return { error: "The portal can't be reached." }; });
  if (res.status === 401) { logout(); throw new Error("Sign in again."); }
  return data;
}
async function refresh() {
  var data = await api({ action: "load" });
  if (data.access === "none") { room = null; error = data.email || ""; return; }
  room = data;
  error = data.error || "";
}
function onGoogle(response) {
  token = response.credential;
  try { sessionStorage.setItem("jn_google", token); } catch (e) {}
  error = "";
  refresh().then(render).catch(function (e) { error = e.message; render(); });
}
function initGoogle() {
  var host = document.getElementById("google-btn");
  if (!host || host.dataset.ready === "1") return;
  if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
  var width = Math.max(200, Math.min(320, (host.parentElement ? host.parentElement.clientWidth : 320) - 8));
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
function layer(person) {
  var names = { director: "Director", board: "Board", member: "Member", jn: "Junto Nova", admin: "Junto Nova" };
  var base = names[person.role] || person.role;
  return person.billing && person.role !== "jn" && person.role !== "admin" ? base + " · Billing" : base;
}
function isAdmin() { return Boolean(room && room.person && room.person.role === "admin"); }
function nav() {
  return ["home", "proposals", "research", "billing", "admin"].map(function (id) {
    var label = id[0].toUpperCase() + id.slice(1);
    return '<button type="button" data-act="view" data-view="' + id + '" class="' + (view === id ? "active" : "") + '"' + (view === id ? ' aria-current="page"' : "") + ">" + label + "</button>";
  }).join("");
}
function setView(id) { view = id; reading = null; render(); }
function table(headers, rows) {
  var head = headers.map(function (h) { return "<th>" + h + "</th>"; }).join("");
  var body = rows.length ? rows.map(function (row) {
    return "<tr>" + row.map(function (cell) { return "<td>" + cell + "</td>"; }).join("") + "</tr>";
  }).join("") : '<tr><td colspan="' + headers.length + '">Nothing in view.</td></tr>';
  return '<div class="tbl-wrap"><table><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
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
    ? '<label>City<input id="d-city" placeholder="Phoenix"></label><label>Days it can be done<input id="d-when" placeholder="March 12–14"></label><label>Cost<input id="d-cost" placeholder="$18,500" required></label><label>Link to fund it<input id="d-link" type="url" placeholder="https://"></label>'
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
function page() {
  if (!token) {
    return '<main class="wrap"><div class="login-shell"><div class="login-card card"><div class="kicker">Client portal</div><h1 class="display t-lg">Sign in</h1><p class="muted">Use the Google account you were given.</p>' + (error ? '<div class="err" role="alert">' + esc(error) + "</div>" : "") + '<div id="google-btn"></div><button type="button" class="btn google" id="google-fallback" data-act="google">Sign in with Google</button></div></div></main>';
  }
  if (!room) {
    return '<main class="wrap"><div class="login-card card"><h1 class="display t-lg">This account isn\'t on the list</h1><p class="muted">' + esc(error || "Ask Junto Nova to add this Google account.") + '</p><button type="button" class="btn ghost" data-act="logout">Sign out</button></div></main>';
  }
  var org = room.staff ? "All clients" : (room.person.orgName || "Your organization");
  var main = "";
  if (view === "home") {
    main = '<div class="kicker">Workspace</div><h1 class="display">' + esc(org) + '</h1><div class="grid">' +
      card("Proposals", docs("proposals").length, "proposals") +
      card("Research", docs("research").length, "research") +
      card("Billing", room.person.billing || room.staff ? docs("billing").length : "None", "billing") +
      card("Admin", room.directory ? room.directory.length : 1, "admin") + "</div>";
  } else if (view === "billing" && !(room.person.billing || room.staff)) {
    main = '<div class="kicker">' + esc(org) + '</div><h1 class="display">Billing</h1><p class="muted">This login does not have the billing layer.</p>';
  } else if (view === "admin") {
    main = admin();
  } else {
    var titles = { proposals: "Proposals", research: "Research", billing: "Billing" };
    var list = view === "proposals" || view === "research" ? (docs(view).map(offerCard).join("") || '<p class="muted">Nothing posted yet.</p>') : docTable(view);
    main = '<div class="kicker">' + esc(org) + '</div><h1 class="display">' + titles[view] + "</h1>" + (view === "research" ? disclosureBlock() : "") + list + addForm(view);
  }
  if (reading) {
    var download = "";
    if (reading.contentB64) {
      download = '<p class="mt-m"><a class="btn" download="' + esc(reading.filename || "document") + '" href="data:' + esc(reading.mime || "application/octet-stream") + ";base64," + safeB64(reading.contentB64) + '">Download</a></p>';
    }
    main += '<article class="card mt-l"><h2 class="display t-md">' + esc(reading.title) + '</h2><p class="muted pre">' + esc(reading.body) + "</p>" + download + "</article>";
  }
  return '<div class="portal-tools"><div class="wrap row"><nav class="tabs" aria-label="Portal sections">' + nav() + '</nav><div class="who"><b>' + esc(room.person.name) + '</b><br>' + esc(room.person.email) + ' · <button type="button" data-act="logout">Sign out</button></div></div></div><main class="wrap">' + (error ? '<div class="err" role="alert">' + esc(error) + "</div>" : "") + main + "</main>";
}
function card(label, n, id) {
  return '<div class="card"><div class="muted">' + label + '</div><div class="stat">' + n + '</div><button type="button" class="btn ghost" data-act="view" data-view="' + id + '">Open</button></div>';
}
function admin() {
  if (!room.staff) {
    return '<div class="kicker">' + esc(room.person.orgName || "") + '</div><h1 class="display">Admin</h1><p class="muted">Your access. Junto Nova changes it.</p>' + table(["Person", "Layer"], [[esc(room.person.name), esc(layer(room.person))]]);
  }
  // Only an admin can grant or remove staff (the Worker enforces it; the page just doesn't offer it).
  var admin = isAdmin();
  var rows = (room.directory || []).map(function (person) {
    var staffRow = person.role === "jn" || person.role === "admin";
    var action = staffRow && !admin ? "" : '<button type="button" class="btn ghost" data-act="remove-person" data-id="' + esc(person.id) + '">Remove</button>';
    return [esc(person.name) + '<div class="file-meta">' + esc(person.email) + "</div>", esc(person.orgId ? room.orgs[person.orgId] : "None"), esc(layer(person)), action];
  });
  return '<div class="kicker">Junto Nova</div><h1 class="display">Admin</h1><p class="muted">Add a client\'s Google account and what they can see.</p><form class="form" data-form="person"><div class="row2"><label>Name<input id="c-name" required></label><label>Email<input id="c-email" type="email" required></label></div><label>Permission layer<select id="c-role"><option value="director">Director</option><option value="board">Board</option><option value="member">Member</option>' + (admin ? '<option value="jn">Junto Nova staff</option>' : "") + '</select></label><label>Organization<select id="c-org">' + orgOptions(false) + '</select></label><label>New organization name<input id="c-org-name" placeholder="Only if you chose New organization"></label><label class="check"><input id="c-bill" type="checkbox"> Billing</label><button class="btn" type="submit">Give access</button></form>' + table(["Client", "Organization", "Layer", ""], rows) + addForm("admin");
}
function render() {
  document.getElementById("app").innerHTML = page();
  if (!token) initGoogle();
  else syncOrgWrap();
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
  if (data.error) { error = data.error; render(); return; }
  room = data; error = ""; render();
}
async function removePerson(id) {
  var data = await api({ action: "removePerson", id: id });
  if (data.error) { error = data.error; render(); return; }
  room = data; render();
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
    if (data.error) { error = data.error; render(); return; }
    room = data;
    error = "";
    reading = null;
    render();
  } catch (e) {
    error = e.message || "Couldn't save that.";
    render();
  }
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
  if (!target) return;
  var act = target.getAttribute("data-act");
  if (act === "menu") menu();
  else if (act === "menu-close") menu(false);
  else if (act === "view") setView(target.getAttribute("data-view"));
  else if (act === "logout") logout();
  else if (act === "google") signInGoogle();
  else if (act === "open") openDoc(target.getAttribute("data-id")).catch(fail);
  else if (act === "remove-person") removePerson(target.getAttribute("data-id")).catch(fail);
});
document.addEventListener("submit", function (event) {
  var form = event.target;
  var kind = form && form.getAttribute ? form.getAttribute("data-form") : null;
  if (!kind) return;
  event.preventDefault();
  if (kind === "person") savePerson().catch(fail);
  else if (kind === "doc") saveDoc(form.getAttribute("data-section")).catch(fail);
});
document.addEventListener("change", function (event) {
  if (event.target && event.target.id === "d-vis") syncOrgWrap();
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") menu(false);
});

function boot() {
  if (!token) { render(); return; }
  refresh().then(render).catch(function () { error = "The portal can't be reached. Try again."; token = ""; render(); });
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
