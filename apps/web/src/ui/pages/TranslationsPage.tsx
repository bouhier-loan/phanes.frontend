import { useState } from 'react';
import { Callout, Meter, PageHeader } from '../components/ui';
import { formatLocation, formatNumber, formatPercentRounded } from '../format';
import { useReport } from '../report';
import { t } from '../strings.fr';

const ORPHANS = 3;

export function TranslationsPage() {
  const r = useReport();
  const result = r.translations;
  const tr = t.translations;
  const [language, setLanguage] = useState<string | null>(null);
  const [allOrphans, setAllOrphans] = useState(false);
  if (!result) return <p className="empty">{t.unavailable}</p>;
  const current = result.languages.find((l) => l.language === language) ?? result.languages[0];
  const header = (
    <PageHeader
      crumbs={t.crumbs(r.title, t.groups.resources)}
      title={t.sections.traductions}
      lede={tr.lede}
    />
  );
  if (result.languages.length === 0)
    return (
      <>
        {header}
        <p className="empty">{tr.none}</p>
      </>
    );
  const overall = (l: (typeof result.languages)[number]) =>
    formatPercentRounded(
      l.dialogue.translated + l.strings.translated,
      l.dialogue.total + l.strings.total,
    );
  const orphans = current?.orphans ?? [];
  return (
    <>
      {header}
      {result.partial && <Callout tone="info">{tr.partial}</Callout>}

      <section aria-label={tr.languagesLabel} className="grid-3" data-testid="translations">
        <div className="card card-pad language-card default">
          <div>
            <h2>{tr.default}</h2>
            <span className="small faint">{tr.defaultNote}</span>
          </div>
          <dl className="kv kv-inline">
            <div>
              <dt>{tr.lines}</dt>
              <dd className="mono">{formatNumber(result.default.dialogue)}</dd>
            </div>
            <div>
              <dt>{tr.strings}</dt>
              <dd className="mono">{formatNumber(result.default.strings)}</dd>
            </div>
          </dl>
        </div>
        {result.languages.map((l) => (
          <div key={l.language} className="card card-pad language-card">
            <div className="language-head">
              <div>
                <h2 className="mono">{l.language}</h2>
                <span className="mono small faint">{tr.files(l.language, l.files)}</span>
              </div>
              <span className="language-percent">{overall(l)}</span>
            </div>
            <div className="coverage">
              <div className="list-row">
                <span>{tr.lines}</span>
                <span className="mono small muted">
                  {formatNumber(l.dialogue.translated)} / {formatNumber(l.dialogue.total)}
                </span>
              </div>
              <Meter
                ratio={l.dialogue.total === 0 ? 0 : l.dialogue.translated / l.dialogue.total}
              />
            </div>
            <div className="coverage">
              <div className="list-row">
                <span>{tr.strings}</span>
                <span className="mono small muted">
                  {formatNumber(l.strings.translated)} / {formatNumber(l.strings.total)}
                </span>
              </div>
              <Meter
                ratio={l.strings.total === 0 ? 0 : l.strings.translated / l.strings.total}
                tone="blue"
              />
            </div>
            <p className={l.orphans.length > 0 ? 'small text-red' : 'small faint'}>
              {tr.orphans(l.orphans.length)}
            </p>
            {l.strings.extra > 0 && <p className="small faint">{tr.extra(l.strings.extra)}</p>}
          </div>
        ))}
      </section>

      {current && (
        <section aria-labelledby="titre-detail" className="card card-pad">
          <div className="card-title-row">
            <h2 id="titre-detail">
              {tr.missingIn}
              <span className="mono text-amber">{current.language}</span>
            </h2>
            {result.languages.length > 1 && (
              <div role="group" aria-label={tr.languageLabel} className="chips">
                {result.languages.map((l) => (
                  <button
                    key={l.language}
                    type="button"
                    className="chip mono"
                    aria-pressed={l.language === current.language}
                    onClick={() => {
                      setLanguage(l.language);
                      setAllOrphans(false);
                    }}
                  >
                    {l.language}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="split">
            <div className="split-main table-wrap">
              <table className="table">
                <caption className="table-caption">{tr.missingCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{tr.columns.file}</th>
                    <th scope="col" className="right">
                      {tr.columns.missing}
                    </th>
                    <th scope="col">{tr.columns.coverage}</th>
                  </tr>
                </thead>
                <tbody>
                  {current.missingByFile.map((f) => (
                    <tr key={f.file}>
                      <td className="mono">{f.file.replace(/^game\//, '')}</td>
                      <td className="right mono num">{formatNumber(f.missing)}</td>
                      <td>
                        <div className="share">
                          <Meter ratio={f.total === 0 ? 0 : (f.total - f.missing) / f.total} />
                          <span className="mono small">
                            {formatPercentRounded(f.total - f.missing, f.total)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="split-aside orphans">
              <h3>{tr.orphans(orphans.length)}</h3>
              {orphans.length === 0 ? (
                <p className="small faint">{tr.noOrphans}</p>
              ) : (
                <>
                  <p className="small muted">{tr.orphansNote(current.language)}</p>
                  <ul className="list">
                    {(allOrphans ? orphans : orphans.slice(0, ORPHANS)).map((o) => (
                      <li key={`${o.id}:${o.loc.line}`} className="site">
                        <code>{o.id}</code>
                        <span>{formatLocation(o.loc)}</span>
                      </li>
                    ))}
                  </ul>
                  {!allOrphans && orphans.length > ORPHANS && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setAllOrphans(true);
                      }}
                    >
                      {t.others(orphans.length - ORPHANS)}
                    </button>
                  )}
                  <p className="small faint">{tr.orphansHint}</p>
                </>
              )}
            </div>
          </div>
          <p className="small faint">{tr.stringsNote}</p>
        </section>
      )}
    </>
  );
}
