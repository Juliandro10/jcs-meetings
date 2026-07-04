import { loadBibleReadingText } from './bible-reading-context';
import {
  blockIdForParagraphNumber,
  buildFieldPromptLines,
  extractDocumentStructure,
  extractWatchtowerStudyStructure,
  findAnchorInBlock,
  formatJoiasField,
  getPartBlockRanges,
  resolveHighlightInBlock,
  resolveNoteTitle,
  type DocumentStructure,
  type MeetingPart,
  type WatchtowerQuestion,
  type WatchtowerStudyStructure,
} from './document-structure';
import {
  buildAiSystemPrompt,
  JW_AI_GROUNDING_RULES,
  JW_HIGHLIGHT_RULES,
  JW_JOIAS_RULES,
  JW_PERSONAL_LEARNING_NOTE_RULES,
  JW_PRACTICE_POINTS_RULES,
  JW_SENTINEL_PREP_RULES,
  JW_SENTINEL_HIGHLIGHT_RULES,
} from './ai-prompts';
import { enrichAiContext } from './ai-context';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import type { AutoPrepNote, AutoPrepParams, AutoPrepResult } from './types';
import { dedupeNotesForDocument } from './note-dedupe';
import {
  fieldKey,
  replaceTaggedNotes,
  saveHighlightsBatch,
  setFieldValue,
} from './user-prep-store';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const AUTO_PREP_MODEL = process.env.OPENAI_AUTO_PREP_MODEL?.trim() || 'gpt-4o';

const JOIA_VERSE_RE = /\b(?:[A-Za-zÀ-ú]{2,4}\.\s*)?\d{1,3}\s*:\s*\d{1,3}\b/;

const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'] as const;

function normalizeJoiasOptions(raw: string[] | undefined, joiasFieldValue?: string) {
  const options = [...(raw ?? [])].map((item) => item.trim()).filter(Boolean);

  if (options.length < 3 && joiasFieldValue?.trim()) {
    const lines = joiasFieldValue
      .split(/\n+/)
      .map((line) => line.replace(/^\d+\)\s*/, '').trim())
      .filter(Boolean);
    options.push(...lines);
  }

  const unique: string[] = [];
  for (const option of options) {
    if (!unique.some((item) => item.toLowerCase() === option.toLowerCase())) unique.push(option);
  }
  return unique.slice(0, 3);
}

function joiaHasApplication(text: string) {
  const parts = text.split(/\s[—–-]\s/);
  if (parts.length < 2) return false;
  const body = parts.slice(1).join(' — ').trim();
  if (body.length < 20) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes('aprend') ||
    lower.includes('jeová') ||
    lower.includes('jeova') ||
    lower.includes('podemos') ||
    lower.includes('nós') ||
    lower.includes('nos ') ||
    lower.includes('minister') ||
    lower.includes('congreg') ||
    lower.includes('vida') ||
    lower.includes('ensina') ||
    lower.includes('exemplo') ||
    lower.includes('sobre jeová') ||
    lower.includes('vida crist') ||
    body.length >= 35
  );
}

function joiasLookValid(options: string[]) {
  return (
    options.length >= 3 &&
    options.every((item) => JOIA_VERSE_RE.test(item) && joiaHasApplication(item))
  );
}

function blockContainsText(blockText: string, needle: string) {
  return resolveHighlightInBlock(blockText, needle) !== null;
}

function isHighlightBodyBlock(text: string, part: MeetingPart) {
  const trimmed = text.trim();
  if (trimmed === part.text.trim()) return false;
  if (/^\d+\.\s/.test(trimmed) && trimmed.length < 120) return false;
  if (/^\(\d+\s*min\)/i.test(trimmed)) return false;
  if (trimmed.endsWith('?') && trimmed.length < 220) return false;
  return trimmed.length >= 24;
}

function refineHighlights(
  highlights: NonNullable<AutoPrepResult['highlights']>,
  parts: MeetingPart[],
  blocks: Array<{ blockId: string; text: string }>,
) {
  const blockById = new Map(blocks.map((block) => [block.blockId, block.text]));
  const partRanges = getPartBlockRanges(parts, blocks);
  const skipKinds = new Set<MeetingPart['kind']>(['reading', 'local', 'other']);

  const resolved = highlights
    .map((highlight) => {
      const block = blockById.get(highlight.blockId);
      if (!block) return null;
      const located = resolveHighlightInBlock(block, highlight.text);
      if (!located) return null;
      const wordCount = located.text.trim().split(/\s+/).length;
      if (wordCount > 22 || wordCount < 3) return null;
      if (/^\(?\d+\s*min\)?$/i.test(located.text.trim())) return null;
      return { ...highlight, text: located.text, startOffset: located.startOffset, endOffset: located.endOffset };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const byPart = new Map<string, (typeof resolved)[number]>();
  for (const part of parts) {
    if (skipKinds.has(part.kind)) continue;
    const rangeIds = new Set(partRanges.get(part.blockId) ?? [part.blockId]);
    const candidates = resolved.filter((highlight) => rangeIds.has(highlight.blockId));
    if (candidates.length === 0) continue;

    const scored = candidates
      .map((highlight) => {
        const blockText = blockById.get(highlight.blockId) ?? '';
        const bodyScore = isHighlightBodyBlock(blockText, part) ? 0 : 2;
        const titleScore = highlight.blockId === part.blockId ? 1 : 0;
        return { highlight, score: bodyScore + titleScore };
      })
      .sort((a, b) => a.score - b.score || b.highlight.text.length - a.highlight.text.length);

    byPart.set(part.blockId, scored[0].highlight);
  }

  return [...byPart.values()]
    .slice(0, Math.min(10, Math.max(5, parts.length)))
    .map((highlight, index) => ({
      ...highlight,
      color: HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length],
    }));
}

function normalizeNotesAgainstStructure(
  notes: AutoPrepNote[],
  structure: DocumentStructure,
): AutoPrepNote[] {
  const { parts, blocks } = structure;
  const blockById = new Map(blocks.map((block) => [block.blockId, block.text]));

  const normalized = notes.map((note) => {
    const part =
      parts.find((item) => item.blockId === note.blockId) ??
      parts.find((item) => note.title.includes(item.title.slice(0, 12)));

    const blockId = part?.blockId ?? note.blockId;
    const blockText = blockById.get(blockId) ?? part?.text ?? '';
    const anchorText = findAnchorInBlock(blockText, note.anchorText || part?.noteAnchorText || note.title);
    const title = resolveNoteTitle(structure, blockId) ?? part?.title ?? note.title;

    return {
      ...note,
      blockId,
      title,
      anchorText,
      tags: note.tags?.length ? note.tags : ['auto-prep'],
    };
  });

  for (const part of parts) {
    const already = normalized.some((note) => note.blockId === part.blockId);
    if (already) continue;

    normalized.push({
      blockId: part.blockId,
      anchorText: part.noteAnchorText,
      title: part.title,
      body: '',
      tags: ['auto-prep'],
    });
  }

  return normalized.filter((note) => note.blockId && note.anchorText && note.title);
}

async function requestJoiasOptions(
  apiKey: string,
  bibleReadingLabel: string | undefined,
  bibleText: string | undefined,
  documentExcerpt: string,
): Promise<string[]> {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AUTO_PREP_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Você prepara Joias espirituais para a reunião Vida e Ministério.',
            JW_AI_GROUNDING_RULES,
            JW_JOIAS_RULES,
            `Leitura da semana: ${bibleReadingLabel ?? '—'}.`,
            bibleText ? `Texto bíblico:\n${bibleText.slice(0, 8000)}` : '',
            'Devolva APENAS JSON: {"joiasOptions":["...","...","..."]}',
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          role: 'user',
          content: `Matéria:\n${documentExcerpt.slice(0, 4000)}\n\nGere 3 joias espirituais.`,
        },
      ],
    }),
  });

  if (!response.ok) return [];
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { joiasOptions?: string[] };
  return normalizeJoiasOptions(parsed.joiasOptions);
}

type WatchtowerResolvedHighlight = {
  blockId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color: string;
};

function highlightOverlaps(
  a: Pick<WatchtowerResolvedHighlight, 'blockId' | 'startOffset' | 'endOffset'>,
  b: Pick<WatchtowerResolvedHighlight, 'blockId' | 'startOffset' | 'endOffset'>,
) {
  return a.blockId === b.blockId && !(a.endOffset <= b.startOffset || b.endOffset <= a.startOffset);
}

function resolveWatchtowerHighlight(
  highlight: NonNullable<AutoPrepResult['highlights']>[number],
  wtStructure: WatchtowerStudyStructure,
  preferredBlockIds?: string[],
): WatchtowerResolvedHighlight | null {
  const blockById = new Map(wtStructure.blocks.map((block) => [block.blockId, block.text]));
  const MIN_WORDS = 3;
  const MAX_WORDS = 28;

  const tryBlock = (blockId: string) => {
    const block = blockById.get(blockId);
    if (!block) return null;
    const located = resolveHighlightInBlock(block, highlight.text);
    if (!located) return null;
    const wordCount = located.text.trim().split(/\s+/).length;
    if (wordCount > MAX_WORDS || wordCount < MIN_WORDS) return null;
    return {
      blockId,
      text: located.text,
      startOffset: located.startOffset,
      endOffset: located.endOffset,
      color: highlight.color,
    };
  };

  const normalizedId = highlight.blockId.replace(/^p/i, '');
  const directIds = [
    highlight.blockId,
    normalizedId,
    blockIdForParagraphNumber(wtStructure.blocks, normalizedId),
  ].filter((id): id is string => Boolean(id));

  for (const blockId of [...new Set(directIds)]) {
    const resolved = tryBlock(blockId);
    if (resolved) return resolved;
  }

  const searchIds = preferredBlockIds?.length
    ? preferredBlockIds
    : wtStructure.blocks.map((block) => block.blockId);
  for (const blockId of searchIds) {
    if (directIds.includes(blockId)) continue;
    const resolved = tryBlock(blockId);
    if (resolved) return resolved;
  }

  return null;
}

function extractHeuristicHighlightsFromBlock(
  blockId: string,
  blockText: string,
  maxCount: number,
  existing: WatchtowerResolvedHighlight[],
): WatchtowerResolvedHighlight[] {
  if (maxCount <= 0) return [];

  const content = blockText.replace(/\s+/g, ' ').trim();
  if (content.length < 40) return [];

  const sentenceCandidates = content
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ0-9"«(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      const words = sentence.split(/\s+/).length;
      return words >= 6 && words <= 28 && sentence.length >= 28;
    });

  const pickIndexes =
    sentenceCandidates.length >= maxCount
      ? [0, Math.floor(sentenceCandidates.length / 2), sentenceCandidates.length - 1].slice(0, maxCount)
      : sentenceCandidates.map((_, index) => index);

  const results: WatchtowerResolvedHighlight[] = [];
  for (const index of pickIndexes) {
    const sentence = sentenceCandidates[index];
    if (!sentence) continue;
    const located = resolveHighlightInBlock(blockText, sentence);
    if (!located) continue;
    const candidate: WatchtowerResolvedHighlight = {
      blockId,
      text: located.text,
      startOffset: located.startOffset,
      endOffset: located.endOffset,
      color: 'yellow',
    };
    if (existing.some((item) => highlightOverlaps(item, candidate))) continue;
    if (results.some((item) => highlightOverlaps(item, candidate))) continue;
    results.push(candidate);
    if (results.length >= maxCount) break;
  }

  if (results.length >= maxCount) return results;

  const words = content.split(/\s+/).filter(Boolean);
  for (let offset = 0; offset < words.length && results.length < maxCount; offset += 14) {
    const chunk = words.slice(offset, offset + 16).join(' ');
    if (chunk.split(/\s+/).length < 6) continue;
    const located = resolveHighlightInBlock(blockText, chunk);
    if (!located) continue;
    const candidate: WatchtowerResolvedHighlight = {
      blockId,
      text: located.text,
      startOffset: located.startOffset,
      endOffset: located.endOffset,
      color: 'yellow',
    };
    if (existing.some((item) => highlightOverlaps(item, candidate))) continue;
    if (results.some((item) => highlightOverlaps(item, candidate))) continue;
    results.push(candidate);
  }

  return results;
}

function buildWatchtowerQuestionsList(wtStructure: WatchtowerStudyStructure) {
  return wtStructure.questions
    .map((question) => {
      const answerBlocks =
        question.answerBlockIds.length > 0
          ? question.answerBlockIds.join(', ')
          : 'inferir do texto da pergunta';
      return `- campo ${question.fieldId} | ${question.isReview ? 'REVISÃO' : 'estudo'} | pergunta §${question.questionBlockId} | resposta nos § ${answerBlocks}`;
    })
    .join('\n');
}

function answerExcerptForQuestion(
  question: WatchtowerQuestion,
  blockById: Map<string, string>,
) {
  return question.answerBlockIds
    .map((blockId) => {
      const text = blockById.get(blockId);
      return text ? `[§${blockId}] ${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function normalizeSentinelFieldsFromAi(
  raw: Array<{ fieldId?: string; value?: string }>,
  wtStructure: WatchtowerStudyStructure,
): Array<{ fieldId: string; value: string }> {
  const known = new Map(wtStructure.questions.map((question) => [question.fieldId, question]));
  const result = new Map<string, string>();

  for (const field of raw) {
    if (!field.fieldId || !field.value?.trim()) continue;

    let fieldId = field.fieldId.trim();
    if (!known.has(fieldId)) {
      const fuzzy = wtStructure.questions.find(
        (question) =>
          question.fieldId.toLowerCase() === fieldId.toLowerCase() ||
          question.fieldId.endsWith(fieldId) ||
          fieldId.endsWith(question.fieldId),
      );
      if (fuzzy) fieldId = fuzzy.fieldId;
    }

    const question = known.get(fieldId);
    if (!question) continue;

    result.set(
      fieldId,
      normalizeSentinelFieldValue(field.value.trim(), question.isReview),
    );
  }

  return [...result.entries()].map(([fieldId, value]) => ({ fieldId, value }));
}

async function requestWatchtowerFields(
  apiKey: string,
  systemPrefix: string,
  wtStructure: WatchtowerStudyStructure,
  documentExcerpt: string,
  questionsList: string,
): Promise<Array<{ fieldId: string; value: string }>> {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AUTO_PREP_MODEL,
      temperature: 0.25,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            systemPrefix,
            JW_SENTINEL_PREP_RULES,
            '',
            'Devolva APENAS JSON válido (sem markdown):',
            '{"fields":[{"fieldId":"tt1","value":"Resposta principal: ...\\n\\nResposta adicional: ..."}]}',
            '',
            'Preencha TODOS os campos — um objeto por fieldId.',
            'Campos:',
            questionsList || '- detecte perguntas numeradas na matéria',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Matéria:\n${documentExcerpt.slice(0, 14000)}\n\nPreencha TODOS os campos de resposta da Sentinela.`,
        },
      ],
    }),
  });

  if (!response.ok) return [];
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as { fields?: Array<{ fieldId?: string; value?: string }> };
  return normalizeSentinelFieldsFromAi(parsed.fields ?? [], wtStructure);
}

async function requestMissingSentinelFields(
  apiKey: string,
  systemPrefix: string,
  wtStructure: WatchtowerStudyStructure,
  documentExcerpt: string,
  existing: Array<{ fieldId: string; value: string }>,
): Promise<Array<{ fieldId: string; value: string }>> {
  const blockById = new Map(wtStructure.blocks.map((block) => [block.blockId, block.text]));
  const merged = new Map(existing.map((field) => [field.fieldId, field.value]));

  for (let round = 0; round < 4; round += 1) {
    const missing = wtStructure.questions.filter((question) => !merged.get(question.fieldId)?.trim());
    if (missing.length === 0) break;

    for (let index = 0; index < missing.length; index += 4) {
      const batch = missing.slice(index, index + 4);
      const pendingLines = batch.map((question) => {
        const excerpt = answerExcerptForQuestion(question, blockById).slice(0, 1200);
        return [
          `- fieldId EXATO: ${question.fieldId}`,
          `  pergunta: "${question.questionText.replace(/\s+/g, ' ').slice(0, 220)}"`,
          `  § resposta: ${question.answerBlockIds.join(', ') || 'inferir'}`,
          excerpt ? `  texto da resposta:\n${excerpt}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      });

      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AUTO_PREP_MODEL,
          temperature: 0.25,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                systemPrefix,
                JW_SENTINEL_PREP_RULES,
                '',
                'Complete SOMENTE os campos pendentes abaixo. APENAS JSON:',
                '{"fields":[{"fieldId":"tt1","value":"Resposta principal: ...\\n\\nResposta adicional: ..."}]}',
                'Use o fieldId EXATO de cada linha.',
                '',
                'Pendentes:',
                ...pendingLines,
              ].join('\n'),
            },
            {
              role: 'user',
              content: documentExcerpt.slice(0, 12000),
            },
          ],
        }),
      });

      if (!response.ok) continue;
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = data.choices?.[0]?.message?.content?.trim();
      if (!raw) continue;

      const parsed = JSON.parse(raw) as { fields?: Array<{ fieldId?: string; value?: string }> };
      for (const field of normalizeSentinelFieldsFromAi(parsed.fields ?? [], wtStructure)) {
        merged.set(field.fieldId, field.value);
      }
    }
  }

  return [...merged.entries()].map(([fieldId, value]) => ({ fieldId, value }));
}

function buildHeuristicSentinelField(
  question: WatchtowerQuestion,
  blockById: Map<string, string>,
): string {
  const excerpt = answerExcerptForQuestion(question, blockById).replace(/\[§\d+\]\s*/g, ' ');
  const sentences = excerpt
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);

  const main = sentences[0] ?? excerpt.slice(0, 180).trim();
  const extra = sentences[1] ?? sentences[0] ?? 'Aplicação pessoal com base no parágrafo citado.';
  const prefix =
    question.isReview && question.answerBlockIds.length > 0
      ? `Parágrafo(s): ${question.answerBlockIds.join(', ')}\n`
      : question.isReview
        ? 'Parágrafo(s): —\n'
        : '';

  return normalizeSentinelFieldValue(
    `${prefix}Resposta principal: ${main.replace(/^resposta principal:\s*/i, '')}\n\nResposta adicional: ${extra.replace(/^resposta adicional:\s*/i, '')}`,
    question.isReview,
  );
}

function fillHeuristicSentinelFields(
  wtStructure: WatchtowerStudyStructure,
  existing: Array<{ fieldId: string; value: string }>,
): Array<{ fieldId: string; value: string }> {
  const blockById = new Map(wtStructure.blocks.map((block) => [block.blockId, block.text]));
  const merged = new Map(existing.map((field) => [field.fieldId, field.value]));

  for (const question of wtStructure.questions) {
    if (merged.get(question.fieldId)?.trim()) continue;
    if (question.answerBlockIds.length === 0 && !blockById.get(question.questionBlockId)) continue;
    merged.set(question.fieldId, buildHeuristicSentinelField(question, blockById));
  }

  return [...merged.entries()].map(([fieldId, value]) => ({ fieldId, value }));
}

async function requestWatchtowerHighlights(
  apiKey: string,
  systemPrefix: string,
  wtStructure: WatchtowerStudyStructure,
  documentExcerpt: string,
  questionsList: string,
): Promise<NonNullable<AutoPrepResult['highlights']>> {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AUTO_PREP_MODEL,
      temperature: 0.25,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            systemPrefix,
            JW_SENTINEL_HIGHLIGHT_RULES,
            '',
            'Devolva APENAS JSON válido (sem markdown):',
            '{"highlights":[{"blockId":"5","text":"trecho EXATO copiado do parágrafo (8-25 palavras)","color":"yellow"}]}',
            '',
            '- Grife nos § da RESPOSTA indicados em cada pergunta.',
            '- Mínimo 2 grifos por pergunta; mesma cor por pergunta.',
            '- text = cópia EXATA do parágrafo (não parafraseie).',
            '',
            'Perguntas:',
            questionsList || '- detecte perguntas numeradas na matéria',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Matéria:\n${documentExcerpt.slice(0, 14000)}\n\nGere grifos para TODAS as perguntas.`,
        },
      ],
    }),
  });

  if (!response.ok) return [];
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as { highlights?: AutoPrepResult['highlights'] };
  return (parsed.highlights ?? []).filter((highlight) => highlight.blockId && highlight.text && highlight.color);
}

async function requestMissingWatchtowerHighlights(
  apiKey: string,
  systemPrefix: string,
  wtStructure: WatchtowerStudyStructure,
  questions: WatchtowerQuestion[],
): Promise<NonNullable<AutoPrepResult['highlights']>> {
  if (questions.length === 0) return [];

  const blockById = new Map(wtStructure.blocks.map((block) => [block.blockId, block.text]));
  const lines = questions.map((question) => {
    const excerpt = answerExcerptForQuestion(question, blockById).slice(0, 1500);
    return [
      `- § resposta ${question.answerBlockIds.join(', ') || question.questionBlockId}`,
      `  pergunta: "${question.questionText.replace(/\s+/g, ' ').slice(0, 180)}"`,
      excerpt ? `  parágrafos:\n${excerpt}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AUTO_PREP_MODEL,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            systemPrefix,
            JW_SENTINEL_HIGHLIGHT_RULES,
            '',
            'Gere grifos SOMENTE para as perguntas abaixo. APENAS JSON:',
            '{"highlights":[{"blockId":"5","text":"trecho EXATO (8-25 palavras)","color":"yellow"}]}',
            'Mínimo 2 grifos distintos por pergunta. text = cópia EXATA do parágrafo.',
            '',
            ...lines,
          ].join('\n'),
        },
        {
          role: 'user',
          content: 'Gere os grifos pendentes com trechos literais dos parágrafos indicados.',
        },
      ],
    }),
  });

  if (!response.ok) return [];
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as { highlights?: AutoPrepResult['highlights'] };
  return (parsed.highlights ?? []).filter((highlight) => highlight.blockId && highlight.text && highlight.color);
}

function refineWatchtowerHighlights(
  highlights: NonNullable<AutoPrepResult['highlights']>,
  wtStructure: WatchtowerStudyStructure,
): { highlights: WatchtowerResolvedHighlight[]; gaps: WatchtowerQuestion[] } {
  const blockById = new Map(wtStructure.blocks.map((block) => [block.blockId, block.text]));
  const MAX_PER_BLOCK = 3;
  const TARGET_PER_QUESTION = 3;
  const MIN_PER_QUESTION = 2;

  const valid = highlights
    .map((highlight) => resolveWatchtowerHighlight(highlight, wtStructure))
    .filter((item): item is WatchtowerResolvedHighlight => item !== null);

  const result: WatchtowerResolvedHighlight[] = [];
  const gaps: WatchtowerQuestion[] = [];
  let colorIndex = 0;

  for (const question of wtStructure.questions) {
    const answerBlockIds =
      question.answerBlockIds.length > 0 ? question.answerBlockIds : [question.questionBlockId];
    const questionColor = HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length]!;
    colorIndex += 1;

    const candidates = valid
      .filter((highlight) => answerBlockIds.includes(highlight.blockId))
      .sort((a, b) => {
        const blockOrder = answerBlockIds.indexOf(a.blockId) - answerBlockIds.indexOf(b.blockId);
        if (blockOrder !== 0) return blockOrder;
        return a.startOffset - b.startOffset;
      });

    const perBlockCount = new Map<string, number>();
    const picked: WatchtowerResolvedHighlight[] = [];

    for (const candidate of candidates) {
      if (picked.length >= TARGET_PER_QUESTION) break;
      if ((perBlockCount.get(candidate.blockId) ?? 0) >= MAX_PER_BLOCK) continue;
      if (picked.some((existing) => highlightOverlaps(existing, candidate))) continue;
      picked.push({ ...candidate, color: questionColor });
      perBlockCount.set(candidate.blockId, (perBlockCount.get(candidate.blockId) ?? 0) + 1);
    }

    if (picked.length < MIN_PER_QUESTION) {
      const needed = TARGET_PER_QUESTION - picked.length;
      for (const blockId of answerBlockIds) {
        const blockText = blockById.get(blockId);
        if (!blockText) continue;
        const extra = extractHeuristicHighlightsFromBlock(
          blockId,
          blockText,
          needed,
          [...picked, ...result],
        );
        for (const candidate of extra) {
          if (picked.length >= TARGET_PER_QUESTION) break;
          if ((perBlockCount.get(candidate.blockId) ?? 0) >= MAX_PER_BLOCK) continue;
          if (picked.some((existing) => highlightOverlaps(existing, candidate))) continue;
          picked.push({ ...candidate, color: questionColor });
          perBlockCount.set(candidate.blockId, (perBlockCount.get(candidate.blockId) ?? 0) + 1);
        }
        if (picked.length >= MIN_PER_QUESTION) break;
      }
    }

    if (picked.length < MIN_PER_QUESTION) {
      for (const highlight of valid) {
        if (picked.length >= MIN_PER_QUESTION) break;
        if (!answerBlockIds.includes(highlight.blockId)) continue;
        if ((perBlockCount.get(highlight.blockId) ?? 0) >= MAX_PER_BLOCK) continue;
        if (picked.some((existing) => highlightOverlaps(existing, highlight))) continue;
        picked.push({ ...highlight, color: questionColor });
        perBlockCount.set(highlight.blockId, (perBlockCount.get(highlight.blockId) ?? 0) + 1);
      }
    }

    if (picked.length === 0) {
      for (const blockId of answerBlockIds) {
        const blockText = blockById.get(blockId);
        if (!blockText) continue;
        const extra = extractHeuristicHighlightsFromBlock(blockId, blockText, MIN_PER_QUESTION, result);
        for (const candidate of extra) {
          if (picked.length >= MIN_PER_QUESTION) break;
          picked.push({ ...candidate, color: questionColor });
        }
        if (picked.length > 0) break;
      }
    }

    if (picked.length < MIN_PER_QUESTION) gaps.push(question);
    result.push(...picked);
  }

  const used = new Set(result.map((item) => `${item.blockId}:${item.startOffset}:${item.endOffset}`));
  for (const highlight of valid) {
    if (result.length >= wtStructure.questions.length * TARGET_PER_QUESTION) break;
    const key = `${highlight.blockId}:${highlight.startOffset}:${highlight.endOffset}`;
    if (used.has(key)) continue;
    if (result.some((existing) => highlightOverlaps(existing, highlight))) continue;
    const blockCount = result.filter((item) => item.blockId === highlight.blockId).length;
    if (blockCount >= MAX_PER_BLOCK) continue;
    result.push({ ...highlight, color: highlight.color || 'yellow' });
    used.add(key);
  }

  return { highlights: result, gaps };
}

function normalizeSentinelFieldValue(value: string, isReview: boolean) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const hasMain = /resposta principal/i.test(trimmed);
  const hasExtra = /resposta adicional/i.test(trimmed);
  if (hasMain && hasExtra) return trimmed;

  const lines = trimmed.split(/\n+/).filter(Boolean);
  if (lines.length >= 2 && hasMain) return trimmed;

  const main = lines[0] ?? trimmed;
  const extra = lines.slice(1).join(' ').trim();
  const prefix = isReview && !/^parágrafo/i.test(main) ? `Parágrafo(s): —\n` : '';
  return `${prefix}Resposta principal: ${main.replace(/^resposta principal:\s*/i, '')}\n\nResposta adicional: ${extra || 'Aplicação pessoal com base no parágrafo citado.'}`;
}

async function requestMissingFields(
  apiKey: string,
  structure: DocumentStructure,
  documentExcerpt: string,
  existing: Array<{ fieldId: string; value: string }>,
  excludeFieldIds: string[] = [],
): Promise<Array<{ fieldId: string; value: string }>> {
  const excluded = new Set(excludeFieldIds);
  const missing = structure.fields.filter(
    (field) => !excluded.has(field.fieldId) && !existing.some((item) => item.fieldId === field.fieldId),
  );
  if (missing.length === 0) return existing;

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AUTO_PREP_MODEL,
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Complete campos editáveis da apostila. APENAS JSON.',
            '{"fields":[{"fieldId":"tt20","value":"resposta curta em 2-4 frases"}]}',
            JW_AI_GROUNDING_RULES,
            'Responda com suas palavras, vocabulário JW, sem copiar parágrafo inteiro.',
            'Campos pendentes:',
            ...missing.map((field) => {
              const question = (field.questionText ?? '').replace(/\s+/g, ' ').trim();
              return `- ${field.fieldId}: "${question}"`;
            }),
          ].join('\n'),
        },
        {
          role: 'user',
          content: documentExcerpt.slice(0, 9000),
        },
      ],
    }),
  });

  if (!response.ok) return existing;
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return existing;

  const parsed = JSON.parse(raw) as { fields?: Array<{ fieldId?: string; value?: string }> };
  const extra = (parsed.fields ?? [])
    .filter((field) => field.fieldId && field.value?.trim())
    .map((field) => ({ fieldId: field.fieldId!, value: field.value!.trim() }));

  const merged = [...existing];
  for (const field of extra) {
    if (!merged.some((item) => item.fieldId === field.fieldId)) merged.push(field);
  }
  return merged;
}

async function requestMissingNotes(
  apiKey: string,
  structure: DocumentStructure,
  documentExcerpt: string,
  existing: AutoPrepNote[],
): Promise<AutoPrepNote[]> {
  const { parts } = structure;
  const missing = parts.filter((part) => !existing.some((note) => note.blockId === part.blockId));
  if (missing.length === 0) return existing;

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AUTO_PREP_MODEL,
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Complete notas de preparação pessoal da reunião. APENAS JSON.',
            '{"notes":[{"blockId":"20","anchorText":"trecho EXATO","title":"título EXATO da parte (copie da lista abaixo)","body":"aprendizado pessoal","tags":["auto-prep"]}]}',
            JW_AI_GROUNDING_RULES,
            JW_PERSONAL_LEARNING_NOTE_RULES,
            'Use o title EXATO de cada parte listada abaixo — nunca só "(10 min)" ou trecho parcial.',
            'Para EBC: resumo do estudo + proveito pessoal (sem respostas das 3 perguntas — ficam no livro lfb).',
            'anchorText = trecho EXATO copiado do parágrafo indicado.',
            'Partes pendentes:',
            ...missing.map(
              (part) =>
                `- blockId ${part.blockId} | ${part.title} | anchor sugerido: "${part.noteAnchorText}"`,
            ),
          ].join('\n'),
        },
        {
          role: 'user',
          content: documentExcerpt.slice(0, 9000),
        },
      ],
    }),
  });

  if (!response.ok) return existing;
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return existing;

  const parsed = JSON.parse(raw) as { notes?: AutoPrepNote[] };
  const extra = (parsed.notes ?? []).filter((note) => note.blockId && note.title && note.body);
  return normalizeNotesAgainstStructure([...existing, ...extra], structure).filter((note) => note.body);
}

async function runWatchtowerAutoPrep(
  cacheDir: string,
  userDataDir: string,
  params: AutoPrepParams,
  filePath: string,
): Promise<AutoPrepResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'Configure OPENAI_API_KEY no arquivo .env.' };

  const html = await getDocumentHtml(filePath, params.documentId);
  const wtStructure = extractWatchtowerStudyStructure(html);
  if (wtStructure.blocks.length === 0) {
    return { ok: false, error: 'Não foi possível analisar os parágrafos da matéria.' };
  }

  const documentExcerpt = wtStructure.blocks.map((b) => `[§${b.blockId}] ${b.text}`).join('\n\n');
  const questionsList = buildWatchtowerQuestionsList(wtStructure);

  const context = await enrichAiContext(cacheDir, {
    weekLabel: params.weekLabel,
    publicationTitle: params.publicationTitle,
    bibleReading: params.bibleReading,
    sourcePub: params.pub,
    sourceIssue: params.issue,
    sourceDocumentId: params.documentId,
    documentText: documentExcerpt.slice(0, 12000),
  });

  const systemPrefix = [
    buildAiSystemPrompt(context),
    '',
    '## Tarefa: preparação automática — estudo de A Sentinela',
    JW_AI_GROUNDING_RULES,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    let fieldValues = await requestWatchtowerFields(
      apiKey,
      systemPrefix,
      wtStructure,
      documentExcerpt,
      questionsList,
    );

    if (fieldValues.length < wtStructure.questions.length) {
      fieldValues = await requestMissingSentinelFields(
        apiKey,
        systemPrefix,
        wtStructure,
        documentExcerpt,
        fieldValues,
      );
    }

    fieldValues = fillHeuristicSentinelFields(wtStructure, fieldValues);

    let highlightsRaw = await requestWatchtowerHighlights(
      apiKey,
      systemPrefix,
      wtStructure,
      documentExcerpt,
      questionsList,
    );

    let { highlights, gaps } = refineWatchtowerHighlights(highlightsRaw, wtStructure);

    if (gaps.length > 0) {
      for (let index = 0; index < gaps.length; index += 3) {
        const batch = gaps.slice(index, index + 3);
        const extra = await requestMissingWatchtowerHighlights(
          apiKey,
          systemPrefix,
          wtStructure,
          batch,
        );
        highlightsRaw = [...highlightsRaw, ...extra];
      }
      ({ highlights, gaps } = refineWatchtowerHighlights(highlightsRaw, wtStructure));
    }

    if (highlights.length > 0) {
      await saveHighlightsBatch(
        userDataDir,
        params.pub,
        params.issue,
        params.documentId,
        highlights.map((h) => ({
          id: crypto.randomUUID(),
          color: h.color,
          text: h.text,
          blockId: h.blockId,
          startOffset: h.startOffset,
          endOffset: h.endOffset,
        })),
      );
    }

    await replaceTaggedNotes(userDataDir, params.pub, params.issue, params.documentId, 'auto-prep', []);

    for (const field of fieldValues) {
      await setFieldValue(
        userDataDir,
        fieldKey(params.pub, params.issue, params.documentId, field.fieldId),
        field.value,
      );
    }

    const missingFields = wtStructure.questions.length - fieldValues.length;
    if (missingFields > 0 && fieldValues.length === 0) {
      return {
        ok: false,
        error: `Nenhum campo preenchido (${wtStructure.questions.length} perguntas detectadas). Verifique OPENAI_API_KEY e tente de novo.`,
      };
    }

    return { ok: true, highlights, fields: fieldValues, notes: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na preparação automática';
    return { ok: false, error: message };
  }
}

export async function runAutoPrep(
  cacheDir: string,
  userDataDir: string,
  params: AutoPrepParams,
): Promise<AutoPrepResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: 'Configure OPENAI_API_KEY no arquivo .env.' };
  }

  const filePath = await resolveCachedPubPath(cacheDir, params.pub, params.issue);
  if (!filePath) {
    return { ok: false, error: 'Publicação não baixada.' };
  }

  if (params.pub === 'w') {
    return runWatchtowerAutoPrep(cacheDir, userDataDir, params, filePath);
  }

  const html = await getDocumentHtml(filePath, params.documentId);
  const structure = extractDocumentStructure(html);
  if (structure.blocks.length === 0) {
    return { ok: false, error: 'Não foi possível analisar os parágrafos da matéria.' };
  }

  const bibleText = await loadBibleReadingText(
    cacheDir,
    structure.bibleReadingHref,
    params.bibleReading,
  );

  const joiasFieldId = structure.joiasFieldId;
  const treasuresFieldId = structure.treasuresFieldId;
  const documentExcerpt = structure.blocks.map((b) => `[p${b.blockId}] ${b.text}`).join('\n\n');

  const context = await enrichAiContext(cacheDir, {
    weekLabel: params.weekLabel,
    publicationTitle: params.publicationTitle,
    bibleReading: params.bibleReading,
    sourcePub: params.pub,
    sourceIssue: params.issue,
    sourceDocumentId: params.documentId,
    documentText: documentExcerpt.slice(0, 12000),
  });

  const partsList = structure.parts
    .map((part) => {
      const fieldHint = part.fieldId ? `campo: ${part.fieldId}` : 'sem campo — nota obrigatória';
      const ebcHint = part.kind === 'cbs' ? ' — conduza o estudo; respostas das perguntas ficam no livro lfb' : '';
      return `- blockId ${part.blockId} | ${part.title} (${part.kind}, ${fieldHint}) | anchor: "${part.noteAnchorText}"${ebcHint}`;
    })
    .join('\n');

  const fieldsList = buildFieldPromptLines(structure, {
    excludeFieldIds: joiasFieldId ? [joiasFieldId] : [],
  }).join('\n');

  const system = [
    buildAiSystemPrompt(context),
    '',
    '## Tarefa: preparação automática completa',
    JW_AI_GROUNDING_RULES,
    '',
    params.bibleReading ? `Leitura bíblica desta semana: ${params.bibleReading}.` : '',
    bibleText ? `\n### Texto da leitura bíblica\n${bibleText.slice(0, 8000)}` : '',
    '',
    'Devolva APENAS JSON válido (sem markdown):',
    '{"highlights":[{"blockId":"8","text":"trecho EXATO curto","color":"yellow"}],"fields":[{"fieldId":"tt20","value":"resposta curta"}],"notes":[{"blockId":"20","anchorText":"trecho EXATO","title":"4. Iniciando conversas","body":"o que aprendo..."}],"joiasOptions":["Jer. 11:4 — Sobre Jeová: ..."],"practiceNote":{"blockId":"40","anchorText":"trecho EXATO","body":"Pontos para prática..."}}',
    '',
    JW_HIGHLIGHT_RULES,
    '',
    'Regras para fields:',
    '- Preencha TODOS os campos editáveis listados abaixo (resposta curta: 2-4 frases).',
    '- Respostas às perguntas da apostila vão em "fields" — NÃO repita essas respostas em "notes".',
    '- Partes de Nossa Vida Cristã com várias perguntas: uma resposta por fieldId.',
    joiasFieldId ? `- NÃO use "fields" para ${joiasFieldId} (joias) — só "joiasOptions".` : '',
    treasuresFieldId ? `- Campo ${treasuresFieldId}: resposta à pergunta bíblica de Tesouros/Joias (versículo + aplicação).` : '',
    '',
    'Campos editáveis (preencha todos):',
    fieldsList || '- nenhum detectado',
    '',
    JW_PERSONAL_LEARNING_NOTE_RULES,
    JW_PRACTICE_POINTS_RULES,
    '',
    'Regras para notes (OBRIGATÓRIO — uma por parte abaixo):',
    '- "notes" deve ter UMA entrada para CADA parte listada.',
    '- "anchorText" = trecho EXATO copiado do parágrafo (use o anchor sugerido quando possível).',
    '- "body" = aprendizado pessoal (não roteiro de tribuna).',
    '- Parte EBC: resumo do estudo + proveito pessoal (NÃO inclua respostas às 3 perguntas — use o livro lfb).',
    '- Partes com campos editáveis: "notes" = aprendizado pessoal resumido (sem repetir o que já está nos fields).',
    '- Partes sem campo editável: respostas completas na nota.',
    '- "practiceNote": nota final "Pontos altos para colocar em prática" (3-5 bullets); anchor no último bloco da reunião ou EBC.',
    '',
    JW_JOIAS_RULES,
    '',
    'Partes da reunião (crie nota para cada uma):',
    partsList || '- detecte perguntas numeradas na matéria',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AUTO_PREP_MODEL,
        temperature: 0.25,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content:
              'Prepare esta semana de meio de semana: grifos, campos (exceto joias), nota de aprendizado pessoal para CADA parte, 3 joias, e practiceNote com pontos para prática.',
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `OpenAI retornou ${response.status}: ${body.slice(0, 180)}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return { ok: false, error: 'Resposta vazia da IA.' };

    const parsed = JSON.parse(raw) as {
      highlights?: AutoPrepResult['highlights'];
      fields?: AutoPrepResult['fields'];
      notes?: AutoPrepResult['notes'];
      joiasOptions?: string[];
      practiceNote?: { blockId?: string; anchorText?: string; body?: string };
    };

    const highlights = refineHighlights(
      (parsed.highlights ?? []).filter((h) => h.blockId && h.text && h.color),
      structure.parts,
      structure.blocks,
    );
    let fieldValues = (parsed.fields ?? []).filter((f) => f.fieldId && f.value);

    if (joiasFieldId) {
      fieldValues = fieldValues.filter((field) => field.fieldId !== joiasFieldId);
    }

    const joiasFromField = parsed.fields?.find((field) => field.fieldId === joiasFieldId)?.value;
    let joiasOptions = normalizeJoiasOptions(parsed.joiasOptions, joiasFromField);

    if (!joiasLookValid(joiasOptions)) {
      const retry = await requestJoiasOptions(
        apiKey,
        params.bibleReading,
        bibleText,
        documentExcerpt,
      );
      if (retry.length >= 3) joiasOptions = retry;
    }

    if (joiasFieldId && joiasOptions.length >= 3) {
      fieldValues.push({ fieldId: joiasFieldId, value: formatJoiasField(joiasOptions) });
    }

    const excludeFromRetry = joiasFieldId ? [joiasFieldId] : [];
    if (fieldValues.length < structure.fields.length - excludeFromRetry.length) {
      fieldValues = await requestMissingFields(
        apiKey,
        structure,
        documentExcerpt,
        fieldValues,
        excludeFromRetry,
      );
    }

    let notes = normalizeNotesAgainstStructure(parsed.notes ?? [], structure);
    notes = notes.filter((note) => note.body?.trim());
    notes = dedupeNotesForDocument(notes, structure);

    if (notes.length < structure.parts.length) {
      notes = await requestMissingNotes(apiKey, structure, documentExcerpt, notes);
      notes = dedupeNotesForDocument(
        notes.filter((note) => note.body?.trim()),
        structure,
      );
    }

    const practiceBody = parsed.practiceNote?.body?.trim();
    if (practiceBody) {
      const anchorBlockId =
        parsed.practiceNote?.blockId ??
        structure.parts.find((part) => part.kind === 'cbs')?.blockId ??
        structure.parts[structure.parts.length - 1]?.blockId ??
        structure.blocks[structure.blocks.length - 1]?.blockId;
      const blockText =
        structure.blocks.find((block) => block.blockId === anchorBlockId)?.text ?? '';
      const anchorText = findAnchorInBlock(
        blockText,
        parsed.practiceNote?.anchorText ?? blockText.slice(0, 80),
      );
      notes.push({
        blockId: anchorBlockId ?? '1',
        anchorText,
        title: 'Pontos altos para colocar em prática',
        body: practiceBody,
        tags: ['auto-prep', 'practice-points'],
      });
      notes = dedupeNotesForDocument(notes, structure);
    }

    if (highlights.length > 0) {
      await saveHighlightsBatch(
        userDataDir,
        params.pub,
        params.issue,
        params.documentId,
        highlights.map((h) => ({
          id: crypto.randomUUID(),
          color: h.color,
          text: h.text,
          blockId: h.blockId,
          startOffset: (h as { startOffset?: number }).startOffset ?? 0,
          endOffset: (h as { endOffset?: number }).endOffset ?? h.text.length,
        })),
      );
    }

    if (notes.length > 0) {
      await replaceTaggedNotes(
        userDataDir,
        params.pub,
        params.issue,
        params.documentId,
        'auto-prep',
        notes.map((note) => ({
          id: crypto.randomUUID(),
          title: note.title,
          body: note.body,
          blockId: note.blockId,
          anchorText: note.anchorText,
          startOffset: 0,
          endOffset: note.anchorText.length,
          tags: note.tags?.length ? note.tags : ['auto-prep'],
        })),
      );
    }

    for (const field of fieldValues) {
      await setFieldValue(
        userDataDir,
        fieldKey(params.pub, params.issue, params.documentId, field.fieldId),
        field.value,
      );
    }

    return {
      ok: true,
      highlights,
      fields: fieldValues,
      notes,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na preparação automática';
    return { ok: false, error: message };
  }
}
