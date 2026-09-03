const LETTER_RE = /\p{L}/u;
const SKIP_PARENT = '.jcs-bible-ref, .jcs-song-ref, .jcs-pub-ref, a.jcs-page-jump, a.jcs-page-hotspot';

function isLetter(ch: string) {
  return ch.length > 0 && LETTER_RE.test(ch);
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

export function wordBeforeCaretInEditor(root: HTMLElement): { word: string; range: Range } | null {
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

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const word = range.toString();
  if (!word || /\s/.test(word)) return null;
  return { word, range };
}

export function wordBeforeCaretInTextarea(textarea: HTMLTextAreaElement): { word: string; start: number; end: number } | null {
  const caret = textarea.selectionStart;
  if (textarea.selectionEnd !== caret) return null;
  const before = textarea.value.slice(0, caret);
  const match = before.match(/(\p{L}+)[^\p{L}]*$/u);
  if (!match?.[1]) return null;
  const word = match[1];
  const end = before.replace(/[^\p{L}]+$/u, '').length;
  const start = end - word.length;
  return { word, start, end };
}

export function replaceRangeWithText(range: Range, next: string) {
  const selection = window.getSelection();
  if (!selection) return false;
  try {
    selection.removeAllRanges();
    selection.addRange(range);
    const ok = document.execCommand('insertText', false, next);
    if (ok) return true;
  } catch {
    /* fallback below */
  }
  range.deleteContents();
  range.insertNode(document.createTextNode(next));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
