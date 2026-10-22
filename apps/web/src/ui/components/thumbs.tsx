import type { ImageAsset } from '@phanes/core';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useAssetUrl } from '../assets';
import { useReport } from '../report';
import { ImageIcon } from './icons';

/** True once the element has been scrolled into view (and stays true). */
export function useInView<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible(true);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [visible]);
  return [ref, visible];
}

/** A small image decoded only once scrolled into view; an icon until then. */
export function LazyThumb({
  path,
  label,
  className = 'mini-thumb',
  iconSize = 16,
}: {
  path: string | null;
  label: string;
  className?: string;
  iconSize?: number;
}) {
  const [ref, visible] = useInView<HTMLSpanElement>();
  const url = useAssetUrl(path, visible);
  return (
    <span ref={ref} className={className} aria-hidden="true" title={label}>
      {url ? <img src={url} alt="" decoding="async" /> : <ImageIcon size={iconSize} />}
    </span>
  );
}

/** Image displayed by a scene/show name: the exact image, else the first of its tag. */
export function useImageLookup(): (name: string) => ImageAsset | undefined {
  const { assets } = useReport();
  return useMemo(() => {
    const entries = assets?.images.entries ?? [];
    const byName = new Map(entries.map((i) => [i.name, i]));
    const byTag = new Map<string, ImageAsset[]>();
    for (const i of entries) byTag.set(i.tag, [...(byTag.get(i.tag) ?? []), i]);
    return (name: string) => {
      const exact = byName.get(name);
      if (exact) return exact;
      const [tag = '', ...attrs] = name.split(' ');
      return byTag.get(tag)?.find((i) => attrs.every((a) => i.attributes.includes(a)));
    };
  }, [assets]);
}
