import { getAllPosts, getCategories, getTags } from "../lib/essays";
import { SITE_TITLE, SITE_URL } from "../consts.ts";
import { taxDescription } from "../taxonomies.ts";
import { type Post, type Tax } from "../types.ts";

const abs = (path: string) => `${SITE_URL}${path}`;
const markdownPath = (path: string) => `${path.replace(/\/$/, "")}.md`;

const link = (name: string, path: string, description?: string) =>
  description
    ? `- [${name}](${abs(path)}): ${description}`
    : `- [${name}](${abs(path)})`;

const essayLine = (post: Post) =>
  link(
    post.title,
    markdownPath(post.url),
    [post.date.slice(0, 10), post.excerpt].filter(Boolean).join(" — "),
  );

const taxLine = (kind: "section" | "topic", term: Tax) =>
  link(
    term.name,
    `/${kind}/${term.slug}/`,
    [
      `${term.count} ${term.count === 1 ? "essay" : "essays"}`,
      taxDescription(term.slug),
    ]
      .filter(Boolean)
      .join(". "),
  );

const PAGES = [
  ["About", "/about/", "Who writes this and why."],
  [
    "Resources & Assets",
    "/resources/",
    "Free templates, notebooks, datasets and tools. No email gates, no paywalls.",
  ],
  [
    "Free AI Voice Generator",
    "/resources/free-ai-voice-generator/",
    "Browser-based text-to-speech powered by Kokoro. Nothing typed is sent to a server.",
  ],
  [
    "How BUT. Honestly Uses AI",
    "/artificial-intelligence-tools/",
    "The site's AI disclosure: assistant and editor, never the author.",
  ],
];

const OPTIONAL = [
  ["Privacy Policy", "/privacy/"],
  ["Terms & Conditions", "/terms-conditions/"],
];

export async function GET() {
  const [posts, sections, topics] = await Promise.all([
    getAllPosts(),
    getCategories(),
    getTags(),
  ]);

  const body = [
    `# ${SITE_TITLE}`,
    "",
    "> Honest writing by Nicola Mustone on the messy overlap between humans and tech — leadership, programming, the web, and what our tools are quietly doing to how we work and think.",
    "",
    "Long-form essays, published newest first. Sections are the four broad areas the writing falls into; topics are finer-grained and cut across them, so an essay is filed under one or more of each.",
    "",
    "Essays and authored editorial pages use portable Markdown alternatives. Archives and feeds remain HTML or XML. Every archive page has an RSS feed at its own URL plus `feed.xml` — for example https://buthonestly.io/topic/team-building/feed.xml.",
    "",
    "## Essays",
    "",
    ...posts.map(essayLine),
    "",
    "## Sections",
    "",
    ...sections.map((section) => taxLine("section", section)),
    "",
    "## Topics",
    "",
    ...topics.map((topic) => taxLine("topic", topic)),
    "",
    "## Pages",
    "",
    ...PAGES.map(([name, path, description]) =>
      link(name, markdownPath(path), description),
    ),
    link("Essays", "/essays/", "The full archive, newest first, paginated."),
    link("Sections", "/section/", "Index of the four sections."),
    link("Topics", "/topic/", "Index of every topic."),
    "",
    "## Feeds",
    "",
    link("All essays", "/feed.xml", "Every essay, newest first."),
    "",
    "## Optional",
    "",
    ...OPTIONAL.map(([name, path]) => link(name, markdownPath(path))),
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
