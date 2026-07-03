import { useCallback, useEffect, useMemo, useRef } from 'react';
import { linkifyBibleCitationsHtml } from '@/lib/bible-citation';
import { RichTextToolbar } from '@/components/RichTextToolbar';
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

type BibleLinkedEditorProps = {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  fillHeight?: boolean;
  /** Barra de formatação (negrito, grifo, fontes). */
  richText?: boolean;
  onChange: (value: string) => void;
  onBibleLinkClick: (href: string, label: string) => void;
};

export function BibleLinkedEditor({
  value,
  disabled,
  placeholder,
  fillHeight = false,
  richText = false,
  onChange,
  onBibleLinkClick,
}: BibleLinkedEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  /** null = ainda não sincronizou o DOM com value (evita pular a carga inicial). */
  const lastEmitted = useRef<string | null>(null);

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
    applyValueToEditor(value);
  }, [applyValueToEditor, value]);

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
    <div className={boxClass}>
      <RichTextToolbar
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
        className={[
          'jcs-rich-editor min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-jw-text outline-none',
          'empty:before:pointer-events-none empty:before:text-jw-muted empty:before:content-[attr(data-placeholder)]',
          '[&_a.jcs-bible-ref]:cursor-pointer [&_a.jcs-bible-ref]:font-medium [&_a.jcs-bible-ref]:text-jw-purple [&_a.jcs-bible-ref]:underline',
        ].join(' ')}
      />
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
    </div>
  );
}
