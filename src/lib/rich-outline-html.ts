import { linkifyBibleCitationsHtml } from '@/lib/bible-citation';

export function isRichOutlineContent(value: string) {
  return /<(p|div|span|strong|em|u|mark|br|a)\b/i.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function plainOutlineToHtml(text: string) {
  if (!text.trim()) return '<p><br></p>';
  return text
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function outlineContentToHtml(value: string) {
  if (!value.trim()) return '<p><br></p>';
  return isRichOutlineContent(value) ? value : plainOutlineToHtml(value);
}

export function stripOutlineHtml(html: string) {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.innerText.replace(/\u00a0/g, ' ').trim();
}

/** Linkifica citações bíblicas em nós de texto, preservando formatação existente. */
export function linkifyBibleCitationsInHtml(html: string, mode: 'strict' | 'all' = 'all') {
  if (typeof document === 'undefined') return linkifyBibleCitationsHtml(html, mode);

  const host = document.createElement('div');
  host.innerHTML = html;

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (!parent?.closest('a.jcs-bible-ref')) {
      textNodes.push(node as Text);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const raw = textNode.textContent ?? '';
    if (!raw.trim()) continue;
    const linked = linkifyBibleCitationsHtml(raw, mode);
    if (!linked.includes('jcs-bible-ref')) continue;
    const wrapper = document.createElement('span');
    wrapper.innerHTML = linked;
    textNode.replaceWith(...[...wrapper.childNodes]);
  }

  return host.innerHTML;
}

export function normalizeEditorHtml(html: string) {
  const trimmed = html.replace(/\s+$/, '');
  if (!trimmed || trimmed === '<br>' || trimmed === '<p><br></p>') return '';
  return trimmed;
}
