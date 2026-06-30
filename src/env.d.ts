/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly WP_SITE_ID: string;
  readonly FATHOM_SITE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
