import { randomUUID } from "node:crypto";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";
import { runPublication } from "../src/lib/publication-orchestrator.mjs";

const STATE_FILE = "data/publication-state.json";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const normalizedSiteUrl = (siteUrl) => siteUrl.replace(/\/+$/, "");

export const createProductionPort = ({
  fetch: request = fetch,
  timeoutMs = 15_000,
}) => ({
  inspect: async (essay) => {
    const response = await request(essay.canonicalUrl, {
      headers: { Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) {
      return { status: "missing", contentHash: null };
    }
    if (!response.ok) {
      return {
        status: "unavailable",
        contentHash: null,
        detail: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const contentHash = html.match(
      /\bdata-content-version\s*=\s*["']([^"']+)["']/i,
    )?.[1];
    return { status: "reachable", contentHash: contentHash ?? null };
  },
});

export const createDeploymentPort = ({
  hookUrl,
  fetch: request = fetch,
  timeoutMs = 30_000,
}) => ({
  request: async () => {
    if (!hookUrl) {
      throw new Error(
        "CF_DEPLOY_HOOK_URL is not set — create a Cloudflare Pages deploy hook.",
      );
    }
    const response = await request(hookUrl, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(
        `Cloudflare deploy hook returned HTTP ${response.status}`,
      );
    }
  },
});

export const createIndexNowPort = ({
  siteUrl,
  key,
  fetch: request = fetch,
  endpoint = INDEXNOW_ENDPOINT,
  timeoutMs = 30_000,
}) => {
  const site = normalizedSiteUrl(siteUrl);
  return {
    submit: async (urls) => {
      const response = await request(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: new URL(site).host,
          key,
          keyLocation: `${site}/${key}.txt`,
          urlList: urls,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `IndexNow returned HTTP ${response.status}${body ? `: ${body}` : ""}`,
        );
      }
    },
  };
};

const validState = (value) =>
  value?.version === 1 &&
  value.essays &&
  typeof value.essays === "object" &&
  !Array.isArray(value.essays);

const orderedState = (state) => ({
  version: 1,
  essays: Object.fromEntries(
    Object.entries(state.essays ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([slug, essayState]) => [slug, essayState]),
  ),
});

export const createFileStatePort = ({ filePath = STATE_FILE } = {}) => ({
  load: async () => {
    try {
      const state = JSON.parse(await readFile(filePath, "utf8"));
      if (!validState(state)) {
        throw new Error(`${filePath} does not contain publication state v1.`);
      }
      return state;
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 1, essays: {} };
      throw error;
    }
  },
  save: async (state) => {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(orderedState(state), null, 2)}\n`,
      );
      await rename(temporaryPath, filePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  },
});

export async function readIndexNowKey(publicDirectory = "public") {
  const candidates = (await readdir(publicDirectory))
    .filter((file) => /^[A-Za-z0-9-]{8,128}\.txt$/.test(file))
    .sort();
  for (const file of candidates) {
    const key = file.slice(0, -4);
    const body = (
      await readFile(path.join(publicDirectory, file), "utf8")
    ).trim();
    if (body === key) return key;
  }
  throw new Error(
    `No valid IndexNow key in ${publicDirectory}/. Expected <key>.txt containing exactly <key>.`,
  );
}

const createClock = () => ({
  now: () => new Date(),
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
});

async function main() {
  const siteUrl = normalizedSiteUrl(
    process.env.SITE_URL || "https://buthonestly.io",
  );
  const result = await runPublication({
    clock: createClock(),
    inventory: {
      load: ({ now }) => loadEssayInventory({ siteUrl, now }),
    },
    state: createFileStatePort(),
    deployment: createDeploymentPort({
      hookUrl: process.env.CF_DEPLOY_HOOK_URL,
    }),
    production: createProductionPort({}),
    indexNow: {
      submit: async (urls) => {
        const key = await readIndexNowKey();
        await createIndexNowPort({ siteUrl, key }).submit(urls);
      },
    },
  });

  if (result.submitted.length > 0) {
    console.log(`IndexNow accepted: ${result.submitted.join(", ")}`);
  }
  if (
    !result.deployed &&
    result.submitted.length === 0 &&
    !result.errors.length
  ) {
    console.log("Publication state is current — nothing to do.");
  }
  for (const error of result.errors) console.error(error);
  if (result.errors.length > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
