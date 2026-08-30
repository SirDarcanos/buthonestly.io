# Lighthouse and field-data monitoring

This specification records the approved monitoring contract. It has not been implemented.

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

Each result is the median of three runs for the same route and device.

## Triggers

Scheduled production checks run:

- mobile on Monday at 06:00 UTC during even ISO weeks
- desktop on the first Monday of each month at 07:00 UTC

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

## Field data

Monthly reporting queries CrUX with a narrowly scoped `CRUX_API_KEY` and presents the result beside the Search Console aggregate report without treating it as Search Console data.

The report includes origin-level mobile data and URL-level data for regression-matrix routes where CrUX has enough coverage. Missing coverage is reported as `insufficient field data`; it is neither a pass nor a failure.
