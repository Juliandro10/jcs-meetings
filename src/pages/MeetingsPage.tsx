import { useState } from 'react';
import type { MeetingWeek } from '@/lib/meeting-types';
import { MEETING_PUBLICATIONS } from '@/lib/types';
import { IconChevronLeft, IconChevronRight, IconCloudDownload, IconMore } from '@/components/Icons';
import { AiToolsMenu } from '@/components/AiToolsMenu';

export type ReaderOpenTarget = {
  pub: 'mwb' | 'w';
  documentId: number;
  issue?: string;
  title: string;
};

type MeetingsPageProps = {
  weeks: MeetingWeek[];
  weekIndex: number;
  onWeekIndexChange: (index: number) => void;
  onOpenReader: (target: ReaderOpenTarget) => void;
  onDownloadMeetingPubs: () => Promise<void>;
  onDownloadPub: (pub: 'mwb' | 'w', issue: string) => Promise<void>;
  loadingWeeks: boolean;
  downloading: boolean;
  downloadingPubKey: string | null;
  loadError: string | null;
};

export function MeetingsPage({
  weeks,
  weekIndex,
  onWeekIndexChange,
  onOpenReader,
  onDownloadMeetingPubs,
  onDownloadPub,
  loadingWeeks,
  downloading,
  downloadingPubKey,
  loadError,
}: MeetingsPageProps) {
  const [aiOpen, setAiOpen] = useState(false);

  const week = weeks[weekIndex];
  const weekLabel = week ? `${week.label}${week.isCurrentWeek ? ' · Esta semana' : ''}` : '—';

  if (loadingWeeks) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-jw-muted">
        Carregando semanas…
      </div>
    );
  }

  if (!week) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-jw-muted">
          {loadError ?? 'Não foi possível carregar as semanas da reunião.'}
        </p>
        <button
          type="button"
          onClick={() => void onDownloadMeetingPubs()}
          disabled={downloading}
          className="rounded-lg bg-jw-purple px-4 py-2 text-sm text-white hover:bg-jw-purple-dark disabled:opacity-60"
        >
          {downloading ? 'Tentando…' : 'Tentar novamente'}
        </button>
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      <div className="mb-8 flex items-center justify-center gap-4">
        <WeekNavButton
          disabled={weekIndex <= 0}
          onClick={() => onWeekIndexChange(Math.max(0, weekIndex - 1))}
          label="Semana anterior"
        >
          <IconChevronLeft className="h-5 w-5" />
        </WeekNavButton>

        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="min-w-[280px] text-center text-[15px] text-jw-text hover:text-jw-purple"
          title="Ferramentas IA"
        >
          {weekLabel}
        </button>

        <WeekNavButton
          disabled={weekIndex >= weeks.length - 1}
          onClick={() => onWeekIndexChange(Math.min(weeks.length - 1, weekIndex + 1))}
          label="Próxima semana"
        >
          <IconChevronRight className="h-5 w-5" />
        </WeekNavButton>
      </div>

      <MeetingSection title="Vida e Ministério">
        {week.mwbDownloaded && week.mwbDocumentId ? (
          <MeetingRow
            thumbnailLabel="VM"
            primary={week.label}
            onOpen={() =>
              onOpenReader({
                pub: 'mwb',
                documentId: week.mwbDocumentId!,
                issue: week.mwbIssue,
                title: week.label,
              })
            }
          />
        ) : (
          <DownloadMeetingRow
            label={week.mwbPubLabel ?? 'Apostila Vida e Ministério'}
            downloading={downloadingPubKey === `mwb_${week.mwbIssue}`}
            disabled={!week.mwbIssue || downloading}
            onDownload={() => week.mwbIssue && void onDownloadPub('mwb', week.mwbIssue)}
          />
        )}
      </MeetingSection>

      <MeetingSection title="Estudo de A Sentinela">
        {week.wDownloaded && week.wDocumentId ? (
          <MeetingRow
            thumbnailLabel="ST"
            primary={week.dateRangeCaps}
            secondary={week.watchtowerTitle}
            onOpen={() =>
              onOpenReader({
                pub: 'w',
                documentId: week.wDocumentId!,
                issue: week.wIssue,
                title: week.watchtowerTitle,
              })
            }
          />
        ) : (
          <DownloadMeetingRow
            label={week.wPubLabel ?? 'A Sentinela'}
            secondary={week.watchtowerTitle !== '—' ? week.watchtowerTitle : undefined}
            downloading={downloadingPubKey === `w_${week.wIssue}`}
            disabled={!week.wIssue || downloading}
            onDownload={() => week.wIssue && void onDownloadPub('w', week.wIssue)}
          />
        )}
      </MeetingSection>

      <MeetingSection title="Outras publicações usadas nas reuniões">
        <PublicationRow
          title="Apostila da Reunião Vida e Ministério Cristão"
          subtitle={week.mwbPubLabel}
          needsDownload={Boolean(week.mwbIssue && !week.mwbDownloaded)}
          downloading={downloadingPubKey === `mwb_${week.mwbIssue}`}
          onDownload={
            week.mwbIssue && !week.mwbDownloaded
              ? () => void onDownloadPub('mwb', week.mwbIssue!)
              : undefined
          }
        />
        <PublicationRow
          title="A Sentinela Anunciando o Reino de Jeová"
          subtitle={week.wPubLabel ?? 'Edição de Estudo'}
          needsDownload={Boolean(week.wIssue && !week.wDownloaded)}
          downloading={downloadingPubKey === `w_${week.wIssue}`}
          onDownload={
            week.wIssue && !week.wDownloaded
              ? () => void onDownloadPub('w', week.wIssue!)
              : undefined
          }
        />
        {MEETING_PUBLICATIONS.filter((pub) => !pub.pub).map((pub) => (
          <PublicationRow key={pub.id} title={pub.title} subtitle={pub.subtitle} />
        ))}
      </MeetingSection>

      <AiToolsMenu open={aiOpen} onClose={() => setAiOpen(false)} week={week} />
    </div>
  );
}

function WeekNavButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full p-2 text-jw-muted hover:bg-jw-surface hover:text-jw-purple disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function MeetingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 border-b border-jw-border pb-2 text-sm font-semibold uppercase tracking-wide text-jw-text">
        {title}
      </h2>
      {children}
    </section>
  );
}

function MeetingRow({
  thumbnailLabel,
  primary,
  secondary,
  onOpen,
}: {
  thumbnailLabel: string;
  primary: string;
  secondary?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-lg px-1 py-2 text-left hover:bg-jw-surface"
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-jw-purple/10 text-xs font-bold text-jw-purple">
        {thumbnailLabel}
      </div>
      <div className="min-w-0 flex-1">
        {secondary ? (
          <p className="text-[11px] font-medium uppercase tracking-wide text-jw-muted-light">{primary}</p>
        ) : null}
        <p className={secondary ? 'mt-0.5 text-sm text-jw-text' : 'text-sm text-jw-text'}>
          {secondary ?? primary}
        </p>
      </div>
      <IconMore className="h-5 w-5 shrink-0 text-jw-muted" />
    </button>
  );
}

function DownloadMeetingRow({
  label,
  secondary,
  downloading,
  disabled,
  onDownload,
}: {
  label: string;
  secondary?: string;
  downloading?: boolean;
  disabled?: boolean;
  onDownload: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left text-jw-purple hover:bg-jw-surface disabled:cursor-not-allowed disabled:opacity-50"
    >
      {downloading ? (
        <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-jw-purple border-t-transparent" />
      ) : (
        <IconCloudDownload className="h-5 w-5 shrink-0" />
      )}
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {secondary ? <span className="mt-0.5 block text-xs text-jw-muted">{secondary}</span> : null}
      </span>
    </button>
  );
}

function PublicationRow({
  title,
  subtitle,
  needsDownload,
  downloading,
  onDownload,
}: {
  title: string;
  subtitle?: string;
  needsDownload?: boolean;
  downloading?: boolean;
  onDownload?: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg px-1 py-2 hover:bg-jw-surface">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-jw-border/60 text-[10px] font-semibold text-jw-muted">
        PUB
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-jw-text">{title}</p>
        {subtitle ? <p className="truncate text-xs text-jw-muted">{subtitle}</p> : null}
      </div>
      {needsDownload && onDownload ? (
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="rounded p-2 text-jw-purple hover:bg-jw-purple-light disabled:opacity-50"
          title="Baixar do jw.org"
        >
          {downloading ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-jw-purple border-t-transparent" />
          ) : (
            <IconCloudDownload className="h-5 w-5" />
          )}
        </button>
      ) : null}
      <button type="button" className="rounded p-2 text-jw-muted hover:bg-jw-bg">
        <IconMore className="h-5 w-5" />
      </button>
    </div>
  );
}
