// `> [!gallery] 3` becomes a responsive grid of the images inside it. Written as
// an Obsidian callout so the vault previews the images in place — a raw <div> or
// a JSX tag is hidden by Live Preview until you click into it.
//
// Runs before remark-callouts, which would otherwise claim the blockquote.
const GALLERY = /^\[!gallery\][+-]?\s*([2-4])?\s*$/i;

const COLS = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

export default function remarkGallery() {
  return (tree) => visit(tree);
}

function visit(node) {
  if (!node.children) return;
  for (const child of node.children) {
    if (child.type === "blockquote") transform(child);
    visit(child);
  }
}

function transform(bq) {
  const first = bq.children[0];
  if (first?.type !== "paragraph" || !first.children.length) return;
  const t0 = first.children[0];
  if (t0?.type !== "text") return;

  const nl = t0.value.indexOf("\n");
  const firstLine = nl >= 0 ? t0.value.slice(0, nl) : t0.value;
  const m = firstLine.match(GALLERY);
  if (!m) return;

  if (nl >= 0) t0.value = t0.value.slice(nl + 1);
  else bq.children.shift();

  bq.data = {
    hName: "div",
    hProperties: {
      className: ["grid", "grid-cols-1", "gap-2", COLS[m[1] ?? 2]],
    },
  };
}
