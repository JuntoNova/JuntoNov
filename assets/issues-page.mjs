import { areasFromFeed } from "./issues-feed.mjs";

const FEED_URL = "https://portal-api.juntonova.com/public/issues";
const LENSES = [
  { id: "practical", label: "Practical", caption: "Measurable levers people feel: prices, pay, wait times, class size.", color: "#F97316" },
  { id: "structural", label: "Structural", caption: "Rules of the game, and who sets the rules.", color: "#DC2626" },
  { id: "cultural", label: "Cultural", caption: "Beliefs and values, and how widely each is held.", color: "#7F1D1D" },
];
const QUAD_POS = ["top-3 left-3 text-left", "top-3 right-3 text-right", "bottom-3 left-3 text-left", "bottom-3 right-3 text-right"];
function axes(xl, xh, xp, tl, tr, bl, br) {
  return {
    yh: "Felt a lot", yl: "Felt a little", xl, xh, xp, yp: "Felt in daily life",
    quads: [["Make viable", tl, QUAD_POS[0]], ["Do first", tr, QUAD_POS[1]], ["Avoid", bl, QUAD_POS[2]], ["Optional", br, QUAD_POS[3]]],
  };
}
const EASE = axes("Hard to change", "Easy to change", "Ease of change",
  "Hard to change, and felt in daily life.", "Easy to change, and felt in daily life.",
  "Hard to change, and felt only a little.", "Easy to change, and felt only a little.");
const MATRIX = {
  practical: EASE,
  structural: EASE,
  cultural: axes("Few hold it", "Widely held", "How widely held",
    "Few hold it, and it is felt in daily life.", "Widely held, and felt in daily life.",
    "Few hold it, and felt only a little.", "Widely held, and felt only a little."),
};
const STANCES = { Back: "We back this", Oppose: "We oppose this", Claim: "We hold this view and say so", Answer: "We do not share this view, and we answer the claim", Watch: "We are watching this" };
const BLANK = { id: "", name: "", practical: [], structural: [], cultural: [] };

let DATA = { areas: [] };
let areaId = "energy";
let lens = "practical";
let selected = null;
let query = "";
let openHits = false;
let activeHit = 0;

const areaEl = document.getElementById("area");
const lensesEl = document.getElementById("lenses");
const qEl = document.getElementById("q");
const hitsEl = document.getElementById("hits");
const clearEl = document.getElementById("clear");

function level(n) { return n >= 67 ? "High" : n >= 34 ? "Medium" : "Low"; }
function quadName(item) { return item.y >= 50 ? (item.x >= 50 ? "Do first" : "Make viable") : (item.x >= 50 ? "Optional" : "Avoid"); }
function fold(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function areaBy(id) { return DATA.areas.find((a) => a.id === id) || DATA.areas[0] || BLANK; }
function items(area, lensId) { return (area && area[lensId]) || []; }
function spread(list) {
  const pts = list.map((p) => ({ id: p.id, x: p.x, y: p.y }));
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = 0; j < i; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.hypot(dx, dy) || 0.2;
        if (d >= 8) continue;
        const push = (8 - d) / 2;
        pts[i].x += (dx / d) * push; pts[i].y += (dy / d) * push;
        pts[j].x -= (dx / d) * push; pts[j].y -= (dy / d) * push;
      }
    }
  }
  const out = {};
  pts.forEach((p) => { out[p.id] = { x: Math.min(97, Math.max(3, p.x)), y: Math.min(97, Math.max(3, p.y)) }; });
  return out;
}
function lensesFor(area) { return LENSES.filter((l) => items(area, l.id).length); }
function fixLens() {
  const have = lensesFor(areaBy(areaId));
  if (have.length && !have.some((l) => l.id === lens)) lens = have[0].id;
}
function buildTabs() {
  const want = lensesFor(areaBy(areaId));
  const have = [...lensesEl.children].map((b) => b.dataset.lens);
  if (have.length === want.length && want.every((l, i) => l.id === have[i])) return;
  const hadFocus = lensesEl.contains(document.activeElement);
  lensesEl.innerHTML = "";
  want.forEach((l) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.lens = l.id;
    b.textContent = l.label;
    b.className = "rounded-full border px-4 py-2 text-sm font-medium";
    b.onclick = () => { lens = l.id; selected = null; sync(); };
    lensesEl.appendChild(b);
  });
  if (hadFocus) { const t = lensesEl.querySelector('[data-lens="' + lens + '"]'); if (t) t.focus({ preventScroll: true }); }
}
function catalog() {
  const rows = [];
  DATA.areas.forEach((a) => LENSES.forEach((l) => items(a, l.id).forEach((p) => rows.push({ area: a, lens: l.id, item: p }))));
  return rows;
}
function search() {
  const tokens = fold(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];
  return catalog().map((row) => {
    const name = fold(row.item.name);
    const hay = name + " " + fold(row.item.why) + " " + fold(row.item.proof.join(" ")) + " " + fold(row.area.name);
    if (!tokens.every((t) => hay.includes(t))) return null;
    let score = 0;
    const joined = tokens.join(" ");
    if (name.includes(joined)) score += 80;
    if (name.startsWith(joined)) score += 40;
    if (row.area.id === areaId) score += 25;
    if (row.lens === lens) score += 10;
    return { row, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.row.item.name.localeCompare(b.row.item.name)).slice(0, 8).map((r) => r.row);
}
function pick(row) {
  areaId = row.area.id;
  lens = row.lens;
  selected = row.item.id;
  query = row.item.name;
  qEl.value = query;
  openHits = false;
  sync();
}
function renderHits() {
  const hits = search();
  clearEl.classList.toggle("hidden", !query);
  clearEl.classList.toggle("flex", !!query);
  if (!openHits || !fold(query)) { hitsEl.classList.add("hidden"); hitsEl.innerHTML = ""; return; }
  hitsEl.classList.remove("hidden");
  if (!hits.length) { hitsEl.innerHTML = '<li class="px-3 py-2.5 text-sm" style="color:var(--muted)">Nothing matches.</li>'; return; }
  hitsEl.innerHTML = hits.map((row, i) => {
    const label = LENSES.find((l) => l.id === row.lens).label + (row.area.id !== areaId ? " · " + row.area.name : "");
    return '<li><button type="button" data-i="' + i + '" class="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left ' + (i === activeHit ? "bg-slate-50" : "") + '"><span class="text-sm font-medium">' + esc(row.item.name) + '</span><span class="text-[11px] tracking-wide" style="color:var(--muted)">' + esc(label) + "</span></button></li>";
  }).join("");
  hitsEl.querySelectorAll("button").forEach((b) => {
    b.onmouseenter = () => { activeHit = Number(b.dataset.i); };
    b.onclick = () => pick(hits[Number(b.dataset.i)]);
  });
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => c === "&" ? "\u0026amp;" : c === "<" ? "\u0026lt;" : c === ">" ? "\u0026gt;" : "\u0026quot;");
}
function sync() {
  fixLens();
  buildTabs();
  const url = new URL(location.href);
  url.searchParams.set("area", areaId);
  url.searchParams.set("lens", lens);
  history.replaceState(null, "", url);
  areaEl.value = areaId;
  document.querySelectorAll("#lenses button").forEach((b) => {
    const on = b.dataset.lens === lens;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.style.background = on ? "#1A1A1A" : "#fff";
    b.style.color = on ? "#fff" : "#64748B";
    b.style.borderColor = on ? "#1A1A1A" : "#E2E8F0";
  });
  const bar = document.getElementById("bar");
  bar.innerHTML = LENSES.map((l) => '<div class="h-full flex-1" style="background:' + l.color + (l.id === lens ? "" : "40") + '"></div>').join("");
  document.getElementById("caption").textContent = LENSES.find((l) => l.id === lens).caption;
  const list = items(areaBy(areaId), lens);
  if (!selected || !list.some((p) => p.id === selected)) selected = list[0] ? list[0].id : null;
  renderHits();
  paintMatrix();
  paintDetail();
}
function paintMatrix() {
  const area = areaBy(areaId);
  const list = items(area, lens);
  const cfg = MATRIX[lens];
  if (!list.length || !cfg) { document.getElementById("matrix").innerHTML = ""; return; }
  const pos = spread(list);
  const tokens = fold(query);
  const matchIds = tokens ? new Set(search().filter((r) => r.area.id === areaId && r.lens === lens).map((r) => r.item.id)) : null;
  const quads = cfg.quads.map((q) => '<div class="issue-quad pointer-events-none absolute z-0 hidden max-w-36 sm:block ' + q[2] + '"><div class="text-xs font-semibold" style="color:var(--muted)">' + esc(q[0]) + '</div><div class="text-[11px] leading-snug" style="color:var(--muted)">' + esc(q[1]) + "</div></div>").join("");
  const dots = list.map((p) => {
    const place = pos[p.id];
    const on = p.id === selected;
    const matched = matchIds ? matchIds.has(p.id) : false;
    const dim = matchIds && matchIds.size > 0 && !matched && !on;
    const show = on || (matched && matchIds.size <= 4);
    const side = place.x > 58 ? "right:1.7rem" : "left:1.7rem";
    return '<button type="button" data-id="' + esc(p.id) + '" class="absolute flex h-7 w-7 -translate-x-1/2 translate-y-1/2 items-center justify-center" style="left:' + place.x + "%;bottom:" + place.y + "%;opacity:" + (dim ? ".25" : "1") + ";z-index:" + (on || matched ? 20 : 10) + '" aria-label="' + esc(p.name) + '"><span class="block h-3.5 w-3.5 rounded-full border-2" style="border-color:' + (on || matched ? "var(--ember)" : "var(--charcoal)") + ";background:" + (on ? "var(--ember)" : matched ? "rgba(196,92,38,.3)" : "#fff") + '"></span>' + (show ? '<span class="issue-chip absolute top-1/2 hidden w-max max-w-52 -translate-y-1/2 rounded-md bg-white/95 px-1.5 py-0.5 text-xs leading-snug sm:block ' + (on ? "font-semibold" : "font-medium") + '" style="' + side + ";color:var(--charcoal)" + '">' + esc(p.name) + "</span>" : "") + "</button>";
  }).join("");
  document.getElementById("matrix").innerHTML =
    '<div class="flex items-stretch gap-2 sm:gap-3"><div class="flex w-12 shrink-0 flex-col text-right text-[10px] font-medium leading-tight sm:w-28 sm:text-xs" style="color:var(--muted)"><div class="flex flex-1 items-center justify-end">' + esc(cfg.yh) + '</div><div class="flex flex-1 items-center justify-end">' + esc(cfg.yl) + "</div></div>" +
    '<div class="relative min-h-96 w-full flex-1 overflow-hidden rounded-2xl border sm:min-h-[28rem]" style="border-color:var(--border);background:var(--surface)">' + quads +
    '<div class="pointer-events-none absolute inset-y-10 left-1/2 w-px" style="background:var(--border)"></div><div class="pointer-events-none absolute inset-x-10 top-1/2 h-px" style="background:var(--border)"></div>' +
    '<div class="absolute inset-10">' + dots + "</div></div></div>" +
    '<div class="mt-2 flex gap-2 sm:gap-3"><div class="w-12 shrink-0 sm:w-28"></div><div class="flex min-w-0 flex-1 justify-between gap-2 text-[10px] font-medium leading-tight sm:gap-3 sm:text-xs" style="color:var(--muted)"><span class="max-w-[46%]">' + esc(cfg.xl) + '</span><span class="max-w-[46%] text-right">' + esc(cfg.xh) + '</span></div></div>';
  placeChips();
  document.querySelectorAll("#matrix button").forEach((b) => { b.onclick = () => { selected = b.dataset.id; paintMatrix(); paintDetail(); }; });
}
function placeChips() {
  const m = document.getElementById("matrix");
  const plot = m.querySelector(".overflow-hidden");
  if (!plot) return;
  const pr = plot.getBoundingClientRect();
  const chips = [...m.querySelectorAll(".issue-chip")].filter((c) => c.offsetParent !== null);
  if (!chips.length) return;
  const dots = [...m.querySelectorAll("button[data-id] span.block")].map((d) => ({ el: d.closest("button"), r: d.getBoundingClientRect() }));
  const quads = [...m.querySelectorAll(".issue-quad")].filter((q) => q.offsetParent !== null).map((q) => q.getBoundingClientRect());
  const hit = (a, b, g) => a.left < b.right + g && a.right > b.left - g && a.top < b.bottom + g && a.bottom > b.top - g;
  const placed = [];
  chips.sort((a, b) => (a.classList.contains("font-semibold") ? 1 : 0) - (b.classList.contains("font-semibold") ? 1 : 0));
  chips.forEach((c) => {
    const btn = c.closest("button");
    const me = dots.find((d) => d.el === btn).r;
    const w = c.offsetWidth, h = c.offsetHeight, cy = (me.top + me.bottom) / 2, gap = 6;
    const xr = me.right + gap, xl = me.left - gap - w;
    const spots = [];
    for (let k = 0; k <= 30; k++) {
      const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8;
      spots.push([xr, cy - h / 2 + dy], [xl, cy - h / 2 + dy]);
    }
    for (let k = 0; k <= 4; k++) {
      const x0 = me.right - w + (k * (w - 14)) / 4;
      spots.push([x0, me.top - gap - h], [x0, me.bottom + gap]);
    }
    let best = null;
    spots.forEach((sp, i) => {
      const r = { left: sp[0], top: sp[1], right: sp[0] + w, bottom: sp[1] + h };
      let cost = i * 0.01;
      if (r.left < pr.left + 2 || r.right > pr.right - 2 || r.top < pr.top + 2 || r.bottom > pr.bottom - 2) cost += 1000;
      dots.forEach((d) => { if (d.el !== btn && hit(r, d.r, 3)) cost += 100; });
      quads.forEach((q) => { if (hit(r, q, 0)) cost += 20; });
      placed.forEach((q) => { if (hit(r, q, 2)) cost += 50; });
      if (!best || cost < best.cost) best = { cost, r };
    });
    const b = btn.getBoundingClientRect();
    c.style.transform = "none"; c.style.translate = "none"; c.style.right = "auto";
    c.style.left = (best.r.left - b.left) + "px"; c.style.top = (best.r.top - b.top) + "px";
    placed.push(best.r);
  });
}
let chipFrame = 0;
function replaceChips() {
  if (chipFrame) return;
  chipFrame = requestAnimationFrame(() => { chipFrame = 0; if (document.getElementById("matrix")) placeChips(); });
}
if (document.fonts) {
  if (document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(replaceChips);
  if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", replaceChips);
}
let resizeTimer = 0;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(paintMatrix, 150); });
function paintDetail() {
  const area = areaBy(areaId);
  const item = items(area, lens).find((p) => p.id === selected);
  const cfg = MATRIX[lens];
  const el = document.getElementById("detail");
  const head = (x) => '<div class="text-[11px] tracking-widest uppercase" style="color:var(--muted)">' + x + "</div>";
  el.classList.toggle("hidden", !item);
  if (!item || !cfg) { el.innerHTML = ""; return; }
  const none = item.ev === "none";
  const quad = quadName(item);
  const chip = (txt, strong) => '<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs' + (strong ? " font-semibold" : "") + '" style="background:var(--surface);color:' + (strong ? "var(--charcoal)" : "var(--muted)") + '">' + txt + "</span>";
  const pos = (name, v) => chip(esc(name) + ' <span class="font-semibold" style="color:var(--charcoal)">' + (none ? "not confirmed" : level(v)) + "</span>");
  const loud = lens === "cultural" && quad === "Do first" && item.stance === "Claim";
  const stance = item.stance && STANCES[item.stance] ? chip(esc(STANCES[item.stance]), true) : "";
  el.innerHTML =
    '<h2 class="display text-2xl">' + esc(item.name) + "</h2>" +
    (item.why ? '<p class="mt-3 text-sm leading-relaxed">' + esc(item.why) + "</p>" : "") +
    '<div class="mt-3 flex flex-wrap gap-2">' + stance + (none ? "" : chip(esc(quad))) + (loud && !none ? chip("Say it loudly", true) : "") + (item.shared ? chip("Shared with " + esc(item.shared)) : "") + "</div>" +
    '<div class="mt-2 flex flex-wrap gap-2">' + pos(cfg.yp, item.y) + pos(cfg.xp, item.x) + "</div>" +
    '<div class="mt-5">' + head("Proof points") + (item.proof.length ? '<ul class="mt-2 list-disc pl-5 text-sm leading-relaxed" style="color:var(--muted)">' + item.proof.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : '<p class="mt-2 text-sm" style="color:var(--muted)">Not confirmed.</p>') +
    (item.sources.length ? '<p class="mt-2 text-xs leading-relaxed" style="color:var(--muted)">' + item.sources.map((x) => typeof x === "string" ? esc(x) : '<a href="' + esc(x.u) + '" target="_blank" rel="noopener" class="underline">' + esc(x.t) + "</a>").join(". ") + ".</p>" : "") +
    (item.need ? '<p class="mt-2 text-xs leading-relaxed" style="color:var(--muted)">Not confirmed: ' + esc(item.need) + "</p>" : "") + "</div>" +
    '<a href="/project" class="mt-5 inline-flex rounded-xl px-5 py-2.5 text-sm font-medium text-white" style="background:var(--charcoal)">Let\'s work together</a>';
}
function wire() {
  areaEl.onchange = () => { areaId = areaEl.value; selected = null; sync(); };
  qEl.oninput = () => { query = qEl.value; openHits = true; activeHit = 0; renderHits(); paintMatrix(); };
  qEl.onfocus = () => { openHits = true; renderHits(); };
  qEl.onkeydown = (e) => {
    const hits = search();
    if (e.key === "ArrowDown") { e.preventDefault(); openHits = true; activeHit = Math.min(activeHit + 1, Math.max(hits.length - 1, 0)); renderHits(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeHit = Math.max(activeHit - 1, 0); renderHits(); }
    else if (e.key === "Enter" && openHits && hits[activeHit]) { e.preventDefault(); pick(hits[activeHit]); }
    else if (e.key === "Escape") { openHits = false; renderHits(); }
  };
  clearEl.onclick = () => { query = ""; qEl.value = ""; openHits = false; renderHits(); paintMatrix(); };
  document.addEventListener("mousedown", (e) => {
    if (!qEl.parentElement.contains(e.target)) { openHits = false; renderHits(); }
  });
}
function start(data) {
  DATA = data;
  areaEl.innerHTML = "";
  DATA.areas.forEach((a) => {
    const o = document.createElement("option");
    o.value = a.id; o.textContent = a.name;
    areaEl.appendChild(o);
  });
  const params = new URLSearchParams(location.search);
  const asked = params.get("area");
  if (DATA.areas.some((a) => a.id === asked)) areaId = asked;
  else if (DATA.areas.some((a) => a.id === "energy")) areaId = "energy";
  else areaId = DATA.areas[0] ? DATA.areas[0].id : "";
  const askedLens = params.get("lens");
  lens = LENSES.some((l) => l.id === askedLens) ? askedLens : (LENSES.find((l) => items(areaBy(areaId), l.id).length) || LENSES[0]).id;
  selected = null;
  sync();
}
function showFeedError() {
  const el = document.getElementById("matrix");
  if (el) el.innerHTML = '<p class="text-sm" style="color:var(--muted)">The issues list could not be loaded. Refresh the page.</p>';
}

wire();
const matrix = document.getElementById("matrix");
if (matrix) matrix.innerHTML = '<p class="text-sm" style="color:var(--muted)">Loading issues…</p>';
fetch(FEED_URL, { cache: "no-store", credentials: "omit" })
  .then((res) => {
    if (!res.ok) throw new Error("status");
    return res.json();
  })
  .then((body) => {
    const rows = body && Array.isArray(body.issues) ? body.issues : null;
    if (!rows) throw new Error("shape");
    start(areasFromFeed(rows));
  })
  .catch(showFeedError);
