import { expandToCompleteUnit } from '../../shared/highlight-expand';
import { normalizePlainText } from '../../shared/text-normalize';
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

type TextPoint = { node: Text; offset: number };

function buildNormalizedTextIndex(block: HTMLElement) {
  const points: TextPoint[] = [];
  let norm = '';
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    for (let offset = 0; offset < node.data.length; offset += 1) {
      const ch = node.data[offset] ?? '';
      if (ch === '\u00A0' || /\s/u.test(ch)) {
        if (norm.length === 0 || norm.endsWith(' ')) continue;
        points.push({ node, offset });
        norm += ' ';
      } else {
        points.push({ node, offset });
        norm += ch;
      }
    }
  }
  return { norm, points };
}

function expandLocatedRange(norm: string, start: number, end: number) {
  const expanded = expandToCompleteUnit(norm, start, end);
  return { start: expanded.start, end: expanded.end, text: expanded.text };
}

function findNeedleRangeInNorm(norm: string, needle: string, hintStart?: number) {
  const pickIndex = (candidates: number[]) => {
    if (candidates.length === 0) return -1;
    if (hintStart === undefined) return candidates[0]!;
    return candidates.reduce((best, idx) =>
      Math.abs(idx - hintStart) < Math.abs(best - hintStart) ? idx : best,
    );
  };

  const collectMatches = (haystack: string, search: string) => {
    const hits: number[] = [];
    let from = 0;
    while (from <= haystack.length) {
      const idx = haystack.indexOf(search, from);
      if (idx === -1) break;
      hits.push(idx);
      from = idx + 1;
    }
    return hits;
  };

  let candidates = collectMatches(norm, needle);
  if (candidates.length === 0) {
    candidates = collectMatches(norm.toLowerCase(), needle.toLowerCase());
  }
  const idx = pickIndex(candidates);
  if (idx < 0) return null;

  return expandLocatedRange(norm, idx, idx + needle.length);
}

function wrapNormalizedText(
  block: HTMLElement,
  searchText: string,
  className: string,
  id: string,
  hintStart?: number,
) {
  const needle = normalizePlainText(searchText);
  if (!needle) return false;

  const { norm, points } = buildNormalizedTextIndex(block);
  if (!norm || points.length === 0) return false;

  let range = findNeedleRangeInNorm(norm, needle, hintStart);
  if (!range) {
    for (let len = Math.min(needle.length - 1, 72); len >= 4; len -= 1) {
      const prefix = needle.slice(0, len);
      if (len < needle.length && !/[\s.!?,;:]$/.test(prefix)) continue;
      range = findNeedleRangeInNorm(norm, prefix, hintStart);
      if (range) break;
    }
  }
  if (!range || range.end > points.length || range.start >= points.length) return false;

  return wrapNormRangePoints(points, range.start, range.end, className, id);
}

function wrapNormRangePoints(
  points: TextPoint[],
  start: number,
  end: number,
  className: string,
  id: string,
) {
  if (end > points.length || start >= points.length) return false;

  const startPoint = points[start];
  const endPoint = points[end - 1];
  if (!startPoint || !endPoint) return false;

  const domRange = document.createRange();
  domRange.setStart(startPoint.node, startPoint.offset);
  domRange.setEnd(endPoint.node, endPoint.offset + 1);

  const mark = document.createElement('mark');
  mark.className = className;
  mark.dataset.highlightId = id;

  const fragment = domRange.extractContents();
  if (!fragment.textContent?.replace(/\s/gu, '')) return false;
  mark.appendChild(fragment);
  domRange.insertNode(mark);
  return true;
}

function wrapNormalizedOffsets(
  block: HTMLElement,
  startOffset: number,
  endOffset: number,
  className: string,
  id: string,
) {
  const { norm, points } = buildNormalizedTextIndex(block);
  if (!norm || points.length === 0) return false;
  const expanded = expandLocatedRange(
    norm,
    Math.min(startOffset, norm.length - 1),
    Math.min(endOffset, norm.length),
  );
  return wrapNormRangePoints(points, expanded.start, expanded.end, className, id);
}

function locateTextOffsets(block: HTMLElement, text: string, hintStart?: number) {
  const content = normalizePlainText(block.textContent ?? '');
  const normalizedNeedle = normalizePlainText(text);
  if (!normalizedNeedle) return null;

  const pickIndex = (candidates: number[]) => {
    if (candidates.length === 0) return -1;
    if (hintStart === undefined) return candidates[0]!;
    return candidates.reduce((best, idx) =>
      Math.abs(idx - hintStart) < Math.abs(best - hintStart) ? idx : best,
    );
  };

  const tryNeedle = (needle: string) => {
    const candidates: number[] = [];
    let from = 0;
    while (from <= content.length) {
      const idx = content.indexOf(needle, from);
      if (idx === -1) break;
      candidates.push(idx);
      from = idx + 1;
    }
    if (candidates.length === 0) {
      const lower = content.toLowerCase();
      const lowerNeedle = needle.toLowerCase();
      from = 0;
      while (from <= lower.length) {
        const idx = lower.indexOf(lowerNeedle, from);
        if (idx === -1) break;
        candidates.push(idx);
        from = idx + 1;
      }
    }
    const idx = pickIndex(candidates);
    if (idx < 0) return null;
    const expanded = expandLocatedRange(content, idx, idx + needle.length);
    return { startOffset: expanded.start, endOffset: expanded.end };
  };

  let located = tryNeedle(normalizedNeedle);
  if (located) return located;

  for (let len = Math.min(normalizedNeedle.length - 1, 72); len >= 4; len -= 1) {
    const prefix = normalizedNeedle.slice(0, len);
    if (len < normalizedNeedle.length && !/[\s.!?,;:]$/.test(prefix)) continue;
    located = tryNeedle(prefix);
    if (located) return located;
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

  const className = highlightClassForColor(highlight.color);

  if (
    highlight.startOffset >= 0 &&
    highlight.endOffset > highlight.startOffset &&
    wrapNormalizedOffsets(target, highlight.startOffset, highlight.endOffset, className, highlight.id)
  ) {
    return true;
  }

  if (wrapNormalizedText(target, highlight.text, className, highlight.id, highlight.startOffset)) {
    return true;
  }

  const located = locateTextOffsets(target, highlight.text, highlight.startOffset);
  if (!located) return false;

  return wrapNormalizedOffsets(target, located.startOffset, located.endOffset, className, highlight.id);
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
