const LETTER_RE = /\p{L}/u;
const SKIP_PARENT = '.jcs-bible-ref, .jcs-song-ref, .jcs-pub-ref, a.jcs-page-jump, a.jcs-page-hotspot';

export type EditorWordBeforeCaret = {
  word: string;
  suffix: string;
  range: Range;
};

export type TextareaWordBeforeCaret = {
  word: string;
  suffix: string;
  start: number;
  end: number;
};

function isLetter(ch: string) {
  return ch.length > 0 && LETTER_RE.test(ch);
}

function editingBlock(node: Node, root: HTMLElement) {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return root;
  const block = el.closest('p, li, h1, h2, h3, h4, blockquote');
  if (block && root.contains(block)) return block;
  return root;
}

function previousChar(
  root: HTMLElement,
  node: Node,
  offset: number,
): { node: Text; offset: number; ch: string } | null {
  let current: Node | null = node;
  let index = offset;

  while (current && root.contains(current)) {
    if (current.nodeType === Node.TEXT_NODE) {
      const text = current as Text;
      if (index > 0) {
        return { node: text, offset: index - 1, ch: text.data[index - 1] ?? '' };
      }
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    walker.currentNode = current;
    const prev = walker.previousNode();
    if (!prev || prev.nodeType !== Node.TEXT_NODE) return null;
    current = prev;
    index = (current as Text).data.length;
  }
  return null;
}

function suffixBetween(endNode: Text, endOffset: number, caret: Range, root: HTMLElement) {
  if (editingBlock(endNode, root) !== editingBlock(caret.startContainer, root)) return '';
  try {
    const suffixRange = document.createRange();
    suffixRange.setStart(endNode, endOffset);
    suffixRange.setEnd(caret.startContainer, caret.startOffset);
    const suffix = suffixRange.toString();
    if (!suffix || /\p{L}/u.test(suffix)) return '';
    return suffix;
  } catch {
    return '';
  }
}

function isSpaceChar(ch: string) {
  return ch === ' ' || ch === '\u00A0' || ch === '\t';
}

export function sameVisibleText(a: string, b: string) {
  return a.replace(/\u00A0/g, ' ') === b.replace(/\u00A0/g, ' ');
}

/** Chrome deixa o cursor antes do espaço final do bloco — a próxima palavra cola. */
function placeCaretAfterInsertedText(inserted: string) {
  if (!/[\s\u00A0]$/.test(inserted)) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const caret = selection.getRangeAt(0);
  const node = caret.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;

  const text = node as Text;
  let offset = caret.startOffset;
  while (offset < text.data.length && isSpaceChar(text.data[offset] ?? '')) {
    offset += 1;
  }
  if (offset === caret.startOffset) return;

  const next = document.createRange();
  next.setStart(text, offset);
  next.collapse(true);
  selection.removeAllRanges();
  selection.addRange(next);
}

export function wordBeforeCaretInEditor(root: HTMLElement): EditorWordBeforeCaret | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const caret = selection.getRangeAt(0);
  if (!root.contains(caret.startContainer)) return null;

  const startEl =
    caret.startContainer.nodeType === Node.ELEMENT_NODE
      ? (caret.startContainer as Element)
      : caret.startContainer.parentElement;
  if (startEl?.closest(SKIP_PARENT)) return null;

  let point = previousChar(root, caret.startContainer, caret.startOffset);
  while (point && !isLetter(point.ch)) {
    point = previousChar(root, point.node, point.offset);
  }
  if (!point) return null;

  const endNode = point.node;
  const endOffset = point.offset + 1;
  let startNode = point.node;
  let startOffset = point.offset;

  let cursor: { node: Text; offset: number; ch: string } | null = point;
  while (cursor) {
    const prev = previousChar(root, cursor.node, cursor.offset);
    if (!prev || !isLetter(prev.ch)) break;
    startNode = prev.node;
    startOffset = prev.offset;
    cursor = prev;
  }

  const wordRange = document.createRange();
  wordRange.setStart(startNode, startOffset);
  wordRange.setEnd(endNode, endOffset);
  const word = wordRange.toString();
  if (!word || /\s/.test(word)) return null;

  const suffix = suffixBetween(endNode, endOffset, caret, root);
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  if (suffix) {
    range.setEnd(caret.startContainer, caret.startOffset);
  } else {
    range.setEnd(endNode, endOffset);
  }
  return { word, suffix, range };
}

export function wordBeforeCaretInTextarea(textarea: HTMLTextAreaElement): TextareaWordBeforeCaret | null {
  const caret = textarea.selectionStart;
  if (textarea.selectionEnd !== caret) return null;
  const before = textarea.value.slice(0, caret);
  const match = before.match(/(\p{L}+)([^\p{L}]*)$/u);
  if (!match?.[1]) return null;
  const word = match[1];
  const suffix = match[2] ?? '';
  const end = caret - suffix.length;
  const start = end - word.length;
  return { word, suffix, start, end };
}

export function replaceRangeWithText(range: Range, next: string) {
  const selection = window.getSelection();
  if (!selection) return false;
  try {
    selection.removeAllRanges();
    selection.addRange(range);
    const ok = document.execCommand('insertText', false, next);
    if (ok) {
      placeCaretAfterInsertedText(next);
      return true;
    }
  } catch {
    /* fallback below */
  }
  range.deleteContents();
  const textNode = document.createTextNode(next);
  range.insertNode(textNode);
  const after = document.createRange();
  after.setStart(textNode, textNode.data.length);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
  placeCaretAfterInsertedText(next);
  return true;
}
