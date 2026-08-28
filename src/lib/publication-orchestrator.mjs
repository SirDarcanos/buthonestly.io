const DEFAULT_POLL_ATTEMPTS = 10;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

const completedHash = (publicationState, slug) =>
  publicationState.essays?.[slug]?.indexNow?.contentHash;

const discoveryUrls = (essay, isNew) => {
  const urls = [essay.canonicalUrl];
  if (!isNew) return urls;

  const siteUrl = new URL(essay.canonicalUrl);
  siteUrl.pathname = "/";
  siteUrl.search = "";
  siteUrl.hash = "";
  urls.push(
    siteUrl.toString(),
    new URL("/essays/", siteUrl).toString(),
    ...essay.categories.map(({ canonicalUrl }) => canonicalUrl),
    ...essay.tags.map(({ canonicalUrl }) => canonicalUrl),
  );
  return [...new Set(urls)];
};

const inspectExpectedVersion = async (production, essay) => {
  try {
    const inspected = await production.inspect(essay);
    if (inspected.status === "unavailable") {
      return { status: "unavailable", detail: inspected.detail };
    }
    return {
      status:
        inspected.contentHash === essay.publicContentHash ? "live" : "stale",
    };
  } catch (error) {
    return { status: "unavailable", detail: messageFrom(error) };
  }
};

const messageFrom = (error) =>
  error instanceof Error ? error.message : String(error);

const emptyResult = () => ({
  deployed: false,
  submitted: [],
  pending: [],
  stateChanged: false,
  errors: [],
});

export async function runPublication({
  clock,
  inventory,
  state,
  deployment,
  production,
  indexNow,
  pollAttempts = DEFAULT_POLL_ATTEMPTS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  const now = clock.now();
  const publicationState = await state.load();
  const { published } = inventory.load({ now });
  if (published.length === 0) return emptyResult();

  const liveEssays = [];
  const staleEssays = [];
  const unavailableEssays = [];
  const errors = [];
  const inspections = await Promise.all(
    published.map(async (essay) => ({
      essay,
      inspection: await inspectExpectedVersion(production, essay),
    })),
  );
  for (const { essay, inspection } of inspections) {
    if (inspection.status === "live") liveEssays.push(essay);
    else if (inspection.status === "stale") staleEssays.push(essay);
    else {
      unavailableEssays.push(essay);
      errors.push(
        `Production unavailable: ${essay.slug}${
          inspection.detail ? ` (${inspection.detail})` : ""
        }`,
      );
    }
  }

  let deployed = false;
  if (staleEssays.length > 0) {
    try {
      await deployment.request();
      deployed = true;
    } catch (error) {
      errors.push(`Deployment request failed: ${messageFrom(error)}`);
    }

    if (deployed) {
      for (
        let attempt = 0;
        attempt < pollAttempts && staleEssays.length;
        attempt += 1
      ) {
        await clock.sleep(pollIntervalMs);
        const polling = await Promise.all(
          staleEssays.map(async (essay) => ({
            essay,
            inspection: await inspectExpectedVersion(production, essay),
          })),
        );
        for (let index = polling.length - 1; index >= 0; index -= 1) {
          if (polling[index].inspection.status === "live") {
            liveEssays.push(polling[index].essay);
            staleEssays.splice(index, 1);
          }
        }
      }
      if (staleEssays.length > 0) {
        errors.push(
          `Expected production version did not become live: ${staleEssays
            .map(({ slug }) => slug)
            .join(", ")}`,
        );
      }
    }
  }

  const unfinished = new Set(
    [...staleEssays, ...unavailableEssays].map(({ slug }) => slug),
  );
  const indexNowEssays = liveEssays.filter(
    (essay) =>
      completedHash(publicationState, essay.slug) !== essay.publicContentHash,
  );
  const submitted = [];
  let stateChanged = false;

  if (indexNowEssays.length > 0) {
    const urls = indexNowEssays.flatMap((essay) =>
      discoveryUrls(essay, completedHash(publicationState, essay.slug) == null),
    );
    let accepted = false;
    try {
      await indexNow.submit([...new Set(urls)]);
      accepted = true;
    } catch (error) {
      errors.push(`IndexNow submission failed: ${messageFrom(error)}`);
      for (const essay of indexNowEssays) unfinished.add(essay.slug);
    }

    if (accepted) {
      for (const essay of indexNowEssays) {
        publicationState.essays ??= {};
        publicationState.essays[essay.slug] = {
          ...publicationState.essays[essay.slug],
          indexNow: { contentHash: essay.publicContentHash },
        };
      }
      try {
        await state.save(publicationState);
        submitted.push(...indexNowEssays.map(({ slug }) => slug));
        stateChanged = true;
      } catch (error) {
        errors.push(`Publication state save failed: ${messageFrom(error)}`);
        for (const essay of indexNowEssays) unfinished.add(essay.slug);
      }
    }
  }

  return {
    deployed,
    submitted,
    pending: published
      .filter(({ slug }) => unfinished.has(slug))
      .map(({ slug }) => slug),
    stateChanged,
    errors,
  };
}
