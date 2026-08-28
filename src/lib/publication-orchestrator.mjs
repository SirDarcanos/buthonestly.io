const DEFAULT_POLL_ATTEMPTS = 10;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

const completedHash = (publicationState, slug) =>
  publicationState.essays?.[slug]?.indexNow?.contentHash;

const newsletterState = (publicationState, slug) =>
  publicationState.essays?.[slug]?.newsletter;

const newsletterDeliveryTime = (essay) =>
  new Date(essay.publishedAt.getTime() + 15 * 60 * 1000);

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
    return inspected.contentHash === essay.publicContentHash
      ? { status: "live", coverUrl: inspected.coverUrl }
      : { status: "stale" };
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
  kit,
  pollAttempts = DEFAULT_POLL_ATTEMPTS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  const now = clock.now();
  const publicationState = await state.load();
  const { published } = inventory.load({ now });
  if (published.length === 0) return emptyResult();

  const liveEssays = [];
  const liveCoverUrls = new Map();
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
    if (inspection.status === "live") {
      liveEssays.push(essay);
      liveCoverUrls.set(essay.slug, inspection.coverUrl);
    } else if (inspection.status === "stale") staleEssays.push(essay);
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
            liveCoverUrls.set(
              polling[index].essay.slug,
              polling[index].inspection.coverUrl,
            );
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

  if (kit) {
    for (const essay of liveEssays) {
      const recorded = newsletterState(publicationState, essay.slug);
      if (recorded?.status === "delivered") continue;

      const coverUrl = liveCoverUrls.get(essay.slug);
      if (!coverUrl) {
        unfinished.add(essay.slug);
        errors.push(`Live cover URL is missing: ${essay.slug}`);
        continue;
      }

      if (!recorded?.broadcastId) {
        let draft;
        try {
          draft = await kit.findDraft(essay);
        } catch (error) {
          unfinished.add(essay.slug);
          errors.push(
            `Kit draft reconciliation failed: ${essay.slug} (${messageFrom(error)})`,
          );
          continue;
        }
        if (!draft) {
          try {
            draft = await kit.createDraft(essay, coverUrl);
          } catch (error) {
            unfinished.add(essay.slug);
            errors.push(
              `Kit draft creation failed: ${essay.slug} (${messageFrom(error)})`,
            );
            continue;
          }
        }

        publicationState.essays ??= {};
        const previousEssayState = publicationState.essays[essay.slug];
        publicationState.essays[essay.slug] = {
          ...previousEssayState,
          newsletter: { broadcastId: draft.id, status: "draft" },
        };
        try {
          await state.save(publicationState);
          stateChanged = true;
          unfinished.add(essay.slug);
        } catch (error) {
          if (previousEssayState) {
            publicationState.essays[essay.slug] = previousEssayState;
          } else {
            delete publicationState.essays[essay.slug];
          }
          unfinished.add(essay.slug);
          errors.push(
            `Kit draft state save failed: ${essay.slug} (${messageFrom(error)})`,
          );
        }
        continue;
      }

      let broadcast;
      try {
        broadcast = await kit.inspect(recorded.broadcastId);
      } catch (error) {
        unfinished.add(essay.slug);
        errors.push(
          `Kit broadcast inspection failed: ${essay.slug} (${messageFrom(error)})`,
        );
        continue;
      }

      if (broadcast.status === "completed") {
        publicationState.essays[essay.slug] = {
          ...publicationState.essays[essay.slug],
          newsletter: {
            broadcastId: recorded.broadcastId,
            status: "delivered",
          },
        };
        try {
          await state.save(publicationState);
          stateChanged = true;
        } catch (error) {
          unfinished.add(essay.slug);
          errors.push(
            `Kit delivery state save failed: ${essay.slug} (${messageFrom(error)})`,
          );
        }
        continue;
      }

      if (["scheduled", "sending", "active"].includes(broadcast.status)) {
        unfinished.add(essay.slug);
        continue;
      }
      if (broadcast.status !== "draft") {
        unfinished.add(essay.slug);
        errors.push(
          `Kit broadcast cannot be resumed: ${essay.slug} (${broadcast.status})`,
        );
        continue;
      }

      const deliveryTime = clock.now();
      if (deliveryTime < newsletterDeliveryTime(essay)) {
        unfinished.add(essay.slug);
        continue;
      }

      try {
        await kit.deliver(recorded.broadcastId, essay, coverUrl, deliveryTime);
        publicationState.essays[essay.slug] = {
          ...publicationState.essays[essay.slug],
          newsletter: {
            broadcastId: recorded.broadcastId,
            status: "delivery-requested",
          },
        };
        await state.save(publicationState);
        stateChanged = true;
        unfinished.add(essay.slug);
      } catch (error) {
        unfinished.add(essay.slug);
        errors.push(
          `Kit delivery failed: ${essay.slug} (${messageFrom(error)})`,
        );
      }
    }
  }

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
