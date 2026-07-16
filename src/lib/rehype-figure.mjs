// Promote a standalone captioned image `![alt](src "caption")` — which renders
// as <p><img alt title></p> — to <figure><img><figcaption>caption. alt stays on
// the img. Only images alone in a <p> qualify; inline/gallery images are left
// as-is.
export default function rehypeFigure() {
  return (tree) => walk(tree);
}

function walk(node) {
  const children = node.children;
  if (!children) return;
  for (const child of children) {
    if (child.tagName === "p" && isLoneTitledImage(child)) {
      const img = meaningfulChildren(child)[0];
      const caption = String(img.properties.title);
      delete img.properties.title;
      child.tagName = "figure";
      child.properties = child.properties ?? {};
      child.children = [
        img,
        {
          type: "element",
          tagName: "figcaption",
          properties: {},
          children: [{ type: "text", value: caption }],
        },
      ];
      continue; // don't recurse into the figure we just built
    }
    walk(child);
  }
}

function meaningfulChildren(node) {
  return (node.children ?? []).filter(
    (n) => !(n.type === "text" && n.value.trim() === ""),
  );
}

function isLoneTitledImage(p) {
  const kids = meaningfulChildren(p);
  return (
    kids.length === 1 &&
    kids[0].tagName === "img" &&
    !!kids[0].properties?.title
  );
}
