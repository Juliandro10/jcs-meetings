import { parse } from 'node-html-parser';
import { extractCbsStudyFromHtml } from '../shared/cbs-study-parse';
import {
  extractWcgBibleAccountRefs,
  extractWcgChapterQuestions,
  parseWcgChapterStructure,
  WCG_BIBLE_READING_FIELD_ID,
} from '../shared/wcg-chapter-parse';
import { findWcgAnswerTextareaNode } from './jcs-read-bake';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import type {
  CbsStudyReviewGroup,
  CbsStudyReviewQuestion,
  MeetingWeek,
  SaveWeekCbsStudyPrepParams,
  SaveWeekCbsStudyPrepResult,
  WeekCbsStudyPrepResult,
} from './types';
import {
  fieldKey,
  getNotes,
  loadPrepData,
  noteKey,
  updatePrepData,
} from './user-prep-store';
import { loadWcgChapterFromCache, WCG_ISSUE, WCG_PUB } from './wcg-reader';
import {
  buildWcgBibleReadingNote,
  buildWcgConductorNote,
  buildWcgQuestionNote,
  WCG_BIBLE_READING_NOTE_ID,
  WCG_CONDUCTOR_NOTE_ID,
} from './wcg-study-notes';

const SECTION_ORDER = [
  'Para considerar',
  'Análise mais a fundo',
  'Medite no que aprendeu',
  'Pense no quadro completo',
];

export async function loadWeekCbsStudyPrep(
  cacheDir: string,
  userDataDir: string,
  week: MeetingWeek,
): Promise<WeekCbsStudyPrepResult> {
  if (!week.mwbDownloaded || !week.mwbDocumentId || !week.mwbIssue) {
    return { ok: true, groups: [] };
  }

  const mwbPath = await resolveCachedPubPath(cacheDir, 'mwb', week.mwbIssue);
  if (!mwbPath) return { ok: true, groups: [] };

  const mwbHtml = await getDocumentHtml(mwbPath, week.mwbDocumentId);
  const cbs = extractCbsStudyFromHtml(mwbHtml);
  if (!cbs?.href || cbs.pub !== 'wcg') return { ok: true, groups: [] };

  let chapter;
  try {
    chapter = await loadWcgChapterFromCache(cacheDir, cbs.href, cbs.linkLabel);
  } catch {
    return { ok: true, groups: [] };
  }

  const notes = await getNotes(userDataDir, WCG_PUB, WCG_ISSUE, chapter.documentId);
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const structure = parseWcgChapterStructure(chapter.html);
  const questions = extractWcgChapterQuestions(structure);
  if (questions.length === 0) return { ok: true, groups: [] };

  const data = await loadPrepData(userDataDir);
  const htmlRoot = parse(chapter.html, { comment: false });

  const grouped = new Map<string, CbsStudyReviewQuestion[]>();
  for (const question of questions) {
    const saved = notesById.get(question.id);
    const textarea = findWcgAnswerTextareaNode(htmlRoot, question.blockId);
    const fieldId = textarea?.getAttribute('id') || textarea?.getAttribute('data-pid') || '';
    const fieldBody = fieldId
      ? data.fields[fieldKey(WCG_PUB, WCG_ISSUE, chapter.documentId, fieldId)]?.value?.trim() ?? ''
      : '';
    const item: CbsStudyReviewQuestion = {
      id: question.id,
      blockId: question.blockId,
      sectionTitle: question.sectionTitle,
      title: saved?.title || question.text,
      body: saved?.body?.trim() || fieldBody,
      tags: saved?.tags?.length
        ? saved.tags
        : ['wcg-study', 'wcg-question', `wcg-section:${question.sectionTitle}`],
    };
    const list = grouped.get(question.sectionTitle) ?? [];
    list.push(item);
    grouped.set(question.sectionTitle, list);
  }

  const groups: CbsStudyReviewGroup[] = [
    ...SECTION_ORDER.filter((name) => grouped.has(name)).map((name) => ({
      sectionTitle: name,
      questions: grouped.get(name)!,
    })),
    ...[...grouped.entries()]
      .filter(([name]) => !SECTION_ORDER.includes(name))
      .map(([sectionTitle, sectionQuestions]) => ({ sectionTitle, questions: sectionQuestions })),
  ];

  const conductor = notesById.get(WCG_CONDUCTOR_NOTE_ID);
  if (conductor) {
    groups.unshift({
      sectionTitle: 'Condução do estudo',
      questions: [
        {
          id: conductor.id,
          blockId: conductor.blockId,
          sectionTitle: 'Condução do estudo',
          title: conductor.title,
          body: conductor.body,
          tags: conductor.tags,
        },
      ],
    });
  }

  const bibleRefs = extractWcgBibleAccountRefs(structure);
  const bibleNote = notesById.get(WCG_BIBLE_READING_NOTE_ID);
  const bibleField =
    data.fields[fieldKey(WCG_PUB, WCG_ISSUE, chapter.documentId, WCG_BIBLE_READING_FIELD_ID)]?.value?.trim() ??
    '';
  const bibleGroup: CbsStudyReviewGroup = {
    sectionTitle: 'Relato na Bíblia',
    questions: [
      {
        id: WCG_BIBLE_READING_NOTE_ID,
        blockId: bibleNote?.blockId || bibleRefs.headingBlockId,
        sectionTitle: 'Relato na Bíblia',
        title: 'Quais desses textos vou ler',
        body: bibleNote?.body?.trim() || bibleField,
        tags: bibleNote?.tags?.length ? bibleNote.tags : ['wcg-study', 'wcg-bible-reading'],
      },
    ],
  };
  const conductorIndex = groups.findIndex((group) => group.sectionTitle === 'Condução do estudo');
  if (conductorIndex >= 0) groups.splice(conductorIndex + 1, 0, bibleGroup);
  else groups.unshift(bibleGroup);

  return {
    ok: true,
    pub: 'wcg',
    documentId: chapter.documentId,
    title: cbs.linkLabel || chapter.title,
    groups,
  };
}

export async function saveWeekCbsStudyPrep(
  cacheDir: string,
  userDataDir: string,
  params: SaveWeekCbsStudyPrepParams,
): Promise<SaveWeekCbsStudyPrepResult> {
  const documentId = params.documentId;
  if (!documentId || params.questions.length === 0) {
    return { ok: false, error: 'Nenhuma resposta do estudo para salvar.' };
  }

  const existing = await getNotes(userDataDir, WCG_PUB, WCG_ISSUE, documentId);
  const existingById = new Map(existing.map((note) => [note.id, note]));

  let html = '';
  const filePath = await resolveCachedPubPath(cacheDir, WCG_PUB, WCG_ISSUE);
  if (filePath) {
    try {
      html = await getDocumentHtml(filePath, documentId);
    } catch {
      html = '';
    }
  }

  await updatePrepData(userDataDir, (data) => {
    const now = new Date().toISOString();
    for (const question of params.questions) {
      const prev = existingById.get(question.id);
      const incoming = question.body.trim();
      const prevBody = prev?.body?.trim() ?? '';
      const body = incoming || prevBody;
      if (!body) continue;
      const built =
        question.id === WCG_CONDUCTOR_NOTE_ID
          ? buildWcgConductorNote(body, question.blockId || prev?.blockId || '1')
          : question.id === WCG_BIBLE_READING_NOTE_ID
            ? buildWcgBibleReadingNote(body, question.blockId || prev?.blockId || '1')
          : buildWcgQuestionNote({
              noteId: question.id,
              question: question.title,
              body,
              blockId: question.blockId,
              sectionTitle: question.sectionTitle,
            });
      const note = {
        ...built,
        title:
          question.id === WCG_CONDUCTOR_NOTE_ID || question.id === WCG_BIBLE_READING_NOTE_ID
            ? question.title || prev?.title || built.title
            : built.title,
        tags: question.tags.length ? question.tags : built.tags,
        anchorText: prev?.anchorText ?? built.anchorText,
        startOffset: prev?.startOffset ?? 0,
        endOffset: prev?.endOffset ?? 0,
      };

      data.notes[noteKey(WCG_PUB, WCG_ISSUE, documentId, note.id)] = {
        ...note,
        tags: note.tags ?? [],
        updatedAt: now,
      };
    }

    if (html) {
      const root = parse(html, { comment: false });
      for (const question of params.questions) {
        const prev = existingById.get(question.id);
        const body = question.body.trim() || prev?.body?.trim() || '';
        if (!body) continue;
        if (question.id === WCG_CONDUCTOR_NOTE_ID) continue;
        if (question.id === WCG_BIBLE_READING_NOTE_ID) {
          data.fields[fieldKey(WCG_PUB, WCG_ISSUE, documentId, WCG_BIBLE_READING_FIELD_ID)] = {
            value: body,
            updatedAt: now,
          };
          continue;
        }
        if (!question.blockId) continue;
        const textarea = findWcgAnswerTextareaNode(root, question.blockId);
        if (!textarea) continue;
        const fieldId = textarea.getAttribute('id') || textarea.getAttribute('data-pid') || '';
        if (!fieldId) continue;
        data.fields[fieldKey(WCG_PUB, WCG_ISSUE, documentId, fieldId)] = {
          value: body,
          updatedAt: now,
        };
      }
    }
  });
  return { ok: true };
}
