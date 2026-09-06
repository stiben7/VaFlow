/**
 * Hand-rolled 20x20 stroke icons. Inline SVG rather than an icon package:
 * the whole set is under 3KB and it keeps the dependency list at four.
 */
type P = { className?: string };

const base = "h-4 w-4 shrink-0";

function S({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? base}
    >
      {children}
    </svg>
  );
}

export const CalendarIcon = ({ className }: P) => (
  <S className={className}>
    <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
    <path d="M3 8.5h14M7 2.5v3M13 2.5v3" />
  </S>
);

export const UsersIcon = ({ className }: P) => (
  <S className={className}>
    <circle cx="7.5" cy="7" r="2.75" />
    <path d="M2.5 16.5c0-2.5 2.2-4.25 5-4.25s5 1.75 5 4.25" />
    <path d="M13.5 5.1a2.6 2.6 0 0 1 0 5M15 12.6c1.6.6 2.5 1.9 2.5 3.9" />
  </S>
);

export const PlusIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M10 4.5v11M4.5 10h11" />
  </S>
);

export const ChevronLeft = ({ className }: P) => (
  <S className={className}>
    <path d="M12 4.5 6.5 10l5.5 5.5" />
  </S>
);

export const ChevronRight = ({ className }: P) => (
  <S className={className}>
    <path d="m8 4.5 5.5 5.5L8 15.5" />
  </S>
);

export const SearchIcon = ({ className }: P) => (
  <S className={className}>
    <circle cx="8.75" cy="8.75" r="5.25" />
    <path d="m12.75 12.75 4 4" />
  </S>
);

export const CloseIcon = ({ className }: P) => (
  <S className={className}>
    <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
  </S>
);

export const TrashIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
    <path d="M5.5 5.5 6.2 16a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-10.5" />
  </S>
);

export const PencilIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M13.5 3.5l3 3L7 16l-3.5.5L4 13z" />
    <path d="M11.5 5.5l3 3" />
  </S>
);

export const FlagIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M5 17V3.5M5 4h9l-2 3 2 3H5" />
  </S>
);

export const LinkIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M8.5 11.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 0 0-4.24-4.24l-1 1" />
    <path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 1 0 4.24 4.24l1-1" />
  </S>
);

export const ClockIcon = ({ className }: P) => (
  <S className={className}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4.2l2.6 1.6" />
  </S>
);

export const SidebarIcon = ({ className }: P) => (
  <S className={className}>
    <rect x="3" y="4" width="14" height="12" rx="2" />
    <path d="M8 4v12" />
  </S>
);

export const DotsIcon = ({ className }: P) => (
  <S className={className}>
    <circle cx="10" cy="4.5" r=".9" fill="currentColor" />
    <circle cx="10" cy="10" r=".9" fill="currentColor" />
    <circle cx="10" cy="15.5" r=".9" fill="currentColor" />
  </S>
);

export const LogoutIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M8 17H4.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1H8" />
    <path d="M13 13.5 16.5 10 13 6.5M16.5 10h-9" />
  </S>
);

export const DownloadIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5" />
    <path d="M3.5 13.5v2a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2" />
  </S>
);

export const UploadIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M10 12.5v-9m0 0L6.5 7M10 3.5 13.5 7" />
    <path d="M3.5 13.5v2a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2" />
  </S>
);

export const SparkIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M10 3v3.5M10 13.5V17M3 10h3.5M13.5 10H17" />
    <path d="M5.7 5.7l2.1 2.1M12.2 12.2l2.1 2.1M14.3 5.7l-2.1 2.1M7.8 12.2l-2.1 2.1" />
  </S>
);

export const InboxIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M3 11.5 5 4.5h10l2 7v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <path d="M3 11.5h4l1 2h4l1-2h4" />
  </S>
);

export const SunIcon = ({ className }: P) => (
  <S className={className}>
    <circle cx="10" cy="10" r="3.5" />
    <path d="M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M5.05 5.05l1.06 1.06M13.89 13.89l1.06 1.06M5.05 14.95l1.06-1.06M13.89 6.11l1.06-1.06" />
  </S>
);

export const MoonIcon = ({ className }: P) => (
  <S className={className}>
    <path d="M16.5 11.5a7 7 0 0 1-8-8 7 7 0 1 0 8 8z" />
  </S>
);

export const MonitorIcon = ({ className }: P) => (
  <S className={className}>
    <rect x="3" y="3" width="14" height="10" rx="1.5" />
    <path d="M7.5 16.5h5M10 13v3.5" />
  </S>
);

export const CopyIcon = ({ className }: P) => (
  <S className={className}>
    <rect x="6.5" y="6.5" width="10" height="10" rx="1.5" />
    <path d="M13.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" />
  </S>
);
