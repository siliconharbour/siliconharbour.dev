import assert from "node:assert/strict";
import { parseHtmlDocument, getNodeText } from "~/lib/job-importers/custom/utils";

function run() {
  const html = `
    <section>
      <div class="job">
        <h3 class="title">Senior Developer</h3>
        <p class="meta">Remote • Canada</p>
      </div>
      <div class="job">
        <h3 class="title">QA Analyst</h3>
        <p class="meta">St. John's, NL</p>
      </div>
    </section>
  `;

  const document = parseHtmlDocument(html);
  const jobs = Array.from(document.querySelectorAll(".job"));
  assert.equal(jobs.length, 2, "expected 2 jobs");

  assert.equal(getNodeText(jobs[0].querySelector(".title")), "Senior Developer");
  assert.equal(getNodeText(jobs[1].querySelector(".title")), "QA Analyst");
  assert.equal(getNodeText(jobs[0].querySelector(".meta")), "Remote • Canada");
  assert.equal(getNodeText(jobs[1].querySelector(".meta")), "St. John's, NL");

  console.log("Importer HTML parser checks passed.");
}

run();
