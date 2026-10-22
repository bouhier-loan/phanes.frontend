const UNITS = ['o', 'Ko', 'Mo', 'Go', 'To'];
const number = new Intl.NumberFormat('fr-FR');
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? number.format(value) : decimal.format(value)} ${UNITS[unit] ?? ''}`;
}

export function formatNumber(value: number): string {
  return number.format(value);
}

export function formatDecimal(value: number): string {
  return decimal.format(value);
}

export function formatPercent(part: number, total: number): string {
  return total === 0 ? '0 %' : `${decimal.format((part / total) * 100)} %`;
}

/** Rounded percentage, e.g. "62 %". */
export function formatPercentRounded(part: number, total: number): string {
  return total === 0 ? '0 %' : `${Math.round((part / total) * 100)} %`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'moins d’une minute';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Elapsed time as "mm:ss". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** A duration such as "1 min 08" or "12 s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')}`;
}

/** "file:line" as shown in the report. */
export function formatLocation(loc: { file: string; line: number }): string {
  return `${loc.file.replace(/^game\//, '')}:${loc.line}`;
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** A media duration as "m:ss" ('' when unknown). */
export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}
