/**
 * Turn GET /public/issues into the area lists the issues page draws.
 * Only the public fields are copied. Ids, notes, and anything else on a row are dropped.
 * Area and lens are chosen here from `slug` (or the issue name) and `lens`. The request
 * itself is not filtered.
 */

const LENSES = ["practical", "structural", "cultural"];
const SLUG_ALIASES = {
  "artificial intelligence": "ai",
  "social security": "social-security",
};

function isScore(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

export function areaSlug(row) {
  const given = typeof row.slug === "string" ? row.slug.trim().toLowerCase() : "";
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(given)) return given;
  const key = String(row.issue || "").trim().toLowerCase();
  if (SLUG_ALIASES[key]) return SLUG_ALIASES[key];
  return key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function dotId(title, used) {
  const base = String(title).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "dot";
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

export function areasFromFeed(rows) {
  const areas = [];
  const bySlug = new Map();
  const used = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const lens = row.lens;
    if (!LENSES.includes(lens)) continue;
    const x = row.scoreAxis === "how widely held" ? row.held : row.ease;
    const y = row.impact;
    if (!isScore(x) || !isScore(y)) continue;
    const slug = areaSlug(row);
    const name = String(row.issue || "").trim();
    const title = String(row.title || "").trim();
    if (!slug || !name || !title) continue;
    let area = bySlug.get(slug);
    if (!area) {
      area = { id: slug, name, practical: [], structural: [], cultural: [] };
      bySlug.set(slug, area);
      areas.push(area);
      used.set(slug, new Set());
    }
    const proof = String(row.evidence || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const sources = Array.isArray(row.sources)
      ? row.sources
          .filter((source) => source && typeof source.url === "string" && source.url.startsWith("https://"))
          .map((source) => ({ t: String(source.label || source.url), u: source.url }))
      : [];
    area[lens].push({
      id: dotId(title, used.get(slug)),
      name: title,
      x,
      y,
      stance: typeof row.stance === "string" ? row.stance : null,
      why: String(row.text || ""),
      proof,
      sources,
      ev: String(row.empiricism || ""),
    });
  }
  return { areas };
}
