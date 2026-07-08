import type { ChairmanSongLinks } from './chairman-song-links';

export type ChairmanAssignmentSection =
  | 'abertura'
  | 'tesouros'
  | 'ministerio'
  | 'vida'
  | 'encerramento'
  | 'musica';

export type ChairmanAssignment = {
  id: string;
  section: ChairmanAssignmentSection;
  partTitle: string;
  durationMin?: number;
  assignees: string[];
  mwbPartHint?: string;
  /** Título editado pelo usuário — não sobrescrever com a apostila MWB. */
  partTitleManual?: boolean;
};

export type ChairmanGeneratedPart = {
  assignmentId: string;
  transition: string;
  highlight?: string;
  /** Referência da apostila, ex.: lmd lição 5 ponto 5 */
  lessonRef?: string;
  /** Pontos principais da lição/ponto para o presidente mencionar */
  lessonSummary?: string;
  /** Sugestão para conversa particular com o estudante (não ler na tribuna) */
  privateSuggestion?: string;
};

export type ChairmanOpeningPreview = {
  intro?: string;
  treasuresHighlight: string;
  lifeChristianHighlight: string;
  treasuresPartTitle?: string;
  lifeChristianPartTitle?: string;
};

export type ChairmanGeneratedContent = {
  openingSummary: string;
  openingPreview?: ChairmanOpeningPreview;
  parts: ChairmanGeneratedPart[];
  closingSummary: string;
  finalQuestion: string;
  finalQuestionOptions: [string, string, string];
  generatedAt: string;
};

export type ChairmanPrepRecord = {
  weekId: string;
  weekLabel: string;
  bibleReading: string;
  meetingDate?: string;
  congregation?: string;
  chairmanName?: string;
  openingPrayer?: string;
  closingPrayer?: string;
  openingSong?: string;
  /** Cântico após o ministério (meio da reunião). */
  middleSong?: string;
  closingSong?: string;
  importedAt?: string;
  sourceFileName?: string;
  assignments: ChairmanAssignment[];
  content?: ChairmanGeneratedContent;
  /** Anúncios da reunião (escritos pelo presidente) */
  announcements?: string;
  /** Leitura da semana (capítulos base) — link no cabeçalho. */
  bibleReadingHref?: string;
  /** Parte 3 — trecho designado na apostila para o estudante. */
  studentBibleReadingHref?: string;
  studentBibleReadingPassageHtml?: string;
  /** @deprecated Use studentBibleReadingPassageHtml */
  bibleReadingPassageHtml?: string;
  /** Cânticos inicial, intermediários e final com links para o TNME Cânticos. */
  songLinks?: ChairmanSongLinks;
  updatedAt: string;
};

export type ParsedChairmanDesignation = {
  congregation?: string;
  meetingDate?: string;
  bibleReading?: string;
  openingSong?: string;
  /** Cântico após o ministério (meio da reunião). */
  middleSong?: string;
  closingSong?: string;
  chairmanName?: string;
  openingPrayer?: string;
  closingPrayer?: string;
  assignments: Array<{
    section: ChairmanAssignmentSection;
    partTitle: string;
    durationMin?: number;
    assignees: string[];
    partTitleManual?: boolean;
  }>;
};
