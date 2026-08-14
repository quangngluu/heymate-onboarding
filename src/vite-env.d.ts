/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HUME_CONFIG_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
