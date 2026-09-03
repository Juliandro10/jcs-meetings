import { useState } from 'react';
import { IconChevronRight } from '@/components/Icons';
import { DownloadProgressBar } from '@/components/DownloadProgressBar';
import type { OutlineResearchItem, OutlineSupportPub } from '../../electron/types';

type OutlineResearchListProps = {
  items: OutlineResearchItem[];
  compact?: boolean;
  nested?: boolean;
  onOpen: (href: string, caption: string) => void;
};

export function OutlineResearchList({
  items,
  compact = false,
  nested = false,
  onOpen,
}: OutlineResearchListProps) {
  if (items.length === 0) return null;

  return (
    <div className={nested ? 'mb-3' : compact ? 'mb-3 shrink-0' : 'mb-4'}>
      <p className="text-xs font-medium uppercase tracking-wide text-jw-muted">
        Matérias de pesquisa do esboço
      </p>
      {nested ? null : (
        <p className="mt-0.5 text-[11px] text-jw-muted">
          Toque para ler o artigo. O JCS Meetings baixa as publicações deste esboço automaticamente.
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item.href}
            type="button"
            title={
              item.sourceTitle
                ? `${item.caption} · ${item.sourceTitle}${item.downloaded === false ? ' · só o trecho (baixe a publicação para o artigo completo)' : ''}`
                : item.caption
            }
            onClick={() => onOpen(item.href, item.caption)}
            className={[
              'max-w-full truncate rounded-full border bg-white px-2.5 py-1 text-left text-[11px] hover:border-jw-purple hover:text-jw-purple',
              item.downloaded === false
                ? 'border-amber-200 text-jw-muted'
                : 'border-jw-border text-jw-text',
            ].join(' ')}
          >
            {item.caption}
          </button>
        ))}
      </div>
    </div>
  );
}

type OutlineSupportPubListProps = {
  items: OutlineSupportPub[];
  downloading?: boolean;
  nested?: boolean;
};

export function OutlineSupportPubList({ items, downloading, nested = false }: OutlineSupportPubListProps) {
  if (items.length === 0) return null;

  return (
    <div className={nested ? 'mb-3' : 'mb-3 shrink-0'}>
      <p className="text-xs font-medium uppercase tracking-wide text-jw-muted">Melhore e Beneficie-se</p>
      {nested ? null : (
        <p className="mt-0.5 text-[11px] text-jw-muted">
          Citados no S-141. O app baixa ao preparar este esboço, para o assistente usar as lições e as páginas.
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) =>
          item.downloaded ? (
            <span
              key={item.pub}
              className="max-w-full truncate rounded-full border border-jw-border bg-white px-2.5 py-1 text-[11px] text-jw-muted"
              title={item.detail}
            >
              {item.title}
              {item.detail ? ` · ${item.detail}` : ''}
            </span>
          ) : (
            <span
              key={item.pub}
              title={item.detail}
              className="max-w-full truncate rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-900"
            >
              {downloading ? `Baixando ${item.title}…` : item.title}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

type OutlineAdditionalResearchProps = {
  research: OutlineResearchItem[];
  supportPubs: OutlineSupportPub[];
  downloading: boolean;
  downloadJob: { index: number; total: number; label: string } | null;
  downloadPercent: number | null;
  downloadFailures: string[];
  onRetryDownloads: () => void;
  speakerGuidelinesAvailable: boolean;
  missingResearchLinks: boolean;
  onOpenResearch: (href: string, caption: string) => void;
};

export function OutlineAdditionalResearch({
  research,
  supportPubs,
  downloading,
  downloadJob,
  downloadPercent,
  downloadFailures,
  onRetryDownloads,
  speakerGuidelinesAvailable,
  missingResearchLinks,
  onOpenResearch,
}: OutlineAdditionalResearchProps) {
  const [open, setOpen] = useState(false);
  const pubCount = research.length + supportPubs.length;
  const failureCount = downloadFailures.length;
  const hasBody =
    pubCount > 0 ||
    downloading ||
    failureCount > 0 ||
    !speakerGuidelinesAvailable ||
    missingResearchLinks;

  if (!hasBody) return null;

  let status = '';
  if (downloading && downloadJob) {
    status = `Baixando ${downloadJob.index}/${downloadJob.total}`;
  } else if (failureCount > 0) {
    status = failureCount === 1 ? '1 publicação indisponível' : `${failureCount} publicações indisponíveis`;
  } else if (pubCount > 0) {
    status = pubCount === 1 ? '1 matéria' : `${pubCount} matérias`;
  }

  return (
    <div
      className={[
        'mb-3 shrink-0 overflow-hidden rounded-lg border',
        failureCount > 0 && !downloading ? 'border-amber-200 bg-amber-50/60' : 'border-jw-border bg-jw-surface',
      ].join(' ')}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="outline-additional-research"
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-white/60"
        >
          <IconChevronRight
            className={`h-4 w-4 shrink-0 text-jw-muted transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden
          />
          <span className="text-sm font-medium text-jw-text">Pesquisa adicional</span>
          {status ? (
            <span
              className={[
                'min-w-0 truncate text-[11px]',
                failureCount > 0 && !downloading ? 'text-amber-900' : 'text-jw-muted',
              ].join(' ')}
            >
              {status}
            </span>
          ) : null}
        </button>
        {failureCount > 0 && !downloading ? (
          <button
            type="button"
            onClick={onRetryDownloads}
            className="mr-2 shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-900 hover:border-jw-purple"
          >
            Tentar de novo
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          id="outline-additional-research"
          className="max-h-[min(40vh,20rem)] overflow-y-auto border-t border-jw-border/80 bg-white px-3 py-2"
        >
          {downloading && downloadJob ? (
            <div className="mb-3 rounded-lg border border-jw-border bg-jw-surface px-3 py-2">
              <p className="text-sm text-jw-text">
                Baixando publicações deste esboço ({downloadJob.index}/{downloadJob.total}) — {downloadJob.label}
              </p>
              {downloadPercent != null ? (
                <DownloadProgressBar percent={downloadPercent} className="mt-2" />
              ) : null}
            </div>
          ) : null}
          {failureCount > 0 && !downloading ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm text-amber-900">
                Algumas publicações deste esboço não foram encontradas no jw.org (edições antigas às vezes não estão
                mais para download).
              </p>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-900">
                {downloadFailures.map((failure) => (
                  <li key={failure}>{failure}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <OutlineResearchList items={research} compact nested onOpen={onOpenResearch} />
          <OutlineSupportPubList items={supportPubs} downloading={downloading} nested />
          {!speakerGuidelinesAvailable ? (
            <p className="mb-2 text-[11px] text-amber-800">
              Importe o S-141 em Elder → Orientações para o assistente seguir as lembranças oficiais ao montar o
              discurso.
            </p>
          ) : null}
          {missingResearchLinks ? (
            <p className="mb-1 text-[11px] text-amber-800">
              Este rascunho não tem os links de pesquisa do original. Use Restaurar original para recuperá-los
              (substitui as edições neste documento).
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
