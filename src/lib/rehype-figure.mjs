// Promote a standalone captioned image `![alt](src "caption")` to
// <figure><img><figcaption>. Only images alone in a <p> qualify.
//
// The caption is emitted as raw HTML so photo credits pasted from Unsplash or
// Pexels keep their links. A caption containing those double quotes needs a
// single-quoted title, or the image stops parsing entirely — check-links catches
// it.

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
