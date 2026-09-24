import {
  JW_AI_GROUNDING_RULES,
  JW_WCG_CONDUCTOR_RULES,
  JW_WCG_HIGHLIGHT_RULES,
  JW_WCG_PREP_RULES,
  JW_WCG_QUESTION_RULES,
} from './ai-prompts';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import {
  buildWcgPrepExcerpt,
  extractWcgBibleAccountRefs,
  extractWcgChapterQuestions,
  parseWcgChapterStructure,
  WCG_BIBLE_READING_FIELD_ID,
  type WcgChapterQuestion,
} from '../shared/wcg-chapter-parse';
import { WCG_ISSUE, WCG_PUB } from './wcg-reader';
import {
  buildWcgConductorNote,
  buildWcgHighlights,
  buildWcgQuestionNotes,
  normalizeWcgQuestionNoteId,
  WCG_CONDUCTOR_NOTE_ID,
} from './wcg-prep-helpers';
import {
  buildWcgBibleReadingNote,
  isWcgQuestionNoteId,
  WCG_BIBLE_READING_NOTE_ID,
} from './wcg-study-notes';
import type { AutoPrepHighlight, WcgPrepParams, WcgPrepResult } from './types';
import { parse } from 'node-html-parser';
import { findWcgAnswerTextareaNode } from './jcs-read-bake';
import {
  fieldKey,
  getNotes,
  replaceDocumentHighlights,
  replaceTaggedNotes,
  setFieldValue,
  updatePrepData,
} from './user-prep-store';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const WCG_PREP_MODEL =
  process.env.OPENAI_WCG_PREP_MODEL?.trim() ||
  process.env.OPENAI_LFB_PREP_MODEL?.trim() ||
  process.env.OPENAI_MWB_PREP_MODEL?.trim() ||
  'gpt-4.1';

const WCG_EXCERPT_LIMIT = 36_000;

type WcgQuestionAnswer = {
  noteId?: string;
  body?: string;
};

function normalizeAnswerText(value: string) {
  return value.trim();
}

function unescapeJsonString(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function answerFromUnknown(item: unknown): WcgQuestionAnswer | null {
  if (!item || typeof item !== 'object') return null;
  const rec = item as Record<string, unknown>;
  const noteId = normalizeWcgQuestionNoteId(String(rec.noteId ?? rec.id ?? rec.questionId ?? ''));
  const body = String(rec.body ?? rec.answer ?? rec.text ?? '').trim();
  if (!noteId || !body) return null;
  return { noteId, body };
}

function extractQuestionAnswers(
  raw: string,
  parsed?: { questionAnswers?: unknown; noteId?: unknown; body?: unknown },
): WcgQuestionAnswer[] {
  const byId = new Map<string, string>();
  const fromParsed = answerFromUnknown(parsed);
  if (fromParsed?.noteId && fromParsed.body) byId.set(fromParsed.noteId, fromParsed.body);

  for (const item of Array.isArray(parsed?.questionAnswers) ? parsed.questionAnswers : []) {
    const answer = answerFromUnknown(item);
    if (!answer?.noteId || !answer.body) continue;
    byId.set(answer.noteId, answer.body);
  }

  const pairRe =
    /"noteId"\s*:\s*"(?:wcg-q-)?(\d+)"[\s\S]{0,160}?"body"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  const flipRe =
    /"body"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]{0,160}?"noteId"\s*:\s*"(?:wcg-q-)?(\d+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = pairRe.exec(raw))) {
    const id = normalizeWcgQuestionNoteId(match[1]!);
    const body = unescapeJsonString(match[2]!).trim();
    if (body) byId.set(id, body);
  }
  while ((match = flipRe.exec(raw))) {
    const id = normalizeWcgQuestionNoteId(match[2]!);
    const body = unescapeJsonString(match[1]!).trim();
    if (body) byId.set(id, body);
  }

  return [...byId.entries()].map(([noteId, body]) => ({ noteId, body }));
}

type PrepareResult =
  | {
      ok: true;
      highlights: AutoPrepHighlight[];
      questionNotes: ReturnType<typeof buildWcgQuestionNotes>;
      conductorNote: ReturnType<typeof buildWcgConductorNote>;
      bibleReadingPlan: string;
    }
  | { ok: false; reason: string };

async function requestWcgPrepJson(
  apiKey: string,
  params: {
    chapterNumber: number | null;
    title: string;
    excerpt: string;
    questionList: string;
    weekLabel?: string;
  },
) {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: WCG_PREP_MODEL,
      temperature: 0.25,
      max_tokens: 16_000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Prepare o estudo bíblico de congregação deste capítulo do livro Ande Corajosamente com Deus (wcg).',
            JW_AI_GROUNDING_RULES,
            JW_WCG_PREP_RULES,
            JW_WCG_CONDUCTOR_RULES,
            JW_WCG_QUESTION_RULES,
            JW_WCG_HIGHLIGHT_RULES,
            params.weekLabel ? `Semana da reunião: ${params.weekLabel}.` : '',
            '',
            `Capítulo ${params.chapterNumber ?? ''} — ${params.title}`,
            '',
            'Perguntas do capítulo (responda TODAS em questionAnswers com noteId exato):',
            params.questionList || '(nenhuma pergunta detectada)',
            '',
            'Devolva APENAS JSON válido:',
            '{"conductorNote":"Roteiro do condutor...","bibleReadingPlan":"Gên. 32:6-12; 33:1-4","highlights":[{"blockId":"3","text":"Frase literal completa","color":"yellow"}]}',
            '',
            'Texto do capítulo:',
            params.excerpt,
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          role: 'user',
          content:
            'Prepare grifos abundantes (8-14), bibleReadingPlan com os textos que o condutor vai ler, e nota de condução completa. Não precisa repetir as respostas das perguntas.',
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { ok: false as const, reason: `API OpenAI (${response.status}): ${detail.slice(0, 200)}` };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return { ok: false as const, reason: 'Resposta vazia da IA.' };

  const parsed = parseJsonObject(raw);
  if (!parsed) return { ok: false as const, reason: 'JSON inválido retornado pela IA.' };

  return {
    ok: true as const,
    raw,
    parsed: {
      conductorNote: typeof parsed.conductorNote === 'string' ? parsed.conductorNote : '',
      bibleReadingPlan: typeof parsed.bibleReadingPlan === 'string' ? parsed.bibleReadingPlan : '',
      highlights: Array.isArray(parsed.highlights) ? (parsed.highlights as AutoPrepHighlight[]) : [],
      questionAnswers: extractQuestionAnswers(raw, parsed),
    },
  };
}

async function requestWcgMissingAnswers(
  apiKey: string,
  params: {
    chapterNumber: number | null;
    title: string;
    excerpt: string;
    missingList: string;
  },
) {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: WCG_PREP_MODEL,
      temperature: 0.25,
      max_tokens: 8_000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Complete as respostas que faltam neste capítulo do livro Ande Corajosamente com Deus (wcg).',
            JW_AI_GROUNDING_RULES,
            JW_WCG_QUESTION_RULES,
            `Capítulo ${params.chapterNumber ?? ''} — ${params.title}`,
            '',
            'Faltam SOMENTE estas perguntas (noteId exato):',
            params.missingList,
            '',
            'Devolva APENAS JSON válido:',
            '{"questionAnswers":[{"noteId":"wcg-q-31","body":"3-6 frases..."}]}',
            '',
            'Texto do capítulo:',
            params.excerpt,
          ].join('\n'),
        },
        {
          role: 'user',
          content: 'Responda TODAS as perguntas listadas, inclusive Medite no que aprendeu e Pense no quadro completo.',
        },
      ],
    }),
  });

  if (!response.ok) return [] as WcgQuestionAnswer[];
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];
  const parsed = parseJsonObject(raw);
  return extractQuestionAnswers(raw, parsed ?? undefined);
}

async function requestWcgSectionAnswers(
  apiKey: string,
  params: {
    chapterNumber: number | null;
    title: string;
    excerpt: string;
    sectionTitle: string;
    questions: WcgChapterQuestion[];
  },
) {
  if (params.questions.length === 0) return [] as WcgQuestionAnswer[];

  const list = params.questions
    .map((item) => `- ${item.id} | [p${item.blockId}] ${item.text}`)
    .join('\n');

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: WCG_PREP_MODEL,
      temperature: 0.2,
      max_tokens: 6_000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            `Responda SOMENTE a seção "${params.sectionTitle}" deste capítulo de Ande Corajosamente com Deus.`,
            JW_AI_GROUNDING_RULES,
            JW_WCG_QUESTION_RULES,
            `Capítulo ${params.chapterNumber ?? ''} — ${params.title}`,
            '',
            `Há ${params.questions.length} perguntas. Devolva ${params.questions.length} itens em questionAnswers, com o noteId EXATO:`,
            list,
            '',
            'JSON: {"questionAnswers":[{"noteId":"wcg-q-31","body":"3 a 6 frases..."}]}',
            '',
            'Texto do capítulo:',
            params.excerpt,
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Responda as ${params.questions.length} perguntas de ${params.sectionTitle}. Não pule nenhuma.`,
        },
      ],
    }),
  });

  if (!response.ok) return [] as WcgQuestionAnswer[];
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];
  const parsed = parseJsonObject(raw);
  return extractQuestionAnswers(raw, parsed ?? undefined);
}

async function requestWcgOneAnswer(
  apiKey: string,
  params: {
    chapterNumber: number | null;
    title: string;
    excerpt: string;
    question: WcgChapterQuestion;
  },
) {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: WCG_PREP_MODEL,
      temperature: 0.2,
      max_tokens: 1_200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Responda UMA pergunta do estudo bíblico de Ande Corajosamente com Deus.',
            JW_AI_GROUNDING_RULES,
            JW_WCG_QUESTION_RULES,
            `Capítulo ${params.chapterNumber ?? ''} — ${params.title}`,
            `Seção: ${params.question.sectionTitle}`,
            `noteId obrigatório: ${params.question.id}`,
            `Pergunta: ${params.question.text}`,
            '',
            `JSON: {"noteId":"${params.question.id}","body":"3 a 6 frases..."}`,
            '',
            'Texto do capítulo:',
            params.excerpt,
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Responda só ${params.question.id}.`,
        },
      ],
    }),
  });

  if (!response.ok) return [] as WcgQuestionAnswer[];
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];
  const parsed = parseJsonObject(raw);
  const answers = extractQuestionAnswers(raw, parsed ?? undefined);
  if (answers.some((item) => item.noteId === params.question.id && item.body?.trim())) return answers;
  const fallback = answers.find((item) => item.body?.trim());
  if (fallback?.body) return [{ noteId: params.question.id, body: fallback.body }];
  return [];
}

async function gatherWcgAnswers(
  apiKey: string,
  params: {
    chapterNumber: number | null;
    title: string;
    excerpt: string;
    questions: WcgChapterQuestion[];
  },
) {
  const kinds: Array<WcgChapterQuestion['sectionKind']> = [
    'quadro-completo',
    'medite',
    'para-considerar',
    'analise',
  ];

  let answers: WcgQuestionAnswer[] = [];
  for (const kind of kinds) {
    const questions = params.questions.filter((question) => question.sectionKind === kind);
    if (questions.length === 0) continue;
    const got = await requestWcgSectionAnswers(apiKey, {
      chapterNumber: params.chapterNumber,
      title: params.title,
      excerpt: params.excerpt,
      sectionTitle: questions[0]!.sectionTitle,
      questions,
    });
    answers = mergeAnswers(answers, got);
  }
  answers = await fillMissingAnswers(apiKey, {
    chapterNumber: params.chapterNumber,
    title: params.title,
    excerpt: params.excerpt,
    questions: params.questions,
    answers,
  });

  const stillMissing = params.questions.filter(
    (question) => !buildWcgQuestionNotes(params.questions, answers).some((note) => note.id === question.id),
  );
  for (const question of stillMissing) {
    const extra = await requestWcgOneAnswer(apiKey, {
      chapterNumber: params.chapterNumber,
      title: params.title,
      excerpt: params.excerpt,
      question,
    });
    answers = mergeAnswers(answers, extra);
  }
  return answers;
}

function mergeAnswers(...groups: WcgQuestionAnswer[][]) {
  const byId = new Map<string, string>();
  for (const group of groups) {
    for (const item of group) {
      if (!item.noteId || !item.body?.trim()) continue;
      byId.set(normalizeWcgQuestionNoteId(item.noteId), item.body.trim());
    }
  }
  return [...byId.entries()].map(([noteId, body]) => ({ noteId, body }));
}

async function fillMissingAnswers(
  apiKey: string,
  params: {
    chapterNumber: number | null;
    title: string;
    excerpt: string;
    questions: WcgChapterQuestion[];
    answers: WcgQuestionAnswer[];
  },
) {
  let answers = params.answers;
  for (let pass = 0; pass < 2; pass++) {
    const notes = buildWcgQuestionNotes(params.questions, answers);
    const missing = params.questions.filter((question) => !notes.some((note) => note.id === question.id));
    if (missing.length === 0) return answers;
    const extra = await requestWcgMissingAnswers(apiKey, {
      chapterNumber: params.chapterNumber,
      title: params.title,
      excerpt: params.excerpt,
      missingList: missing
        .map((item) => `- ${item.id} | [p${item.blockId}] (${item.sectionTitle}) ${item.text}`)
        .join('\n'),
    });
    answers = mergeAnswers(answers, extra);
  }
  return answers;
}

function fallbackConductorText(
  chapterNumber: number | null,
  title: string,
  bibleRefs: string,
) {
  return [
    `Capítulo ${chapterNumber ?? ''} — ${title}.`,
    '1) Leia a narrativa das duas primeiras páginas, destacando a coragem e a fé do relato.',
    `2) No relato na Bíblia, leia só os textos que ajudam a responder Para considerar${bibleRefs ? ` (lista: ${bibleRefs})` : ''}.`,
    '3) Controle o tempo para caber Análise, Medite no que aprendeu e Pense no quadro completo.',
    '4) Convide comentários das ilustrações. A seção Aprenda mais fica fora da reunião.',
  ].join('\n');
}

async function writeWcgAnswerFields(
  userDataDir: string,
  documentId: number,
  html: string,
  notes: Array<{ body: string; blockId: string }>,
) {
  const root = parse(html, { comment: false });
  await updatePrepData(userDataDir, (data) => {
    const now = new Date().toISOString();
    for (const note of notes) {
      if (!note.body.trim() || !note.blockId) continue;
      const textarea = findWcgAnswerTextareaNode(root, note.blockId);
      const fieldId = textarea?.getAttribute('id') || textarea?.getAttribute('data-pid') || '';
      if (!fieldId) continue;
      data.fields[fieldKey(WCG_PUB, WCG_ISSUE, documentId, fieldId)] = {
        value: note.body.trim(),
        updatedAt: now,
      };
    }
  });
}

function formatWcgQuestionList(questions: WcgChapterQuestion[]) {
  const kinds: Array<WcgChapterQuestion['sectionKind']> = [
    'quadro-completo',
    'medite',
    'para-considerar',
    'analise',
  ];
  return kinds
    .map((kind) => {
      const items = questions.filter((question) => question.sectionKind === kind);
      if (items.length === 0) return '';
      return [
        `### ${items[0]!.sectionTitle} — responda TODAS as ${items.length} perguntas`,
        ...items.map((item) => `- ${item.id} | [p${item.blockId}] ${item.text}`),
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

async function prepareSingleChapter(
  apiKey: string,
  params: {
    chapterNumber: number | null;
    title: string;
    html: string;
    weekLabel?: string;
  },
): Promise<PrepareResult> {
  const structure = parseWcgChapterStructure(params.html);
  const questions = extractWcgChapterQuestions(structure);
  const excerpt = buildWcgPrepExcerpt(structure, WCG_EXCERPT_LIMIT);
  const questionList = formatWcgQuestionList(questions);
  const bibleRefs = extractWcgBibleAccountRefs(structure);

  let answers = await gatherWcgAnswers(apiKey, {
    chapterNumber: params.chapterNumber,
    title: params.title,
    excerpt,
    questions,
  });

  let lastReason = 'Falha desconhecida.';
  let bibleReadingPlan = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await requestWcgPrepJson(apiKey, {
      chapterNumber: params.chapterNumber,
      title: params.title,
      excerpt,
      questionList,
      weekLabel: params.weekLabel,
    });

    if (!response.ok) {
      lastReason = response.reason;
      continue;
    }

    const parsed = response.parsed;
    answers = await fillMissingAnswers(apiKey, {
      chapterNumber: params.chapterNumber,
      title: params.title,
      excerpt,
      questions,
      answers: mergeAnswers(answers, parsed.questionAnswers ?? []),
    });

    const questionNotes = buildWcgQuestionNotes(questions, answers);
    const highlights = buildWcgHighlights(
      (parsed.highlights ?? []).filter((item) => item.blockId && item.text),
      structure,
    );
    let conductorBody = normalizeAnswerText(parsed.conductorNote ?? '');
    if (conductorBody.length < 80) {
      conductorBody = fallbackConductorText(params.chapterNumber, params.title, bibleRefs.refs);
    }
    bibleReadingPlan = normalizeAnswerText(parsed.bibleReadingPlan ?? '') || bibleRefs.refs;
    const anchorBlockId = structure.blocks[0]?.pid ?? '1';
    return {
      ok: true,
      highlights: highlights.length >= 4 ? highlights : buildWcgHighlights([], structure),
      questionNotes,
      conductorNote: buildWcgConductorNote(conductorBody, anchorBlockId),
      bibleReadingPlan,
    };
  }

  const questionNotes = buildWcgQuestionNotes(questions, answers);
  if (questionNotes.length === 0 && questions.length > 0) {
    return { ok: false, reason: lastReason };
  }

  const fallbackHighlights = buildWcgHighlights([], structure);

  return {
    ok: true,
    highlights: fallbackHighlights,
    questionNotes,
    conductorNote: buildWcgConductorNote(
      fallbackConductorText(params.chapterNumber, params.title, bibleRefs.refs),
      structure.blocks[0]?.pid ?? '1',
    ),
    bibleReadingPlan: bibleRefs.refs,
  };
}

export async function runWcgPrep(
  cacheDir: string,
  userDataDir: string,
  params: WcgPrepParams,
): Promise<WcgPrepResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: 'Configure OPENAI_API_KEY no arquivo .env.' };
  }

  const filePath = await resolveCachedPubPath(cacheDir, WCG_PUB, WCG_ISSUE);
  if (!filePath) {
    return { ok: false, error: 'Baixe o livro Ande Corajosamente com Deus antes de preparar o estudo.' };
  }

  const documentIds = [...new Set(params.documentIds)].filter((id) => id > 0);
  if (documentIds.length === 0) {
    return { ok: false, error: 'Nenhum capítulo selecionado.' };
  }

  const allHighlights: AutoPrepHighlight[] = [];
  const savedNotes: Array<{ noteId: string; body: string }> = [];
  let preparedDocuments = 0;
  let lastError = 'Não foi possível preparar o capítulo selecionado.';

  for (const documentId of documentIds) {
    const html = await getDocumentHtml(filePath, documentId);
    const structure = parseWcgChapterStructure(html);

    const prep = await prepareSingleChapter(apiKey, {
      chapterNumber: structure.chapterNumber,
      title: structure.title,
      html,
      weekLabel: params.weekLabel,
    });

    if (!prep.ok) {
      lastError = prep.reason;
      continue;
    }

    await replaceDocumentHighlights(
      userDataDir,
      WCG_PUB,
      WCG_ISSUE,
      documentId,
      prep.highlights.map((highlight) => ({
        id: crypto.randomUUID(),
        color: highlight.color,
        text: highlight.text,
        blockId: highlight.blockId,
        startOffset: highlight.startOffset ?? 0,
        endOffset: highlight.endOffset ?? highlight.text.length,
      })),
    );

    allHighlights.push(...prep.highlights);

    const existingNotes = await getNotes(userDataDir, WCG_PUB, WCG_ISSUE, documentId);
    const existingBible = existingNotes.find((note) => note.id === WCG_BIBLE_READING_NOTE_ID);
    const bibleRefs = extractWcgBibleAccountRefs(structure);
    const bibleBody = existingBible?.body?.trim() || prep.bibleReadingPlan.trim();
    const bibleNote = buildWcgBibleReadingNote(bibleBody, bibleRefs.headingBlockId);

    const questionNotes = [...prep.questionNotes];
    const incomingIds = new Set(questionNotes.map((note) => note.id));
    for (const note of existingNotes) {
      if (!isWcgQuestionNoteId(note.id) || !note.body.trim() || incomingIds.has(note.id)) continue;
      questionNotes.push(note);
    }

    await replaceTaggedNotes(userDataDir, WCG_PUB, WCG_ISSUE, documentId, 'wcg-study', [
      prep.conductorNote,
      bibleNote,
      ...questionNotes,
    ]);

    await writeWcgAnswerFields(userDataDir, documentId, html, questionNotes);

    if (bibleBody) {
      await setFieldValue(
        userDataDir,
        fieldKey(WCG_PUB, WCG_ISSUE, documentId, WCG_BIBLE_READING_FIELD_ID),
        bibleBody,
      );
    }

    for (const note of [prep.conductorNote, bibleNote, ...questionNotes]) {
      savedNotes.push({ noteId: note.id, body: note.body });
    }

    preparedDocuments += 1;
  }

  if (preparedDocuments === 0) {
    return { ok: false, error: lastError };
  }

  return {
    ok: true,
    highlights: allHighlights,
    notes: savedNotes,
    preparedDocuments,
  };
}

export { WCG_CONDUCTOR_NOTE_ID };
