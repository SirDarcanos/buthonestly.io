// Promote a standalone captioned image `![alt](src "caption")` — which renders
// as <p><img alt title></p> — to <figure><img><figcaption>caption. alt stays on
// the img. Only images alone in a <p> qualify; inline/gallery images are left
// as-is.
//
// The caption is emitted as raw HTML, because photo credits are pasted straight
// from Unsplash or Pexels with their links and utm_ params intact. That means a
// caption containing the snippet's double quotes must use a SINGLE-quoted title
// — `![alt](src 'Photo by <a href="…">…')` — or the image stops parsing as an
// image entirely. `npm run check:links` catches that.

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
          children: [{ type: "raw", value: caption }],
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
