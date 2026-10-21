import { UserMenu } from '../../auth/UserMenu';
import { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  Logo,
  PlusIcon,
} from '../components/icons';
import { formatBytes, formatNumber } from '../format';
import { useNetworkRequests } from '../network';
import { useReport } from '../report';
import { href, type Section } from '../route';
import { t } from '../strings.fr';

interface Item {
  readonly section: Section;
  readonly badge?: number | undefined;
  readonly alert?: boolean;
}

function NavLink({ item, current }: { item: Item; current: Section }) {
  return (
    <a
      href={href(item.section)}
      className="nav-link"
      aria-current={item.section === current ? 'page' : undefined}
    >
      <span>{t.sections[item.section]}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className={item.alert ? 'badge badge-alert' : 'badge'}>
          {formatNumber(item.badge)}
        </span>
      )}
    </a>
  );
}

export function SideNav({ current, onReset }: { current: Section; onReset: () => void }) {
  const r = useReport();
  // Under 860 px the navigation folds behind a menu button.
  const [open, setOpen] = useState(false);
  const requests = useNetworkRequests();
  const errors = r.diagnostics.filter((d) => d.severity === 'error').length;
  const missing = (r.assets?.images.totals.missing ?? 0) + (r.assets?.audio.totals.missing ?? 0);
  const groups: { title: string; items: Item[] }[] = [
    {
      title: t.groups.report,
      items: [
        { section: 'vue-ensemble' },
        { section: 'inventaire', badge: r.inventory?.entries.length },
        { section: 'personnages', badge: r.characters?.characters.length },
        { section: 'labels', badge: r.labels?.labels.length },
        { section: 'diagnostics', badge: r.diagnostics.length, alert: errors > 0 },
      ],
    },
    {
      title: t.groups.story,
      items: [
        { section: 'graphe' },
        { section: 'choix', badge: r.menus?.totals.menus },
        { section: 'variables', badge: r.variables?.totals.variables },
        { section: 'lecteur' },
      ],
    },
    {
      title: t.groups.resources,
      items: [
        { section: 'ressources', badge: missing, alert: true },
        { section: 'traductions', badge: r.translations?.languages.length },
      ],
    },
  ];
  const version = r.overview?.renpy.version ?? null;
  return (
    <div className="sidenav-column">
      <div className={open ? 'sidenav open' : 'sidenav'}>
        <div className="sidenav-top">
          <a href={href('vue-ensemble')} className="brand">
            <Logo size={24} />
            {t.appName}
          </a>
          <button
            type="button"
            className="btn btn-secondary btn-small nav-toggle"
            aria-expanded={open}
            aria-controls="report-nav"
            onClick={() => {
              setOpen(!open);
            }}
          >
            {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
            {t.nav.menu} · {t.sections[current]}
          </button>
        </div>
        <div className="game-card">
          <strong data-testid="game-title">
            {r.title}
            {r.overview?.gameVersion ? ` ${r.overview.gameVersion}` : ''}
          </strong>
          {r.report.input.rootName && <span>{r.report.input.rootName}</span>}
          <span>{t.nav.gameMeta(formatBytes(r.report.input.totalBytes), version)}</span>
        </div>
        <nav
          id="report-nav"
          aria-label={t.nav.label}
          className="nav-groups"
          onClick={() => {
            setOpen(false);
          }}
        >
          {groups.map((group) => (
            <div key={group.title} className="nav-group">
              <p className="nav-group-title">{group.title}</p>
              {group.items.map((item) => (
                <NavLink key={item.section} item={item} current={current} />
              ))}
            </div>
          ))}
        </nav>
        <div className="nav-foot">
          <a
            href={href('export')}
            className="nav-link"
            aria-current={current === 'export' ? 'page' : undefined}
          >
            <span>{t.sections.export}</span>
            <DownloadIcon />
          </a>
          <button type="button" className="nav-link" onClick={onReset}>
            <span>{t.nav.newAnalysis}</span>
            <PlusIcon />
          </button>
          <UserMenu />
          <p className="offline">
            <span className="dot" aria-hidden="true" />
            {t.nav.offline(requests)}
          </p>
        </div>
      </div>
    </div>
  );
}
