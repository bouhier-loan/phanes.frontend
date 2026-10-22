import { PageHeader } from '../components/ui';
import { useReport } from '../report';
import { href } from '../route';
import { t } from '../strings.fr';
import { AudioTab } from './resources/AudioTab';
import { ImagesTab } from './resources/ImagesTab';
import { VideoTab } from './resources/VideoTab';

type Tab = 'images' | 'audio' | 'video';

/** `tab` is "images", "audio" or "video", optionally followed by ":" and a file to focus. */
export function ResourcesPage({ tab: param }: { tab: string | null }) {
  const r = useReport();
  const res = t.resources;
  const [head, focus = null] = (param ?? 'images').split(/:(.*)/s);
  const tab: Tab = head === 'audio' || head === 'video' ? head : 'images';
  return (
    <>
      <PageHeader
        crumbs={t.crumbs(r.title, t.groups.resources)}
        title={t.sections.ressources}
        lede={res.lede[tab]}
      >
        <nav aria-label={res.tabsLabel} className="chips">
          {(['images', 'audio', 'video'] as const).map((k) => (
            <a
              key={k}
              href={href('ressources', k)}
              className="chip"
              aria-current={k === tab ? 'page' : undefined}
            >
              {res.tabs[k]}
            </a>
          ))}
        </nav>
      </PageHeader>
      {tab === 'images' && <ImagesTab key={focus ?? ''} focus={focus} />}
      {tab === 'audio' && <AudioTab key={focus ?? ''} focus={focus} />}
      {tab === 'video' && <VideoTab key={focus ?? ''} focus={focus} />}
    </>
  );
}
