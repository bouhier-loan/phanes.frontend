/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "off" disables the OIDC sign-in (local development only). */
  readonly VITE_AUTH?: string;
}
