// External links (different host) open in a new tab with rel="noopener
// noreferrer". Add "nofollow" to a link's title to also get rel="nofollow":
//   [text](https://example.com "nofollow")   → rel="noopener noreferrer nofollow"
//   [text](https://example.com "Tip nofollow") → title="Tip", rel="… nofollow"
const SITE_HOST = "buthonestly.io";

export default function rehypeExternalLinks() {
  return (tree) => visit(tree);
}

function visit(node) {
  if (!node.children) return;
  for (const child of node.children) {
    if (child.type === "element" && child.tagName === "a") apply(child);
    visit(child);
  }
}

function apply(a) {
  const href = a.properties?.href;
  if (typeof href !== "string") return;

  let url;
  try {
    url = new URL(href);
  } catch {
    return; // relative/internal link — leave it alone
  }
  if (!/^https?:$/.test(url.protocol)) return; // mailto:, tel:, etc.
  if (url.hostname === SITE_HOST || url.hostname.endsWith(`.${SITE_HOST}`))
    return;

  const rel = new Set(
    []
      .concat(a.properties.rel ?? [])
      .flatMap((r) => String(r).split(/\s+/))
      .filter(Boolean),
  );
  rel.add("noopener");
  rel.add("noreferrer");

  const title = a.properties.title;
  if (typeof title === "string" && /(^|\s)nofollow(\s|$)/i.test(title)) {
    rel.add("nofollow");
    const rest = title.replace(/(^|\s)nofollow(\s|$)/i, " ").trim();
    if (rest) a.properties.title = rest;
    else delete a.properties.title;
  }

  a.properties.target = "_blank";
  a.properties.rel = [...rel];
}
