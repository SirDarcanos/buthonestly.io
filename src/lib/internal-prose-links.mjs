const blank = (value) => value.replace(/[^\n]/g, " ");

const isEscaped = (source, index) => {
  let backslashes = 0;
  while (source[index - backslashes - 1] === "\\") backslashes++;
  return backslashes % 2 === 1;
};

const listPrefixPattern = /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/;

const containersBeforeFence = (line) => {
  let content = line;
  const containers = [];
  while (content.length) {
    const blockquote = content.match(/^ {0,3}>[ \t]?/)?.[0];
    if (blockquote) {
      containers.push({ type: "blockquote" });
      content = content.slice(blockquote.length);
      continue;
    }
    const list = content.match(listPrefixPattern)?.[0];
    if (!list) break;
    containers.push({ type: "list", indent: list.length });
    content = content.slice(list.length);
  }
  return { content, containers };
};

const openingFence = (line) => {
  const source = line.endsWith("\r") ? line.slice(0, -1) : line;
  const { content, containers } = containersBeforeFence(source);
  const opening = content.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
  if (!opening) return;
  const marker = opening[2];
  return {
    marker: marker[0],
    length: marker.length,
    containers,
    invalid: marker[0] === "`" && opening[3].includes("`"),
    literalLength:
      source.length - content.length + opening[1].length + marker.length,
  };
};

const closingFence = (line, fence) => {
  let content = line;
  for (const container of fence.containers) {
    if (container.type === "blockquote") {
      const prefix = content.match(/^ {0,3}>[ \t]?/)?.[0];
      if (!prefix) return;
      content = content.slice(prefix.length);
      continue;
    }
    const indentation = content.match(/^[ \t]+/)?.[0];
    if (!indentation) return;
    content = content.slice(Math.min(indentation.length, container.indent));
  }
  if (content.endsWith("\r")) content = content.slice(0, -1);
  const closing = content.match(/^ {0,3}(`+|~+)[ \t]*$/)?.[1];
  return closing?.[0] === fence.marker && closing.length >= fence.length;
};

export const contentWithoutMarkdownCode = (body) => {
  let output = "";
  let index = 0;
  let fence;

  while (index < body.length) {
    if (fence) {
      const lineEnd = body.indexOf("\n", index);
      const end = lineEnd === -1 ? body.length : lineEnd;
      const line = body.slice(index, end);
      if (closingFence(line, fence)) fence = undefined;
      output += blank(line);
      if (lineEnd !== -1) output += "\n";
      index = lineEnd === -1 ? body.length : lineEnd + 1;
      continue;
    }

    const atLineStart = index === 0 || body[index - 1] === "\n";
    if (atLineStart) {
      const lineEnd = body.indexOf("\n", index);
      const end = lineEnd === -1 ? body.length : lineEnd;
      const line = body.slice(index, end);
      const opening = openingFence(line);
      if (opening?.invalid) {
        output += body.slice(index, index + opening.literalLength);
        index += opening.literalLength;
        continue;
      }
      if (opening) {
        fence = opening;
        output += blank(line);
        if (lineEnd !== -1) output += "\n";
        index = lineEnd === -1 ? body.length : lineEnd + 1;
        continue;
      }
    }

    if (body.startsWith("<!--", index) && !isEscaped(body, index)) {
      const closing = body.indexOf("-->", index + 4);
      const commentEnd = closing === -1 ? body.length : closing + 3;
      output += blank(body.slice(index, commentEnd));
      index = commentEnd;
      continue;
    }

    if (body[index] !== "`" || isEscaped(body, index)) {
      output += body[index++];
      continue;
    }

    let endOfOpening = index;
    while (body[endOfOpening] === "`") endOfOpening++;
    const length = endOfOpening - index;
    let closing = endOfOpening;
    while (closing < body.length) {
      if (body[closing] !== "`") {
        closing++;
        continue;
      }
      let endOfClosing = closing;
      while (body[endOfClosing] === "`") endOfClosing++;
      if (endOfClosing - closing === length) break;
      closing = endOfClosing;
    }
    if (closing >= body.length) {
      output += body.slice(index, endOfOpening);
      index = endOfOpening;
      continue;
    }
    output += blank(body.slice(index, closing + length));
    index = closing + length;
  }

  return output;
};

const closingBracket = (source, opening) => {
  let depth = 1;
  for (let index = opening + 1; index < source.length; index++) {
    if (source[index] === "\\") {
      index++;
      continue;
    }
    if (source[index] === "[") depth++;
    if (source[index] === "]" && --depth === 0) return index;
  }
};

const destinationAfter = (source, opening) => {
  let index = opening + 1;
  while (/[ \t\n]/.test(source[index])) index++;
  if (source[index] === "<") {
    const closing = source.indexOf(">", index + 1);
    return closing === -1 ? undefined : source.slice(index + 1, closing);
  }

  const start = index;
  let nested = 0;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === "(") nested++;
    if (source[index] === ")") {
      if (nested === 0) break;
      nested--;
    }
    if (/\s/.test(source[index]) && nested === 0) break;
    index++;
  }
  return source.slice(start, index);
};

export function extractInternalMarkdownLinks(body) {
  const source = contentWithoutMarkdownCode(body);
  const links = [];
  for (let index = 0; index < source.length; index++) {
    if (
      source[index] !== "[" ||
      source[index - 1] === "!" ||
      source[index - 1] === "\\"
    ) {
      continue;
    }
    const labelEnd = closingBracket(source, index);
    if (labelEnd == null || source[labelEnd + 1] !== "(") continue;
    const destination = destinationAfter(source, labelEnd + 1);
    if (destination?.startsWith("/")) links.push(destination);
    index = labelEnd;
  }
  return links;
}

export function extractInternalProseLinks(body) {
  return extractInternalMarkdownLinks(
    body.replace(/<QuickSummary\b[^>]*>[\s\S]*?<\/QuickSummary>/gi, (summary) =>
      blank(summary),
    ),
  );
}

const essaySlugFromPath = (url) => {
  const pathname = url.split(/[?#]/, 1)[0];
  return pathname.match(/^\/([a-z0-9-]+)\/$/)?.[1];
};

export function buildInternalLinkGraph(inventory) {
  const knownSlugs = new Set(inventory.essays.map(({ slug }) => slug));
  const graph = Object.fromEntries(
    inventory.essays
      .map(({ slug }) => slug)
      .sort((left, right) => left.localeCompare(right))
      .map((slug) => [slug, { out: [], in: [] }]),
  );

  for (const essay of inventory.essays) {
    if (essay.cornerstone) graph[essay.slug].cornerstone = true;
    const targets = extractInternalProseLinks(essay.body)
      .map(essaySlugFromPath)
      .filter(
        (target) => target && target !== essay.slug && knownSlugs.has(target),
      );
    graph[essay.slug].out = [...new Set(targets)].sort();
  }
  for (const [slug, { out }] of Object.entries(graph)) {
    for (const target of out) graph[target].in.push(slug);
  }
  return graph;
}
