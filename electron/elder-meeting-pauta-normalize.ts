import {
  normalizePautaRawText,
  parseMethodLabel,
  parsedPautaToAgendaItems,
  pickBestHeuristicParse,
  shouldUseAiPautaFallback,
  type PautaParseStrategy,
} from '../shared/elder-meeting-pauta-parse';
import { parsePautaWithAi } from './elder-meeting-pauta-ai';
import { newAgendaItemId, type ElderMeetingAgendaItem } from './elder-meeting-store';

export type PautaNormalizeResult = {
  items: ElderMeetingAgendaItem[];
  openingPrayer: string;
  closingPrayer: string;
  rawText: string;
  parseMethod: PautaParseStrategy | 'ai';
  parseMethodLabel: string;
  parseScore?: number;
  usedAi: boolean;
};

function toAgendaItems(parsed: ReturnType<typeof parsedPautaToAgendaItems>) {
  return parsed.map((entry) => ({
    id: newAgendaItemId(),
    title: entry.title,
    notes: entry.notes,
  }));
}

export async function normalizePautaText(
  text: string,
  options?: { forceAi?: boolean },
): Promise<{ ok: true; result: PautaNormalizeResult } | { ok: false; error: string }> {
  const rawText = normalizePautaRawText(text);
  if (!rawText.trim()) {
    return { ok: false, error: 'Nenhum texto de pauta encontrado.' };
  }

  const heuristic = pickBestHeuristicParse(rawText);
  let document = heuristic.document;
  let parseMethod: PautaParseStrategy | 'ai' = heuristic.strategy;
  let parseScore = heuristic.score;
  let usedAi = false;

  const needsAi = options?.forceAi || shouldUseAiPautaFallback(heuristic, rawText);

  if (needsAi) {
    const ai = await parsePautaWithAi(rawText);
    if (ai.ok && ai.document && ai.document.items.length > 0) {
      document = ai.document;
      parseMethod = 'ai';
      usedAi = true;
      parseScore = undefined;
    } else if (options?.forceAi) {
      return {
        ok: false,
        error: ai.error ?? 'A IA não conseguiu organizar esta pauta.',
      };
    }
  }

  const agenda = parsedPautaToAgendaItems(document);
  if (agenda.length === 0) {
    return { ok: false, error: 'Nenhum assunto reconhecido na pauta.' };
  }

  return {
    ok: true,
    result: {
      items: toAgendaItems(agenda),
      openingPrayer: document.openingPrayer,
      closingPrayer: document.closingPrayer,
      rawText,
      parseMethod,
      parseMethodLabel: parseMethodLabel(parseMethod),
      parseScore,
      usedAi,
    },
  };
}
