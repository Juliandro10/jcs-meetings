import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { linkifyBibleCitationsHtml } from '@/lib/bible-citation';
import { RichTextToolbar } from '@/components/RichTextToolbar';
import { SelectionContextMenu } from '@/components/SelectionContextMenu';
import { useSelectionActions } from '@/context/SelectionActionsContext';
import { cleanSelectionText, resolveReaderContextText } from '../../shared/selection-text';
import {
  applyFontFamily,
  applyFontSize,
  applyHighlight,
  clearHighlight,
  removeFormatting,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  type RichFontFamily,
  type RichFontSize,
  type RichHighlightColor,
} from '@/lib/rich-text-commands';
import {
  linkifyBibleCitationsInHtml,
  normalizeEditorHtml,
  outlineContentToHtml,
} from '@/lib/rich-outline-html';

type LookupMenuState = { open: boolean; x: number; y: number; text: string };

const CLOSED_LOOKUP_MENU: LookupMenuState = { open: false, x: 0, y: 0, text: '' };

function resolveTextareaContextText(textarea: HTMLTextAreaElement): string {
  const selected = cleanSelectionText(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd));
  if (selected) return selected;

  const value = textarea.value;
  const caret = textarea.selectionStart;
  const left = value.slice(0, caret);
  const right = value.slice(caret);
  const prefix = left.match(/[\p{L}\-]+$/u)?.[0] ?? '';
  const suffix = right.match(/^[\p{L}\-]*/u)?.[0] ?? '';
  return cleanSelectionText(`${prefix}${suffix}`);
}

type BibleLinkedEditorProps = {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  fillHeight?: boolean;
  /** Barra de formatação (negrito, grifo, fontes). */
  richText?: boolean;
  /** Incrementar para forçar o DOM a receber `value` (ex.: aplicação da IA). */
  revision?: number;
  onChange: (value: string) => void;
  onBibleLinkClick: (href: string, label: string) => void;
};

export function BibleLinkedEditor({
  value,
  disabled,
  placeholder,
  fillHeight = false,
  richText = false,
  revision,
  onChange,
  onBibleLinkClick,
}: BibleLinkedEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionActions = useSelectionActions();
  const [lookupMenu, setLookupMenu] = useState<LookupMenuState>(CLOSED_LOOKUP_MENU);
  /** null = ainda não sincronizou o DOM com value (evita pular a carga inicial). */
  const lastEmitted = useRef<string | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const applyValueToEditor = useCallback(
    (nextValue: string) => {
      const root = editorRef.current;
      if (!root) return;
      root.innerHTML = outlineContentToHtml(nextValue);
      const linked = linkifyBibleCitationsInHtml(root.innerHTML, 'all');
      if (linked !== root.innerHTML) {
        root.innerHTML = linked;
      }
      lastEmitted.current = nextValue;
    },
    [],
  );

  const emitChange = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const html = normalizeEditorHtml(root.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  }, [onChange]);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    const root = editorRef.current;
    if (root && document.activeElement === root) {
      // Não sobrescrever o DOM enquanto o usuário digita (ex.: save async com body antigo).
      return;
    }
    applyValueToEditor(value);
  }, [applyValueToEditor, value]);

  useEffect(() => {
    if (revision == null) return;
    applyValueToEditor(valueRef.current);
  }, [applyValueToEditor, revision]);

  const runAndEmit = useCallback(
    (action: () => void) => {
      if (disabled) return;
      editorRef.current?.focus();
      action();
      const root = editorRef.current;
      if (root) {
        const linked = linkifyBibleCitationsInHtml(root.innerHTML, 'all');
        if (linked !== root.innerHTML) root.innerHTML = linked;
      }
      emitChange();
    },
    [disabled, emitChange],
  );

  const handleInput = () => {
    emitChange();
  };

  const handleBlur = () => {
    const root = editorRef.current;
    if (root) {
      const linked = linkifyBibleCitationsInHtml(root.innerHTML, 'all');
      if (linked !== root.innerHTML) root.innerHTML = linked;
    }
    emitChange();
  };

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a.jcs-bible-ref');
      if (!anchor) return;
      event.preventDefault();
      const href = anchor.getAttribute('data-href');
      const label = anchor.getAttribute('data-label') ?? anchor.textContent?.trim() ?? '';
      if (href) onBibleLinkClick(href, label);
    },
    [onBibleLinkClick],
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!selectionActions || disabled) return;
      const root = editorRef.current;
      if (!root) return;
      event.preventDefault();
      const text = resolveReaderContextText(root, event.nativeEvent);
      if (!text) return;
      setLookupMenu({ open: true, x: event.clientX, y: event.clientY, text });
    },
    [disabled, selectionActions],
  );

  const lookupMenuNode =
    selectionActions && lookupMenu.open ? (
      <SelectionContextMenu
        open={lookupMenu.open}
        x={lookupMenu.x}
        y={lookupMenu.y}
        text={lookupMenu.text}
        onClose={() => setLookupMenu(CLOSED_LOOKUP_MENU)}
        onSearch={(text) => selectionActions.searchSelection(text)}
        onDictionary={(text) => selectionActions.dictionaryLookup(text)}
      />
    ) : null;

  const boxClass = [
    'flex flex-col overflow-hidden rounded-xl border border-jw-border bg-jw-surface',
    fillHeight ? 'min-h-0 flex-1' : 'h-[420px] min-h-[280px]',
  ].join(' ');

  if (!richText) {
    return (
      <PlainTextEditor
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        fillHeight={fillHeight}
        onChange={onChange}
        onBibleLinkClick={onBibleLinkClick}
      />
    );
  }

  return (
    <div className={`relative ${boxClass}`}>
      <div className="shrink-0 border-b border-jw-border bg-[#ececea] px-3 py-2">
        <RichTextToolbar
          embedded
          disabled={disabled}
          onBold={() => runAndEmit(toggleBold)}
          onItalic={() => runAndEmit(toggleItalic)}
          onUnderline={() => runAndEmit(toggleUnderline)}
          onHighlight={(color: RichHighlightColor) => runAndEmit(() => applyHighlight(color))}
          onClearHighlight={() => runAndEmit(clearHighlight)}
          onFontFamily={(family: RichFontFamily) => runAndEmit(() => applyFontFamily(family))}
          onFontSize={(size: RichFontSize) => runAndEmit(() => applyFontSize(size))}
          onClearFormat={() => runAndEmit(removeFormatting)}
        />
      </div>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        data-placeholder={placeholder}
        onInput={handleInput}
        onBlur={handleBlur}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={[
          'jcs-rich-editor min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 text-sm leading-relaxed text-jw-text outline-none',
          'empty:before:pointer-events-none empty:before:text-jw-muted empty:before:content-[attr(data-placeholder)]',
          '[&_a.jcs-bible-ref]:cursor-pointer [&_a.jcs-bible-ref]:font-medium [&_a.jcs-bible-ref]:text-jw-purple [&_a.jcs-bible-ref]:underline',
        ].join(' ')}
      />
      {lookupMenuNode}
    </div>
  );
}

/** Modo legado: textarea + espelho (texto puro). */
function PlainTextEditor({
  value,
  disabled,
  placeholder,
  fillHeight,
  onChange,
  onBibleLinkClick,
}: Omit<BibleLinkedEditorProps, 'richText'>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const selectionActions = useSelectionActions();
  const [lookupMenu, setLookupMenu] = useState<LookupMenuState>(CLOSED_LOOKUP_MENU);
  const linkedHtml = useMemo(() => linkifyBibleCitationsHtml(value, 'all'), [value]);

  const syncScroll = () => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
  };

  const handleMirrorClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a.jcs-bible-ref');
      if (!anchor) return;
      event.preventDefault();
      event.stopPropagation();
      const href = anchor.getAttribute('data-href');
      const label = anchor.getAttribute('data-label') ?? anchor.textContent?.trim() ?? '';
      if (href) onBibleLinkClick(href, label);
    },
    [onBibleLinkClick],
  );

  const layerClass =
    'absolute inset-0 overflow-y-auto overflow-x-hidden px-4 py-3 text-sm leading-relaxed';

  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl border border-jw-border bg-jw-surface',
        fillHeight ? 'min-h-0 flex-1' : 'h-[420px] min-h-[280px]',
      ].join(' ')}
    >
      <textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        spellCheck
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        onContextMenu={(event) => {
          if (!selectionActions || disabled) return;
          const textarea = textareaRef.current;
          if (!textarea) return;
          event.preventDefault();
          const text = resolveTextareaContextText(textarea);
          if (!text) return;
          setLookupMenu({ open: true, x: event.clientX, y: event.clientY, text });
        }}
        placeholder={placeholder}
        className={[
          layerClass,
          'z-0 resize-none border-0 bg-transparent text-transparent caret-jw-text outline-none',
          'selection:bg-jw-purple/25 focus:ring-0',
        ].join(' ')}
        style={{ WebkitTextFillColor: 'transparent' }}
      />
      <div
        ref={mirrorRef}
        aria-hidden
        onClick={handleMirrorClick}
        onMouseDown={(event) => {
          const anchor = (event.target as HTMLElement | null)?.closest('a.jcs-bible-ref');
          if (anchor) return;
          event.preventDefault();
          textareaRef.current?.focus();
        }}
        className={[
          layerClass,
          'pointer-events-none z-[1] whitespace-pre-wrap break-words text-jw-text',
        ].join(' ')}
      >
        <div
          className="pointer-events-none min-h-full [&_a.jcs-bible-ref]:pointer-events-auto [&_a.jcs-bible-ref]:cursor-pointer"
          dangerouslySetInnerHTML={{ __html: linkedHtml || '<span><br></span>' }}
        />
      </div>
      {selectionActions && lookupMenu.open ? (
        <SelectionContextMenu
          open={lookupMenu.open}
          x={lookupMenu.x}
          y={lookupMenu.y}
          text={lookupMenu.text}
          onClose={() => setLookupMenu(CLOSED_LOOKUP_MENU)}
          onSearch={(text) => selectionActions.searchSelection(text)}
          onDictionary={(text) => selectionActions.dictionaryLookup(text)}
        />
      ) : null}
    </div>
  );
}
