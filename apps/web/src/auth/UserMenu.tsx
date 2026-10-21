import { LogOutIcon } from '../ui/components/icons';
import { t } from '../ui/strings.fr';
import { useSession } from './AuthGate';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [name];
  return letters
    .map((p) => (p ?? '').charAt(0))
    .join('')
    .toUpperCase();
}

/** The signed-in user and a sign-out button; nothing when sign-in is off. */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const value = useSession();
  if (!value) return null;
  const { session } = value;
  if (compact)
    return (
      <div className="user-compact">
        <span className="avatar" aria-hidden="true">
          {initials(session.name)}
        </span>
        <span className="visually-hidden">
          {t.auth.signedInAs} : {session.name}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={value.signOut}
          title={session.email ?? session.name}
        >
          <LogOutIcon />
          {t.auth.signOut}
        </button>
      </div>
    );
  return (
    <>
      <p className="user-row" data-testid="user">
        <span className="avatar" aria-hidden="true">
          {initials(session.name)}
        </span>
        <span title={session.email ?? undefined}>
          <span className="visually-hidden">{t.auth.signedInAs} : </span>
          {session.name}
        </span>
      </p>
      <button type="button" className="nav-link" onClick={value.signOut}>
        <span>{t.auth.signOut}</span>
        <LogOutIcon />
      </button>
    </>
  );
}
