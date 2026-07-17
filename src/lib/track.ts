// Fire a Fathom analytics event. No-ops when Fathom isn't present — dev builds
// (it's prod-only, see Head.astro), ad-blocked visitors, or before the script
// loads — so callers never need to guard. Keep event names Title Case and
// stable; renaming one splits its history in Fathom. Never pass PII.
export function track(name: string): void {
  window.fathom?.trackEvent?.(name);
}
