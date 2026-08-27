// Rebuild the site only when a scheduled essay has come due but isn't live yet.
// Run hourly: POSTing the deploy hook only on a due-but-404 essay keeps builds
// to ~3×/year instead of a daily blind rebuild, and a skipped run self-heals.
//
// Env: CF_DEPLOY_HOOK_URL (required), SITE_URL (default https://buthonestly.io).

import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";

const HOOK = process.env.CF_DEPLOY_HOOK_URL;
const SITE = (process.env.SITE_URL || "https://buthonestly.io").replace(
  /\/+$/,
  "",
);
const ROOT = "src/content/essays";

if (!HOOK) {
  console.error("CF_DEPLOY_HOOK_URL is not set — create a Pages deploy hook.");
  process.exit(1);
}

const dueButMissing = [];
const inventory = loadEssayInventory({ essaysDirectory: ROOT, siteUrl: SITE });
for (const essay of inventory.published) {
  const res = await fetch(essay.canonicalUrl, { method: "HEAD" });
  if (res.status === 404) dueButMissing.push(essay.slug);
}

if (dueButMissing.length === 0) {
  console.log("Nothing due but missing — no rebuild needed.");
  process.exit(0);
}

console.log(
  `Due but not live: ${dueButMissing.join(", ")} — triggering build.`,
);
const res = await fetch(HOOK, { method: "POST" });
console.log(`Deploy hook: HTTP ${res.status}`);
if (!res.ok) process.exit(1);
