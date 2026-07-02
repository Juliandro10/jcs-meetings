export const HIGHLIGHT_COLORS = [
  { id: 'yellow', label: 'Amarelo', className: 'jcs-hl-yellow', swatch: '#fff176' },
  { id: 'green', label: 'Verde', className: 'jcs-hl-green', swatch: '#a5d6a7' },
  { id: 'blue', label: 'Azul', className: 'jcs-hl-blue', swatch: '#90caf9' },
  { id: 'pink', label: 'Rosa', className: 'jcs-hl-pink', swatch: '#f48fb1' },
  { id: 'purple', label: 'Roxo', className: 'jcs-hl-purple', swatch: '#ce93d8' },
  { id: 'orange', label: 'Laranja', className: 'jcs-hl-orange', swatch: '#ffcc80' },
] as const;

export type HighlightColorId = (typeof HIGHLIGHT_COLORS)[number]['id'];

export type DocumentHighlight = {
  id: string;
  color: HighlightColorId;
  text: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
};

export function highlightClassForColor(color: HighlightColorId) {
  return HIGHLIGHT_COLORS.find((c) => c.id === color)?.className ?? 'jcs-hl-yellow';
}

export function findBlockElement(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current instanceof HTMLElement) {
      if (current.dataset.pid) return current;
      if (/^p\d+$/.test(current.id)) return current;
    }
    current = current.parentNode;
  }
  return null;
}

export function getBlockId(block: HTMLElement) {
  return block.dataset.pid || block.id.replace(/^p/, '') || block.id;
}

function blockTextLength(block: HTMLElement) {
  return block.textContent?.length ?? 0;
}

export function serializeSelection(root: HTMLElement): DocumentHighlight | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const block = findBlockElement(range.startContainer, root);
  if (!block || findBlockElement(range.endContainer, root) !== block) return null;

  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (text.length < 2) return null;

  const preRange = document.createRange();
  preRange.selectNodeContents(block);
  preRange.setEnd(range.startContainer, range.startOffset);
  const startOffset = preRange.toString().length;
  const endOffset = startOffset + range.toString().length;

  return {
    id: crypto.randomUUID(),
    color: 'yellow',
    text,
    blockId: getBlockId(block),
    startOffset,
    endOffset,
  };
}

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

function wrapTextOffsets(block: HTMLElement, startOffset: number, endOffset: number, className: string, id: string) {
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

  const mark = document.createElement('mark');
  mark.className = className;
  mark.dataset.highlightId = id;

  try {
    range.surroundContents(mark);
  } catch {
    const extracted = range.extractContents();
    mark.appendChild(extracted);
    range.insertNode(mark);
  }
  return true;
}

export function applyHighlight(root: HTMLElement, highlight: DocumentHighlight) {
  const blocks = root.querySelectorAll<HTMLElement>('[data-pid], p[id^="p"]');
  let target: HTMLElement | null = null;
  for (const block of blocks) {
    if (getBlockId(block) === highlight.blockId) {
      target = block;
      break;
    }
  }
  if (!target) return false;

  if (target.querySelector(`mark[data-highlight-id="${highlight.id}"]`)) return true;

  let { startOffset, endOffset } = highlight;
  if (startOffset >= blockTextLength(target) || endOffset > blockTextLength(target)) {
    const located = locateTextOffsets(target, highlight.text, highlight.startOffset);
    if (!located) return false;
    startOffset = located.startOffset;
    endOffset = located.endOffset;
  }

  return wrapTextOffsets(
    target,
    startOffset,
    endOffset,
    highlightClassForColor(highlight.color),
    highlight.id,
  );
}

export function applyAllHighlights(root: HTMLElement, highlights: DocumentHighlight[]) {
  for (const highlight of highlights) {
    applyHighlight(root, highlight);
  }
}

export function applyRangeHighlight(
  root: HTMLElement,
  range: Range,
  color: HighlightColorId,
  id = crypto.randomUUID(),
) {
  const block = findBlockElement(range.startContainer, root);
  if (!block || findBlockElement(range.endContainer, root) !== block) return null;

  const serialized = serializeSelection(root);
  if (!serialized) return null;

  serialized.id = id;
  serialized.color = color;
  if (applyHighlight(root, serialized)) return serialized;
  return null;
}

export function findHighlightByQuote(root: HTMLElement, blockId: string, text: string, color: HighlightColorId) {
  const blocks = root.querySelectorAll<HTMLElement>('[data-pid], p[id^="p"]');
  for (const block of blocks) {
    if (getBlockId(block) !== blockId) continue;
    const located = locateTextOffsets(block, text);
    if (!located) continue;
    const highlight: DocumentHighlight = {
      id: crypto.randomUUID(),
      color,
      text: text.replace(/\s+/g, ' ').trim(),
      blockId,
      startOffset: located.startOffset,
      endOffset: located.endOffset,
    };
    if (applyHighlight(root, highlight)) return highlight;
  }
  return null;
}
