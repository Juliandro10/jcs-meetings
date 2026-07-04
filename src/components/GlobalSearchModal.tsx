import { useCallback, useEffect, useRef, useState } from 'react';
import { IconSearch } from '@/components/Icons';
import type { GlobalSearchHit } from '../../electron/types';
import type { TeachingKitReaderTarget } from '@/pages/TeachingKitPublicationReaderPage';

type GlobalSearchModalProps = {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onOpenResult: (target: TeachingKitReaderTarget) => void;
};

export function GlobalSearchModal({ open, initialQuery = '', onClose, onOpenResult }: GlobalSearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSeqRef = useRef(0);
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GlobalSearchHit[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setResults([]);
    setError(null);
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open, initialQuery]);

  const runSearch = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    if (!window.jcs?.globalSearch) {
      setError('Busca disponível apenas no app Electron.');
      return;
    }

    const seq = ++searchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await window.jcs.globalSearch({ query: trimmed, limit: 48 });
      if (seq !== searchSeqRef.current) return;
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível buscar.');
        setResults([]);
        return;
      }
      setResults(result.results ?? []);
    } finally {
      if (seq === searchSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void runSearch(query);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, query, runSearch]);

  const openHit = async (hit: GlobalSearchHit) => {
    if (!window.jcs?.listPreachingPubDocuments) return;

    const docsResult = await window.jcs.listPreachingPubDocuments({
      pub: hit.pub,
      issue: hit.issue,
      lang: 'T',
    });
    if (!docsResult.ok || !docsResult.documents?.length) {
      setError('Publicação não encontrada no cache. Baixe-a primeiro.');
      return;
    }

    const index = docsResult.documents.findIndex((doc) => doc.documentId === hit.documentId);
    onOpenResult({
      pub: hit.pub,
      issue: hit.issue,
      publicationTitle: hit.publicationLabel,
      subtitle: hit.documentTitle,
      documents: docsResult.documents,
      documentIndex: index >= 0 ? index : 0,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/45 px-4 pt-[8vh]">
      <div
        role="dialog"
        aria-label="Buscar nas publicações"
        className="flex max-h-[min(78vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-jw-border px-4 py-3">
          <IconSearch className="h-5 w-5 shrink-0 text-jw-muted" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nas publicações baixadas…"
            className="min-w-0 flex-1 bg-transparent text-sm text-jw-text outline-none placeholder:text-jw-muted"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-jw-muted hover:bg-jw-bg hover:text-jw-text"
          >
            Esc
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? <p className="px-3 py-4 text-sm text-jw-muted">Buscando…</p> : null}
          {error ? (
            <p className="mx-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          {!loading && query.trim().length >= 2 && results.length === 0 && !error ? (
            <p className="px-3 py-4 text-sm text-jw-muted">Nenhum resultado nas publicações baixadas.</p>
          ) : null}
          {query.trim().length < 2 && !loading ? (
            <p className="px-3 py-4 text-sm text-jw-muted">Digite ao menos 2 caracteres.</p>
          ) : null}

          <ul className="space-y-1">
            {results.map((hit) => (
              <li key={`${hit.pub}-${hit.issue}-${hit.documentId}`}>
                <button
                  type="button"
                  onClick={() => void openHit(hit)}
                  className="w-full rounded-lg px-3 py-3 text-left transition hover:bg-jw-bg"
                >
                  <p className="text-sm font-medium text-jw-text">{hit.documentTitle}</p>
                  <p className="mt-0.5 text-xs text-jw-purple">{hit.publicationLabel}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-jw-muted">{hit.snippet}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
