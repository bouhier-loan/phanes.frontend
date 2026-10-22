import type { AssetFile, AssetSite } from '@phanes/core';
import { type RefObject, useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '../../components/icons';
import { basename, formatLocation } from '../../format';
import { href } from '../../route';
import { t } from '../../strings.fr';

export function fileLabel(file: AssetFile): string {
  return file.archive ? `${basename(file.archive)} › ${file.gamePath}` : file.gamePath;
}

export function SiteList({ sites, limit }: { sites: readonly AssetSite[]; limit?: number }) {
  const shown = limit === undefined ? sites : sites.slice(0, limit);
  return (
    <ul className="list">
      {shown.map((s, i) => (
        <li key={`${s.loc.file}:${s.loc.line}:${i}`} className="site">
          <code>{s.code}</code>
          <span>
            {formatLocation(s.loc)}
            {s.label && (
              <>
                {' · '}
                <a href={href('lecteur', s.label)}>{s.label}</a>
              </>
            )}
          </span>
        </li>
      ))}
      {shown.length < sites.length && (
        <li className="small faint">{t.resources.moreSites(sites.length - shown.length)}</li>
      )}
    </ul>
  );
}

/** Width of an element, followed as it resizes. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(() => {
      setWidth(node.clientWidth);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

export function GroupHeader({
  name,
  summary,
  open,
  onToggle,
}: {
  name: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
}) {
  const res = t.resources;
  return (
    <button
      type="button"
      className="asset-group"
      aria-expanded={open}
      aria-label={open ? res.collapseGroup(name) : res.expandGroup(name)}
      onClick={onToggle}
    >
      {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
      <span className="mono">{name}</span>
      <span className="small faint">{summary}</span>
    </button>
  );
}
