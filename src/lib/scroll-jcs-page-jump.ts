import { jcsPageAnchorId, parseJcsPageJump } from '../../shared/jcs-page-jump';

export function scrollToJcsPageJump(container: HTMLElement | null, href: string | null | undefined) {
  if (!container) return false;
  const jump = parseJcsPageJump(href);
  if (!jump) return false;
  const target = container.querySelector<HTMLElement>(`#${jcsPageAnchorId(jump.pageNumber)}`);
  if (!target) return false;
  const cRect = container.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const extra = jump.topPct > 8 ? tRect.height * (jump.topPct / 100) : 0;
  container.scrollTop += tRect.top - cRect.top + extra;
  return true;
}
