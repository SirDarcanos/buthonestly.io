// Rendered beside the archive <h1> and used as its meta description. Keep under
// ~160 characters, and describe what a term covers rather than what's currently
// filed under it — an inventory goes stale on the next essay.

export const TAX_DESCRIPTIONS: Record<string, string> = {
  leadership:
    "Essays on leading people honestly — feedback, trust, difficult conversations, and the judgment calls no management book prepares you for.",
  programming:
    "Practical programming essays — code that ships, tools worth your time, and the tradeoffs behind the decisions. PHP, Python, JavaScript, and whatever fits.",
  web: "Building for the web, honestly — WordPress, WooCommerce, Next.js, performance and platform choices, from someone who does this for a living.",
  observations:
    "Essays on technology and modern life — attention, AI, and what our tools are quietly doing to how we work and think. Questions over hot takes.",

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

export function taxDescription(slug: string): string | undefined {
  return TAX_DESCRIPTIONS[slug]?.trim() || undefined;
}

// check-links.mjs carries a copy of this — it runs outside the Astro build and
// can't import a .ts module. The two must stay character-identical.
export function taxSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function taxUrl(kind: "section" | "topic", name: string): string {
  return `/${kind}/${taxSlug(name)}/`;
}
