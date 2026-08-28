# Development

When starting the dev server, use background mode:

```bash
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Node 24 (LTS) everywhere: `.nvmrc`, `engines`, and the GitHub workflows.
Astro does not hot-reload `astro.config.mjs` — restart the dev server after
changing it (including the markdown remark/rehype plugins).

A restart is not always enough. Astro caches processed Markdown in `.astro/`,
and that cache survives one — so a change to a remark/rehype plugin keeps
rendering the old output. `rm -rf .astro` before restarting.

`astro dev stop` only stops the instance it tracks. Start a few and the old
ones keep running on 4322, 4323… and serve stale or erroring content while
you debug the wrong port. Check with
`lsof -iTCP -sTCP:LISTEN -P -n | grep 432`; clear with
`pkill -f "astro.mjs dev"`.

## Git

Commit as work lands, but **do not push automatically**. Push only when the
maintainer explicitly asks, or when wrapping up a session — local commits
accumulate and go out as a batch. Do not push on every change.

## Tooling

- `npm run images [-- <slug>]` — manually optimize essay source images in
  place: resize oversized files to max 1376px, recompress them, and convert
  opaque images to JPEG. A conversion prints both paths; update authored MDX
  references yourself. Invalid cover proportions block the command.
- `npm run related` — rebuild the semantic related-essays map (normally left
  to the `related.yml` Action).
- `npm run links` — print advisory analysis of the editorial internal-link
  graph. Counts only links written into prose: summaries, related essays,
  taxonomy links, and the footer are excluded. Reports orphans, dead ends,
  cluster density, and cornerstone reach, with scheduled essays counted
  separately. Pass `-- --json <path>` to write local JSON analysis explicitly;
  no graph artifact is tracked or written by default.
- `npm run publication` — run deployment verification, resumable Kit delivery,
  and IndexNow follow-up. Normally left to `publication.yml`, which runs hourly,
  on essay changes, and by manual dispatch. It can call live providers: use
  manual dispatch for recovery rather than running it casually. The IndexNow key
  is public by protocol and lives at `public/<key>.txt`. Durable per-essay Kit
  broadcast identities, delivery status, and IndexNow hashes share
  `data/publication-state.json`; durably checkpointed actions are never repeated.
  An accepted IndexNow request can be retried when its checkpoint fails.
- `scripts/kit-newsletter-template.html` is the maintained full HTML document
  for Account → Email templates, which wraps publication broadcasts.
- The committed newsletter PNGs and `public/og-default.png` are permanent
  branding assets. Their one-off generators are intentionally not part of this
  repository.
- Prettier deliberately ignores `data/` (generated) and `src/content`
  (authored prose); don't format those.

## Images

Essay images are local-first and committed to git — they are build inputs
that Astro re-encodes to AVIF/WebP for the site. Audio MP3s are the
opposite: git-ignored, uploaded to R2.

- **Covers must be 16:9**; ~1376px wide is the target (2× the reading column).
  `npm run images` enforces that and blocks on a non-16:9 cover — resizing by
  width never crops, so a wrong ratio would ship distorted.
- **Body images can be any shape** — a wide dataset strip or a tall diagram is
  fine. Only width matters: anything over 1376px is resized down, and anything
  narrower than the 688px reading column gets a non-blocking note.
- **Opaque images are converted to JPEG** — PNG, WebP, AVIF, TIFF, BMP, at any
  size. The command prints renamed paths so you can update MDX/frontmatter
  references yourself. Only transparency keeps a file as PNG (JPEG has no
  alpha). Animated sources are skipped rather than flattened. GIFs and SVGs are
  exempt entirely — the
  optimizer ignores them and they need not be 16:9.
- Covers: `cover: ./file.jpg` in frontmatter, required for every essay.
  Rendered by `Picture.astro` as AVIF → WebP → JPEG.
- Body images use imported image metadata and `Figure`. Externally licensed
  photography keeps its linked credit in the caption children; original media
  may omit the caption. Never hand-write `<picture>` or `<img>` in essays.
- Group figures with `Gallery`, using two, three, or four columns. Source order
  remains reading order on narrow screens.
- `coverAlt` must describe what is actually in the image, not repeat the
  essay title or SEO copy.

## Content

- Who the site is for and why it exists: `.agents/product-marketing.md`. Voice
  lives in `src/content/drafts/Style Guide.md` and only there — the marketing
  doc points at it rather than repeating it.
- The site has no comments — never add "share in the comments" CTAs.
- `excerpt` is the meta description, hard-truncated at 160 characters by
  `toPost()`, and it also renders as the lead paragraph above the essay. So it
  must not repeat or reword the opening line — a reader would meet that sentence
  twice. Aim for 130–160 characters. The Style Guide covers what makes a good
  one.
- `updated` renders a visible "Last updated" line at the foot of the essay, but
  only when it is later than `date`. Leave it blank on first publish, and don't
  bump it for mechanical edits like an image path rewrite — a modified date that
  tracks no content change misleads readers and is a poor freshness signal.
- **Never link a live essay to a scheduled one.** A future-dated essay is
  withheld from the production build, so the link 404s the moment you push. The
  dev server builds both, which is why this looks fine locally; `check:links`
  catches it.
- `cornerstone: true` marks an evergreen hub other essays link to. `npm run
links` reports how many essays in each cluster reach theirs. Only durable
  pieces qualify — a cornerstone accumulates links for years, so pointing one at
  something destined for a rewrite wastes the accumulation.
- Three local skills live in `.claude/skills/`, all gitignored like the Style
  Guide, and none of them edit or publish anything on their own:
  `buthonestly-draft-essay` decides whether an idea is worth writing and then
  drafts it, `buthonestly-essay-checkup` diagnoses one existing essay against all of
  the above, and `buthonestly-share-essay` writes the LinkedIn, Bluesky and
  Mastodon posts for one, new or resurfaced.
- Tag every shared link — `?utm_source=linkedin`, `?utm_source=bluesky`,
  `?utm_source=mastodon`. Mastodon clients and the Bluesky app strip the
  referrer, so an untagged visit is indistinguishable from a bookmark in Fathom.
  `utm_source` alone is enough; `utm_medium=social` adds nothing and costs 18
  characters against Bluesky's 300-character limit. The newsletter has clean
  numbers only because Kit tags it.
- **`date` and `updated` are calendar dates.** Author them only as `YYYY-MM-DD`;
  timestamps are invalid. The essay inventory resolves every publication day
  to 13:00 UTC through `src/lib/publish-time.mjs`.
- `newsletterIntro` is required plain text. Use one to three paragraphs with
  enough context for the publication email; it is not rendered as MDX.
- Publishing is date-driven (a future publication day schedules the essay); WIP lives
  in `src/content/drafts/`, which is not a built collection. A scheduled essay
  still renders on the dev server, so it can be proofread before it lands.
- Essays are MDX. Prose, headings, lists, code, and links stay standard Markdown;
  use `Figure`, `Gallery`, `QuickSummary`, `Callout`, and `Blockquote` only for
  their named semantics. Internal links are ordinary root-relative Markdown
  links. Narration playback comes only from the optional `audio` filename.

## Code style

Code documents itself. Say it in a name, not a comment.

**Do not comment.** The default is zero. Before writing one, rename the thing or
extract a function instead — that is almost always the better fix. A comment is
justified only when the reason for the code cannot live in the code:

- An external constraint or gotcha: a platform limit, an API quirk, a spec
  requirement, a bug being worked around.
- A non-obvious _why_ behind a deliberate choice, where the obvious alternative
  looks correct and isn't.

That's it. Never write a comment that:

- restates what the next line does
- narrates steps (`// 1. Fetch`, `// ── Build the list ──`)
- explains a language or framework feature
- justifies a decision at length — one sentence, or move it to the commit message

Keep them to a line or two. Long rationale belongs in the commit message, where
it's attached to the change rather than rotting in the file.

JSDoc only where a signature genuinely isn't self-evident — a non-obvious return
shape, or a parameter whose meaning the type doesn't convey. Not on every export.

Prefer clarity over cleverness: descriptive names, small functions, early
returns. Match the surrounding file's conventions over any general preference.

## Styling

Style with Tailwind utility classes directly in the markup. Do not add scoped
`<style>` blocks or hand-written CSS for anything a utility can express — that
is the whole point of having Tailwind.

- Reach for a `<style>` block (or `global.css`) only for what utilities genuinely
  can't do: JS-set state that must map to classes (toggle the class in JS
  instead), keyframes, or complex selectors. Prefer a utility every time there
  is one.
- To use `@apply` (or `theme()`) inside a component/scoped `<style>`, add
  `@reference "../styles/global.css";` (or `@reference "tailwindcss";`) at the
  top of that block so Tailwind v4 has the theme context. Without it, `@apply`
  there won't resolve the project's utilities.
- Toggle visibility by adding/removing the `hidden` utility in JS, not with
  bespoke `display` CSS.

## Documentation

Full documentation: [https://docs.astro.build]

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
