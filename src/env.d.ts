/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly FATHOM_SITE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Fathom analytics, injected by its script (prod only). Optional so callers
// guard with `?.`; see src/lib/track.ts.
interface Window {
  fathom?: { trackEvent?: (name: string) => void };
}
