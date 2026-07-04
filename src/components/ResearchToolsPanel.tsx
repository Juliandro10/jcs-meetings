import { useCallback, useEffect, useState } from 'react';
import { IconChevronRight } from '@/components/Icons';
import { filterPerspicazVolumeDocuments } from '../../shared/research-publication-docs';
import type { ResearchPublicationItem } from '../../electron/types';
import type { TeachingKitReaderTarget } from '@/pages/TeachingKitPublicationReaderPage';

type ResearchToolsPanelProps = {
  onOpenPublication: (target: TeachingKitReaderTarget) => void;
};

export function ResearchToolsPanel({ onOpenPublication }: ResearchToolsPanelProps) {
  const [items, setItems] = useState<ResearchPublicationItem[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.jcs?.listResearchPublications) return;
    const result = await window.jcs.listResearchPublications();
    if (result.ok && result.items) setItems(result.items);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDownload = async (item: ResearchPublicationItem) => {
    if (!window.jcs?.downloadResearchPublication) return;
    setLoadingId(item.id);
    setMessage(null);
    try {
      const result = await window.jcs.downloadResearchPublication({
        pub: item.pub,
        issue: item.issue,
        lang: 'T',
      });
      if (!result.ok) {
        setMessage(result.error ?? `Não foi possível baixar ${item.title}.`);
        return;
      }
      await refresh();
    } finally {
      setLoadingId(null);
    }
  };

  const handleOpen = async (item: ResearchPublicationItem) => {
    if (!item.downloaded) {
      await handleDownload(item);
      const updated = await window.jcs?.listResearchPublications?.();
      const fresh = updated?.items?.find((entry) => entry.id === item.id);
      if (!fresh?.downloaded) return;
    }

    if (!window.jcs?.listPreachingPubDocuments) return;
    const docsResult = await window.jcs.listPreachingPubDocuments({
      pub: item.pub,
      issue: item.issue,
      lang: 'T',
    });
    if (!docsResult.ok || !docsResult.documents?.length) {
      setMessage('Publicação baixada, mas não foi possível abrir os documentos.');
      return;
    }

    let documents =
      docsResult.documents.length > 1
        ? docsResult.documents.filter((doc) => doc.documentId !== 0)
        : docsResult.documents;
    if (item.volume) {
      documents = filterPerspicazVolumeDocuments(docsResult.documents, item.volume);
    }
    if (documents.length === 0) {
      documents = docsResult.documents;
    }

    onOpenPublication({
      pub: item.pub,
      issue: item.issue,
      publicationTitle: item.title,
      subtitle: item.subtitle,
      documents,
      documentIndex: 0,
    });
  };

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-sm divide-y divide-jw-border">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-jw-text">
              {item.title}
              {item.primary ? (
                <span className="ml-2 rounded-full bg-jw-purple-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-jw-purple">
                  Principal
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-jw-muted">{item.subtitle}</p>
            <p className="mt-1 text-[11px] text-jw-muted">
              {item.downloaded ? 'Baixado' : 'Não baixado — toque em Baixar ou Abrir'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!item.downloaded ? (
              <button
                type="button"
                disabled={loadingId === item.id}
                onClick={() => void handleDownload(item)}
                className="rounded-lg border border-jw-border px-3 py-1.5 text-xs font-medium text-jw-text hover:border-jw-purple disabled:opacity-50"
              >
                {loadingId === item.id ? 'Baixando…' : 'Baixar'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={loadingId === item.id}
              onClick={() => void handleOpen(item)}
              className="flex items-center gap-1 rounded-lg bg-jw-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-jw-purple-dark disabled:opacity-50"
            >
              Abrir
              <IconChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}

      {message ? (
        <p className="border-t border-jw-border px-4 py-3 text-sm text-amber-800">{message}</p>
      ) : null}
    </div>
  );
}
