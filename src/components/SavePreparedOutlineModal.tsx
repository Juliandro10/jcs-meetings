import { useEffect, useRef, useState } from 'react';

type SavePreparedOutlineModalProps = {
  open: boolean;
  existingName: string;
  defaultNewName: string;
  saving?: boolean;
  onOverwrite: () => void;
  onSaveAsNew: (name: string) => void;
  onCancel: () => void;
};

export function SavePreparedOutlineModal({
  open,
  existingName,
  defaultNewName,
  saving = false,
  onOverwrite,
  onSaveAsNew,
  onCancel,
}: SavePreparedOutlineModalProps) {
  const [mode, setMode] = useState<'choose' | 'rename'>('choose');
  const [newName, setNewName] = useState(defaultNewName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode('choose');
    setNewName(defaultNewName);
  }, [defaultNewName, open]);

  useEffect(() => {
    if (open && mode === 'rename') {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [mode, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-jw-border bg-jw-surface p-6 shadow-2xl"
      >
        {mode === 'choose' ? (
          <>
            <h2 className="text-lg font-semibold text-jw-text">Esboço já salvo</h2>
            <p className="mt-2 text-sm leading-relaxed text-jw-muted">
              Já existe um esboço preparado chamado{' '}
              <span className="font-medium text-jw-text">"{existingName}"</span>. O que deseja fazer?
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onOverwrite}
                className="rounded-lg bg-jw-purple px-4 py-2.5 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-60"
              >
                Sobrescrever
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setMode('rename')}
                className="rounded-lg border border-jw-border px-4 py-2.5 text-sm text-jw-text hover:border-jw-purple disabled:opacity-60"
              >
                Salvar com outro nome
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onCancel}
                className="rounded-lg px-4 py-2.5 text-sm text-jw-muted hover:text-jw-text disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-jw-text">Novo nome</h2>
            <p className="mt-2 text-sm text-jw-muted">Escolha um nome para esta versão do esboço.</p>
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && newName.trim()) onSaveAsNew(newName.trim());
              }}
              className="mt-4 w-full rounded-lg border border-jw-border px-3 py-2 text-sm text-jw-text outline-none focus:border-jw-purple"
            />
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                disabled={saving || !newName.trim()}
                onClick={() => onSaveAsNew(newName.trim())}
                className="flex-1 rounded-lg bg-jw-purple px-4 py-2.5 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setMode('choose')}
                className="rounded-lg border border-jw-border px-4 py-2.5 text-sm text-jw-muted hover:border-jw-purple"
              >
                Voltar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
