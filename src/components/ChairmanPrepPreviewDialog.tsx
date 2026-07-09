type ChairmanPrepPreviewDialogProps = {
  html: string;
  weekLabel: string;
  onClose: () => void;
};

export function ChairmanPrepPreviewDialog({
  html,
  weekLabel,
  onClose,
}: ChairmanPrepPreviewDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chairman-prep-preview-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-jw-border bg-jw-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-jw-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="chairman-prep-preview-title" className="text-base font-semibold text-jw-text">
              Visualizar folha — {weekLabel}
            </h2>
            <p className="mt-1 text-xs text-jw-muted">
              Prévia do PDF exportado. Feche para voltar e continuar editando.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-muted hover:border-jw-purple hover:text-jw-text"
          >
            Fechar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#e8ecf1] p-4 dark:bg-[#0f1829]">
          <iframe
            title={`Prévia da folha — ${weekLabel}`}
            srcDoc={html}
            className="mx-auto min-h-[70vh] w-full max-w-[820px] rounded-lg border border-black/10 bg-white shadow-lg"
            sandbox="allow-scripts"
          />
        </div>

        <div className="flex justify-end border-t border-jw-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark"
          >
            Voltar para editar
          </button>
        </div>
      </div>
    </div>
  );
}
