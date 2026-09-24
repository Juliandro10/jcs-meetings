import { useEffect, useRef, useState } from 'react';

const PRESETS = [
  'Recapitulação do congresso',
  'Anúncio especial',
  'Parte extra',
];

type AddExtraMeetingPartDialogProps = {
  open: boolean;
  weekLabel: string;
  creating?: boolean;
  onCancel: () => void;
  onConfirm: (title: string) => void;
};

export function AddExtraMeetingPartDialog({
  open,
  weekLabel,
  creating = false,
  onCancel,
  onConfirm,
}: AddExtraMeetingPartDialogProps) {
  const [title, setTitle] = useState(PRESETS[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(PRESETS[0]);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="extra-part-title"
        className="w-full max-w-md rounded-2xl border border-jw-border bg-white p-6 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          const next = title.trim();
          if (!next || creating) return;
          onConfirm(next);
        }}
      >
        <h2 id="extra-part-title" className="text-lg font-semibold text-jw-text">
          Adicionar parte extra
        </h2>
        <p className="mt-2 text-sm text-jw-muted">
          Use quando a semana tiver algo fora do programa da apostila, como a recapitulação do
          congresso. {weekLabel}.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTitle(preset)}
              className={[
                'rounded-full border px-3 py-1 text-xs',
                title === preset
                  ? 'border-jw-purple bg-jw-purple/10 text-jw-purple'
                  : 'border-jw-border text-jw-muted hover:border-jw-purple/40',
              ].join(' ')}
            >
              {preset}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-jw-muted">Título da parte</span>
          <input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-lg border border-jw-border px-3 py-2 text-sm text-jw-text outline-none focus:border-jw-purple"
            placeholder="Ex.: Recapitulação do congresso"
          />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={creating}
            onClick={onCancel}
            className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-text hover:border-jw-purple/40 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="rounded-lg bg-jw-purple px-4 py-2 text-sm text-white hover:bg-jw-purple-dark disabled:opacity-50"
          >
            {creating ? 'Criando…' : 'Abrir editor'}
          </button>
        </div>
      </form>
    </div>
  );
}
