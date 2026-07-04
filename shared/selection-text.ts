import { normalizeForSearch } from './text-normalize';

export function cleanSelectionText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Termo principal para dicionário (palavra ou composto com hífen). */
export function dictionaryLookupTerm(value: string): string {
  const cleaned = cleanSelectionText(value);
  if (!cleaned) return '';

  const wordMatch = cleaned.match(/^[\p{L}][\p{L}\-]*/u);
  if (wordMatch?.[0]) return wordMatch[0];

  return cleaned.split(/\s+/)[0] ?? cleaned;
}

export function isValidDictionaryQuery(value: string): boolean {
  return normalizeForSearch(dictionaryLookupTerm(value)).length >= 2;
}

export function isValidSearchQuery(value: string): boolean {
  return cleanSelectionText(value).length >= 2;
}

function nodeInRoot(root: HTMLElement, node: Node | null) {
  if (!node) return false;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  return Boolean(element && root.contains(element));
}

/** Texto selecionado ou palavra sob o cursor (botão direito). */
export function resolveReaderContextText(root: HTMLElement, event: MouseEvent): string {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) {
    if (nodeInRoot(root, selection.anchorNode) || nodeInRoot(root, selection.focusNode)) {
      const text = cleanSelectionText(selection.toString());
      if (text) return text;
    }
  }

  const range =
    document.caretRangeFromPoint?.(event.clientX, event.clientY) ??
    (() => {
      const position = document.caretPositionFromPoint?.(event.clientX, event.clientY);
      if (!position) return null;
      const next = document.createRange();
      next.setStart(position.offsetNode, position.offset);
      next.collapse(true);
      return next;
    })();

  if (!range || !nodeInRoot(root, range.startContainer)) return '';

  try {
    range.expand('word');
  } catch {
    return '';
  }

  if (!nodeInRoot(root, range.startContainer)) return '';
  return cleanSelectionText(range.toString());
}

export function hasReaderContextActions(text: string) {
  return isValidSearchQuery(text) || isValidDictionaryQuery(text);
}
