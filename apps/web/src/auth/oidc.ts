import * as oauth from 'oauth4webapi';
import { OIDC_CALLBACK_PATH, OIDC_CLIENT_ID, OIDC_ISSUER, OIDC_SCOPES } from './config';
import { type Session, store } from './session';

const issuer = new URL(OIDC_ISSUER);
const client: oauth.Client = { client_id: OIDC_CLIENT_ID };

export function redirectUri(): string {
  return `${window.location.origin}${OIDC_CALLBACK_PATH}`;
}

export function isCallback(): boolean {
  return window.location.pathname === OIDC_CALLBACK_PATH;
}

async function discover(): Promise<oauth.AuthorizationServer> {
  const response = await oauth.discoveryRequest(issuer, { algorithm: 'oidc' });
  return oauth.processDiscoveryResponse(issuer, response);
}

/** Starts a sign-in: PKCE challenge, state and nonce, then leaves for the provider. */
export async function signIn(): Promise<void> {
  store.check();
  const as = await discover();
  if (!as.authorization_endpoint) throw new Error('no authorization endpoint');
  const verifier = oauth.generateRandomCodeVerifier();
  const state = oauth.generateRandomState();
  const nonce = oauth.generateRandomNonce();
  store.savePending({ state, nonce, verifier });
  const url = new URL(as.authorization_endpoint);
  url.searchParams.set('client_id', OIDC_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', OIDC_SCOPES);
  url.searchParams.set('code_challenge', await oauth.calculatePKCECodeChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  window.location.assign(url.href);
}

export class StateMismatch extends Error {
  override readonly name = 'StateMismatch';
}

/** Completes a sign-in on the callback URL and returns the new session. */
export async function completeSignIn(): Promise<Session> {
  const pending = store.pending();
  store.clearPending();
  if (!pending) throw new StateMismatch('no sign-in in progress');
  const as = await discover();
  const params = oauth.validateAuthResponse(
    as,
    client,
    new URL(window.location.href),
    pending.state,
  );
  const response = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    oauth.None(),
    params,
    redirectUri(),
    pending.verifier,
  );
  const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
    expectedNonce: pending.nonce,
    requireIdToken: true,
  });
  const claims = oauth.getValidatedIdTokenClaims(result);
  if (!claims || !result.id_token) throw new Error('no ID token');
  const text = (key: string) => {
    const value = claims[key];
    return typeof value === 'string' && value !== '' ? value : null;
  };
  const session: Session = {
    sub: claims.sub,
    name:
      text('name') ??
      text('display_name') ??
      text('preferred_username') ??
      text('email') ??
      claims.sub,
    email: text('email'),
    idToken: result.id_token,
    expiresAt: claims.exp * 1000,
  };
  store.saveSession(session);
  return session;
}

/** Forgets the session and ends it at the provider. */
export async function signOut(session: Session): Promise<void> {
  store.clear();
  try {
    const as = await discover();
    if (as.end_session_endpoint) {
      const url = new URL(as.end_session_endpoint);
      url.searchParams.set('id_token_hint', session.idToken);
      url.searchParams.set('client_id', OIDC_CLIENT_ID);
      url.searchParams.set('post_logout_redirect_uri', `${window.location.origin}/`);
      window.location.assign(url.href);
      return;
    }
  } catch {
    // The local session is gone; the provider's will expire on its own.
  }
  window.location.assign('/');
}
