import { parseFrontmatter } from "@astrojs/markdown-remark";

export function parseEssayFrontmatter(source) {
  const normalized = source.replace(/^\uFEFF/, "");
  if (!/^---(?:\r?\n|$)/.test(normalized))
    return { data: {}, content: normalized };
  const { frontmatter, rawFrontmatter, content } = parseFrontmatter(normalized);
  return {
    data: frontmatter,
    content: rawFrontmatter ? content.replace(/^\r?\n/, "") : content,
  };
}
