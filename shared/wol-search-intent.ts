export type WolSearchRequest = {
  requested: true;
  query: string;
};

const WOL_TARGET_RE =
  /\b(?:biblioteca\s+on-?line|wol|jw\.org)\b/i;

const WOL_ACTION_RE =
  /\b(?:pesquis(?:e|ar|a)|procure?|busque?|ache?|encontre|use|consulte|veja|olhe)\b/i;

const WOL_TOPIC_RE =
  /\b(?:experi[eê]ncia(?:s)?|ilustra[cç][aã]o(?:es)?|exemplo(?:s)?|artigo(?:s)?|mat[eé]ria(?:s)?|trecho(?:s)?|relato(?:s)?)\b/i;

function cleanQuery(value: string) {
  return value
    .replace(/\s+na\s+biblioteca\s+on-?line.*$/i, '')
    .replace(/\s+no\s+jw\.org.*$/i, '')
    .replace(/\s+na\s+wol.*$/i, '')
    .replace(/\s+em\s+jw\.org.*$/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVagueWolQuery(query: string) {
  const q = query.toLowerCase();
  return (
    q.length > 90 ||
    /ponto selecionado|tema do discurso|mat[eé]ria em estudo|se n[aã]o houver sele[cç][aã]o/i.test(q) ||
    /^uma experi[eê]ncia ou ilustra[cç][aã]o/i.test(q) ||
    /^experi[eê]ncia ou ilustra[cç][aã]o/i.test(q)
  );
}

function queryFromHints(hints?: { selectedText?: string; publicationTitle?: string }) {
  if (hints?.selectedText?.trim()) {
    return cleanQuery(hints.selectedText.slice(0, 140));
  }
  if (hints?.publicationTitle?.trim()) {
    const theme = hints.publicationTitle
      .replace(/^[^—-]+[—-]\s*/, '')
      .replace(/^\d+\.\s*/, '')
      .trim();
    return cleanQuery(theme.slice(0, 140));
  }
  return '';
}

function extractQueryFromMessage(message: string) {
  const sobre = message.match(
    /\bsobre\s+(.+?)(?:\s+(?:na|no|em)\s+(?:biblioteca\s+on-?line|wol|jw\.org)|[.?!]|$)/i,
  );
  if (sobre?.[1]) return cleanQuery(sobre[1]);

  const experiencia = message.match(
    /\bexperi[eê]ncia(?:s)?\s+(?:de|sobre)\s+(.+?)(?:\s+(?:na|no|em)\s+(?:biblioteca\s+on-?line|wol|jw\.org)|[.?!]|$)/i,
  );
  if (experiencia?.[1]) return cleanQuery(experiencia[1]);

  const ilustracao = message.match(
    /\bilustra[cç][aã]o(?:es)?\s+(?:de|sobre)\s+(.+?)(?:\s+(?:na|no|em)\s+(?:biblioteca\s+on-?line|wol|jw\.org)|[.?!]|$)/i,
  );
  if (ilustracao?.[1]) return cleanQuery(ilustracao[1]);

  const quoted = message.match(/["“]([^"”]{3,120})["”]/);
  if (quoted?.[1]) return cleanQuery(quoted[1]);

  const afterWol = message.match(
    /\b(?:biblioteca\s+on-?line|wol|jw\.org)\b[^.?!]{0,24}\b(?:sobre|de|para|com)\s+(.+?)(?:[.?!]|$)/i,
  );
  if (afterWol?.[1]) return cleanQuery(afterWol[1]);

  const afterAction = message.match(
    new RegExp(
      `\\b(?:pesquis(?:e|ar|a)|procure?|busque?|ache?|encontre|use|consulte)\\b[\\s\\S]{0,48}?\\b(?:na|no|em)\\s+(?:biblioteca\\s+on-?line|wol|jw\\.org)\\b\\s*(?:por|para|sobre)?\\s*(.+?)(?:[.?!]|$)`,
      'i',
    ),
  );
  if (afterAction?.[1]) return cleanQuery(afterAction[1]);

  return '';
}

/** Detecta pedido explícito de pesquisa na Biblioteca On-line / jw.org. */
export function parseWolSearchRequest(
  message: string,
  hints?: { selectedText?: string; publicationTitle?: string; outlineMode?: boolean },
): WolSearchRequest | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  const hasWolTarget = WOL_TARGET_RE.test(trimmed);
  const hasActionNearWol =
    hasWolTarget &&
    (WOL_ACTION_RE.test(trimmed) ||
      /\b(?:pesquisa|busca)\b/i.test(trimmed) ||
      WOL_TOPIC_RE.test(trimmed));
  const hasTopicNearWol = hasWolTarget && WOL_TOPIC_RE.test(trimmed);
  const outlineExperienceSearch =
    Boolean(hints?.outlineMode) &&
    WOL_ACTION_RE.test(trimmed) &&
    WOL_TOPIC_RE.test(trimmed);

  if (!hasActionNearWol && !hasTopicNearWol && !outlineExperienceSearch) return null;

  let query = extractQueryFromMessage(trimmed);
  if (!query || isVagueWolQuery(query)) {
    const fromHints = queryFromHints(hints);
    if (fromHints) query = fromHints;
  }

  return { requested: true, query };
}
