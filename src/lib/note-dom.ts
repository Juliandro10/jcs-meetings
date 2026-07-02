import { findBlockElement, getBlockId } from '@/lib/highlight-dom';

export type DocumentNote = {
  id: string;
  title: string;
  body: string;
  blockId: string;
  anchorText: string;
  startOffset: number;
  endOffset: number;
  tags: string[];
};

function locateTextOffsets(block: HTMLElement, text: string, hintStart?: number) {
  const content = block.textContent ?? '';
  const normalizedNeedle = text.replace(/\s+/g, ' ').trim();
  if (!normalizedNeedle) return null;

  let from = hintStart ?? 0;
  while (from <= content.length) {
    const idx = content.indexOf(normalizedNeedle, from);
    if (idx === -1) break;
    return { startOffset: idx, endOffset: idx + normalizedNeedle.length };
  }

  const fuzzy = content.replace(/\s+/g, ' ').trim();
  const fuzzyIdx = fuzzy.indexOf(normalizedNeedle);
  if (fuzzyIdx >= 0) {
    return { startOffset: fuzzyIdx, endOffset: fuzzyIdx + normalizedNeedle.length };
  }
  return null;
}

function wrapNoteAnchor(
  block: HTMLElement,
  startOffset: number,
  endOffset: number,
  noteId: string,
) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.data.length;
    if (!startNode && offset + len >= startOffset) {
      startNode = node;
      startNodeOffset = startOffset - offset;
    }
    if (offset + len >= endOffset) {
      endNode = node;
      endNodeOffset = endOffset - offset;
      break;
    }
    offset += len;
  }

  if (!startNode || !endNode) return false;

  const range = document.createRange();
  range.setStart(startNode, startNodeOffset);
  range.setEnd(endNode, endNodeOffset);

  const anchor = document.createElement('span');
  anchor.className = 'jcs-note-anchor';
  anchor.dataset.noteId = noteId;
  anchor.title = 'Abrir nota';

  try {
    range.surroundContents(anchor);
  } catch {
    const extracted = range.extractContents();
    anchor.appendChild(extracted);
    range.insertNode(anchor);
  }
  return true;
}

export function applyNoteAnchor(root: HTMLElement, note: DocumentNote) {
  const blocks = root.querySelectorAll<HTMLElement>('[data-pid], p[id^="p"]');
  let target: HTMLElement | null = null;
  for (const block of blocks) {
    if (getBlockId(block) === note.blockId) {
      target = block;
      break;
    }
  }
  if (!target) return false;

  if (target.querySelector(`span.jcs-note-anchor[data-note-id="${note.id}"]`)) return true;

  let { startOffset, endOffset } = note;
  const blockLen = target.textContent?.length ?? 0;

  const tryWrap = (start: number, end: number) => wrapNoteAnchor(target, start, end, note.id);

  if (tryWrap(startOffset, endOffset)) return true;

  if (startOffset >= blockLen || endOffset > blockLen || startOffset === 0) {
    const located = locateTextOffsets(target, note.anchorText, note.startOffset);
    if (located) return tryWrap(located.startOffset, located.endOffset);
  }

  return false;
}

export function applyAllNoteAnchors(root: HTMLElement, notes: DocumentNote[]) {
  for (const note of notes) {
    applyNoteAnchor(root, note);
  }
}

export function removeNoteAnchor(root: HTMLElement, noteId: string) {
  const anchor = root.querySelector<HTMLElement>(`span.jcs-note-anchor[data-note-id="${noteId}"]`);
  if (!anchor) return;
  const parent = anchor.parentNode;
  if (!parent) return;
  while (anchor.firstChild) {
    parent.insertBefore(anchor.firstChild, anchor);
  }
  parent.removeChild(anchor);
}

export function noteFromSelection(root: HTMLElement): Omit<DocumentNote, 'body' | 'tags'> | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const block = findBlockElement(range.startContainer, root);
  if (!block || findBlockElement(range.endContainer, root) !== block) return null;

  const anchorText = selection.toString().replace(/\s+/g, ' ').trim();
  if (anchorText.length < 2) return null;

  const preRange = document.createRange();
  preRange.selectNodeContents(block);
  preRange.setEnd(range.startContainer, range.startOffset);
  const startOffset = preRange.toString().length;
  const endOffset = startOffset + range.toString().length;

  const title = anchorText.length <= 120 ? anchorText : `${anchorText.slice(0, 117)}…`;

  return {
    id: crypto.randomUUID(),
    title,
    blockId: getBlockId(block),
    anchorText,
    startOffset,
    endOffset,
  };
}
