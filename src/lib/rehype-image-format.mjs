// Tag local Markdown <img>s with `format: "avif"` so Astro emits AVIF. Must run
// before @astrojs/markdown-remark's rehypeImages, which serializes <img> props
// into its getImage() call.

// Re-encoding an animated GIF to AVIF drops the animation (and Astro's service
// passes it through mislabelled as .avif); rasterizing an SVG throws away its
// scalability. Both are served as-is.
const SKIP_FORMAT_RE = /\.(gif|svg)$/i;

export default function rehypeImageFormat() {
  return (tree, file) => {
    const local = file?.data?.astro?.localImagePaths;
    if (!Array.isArray(local) || local.length === 0) return;
    walk(tree, local);
  };
}

function walk(node, local) {
  if (
    node.tagName === "img" &&
    node.properties &&
    typeof node.properties.src === "string"
  ) {
    const src = safeDecode(node.properties.src);
    if (
      local.includes(src) &&
      !node.properties.format &&
      !SKIP_FORMAT_RE.test(src)
    ) {
      node.properties.format = "avif";
    }
  }
  if (node.children) for (const child of node.children) walk(child, local);
}

function safeDecode(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}
