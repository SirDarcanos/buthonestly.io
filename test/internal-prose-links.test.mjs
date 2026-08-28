import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildInternalLinkGraph,
  extractInternalProseLinks,
} from "../src/lib/internal-prose-links.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const record = (slug, body, overrides = {}) => ({
  slug,
  body,
  title: slug,
  publishedAt: new Date("2026-01-01T13:00:00.000Z"),
  cornerstone: false,
  categories: [{ name: "Programming" }],
  tags: [{ name: "Testing" }],
  ...overrides,
});

test("internal prose links exclude code, images, and summary furniture", () => {
  const body = `
[Editorial link](/target/)

\`[Inline code](/ignored-inline/)\`

\`\`[Long inline code](/ignored-long-inline/)\`\`

  \`\`\`md
[Fenced code](/ignored-fence/)
  \`\`\`

<!-- [Commented link](/ignored-comment/) -->

![Image](/ignored-image/)

[Nested [label]](/nested/)

<QuickSummary>

[Generated summary link](/ignored-summary/)

</QuickSummary>
`;

  assert.deepEqual(extractInternalProseLinks(body), ["/target/", "/nested/"]);
});

const frontmatter = (slug, date, downloads = "") => `---
title: ${slug}
date: ${date}
excerpt: ${slug} excerpt.
newsletterIntro: ${slug} newsletter introduction.
cover: cover.jpg
coverAlt: ${slug} cover.
categories:
  - Programming
tags:
  - Testing
${downloads}---

`;

const writeEssay = (directory, slug, date, body, downloads = "") => {
  const essayDirectory = path.join(directory, slug);
  mkdirSync(essayDirectory, { recursive: true });
  writeFileSync(path.join(essayDirectory, "cover.jpg"), "fixture");
  writeFileSync(
    path.join(essayDirectory, `${slug}.mdx`),
    `${frontmatter(slug, date, downloads)}${body}`,
  );
};

test("internal link graph contains only known, non-self editorial links", () => {
  const inventory = {
    essays: [
      record(
        "source",
        "[Target](/target/) [Duplicate](/target/) [Self](/source/) [Missing](/missing/)",
      ),
      record("target", ""),
    ],
  };

  assert.deepEqual(buildInternalLinkGraph(inventory), {
    source: { out: ["target"], in: [] },
    target: { out: [], in: ["source"] },
  });
});

test("link graph is advisory by default and writes JSON only when requested", (testContext) => {
  const directory = mkdtempSync(path.join(tmpdir(), "link-graph-"));
  testContext.after(() => rmSync(directory, { recursive: true }));
  const essaysDirectory = path.join(directory, "essays");
  writeEssay(
    essaysDirectory,
    "source",
    "2020-01-01",
    `[Target](/target/)

<QuickSummary>

[Summary furniture](/scheduled/)

</QuickSummary>
`,
  );
  writeEssay(essaysDirectory, "target", "2020-01-02", "Target prose.");
  writeEssay(essaysDirectory, "scheduled", "2099-01-01", "Scheduled prose.");
  const script = path.join(repositoryRoot, "scripts/build-link-graph.mjs");

  const advisory = spawnSync(
    "node",
    [script, "--essays-dir", essaysDirectory],
    { cwd: directory, encoding: "utf8" },
  );

  assert.equal(advisory.status, 0, advisory.stdout + advisory.stderr);
  assert.match(advisory.stdout, /NO LIVE ESSAY LINKS IN/);
  assert.match(advisory.stdout, /LINKS OUT TO NOTHING/);
  assert.match(advisory.stdout, /CLUSTERS/);
  assert.equal(existsSync(path.join(directory, "data/link-graph.json")), false);

  const outputPath = path.join(directory, "analysis/graph.json");
  const withJson = spawnSync(
    "node",
    [script, "--essays-dir", essaysDirectory, "--json", outputPath],
    { cwd: directory, encoding: "utf8" },
  );

  assert.equal(withJson.status, 0, withJson.stdout + withJson.stderr);
  assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), {
    scheduled: { out: [], in: [] },
    source: { out: ["target"], in: [] },
    target: { out: [], in: ["source"] },
  });
});

test("repository keeps graph analysis local and correctness blocking", () => {
  const ignore = readFileSync(path.join(repositoryRoot, ".gitignore"), "utf8");
  const workflow = readFileSync(
    path.join(repositoryRoot, ".github/workflows/ci.yml"),
    "utf8",
  );
  const trackedGraph = spawnSync("git", ["ls-files", "data/link-graph.json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  assert.match(ignore, /^data\/link-graph\.json$/m);
  assert.equal(trackedGraph.stdout.trim(), "");
  assert.match(workflow, /npm run check:links/);
  assert.doesNotMatch(workflow, /npm run links/);
});

test("blocking checker validates MDX links, publication state, and local assets", (testContext) => {
  const directory = mkdtempSync(path.join(tmpdir(), "link-checker-"));
  testContext.after(() => rmSync(directory, { recursive: true }));
  writeEssay(directory, "target", "2020-01-01", "Target prose.");
  writeEssay(directory, "scheduled", "2099-01-01", "Scheduled prose.");
  writeEssay(
    directory,
    "source",
    "2020-01-01",
    `import missingFigure from "./missing-figure.jpg";

[Valid target](/target/)
[Noncanonical target](/target)
[Scheduled target](/scheduled/)
[Missing route](/missing/)
[Existing static route](/terms-conditions/)
[Missing download](/downloads/missing.pdf)

![Missing public image](/missing-public-image.png)

<!-- ![Ignored public image](/ignored-public-image.png) -->

<Figure src={missingFigure} alt={"Missing fixture"} />
`,
  );

  const result = spawnSync(
    "node",
    ["scripts/check-links.mjs", "--essays-dir", directory],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  const output = result.stdout + result.stderr;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /\[asset\].*missing-figure\.jpg/);
  assert.match(output, /\[asset\].*\/missing-public-image\.png/);
  assert.doesNotMatch(output, /ignored-public-image/);
  assert.doesNotMatch(output, /\[internal\].*terms-conditions/);
  assert.match(output, /\[canonical\].*\/target/);
  assert.match(output, /\[unpublished\].*\/scheduled\//);
  assert.match(output, /\[internal\].*\/missing\//);
  assert.match(output, /\[download\].*\/downloads\/missing\.pdf/);
});
