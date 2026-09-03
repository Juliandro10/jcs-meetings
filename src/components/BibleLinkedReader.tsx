import { useMemo } from 'react';
import {
  isRichOutlineContent,
  linkifyBibleCitationsInHtml,
} from '@/lib/rich-outline-html';
import { scrollToJcsPageJump } from '@/lib/scroll-jcs-page-jump';
import { linkifyJcsReadRefsInPlainText } from '../../shared/jcs-read-ref-links';

type BibleLinkedReaderProps = {
  value: string;
  onBibleLinkClick: (href: string, label: string) => void;
  size?: 'normal' | 'large';
};

export function BibleLinkedReader({ value, onBibleLinkClick, size = 'normal' }: BibleLinkedReaderProps) {
  const linkedHtml = useMemo(() => {
    if (!value.trim()) return '<span class="text-jw-muted">Nada para exibir.</span>';
    if (isRichOutlineContent(value)) {
      return linkifyBibleCitationsInHtml(value, 'all');
    }
    return linkifyJcsReadRefsInPlainText(value, 'all');
  }, [value]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const jump = target?.closest('a.jcs-page-jump');
    if (jump) {
      event.preventDefault();
      scrollToJcsPageJump(event.currentTarget, jump.getAttribute('data-href') || jump.getAttribute('href'));
      return;
    }
    const anchor = target?.closest('a.jcs-bible-ref, a.jcs-song-ref, a.jcs-pub-ref');
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('data-href');
    const label = anchor.getAttribute('data-label') ?? anchor.textContent?.trim() ?? '';
    if (href) onBibleLinkClick(href, label);
  };

  return (
    <div
      role="article"
      onClick={handleClick}
      className={[
        'jcs-rich-editor break-words text-jw-text',
        isRichOutlineContent(value) ? '' : 'whitespace-pre-wrap',
        size === 'large' ? 'text-xl leading-relaxed sm:text-2xl sm:leading-relaxed' : 'text-sm leading-relaxed',
        '[&_a.jcs-bible-ref]:cursor-pointer [&_a.jcs-bible-ref]:font-medium [&_a.jcs-bible-ref]:text-jw-purple [&_a.jcs-bible-ref]:underline [&_a.jcs-bible-ref]:decoration-jw-purple/40',
        '[&_a.jcs-song-ref]:cursor-pointer [&_a.jcs-song-ref]:font-medium [&_a.jcs-song-ref]:text-jw-purple [&_a.jcs-song-ref]:underline [&_a.jcs-song-ref]:decoration-jw-purple/40',
        '[&_a.jcs-pub-ref]:cursor-pointer [&_a.jcs-pub-ref]:font-medium [&_a.jcs-pub-ref]:text-jw-purple [&_a.jcs-pub-ref]:underline [&_a.jcs-pub-ref]:decoration-jw-purple/40',
        '[&_a.jcs-page-jump]:cursor-pointer',
      ].join(' ')}
      dangerouslySetInnerHTML={{ __html: linkedHtml }}
    />
  );
}
