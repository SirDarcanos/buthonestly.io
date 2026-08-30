# Separate performance monitoring from publication

Lighthouse regression checks and CrUX field-data monitoring operate independently of date-driven publication. Publication hands a Live Essay and its expected reader-facing content hash to separate monitoring, but lab failures never interrupt deployment verification, Kit delivery, or IndexNow; this boundary keeps noisy observational checks from making durable publication state ambiguous while still verifying each live content version.
