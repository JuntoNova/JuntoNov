/* Ease-versus-everyday-impact chart shared by issues.html and the client portal.
   The markup, quad labels, and chip placement match the public issues page. */
(function (global) {
  "use strict";
  var QUAD_POS = ["top-3 left-3 text-left", "top-3 right-3 text-right", "bottom-3 left-3 text-left", "bottom-3 right-3 text-right"];
  function axes(xl, xh, xp, tl, tr, bl, br) {
    return {
      yh: "Felt a lot", yl: "Felt a little", xl: xl, xh: xh, xp: xp, yp: "Felt in daily life",
      quads: [["Make viable", tl, QUAD_POS[0]], ["Do first", tr, QUAD_POS[1]], ["Avoid", bl, QUAD_POS[2]], ["Optional", br, QUAD_POS[3]]],
    };
  }
  var EASE = axes("Hard to change", "Easy to change", "Ease of change",
    "Hard to change, and felt in daily life.", "Easy to change, and felt in daily life.",
    "Hard to change, and felt only a little.", "Easy to change, and felt only a little.");
  var MATRIX = {
    practical: EASE,
    structural: EASE,
    cultural: axes("Few hold it", "Widely held", "How widely held",
      "Few hold it, and it is felt in daily life.", "Widely held, and felt in daily life.",
      "Few hold it, and felt only a little.", "Widely held, and felt only a little."),
  };
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;";
    });
  }
  function spread(list) {
    var pts = list.map(function (p) { return { id: p.id, x: p.x, y: p.y }; });
    var pass, i, j, dx, dy, d, push;
    for (pass = 0; pass < 4; pass++) {
      for (i = 0; i < pts.length; i++) {
        for (j = 0; j < i; j++) {
          dx = pts[i].x - pts[j].x;
          dy = pts[i].y - pts[j].y;
          d = Math.hypot(dx, dy) || 0.2;
          if (d >= 8) continue;
          push = (8 - d) / 2;
          pts[i].x += (dx / d) * push;
          pts[i].y += (dy / d) * push;
          pts[j].x -= (dx / d) * push;
          pts[j].y -= (dy / d) * push;
        }
      }
    }
    var out = {};
    pts.forEach(function (p) {
      out[p.id] = { x: Math.min(97, Math.max(3, p.x)), y: Math.min(97, Math.max(3, p.y)) };
    });
    return out;
  }
  function paint(root, opts) {
    if (!root) return;
    var items = (opts && opts.items) || [];
    var lens = (opts && opts.lens) || "practical";
    var selectedId = opts ? opts.selectedId : null;
    var matchIds = opts && opts.matchIds ? opts.matchIds : null;
    var cfg = MATRIX[lens] || MATRIX.practical;
    if (!items.length) { root.innerHTML = ""; return; }
    var pos = spread(items);
    var quads = cfg.quads.map(function (q) {
      return '<div class="issue-quad pointer-events-none absolute z-0 hidden max-w-36 sm:block ' + q[2] + '"><div class="text-xs font-semibold" style="color:var(--muted)">' + esc(q[0]) + '</div><div class="text-[11px] leading-snug" style="color:var(--muted)">' + esc(q[1]) + "</div></div>";
    }).join("");
    var dots = items.map(function (p) {
      var place = pos[p.id];
      var on = p.id === selectedId;
      var matched = matchIds ? matchIds.has(p.id) : false;
      var dim = matchIds && matchIds.size > 0 && !matched && !on;
      var show = on || (matched && matchIds.size <= 4);
      var side = place.x > 58 ? "right:1.7rem" : "left:1.7rem";
      return '<button type="button" data-id="' + esc(p.id) + '" class="absolute flex h-7 w-7 -translate-x-1/2 translate-y-1/2 items-center justify-center" style="left:' + place.x + "%;bottom:" + place.y + "%;opacity:" + (dim ? ".25" : "1") + ";z-index:" + (on || matched ? 20 : 10) + '" aria-label="' + esc(p.name) + '"><span class="block h-3.5 w-3.5 rounded-full border-2" style="border-color:' + (on || matched ? "var(--ember)" : "var(--charcoal)") + ";background:" + (on ? "var(--ember)" : matched ? "rgba(196,92,38,.3)" : "#fff") + '"></span>' + (show ? '<span class="issue-chip absolute top-1/2 hidden w-max max-w-52 -translate-y-1/2 rounded-md bg-white/95 px-1.5 py-0.5 text-xs leading-snug sm:block ' + (on ? "font-semibold" : "font-medium") + '" style="' + side + ";color:var(--charcoal)" + '">' + esc(p.name) + "</span>" : "") + "</button>";
    }).join("");
    root.innerHTML =
      '<div class="flex items-stretch gap-2 sm:gap-3"><div class="issue-ylab flex w-12 shrink-0 flex-col text-right text-[10px] font-medium leading-tight sm:w-28 sm:text-xs" style="color:var(--muted)"><div class="flex flex-1 items-center justify-end">' + esc(cfg.yh) + '</div><div class="flex flex-1 items-center justify-end">' + esc(cfg.yl) + "</div></div>" +
      '<div class="relative min-h-96 w-full flex-1 overflow-hidden rounded-2xl border sm:min-h-[28rem]" style="border-color:var(--border);background:var(--surface)">' + quads +
      '<div class="pointer-events-none absolute inset-y-10 left-1/2 w-px" style="background:var(--border)"></div><div class="pointer-events-none absolute inset-x-10 top-1/2 h-px" style="background:var(--border)"></div>' +
      '<div class="absolute inset-10">' + dots + "</div></div></div>" +
      '<div class="mt-2 flex gap-2 sm:gap-3"><div class="issue-ylab w-12 shrink-0 sm:w-28"></div><div class="flex min-w-0 flex-1 justify-between gap-2 text-[10px] font-medium leading-tight sm:gap-3 sm:text-xs" style="color:var(--muted)"><span class="max-w-[46%]">' + esc(cfg.xl) + '</span><span class="max-w-[46%] text-right">' + esc(cfg.xh) + '</span></div></div>';
    place(root);
  }
  function place(root) {
    if (!root || !root.querySelector) return;
    var plot = root.querySelector(".overflow-hidden");
    if (!plot || !plot.getBoundingClientRect) return;
    var pr = plot.getBoundingClientRect();
    var chips = [].slice.call(root.querySelectorAll(".issue-chip")).filter(function (c) { return c.offsetParent !== null; });
    if (!chips.length) return;
    var dots = [].slice.call(root.querySelectorAll("button[data-id] span.block")).map(function (d) {
      return { el: d.closest("button"), r: d.getBoundingClientRect() };
    });
    var quads = [].slice.call(root.querySelectorAll(".issue-quad")).filter(function (q) { return q.offsetParent !== null; }).map(function (q) { return q.getBoundingClientRect(); });
    function hit(a, b, g) {
      return a.left < b.right + g && a.right > b.left - g && a.top < b.bottom + g && a.bottom > b.top - g;
    }
    var placed = [];
    chips.sort(function (a, b) {
      return (a.classList.contains("font-semibold") ? 1 : 0) - (b.classList.contains("font-semibold") ? 1 : 0);
    });
    chips.forEach(function (c) {
      var btn = c.closest("button");
      var found = null;
      for (var i = 0; i < dots.length; i++) if (dots[i].el === btn) found = dots[i];
      if (!found) return;
      var me = found.r;
      var w = c.offsetWidth, h = c.offsetHeight, cy = (me.top + me.bottom) / 2, gap = 6;
      var xr = me.right + gap, xl = me.left - gap - w;
      var spots = [];
      var k, dy, x0;
      for (k = 0; k <= 30; k++) {
        dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8;
        spots.push([xr, cy - h / 2 + dy], [xl, cy - h / 2 + dy]);
      }
      for (k = 0; k <= 4; k++) {
        x0 = me.right - w + (k * (w - 14)) / 4;
        spots.push([x0, me.top - gap - h], [x0, me.bottom + gap]);
      }
      var best = null;
      spots.forEach(function (sp, i) {
        var r = { left: sp[0], top: sp[1], right: sp[0] + w, bottom: sp[1] + h };
        var cost = i * 0.01;
        if (r.left < pr.left + 2 || r.right > pr.right - 2 || r.top < pr.top + 2 || r.bottom > pr.bottom - 2) cost += 1000;
        dots.forEach(function (d) { if (d.el !== btn && hit(r, d.r, 3)) cost += 100; });
        quads.forEach(function (q) { if (hit(r, q, 0)) cost += 20; });
        placed.forEach(function (q) { if (hit(r, q, 2)) cost += 50; });
        if (!best || cost < best.cost) best = { cost: cost, r: r };
      });
      var b = btn.getBoundingClientRect();
      c.style.transform = "none";
      c.style.translate = "none";
      c.style.right = "auto";
      c.style.left = (best.r.left - b.left) + "px";
      c.style.top = (best.r.top - b.top) + "px";
      placed.push(best.r);
    });
  }
  global.JNIssueGrid = { MATRIX: MATRIX, spread: spread, paint: paint, place: place };
})(window);
