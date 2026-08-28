import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { blankMarkdownComments } from "../src/lib/markdown-comments.mjs";
import { runNarrationCommand } from "../src/lib/narration-tool.mjs";

const createRepository = async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "narration-prepare-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src/content/essays"), { recursive: true });
  await mkdir(path.join(root, "src/content/drafts"), { recursive: true });
  return root;
};

const createEssay = async (root, collection, slug, body) => {
  const directory = path.join(root, "src/content", collection, slug);
  await mkdir(directory, { recursive: true });
  const sourcePath = path.join(directory, `${slug}.mdx`);
  await writeFile(
    sourcePath,
    `---\ntitle: A Title & Its Acronym\n---\n\n${body}`,
  );
  return sourcePath;
};

test("comment removal cannot form a new HTML comment delimiter", () => {
  const source = `<!<!-- decoy 🔒 -->--
Visible prose.
-->`;
  const sanitized = blankMarkdownComments(source);

  assert.doesNotMatch(sanitized, /<!--/);
  assert.equal(sanitized.length, source.length);
  assert.equal(sanitized.split("\n").length, source.split("\n").length);
  assert.match(sanitized, /Visible prose\./);
});

test("prepare writes the reviewed narration script from the MDX structure", async (context) => {
  const root = await createRepository(context);
  const sourcePath = await createEssay(
    root,
    "essays",
    "fixture",
    `import QuickSummary from "x";
import WrittenOnly from "x";
import NarrationOnly from "x";
import Figure from "x";
import Gallery from "x";
import Callout from "x";
import Blockquote from "x";

<QuickSummary>Repeated summary.</QuickSummary>

Opening with [a useful label](https://example.com) and **emphasis**.

## Visible structure

- First item
- Second item with \`code words\`

> An ordinary quotation.

<Blockquote author="Ada Lovelace">A component quotation.</Blockquote>

<Callout type="disclaimer">Terms apply.</Callout>

<Callout type="tip" title="Remember this">A bounded aside.</Callout>

<WrittenOnly>Visible readers only.</WrittenOnly>

<NarrationOnly>

### For listeners

Listener-specific prose.

</NarrationOnly>

<Figure src={image} alt="diagram">A visual caption.</Figure>

<Gallery><Figure src={image} alt="diagram" /></Gallery>

\`\`\`js
const omitted = true;
\`\`\`

| Visual | Table |
| --- | --- |
| no | speech |

<!-- editorial comment -->

Closing prose.
`,
  );
  const messages = [];

  const result = await runNarrationCommand({
    command: "prepare",
    target: "fixture",
    repositoryRoot: root,
    log: (message) => messages.push(message),
  });

  assert.equal(result.sourcePath, sourcePath);
  assert.equal(
    result.transcriptPath,
    path.join(path.dirname(sourcePath), "fixture.audio.txt"),
  );
  assert.equal(result.created, true);
  const transcript = await readFile(result.transcriptPath, "utf8");
  assert.match(transcript, /^# Narration script for fixture\n# format: 1$/m);
  assert.match(transcript, /^# source: sha256:[0-9a-f]{64}$/m);
  assert.match(transcript, /^# voice: Enceladus$/m);
  assert.match(transcript, /^# style: reflective$/m);
  assert.match(transcript, /^# pace: conversational$/m);
  assert.match(transcript, /^# model: gemini-2\.5-flash-tts$/m);
  assert.match(transcript, /^# region: us-central1$/m);
  assert.match(transcript, /^# chunk-words: 200$/m);
  assert.match(transcript, /^# join-silence-ms: 200$/m);
  assert.match(transcript, /^--- chunk 1 ---$/m);
  assert.match(
    transcript,
    /Now listening to A Title & Its Acronym on But Honestly dot IO\./,
  );
  assert.match(transcript, /Opening with a useful label and emphasis\./);
  assert.match(transcript, /New section\. Visible structure\./);
  assert.match(transcript, /First item\n\nSecond item with code words/);
  assert.match(transcript, /Quote\. An ordinary quotation\. End quote\./);
  assert.match(
    transcript,
    /Quote\. A component quotation\. End quote\. Ada Lovelace\./,
  );
  assert.match(transcript, /Disclaimer\. Terms apply\. End disclaimer\./);
  assert.match(
    transcript,
    /Side note\. Remember this\. A bounded aside\. End side note\./,
  );
  assert.match(transcript, /For listeners\.\n\nListener-specific prose\./);
  assert.match(transcript, /Closing prose\./);
  assert.match(
    transcript,
    /Thank you for listening to A Title & Its Acronym on But Honestly dot IO\./,
  );
  assert.doesNotMatch(
    transcript,
    /Repeated summary|Visible readers only|visual caption|omitted|Visual|editorial comment/,
  );
  assert.match(messages.join("\n"), /Read and edit it before synthesis/);
});

test("prep resolves a directory-based work-in-progress Essay by path and protects its script", async (context) => {
  const root = await createRepository(context);
  const sourcePath = await createEssay(
    root,
    "drafts",
    "work-in-progress",
    "Original prose.",
  );

  const first = await runNarrationCommand({
    command: "prep",
    target: path.relative(root, sourcePath),
    repositoryRoot: root,
    log: () => {},
  });
  const firstHash = (await readFile(first.transcriptPath, "utf8")).match(
    /^# source: sha256:([0-9a-f]{64})$/m,
  )[1];
  await writeFile(
    sourcePath,
    `---\ntitle: A Title & Its Acronym\n---\n\n<WrittenOnly>Changed visual prose.</WrittenOnly>\n\nOriginal prose.`,
  );
  await runNarrationCommand({
    command: "prepare",
    target: sourcePath,
    refresh: true,
    repositoryRoot: root,
    log: () => {},
  });
  const omittedChangeHash = (
    await readFile(first.transcriptPath, "utf8")
  ).match(/^# source: sha256:([0-9a-f]{64})$/m)[1];
  assert.equal(omittedChangeHash, firstHash);

  await writeFile(
    sourcePath,
    `---\ntitle: A Title & Its Acronym\n---\n\nChanged narratable prose.`,
  );
  await runNarrationCommand({
    command: "prepare",
    target: sourcePath,
    refresh: true,
    repositoryRoot: root,
    log: () => {},
  });
  const narratableChangeHash = (
    await readFile(first.transcriptPath, "utf8")
  ).match(/^# source: sha256:([0-9a-f]{64})$/m)[1];
  assert.notEqual(narratableChangeHash, firstHash);

  const reviewed = `${await readFile(first.transcriptPath, "utf8")}\nReviewed wording.\n`;
  await writeFile(first.transcriptPath, reviewed);

  const second = await runNarrationCommand({
    command: "prepare",
    target: sourcePath,
    repositoryRoot: root,
    log: () => {},
  });

  assert.equal(second.created, false);
  assert.equal(await readFile(first.transcriptPath, "utf8"), reviewed);
});

test("prepare rejects unsupported targets, legacy scripts, and ambiguous nested modules", async (context) => {
  const root = await createRepository(context);
  const looseNote = path.join(root, "src/content/drafts/note.md");
  await writeFile(looseNote, "A loose note.");

  await assert.rejects(
    runNarrationCommand({
      command: "prepare",
      target: looseNote,
      repositoryRoot: root,
      log: () => {},
    }),
    /directory-based MDX Essay/,
  );

  const legacySource = await createEssay(root, "drafts", "legacy", "Prose.");
  await writeFile(
    path.join(path.dirname(legacySource), "legacy.audio.txt"),
    "--- chunk 1 ---\nOld prose.\n",
  );
  await assert.rejects(
    runNarrationCommand({
      command: "prepare",
      target: "legacy",
      repositoryRoot: root,
      log: () => {},
    }),
    /unsupported format.*--refresh/i,
  );
  await runNarrationCommand({
    command: "prepare",
    target: "legacy",
    refresh: true,
    repositoryRoot: root,
    log: () => {},
  });
  assert.match(
    await readFile(
      path.join(path.dirname(legacySource), "legacy.audio.txt"),
      "utf8",
    ),
    /^# format: 1$/m,
  );

  await createEssay(
    root,
    "drafts",
    "nested",
    '<NarrationOnly><Callout type="tip">Ambiguous.</Callout></NarrationOnly>',
  );
  await assert.rejects(
    runNarrationCommand({
      command: "prep",
      target: "nested",
      repositoryRoot: root,
      log: () => {},
    }),
    /NarrationOnly.*nested Callout/i,
  );

  await createEssay(
    root,
    "drafts",
    "nested-written",
    "<WrittenOnly><NarrationOnly>Ambiguous.</NarrationOnly></WrittenOnly>",
  );
  await assert.rejects(
    runNarrationCommand({
      command: "prepare",
      target: "nested-written",
      repositoryRoot: root,
      log: () => {},
    }),
    /WrittenOnly.*nested NarrationOnly/i,
  );

  await createEssay(
    root,
    "drafts",
    "unknown-component",
    "<Calout>Prose must not disappear silently.</Calout>",
  );
  await assert.rejects(
    runNarrationCommand({
      command: "prepare",
      target: "unknown-component",
      repositoryRoot: root,
      log: () => {},
    }),
    /Unsupported narration component Calout/,
  );

  const nestedDirectory = path.join(
    root,
    "src/content/drafts/container/nested",
  );
  await mkdir(nestedDirectory, { recursive: true });
  const nestedPath = path.join(nestedDirectory, "nested.mdx");
  await writeFile(nestedPath, "---\ntitle: Nested\n---\n\nProse.");
  await assert.rejects(
    runNarrationCommand({
      command: "prepare",
      target: nestedPath,
      repositoryRoot: root,
      log: () => {},
    }),
    /not a directory-based MDX Essay/,
  );

  const outsideDirectory = path.join(root, "outside");
  const symlinkDirectory = path.join(root, "src/content/drafts/escape");
  await Promise.all([
    mkdir(outsideDirectory, { recursive: true }),
    mkdir(symlinkDirectory, { recursive: true }),
  ]);
  const outsidePath = path.join(outsideDirectory, "escape.mdx");
  const symlinkPath = path.join(symlinkDirectory, "escape.mdx");
  await writeFile(outsidePath, "---\ntitle: Escape\n---\n\nProse.");
  await symlink(outsidePath, symlinkPath);
  await assert.rejects(
    runNarrationCommand({
      command: "prepare",
      target: symlinkPath,
      repositoryRoot: root,
      log: () => {},
    }),
    /not a directory-based MDX Essay/,
  );
});
