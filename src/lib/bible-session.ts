import type { BibleEdition } from '@/lib/bible-edition';

const STORAGE_KEY = 'jcs-bible-session';

export type BibleSessionTab =
  | 'INTRODUÇÃO'
  | 'LIVROS'
  | 'ÍNDICE'
  | 'APÊNDICE A'
  | 'APÊNDICE B'
  | 'APÊNDICE C';

export type BibleSessionView =
  | { mode: 'books' }
  | { mode: 'section' }
  | { mode: 'chapters'; bookNumber: number }
  | { mode: 'chapter'; bookNumber: number; chapterNumber: number; scrollTop?: number }
  | { mode: 'document'; documentId: number; title?: string; scrollTop?: number };

export type BibleSessionState = {
  edition: BibleEdition;
  lang: string;
  langLabel?: string;
  activeTab: BibleSessionTab;
  view: BibleSessionView;
};

function isSessionTab(value: string): value is BibleSessionTab {
  return [
    'INTRODUÇÃO',
    'LIVROS',
    'ÍNDICE',
    'APÊNDICE A',
    'APÊNDICE B',
    'APÊNDICE C',
  ].includes(value);
}

function parseView(raw: unknown): BibleSessionView | null {
  if (!raw || typeof raw !== 'object') return null;
  const view = raw as Record<string, unknown>;
  const mode = view.mode;
  if (mode === 'books' || mode === 'section') return { mode };
  if (mode === 'chapters' && typeof view.bookNumber === 'number') {
    return { mode: 'chapters', bookNumber: view.bookNumber };
  }
  if (
    mode === 'chapter' &&
    typeof view.bookNumber === 'number' &&
    typeof view.chapterNumber === 'number'
  ) {
    return {
      mode: 'chapter',
      bookNumber: view.bookNumber,
      chapterNumber: view.chapterNumber,
      scrollTop: typeof view.scrollTop === 'number' ? view.scrollTop : undefined,
    };
  }
  if (mode === 'document' && typeof view.documentId === 'number') {
    return {
      mode: 'document',
      documentId: view.documentId,
      title: typeof view.title === 'string' ? view.title : undefined,
      scrollTop: typeof view.scrollTop === 'number' ? view.scrollTop : undefined,
    };
  }
  return null;
}

export function readBibleSession(): BibleSessionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const view = parseView(parsed.view);
    if (!view) return null;
    const edition = parsed.edition === 'nwtsty' ? 'nwtsty' : 'nwt';
    const lang = typeof parsed.lang === 'string' && parsed.lang.trim() ? parsed.lang : 'T';
    const activeTab =
      typeof parsed.activeTab === 'string' && isSessionTab(parsed.activeTab)
        ? parsed.activeTab
        : 'LIVROS';
    return {
      edition,
      lang,
      langLabel: typeof parsed.langLabel === 'string' ? parsed.langLabel : undefined,
      activeTab,
      view,
    };
  } catch {
    return null;
  }
}

export function writeBibleSession(state: BibleSessionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export function hasBibleSession() {
  const session = readBibleSession();
  return !!session && session.view.mode !== 'books';
}
