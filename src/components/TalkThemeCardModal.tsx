import { useCallback, useEffect, useMemo, useState } from 'react';
import { composeTalkThemeCardHtml } from '../../shared/talk-theme-card-html';
import { parseTalkTheme } from '../../shared/talk-theme-parse';
import type { PreparedElderOutline } from '../../electron/types';

const STORAGE_SPEAKER = 'jcs-talk-card-speaker';
const STORAGE_CONGREGATION = 'jcs-talk-card-congregation';

type TalkThemeCardModalProps = {
  outline: PreparedElderOutline;
  onClose: () => void;
};

function readStored(key: string) {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStored(key: string, value: string) {
  try {
    if (value.trim()) localStorage.setItem(key, value.trim());
  } catch {
    // ignore
  }
}

export function TalkThemeCardModal({ outline, onClose }: TalkThemeCardModalProps) {
  const theme = useMemo(
    () => parseTalkTheme(outline.sourceTitle, outline.name),
    [outline.name, outline.sourceTitle],
  );

  const [speakerName, setSpeakerName] = useState(() => readStored(STORAGE_SPEAKER));
  const [congregation, setCongregation] = useState(() => readStored(STORAGE_CONGREGATION));
  const [songNumberInput, setSongNumberInput] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [jwOrgFinderUrl, setJwOrgFinderUrl] = useState('');
  const [jwLibraryUrl, setJwLibraryUrl] = useState('');
  const [jwLibraryAndroidIntentUrl, setJwLibraryAndroidIntentUrl] = useState('');
  const [songLoading, setSongLoading] = useState(false);
  const [songError, setSongError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'html' | 'pdf' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'preview'>('form');

  const songNumber = Number(songNumberInput.trim());

  const resolveSong = useCallback(async (number: number) => {
    if (!window.jcs?.resolveSongDigitalLink || !Number.isFinite(number) || number < 1) {
      setSongTitle('');
      setJwOrgFinderUrl('');
      setJwLibraryUrl('');
      setJwLibraryAndroidIntentUrl('');
      return;
    }

    setSongLoading(true);
    setSongError(null);
    try {
      const result = await window.jcs.resolveSongDigitalLink({ songNumber: number, lang: 'T' });
      if (!result.ok) {
        setSongError(result.error ?? 'Cântico não encontrado.');
        return;
      }
      setSongTitle(result.title ?? '');
      setJwOrgFinderUrl(result.jwOrgFinderUrl ?? '');
      setJwLibraryUrl(result.jwLibraryUrl ?? '');
      setJwLibraryAndroidIntentUrl(result.jwLibraryAndroidIntentUrl ?? '');
    } finally {
      setSongLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!songNumberInput.trim()) return;
    const timer = window.setTimeout(() => {
      void resolveSong(Number(songNumberInput.trim()));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [songNumberInput, resolveSong]);

  const canPreview =
    speakerName.trim() &&
    congregation.trim() &&
    theme.themeTitle.trim() &&
    songNumber >= 1 &&
    songTitle.trim() &&
    jwOrgFinderUrl &&
    jwLibraryUrl &&
    jwLibraryAndroidIntentUrl;

  const previewHtml = useMemo(() => {
    if (!canPreview) return '';
    return composeTalkThemeCardHtml({
      themeNumber: theme.themeNumber,
      themeTitle: theme.themeTitle,
      speakerName: speakerName.trim(),
      congregation: congregation.trim(),
      songNumber,
      songTitle: songTitle.trim(),
      jwOrgFinderUrl,
      jwLibraryUrl,
      jwLibraryAndroidIntentUrl,
    });
  }, [
    canPreview,
    congregation,
    jwLibraryAndroidIntentUrl,
    jwLibraryUrl,
    jwOrgFinderUrl,
    songNumber,
    songTitle,
    speakerName,
    theme.themeNumber,
    theme.themeTitle,
  ]);

  const handleExport = async (format: 'html' | 'pdf') => {
    if (!window.jcs?.exportTalkThemeCard || !canPreview) return;

    setExporting(format);
    setMessage(null);
    writeStored(STORAGE_SPEAKER, speakerName);
    writeStored(STORAGE_CONGREGATION, congregation);

    try {
      const result = await window.jcs.exportTalkThemeCard({
        format,
        themeNumber: theme.themeNumber,
        themeTitle: theme.themeTitle,
        speakerName: speakerName.trim(),
        congregation: congregation.trim(),
        songNumber,
        songTitle: songTitle.trim(),
        jwOrgFinderUrl,
        jwLibraryUrl,
        jwLibraryAndroidIntentUrl,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Não foi possível salvar o cartão.');
        return;
      }
      const label = format === 'pdf' ? 'PDF' : 'HTML';
      setMessage(result.filePath ? `Cartão ${label} salvo: ${result.filePath}` : `Cartão ${label} salvo.`);
      window.setTimeout(() => onClose(), 1200);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-labelledby="talk-card-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-jw-border bg-jw-surface shadow-xl"
      >
        <div className="border-b border-jw-border px-5 py-4">
          <h2 id="talk-card-title" className="text-base font-semibold text-jw-text">
            Cartão de discurso
          </h2>
          <p className="mt-1 text-sm text-jw-muted">
            {theme.themeNumber ? `Tema ${theme.themeNumber}` : 'Discurso'} — {theme.themeTitle}
          </p>
        </div>

        {step === 'form' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-jw-muted sm:col-span-2">
                Tema (do esboço)
                <input
                  type="text"
                  readOnly
                  value={theme.themeTitle}
                  className="rounded-lg border border-jw-border bg-jw-bg/70 px-3 py-2 text-sm text-jw-text"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-jw-muted">
                Orador
                <input
                  type="text"
                  value={speakerName}
                  onChange={(e) => setSpeakerName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text focus:border-jw-purple focus:outline-none"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-jw-muted">
                Congregação
                <input
                  type="text"
                  value={congregation}
                  onChange={(e) => setCongregation(e.target.value)}
                  placeholder="Ex.: Leste de Monte Sião — MG"
                  className="rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text focus:border-jw-purple focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-jw-muted">
                Cântico nº
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={songNumberInput}
                  onChange={(e) => setSongNumberInput(e.target.value)}
                  placeholder="Ex.: 35"
                  className="rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text focus:border-jw-purple focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-jw-muted">
                Título do cântico
                <input
                  type="text"
                  value={songTitle}
                  onChange={(e) => setSongTitle(e.target.value)}
                  placeholder={songLoading ? 'Buscando…' : 'Preenchido automaticamente'}
                  className="rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-text focus:border-jw-purple focus:outline-none"
                />
              </label>
            </div>

            {songError ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                {songError}
              </p>
            ) : null}

            <p className="mt-4 text-xs text-jw-muted">
              Abre o cântico no JW Library (usa a última visualização escolhida no app — prefira a Versão digital antes de compartilhar o cartão).
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden bg-[#0f1829] p-4">
            {previewHtml ? (
              <iframe
                title="Prévia do cartão de discurso"
                srcDoc={previewHtml}
                className="mx-auto h-[min(62vh,640px)] w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#0f1829] shadow-lg"
                sandbox="allow-scripts"
              />
            ) : null}
          </div>
        )}

        <div className="space-y-2 border-t border-jw-border px-5 py-4">
          {message ? <p className="text-sm text-jw-muted">{message}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-muted hover:border-jw-purple hover:text-jw-text"
            >
              Cancelar
            </button>
            {step === 'preview' ? (
              <button
                type="button"
                onClick={() => setStep('form')}
                className="rounded-lg border border-jw-border px-4 py-2 text-sm text-jw-text hover:border-jw-purple"
              >
                Voltar
              </button>
            ) : (
              <button
                type="button"
                disabled={!canPreview}
                onClick={() => setStep('preview')}
                className="rounded-lg border border-jw-purple px-4 py-2 text-sm font-medium text-jw-purple hover:bg-jw-purple-light disabled:opacity-50"
              >
                Prévia
              </button>
            )}
            <button
              type="button"
              disabled={!canPreview || exporting !== null}
              onClick={() => void handleExport('html')}
              className="rounded-lg border border-jw-purple px-4 py-2 text-sm font-medium text-jw-purple hover:bg-jw-purple-light disabled:opacity-50"
            >
              {exporting === 'html' ? 'Salvando…' : 'Salvar HTML'}
            </button>
            <button
              type="button"
              disabled={!canPreview || exporting !== null}
              onClick={() => void handleExport('pdf')}
              className="rounded-lg bg-jw-purple px-4 py-2 text-sm font-medium text-white hover:bg-jw-purple-dark disabled:opacity-50"
            >
              {exporting === 'pdf' ? 'Salvando…' : 'Salvar PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
