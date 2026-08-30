import { LIGHTHOUSE_MATRIX } from "./lighthouse-monitoring.mjs";

const METRICS = Object.freeze({
  largest_contentful_paint: "lcpMs",
  cumulative_layout_shift: "cls",
  interaction_to_next_paint: "inpMs",
});

export const normalizeCruxRecord = (payload, scope) => {
  if (!payload || typeof payload !== "object")
    throw new Error("CrUX response is malformed.");
  if (!payload.record)
    return { scope, status: "insufficient field data", metrics: null };
  const source = payload.record.metrics;
  if (!source || typeof source !== "object" || Array.isArray(source))
    throw new Error("CrUX response has malformed metrics.");
  const providerMetrics = Object.keys(METRICS);
  if (
    providerMetrics.some((providerName) => !Object.hasOwn(source, providerName))
  ) {
    return { scope, status: "insufficient field data", metrics: null };
  }
  const metrics = {};
  for (const [providerName, name] of Object.entries(METRICS)) {
    const providerMetric = source[providerName];
    if (
      !providerMetric ||
      typeof providerMetric !== "object" ||
      Array.isArray(providerMetric) ||
      !providerMetric.percentiles ||
      typeof providerMetric.percentiles !== "object" ||
      Array.isArray(providerMetric.percentiles)
    ) {
      throw new Error(`CrUX response has malformed ${providerName}.`);
    }
    const value = providerMetric.percentiles.p75;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`CrUX response has invalid ${providerName} p75.`);
    }
    metrics[name] = value;
  }
  return { scope, status: "available", metrics };
};

export const createCruxPort = ({
  apiKey,
  fetch: request = fetch,
  endpoint = "https://chromeuxreport.googleapis.com/v1/records:queryRecord",
  timeoutMs = 15_000,
} = {}) => {
  const query = async (body, scope) => {
    if (!apiKey)
      return {
        scope,
        status: "field data unavailable: CRUX_API_KEY is not set",
        metrics: null,
      };
    try {
      const response = await request(
        `${endpoint}?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, formFactor: "PHONE" }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (response.status === 404)
        return { scope, status: "insufficient field data", metrics: null };
      if (!response.ok)
        return {
          scope,
          status: `field data provider error: HTTP ${response.status}`,
          metrics: null,
        };
      return normalizeCruxRecord(await response.json(), scope);
    } catch (error) {
      if (/malformed|invalid|no metrics/u.test(error?.message ?? ""))
        throw error;
      return {
        scope,
        status: `field data provider error: ${error instanceof Error ? error.message : String(error)}`,
        metrics: null,
      };
    }
  };
  return {
    origin: (origin) => query({ origin }, origin),
    url: (url) => query({ url }, new URL(url).pathname),
  };
};

export async function collectCruxFieldData({
  port,
  siteUrl = "https://buthonestly.io",
  routes = LIGHTHOUSE_MATRIX,
}) {
  const origin = new URL(siteUrl).origin;
  return {
    source: "Chrome UX Report (CrUX), separate from Search Console",
    formFactor: "PHONE",
    origin: await port.origin(origin),
    urls: await Promise.all(
      routes.map((route) => port.url(new URL(route, origin).toString())),
    ),
  };
}
