import {
  joinBrokenJcsReadRefsInHtml,
  linkifyJcsReadRefsInHtml,
  linkifyJcsReadRefsInPlainText,
} from '../../shared/jcs-read-ref-links';

export function isRichOutlineContent(value: string) {
  return /<(p|div|span|strong|em|u|mark|br|a|img|figure)\b/i.test(value);
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

function unwrapElementKeepChildren(el: Element) {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  el.remove();
}

/** Linkifica citações bíblicas e “Cântico 54” em nós de texto, preservando formatação existente. */
export function linkifyBibleCitationsInHtml(html: string, mode: 'strict' | 'all' = 'all') {
  if (typeof document === 'undefined') {
    return linkifyJcsReadRefsInHtml(html, mode);
  }

  const host = document.createElement('div');
  host.innerHTML = joinBrokenJcsReadRefsInHtml(html);
  host.normalize();

  // Desembrulha só bíblia/cântico no DOM — regex em <span> aninhado destruía o grifo.
  host.querySelectorAll('a.jcs-bible-ref, span.jcs-bible-ref, a.jcs-song-ref, span.jcs-song-ref').forEach((el) => {
    if (el.classList.contains('jcs-page-jump') || el.classList.contains('jcs-page-hotspot')) return;
    unwrapElementKeepChildren(el);
  });
  host.normalize();

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (!parent?.closest('.jcs-bible-ref, .jcs-song-ref, .jcs-pub-ref, a.jcs-page-hotspot, .jcs-imported-page-stack')) {
      textNodes.push(node as Text);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const raw = textNode.textContent ?? '';
    if (!raw.trim()) continue;
    const linked = linkifyJcsReadRefsInPlainText(raw, mode);
    if (!/jcs-bible-ref|jcs-song-ref|jcs-pub-ref/.test(linked)) continue;
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

export function sanitizeOutlineHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');
}

/** Extrai HTML de esboço de um bloco ```jcs-outline da resposta da IA. */
export function extractOutlineApplyHtml(reply: string) {
  const match = reply.match(/```(?:jcs-outline|html)\s*([\s\S]*?)```/i);
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw) return null;
  const html = isRichOutlineContent(raw) ? raw : plainOutlineToHtml(raw);
  return sanitizeOutlineHtml(html);
}

/** Converte uma resposta livre da IA em HTML de editor. */
export function replyToOutlineHtml(reply: string) {
  const fenced = extractOutlineApplyHtml(reply);
  if (fenced) return fenced;
  const stripped = reply.replace(/```[\s\S]*?```/g, '').trim();
  if (!stripped) return null;
  return sanitizeOutlineHtml(plainOutlineToHtml(stripped));
}
