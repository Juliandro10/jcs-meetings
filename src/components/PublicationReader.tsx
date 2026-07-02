import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  applyAllHighlights,
  findHighlightByQuote,
  type DocumentHighlight,
  type HighlightColorId,
} from '@/lib/highlight-dom';
import { applyAllNoteAnchors, type DocumentNote } from '@/lib/note-dom';
import { buildLfbStudyFieldsHtml } from '@/lib/lfb-study-fields';
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

        const saved = await window.jcs.getFieldValues({
          pub,
          issue: resolved,
          documentId,
        });

        const fields = root.querySelectorAll<HTMLTextAreaElement>('textarea');
        fields.forEach((textarea, index) => {
          const fieldId = textarea.id || textarea.getAttribute('data-pid') || String(index);
          const key = `${pub}_${resolved}_d${documentId}_f${fieldId}`;
          if (saved[key]) textarea.value = saved[key];

          textarea.classList.add('jcs-editable-field');
          textarea.setAttribute('rows', '1');
          setupAutoResizeTextarea(textarea);
          textarea.addEventListener('input', () => {
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

        const notes = await window.jcs.getNotes?.({
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
      if (!root) return;

      const handleClick = (event: MouseEvent) => {
        const noteAnchor = (event.target as HTMLElement | null)?.closest('.jcs-note-anchor');
        if (noteAnchor instanceof HTMLElement && noteAnchor.dataset.noteId) {
          event.preventDefault();
          noteClickHandlerRef.current?.(noteAnchor.dataset.noteId);
          return;
        }

        const anchor = (event.target as HTMLElement | null)?.closest('a');
        if (!anchor) return;
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

      root.addEventListener('click', handleClick);
      root.addEventListener('mouseup', handleMouseUp);
      return () => {
        root.removeEventListener('click', handleClick);
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
        <div
          ref={containerRef}
          className={[
            'jwpub-content mx-auto max-w-3xl px-2 py-4',
            loading ? 'hidden' : '',
          ].join(' ')}
          data-jcs-issue={resolvedIssue}
        />
      </div>
    );
  },
);
