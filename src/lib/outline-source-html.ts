import { isSongMepsId } from '../../shared/chairman-song-links';
import { sanitizeOutlineHtml } from '@/lib/rich-outline-html';

function classifyJwpubHref(href: string, label: string): { kind: string; href: string; label: string } | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('jwpub://b/')) return { kind: 'jcs-bible-ref', href: trimmed, label };
  if (trimmed.startsWith('tnme-cantico://')) return { kind: 'jcs-song-ref', href: trimmed, label };
  if (trimmed.startsWith('jwpub://p/')) {
    const meps = Number(trimmed.match(/p\/T:(\d+)/i)?.[1]);
    if (meps && isSongMepsId(meps)) {
      return { kind: 'jcs-song-ref', href: `tnme-cantico://${meps}`, label };
    }
    return { kind: 'jcs-pub-ref', href: trimmed, label };
  }
  return null;
}

function unwrapElement(el: Element) {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  el.remove();
}

/**
 * Converte o HTML do esboço original (.jwpub) em HTML editável,
 * preservando citações bíblicas e links de pesquisa (jwpub://p/).
 */
export function jwpubOutlineHtmlToEditorHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const host = document.createElement('div');
  host.innerHTML = sanitizeOutlineHtml(html);

  host
    .querySelectorAll('script, style, img, video, audio, figure, svg, button, input, iframe, .pageNum')
    .forEach((el) => el.remove());

  host.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href') || anchor.getAttribute('data-href') || '';
    const label = (anchor.getAttribute('data-label') || anchor.textContent || '').replace(/\s+/g, ' ').trim();
    const classified = classifyJwpubHref(href, label);
    if (!classified) {
      unwrapElement(anchor);
      return;
    }
    const next = document.createElement('a');
    next.setAttribute('href', '#');
    next.className = classified.kind;
    next.setAttribute('tabindex', '-1');
    next.setAttribute('data-href', classified.href);
    next.setAttribute('data-label', classified.label);
    next.innerHTML = anchor.innerHTML;
    anchor.replaceWith(next);
  });

  host.querySelectorAll('h1, h2, h3, h4').forEach((heading) => {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = heading.innerHTML;
    heading.replaceWith(paragraph);
  });

  const keep = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'MARK', 'SUP', 'A', 'SPAN']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const el of [...host.querySelectorAll('*')]) {
      if (keep.has(el.tagName)) {
        if (el.tagName === 'A') continue;
        if (el.tagName === 'MARK' || el.tagName === 'SPAN') {
          const className = el.getAttribute('class') ?? '';
          const style = el.getAttribute('style') ?? '';
          const keepSpan =
            el.tagName === 'MARK' ||
            /jcs-rich-hl|jcs-editor-ref|jcs-bible-ref|jcs-song-ref|jcs-pub-ref/i.test(className) ||
            /background/i.test(style);
          if (el.tagName === 'SPAN' && !keepSpan) {
            unwrapElement(el);
            changed = true;
            continue;
          }
          for (const attr of [...el.attributes]) {
            if (attr.name === 'class' || attr.name === 'style' || attr.name.startsWith('data-')) continue;
            el.removeAttribute(attr.name);
          }
          continue;
        }
        for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
        continue;
      }
      unwrapElement(el);
      changed = true;
    }
  }

  return host.innerHTML.trim();
}

export function outlineHasResearchLinks(html: string) {
  return /jcs-pub-ref|jwpub:\/\/p\//i.test(html);
}
