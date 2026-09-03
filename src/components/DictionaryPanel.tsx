import { useCallback, useEffect, useState } from 'react';
import { AutoCorrectModeSelect } from '@/components/AutoCorrectModeSelect';
import {
  AUTO_CORRECT_MODE_EVENT,
  AUTO_CORRECT_MODE_OPTIONS,
  readAutoCorrectMode,
} from '@/lib/auto-correct-settings';
import type { AutoCorrectMode, DictionaryStatus } from '../../electron/types';

type DictionaryPanelProps = {
  downloadPercent?: number;
  downloading?: boolean;
  onOpenDictionary?: (query?: string) => void;
};

export function DictionaryPanel({
  downloadPercent = 0,
  downloading = false,
  onOpenDictionary,
}: DictionaryPanelProps) {
  const [status, setStatus] = useState<DictionaryStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localDownloading, setLocalDownloading] = useState(false);
  const [autoCorrectMode, setAutoCorrectMode] = useState<AutoCorrectMode>(() => readAutoCorrectMode());

  const refresh = useCallback(async () => {
    if (!window.jcs?.getDictionaryStatus) return;
    const next = await window.jcs.getDictionaryStatus();
    setStatus(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sync = () => setAutoCorrectMode(readAutoCorrectMode());
    window.addEventListener(AUTO_CORRECT_MODE_EVENT, sync);
    return () => window.removeEventListener(AUTO_CORRECT_MODE_EVENT, sync);
  }, []);

  const handleDownload = async () => {
    if (!window.jcs?.downloadDictionary) return;
    setLocalDownloading(true);
    setMessage(null);
    try {
      const result = await window.jcs.downloadDictionary();
      if (!result.ok) {
        setMessage(result.error ?? 'Não foi possível baixar o dicionário.');
        return;
      }
      await refresh();
      setMessage('Dicionário instalado. Você já pode consultar palavras offline.');
    } finally {
      setLocalDownloading(false);
    }
  };

  const openLookup = () => {
    onOpenDictionary?.();
  };

  const isDownloading = downloading || localDownloading;
  const percent = downloadPercent;

  return (
    <>
      <div className="mt-3 overflow-hidden rounded-xl border border-jw-border bg-jw-surface p-4 shadow-sm">
        <p className="text-sm text-jw-muted">
          Dicionário de português (significados comuns), offline, baseado no Wiktionário.
        </p>

        <p className="mt-2 text-[11px] text-jw-muted">
          {status?.installed
            ? `Instalado${status.entryCount ? ` — ${status.entryCount.toLocaleString('pt-BR')} entradas` : ''}.`
            : 'Não instalado — baixe uma vez (~35 MB) para usar offline.'}
        </p>

        {isDownloading ? (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-jw-bg">
              <div
                className="h-full rounded-full bg-jw-purple transition-all"
                style={{ width: `${Math.max(4, percent)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-jw-muted">
              {percent < 40 ? 'Baixando…' : percent < 100 ? 'Organizando entradas…' : 'Concluindo…'}
            </p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {!status?.installed ? (
            <button
              type="button"
              disabled={isDownloading}
              onClick={() => void handleDownload()}
              className="rounded-lg bg-jw-purple px-3 py-2 text-sm font-semibold text-white hover:bg-jw-purple-dark disabled:opacity-50"
            >
              Baixar dicionário
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openLookup()}
              className="rounded-lg bg-jw-purple px-3 py-2 text-sm font-semibold text-white hover:bg-jw-purple-dark"
            >
              Abrir dicionário
            </button>
          )}
        </div>

        {message ? <p className="mt-3 text-sm text-jw-text">{message}</p> : null}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-jw-border bg-jw-surface p-4 shadow-sm">
        <AutoCorrectModeSelect value={autoCorrectMode} onChange={setAutoCorrectMode} />
        <p className="mt-2 text-[11px] text-jw-muted">
          {AUTO_CORRECT_MODE_OPTIONS.find((item) => item.id === autoCorrectMode)?.hint}
        </p>
        <p className="mt-2 text-[11px] text-jw-muted">
          O corretor espera você terminar a palavra (espaço ou pontuação). Não mexe em esta/está, para/pará nem em
          siglas e referências. Ctrl+Z desfaz. O modo com erros óbvios fica melhor com o dicionário instalado.
        </p>
      </div>
    </>
  );
}
