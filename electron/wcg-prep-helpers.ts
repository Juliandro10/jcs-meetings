import {
  buildWcgConductorNote,
  buildWcgQuestionNote,
  isWcgQuestionNoteId,
  WCG_CONDUCTOR_NOTE_ID,
} from './wcg-study-notes';
import type { WcgChapterQuestion } from '../shared/wcg-chapter-parse';
import type { WcgChapterStructure } from '../shared/wcg-chapter-parse';
import { resolveHighlightInBlock } from './document-structure';
import type { AutoPrepHighlight } from './types';

const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'] as const;

export function normalizeWcgBlockId(blockId: string) {
  return String(blockId ?? '')
    .trim()
    .replace(/^\[p/i, '')
    .replace(/^p/i, '');
}

export function normalizeWcgQuestionNoteId(noteId: string) {
  const match = String(noteId).match(/wcg-q-(\d+)/i);
  return match ? `wcg-q-${match[1]}` : String(noteId).trim();
}

function narrativeBlockIds(structure: WcgChapterStructure) {
  const ids: string[] = [];
  for (const section of structure.sections) {
    if (section.kind !== 'narrative' && section.kind !== 'bible-account' && section.kind !== 'body') {
      continue;
    }
    for (const block of section.blocks) {
      if (block.text.trim().length > 30) ids.push(block.pid);
    }
  }
  return ids;
}

function splitNarrativeSentences(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35);
}

export function buildWcgHighlights(
  raw: AutoPrepHighlight[],
  structure: WcgChapterStructure,
): AutoPrepHighlight[] {
  const blockById = new Map(structure.blocks.map((block) => [block.pid, block.text]));
  const result: AutoPrepHighlight[] = [];
  const used = new Set<string>();
  let colorIndex = 0;

  const tryResolve = (blockId: string, text: string, color?: string) => {
    const normalizedId = normalizeWcgBlockId(blockId);
    const block = blockById.get(normalizedId);
    if (!block) return null;

    const located = resolveHighlightInBlock(block, text, {
      fullSentence: true,
      maxWords: 35,
      minWords: 3,
    });
    if (!located) return null;

    const key = `${normalizedId}:${located.startOffset}:${located.endOffset}`;
    if (used.has(key)) return null;
    used.add(key);

    return {
      blockId: normalizedId,
      text: located.text,
      startOffset: located.startOffset,
      endOffset: located.endOffset,
      color: HIGHLIGHT_COLORS.includes(color as (typeof HIGHLIGHT_COLORS)[number])
        ? color!
        : HIGHLIGHT_COLORS[colorIndex++ % HIGHLIGHT_COLORS.length]!,
    } satisfies AutoPrepHighlight;
  };

  for (const highlight of raw) {
    if (!highlight.text?.trim()) continue;
    const resolved = tryResolve(highlight.blockId, highlight.text, highlight.color);
    if (resolved) result.push(resolved);
  }

  if (result.length < 6) {
    for (const blockId of narrativeBlockIds(structure)) {
      if (result.length >= 12) break;
      const blockText = blockById.get(blockId);
      if (!blockText) continue;
      for (const sentence of splitNarrativeSentences(blockText)) {
        if (result.length >= 12) break;
        const resolved = tryResolve(blockId, sentence);
        if (resolved) result.push(resolved);
        if (result.filter((item) => item.blockId === blockId).length >= 2) break;
      }
    }
  }

  return result;
}

export function buildWcgQuestionNotes(
  questions: WcgChapterQuestion[],
  answers: Array<{ noteId?: string; body?: string }>,
) {
  const byId = new Map<string, string>();
  for (const answer of answers) {
    if (!answer.noteId || !answer.body?.trim()) continue;
    byId.set(normalizeWcgQuestionNoteId(answer.noteId), answer.body.trim());
  }

  const notes: Array<ReturnType<typeof buildWcgQuestionNote>> = [];
  for (const question of questions) {
    const body = byId.get(question.id);
    if (!body) continue;
    notes.push(
      buildWcgQuestionNote({
        noteId: question.id,
        question: question.text,
        body,
        blockId: question.blockId,
        sectionTitle: question.sectionTitle,
      }),
    );
  }
  return notes;
}

export { WCG_CONDUCTOR_NOTE_ID, buildWcgConductorNote, isWcgQuestionNoteId };
