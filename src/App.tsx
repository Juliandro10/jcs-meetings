import { useCallback, useEffect, useState } from 'react';
import type { AppSection } from '@/lib/types';
import type { MeetingWeek } from '@/lib/meeting-types';
import { AppShell } from '@/components/AppShell';
import { SplashScreen } from '@/components/SplashScreen';
import { BiblePage } from '@/pages/BiblePage';
import { HomePage } from '@/pages/HomePage';
import { LibraryPage } from '@/pages/LibraryPage';
import { MeetingsPage, type ReaderOpenTarget } from '@/pages/MeetingsPage';
import { PersonalStudyPage } from '@/pages/PersonalStudyPage';
import { ReaderPage } from '@/pages/ReaderPage';

export default function App() {
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<AppSection>('home');
  const [reader, setReader] = useState<ReaderOpenTarget | null>(null);
  const [weeks, setWeeks] = useState<MeetingWeek[]>([]);
  const [weekIndex, setWeekIndex] = useState(0);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [refreshingWeeks, setRefreshingWeeks] = useState(false);
  const [downloadedPubs, setDownloadedPubs] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadingPubKey, setDownloadingPubKey] = useState<string | null>(null);
  const [downloadProgressMap, setDownloadProgressMap] = useState<Record<string, number>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refreshCache = useCallback(async () => {
    if (!window.jcs?.listCached) return;
    const keys = await window.jcs.listCached();
    setDownloadedPubs(new Set(keys));
  }, []);

  const reloadWeeks = useCallback(async (silent = false) => {
    if (!window.jcs?.loadMeetingWeeks) {
      setStatusMessage('Abra o app pelo Electron (npm run dev) para carregar as semanas.');
      return;
    }

    if (silent) setRefreshingWeeks(true);
    else setLoadingWeeks(true);

    if (!silent) setStatusMessage(null);
    try {
      const result = await window.jcs.loadMeetingWeeks();
      setWeeks(result.weeks);
      const currentIdx = result.weeks.findIndex((w) => w.isCurrentWeek);
      setWeekIndex((prev) => {
        if (currentIdx >= 0) return currentIdx;
        return Math.min(prev, Math.max(0, result.weeks.length - 1));
      });
      if (result.error && !silent) setStatusMessage(result.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar semanas';
      if (!silent) setStatusMessage(message);
    } finally {
      setLoadingWeeks(false);
      setRefreshingWeeks(false);
    }
  }, []);

  useEffect(() => {
    if (!window.jcs?.onDownloadProgress) return;
    return window.jcs.onDownloadProgress(({ key, percent }) => {
      setDownloadProgressMap((prev) => ({ ...prev, [key]: percent }));
      if (percent >= 100) {
        window.setTimeout(() => {
          setDownloadProgressMap((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }, 700);
      }
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refreshCache();
    void reloadWeeks(false);
  }, [ready, refreshCache, reloadWeeks]);

  const downloadPub = useCallback(
    async (pub: 'mwb' | 'w', issue: string) => {
      if (!window.jcs?.downloadPub) {
        alert('Download disponível apenas no app Electron.');
        return;
      }

      const key = `${pub}_${issue}`;
      setDownloadingPubKey(key);
      setStatusMessage(null);
      try {
        const result = await window.jcs.downloadPub({ pub, issue, lang: 'T' });
        if (!result.ok) {
          setStatusMessage(result.error ?? 'Não foi possível baixar a publicação.');
          return;
        }
        await refreshCache();
        await reloadWeeks(true);
      } finally {
        setDownloadingPubKey(null);
      }
    },
    [refreshCache, reloadWeeks],
  );

  const downloadMeetingPubs = useCallback(async () => {
    if (!window.jcs?.downloadMeetingPubs) {
      alert('Download disponível apenas no app Electron.');
      return;
    }

    const week = weeks[weekIndex];
    const targets: Array<{ pub: 'mwb' | 'w'; issue: string }> = [];
    if (week?.mwbIssue && !week.mwbDownloaded) targets.push({ pub: 'mwb', issue: week.mwbIssue });
    if (week?.wIssue && !week.wDownloaded) targets.push({ pub: 'w', issue: week.wIssue });

    if (targets.length > 0 && window.jcs.downloadPub) {
      setDownloading(true);
      setStatusMessage(null);
      try {
        for (const target of targets) {
          setDownloadingPubKey(`${target.pub}_${target.issue}`);
          const result = await window.jcs.downloadPub({ pub: target.pub, issue: target.issue, lang: 'T' });
          if (!result.ok) {
            setStatusMessage(result.error ?? `Erro ao baixar ${target.pub} ${target.issue}`);
          }
        }
        await refreshCache();
        await reloadWeeks(true);
      } finally {
        setDownloadingPubKey(null);
        setDownloading(false);
      }
      return;
    }

    setDownloading(true);
    setStatusMessage(null);
    try {
      const result = await window.jcs.downloadMeetingPubs();
      if (result.mwb.length === 0 && result.w.length === 0) {
        setStatusMessage(result.errors.slice(-2).join('\n') || 'Não foi possível baixar as publicações.');
      }
      await refreshCache();
      await reloadWeeks(true);
    } finally {
      setDownloading(false);
    }
  }, [refreshCache, reloadWeeks, weeks, weekIndex]);

  if (!ready) {
    return <SplashScreen onDone={() => setReady(true)} />;
  }

  if (reader) {
    const week = weeks[weekIndex];
    return (
      <ReaderPage
        target={reader}
        weekLabel={week?.label ?? ''}
        bibleReading={week?.bibleReading}
        downloadProgressMap={downloadProgressMap}
        onBack={() => setReader(null)}
      />
    );
  }

  const currentWeek = weeks.find((week) => week.isCurrentWeek) ?? null;

  return (
    <AppShell section={section} onSectionChange={setSection}>
      {section === 'home' ? (
        <HomePage
          currentWeek={currentWeek}
          onNavigate={setSection}
          onOpenMeetings={() => setSection('meetings')}
        />
      ) : null}
      {section === 'meetings' ? (
        <>
          {statusMessage ? (
            <div className="mx-8 mt-4 rounded-lg border border-jw-border bg-jw-surface px-4 py-3 text-sm text-jw-muted">
              {statusMessage}
            </div>
          ) : null}
          <MeetingsPage
            weeks={weeks}
            weekIndex={weekIndex}
            onWeekIndexChange={setWeekIndex}
            onDownloadMeetingPubs={downloadMeetingPubs}
            onDownloadPub={downloadPub}
            onOpenReader={setReader}
            loadingWeeks={loadingWeeks}
            refreshingWeeks={refreshingWeeks}
            downloading={downloading}
            downloadingPubKey={downloadingPubKey}
            downloadProgressMap={downloadProgressMap}
            loadError={statusMessage}
          />
        </>
      ) : null}
      {section === 'library' ? (
        <LibraryPage
          downloadedPubs={downloadedPubs}
          downloading={downloading}
          downloadProgressMap={downloadProgressMap}
          onDownloadMeetingPubs={downloadMeetingPubs}
        />
      ) : null}
      {section === 'personal-study' ? <PersonalStudyPage /> : null}
      {section === 'bible' ? <BiblePage downloadProgressMap={downloadProgressMap} /> : null}
      {section === 'media' ? <ComingSoon section={section} /> : null}
    </AppShell>
  );
}

function ComingSoon({ section }: { section: AppSection }) {
  const labels: Record<string, string> = {
    home: 'Início',
    bible: 'Bíblia',
    media: 'Mídia',
  };

  return (
    <div className="flex h-full min-h-[400px] items-center justify-center p-6 text-center">
      <div>
        <p className="text-lg text-jw-text">{labels[section] ?? section}</p>
        <p className="mt-2 text-sm text-jw-muted">Em breve — paridade JW Library.</p>
      </div>
    </div>
  );
}
