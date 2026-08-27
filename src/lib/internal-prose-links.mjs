const withoutFencedCode = (body) => {
  const lines = body.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  let fence;
  return lines
    .map((line) => {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (!fence && opening) {
        fence = { marker: opening[1][0], length: opening[1].length };
        return "";
      }
      if (fence) {
        const closing = line.match(/^ {0,3}(`+|~+)[ \t]*$/)?.[1];
        if (closing?.[0] === fence.marker && closing.length >= fence.length) {
          fence = undefined;
        }
        return "";
      }
      return line;
    })
    .join("\n");
};

const withoutInlineCode = (body) => {
  let output = "";
  for (let index = 0; index < body.length;) {
    if (body[index] !== "`") {
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
    output += " ".repeat(closing + length - index);
    index = closing + length;
  }
  return output;
};

export const contentWithoutMarkdownCode = (body) =>
  withoutInlineCode(withoutFencedCode(body));

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
    body.replace(/<QuickSummary\b[^>]*>[\s\S]*?<\/QuickSummary>/gi, ""),
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
