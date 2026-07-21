import { SITE_URL, SITE_TITLE } from "../consts.ts";

type Schema = Record<string, unknown>;

const abs = (path: string) => new URL(path, SITE_URL).href;

export interface Crumb {
  name: string;
  /** Site-relative path, e.g. "/section/web/". Omit on the current page. */
  path?: string;
}

/** "Home" is prepended; pass the rest in order. */
export function breadcrumbList(crumbs: Crumb[]): Schema {
  const all: Crumb[] = [{ name: SITE_TITLE, path: "/" }, ...crumbs];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      ...(crumb.path ? { item: abs(crumb.path) } : {}),
    })),
  };
}

export interface CollectionItem {
  title: string;
  url: string;
}

/** `startIndex` is Astro's `page.start`, so page 2 continues rather than restarting. */
export function collectionPage({
  name,
  description,
  url,
  items,
  startIndex = 0,
}: {
  name: string;
  description?: string;
  url: string;
  items: CollectionItem[];
  startIndex?: number;
}): Schema {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    ...(description ? { description } : {}),
    url: abs(url),
    isPartOf: { "@type": "WebSite", name: SITE_TITLE, url: SITE_URL },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: startIndex + i + 1,
        url: abs(item.url),
        name: item.title,
      })),
    },
  };
}
