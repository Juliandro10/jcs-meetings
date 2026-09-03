export type JcsPageJump = {
  pageNumber: number;
  topPct: number;
};

const JUMP_RE = /(?:jcs-page:\/\/|#jcs-page-)(\d+)(?:\?y=(\d{1,3}))?/i;

export function jcsPageAnchorId(pageNumber: number) {
  return `jcs-page-${pageNumber}`;
}

export function formatJcsPageJumpHref(jump: JcsPageJump) {
  const y = Math.round(jump.topPct);
  if (y > 8) return `jcs-page://${jump.pageNumber}?y=${y}`;
  return `jcs-page://${jump.pageNumber}`;
}

export function isJcsPageJumpHref(href: string | null | undefined) {
  return Boolean(href && JUMP_RE.test(href));
}

export function parseJcsPageJump(href: string | null | undefined): JcsPageJump | null {
  if (!href) return null;
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    decoded = href;
  }
  const match = decoded.match(JUMP_RE);
  if (!match) return null;
  const pageNumber = Number(match[1]);
  if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > 999) return null;
  const topPct = match[2] != null ? Math.min(95, Math.max(0, Number(match[2]))) : 0;
  return { pageNumber, topPct };
}
