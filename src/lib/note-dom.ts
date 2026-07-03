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

const MARKER_CLASS = 'jcs-note-marker';
const GUTTER_CLASS = 'jcs-note-gutter';
const COLUMN_CLASS = 'jcs-reading-column';
const LEGACY_ANCHOR_CLASS = 'jcs-note-anchor';
const MARKER_STACK_STEP_PX = 14;

function findBlock(root: HTMLElement, blockId: string): HTMLElement | null {
  for (const block of root.querySelectorAll<HTMLElement>('[data-pid], p[id^="p"]')) {
    if (getBlockId(block) === blockId) return block;
  }
  return null;
}

function getReadingColumn(contentRoot: HTMLElement): HTMLElement {
  return contentRoot.closest<HTMLElement>(`.${COLUMN_CLASS}`) ?? contentRoot;
}

function unwrapLegacyAnchor(anchor: HTMLElement) {
  const parent = anchor.parentNode;
  if (!parent) return;
  while (anchor.firstChild) {
    parent.insertBefore(anchor.firstChild, anchor);
  }
  parent.removeChild(anchor);
}

export function unwrapLegacyNoteAnchors(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(`span.${LEGACY_ANCHOR_CLASS}`).forEach(unwrapLegacyAnchor);
}

function ensureGutter(contentRoot: HTMLElement): HTMLElement {
  const column = getReadingColumn(contentRoot);
  let gutter = column.querySelector<HTMLElement>(`.${GUTTER_CLASS}`);
  if (!gutter) {
    gutter = document.createElement('div');
    gutter.className = GUTTER_CLASS;
    gutter.setAttribute('aria-hidden', 'true');
    column.insertBefore(gutter, contentRoot);
    column.classList.add('jcs-has-note-gutter');
  }
  return gutter;
}

function removeGutterIfEmpty(contentRoot: HTMLElement) {
  const column = getReadingColumn(contentRoot);
  const gutter = column.querySelector(`.${GUTTER_CLASS}`);
  if (gutter && gutter.childElementCount === 0) {
    gutter.remove();
    column.classList.remove('jcs-has-note-gutter');
  }
}

function createMarker(note: DocumentNote): HTMLButtonElement {
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = MARKER_CLASS;
  marker.dataset.noteId = note.id;
  marker.dataset.blockId = note.blockId;
  marker.title = note.title || 'Abrir nota';
  marker.setAttribute('aria-label', note.title || 'Abrir nota');
  return marker;
}

function blockTopWithinColumn(block: HTMLElement, column: HTMLElement): number {
  const columnRect = column.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  return blockRect.top - columnRect.top + column.scrollTop;
}

/** Fallback visual dedupe when prep antigo ainda tem entradas repetidas. */
export function dedupeNotesForMarkers(root: HTMLElement, notes: DocumentNote[]): DocumentNote[] {
  const byTitle = new Map<string, DocumentNote[]>();

  for (const note of notes) {
    const key = note.title.trim().toLowerCase();
    const group = byTitle.get(key) ?? [];
    group.push(note);
    byTitle.set(key, group);
  }

  const deduped: DocumentNote[] = [];
  for (const group of byTitle.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }

    const onNumberedBlock = group.find((note) => {
      const block = findBlock(root, note.blockId);
      const text = block?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return /^\d+\.\s/.test(text);
    });

    if (onNumberedBlock) {
      deduped.push(onNumberedBlock);
      continue;
    }

    deduped.push(
      group.reduce((best, note) =>
        (note.body?.length ?? 0) >= (best.body?.length ?? 0) ? note : best,
      ),
    );
  }

  return deduped.sort(
    (a, b) => a.blockId.localeCompare(b.blockId) || a.startOffset - b.startOffset,
  );
}

export function repositionNoteMarkers(contentRoot: HTMLElement) {
  const column = getReadingColumn(contentRoot);
  const gutter = column.querySelector<HTMLElement>(`.${GUTTER_CLASS}`);
  if (!gutter) return;

  const markers = [...gutter.querySelectorAll<HTMLElement>(`.${MARKER_CLASS}`)];
  if (markers.length === 0) return;

  const byBlock = new Map<string, HTMLElement[]>();
  for (const marker of markers) {
    const blockId = marker.dataset.blockId ?? '';
    const group = byBlock.get(blockId) ?? [];
    group.push(marker);
    byBlock.set(blockId, group);
  }

  for (const [blockId, blockMarkers] of byBlock) {
    const block = findBlock(contentRoot, blockId);
    if (!block) continue;

    const top = blockTopWithinColumn(block, column);

    blockMarkers.forEach((marker, index) => {
      marker.style.top = `${top + index * MARKER_STACK_STEP_PX}px`;
    });
  }
}

export function applyNoteAnchor(contentRoot: HTMLElement, note: DocumentNote) {
  unwrapLegacyNoteAnchors(contentRoot);

  const block = findBlock(contentRoot, note.blockId);
  if (!block) return false;

  const gutter = ensureGutter(contentRoot);
  const existing = gutter.querySelector<HTMLElement>(`.${MARKER_CLASS}[data-note-id="${note.id}"]`);
  if (existing) {
    existing.title = note.title || 'Abrir nota';
    existing.setAttribute('aria-label', note.title || 'Abrir nota');
    requestAnimationFrame(() => repositionNoteMarkers(contentRoot));
    return true;
  }

  gutter.appendChild(createMarker(note));
  requestAnimationFrame(() => repositionNoteMarkers(contentRoot));
  return true;
}

export function applyAllNoteAnchors(contentRoot: HTMLElement, notes: DocumentNote[]) {
  unwrapLegacyNoteAnchors(contentRoot);

  const column = getReadingColumn(contentRoot);
  const gutter = column.querySelector<HTMLElement>(`.${GUTTER_CLASS}`);
  if (gutter) gutter.innerHTML = '';

  const visibleNotes = dedupeNotesForMarkers(contentRoot, notes);

  if (visibleNotes.length === 0) {
    gutter?.remove();
    column.classList.remove('jcs-has-note-gutter');
    return;
  }

  const rail = ensureGutter(contentRoot);
  for (const note of visibleNotes) {
    if (!findBlock(contentRoot, note.blockId)) continue;
    rail.appendChild(createMarker(note));
  }

  if (rail.childElementCount === 0) {
    rail.remove();
    column.classList.remove('jcs-has-note-gutter');
    return;
  }

  requestAnimationFrame(() => repositionNoteMarkers(contentRoot));
}

export function removeNoteAnchor(contentRoot: HTMLElement, noteId: string) {
  const column = getReadingColumn(contentRoot);
  column.querySelector<HTMLElement>(`.${MARKER_CLASS}[data-note-id="${noteId}"]`)?.remove();

  const legacy = contentRoot.querySelector<HTMLElement>(
    `span.${LEGACY_ANCHOR_CLASS}[data-note-id="${noteId}"]`,
  );
  if (legacy) unwrapLegacyAnchor(legacy);

  removeGutterIfEmpty(contentRoot);
  requestAnimationFrame(() => repositionNoteMarkers(contentRoot));
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
