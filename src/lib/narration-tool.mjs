import { createHash } from "node:crypto";
import { constants, existsSync, realpathSync } from "node:fs";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { chunkText } from "./chunk-text.mjs";
import {
  DIRECTOR_PROMPT_FORMAT,
  NARRATION_BITRATE,
  NARRATION_CHANNELS,
  NARRATION_SAMPLE_RATE,
  narrationPaces,
  narrationStyles,
} from "./narration-adapters.mjs";

export const NARRATION_SCRIPT_FORMAT = 1;
export const NARRATION_DEFAULTS = Object.freeze({
  voice: "Enceladus",
  style: "reflective",
  pace: "conversational",
  model: "gemini-2.5-flash-tts",
  region: "us-central1",
  chunkWords: 200,
  joinSilenceMs: 200,
});

const NARRATION_COMMANDS = new Set(["prepare", "prep", "synthesize", "synth"]);
const SYNTHESIS_SETTING_HEADERS = Object.freeze({
  voice: "voice",
  style: "style",
  pace: "pace",
  model: "model",
  region: "region",
  chunkWords: "chunk-words",
  joinSilenceMs: "join-silence-ms",
});
const OMITTED_COMPONENTS = new Set([
  "QuickSummary",
  "WrittenOnly",
  "Figure",
  "Gallery",
]);
const SEMANTIC_COMPONENTS = new Set([
  ...OMITTED_COMPONENTS,
  "NarrationOnly",
  "Callout",
  "Blockquote",
]);

const sentence = (value) => {
  const text = value.trim();
  return text === "" || /[.!?…]$/u.test(text) ? text : `${text}.`;
};

const normalizeText = (value) => value.replace(/\s+/gu, " ").trim();

const jsxAttribute = (node, name) => {
  const attribute = node.attributes?.find(
    (candidate) =>
      candidate.type === "mdxJsxAttribute" && candidate.name === name,
  );
  if (!attribute) return undefined;
  if (typeof attribute.value !== "string") {
    throw new Error(`${node.name} ${name} must be a plain text attribute`);
  }
  return attribute.value.trim();
};

const nestedSemanticComponent = (nodes) => {
  for (const node of nodes ?? []) {
    if (
      ["mdxJsxFlowElement", "mdxJsxTextElement"].includes(node.type) &&
      SEMANTIC_COMPONENTS.has(node.name)
    ) {
      return node.name;
    }
    const nested = nestedSemanticComponent(node.children);
    if (nested) return nested;
  }
  return null;
};

const inlineText = (nodes, medium) =>
  normalizeText(
    (nodes ?? [])
      .map((node) => {
        switch (node.type) {
          case "text":
          case "inlineCode":
            return node.value;
          case "emphasis":
          case "strong":
          case "delete":
          case "link":
          case "linkReference":
            return inlineText(node.children, medium);
          case "break":
            return " ";
          case "image":
          case "imageReference":
          case "footnoteDefinition":
          case "footnoteReference":
          case "html":
          case "mdxTextExpression":
          case "mdxFlowExpression":
            return "";
          case "mdxJsxTextElement": {
            if (node.name === "WrittenOnly") {
              const nested = nestedSemanticComponent(node.children);
              if (nested) {
                throw new Error(`WrittenOnly cannot contain nested ${nested}`);
              }
              return "";
            }
            if (OMITTED_COMPONENTS.has(node.name)) return "";
            if (node.name === "NarrationOnly") {
              const nested = nestedSemanticComponent(node.children);
              if (nested) {
                throw new Error(
                  `NarrationOnly cannot contain nested ${nested}`,
                );
              }
              return inlineText(node.children, "NarrationOnly");
            }
            if (node.name === "Callout") {
              const body = inlineText(node.children, medium);
              const type = jsxAttribute(node, "type");
              const title = jsxAttribute(node, "title");
              if (type === "disclaimer") {
                return `${sentence(title || "Disclaimer")} ${body} End disclaimer.`;
              }
              if (["information", "tip"].includes(type)) {
                const spokenTitle = title ? ` ${sentence(title)}` : "";
                return `Side note.${spokenTitle} ${body} End side note.`;
              }
              throw new Error(
                "Callout type must be disclaimer, information, or tip for narration",
              );
            }
            if (node.name === "Blockquote") {
              const body = inlineText(node.children, medium);
              const author = jsxAttribute(node, "author");
              if (!author)
                throw new Error("Blockquote author must be plain text");
              return `Quote. ${body} End quote. ${sentence(author)}`;
            }
            if (/^[A-Z]/u.test(node.name ?? "")) {
              throw new Error(`Unsupported narration component ${node.name}`);
            }
            return "";
          }
          default:
            return node.children ? inlineText(node.children, medium) : "";
        }
      })
      .join(""),
  );

const renderBlocks = (nodes, medium) => {
  const blocks = [];

  for (const node of nodes ?? []) {
    switch (node.type) {
      case "paragraph": {
        const text = inlineText(node.children, medium);
        if (text) blocks.push(text);
        break;
      }
      case "heading": {
        const text = sentence(inlineText(node.children, medium));
        if (text) blocks.push(node.depth === 2 ? `New section. ${text}` : text);
        break;
      }
      case "list":
        for (const item of node.children ?? []) {
          blocks.push(...renderBlocks(item.children, medium));
        }
        break;
      case "listItem":
      case "root":
        blocks.push(...renderBlocks(node.children, medium));
        break;
      case "blockquote": {
        const quoted = renderBlocks(node.children, medium).join("\n\n");
        if (quoted) blocks.push(`Quote. ${quoted} End quote.`);
        break;
      }
      case "mdxJsxFlowElement": {
        if (node.name === "WrittenOnly") {
          const nested = nestedSemanticComponent(node.children);
          if (nested) {
            throw new Error(`WrittenOnly cannot contain nested ${nested}`);
          }
          break;
        }
        if (OMITTED_COMPONENTS.has(node.name)) break;
        if (node.name === "NarrationOnly") {
          const nested = nestedSemanticComponent(node.children);
          if (nested) {
            throw new Error(`NarrationOnly cannot contain nested ${nested}`);
          }
          blocks.push(...renderBlocks(node.children, "NarrationOnly"));
          break;
        }
        if (node.name === "Callout") {
          const body = renderBlocks(node.children, medium).join("\n\n");
          if (!body) break;
          const type = jsxAttribute(node, "type");
          const title = jsxAttribute(node, "title");
          if (type === "disclaimer") {
            blocks.push(
              `${sentence(title || "Disclaimer")} ${body} End disclaimer.`,
            );
          } else if (["information", "tip"].includes(type)) {
            const spokenTitle = title ? ` ${sentence(title)}` : "";
            blocks.push(`Side note.${spokenTitle} ${body} End side note.`);
          } else {
            throw new Error(
              "Callout type must be disclaimer, information, or tip for narration",
            );
          }
          break;
        }
        if (node.name === "Blockquote") {
          const body = renderBlocks(node.children, medium).join("\n\n");
          if (!body) break;
          const author = jsxAttribute(node, "author");
          if (!author) throw new Error("Blockquote author must be plain text");
          blocks.push(`Quote. ${body} End quote. ${sentence(author)}`);
          break;
        }
        if (/^[A-Z]/u.test(node.name ?? "")) {
          throw new Error(`Unsupported narration component ${node.name}`);
        }
        break;
      }
      case "code":
      case "table":
      case "thematicBreak":
      case "html":
      case "mdxjsEsm":
      case "mdxFlowExpression":
      case "definition":
      case "footnoteDefinition":
        break;
      default:
        if (node.children) blocks.push(...renderBlocks(node.children, medium));
    }
  }

  return blocks.filter(Boolean);
};

const narrationText = (sourceContent, sourcePath) => {
  const parsed = matter(sourceContent);
  const title =
    typeof parsed.data.title === "string" ? parsed.data.title.trim() : "";
  if (!title) throw new Error(`${sourcePath} must have a non-empty title`);

  let tree;
  try {
    const withoutMarkdownComments = parsed.content.replace(
      /<!--[\s\S]*?-->/gu,
      "",
    );
    tree = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMdx)
      .parse(withoutMarkdownComments);
  } catch (error) {
    throw new Error(
      `Cannot prepare narration from ${sourcePath}: ${error.message}`,
    );
  }

  const body = renderBlocks(tree.children).join("\n\n").trim();
  if (!body) throw new Error(`No narratable prose found in ${sourcePath}`);

  return {
    title,
    text: [
      `Now listening to ${title} on But Honestly dot IO.`,
      body,
      `Thank you for listening to ${title} on But Honestly dot IO.`,
    ].join("\n\n"),
  };
};

const inside = (candidate, directory) => {
  const relative = path.relative(directory, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
};

const validEssayPath = (candidate, roots) => {
  if (path.extname(candidate) !== ".mdx") return false;
  const slug = path.basename(path.dirname(candidate));
  if (path.basename(candidate) !== `${slug}.mdx`) return false;

  const lexicalRoot = roots.find((root) => {
    const relative = path.relative(root, candidate);
    return relative === path.join(slug, `${slug}.mdx`);
  });
  if (!lexicalRoot) return false;

  const realCandidate = realpathSync(candidate);
  const realRoot = realpathSync(lexicalRoot);
  return inside(realCandidate, realRoot);
};

const resolveTarget = ({
  target,
  repositoryRoot,
  essaysDirectory,
  workInProgressDirectory,
}) => {
  if (typeof target !== "string" || !target.trim()) {
    throw new Error("Prepare requires one Essay slug or path");
  }
  const builtRoot = path.resolve(repositoryRoot, essaysDirectory);
  const workRoot = path.resolve(repositoryRoot, workInProgressDirectory);
  const roots = [builtRoot, workRoot];
  const value = target.trim();

  if (
    !value.includes("/") &&
    !value.includes(path.sep) &&
    path.extname(value) === ""
  ) {
    const candidates = roots
      .map((root) => path.join(root, value, `${value}.mdx`))
      .filter((candidate) => existsSync(candidate));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      throw new Error(`Essay slug "${value}" is ambiguous; use its path`);
    }
    throw new Error(
      `No built or work-in-progress Essay found for slug "${value}"`,
    );
  }

  const candidate = path.resolve(repositoryRoot, value);
  if (!existsSync(candidate) || !validEssayPath(candidate, roots)) {
    throw new Error(
      `${value} is not a directory-based MDX Essay in the built or work-in-progress collection`,
    );
  }
  return candidate;
};

const renderTranscript = ({ slug, title, sourceHash, chunks }) => {
  const settings = NARRATION_DEFAULTS;
  const header = [
    `# Narration script for ${slug}`,
    `# format: ${NARRATION_SCRIPT_FORMAT}`,
    "#",
    "# Synthesis reads this file, not the Essay. Edit wording and chunk boundaries freely.",
    "# Refresh discards those edits: npm run narration -- prepare <Essay> --refresh",
    `# title: ${title}`,
    `# source: sha256:${sourceHash}`,
    `# voice: ${settings.voice}`,
    `# style: ${settings.style}`,
    `# pace: ${settings.pace}`,
    `# model: ${settings.model}`,
    `# region: ${settings.region}`,
    `# chunk-words: ${settings.chunkWords}`,
    `# join-silence-ms: ${settings.joinSilenceMs}`,
    "",
  ].join("\n");
  const body = chunks
    .map((chunk, index) => `--- chunk ${index + 1} ---\n${chunk.trim()}\n`)
    .join("\n");
  return `${header}\n${body}`;
};

const prepareNarration = async ({
  command,
  target,
  refresh = false,
  repositoryRoot = process.cwd(),
  essaysDirectory = "src/content/essays",
  workInProgressDirectory = "src/content/drafts",
  log = console.log,
} = {}) => {
  if (!NARRATION_COMMANDS.has(command)) {
    throw new Error(
      `Unknown Narration command "${command}". Use prepare or prep.`,
    );
  }

  const sourcePath = resolveTarget({
    target,
    repositoryRoot,
    essaysDirectory,
    workInProgressDirectory,
  });
  const slug = path.basename(sourcePath, ".mdx");
  const transcriptPath = path.join(
    path.dirname(sourcePath),
    `${slug}.audio.txt`,
  );

  if (existsSync(transcriptPath) && !refresh) {
    const existing = await readFile(transcriptPath, "utf8");
    if (
      !new RegExp(`^# format: ${NARRATION_SCRIPT_FORMAT}$`, "m").test(existing)
    ) {
      throw new Error(
        `${transcriptPath} uses an unsupported format; run prepare with --refresh to replace it`,
      );
    }
    log(
      `Kept reviewed narration script ${transcriptPath}. Use --refresh to replace it.`,
    );
    return { sourcePath, transcriptPath, created: false };
  }

  const sourceContent = await readFile(sourcePath, "utf8");
  const prepared = narrationText(sourceContent, sourcePath);
  const sourceHash = createHash("sha256").update(prepared.text).digest("hex");
  const chunks = chunkText(prepared.text, NARRATION_DEFAULTS.chunkWords);
  const transcript = renderTranscript({
    slug,
    title: prepared.title,
    sourceHash,
    chunks,
  });
  await writeFile(transcriptPath, transcript, "utf8");
  log(
    `Wrote ${transcriptPath} (${chunks.length} chunk${chunks.length === 1 ? "" : "s"}). Read and edit it before synthesis.`,
  );
  return { sourcePath, transcriptPath, created: true, chunks: chunks.length };
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const headerValue = (transcript, name) => {
  const match = transcript.match(new RegExp(`^# ${name}: (.+)$`, "m"));
  if (!match) throw new Error(`Narration script is missing # ${name}`);
  return match[1].trim();
};

const parsePositiveInteger = (value, name, { allowZero = false } = {}) => {
  const parsed = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(
      `Narration setting ${name} must be an integer of at least ${minimum}`,
    );
  }
  return parsed;
};

const validateSettings = (settings) => {
  if (!narrationStyles.includes(settings.style)) {
    throw new Error(
      `Unknown style "${settings.style}". Use one of: ${narrationStyles.join(", ")}`,
    );
  }
  if (!narrationPaces.includes(settings.pace)) {
    throw new Error(
      `Unknown pace "${settings.pace}". Use one of: ${narrationPaces.join(", ")}`,
    );
  }
  for (const name of ["voice", "model", "region"]) {
    if (typeof settings[name] !== "string" || !settings[name].trim()) {
      throw new Error(`Narration setting ${name} must not be empty`);
    }
  }
  if (!Number.isInteger(settings.chunkWords) || settings.chunkWords < 10) {
    throw new Error(
      "Narration setting chunk-words must be an integer of at least 10",
    );
  }
  if (!Number.isInteger(settings.joinSilenceMs) || settings.joinSilenceMs < 0) {
    throw new Error(
      "Narration setting join-silence-ms must be a non-negative integer",
    );
  }
};

const parseTranscript = (transcript) => {
  const format = Number(headerValue(transcript, "format"));
  if (format !== NARRATION_SCRIPT_FORMAT) {
    throw new Error(
      `Narration script uses unsupported format ${format}; run prepare with --refresh to replace it`,
    );
  }
  const settings = {
    voice: headerValue(transcript, "voice"),
    style: headerValue(transcript, "style"),
    pace: headerValue(transcript, "pace"),
    model: headerValue(transcript, "model"),
    region: headerValue(transcript, "region"),
    chunkWords: parsePositiveInteger(
      headerValue(transcript, "chunk-words"),
      "chunk-words",
    ),
    joinSilenceMs: parsePositiveInteger(
      headerValue(transcript, "join-silence-ms"),
      "join-silence-ms",
      { allowZero: true },
    ),
  };
  validateSettings(settings);

  const firstChunkOffset = transcript.search(/^--- chunk 1 ---$/mu);
  const textOutsideChunks = transcript
    .slice(0, firstChunkOffset < 0 ? transcript.length : firstChunkOffset)
    .split("\n")
    .find((line) => line.trim() && !line.startsWith("#"));
  if (textOutsideChunks) {
    throw new Error("Narration script contains prose outside numbered chunks");
  }

  const chunks = [];
  const pattern =
    /^--- chunk (\d+) ---\n([\s\S]*?)(?=^--- chunk \d+ ---\n|(?![\s\S]))/gmu;
  for (const match of transcript.matchAll(pattern)) {
    const expected = chunks.length + 1;
    if (Number(match[1]) !== expected) {
      throw new Error(`Narration chunks must be numbered consecutively from 1`);
    }
    const text = match[2].trim();
    if (!text) throw new Error(`Narration chunk ${expected} is empty`);
    chunks.push(text);
  }
  if (chunks.length === 0) {
    throw new Error("Narration script contains no numbered chunks");
  }
  return { settings, chunks };
};

const applySettingOverrides = (transcript, overrides = {}) => {
  let updated = transcript;
  for (const [name, header] of Object.entries(SYNTHESIS_SETTING_HEADERS)) {
    if (overrides[name] === undefined) continue;
    const value = String(overrides[name]).trim();
    if (!value)
      throw new Error(`Narration setting ${header} must not be empty`);
    const pattern = new RegExp(`^# ${header}: .+$`, "m");
    if (!pattern.test(updated)) {
      throw new Error(`Narration script is missing # ${header}`);
    }
    updated = updated.replace(pattern, `# ${header}: ${value}`);
  }
  return updated;
};

const synthesisPaths = ({ repositoryRoot, sourcePath }) => {
  const slug = path.basename(sourcePath, ".mdx");
  const sourceIdentity = sha256(
    path.relative(repositoryRoot, sourcePath),
  ).slice(0, 12);
  const workDirectory = path.join(
    repositoryRoot,
    "local/narration",
    `${slug}-${sourceIdentity}`,
  );
  return {
    slug,
    transcriptPath: path.join(path.dirname(sourcePath), `${slug}.audio.txt`),
    outputPath: path.join(path.dirname(sourcePath), `${slug}.mp3`),
    workDirectory,
    manifestPath: path.join(workDirectory, "provenance.json"),
  };
};

const ensureWritableDirectory = async (directory) => {
  await mkdir(directory, { recursive: true });
  const probe = path.join(directory, `.write-test-${process.pid}`);
  await writeFile(probe, "ok", "utf8");
  await rm(probe);
};

const concatenatePcm = (buffers, silenceMs) => {
  const silenceBytes =
    Math.round((NARRATION_SAMPLE_RATE * silenceMs) / 1000) * 2;
  const silence = Buffer.alloc(silenceBytes);
  return Buffer.concat(
    buffers.flatMap((buffer, index) =>
      index === 0 || silenceBytes === 0 ? [buffer] : [silence, buffer],
    ),
  );
};

const provenancePayload = async ({
  transcript,
  settings,
  outputPath,
  sourcePath,
}) => ({
  version: 1,
  sourcePath,
  outputPath,
  transcriptHash: sha256(transcript),
  outputHash: sha256(await readFile(outputPath)),
  settings,
  directorPromptFormat: DIRECTOR_PROMPT_FORMAT,
});

export const validateNarrationProvenance = async ({
  target,
  repositoryRoot = process.cwd(),
  essaysDirectory = "src/content/essays",
  workInProgressDirectory = "src/content/drafts",
} = {}) => {
  const sourcePath = resolveTarget({
    target,
    repositoryRoot,
    essaysDirectory,
    workInProgressDirectory,
  });
  const paths = synthesisPaths({ repositoryRoot, sourcePath });
  const [transcript, manifestText] = await Promise.all([
    readFile(paths.transcriptPath, "utf8"),
    readFile(paths.manifestPath, "utf8").catch(() => {
      throw new Error(
        `No provenance manifest found for ${paths.outputPath}; synthesize it before upload`,
      );
    }),
  ]);
  const manifest = JSON.parse(manifestText);
  if (manifest.transcriptHash !== sha256(transcript)) {
    throw new Error(
      `The MP3 provenance does not match the reviewed narration script at ${paths.transcriptPath}`,
    );
  }
  if (manifest.directorPromptFormat !== DIRECTOR_PROMPT_FORMAT) {
    throw new Error(
      "The MP3 provenance uses an obsolete director prompt format",
    );
  }
  const output = await readFile(paths.outputPath).catch(() => {
    throw new Error(`Narration MP3 is missing at ${paths.outputPath}`);
  });
  if (output.length === 0 || manifest.outputHash !== sha256(output)) {
    throw new Error(
      `Narration MP3 at ${paths.outputPath} failed provenance validation`,
    );
  }
  return { ...paths, sourcePath, settings: manifest.settings };
};

const synthesizeNarration = async ({
  target,
  repositoryRoot,
  essaysDirectory,
  workInProgressDirectory,
  settings: overrides,
  yes,
  provider,
  audio,
  confirm,
  log,
}) => {
  if (!provider || !audio) {
    throw new Error(
      "Narration synthesis requires provider and ffmpeg adapters",
    );
  }
  const sourcePath = resolveTarget({
    target,
    repositoryRoot,
    essaysDirectory,
    workInProgressDirectory,
  });
  const paths = synthesisPaths({ repositoryRoot, sourcePath });
  const originalTranscript = await readFile(paths.transcriptPath, "utf8").catch(
    () => {
      throw new Error(
        `Reviewed narration script not found at ${paths.transcriptPath}; run prepare first`,
      );
    },
  );
  const transcript = applySettingOverrides(originalTranscript, overrides);
  const parsed = parseTranscript(transcript);

  await ensureWritableDirectory(paths.workDirectory);
  await access(path.dirname(paths.outputPath), constants.W_OK);
  await provider.preflight(parsed.settings);
  await audio.preflight();

  if (transcript !== originalTranscript) {
    await writeFile(paths.transcriptPath, transcript, "utf8");
  }

  log(
    `${paths.slug}: ${parsed.chunks.length} chunk${parsed.chunks.length === 1 ? "" : "s"}; voice ${parsed.settings.voice}; model ${parsed.settings.model}; style ${parsed.settings.style}; pace ${parsed.settings.pace}.`,
  );
  if (!yes) {
    if (typeof confirm !== "function") {
      throw new Error("Paid synthesis requires confirmation or --yes");
    }
    const accepted = await confirm(
      `Start paid synthesis for ${parsed.chunks.length} chunk${parsed.chunks.length === 1 ? "" : "s"}?`,
    );
    if (!accepted) throw new Error("Narration synthesis cancelled");
  }

  const chunks = [];
  for (let index = 0; index < parsed.chunks.length; index += 1) {
    log(`Synthesizing chunk ${index + 1}/${parsed.chunks.length}`);
    chunks.push(
      await provider.synthesize(parsed.chunks[index], parsed.settings),
    );
  }
  const pcm = concatenatePcm(chunks, parsed.settings.joinSilenceMs);
  if (pcm.length === 0) throw new Error("Synthesis produced no PCM audio");
  await audio.encode({
    pcm,
    outputPath: paths.outputPath,
    sampleRate: NARRATION_SAMPLE_RATE,
    channels: NARRATION_CHANNELS,
    bitrate: NARRATION_BITRATE,
  });
  const output = await stat(paths.outputPath).catch(() => null);
  if (!output?.isFile() || output.size === 0) {
    throw new Error(
      `ffmpeg did not produce a nonempty MP3 at ${paths.outputPath}`,
    );
  }
  const manifest = await provenancePayload({
    transcript,
    settings: parsed.settings,
    outputPath: paths.outputPath,
    sourcePath,
  });
  await writeFile(
    paths.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await validateNarrationProvenance({
    target: sourcePath,
    repositoryRoot,
    essaysDirectory,
    workInProgressDirectory,
  });
  log(`Wrote verified narration ${paths.outputPath}`);
  return {
    command: "synthesize",
    sourcePath,
    ...paths,
    chunks: parsed.chunks.length,
  };
};

export async function runNarrationCommand({
  command,
  target,
  refresh = false,
  repositoryRoot = process.cwd(),
  essaysDirectory = "src/content/essays",
  workInProgressDirectory = "src/content/drafts",
  settings,
  yes = false,
  provider,
  audio,
  confirm,
  log = console.log,
} = {}) {
  if (!NARRATION_COMMANDS.has(command)) {
    throw new Error(
      `Unknown Narration command "${command}". Use prepare, prep, synthesize, or synth.`,
    );
  }
  if (["prepare", "prep"].includes(command)) {
    return prepareNarration({
      command,
      target,
      refresh,
      repositoryRoot,
      essaysDirectory,
      workInProgressDirectory,
      log,
    });
  }
  if (refresh)
    throw new Error("--refresh is only available with prepare or prep");
  return synthesizeNarration({
    target,
    repositoryRoot,
    essaysDirectory,
    workInProgressDirectory,
    settings,
    yes,
    provider,
    audio,
    confirm,
    log,
  });
}
