import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { linkifyJcsReadRefsInPlainText } from '../../shared/jcs-read-ref-links';
import { RichTextToolbar } from '@/components/RichTextToolbar';
import { SelectionContextMenu } from '@/components/SelectionContextMenu';
import { useSelectionActions } from '@/context/SelectionActionsContext';
import { cleanSelectionText, resolveReaderContextText } from '../../shared/selection-text';
import {
  activateRichEditorForInput,
  applyFontFamily,
  applyFontSize,
  pastePlainTextIntoRichEditor,
  insertHtmlIntoRichEditor,
  captureEditorSelection,
  releaseEditorSelection,
  restoreEditorSelection,
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
import { normalizeRichEditorHtml, refsToEditorSpans } from '@/lib/editor-ref-markup';
import {
  AUTO_CORRECT_MODE_EVENT,
  readAutoCorrectMode,
} from '@/lib/auto-correct-settings';
import { requestAutoCorrect } from '@/lib/auto-correct-client';
import {
  replaceRangeWithText,
  sameVisibleText,
  wordBeforeCaretInEditor,
  wordBeforeCaretInTextarea,
} from '@/lib/editor-auto-correct';
import type { AutoCorrectMode } from '../../electron/types';
import { scrollToJcsPageJump } from '@/lib/scroll-jcs-page-jump';

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
  onSaveImage?: (file: File) => Promise<{ src: string; alt?: string } | null>;
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
  onSaveImage,
}: BibleLinkedEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const selectionActions = useSelectionActions();
  const [lookupMenu, setLookupMenu] = useState<LookupMenuState>(CLOSED_LOOKUP_MENU);
  /** null = ainda não sincronizou o DOM com value (evita pular a carga inicial). */
  const lastEmitted = useRef<string | null>(null);
  const valueRef = useRef(value);
  const lastRevision = useRef(revision);
  const composingRef = useRef(false);
  const correctingRef = useRef(false);
  const [autoCorrectMode, setAutoCorrectMode] = useState<AutoCorrectMode>(() => readAutoCorrectMode());
  valueRef.current = value;

  useEffect(() => {
    const sync = () => setAutoCorrectMode(readAutoCorrectMode());
    window.addEventListener(AUTO_CORRECT_MODE_EVENT, sync);
    return () => window.removeEventListener(AUTO_CORRECT_MODE_EVENT, sync);
  }, []);

  const applyValueToEditor = useCallback(
    (nextValue: string) => {
      const root = editorRef.current;
      if (!root) return;
      root.innerHTML = refsToEditorSpans(
        linkifyBibleCitationsInHtml(outlineContentToHtml(nextValue), 'all'),
      );
      lastEmitted.current = nextValue;
      releaseEditorSelection({ blur: false });
    },
    [],
  );

  const readEditorHtml = useCallback(() => {
    const root = editorRef.current;
    if (!root) return '';
    return normalizeEditorHtml(normalizeRichEditorHtml(root.innerHTML));
  }, []);

  const emitChange = useCallback(() => {
    const html = readEditorHtml();
    lastEmitted.current = html;
    onChange(html);
  }, [onChange, readEditorHtml]);

  const insertImageFiles = useCallback(
    async (files: File[]) => {
      const root = editorRef.current;
      if (!root || !onSaveImage || disabled) return;
      const images = files.filter((file) => file.type.startsWith('image/'));
      if (images.length === 0) return;
      captureEditorSelection({ allowCollapsed: true });
      for (const file of images) {
        const saved = await onSaveImage(file);
        if (!saved?.src) continue;
        const alt = (saved.alt || file.name || 'Imagem').replace(/[&<>"]/g, '');
        const src = saved.src.replace(/"/g, '');
        insertHtmlIntoRichEditor(
          root,
          `<figure class="jcs-imported-image"><img src="${src}" alt="${alt}"></figure><p><br></p>`,
        );
      }
      emitChange();
    },
    [disabled, emitChange, onSaveImage],
  );

  const runEditorAutoCorrect = useCallback(async () => {
    if (disabled || autoCorrectMode === 'off' || composingRef.current || correctingRef.current) return;
    const root = editorRef.current;
    if (!root) return;
    const found = wordBeforeCaretInEditor(root);
    if (!found || found.word.length < 2) return;
    correctingRef.current = true;
    try {
      const snapshot = found.range.cloneRange();
      const word = found.word;
      const suffix = found.suffix;
      const replacement = await requestAutoCorrect(word, autoCorrectMode);
      if (!replacement || !sameVisibleText(snapshot.toString(), `${word}${suffix}`)) return;
      replaceRangeWithText(snapshot, `${replacement}${suffix}`);
      emitChange();
    } finally {
      correctingRef.current = false;
    }
  }, [autoCorrectMode, disabled, emitChange]);

  const handleAutoCorrectKeyUp = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === ' ' || event.key === 'Enter' || event.key === 'Tab' || /^[.,;:!?)]$/.test(event.key)) {
        void runEditorAutoCorrect();
      }
    },
    [runEditorAutoCorrect],
  );

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
    const revisionChanged = lastRevision.current !== revision;
    lastRevision.current = revision;
    if (revisionChanged && revision > 0) {
      window.setTimeout(() => releaseEditorSelection(), 0);
    }
  }, [applyValueToEditor, revision]);

  const runAndEmit = useCallback(
    (action: () => void) => {
      if (disabled) return;
      restoreEditorSelection();
      editorRef.current?.focus();
      restoreEditorSelection();
      action();
      emitChange();
    },
    [disabled, emitChange],
  );

  const handleInput = () => {
    emitChange();
  };

  const handleBlur = () => {
    void runEditorAutoCorrect().finally(() => emitChange());
  };

  const handleEditorMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          '.jcs-bible-ref, .jcs-song-ref, .jcs-pub-ref, a.jcs-page-jump, a.jcs-page-hotspot',
        )
      ) {
        return;
      }
      const root = editorRef.current;
      if (!root) return;
      activateRichEditorForInput(root, event.nativeEvent);
    },
    [],
  );

  const handleEditorPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const root = editorRef.current;
      if (!root) return;
      const images = [
        ...event.clipboardData.files,
        ...[...event.clipboardData.items]
          .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
          .map((item) => item.getAsFile())
          .filter((file): file is File => Boolean(file)),
      ].filter((file) => file.type.startsWith('image/'));
      const uniqueImages = [...new Map(images.map((file) => [`${file.name}:${file.size}:${file.type}`, file])).values()];
      if (uniqueImages.length > 0 && onSaveImage) {
        event.preventDefault();
        void insertImageFiles(uniqueImages);
        return;
      }
      const text = event.clipboardData.getData('text/plain');
      if (!text) return;
      event.preventDefault();
      pastePlainTextIntoRichEditor(root, text);
      emitChange();
    },
    [disabled, emitChange, insertImageFiles, onSaveImage],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      const jump = target?.closest('a.jcs-page-jump');
      if (jump) {
        event.preventDefault();
        event.stopPropagation();
        scrollToJcsPageJump(editorRef.current, jump.getAttribute('data-href') || jump.getAttribute('href'));
        return;
      }
      const ref = target?.closest('.jcs-bible-ref, .jcs-song-ref, .jcs-pub-ref');
      if (!ref) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && editorRef.current?.contains(selection.anchorNode)) {
        return;
      }
      event.preventDefault();
      const href = ref.getAttribute('data-href');
      const label = ref.getAttribute('data-label') ?? ref.textContent?.trim() ?? '';
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
          onInsertImage={
            onSaveImage
              ? () => {
                  captureEditorSelection({ allowCollapsed: true });
                  imageInputRef.current?.click();
                }
              : undefined
          }
          autoCorrectMode={autoCorrectMode}
          onAutoCorrectModeChange={setAutoCorrectMode}
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
        onMouseDown={handleEditorMouseDown}
        onPaste={handleEditorPaste}
        onDragOver={(event) => {
          if (!onSaveImage || disabled) return;
          if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!onSaveImage || disabled) return;
          const images = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
          if (images.length === 0) return;
          event.preventDefault();
          void insertImageFiles(images);
        }}
        onKeyUp={handleAutoCorrectKeyUp}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={[
          'jcs-rich-editor min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 text-sm leading-relaxed text-jw-text outline-none',
          'empty:before:pointer-events-none empty:before:text-jw-muted empty:before:content-[attr(data-placeholder)]',
          '[&_.jcs-bible-ref]:cursor-pointer [&_.jcs-bible-ref]:font-medium [&_.jcs-bible-ref]:text-jw-purple [&_.jcs-bible-ref]:underline',
          '[&_.jcs-song-ref]:cursor-pointer [&_.jcs-song-ref]:font-medium [&_.jcs-song-ref]:text-jw-purple [&_.jcs-song-ref]:underline',
          '[&_.jcs-pub-ref]:cursor-pointer [&_.jcs-pub-ref]:font-medium [&_.jcs-pub-ref]:text-jw-purple [&_.jcs-pub-ref]:underline',
          '[&_a.jcs-page-jump]:cursor-pointer',
        ].join(' ')}
      />
      {onSaveImage ? (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.length) void insertImageFiles(files);
          }}
        />
      ) : null}
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
  const composingRef = useRef(false);
  const correctingRef = useRef(false);
  const selectionActions = useSelectionActions();
  const [lookupMenu, setLookupMenu] = useState<LookupMenuState>(CLOSED_LOOKUP_MENU);
  const [autoCorrectMode, setAutoCorrectMode] = useState<AutoCorrectMode>(() => readAutoCorrectMode());
  const linkedHtml = useMemo(() => linkifyJcsReadRefsInPlainText(value, 'all'), [value]);

  useEffect(() => {
    const sync = () => setAutoCorrectMode(readAutoCorrectMode());
    window.addEventListener(AUTO_CORRECT_MODE_EVENT, sync);
    return () => window.removeEventListener(AUTO_CORRECT_MODE_EVENT, sync);
  }, []);

  const runTextareaAutoCorrect = useCallback(async () => {
    if (disabled || autoCorrectMode === 'off' || composingRef.current || correctingRef.current) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const found = wordBeforeCaretInTextarea(textarea);
    if (!found || found.word.length < 2) return;
    correctingRef.current = true;
    try {
      const replacement = await requestAutoCorrect(found.word, autoCorrectMode);
      if (!replacement) return;
      const current = textarea.value.slice(found.start, found.end);
      if (current !== found.word) return;
      const afterWord = textarea.value.slice(found.end, found.end + found.suffix.length);
      if (afterWord !== found.suffix) return;
      const nextValue = `${textarea.value.slice(0, found.start)}${replacement}${textarea.value.slice(found.end)}`;
      const caret = found.start + replacement.length + found.suffix.length;
      onChange(nextValue);
      window.requestAnimationFrame(() => {
        textarea.setSelectionRange(caret, caret);
      });
    } finally {
      correctingRef.current = false;
    }
  }, [autoCorrectMode, disabled, onChange]);

  const syncScroll = () => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
  };

  const handleMirrorClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a.jcs-bible-ref, a.jcs-song-ref, a.jcs-pub-ref');
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
        onBlur={() => {
          void runTextareaAutoCorrect();
        }}
        onKeyUp={(event) => {
          if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key === ' ' || event.key === 'Enter' || event.key === 'Tab' || /^[.,;:!?)]$/.test(event.key)) {
            void runTextareaAutoCorrect();
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
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
          const anchor = (event.target as HTMLElement | null)?.closest('a.jcs-bible-ref, a.jcs-song-ref, a.jcs-pub-ref');
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
          className="pointer-events-none min-h-full [&_a.jcs-bible-ref]:pointer-events-auto [&_a.jcs-bible-ref]:cursor-pointer [&_a.jcs-song-ref]:pointer-events-auto [&_a.jcs-song-ref]:cursor-pointer [&_a.jcs-pub-ref]:pointer-events-auto [&_a.jcs-pub-ref]:cursor-pointer"
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
