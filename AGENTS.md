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

- `npm run images [-- <slug>]` — optimize essay source images in place:
  resize to max 1376px, recompress, convert opaque images to JPEG (updating
  Markdown references). Non-16:9 images are flagged and skipped. Idempotent
  via `data/images-optimized.json`.
- `npm run audio -- <slug>` — synthesize an essay narration (Gemini TTS on
  Vertex AI) into a git-ignored MP3 beside the essay and insert an Obsidian
  `![[<slug>.mp3]]` embed (plays in the vault; the site renders it as the
  audio player). Listen first, then `npm run audio -- <slug> --commit`
  uploads that MP3 to the STATIC R2 bucket — commit only uploads, it never
  re-synthesizes. Env in `.env`: `GOOGLE_APPLICATION_CREDENTIALS` (Vertex
  service-account JSON path), optional `VERTEX_REGION` / `VERTEX_MODEL`.
  Per-essay overrides via flat `audioVoice` / `audioStyle` / `audioPace`
  frontmatter (flat, not a nested `audio:` map — Obsidian's Properties editor
  can't edit nested objects).
- `npm run related` — rebuild the semantic related-posts map (normally left
  to the `related.yml` Action).
- `npm run indexnow` — submit changed essays to IndexNow so Bing, Yandex,
  Seznam and Naver recrawl within hours. Google does not participate; it
  still discovers via the sitemap. Normally left to the `indexnow.yml`
  Action (push + daily cron). `DRY_RUN=true` lists what would go without
  submitting; `MODE=seed` records current state without submitting. The key
  is NOT a secret — the protocol requires it to be publicly fetchable — so
  it lives at `public/<key>.txt` and the script reads it from there. A
  committed ledger (`data/indexnow-pinged.json`) maps slug → content hash so
  unchanged URLs are never resubmitted; resubmitting is what gets a host
  throttled.
- Two Kit email files, for two different editors:
  `scripts/kit-newsletter-template.html` is a full HTML document for
  Account → Email templates, which wraps broadcasts.
  `scripts/kit-confirmation-email.html` is a fragment for the form's
  confirmation email — that editor sanitises HTML into blocks, so a full
  document leaks its comments and `<style>` into the body as visible text.
  Never paste the template into the confirmation editor.
- `npm run email-assets` — regenerate `public/email/*.png`, the masthead logo
  and social icons for the Kit newsletter. PNG because Gmail strips inline SVG
  and Outlook won't render it. Run by hand after a logo or brand-colour change;
  committed output.
- `npm run og` — regenerate `public/og-default.png`, the Open Graph card for
  pages with no cover of their own (home, archives, about, resources).
  Composed from the logo's vector paths and flat brand colour, so it needs
  no fonts installed. Run it by hand after a logo or brand-colour change;
  the output is committed rather than built, to keep a binary out of every
  build's diff.
- A pre-commit hook (`.githooks/`, wired by the `prepare` script) optimizes
  staged essay images — blocking the commit on non-16:9 — and formats staged
  code. Prettier deliberately ignores `data/` (generated) and `src/content`
  (authored prose and Templater files); don't format those.

## Images

Essay images are local-first and committed to git — they are build inputs
that Astro re-encodes to AVIF/WebP for the site. Audio MP3s are the
opposite: git-ignored, uploaded to R2.

- **Covers must be 16:9**; ~1376px wide is the target (2× the reading column).
  `npm run images` (and the pre-commit hook) enforce that and block the commit
  on a non-16:9 cover — resizing by width never crops, so a wrong ratio would
  ship distorted.
- **Body images can be any shape** — a wide dataset strip or a tall diagram is
  fine. Only width matters: anything over 1376px is resized down, and anything
  narrower than the 688px reading column gets a non-blocking note.
- **Opaque images are converted to JPEG** — PNG, WebP, AVIF, TIFF, BMP, at any
  size — and the Markdown/frontmatter references are rewritten to match. Only
  transparency keeps a file as PNG (JPEG has no alpha). Animated sources are
  skipped rather than flattened. GIFs and SVGs are exempt entirely — the
  optimizer ignores them and they need not be 16:9.
- Covers: `cover: ./file.jpg` in frontmatter, required once an essay is live.
  Rendered by `Picture.astro` as AVIF → WebP → JPEG.
- Captions are HTML. Unsplash and Pexels each give you a credit snippet to
  copy — photographer and photo linked, `utm_` params included — so paste it
  verbatim. In a body caption the Markdown title must be SINGLE-quoted, since
  the snippet contains double quotes: get it wrong and the image stops parsing
  as an image at all. `npm run check:links` catches that.
- Body images: plain Markdown `![alt](./file.jpg "caption")` — the quoted
  title becomes a `<figcaption>`, rehype emits AVIF, and `image.layout`
  makes it responsive. Never hand-write `<picture>` or `<img>` in content
  for local images.
- Animated GIFs: reference them the same way (`![alt](./file.gif)`).
  `rehype-image-format.mjs` skips the AVIF tag for GIFs (AVIF is single-frame),
  so Astro emits a responsive **animated WebP** and animation is preserved.
  SVGs are likewise served as-is.
- `coverAlt` must describe what is actually in the image, not repeat the
  essay title or SEO copy.

## Content

- The site has no comments — never add "share in the comments" CTAs.
- Publishing is date-driven (a future `date` schedules the essay); WIP lives
  in `src/content/drafts/`, which is not a built collection.

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
