export type RichHighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export type RichFontFamily = 'Segoe UI' | 'Georgia' | 'Arial' | 'Courier New';

export type RichFontSize = 'sm' | 'md' | 'lg';

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
  runRichCommand('fontName', family);
}

export function applyFontSize(size: RichFontSize) {
  const map = { sm: '2', md: '3', lg: '5' } as const;
  runRichCommand('fontSize', map[size]);
}

export function removeFormatting() {
  runRichCommand('removeFormat');
}
