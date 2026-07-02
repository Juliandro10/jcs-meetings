import { useEffect, useMemo, useState } from 'react';
import { DownloadProgressBar, getDownloadPercent } from '@/components/DownloadProgressBar';

export type NwtLanguageOption = {
  lang: string;
  name: string;
  downloaded: boolean;
  pubTitle?: string;
};

type BibleLanguageModalProps = {
  open: boolean;
  languages: NwtLanguageOption[];
  activeLang: string;
  loading: boolean;
  downloadingLang: string | null;
  downloadProgressMap?: Record<string, number>;
  onClose: () => void;
  onSelect: (lang: string) => void;
  onDownload: (lang: string) => void;
};

export function BibleLanguageModal({
  open,
  languages,
  activeLang,
  loading,
  downloadingLang,
  downloadProgressMap = {},
  onClose,
  onSelect,
  onDownload,
}: BibleLanguageModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return languages;
    return languages.filter(
      (lang) =>
        lang.name.toLowerCase().includes(needle) ||
        lang.lang.toLowerCase().includes(needle),
    );
  }, [languages, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-jw-surface shadow-2xl"
      >
        <div className="border-b border-jw-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-jw-text">Idiomas da Bíblia</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-jw-muted hover:bg-jw-bg hover:text-jw-text"
            >
              ✕
            </button>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar idioma…"
            className="mt-3 w-full rounded-lg border border-jw-border px-3 py-2 text-sm outline-none focus:border-jw-purple"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <p className="px-5 py-8 text-center text-sm text-jw-muted">Carregando idiomas…</p>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-jw-muted">Nenhum idioma encontrado.</p>
          ) : (
            <ul>
              {filtered.map((lang) => {
                const isActive = lang.lang === activeLang;
                const isDownloading = downloadingLang === lang.lang;
                const downloadPercent = getDownloadPercent(downloadProgressMap, `nwt_${lang.lang}`, isDownloading);
                return (
                  <li key={lang.lang} className="border-b border-jw-border last:border-b-0">
                    <div className="flex items-center gap-3 px-5 py-3">
                      <button
                        type="button"
                        onClick={() => onSelect(lang.lang)}
                        className={[
                          'min-w-0 flex-1 text-left',
                          isActive ? 'text-jw-purple' : 'text-jw-text hover:text-jw-purple',
                        ].join(' ')}
                      >
                        <p className="truncate text-sm font-medium">{lang.name}</p>
                        <p className="truncate text-xs text-jw-muted">
                          {lang.pubTitle ?? 'Tradução do Novo Mundo'}
                        </p>
                      </button>
                      {lang.downloaded ? (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                          Baixada
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isDownloading}
                          onClick={() => onDownload(lang.lang)}
                          className="shrink-0 rounded-lg border border-jw-border px-3 py-1.5 text-xs hover:bg-jw-bg disabled:opacity-60"
                        >
                          {isDownloading ? 'Baixando…' : 'Baixar'}
                        </button>
                      )}
                    </div>
                    {isDownloading && downloadPercent !== null ? (
                      <DownloadProgressBar percent={downloadPercent} label="Baixando Bíblia" className="px-5 pb-3" />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
