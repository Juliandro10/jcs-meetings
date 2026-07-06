import { parseTalkTheme } from '../shared/talk-theme-parse';
import { normalizePlainText } from '../shared/text-normalize';
import { extractWatchtowerStudyStructure } from './document-structure';
import { getDocumentHtml, listDocuments, resolveCachedPubPath } from './jwpub-reader';
import type { MeetingWeek, WeekMeetingSummary } from './types';
import {
  fieldKey,
  findPreparedElderOutlineByName,
  getFieldValues,
  getNotes,
  getPublicTalkNote,
  listPreparedElderOutlines,
} from './user-prep-store';

function stripHtml(value: string) {
  return normalizePlainText(
    value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, '\n'),
  );
}

function firstSentence(text: string, max = 160) {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const match = plain.match(/^(.{20,}?[.!?])(?:\s|$)/);
  const sentence = match?.[1]?.trim() ?? plain;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trim()}…` : sentence;
}

function excerpt(text: string, max = 520) {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const slice = plain.slice(0, max);
  const lastStop = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
  if (lastStop >= max * 0.55) return slice.slice(0, lastStop + 1).trim();
  return `${slice.trim()}…`;
}

function watchtowerQuestionLabel(questionText: string) {
  const plain = questionText.replace(/\s+/g, ' ').trim();
  const numbered = plain.match(/^\d+\.\s*(.+)/);
  const core = numbered?.[1]?.trim() ?? plain;
  return firstSentence(core, 100);
}

function watchtowerAnswerExcerpt(value: string, max = 170) {
  const plain = stripHtml(value);
  const main = plain.match(/Resposta principal:\s*([\s\S]+?)(?:\n\nResposta adicional:|$)/i)?.[1]?.trim();
  const extra = plain.match(/Resposta adicional:\s*([\s\S]+)/i)?.[1]?.trim();
  const body = [main, extra].filter(Boolean).join(' ');
  return firstSentence(body || plain, max);
}

function parseDiscourseThemeFromNote(raw: string) {
  const plain = stripHtml(raw);
  if (!plain) return { themeNumber: null as number | null, themeTitle: '' };

  const firstLine = plain.split('\n').map((line) => line.trim()).find(Boolean) ?? plain;
  const parsed = parseTalkTheme(firstLine);
  if (parsed.themeNumber) return parsed;

  const inline = plain.match(/\b(\d{1,3})\.\s+([A-Za-zÀ-ú0-9"“][^.!\n]{8,120})/);
  if (inline) {
    return { themeNumber: Number(inline[1]), themeTitle: inline[2]!.trim() };
  }

  return parsed;
}

function outlineSummaryFromHtml(html: string) {
  const paragraphs =
    html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi)?.map((block) => stripHtml(block)).filter(Boolean) ?? [];
  const meaningful = paragraphs.filter((p) => p.length >= 35 && !/^\d+\.\s/.test(p));
  if (meaningful.length === 0) return excerpt(stripHtml(html), 480);
  return excerpt(meaningful.slice(0, 2).join(' '), 520);
}

async function loadDiscourseOutlineSummary(
  cacheDir: string,
  userDataDir: string,
  themeNumber: number,
  themeTitle: string,
) {
  const fullTitle = `${themeNumber}. ${themeTitle}`;

  const preparedList = await listPreparedElderOutlines(userDataDir);
  const prepared = preparedList.find((item) => {
    const parsed = parseTalkTheme(item.sourceTitle, item.name);
    return parsed.themeNumber === themeNumber;
  });
  if (prepared?.value?.trim()) {
    return excerpt(stripHtml(prepared.value), 520);
  }

  const filePath = await resolveCachedPubPath(cacheDir, 's-34', '');
  if (!filePath) return undefined;

  const documents = await listDocuments(filePath);
  const doc =
    documents.find((item) => parseTalkTheme(item.title).themeNumber === themeNumber) ??
    documents.find((item) => item.title.trim().startsWith(`${themeNumber}.`));
  if (!doc) return undefined;

  const byName = await findPreparedElderOutlineByName(
    userDataDir,
    's-34',
    doc.documentId,
    fullTitle,
  );
  if (byName?.value?.trim()) return excerpt(stripHtml(byName.value), 520);

  const html = await getDocumentHtml(filePath, doc.documentId);
  if (!html) return undefined;
  return outlineSummaryFromHtml(html);
}

async function buildMidweekSummary(userDataDir: string, week: MeetingWeek) {
  const points: string[] = [];
  let summary: string | undefined;
  let hasPrep = false;

  if (week.mwbDownloaded && week.mwbIssue && week.mwbDocumentId != null) {
    const notes = await getNotes(userDataDir, 'mwb', week.mwbIssue, week.mwbDocumentId);
    const practice = notes.find((note) => note.tags.includes('practice-points'));
    const partNotes = notes.filter(
      (note) =>
        note.tags.includes('auto-prep') &&
        !note.tags.includes('practice-points') &&
        note.body?.trim(),
    );

    if (practice?.body?.trim()) {
      summary = practice.body.trim();
      hasPrep = true;
    }

    for (const note of partNotes) {
      const title = note.title?.trim() || 'Parte';
      const body = stripHtml(note.body);
      if (!body) continue;
      points.push(`${title} — ${firstSentence(body, 140)}`);
      hasPrep = true;
    }

    if (!summary && points.length > 0) {
      summary = 'Pontos principais da reunião de meio de semana:';
    }
  }

  return {
    dateRangeCaps: week.dateRangeCaps,
    bibleReading: week.bibleReading,
    subtitle: week.mwbPubLabel,
    summary,
    points: points.slice(0, 8),
    hasPrep,
  };
}

async function buildWeekendSummary(cacheDir: string, userDataDir: string, week: MeetingWeek) {
  const watchtowerPoints: string[] = [];
  let watchtowerSummary: string | undefined;
  let watchtowerHasPrep = false;

  if (week.wDownloaded && week.wIssue && week.wDocumentId != null) {
    const fieldPrefix = `${fieldKey('w', week.wIssue, week.wDocumentId, '')}`;
    const fields = await getFieldValues(userDataDir, fieldPrefix);

    const filePath = await resolveCachedPubPath(cacheDir, 'w', week.wIssue);
    const studyQuestions = filePath
      ? extractWatchtowerStudyStructure(await getDocumentHtml(filePath, week.wDocumentId)).questions.filter(
          (question) => !question.isReview,
        )
      : [];

    if (studyQuestions.length > 0) {
      for (const question of studyQuestions.slice(0, 6)) {
        const key = fieldKey('w', week.wIssue, week.wDocumentId, question.fieldId);
        const answer = fields[key]?.trim();
        if (!answer || answer.length < 20) continue;
        watchtowerPoints.push(
          `${watchtowerQuestionLabel(question.questionText)} — ${watchtowerAnswerExcerpt(answer)}`,
        );
        watchtowerHasPrep = true;
      }
    } else {
      for (const value of Object.values(fields)) {
        const answer = stripHtml(value);
        if (answer.length < 20) continue;
        watchtowerPoints.push(watchtowerAnswerExcerpt(answer));
        watchtowerHasPrep = true;
        if (watchtowerPoints.length >= 6) break;
      }
    }

    if (watchtowerPoints.length >= 2) {
      watchtowerSummary =
        'Na Sentinela desta semana, vamos considerar pontos que fortalecem nossa fé e nos preparam para comentar.';
    } else if (watchtowerPoints.length === 1) {
      watchtowerSummary = watchtowerPoints[0];
    }
  }

  const talkNoteRaw = await getPublicTalkNote(userDataDir, week.id);
  const { themeNumber, themeTitle } = parseDiscourseThemeFromNote(talkNoteRaw);

  let discourseTheme: string | undefined;
  let discourseSummary: string | undefined;
  let discourseHasPrep = false;

  if (themeNumber && themeTitle) {
    discourseTheme = `${themeNumber}. ${themeTitle}`;
    discourseSummary = await loadDiscourseOutlineSummary(
      cacheDir,
      userDataDir,
      themeNumber,
      themeTitle,
    );
    discourseHasPrep = Boolean(discourseSummary || stripHtml(talkNoteRaw).length > 40);
  }

  return {
    discourseTheme,
    discourseThemeNumber: themeNumber ?? undefined,
    discourseSummary,
    watchtowerTitle: week.wStudyTitle || week.watchtowerTitle,
    watchtowerSummary,
    watchtowerPoints,
    hasPrep: watchtowerHasPrep || discourseHasPrep,
  };
}

export async function buildWeekMeetingSummary(
  cacheDir: string,
  userDataDir: string,
  week: MeetingWeek,
): Promise<WeekMeetingSummary> {
  const [midweek, weekend] = await Promise.all([
    buildMidweekSummary(userDataDir, week),
    buildWeekendSummary(cacheDir, userDataDir, week),
  ]);

  return { midweek, weekend };
}
