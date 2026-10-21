import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

/** Stroke icons drawn on a 24-unit grid, decorative unless given a label. */
function icon(paths: ReactNode, strokeWidth = 1.6) {
  return function Icon({ size = 18, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const FolderIcon = icon(
  <>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
    <path d="M12 16.5v-5M9.8 13.6L12 11.4l2.2 2.2" />
  </>,
  1.4,
);
export const DownloadIcon = icon(<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </>,
);
export const ChevronRightIcon = icon(<path d="M9 6l6 6-6 6" />, 2);
export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />, 2);
export const ChevronLeftIcon = icon(<path d="M15 6l-6 6 6 6" />, 2);
export const WarningIcon = icon(
  <>
    <path d="M12 3.5l9.5 16.5h-19z" />
    <path d="M12 10v4.5" />
    <circle cx="12" cy="17.3" r="1" fill="currentColor" stroke="none" />
  </>,
);
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
  </>,
);
export const ErrorIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </>,
  1.7,
);
export const DoneIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" stroke="#4a5066" strokeWidth={1.5} />
    <path d="M7.5 12.3l3 3 6-6.3" stroke="#ede9e0" strokeWidth={1.7} />
  </>,
);
export const RunningIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" stroke="#2c3245" strokeWidth={2} />
    <path d="M12 2a10 10 0 0 1 9.5 13.1" stroke="#f2c14e" strokeWidth={2} />
  </>,
);
export const WaitingIcon = icon(
  <circle cx="12" cy="12" r="10" stroke="#3a4053" strokeWidth={1.5} strokeDasharray="3 3" />,
);
export const NoSignalIcon = icon(
  <>
    <path d="M2.5 8.5a14 14 0 0 1 19 0M5.5 12a9.5 9.5 0 0 1 13 0M8.8 15.4a5 5 0 0 1 6.4 0" />
    <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    <path d="M3.5 3.5l17 17" />
  </>,
  1.5,
);
export const ShieldIcon = icon(
  <>
    <path d="M12 3l7.5 3v5.2c0 4.6-3.1 8.3-7.5 9.8-4.4-1.5-7.5-5.2-7.5-9.8V6z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </>,
  1.5,
);
export const LayersIcon = icon(
  <>
    <path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" />
    <path d="M3.5 12L12 16.5l8.5-4.5M3.5 16L12 20.5l8.5-4.5" />
  </>,
  1.5,
);
export const EyeIcon = icon(
  <>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
  1.5,
);
export const CodeIcon = icon(<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15" />, 1.5);
export const TranslateIcon = icon(
  <path d="M3.5 5.5h9M8 3.5v2M5.5 5.5c.9 3 3 5.4 6 7M10.5 5.5c-.9 3.2-3.2 5.7-6.5 7.5M12.5 20.5l4-9.5 4 9.5M13.8 17.5h5.4" />,
  1.5,
);
export const PersonIcon = icon(
  <>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6" />
  </>,
  1.5,
);
export const ImageIcon = icon(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 17l5-4.5 3.5 3 3-2.5L20 17" />
  </>,
  1.5,
);
export const MusicIcon = icon(
  <>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </>,
  1.5,
);
export const FilmIcon = icon(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M10 9.5v5l4-2.5z" />
  </>,
  1.5,
);
export const PlayIcon = icon(<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />, 1.4);
export const LogOutIcon = icon(
  <path d="M14 4.5h4.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H14M10 16l4-4-4-4M14 12H4" />,
);
export const CopyIcon = icon(
  <>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </>,
);

/** The Phanes lantern. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <ellipse
        cx="14"
        cy="15.5"
        rx="8.5"
        ry="10.5"
        fill="none"
        stroke="#F2C14E"
        strokeWidth="1.6"
      />
      <circle cx="14" cy="17" r="3.2" fill="#F2C14E" />
      <path
        d="M14 0.8v2.4M4.2 4.6l1.6 1.5M23.8 4.6l-1.6 1.5"
        fill="none"
        stroke="#F2C14E"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
