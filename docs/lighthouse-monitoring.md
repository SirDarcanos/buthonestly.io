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

### Post-change cold run and exact rerun

[PR #76](https://github.com/SirDarcanos/buthonestly.io/pull/76) measured commit
`f1ce51731399bfde70477b9045246e8e0d0f96a6` on `ubuntu-latest` with Node 24.
An unused temporary JSON fixture under `src/lib/` selected the existing full
Lighthouse matrix without changing rendered output; it was removed after the
measurement. Monitoring-only changes otherwise correctly skip the audits.

[Attempt 1](https://github.com/SirDarcanos/buthonestly.io/actions/runs/39010629159/attempts/1)
missed the new image cache.
[Exact attempt 2](https://github.com/SirDarcanos/buthonestly.io/actions/runs/39010629159/attempts/2)
restored its primary key. Both attempts passed, including the full audit matrix.

| Phase (step wall time)                      | Cold images | Exact warm rerun |
| ------------------------------------------- | ----------: | ---------------: |
| Node setup / npm download-cache restoration |          3s |               8s |
| Head dependency installation                |         12s |              12s |
| Base dependency installation                |         12s |              11s |
| Image-cache restoration                     |        miss |      3s / ~92 MB |
| Head build, including postbuild             |        532s |              10s |
| Head → base image sharing                   |          1s |               1s |
| Base build, including postbuild             |         10s |              10s |
| Base → head image merge                     |          2s |               1s |
| Server startup                              |          7s |               8s |
| Audits                                      |        208s |             207s |

The cold head generated 2,557 image transforms; base reused all 2,557 and generated
zero. The exact rerun reused all 2,557 in each revision and generated zero. Both
sharing steps reported `shared`. Astro's own build timers (excluding npm and
postbuild overhead) were 8m50s/8.19s cold and 8.08s/8.05s warm. Both attempts
restored an existing ~142 MB npm download cache and still installed dependencies.

Each revision built 94 pages and 53 Markdown alternatives in both attempts. The
logged sets of 2,557 image asset names and 93 HTML route paths matched between
attempts for each revision; these are inventory comparisons, not byte-level page
comparisons. Regression tests separately protect image invalidation and
preview/publication freshness.

This is one cold run and one exact rerun, not a trend, a billing estimate, or a
controlled old/new workflow benchmark. It directly demonstrates removal of the
second cold image-transformation pass. Historical old-workflow timings above
remain different PRs and route sets; no percentage pipeline-speedup claim is made.
Further representative PRs, particularly differing toolchains and scheduled
previews, can extend the evidence before issue acceptance. Full-page artifact
transfer/storage overhead remains unmeasured; the warm pair still rebuilds in
20s, so full-build caching remains disabled.

## Field data

Monthly reporting queries CrUX with a narrowly scoped `CRUX_API_KEY` and presents the result beside the Search Console aggregate report without treating it as Search Console data.

The report includes origin-level mobile data and URL-level data for every regression-matrix route where CrUX has enough coverage. Each measurement discloses its `PHONE` form factor and rolling collection window. Missing coverage is reported as `insufficient field data`; it is neither a pass nor a failure. Provider and schema failures remain field-data results and do not prevent the Search Console report from being generated.
