// Static pages get no lastmod: an absent signal is more honest than an invented
// date that causes search engines to discount freshness across the site.
export function buildLastmodMap(inventory) {
  const map = new Map();
  const bump = (pathname, freshnessAt) => {
    const current = map.get(pathname);
    if (!current || freshnessAt > current) map.set(pathname, freshnessAt);
  };

  for (const essay of inventory.published) {
    bump(essay.pathname, essay.freshnessAt);
    bump("/", essay.freshnessAt);
    bump("/essays/", essay.freshnessAt);
    for (const category of essay.categories) {
      bump(category.pathname, essay.freshnessAt);
    }
    for (const tag of essay.tags) bump(tag.pathname, essay.freshnessAt);
  }

  const newest = [...map.values()].reduce(
    (latest, freshnessAt) => (freshnessAt > latest ? freshnessAt : latest),
    new Date(0),
  );
  if (newest > new Date(0)) {
    bump("/section/", newest);
    bump("/topic/", newest);
  }

  return map;
}
