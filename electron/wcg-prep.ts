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
  extractWcgChapterQuestions,
  parseWcgChapterStructure,
} from '../shared/wcg-chapter-parse';
import { WCG_ISSUE, WCG_PUB } from './wcg-reader';
import {
  buildWcgConductorNote,
  buildWcgHighlights,
  buildWcgQuestionNotes,
  WCG_CONDUCTOR_NOTE_ID,
} from './wcg-prep-helpers';
import type { AutoPrepHighlight, WcgPrepParams, WcgPrepResult } from './types';
import { replaceDocumentHighlights, replaceTaggedNotes } from './user-prep-store';

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

type PrepareResult =
  | { ok: true; highlights: AutoPrepHighlight[]; questionNotes: ReturnType<typeof buildWcgQuestionNotes>; conductorNote: ReturnType<typeof buildWcgConductorNote> }
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
      max_tokens: 12_000,
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
            '{"conductorNote":"Roteiro do condutor...","highlights":[{"blockId":"3","text":"Frase literal completa","color":"yellow"}],"questionAnswers":[{"noteId":"wcg-q-14","body":"3-6 frases..."}]}',
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
            'Prepare grifos abundantes (8-14), nota de condução completa e respostas equilibradas para cada pergunta listada.',
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

  try {
    return {
      ok: true as const,
      parsed: JSON.parse(raw) as {
        conductorNote?: string;
        highlights?: AutoPrepHighlight[];
        questionAnswers?: WcgQuestionAnswer[];
      },
    };
  } catch {
    return { ok: false as const, reason: 'JSON inválido retornado pela IA.' };
  }
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
  const questionList = questions
    .map((item) => `- ${item.id} | [p${item.blockId}] (${item.sectionTitle}) ${item.text}`)
    .join('\n');

  let lastReason = 'Falha desconhecida.';
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
    const conductorBody = normalizeAnswerText(parsed.conductorNote ?? '');
    if (conductorBody.length < 80) {
      lastReason = 'Nota de condução muito curta.';
      continue;
    }

    const highlights = buildWcgHighlights(
      (parsed.highlights ?? []).filter((item) => item.blockId && item.text),
      structure,
    );
    if (highlights.length < 4) {
      lastReason = `Poucos grifos válidos (${highlights.length}).`;
      continue;
    }

    const questionNotes = buildWcgQuestionNotes(questions, parsed.questionAnswers ?? []);
    const minAnswers =
      questions.length === 0 ? 0 : Math.max(3, Math.ceil(questions.length * 0.5));
    if (questions.length > 0 && questionNotes.length < minAnswers) {
      lastReason = `Respostas insuficientes (${questionNotes.length}/${questions.length}).`;
      continue;
    }

    const anchorBlockId = structure.blocks[0]?.pid ?? '1';
    return {
      ok: true,
      highlights,
      questionNotes,
      conductorNote: buildWcgConductorNote(conductorBody, anchorBlockId),
    };
  }

  return { ok: false, reason: lastReason };
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

    await replaceTaggedNotes(userDataDir, WCG_PUB, WCG_ISSUE, documentId, 'wcg-study', [
      prep.conductorNote,
      ...prep.questionNotes,
    ]);

    for (const note of [prep.conductorNote, ...prep.questionNotes]) {
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
