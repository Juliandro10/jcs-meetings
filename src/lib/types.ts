export type AppSection =
  | 'home'
  | 'bible'
  | 'library'
  | 'media'
  | 'meetings'
  | 'personal-study';

export type SectionMeta = {
  id: AppSection;
  title: string;
  enabled: boolean;
};

export const SECTIONS: SectionMeta[] = [
  { id: 'home', title: 'Início', enabled: false },
  { id: 'bible', title: 'Tradução do Novo Mundo', enabled: false },
  { id: 'library', title: 'Biblioteca', enabled: true },
  { id: 'media', title: 'Mídia', enabled: false },
  { id: 'meetings', title: 'Reuniões', enabled: true },
  { id: 'personal-study', title: 'Estudo Pessoal', enabled: true },
];

export type WeekItem = {
  id: string;
  label: string;
  dateRange: string;
  dateRangeCaps: string;
  bibleReading: string;
  watchtowerTitle: string;
  isCurrentWeek: boolean;
};

export type MeetingPublication = {
  id: string;
  title: string;
  subtitle?: string;
  needsDownload: boolean;
  pub?: string;
  issue?: string;
};

export type DownloadPubParams = {
  pub: string;
  issue: string;
  lang?: string;
};

export type DownloadPubResult = {
  ok: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
};

/** Semanas demo — abril/junho 2026 (Sentinela w_T_202604) */
export const DEMO_WEEKS: WeekItem[] = [
  {
    id: '2026-06-08',
    label: '8–14 de junho',
    dateRange: '8–14 de junho',
    dateRangeCaps: '8–14 DE JUNHO DE 2026',
    bibleReading: 'Salmos 1–20',
    watchtowerTitle: 'Marido e esposa, continuem fortalecendo a amizade entre vocês',
    isCurrentWeek: false,
  },
  {
    id: '2026-06-15',
    label: '15–21 de junho',
    dateRange: '15–21 de junho',
    dateRangeCaps: '15–21 DE JUNHO DE 2026',
    bibleReading: 'Salmos 21–41',
    watchtowerTitle: 'Marido e esposa, continuem fortalecendo a amizade entre vocês',
    isCurrentWeek: false,
  },
  {
    id: '2026-06-22',
    label: '22–28 de junho',
    dateRange: '22–28 de junho',
    dateRangeCaps: '22–28 DE JUNHO DE 2026',
    bibleReading: 'Salmos 42–55',
    watchtowerTitle: 'Marido e esposa, continuem fortalecendo a amizade entre vocês',
    isCurrentWeek: false,
  },
  {
    id: '2026-06-29',
    label: '29 de junho–5 de julho',
    dateRange: '29 de junho–5 de julho',
    dateRangeCaps: '29 DE JUNHO–5 DE JULHO DE 2026',
    bibleReading: 'Salmos 56–68',
    watchtowerTitle: 'Marido e esposa, continuem fortalecendo a amizade entre vocês',
    isCurrentWeek: true,
  },
];

export const MEETING_PUBLICATIONS: MeetingPublication[] = [
  {
    id: 'mwb',
    title: 'Apostila da Reunião Vida e Ministério Cristão',
    subtitle: 'Apostila da Reunião Vida e Ministério Cristão',
    needsDownload: true,
    pub: 'mwb',
    issue: '202604',
  },
  {
    id: 'w',
    title: 'A Sentinela Anunciando o Reino de Jeová',
    subtitle: 'Edição de Estudo',
    needsDownload: true,
    pub: 'w',
    issue: '202604',
  },
  {
    id: 'sjj',
    title: 'Cante de Coração para Jeová',
    subtitle: 'Cante de Coração para Jeová',
    needsDownload: true,
  },
  {
    id: 'lff',
    title: 'Amor ao Próximo — Faça Discípulos',
    needsDownload: true,
  },
  {
    id: 'lr',
    title: 'Pratica a Leitura e o Ensino',
    needsDownload: true,
  },
  {
    id: 'instructions',
    title: 'Instruções para a Reunião Nossa Vida e Ministério Cristão',
    needsDownload: true,
  },
];

export const LIBRARY_CATEGORIES = [
  { id: 'books', label: 'Livros', enabled: false },
  { id: 'brochures', label: 'Brochuras e Livretos', enabled: false },
  { id: 'tracts', label: 'Folhetos e Convites', enabled: false },
  { id: 'articles', label: 'Séries de Artigos', enabled: false },
  { id: 'watchtower', label: 'A Sentinela', enabled: true },
  { id: 'awake', label: 'Despertai!', enabled: false },
  { id: 'workbooks', label: 'Apostilas', enabled: true },
  { id: 'km', label: 'Ministério do Reino', enabled: false },
  { id: 'programs', label: 'Programas', enabled: false },
  { id: 'index', label: 'Índice', enabled: false },
  { id: 'guidelines', label: 'Orientações', enabled: false },
  { id: 'convention', label: 'Lançamentos do Congresso', enabled: false },
];
