/** What the app keeps about the signed-in user, for the tab's lifetime. */
export interface Session {
  readonly sub: string;
  readonly name: string;
  readonly email: string | null;
  /** Raw ID token, only sent back as id_token_hint when signing out. */
  readonly idToken: string;
  /** Expiry of the ID token (ms since epoch), checked only when the page loads. */
  readonly expiresAt: number;
}

/** Parameters of a sign-in in progress, kept across the redirect. */
export interface Pending {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
}

const SESSION_KEY = 'phanes.auth.session';
const PENDING_KEY = 'phanes.auth.pending';

export class StorageUnavailable extends Error {
  override readonly name = 'StorageUnavailable';
}

function storage(): Storage {
  try {
    const s = window.sessionStorage;
    s.setItem('phanes.auth.probe', '1');
    s.removeItem('phanes.auth.probe');
    return s;
  } catch (error) {
    throw new StorageUnavailable('sessionStorage is unavailable', { cause: error });
  }
}

function read<T>(key: string, valid: (value: unknown) => value is T): T | null {
  const raw = storage().getItem(key);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    typeof value.sub === 'string' &&
    typeof value.name === 'string' &&
    (value.email === null || typeof value.email === 'string') &&
    typeof value.idToken === 'string' &&
    typeof value.expiresAt === 'number'
  );
}

function isPending(value: unknown): value is Pending {
  return (
    isRecord(value) &&
    typeof value.state === 'string' &&
    typeof value.nonce === 'string' &&
    typeof value.verifier === 'string'
  );
}

export const store = {
  /** Fails with StorageUnavailable when sessionStorage cannot be used. */
  check(): void {
    storage();
  },
  session: () => read(SESSION_KEY, isSession),
  saveSession(session: Session): void {
    storage().setItem(SESSION_KEY, JSON.stringify(session));
  },
  pending: () => read(PENDING_KEY, isPending),
  savePending(pending: Pending): void {
    storage().setItem(PENDING_KEY, JSON.stringify(pending));
  },
  clearPending(): void {
    storage().removeItem(PENDING_KEY);
  },
  clear(): void {
    const s = storage();
    s.removeItem(SESSION_KEY);
    s.removeItem(PENDING_KEY);
  },
};
