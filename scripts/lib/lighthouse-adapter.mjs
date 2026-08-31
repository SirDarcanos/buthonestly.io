import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import CDP from "chrome-remote-interface";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const numeric = (value, name) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Lighthouse output has invalid ${name}.`);
  }
  return value;
};

const categoryScore = (lhr, key) => {
  const score = numeric(lhr.categories?.[key]?.score, `${key} score`);
  if (score > 1) throw new Error(`Lighthouse output has invalid ${key} score.`);
  return score;
};

export const normalizeLighthouseResult = (lhr, { siteOrigin }) => {
  if (lhr?.lighthouseVersion == null || !lhr.audits || !lhr.categories) {
    throw new Error("Lighthouse output is malformed.");
  }
  if (lhr.runtimeError) {
    throw new Error(
      `Lighthouse route failed: ${lhr.runtimeError.message ?? lhr.runtimeError.code ?? "unknown navigation error"}.`,
    );
  }
  const status = lhr.audits["http-status-code"];
  if (!status || status.score !== 1) {
    throw new Error(
      `Lighthouse route failed with HTTP status ${status?.numericValue ?? status?.displayValue ?? "unknown"}.`,
    );
  }
  const networkRequests = lhr.audits["network-requests"]?.details?.items;
  if (!Array.isArray(networkRequests))
    throw new Error("Lighthouse output lacks network request details.");
  const origin = new URL(siteOrigin).origin;
  let firstPartyTransferBytes = 0;
  let thirdPartyTransferBytes = 0;
  let scriptTransferBytes = 0;
  for (const request of networkRequests) {
    const bytes = numeric(request.transferSize ?? 0, "network transfer size");
    let firstParty = false;
    try {
      firstParty = new URL(request.url).origin === origin;
    } catch {
      throw new Error(
        "Lighthouse output contains an invalid network request URL.",
      );
    }
    if (firstParty) firstPartyTransferBytes += bytes;
    else thirdPartyTransferBytes += bytes;
    if (firstParty && request.resourceType === "Script")
      scriptTransferBytes += bytes;
  }
  return {
    workload: "navigation",
    metrics: {
      lcpMs: numeric(
        lhr.audits["largest-contentful-paint"]?.numericValue,
        "LCP",
      ),
      cls: numeric(lhr.audits["cumulative-layout-shift"]?.numericValue, "CLS"),
      scriptTransferBytes,
      mainThreadWorkMs: numeric(
        lhr.audits["mainthread-work-breakdown"]?.numericValue,
        "main-thread work",
      ),
      firstPartyTransferBytes,
      thirdPartyTransferBytes,
      performance: categoryScore(lhr, "performance"),
      accessibility: categoryScore(lhr, "accessibility"),
      bestPractices: categoryScore(lhr, "best-practices"),
      seo: categoryScore(lhr, "seo"),
    },
  };
};

const runNavigation = async ({ url, device, chromePath }) => {
  const chrome = await launch({
    chromePath,
    chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const output = await lighthouse(url, {
      port: chrome.port,
      output: ["json", "html"],
      logLevel: "error",
      formFactor: device,
      screenEmulation:
        device === "desktop"
          ? {
              mobile: false,
              width: 1350,
              height: 940,
              deviceScaleFactor: 1,
              disabled: false,
            }
          : undefined,
      throttlingMethod: "simulate",
    });
    if (!output?.lhr || !Array.isArray(output.report))
      throw new Error("Lighthouse did not create JSON and HTML reports.");
    return { lhr: output.lhr, json: output.report[0], html: output.report[1] };
  } finally {
    await chrome.kill();
  }
};

export async function waitForNetworkQuiescence({
  pendingRequests,
  lastActivityAt,
  timeoutMs = 5_000,
  quietMs = 500,
  pollMs = 50,
  now = Date.now,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const startedAt = now();
  while (now() - startedAt < timeoutMs) {
    if (pendingRequests.size === 0 && now() - lastActivityAt() >= quietMs) {
      return { timedOut: false, waitedMs: now() - startedAt };
    }
    await sleep(Math.min(pollMs, timeoutMs - (now() - startedAt)));
  }
  throw new Error(
    `Cold-scroll network did not become idle within ${timeoutMs}ms.`,
  );
}

const runColdScroll = async ({ url, device, chromePath, siteOrigin }) => {
  const chrome = await launch({
    chromePath,
    chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const client = await CDP({ port: chrome.port });
  const requests = new Map();
  const pendingRequests = new Set();
  let lastNetworkActivityAt = Date.now();
  let layoutShift = 0;
  try {
    const { Emulation, Network, Page, Runtime, Performance } = client;
    await Promise.all([Network.enable(), Page.enable(), Performance.enable()]);
    await Emulation.setDeviceMetricsOverride(
      device === "desktop"
        ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1 }
        : { mobile: true, width: 412, height: 823, deviceScaleFactor: 2.625 },
    );
    await Network.setCacheDisabled({ cacheDisabled: true });
    await Page.addScriptToEvaluateOnNewDocument({
      source:
        "globalThis.__lighthouseLayoutShifts=[];new PerformanceObserver(list=>globalThis.__lighthouseLayoutShifts.push(...list.getEntries().filter(entry=>!entry.hadRecentInput).map(entry=>entry.value))).observe({type:'layout-shift',buffered:true});",
    });
    Network.requestWillBeSent(({ requestId, request }) => {
      pendingRequests.add(requestId);
      lastNetworkActivityAt = Date.now();
      requests.set(requestId, { url: request.url });
    });
    Network.responseReceived(({ requestId, response, type }) => {
      lastNetworkActivityAt = Date.now();
      requests.set(requestId, {
        ...requests.get(requestId),
        url: response.url,
        type,
      });
    });
    Network.loadingFinished(({ requestId, encodedDataLength }) => {
      const request = requests.get(requestId);
      if (request) request.transferSize = encodedDataLength;
      pendingRequests.delete(requestId);
      lastNetworkActivityAt = Date.now();
    });
    Network.loadingFailed(({ requestId }) => {
      pendingRequests.delete(requestId);
      lastNetworkActivityAt = Date.now();
    });
    await Page.navigate({ url });
    await Page.loadEventFired();
    for (let position = 0; position <= 1; position += 0.1) {
      await Runtime.evaluate({
        expression: `scrollTo(0, (document.documentElement.scrollHeight-innerHeight)*${position})`,
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const networkQuiescence = await waitForNetworkQuiescence({
      pendingRequests,
      lastActivityAt: () => lastNetworkActivityAt,
    });
    const shifts = await Runtime.evaluate({
      expression: "JSON.stringify(globalThis.__lighthouseLayoutShifts ?? [])",
      returnByValue: true,
    });
    layoutShift = JSON.parse(shifts.result.value ?? "[]").reduce(
      (sum, value) => sum + value,
      0,
    );
    const origin = new URL(siteOrigin).origin;
    const firstPartyImages = [...requests.values()].filter(
      ({ url: requestUrl, type }) => {
        try {
          return type === "Image" && new URL(requestUrl).origin === origin;
        } catch {
          return false;
        }
      },
    );
    const firstPartyTransferBytes = firstPartyImages.reduce(
      (sum, request) => sum + (request.transferSize ?? 0),
      0,
    );
    const evidence = {
      workload: "cold-scroll",
      url,
      firstPartyImageTransferBytes: firstPartyTransferBytes,
      layoutShift,
      requests: firstPartyImages,
      networkQuiescence,
    };
    return {
      evidence,
      normalized: {
        workload: "cold-scroll",
        metrics: {
          firstPartyImageTransferBytes: firstPartyTransferBytes,
          layoutShift,
        },
      },
    };
  } finally {
    await client.close();
    await chrome.kill();
  }
};

const safeName = (value) =>
  value.replaceAll(/[^a-z0-9.-]+/giu, "-").replace(/^-|-$/gu, "") || "home";

export const createLighthouseAuditor = ({
  targets,
  artifactDirectory,
  chromePath = process.env.CHROME_PATH,
  navigationRunner = runNavigation,
  scrollRunner = runColdScroll,
}) => ({
  audit: async ({ route, device, revision, workload, run }) => {
    const target = targets[revision];
    if (!target)
      throw new Error(`No Lighthouse target for revision ${revision}.`);
    const url = new URL(route, target).toString();
    const basename = [
      safeName(revision),
      device,
      safeName(route),
      workload,
      run,
    ].join("-");
    await mkdir(artifactDirectory, { recursive: true });
    if (workload === "cold-scroll") {
      const output = await scrollRunner({
        url,
        device,
        chromePath,
        siteOrigin: target,
      });
      const evidencePath = path.join(artifactDirectory, `${basename}.json`);
      await writeFile(
        evidencePath,
        `${JSON.stringify(output.evidence, null, 2)}\n`,
      );
      return { ...output.normalized, evidence: evidencePath };
    }
    const output = await navigationRunner({ url, device, chromePath });
    const jsonPath = path.join(artifactDirectory, `${basename}.json`);
    const htmlPath = path.join(artifactDirectory, `${basename}.html`);
    await Promise.all([
      writeFile(jsonPath, output.json),
      writeFile(htmlPath, output.html),
    ]);
    const normalized = normalizeLighthouseResult(output.lhr, {
      siteOrigin: target,
    });
    return { ...normalized, evidence: { json: jsonPath, html: htmlPath } };
  },
});
