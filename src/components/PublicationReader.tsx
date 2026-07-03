import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  applyAllHighlights,
  findHighlightByQuote,
  type DocumentHighlight,
  type HighlightColorId,
} from '@/lib/highlight-dom';
import { applyAllNoteAnchors, repositionNoteMarkers, type DocumentNote } from '@/lib/note-dom';
import { buildLfbStudyFieldsHtml, isLfbStudyFieldId, LFB_STUDY_QUESTIONS } from '@/lib/lfb-study-fields';
import { setupAutoResizeTextarea } from '@/lib/auto-resize-textarea';

export type PublicationReaderHandle = {
  applyHighlights: (highlights: DocumentHighlight[]) => void;
  applyNotes: (notes: DocumentNote[]) => void;
  highlightQuote: (blockId: string, text: string, color: HighlightColorId) => DocumentHighlight | null;
  reloadDocument: () => Promise<void>;
};

type PublicationReaderProps = {
  pub: 'mwb' | 'w' | 'lfb';
  documentId: number;
  issue?: string;
  injectStudyFields?: boolean;
  onJwpubLinkClick?: (href: string, label: string) => void;
  onSelectionToolbar?: (payload: { open: boolean; x: number; y: number }) => void;
  onNoteClick?: (noteId: string) => void;
};

export const PublicationReader = forwardRef<PublicationReaderHandle, PublicationReaderProps>(
  function PublicationReader(
    { pub, documentId, issue, injectStudyFields, onJwpubLinkClick, onSelectionToolbar, onNoteClick },
    ref,
  ) {
    const columnRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [resolvedIssue, setResolvedIssue] = useState<string | undefined>();
    const linkHandlerRef = useRef(onJwpubLinkClick);
    const selectionHandlerRef = useRef(onSelectionToolbar);
    const noteClickHandlerRef = useRef(onNoteClick);

    linkHandlerRef.current = onJwpubLinkClick;
    selectionHandlerRef.current = onSelectionToolbar;
    noteClickHandlerRef.current = onNoteClick;

    async function mountDocument() {
      setLoading(true);
      setError(null);

      try {
        if (!window.jcs?.getDocumentHtml) {
          setError('Leitor disponível apenas no app Electron.');
          return;
        }

        const result = await window.jcs.getDocumentHtml({ pub, documentId, issue });
        const issueOk = pub === 'lfb' ? result.issue !== undefined : Boolean(result.issue);
        if (!result.ok || !result.html || !issueOk) {
          setError(result.error ?? 'Não foi possível carregar a matéria.');
          return;
        }

        const root = containerRef.current;
        if (!root) {
          setError('Não foi possível montar o leitor.');
          return;
        }

        root.innerHTML = result.html;
        if (pub === 'lfb' && injectStudyFields !== false && !root.querySelector('.jcs-lfb-study-prep')) {
          root.insertAdjacentHTML('beforeend', buildLfbStudyFieldsHtml());
        }
        const resolved = result.issue ?? '';
        setResolvedIssue(resolved);

        const legacyFieldValues =
          pub === 'lfb'
            ? await window.jcs.getFieldValues({
                pub,
                issue: resolved,
                documentId,
              })
            : {};

        const savedFields =
          pub === 'lfb'
            ? {}
            : legacyFieldValues;

        const savedNotes =
          pub === 'lfb' && window.jcs.getNotes
            ? await window.jcs.getNotes({ pub, issue: resolved, documentId })
            : [];
        const studyNotesById = new Map(
          savedNotes.filter((note) => isLfbStudyFieldId(note.id)).map((note) => [note.id, note]),
        );

        const fields = root.querySelectorAll<HTMLTextAreaElement>('textarea');
        fields.forEach((textarea, index) => {
          const fieldId = textarea.id || textarea.getAttribute('data-pid') || String(index);
          const isLfbStudyField = pub === 'lfb' && isLfbStudyFieldId(fieldId);
          const studyNote = isLfbStudyField ? studyNotesById.get(fieldId) : undefined;

          if (isLfbStudyField) {
            const legacyKey = `${pub}_${resolved}_d${documentId}_f${fieldId}`;
            const legacyValue = legacyFieldValues[legacyKey];
            if (studyNote?.body) {
              textarea.value = studyNote.body;
            } else if (legacyValue && window.jcs.saveNote) {
              textarea.value = legacyValue;
              const questionIndex = ['study-q1', 'study-q2', 'study-q3'].indexOf(fieldId);
              void window.jcs.saveNote({
                pub,
                issue: resolved,
                documentId,
                note: {
                  id: fieldId,
                  title: LFB_STUDY_QUESTIONS[questionIndex] ?? fieldId,
                  body: legacyValue,
                  blockId: '1',
                  anchorText: '',
                  startOffset: 0,
                  endOffset: 0,
                  tags: ['lfb-study'],
                },
              });
            }
          } else {
            const key = `${pub}_${resolved}_d${documentId}_f${fieldId}`;
            if (savedFields[key]) textarea.value = savedFields[key];
          }

          textarea.classList.add('jcs-editable-field');
          textarea.setAttribute('rows', '1');
          setupAutoResizeTextarea(textarea);
          textarea.addEventListener('input', () => {
            if (isLfbStudyField && window.jcs.saveNote) {
              const questionIndex = ['study-q1', 'study-q2', 'study-q3'].indexOf(fieldId);
              void window.jcs.saveNote({
                pub,
                issue: resolved,
                documentId,
                note: {
                  id: fieldId,
                  title: LFB_STUDY_QUESTIONS[questionIndex] ?? fieldId,
                  body: textarea.value,
                  blockId: studyNote?.blockId ?? '1',
                  anchorText: '',
                  startOffset: 0,
                  endOffset: 0,
                  tags: ['lfb-study'],
                },
              });
              return;
            }

            void window.jcs.setFieldValue({
              pub,
              issue: resolved,
              documentId,
              fieldId,
              value: textarea.value,
            });
          });
        });

        const highlights = await window.jcs.getHighlights({
          pub,
          issue: resolved,
          documentId,
        });
        applyAllHighlights(root, highlights as DocumentHighlight[]);

        const notes =
          pub === 'lfb'
            ? savedNotes.filter((note) => !isLfbStudyFieldId(note.id))
            : await window.jcs.getNotes?.({
                pub,
                issue: resolved,
                documentId,
              });
        if (notes?.length) applyAllNoteAnchors(root, notes);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar matéria';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    useImperativeHandle(ref, () => ({
      applyHighlights(highlights) {
        const root = containerRef.current;
        if (!root) return;
        applyAllHighlights(root, highlights);
      },
      applyNotes(notes) {
        const root = containerRef.current;
        if (!root) return;
        applyAllNoteAnchors(root, notes);
      },
      highlightQuote(blockId, text, color) {
        const root = containerRef.current;
        if (!root) return null;
        return findHighlightByQuote(root, blockId, text, color);
      },
      reloadDocument: mountDocument,
    }));

    useEffect(() => {
      void mountDocument();
    }, [pub, documentId, issue]);

    useEffect(() => {
      const root = containerRef.current;
      if (!root || loading || error) return;

      const syncMarkers = () => repositionNoteMarkers(root);
      syncMarkers();

      window.addEventListener('resize', syncMarkers);
      const scrollParent = root.closest('.overflow-auto');
      scrollParent?.addEventListener('scroll', syncMarkers, { passive: true });

      const resizeObserver = new ResizeObserver(syncMarkers);
      resizeObserver.observe(root);

      return () => {
        window.removeEventListener('resize', syncMarkers);
        scrollParent?.removeEventListener('scroll', syncMarkers);
        resizeObserver.disconnect();
      };
    }, [loading, error, pub, documentId, issue]);

    useEffect(() => {
      const column = columnRef.current;
      const root = containerRef.current;
      if (!column || !root || loading || error) return;

      const handleClick = (event: MouseEvent) => {
        const noteMarker = (event.target as HTMLElement | null)?.closest('.jcs-note-marker');
        if (noteMarker instanceof HTMLElement && noteMarker.dataset.noteId) {
          event.preventDefault();
          event.stopPropagation();
          noteClickHandlerRef.current?.(noteMarker.dataset.noteId);
          return;
        }

        const anchor = (event.target as HTMLElement | null)?.closest('a');
        if (!anchor || !root.contains(anchor)) return;
        const href = anchor.getAttribute('href');
        if (!href?.startsWith('jwpub://')) return;
        event.preventDefault();
        linkHandlerRef.current?.(href, anchor.textContent?.trim() ?? '');
      };

      const handleMouseUp = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !root.contains(selection.anchorNode)) {
          selectionHandlerRef.current?.({ open: false, x: 0, y: 0 });
          return;
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        selectionHandlerRef.current?.({
          open: true,
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
      };

      column.addEventListener('click', handleClick);
      root.addEventListener('mouseup', handleMouseUp);
      return () => {
        column.removeEventListener('click', handleClick);
        root.removeEventListener('mouseup', handleMouseUp);
      };
    }, [loading, error]);

    if (error) {
      return (
        <div className="rounded-lg border border-jw-border bg-jw-surface p-6 text-sm text-jw-muted">
          {error}
        </div>
      );
    }

    return (
      <div className="relative min-h-[200px]">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-jw-muted">
            Carregando matéria…
          </div>
        ) : null}
        <div ref={columnRef} className="jcs-reading-column relative mx-auto w-full max-w-3xl px-2 py-4">
          <div
            ref={containerRef}
            className={['jwpub-content', loading ? 'hidden' : ''].join(' ')}
            data-jcs-issue={resolvedIssue}
          />
        </div>
      </div>
    );
  },
);
