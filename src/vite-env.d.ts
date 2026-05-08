/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NAMESTONE_API_KEY?: string;
  readonly VITE_NAMESTONE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
