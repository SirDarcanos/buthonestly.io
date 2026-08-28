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
[Astro](https://astro.build) site built from MDX.

Essays live in `src/content/essays`, one folder per essay, holding an MDX source
and its images side by side. Ordinary prose uses standard Markdown; figures,
galleries, summaries, callouts, and attributed quotations use a small set of
Astro components. There is no CMS and no database — a new essay is a commit.

**What the build gives you beyond the pages:**

- **Date-driven publishing.** A future `date` schedules an essay; an hourly
  Action deploys a missing or stale public version, waits for its content hash,
  then independently notifies IndexNow and delivers its Kit broadcast. Drafts
  live outside the built collection.
- **Local-first images.** Covers and body images are committed, then optimized
  in place (16:9 covers, opaque sources to JPEG) and re-encoded to AVIF/WebP.
- **Audio narration.** An optional audio filename adds an in-page player for a
  narration hosted on the fixed media domain.
- **Semantic related posts**, precomputed from sentence embeddings rather than
  tag overlap.
- **Feeds and machine-readable indexes** — a site feed plus one per section and
  per topic, `sitemap.xml` with real `lastmod` dates, `llms.txt`, portable
  Markdown alternatives, and IndexNow submissions on publish.
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

Run the automated test suite before opening a pull request:

```bash
npm test
```

The command exits nonzero when a test fails. Its fixtures deliberately prove
that formatting, content correctness, and production-build failures are all
detected.

To check the production output:

```bash
npm run build
npm run preview
```

> [!NOTE]
> The `postbuild` step projects marked editorial regions into portable Markdown
> alternatives. Use `npm run build` before checking the `.md` links advertised
> in `dist/llms.txt`.

> [!IMPORTANT]
> Astro does not hot-reload `astro.config.mjs`, and `.astro/` caches processed
> Markdown. After changing a remark or rehype plugin, run `rm -rf .astro` and
> restart the dev server, or you'll keep seeing the old output.

## Project structure

```
├─ src/
│  ├─ components/        # Astro components
│  ├─ content/
│  │  ├─ essays/<slug>/  # one folder per essay: <slug>.mdx plus its images
│  │  ├─ drafts/         # work in progress, not a built collection
│  │  ├─ templates/      # Templater snippets for new essays, images, galleries
│  │  └─ Style Guide.md  # how the essays are meant to read
│  ├─ layouts/
│  ├─ lib/               # content inventory, SEO/schema, and rendering helpers
│  ├─ pages/             # routes, RSS feeds, llms.txt
│  ├─ styles/global.css
│  ├─ consts.ts          # site title, URL, description
│  └─ taxonomies.ts      # section and topic descriptions
├─ scripts/              # build and maintenance CLIs — see Tooling
├─ data/                 # generated but committed: semantic and publication state
├─ public/               # static assets, _headers, generated _redirects
└─ .github/workflows/    # correctness, publication, and related essays
```

## Writing an essay

Create `src/content/essays/<slug>/<slug>.mdx` and drop the images beside it.

```yaml
---
title: What is a GPU and Why Does AI Need Them?
date: 2026-08-04
excerpt: GPUs are crucial for AI due to their ability to perform parallel calculations.
newsletterIntro: |-
  GPUs do more than draw games. This essay explains why their parallel design
  became essential to modern AI.
cover: ./gigabyte-gpu.jpg
coverAlt: The inside of a gaming PC lit in red and blue, with a graphics card above the motherboard.
categories:
  - Programming
tags:
  - AI
  - Performance
audio: what-is-a-gpu.mp3
---
```

| Field                                 | Notes                                                              |
| ------------------------------------- | ------------------------------------------------------------------ |
| `title`                               | Required.                                                          |
| `date`                                | Required `YYYY-MM-DD`; every essay publishes at 13:00 UTC.         |
| `updated`                             | Optional `YYYY-MM-DD`; feeds the sitemap's `lastmod`.              |
| `cover` / `coverAlt` / `coverCaption` | Local path. **Covers must be 16:9**; alt text describes the image. |
| `excerpt`                             | Used for listings, metadata, feeds, and the on-page lead.          |
| `newsletterIntro`                     | Required plain-text email introduction.                            |
| `categories` / `tags`                 | Sections and topics. At least one of each.                         |
| `sticky` / `cornerstone`              | Editorial flags — featured on its section, weighted in SEO.        |
| `downloads`                           | Files served from R2, rendered as a download block.                |
| `audio`                               | Optional filename served from `static.buthonestly.io/audio/`.      |

Use standard Markdown links, including root-relative links to other essays.
Import `Figure`, `Gallery`, `QuickSummary`, `Callout`, and `Blockquote` from
`src/components/content` only when their extra semantics are needed.

## Tooling

| Command                      | What it does                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                | Dev server on port 4321.                                                                                      |
| `npm test`                   | Runs the automated test suite, including deliberate CI-stage failure fixtures.                                |
| `npm run build`              | Generates redirects, builds to `dist/`, then projects editorial Markdown alternatives.                        |
| `npm run lint`               | Prettier check plus link check.                                                                               |
| `npm run check:links`        | Verifies canonical internal links, publication safety, and local assets.                                      |
| `npm run links`              | Prints advisory prose-link analysis; pass `-- --json <path>` for local JSON.                                  |
| `npm run lint:essay`         | Advisory style-guide lint for a single essay.                                                                 |
| `npm run images [-- <slug>]` | Manually resizes and compresses oversized sources and converts opaque images to JPEG, printing renamed paths. |
| `npm run related`            | Rebuilds the semantic related-posts map.                                                                      |
| `npm run publication`        | Verifies live content, deploys stale versions, resumes Kit delivery, and submits changed content to IndexNow. |
| `npm run og`                 | Regenerates `public/og-default.png`.                                                                          |
| `npm run email-assets`       | Regenerates the newsletter's masthead and social icons.                                                       |

## Automation

| Workflow          | Runs                         | Does                                                                                     |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `ci.yml`          | Pull requests, main pushes   | Tests failure detection, formatting, content, and production build.                      |
| `publication.yml` | Hourly, essay pushes, manual | Deploys expected versions, resumes Kit broadcasts, and submits changed URLs to IndexNow. |
| `related.yml`     | Essay pushes, manual         | Regenerates and commits the semantic related-essay map.                                  |
| `lint-essays.yml` | Essay pushes                 | Advisory style lint. Never blocks — style is the author's call.                          |

Scheduled runs matter because a date passing is not a push. The publication
orchestrator makes an essay live within the hourly window. It records a Kit draft
identity before delivery, waits until at least 13:15 UTC, and preserves Kit and
IndexNow successes independently.

## Deployment

Cloudflare Pages builds `dist/` from `main`. The publication orchestrator reads
each pending essay's `data-content-version`, requests the Pages deploy hook when
the expected hash is missing or stale, and waits for that exact version before
IndexNow follow-up. The hook is held as the `CF_DEPLOY_HOOK_URL` repository
secret. Two R2 buckets are served directly over custom domains:
`downloads.buthonestly.io` for essay downloads and
`static.buthonestly.io` for audio narrations. See [DOWNLOADS.md](DOWNLOADS.md)
for how to add a file.

Successful IndexNow hashes and Kit broadcast identities are committed to
`data/publication-state.json`. Kit keeps ownership of forms, contacts, consent,
broadcasts, and unsubscribes. The workflow requires `KIT_API_KEY`; the optional
`KIT_EMAIL_TEMPLATE_ID` repository variable pins the maintained account template.
A failed provider action remains pending while an independent success is
preserved; rerun `publication.yml` manually to recover without repeating
completed work.

> [!IMPORTANT]
> `wrangler.toml` is git-ignored so the bucket names stay out of the public
> repo. Deploying from a clone means recreating it, or setting the same R2
> bindings in the Cloudflare dashboard.

Environment variables (see `.env.example`):

| Variable         | Used for                                         |
| ---------------- | ------------------------------------------------ |
| `FATHOM_SITE_ID` | Analytics, `main`-branch production builds only. |

The Fathom script is skipped when `CF_PAGES_BRANCH` is set to anything but
`main`, so preview deploys never pollute the stats even if the variable is set
for the Preview environment. To keep your own visits out, run
`fathom.blockTrackingForMe()` once in the browser console on the live site —
it persists in local storage (`enableTrackingForMe()` reverses it).
