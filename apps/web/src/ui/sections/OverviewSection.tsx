import { FILE_KINDS, type InventoryResult, type OverviewResult } from '@phanes/core';
import { formatBytes, formatMinutes, formatNumber } from '../format';
import { t } from '../strings.fr';

interface Props {
  overview: OverviewResult;
  inventory: InventoryResult | undefined;
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  );
}

export function OverviewSection({ overview, inventory }: Props) {
  const r = overview.renpy;
  const version = r.version ?? t.overview.unknown;
  const versionDetail = [
    r.confidence ? t.overview.confidence[r.confidence] : null,
    r.source ? t.overview.source[r.source] : null,
    r.python ? t.overview.python(r.python) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const d = overview.dialogue;
  const kinds = inventory ? FILE_KINDS.filter((k) => inventory.byKind[k].count > 0) : [];
  const maxBytes = inventory ? Math.max(1, ...kinds.map((k) => inventory.byKind[k].bytes)) : 1;
  return (
    <div className="overview">
      <h2 data-testid="game-title">
        {overview.title ?? t.overview.untitled}
        {overview.gameVersion && <span className="game-version"> {overview.gameVersion}</span>}
      </h2>
      <div className="stats">
        <Stat label={t.overview.renpyVersion} value={version} detail={versionDetail} />
        <Stat label={t.overview.labels} value={formatNumber(overview.labels)} />
        <Stat label={t.overview.lines} value={formatNumber(d.lines)} />
        <Stat
          label={t.overview.words}
          value={formatNumber(d.words)}
          {...(d.cjkChars > 0 ? { detail: `${formatNumber(d.cjkChars)} ${t.overview.cjk}` } : {})}
        />
        <Stat label={t.overview.readingTime} value={formatMinutes(overview.readingTimeMinutes)} />
        <Stat
          label={t.overview.menus}
          value={formatNumber(d.menus)}
          detail={`${formatNumber(d.choices)} ${t.overview.choices.toLowerCase()}`}
        />
        <Stat
          label={t.overview.scripts}
          value={formatNumber(overview.scripts.decoded)}
          detail={t.overview.scriptsDetail(
            overview.scripts.decoded,
            overview.scripts.compiled,
            overview.scripts.failed,
          )}
        />
        <Stat
          label={t.overview.languages}
          value={overview.languages.join(', ') || t.overview.noLanguages}
        />
      </div>
      {overview.scripts.sourceOnly > 0 && (
        <p className="note">{t.overview.sourceOnly(overview.scripts.sourceOnly)}</p>
      )}
      {inventory && kinds.length > 0 && (
        <>
          <h3>{t.overview.content}</h3>
          <table className="kinds">
            <tbody>
              {kinds.map((k) => (
                <tr key={k}>
                  <th scope="row">{t.kinds[k]}</th>
                  <td className="num">{formatNumber(inventory.byKind[k].count)}</td>
                  <td className="num">{formatBytes(inventory.byKind[k].bytes)}</td>
                  <td className="bar-cell">
                    <div
                      className="mini-bar"
                      style={{ width: `${(inventory.byKind[k].bytes / maxBytes) * 100}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
