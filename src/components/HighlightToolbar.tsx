import { HIGHLIGHT_COLORS, type HighlightColorId } from '@/lib/highlight-dom';

type HighlightToolbarProps = {
  open: boolean;
  x: number;
  y: number;
  onPickColor: (color: HighlightColorId) => void;
  onAddNote?: () => void;
  onSearchSelection?: (text: string) => void;
  onDictionarySelection?: (text: string) => void;
  onClose: () => void;
};

export function HighlightToolbar({
  open,
  x,
  y,
  onPickColor,
  onAddNote,
  onSearchSelection,
  onDictionarySelection,
  onClose,
}: HighlightToolbarProps) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Fechar marca-texto"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div
        className="fixed z-50 flex items-center gap-1 rounded-full border border-jw-border bg-[#2b2b2b] px-2 py-1.5 shadow-lg"
        style={{ left: Math.max(12, x - 120), top: Math.max(12, y - 48) }}
        onMouseDown={(event) => event.preventDefault()}
      >
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            aria-label={color.label}
            title={color.label}
            onClick={() => onPickColor(color.id)}
            className="h-7 w-7 rounded-full border border-white/20 transition hover:scale-110"
            style={{ backgroundColor: color.swatch }}
          />
        ))}
        {onAddNote ? (
          <button
            type="button"
            aria-label="Adicionar nota"
            title="Adicionar nota"
            onClick={onAddNote}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md border border-white/20 text-sm text-white hover:bg-white/10"
          >
            +
          </button>
        ) : null}
        {onSearchSelection ? (
          <button
            type="button"
            aria-label="Buscar seleção"
            title="Buscar nas publicações"
            onClick={() => {
              const text = window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '';
              if (text.length >= 2) onSearchSelection(text);
            }}
            className="ml-1 rounded-md border border-white/20 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/10"
          >
            Buscar
          </button>
        ) : null}
        {onDictionarySelection ? (
          <button
            type="button"
            aria-label="Consultar dicionário"
            title="Consultar no dicionário"
            onClick={() => {
              const text = window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '';
              if (text.length >= 2) onDictionarySelection(text);
            }}
            className="ml-1 rounded-md border border-white/20 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/10"
          >
            Dicionário
          </button>
        ) : null}
      </div>
    </>
  );
}
