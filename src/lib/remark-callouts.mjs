// Render Obsidian callouts. `[!type]` → <aside>; `[!type]-`/`[!type]+` →
// collapsible <details> (closed / open). Title becomes .callout-title.
//
// `[!screen-only]` and `[!audio-only]` are transparent instead: they mark which
// medium a passage belongs to, so prose that only makes sense beside an image
// can be replaced with wording that stands on its own in the narration. Here
// screen-only unwraps to plain paragraphs and audio-only is dropped;
// essay-to-text.mjs does the reverse.
const CALLOUT = /^\[!([\w-]+)\]([+-]?)\s*(.*)$/;
const MARKER = /^\[![\w-]+\][+-]?[ \t]*/;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function remarkCallouts() {
  return (tree) => visit(tree);
}

function visit(node) {
  if (!node.children) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type !== "blockquote") {
      visit(child);
      continue;
    }

    const type = calloutType(child);
    if (type === "audio-only") {
      node.children.splice(i, 1);
      i--;
      continue;
    }
    if (type === "screen-only") {
      const body = unwrap(child);
      node.children.splice(i, 1, ...body);
      i--; // re-visit from the first spliced-in node
      continue;
    }

    transform(child);
    visit(child);
  }
}

function marker(bq) {
  const first = bq.children[0];
  if (first?.type !== "paragraph" || !first.children.length) return null;
  const t0 = first.children[0];
  if (t0?.type !== "text") return null;
  const nl = t0.value.indexOf("\n");
  const firstLine = nl >= 0 ? t0.value.slice(0, nl) : t0.value;
  const m = firstLine.match(CALLOUT);
  return m ? { m, t0, nl } : null;
}

function calloutType(bq) {
  return marker(bq)?.m[1].toLowerCase() ?? null;
}

// Only the `[!type]` token goes — text after it on the same line is prose here,
// not a title.
function unwrap(bq) {
  const hit = marker(bq);
  if (hit) hit.t0.value = hit.t0.value.replace(MARKER, "");
  const first = bq.children[0];
  if (first?.type === "paragraph" && !paragraphHasText(first))
    bq.children.shift();
  return bq.children;
}

function paragraphHasText(p) {
  return p.children.some((c) =>
    c.type === "text" ? c.value.trim() !== "" : true,
  );
}

function transform(bq) {
  const hit = marker(bq);
  if (!hit) return;
  const { m, t0, nl } = hit;

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
    bq.children[0] = titleNode;
  }

  const hProperties = { className: ["callout", `callout-${type}`] };
  if (fold === "+") hProperties.open = true;
  bq.data = {
    hName: collapsible ? "details" : "aside",
    hProperties,
  };
}
