import { t } from './strings.fr';

interface Props {
  label: string;
  done?: number;
  total?: number;
  detail?: string | null;
  onCancel?: () => void;
}

export function Progress({ label, done = 0, total = 0, detail = null, onCancel }: Props) {
  const ratio = total > 0 ? Math.min(1, done / total) : null;
  return (
    <section className="progress" aria-busy="true" data-testid="progress">
      <h2>{label}</h2>
      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className={ratio === null ? 'fill indeterminate' : 'fill'}
          style={{ width: `${(ratio ?? 1) * 100}%` }}
        />
      </div>
      {total > 0 && (
        <p className="count">
          {done.toLocaleString('fr-FR')} / {total.toLocaleString('fr-FR')}
        </p>
      )}
      {detail && <p className="detail">{detail}</p>}
      {onCancel && (
        <button type="button" className="secondary" onClick={onCancel}>
          {t.progress.cancel}
        </button>
      )}
    </section>
  );
}
