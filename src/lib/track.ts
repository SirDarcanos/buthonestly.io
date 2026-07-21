// No-ops when Fathom is absent — dev builds (it's prod-only, see Head.astro),
// ad-blocked visitors, or before the script loads — so callers never guard.
// Keep names Title Case and stable: renaming one splits its history in Fathom.
export function track(name: string): void {
  window.fathom?.trackEvent?.(name);
}
