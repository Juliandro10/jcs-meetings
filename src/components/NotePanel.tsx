import { useEffect, useRef, useState } from 'react';
import type { DocumentNote } from '@/lib/note-dom';

type NotePanelProps = {
  note: DocumentNote;
  onChange: (patch: Partial<Pick<DocumentNote, 'title' | 'body' | 'tags'>>) => void;
  onClose: () => void;
  onDelete: () => void;
  embedded?: boolean;
};

export function NotePanel({ note, onChange, onClose, onDelete, embedded = false }: NotePanelProps) {
  const [tagDraft, setTagDraft] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bodyRef.current?.focus();
  }, [note.id]);

  const addTag = () => {
    const value = tagDraft.trim();
    if (!value || note.tags.includes(value)) {
      setTagDraft('');
      return;
    }
    onChange({ tags: [...note.tags, value] });
    setTagDraft('');
  };

  return (
    <section
      className={
        embedded
          ? 'mb-4 overflow-hidden rounded-lg border border-jw-border bg-white shadow-sm'
          : 'flex w-full max-w-sm shrink-0 flex-col border-l border-jw-border bg-[#f3f3f3]'
      }
    >
      <div className="flex items-start gap-2 border-b border-jw-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={note.title}
            onChange={(event) => onChange({ title: event.target.value })}
            className="w-full bg-transparent text-sm font-medium text-jw-text outline-none"
            aria-label="Título da nota"
          />
        </div>
        <button
          type="button"
          aria-label="Fechar nota"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-jw-muted hover:bg-jw-purple-light hover:text-jw-purple"
        >
          ✕
        </button>
      </div>

      <div className={`flex flex-col gap-3 p-4 ${embedded ? '' : 'min-h-0 flex-1'}`}>
        <textarea
          ref={bodyRef}
          value={note.body}
          onChange={(event) => onChange({ body: event.target.value })}
          placeholder="Escreva sua nota…"
          className={[
            'resize-none rounded-lg border border-jw-border bg-jw-surface px-3 py-2 text-sm text-jw-text outline-none focus:border-jw-purple',
            embedded ? 'min-h-[160px]' : 'min-h-[220px] flex-1',
          ].join(' ')}
        />

        <div className="flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onChange({ tags: note.tags.filter((item) => item !== tag) })}
              className="rounded-full border border-jw-border px-2 py-0.5 text-xs text-jw-muted hover:border-jw-purple hover:text-jw-purple"
              title="Remover etiqueta"
            >
              {tag} ×
            </button>
          ))}
          <div className="flex items-center gap-1 rounded-full border border-jw-border px-2 py-0.5">
            <input
              type="text"
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTag();
                }
              }}
              placeholder="Etiqueta"
              className="w-24 bg-transparent text-xs text-jw-text outline-none"
            />
            <button type="button" onClick={addTag} className="text-xs text-jw-purple hover:underline">
              + Adicionar uma etiqueta
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-jw-border px-4 py-3">
        <button type="button" onClick={onDelete} className="text-xs text-red-600 hover:underline">
          Excluir nota
        </button>
      </div>
    </section>
  );
}
