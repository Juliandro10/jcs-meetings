import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function IconMenu(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBible(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6 4h9a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H6V4Z" />
      <path d="M6 18h9a3 3 0 0 1 3 3" />
    </svg>
  );
}

export function IconLibrary(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M5 7h4v12H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <path d="M10 6h4v13h-4V6Z" />
      <path d="M15 5h4a1 1 0 0 1 1 1v13h-5V5Z" />
    </svg>
  );
}

export function IconMedia(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 10 5 3-5 3v-6Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconMeetings(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8" r="2.5" />
      <circle cx="16" cy="9" r="2" />
      <path d="M4 19c1.5-3 4-4.5 5-4.5s3.5 1.5 5 4.5" strokeLinecap="round" />
      <path d="M14 19c.8-2 2.2-3 3-3s2.8 1.2 3.5 3" strokeLinecap="round" />
    </svg>
  );
}

export function IconDiamond(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3 4 9l8 12 8-12-8-6Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" strokeLinecap="round" />
    </svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 8v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12a9 9 0 1 0 2.5-6.2" strokeLinecap="round" />
      <path d="M3 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}

export function IconCloudDownload(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 18h10" strokeLinecap="round" />
      <path d="M12 14V8" strokeLinecap="round" />
      <path d="m9.5 10.5 2.5 2.5 2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 15A4.5 4.5 0 0 1 7 6.8 5.5 5.5 0 0 1 17.2 8 4.5 4.5 0 0 1 16.5 15" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="m10 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconHeadphones(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 14v3a2 2 0 0 0 2 2h1v-7H5a1 1 0 0 0-1 1v1Z" />
      <path d="M20 14v3a2 2 0 0 1-2 2h-1v-7h2a1 1 0 0 1 1 1v1Z" />
      <path d="M4 14a8 8 0 0 1 16 0" strokeLinecap="round" />
    </svg>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.8 4 6 4 9s-1.5 6.2-4 9M12 3c-2.5 2.8-4 6-4 9s1.5 6.2 4 9" />
    </svg>
  );
}

export function IconBookOpen(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H18v17.5H7.5A2.5 2.5 0 0 0 5 23V5.5Z" />
      <path d="M5 5.5A2.5 2.5 0 0 0 7.5 3H18" />
      <path d="M9 7.5h6M9 11h6" strokeLinecap="round" />
    </svg>
  );
}

export function IconPreaching(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 10v8a1 1 0 0 0 1 1h2" />
      <path d="M20 9v9a1 1 0 0 1-1 1h-2" />
      <rect x="7" y="5" width="10" height="12" rx="2" />
      <path d="M12 5V3" strokeLinecap="round" />
      <path d="M9 3h6" strokeLinecap="round" />
    </svg>
  );
}

export function IconElder(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3 4 7v6c0 4.5 3.4 7.8 8 9 4.6-1.2 8-4.5 8-9V7l-8-4Z" strokeLinejoin="round" />
      <path d="M9.5 12.5 11 14l3.5-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Lista com checkmarks — orientações de congregação (JW Library). */
export function IconGuidelineList(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
      <rect x="5" y="4" width="22" height="24" rx="2" />
      <path d="M10 10h3M17 10h5M10 16h3M17 16h5M10 22h3M17 22h5" strokeLinecap="round" />
      <path d="M8 10l1 1 2-2M8 16l1 1 2-2M8 22l1 1 2-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Documento com púlpito — esboços de congregação (JW Library). */
export function IconOutlinePodium(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
      <rect x="5" y="4" width="18" height="22" rx="1.5" />
      <path d="M9 9h10M9 13h10M9 17h6" strokeLinecap="round" />
      <path d="M26 22v6" strokeLinecap="round" />
      <path d="M22 28h8" strokeLinecap="round" />
      <circle cx="26" cy="20" r="2" />
    </svg>
  );
}

export function IconOutlineDocument(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
      <rect x="7" y="4" width="18" height="24" rx="1.5" />
      <path d="M11 10h10M11 14h10M11 18h10M11 22h6" strokeLinecap="round" />
    </svg>
  );
}
