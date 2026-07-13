// Render Obsidian callouts. `[!type]` → <aside>; `[!type]-`/`[!type]+` →
// collapsible <details> (closed / open). Title becomes .callout-title.
const CALLOUT = /^\[!(\w+)\]([+-]?)\s*(.*)$/;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function remarkCallouts() {
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
  const m = firstLine.match(CALLOUT);
  if (!m) return;

  const type = m[1].toLowerCase();
  const fold = m[2];
  const collapsible = fold === "-" || fold === "+";
  const title = m[3].trim() || cap(type);

  const titleNode = {
    type: "paragraph",
    data: {
      hName: collapsible ? "summary" : "p",
      hProperties: { className: ["callout-title"] },
    },
    children: [{ type: "text", value: title }],
  };

  if (nl >= 0) {
    // Body text continued on the marker line — keep it, prepend the title.
    t0.value = t0.value.slice(nl + 1);
    bq.children.unshift(titleNode);
  } else {
    // Marker line was the whole first paragraph — replace it with the title.
    bq.children[0] = titleNode;
  }

  const hProperties = { className: ["callout", `callout-${type}`] };
  if (fold === "+") hProperties.open = true;
  bq.data = {
    hName: collapsible ? "details" : "aside",
    hProperties,
  };
}
