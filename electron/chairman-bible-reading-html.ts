import { chairmanBibleReadingLinkHref, formatBibleReadingVerseRange } from '../shared/chairman-bible-links';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type ChairmanBibleReadingBlockOptions = {
  heading: string;
  versesLabel?: string;
};

/** Referência + link — o texto abre no TNME Bíblia. */
export function buildChairmanBibleReadingHtml(
  href: string | undefined,
  label: string,
  options: ChairmanBibleReadingBlockOptions,
): string | undefined {
  if (!href?.trim()) return undefined;

  const readingLabel = escapeHtml(label.trim() || 'Leitura bíblica');
  const refHref = chairmanBibleReadingLinkHref(href);
  const refLine = `<a href="${refHref}" class="bible-reading-ref-link">${readingLabel}</a>`;

  const verseRange = formatBibleReadingVerseRange(href);
  const versesPrefix = options.versesLabel ?? 'Versículos';
  const verseLine = verseRange
    ? `<p class="bible-reading-verses">${escapeHtml(versesPrefix)}: <a href="${refHref}" class="bible-reading-ref-link">${escapeHtml(verseRange)}</a></p>`
    : '';

  return `<div class="bible-reading-passage">
  <p class="bible-reading-announce"><strong>${escapeHtml(options.heading)}:</strong> ${refLine}</p>
  ${verseLine}
</div>`;
}
