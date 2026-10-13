import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { areasFromFeed } from "../assets/issues-feed.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("education practical comes from the feed and keeps only public fields", () => {
  const feed = [
    {
      issue: "Education",
      slug: "education",
      lens: "practical",
      title: "Increase the number of kids in charter schools",
      text: "The cited figure is stated intent only.",
      ease: 74,
      impact: 70,
      held: null,
      scoreAxis: "ease",
      stance: "Back",
      empiricism: "cited",
      sources: [{ label: "EdChoice survey", url: "https://www.edchoice.org/wp-content/uploads/2026/08/2026-SIA.pdf" }],
      evidence: "65% of school parents say they would enroll.\nEnrollment by state.",
      id: "site-education-secret",
      notes: "Contoso Client private note",
      orgName: "Contoso Client",
      submittedBy: "Pat Example",
      publicClearNote: "Cleared by staff",
    },
    {
      issue: "Artificial Intelligence",
      lens: "cultural",
      title: "Widely held claim",
      text: "People say",
      ease: null,
      impact: 44,
      held: 33,
      scoreAxis: "how widely held",
      stance: "Claim",
      empiricism: "none",
      sources: [],
      evidence: "Heard",
    },
  ];
  const data = areasFromFeed(feed);
  assert.deepEqual(data.areas.map((area) => area.id), ["education", "ai"]);
  const practical = data.areas[0].practical;
  assert.equal(practical.length, 1);
  assert.equal(practical[0].name, "Increase the number of kids in charter schools");
  assert.equal(practical[0].x, 74);
  assert.equal(practical[0].y, 70);
  assert.deepEqual(practical[0].proof, ["65% of school parents say they would enroll.", "Enrollment by state."]);
  assert.equal(practical[0].why, "The cited figure is stated intent only.");
  const cultural = data.areas[1].cultural[0];
  assert.equal(cultural.x, 33);
  assert.equal(cultural.ev, "none");
  const blob = JSON.stringify(data);
  assert.equal(blob.includes("site-education-secret"), false);
  assert.equal(blob.includes("Contoso Client"), false);
  assert.equal(blob.includes("Pat Example"), false);
  assert.equal(blob.includes("Cleared by staff"), false);
  assert.equal(blob.includes("publicClearNote"), false);
  assert.equal(blob.includes("submittedBy"), false);
});

test("a row without scores or a lens is left off the chart", () => {
  const data = areasFromFeed([
    { issue: "Housing", slug: "housing", lens: "practical", title: "No scores yet", text: "", ease: null, impact: null, scoreAxis: "ease", evidence: "" },
    { issue: "Housing", slug: "housing", lens: null, title: "No lens", text: "", ease: 10, impact: 10, scoreAxis: "ease", evidence: "" },
  ]);
  assert.equal(data.areas.length, 0);
});

test("the issues page reads the live feed and does not embed a snapshot", () => {
  const html = fs.readFileSync(path.join(root, "issues.html"), "utf8");
  const page = fs.readFileSync(path.join(root, "assets/issues-page.mjs"), "utf8");
  const portal = fs.readFileSync(path.join(root, "assets/portal.js"), "utf8");
  assert.equal(html.includes("const DATA"), false);
  assert.equal(html.includes("/assets/issues-page.mjs"), true);
  assert.match(page, /portal-api\.juntonova\.com\/public\/issues/);
  assert.match(page, /cache:\s*"no-store"/);
  assert.match(portal, />Publish</);
  assert.equal(portal.includes("Mark gate"), false);
  assert.match(portal, /<select id="s-issue" required>/);
  assert.match(portal, /Choose an issue/);
  assert.match(portal, /data-scale-group/);
  assert.match(portal, /data-act="pick-scale"/);
  assert.equal(portal.includes('id="score-x"'), false);
  assert.equal(portal.includes('id="i-ease"'), false);
  assert.equal(portal.includes('id="i-impact"'), false);
  assert.match(portal, /class="danger-zone"/);
  assert.match(portal, />Danger zone</);
  assert.match(portal, /data-form="remove-issue"/);
  assert.match(portal, /Type the issue name to confirm/);
  assert.match(portal, />Delete this issue</);
  assert.match(portal, /room\.person\.role !== "admin"/);
  assert.equal(portal.includes('data-act="remove-issue"'), false);
  assert.equal(portal.includes(">Remove issue<"), false);
});
