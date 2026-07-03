import { useCallback, useEffect, useRef, useState } from 'react';
import { referencePlainText } from '@/components/AssistantChat';
import { IconCloudDownload } from '@/components/Icons';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import { readBibleEdition } from '@/lib/bible-edition';
import {
  TeachingKitPublicationReaderPage,
  type TeachingKitReaderTarget,
} from '@/pages/TeachingKitPublicationReaderPage';
import type {
  PreachingContent,
  PreachingPubDocument,
  PreachingTopic,
  ResolveLinkResult,
  TeachingKitItem,
} from '../../electron/types';

export function PreachingPage() {
  const [content, setContent] = useState<PreachingContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('references');
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<TeachingKitItem | null>(null);
  const [readerTarget, setReaderTarget] = useState<TeachingKitReaderTarget | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    if (!window.jcs?.loadPreaching) {
      setError('Abra o app pelo Electron para usar a Pregação.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await window.jcs.loadPreaching();
      setContent(result);
      if (result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pregação.');
    } finally {
      setLoading(false);
    }
  }, []);

  const openReference = useCallback(async (href: string, linkLabel: string) => {
    if (!window.jcs?.resolveLink) return;
    setPanelOpen(true);
    setPanelTab('references');
    setReferenceLoading(true);
    setReference(null);
    const result = await window.jcs.resolveLink({
      href,
      linkLabel,
      sourcePub: 'mwb',
      sourceIssue: '',
      bibleEdition: readBibleEdition(),
    });
    setReference(result);
    setReferenceLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const handleClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href?.startsWith('jwpub://b/')) return;
      event.preventDefault();
      void openReference(href, anchor.textContent?.trim() ?? '');
    };

    root.addEventListener('click', handleClick);
    return () => root.removeEventListener('click', handleClick);
  }, [openReference, content?.topics]);

  async function handleDownloadItem(item: TeachingKitItem) {
    if (item.kind !== 'publication' || !item.pub || !window.jcs?.downloadPreachingPub) return;
    setDownloadingId(item.id);
    try {
      await window.jcs.downloadPreachingPub({ pub: item.pub, issue: item.issue ?? '' });
      await reload();
    } finally {
      setDownloadingId(null);
    }
  }

  const openPublication = useCallback(
    (item: TeachingKitItem, documents: PreachingPubDocument[], documentIndex = 0) => {
      if (!item.pub || !documents.length) return;
      setReaderTarget({
        pub: item.pub,
        issue: item.issue,
        publicationTitle: item.title,
        subtitle: item.subtitle,
        documents,
        documentIndex,
      });
    },
    [],
  );

  const handleOpenPublication = useCallback(
    async (item: TeachingKitItem) => {
      if (item.kind !== 'publication' || !item.pub || !window.jcs?.listPreachingPubDocuments) return;

      setOpeningId(item.id);
      try {
        if (!item.downloaded && window.jcs.downloadPreachingPub) {
          const download = await window.jcs.downloadPreachingPub({
            pub: item.pub,
            issue: item.issue ?? '',
          });
          if (!download.ok) {
            window.alert(download.error ?? 'Não foi possível baixar a publicação.');
            return;
          }
          await reload();
        }

        const result = await window.jcs.listPreachingPubDocuments({
          pub: item.pub,
          issue: item.issue ?? '',
        });

        if (!result.ok || !result.documents?.length) {
          window.alert(result.error ?? 'Não foi possível abrir a publicação.');
          return;
        }

        openPublication(item, result.documents, 0);
      } finally {
        setOpeningId(null);
      }
    },
    [openPublication, reload],
  );

  function scrollToTopic(topicId: string) {
    document.getElementById(`preaching-topic-${topicId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (readerTarget) {
    return (
      <TeachingKitPublicationReaderPage target={readerTarget} onBack={() => setReaderTarget(null)} />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <p className="py-12 text-center text-sm text-jw-muted">
            Carregando kit de ensino… Na primeira vez, folhetos e capas podem levar alguns segundos.
          </p>
        ) : (
          <>
            {error ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {error}
              </div>
            ) : null}

            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="text-lg font-semibold text-jw-text">Kit de Ensino</h2>
                <span className="text-sm text-jw-purple">Português (Brasil)</span>
              </div>
              <TeachingKitGrid
                items={content?.teachingKit ?? []}
                downloadingId={downloadingId}
                openingId={openingId}
                onDownload={handleDownloadItem}
                onPlayVideo={setPlayingVideo}
                onOpenPublication={(item) => void handleOpenPublication(item)}
              />
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-jw-text">Ame as Pessoas — Faça Discípulos</h2>
              <p className="mt-1 text-sm text-jw-muted">
                Verdades que amamos ensinar, textos bíblicos e introduções para a pregação.
              </p>

              {content?.introHtml ? (
                <article
                  className="prose-bible jwpub-content mt-4 max-w-3xl text-[15px] leading-relaxed text-jw-text"
                  dangerouslySetInnerHTML={{ __html: content.introHtml }}
                />
              ) : null}

              {content?.topics.length ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {content.topics.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => scrollToTopic(topic.id)}
                      className="rounded-full border border-jw-border bg-white px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple hover:text-jw-purple"
                    >
                      {topic.title}
                    </button>
                  ))}
                </div>
              ) : null}

              <div ref={contentRef} className="mt-6 max-w-3xl space-y-8">
                {(content?.topics ?? []).map((topic) => (
                  <TopicCard key={topic.id} topic={topic} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <SidePanel
        open={panelOpen}
        tab={panelTab}
        onTabChange={setPanelTab}
        onClose={() => setPanelOpen(false)}
        referenceLoading={referenceLoading}
        reference={reference}
        downloading={false}
        onLinkClick={(href, label) => void openReference(href, label)}
        onDownloadPublication={() => undefined}
        assistantContext={{
          weekLabel: 'Pregação',
          publicationTitle: 'Ame as Pessoas — Faça Discípulos',
          referenceTitle: reference?.ok ? reference.title : undefined,
          referenceText: reference?.ok ? referencePlainText(reference.html) : undefined,
        }}
      />

      {playingVideo?.videoUrl ? (
        <TeachingKitVideoModal item={playingVideo} onClose={() => setPlayingVideo(null)} />
      ) : null}

    </div>
  );
}

function TeachingKitGrid({
  items,
  downloadingId,
  openingId,
  onDownload,
  onPlayVideo,
  onOpenPublication,
}: {
  items: TeachingKitItem[];
  downloadingId: string | null;
  openingId: string | null;
  onDownload: (item: TeachingKitItem) => void;
  onPlayVideo: (item: TeachingKitItem) => void;
  onOpenPublication: (item: TeachingKitItem) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-jw-muted">Nenhum item disponível no kit de ensino.</p>;
  }

  return (
    <div className="grid gap-x-3 gap-y-4 [grid-template-columns:repeat(auto-fill,88px)]">
      {items.map((item) => (
        <article key={item.id} className="group w-[88px] shrink-0">
          <div className="relative">
            <button
              type="button"
              className="block w-full text-left"
              disabled={openingId === item.id}
              onClick={() => {
                if (item.kind === 'video' && item.videoUrl) {
                  onPlayVideo(item);
                  return;
                }
                if (item.kind === 'publication') {
                  onOpenPublication(item);
                }
              }}
            >
              <div className="aspect-square overflow-hidden rounded-sm bg-[#ece8ef]">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-jw-muted">
                    Sem capa
                  </div>
                )}
              </div>
              {item.kind === 'video' && item.durationLabel ? (
                <span className="absolute left-1 top-1 rounded bg-black/75 px-1 py-px text-[9px] font-medium leading-none text-white">
                  ▶ {item.durationLabel}
                </span>
              ) : null}
            </button>
            {item.kind === 'publication' && !item.downloaded ? (
              <button
                type="button"
                aria-label="Baixar publicação"
                onClick={() => onDownload(item)}
                disabled={downloadingId === item.id}
                className="absolute bottom-1 right-1 rounded-full bg-white/90 p-1 text-jw-purple shadow-sm hover:bg-white disabled:opacity-60"
              >
                <IconCloudDownload className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-jw-text">{item.title}</p>
        </article>
      ))}
    </div>
  );
}

function TeachingKitVideoModal({
  item,
  onClose,
}: {
  item: TeachingKitItem;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleClose = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => undefined);
  }, [item.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-[#111] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">{item.title}</p>
            {item.durationLabel ? (
              <p className="mt-0.5 text-xs text-white/60">Duração: {item.durationLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
          >
            Fechar
          </button>
        </header>

        <div className="bg-black">
          <video
            ref={videoRef}
            key={item.id}
            src={item.videoUrl}
            controls
            autoPlay
            playsInline
            className="aspect-video w-full bg-black"
          />
        </div>
      </div>
    </div>
  );
}

function TopicCard({ topic }: { topic: PreachingTopic }) {
  const [introOpen, setIntroOpen] = useState(false);

  return (
    <article id={`preaching-topic-${topic.id}`} className="scroll-mt-6 rounded-xl border border-jw-border bg-white p-5">
      <h3 className="text-base font-bold uppercase tracking-wide text-jw-purple-dark">{topic.title}</h3>

      <ol className="mt-4 space-y-3">
        {topic.points.map((point) => (
          <li key={point.number} className="text-[15px] leading-relaxed text-jw-text">
            <span
              className="jwpub-content"
              dangerouslySetInnerHTML={{ __html: point.html }}
            />
          </li>
        ))}
      </ol>

      <div className="mt-4 border-t border-jw-border pt-3">
        <button
          type="button"
          onClick={() => setIntroOpen((value) => !value)}
          className="text-sm font-medium text-jw-purple hover:underline"
        >
          {introOpen ? 'Ocultar introdução sugerida' : 'Introdução sugerida para a pregação'}
        </button>
        {introOpen ? (
          <p className="mt-2 rounded-lg bg-jw-bg px-3 py-2 text-sm leading-relaxed text-jw-text">
            {topic.introduction}
          </p>
        ) : null}
      </div>
    </article>
  );
}
