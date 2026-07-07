/** Cor do grifo de manuscrito (ciano — igual ao Word do usuário). */
export const DISCOURSE_MANUSCRIPT_HIGHLIGHT = '#00FFFF';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRichHtml(value: string) {
  return /<(p|div|span|strong|em|u|mark|br|font|a)\b/i.test(value);
}

function stripTags(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractParagraphs(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];

  if (/<p\b/i.test(trimmed)) {
    const parts: string[] = [];
    const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    let match = re.exec(trimmed);
    while (match) {
      const inner = match[1].replace(/<br\s*\/?>\s*$/i, '').trim();
      if (inner && inner !== '<br>') parts.push(inner);
      match = re.exec(trimmed);
    }
    if (parts.length) return parts;
  }

  return trimmed
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function paragraphInnerHtml(para: string) {
  if (isRichHtml(para)) return para;
  return escapeHtml(para).replace(/\n/g, '<br>');
}

/** Detecta grifos de parágrafo já aplicados (geração manual ou automática). */
export function hasDiscourseParagraphHighlights(body: string) {
  return /discourse-hl|mso-highlight|background-color\s*:|background\s*:\s*#/i.test(body);
}

/**
 * Formata roteiro com parágrafos alternados grifados / sem grifo
 * (2º, 4º, 6º… parágrafo com destaque ciano — ajuda na tribuna).
 */
export function formatDiscourseManuscriptHtml(body: string) {
  const paragraphs = extractParagraphs(body);
  if (!paragraphs.length) return '<p class="MsoNormal"><br></p>';

  return paragraphs
    .map((para, index) => {
      const inner = paragraphInnerHtml(para);
      if (index % 2 === 1) {
        return `<p class="MsoNormal discourse-hl"><span class="discourse-hl-text" style="background-color:${DISCOURSE_MANUSCRIPT_HIGHLIGHT};mso-highlight:cyan;">${inner}</span></p>`;
      }
      return `<p class="MsoNormal">${inner}</p>`;
    })
    .join('\n');
}

/** Garante classe MsoNormal em parágrafos exportados. */
export function ensureMsoNormalParagraphs(html: string) {
  return html.replace(/<p(?!\s[^>]*class=)([^>]*)>/gi, '<p class="MsoNormal"$1>');
}

export function prepareDiscourseBodyHtml(body: string) {
  const html = hasDiscourseParagraphHighlights(body)
    ? body
    : formatDiscourseManuscriptHtml(body);
  return ensureMsoNormalParagraphs(html);
}
