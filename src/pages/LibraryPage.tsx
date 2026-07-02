import { useState } from 'react';
import { LIBRARY_CATEGORIES } from '@/lib/types';

type LibraryPageProps = {
  downloadedPubs: Set<string>;
  onDownloadMeetingPubs: () => Promise<void>;
  downloading: boolean;
};

export function LibraryPage({ downloadedPubs, onDownloadMeetingPubs, downloading }: LibraryPageProps) {
  const [tab, setTab] = useState<'publications' | 'downloaded'>('publications');

  return (
    <div className="px-6 py-4">
      <div className="mb-4 flex gap-6 border-b border-jw-border">
        <LibraryTab active={tab === 'publications'} onClick={() => setTab('publications')} label="PUBLICAÇÕES" />
        <LibraryTab active={tab === 'downloaded'} onClick={() => setTab('downloaded')} label="BAIXADOS" />
      </div>

      {tab === 'publications' ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {LIBRARY_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                disabled={!cat.enabled}
                className={[
                  'flex items-center gap-3 rounded border border-jw-border bg-jw-surface px-4 py-5 text-left',
                  cat.enabled ? 'hover:border-jw-purple hover:shadow-sm' : 'cursor-not-allowed opacity-40',
                ].join(' ')}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded bg-jw-purple-light text-xs font-bold text-jw-purple">
                  {cat.label.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm text-jw-text">{cat.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={downloading}
            onClick={() => onDownloadMeetingPubs()}
            className="rounded-lg bg-jw-purple px-5 py-2.5 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-60"
          >
            {downloading ? 'Baixando…' : 'Atualizar publicações da reunião (jw.org)'}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          {downloadedPubs.size === 0 ? (
            <p className="text-sm text-jw-muted">Nenhuma publicação baixada ainda.</p>
          ) : (
            [...downloadedPubs].map((key) => (
              <div key={key} className="rounded-lg border border-jw-border bg-jw-surface px-4 py-3 text-sm text-jw-text">
                {key}.jwpub
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LibraryTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'border-b-2 px-1 pb-2 text-xs font-semibold tracking-wide',
        active ? 'border-jw-purple text-jw-purple' : 'border-transparent text-jw-muted hover:text-jw-text',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
