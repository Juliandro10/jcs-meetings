import { useCallback, useEffect, useState } from 'react';
import type { AppSection } from '@/lib/types';
import type { MeetingWeek } from '@/lib/meeting-types';
import { AppShell } from '@/components/AppShell';
import { ElderPinGate } from '@/components/ElderPinGate';
import { GlobalSearchModal } from '@/components/GlobalSearchModal';
import { DictionaryModal } from '@/components/DictionaryModal';
import { SelectionActionsProvider } from '@/context/SelectionActionsContext';
import { SelectiveLoginScreen } from '@/components/SelectiveLoginScreen';
import { SplashScreen } from '@/components/SplashScreen';
import { BiblePage } from '@/pages/BiblePage';
import { ElderSection } from '@/components/ElderSection';
import { HomePage } from '@/pages/HomePage';
import { LibraryPage } from '@/pages/LibraryPage';
import { MeetingsPage, type ReaderOpenTarget } from '@/pages/MeetingsPage';
import { PersonalStudyPage } from '@/pages/PersonalStudyPage';
import { PreachingPage } from '@/pages/PreachingPage';
import { PublicTalkNotesPage } from '@/pages/PublicTalkNotesPage';
import { ReaderPage } from '@/pages/ReaderPage';
import { JwBrowserPage } from '@/pages/JwBrowserPage';
import {
  TeachingKitPublicationReaderPage,
  type TeachingKitReaderTarget,
} from '@/pages/TeachingKitPublicationReaderPage';
import {
  canShowElderTab,
  clearStoredSessionMode,
  setStoredSessionMode,
  type AppSessionMode,
} from '@/lib/elder-access';

type LoginState = 'pending' | AppSessionMode;

export default function App() {
  const [ready, setReady] = useState(false);
  const [sessionMode, setSessionMode] = useState<LoginState>('pending');
  const [elderUnlockOpen, setElderUnlockOpen] = useState(false);
  const [section, setSection] = useState<AppSection>('home');
  const [reader, setReader] = useState<ReaderOpenTarget | null>(null);
  const [publicTalkWeek, setPublicTalkWeek] = useState<MeetingWeek | null>(null);
  const [weeks, setWeeks] = useState<MeetingWeek[]>([]);
  const [weekIndex, setWeekIndex] = useState(0);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [refreshingWeeks, setRefreshingWeeks] = useState(false);
  const [downloadedPubs, setDownloadedPubs] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadingPubKey, setDownloadingPubKey] = useState<string | null>(null);
  const [downloadProgressMap, setDownloadProgressMap] = useState<Record<string, number>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [dictionaryInitialQuery, setDictionaryInitialQuery] = useState('');
  const [researchReader, setResearchReader] = useState<TeachingKitReaderTarget | null>(null);
  const showElder = canShowElderTab(sessionMode === 'elder' ? 'elder' : 'common');

  const openSearch = useCallback((query = '') => {
    setSearchInitialQuery(query);
    setSearchOpen(true);
  }, []);

  const openDictionary = useCallback((query = '') => {
    setDictionaryInitialQuery(query);
    setDictionaryOpen(true);
  }, []);

  const handleOpenSearchResult = useCallback((target: TeachingKitReaderTarget) => {
    setPublicTalkWeek(null);
    setReader(null);
    setResearchReader(target);
    setSearchOpen(false);
  }, []);

  const dictionaryDownloadPercent = downloadProgressMap.dictionary ?? 0;
  const dictionaryDownloading = dictionaryDownloadPercent > 0 && dictionaryDownloadPercent < 100;

  const appOverlays = (
    <>
      <GlobalSearchModal
        open={searchOpen}
        initialQuery={searchInitialQuery}
        onClose={() => setSearchOpen(false)}
        onOpenResult={handleOpenSearchResult}
      />
      <DictionaryModal
        open={dictionaryOpen}
        initialQuery={dictionaryInitialQuery}
        onClose={() => setDictionaryOpen(false)}
      />
    </>
  );

  const wrapWithSelectionTools = (content: React.ReactNode) => (
    <SelectionActionsProvider searchSelection={openSearch} dictionaryLookup={openDictionary}>
      {content}
      {appOverlays}
    </SelectionActionsProvider>
  );

  const handleLoginChoice = useCallback((mode: AppSessionMode) => {
    if (mode === 'common') {
      void window.jcs?.lockElderSession?.();
    }
    setSessionMode(mode);
    setStoredSessionMode(mode);
  }, []);

  const lockElder = useCallback(async () => {
    await window.jcs?.lockElderSession?.();
    clearStoredSessionMode();
    setSessionMode('common');
    setStoredSessionMode('common');
    setSection((current) => (current === 'elder' ? 'home' : current));
  }, []);

  const unlockElderSuccess = useCallback(() => {
    setSessionMode('elder');
    setStoredSessionMode('elder');
    setElderUnlockOpen(false);
    setSection('elder');
  }, []);

  useEffect(() => {
    if (section === 'elder' && !showElder) setSection('home');
  }, [section, showElder]);

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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openSearch, ready]);

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

  if (sessionMode === 'pending') {
    return <SelectiveLoginScreen onChoose={handleLoginChoice} />;
  }

  if (publicTalkWeek) {
    return wrapWithSelectionTools(
      <AppShell section="meetings" onSectionChange={setSection} onSearchClick={() => openSearch()}>
        <PublicTalkNotesPage week={publicTalkWeek} onBack={() => setPublicTalkWeek(null)} />
      </AppShell>,
    );
  }

  if (researchReader) {
    return wrapWithSelectionTools(
      <TeachingKitPublicationReaderPage target={researchReader} onBack={() => setResearchReader(null)} />,
    );
  }

  if (reader) {
    const week = weeks[weekIndex];
    return wrapWithSelectionTools(
      <ReaderPage
        target={reader}
        weekLabel={week?.label ?? ''}
        bibleReading={week?.bibleReading}
        downloadProgressMap={downloadProgressMap}
        onBack={() => setReader(null)}
        onOpenSearch={openSearch}
        onOpenDictionary={openDictionary}
      />,
    );
  }

  const currentWeek = weeks.find((week) => week.isCurrentWeek) ?? null;

  return wrapWithSelectionTools(
    <>
      <AppShell
        section={section}
        onSectionChange={setSection}
        showElder={showElder}
        onSearchClick={() => openSearch()}
        contentFill={section === 'jw-research' || section === 'elder'}
      >
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
            onOpenPublicTalkNotes={setPublicTalkWeek}
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
      {section === 'personal-study' ? (
        <PersonalStudyPage
          elderLocked={!showElder}
          onRequestElderUnlock={() => setElderUnlockOpen(true)}
          onOpenResearchPublication={setResearchReader}
          onOpenDictionary={openDictionary}
          dictionaryDownloadPercent={dictionaryDownloadPercent}
          dictionaryDownloading={dictionaryDownloading}
        />
      ) : null}
      {section === 'preaching' ? <PreachingPage /> : null}
      {section === 'bible' ? <BiblePage downloadProgressMap={downloadProgressMap} /> : null}
      {section === 'jw-research' ? <JwBrowserPage /> : null}
      {section === 'elder' && showElder ? <ElderSection onLockElder={() => void lockElder()} /> : null}
      {section === 'media' ? <ComingSoon section={section} /> : null}
      </AppShell>

      {elderUnlockOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <ElderPinGate
            onBack={() => setElderUnlockOpen(false)}
            onSuccess={unlockElderSuccess}
          />
        </div>
      ) : null}
    </>,
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
