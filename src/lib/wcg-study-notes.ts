import type { DocumentNote } from '@/lib/note-dom';
import { autoResizeTextarea } from '@/lib/auto-resize-textarea';

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

export function findWcgAnswerTextarea(root: HTMLElement, questionBlockId: string) {
  const questionBlock = root.querySelector<HTMLElement>(`.jwpub-block[data-pid="${questionBlockId}"]`);
  if (!questionBlock) return null;

  let sibling: Element | null = questionBlock;
  for (let step = 0; step < 5; step++) {
    sibling = sibling.nextElementSibling;
    if (!sibling) break;
    const textarea = sibling.querySelector<HTMLTextAreaElement>('textarea');
    if (textarea) return textarea;
  }

  return questionBlock.querySelector<HTMLTextAreaElement>('.gen-field textarea');
}

export function applyWcgPrepToAnswerFields(
  root: HTMLElement,
  notes: DocumentNote[],
  savedFieldValues: Record<string, string>,
  scope: { pub: string; issue: string; documentId: number },
) {
  for (const note of notes) {
    if (!isWcgQuestionNoteId(note.id) || !note.body.trim()) continue;

    const textarea = findWcgAnswerTextarea(root, note.blockId);
    if (!textarea) continue;

    const fieldId = textarea.id || textarea.getAttribute('data-pid') || '';
    if (!fieldId) continue;

    const key = `${scope.pub}_${scope.issue}_d${scope.documentId}_f${fieldId}`;
    const saved = savedFieldValues[key]?.trim();
    textarea.value = saved || note.body.trim();
    textarea.dataset.wcgQuestionBlock = note.blockId;

    const questionBlock = root.querySelector<HTMLElement>(`.jwpub-block[data-pid="${note.blockId}"]`);
    const prepBox = questionBlock?.nextElementSibling;
    if (prepBox?.classList.contains('jcs-wcg-answer')) {
      prepBox.remove();
    }

    autoResizeTextarea(textarea);
  }
}

export function injectWcgPrepAnswers(root: HTMLElement, notes: DocumentNote[]) {
  for (const note of notes) {
    if (!isWcgQuestionNoteId(note.id) || !note.body.trim()) continue;
    if (findWcgAnswerTextarea(root, note.blockId)) continue;

    const block = root.querySelector<HTMLElement>(`.jwpub-block[data-pid="${note.blockId}"]`);
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
