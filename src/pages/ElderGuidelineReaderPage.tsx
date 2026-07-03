import { useCallback, useState } from 'react';
import { referencePlainText } from '@/components/AssistantChat';
import { IconChevronLeft } from '@/components/Icons';
import { PublicationReader } from '@/components/PublicationReader';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import { readBibleEdition } from '@/lib/bible-edition';
import type { ResolveLinkResult } from '../../electron/types';

export type ElderGuidelineReaderTarget = {
  pub: string;
  documentId: number;
  title: string;
  pubLabel: string;
};

type ElderGuidelineReaderPageProps = {
  target: ElderGuidelineReaderTarget;
  onBack: () => void;
};

export function ElderGuidelineReaderPage({ target, onBack }: ElderGuidelineReaderPageProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('references');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);

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
        sourceIssue: '',
        bibleEdition: readBibleEdition(),
      });

      setReference(result);
      setReferenceLoading(false);
    },
    [target.pub],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-jw-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-jw-border bg-jw-surface px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          <IconChevronLeft className="h-4 w-4" />
          Orientações
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-jw-text">{target.title}</p>
          <p className="truncate text-xs text-jw-muted">{target.pubLabel}</p>
        </div>
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
        <div className="min-h-0 min-w-0 flex-1 overflow-auto px-6 py-6 sm:px-10 sm:py-8">
          <PublicationReader
            pub={target.pub}
            documentId={target.documentId}
            injectStudyFields={false}
            onJwpubLinkClick={(href, label) => void openReference(href, label)}
          />
        </div>

        {panelOpen ? (
          <SidePanel
            open={panelOpen}
            tab={panelTab}
            onTabChange={setPanelTab}
            onClose={() => setPanelOpen(false)}
            reference={reference}
            referenceLoading={referenceLoading}
            downloading={false}
            onLinkClick={(href, label) => void openReference(href, label)}
            onDownloadPublication={() => undefined}
            assistantContext={{
              weekLabel: target.pubLabel,
              publicationTitle: `${target.pubLabel} — ${target.title}`,
              sourcePub: target.pub,
              sourceIssue: '',
              sourceDocumentId: target.documentId,
              referenceTitle: reference?.ok ? reference.title : undefined,
              referenceText: reference?.ok ? referencePlainText(reference.html) : undefined,
            }}
            hideAssistant
          />
        ) : null}
      </div>
    </div>
  );
}
