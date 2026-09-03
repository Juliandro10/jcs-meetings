import { htmlSpaceEntitiesToAscii } from '../../shared/text-normalize';

function readHtmlAttr(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? '';
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export type EditorRefKind = 'jcs-bible-ref' | 'jcs-song-ref' | 'jcs-pub-ref';

export function editorRefKindFromAttrs(attrs: string, href: string): EditorRefKind | null {
  if (/jcs-page-jump/i.test(attrs)) return null;
  if (/jcs-song-ref/i.test(attrs) || /tnme-cantico:/i.test(href)) return 'jcs-song-ref';
  if (/jcs-pub-ref/i.test(attrs) || /jwpub:\/\/p\//i.test(href)) return 'jcs-pub-ref';
  if (/jcs-bible-ref/i.test(attrs) || /jwpub:\/\/b\//i.test(href)) return 'jcs-bible-ref';
  return null;
}

/** Remove atributos que travam seleção dentro de contenteditable. */
export function stripEditorBlockers(html: string) {
  return html
    .replace(/\s*contenteditable\s*=\s*(['"])[^'"]*\1/gi, '')
    .replace(/\s*tabindex\s*=\s*(['"])-?\d+\1/gi, '');
}

/** Âncoras viram &lt;span&gt; no editor — evita seleção presa no início (Chromium). */
export function refsToEditorSpans(html: string) {
  return stripEditorBlockers(html).replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (full, attrs: string, inner: string) => {
      if (/jcs-page-jump/i.test(attrs)) return full;
      const rawHref = readHtmlAttr(attrs, 'data-href') || readHtmlAttr(attrs, 'href');
      const href = rawHref === '#' ? readHtmlAttr(attrs, 'data-href') : rawHref;
      const kind = editorRefKindFromAttrs(attrs, href);
      if (kind) {
        const dataLabel = readHtmlAttr(attrs, 'data-label') || stripTags(inner);
        return `<span class="${kind} jcs-editor-ref" data-href="${escapeAttr(href)}" data-label="${escapeAttr(dataLabel)}">${inner}</span>`;
      }
      if (/\bjcs-/.test(attrs)) return full;
      return inner;
    },
  );
}

/** Converte spans do editor de volta para âncoras ao salvar/exportar. */
export function refsToExportAnchors(html: string) {
  return html.replace(
    /<span\b([^>]*\bjcs-editor-ref\b[^>]*)>([\s\S]*?)<\/span>/gi,
    (_full, attrs: string, inner: string) => {
      const dataHref = readHtmlAttr(attrs, 'data-href');
      const kind = editorRefKindFromAttrs(attrs, dataHref) ?? 'jcs-bible-ref';
      const dataLabel = readHtmlAttr(attrs, 'data-label');
      return `<a href="#" class="${kind}" tabindex="-1" data-href="${escapeAttr(dataHref)}" data-label="${escapeAttr(dataLabel)}">${inner}</a>`;
    },
  );
}

export function normalizeRichEditorHtml(html: string) {
  return htmlSpaceEntitiesToAscii(refsToExportAnchors(stripEditorBlockers(html)));
}
