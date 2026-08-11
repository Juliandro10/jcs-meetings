import type { PrepNote } from './user-prep-store';

export const WCG_CONDUCTOR_NOTE_ID = 'wcg-conductor';

export function isWcgConductorNoteId(id: string) {
  return id === WCG_CONDUCTOR_NOTE_ID;
}

export function isWcgQuestionNoteId(id: string) {
  return id.startsWith('wcg-q-');
}

export function isWcgStudyPrepNote(note: Pick<PrepNote, 'id' | 'tags'>): boolean {
  return (
    note.tags.includes('wcg-study') ||
    isWcgConductorNoteId(note.id) ||
    isWcgQuestionNoteId(note.id)
  );
}

export function buildWcgConductorNote(body: string, blockId: string): Omit<PrepNote, 'updatedAt'> {
  return {
    id: WCG_CONDUCTOR_NOTE_ID,
    title: 'Condução do estudo (condutor)',
    body,
    blockId,
    anchorText: 'Condução do estudo',
    startOffset: 0,
    endOffset: 0,
    tags: ['wcg-study', 'wcg-conductor', 'auto-prep'],
  };
}

export function buildWcgQuestionNote(params: {
  noteId: string;
  question: string;
  body: string;
  blockId: string;
  sectionTitle: string;
}): Omit<PrepNote, 'updatedAt'> {
  return {
    id: params.noteId,
    title: params.question,
    body: params.body,
    blockId: params.blockId,
    anchorText: params.question.slice(0, Math.min(120, params.question.length)),
    startOffset: 0,
    endOffset: 0,
    tags: ['wcg-study', 'wcg-question', 'auto-prep', `wcg-section:${params.sectionTitle}`],
  };
}
