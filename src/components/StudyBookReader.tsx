import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import type { DocumentNote } from '@/lib/note-dom';
import type { AiChatContext, ResolveLinkResult } from '../../electron/types';

type StudyBookReaderProps = {
  weekLabel: string;
  storyNumber: number;
  storyTitle: string;
  storyIndex: number;
  storyCount: number;
  prepping: boolean;
  clearingPrep?: boolean;
  prepMessage: string | null;
  panelOpen: boolean;
  panelTab: SidePanelTab;
  panelLoading: boolean;
  reference: ResolveLinkResult | null;
  downloading: boolean;
  assistantContext: AiChatContext;
  reader: React.ReactNode;
  onBackToApostila: () => void;
  onPrevStory: () => void;
  onNextStory: () => void;
  onPrepareLessons: () => void;
  onClearPrep?: () => void;
  onPanelClose: () => void;
  onPanelOpen?: () => void;
  onPanelTabChange: (tab: SidePanelTab) => void;
  onLinkClick: (href: string, label: string) => void;
  onDownloadPublication: () => void;
  note?: DocumentNote | null;
  onNoteChange?: (patch: Partial<Pick<DocumentNote, 'title' | 'body' | 'tags'>>) => void;
  onNoteClose?: () => void;
  onNoteDelete?: () => void;
  documentNotes?: DocumentNote[];
  onDocumentNoteSelect?: (noteId: string) => void;
};

export function StudyBookReader({
  weekLabel,
  storyNumber,
  storyTitle,
  storyIndex,
  storyCount,
  prepping,
  clearingPrep = false,
  prepMessage,
  panelOpen,
  panelTab,
  panelLoading,
  reference,
  downloading,
  assistantContext,
  reader,
  onBackToApostila,
  onPrevStory,
  onNextStory,
  onPrepareLessons,
  onClearPrep,
  onPanelClose,
  onPanelOpen,
  onPanelTabChange,
  onLinkClick,
  onDownloadPublication,
  note,
  onNoteChange,
  onNoteClose,
  onNoteDelete,
  documentNotes,
  onDocumentNoteSelect,
}: StudyBookReaderProps) {
  return (
    <div className="flex h-full flex-col bg-jw-bg">
      <div className="flex items-center gap-3 border-b border-jw-border bg-jw-surface px-4 py-3">
        <button
          type="button"
          onClick={onBackToApostila}
          className="rounded-lg px-3 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          ← Apostila
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-jw-text">
            {storyNumber}. {storyTitle}
          </p>
          <p className="truncate text-xs text-jw-muted">
            {weekLabel} · Aprenda com as Histórias da Bíblia
            {storyCount > 1 ? ` · História ${storyIndex + 1}/${storyCount}` : ''}
          </p>
          {prepMessage ? <p className="truncate text-xs text-jw-purple">{prepMessage}</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {storyCount > 1 ? (
            <>
              <ToolbarButton label="História anterior" onClick={onPrevStory} disabled={storyIndex <= 0}>
                ‹
              </ToolbarButton>
              <ToolbarButton
                label="Próxima história"
                onClick={onNextStory}
                disabled={storyIndex >= storyCount - 1}
              >
                ›
              </ToolbarButton>
            </>
          ) : null}
          <ToolbarButton
            label="Limpar preparação desta história"
            onClick={onClearPrep}
            disabled={prepping || clearingPrep || !onClearPrep}
          >
            {clearingPrep ? 'Limpando…' : 'Limpar preparação'}
          </ToolbarButton>
          <ToolbarButton label="Preparar lições desta história" onClick={onPrepareLessons} disabled={prepping || clearingPrep}>
            {prepping ? 'Preparando…' : 'Preparar lições'}
          </ToolbarButton>
          {!panelOpen ? (
            <ToolbarButton
              label="Abrir referências e notas"
              onClick={() => {
                onPanelTabChange('references');
                onPanelOpen?.();
              }}
            >
              Referências
            </ToolbarButton>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-w-0 flex-1 overflow-auto bg-jw-surface">{reader}</div>
        <SidePanel
          open={panelOpen}
          tab={panelTab}
          onTabChange={onPanelTabChange}
          onClose={onPanelClose}
          referenceLoading={panelLoading}
          reference={reference}
          downloading={downloading}
          onLinkClick={onLinkClick}
          onDownloadPublication={onDownloadPublication}
          assistantContext={assistantContext}
          note={note}
          onNoteChange={onNoteChange}
          onNoteClose={onNoteClose}
          onNoteDelete={onNoteDelete}
          documentNotes={documentNotes}
          onDocumentNoteSelect={onDocumentNoteSelect}
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-jw-border px-3 py-1 text-xs text-jw-muted hover:border-jw-purple hover:text-jw-purple disabled:opacity-50"
    >
      {children}
    </button>
  );
}
