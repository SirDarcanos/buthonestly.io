# Lighthouse and field-data monitoring

This specification records the approved monitoring contract. Advisory monitoring is implemented; numeric budgets, regression issues, and blocking enforcement remain disabled until the baseline and maintainer approval are complete.

## Vocabulary

A **Lighthouse regression check** is a controlled lab measurement used to detect material performance regressions before or after deployment. It does not represent actual reader experience.

**Field-data monitoring** observes real-reader Core Web Vitals through CrUX. It is evidence of reader experience, not a deployment regression test.

## Lighthouse regression matrix

Regular checks cover:

- `/`
- `/when-ai-stops-being-a-tool/`
- `/what-is-a-gpu/`
- `/resources/free-ai-voice-generator/`

The `what-is-a-gpu` check also performs a controlled full-page scroll with a cold browser cache. It records first-party transferred image bytes and layout shifts separately from the normal navigation audit.

Each result is the median of three runs for the same route and device. The workflow summary reports the aggregate Lighthouse performance score for context, but that score is not an enforcement input.

## Triggers

Scheduled production checks run:

- mobile on Monday at 06:00 UTC during even ISO weeks
- desktop on the first Monday of each month at 07:00 UTC, except when the mobile schedule coincides; that combined invocation runs at 06:00 UTC

A qualifying pull request compares its head with its base commit on the same runner. Both revisions use the same selected routes:

- shared layouts, components, dependencies, or Astro configuration run the entire matrix
- an Essay change runs that Essay and the homepage when the homepage output changes
- Voice Generator code runs the Voice Generator and homepage
- an output change with uncertain reach runs the entire matrix
- changes that cannot affect site output do not run Lighthouse

After an expected Essay version becomes live, publication hands its slug and reader-facing content hash to separate monitoring. That check covers the Live Essay and homepage. Monitoring owns deduplication by content hash and never blocks publication follow-up.

## Baseline and enforcement

The first two months are advisory, covering four mobile and two desktop scheduled checks. Reports are collected without blocking pull requests or opening regression issues. Route-specific budgets are proposed from that evidence and require maintainer approval before enforcement.

Enforcement does not use the aggregate Lighthouse performance score. It uses:

- route-specific LCP, CLS, script-transfer, and main-thread-work budgets
- first-party transfer budgets distinct from third-party behavior
- shared floors for accessibility, best practices, and SEO
- relative pull-request regressions measured against the base commit
- absolute limits for catastrophic regressions

Production reports include third-party behavior, but third-party degradation does not fail a first-party pull-request budget.

## Confirmation and recovery

A broken route, failed audit, or accessibility, best-practices, or SEO regression is retried immediately. A confirmed retry fails the Lighthouse workflow and opens or updates an issue.

A scheduled performance-budget regression is advisory on its first occurrence. The next scheduled occurrence must confirm it before the workflow fails and an issue opens.

A post-publication performance regression is retried immediately. A confirmed retry fails only the separate Lighthouse workflow and opens or updates an issue; publication remains successful.

There is one issue per route and device combination. Issues use `performance` and `needs-triage`, include run links and failed measurements, and close after two consecutive passing checks. Automated findings do not receive `ready-for-agent` before human triage.

## State and reports

`data/lighthouse-state.json` owns checked content hashes, consecutive outcomes, issue identities, and recovery state. It uses the repository's generated-state checkpoint pattern.

Each workflow writes concise metrics and deltas to its GitHub Actions summary. Lighthouse HTML and JSON reports remain workflow artifacts for 90 days. Raw reports are not committed.

Run `npm run lighthouse:smoke` to build the production site, serve it locally, and perform one bounded real-browser mobile navigation audit. The opt-in smoke writes HTML and JSON reports under `artifacts/lighthouse-smoke/`; it is not part of the network-independent unit-test suite.

## Pull-request build performance

PR builds cache npm downloads using both revisions' lockfiles; each revision still
runs `npm ci`. This is not a cache of installed dependencies.

The image cache contains only `node_modules/.astro/assets`. After building head,
`scripts/share-lighthouse-images.mjs` copies those assets to base when their
lockfiles and Astro configurations match. Base-only variants are merged back
before the cache is saved. Astro selects transforms by its generated asset names;
its content store and rendered pages are never copied. Different toolchains skip
sharing, and a missing cache leaves Astro to generate the images normally.

Persistent cache keys include OS, architecture, head lockfile/configuration and
head revision. Prefix restores reuse image assets within that toolchain without
coupling the cache to a particular head/base pair. A later head revision saves the
expanded set; an exact-key hit is immutable and may need to regenerate variants
introduced only by a different base or preview selection.

`test/lighthouse-image-build.test.mjs` builds two small Astro fixtures through the
installed CLI. It checks cross-checkout reuse, changed image bytes and transform
options, regeneration after cache removal, and fresh preview/publication-boundary
markup with warmed images. This protects the sharing mechanism; it is not a
representative CI performance benchmark.

Both revisions always rebuild, including the Markdown alternatives. Selected
scheduled-preview slugs (or the legacy base fallback) and current publication
state are therefore evaluated on every run. Production `dist/` artifacts and
browser measurements are not reused. The job exposes separate install, cache,
head build, sharing, base build, server startup and audit timings, and reports
exact cache-hit status; restore logs distinguish prefix hits from misses.

### Observed baseline and remaining measurements

Before this change, Actions run [38916845068](https://github.com/SirDarcanos/buthonestly.io/actions/runs/38916845068)
(2026-10-16) missed the combined image cache: head/base installation took
16s/11s, cache lookup 1s, builds plus server startup 17m49s, and audits 3m23s.
The Astro build logs show 8m52s for head and 8m51s for base.

Run [39009026530](https://github.com/SirDarcanos/buthonestly.io/actions/runs/39009026530)
(2026-10-17) hit the exact combined image-cache key: head/base installation
took 11s/6s, restoration 3s for about 200 MB, builds plus startup 15s, and audits
2m34s. Astro reported 5.67s/5.80s builds. These are different PRs and route sets,
not a controlled before/after comparison. Neither run separates startup from
build time or uses npm download caching.

Full-page artifact caching is not enabled: a warm pair of builds costs only 15s,
and transfer/storage overhead has not been measured against that saving. Such
reuse would also need exact source, toolchain, preview and effective publication
state identity. Image sharing targets the duplicated cold transformation work
without introducing those page-staleness risks.

Issue #62 remains pending representative post-change cold/warm PR runs and exact
reruns. Record step timings, cache keys/hit outcomes, transfer size, and generated
content before claiming a CI speedup or deciding on full-build artifact reuse.

## Field data

Monthly reporting queries CrUX with a narrowly scoped `CRUX_API_KEY` and presents the result beside the Search Console aggregate report without treating it as Search Console data.

The report includes origin-level mobile data and URL-level data for every regression-matrix route where CrUX has enough coverage. Each measurement discloses its `PHONE` form factor and rolling collection window. Missing coverage is reported as `insufficient field data`; it is neither a pass nor a failure. Provider and schema failures remain field-data results and do not prevent the Search Console report from being generated.
