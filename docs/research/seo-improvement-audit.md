# SEO improvement audit

**Site:** [buthonestly.io](https://buthonestly.io/)

**Repository:** `buthonestly.io`

**Purpose:** Durable research input for `/grill-with-docs`, `/to-spec`, and subsequent implementation work

**Audit posture:** Repository and rendered-output audit, not a live ranking report

## Executive summary

BUT. Honestly has a strong technical SEO foundation. The audited production build succeeded with 89 pages; all 109 tests passed; every rendered HTML page had exactly one title, meta description, canonical URL, and H1; sitemap, structured data, RSS, `llms.txt`, and Markdown alternatives were present. The Essay inventory contained 44 Published essays and 5 Scheduled essays. No broad technical rewrite is warranted.

The highest-value next work is measurement and selective improvement for the Essays the site wants to be known for:

1. Pull trustworthy Google Search Console query-and-page data and verify post-migration consolidation before changing content at scale.
2. Verify that search-specific crawlers can pass both the production robots policy and Cloudflare enforcement while preserving intentional training opt-outs.
3. Add optional SERP metadata overrides so evidence-led title and description tests do not force changes to an Essay's visible title or lead.
4. Strengthen visible author attribution and structured-data entity consistency.
5. Add accurate semantic markup and breadcrumbs to the Free AI Voice Generator without promising unsupported rich results.
6. Preserve the current rendered-output baseline with SEO and Core Web Vitals regression monitoring.
7. Improve Internal prose links selectively, not mechanically.

The site's editorial positioning limits what “better SEO” should mean. The Legacy tail must remain correct but should not be expanded merely because it offers easier traffic. Personal Essays must not be reshaped into keyword pages. The Free AI Voice Generator's performance is not a reason to manufacture more tools.

## Scope and methodology

### Included

- Astro configuration and generated sitemap behavior
- Page titles, descriptions, canonicals, H1s, and indexability
- Essay, archive, author, and site structured data
- Production robots policy and search-versus-training crawler distinctions
- Internal link graph health
- `llms.txt` and Markdown alternatives
- Editorial metadata constraints
- Performance and monitoring readiness
- Authority and author-identity signals

### Evidence used

- Repository source, especially:
  - `astro.config.mjs`
  - `src/components/SEO.astro`
  - `src/layouts/SinglePost.astro`
  - `src/lib/essays.ts`
  - `src/lib/schema.ts`
  - `src/pages/llms.txt.ts`
  - `src/pages/resources/free-ai-voice-generator.astro`
  - `scripts/build-markdown-alternatives.mjs`
  - `scripts/build-link-graph.mjs`
  - `public/robots.txt`
  - `public/_headers`
  - `.agents/product-marketing.md`
  - `context.md`
- The completed production build, test suite, rendered-page inspection, and Internal link graph analysis recorded below.
- Current first-party documentation from Google, OpenAI, Perplexity, Cloudflare, Astro, and Schema.org.

### Interpretation rules

- **Observed** identifies a repository, production, or command-output fact.
- **Recommendation** identifies proposed work, not a confirmed defect.
- Severity reflects likely impact and sequencing, not certainty of a ranking change.
- External claims are linked to the organization that owns the relevant system or vocabulary.

## Current strengths

- **Observed:** The production build generated 89 pages and completed successfully.
- **Observed:** All 109 automated tests passed.
- **Observed:** Rendered-output inspection found exactly one title, meta description, canonical, and H1 on every HTML page inspected, with no rendered `noindex` pages.
- **Observed:** `astro.config.mjs` sets the production site URL, enforces a trailing-slash policy, generates a sitemap, removes paginated archives from that sitemap, and projects `lastmod` from the Essay inventory.
- **Observed:** `public/robots.txt` advertises `https://buthonestly.io/sitemap-index.xml` and deliberately leaves crawler groups to Cloudflare's managed production policy.
- **Observed:** `src/components/SEO.astro` emits canonical, Open Graph, Twitter Card, Person, WebSite, ProfilePage, and Article data as applicable.
- **Observed:** `src/lib/schema.ts` provides BreadcrumbList and CollectionPage nodes for archives and Essay navigation.
- **Observed:** The rendered schema inventory included 44 Article, 81 BreadcrumbList, 37 CollectionPage, 1 ProfilePage, and 1 WebSite nodes.
- **Observed:** The Essay inventory contained 44 Published essays and 5 Scheduled essays.
- **Observed:** The build published 50 Markdown alternatives, while `src/pages/llms.txt.ts` exposes Published essays, Sections, Topics, key pages, and feeds to agents.
- **Observed:** Internal link analysis found 131 Internal prose links in the full inventory, 117 among Published essays, 2.66 per Published essay, no dead ends, and one Published essay with no inbound Internal prose link.
- **Observed:** The site uses static Astro output, optimized responsive images, content-hashed immutable assets, and defers the voice generator's large model download until interaction.

## Findings

### Technical SEO

#### High — Establish a trustworthy Search Console measurement and migration view

**Observed:** This audit has no current Google Search Console account export or URL Inspection results. The product context records that earlier measurements were distorted by pre-Astro URLs, so aggregate historical clicks and positions cannot be treated as a current baseline.

**Recommendation:** Add a monthly, read-only Search Console report that:

- pulls page-plus-query data, not only separate page and query totals;
- compares a full calendar month with the previous month;
- separates the Legacy tail from current Essays;
- surfaces relevant queries at positions 8–30, high-impression/low-CTR combinations, declines, and brand queries;
- compares old and canonical URLs during migration consolidation;
- retains raw exports locally or in CI artifacts rather than committing account data by default.

Google reports traffic from AI Overviews and AI Mode within the normal Search Console Performance report and says those features have no additional technical eligibility requirements beyond ordinary Search eligibility. A page must be indexed, eligible for a snippet, and meet Search technical requirements ([Google, “AI features and your website”](https://developers.google.com/search/docs/appearance/ai-features)). This makes the standard page/query report the primary Google measurement layer; a separate “Google AI SEO” dashboard is not required.

**Likely files if approved:** `scripts/`, `src/lib/google-authentication.mjs`, `package.json`, and dedicated tests. The current Google authentication adapter requests Cloud Platform scope, so Search Console access and its `webmasters.readonly` scope need an explicit design rather than an implicit reuse.

#### Medium — Preserve sitemap and canonical behavior with regression checks

**Observed:** `astro.config.mjs` generates `sitemap-index.xml`, excludes paginated archive URLs from the sitemap, and attaches inventory-derived `lastmod`. `public/robots.txt` advertises the sitemap. The rendered audit found one canonical per HTML page.

Astro documents that its sitemap integration includes statically generated dynamic routes and emits an index plus numbered sitemap files when applicable ([Astro sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/)).

**Recommendation:** Add CI assertions that every canonical, indexable entry point belongs in the sitemap; every sitemap URL resolves to its canonical form; Scheduled essays remain absent from production; and accidental `noindex` cannot ship on important pages. This is a preservation task, not a sitemap redesign.

#### Medium — Complete post-migration verification in Search Console

**Observed:** Repository redirects are extensive, but repository configuration cannot prove which canonical Google selected or whether old URLs have consolidated.

**Recommendation:** Once authenticated Search Console access exists, inspect a representative sample of old and canonical URLs, sitemap status, duplicate/canonical coverage, and important externally linked URLs. Do not infer successful consolidation from redirects alone.

### On-page and editorial SEO

#### High — Add optional SERP metadata overrides

**Observed:** `src/lib/essays.ts` derives `seo.title` from the authored Essay title and `seo.description` from the excerpt. `src/components/SEO.astro` then reuses the same values for `<title>`, meta description, Open Graph, and Twitter metadata. The excerpt is also the visible Essay lead. The audit found five Published Essay titles over 60 characters and 24 excerpts below the repository's 130-character editorial target.

**Recommendation:** Support optional `seoTitle` and `seoDescription` metadata, defaulting to current behavior. Use overrides only when Search Console query/CTR evidence supports an experiment. Keep diagnostics for duplicate or unusual-length metadata advisory rather than applying a blanket blocker to the Legacy tail.

Character counts are editorial and display heuristics, not ranking guarantees. An override must remain accurate to visible content and preserve the site's rule that an Essay delivers what its title promises.

**Likely files if approved:** Essay metadata parsing in `src/lib/essay-inventory.mjs`, the Post SEO shape in `src/types.ts`, projection in `src/lib/essays.ts`, rendering in `src/components/SEO.astro`, and focused inventory/render tests.

#### Medium — Use search-intent structure only for genuinely searchable Essays

**Observed:** The site's primary material includes personal and observational Essays whose value is their first-hand account, not their fit to a generic query. Separate technical and explanatory Essays can answer clear searches.

**Recommendation:** For a Search Console-supported searchable Essay, check that the title names the real question, the opening answers it directly, headings cover useful follow-up questions, comparisons use tables when a table improves comprehension, and changing claims cite dated primary sources. Do not apply an “answer block” template to every Essay or fragment personal prose for machine extraction.

Google explicitly says no special AI-specific content format is required for AI Overviews or AI Mode; normal helpful-content and Search practices apply ([Google, “AI features and your website”](https://developers.google.com/search/docs/appearance/ai-features)).

### Site architecture and Internal prose links

#### Medium — Repair natural Internal link gaps selectively

**Observed:** `npm run links` reported 2.66 Internal prose links per Published essay, one Published orphan (`disable-gtin-requirements-non-eligible-woocommerce-products`), no dead ends, and thin Performance and PHP clusters. The Software License Cornerstone had two inbound Published links in the audit output.

**Recommendation:**

1. Add an inbound Internal prose link to the orphan only if another Essay naturally helps the same reader.
2. Strengthen relevant inbound links to current searchable Cornerstones, especially the Software License Essay.
3. Connect Performance Essays where they answer adjacent reader questions.
4. Treat PHP and old WooCommerce gaps as low priority when they belong to the Legacy tail.
5. Keep the Internal link graph advisory; do not manufacture links merely to hit a density threshold.

**Likely files if approved:** authored MDX under `src/content/essays/`; no link-generation feature is recommended.

#### Low — Do not expand taxonomy merely for SEO

**Observed:** Section and Topic archives already have descriptive copy, pagination, feeds, CollectionPage schema, and cross-links. No orphaned navigation architecture was found.

**Recommendation:** Build a stronger hub only when several durable Essays and reader demand already justify it. Do not create additional Topics, doorway pages, or programmatic archives to target keywords.

### Structured data

#### Medium — Strengthen the author entity and visible attribution

**Observed:** `src/components/SEO.astro` emits a Person and uses it as Article author and publisher. That Person's URL is `https://nicolamustone.com`, while BUT. Honestly's ProfilePage is `/about/`. The audited Essay layout does not display a clear linked byline.

Schema.org defines stable identity properties such as `url`, `sameAs`, `jobTitle`, and `worksFor` for Person entities ([Schema.org Person](https://schema.org/Person)).

**Recommendation:** Display “By Nicola Mustone” linked to `/about/`; assign a stable site-owned Person `@id`; reuse that identity from ProfilePage and Essay nodes; and include only attributes supported by visible, truthful page content. This is an entity-consistency and reader-trust improvement, not a guaranteed ranking change.

**Likely files if approved:** `src/components/SEO.astro`, `src/pages/about.astro`, and `src/pages/[slug].astro`.

#### Medium — Add accurate application and breadcrumb semantics to the voice generator

**Observed:** `src/pages/resources/free-ai-voice-generator.astro` visibly describes a free, browser-based application, but the rendered audit found only the global Person schema on that page.

Schema.org provides `SoftwareApplication` and its `WebApplication` subtype ([Schema.org SoftwareApplication](https://schema.org/SoftwareApplication)). Google's software-app rich-result documentation requires `name`, `offers.price`, and either a genuine `aggregateRating` or `review`; Google does not guarantee display even when requirements are met ([Google SoftwareApplication structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)).

**Recommendation:** Add truthful WebApplication/SoftwareApplication semantics and `Home → Resources → Free AI Voice Generator` BreadcrumbList markup. Include price `0`, application category, and browser/web operating environment where accurate. Do not invent ratings or reviews, and do not sell this as a Google rich-result feature without genuine visible review data.

#### Low — Refine the existing schema graph, then validate representative pages

**Observed:** Existing Article, Person, WebSite, ProfilePage, CollectionPage, and BreadcrumbList coverage is broad and rendered server-side.

**Recommendation:** Consider stable `@id` references, `isPartOf` relationships, and the more specific `BlogPosting` subtype. Validate representative output with Google's Rich Results Test and Schema.org Validator. Google requires structured data to represent visible content and states that valid markup grants eligibility, not guaranteed display ([Google structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)).

Do not add FAQ or HowTo markup for cosmetic promises. Google limits FAQ rich results mainly to authoritative government and health sites and removed the broad HowTo treatment; those changes were not ranking changes ([Google Search Central, HowTo and FAQ changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes)).

### AI and agent discoverability

#### High — Verify search crawlers separately from training crawlers

**Observed:** Production Cloudflare-managed robots content declares `search=yes,ai-train=no,use=reference`, allows the wildcard group, and specifically disallows crawlers including GPTBot, Google-Extended, and ClaudeBot. The repository's `public/robots.txt` intentionally contains only the sitemap because Cloudflare prepends managed directives.

Cloudflare documents that managed rules are prepended to an existing `robots.txt`, that search, AI input, and AI training are distinct signals, and that robots directives rely on crawler compliance rather than technical enforcement ([Cloudflare managed robots.txt](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/)).

Google says Googlebot controls inclusion in Search, including AI Overviews and AI Mode; Google-Extended controls training and grounding in some other Google systems. A Google-Extended disallow does not itself remove the site from Google Search AI features ([Google, “AI features and your website”](https://developers.google.com/search/docs/appearance/ai-features)).

OpenAI distinguishes OAI-SearchBot, which must be allowed for ChatGPT Search discovery and citation, from GPTBot, which controls potential training use. It also requires the CDN/WAF to allow current published searchbot IPs ([OpenAI publisher FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq); [OpenAI ChatGPT Search](https://help.openai.com/en/articles/9237897-chatgpt-search)). Perplexity says PerplexityBot supports search surfacing and is not used for foundation-model training ([Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)).

**Recommendation:** Preserve training opt-outs if intentional, but explicitly verify Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, and current search-specific crawlers in both robots evaluation and Cloudflare request logs. Do not unblock GPTBot merely to pursue ChatGPT Search.

**Likely operational location:** Cloudflare managed robots and bot controls, not only `public/robots.txt`.

#### Low — Preserve `llms.txt` and Markdown alternatives without treating them as ranking features

**Observed:** `src/pages/llms.txt.ts` links to Published Essay Markdown alternatives and important navigation. The build published 50 Markdown alternatives. Live HTML responses did not advertise those Markdown alternatives through an HTML or HTTP `Link` relation during the audit.

**Recommendation:** Keep both outputs because they are low-cost and useful to non-Google agents. Optionally advertise Essay Markdown with `<link rel="alternate" type="text/markdown">` or an HTTP `Link` header. Treat this as agent readiness, not a Google ranking tactic; Google's AI Search features require no special file beyond normal Search eligibility ([Google, “AI features and your website”](https://developers.google.com/search/docs/appearance/ai-features)).

### Performance and monitoring

#### Medium — Add field-data monitoring and lab regression budgets

**Observed:** Static generation, responsive image output, content-hashed assets, and lazy model loading are favorable foundations. The PageSpeed Insights API returned HTTP 429 during this audit, so no current lab score or CrUX field assessment is included.

Google defines good Core Web Vitals as LCP at or below 2.5 seconds, INP at or below 200 milliseconds, and CLS at or below 0.1 at the 75th percentile, and recommends field data such as Search Console's Core Web Vitals report ([Google Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)).

**Recommendation:** Monitor field data for the homepage, a representative Essay, a media-heavy technical Essay, and the Free AI Voice Generator. Add a repeatable Lighthouse CI budget to catch regressions in LCP, CLS, script transfer, and main-thread work, but use CrUX/Search Console field data for actual reader experience. Preserve the voice generator's interaction-triggered model download.

#### Medium — Extend rendered-output regression coverage

**Observed:** The current rendered baseline is clean, but the strongest evidence came from an ad hoc audit rather than a named SEO regression suite.

**Recommendation:** Add tests for exactly one title/description/canonical/H1, canonical/sitemap agreement, accidental `noindex`, duplicate metadata warnings, schema-to-visible-content consistency, publication and modified dates, Markdown alternative generation, and Scheduled Essay exclusion. Keep these checks close to the rendered interface rather than testing isolated formatting helpers alone.

### Authority

#### Medium — Improve citation-worthiness through original work and identity, not generic volume

**Observed:** The product context records one external credibility marker and no broad backlink inventory. No current backlink tool export was available for this audit. The site's strongest differentiators are first-hand experience, named tradeoffs, transparent AI use, and openly accessible tools or project artifacts.

**Recommendation:** Prioritize work others can cite because it contains original evidence: reproducible technical experiments, documented migrations, datasets or notebooks created for a real need, leadership frameworks grounded in specific incidents, and transparent tool architecture. Distribute relevant work to communities where it is directly useful. Do not create generic guest content, mass comparison pages, or new tools solely to obtain links.

For personal and observational Essays, distribution and brand demand may contribute more to the site's stated goal than conventional non-brand search. SEO measurement should therefore report brand queries and non-archive Essay discovery separately rather than optimizing total clicks.

## Prioritized action plan

### Phase 1 — Measurement and safeguards

1. **High:** Design and implement the monthly Search Console migration/opportunity report.
2. **High:** Verify search-specific crawler access through robots evaluation and Cloudflare logs while retaining intentional training controls.
3. **Medium:** Turn the current rendered metadata and sitemap baseline into named CI regression tests.
4. **Medium:** Establish Search Console/CrUX field-data monitoring and a small Lighthouse regression matrix.

### Phase 2 — Metadata and identity

5. **High:** Add optional `seoTitle` and `seoDescription`, defaulting to current behavior.
6. **Medium:** Add a visible author byline and stable Person identity shared by `/about/` and Essay schema.
7. **Medium:** Add accurate breadcrumb and application semantics to the Free AI Voice Generator without invented reviews.

### Phase 3 — Evidence-led editorial improvements

8. Use Search Console data to select a small set of current, genuinely searchable Essays.
9. Improve their title, description, opening, headings, and citations only where query evidence and reader benefit align.
10. Add natural Internal prose links to the Software License Cornerstone and other current Essays; fix the orphan only if a relevant source Essay exists.
11. Reassess outcomes after a complete, trustworthy monthly baseline rather than against migration-distorted historical totals.

## Explicit non-goals

- **Do not optimize the Legacy tail merely for traffic.** Keep old WordPress and WooCommerce material correct, but do not let its rankings set the editorial agenda.
- **Do not propose more tools as an SEO strategy.** A tool is a byproduct of a real need, not a traffic template.
- **Do not distort personal Essays around keywords.** Searchable explanatory Essays may be sharpened for a query; personal and observational Essays keep the form their thought requires.
- Do not create programmatic keyword pages, doorway taxonomies, or mass comparison content.
- Do not fabricate reviews, ratings, credentials, or freshness signals for structured data.
- Do not add FAQ/HowTo markup with promises of broad Google rich results.
- Do not treat `llms.txt`, Markdown alternatives, or schema vocabulary as substitutes for indexing, content quality, Internal prose links, or authority.
- Do not set growth targets from the old migration-distorted baseline.
- Do not revisit whether WordPress/WooCommerce should become the primary editorial focus; the product context explicitly rejects that direction.

## Open decisions for `/grill-with-docs`

1. **Measurement contract:** Which Search Console property is canonical (`sc-domain:buthonestly.io` or a URL-prefix property), where should monthly reports live, and should any aggregates be committed?
2. **Success measures:** Which exact non-archive, brand-query, referral, and newsletter metrics should the SEO report own?
3. **Metadata contract:** Should `seoTitle` and `seoDescription` affect only Search metadata, or also Open Graph and social cards?
4. **Crawler intent:** Which training crawlers should remain blocked, and which search-specific crawlers should be explicitly allowed and monitored?
5. **Author identity:** Should the canonical Person identity be owned by `/about/` on BUT. Honestly or by `nicolamustone.com`, with the other expressed through `sameAs`?
6. **Structured-data scope:** Is semantic WebApplication markup worthwhile without Google software-app rich-result eligibility from a real review?
7. **Performance budget:** Which routes and thresholds should block CI versus remain advisory?
8. **Report timing:** What period is sufficiently post-migration to establish the first honest baseline?
9. **Blog split:** The product context leaves a possible technical-writing split unresolved. Any information architecture work that assumes one permanent audience should wait for or explicitly avoid that decision.

## Verification evidence and commands

The following read-only or build-validation work was completed in the inherited audit:

```text
npm run build
```

- Passed.
- Built 89 pages.
- Generated `sitemap-index.xml`.
- Published 50 Markdown alternatives in postbuild.

```text
npm test
```

- Passed: 109 tests, 0 failures.

```text
npm run links
```

- Passed as an advisory report.
- 49 Essays: 44 Published, 5 Scheduled.
- 131 Internal prose links total; 117 among Published essays.
- 2.66 Internal prose links per Published essay.
- One Published orphan: `disable-gtin-requirements-non-eligible-woocommerce-products`.
- No dead ends.
- Thin clusters: Performance and PHP.

A rendered-output inspection of generated HTML found:

- 88 HTML pages in the inspected set;
- no title, description, canonical, or H1 anomalies;
- no rendered `noindex` pages;
- 44 Article, 81 BreadcrumbList, 37 CollectionPage, 1 ProfilePage, and 1 WebSite schema nodes.

Production fetches also confirmed:

- `https://buthonestly.io/robots.txt` contains Cloudflare-managed policy plus the repository sitemap line;
- `https://buthonestly.io/sitemap-index.xml` resolves;
- `https://buthonestly.io/llms.txt` resolves and lists Published Essay Markdown alternatives;
- Essay `.md` alternatives return `text/markdown`;
- HTML responses did not expose a Markdown alternate `Link` header in the sampled requests.

## Limitations

- No current Search Console account export was available. Current queries, clicks, impressions, CTR, positions, coverage, selected canonicals, and migration consolidation are therefore unverified.
- Historical numbers in `.agents/product-marketing.md` are context, not a current traffic baseline, and were not projected forward.
- PageSpeed Insights API calls returned HTTP 429. This report contains no current PageSpeed score or live CrUX assessment.
- Robots text alone cannot prove CDN/WAF access. Cloudflare logs and providers' current published IP ranges must verify crawler reachability.
- Structured data was found in rendered output, but representative pages were not submitted to Google Rich Results Test or Schema.org Validator in this pass.
- No comprehensive backlink export or competitor dataset was available.
- No fixed-query AI citation benchmark was run across ChatGPT, Perplexity, Claude, Gemini, or Copilot.
- Recommendations indicate likely leverage, not guaranteed ranking or rich-result outcomes.

## Primary sources

- [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) — Search and AI-feature eligibility, Googlebot versus Google-Extended, and Search Console reporting.
- [Google Search Central: Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) — field metrics, thresholds, and Search guidance.
- [Google structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) — visible-content accuracy, eligibility, and validation principles.
- [Google SoftwareApplication structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app) — required and recommended software-app properties and review requirement.
- [Google Search Central: HowTo and FAQ rich-result changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes) — current limitations and ranking caveat.
- [OpenAI: Publishers and developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq) — OAI-SearchBot, GPTBot, and CDN access.
- [OpenAI: ChatGPT Search](https://help.openai.com/en/articles/9237897-chatgpt-search) — ChatGPT Search discovery controls.
- [Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers) — PerplexityBot and Perplexity-User roles.
- [Cloudflare managed robots.txt](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/) — managed directive behavior and content signals.
- [Cloudflare robots directive tracking](https://developers.cloudflare.com/ai-crawl-control/features/track-robots-txt/) — monitoring and voluntary-compliance limitations.
- [Astro sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/) — sitemap output behavior.
- [Schema.org Person](https://schema.org/Person), [SoftwareApplication](https://schema.org/SoftwareApplication), and [BlogPosting](https://schema.org/BlogPosting) — canonical vocabulary definitions.
- Repository source and the verification commands above — primary evidence for the current implementation and generated output.

## Recommended next step

Take this report into `/grill-with-docs`. Settle the measurement contract, crawler intent, metadata override behavior, and author identity first. Then use `/to-spec` for a narrow first tranche—preferably Search Console measurement plus rendered SEO safeguards—rather than turning every recommendation into one large implementation effort.
