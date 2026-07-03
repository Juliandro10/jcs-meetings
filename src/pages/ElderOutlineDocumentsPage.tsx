import { useEffect, useState } from 'react';
import { IconChevronLeft } from '@/components/Icons';
import type { ElderOutlineDocument } from '../../electron/types';

type ElderOutlineDocumentsPageProps = {
  pub: string;
  title: string;
  label: string;
  backLabel?: string;
  loadingLabel?: string;
  errorFallback?: string;
  skipCoverWhenMulti?: boolean;
  onBack: () => void;
  onOpenDocument: (documentId: number, title: string) => void;
};

export function ElderOutlineDocumentsPage({
  pub,
  title,
  label,
  backLabel = 'Esboços',
  loadingLabel = 'Carregando esboços…',
  errorFallback = 'Não foi possível carregar os esboços.',
  skipCoverWhenMulti = false,
  onBack,
  onOpenDocument,
}: ElderOutlineDocumentsPageProps) {
  const [documents, setDocuments] = useState<ElderOutlineDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!window.jcs?.listElderOutlineDocuments) {
        setError('Disponível apenas no app Electron.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      const result = await window.jcs.listElderOutlineDocuments({ pub });
      if (!result.ok || !result.documents) {
        setError(result.error ?? errorFallback);
        setDocuments([]);
      } else {
        const loaded = result.documents;
        const visible =
          skipCoverWhenMulti && loaded.length > 1
            ? loaded.filter((doc) => doc.documentId !== 0)
            : loaded;
        setDocuments(visible.length > 0 ? visible : loaded);
      }
      setLoading(false);
    }

    void load();
  }, [pub, errorFallback, skipCoverWhenMulti]);

  return (
    <div className="px-6 py-4">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          <IconChevronLeft className="h-4 w-4" />
          {backLabel}
        </button>

        <header className="mb-6 border-b border-jw-border pb-4">
          <h2 className="text-2xl font-semibold text-jw-text">{title}</h2>
          <p className="mt-1 text-sm text-jw-muted">{label}</p>
        </header>

        {loading ? <p className="text-sm text-jw-muted">{loadingLabel}</p> : null}
        {error ? (
          <p className="rounded-lg border border-jw-border bg-jw-surface px-4 py-3 text-sm text-jw-muted">{error}</p>
        ) : null}

        {!loading && !error ? (
          <ul className="overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-sm">
            {documents.map((doc, index) => (
              <li key={doc.documentId}>
                <button
                  type="button"
                  onClick={() => onOpenDocument(doc.documentId, doc.title)}
                  className="flex w-full items-center px-4 py-3.5 text-left text-[15px] text-jw-text transition hover:bg-jw-purple-light/40"
                >
                  {doc.title}
                </button>
                {index < documents.length - 1 ? (
                  <div className="ml-4 border-b border-jw-border" />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
