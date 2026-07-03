import {
  extractLfbBlocks,
  LFB_STUDY_FIELD_IDS,
  LFB_STUDY_QUESTIONS,
} from './lfb-reader';
import type { PrepNote } from './user-prep-store';

export { LFB_STUDY_FIELD_IDS, LFB_STUDY_QUESTIONS };

export function isLfbStudyNoteId(id: string): boolean {
  return (LFB_STUDY_FIELD_IDS as readonly string[]).includes(id);
}

export function lfbStudyQuestionForNoteId(noteId: string): string | null {
  const index = LFB_STUDY_FIELD_IDS.indexOf(noteId as (typeof LFB_STUDY_FIELD_IDS)[number]);
  return index >= 0 ? LFB_STUDY_QUESTIONS[index] : null;
}

export function lfbStudyNoteIdForQuestion(title: string): string | null {
  const normalized = title.trim().toLowerCase();
  for (let index = 0; index < LFB_STUDY_QUESTIONS.length; index += 1) {
    if (LFB_STUDY_QUESTIONS[index].toLowerCase() === normalized) {
      return LFB_STUDY_FIELD_IDS[index];
    }
  }
  return null;
}

export function defaultLfbStudyBlockId(html: string): string {
  return extractLfbBlocks(html)[0]?.blockId ?? '1';
}

export function buildLfbStudyNote(
  noteId: string,
  body: string,
  html: string,
): Omit<PrepNote, 'updatedAt'> {
  return {
    id: noteId,
    title: lfbStudyQuestionForNoteId(noteId) ?? noteId,
    body,
    blockId: defaultLfbStudyBlockId(html),
    anchorText: '',
    startOffset: 0,
    endOffset: 0,
    tags: ['lfb-study'],
  };
}

export function isLfbStudyPrepNote(note: Pick<PrepNote, 'id' | 'tags'>): boolean {
  return note.tags.includes('lfb-study') || isLfbStudyNoteId(note.id);
}
