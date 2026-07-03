import { useCallback, useEffect, useRef, useState } from 'react';
import { referencePlainText } from '@/components/AssistantChat';
import { IconChevronLeft, IconChevronRight } from '@/components/Icons';
import { PublicationReader } from '@/components/PublicationReader';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import { readBibleEdition } from '@/lib/bible-edition';
import type { PreachingPubDocument, ResolveLinkResult } from '../../electron/types';

export type TeachingKitReaderTarget = {
  pub: string;
  issue?: string;
  publicationTitle: string;
  subtitle?: string;
  documents: PreachingPubDocument[];
  documentIndex: number;
};

type TeachingKitPublicationReaderPageProps = {
  target: TeachingKitReaderTarget;
  onBack: () => void;
};

export function TeachingKitPublicationReaderPage({ target, onBack }: TeachingKitPublicationReaderPageProps) {
  const [documentIndex, setDocumentIndex] = useState(target.documentIndex);
  const [tocOpen, setTocOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('references');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const documents = target.documents;
  const currentDocument = documents[documentIndex];
  const hasMultipleDocuments = documents.length > 1;

  const goToDocument = useCallback((index: number) => {
    if (index < 0 || index >= documents.length) return;
    setDocumentIndex(index);
    setTocOpen(false);
  }, [documents.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentDocument?.documentId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (tocOpen) {
          setTocOpen(false);
          return;
        }
        return;
      }

      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement | null)?.isContentEditable) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToDocument(documentIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToDocument(documentIndex + 1);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [documentIndex, goToDocument, tocOpen]);

  const openReference = useCallback(
    async (href: string, linkLabel: string) => {
      if (!window.jcs?.resolveLink) return;

      setPanelOpen(true);
      setPanelTab('references');
      setReferenceLoading(true);
      setReference(null);

      const result = await window.jcs.resolveLink({
        href,
        linkLabel,
        sourcePub: target.pub,
        sourceIssue: target.issue ?? '',
        bibleEdition: readBibleEdition(),
      });

      setReference(result);
      setReferenceLoading(false);
    },
    [target.issue, target.pub],
  );

  if (!currentDocument) {
    return (
      <div className="flex h-full items-center justify-center bg-jw-bg px-6 text-sm text-jw-muted">
        Não foi possível abrir a publicação.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-jw-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-jw-border bg-jw-surface px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          <IconChevronLeft className="h-4 w-4" />
          Kit de Ensino
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-jw-text">{target.publicationTitle}</p>
          <p className="truncate text-xs text-jw-muted">
            {hasMultipleDocuments ? currentDocument.title : target.subtitle ?? currentDocument.title}
          </p>
        </div>
        {hasMultipleDocuments ? (
          <button
            type="button"
            onClick={() => setTocOpen(true)}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple"
          >
            Índice
          </button>
        ) : null}
        {!panelOpen ? (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="rounded-lg border border-jw-border px-3 py-1.5 text-sm text-jw-text hover:border-jw-purple"
          >
            Referências
          </button>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className="min-h-0 min-w-0 flex-1 overflow-auto px-6 py-6 sm:px-10 sm:py-8"
        >
          <PublicationReader
            key={`${target.pub}-${currentDocument.documentId}`}
            pub={target.pub}
            documentId={currentDocument.documentId}
            issue={target.issue}
            injectStudyFields={false}
            onJwpubLinkClick={(href, label) => void openReference(href, label)}
          />
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
            publicationTitle: target.publicationTitle,
            referenceTitle: reference?.ok ? reference.title : undefined,
            referenceText: reference?.ok ? referencePlainText(reference.html) : undefined,
          }}
        />
      </div>

      {hasMultipleDocuments ? (
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-jw-border bg-jw-surface px-4 py-2.5">
          <button
            type="button"
            disabled={documentIndex === 0}
            onClick={() => goToDocument(documentIndex - 1)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconChevronLeft className="h-4 w-4" />
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setTocOpen(true)}
            className="rounded-lg px-3 py-1.5 text-sm text-jw-muted hover:bg-jw-purple-light/40 hover:text-jw-text"
          >
            {documentIndex + 1} de {documents.length}
          </button>
          <button
            type="button"
            disabled={documentIndex >= documents.length - 1}
            onClick={() => goToDocument(documentIndex + 1)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
            <IconChevronRight className="h-4 w-4" />
          </button>
        </footer>
      ) : null}

      {tocOpen ? (
        <TeachingKitDocumentTocModal
          publicationTitle={target.publicationTitle}
          documents={documents}
          activeIndex={documentIndex}
          onPick={(index) => goToDocument(index)}
          onClose={() => setTocOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TeachingKitDocumentTocModal({
  publicationTitle,
  documents,
  activeIndex,
  onPick,
  onClose,
}: {
  publicationTitle: string;
  documents: PreachingPubDocument[];
  activeIndex: number;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Índice — ${publicationTitle}`}
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-jw-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm text-jw-purple hover:underline"
          >
            <IconChevronLeft className="h-4 w-4" />
            Voltar
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-jw-text">{publicationTitle}</p>
        </header>
        <ul className="overflow-auto py-2">
          {documents.map((document, index) => (
            <li key={`${document.documentId}-${index}`}>
              <button
                type="button"
                onClick={() => onPick(index)}
                className={`block w-full px-4 py-3 text-left text-sm hover:bg-jw-purple-light/40 ${
                  index === activeIndex ? 'bg-jw-purple-light/50 font-medium text-jw-text' : 'text-jw-text'
                }`}
              >
                {document.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
