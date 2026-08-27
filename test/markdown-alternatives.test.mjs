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

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const writeRoute = (siteDirectory, route, html) => {
  const directory = path.join(siteDirectory, route);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "index.html"), html);
};

const documentHtml = ({ canonical, metadata, content }) => `<!doctype html>
<html><head>
<meta name="description" content="Fixture description">
<link rel="canonical" href="${canonical}">
</head><body>
<main data-agent-document data-agent-metadata='${JSON.stringify(metadata)}'>
${content}
</main>
<nav>Site navigation</nav><script>privateImplementation()</script>
</body></html>`;

test("the post-build projection publishes portable editorial Markdown", (context) => {
  const siteDirectory = mkdtempSync(path.join(tmpdir(), "markdown-site-"));
  context.after(() => rmSync(siteDirectory, { recursive: true }));

  writeRoute(
    siteDirectory,
    "fixture-essay",
    documentHtml({
      canonical: "https://buthonestly.io/fixture-essay/",
      metadata: {
        title: "Fixture Essay",
        description: "Fixture description",
        published: "2026-08-01",
        updated: "2026-08-02",
        sections: ["Engineering"],
        topics: ["Testing"],
        narration: "https://static.buthonestly.io/fixture.mp3",
      },
      content: `
<h2>Rendered editorial content</h2>
<p>Read the <a href="/about?ref=agent#bio">About page</a> and <a href="/essays/">archive</a>.</p>
<figure><picture><source srcset="/_astro/picture.webp"><img src="/_astro/picture.jpg" alt="A useful diagram"></picture><figcaption>Photo by <a href="https://example.com/artist">Example Artist</a></figcaption></figure>
<div class="content-gallery"><figure><img src="/first.jpg" alt="First image"></figure><figure><img src="/second.jpg" alt="Second image"></figure></div>
<details class="callout quick-summary"><summary>Quick Summary</summary><ul><li>Summary point</li></ul><p class="summary-disclosure">Generated furniture</p></details>
<ol><li>First step</li></ol>
<ul><li>Parent item<ul><li>Child item</li></ul></li></ul>
<aside class="callout callout-tip"><p class="callout-title">Keep this title</p><p>Keep the meaning.</p></aside>
<blockquote><p>Useful words.</p><cite><a href="https://example.com/source">Ada Example</a></cite></blockquote>
<audio src="/sample.mp3" data-audio-label="Heart — American English"></audio>
<div data-agent-actions><a href="/fixture-essay/">Read the essay</a><a href="/download.zip">Download.zip</a></div>
<pre data-language="js"><code><span>const answer = 42;</span></code></pre>
<form><input value="private"><button>Newsletter control</button></form>`,
    }),
  );
  writeRoute(
    siteDirectory,
    "about",
    documentHtml({
      canonical: "https://buthonestly.io/about/",
      metadata: {
        title: "About",
        description: "About this publication.",
      },
      content: `<h1>About this publication</h1><p>Authored page content.</p>
<div><a data-agent-card href="/section/leadership/"><div><h3>Leadership</h3><span>7 essays</span></div><p>Essays on leading people honestly.</p></a></div>`,
    }),
  );
  writeRoute(
    siteDirectory,
    "essays",
    "<!doctype html><html><body><main><h1>Generated archive</h1></main></body></html>",
  );

  const result = spawnSync(
    "node",
    ["scripts/build-markdown-alternatives.mjs", "--site", siteDirectory],
    { cwd: repositoryRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(path.join(siteDirectory, "essays.md")), false);

  const essay = readFileSync(
    path.join(siteDirectory, "fixture-essay.md"),
    "utf8",
  );
  assert.match(essay, /^---\ncanonical:/);
  assert.doesNotMatch(essay, /^title:/m);
  assert.match(
    essay,
    /canonical: "https:\/\/buthonestly\.io\/fixture-essay\/"/,
  );
  assert.match(essay, /published: "2026-08-01"/);
  assert.match(essay, /updated: "2026-08-02"/);
  assert.match(essay, /sections: \["Engineering"\]/);
  assert.match(essay, /topics: \["Testing"\]/);
  assert.match(
    essay,
    /narration: "https:\/\/static\.buthonestly\.io\/fixture\.mp3"/,
  );
  assert.match(essay, /# Fixture Essay/);
  assert.match(
    essay,
    /\[About page\]\(https:\/\/buthonestly\.io\/about\.md\?ref=agent#bio\)/,
  );
  assert.match(essay, /\[archive\]\(https:\/\/buthonestly\.io\/essays\/\)/);
  assert.match(
    essay,
    /!\[A useful diagram\]\(https:\/\/buthonestly\.io\/_astro\/picture\.jpg\)/,
  );
  assert.ok(essay.indexOf("First image") < essay.indexOf("Second image"));
  assert.match(essay, /> \*\*Quick Summary\*\*/);
  assert.match(essay, /^> - Summary point$/m);
  assert.match(essay, /^1\. First step$/m);
  assert.match(essay, /^- Parent item\n  - Child item$/m);
  assert.match(essay, /> \*\*Keep this title\*\*/);
  assert.match(essay, /> Useful words\./);
  assert.match(
    essay,
    /\[Heart — American English\]\(https:\/\/buthonestly\.io\/sample\.mp3\)/,
  );
  assert.match(
    essay,
    /- \[Read the essay\]\(https:\/\/buthonestly\.io\/fixture-essay\.md\)\n- \[Download\.zip\]\(https:\/\/buthonestly\.io\/download\.zip\)/,
  );
  assert.match(essay, /```js\nconst answer = 42;\n```/);
  assert.doesNotMatch(
    essay,
    /privateImplementation|Newsletter control|Generated furniture/,
  );

  const about = readFileSync(path.join(siteDirectory, "about.md"), "utf8");
  assert.match(about, /# About/);
  assert.match(about, /## About this publication/);
  assert.match(about, /Authored page content/);
  assert.match(
    about,
    /### \[Leadership\]\(https:\/\/buthonestly\.io\/section\/leadership\/\)\n\n7 essays\n\nEssays on leading people honestly\./,
  );
  assert.doesNotMatch(about, /^\[$|^\]\(/m);
});
