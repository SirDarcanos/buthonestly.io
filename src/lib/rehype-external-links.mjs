// External links open in a new tab with rel="noopener noreferrer".
const SITE_HOST = "buthonestly.io";

export default function rehypeExternalLinks() {
  return (tree) => visit(tree);
}

export function isExternalHttpHref(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return (
    /^https?:$/.test(url.protocol) &&
    url.hostname !== SITE_HOST &&
    !url.hostname.endsWith(`.${SITE_HOST}`)
  );
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

  if (!isExternalHttpHref(href)) return;

  const rel = new Set(
    []
      .concat(a.properties.rel ?? [])
      .flatMap((r) => String(r).split(/\s+/))
      .filter(Boolean),
  );
  rel.add("noopener");
  rel.add("noreferrer");

  a.properties.target = "_blank";
  a.properties.rel = [...rel];
}
