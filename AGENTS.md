# Development

When starting the dev server, use background mode:

```bash
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Node 24 (LTS) everywhere: `.nvmrc`, `engines`, and the GitHub workflows.
Astro does not hot-reload `astro.config.mjs` — restart the dev server after
changing it (including the markdown remark/rehype plugins).

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
- Covers: `cover: ./file.jpg` in frontmatter. `originalCover` holds a
  not-yet-migrated WordPress CDN URL; a local `cover` wins over it. Rendered
  by `Picture.astro` as AVIF → WebP → JPEG.
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
