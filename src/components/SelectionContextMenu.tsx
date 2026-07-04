import { hasReaderContextActions, isValidDictionaryQuery, isValidSearchQuery } from '../../shared/selection-text';

type SelectionContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  text: string;
  onSearch: (text: string) => void;
  onDictionary: (text: string) => void;
  onClose: () => void;
};

export function SelectionContextMenu({
  open,
  x,
  y,
  text,
  onSearch,
  onDictionary,
  onClose,
}: SelectionContextMenuProps) {
  if (!open || !hasReaderContextActions(text)) return null;

  const canSearch = isValidSearchQuery(text);
  const canDictionary = isValidDictionaryQuery(text);

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu"
        className="fixed inset-0 z-[65] cursor-default"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        className="fixed z-[66] min-w-[220px] overflow-hidden rounded-lg border border-jw-border bg-jw-surface py-1 shadow-xl"
        style={{ left: Math.max(12, x), top: Math.max(12, y) }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <button
          type="button"
          role="menuitem"
          disabled={!canSearch}
          onClick={() => {
            if (!canSearch) return;
            onSearch(text);
            onClose();
          }}
          className="block w-full px-4 py-2.5 text-left text-sm text-jw-text hover:bg-jw-bg disabled:cursor-not-allowed disabled:opacity-45"
        >
          Buscar nas publicações
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canDictionary}
          onClick={() => {
            if (!canDictionary) return;
            onDictionary(text);
            onClose();
          }}
          className="block w-full px-4 py-2.5 text-left text-sm text-jw-text hover:bg-jw-bg disabled:cursor-not-allowed disabled:opacity-45"
        >
          Consultar no dicionário
        </button>
      </div>
    </>
  );
}
