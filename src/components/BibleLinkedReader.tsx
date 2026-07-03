import { useMemo } from 'react';
import {
  isRichOutlineContent,
  linkifyBibleCitationsInHtml,
} from '@/lib/rich-outline-html';
import { linkifyBibleCitationsHtml } from '@/lib/bible-citation';

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
    return linkifyBibleCitationsHtml(value, 'all');
  }, [value]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest('a.jcs-bible-ref');
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
      ].join(' ')}
      dangerouslySetInnerHTML={{ __html: linkedHtml }}
    />
  );
}
