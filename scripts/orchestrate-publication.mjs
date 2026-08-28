import { randomUUID } from "node:crypto";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";
import { runPublication } from "../src/lib/publication-orchestrator.mjs";

const STATE_FILE = "data/publication-state.json";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const KIT_ENDPOINT = "https://api.kit.com/v4/broadcasts";

const normalizedSiteUrl = (siteUrl) => siteUrl.replace(/\/+$/, "");

const decodeHtmlAttribute = (value) =>
  value?.replace(
    /&(amp|quot|#39|lt|gt);/g,
    (entity, name) =>
      ({
        amp: "&",
        quot: '"',
        "#39": "'",
        lt: "<",
        gt: ">",
      })[name] ?? entity,
  );

const metaContent = (html, property) =>
  decodeHtmlAttribute(
    html.match(
      new RegExp(
        `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
        "i",
      ),
    )?.[1] ??
      html.match(
        new RegExp(
          `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
          "i",
        ),
      )?.[1],
  );

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
    return {
      status: "reachable",
      contentHash: contentHash ?? null,
      coverUrl: metaContent(html, "og:image") ?? null,
    };
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

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

const newsletterParagraphs = (intro) =>
  intro
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

export const renderNewsletterContent = (essay, coverUrl) => {
  const paragraphs = newsletterParagraphs(essay.newsletterIntro);
  return [
    `<p style="margin:0 0 26px;">There's a new essay up on the site. Here's what it's about &mdash; and where to read the whole thing.</p>`,
    `<p style="margin:0 0 26px;"><a href="${escapeHtml(essay.canonicalUrl)}" style="text-decoration:none;"><img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(essay.coverAlt)}" width="512" style="display:block; width:100%; max-width:512px; height:auto; border:1px solid rgba(33,29,24,0.14);"></a></p>`,
    `<h2 style="margin:0 0 16px; font-family:'Newsreader',Georgia,serif; font-size:26px; line-height:1.25; font-weight:600; letter-spacing:-0.01em;"><a href="${escapeHtml(essay.canonicalUrl)}" style="color:#211d18; text-decoration:none;">${escapeHtml(essay.title)}</a></h2>`,
    ...paragraphs.map(
      (paragraph) => `<p style="margin:0 0 26px;">${escapeHtml(paragraph)}</p>`,
    ),
    `<p style="margin:0 0 26px;"><a href="${escapeHtml(essay.canonicalUrl)}" style="color:#7e2a1e; font-weight:600; text-decoration:underline; text-underline-offset:2px;">Read the full essay &rarr;</a></p>`,
    `<p style="margin:0;">Settle in and give it a read when you have a quiet moment &mdash; I think you'll get something out of it.</p>`,
  ].join("\n");
};

const kitPublicationMarker = (essay) =>
  `[buthonestly-publication:${essay.slug}]`;

const kitPayload = (essay, coverUrl, sendAt, emailTemplateId) => ({
  subject: essay.title,
  content: renderNewsletterContent(essay, coverUrl),
  description: `New essay: ${essay.title} ${kitPublicationMarker(essay)}`,
  public: false,
  published_at: essay.publishedAt.toISOString(),
  send_at: sendAt?.toISOString() ?? null,
  preview_text: newsletterParagraphs(essay.newsletterIntro)[0].slice(0, 150),
  subscriber_filter: [{ all: [{ type: "all_subscribers" }] }],
  thumbnail_alt: essay.coverAlt,
  thumbnail_url: coverUrl,
  ...(emailTemplateId ? { email_template_id: emailTemplateId } : {}),
});

export const createKitPort = ({
  apiKey,
  fetch: request = fetch,
  endpoint = KIT_ENDPOINT,
  timeoutMs = 30_000,
  emailTemplateId,
}) => {
  const templateId = emailTemplateId ? Number(emailTemplateId) : undefined;
  if (
    templateId !== undefined &&
    (!Number.isSafeInteger(templateId) || templateId <= 0)
  ) {
    throw new TypeError("KIT_EMAIL_TEMPLATE_ID must be an integer.");
  }

  const requestJson = async (url, options = {}) => {
    if (!apiKey) throw new Error("KIT_API_KEY is not set.");
    const response = await request(url, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Kit-Api-Key": apiKey,
        ...options.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Kit returned HTTP ${response.status}${body ? `: ${body}` : ""}`,
      );
    }
    return response.json();
  };

  const callBroadcast = async (url, options) => {
    const payload = await requestJson(url, options);
    if (!payload.broadcast?.id || !payload.broadcast?.status) {
      throw new Error("Kit returned an invalid broadcast response.");
    }
    return payload.broadcast;
  };

  return {
    findDraft: async (essay) => {
      const payload = await requestJson(
        `${endpoint}?status=draft&per_page=1000`,
      );
      if (!Array.isArray(payload.broadcasts)) {
        throw new Error("Kit returned an invalid broadcast list response.");
      }
      const matches = payload.broadcasts.filter(({ description }) =>
        description?.includes(kitPublicationMarker(essay)),
      );
      if (matches.length > 1) {
        throw new Error(
          `Kit contains multiple drafts for publication marker ${kitPublicationMarker(essay)}.`,
        );
      }
      return matches[0] ?? null;
    },
    createDraft: (essay, coverUrl) =>
      callBroadcast(endpoint, {
        method: "POST",
        body: JSON.stringify(kitPayload(essay, coverUrl, null, templateId)),
      }),
    inspect: (broadcastId) => callBroadcast(`${endpoint}/${broadcastId}`),
    deliver: (broadcastId, essay, coverUrl, sendAt) =>
      callBroadcast(`${endpoint}/${broadcastId}`, {
        method: "PUT",
        body: JSON.stringify(kitPayload(essay, coverUrl, sendAt, templateId)),
      }),
  };
};

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
    kit: createKitPort({
      apiKey: process.env.KIT_API_KEY,
      emailTemplateId: process.env.KIT_EMAIL_TEMPLATE_ID,
    }),
  });

  if (result.submitted.length > 0) {
    console.log(`IndexNow accepted: ${result.submitted.join(", ")}`);
  }
  if (
    !result.deployed &&
    result.submitted.length === 0 &&
    result.pending.length === 0 &&
    !result.stateChanged &&
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
