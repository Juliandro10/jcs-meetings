import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BibleAudioPlayer, type BibleAudioTrack } from '@/components/BibleAudioPlayer';
import { BibleLanguageModal, type NwtLanguageOption } from '@/components/BibleLanguageModal';
import { IconBookOpen, IconChevronLeft, IconGlobe, IconHeadphones } from '@/components/Icons';
import {
  BIBLE_EDITION_OPTIONS,
  isBibleTabDisabled,
  readBibleEdition,
  writeBibleEdition,
  type BibleEdition,
} from '@/lib/bible-edition';
import {
  readBibleSession,
  writeBibleSession,
  type BibleSessionView,
} from '@/lib/bible-session';

type BibleBookInfo = {
  bookNumber: number;
  title: string;
  abbreviation: string;
  chapterCount: number;
  hasAudio: boolean;
};

type BibleNavItem = {
  itemId: number;
  documentId: number | null;
  title: string;
  subtitle?: string;
  depth: number;
  isSectionHeader?: boolean;
};

type BibleView =
  | { mode: 'books' }
  | { mode: 'section' }
  | { mode: 'chapters'; book: BibleBookInfo }
  | { mode: 'chapter'; book: BibleBookInfo; chapterNumber: number; html: string; bookTitle: string }
  | { mode: 'document'; documentId: number; title: string; html: string };

const BIBLE_TABS = ['INTRODUÇÃO', 'LIVROS', 'ÍNDICE', 'APÊNDICE A', 'APÊNDICE B', 'APÊNDICE C'] as const;

function shortBookTitle(title: string) {
  return title
    .replace(/^O\s+(Primeiro|Segundo|Terceiro)\s+Livro\s+(de\s+|dos\s+)?/i, '')
    .replace(/^O\s+Livro\s+(de\s+|dos\s+)?/i, '')
    .trim();
}

function serializeView(view: BibleView, scrollTop: number): BibleSessionView {
  switch (view.mode) {
    case 'books':
      return { mode: 'books' };
    case 'section':
      return { mode: 'section' };
    case 'chapters':
      return { mode: 'chapters', bookNumber: view.book.bookNumber };
    case 'chapter':
      return {
        mode: 'chapter',
        bookNumber: view.book.bookNumber,
        chapterNumber: view.chapterNumber,
        scrollTop: scrollTop > 0 ? scrollTop : undefined,
      };
    case 'document':
      return {
        mode: 'document',
        documentId: view.documentId,
        title: view.title,
        scrollTop: scrollTop > 0 ? scrollTop : undefined,
      };
  }
}

function needsSessionRestore(view: BibleSessionView | undefined) {
  return !!view && view.mode !== 'books';
}

export function BiblePage({
  downloadProgressMap = {},
  active = true,
}: {
  downloadProgressMap?: Record<string, number>;
  /** false quando a aba Bíblia está oculta (keep-alive). */
  active?: boolean;
}) {
  const savedSession = useMemo(() => readBibleSession(), []);
  const pendingScroll = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const persistTimer = useRef<number | null>(null);

  const [edition, setEdition] = useState<BibleEdition>(() => readBibleEdition());
  const [lang, setLang] = useState(savedSession?.lang ?? 'T');
  const [langLabel, setLangLabel] = useState(savedSession?.langLabel ?? 'Português (Brasil)');
  const [books, setBooks] = useState<BibleBookInfo[]>([]);
  const [sectionItems, setSectionItems] = useState<BibleNavItem[]>([]);
  const [languages, setLanguages] = useState<NwtLanguageOption[]>([]);
  const [view, setView] = useState<BibleView>({ mode: 'books' });
  const [restoreDone, setRestoreDone] = useState(!needsSessionRestore(savedSession?.view));
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [loadingLangs, setLoadingLangs] = useState(false);
  const [downloadingLang, setDownloadingLang] = useState<string | null>(null);
  const [audioTrack, setAudioTrack] = useState<BibleAudioTrack | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof BIBLE_TABS)[number]>(
    savedSession?.activeTab ?? 'LIVROS',
  );

  const persistSession = useCallback(() => {
    writeBibleSession({
      edition,
      lang,
      langLabel,
      activeTab,
      view: serializeView(view, scrollTopRef.current),
    });
  }, [activeTab, edition, lang, langLabel, view]);

  const schedulePersist = useCallback(() => {
    if (!restoreDone) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      persistSession();
    }, 250);
  }, [persistSession, restoreDone]);

  const reloadBooks = useCallback(async (nextLang: string) => {
    if (!window.jcs?.listBibleBooks) {
      setError('Abra o app pelo Electron para usar a Bíblia.');
      setLoadingBooks(false);
      return;
    }

    setLoadingBooks(true);
    setError(null);
    try {
      const result = await window.jcs.listBibleBooks({ lang: nextLang, edition });
      setBooks(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar livros.');
    } finally {
      setLoadingBooks(false);
    }
  }, [edition]);

  const reloadSection = useCallback(
    async (tab: (typeof BIBLE_TABS)[number], nextLang: string) => {
      if (tab === 'LIVROS' || isBibleTabDisabled(edition, tab) || !window.jcs?.listBibleSection) return;
      setLoadingSection(true);
      setError(null);
      try {
        const items = await window.jcs.listBibleSection({ tab, lang: nextLang, edition });
        setSectionItems(items);
        setView({ mode: 'section' });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar seção.');
      } finally {
        setLoadingSection(false);
      }
    },
    [edition],
  );

  const reloadLanguages = useCallback(async () => {
    if (!window.jcs?.listNwtLanguages) return;
    setLoadingLangs(true);
    try {
      const result = await window.jcs.listNwtLanguages({ edition });
      setLanguages(result);
      const active = result.find((item) => item.lang === lang);
      if (active) setLangLabel(active.name);
    } finally {
      setLoadingLangs(false);
    }
  }, [edition, lang]);

  useEffect(() => {
    void reloadBooks(lang);
  }, [edition, lang, reloadBooks]);

  useEffect(() => {
    if (langModalOpen) void reloadLanguages();
  }, [langModalOpen, reloadLanguages]);

  useEffect(() => {
    if (!restoreDone) return;
    if (activeTab === 'LIVROS') {
      if (view.mode === 'books' || view.mode === 'chapters' || view.mode === 'chapter') return;
      setView({ mode: 'books' });
      setSectionItems([]);
      return;
    }
    if (isBibleTabDisabled(edition, activeTab)) {
      setView({ mode: 'section' });
      setSectionItems([]);
      return;
    }
    if (view.mode === 'chapter' || view.mode === 'document' || view.mode === 'chapters') return;
    void reloadSection(activeTab, lang);
  }, [activeTab, edition, lang, reloadSection, restoreDone, view.mode]);

  useEffect(() => {
    schedulePersist();
  }, [schedulePersist, view, activeTab, lang, langLabel, edition]);

  useEffect(() => {
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
      if (restoreDone) persistSession();
    };
  }, [persistSession, restoreDone]);

  useEffect(() => {
    if (restoreDone || books.length === 0 || !savedSession) return;

    const restore = async () => {
      const target = savedSession.view;
      try {
        if (target.mode === 'section') {
          if (savedSession.activeTab !== 'LIVROS') {
            await reloadSection(savedSession.activeTab, lang);
          }
          return;
        }
        if (target.mode === 'chapters') {
          const book = books.find((item) => item.bookNumber === target.bookNumber);
          if (book) setView({ mode: 'chapters', book });
          return;
        }
        if (target.mode === 'chapter') {
          const book = books.find((item) => item.bookNumber === target.bookNumber);
          if (!book) return;
          pendingScroll.current = target.scrollTop ?? null;
          await openChapter(book, target.chapterNumber);
          return;
        }
        if (target.mode === 'document') {
          pendingScroll.current = target.scrollTop ?? null;
          await openDocument(target.documentId);
        }
      } finally {
        setRestoreDone(true);
      }
    };

    void restore();
  }, [books, lang, reloadSection, restoreDone, savedSession]);

  useEffect(() => {
    if (pendingScroll.current === null) return;
    if (view.mode !== 'chapter' && view.mode !== 'document') return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const top = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => {
      el.scrollTop = top;
      scrollTopRef.current = top;
    });
  }, [view]);

  const editionLabel = useMemo(
    () => BIBLE_EDITION_OPTIONS.find((item) => item.id === edition)?.label ?? edition,
    [edition],
  );

  const oldTestament = useMemo(() => books.filter((book) => book.bookNumber <= 39), [books]);
  const newTestament = useMemo(() => books.filter((book) => book.bookNumber >= 40), [books]);

  async function openChapter(book: BibleBookInfo, chapterNumber: number) {
    if (!window.jcs?.getBibleChapter) return;
    scrollTopRef.current = 0;
    setLoadingChapter(true);
    setError(null);
    try {
      const result = await window.jcs.getBibleChapter({
        bookNumber: book.bookNumber,
        chapterNumber,
        lang,
        edition,
      });
      if (!result.ok || !result.html) {
        setError(result.error ?? 'Não foi possível abrir o capítulo.');
        return;
      }

      setView({
        mode: 'chapter',
        book,
        chapterNumber,
        html: result.html,
        bookTitle: result.bookTitle ?? book.title,
      });

      const track = await window.jcs.getChapterAudio?.({
        bookNumber: book.bookNumber,
        chapterNumber,
        lang,
      });
      setAudioTrack(track ?? null);
    } finally {
      setLoadingChapter(false);
    }
  }

  async function openDocument(documentId: number) {
    if (!window.jcs?.getBibleDocument) return;
    setLoadingDocument(true);
    setError(null);
    setAudioTrack(null);
    try {
      const result = await window.jcs.getBibleDocument({ documentId, lang, edition });
      if (!result.ok || !result.html) {
        setError(result.error ?? 'Não foi possível abrir o documento.');
        return;
      }
      setView({
        mode: 'document',
        documentId,
        title: result.title ?? 'Documento',
        html: result.html,
      });
    } finally {
      setLoadingDocument(false);
    }
  }

  async function handleDownloadLanguage(nextLang: string) {
    if (!window.jcs?.downloadNwt) return;
    setDownloadingLang(nextLang);
    setError(null);
    try {
      const result = await window.jcs.downloadNwt({ lang: nextLang, edition });
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível baixar a Bíblia.');
        return;
      }
      await reloadLanguages();
      if (nextLang === lang) {
        await reloadBooks(lang);
        if (activeTab !== 'LIVROS') await reloadSection(activeTab, lang);
      }
    } finally {
      setDownloadingLang(null);
    }
  }

  function handleEditionChange(nextEdition: BibleEdition) {
    writeBibleEdition(nextEdition);
    setEdition(nextEdition);
    setView({ mode: 'books' });
    setAudioTrack(null);
    if (isBibleTabDisabled(nextEdition, activeTab)) {
      setActiveTab('LIVROS');
    }
  }

  function handleSelectLanguage(nextLang: string) {
    const selected = languages.find((item) => item.lang === nextLang);
    setLang(nextLang);
    setLangLabel(selected?.name ?? nextLang);
    setLangModalOpen(false);
  }

  function handleTabChange(tab: (typeof BIBLE_TABS)[number]) {
    setActiveTab(tab);
    setAudioTrack(null);
    if (tab !== 'LIVROS') {
      setView({ mode: 'section' });
    }
  }

  function backToSection() {
    setAudioTrack(null);
    if (activeTab === 'LIVROS') {
      setView({ mode: 'books' });
      return;
    }
    setView({ mode: 'section' });
  }

  const showTabs = view.mode === 'books' || view.mode === 'section';

  return (
    <div className="flex h-full min-h-0 flex-col bg-jw-bg">
      {showTabs ? (
        <div className="shrink-0 border-b border-jw-border bg-white">
          <div className="flex items-end justify-between gap-4 px-4">
            <nav className="flex flex-wrap" aria-label="Seções da Bíblia">
              {BIBLE_TABS.map((tab) => {
                const disabled = isBibleTabDisabled(edition, tab);
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && handleTabChange(tab)}
                    className={[
                      'relative px-3 py-3.5 text-[11px] font-semibold tracking-[0.08em] transition',
                      active ? 'text-jw-purple-dark' : 'text-jw-muted',
                      disabled ? 'cursor-not-allowed opacity-35' : 'hover:text-jw-purple-dark',
                    ].join(' ')}
                  >
                    {tab}
                    {active ? (
                      <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-jw-purple-dark" />
                    ) : null}
                  </button>
                );
              })}
            </nav>
            <div className="mb-2 flex items-center gap-2">
              <div className="inline-flex rounded-md border border-jw-border bg-jw-bg p-0.5">
                {BIBLE_EDITION_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleEditionChange(option.id)}
                    className={[
                      'rounded px-2 py-1 text-[10px] font-semibold tracking-wide transition',
                      edition === option.id
                        ? 'bg-white text-jw-purple shadow-sm'
                        : 'text-jw-muted hover:text-jw-text',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setLangModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-jw-muted hover:bg-jw-bg hover:text-jw-text"
                title="Idioma / versão"
              >
                <IconGlobe className="h-3.5 w-3.5" />
                {langLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mx-5 mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-auto px-5 py-4"
        onScroll={() => {
          scrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0;
          schedulePersist();
        }}
      >
        {!restoreDone ? (
          <p className="py-12 text-center text-sm text-jw-muted">Continuando de onde parou…</p>
        ) : null}

        {restoreDone && view.mode === 'books' && activeTab === 'LIVROS' ? (
          loadingBooks ? (
            <p className="py-12 text-center text-sm text-jw-muted">Carregando livros…</p>
          ) : (
            <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-6">
              <BookGrid
                title="ESCRITURAS HEBRAICO-ARAMAICAS"
                columns={4}
                books={oldTestament}
                onSelect={(book) => setView({ mode: 'chapters', book })}
              />
              <BookGrid
                title="ESCRITURAS GREGAS CRISTÃS"
                columns={3}
                books={newTestament}
                onSelect={(book) => setView({ mode: 'chapters', book })}
              />
            </div>
          )
        ) : null}

        {restoreDone && view.mode === 'section' ? (
          loadingSection ? (
            <p className="py-12 text-center text-sm text-jw-muted">Carregando…</p>
          ) : isBibleTabDisabled(edition, activeTab) ? (
            <p className="py-12 text-center text-sm text-jw-muted">
              {activeTab} não está disponível nesta versão da Bíblia.
            </p>
          ) : (
            <SectionList
              items={sectionItems}
              loading={loadingDocument}
              onOpen={(documentId) => void openDocument(documentId)}
            />
          )
        ) : null}

        {restoreDone && view.mode === 'chapters' ? (
          <div className="max-w-3xl">
            <button
              type="button"
              onClick={() => setView({ mode: 'books' })}
              className="mb-4 inline-flex items-center gap-1 text-sm text-jw-purple hover:underline"
            >
              <IconChevronLeft className="h-4 w-4" />
              Livros
            </button>
            <h2 className="text-base font-semibold text-jw-text">{shortBookTitle(view.book.title)}</h2>
            <p className="mt-1 text-sm text-jw-muted">Escolha um capítulo</p>
            <div className="mt-4 grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10">
              {Array.from({ length: view.book.chapterCount }, (_, index) => index + 1).map((chapter) => (
                <button
                  key={chapter}
                  type="button"
                  disabled={loadingChapter}
                  onClick={() => void openChapter(view.book, chapter)}
                  className="rounded-sm bg-jw-purple-dark px-2 py-2.5 text-sm font-medium text-white hover:bg-jw-purple disabled:opacity-60"
                >
                  {chapter}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {restoreDone && view.mode === 'chapter' ? (
          <div className="max-w-3xl">
            <button
              type="button"
              onClick={() => {
                setView({ mode: 'chapters', book: view.book });
                setAudioTrack(null);
              }}
              className="mb-4 inline-flex items-center gap-1 text-sm text-jw-purple hover:underline"
            >
              <IconChevronLeft className="h-4 w-4" />
              {shortBookTitle(view.book.title)}
            </button>
            <h2 className="text-base font-semibold text-jw-text">
              {view.bookTitle} {view.chapterNumber}
            </h2>
            <article
              className="prose-bible jwpub-content mt-4 text-[15px] leading-relaxed text-jw-text"
              dangerouslySetInnerHTML={{ __html: view.html }}
            />
          </div>
        ) : null}

        {restoreDone && view.mode === 'document' ? (
          <div className="max-w-3xl">
            <button
              type="button"
              onClick={backToSection}
              className="mb-4 inline-flex items-center gap-1 text-sm text-jw-purple hover:underline"
            >
              <IconChevronLeft className="h-4 w-4" />
              {activeTab}
            </button>
            <h2 className="text-base font-semibold text-jw-text">{view.title}</h2>
            <article
              className="prose-bible jwpub-content mt-4 text-[15px] leading-relaxed text-jw-text"
              dangerouslySetInnerHTML={{ __html: view.html }}
            />
          </div>
        ) : null}
      </div>

      <BibleAudioPlayer
        track={audioTrack}
        bookTitle={view.mode === 'chapter' ? view.bookTitle : ''}
        active={active}
        onClose={() => setAudioTrack(null)}
      />

      <BibleLanguageModal
        open={langModalOpen}
        languages={languages}
        activeLang={lang}
        edition={edition}
        editionLabel={editionLabel}
        loading={loadingLangs}
        downloadingLang={downloadingLang}
        downloadProgressMap={downloadProgressMap}
        onClose={() => setLangModalOpen(false)}
        onSelect={handleSelectLanguage}
        onDownload={(nextLang) => void handleDownloadLanguage(nextLang)}
      />
    </div>
  );
}

function SectionList({
  items,
  loading,
  onOpen,
}: {
  items: BibleNavItem[];
  loading: boolean;
  onOpen: (documentId: number) => void;
}) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-sm text-jw-muted">Nenhum item nesta seção.</p>;
  }

  return (
    <div className="max-w-3xl divide-y divide-jw-border rounded-sm border border-jw-border bg-white">
      {items.map((item) => {
        if (item.isSectionHeader) {
          return (
            <div
              key={`h-${item.itemId}`}
              className="bg-jw-bg px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-jw-text"
              style={{ paddingLeft: `${16 + item.depth * 12}px` }}
            >
              {item.title}
            </div>
          );
        }

        if (!item.documentId) return null;

        return (
          <button
            key={item.itemId}
            type="button"
            disabled={loading}
            onClick={() => onOpen(item.documentId!)}
            className="block w-full px-4 py-3 text-left hover:bg-jw-bg disabled:opacity-60"
            style={{ paddingLeft: `${16 + item.depth * 12}px` }}
          >
            {item.subtitle ? (
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-jw-muted">
                {item.subtitle}
              </span>
            ) : null}
            <span className="text-sm text-[#2f6fad]">{item.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function BookGrid({
  title,
  columns,
  books,
  onSelect,
}: {
  title: string;
  columns: 3 | 4;
  books: BibleBookInfo[];
  onSelect: (book: BibleBookInfo) => void;
}) {
  return (
    <section className="min-w-0 flex-1">
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-jw-text">{title}</h3>
      <div
        className={[
          'grid gap-px overflow-hidden bg-[#3a3a48]',
          columns === 4 ? 'grid-cols-4' : 'grid-cols-3',
        ].join(' ')}
      >
        {books.map((book, index) => {
          const row = Math.floor(index / columns);
          const shade = row % 2 === 0 ? 'bg-jw-bible-tile-a' : 'bg-jw-bible-tile-b';
          const displayName = shortBookTitle(book.title);
          return (
            <button
              key={book.bookNumber}
              type="button"
              onClick={() => onSelect(book)}
              className={[
                'relative flex min-h-[52px] items-center px-3 py-2.5 text-left text-white transition hover:brightness-110',
                shade,
              ].join(' ')}
            >
              <span className="block pr-8 text-[13px] font-normal leading-tight">{displayName}</span>
              <span className="absolute right-2 top-2 flex items-center gap-1 text-white/70">
                {book.hasAudio ? (
                  <IconHeadphones className="h-3.5 w-3.5" aria-label="Áudio disponível" />
                ) : null}
                <IconBookOpen className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
