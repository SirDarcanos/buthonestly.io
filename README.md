<div align="center">

<img src="public/favicon.webp" alt="" height="72" />

# BUT. Honestly

[![Live site](https://img.shields.io/badge/Live-buthonestly.io-1a1a1a?style=flat-square)](https://buthonestly.io)
[![Astro](https://img.shields.io/badge/Astro-7-bc52ee?style=flat-square&logo=astro&logoColor=white)](https://astro.build)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
![Node version](https://img.shields.io/badge/Node.js->=24-3c873a?style=flat-square&logo=nodedotjs&logoColor=white)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-f38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

Honest essays on leadership, programming, and the messy overlap between humans and tech.

[Overview](#overview) • [Getting started](#getting-started) • [Project structure](#project-structure) • [Writing an essay](#writing-an-essay) • [Tooling](#tooling) • [Automation](#automation) • [Deployment](#deployment)

</div>

## Overview

The front-end source of [buthonestly.io](https://buthonestly.io) — a static
[Astro](https://astro.build) site built from plain Markdown.

Essays live in `src/content/essays`, one folder per essay, holding the Markdown
and its images side by side. That folder is also an Obsidian vault, so the same
files are written in Obsidian and rendered by Astro: wikilinks, callouts and
image embeds are resolved at build time by custom remark and rehype plugins
rather than being pasted in as HTML. There is no CMS and no database — a new
essay is a commit.

**What the build gives you beyond the pages:**

- **Date-driven publishing.** A future `date` schedules an essay; an hourly
  Action rebuilds when one comes due. Drafts live outside the built collection.
- **Local-first images.** Covers and body images are committed, then optimized
  in place (16:9 covers, opaque sources to JPEG) and re-encoded to AVIF/WebP.
- **Audio narration.** Each essay can be narrated with Gemini TTS on Vertex AI
  and served from R2, with an in-page player.
- **Semantic related posts**, precomputed from sentence embeddings rather than
  tag overlap.
- **Feeds and machine-readable indexes** — a site feed plus one per section and
  per topic, `sitemap.xml` with real `lastmod` dates, `llms.txt`, and IndexNow
  submissions on publish.
- **Client-side search** via [Pagefind](https://pagefind.app), indexed after the
  build.
- **Generated redirects** for the legacy WordPress URLs — old post paths, feeds,
  paginated archives and downloads — so old links keep working.

## Getting started

Requires **Node 24** (see `.nvmrc`).

```bash
npm install
npm run dev
```

The dev server runs at http://localhost:4321. Scheduled essays render there so
they can be proofread before they land.

To check the production output:

```bash
npm run build
npm run preview
```

> [!NOTE]
> Search only works against a real build. Pagefind indexes `dist/` in a
> `postbuild` step, so in `astro dev` the search overlay reports that the index
> isn't available. Use `npm run preview` to try it.

> [!IMPORTANT]
> Astro does not hot-reload `astro.config.mjs`, and `.astro/` caches processed
> Markdown. After changing a remark or rehype plugin, run `rm -rf .astro` and
> restart the dev server, or you'll keep seeing the old output.

## Project structure

```
├─ src/
│  ├─ components/        # Astro components
│  ├─ content/           # Obsidian vault
│  │  ├─ essays/<slug>/  # one folder per essay: <slug>.md plus its images
│  │  ├─ drafts/         # work in progress, not a built collection
│  │  ├─ templates/      # Templater snippets for new essays, images, galleries
│  │  └─ Style Guide.md  # how the essays are meant to read
│  ├─ layouts/
│  ├─ lib/               # content helpers, SEO/schema, remark + rehype plugins
│  ├─ pages/             # routes, RSS feeds, llms.txt
│  ├─ styles/global.css
│  ├─ consts.ts          # site title, URL, description
│  └─ taxonomies.ts      # section and topic descriptions
├─ scripts/              # build and maintenance CLIs — see Tooling
├─ data/                 # generated but committed: related map, ledgers
├─ public/               # static assets, _headers, generated _redirects
└─ .github/workflows/    # publishing, newsletter, IndexNow, related posts
```

## Writing an essay

Create `src/content/essays/<slug>/<slug>.md` and drop the images beside it.

```yaml
---
title: What is a GPU and Why Does AI Need Them?
date: 2026-08-04T13:00:00
excerpt: GPUs are crucial for AI due to their ability to perform parallel calculations.
cover: gigabyte-gpu.jpg
coverAlt: The inside of a gaming PC lit in red and blue, with a graphics card above the motherboard.
categories:
  - Programming
tags:
  - AI
  - Performance
---
```

| Field                                     | Notes                                                              |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `title`                                   | Required.                                                          |
| `date`                                    | Publication date. In the future, the essay is scheduled.           |
| `updated`                                 | Feeds the sitemap's `lastmod`.                                     |
| `cover` / `coverAlt` / `coverCaption`     | Local path. **Covers must be 16:9**; alt text describes the image. |
| `excerpt`                                 | Used for the listings, meta description and feeds.                 |
| `categories` / `tags`                     | Sections and topics. At least one of each.                         |
| `sticky` / `cornerstone`                  | Editorial flags — featured on its section, weighted in SEO.        |
| `downloads`                               | Files served from R2, rendered as a download block.                |
| `audioVoice` / `audioStyle` / `audioPace` | Per-essay narration overrides.                                     |

`date`, `cover`, `coverAlt` and at least one category and tag are enforced by
the content schema once an essay is live or scheduled — a missing one fails the
build rather than shipping quietly.

Obsidian-flavoured Markdown that the plugins understand:

| Syntax                      | Renders as                                          |
| --------------------------- | --------------------------------------------------- |
| `[[other-essay]]`           | An internal link, checked by `npm run check:links`. |
| `![alt](img.jpg 'caption')` | A `<figure>` with caption, re-encoded to AVIF/WebP. |
| `> [!gallery] 2`            | A grid of the images inside the callout.            |
| `> [!screen-only]`          | Prose on the page, dropped from the narration.      |
| `> [!audio-only]`           | Read aloud, omitted from the page.                  |

Image paths are bare filenames, resolved against the essay's own folder, and
captions are **single-quoted** — the Unsplash and Pexels credit snippets you
paste in contain double quotes, and mixing them up stops the image parsing as an
image at all. `npm run check:links` catches that.

## Tooling

| Command                      | What it does                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run dev`                | Dev server on port 4321.                                                                               |
| `npm run build`              | Generates redirects, builds to `dist/`, then indexes it with Pagefind.                                 |
| `npm run lint`               | Prettier check plus link check.                                                                        |
| `npm run check:links`        | Verifies wikilinks, internal links and image references resolve.                                       |
| `npm run lint:essay`         | Advisory style-guide lint for a single essay.                                                          |
| `npm run images [-- <slug>]` | Resizes to 1376px, recompresses, converts opaque images to JPEG and rewrites the Markdown. Idempotent. |
| `npm run audio -- <slug>`    | Narrates an essay with Gemini TTS. Run it twice — see below.                                           |
| `npm run related`            | Rebuilds the semantic related-posts map.                                                               |
| `npm run indexnow`           | Submits changed essays to IndexNow.                                                                    |
| `npm run og`                 | Regenerates `public/og-default.png`.                                                                   |
| `npm run email-assets`       | Regenerates the newsletter's masthead and social icons.                                                |

A pre-commit hook (`.githooks/`, wired by `npm install`) optimizes staged essay
images, blocks the commit on a non-16:9 cover, and formats staged code.

> [!TIP]
> `npm run audio` runs twice and **the first run costs nothing**. It writes
> `<slug>.audio.txt`, the narration script — the essay reduced to what will
> actually be spoken. Read it, fix anything that should sound different, then
> re-run to synthesize from that file. `npm run audio -- <slug> --commit`
> uploads the result to R2; it never re-synthesizes.

## Automation

| Workflow                | Runs                       | Does                                                              |
| ----------------------- | -------------------------- | ----------------------------------------------------------------- |
| `scheduled-rebuild.yml` | Hourly                     | Rebuilds only when a scheduled essay is due but still 404.        |
| `related.yml`           | On essay push, daily       | Regenerates and commits the related-posts map.                    |
| `newsletter.yml`        | On essay push, daily 13:30 | Emails subscribers once per essay, tracked by a committed ledger. |
| `indexnow.yml`          | On essay push, daily 13:45 | Submits new URLs to Bing, Yandex, Seznam and Naver.               |
| `lint-essays.yml`       | On essay push              | Advisory style lint. Never blocks — style is the author's call.   |

The daily crons exist because a date passing is not a push: they are what makes
a scheduled essay go live, get emailed and get crawled without anyone touching
the repo.

## Deployment

Cloudflare Pages builds `dist/` from `main`. Rebuilds that aren't triggered by a
push — a scheduled essay coming due — go through a Pages deploy hook, held as
the `CF_DEPLOY_HOOK_URL` repository secret. Two R2 buckets are served directly
over custom domains: `downloads.buthonestly.io` for essay downloads and
`static.buthonestly.io` for audio narrations. See [DOWNLOADS.md](DOWNLOADS.md)
for how to add a file.

> [!IMPORTANT]
> `wrangler.toml` is git-ignored so the bucket names stay out of the public
> repo. Deploying from a clone means recreating it, or setting the same R2
> bindings in the Cloudflare dashboard.

Environment variables (see `.env.example`):

| Variable                         | Used for                                        |
| -------------------------------- | ----------------------------------------------- |
| `FATHOM_SITE_ID`                 | Analytics, production builds only.              |
| `GOOGLE_APPLICATION_CREDENTIALS` | Vertex AI service-account JSON, for narrations. |
| `VERTEX_REGION` / `VERTEX_MODEL` | Optional TTS overrides.                         |
