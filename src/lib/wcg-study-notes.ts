import type { DocumentNote } from '@/lib/note-dom';

export const WCG_CONDUCTOR_NOTE_ID = 'wcg-conductor';

export function isWcgConductorNoteId(id: string) {
  return id === WCG_CONDUCTOR_NOTE_ID;
}

export function isWcgQuestionNoteId(id: string) {
  return id.startsWith('wcg-q-');
}

export function isWcgStudyPrepNote(note: Pick<DocumentNote, 'id' | 'tags'>) {
  return (
    note.tags.includes('wcg-study') ||
    isWcgConductorNoteId(note.id) ||
    isWcgQuestionNoteId(note.id)
  );
}

export function wcgQuestionSortKey(noteId: string) {
  const match = noteId.match(/^wcg-q-(\d+)$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function sortWcgStudyNotes(notes: DocumentNote[]) {
  return [...notes].sort((a, b) => {
    if (isWcgConductorNoteId(a.id)) return -1;
    if (isWcgConductorNoteId(b.id)) return 1;
    const ak = wcgQuestionSortKey(a.id);
    const bk = wcgQuestionSortKey(b.id);
    if (ak !== bk) return ak - bk;
    return a.title.localeCompare(b.title, 'pt-BR');
  });
}

export function injectWcgPrepAnswers(root: HTMLElement, notes: DocumentNote[]) {
  for (const note of notes) {
    if (!isWcgQuestionNoteId(note.id) || !note.body.trim()) continue;
    const block = root.querySelector<HTMLElement>(`[data-pid="${note.blockId}"]`);
    if (!block) continue;
    if (block.nextElementSibling?.classList.contains('jcs-wcg-answer')) continue;

    const wrap = document.createElement('div');
    wrap.className = 'jcs-wcg-answer';
    wrap.dataset.wcgNote = note.id;

    const label = document.createElement('p');
    label.className = 'jcs-wcg-answer-label';
    label.textContent = 'Preparação';

    const body = document.createElement('div');
    body.className = 'jcs-wcg-answer-body';
    body.textContent = note.body;

    wrap.append(label, body);
    block.insertAdjacentElement('afterend', wrap);
  }
}
