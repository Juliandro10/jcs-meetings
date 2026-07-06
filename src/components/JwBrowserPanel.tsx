import { useCallback, useEffect, useRef, useState } from 'react';
import { DownloadProgressBar } from '@/components/DownloadProgressBar';
import { IconChevronLeft, IconGlobe } from '@/components/Icons';
import type {
  JwBrowserJwpubInstalledEvent,
  JwBrowserMode,
  JwBrowserState,
} from '../../electron/types';
import { JW_ELDER_DOCS_URLS, type JwElderDocsCatalog } from '@/lib/jw-elder-docs-urls';

type JwBrowserPanelProps = {
  mode: JwBrowserMode;
  onClose?: () => void;
  onJwpubInstalled?: (event: JwBrowserJwpubInstalledEvent) => void;
  className?: string;
  /** Toolbar compacta para painel lateral (meia tela). */
  compact?: boolean;
  /** Catálogo docs.jw.org quando mode === 'elder'. */
  elderCatalog?: JwElderDocsCatalog;
};

function displayUrl(url: string) {
  if (!url || url === 'about:blank') return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname.replace(/\/$/, '') + parsed.search;
  } catch {
    return url;
  }
}

export function JwBrowserPanel({
  mode,
  onClose,
  onJwpubInstalled,
  className = '',
  compact = false,
  elderCatalog = 'outlines',
}: JwBrowserPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<JwBrowserState>({
    url: '',
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  });
  const [address, setAddress] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [downloadLabel, setDownloadLabel] = useState<string | null>(null);

  const syncBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el || !window.jcs?.jwBrowserResize) return;
    const rect = el.getBoundingClientRect();
    void window.jcs.jwBrowserResize({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !window.jcs?.jwBrowserOpen) return;

    let disposed = false;

    const open = async () => {
      const rect = el.getBoundingClientRect();
      const startUrl = mode === 'elder' ? JW_ELDER_DOCS_URLS[elderCatalog] : undefined;
      const result = await window.jcs!.jwBrowserOpen({
        mode,
        bounds: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        ...(startUrl ? { url: startUrl } : {}),
      });
      if (!disposed && !result.ok && result.error) {
        setStatusMessage(result.error);
      }
    };

    void open();

    const ro = new ResizeObserver(() => syncBounds());
    ro.observe(el);
    window.addEventListener('resize', syncBounds);

    const unsubState = window.jcs.onJwBrowserState?.((next) => {
      setState(next);
      setAddress(next.url);
    });

    const unsubInstalled = window.jcs.onJwBrowserJwpubInstalled?.((event) => {
      setDownloadPercent(null);
      setDownloadLabel(null);
      if (event.ok) {
        const kindLabel = event.kind === 'guideline' ? 'Orientação' : 'Esboço';
        setStatusMessage(`${kindLabel} instalado: ${event.label ?? event.fileName}`);
        onJwpubInstalled?.(event);
      } else {
        setStatusMessage(event.error ?? 'Não foi possível instalar o arquivo.');
      }
    });

    const unsubProgress = window.jcs.onJwBrowserDownloadProgress?.((event) => {
      setDownloadLabel(event.fileName);
      setDownloadPercent(event.percent);
    });

    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener('resize', syncBounds);
      unsubState?.();
      unsubInstalled?.();
      unsubProgress?.();
      void window.jcs?.jwBrowserClose?.();
    };
  }, [mode, elderCatalog, onJwpubInstalled, syncBounds]);

  const handleNavigate = async () => {
    if (!window.jcs?.jwBrowserNavigate) return;
    const trimmed = address.trim();
    if (!trimmed) return;
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const result = await window.jcs.jwBrowserNavigate(url);
    if (!result.ok && result.error) setStatusMessage(result.error);
  };

  const handleHome = async () => {
    if (!window.jcs?.jwBrowserNavigate) return;
    const url =
      mode === 'elder'
        ? JW_ELDER_DOCS_URLS[elderCatalog]
        : window.jcs.jwBrowserDefaultUrl
          ? await window.jcs.jwBrowserDefaultUrl(mode)
          : '';
    if (!url) return;
    await window.jcs.jwBrowserNavigate(url);
  };

  const title =
    mode === 'elder'
      ? elderCatalog === 'guidelines'
        ? 'JW.ORG — orientações'
        : 'JW.ORG — esboços'
      : 'JW.ORG — pesquisa online';
  const hint = compact
    ? 'Baixe .jwpub — o JCS instala automaticamente.'
    : mode === 'elder'
      ? 'Faça login com sua senha de ancião, navegue até as publicações e baixe os arquivos .jwpub — o JCS instala automaticamente.'
      : 'Pesquise matérias, Bíblia e publicações no site oficial. A sessão permanece salva neste dispositivo.';

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div className="shrink-0 border-b border-jw-border bg-jw-surface px-2 py-2 sm:px-3">
        <div className={`mb-2 flex flex-wrap items-center gap-2 ${compact ? 'gap-1' : ''}`}>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-jw-purple hover:bg-jw-purple-light"
            >
              <IconChevronLeft className="h-4 w-4" />
              {compact ? 'Fechar' : 'Voltar'}
            </button>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <IconGlobe className="h-4 w-4 shrink-0 text-jw-purple" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-jw-text">{title}</p>
              {!compact ? <p className="truncate text-xs text-jw-muted">{hint}</p> : null}
            </div>
          </div>
        </div>

        <div className={`flex flex-wrap items-center gap-2 ${compact ? 'gap-1' : ''}`}>
          <div className="flex shrink-0 gap-1">
            <ToolbarButton
              label="Voltar"
              disabled={!state.canGoBack}
              onClick={() => void window.jcs?.jwBrowserBack?.()}
            >
              ‹
            </ToolbarButton>
            <ToolbarButton
              label="Avançar"
              disabled={!state.canGoForward}
              onClick={() => void window.jcs?.jwBrowserForward?.()}
            >
              ›
            </ToolbarButton>
            <ToolbarButton label="Recarregar" onClick={() => void window.jcs?.jwBrowserReload?.()}>
              ↻
            </ToolbarButton>
            {!compact ? (
              <ToolbarButton label="Início JW" onClick={() => void handleHome()}>
                JW
              </ToolbarButton>
            ) : null}
          </div>

          <form
            className="flex min-w-[120px] flex-1 items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              void handleNavigate();
            }}
          >
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="docs.jw.org…"
              className="min-w-0 flex-1 rounded-lg border border-jw-border bg-white px-2 py-1.5 text-sm text-jw-text outline-none focus:border-jw-purple"
              spellCheck={false}
            />
            {!compact ? (
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-jw-purple px-3 py-1.5 text-sm font-medium text-white hover:bg-jw-purple-dark"
              >
                Ir
              </button>
            ) : null}
          </form>

          {state.isLoading ? (
            <span className="text-xs text-jw-muted">…</span>
          ) : null}
        </div>

        {compact ? <p className="mt-1.5 text-xs text-jw-muted">{hint}</p> : null}

        {statusMessage ? (
          <p className="mt-2 rounded-lg border border-jw-border bg-jw-bg px-3 py-2 text-sm text-jw-muted">
            {statusMessage}
          </p>
        ) : null}

        {downloadPercent !== null && downloadLabel ? (
          <div className="mt-2">
            <DownloadProgressBar percent={downloadPercent} label={`Baixando ${downloadLabel}`} />
          </div>
        ) : null}
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 bg-[#ececec]" aria-label="Navegador JW.ORG" />
    </div>
  );
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-jw-border bg-white text-sm font-semibold text-jw-text hover:bg-jw-purple-light disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
