/*
 * Trusted Types: the CSP requires them for script sinks. The only script URL
 * the app ever loads is its own worker, so the default policy accepts
 * same-origin build assets and nothing else. This module must be imported
 * first, before anything creates the worker.
 */

interface TrustedTypePolicyOptionsLike {
  createScriptURL?: (input: string) => string;
}

interface TrustedTypesLike {
  createPolicy(name: string, options: TrustedTypePolicyOptionsLike): unknown;
}

const factory = (globalThis as { trustedTypes?: TrustedTypesLike }).trustedTypes;

factory?.createPolicy('default', {
  createScriptURL(input) {
    const url = new URL(input, document.baseURI);
    if (
      url.origin === location.origin &&
      url.pathname.startsWith('/assets/') &&
      url.pathname.endsWith('.js')
    ) {
      return url.href;
    }
    throw new TypeError(`Blocked script URL: ${input}`);
  },
});
