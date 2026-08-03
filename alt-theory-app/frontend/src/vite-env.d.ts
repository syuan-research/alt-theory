/// <reference types="vite/client" />

declare module "@phosphor-icons/web/regular";

declare const __ALT_THEORY_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
