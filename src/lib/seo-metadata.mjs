const truncate = (text, max = 160) => {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
};

export const essaySeoMetadata = ({
  title,
  excerpt,
  seoTitle,
  seoDescription,
}) => ({
  title: seoTitle ?? title,
  description: truncate(seoDescription ?? excerpt),
});
