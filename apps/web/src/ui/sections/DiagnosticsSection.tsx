import type { Diagnostic } from '@phanes/core';
import { describeDiagnostic, t } from '../strings.fr';

const ORDER: Record<Diagnostic['severity'], number> = { error: 0, warning: 1, info: 2 };

export function DiagnosticsSection({ diagnostics }: { diagnostics: readonly Diagnostic[] }) {
  if (diagnostics.length === 0) return <p className="empty">{t.diagnostics.none}</p>;
  const sorted = [...diagnostics].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const count = (s: Diagnostic['severity']) => diagnostics.filter((d) => d.severity === s).length;
  return (
    <div data-testid="diagnostics">
      <p>{t.diagnostics.summary(count('error'), count('warning'), count('info'))}</p>
      <ul className="diagnostics">
        {sorted.map((d, i) => (
          <li key={i} className={`diagnostic ${d.severity}`}>
            <span className="severity">{t.diagnostics.severity[d.severity]}</span>
            {d.path && <span className="mono path">{d.path}</span>}
            <span className="text">{describeDiagnostic(d)}</span>
            <code className="code">{d.code}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
