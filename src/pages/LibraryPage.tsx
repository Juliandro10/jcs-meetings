import { useCallback, useEffect, useMemo, useState } from 'react';
import { DownloadProgressBar, getDownloadPercent } from '@/components/DownloadProgressBar';
import { IconChevronLeft, IconCloudDownload } from '@/components/Icons';
import { LIBRARY_CATEGORIES, type LibraryCategoryId } from '@/lib/types';
import {
  TeachingKitPublicationReaderPage,
  type TeachingKitReaderTarget,
} from '@/pages/TeachingKitPublicationReaderPage';
import type { LibraryPublicationItem, PreachingPubDocument } from '../../electron/types';

type LibraryPageProps = {
  onDownloadMeetingPubs: () => Promise<void>;
  onRefreshCache: () => Promise<void>;
  downloading: boolean;
  downloadProgressMap: Record<string, number>;
};

type LibraryView =
  | { kind: 'grid' }
  | { kind: 'list'; categoryId: LibraryCategoryId; categoryLabel: string };

export function LibraryPage({
  onDownloadMeetingPubs,
  onRefreshCache,
  downloading,
  downloadProgressMap,
}: LibraryPageProps) {
  const [tab, setTab] = useState<'publications' | 'downloaded'>('publications');
  const [view, setView] = useState<LibraryView>({ kind: 'grid' });
  const [items, setItems] = useState<LibraryPublicationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [readerTarget, setReaderTarget] = useState<TeachingKitReaderTarget | null>(null);

  const bulkPercent = getDownloadPercent(downloadProgressMap, 'meeting-bulk', downloading);

  const { currentItems, archiveItems, yearbookItems } = useMemo(() => {
    const current = items.filter((item) => item.section === 'current');
    const archive = items.filter((item) => item.section === 'archive');
    const yearbooks = items.filter((item) => item.section === 'yearbooks');
    return { currentItems: current, archiveItems: archive, yearbookItems: yearbooks };
  }, [items]);

  const loadCategory = useCallback(async (categoryId: LibraryCategoryId) => {
    if (!window.jcs?.listLibraryCategory) {
      setError('Abra o app pelo Electron para usar a Biblioteca.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await window.jcs.listLibraryCategory({ categoryId });
      if (!result.ok || !result.items) {
        setError(result.error ?? 'Não foi possível carregar as publicações.');
        setItems([]);
        return;
      }
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar publicações.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDownloaded = useCallback(async () => {
    if (!window.jcs?.listLibraryDownloaded) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.jcs.listLibraryDownloaded();
      if (!result.ok || !result.items) {
        setError(result.error ?? 'Não foi possível carregar os baixados.');
        setItems([]);
        return;
      }
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar baixados.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'downloaded') {
      void loadDownloaded();
      return;
    }
    if (view.kind === 'list') {
      void loadCategory(view.categoryId);
    }
  }, [tab, view, loadCategory, loadDownloaded]);

  const openCategory = (categoryId: LibraryCategoryId, categoryLabel: string) => {
    setTab('publications');
    setView({ kind: 'list', categoryId, categoryLabel });
  };

  const refreshList = useCallback(async () => {
    if (view.kind === 'list') {
      await loadCategory(view.categoryId);
    } else if (tab === 'downloaded') {
      await loadDownloaded();
    }
  }, [loadCategory, loadDownloaded, tab, view]);

  const handleDownloadItem = async (item: LibraryPublicationItem) => {
    if (!window.jcs?.downloadPreachingPub) return;
    setDownloadingId(item.id);
    try {
      const result = await window.jcs.downloadPreachingPub({ pub: item.pub, issue: item.issue });
      if (!result.ok) {
        window.alert(result.error ?? 'Não foi possível baixar a publicação.');
        return;
      }
      await onRefreshCache();
      await refreshList();
    } finally {
      setDownloadingId(null);
    }
  };

  const openPublication = useCallback(
    (item: LibraryPublicationItem, documents: PreachingPubDocument[], documentIndex = 0) => {
      setReaderTarget({
        pub: item.pub,
        issue: item.issue,
        publicationTitle: item.cardTitle,
        subtitle: item.subtitle,
        documents,
        documentIndex,
      });
    },
    [],
  );

  const handleOpenPublication = async (item: LibraryPublicationItem) => {
    if (!window.jcs?.listPreachingPubDocuments) return;

    if (!item.downloaded) {
      window.alert('Baixe a publicação primeiro (ícone de nuvem) para abrir offline.');
      return;
    }

    setOpeningId(item.id);
    try {
      const result = await window.jcs.listPreachingPubDocuments({
        pub: item.pub,
        issue: item.issue,
      });
      if (!result.ok || !result.documents?.length) {
        window.alert(result.error ?? 'Não foi possível abrir a publicação.');
        return;
      }
      openPublication(item, result.documents, 0);
    } finally {
      setOpeningId(null);
    }
  };

  if (readerTarget) {
    return <TeachingKitPublicationReaderPage target={readerTarget} onBack={() => setReaderTarget(null)} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto px-6 py-4">
      <div className="mb-4 flex gap-6 border-b border-jw-border">
        <LibraryTab active={tab === 'publications'} onClick={() => { setTab('publications'); setView({ kind: 'grid' }); }} label="PUBLICAÇÕES" />
        <LibraryTab active={tab === 'downloaded'} onClick={() => setTab('downloaded')} label="BAIXADOS" />
      </div>

      {tab === 'publications' && view.kind === 'list' ? (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setView({ kind: 'grid' })}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
          >
            <IconChevronLeft className="h-4 w-4" />
            Biblioteca
          </button>
          <h2 className="mt-2 text-xl font-semibold text-jw-text">{view.categoryLabel}</h2>
          <p className="text-sm text-jw-muted">{items.length} publicações</p>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="py-10 text-center text-sm text-jw-muted">Carregando publicações…</p>
      ) : tab === 'publications' && view.kind === 'grid' ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {LIBRARY_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => openCategory(cat.id, cat.label)}
                className="group flex items-center gap-3 rounded-xl border border-jw-border bg-jw-surface px-4 py-5 text-left shadow-sm transition hover:border-jw-purple hover:shadow-md"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-jw-purple-light text-sm font-bold text-jw-purple transition group-hover:bg-jw-purple group-hover:text-white">
                  {cat.abbrev}
                </span>
                <span className="text-sm font-medium text-jw-text">{cat.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-8 border-t border-jw-border pt-5">
            <button
              type="button"
              disabled={downloading}
              onClick={() => void onDownloadMeetingPubs()}
              className="rounded-lg bg-jw-purple px-5 py-2.5 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-60"
            >
              Atualizar publicações da reunião (jw.org)
            </button>
            {downloading && bulkPercent !== null ? (
              <DownloadProgressBar percent={bulkPercent} label="Baixando publicações da reunião" className="mt-3 max-w-md" />
            ) : null}
          </div>
        </>
      ) : (
        <div className="space-y-8">
          <PublicationGrid
            items={currentItems}
            downloadingId={downloadingId}
            openingId={openingId}
            downloadProgressMap={downloadProgressMap}
            onDownload={(item) => void handleDownloadItem(item)}
            onOpen={(item) => void handleOpenPublication(item)}
          />
          {archiveItems.length > 0 ? (
            <section>
              <h3 className="mb-4 border-b border-jw-border pb-2 text-xs font-semibold uppercase tracking-widest text-jw-muted">
                Publicações antigas
              </h3>
              <PublicationGrid
                items={archiveItems}
                downloadingId={downloadingId}
                openingId={openingId}
                downloadProgressMap={downloadProgressMap}
                onDownload={(item) => void handleDownloadItem(item)}
                onOpen={(item) => void handleOpenPublication(item)}
              />
            </section>
          ) : null}
          {yearbookItems.length > 0 ? (
            <section>
              <h3 className="mb-4 border-b border-jw-border pb-2 text-xs font-semibold uppercase tracking-widest text-jw-muted">
                Anuários e relatórios dos anos de serviço
              </h3>
              <PublicationGrid
                items={yearbookItems}
                downloadingId={downloadingId}
                openingId={openingId}
                downloadProgressMap={downloadProgressMap}
                onDownload={(item) => void handleDownloadItem(item)}
                onOpen={(item) => void handleOpenPublication(item)}
              />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PublicationCoverImage({
  pub,
  issue,
  imageUrl,
  imageFallbackUrls,
}: {
  pub: string;
  issue: string;
  imageUrl?: string;
  imageFallbackUrls?: string[];
}) {
  const candidates = useMemo(
    () => [imageUrl, ...(imageFallbackUrls ?? [])].filter((url): url is string => Boolean(url)),
    [imageFallbackUrls, imageUrl],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [candidates]);

  if (candidates.length === 0 || index >= candidates.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-2 text-center">
        <span className="text-lg font-bold text-jw-purple">{pub.toUpperCase()}</span>
        {issue ? <span className="mt-1 text-[10px] text-jw-muted">{issue}</span> : null}
      </div>
    );
  }

  return (
    <img
      src={candidates[index]}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

function PublicationGrid({
  items,
  downloadingId,
  openingId,
  downloadProgressMap,
  onDownload,
  onOpen,
}: {
  items: LibraryPublicationItem[];
  downloadingId: string | null;
  openingId: string | null;
  downloadProgressMap: Record<string, number>;
  onDownload: (item: LibraryPublicationItem) => void;
  onOpen: (item: LibraryPublicationItem) => void;
}) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-jw-muted">Nenhuma publicação encontrada.</p>;
  }

  return (
    <div className="grid gap-x-3 gap-y-5 [grid-template-columns:repeat(auto-fill,minmax(112px,1fr))]">
      {items.map((item) => {
        const progressKey = `${item.pub}_${item.issue}`;
        const percent = getDownloadPercent(downloadProgressMap, progressKey, downloadingId === item.id);
        const busy = downloadingId === item.id || openingId === item.id;

        return (
          <article key={item.id} className="group min-w-0">
            <div className="relative">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onOpen(item)}
                className="block w-full text-left"
              >
                <div className="aspect-[3/4] overflow-hidden rounded-md bg-[#ece8ef] shadow-sm ring-1 ring-jw-border transition group-hover:ring-jw-purple/40">
                  <PublicationCoverImage
                    pub={item.pub}
                    issue={item.issue}
                    imageUrl={item.imageUrl}
                    imageFallbackUrls={item.imageFallbackUrls}
                  />
                </div>
              </button>

              {!item.downloaded ? (
                <button
                  type="button"
                  aria-label="Baixar publicação"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDownload(item);
                  }}
                  className="absolute bottom-1.5 right-1.5 rounded-full bg-white/95 p-1.5 text-jw-purple shadow-sm hover:bg-white disabled:opacity-60"
                >
                  <IconCloudDownload className="h-4 w-4" />
                </button>
              ) : null}

              {percent !== null && percent < 100 ? (
                <div className="absolute inset-x-1 bottom-1">
                  <DownloadProgressBar percent={percent} className="rounded-full" />
                </div>
              ) : null}
            </div>

            <button type="button" disabled={busy} onClick={() => void onOpen(item)} className="mt-2 w-full text-left">
              <p className="line-clamp-2 text-[12px] font-medium leading-snug text-jw-text">{item.cardTitle}</p>
              {item.subtitle ? <p className="mt-0.5 line-clamp-1 text-[10px] text-jw-muted">{item.subtitle}</p> : null}
            </button>
          </article>
        );
      })}
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
