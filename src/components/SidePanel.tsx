import { useEffect, useRef } from 'react';
import { AssistantChat, referencePlainText } from '@/components/AssistantChat';
import { DownloadProgressBar } from '@/components/DownloadProgressBar';
import { LfbStudyNotesList, sortLfbStudyNotes } from '@/components/LfbStudyNotesList';
import { NotePanel } from '@/components/NotePanel';
import { OutlineResearchList } from '@/components/OutlineResearchList';
import { applyPublicationCss } from '@/lib/jwpub-publication-styles';
import type { DocumentNote } from '@/lib/note-dom';
import type { AiChatContext, OutlineResearchItem, ResolveLinkResult } from '../../electron/types';

export type SidePanelTab = 'references' | 'assistant';

type SidePanelProps = {
  open: boolean;
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  onClose: () => void;
  referenceLoading: boolean;
  reference: ResolveLinkResult | null;
  downloading: boolean;
  downloadPercent?: number | null;
  onLinkClick: (href: string, label: string) => void;
  onDownloadPublication: () => void;
  onExpandStudyBook?: () => void;
  assistantContext: AiChatContext;
  note?: DocumentNote | null;
  onNoteChange?: (patch: Partial<Pick<DocumentNote, 'title' | 'body' | 'tags'>>) => void;
  onNoteClose?: () => void;
  onNoteDelete?: () => void;
  onOpenDiscourseEditor?: () => void;
  onExportDiscourse?: (format: 'doc' | 'pdf') => void;
  exportingDiscourse?: 'doc' | 'pdf' | null;
  /** Notas da história lfb — exibidas na aba Referências com o livro aberto. */
  documentNotes?: DocumentNote[];
  onDocumentNoteSelect?: (noteId: string) => void;
  /** Oculta aba Assistente IA (ex.: modo proferimento). */
  hideAssistant?: boolean;
  onApplyOutline?: (html: string) => void;
  outlineResearch?: OutlineResearchItem[];
};

export function SidePanel({
  open,
  tab,
  onTabChange,
  onClose,
  referenceLoading,
  reference,
  downloading,
  downloadPercent,
  onLinkClick,
  onDownloadPublication,
  onExpandStudyBook,
  assistantContext,
  note,
  onNoteChange,
  onNoteClose,
  onNoteDelete,
  onOpenDiscourseEditor,
  onExportDiscourse,
  exportingDiscourse,
  documentNotes,
  onDocumentNoteSelect,
  hideAssistant = false,
  onApplyOutline,
  outlineResearch,
}: SidePanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const isStudyBook = reference?.kind === 'study-book';
  const sortedDocumentNotes = documentNotes?.length ? sortLfbStudyNotes(documentNotes) : [];
  const showStoryNotes = sortedDocumentNotes.length > 0 && onDocumentNoteSelect;
  const hasResearch = Boolean(outlineResearch?.length);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || !reference?.html) return;

    applyPublicationCss(root, reference.publicationCss);

    const handleClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href?.startsWith('jwpub://')) return;
      event.preventDefault();
      onLinkClick(href, anchor.textContent?.trim() ?? '');
    };

    root.addEventListener('click', handleClick);
    return () => root.removeEventListener('click', handleClick);
  }, [reference?.html, reference?.publicationCss, onLinkClick]);

  if (!open) return null;

  const download = reference?.download;
  const needsDownload =
    download != null &&
    Boolean(download.pub) &&
    download.issue !== undefined &&
    download.downloaded === false;

  return (
    <aside className="flex w-full max-w-md shrink-0 flex-col border-l border-jw-border bg-[#f7f7f5] lg:w-[400px]">
      <div className="flex items-center gap-2 border-b border-jw-border bg-[#ececea] px-2 py-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel"
          className="rounded-md px-2 py-1 text-sm text-jw-purple hover:bg-white/70"
        >
          ←
        </button>
        <div className="flex min-w-0 flex-1 gap-1">
          <PanelTab active={tab === 'references'} onClick={() => onTabChange('references')}>
            Referências
          </PanelTab>
          {!hideAssistant ? (
            <PanelTab active={tab === 'assistant'} onClick={() => onTabChange('assistant')}>
              Assistente IA
            </PanelTab>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'references' ? (
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
            {hasResearch ? (
              <OutlineResearchList items={outlineResearch ?? []} onOpen={onLinkClick} />
            ) : null}

            {showStoryNotes ? (
              <LfbStudyNotesList
                notes={sortedDocumentNotes}
                activeNoteId={note?.id}
                onSelect={onDocumentNoteSelect}
              />
            ) : null}

            {note && onNoteChange && onNoteClose && onNoteDelete ? (
              <NotePanel
                embedded
                note={note}
                onChange={onNoteChange}
                onClose={onNoteClose}
                onDelete={onNoteDelete}
                onOpenFullEditor={onOpenDiscourseEditor}
                onExportDiscourse={onExportDiscourse}
                exportingDiscourse={exportingDiscourse}
              />
            ) : null}

            {note && (referenceLoading || reference?.ok) ? (
              <div className="mb-3 border-t border-jw-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-jw-muted">Referência</p>
              </div>
            ) : null}

            {referenceLoading ? (
              <p className="text-sm text-jw-muted">Carregando referência…</p>
            ) : reference?.ok ? (
              <>
                {isStudyBook ? (
                  <div className="mb-4 flex items-center gap-3 rounded-lg border border-jw-border bg-white p-3">
                    <div className="flex h-12 w-10 shrink-0 items-center justify-center rounded bg-jw-purple-light text-lg">
                      📖
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-jw-text">
                        {reference.download?.label ?? reference.subtitle ?? 'Histórias da Bíblia'}
                      </p>
                      <p className="truncate text-xs text-jw-muted">{reference.title}</p>
                    </div>
                    {onExpandStudyBook ? (
                      <button
                        type="button"
                        aria-label="Abrir livro completo"
                        onClick={onExpandStudyBook}
                        className="shrink-0 rounded-md px-2 py-1 text-lg text-jw-muted hover:bg-jw-purple-light hover:text-jw-purple"
                      >
                        ›
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <p className="text-xs uppercase tracking-wide text-jw-muted">{reference.subtitle}</p>
                    <h4 className="mt-1 text-base font-semibold leading-snug text-jw-text">{reference.title}</h4>
                  </>
                )}

                {needsDownload ? (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={onDownloadPublication}
                      disabled={downloading}
                      className="w-full rounded-lg border border-jw-border bg-white px-3 py-2 text-sm text-jw-text hover:border-jw-purple disabled:opacity-60"
                    >
                      {downloading ? 'Baixando publicação…' : 'Baixar publicação'}
                    </button>
                    {downloading && downloadPercent !== null && downloadPercent !== undefined ? (
                      <DownloadProgressBar percent={downloadPercent} label="Baixando" className="mt-2" />
                    ) : null}
                  </div>
                ) : null}

                <div
                  ref={contentRef}
                  className="study-panel-content jwpub-content mt-2"
                  dangerouslySetInnerHTML={{ __html: reference.html ?? '' }}
                />
              </>
            ) : !note && !showStoryNotes && !hasResearch ? (
              <p className="text-sm text-jw-muted">
                {reference?.error ??
                  'Selecione um link na matéria para abrir versículos ou matérias de pesquisa.'}
              </p>
            ) : hasResearch && !reference?.ok && !referenceLoading ? (
              <p className="text-sm text-jw-muted">Toque numa matéria de pesquisa acima para ler o trecho.</p>
            ) : null}
          </div>
        ) : null}

        {!hideAssistant ? (
          <div className={tab === 'assistant' ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4' : 'hidden'}>
            <AssistantChat
              context={{
                ...assistantContext,
                referenceTitle: reference?.ok ? reference.title : assistantContext.referenceTitle,
                referenceText:
                  reference?.ok ? referencePlainText(reference.html) : assistantContext.referenceText,
              }}
              onApplyOutline={onApplyOutline}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function PanelTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 truncate rounded-md px-2 py-1.5 text-xs font-medium',
        active ? 'bg-white text-jw-purple shadow-sm' : 'text-jw-muted hover:bg-white/60 hover:text-jw-text',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
