import { useEffect, useMemo, useState } from 'react';
import { preparedPartDisplayTitle } from '../../shared/jcs-read-prepared-part';
import { isDiscourseScriptNote } from '../../shared/discourse-script';
import type { DocumentNote } from '@/lib/note-dom';

type PreparedPartsExportDialogProps = {
  open: boolean;
  weekLabel: string;
  notes: DocumentNote[];
  exporting: boolean;
  onCancel: () => void;
  onConfirm: (noteIds: string[]) => void;
};

export function PreparedPartsExportDialog({
  open,
  weekLabel,
  notes,
  exporting,
  onCancel,
  onConfirm,
}: PreparedPartsExportDialogProps) {
  const preparedNotes = useMemo(
    () => notes.filter((note) => isDiscourseScriptNote(note)),
    [notes],
  );
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSelected(preparedNotes.map((note) => note.id));
    }
  }, [open, preparedNotes]);

  if (!open) return null;

  const toggle = (noteId: string) => {
    setSelected((current) =>
      current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prepared-parts-export-title"
        className="w-full max-w-lg rounded-2xl border border-jw-border bg-white p-6 shadow-xl"
      >
        <h2 id="prepared-parts-export-title" className="text-lg font-semibold text-jw-text">
          Roteiros para o tablet
        </h2>
        <p className="mt-2 text-sm text-jw-muted">
          Escolha quais roteiros de tribuna exportar separadamente em {weekLabel}. Cada um vira um
          documento próprio no JCS Read, com links bíblicos clicáveis.
        </p>

        <div className="mt-4 max-h-72 space-y-2 overflow-auto">
          {preparedNotes.map((note) => {
            const title = preparedPartDisplayTitle(note.title || 'Roteiro');
            const checked = selected.includes(note.id);
            return (
              <label
                key={note.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-jw-border px-3 py-3 hover:border-jw-purple/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(note.id)}
                  className="mt-1"
                />
                <span className="min-w-0 text-sm text-jw-text">{title}</span>
              </label>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={onCancel}
            className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-text hover:border-jw-purple/40 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={exporting || selected.length === 0}
            onClick={() => onConfirm(selected)}
            className="rounded-lg bg-jw-purple px-4 py-2 text-sm text-white hover:bg-jw-purple-dark disabled:opacity-50"
          >
            {exporting ? 'Exportando…' : 'Exportar selecionados'}
          </button>
        </div>
      </div>
    </div>
  );
}
