import { useState } from 'react';

type ElderMeetingPautaPasteDialogProps = {
  busy: boolean;
  onAnalyze: (text: string) => void;
  onCancel: () => void;
};

export function ElderMeetingPautaPasteDialog({ busy, onAnalyze, onCancel }: ElderMeetingPautaPasteDialogProps) {
  const [text, setText] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-labelledby="pauta-paste-title"
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-xl"
      >
        <div className="border-b border-jw-border px-5 py-4">
          <h2 id="pauta-paste-title" className="text-base font-semibold text-jw-text">
            Colar pauta
          </h2>
          <p className="mt-1 text-sm text-jw-muted">
            Cole o texto da pauta (WhatsApp, e-mail, PDF copiado, etc.).
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            placeholder="Oração inicial: …&#10;- Assunto 1&#10;- Assunto 2&#10;Oração final: …"
            className="w-full resize-y rounded-lg border border-jw-border bg-jw-bg px-3 py-2.5 text-sm text-jw-text focus:border-jw-purple focus:outline-none"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-jw-border px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-muted hover:border-jw-purple hover:text-jw-text"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => onAnalyze(text.trim())}
            className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
          >
            {busy ? 'Analisando…' : 'Analisar pauta'}
          </button>
        </div>
      </div>
    </div>
  );
}
