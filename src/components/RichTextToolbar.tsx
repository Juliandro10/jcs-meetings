import { AutoCorrectModeSelect } from '@/components/AutoCorrectModeSelect';
import type { RichFontFamily, RichFontSize, RichHighlightColor } from '@/lib/rich-text-commands';
import { captureEditorSelection, RICH_FONT_SIZES } from '@/lib/rich-text-commands';
import type { AutoCorrectMode } from '../../electron/types';

type RichTextToolbarProps = {
  disabled?: boolean;
  embedded?: boolean;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onHighlight: (color: RichHighlightColor) => void;
  onClearHighlight: () => void;
  onFontFamily: (family: RichFontFamily) => void;
  onFontSize: (size: RichFontSize) => void;
  onClearFormat: () => void;
  autoCorrectMode?: AutoCorrectMode;
  onAutoCorrectModeChange?: (mode: AutoCorrectMode) => void;
};

const HIGHLIGHTS: { id: RichHighlightColor; className: string; label: string }[] = [
  { id: 'yellow', className: 'bg-[#fef08a]', label: 'Amarelo' },
  { id: 'green', className: 'bg-[#bbf7d0]', label: 'Verde' },
  { id: 'blue', className: 'bg-[#bfdbfe]', label: 'Azul' },
  { id: 'pink', className: 'bg-[#fbcfe8]', label: 'Rosa' },
];

export function RichTextToolbar({
  disabled,
  embedded = false,
  onBold,
  onItalic,
  onUnderline,
  onHighlight,
  onClearHighlight,
  onFontFamily,
  onFontSize,
  onClearFormat,
  autoCorrectMode,
  onAutoCorrectModeChange,
}: RichTextToolbarProps) {
  return (
    <div
      className={
        embedded
          ? 'flex flex-wrap items-center gap-1'
          : 'mb-2 flex shrink-0 flex-wrap items-center gap-1 rounded-lg border border-jw-border bg-[#ececea] px-2 py-1.5'
      }
    >
      <ToolButton disabled={disabled} title="Negrito" onClick={onBold}>
        <strong>B</strong>
      </ToolButton>
      <ToolButton disabled={disabled} title="Itálico" onClick={onItalic}>
        <em>I</em>
      </ToolButton>
      <ToolButton disabled={disabled} title="Sublinhado" onClick={onUnderline}>
        <span className="underline">U</span>
      </ToolButton>

      <Divider />

      {HIGHLIGHTS.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          title={`Grifar ${item.label}`}
          onMouseDown={(event) => {
            event.preventDefault();
            captureEditorSelection();
          }}
          onClick={() => onHighlight(item.id)}
          className={[
            'h-7 w-7 rounded-md border border-jw-border/70 transition hover:scale-105 disabled:opacity-40',
            item.className,
          ].join(' ')}
        />
      ))}
      <ToolButton disabled={disabled} title="Remover grifo" onClick={onClearHighlight}>
        ✕
      </ToolButton>

      <Divider />

      <select
        disabled={disabled}
        defaultValue="Segoe UI"
        onMouseDown={() => captureEditorSelection()}
        onChange={(event) => onFontFamily(event.target.value as RichFontFamily)}
        className="max-w-[9rem] rounded-md border border-jw-border bg-jw-surface px-2 py-1 text-xs text-jw-text outline-none focus:border-jw-purple"
        title="Fonte"
      >
        <option value="Segoe UI">Segoe UI</option>
        <option value="Georgia">Georgia</option>
        <option value="Arial">Arial</option>
        <option value="Courier New">Courier</option>
      </select>

      <select
        disabled={disabled}
        defaultValue="14"
        onMouseDown={() => captureEditorSelection()}
        onChange={(event) => onFontSize(Number(event.target.value) as RichFontSize)}
        className="rounded-md border border-jw-border bg-jw-surface px-2 py-1 text-xs text-jw-text outline-none focus:border-jw-purple"
        title="Tamanho da letra"
      >
        {RICH_FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size} px
          </option>
        ))}
      </select>

      <Divider />

      <ToolButton disabled={disabled} title="Limpar formatação" onClick={onClearFormat}>
        Limpar
      </ToolButton>
      {onAutoCorrectModeChange ? (
        <>
          <Divider />
          <AutoCorrectModeSelect
            compact
            disabled={disabled}
            value={autoCorrectMode ?? 'accents'}
            onChange={onAutoCorrectModeChange}
          />
        </>
      ) : null}
    </div>
  );
}

function ToolButton({
  disabled,
  title,
  onClick,
  children,
}: {
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onMouseDown={(event) => {
        event.preventDefault();
        captureEditorSelection();
      }}
      onClick={onClick}
      className="min-w-[2rem] rounded-md px-2 py-1 text-sm text-jw-text hover:bg-jw-surface disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-6 w-px bg-jw-border" />;
}
