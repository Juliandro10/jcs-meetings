import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { referencePlainText } from '@/components/AssistantChat';
import { getDownloadPercent } from '@/components/DownloadProgressBar';
import { DownloadPublicationModal } from '@/components/DownloadPublicationModal';
import { HighlightToolbar } from '@/components/HighlightToolbar';
import { PublicationReader, type PublicationReaderHandle } from '@/components/PublicationReader';
import { readBibleEdition } from '@/lib/bible-edition';
import { SidePanel, type SidePanelTab } from '@/components/SidePanel';
import { DiscourseScriptEditorPage } from '@/pages/DiscourseScriptEditorPage';
import { isDiscourseScriptNote } from '../../shared/discourse-script';
import { StudyBookReader } from '@/components/StudyBookReader';
import type { ReaderOpenTarget } from '@/pages/MeetingsPage';
import type { MeetingWeek } from '@/lib/meeting-types';
import {
  applyHighlight,
  serializeSelection,
  type HighlightColorId,
} from '@/lib/highlight-dom';
import { applyNoteAnchor, noteFromSelection, removeNoteAnchor, type DocumentNote } from '@/lib/note-dom';
import { isLfbStudyFieldId } from '@/lib/lfb-study-fields';
import type { ResolveLinkResult, StudyBookStoryRef } from '../../electron/types';

type StudyBookSession = {
  href: string;
  linkLabel?: string;
  pub: 'lfb' | 'wcg';
  stories: StudyBookStoryRef[];
  currentIndex: number;
};

const STUDY_BOOK_LABELS: Record<'lfb' | 'wcg', string> = {
  lfb: 'Aprenda com as Histórias da Bíblia',
  wcg: 'Ande Corajosamente com Deus',
};

function isStudyBookPub(pub: string): pub is 'lfb' | 'wcg' {
  return pub === 'lfb' || pub === 'wcg';
}

type ReaderPageProps = {
  target: ReaderOpenTarget;
  week: MeetingWeek | null;
  weekLabel: string;
  bibleReading?: string;
  downloadProgressMap: Record<string, number>;
  showElder?: boolean;
  onBack: () => void;
  onOpenSearch?: (query?: string) => void;
  onOpenDictionary?: (query?: string) => void;
};

function getSelectedTextFromReader() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return undefined;
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  return text.length >= 3 ? text : undefined;
}

export function ReaderPage({
  target,
  week,
  weekLabel,
  bibleReading,
  downloadProgressMap,
  showElder = false,
  onBack,
  onOpenSearch,
  onOpenDictionary,
}: ReaderPageProps) {
  const readerRef = useRef<PublicationReaderHandle>(null);
  const studyReaderRef = useRef<PublicationReaderHandle>(null);
  const pendingStudyBookOpenRef = useRef(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('references');
  const [panelLoading, setPanelLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [autoPrepping, setAutoPrepping] = useState(false);
  const [fullDiscoursePrepping, setFullDiscoursePrepping] = useState(false);
  const [lfbPrepping, setLfbPrepping] = useState(false);
  const [clearingPrep, setClearingPrep] = useState(false);
  const [autoPrepMessage, setAutoPrepMessage] = useState<string | null>(null);
  const [fullEditorOpen, setFullEditorOpen] = useState(false);
  const [exportingDiscourse, setExportingDiscourse] = useState<'doc' | 'pdf' | null>(null);
  const [lfbPrepMessage, setLfbPrepMessage] = useState<string | null>(null);
  const [reference, setReference] = useState<ResolveLinkResult | null>(null);
  const [studyBookSession, setStudyBookSession] = useState<StudyBookSession | null>(null);
  const [selectedText, setSelectedText] = useState<string | undefined>();
  const [toolbar, setToolbar] = useState({ open: false, x: 0, y: 0 });
  const [notes, setNotes] = useState<DocumentNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const saveNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const title =
    target.pub === 'mwb'
      ? 'Apostila da Reunião Vida e Ministério Cristão'
      : 'A Sentinela — Edição de Estudo';

  const activeNote = useMemo(
    () => notes.find((note) => note.id === activeNoteId) ?? null,
    [activeNoteId, notes],
  );

  const activeStory = studyBookSession?.stories[studyBookSession.currentIndex] ?? null;

  const studyBookPub = studyBookSession?.pub ?? 'lfb';

  const loadNotes = useCallback(async () => {
    if (!window.jcs?.getNotes || !target.issue) return;
    const pub = studyBookSession ? studyBookPub : target.pub;
    const issue = studyBookSession ? '' : target.issue;
    const documentId = studyBookSession ? activeStory?.documentId : target.documentId;
    if (!documentId) return;

    const loaded = await window.jcs.getNotes({ pub, issue, documentId });
    setNotes(loaded);
  }, [activeStory?.documentId, studyBookPub, studyBookSession, target.documentId, target.issue, target.pub]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    setLfbPrepMessage(null);
  }, [studyBookSession?.currentIndex, activeStory?.documentId]);

  const prepTarget = useMemo(() => {
    if (studyBookSession && activeStory?.documentId) {
      return { pub: studyBookPub, issue: '', documentId: activeStory.documentId };
    }
    return { pub: target.pub, issue: target.issue ?? '', documentId: target.documentId };
  }, [activeStory?.documentId, studyBookPub, studyBookSession, target.documentId, target.issue, target.pub]);

  const persistNote = useCallback(
    (note: DocumentNote) => {
      if (!window.jcs?.saveNote) return;
      if (!isStudyBookPub(prepTarget.pub) && !prepTarget.issue) return;
      if (saveNoteTimerRef.current) clearTimeout(saveNoteTimerRef.current);
      saveNoteTimerRef.current = setTimeout(() => {
        void window.jcs
          ?.saveNote?.({
            pub: prepTarget.pub,
            issue: prepTarget.issue,
            documentId: prepTarget.documentId,
            note,
          })
          .then(setNotes);
      }, 350);
    },
    [prepTarget],
  );

  const openNote = useCallback((noteId: string) => {
    setActiveNoteId(noteId);
    setPanelOpen(true);
    setPanelTab('references');
  }, []);

  const createNoteFromSelection = useCallback(async () => {
    if (!isStudyBookPub(prepTarget.pub) && !prepTarget.issue) return;
    const root = document.querySelector<HTMLElement>('.jwpub-content');
    if (!root) return;

    const draft = noteFromSelection(root);
    if (!draft) {
      setAutoPrepMessage('Selecione um trecho na matéria para criar a nota.');
      setToolbar({ open: false, x: 0, y: 0 });
      return;
    }

    const note: DocumentNote = { ...draft, body: '', tags: [] };
    applyNoteAnchor(root, note);

    const saved = await window.jcs?.saveNote?.({
      pub: prepTarget.pub,
      issue: prepTarget.issue,
      documentId: prepTarget.documentId,
      note,
    });
    if (saved) setNotes(saved);

    window.getSelection()?.removeAllRanges();
    setToolbar({ open: false, x: 0, y: 0 });
    setPanelOpen(true);
    setPanelTab('references');
    setActiveNoteId(note.id);
  }, [prepTarget]);

  const updateActiveNote = useCallback(
    (patch: Partial<Pick<DocumentNote, 'title' | 'body' | 'tags'>>) => {
      if (!activeNoteId) return;
      setNotes((current) => {
        const next = current.map((note) =>
          note.id === activeNoteId ? { ...note, ...patch } : note,
        );
        const updated = next.find((note) => note.id === activeNoteId);
        if (updated) {
          persistNote(updated);
          if (patch.body !== undefined && isLfbStudyFieldId(activeNoteId)) {
            const textarea = document.querySelector<HTMLTextAreaElement>(`#${activeNoteId}`);
            if (textarea && textarea.value !== patch.body) {
              textarea.value = patch.body;
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        }
        return next;
      });
    },
    [activeNoteId, persistNote],
  );

  const deleteActiveNote = useCallback(async () => {
    if (!activeNoteId || !window.jcs?.removeNote) return;
    if (!isStudyBookPub(prepTarget.pub) && !prepTarget.issue) return;

    const root = document.querySelector<HTMLElement>('.jwpub-content');
    if (root) removeNoteAnchor(root, activeNoteId);

    const saved = await window.jcs.removeNote({
      pub: prepTarget.pub,
      issue: prepTarget.issue,
      documentId: prepTarget.documentId,
      noteId: activeNoteId,
    });
    setNotes(saved);
    setActiveNoteId(null);
  }, [activeNoteId, prepTarget]);

  useEffect(() => {
    const syncSelection = () => setSelectedText(getSelectedTextFromReader());
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, []);

  useEffect(
    () => () => {
      if (saveNoteTimerRef.current) clearTimeout(saveNoteTimerRef.current);
    },
    [],
  );

  const assistantContext = useMemo(
    () => ({
      weekLabel,
      publicationTitle: `${title} — ${target.title}`,
      bibleReading,
      selectedText,
      sourcePub: target.pub,
      sourceIssue: target.issue,
      sourceDocumentId: target.documentId,
      referenceTitle: reference?.ok ? reference.title : undefined,
      referenceText: reference?.ok ? referencePlainText(reference.html) : undefined,
    }),
    [bibleReading, reference, selectedText, target.documentId, target.issue, target.pub, target.title, title, weekLabel],
  );

  const openReference = useCallback(
    async (href: string, linkLabel: string) => {
      if (!window.jcs?.resolveLink || !target.issue) return;

      setPanelOpen(true);
      setPanelTab('references');
      setPanelLoading(true);
      setReference(null);

      const result = await window.jcs.resolveLink({
        href,
        linkLabel,
        sourcePub: target.pub,
        sourceIssue: target.issue,
        bibleEdition: readBibleEdition(),
      });

      setReference(result);
      setPanelLoading(false);
    },
    [target.issue, target.pub],
  );

  const activeDownloadPercent = getDownloadPercent(downloadProgressMap, downloadingKey, downloading);

  const handleDownloadPublication = useCallback(async () => {
    const download = reference?.download;
    if (!download || !window.jcs?.downloadPub) return;

    const key = `${download.pub}_${download.issue}`;
    setDownloadingKey(key);
    setDownloading(true);
    const result = await window.jcs.downloadPub({
      pub: download.pub,
      issue: download.issue,
    });
    setDownloading(false);
    setDownloadingKey(null);
    setDownloadModalOpen(false);

    if (result.ok && reference?.studyBook) {
      const refreshed = await window.jcs.resolveLink?.({
        href: reference.studyBook.href,
        linkLabel: reference.studyBook.linkLabel,
        sourcePub: target.pub,
        sourceIssue: target.issue!,
      });
      if (refreshed) setReference(refreshed);

      if (pendingStudyBookOpenRef.current && refreshed?.studyBook?.stories.some((s) => s.documentId > 0)) {
        pendingStudyBookOpenRef.current = false;
        setStudyBookSession({
          href: refreshed.studyBook.href,
          linkLabel: refreshed.studyBook.linkLabel,
          pub: refreshed.studyBook.pub ?? 'lfb',
          stories: refreshed.studyBook.stories.filter((s) => s.documentId > 0),
          currentIndex: 0,
        });
        setPanelOpen(true);
        setPanelTab('references');
      }
    } else if (!result.ok) {
      setReference((current) =>
        current ? { ...current, error: result.error ?? 'Falha ao baixar publicação.' } : current,
      );
    }
  }, [reference?.download, reference?.studyBook, target.issue, target.pub]);

  const openStudyBookFromReference = useCallback((ref: ResolveLinkResult) => {
    const stories = ref.studyBook?.stories.filter((story) => story.documentId > 0) ?? [];
    const pub = ref.studyBook?.pub ?? 'lfb';
    if (!ref.studyBook || stories.length === 0) {
      setAutoPrepMessage(`Baixe o livro ${STUDY_BOOK_LABELS[pub]} para abrir o estudo.`);
      return;
    }

    setStudyBookSession({
      href: ref.studyBook.href,
      linkLabel: ref.studyBook.linkLabel,
      pub,
      stories,
      currentIndex: 0,
    });
    setPanelOpen(true);
    setPanelTab('references');
    setLfbPrepMessage(null);
  }, []);

  const handleExpandStudyBook = useCallback(() => {
    if (!reference?.studyBook) return;

    if (reference.download?.downloaded === false) {
      pendingStudyBookOpenRef.current = true;
      setDownloadModalOpen(true);
      return;
    }

    openStudyBookFromReference(reference);
  }, [openStudyBookFromReference, reference]);

  const handleStudyBookPrep = useCallback(async () => {
    if (!studyBookSession || !activeStory?.documentId) return;

    const prepFn =
      studyBookPub === 'wcg' ? window.jcs?.wcgPrep : window.jcs?.lfbPrep;
    if (!prepFn) return;

    setLfbPrepping(true);
    setLfbPrepMessage(null);

    const result = await prepFn({
      documentIds: [activeStory.documentId],
      weekLabel,
    });

    setLfbPrepping(false);

    if (!result.ok) {
      setLfbPrepMessage(
        result.error ??
          (studyBookPub === 'wcg' ? 'Falha ao preparar o estudo.' : 'Falha ao preparar lições.'),
      );
      return;
    }

    await studyReaderRef.current?.reloadDocument();
    const highlights = await window.jcs.getHighlights({
      pub: studyBookPub,
      issue: '',
      documentId: activeStory.documentId,
    });
    studyReaderRef.current?.applyHighlights(highlights);

    await loadNotes();
    setPanelOpen(true);
    setPanelTab('references');

    const unitLabel = studyBookPub === 'wcg' ? 'Estudo preparado' : 'Lições preparadas';
    setLfbPrepMessage(
      `${unitLabel}: ${result.highlights?.length ?? 0} grifo(s) e ${result.notes?.length ?? 0} nota(s)/resposta(s).`,
    );
  }, [activeStory?.documentId, loadNotes, studyBookPub, studyBookSession, weekLabel]);

  const handleStudyBookClearPrep = useCallback(async () => {
    if (!window.jcs?.clearDocumentPrep || !studyBookSession || !activeStory?.documentId) return;
    const confirmMessage =
      studyBookPub === 'wcg'
        ? 'Limpar grifos, notas de condução e respostas deste capítulo?'
        : 'Limpar grifos, notas e respostas preenchidas desta história?';
    if (!window.confirm(confirmMessage)) return;

    setClearingPrep(true);
    setLfbPrepMessage(null);

    const removed = await window.jcs.clearDocumentPrep({
      pub: studyBookPub,
      issue: '',
      documentId: activeStory.documentId,
    });

    setNotes([]);
    setActiveNoteId(null);
    await studyReaderRef.current?.reloadDocument();
    setClearingPrep(false);
    setLfbPrepMessage(
      `Preparação limpa: ${removed.highlights} grifo(s), ${removed.fields} campo(s) e ${removed.notes} nota(s) removidos.`,
    );
  }, [activeStory?.documentId, studyBookPub, studyBookSession]);

  const applyHighlightColor = useCallback(
    async (color: HighlightColorId) => {
      if (!target.issue) return;
      const root = document.querySelector<HTMLElement>('.jwpub-content');
      if (!root) return;

      const draft = serializeSelection(root);
      if (!draft) {
        setToolbar({ open: false, x: 0, y: 0 });
        return;
      }

      draft.color = color;
      if (!applyHighlight(root, draft)) {
        setAutoPrepMessage('Não foi possível grifar este trecho.');
        setToolbar({ open: false, x: 0, y: 0 });
        return;
      }

      await window.jcs?.saveHighlight?.({
        pub: target.pub,
        issue: target.issue,
        documentId: target.documentId,
        highlight: draft,
      });

      window.getSelection()?.removeAllRanges();
      setToolbar({ open: false, x: 0, y: 0 });
    },
    [target.documentId, target.issue, target.pub],
  );

  const handleClearPrep = useCallback(async () => {
    if (!window.jcs?.clearDocumentPrep || !target.issue) return;
    if (!window.confirm('Limpar grifos, notas e campos preenchidos desta matéria?')) return;

    setClearingPrep(true);
    setAutoPrepMessage(null);

    const removed = await window.jcs.clearDocumentPrep({
      pub: target.pub,
      issue: target.issue,
      documentId: target.documentId,
    });

    setNotes([]);
    setActiveNoteId(null);
    await readerRef.current?.reloadDocument();
    setClearingPrep(false);
    setAutoPrepMessage(
      `Preparação limpa: ${removed.highlights} grifo(s), ${removed.fields} campo(s) e ${removed.notes} nota(s) removidos.`,
    );
  }, [target.documentId, target.issue, target.pub]);

  const handleAutoPrep = useCallback(async () => {
    if (!window.jcs?.autoPrep || !target.issue) return;

    setAutoPrepping(true);
    setAutoPrepMessage(null);

    const result = await window.jcs.autoPrep({
      pub: target.pub,
      issue: target.issue,
      documentId: target.documentId,
      weekLabel,
      bibleReading,
      publicationTitle: `${title} — ${target.title}`,
    });

    setAutoPrepping(false);

    if (!result.ok) {
      setAutoPrepMessage(result.error ?? 'Falha na preparação automática.');
      return;
    }

    await readerRef.current?.reloadDocument();

    const highlights = await window.jcs.getHighlights({
      pub: target.pub,
      issue: target.issue,
      documentId: target.documentId,
    });
    readerRef.current?.applyHighlights(highlights);

    const loadedNotes = await window.jcs.getNotes?.({
      pub: target.pub,
      issue: target.issue,
      documentId: target.documentId,
    });
    if (loadedNotes?.length) {
      setNotes(loadedNotes);
      readerRef.current?.applyNotes(loadedNotes);
    }

    const count = result.highlights?.length ?? 0;
    const fields = result.fields?.length ?? 0;
    const noteCount = result.notes?.length ?? 0;
    setAutoPrepMessage(
      `Preparação concluída: ${count} grifo(s), ${fields} campo(s) e ${noteCount} nota(s).`,
    );
  }, [bibleReading, target, title, weekLabel]);

  const handleFullDiscoursePrep = useCallback(async () => {
    if (!window.jcs?.fullDiscoursePrep || !target.issue || target.pub !== 'mwb') return;

    setFullDiscoursePrepping(true);
    setAutoPrepMessage(null);

    const result = await window.jcs.fullDiscoursePrep({
      pub: target.pub,
      issue: target.issue,
      documentId: target.documentId,
      weekLabel,
      bibleReading,
      publicationTitle: `${title} — ${target.title}`,
    });

    setFullDiscoursePrepping(false);

    if (!result.ok) {
      setAutoPrepMessage(result.error ?? 'Falha na preparação completa.');
      return;
    }

    await readerRef.current?.reloadDocument();

    const loadedNotes = await window.jcs.getNotes?.({
      pub: target.pub,
      issue: target.issue,
      documentId: target.documentId,
    });
    if (loadedNotes?.length) {
      setNotes(loadedNotes);
      readerRef.current?.applyNotes(loadedNotes);
    }

    const noteCount = result.notes?.length ?? 0;
    const fields = result.fields?.length ?? 0;
    setAutoPrepMessage(
      `Preparação completa: ${noteCount} roteiro(s) de tribuna${fields ? ` e ${fields} campo(s) preenchido(s)` : ''}. Edite nas notas da matéria.`,
    );
  }, [bibleReading, target, title, weekLabel]);

  const handleExportDiscourse = useCallback(
    async (format: 'doc' | 'pdf') => {
      if (!activeNote || !window.jcs?.exportDiscourseScript || !target.issue) return;
      setExportingDiscourse(format);
      try {
        const result = await window.jcs.exportDiscourseScript({
          title: activeNote.title,
          weekLabel,
          format,
          value: activeNote.body,
        });
        if (!result.ok) {
          setAutoPrepMessage(result.error ?? 'Não foi possível exportar o roteiro.');
        }
      } finally {
        setExportingDiscourse(null);
      }
    },
    [activeNote, target.issue, weekLabel],
  );

  const handleDiscourseSaved = useCallback(
    (updated: DocumentNote) => {
      setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)));
      readerRef.current?.applyNotes([updated]);
    },
    [],
  );

  if (fullEditorOpen && activeNote && isDiscourseScriptNote(activeNote) && target.issue && week) {
    return (
      <DiscourseScriptEditorPage
        note={activeNote}
        week={week}
        weekLabel={weekLabel}
        bibleReading={bibleReading}
        pub={target.pub}
        issue={target.issue}
        documentId={target.documentId}
        onBack={async () => {
          setFullEditorOpen(false);
          if (window.jcs?.getNotes && target.issue) {
            const loaded = await window.jcs.getNotes({
              pub: target.pub,
              issue: target.issue,
              documentId: target.documentId,
            });
            setNotes(loaded);
            readerRef.current?.applyNotes(loaded);
          }
        }}
        onSaved={handleDiscourseSaved}
      />
    );
  }

  if (studyBookSession && activeStory) {
    return (
      <>
        <StudyBookReader
          weekLabel={weekLabel}
          storyNumber={activeStory.storyNumber}
          storyTitle={activeStory.title}
          storyIndex={studyBookSession.currentIndex}
          storyCount={studyBookSession.stories.length}
          bookLabel={STUDY_BOOK_LABELS[studyBookPub]}
          enableStudyPrep
          prepPrepareLabel={studyBookPub === 'wcg' ? 'Preparar estudo' : 'Preparar lições'}
          prepClearLabel={studyBookPub === 'wcg' ? 'Limpar preparação' : 'Limpar preparação'}
          prepping={lfbPrepping}
          clearingPrep={clearingPrep}
          prepMessage={lfbPrepMessage}
          panelOpen={panelOpen}
          panelTab={panelTab}
          panelLoading={panelLoading}
          reference={reference}
          downloading={downloading}
          assistantContext={assistantContext}
          reader={
            <PublicationReader
              ref={studyReaderRef}
              pub={studyBookPub}
              documentId={activeStory.documentId}
              issue=""
              onStudyNotesUpdated={loadNotes}
              onJwpubLinkClick={(href, label) => {
                void openReference(href, label);
                setPanelOpen(true);
                setPanelTab('references');
              }}
              onSelectionToolbar={setToolbar}
              onNoteClick={openNote}
            />
          }
          onBackToApostila={() => {
            setStudyBookSession(null);
            setPanelOpen(true);
            setPanelTab('references');
          }}
          onPrevStory={() => {
            setStudyBookSession((current) =>
              current && current.currentIndex > 0
                ? { ...current, currentIndex: current.currentIndex - 1 }
                : current,
            );
          }}
          onNextStory={() => {
            setStudyBookSession((current) =>
              current && current.currentIndex < current.stories.length - 1
                ? { ...current, currentIndex: current.currentIndex + 1 }
                : current,
            );
          }}
          onPrepareLessons={() => void handleStudyBookPrep()}
          onClearPrep={() => void handleStudyBookClearPrep()}
          onPanelClose={() => setPanelOpen(false)}
          onPanelOpen={() => setPanelOpen(true)}
          onPanelTabChange={setPanelTab}
          onLinkClick={(href, label) => {
            void openReference(href, label);
          }}
          onDownloadPublication={() => {
            void handleDownloadPublication();
          }}
          note={activeNote}
          onNoteChange={updateActiveNote}
          onNoteClose={() => setActiveNoteId(null)}
          onNoteDelete={() => {
            void deleteActiveNote();
          }}
          documentNotes={notes}
          onDocumentNoteSelect={openNote}
        />
        <DownloadPublicationModal
          open={downloadModalOpen}
          title={reference?.download?.label ?? STUDY_BOOK_LABELS[studyBookPub]}
          sizeMb={reference?.download?.sizeMb}
          downloading={downloading}
          downloadPercent={activeDownloadPercent}
          onConfirm={() => void handleDownloadPublication()}
          onCancel={() => {
            pendingStudyBookOpenRef.current = false;
            setDownloadModalOpen(false);
          }}
        />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col bg-jw-bg">
      <div className="flex items-center gap-3 border-b border-jw-border bg-jw-surface px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-3 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
        >
          ← Reuniões
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-jw-text">{title}</p>
          <p className="truncate text-xs text-jw-muted">
            {weekLabel} · {target.title}
          </p>
          {autoPrepMessage ? (
            <p className="truncate text-xs text-jw-purple">{autoPrepMessage}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {onOpenSearch ? (
            <ToolbarButton label="Buscar nas publicações" onClick={() => onOpenSearch()}>
              Buscar
            </ToolbarButton>
          ) : null}
          <ToolbarButton
            label="Destacar — selecione um trecho na matéria"
            onClick={() => {
              const root = document.querySelector<HTMLElement>('.jwpub-content');
              const selection = window.getSelection();
              if (root && selection && !selection.isCollapsed && root.contains(selection.anchorNode)) {
                const rect = selection.getRangeAt(0).getBoundingClientRect();
                setToolbar({ open: true, x: rect.left + rect.width / 2, y: rect.top });
              } else {
                setAutoPrepMessage('Selecione um trecho na matéria para grifar.');
              }
            }}
          >
            Destacar
          </ToolbarButton>
          <ToolbarButton
            label="Limpar preparação desta matéria"
            onClick={() => void handleClearPrep()}
            disabled={clearingPrep || autoPrepping || fullDiscoursePrepping}
          >
            {clearingPrep ? 'Limpando…' : 'Limpar preparação'}
          </ToolbarButton>
          <ToolbarButton
            label="Preparar automaticamente"
            onClick={() => void handleAutoPrep()}
            disabled={autoPrepping || clearingPrep || fullDiscoursePrepping}
          >
            {autoPrepping ? 'Preparando…' : 'Preparar automático'}
          </ToolbarButton>
          {showElder && target.pub === 'mwb' ? (
            <ToolbarButton
              label="Preparação completa de tribuna (Tesouros + Vida Cristã)"
              onClick={() => void handleFullDiscoursePrep()}
              disabled={fullDiscoursePrepping || autoPrepping || clearingPrep}
            >
              {fullDiscoursePrepping ? 'Preparando…' : 'Preparar completo'}
            </ToolbarButton>
          ) : null}
          {!panelOpen ? (
            <ToolbarButton
              label="Abrir assistente IA"
              onClick={() => {
                setPanelOpen(true);
                setPanelTab('assistant');
              }}
            >
              Assistente IA
            </ToolbarButton>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-w-0 flex-1 overflow-auto bg-jw-surface">
          <PublicationReader
            ref={readerRef}
            pub={target.pub}
            documentId={target.documentId}
            issue={target.issue}
            onJwpubLinkClick={(href, label) => {
              void openReference(href, label);
            }}
            onSelectionToolbar={setToolbar}
            onNoteClick={openNote}
          />
          <HighlightToolbar
            open={toolbar.open}
            x={toolbar.x}
            y={toolbar.y}
            onClose={() => setToolbar({ open: false, x: 0, y: 0 })}
            onPickColor={(color) => {
              void applyHighlightColor(color);
            }}
            onAddNote={() => {
              void createNoteFromSelection();
            }}
            onSearchSelection={
              onOpenSearch
                ? (text) => {
                    onOpenSearch(text);
                    setToolbar({ open: false, x: 0, y: 0 });
                  }
                : undefined
            }
            onDictionarySelection={
              onOpenDictionary
                ? (text) => {
                    onOpenDictionary(text);
                    setToolbar({ open: false, x: 0, y: 0 });
                  }
                : undefined
            }
          />
        </div>

        <SidePanel
          open={panelOpen}
          tab={panelTab}
          onTabChange={setPanelTab}
          onClose={() => setPanelOpen(false)}
          referenceLoading={panelLoading}
          reference={reference}
          downloading={downloading}
          downloadPercent={activeDownloadPercent}
          onLinkClick={(href, label) => {
            void openReference(href, label);
          }}
          onDownloadPublication={() => {
            if (reference?.download?.downloaded === false && reference.kind === 'study-book') {
              pendingStudyBookOpenRef.current = false;
              setDownloadModalOpen(true);
              return;
            }
            void handleDownloadPublication();
          }}
          onExpandStudyBook={reference?.kind === 'study-book' ? handleExpandStudyBook : undefined}
          assistantContext={assistantContext}
          note={activeNote}
          onNoteChange={updateActiveNote}
          onNoteClose={() => setActiveNoteId(null)}
          onNoteDelete={() => {
            void deleteActiveNote();
          }}
          onOpenDiscourseEditor={
            activeNote && isDiscourseScriptNote(activeNote) ? () => setFullEditorOpen(true) : undefined
          }
          onExportDiscourse={
            activeNote && isDiscourseScriptNote(activeNote) ? (format) => void handleExportDiscourse(format) : undefined
          }
          exportingDiscourse={exportingDiscourse}
        />
      </div>

      <DownloadPublicationModal
        open={downloadModalOpen}
        title={reference?.download?.label ?? 'Aprenda com as Histórias da Bíblia'}
        sizeMb={reference?.download?.sizeMb}
        downloading={downloading}
        downloadPercent={activeDownloadPercent}
        onConfirm={() => void handleDownloadPublication()}
        onCancel={() => {
          pendingStudyBookOpenRef.current = false;
          setDownloadModalOpen(false);
        }}
      />
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
