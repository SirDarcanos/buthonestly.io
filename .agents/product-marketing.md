# Marketing Context — BUT. Honestly

**Document version:** v2
**Last updated:** 2026-08-13

> Context for skills that write or plan content for buthonestly.io. This is a personal
> essay site, not a product: there is nothing to sell, no buying committee, and no sales
> conversation. Sections that only make sense for a product have been removed rather than
> filled in with plausible fiction.
>
> **Voice is not defined here.** `src/content/drafts/Style Guide.md` is the single source of
> truth for voice, and duplicating it would guarantee the two drift apart. Read it directly.

## What the site is

**One-liner:** Honest, long-form essays on leadership, code, and the overlap between humans and tech.

**The line that leads: "Clarity without the comfort."** Everything else — including the meta description about "the messy overlap between humans and tech" — is descriptive. That one is the promise.

### What the name means

The essays are honest. No clickbait, no engineered curiosity gaps, no headline the piece doesn't pay off. The truth as it is, however uncomfortable, embarrassing or controversial it is — for the author or for the reader.

**This is the site's hardest constraint, and it binds titles and excerpts especially.** A title may be clearer, more specific, or better matched to how someone would actually search. It may not be baited. The test is whether the essay delivers exactly what the title promised: sharpening a title toward accuracy is fine, sharpening it toward a click is not.

It is also why the writing includes the parts that don't flatter him — killed traffic, the disavow-tool mistake, leading with ADHD. Vulnerability isn't a stylistic device here; it's what the name commits to.

**What it does:** 1–4 essays a month across four sections. Each pairs a personal story with a usable framework, written from having done the thing rather than from teaching it. Free tools and templates sit alongside the writing.

**What it is not:** not a publication, not a newsletter-first product, not content marketing for anything, not a business. No ads, no sponsorships, no paywall, no email-gated downloads, no comments. **No monetisation, and that is very likely permanent** — there are no plans to change it, so don't propose tactics that assume revenue is coming.

**On the free tools.** More may appear, but they are not an objective. A tool here is a byproduct: it gets built because a real need turned up somewhere else in the author's life, and the essay follows. `opendice` and `shotlist` both arrived that way. So the fact that `/resources/free-ai-voice-generator/` out-clicks every essay is worth knowing and is **not** a strategy signal — "build more tools, they perform better" inverts the actual causality.

**Stack:** Astro on Cloudflare Pages, static, no accounts.

## Why it exists

Three goals, in the author's own priority:

1. **Thinking in public.** The writing is the point. Working an idea out properly — in public, where it has to hold up — is what forces the rigour.
2. **Professional signal.** A body of work that shows how he thinks, for the people who find him through it.
3. **Building an audience.** Real, but downstream of the first two. Readership grows because the writing is worth reading, not because it was optimised to.

**What follows from that order:** the writing is never bent to serve reach. An essay that would rank better as a listicle stays an essay. Growth tactics that cost honesty are off the table — that is the whole premise of the name.

## Who it's for

**The reader in mind:** practitioners — people leading small technical teams or building for the web who want the honest version with the tradeoffs included — and more broadly, anyone tech-adjacent who wants a considered take rather than a hot one.

**Assumed level:** you have shipped something. Not expert-only, but not a first-timer's guide either. Exception: the older WooCommerce tutorials are genuinely beginner-level, which is a legacy of when they were written, not a change in target.

**Who arrives instead.** Search overwhelmingly finds the 2015–2018 WooCommerce archive: `woocommerce_min_password_strength` (position 7.0), `woocommerce attributes and variations` (14.5), plus software-licensing queries (9–12).

**This is a known and accepted divergence, not a problem to solve.** That archive is a **legacy tail**: keep it correct, don't build on it, don't let it define the site. Do not treat WooCommerce search demand as a signal about what to write next.

## What readers get here that they don't elsewhere

- **First-person and specific.** Real incidents, named colleagues, admitted mistakes — killed traffic, the disavow-tool episode, leading with ADHD.
- **The tradeoff is always named.** Every essay says what the idea costs, not only what it gives.
- **Nothing is being sold**, so no recommendation carries a conflict.
- **Code is dated.** Snippets carry `@tested-up-to`, and get revised when they rot.
- **AI use is disclosed** on every essay, linking to `/artificial-intelligence-tools/`.

Not framed as competition. Hosting-company blogs and big WordPress publications out-rank the site by orders of magnitude on head terms, and that is fine — measured proof: `10-types-of-websites` has held position 24–30 for six months on "types of websites", 4,223 impressions, 1 click. **Head terms are not winnable and not worth chasing.** Value comes from specificity and honesty, not reach.

## Language

**How readers actually search** (verbatim, Search Console):
`woocommerce_min_password_strength` · `woocommerce attributes and variations` · `woocommerce product attribute url` · `which license` · `best license for personal projects` · `types of websites to build`

**Brand-aware queries already appearing:** "but honestly", "the automation of joy essay", "team building essay". Tiny numbers, but people are searching for essays by name — the clearest early sign the writing itself is landing.

**Use:** honest, tradeoff, what it cost, what I learned, worth your time.

**Avoid:**
- **"AI slop"** — grating, including when referring to the essay of that name. Name it as a title, never as a descriptor.
- "You should…" framing, buzzwords, corporate jargon, hype, exclamation marks.
- "Share in the comments" — there are no comments.
- Any CTA after an essay's closing line.

**Glossary:**

| Term | Meaning |
|---|---|
| Section | The four categories: Leadership, Programming, Web, Observations. Exactly one per essay. |
| Topic | The tags. 14 in use. |
| Cornerstone | An evergreen hub essay others link to. Six named. |
| Evergreen / decaying / trend-pinned | Durability tiers applied when drafting. |
| Legacy tail | The 2015–2018 WooCommerce archive: maintained, not extended. |

## Where things stand

**Measured 28 days to 2026-08-13:** 49 essays, 27 clicks, 4,851 impressions.

**Treat these numbers as provisional.** The site moved to Astro on 2026-07-17 and **70% of impressions still land on pre-migration URLs**. Google has not finished consolidating the 301s. First honest baseline is around October 2026.

**Best-performing page:** `/resources/free-ai-voice-generator/` — 11 of 27 clicks (41%) at position 19.6. A free tool out-clicks all 49 essays. Record it, don't act on it: see *On the free tools* above.

**Strongest positions:** `distilroberta-emotion-analysis` (6.4), `delete-expired-coupons` (10.5), `woocommerce-password-strength-meter` (10.9), `make-product-attributes-linkable` (11.5), `woocommerce-attributes-vs-variations` (13.6).

**Only external credibility marker on file:** a 2016 backlink from WordPress.org via Mike Jolley, WooCommerce's creator. No testimonials.

**Conversion action:** newsletter signup via Kit — "New essays and the occasional tool, 1–4 times a month. No spam, and you can unsubscribe anytime." Subscriber count not recorded here.

## Deliberately not in this document

| Section | Why |
|---|---|
| Personas | Single author, no buying committee, no sale. |
| Competitive landscape | The site does not compete for reach; framing hosting blogs as rivals misreads the intent. |
| Objections | Nothing is sold, so there is no sales objection to handle. |
| Switching dynamics | The four-forces frame describes product switching, not reading. |
| Brand voice | Owned by `src/content/drafts/Style Guide.md`. Restating it here would create a second source of truth. |

## Open questions

None outstanding. The four from v2 — what the name means, which line leads, what the tools are for, and whether monetisation is coming — were answered by the author and are now recorded above.

Worth revisiting around **October 2026**, when URL consolidation finishes and the traffic numbers become a real baseline rather than a migration artefact.

## Changelog

*Newest first. One line per revision: what changed and why.*

- v3 (2026-08-13) — Answered the four open questions from the author. Added *What the name means* — no clickbait, the truth however uncomfortable — and made it binding on titles and excerpts, which is the constraint most likely to be violated by SEO advice. Named "Clarity without the comfort" as the line that leads. Recorded that free tools are byproducts rather than a strategy, so the AI voice generator's click share is not a signal to build more. Recorded no monetisation as very likely permanent.
- v2 (2026-08-13) — Reshaped for a personal site after author review: removed Personas, Competitive Landscape, Objections and Switching Dynamics as product-only fiction; delegated voice to the Style Guide instead of duplicating it; recorded purpose (thinking in public, professional signal, audience) and reader (practitioners, tech-adjacent); reframed the WooCommerce archive as an accepted legacy tail rather than a positioning gap.
- v1 (2026-08-13) — Initial context, auto-drafted from repo copy, the Style Guide, all 49 essays and 28 days of Search Console data.
