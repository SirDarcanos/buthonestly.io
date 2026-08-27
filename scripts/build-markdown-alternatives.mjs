import { createWindow } from "@mixmark-io/domino";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const argumentsAfterScript = process.argv.slice(2);
const siteOption = argumentsAfterScript.indexOf("--site");
const siteDirectory = path.resolve(
  siteOption === -1 ? "dist" : argumentsAfterScript[siteOption + 1],
);

const htmlFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
  });

const readDocument = (file) => {
  const document = createWindow(readFileSync(file, "utf8")).document;
  const content = document.querySelector("[data-agent-document]");
  if (!content) return undefined;

  const canonical = document
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
  const encodedMetadata = content.getAttribute("data-agent-metadata");
  if (!canonical || !encodedMetadata) {
    throw new Error(`Agent document metadata is incomplete in ${file}`);
  }

  return {
    file,
    document,
    content,
    canonical,
    metadata: JSON.parse(encodedMetadata),
  };
};

const markdownUrl = (canonical) => {
  const url = new URL(canonical);
  url.pathname = `${url.pathname.replace(/\/$/, "")}.md`;
  return url;
};

const outputPath = (canonical) => {
  const pathname = markdownUrl(canonical).pathname.replace(/^\//, "");
  return path.join(siteDirectory, pathname);
};

const prefixQuote = (content) =>
  content
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line || lines[index - 1])
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");

const createConverter = () => {
  const converter = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    headingStyle: "atx",
  });
  converter.use(gfm);

  converter.addRule("compactListItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const parent = node.parentNode;
      let prefix = `${options.bulletListMarker} `;
      if (parent.nodeName === "OL") {
        const start = parent.getAttribute("start");
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = `${start ? Number(start) + index : index + 1}. `;
      }

      const endsWithParagraph = /\n$/.test(content);
      const item = content.replace(/^\n+|\n+$/g, "");
      const indented = `${item}${endsWithParagraph ? "\n" : ""}`.replace(
        /\n/g,
        `\n${" ".repeat(prefix.length)}`,
      );
      return `${prefix}${indented}${node.nextSibling ? "\n" : ""}`;
    },
  });

  converter.addRule("linkedAudio", {
    filter: "audio",
    replacement: (_content, node) => {
      const source = node.getAttribute("src");
      if (!source) return "";
      const label = node.getAttribute("data-audio-label") || "Audio";
      return `\n\n[${label}](${source})\n\n`;
    },
  });

  converter.addRule("renderedCodeBlock", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_content, node) => {
      const language = node.getAttribute("data-language") ?? "";
      const code = node.textContent.replace(/\n$/, "");
      const fence = code.includes("```") ? "````" : "```";
      return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
    },
  });

  converter.addRule("attributedQuotation", {
    filter: "blockquote",
    replacement: (content) => `\n\n${prefixQuote(content)}\n\n`,
  });

  converter.addRule("callout", {
    filter: (node) =>
      node.nodeName === "ASIDE" && node.classList.contains("callout"),
    replacement: (content, node) => {
      const kind = ["disclaimer", "information", "tip"].find((candidate) =>
        node.classList.contains(`callout-${candidate}`),
      );
      const label =
        node.getAttribute("data-agent-label") ??
        (kind ? `${kind[0].toUpperCase()}${kind.slice(1)}` : "Note");
      return `\n\n${prefixQuote(`**${label}**\n\n${content}`)}\n\n`;
    },
  });

  converter.addRule("quickSummary", {
    filter: (node) =>
      node.nodeName === "DETAILS" && node.classList.contains("quick-summary"),
    replacement: (content) =>
      `\n\n${prefixQuote(`**Quick Summary**\n\n${content}`)}\n\n`,
  });

  return converter;
};

const absoluteUrl = (value, canonical) => {
  if (!value || value.startsWith("data:")) return value;
  try {
    return new URL(value, canonical).href;
  } catch {
    return value;
  }
};

const editorialKey = (value) => {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/$/, "");
  url.hash = "";
  url.search = "";
  return url.href;
};

const rewriteLink = (href, canonical, alternatives) => {
  const absolute = absoluteUrl(href, canonical);
  if (!absolute) return absolute;

  const url = new URL(absolute);
  const alternative = alternatives.get(editorialKey(url));
  return alternative ? `${alternative}${url.search}${url.hash}` : absolute;
};

const metadataLines = (metadata, canonical) => {
  const fields = [
    ["canonical", canonical],
    ["description", metadata.description],
    ["published", metadata.published],
    ["updated", metadata.updated],
    ["sections", metadata.sections],
    ["topics", metadata.topics],
    ["narration", metadata.narration],
  ];

  return fields
    .filter(([, value]) =>
      Array.isArray(value)
        ? value.length > 0
        : value !== undefined && value !== "",
    )
    .map(([name, value]) => `${name}: ${JSON.stringify(value)}`);
};

const prepareContent = ({ content, canonical }, alternatives) => {
  Array.from(content.querySelectorAll("[data-agent-card]")).forEach((card) => {
    const heading = card.querySelector("h1, h2, h3, h4, h5, h6");
    const href = card.getAttribute("href");
    if (!heading || !href) return;

    const link = content.ownerDocument.createElement("a");
    link.setAttribute("href", href);
    while (heading.firstChild) link.appendChild(heading.firstChild);
    heading.appendChild(link);

    const replacement = content.ownerDocument.createElement("div");
    while (card.firstChild) replacement.appendChild(card.firstChild);
    card.parentNode.replaceChild(replacement, card);
  });
  Array.from(content.querySelectorAll("[data-agent-actions]")).forEach(
    (actions) => {
      const list = content.ownerDocument.createElement("ul");
      Array.from(actions.children).forEach((action) => {
        const item = content.ownerDocument.createElement("li");
        item.appendChild(action);
        list.appendChild(item);
      });
      actions.parentNode.replaceChild(list, actions);
    },
  );
  Array.from(content.querySelectorAll(".callout > .callout-title")).forEach(
    (title) =>
      title.parentNode.setAttribute(
        "data-agent-label",
        title.textContent.trim(),
      ),
  );
  Array.from(
    content.querySelectorAll(
      "script, style, form, nav, button, input, select, textarea, video, [data-agent-ignore], .summary-disclosure, .quick-summary > summary, .callout > .callout-title",
    ),
  ).forEach((node) => node.remove());

  Array.from(content.querySelectorAll("h1")).forEach((heading) => {
    const replacement = content.ownerDocument.createElement("h2");
    for (const attribute of Array.from(heading.attributes)) {
      replacement.setAttribute(attribute.name, attribute.value);
    }
    while (heading.firstChild) replacement.appendChild(heading.firstChild);
    heading.parentNode.replaceChild(replacement, heading);
  });

  Array.from(content.querySelectorAll("a[href]")).forEach((anchor) => {
    anchor.setAttribute(
      "href",
      rewriteLink(anchor.getAttribute("href"), canonical, alternatives),
    );
  });
  Array.from(content.querySelectorAll("audio[src]")).forEach((audio) => {
    audio.setAttribute(
      "src",
      absoluteUrl(audio.getAttribute("src"), canonical),
    );
  });
  Array.from(content.querySelectorAll("img")).forEach((image) => {
    if (!image.getAttribute("alt")) {
      image.remove();
      return;
    }
    image.setAttribute(
      "src",
      absoluteUrl(image.getAttribute("src"), canonical),
    );
  });

  return content;
};

const documents = htmlFiles(siteDirectory)
  .map(readDocument)
  .filter((document) => document !== undefined);
const alternatives = new Map(
  documents.map(({ canonical }) => [
    editorialKey(canonical),
    markdownUrl(canonical).href,
  ]),
);
const converter = createConverter();

for (const document of documents) {
  const body = converter
    .turndown(prepareContent(document, alternatives))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!body) throw new Error(`Agent document is empty in ${document.file}`);

  const output = [
    "---",
    ...metadataLines(document.metadata, document.canonical),
    "---",
    "",
    `# ${document.metadata.title}`,
    "",
    body,
    "",
  ].join("\n");
  writeFileSync(outputPath(document.canonical), output);
}

console.log(
  `Published ${documents.length} Markdown alternative${documents.length === 1 ? "" : "s"}.`,
);
