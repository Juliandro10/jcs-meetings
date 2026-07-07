import { useEffect, useState } from 'react';
import { WeekMeetingSummaryCards, type WeekMeetingSummaryData } from '@/components/WeekMeetingSummaryCards';
import type { MeetingWeek } from '@/lib/meeting-types';
import type { AppSection } from '@/lib/types';

type DailyText = {
  dateLabel?: string;
  scriptureHtml?: string;
  bodyHtml?: string;
  wolUrl?: string;
};

type HomePageProps = {
  currentWeek: MeetingWeek | null;
  onNavigate: (section: AppSection) => void;
  onOpenMeetings: () => void;
  onOpenDailyTextWol?: (url: string) => void;
};

export function HomePage({ currentWeek, onNavigate, onOpenMeetings, onOpenDailyTextWol }: HomePageProps) {
  const [dailyText, setDailyText] = useState<DailyText | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [weekSummary, setWeekSummary] = useState<WeekMeetingSummaryData | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDailyText() {
      if (!window.jcs?.getDailyText) {
        setLoadingDaily(false);
        setDailyError('Texto diário disponível apenas no app Electron.');
        return;
      }

      setLoadingDaily(true);
      setDailyError(null);
      try {
        const result = await window.jcs.getDailyText({ lang: 'T' });
        if (!result.ok) {
          setDailyError(result.error ?? 'Não foi possível carregar o texto diário.');
          return;
        }
        setDailyText(result);
      } catch (err) {
        setDailyError(err instanceof Error ? err.message : 'Erro ao carregar texto diário.');
      } finally {
        setLoadingDaily(false);
      }
    }

    void loadDailyText();
  }, []);

  useEffect(() => {
    if (!currentWeek) {
      setWeekSummary(null);
      return;
    }

    async function loadWeekSummary() {
      if (!window.jcs?.getWeekMeetingSummary) {
        setSummaryError('Resumos disponíveis apenas no app Electron.');
        return;
      }

      setLoadingSummary(true);
      setSummaryError(null);
      try {
        const result = await window.jcs.getWeekMeetingSummary(currentWeek);
        if (!result.ok) {
          setSummaryError(result.error ?? 'Não foi possível carregar os resumos.');
          setWeekSummary(null);
          return;
        }
        setWeekSummary(result.summary ?? null);
      } catch (err) {
        setSummaryError(err instanceof Error ? err.message : 'Erro ao carregar resumos.');
        setWeekSummary(null);
      } finally {
        setLoadingSummary(false);
      }
    }

    void loadWeekSummary();
  }, [currentWeek]);

  return (
    <div className="px-8 py-6">
      <div className="mx-auto max-w-5xl">
        <section className="mb-10 text-center">
          <h2 className="text-xl font-semibold text-jw-purple-dark">Bem-vindo ao Meetings</h2>
        </section>

        <section className="mb-10">
          <SectionHeading title="Texto diário" />
          <div className="rounded-xl border border-jw-border bg-white p-5 shadow-sm">
            {loadingDaily ? (
              <p className="text-sm text-jw-muted">Carregando texto diário…</p>
            ) : dailyError ? (
              <p className="text-sm text-red-700">{dailyError}</p>
            ) : dailyText ? (
              <>
                {dailyText.dateLabel ? (
                  <p className="text-sm font-semibold text-jw-text">{dailyText.dateLabel}</p>
                ) : null}
                {dailyText.scriptureHtml ? (
                  <p
                    className="mt-3 text-[15px] leading-relaxed text-jw-text [&_a]:text-[#2f6fad] [&_a]:no-underline hover:[&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: dailyText.scriptureHtml }}
                  />
                ) : null}
                {dailyText.bodyHtml ? (
                  <p
                    className="mt-4 text-[14px] leading-relaxed text-jw-muted [&_a]:text-[#2f6fad]"
                    dangerouslySetInnerHTML={{ __html: dailyText.bodyHtml }}
                  />
                ) : null}
                {dailyText.wolUrl ? (
                  <button
                    type="button"
                    onClick={() => onOpenDailyTextWol?.(dailyText.wolUrl!)}
                    className="mt-4 text-sm text-[#2f6fad] hover:underline"
                  >
                    Abrir no WOL
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </section>

        {currentWeek ? (
          <WeekMeetingSummaryCards
            week={currentWeek}
            summary={weekSummary}
            loading={loadingSummary}
            error={summaryError}
            onOpenMeetings={onOpenMeetings}
          />
        ) : null}

        <section className="mb-10">
          <SectionHeading title="Favoritos" />
          <div className="rounded-xl border border-dashed border-jw-border bg-white/70 px-6 py-10 text-center">
            <p className="text-sm text-jw-muted">Suas publicações favoritas serão exibidas aqui.</p>
          </div>
        </section>

        <section>
          <SectionHeading title="Atalhos" />
          <div className="grid gap-3 sm:grid-cols-3">
            <QuickLink label="Bíblia de Estudo" onClick={() => onNavigate('bible')} />
            <QuickLink label="Reuniões" onClick={() => onNavigate('meetings')} />
            <QuickLink label="Estudo Pessoal" onClick={() => onNavigate('personal-study')} />
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-jw-text">{title}</h3>
    </div>
  );
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-jw-border bg-white px-4 py-3 text-left text-sm text-jw-text hover:border-jw-purple/40 hover:bg-jw-bg"
    >
      {label}
    </button>
  );
}
