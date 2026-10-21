import * as oauth from 'oauth4webapi';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { loadFonts } from '../fonts';
import { Logo } from '../ui/components/icons';
import { t } from '../ui/strings.fr';
import { completeSignIn, isCallback, signIn, signOut, StateMismatch } from './oidc';
import { type Session, StorageUnavailable, store } from './session';

/** `VITE_AUTH=off` turns sign-in off, for local development only. */
const DISABLED = import.meta.env.VITE_AUTH === 'off';
if (DISABLED) loadFonts();

type GateState =
  | { step: 'loading' }
  | { step: 'ready'; session: Session | null }
  | { step: 'error'; message: string };

interface SessionValue {
  readonly session: Session;
  readonly signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/** The signed-in user, or null when sign-in is disabled. */
export function useSession(): SessionValue | null {
  return useContext(SessionContext);
}

function messageOf(error: unknown): string {
  if (error instanceof StorageUnavailable) return t.auth.storage;
  if (error instanceof StateMismatch) return t.auth.stateMismatch;
  if (error instanceof oauth.AuthorizationResponseError)
    return t.auth.refused(error.error_description ?? error.error);
  if (error instanceof TypeError) return t.auth.unreachable;
  return t.auth.invalid(error instanceof Error ? error.message : String(error));
}

/**
 * Resolves to the session, or to null while the page leaves for the provider.
 * Started once per page load (React may run effects twice).
 */
let started: Promise<Session | null> | null = null;

function start(): Promise<Session | null> {
  started ??= (async () => {
    if (isCallback()) {
      const session = await completeSignIn();
      history.replaceState(null, '', '/');
      return session;
    }
    const session = store.session();
    if (session && session.expiresAt > Date.now()) return session;
    await signIn();
    return null;
  })();
  return started;
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="auth-screen">
      <Logo size={40} />
      {children}
    </main>
  );
}

/**
 * Renders the app only for a signed-in user. Every request to the provider
 * happens here, before the app renders: an analysis never triggers one.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>(
    DISABLED ? { step: 'ready', session: null } : { step: 'loading' },
  );

  useEffect(() => {
    if (DISABLED) return;
    let active = true;
    start().then(
      (session) => {
        if (!session) return;
        // Before the app mounts: its request counter starts after these.
        loadFonts();
        if (active) setState({ step: 'ready', session });
      },
      (error: unknown) => {
        if (active) setState({ step: 'error', message: messageOf(error) });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (state.step === 'loading')
    return (
      <Screen>
        <p role="status">{t.auth.signingIn}</p>
      </Screen>
    );
  if (state.step === 'error')
    return (
      <Screen>
        <h1>{t.auth.errorTitle}</h1>
        <p role="alert" className="muted">
          {state.message}
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            window.location.assign('/');
          }}
        >
          {t.auth.retry}
        </button>
      </Screen>
    );
  const session = state.session;
  if (!session) return <>{children}</>;
  const value: SessionValue = {
    session,
    signOut: () => {
      void signOut(session);
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
