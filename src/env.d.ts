/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly FATHOM_SITE_ID: string;
  // Set by Cloudflare Pages CI; absent in local builds.
  readonly CF_PAGES_BRANCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by the Fathom script, which loads in prod only — hence optional.
interface Window {
  fathom?: { trackEvent?: (name: string) => void };
}
