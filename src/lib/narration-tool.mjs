import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { chunkText } from "./chunk-text.mjs";

export const NARRATION_SCRIPT_FORMAT = 1;
export const NARRATION_DEFAULTS = Object.freeze({
  voice: "Enceladus",
  style: "reflective",
  pace: "conversational",
  model: "gemini-2.5-flash-preview-tts",
  region: "us-central1",
  chunkWords: 200,
  joinSilenceMs: 200,
});

const NARRATION_COMMANDS = new Set(["prepare", "prep"]);
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

export async function runNarrationCommand({
  command,
  target,
  refresh = false,
  repositoryRoot = process.cwd(),
  essaysDirectory = "src/content/essays",
  workInProgressDirectory = "src/content/drafts",
  log = console.log,
} = {}) {
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
}
