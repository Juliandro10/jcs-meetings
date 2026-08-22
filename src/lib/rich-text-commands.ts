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
  selection.removeAllRanges();
  selection.addRange(savedSelection);
}

function editorRootFromSelection(): HTMLElement | null {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!node) return document.querySelector('.jcs-rich-editor');
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  return element?.closest('.jcs-rich-editor') ?? document.querySelector('.jcs-rich-editor');
}

export function toggleBold() {
  runRichCommand('bold');
}

export function toggleItalic() {
  runRichCommand('italic');
}

export function toggleUnderline() {
  runRichCommand('underline');
}

export function applyHighlight(color: RichHighlightColor) {
  runRichCommand('hiliteColor', HIGHLIGHT_COLORS[color]);
}

export function clearHighlight() {
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
  runRichCommand('removeFormat');
}
