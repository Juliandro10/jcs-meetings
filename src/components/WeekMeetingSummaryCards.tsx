import type { ReactNode } from 'react';
import type { MeetingWeek } from '@/lib/meeting-types';

export type WeekMeetingSummaryData = {
  midweek: {
    dateRangeCaps: string;
    bibleReading: string;
    subtitle?: string;
    summary?: string;
    points: string[];
    hasPrep: boolean;
  };
  weekend: {
    discourseTheme?: string;
    discourseThemeNumber?: number;
    discourseSummary?: string;
    watchtowerTitle: string;
    watchtowerSummary?: string;
    watchtowerPoints: string[];
    hasPrep: boolean;
  };
};

type WeekMeetingSummaryCardsProps = {
  week: MeetingWeek;
  summary: WeekMeetingSummaryData | null;
  loading: boolean;
  error: string | null;
  onOpenMeetings: () => void;
};

export function WeekMeetingSummaryCards({
  week,
  summary,
  loading,
  error,
  onOpenMeetings,
}: WeekMeetingSummaryCardsProps) {
  const midweek = summary?.midweek;
  const weekend = summary?.weekend;

  return (
    <section className="mb-10">
      <SectionHeading title="Reuniões desta semana" />

      <div className="space-y-4">
        <MeetingCard
          title="Reunião de meio de semana"
          onOpen={onOpenMeetings}
          loading={loading}
          error={error}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-jw-purple-dark">
            {midweek?.dateRangeCaps ?? week.dateRangeCaps}
          </p>
          <p className="mt-2 text-sm text-jw-text">Leitura bíblica: {week.bibleReading}</p>
          <p className="mt-1 text-sm text-jw-muted">{week.watchtowerTitle}</p>

          <SummaryBlock
            loading={loading}
            emptyMessage="Prepare a apostila para ver o resumo prático da reunião."
            hasContent={Boolean(midweek?.summary || (midweek?.points.length ?? 0) > 0)}
          >
            {midweek?.summary ? (
              <p className="text-sm leading-relaxed text-jw-text">{midweek.summary}</p>
            ) : null}
            {midweek && midweek.points.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {midweek.points.map((point) => (
                  <li key={point} className="flex gap-2 text-sm leading-relaxed text-jw-text">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-jw-purple/70" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </SummaryBlock>
        </MeetingCard>

        <MeetingCard title="Reunião de fim de semana" onOpen={onOpenMeetings} loading={loading} error={null}>
          {weekend?.discourseTheme ? (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-jw-muted">Discurso público</p>
              <p className="mt-1 text-sm font-medium text-jw-text">{weekend.discourseTheme}</p>
              {weekend.discourseSummary ? (
                <p className="mt-2 text-sm leading-relaxed text-jw-muted">{weekend.discourseSummary}</p>
              ) : (
                <p className="mt-2 text-sm text-jw-muted/80">
                  Tema identificado. Instale o S-34 ou prepare o esboço para ver o resumo.
                </p>
              )}
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-jw-muted">Estudo de A Sentinela</p>
            <p className="mt-1 text-sm font-medium text-jw-text">
              {weekend?.watchtowerTitle ?? week.watchtowerTitle}
            </p>

            <SummaryBlock
              loading={loading}
              emptyMessage="Prepare a Sentinela para ver os pontos do estudo."
              hasContent={Boolean(weekend?.watchtowerSummary || (weekend?.watchtowerPoints.length ?? 0) > 0)}
            >
              {weekend?.watchtowerSummary ? (
                <p className="mt-2 text-sm leading-relaxed text-jw-muted">{weekend.watchtowerSummary}</p>
              ) : null}
              {weekend && weekend.watchtowerPoints.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {weekend.watchtowerPoints.map((point) => (
                    <li key={point} className="flex gap-2 text-sm leading-relaxed text-jw-text">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2f6fad]/70" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </SummaryBlock>
          </div>
        </MeetingCard>
      </div>
    </section>
  );
}

function MeetingCard({
  title,
  children,
  onOpen,
  loading,
  error,
}: {
  title: string;
  children: ReactNode;
  onOpen: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-jw-border bg-white shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        className="w-full border-b border-jw-border/70 px-5 py-4 text-left transition hover:bg-jw-purple-light/20"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-jw-purple-dark">{title}</p>
            <span className="mt-2 inline-block text-sm text-[#2f6fad]">Abrir reuniões →</span>
          </div>
        </div>
      </button>

      <div className="px-5 py-4">
        {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
        {children}
        {loading ? <p className="mt-3 text-xs text-jw-muted">Carregando resumo…</p> : null}
      </div>
    </div>
  );
}

function SummaryBlock({
  children,
  loading,
  emptyMessage,
  hasContent,
}: {
  children: ReactNode;
  loading: boolean;
  emptyMessage: string;
  hasContent: boolean;
}) {
  if (loading) return null;
  if (!hasContent) {
    return <p className="mt-4 rounded-lg bg-jw-bg px-3 py-3 text-sm text-jw-muted">{emptyMessage}</p>;
  }

  return <div className="mt-4 rounded-lg border border-jw-border/60 bg-jw-bg/60 px-4 py-3">{children}</div>;
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-jw-text">{title}</h3>
    </div>
  );
}
