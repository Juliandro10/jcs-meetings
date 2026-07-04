import { useCallback, useEffect, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconMeetings } from '@/components/Icons';
import type { ElderMeetingRecord } from '../../electron/types';

type ElderMeetingsPageProps = {
  onBack: () => void;
  onOpenMeeting: (id: string) => void;
  onCreateMeeting: () => Promise<string | null>;
};

function formatListDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ElderMeetingsPage({ onBack, onOpenMeeting, onCreateMeeting }: ElderMeetingsPageProps) {
  const [items, setItems] = useState<ElderMeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.jcs?.listElderMeetings) {
      setLoading(false);
      return;
    }
    const result = await window.jcs.listElderMeetings();
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
      const id = await onCreateMeeting();
      if (id) onOpenMeeting(id);
      else setMessage('Não foi possível criar a reunião.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.jcs?.deleteElderMeeting) return;
    const ok = window.confirm(`Excluir "${title}"? Esta ação não pode ser desfeita.`);
    if (!ok) return;

    setDeletingId(id);
    setMessage(null);
    try {
      const result = await window.jcs.deleteElderMeeting(id);
      if (!result.ok) {
        setMessage(result.error ?? 'Não foi possível excluir.');
        return;
      }
      await refresh();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="px-6 py-4">
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
            <h1 className="text-xl font-semibold text-jw-text">Reuniões de anciãos</h1>
            <p className="mt-1 text-sm text-jw-muted">
              Importe a pauta, registre deliberações durante a reunião e exporte a ATA.
            </p>
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreate()}
            className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
          >
            {creating ? 'Criando…' : 'Nova reunião'}
          </button>
        </div>

        {message ? (
          <p className="mt-4 rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-muted">
            {message}
          </p>
        ) : null}

        <section className="mt-6">
          {loading ? (
            <p className="text-sm text-jw-muted">Carregando reuniões…</p>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-jw-border bg-jw-surface px-6 py-10 text-center">
              <IconMeetings className="mx-auto h-10 w-10 text-jw-muted" />
              <p className="mt-3 text-sm font-medium text-jw-text">Nenhuma reunião registrada</p>
              <p className="mt-1 text-sm text-jw-muted">
                Crie uma reunião, importe a pauta e anote as deliberações item a item.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-jw-border overflow-hidden rounded-xl border border-jw-border bg-jw-surface">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onOpenMeeting(item.id)}
                    className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-jw-purple-light text-jw-purple">
                      <IconMeetings className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-jw-text group-hover:text-jw-purple">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-jw-muted">
                        {formatListDate(item.meetingDate)}
                        {item.items.length ? ` · ${item.items.length} item(ns) de pauta` : ''}
                        {item.ataHtml.trim() ? ' · ATA gerada' : ''}
                      </span>
                    </span>
                    <IconChevronRight className="h-5 w-5 shrink-0 text-jw-muted group-hover:text-jw-purple" />
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === item.id}
                    onClick={() => void handleDelete(item.id, item.title)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs text-jw-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    {deletingId === item.id ? '…' : 'Excluir'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
