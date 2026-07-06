import { useCallback, useEffect, useState } from 'react';

import { IconOutlineDocument } from '@/components/Icons';

import { TalkThemeCardModal } from '@/components/TalkThemeCardModal';

import type { PreparedElderOutline } from '../../electron/types';



type ElderPreparedOutlinesPanelProps = {

  onOpenPrepared: (item: PreparedElderOutline) => void;

};



function formatUpdatedAt(iso: string) {

  try {

    return new Intl.DateTimeFormat('pt-BR', {

      day: '2-digit',

      month: 'short',

      year: 'numeric',

      hour: '2-digit',

      minute: '2-digit',

    }).format(new Date(iso));

  } catch {

    return '';

  }

}



export function ElderPreparedOutlinesPanel({ onOpenPrepared }: ElderPreparedOutlinesPanelProps) {

  const [items, setItems] = useState<PreparedElderOutline[]>([]);

  const [loading, setLoading] = useState(true);

  const [cardOutline, setCardOutline] = useState<PreparedElderOutline | null>(null);



  const refresh = useCallback(async () => {

    if (!window.jcs?.listPreparedElderOutlines) {

      setLoading(false);

      return;

    }

    const result = await window.jcs.listPreparedElderOutlines();

    setItems(result.items ?? []);

    setLoading(false);

  }, []);



  useEffect(() => {

    void refresh();

  }, [refresh]);



  const handleDelete = async (item: PreparedElderOutline, event: React.MouseEvent) => {

    event.stopPropagation();

    if (!window.jcs?.deletePreparedElderOutline) return;

    if (!window.confirm(`Excluir "${item.name}"?`)) return;

    await window.jcs.deletePreparedElderOutline(item.id);

    await refresh();

  };



  if (loading) {

    return <p className="text-sm text-jw-muted">Carregando esboços preparados…</p>;

  }



  if (items.length === 0) {

    return (

      <div className="rounded-xl border border-dashed border-jw-border bg-jw-surface/60 px-6 py-10 text-center">

        <p className="text-sm text-jw-muted">

          Nenhum esboço preparado ainda. Edite um esboço do catálogo e use <strong>Salvar</strong> para

          guardá-lo aqui.

        </p>

      </div>

    );

  }



  return (

    <>

      <ul className="overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-sm">

        {items.map((item, index) => (

          <li key={item.id}>

            <div className="flex w-full items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3.5">

              <button

                type="button"

                onClick={() => onOpenPrepared(item)}

                className="flex min-w-0 flex-1 items-center gap-4 text-left transition hover:opacity-90"

              >

                <span className="flex h-10 w-10 shrink-0 items-center justify-center text-jw-purple">

                  <IconOutlineDocument className="h-8 w-8" />

                </span>

                <span className="min-w-0 flex-1">

                  <span className="block truncate text-[15px] font-medium leading-snug text-jw-text">

                    {item.name}

                  </span>

                  <span className="mt-0.5 block truncate text-sm text-jw-muted">{item.sourceTitle}</span>

                  <span className="mt-0.5 block text-xs text-jw-muted">

                    {item.sourcePubLabel} · atualizado {formatUpdatedAt(item.updatedAt)}

                  </span>

                </span>

              </button>

              <button

                type="button"

                onClick={() => setCardOutline(item)}

                className="shrink-0 rounded-lg border border-jw-border px-2.5 py-1.5 text-xs font-medium text-jw-purple hover:border-jw-purple hover:bg-jw-purple-light/40"

                title="Gerar cartão HTML para a congregação visitada"

              >

                Cartão

              </button>

              <button

                type="button"

                onClick={(event) => void handleDelete(item, event)}

                className="shrink-0 rounded-lg px-2 py-1 text-xs text-jw-muted hover:bg-jw-bg hover:text-red-600"

                title="Excluir"

              >

                Excluir

              </button>

            </div>

            {index < items.length - 1 ? <div className="ml-[4.25rem] border-b border-jw-border" /> : null}

          </li>

        ))}

      </ul>



      {cardOutline ? (

        <TalkThemeCardModal outline={cardOutline} onClose={() => setCardOutline(null)} />

      ) : null}

    </>

  );

}


