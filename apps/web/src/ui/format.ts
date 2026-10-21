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

export function formatPercent(part: number, total: number): string {
  return total === 0 ? '0 %' : `${decimal.format((part / total) * 100)} %`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'moins d’une minute';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')}`;
}
