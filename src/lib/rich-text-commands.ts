export type RichHighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export type RichFontFamily = 'Segoe UI' | 'Georgia' | 'Arial' | 'Courier New';

export type RichFontSize = 12 | 14 | 16 | 18 | 20 | 22 | 24 | 28;

export const RICH_FONT_SIZES: RichFontSize[] = [12, 14, 16, 18, 20, 22, 24, 28];

const HIGHLIGHT_COLORS: Record<RichHighlightColor, string> = {
  yellow: '#fef08a',
  green: '#bbf7d0',
  blue: '#bfdbfe',
  pink: '#fbcfe8',
};

export function runRichCommand(command: string, value?: string) {
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(command, false, value);
}

let savedSelection: Range | null = null;

export function captureEditorSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }
  savedSelection = selection.getRangeAt(0).cloneRange();
}

export function restoreEditorSelection() {
  if (!savedSelection) return;
  const selection = window.getSelection();
  if (!selection) return;
  try {
    selection.removeAllRanges();
    selection.addRange(savedSelection);
  } catch {
    savedSelection = null;
  }
}

/** Libera caret preso no contenteditable para o chat/outros campos voltarem a receber teclado. */
export function releaseEditorSelection(options?: { blur?: boolean }) {
  savedSelection = null;
  if (options?.blur !== false) {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('.jcs-rich-editor')) {
      active.blur();
    }
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const blocksKeyboard = (node: Node | null) => {
    if (!node) return false;
    if (!document.contains(node)) return true;
    const el = node instanceof Element ? node : node.parentElement;
    return Boolean(el?.closest('.jcs-rich-editor'));
  };

  if (blocksKeyboard(selection.anchorNode) || blocksKeyboard(selection.focusNode)) {
    selection.removeAllRanges();
  }
}

function editorRootFromSelection(): HTMLElement | null {
  const selection = window.getSelection();
  const node = selection?.anchorNode ?? savedSelection?.startContainer;
  if (!node) return document.querySelector('.jcs-rich-editor');
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  return element?.closest('.jcs-rich-editor') ?? document.querySelector('.jcs-rich-editor');
}

function unwrapElement(el: Element) {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  el.remove();
}

function selectionRangeInEditor(): Range | null {
  restoreEditorSelection();
  const root = editorRootFromSelection();
  const selection = window.getSelection();
  if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  return range;
}

export function toggleBold() {
  restoreEditorSelection();
  runRichCommand('bold');
}

export function toggleItalic() {
  restoreEditorSelection();
  runRichCommand('italic');
}

export function toggleUnderline() {
  restoreEditorSelection();
  runRichCommand('underline');
}

export function applyHighlight(color: RichHighlightColor) {
  const range = selectionRangeInEditor();
  if (!range) return;

  const mark = document.createElement('mark');
  mark.className = `jcs-rich-hl jcs-rich-hl-${color}`;
  mark.style.backgroundColor = HIGHLIGHT_COLORS[color];
  try {
    range.surroundContents(mark);
  } catch {
    const extracted = range.extractContents();
    mark.appendChild(extracted);
    range.insertNode(mark);
  }
}

export function clearHighlight() {
  const range = selectionRangeInEditor();
  const root = editorRootFromSelection();
  if (!range || !root) {
    restoreEditorSelection();
    runRichCommand('hiliteColor', 'transparent');
    return;
  }

  const marks = [...root.querySelectorAll('mark.jcs-rich-hl, mark')].reverse();
  for (const mark of marks) {
    if (range.intersectsNode(mark)) unwrapElement(mark);
  }

  root.querySelectorAll<HTMLElement>('span[style]').forEach((span) => {
    if (!range.intersectsNode(span)) return;
    if (!/background/i.test(span.getAttribute('style') ?? '')) return;
    span.style.removeProperty('background-color');
    span.style.removeProperty('background');
    if (!span.getAttribute('style')?.trim()) span.removeAttribute('style');
  });

  runRichCommand('hiliteColor', 'transparent');
}

export function applyFontFamily(family: RichFontFamily) {
  restoreEditorSelection();
  runRichCommand('fontName', family);
}

export function applyFontSize(size: RichFontSize) {
  restoreEditorSelection();
  runRichCommand('fontSize', '7');

  const root = editorRootFromSelection();
  if (!root) return;

  const cssSize = `${size}px`;
  root.querySelectorAll('font[size="7"]').forEach((font) => {
    const span = document.createElement('span');
    span.style.fontSize = cssSize;
    while (font.firstChild) span.appendChild(font.firstChild);
    font.replaceWith(span);
  });
  root.querySelectorAll('span').forEach((span) => {
    const current = span.style.fontSize;
    if (current === 'xxx-large' || current === '-webkit-xxx-large') {
      span.style.fontSize = cssSize;
    }
  });
}

export function removeFormatting() {
  const range = selectionRangeInEditor();
  const root = editorRootFromSelection();
  if (range && root) {
    [...root.querySelectorAll('mark.jcs-rich-hl, mark')].reverse().forEach((mark) => {
      if (range.intersectsNode(mark)) unwrapElement(mark);
    });
  }
  restoreEditorSelection();
  runRichCommand('removeFormat');
}
