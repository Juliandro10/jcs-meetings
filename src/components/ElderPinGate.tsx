import { useCallback, useRef, useState } from 'react';

type ElderPinGateProps = {
  title?: string;
  description?: string;
  onBack?: () => void;
  onSuccess: () => void;
};

export function ElderPinGate({ title, description, onBack, onSuccess }: ElderPinGateProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  const submitPin = useCallback(async () => {
    if (!window.jcs) {
      setError('Disponível apenas no app Electron.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await window.jcs.lockElderSession?.();
      const result = await window.jcs.unlockElder({ pin });
      if (!result?.ok) {
        setError(result?.error ?? 'PIN incorreto.');
        return;
      }
      onSuccess();
    } finally {
      setBusy(false);
    }
  }, [onSuccess, pin]);

  return (
    <div className="w-full max-w-md rounded-2xl border border-jw-border bg-white p-8 shadow-lg">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-4 text-sm text-jw-muted hover:text-jw-purple"
        >
          ← Voltar
        </button>
      ) : null}

      <h1 className="text-xl font-semibold text-jw-purple-dark">
        {title ?? 'Desbloquear área Elder'}
      </h1>
      <p className="mt-2 text-sm text-jw-muted">
        {description ?? 'Digite o PIN para acessar orientações confidenciais e esboços de ancião.'}
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submitPin();
        }}
      >
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-jw-muted">PIN</span>
          <input
            ref={pinRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            className="mt-1 w-full rounded-lg border border-jw-border px-3 py-2.5 text-lg tracking-[0.3em] text-jw-text outline-none focus:border-jw-purple focus:ring-2 focus:ring-jw-purple/20"
            placeholder="••••"
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={busy || pin.length < 4}
          className="w-full rounded-lg bg-jw-purple px-4 py-3 text-sm font-semibold text-white transition hover:bg-jw-purple-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Verificando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
