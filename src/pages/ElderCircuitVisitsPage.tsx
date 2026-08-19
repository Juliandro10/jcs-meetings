import { useCallback, useEffect, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconDiamond } from '@/components/Icons';
import type { CircuitVisitRecord } from '../../electron/types';

type ElderCircuitVisitsPageProps = {
  onBack: () => void;
  onOpenVisit: (id: string) => void;
  onCreateVisit: () => Promise<string | null>;
};

function formatListDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ElderCircuitVisitsPage({
  onBack,
  onOpenVisit,
  onCreateVisit,
}: ElderCircuitVisitsPageProps) {
  const [items, setItems] = useState<CircuitVisitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.jcs?.listCircuitVisits) {
      setLoading(false);
      return;
    }
    const result = await window.jcs.listCircuitVisits();
    setItems(result.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const id = await onCreateVisit();
      if (id) onOpenVisit(id);
      else setMessage('Não foi possível criar a visita.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.jcs?.deleteCircuitVisit) return;
    if (!window.confirm(`Excluir "${title}"? Esta ação não pode ser desfeita.`)) return;

    setDeletingId(id);
    try {
      const result = await window.jcs.deleteCircuitVisit(id);
      if (!result.ok) setMessage(result.error ?? 'Não foi possível excluir.');
      else await refresh();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-auto px-6 py-4">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          <IconChevronLeft className="h-4 w-4" />
          Elder
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-jw-text">Visita do superintendente</h1>
            <p className="mt-1 text-sm text-jw-muted">
              Importe o Hourglass, corrija inconsistências e exporte S-21, S-88 e resumo para pendrive.
            </p>
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreate()}
            className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
          >
            {creating ? 'Criando…' : 'Nova visita'}
          </button>
        </div>

        {message ? (
          <p className="mt-4 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
            {message}
          </p>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-sm">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-jw-muted">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-jw-muted">
              Nenhuma visita preparada. Crie uma nova para importar o export JSON do Hourglass.
            </p>
          ) : (
            <ul className="divide-y divide-jw-border">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-jw-purple-light text-jw-purple">
                    <IconDiamond className="h-5 w-5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenVisit(item.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-medium text-jw-text">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-jw-muted">
                      {formatListDate(item.visitDate)}
                      {item.congregation ? ` · ${item.congregation}` : ''}
                      {item.hourglassData ? ' · dados importados' : ' · sem dados'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === item.id}
                    onClick={() => void handleDelete(item.id, item.title)}
                    className="rounded-lg px-2 py-1 text-xs text-jw-muted hover:bg-jw-bg hover:text-red-600"
                  >
                    Excluir
                  </button>
                  <IconChevronRight className="h-5 w-5 shrink-0 text-jw-muted" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
