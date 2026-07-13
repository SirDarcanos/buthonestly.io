// Resolve Obsidian [[wikilinks]] to links: [[slug]] and [[slug|label]] → /slug/.
const WIKI = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export default function remarkWikiLinks() {
  return (tree) => visit(tree);
}

function visit(node) {
  if (!node.children) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "code" || child.type === "inlineCode") continue;

    if (child.type === "text" && child.value.includes("[[")) {
      WIKI.lastIndex = 0;
      const parts = [];
      let last = 0;
      let m;
      while ((m = WIKI.exec(child.value))) {
        if (m.index > last) {
          parts.push({ type: "text", value: child.value.slice(last, m.index) });
        }
        const slug = m[1].trim();
        const label = (m[2] ?? m[1]).trim();
        parts.push({
          type: "link",
          url: `/${slug}/`,
          children: [{ type: "text", value: label }],
        });
        last = m.index + m[0].length;
      }
      if (parts.length) {
        if (last < child.value.length) {
          parts.push({ type: "text", value: child.value.slice(last) });
        }
        node.children.splice(i, 1, ...parts);
        i += parts.length - 1;
      }
    } else {
      visit(child);
    }
  }
}
