# Orchestrate date-driven publication

Essays publish at 13:00 UTC on their frontmatter day. One hourly publication orchestrator detects changes, deploys due essays, waits for the expected production version, and independently resumes Kit newsletter delivery and IndexNow submission from `data/publication-state.json`; no-op runs create no commits.

Automation has exactly three owners: CI verifies correctness, the related workflow prepares committed semantic data when essay sources change, and the publication workflow handles scheduled deployment and provider follow-up. Semantic data remains separate from publication state. Internal-link graph output is local and advisory, and obsolete provider-specific ledgers are not retained.
