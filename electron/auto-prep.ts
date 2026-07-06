import { loadBibleReadingText } from './bible-reading-context';
import {
  blockIdForParagraphNumber,
  buildFieldPromptLines,
  extractDocumentStructure,
  extractWatchtowerStudyStructure,
  findAnchorInBlock,
  formatJoiasField,
  getPartBlockRanges,
  isAllCapsSectionBanner,
  resolveCompleteHighlightInBlock,
  resolveHighlightInBlock,
  resolveNumberedTitleHighlightOnly,
  resolveNoteTitle,
  type DocumentField,
  type DocumentStructure,
  type MeetingPart,
  type MeetingPartKind,
  type WatchtowerStudyStructure,
} from './document-structure';
import {
  buildAiSystemPrompt,
  JW_AI_GROUNDING_RULES,
  JW_JOIAS_RULES,
  JW_MWB_FIELD_RULES,
  JW_MWB_BODY_HIGHLIGHT_PASS_RULES,
  JW_MWB_HIGHLIGHT_RULES,
  JW_MWB_JOIAS_RULES,
  JW_MWB_PREP_RULES,
  JW_PERSONAL_LEARNING_NOTE_RULES,
  JW_PRACTICE_POINTS_RULES,
  JW_SENTINEL_DOCUMENT_PREP_RULES,
  JW_SENTINEL_HIGHLIGHT_PASS_RULES,
} from './ai-prompts';
import { enrichAiContext } from './ai-context';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import type { AutoPrepNote, AutoPrepParams, AutoPrepResult } from './types';
import { dedupeNotesForDocument } from './note-dedupe';
import {
  fieldKey,
  replaceTaggedNotes,
  replaceDocumentHighlights,
  saveHighlightsBatch,
  setFieldValue,
} from './user-prep-store';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const AUTO_PREP_MODEL = process.env.OPENAI_AUTO_PREP_MODEL?.trim() || 'gpt-4o';
const MWB_PREP_MODEL =
  process.env.OPENAI_MWB_PREP_MODEL?.trim() ||
  process.env.OPENAI_WATCHTOWER_PREP_MODEL?.trim() ||
  'gpt-4.1';
const WATCHTOWER_PREP_MODEL =
  process.env.OPENAI_WATCHTOWER_PREP_MODEL?.trim() || 'gpt-4.1';
const MWB_DOCUMENT_CHAR_LIMIT = 80_000;
const WATCHTOWER_DOCUMENT_CHAR_LIMIT = 180_000;

const JOIA_VERSE_RE = /\b(?:[A-Za-zÀ-ú]{2,4}\.\s*)?\d{1,3}\s*:\s*\d{1,3}\b/;

const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'] as const;
const MWB_NUMBERED_TITLE_COLOR = 'yellow' as const;
const MWB_BODY_HIGHLIGHT_COLORS = ['green', 'blue', 'pink', 'purple', 'orange'] as const;

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

function mwbHighlightOverlaps(
  a: { blockId: string; startOffset?: number; endOffset?: number },
  b: { blockId: string; startOffset?: number; endOffset?: number },
) {
  if (a.blockId !== b.blockId) return false;
  const aStart = a.startOffset ?? 0;
  const aEnd = a.endOffset ?? 0;
  const bStart = b.startOffset ?? 0;
  const bEnd = b.endOffset ?? 0;
  return !(aEnd <= bStart || bEnd <= aStart);
}

function isNumberedPartTitle(part: MeetingPart) {
  const plain = part.text.replace(/\s+/g, ' ').trim();
  if (isAllCapsSectionBanner(plain)) return false;
  if (/^\d+\.\s/.test(plain)) return true;
  if (/^\d+\.\s/.test(part.title) && !isAllCapsSectionBanner(part.title)) return true;
  return false;
}

/** Títulos numerados das partes — sempre amarelo; seções em MAIÚSCULAS ficam de fora. */
function buildNumberedTitleHighlights(
  parts: MeetingPart[],
  blocks: Array<{ blockId: string; text: string }>,
): NonNullable<AutoPrepResult['highlights']> {
  const blockById = new Map(blocks.map((block) => [block.blockId, block.text]));
  const usedBlockIds = new Set<string>();
  const result: NonNullable<AutoPrepResult['highlights']> = [];

  for (const block of blocks) {
    const plain = block.text.replace(/\s+/g, ' ').trim();
    if (!/^\d+\.\s/.test(plain) || isAllCapsSectionBanner(plain)) continue;
    if (usedBlockIds.has(block.blockId)) continue;

    const located = resolveNumberedTitleHighlightOnly(block.text);
    if (!located) continue;

    usedBlockIds.add(block.blockId);
    result.push({
      blockId: block.blockId,
      text: located.text,
      startOffset: located.startOffset,
      endOffset: located.endOffset,
      color: MWB_NUMBERED_TITLE_COLOR,
    });
  }

  for (const part of parts) {
    if (part.kind === 'local') continue;
    if (!isNumberedPartTitle(part)) continue;
    if (usedBlockIds.has(part.blockId)) continue;

    const blockText = blockById.get(part.blockId);
    if (!blockText) continue;
    const located = resolveNumberedTitleHighlightOnly(blockText);
    if (!located) continue;

    usedBlockIds.add(part.blockId);
    result.push({
      blockId: part.blockId,
      text: located.text,
      startOffset: located.startOffset,
      endOffset: located.endOffset,
      color: MWB_NUMBERED_TITLE_COLOR,
    });
  }

  return result;
}

function mwbMaxBodyHighlights(structure: DocumentStructure) {
  const partCount = structure.parts.filter((part) => part.kind !== 'local').length;
  return Math.min(65, Math.max(35, partCount * 6));
}

function getFieldsInPartRange(
  structure: DocumentStructure,
  rangeIds: string[],
): DocumentField[] {
  const rangeSet = new Set(rangeIds);
  return structure.fields.filter(
    (field) => field.afterBlockId && rangeSet.has(field.afterBlockId),
  );
}

function mwbMinBodyHighlightsForPart(
  part: MeetingPart,
  structure: DocumentStructure,
  rangeIds: string[],
): number {
  const fieldsInPart = getFieldsInPartRange(structure, rangeIds);
  const bodyBlocks = rangeIds.length - 1;

  switch (part.kind) {
    case 'ministry':
      return Math.min(3, Math.max(2, bodyBlocks > 0 ? 2 : 1));
    case 'life':
    case 'treasures':
      return Math.min(8, Math.max(3, fieldsInPart.length + 1));
    case 'reading':
      return bodyBlocks <= 1 ? 1 : 2;
    case 'joias':
      return 2;
    case 'cbs':
      return 2;
    default:
      return bodyBlocks <= 1 ? 1 : 2;
  }
}

function mwbPartStrategyHint(kind: MeetingPartKind) {
  switch (kind) {
    case 'ministry':
      return 'Ministério: grife instrução (Use/Mostre…) + contexto.';
    case 'life':
    case 'treasures':
      return 'Vida Cristã/Tesouros: consideração + "Leia…" + início de cada pergunta.';
    case 'joias':
      return 'Joias: 1–2 trechos no corpo da matéria.';
    case 'reading':
      return 'Leitura: referência ou instrução breve.';
    default:
      return 'Corpo: trechos que sustentam as respostas preparadas.';
  }
}

function isMwbTitleBlock(text: string) {
  const plain = text.replace(/\s+/g, ' ').trim();
  return /^\d+\.\s/.test(plain) && plain.length < 120;
}

function extractFullQuestions(plain: string) {
  const results: string[] = [];
  const segments = plain.split('?');
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index] ?? '';
    const boundary = Math.max(segment.lastIndexOf('.'), segment.lastIndexOf(':'), segment.lastIndexOf('!'));
    const question = `${segment.slice(boundary + 1).trim()}?`;
    if (question.length >= 12 && question.length <= 240) results.push(question);
  }
  return results;
}

function extractMwbHeuristicHighlightTexts(
  blockText: string,
  partKind: MeetingPartKind,
): string[] {
  const plain = blockText.replace(/\s+/g, ' ').trim();
  if (!plain || isAllCapsSectionBanner(plain) || isMwbTitleBlock(blockText)) return [];

  const candidates: string[] = [];

  const leia = plain.match(/\bLeia\s+.+?\.\s*Depois,?\s+pergunte:?/iu)?.[0]?.trim();
  if (leia) candidates.push(leia);

  if (partKind === 'ministry') {
    const instr = plain.match(
      /(?:Use|Mostre|Fale|Convide|Peça|Discuta)\s+[^.?!]{8,220}[.?!]/iu,
    );
    if (instr) candidates.push(instr[0].trim());
  }

  for (const question of extractFullQuestions(plain)) {
    candidates.push(question);
  }

  for (const sentence of splitMwbSentences(blockText)) {
    candidates.push(sentence);
  }

  const seen = new Set<string>();
  return candidates.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key) || item.length < 12) return false;
    seen.add(key);
    return true;
  });
}

function resolveMwbBodyHighlight(
  raw: { blockId: string; text: string; color?: string; startOffset?: number },
  structure: DocumentStructure,
  colorIndex: number,
): NonNullable<AutoPrepResult['highlights']>[number] | null {
  const blockById = new Map(structure.blocks.map((block) => [block.blockId, block.text]));
  const block = blockById.get(raw.blockId);
  if (!block) return null;
  if (isAllCapsSectionBanner(block)) return null;
  if (isMwbTitleBlock(block)) return null;

  const located =
    raw.startOffset !== undefined
      ? resolveCompleteHighlightInBlock(block, raw.text, raw.startOffset)
      : resolveCompleteHighlightInBlock(block, raw.text);
  if (!located) return null;

  const color =
    MWB_BODY_HIGHLIGHT_COLORS.includes(raw.color as (typeof MWB_BODY_HIGHLIGHT_COLORS)[number])
      ? raw.color!
      : MWB_BODY_HIGHLIGHT_COLORS[colorIndex % MWB_BODY_HIGHLIGHT_COLORS.length]!;

  return {
    blockId: raw.blockId,
    text: located.text,
    startOffset: located.startOffset,
    endOffset: located.endOffset,
    color,
  };
}

/** Garante frases/perguntas completas em todos os grifos do corpo (qualquer semana). */
function finalizeMwbBodyHighlights(
  highlights: NonNullable<AutoPrepResult['highlights']>,
  structure: DocumentStructure,
): NonNullable<AutoPrepResult['highlights']> {
  const blockById = new Map(structure.blocks.map((block) => [block.blockId, block.text]));

  return highlights.map((highlight) => {
    if (highlight.color === MWB_NUMBERED_TITLE_COLOR) return highlight;

    const block = blockById.get(highlight.blockId);
    if (!block) return highlight;

    const hintStart = (highlight as { startOffset?: number }).startOffset;
    const resolved = resolveCompleteHighlightInBlock(block, highlight.text, hintStart);
    if (!resolved) return highlight;

    return {
      ...highlight,
      text: resolved.text,
      startOffset: resolved.startOffset,
      endOffset: resolved.endOffset,
    };
  });
}

function pushMwbBodyHighlight(
  result: NonNullable<AutoPrepResult['highlights']>,
  candidate: NonNullable<AutoPrepResult['highlights']>[number],
  perBlock: Map<string, number>,
  maxPerBlock: number,
  mandatory = false,
) {
  if (!mandatory && (perBlock.get(candidate.blockId) ?? 0) >= maxPerBlock) return false;
  if (result.some((existing) => mwbHighlightOverlaps(existing, candidate))) return false;
  result.push(candidate);
  perBlock.set(candidate.blockId, (perBlock.get(candidate.blockId) ?? 0) + 1);
  return true;
}

function blockHasBodyHighlight(
  highlights: NonNullable<AutoPrepResult['highlights']>,
  blockId: string,
  textNeedle?: string,
) {
  const bodyHighlights = highlights.filter(
    (h) => h.blockId === blockId && h.color !== MWB_NUMBERED_TITLE_COLOR,
  );
  if (!textNeedle) return bodyHighlights.length > 0;
  const needle = textNeedle.toLowerCase().slice(0, 32);
  return bodyHighlights.some((h) => {
    const hay = h.text.toLowerCase();
    return hay.includes(needle) || needle.includes(hay.slice(0, 32));
  });
}

function dedupeSubstringHighlights(
  highlights: NonNullable<AutoPrepResult['highlights']>,
): NonNullable<AutoPrepResult['highlights']> {
  const result: NonNullable<AutoPrepResult['highlights']> = [];

  for (const highlight of highlights) {
    if (highlight.color === MWB_NUMBERED_TITLE_COLOR) {
      result.push(highlight);
      continue;
    }

    const dominated = result.some((existing) => {
      if (existing.blockId !== highlight.blockId) return false;
      if (existing.color === MWB_NUMBERED_TITLE_COLOR) return false;
      const a = existing.text.toLowerCase();
      const b = highlight.text.toLowerCase();
      return a.includes(b) && a.length > b.length + 8;
    });
    if (dominated) continue;

    const shorterIdx = result.findIndex((existing) => {
      if (existing.blockId !== highlight.blockId) return false;
      if (existing.color === MWB_NUMBERED_TITLE_COLOR) return false;
      const a = existing.text.toLowerCase();
      const b = highlight.text.toLowerCase();
      return b.includes(a) && b.length > a.length + 8;
    });
    if (shorterIdx >= 0) result.splice(shorterIdx, 1);

    result.push(highlight);
  }

  return result;
}

/** Garante grifo em cada pergunta de campo e em parágrafos ainda vazios — qualquer semana. */
function ensureMwbMandatoryHighlights(
  highlights: NonNullable<AutoPrepResult['highlights']>,
  structure: DocumentStructure,
): NonNullable<AutoPrepResult['highlights']> {
  const blockById = new Map(structure.blocks.map((block) => [block.blockId, block.text]));
  const partRanges = getPartBlockRanges(structure.parts, structure.blocks);
  const result = [...highlights];
  const perBlock = new Map<string, number>();
  for (const h of result) {
    if (h.color === MWB_NUMBERED_TITLE_COLOR) continue;
    perBlock.set(h.blockId, (perBlock.get(h.blockId) ?? 0) + 1);
  }
  let colorIndex = result.filter((h) => h.color !== MWB_NUMBERED_TITLE_COLOR).length;

  const addMandatory = (blockId: string, text: string) => {
    const block = blockById.get(blockId);
    if (!block || blockHasBodyHighlight(result, blockId, text)) return false;

    const resolved = resolveCompleteHighlightInBlock(block, text);
    if (!resolved) return false;

    const candidate = {
      blockId,
      text: resolved.text,
      startOffset: resolved.startOffset,
      endOffset: resolved.endOffset,
      color: MWB_BODY_HIGHLIGHT_COLORS[colorIndex % MWB_BODY_HIGHLIGHT_COLORS.length]!,
    };
    if (!pushMwbBodyHighlight(result, candidate, perBlock, 99, true)) return false;
    colorIndex += 1;
    return true;
  };

  for (const field of structure.fields) {
    const blockId = field.afterBlockId;
    if (!blockId) continue;
    const plain = (blockById.get(blockId) ?? '').replace(/\s+/g, ' ').trim();
    if (!plain || isMwbTitleBlock(plain)) continue;

    const leia = plain.match(/\bLeia\s+.+?\.\s*Depois,?\s+pergunte:?/iu)?.[0]?.trim();
    if (leia) addMandatory(blockId, leia);

    const questions = extractFullQuestions(plain);
    const question =
      questions[questions.length - 1] ??
      (plain.includes('?') ? plain.match(/[^.!?]+\?/u)?.[0]?.trim() : undefined);
    if (question) addMandatory(blockId, question);
  }

  for (const part of structure.parts) {
    if (part.kind === 'local') continue;
    const rangeIds = partRanges.get(part.blockId) ?? [part.blockId];

    for (const blockId of rangeIds) {
      if (blockId === part.blockId) continue;
      if (blockHasBodyHighlight(result, blockId)) continue;

      const blockText = blockById.get(blockId) ?? '';
      if (!blockText || isAllCapsSectionBanner(blockText) || isMwbTitleBlock(blockText)) continue;

      const plain = blockText.replace(/\s+/g, ' ').trim();
      const questions = extractFullQuestions(plain);
      if (questions.length > 0) {
        addMandatory(blockId, questions[questions.length - 1]!);
        continue;
      }

      const sentence = splitMwbSentences(blockText)[0];
      if (sentence) addMandatory(blockId, sentence);
    }
  }

  return dedupeSubstringHighlights(result);
}

function buildMwbBodyHighlightsFromRaw(
  raw: Array<{ blockId?: string; text?: string; color?: string }>,
  structure: DocumentStructure,
): NonNullable<AutoPrepResult['highlights']> {
  const result: NonNullable<AutoPrepResult['highlights']> = [];
  const perBlock = new Map<string, number>();
  let colorIndex = 0;
  const MAX_TOTAL = mwbMaxBodyHighlights(structure);
  const MAX_PER_BLOCK = 3;

  for (const item of raw) {
    if (!item.blockId || !item.text?.trim()) continue;
    if (result.length >= MAX_TOTAL) break;
    if ((perBlock.get(item.blockId) ?? 0) >= MAX_PER_BLOCK) continue;

    const resolved = resolveMwbBodyHighlight(
      { blockId: item.blockId, text: item.text, color: item.color },
      structure,
      colorIndex,
    );
    if (!resolved) continue;

    if (pushMwbBodyHighlight(result, resolved, perBlock, MAX_PER_BLOCK)) {
      colorIndex += 1;
    }
  }

  return result;
}

function splitMwbSentences(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence.length >= 40 &&
        !/^\d+\.\s/.test(sentence) &&
        !/^\(\d+\s*min\)/i.test(sentence) &&
        !isAllCapsSectionBanner(sentence),
    );
}

function fillMissingMwbBodyHighlights(
  highlights: NonNullable<AutoPrepResult['highlights']>,
  structure: DocumentStructure,
): NonNullable<AutoPrepResult['highlights']> {
  const blockById = new Map(structure.blocks.map((block) => [block.blockId, block.text]));
  const partRanges = getPartBlockRanges(structure.parts, structure.blocks);
  const result = [...highlights];
  const perBlock = new Map<string, number>();
  for (const h of result) {
    if (h.color === MWB_NUMBERED_TITLE_COLOR) continue;
    perBlock.set(h.blockId, (perBlock.get(h.blockId) ?? 0) + 1);
  }
  let colorIndex = result.filter((h) => h.color !== MWB_NUMBERED_TITLE_COLOR).length;
  const MAX_PER_BLOCK = 3;
  const MAX_TOTAL = mwbMaxBodyHighlights(structure);

  const bodyHighlightsInRange = (blockIds: string[]) =>
    result.filter(
      (h) => blockIds.includes(h.blockId) && h.color !== MWB_NUMBERED_TITLE_COLOR,
    ).length;

  const tryAddCandidate = (blockId: string, text: string) => {
    if (result.filter((h) => h.color !== MWB_NUMBERED_TITLE_COLOR).length >= MAX_TOTAL) {
      return false;
    }
    const resolved = resolveMwbBodyHighlight(
      {
        blockId,
        text,
        color: MWB_BODY_HIGHLIGHT_COLORS[colorIndex % MWB_BODY_HIGHLIGHT_COLORS.length],
      },
      structure,
      colorIndex,
    );
    if (!resolved) return false;
    if (!pushMwbBodyHighlight(result, resolved, perBlock, MAX_PER_BLOCK)) return false;
    colorIndex += 1;
    return true;
  };

  for (const part of structure.parts) {
    if (part.kind === 'local') continue;
    const rangeIds = partRanges.get(part.blockId) ?? [part.blockId];
    const minForPart = mwbMinBodyHighlightsForPart(part, structure, rangeIds);

    const bodyBlocks = rangeIds.filter((id) => {
      if (id === part.blockId) return false;
      const text = blockById.get(id) ?? '';
      if (isAllCapsSectionBanner(text)) return false;
      if (isMwbTitleBlock(text)) return false;
      return text.replace(/\s+/g, ' ').trim().length >= 12;
    });

    while (bodyHighlightsInRange(rangeIds) < minForPart) {
      let added = false;

      for (const blockId of bodyBlocks) {
        const blockText = blockById.get(blockId);
        if (!blockText) continue;
        for (const candidate of extractMwbHeuristicHighlightTexts(blockText, part.kind)) {
          if (tryAddCandidate(blockId, candidate)) {
            added = true;
            if (bodyHighlightsInRange(rangeIds) >= minForPart) break;
          }
        }
        if (bodyHighlightsInRange(rangeIds) >= minForPart) break;
      }

      if (!added) {
        for (const blockId of bodyBlocks) {
          const blockText = blockById.get(blockId);
          if (!blockText) continue;
          for (const sentence of splitMwbSentences(blockText)) {
            if (tryAddCandidate(blockId, sentence)) {
              added = true;
              if (bodyHighlightsInRange(rangeIds) >= minForPart) break;
            }
          }
          if (bodyHighlightsInRange(rangeIds) >= minForPart) break;
        }
      }

      if (!added) break;
    }
  }

  return result;
}

function mergeMwbHighlights(
  titles: NonNullable<AutoPrepResult['highlights']>,
  body: NonNullable<AutoPrepResult['highlights']>,
) {
  const merged = [...titles];
  for (const candidate of body) {
    if (merged.some((existing) => mwbHighlightOverlaps(existing, candidate))) continue;
    merged.push(candidate);
  }
  return merged;
}

function buildMwbHighlightGuide(
  structure: DocumentStructure,
  fieldValues: Array<{ fieldId: string; value: string }>,
) {
  const partRanges = getPartBlockRanges(structure.parts, structure.blocks);
  const fieldById = new Map(fieldValues.map((field) => [field.fieldId, field.value]));
  const fieldQuestionById = new Map(
    structure.fields.map((field) => [field.fieldId, field.questionText ?? '']),
  );

  return structure.parts
    .filter((part) => part.kind !== 'local')
    .map((part) => {
      const rangeIds = partRanges.get(part.blockId) ?? [part.blockId];
      const blockIds = rangeIds.join(', ');
      const minTarget = mwbMinBodyHighlightsForPart(part, structure, rangeIds);
      const fieldsInPart = getFieldsInPartRange(structure, rangeIds);

      const fieldLines = fieldsInPart.map((field) => {
        const question = (fieldQuestionById.get(field.fieldId) ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160);
        const answer = (fieldById.get(field.fieldId) ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
        return [
          `     • [p${field.afterBlockId}] ${question || field.fieldId}`,
          answer ? `       Resposta: ${answer}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      });

      const mainAnswer = part.fieldId
        ? (fieldById.get(part.fieldId) ?? '').replace(/\s+/g, ' ').trim().slice(0, 220)
        : '';

      return [
        `### ${part.title.replace(/\s+/g, ' ').trim()} (${part.kind})`,
        `   §: ${blockIds}`,
        `   Alvo: ${minTarget} grifos no corpo | ${mwbPartStrategyHint(part.kind)}`,
        mainAnswer && !fieldsInPart.some((f) => f.fieldId === part.fieldId)
          ? `   Resposta principal: ${mainAnswer}`
          : '',
        fieldLines.length > 0 ? '   Perguntas/campos:\n' + fieldLines.join('\n') : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

async function requestMwbBodyHighlights(
  apiKey: string,
  structure: DocumentStructure,
  documentExcerpt: string,
  fieldValues: Array<{ fieldId: string; value: string }>,
): Promise<NonNullable<AutoPrepResult['highlights']>> {
  const guide = buildMwbHighlightGuide(structure, fieldValues);

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MWB_PREP_MODEL,
      temperature: 0.15,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [JW_AI_GROUNDING_RULES, JW_MWB_BODY_HIGHLIGHT_PASS_RULES].join('\n\n'),
        },
        {
          role: 'user',
          content: [
            documentExcerpt.slice(0, MWB_DOCUMENT_CHAR_LIMIT),
            '',
            '## Partes, respostas e alvos — grife o corpo de cada uma',
            guide,
            '',
            'Gere grifos no corpo (cores variadas dentro de cada parte) — apostila com aparência de preparada.',
            'Priorize trechos que sustentam as respostas listadas acima.',
          ].join('\n'),
        },
      ],
    }),
  });

  if (!response.ok) return [];
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as {
    highlights?: Array<{ blockId?: string; text?: string; color?: string }>;
  };
  return buildMwbBodyHighlightsFromRaw(parsed.highlights ?? [], structure);
}

function trimAtSentence(text: string, maxChars: number) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
  if (lastStop >= maxChars * 0.55) return slice.slice(0, lastStop + 1).trim();
  return `${slice.trim()}…`;
}

function normalizeMwbFieldValue(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length > 130) {
    return trimAtSentence(value, 900);
  }
  return value.trim();
}

function normalizeMwbNoteBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length <= 1200) return trimmed;
  return trimAtSentence(trimmed, 1150);
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
  model = MWB_PREP_MODEL,
): Promise<string[]> {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Você prepara Joias espirituais para a reunião Vida e Ministério.',
            JW_AI_GROUNDING_RULES,
            JW_JOIAS_RULES,
            JW_MWB_JOIAS_RULES,
            `Leitura da semana: ${bibleReadingLabel ?? '—'}.`,
            bibleText ? `Texto bíblico:\n${bibleText.slice(0, 8000)}` : '',
            'Devolva APENAS JSON: {"joiasOptions":["...","...","..."]}',
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          role: 'user',
          content: `Matéria:\n${documentExcerpt.slice(0, MWB_DOCUMENT_CHAR_LIMIT)}\n\nGere 3 joias espirituais elaboradas e equilibradas.`,
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

  const tryBlock = (blockId: string) => {
    const block = blockById.get(blockId);
    if (!block) return null;
    const located = resolveHighlightInBlock(block, highlight.text, { fullSentence: true, maxWords: 45 });
    if (!located) return null;
    const wordCount = located.text.trim().split(/\s+/).length;
    if (wordCount < 3) return null;
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

function detectSentinelSubLabels(questionText: string): string[] {
  const labels: string[] = [];
  for (const match of questionText.matchAll(/\(\s*([a-e])\s*\)/gi)) {
    const label = match[1]!.toUpperCase();
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

function sentinelFieldFormatHint(questionText: string): string {
  const subLabels = detectSentinelSubLabels(questionText);
  if (subLabels.length >= 2) {
    return `${subLabels.map((label) => `Resposta ${label}:`).join(' ')} + Resposta adicional:`;
  }
  return 'Resposta principal: + Resposta adicional:';
}

function buildWatchtowerFullDocument(wtStructure: WatchtowerStudyStructure) {
  return wtStructure.blocks.map((block) => `[§${block.blockId}]\n${block.text}`).join('\n\n');
}

function buildWatchtowerFieldGuide(wtStructure: WatchtowerStudyStructure) {
  return wtStructure.questions
    .map((question, index) => {
      const refs =
        question.answerBlockIds.length > 0
          ? `§ ${question.answerBlockIds.join(', ')}`
          : '(parágrafos citados no enunciado)';
      return [
        `${index + 1}. fieldId="${question.fieldId}"`,
        `   Tipo: ${question.isReview ? 'REVISÃO' : 'estudo'}`,
        `   Pergunta: ${question.questionText.replace(/\s+/g, ' ').trim()}`,
        `   Resposta em: ${refs}`,
        `   Formato: ${sentinelFieldFormatHint(question.questionText)}`,
      ].join('\n');
    })
    .join('\n\n');
}

type WatchtowerDocumentPrepField = {
  fieldId: string;
  value: string;
  quotes: Array<{ blockId: string; text: string }>;
};

function parseWatchtowerDocumentPrepResponse(
  raw: unknown,
  wtStructure: WatchtowerStudyStructure,
): WatchtowerDocumentPrepField[] {
  const parsed = raw as {
    fields?: Array<{
      fieldId?: string;
      value?: string;
      quotes?: Array<{ blockId?: string; text?: string }>;
    }>;
  };

  const known = new Map(wtStructure.questions.map((question) => [question.fieldId, question]));
  const result: WatchtowerDocumentPrepField[] = [];

  for (const field of parsed.fields ?? []) {
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

    const quotes = (field.quotes ?? [])
      .filter((quote) => quote.blockId && quote.text?.trim())
      .map((quote) => ({
        blockId: quote.blockId!.replace(/^p/i, ''),
        text: quote.text!.replace(/\s+/g, ' ').trim(),
      }));

    result.push({
      fieldId,
      value: normalizeSentinelFieldValue(field.value.trim(), question.isReview, question.questionText),
      quotes,
    });
  }

  return result;
}

async function requestWatchtowerDocumentPrep(
  apiKey: string,
  systemPrefix: string,
  documentFull: string,
  fieldGuide: string,
  wtStructure: WatchtowerStudyStructure,
  onlyFieldIds?: string[],
): Promise<WatchtowerDocumentPrepField[]> {
  const fieldSection =
    onlyFieldIds && onlyFieldIds.length > 0
      ? fieldGuide
          .split('\n\n')
          .filter((block) => onlyFieldIds.some((id) => block.includes(`fieldId="${id}"`)))
          .join('\n\n')
      : fieldGuide;

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: WATCHTOWER_PREP_MODEL,
      temperature: 0.2,
      max_tokens: 16_000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [systemPrefix, JW_SENTINEL_DOCUMENT_PREP_RULES].join('\n\n'),
        },
        {
          role: 'user',
          content: [
            '## Matéria completa (estudo de A Sentinela)',
            documentFull.slice(0, WATCHTOWER_DOCUMENT_CHAR_LIMIT),
            '',
            '## Índice de campos a preparar',
            fieldSection,
            '',
            onlyFieldIds?.length
              ? `Prepare SOMENTE estes fieldIds: ${onlyFieldIds.join(', ')}`
              : 'Prepare TODOS os campos do índice — matéria inteira, como estudo já comentado.',
          ].join('\n'),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI retornou ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Resposta vazia da IA na preparação da Sentinela.');

  return parseWatchtowerDocumentPrepResponse(JSON.parse(raw), wtStructure);
}

function mergeWatchtowerPrepFields(
  existing: WatchtowerDocumentPrepField[],
  extra: WatchtowerDocumentPrepField[],
): WatchtowerDocumentPrepField[] {
  const merged = new Map(existing.map((field) => [field.fieldId, field]));
  for (const field of extra) merged.set(field.fieldId, field);
  return [...merged.values()];
}

function buildWatchtowerHighlightGuide(
  wtStructure: WatchtowerStudyStructure,
  prepFields: WatchtowerDocumentPrepField[],
) {
  const byFieldId = new Map(prepFields.map((field) => [field.fieldId, field]));
  return wtStructure.questions
    .map((question, index) => {
      const prep = byFieldId.get(question.fieldId);
      const refs =
        question.answerBlockIds.length > 0
          ? question.answerBlockIds.join(', ')
          : '(§ no enunciado)';
      const answerPreview = prep?.value.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '';
      return [
        `${index + 1}. fieldId="${question.fieldId}" | § resposta: ${refs}`,
        `   Pergunta: ${question.questionText.replace(/\s+/g, ' ').trim()}`,
        answerPreview ? `   Respostas: ${answerPreview}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

async function requestWatchtowerComprehensiveHighlights(
  apiKey: string,
  systemPrefix: string,
  documentFull: string,
  wtStructure: WatchtowerStudyStructure,
  prepFields: WatchtowerDocumentPrepField[],
): Promise<Array<{ fieldId: string; blockId: string; text: string }>> {
  const highlightGuide = buildWatchtowerHighlightGuide(wtStructure, prepFields);

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: WATCHTOWER_PREP_MODEL,
      temperature: 0.15,
      max_tokens: 16_000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [systemPrefix, JW_SENTINEL_HIGHLIGHT_PASS_RULES].join('\n\n'),
        },
        {
          role: 'user',
          content: [
            '## Matéria completa (estudo de A Sentinela)',
            documentFull.slice(0, WATCHTOWER_DOCUMENT_CHAR_LIMIT),
            '',
            '## Perguntas já preparadas — grife o que sustenta cada resposta',
            highlightGuide,
            '',
            'Gere grifos para TODOS os § de resposta — matéria com aparência de revista preparada.',
          ].join('\n'),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI (grifos) retornou ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as {
    highlights?: Array<{ fieldId?: string; blockId?: string; text?: string }>;
  };

  const knownFields = new Map(wtStructure.questions.map((question) => [question.fieldId, question.fieldId]));
  for (const question of wtStructure.questions) {
    knownFields.set(question.fieldId.toLowerCase(), question.fieldId);
  }

  return (parsed.highlights ?? [])
    .filter((item) => item.fieldId && item.blockId && item.text?.trim())
    .map((item) => {
      let fieldId = item.fieldId!.trim();
      if (!wtStructure.questions.some((q) => q.fieldId === fieldId)) {
        const fuzzy = wtStructure.questions.find(
          (question) =>
            question.fieldId.toLowerCase() === fieldId.toLowerCase() ||
            question.fieldId.endsWith(fieldId) ||
            fieldId.endsWith(question.fieldId),
        );
        if (fuzzy) fieldId = fuzzy.fieldId;
      }
      return {
        fieldId,
        blockId: item.blockId!.replace(/^p/i, ''),
        text: item.text!.replace(/\s+/g, ' ').trim(),
      };
    })
    .filter((item) => wtStructure.questions.some((q) => q.fieldId === item.fieldId));
}

function fieldColorMap(wtStructure: WatchtowerStudyStructure) {
  const map = new Map<string, string>();
  wtStructure.questions.forEach((question, index) => {
    map.set(question.fieldId, HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length]!);
  });
  return map;
}

function mergeWatchtowerHighlights(
  primary: WatchtowerResolvedHighlight[],
  extra: WatchtowerResolvedHighlight[],
): WatchtowerResolvedHighlight[] {
  const merged = [...primary];
  for (const candidate of extra) {
    if (merged.some((item) => highlightOverlaps(item, candidate))) continue;
    merged.push(candidate);
  }
  return merged;
}

function buildHighlightsFromPass(
  raw: Array<{ fieldId: string; blockId: string; text: string }>,
  wtStructure: WatchtowerStudyStructure,
): WatchtowerResolvedHighlight[] {
  const colors = fieldColorMap(wtStructure);
  const result: WatchtowerResolvedHighlight[] = [];
  const perBlock = new Map<string, number>();
  const perQuestion = new Map<string, number>();
  const MAX_PER_BLOCK = 10;
  const MAX_PER_QUESTION = 14;

  for (const item of raw) {
    const color = colors.get(item.fieldId) ?? 'yellow';
    const question = wtStructure.questions.find((q) => q.fieldId === item.fieldId);
    const preferred = question?.answerBlockIds;

    if ((perBlock.get(item.blockId) ?? 0) >= MAX_PER_BLOCK) continue;
    if ((perQuestion.get(item.fieldId) ?? 0) >= MAX_PER_QUESTION) continue;

    const resolved = resolveWatchtowerHighlight(
      { blockId: item.blockId, text: item.text, color },
      wtStructure,
      preferred,
    );
    if (!resolved) continue;
    if (result.some((existing) => highlightOverlaps(existing, resolved))) continue;

    result.push({ ...resolved, color });
    perBlock.set(item.blockId, (perBlock.get(item.blockId) ?? 0) + 1);
    perQuestion.set(item.fieldId, (perQuestion.get(item.fieldId) ?? 0) + 1);
  }

  return result;
}

function splitAnswerSentences(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence.length >= 32 &&
        !/^\d+\.\s/.test(sentence) &&
        !/^\(\d+\s*min\)/i.test(sentence) &&
        !/^\([^)]+\)\s*$/.test(sentence),
    );
}

function fillMissingAnswerParagraphHighlights(
  highlights: WatchtowerResolvedHighlight[],
  wtStructure: WatchtowerStudyStructure,
): WatchtowerResolvedHighlight[] {
  const blockById = new Map(wtStructure.blocks.map((block) => [block.blockId, block.text]));
  const colors = fieldColorMap(wtStructure);
  const result = [...highlights];
  const MIN_PER_BLOCK = 3;

  const countFor = (blockId: string, color: string) =>
    result.filter((item) => item.blockId === blockId && item.color === color).length;

  for (const question of wtStructure.questions) {
    const color = colors.get(question.fieldId) ?? 'yellow';
    for (const blockId of question.answerBlockIds) {
      while (countFor(blockId, color) < MIN_PER_BLOCK) {
        const blockText = blockById.get(blockId);
        if (!blockText) break;

        let added = false;
        for (const sentence of splitAnswerSentences(blockText)) {
          const resolved = resolveWatchtowerHighlight(
            { blockId, text: sentence, color },
            wtStructure,
            question.answerBlockIds,
          );
          if (!resolved) continue;
          if (result.some((item) => highlightOverlaps(item, resolved))) continue;

          result.push(resolved);
          added = true;
          if (countFor(blockId, color) >= MIN_PER_BLOCK) break;
        }
        if (!added) break;
      }
    }
  }

  return result;
}

function buildHighlightsFromDocumentPrep(
  prepFields: WatchtowerDocumentPrepField[],
  wtStructure: WatchtowerStudyStructure,
): WatchtowerResolvedHighlight[] {
  const byFieldId = new Map(prepFields.map((field) => [field.fieldId, field]));
  const colors = fieldColorMap(wtStructure);
  const result: WatchtowerResolvedHighlight[] = [];

  for (const question of wtStructure.questions) {
    const prep = byFieldId.get(question.fieldId);
    if (!prep) continue;

    const questionColor = colors.get(question.fieldId) ?? 'yellow';
    const preferredBlocks =
      question.answerBlockIds.length > 0 ? question.answerBlockIds : undefined;

    for (const quote of prep.quotes) {
      const resolved = resolveWatchtowerHighlight(
        { blockId: quote.blockId, text: quote.text, color: questionColor },
        wtStructure,
        preferredBlocks,
      );
      if (!resolved) continue;
      if (result.some((item) => highlightOverlaps(item, resolved))) continue;

      result.push({ ...resolved, color: questionColor });
    }
  }

  return result;
}

function normalizeSentinelFieldValue(value: string, isReview: boolean, questionText?: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const subLabels = questionText ? detectSentinelSubLabels(questionText) : [];

  if (subLabels.length >= 2) {
    const hasAllSubs = subLabels.every((label) =>
      new RegExp(`resposta\\s+${label}\\s*:`, 'i').test(trimmed),
    );
    const hasExtra = /resposta adicional\s*:/i.test(trimmed);
    if (hasAllSubs && hasExtra) return trimmed;
    if (hasAllSubs) {
      return `${trimmed}\n\nResposta adicional: Aplicação pessoal com base no parágrafo citado.`;
    }
  }

  const hasMain = /resposta principal/i.test(trimmed);
  const hasExtra = /resposta adicional/i.test(trimmed);
  if (hasMain && hasExtra) return trimmed;

  const lines = trimmed.split(/\n+/).filter(Boolean);
  if (lines.length >= 2 && hasMain) return trimmed;

  const main = lines[0] ?? trimmed;
  const extra = lines.slice(1).join(' ').trim();
  const prefix = isReview && !/^parágrafo/i.test(main) ? `Parágrafo(s): —\n` : '';

  if (subLabels.length >= 2) {
    return `${prefix}${trimmed}\n\nResposta adicional: ${extra || 'Aplicação pessoal com base no parágrafo citado.'}`;
  }

  return `${prefix}Resposta principal: ${main.replace(/^resposta principal:\s*/i, '')}\n\nResposta adicional: ${extra || 'Aplicação pessoal com base no parágrafo citado.'}`;
}

async function requestMissingFields(
  apiKey: string,
  structure: DocumentStructure,
  documentExcerpt: string,
  existing: Array<{ fieldId: string; value: string }>,
  excludeFieldIds: string[] = [],
  model = AUTO_PREP_MODEL,
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
      model,
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Complete campos editáveis da apostila. APENAS JSON.',
            '{"fields":[{"fieldId":"tt20","value":"resposta equilibrada em 3-5 frases"}]}',
            JW_AI_GROUNDING_RULES,
            model === MWB_PREP_MODEL ? JW_MWB_FIELD_RULES : 'Responda com suas palavras, vocabulário JW, sem copiar parágrafo inteiro.',
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
  model = AUTO_PREP_MODEL,
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
      model,
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
            model === MWB_PREP_MODEL ? JW_MWB_PREP_RULES : '',
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

  const documentFull = buildWatchtowerFullDocument(wtStructure);
  const fieldGuide = buildWatchtowerFieldGuide(wtStructure);

  const context = await enrichAiContext(cacheDir, {
    weekLabel: params.weekLabel,
    publicationTitle: params.publicationTitle,
    bibleReading: params.bibleReading,
    sourcePub: params.pub,
    sourceIssue: params.issue,
    sourceDocumentId: params.documentId,
    documentText: documentFull.slice(0, WATCHTOWER_DOCUMENT_CHAR_LIMIT),
  });

  const systemPrefix = [
    buildAiSystemPrompt(context),
    '',
    '## Preparação — estudo de A Sentinela (matéria inteira)',
    JW_AI_GROUNDING_RULES,
    `Modelo: leia a matéria como um PDF completo antes de preparar cada pergunta.`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    let prepFields = await requestWatchtowerDocumentPrep(
      apiKey,
      systemPrefix,
      documentFull,
      fieldGuide,
      wtStructure,
    );

    const missingIds = wtStructure.questions
      .map((question) => question.fieldId)
      .filter((fieldId) => !prepFields.some((field) => field.fieldId === fieldId));

    if (missingIds.length > 0) {
      const extra = await requestWatchtowerDocumentPrep(
        apiKey,
        systemPrefix,
        documentFull,
        fieldGuide,
        wtStructure,
        missingIds,
      );
      prepFields = mergeWatchtowerPrepFields(prepFields, extra);
    }

    const fieldValues = prepFields.map((field) => ({
      fieldId: field.fieldId,
      value: field.value,
    }));

    const rawHighlights = await requestWatchtowerComprehensiveHighlights(
      apiKey,
      systemPrefix,
      documentFull,
      wtStructure,
      prepFields,
    );

    let highlights = buildHighlightsFromPass(rawHighlights, wtStructure);
    highlights = mergeWatchtowerHighlights(
      highlights,
      buildHighlightsFromDocumentPrep(prepFields, wtStructure),
    );
    highlights = fillMissingAnswerParagraphHighlights(highlights, wtStructure);

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

    if (fieldValues.length === 0) {
      return {
        ok: false,
        error: `Nenhum campo preenchido (${wtStructure.questions.length} perguntas detectadas). Verifique OPENAI_API_KEY e o modelo ${WATCHTOWER_PREP_MODEL}.`,
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
  const documentFull = structure.blocks.map((b) => `[p${b.blockId}] ${b.text}`).join('\n\n');
  const documentExcerpt = documentFull.slice(0, MWB_DOCUMENT_CHAR_LIMIT);

  const context = await enrichAiContext(cacheDir, {
    weekLabel: params.weekLabel,
    publicationTitle: params.publicationTitle,
    bibleReading: params.bibleReading,
    sourcePub: params.pub,
    sourceIssue: params.issue,
    sourceDocumentId: params.documentId,
    documentText: documentExcerpt,
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
    '## Tarefa: preparação automática — Apostila Vida e Ministério',
    JW_AI_GROUNDING_RULES,
    JW_MWB_PREP_RULES,
    '',
    params.bibleReading ? `Leitura bíblica desta semana: ${params.bibleReading}.` : '',
    bibleText ? `\n### Texto da leitura bíblica\n${bibleText.slice(0, 8000)}` : '',
    '',
    'Devolva APENAS JSON válido (sem markdown):',
    '{"fields":[{"fieldId":"tt20","value":"resposta equilibrada"}],"notes":[{"blockId":"20","anchorText":"trecho EXATO","title":"4. Iniciando conversas","body":"o que aprendo..."}],"joiasOptions":["Jer. 11:4 — Sobre Jeová: ..."],"practiceNote":{"blockId":"40","anchorText":"trecho EXATO","body":"Pontos para prática..."}}',
    '',
    JW_MWB_HIGHLIGHT_RULES,
    '',
    JW_MWB_FIELD_RULES,
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
    '- "body" = resumo do que posso tirar de proveito pessoal (não roteiro de tribuna).',
    '- Parte EBC: resumo do estudo + proveito pessoal (NÃO inclua respostas às 3 perguntas — use o livro lfb).',
    '- Partes com campos editáveis: nota = aprendizado pessoal (sem repetir o que já está nos fields).',
    '- Partes sem campo editável: respostas completas na nota.',
    '- "practiceNote": nota final "Pontos altos para colocar em prática" (3-5 bullets); anchor no último bloco da reunião ou EBC.',
    '',
    JW_JOIAS_RULES,
    JW_MWB_JOIAS_RULES,
    joiasFieldId ? `- NÃO use "fields" para ${joiasFieldId} (joias) — só "joiasOptions".` : '',
    treasuresFieldId ? `- Campo ${treasuresFieldId}: resposta à pergunta bíblica de Tesouros/Joias (versículo + aplicação).` : '',
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
        model: MWB_PREP_MODEL,
        temperature: 0.25,
        max_tokens: 12_000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              documentExcerpt,
              '',
              'Prepare esta semana: campos (exceto joias), nota de proveito pessoal para CADA parte, 3 joias elaboradas, e practiceNote.',
              'Controle o tamanho — respostas e notas equilibradas, nem curtas demais nem longas demais.',
            ].join('\n'),
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

    let highlights = buildNumberedTitleHighlights(structure.parts, structure.blocks);
    let fieldValues = (parsed.fields ?? [])
      .filter((f) => f.fieldId && f.value)
      .map((field) => ({
        fieldId: field.fieldId,
        value: normalizeMwbFieldValue(field.value),
      }));

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
        MWB_PREP_MODEL,
      );
    }

    let notes = normalizeNotesAgainstStructure(parsed.notes ?? [], structure);
    notes = notes.map((note) => ({
      ...note,
      body: normalizeMwbNoteBody(note.body),
    }));
    notes = notes.filter((note) => note.body?.trim());
    notes = dedupeNotesForDocument(notes, structure);

    if (notes.length < structure.parts.length) {
      notes = await requestMissingNotes(apiKey, structure, documentExcerpt, notes, MWB_PREP_MODEL);
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

    const bodyHighlights = await requestMwbBodyHighlights(
      apiKey,
      structure,
      documentExcerpt,
      fieldValues,
    );
    highlights = mergeMwbHighlights(highlights, bodyHighlights);
    highlights = fillMissingMwbBodyHighlights(highlights, structure);
    highlights = ensureMwbMandatoryHighlights(highlights, structure);
    highlights = finalizeMwbBodyHighlights(highlights, structure);
    highlights = dedupeSubstringHighlights(highlights);

    await replaceDocumentHighlights(
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
