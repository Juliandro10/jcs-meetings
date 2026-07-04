import { useCallback, useState } from 'react';
import type { ElderMeetingAgendaItem, ImportElderMeetingPautaResult } from '../../electron/types';

type ElderMeetingPautaReviewDialogProps = {
  fileName: string;
  items: ElderMeetingAgendaItem[];
  openingPrayer: string;
  closingPrayer: string;
  rawText?: string;
  parseMethodLabel?: string;
  usedAi?: boolean;
  replaceMode: boolean;
  onReplaceModeChange: (replace: boolean) => void;
  onConfirm: (payload: {
    items: ElderMeetingAgendaItem[];
    openingPrayer: string;
    closingPrayer: string;
  }) => void;
  onCancel: () => void;
  onReorganizeWithAi?: (rawText: string) => Promise<ImportElderMeetingPautaResult>;
};

function newItem(): ElderMeetingAgendaItem {
  return { id: crypto.randomUUID(), title: '', notes: '' };
}

export function ElderMeetingPautaReviewDialog({
  fileName,
  items: initialItems,
  openingPrayer: initialOpening,
  closingPrayer: initialClosing,
  rawText,
  parseMethodLabel,
  usedAi,
  replaceMode,
  onReplaceModeChange,
  onConfirm,
  onCancel,
  onReorganizeWithAi,
}: ElderMeetingPautaReviewDialogProps) {
  const [items, setItems] = useState(initialItems);
  const [openingPrayer, setOpeningPrayer] = useState(initialOpening);
  const [closingPrayer, setClosingPrayer] = useState(initialClosing);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const patchItem = useCallback((id: string, patch: Partial<ElderMeetingAgendaItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleAi = async () => {
    if (!onReorganizeWithAi || !rawText?.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await onReorganizeWithAi(rawText);
      if (!result.ok || !result.items?.length) {
        setAiError(result.error ?? 'A IA não conseguiu reorganizar a pauta.');
        return;
      }
      setItems(result.items);
      setOpeningPrayer(result.openingPrayer ?? '');
      setClosingPrayer(result.closingPrayer ?? '');
    } finally {
      setAiBusy(false);
    }
  };

  const canConfirm = items.some((item) => item.title.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-labelledby="pauta-review-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-xl"
      >
        <div className="border-b border-jw-border px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="pauta-review-title" className="text-base font-semibold text-jw-text">
                Revisar pauta
              </h2>
              <p className="mt-1 text-sm text-jw-muted">{fileName}</p>
            </div>
            {parseMethodLabel ? (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  usedAi
                    ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
                    : 'bg-jw-bg text-jw-muted'
                }`}
              >
                {parseMethodLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-jw-muted">
              Oração inicial
              <input
                type="text"
                value={openingPrayer}
                onChange={(e) => setOpeningPrayer(e.target.value)}
                placeholder="Irmão designado"
                className="rounded-lg border border-jw-border bg-jw-bg px-2.5 py-2 text-sm text-jw-text"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-jw-muted">
              Oração final
              <input
                type="text"
                value={closingPrayer}
                onChange={(e) => setClosingPrayer(e.target.value)}
                placeholder="Irmão designado"
                className="rounded-lg border border-jw-border bg-jw-bg px-2.5 py-2 text-sm text-jw-text"
              />
            </label>
          </div>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-jw-muted">
              {items.length} assunto(s)
            </p>
            <div className="flex flex-wrap gap-2">
              {onReorganizeWithAi && rawText?.trim() ? (
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => void handleAi()}
                  className="rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40"
                >
                  {aiBusy ? 'Organizando…' : 'Organizar com IA'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, newItem()])}
                className="rounded-lg border border-jw-border px-3 py-1.5 text-xs text-jw-text hover:border-jw-purple"
              >
                + Assunto
              </button>
            </div>
          </div>

          {aiError ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {aiError}
            </p>
          ) : null}

          <ol className="space-y-2">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-lg border border-jw-border bg-jw-bg px-3 py-2"
              >
                <span className="mt-2 shrink-0 text-sm font-semibold text-jw-muted">{index + 1}.</span>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => patchItem(item.id, { title: e.target.value })}
                  placeholder="Assunto da pauta"
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1.5 text-sm text-jw-text focus:border-jw-purple focus:outline-none"
                />
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                    className="rounded px-1.5 py-0.5 text-xs text-jw-muted hover:bg-jw-surface disabled:opacity-30"
                    title="Subir"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                    className="rounded px-1.5 py-0.5 text-xs text-jw-muted hover:bg-jw-surface disabled:opacity-30"
                    title="Descer"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="mt-1 shrink-0 rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  title="Remover"
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>

          {items.length === 0 ? (
            <p className="mt-3 text-sm text-jw-muted">Adicione pelo menos um assunto para importar.</p>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-jw-border px-5 py-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-jw-border px-3 py-2">
              <input
                type="radio"
                checked={replaceMode}
                onChange={() => onReplaceModeChange(true)}
                className="text-jw-purple focus:ring-jw-purple"
              />
              Substituir pauta atual
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-jw-border px-3 py-2">
              <input
                type="radio"
                checked={!replaceMode}
                onChange={() => onReplaceModeChange(false)}
                className="text-jw-purple focus:ring-jw-purple"
              />
              Adicionar ao final
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-muted hover:border-jw-purple hover:text-jw-text"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={() =>
                onConfirm({
                  items: items.filter((item) => item.title.trim()),
                  openingPrayer: openingPrayer.trim(),
                  closingPrayer: closingPrayer.trim(),
                })
              }
              className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
            >
              Importar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
