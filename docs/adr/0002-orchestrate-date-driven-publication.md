# Orchestrate date-driven publication

Essays publish at 13:00 UTC on their publication day. One hourly publication orchestrator deploys published essays whose expected version is missing or stale, then independently resumes Kit newsletter delivery and IndexNow submission from `data/publication-state.json`; no-op runs create no commits.

Automation has exactly three owners: CI verifies correctness, the related workflow prepares committed semantic data when essay sources change, and the publication workflow handles scheduled deployment and provider follow-up. Semantic data remains separate from publication state. Internal-link graph output is local and advisory, and obsolete provider-specific ledgers are not retained.

The protected `main` branch requires the `verify` check and pull requests for contributors. Repository administrators retain emergency bypass, while the related and publication workflows use one repository-scoped deploy key to checkpoint generated state directly. The default Actions token cannot bypass branch rules.
