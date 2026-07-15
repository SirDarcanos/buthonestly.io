/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly FATHOM_SITE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
