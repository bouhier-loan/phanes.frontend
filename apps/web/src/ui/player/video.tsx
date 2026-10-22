import type { ImageMovie, PlayMovie } from '@phanes/core';
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';
import { canPlayVideo } from '../../adapters/media-type';
import { useAssetUrl } from '../assets';
import { FilmIcon } from '../components/icons';
import { basename } from '../format';
import { t } from '../strings.fr';

/*
 * Videos of the scene player, after Ren'Py's renpy/display/video.py (Movie)
 * and renpy/exports/mediaexports.py (movie_cutscene). Ren'Py is MIT licensed
 * (see NOTICE).
 */

/** Starts the video once it has a source; muted if the browser refuses to play its sound. */
function useAutoplay(ref: RefObject<HTMLVideoElement | null>, url: string | null) {
  useEffect(() => {
    const video = ref.current;
    if (!video || !url) return;
    video
      .play()
      .catch(() => {
        video.muted = true;
        return video.play();
      })
      .catch(() => undefined);
  }, [ref, url]);
}

/**
 * A `Movie` image on stage (background or sprite): it plays while shown and
 * loops unless `loop=False`; it then vanishes, or keeps its last frame.
 */
export function StageVideo({
  url,
  movie,
  className,
  style,
  sound,
  onSize,
}: {
  url: string;
  movie: ImageMovie;
  className: string;
  style?: CSSProperties;
  sound: boolean;
  onSize: (width: number, height: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ended, setEnded] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  useAutoplay(ref, url);
  return (
    <video
      ref={ref}
      className={className}
      src={url}
      style={{
        ...style,
        // Side by side mask: only the colour half is shown (without its transparency).
        ...(movie.sideMask && ratio !== null
          ? { aspectRatio: `${ratio}`, objectFit: 'cover', objectPosition: 'left center' }
          : {}),
        ...(ended && !movie.keepLastFrame ? { visibility: 'hidden' } : {}),
      }}
      autoPlay
      playsInline
      loop={movie.loop}
      muted={!sound}
      onLoadedMetadata={(e) => {
        const width = e.currentTarget.videoWidth / (movie.sideMask ? 2 : 1);
        const height = e.currentTarget.videoHeight;
        if (width > 0 && height > 0) {
          setRatio(width / height);
          onSize(width, height);
        }
      }}
      onEnded={() => {
        setEnded(true);
      }}
    />
  );
}

/**
 * A full-screen cutscene: it plays `loops + 1` times (forever for -1), or
 * for `delay` seconds, then calls `onEnd`; a click on the scene ends it
 * earlier. Without `onEnd` (reached by going back), it waits for the click.
 */
export function Cutscene({
  movie,
  path,
  sound,
  onEnd,
}: {
  movie: PlayMovie;
  /** VFS path of the file, null when the game does not contain it. */
  path: string | null;
  sound: boolean;
  onEnd: (() => void) | null;
}) {
  const p = t.reader.play;
  const [failed, setFailed] = useState(false);
  const playable = path !== null && canPlayVideo(path) && !failed;
  const url = useAssetUrl(path, playable);
  const ref = useRef<HTMLVideoElement>(null);
  const plays = useRef(1);
  useAutoplay(ref, url);
  const delay = movie.delay;
  useEffect(() => {
    if (!onEnd || delay === null || !playable) return;
    const timer = setTimeout(onEnd, delay * 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [onEnd, delay, playable]);

  const file = movie.file ?? '';
  return (
    <div className="vn-cutscene vn-clickable">
      {playable ? (
        url && (
          <video
            ref={ref}
            src={url}
            aria-label={p.cutscene(basename(file))}
            autoPlay
            playsInline
            loop={movie.loops === -1}
            muted={!sound}
            onEnded={(e) => {
              if (movie.loops >= plays.current) {
                plays.current++;
                const video = e.currentTarget;
                video.currentTime = 0;
                void video.play().catch(() => undefined);
              } else if (delay === null) onEnd?.();
            }}
            onError={() => {
              setFailed(true);
            }}
          />
        )
      ) : (
        <div className="vn-cutscene-missing">
          <FilmIcon size={30} />
          <p className="mono">{movie.file ?? '?'}</p>
          <p className="small">
            {movie.file === null
              ? p.movieDynamic
              : path === null
                ? p.movieMissing(movie.file)
                : p.movieUnplayable(basename(movie.file))}
          </p>
          <p className="small faint">{p.clickToContinue}</p>
        </div>
      )}
    </div>
  );
}
