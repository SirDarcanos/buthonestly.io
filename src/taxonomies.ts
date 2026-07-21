// Hand-written descriptions for section (category) and topic (tag) archives.
// They render beside the <h1> on the archive page and become its meta
// description, so keep them under ~160 characters and self-contained — they are
// read out of context in search results.
//
// Describe the TERRITORY, not the INVENTORY. A description that lists what's
// currently filed under a term goes stale the moment the next essay lands;
// one that states the term's scope and angle stays true. Domain nouns that
// define the site (WordPress, WooCommerce, PHP) are fair game — individual
// essay subjects are not.
//
// They're also the SERP snippet, so: front-load the promise (mobile truncates
// near 120 characters, desktop near 160), and close on the reason to click this
// result over the other nine.
//
// Keyed by slug (the URL segment), not by the display name in frontmatter, so
// renaming a category's capitalisation doesn't silently drop its description.
// An absent or empty entry is fine: the page renders no description and falls
// back to SITE_DESCRIPTION for the meta tag.

export const TAX_DESCRIPTIONS: Record<string, string> = {
  // ── Sections (categories) ──────────────────────────────────────────────────
  leadership:
    "Essays on leading people honestly — feedback, trust, difficult conversations, and the judgment calls no management book prepares you for.",
  programming:
    "Practical programming essays — code that ships, tools worth your time, and the tradeoffs behind the decisions. PHP, Python, JavaScript, and whatever fits.",
  web: "Building for the web, honestly — WordPress, WooCommerce, Next.js, performance and platform choices, from someone who does this for a living.",
  observations:
    "Essays on technology and modern life — attention, AI, and what our tools are quietly doing to how we work and think. Questions over hot takes.",

  // ── Topics (tags) ──────────────────────────────────────────────────────────
  adhd: "Working and leading with ADHD — planning systems that survive a bad week, focus without burnout, and honest tradeoffs instead of productivity hacks.",
  ai: "Building with AI and naming its limits — practical machine learning, honest assessments, and why the hype rarely survives contact with real data.",
  automation:
    "Automating the boring parts — scripts, workflows and small tools that quietly save hours, plus the honest question of when automation isn't worth it.",
  blogging:
    "Writing and publishing on your own terms — tools, platforms, and keeping your voice yours in an era of generated content.",
  creativity:
    "Making things for the joy of it — side projects, creative process, and what originality means now that machines can generate almost anything.",
  feedback:
    "Giving and receiving feedback that actually lands — separating facts from feelings, asking better questions, and making honesty safe enough to work.",
  gaming:
    "What games teach about people and systems — leadership lessons from playing together, and the culture and technology behind the worlds we play in.",
  performance:
    "Making software faster — profiling, query tuning, database and hardware choices, and knowing when the speed you gained is worth the complexity.",
  php: "Practical PHP for the web and other systems — working code you can drop in, and the reasoning behind it so you can adapt it yourself.",
  productivity:
    "Getting things done without the productivity theatre — systems that hold up over months, and honest takes on the tools promising to fix your workflow.",
  python:
    "Python in practice — machine learning, data work and automation, explained through real projects rather than toy examples.",
  "team-building":
    "Building teams people want to stay on — psychological safety, trust, and growing a team's skills without resorting to forced fun.",
  wordpress:
    "WordPress and WooCommerce in practice — building, extending and maintaining real sites, with the platform decisions you'll live with for years.",
  workflow:
    "The systems behind the work — how things actually get built, edited and shipped, and how to keep a process that doesn't collapse under pressure.",
};

/** Description for a section or topic archive, or undefined if none is set. */
export function taxDescription(slug: string): string | undefined {
  return TAX_DESCRIPTIONS[slug]?.trim() || undefined;
}

/**
 * Display name → URL slug. Matches the WordPress taxonomy slugs this blog
 * migrated from, so legacy inbound links keep resolving.
 *
 * `scripts/check-links.mjs` carries its own copy — it runs outside the Astro
 * build and can't import a .ts module. The two must stay character-identical.
 */
export function taxSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Archive URL for a category ("section") or tag ("topic") display name. */
export function taxUrl(kind: "section" | "topic", name: string): string {
  return `/${kind}/${taxSlug(name)}/`;
}
