import { parseWolSearchRequest } from '../shared/wol-search-intent';
import { buildWolResearchForQuery } from './jw-online-search';
import type { AiChatContext, WolResearchMeta } from './types';

export async function loadWolResearchForChat(
  message: string,
  context: AiChatContext,
): Promise<{ text?: string; meta?: WolResearchMeta }> {
  const request = parseWolSearchRequest(message, {
    selectedText: context.selectedText,
    publicationTitle: context.publicationTitle,
    outlineMode: context.contentKind === 'elder-outline',
  });
  if (!request) return {};

  if (!request.query || request.query.length < 2) {
    return {
      text: [
        'O usuário pediu pesquisa na Biblioteca On-line (WOL/jw.org), mas não informou termos claros.',
        'Peça termos de busca (ex.: "separação do mundo", "experiência de integridade") ou selecione um trecho do esboço e repita o pedido.',
      ].join(' '),
      meta: {
        query: '',
        hitCount: 0,
        fetchedCount: 0,
        unavailable: true,
      },
    };
  }

  const research = await buildWolResearchForQuery(request.query, {
    experienceBias: /\bexperi[eê]ncia|ilustra[cç][aã]o|relato\b/i.test(message),
  });
  if (!research.text) {
    return {
      text: [
        `Pesquisa solicitada na Biblioteca On-line (WOL/jw.org) por: "${research.query}".`,
        research.triedQueries.length > 1
          ? `Também foram tentados: ${research.triedQueries.filter((item) => item !== research.query).map((item) => `"${item}"`).join(', ')}.`
          : '',
        research.error ?? 'Nenhum resultado encontrado.',
        'Informe isso ao usuário e não invente experiências nem citações.',
      ]
        .filter(Boolean)
        .join(' '),
      meta: {
        query: research.query,
        triedQueries: research.triedQueries,
        hitCount: research.hitCount,
        fetchedCount: 0,
        unavailable: true,
      },
    };
  }

  return {
    text: research.text,
    meta: {
      query: research.query,
      triedQueries: research.triedQueries,
      hitCount: research.hitCount,
      fetchedCount: research.fetchedCount,
    },
  };
}
