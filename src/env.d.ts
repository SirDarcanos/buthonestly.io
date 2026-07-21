/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly FATHOM_SITE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by the Fathom script, which loads in prod only — hence optional.
interface Window {
  fathom?: { trackEvent?: (name: string) => void };
}
