import path from 'node:path';
import { parse } from 'node-html-parser';
import { normalizePlainText } from '../shared/text-normalize';
import type { PrepHighlight } from './user-prep-store';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fieldKey(pub: string, issue: string, documentId: number, fieldId: string) {
  return `${pub}_${issue}_d${documentId}_f${fieldId}`;
}

function highlightClassForColor(color: string) {
  const allowed = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'];
  return allowed.includes(color) ? `jcs-hl-${color}` : 'jcs-hl-yellow';
}

function findBlock(root: ReturnType<typeof parse>, blockId: string) {
  const byPid = root.querySelector(`[data-pid="${blockId}"]`);
  if (byPid) return byPid;
  const byId = root.querySelector(`#p${blockId}`) ?? root.querySelector(`#${blockId}`);
  return byId;
}

function wrapFirstNeedle(html: string, needle: string, className: string) {
  const normalizedNeedle = normalizePlainText(needle);
  if (!normalizedNeedle || normalizedNeedle.length < 2) return html;

  const plain = normalizePlainText(html.replace(/<[^>]+>/g, ' '));
  if (plain.indexOf(normalizedNeedle) < 0 && plain.toLowerCase().indexOf(normalizedNeedle.toLowerCase()) < 0) {
    return html;
  }

  const re = new RegExp(
    normalizedNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'),
    'i',
  );
  const match = html.match(re);
  if (!match || match.index === undefined) return html;

  const start = match.index;
  const end = start + match[0].length;
  return `${html.slice(0, start)}<mark class="${className}">${html.slice(start, end)}</mark>${html.slice(end)}`;
}

function applyHighlightsToHtml(html: string, highlights: PrepHighlight[]) {
  if (highlights.length === 0) return html;
  const root = parse(`<div id="jcs-root">${html}</div>`, { comment: false });
  const container = root.querySelector('#jcs-root');
  if (!container) return html;

  for (const highlight of highlights) {
    const block = findBlock(container, highlight.blockId);
    if (!block) continue;
    const className = highlightClassForColor(highlight.color);
    const next = wrapFirstNeedle(block.innerHTML, highlight.text, className);
    if (next !== block.innerHTML) block.set_content(next);
  }

  return container.innerHTML;
}

function applyFieldValuesToHtml(
  html: string,
  pub: string,
  issue: string,
  documentId: number,
  fieldValues: Record<string, string>,
) {
  const root = parse(html, { comment: false });
  const fields = root.querySelectorAll('textarea');
  fields.forEach((textarea, index) => {
    const fieldId = textarea.getAttribute('id') || textarea.getAttribute('data-pid') || String(index);
    const key = fieldKey(pub, issue, documentId, fieldId);
    const value = fieldValues[key]?.trim() ?? '';
    const replacement = parse(
      `<div class="jcs-field-value">${escapeHtml(value).replace(/\n/g, '<br>')}</div>`,
    );
    textarea.replaceWith(replacement);
  });
  return root.toString();
}

export function bakePreparedDocumentHtml(params: {
  html: string;
  pub: string;
  issue: string;
  documentId: number;
  fieldValues: Record<string, string>;
  highlights: PrepHighlight[];
}) {
  let baked = applyFieldValuesToHtml(
    params.html,
    params.pub,
    params.issue,
    params.documentId,
    params.fieldValues,
  );
  baked = applyHighlightsToHtml(baked, params.highlights);
  return baked;
}

export function sanitizeMediaFileName(fileName: string) {
  return path.basename(fileName).replace(/[^\w.\-()+]/g, '_');
}

export type MediaRewriteResult = {
  html: string;
  mediaFiles: Array<{ sourceName: string; localName: string }>;
};

/** Converte jcs-media:// para caminhos relativos assets/ e lista mídias a copiar. */
export function rewriteMediaUrlsForExport(html: string): MediaRewriteResult {
  const mediaFiles: MediaRewriteResult['mediaFiles'] = [];
  const seen = new Set<string>();

  const next = html.replace(
    /jcs-media:\/\/[^/]+\/[^/]+\/[^/]+\/([^"'>\s]+)/g,
    (_match, encoded: string) => {
      const sourceName = decodeURIComponent(encoded);
      let localName = sanitizeMediaFileName(sourceName);
      if (seen.has(localName)) {
        const ext = path.extname(localName);
        const base = path.basename(localName, ext);
        localName = `${base}-${seen.size}${ext}`;
      }
      seen.add(localName);
      mediaFiles.push({ sourceName, localName });
      return `assets/${localName}`;
    },
  );

  return { html: next, mediaFiles };
}
