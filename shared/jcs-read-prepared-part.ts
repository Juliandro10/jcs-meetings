import { unwrapBibleCitationAnchors } from '../src/lib/bible-citation';
import { prepareDiscourseBodyHtml } from './discourse-manuscript-html';
import { sanitizeJcsReadFileSlug } from './jcs-read-discourse';
import { isRichOutlineContent, outlineValueToBodyHtml } from './jcs-read-html';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Linkifica só trechos de texto — preserva tags HTML existentes (ex.: grifos, links do editor). */
export function linkifyBibleCitationsInExportHtml(
  html: string,
  linkifySegment: (text: string) => string,
) {
  return unwrapBibleCitationAnchors(html)
    .split(/(<[^>]+>)/g)
    .map((segment) => {
      if (!segment || segment.startsWith('<')) return segment;
      return linkifySegment(segment);
    })
    .join('');
}

export function preparedPartDocumentId(noteId: string) {
  return `prepared-part-${noteId}`;
}

export function preparedPartFileName(note: { id: string; title: string }) {
  const slug = sanitizeJcsReadFileSlug(note.title || 'roteiro') || 'roteiro';
  const shortId = note.id.replace(/[^\w-]/g, '').slice(0, 8) || 'part';
  return `roteiro-${slug}-${shortId}.html`;
}

export function preparedPartDisplayTitle(title: string) {
  const trimmed = title.trim();
  return trimmed.replace(/^ROTEIRO\s*[—-]\s*/iu, '').trim() || trimmed || 'Roteiro';
}

export function buildPreparedPartInnerHtml(
  body: string,
  linkifySegment?: (text: string) => string,
) {
  const rich = isRichOutlineContent(body)
    ? outlineValueToBodyHtml(body)
    : `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`;
  const withHighlights = prepareDiscourseBodyHtml(rich);

  if (linkifySegment) {
    return linkifyBibleCitationsInExportHtml(withHighlights, linkifySegment);
  }

  return withHighlights;
}
