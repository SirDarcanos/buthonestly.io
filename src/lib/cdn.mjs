// R2 buckets are served directly from dedicated subdomains (Cloudflare R2
// custom domains) — downloads (attachments) and static assets (inline).
// The old /downloads/* and /static/* paths 301 here via public/_redirects.
// .mjs so both Astro components and the remark/build scripts can import it.
export const STATIC_BASE = "https://static.buthonestly.io";
export const DOWNLOADS_BASE = "https://downloads.buthonestly.io";
