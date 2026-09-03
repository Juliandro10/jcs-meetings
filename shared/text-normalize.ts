/** Normaliza texto para comparação (minúsculas, sem acentos). */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Converte espaços HTML (`&nbsp;` e equivalentes, inclusive já escapados
 * como `&amp;nbsp;`) em espaço normal. Idempotente — seguro em reexportação.
 */
export function htmlSpaceEntitiesToAscii(value: string): string {
  return value
    .replace(/&amp;(nbsp|#160|#x0*A0);/gi, ' ')
    .replace(/&nbsp;|&#160;|&#x0*A0;/gi, ' ')
    .replace(/\u00A0/g, ' ');
}

/** Texto plano para busca de trechos (HTML entities, NBSP, espaços). */
export function normalizePlainText(value: string): string {
  return htmlSpaceEntitiesToAscii(value)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
