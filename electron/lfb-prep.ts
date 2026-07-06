import { JW_AI_GROUNDING_RULES, JW_CBS_STUDY_RULES, JW_LFB_FIELD_RULES, JW_LFB_HIGHLIGHT_PASS_RULES, JW_LFB_HIGHLIGHT_RULES, JW_LFB_PREP_RULES, JW_LFB_SABE_RULES } from './ai-prompts';

import { resolveHighlightInBlock } from './document-structure';

import { buildLfbSabeNote, buildLfbStudyNote, isLfbStudyNoteId } from './lfb-study-notes';

import {

  extractLfbBlocks,

  extractLfbStoryStructure,

  formatLfbStoriesPlainText,

  LFB_STUDY_FIELD_IDS,

  LFB_STUDY_QUESTIONS,

  loadLfbStoriesFromCache,

  type LfbSabeQuestion,

  type LfbStory,

} from './lfb-reader';

import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';

import type { AutoPrepField, AutoPrepHighlight, LfbPrepParams, LfbPrepResult } from './types';

import { replaceDocumentHighlights, replaceTaggedNotes, saveNotesBatch } from './user-prep-store';



const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const LFB_PREP_MODEL =
  process.env.OPENAI_LFB_PREP_MODEL?.trim() ||
  process.env.OPENAI_MWB_PREP_MODEL?.trim() ||
  process.env.OPENAI_WATCHTOWER_PREP_MODEL?.trim() ||
  'gpt-4.1';
const LFB_STORY_CHAR_LIMIT = 50_000;

const LFB_PUB = 'lfb';

const LFB_ISSUE = '';



const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'] as const;



type LfbSabeAnswer = {

  noteId?: string;

  blockId?: string;

  body?: string;

};



function highlightOverlaps(
  a: Pick<AutoPrepHighlight, 'blockId' | 'startOffset' | 'endOffset'>,
  b: Pick<AutoPrepHighlight, 'blockId' | 'startOffset' | 'endOffset'>,
) {
  return a.blockId === b.blockId && !(a.endOffset <= b.startOffset || b.endOffset <= a.startOffset);
}

function trimAtSentence(text: string, maxChars: number) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
  if (lastStop >= maxChars * 0.55) return slice.slice(0, lastStop + 1).trim();
  return `${slice.trim()}…`;
}

function normalizeLfbAnswerText(value: string) {
  const trimmed = value.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 140) return trimAtSentence(trimmed, 950);
  return trimmed;
}

function splitStorySentences(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && !/^HISTÓRIA\s+\d+/i.test(sentence));
}

function resolveStoryHighlight(
  highlight: AutoPrepHighlight,
  storyStructure: ReturnType<typeof extractLfbStoryStructure>,
) {
  const blockById = new Map(storyStructure.blocks.map((block) => [block.blockId, block.text]));
  const tryBlock = (blockId: string) => {
    const block = blockById.get(blockId);
    if (!block) return null;
    const located = resolveHighlightInBlock(block, highlight.text, {
      fullSentence: true,
      maxWords: 35,
      minWords: 3,
    });
    if (!located) return null;
    return {
      blockId,
      text: located.text,
      startOffset: located.startOffset,
      endOffset: located.endOffset,
      color: highlight.color,
    } as AutoPrepHighlight;
  };

  const direct = tryBlock(highlight.blockId);
  if (direct) return direct;

  for (const blockId of storyStructure.bodyBlockIds) {
    if (blockId === highlight.blockId) continue;
    const resolved = tryBlock(blockId);
    if (resolved) return resolved;
  }
  return null;
}

function fillMissingLfbBodyHighlights(
  highlights: AutoPrepHighlight[],
  storyStructure: ReturnType<typeof extractLfbStoryStructure>,
  colorStart = 0,
) {
  const blockById = new Map(storyStructure.blocks.map((block) => [block.blockId, block.text]));
  const result = [...highlights];
  let colorIndex = colorStart;
  const MAX_TOTAL = 12;
  const MIN_PER_BLOCK = 1;
  const MAX_PER_BLOCK = 2;

  const countForBlock = (blockId: string) => result.filter((item) => item.blockId === blockId).length;

  for (const blockId of storyStructure.bodyBlockIds) {
    while (countForBlock(blockId) < MIN_PER_BLOCK && result.length < MAX_TOTAL) {
      const blockText = blockById.get(blockId);
      if (!blockText) break;

      let added = false;
      for (const sentence of splitStorySentences(blockText)) {
        if (countForBlock(blockId) >= MAX_PER_BLOCK || result.length >= MAX_TOTAL) break;
        const resolved = resolveStoryHighlight(
          { blockId, text: sentence, color: HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length]! },
          storyStructure,
        );
        if (!resolved) continue;
        if (result.some((item) => highlightOverlaps(item, resolved))) continue;
        result.push(resolved);
        colorIndex += 1;
        added = true;
        if (countForBlock(blockId) >= MIN_PER_BLOCK) break;
      }
      if (!added) break;
    }
  }

  return result;
}

function buildLfbStoryHighlights(
  raw: AutoPrepHighlight[],
  storyStructure: ReturnType<typeof extractLfbStoryStructure>,
) {
  const bodyIds = new Set(storyStructure.bodyBlockIds);
  const result: AutoPrepHighlight[] = [];
  const perBlock = new Map<string, number>();
  let colorIndex = 0;
  const MAX_TOTAL = 12;
  const MAX_PER_BLOCK = 2;

  for (const highlight of raw) {
    if (result.length >= MAX_TOTAL) break;
    if ((perBlock.get(highlight.blockId) ?? 0) >= MAX_PER_BLOCK) continue;

    const resolved = resolveStoryHighlight(
      { ...highlight, color: HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length]! },
      storyStructure,
    );
    if (!resolved) continue;
    if (!bodyIds.has(resolved.blockId) && result.length >= 6) continue;
    if (result.some((item) => highlightOverlaps(item, resolved))) continue;

    result.push(resolved);
    perBlock.set(resolved.blockId, (perBlock.get(resolved.blockId) ?? 0) + 1);
    colorIndex += 1;
  }

  return fillMissingLfbBodyHighlights(result, storyStructure, colorIndex);
}

async function requestLfbExtraHighlights(
  apiKey: string,
  story: LfbStory,
  excerpt: string,
  fields: AutoPrepField[],
  sabeAnswers: LfbSabeAnswer[],
  storyStructure: ReturnType<typeof extractLfbStoryStructure>,
): Promise<AutoPrepHighlight[]> {
  const summary = [
    ...fields.map((field) => `${field.fieldId}: ${field.value?.slice(0, 280) ?? ''}`),
    ...sabeAnswers.map((answer) => `${answer.noteId}: ${answer.body?.slice(0, 200) ?? ''}`),
  ].join('\n');

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LFB_PREP_MODEL,
      temperature: 0.15,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [JW_AI_GROUNDING_RULES, JW_LFB_HIGHLIGHT_PASS_RULES].join('\n\n'),
        },
        {
          role: 'user',
          content: [
            `História ${story.storyNumber} — ${story.title}`,
            excerpt.slice(0, LFB_STORY_CHAR_LIMIT),
            '',
            'Respostas já preparadas:',
            summary,
            '',
            'Gere grifos adicionais para história com aparência de livro preparado.',
          ].join('\n'),
        },
      ],
    }),
  });

  if (!response.ok) return [];
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as { highlights?: AutoPrepHighlight[] };
  return buildLfbStoryHighlights(
    (parsed.highlights ?? []).filter((item) => item.blockId && item.text),
    storyStructure,
  );
}

function mergeLfbHighlights(primary: AutoPrepHighlight[], extra: AutoPrepHighlight[]) {
  const merged = [...primary];
  for (const candidate of extra) {
    if (merged.length >= 12) break;
    if (merged.some((item) => highlightOverlaps(item, candidate))) continue;
    merged.push(candidate);
  }
  return merged;
}

function buildSabeNotesFromAnswers(

  sabeQuestions: LfbSabeQuestion[],

  answers: LfbSabeAnswer[],

) {

  const byId = new Map(

    answers

      .filter((item) => item.noteId && item.body?.trim())

      .map((item) => [item.noteId!, item]),

  );



  return sabeQuestions

    .map((question) => {

      const answer = byId.get(question.noteId);

      if (!answer?.body?.trim()) return null;

      return buildLfbSabeNote(

        question.noteId,

        question.text,

        answer.body.trim(),

        question.blockId,

      );

    })

    .filter((note): note is NonNullable<typeof note> => note !== null);

}



async function requestMissingSabeAnswers(

  apiKey: string,

  story: LfbStory,

  sabeQuestions: LfbSabeQuestion[],

  existing: LfbSabeAnswer[],

  excerpt: string,

): Promise<LfbSabeAnswer[]> {

  const answered = new Set(existing.map((item) => item.noteId).filter(Boolean));

  const missing = sabeQuestions.filter((question) => !answered.has(question.noteId));

  if (missing.length === 0) return existing;



  const response = await fetch(OPENAI_URL, {

    method: 'POST',

    headers: {

      Authorization: `Bearer ${apiKey}`,

      'Content-Type': 'application/json',

    },

    body: JSON.stringify({

      model: LFB_PREP_MODEL,

      temperature: 0.25,

      response_format: { type: 'json_object' },

      messages: [

        {

          role: 'system',

          content: [

            'Complete respostas "Sabe responder?" da história lfb. APENAS JSON.',

            '{"sabeAnswers":[{"noteId":"sabe-42-0","body":"3-5 frases equilibradas"}]}',

            JW_AI_GROUNDING_RULES,

            JW_LFB_SABE_RULES,

            `História ${story.storyNumber} — ${story.title}`,

            'Perguntas pendentes:',

            ...missing.map((question) => `- ${question.noteId}: "${question.text}"`),

          ].join('\n'),

        },

        {

          role: 'user',

          content: excerpt.slice(0, LFB_STORY_CHAR_LIMIT),

        },

      ],

    }),

  });



  if (!response.ok) return existing;

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };

  const raw = data.choices?.[0]?.message?.content?.trim();

  if (!raw) return existing;



  const parsed = JSON.parse(raw) as { sabeAnswers?: LfbSabeAnswer[] };

  const extra = parsed.sabeAnswers ?? [];

  const merged = [...existing];

  for (const answer of extra) {

    if (!answer.noteId || !answer.body?.trim()) continue;

    if (!merged.some((item) => item.noteId === answer.noteId)) merged.push(answer);

  }

  return merged;

}



async function prepareSingleStory(

  apiKey: string,

  story: LfbStory,

  weekLabel?: string,

): Promise<{

  highlights: AutoPrepHighlight[];

  fields: AutoPrepField[];

  sabeNotes: ReturnType<typeof buildLfbSabeNote>[];

} | null> {

  const storyStructure = extractLfbStoryStructure(story.html);

  const blocks = storyStructure.blocks.length > 0 ? storyStructure.blocks : extractLfbBlocks(story.html);

  const excerpt = blocks.map((block) => `[p${block.blockId}] ${block.text}`).join('\n\n');

  const sabeQuestions = storyStructure.sabeResponderQuestions;

  const sabeList = sabeQuestions

    .map((item) => `- ${item.noteId} | [p${item.blockId}] ${item.text}`)

    .join('\n');



  const response = await fetch(OPENAI_URL, {

    method: 'POST',

    headers: {

      Authorization: `Bearer ${apiKey}`,

      'Content-Type': 'application/json',

    },

    body: JSON.stringify({

      model: LFB_PREP_MODEL,

      temperature: 0.25,

      max_tokens: 10_000,

      response_format: { type: 'json_object' },

      messages: [

        {

          role: 'system',

          content: [

            'Prepare o estudo bíblico de congregação DENTRO desta história do livro lfb.',

            JW_AI_GROUNDING_RULES,

            JW_LFB_PREP_RULES,

            JW_LFB_FIELD_RULES,

            JW_CBS_STUDY_RULES,

            JW_LFB_HIGHLIGHT_RULES,

            JW_LFB_SABE_RULES,

            weekLabel ? `Semana da reunião: ${weekLabel}.` : '',

            '',

            `História ${story.storyNumber} — ${story.title}`,

            sabeList

              ? `\nPerguntas "Sabe responder?" (responda TODAS em sabeAnswers):\n${sabeList}`

              : '\nEsta história não tem perguntas "Sabe responder?" — omita sabeAnswers.',

            '',

            'Devolva APENAS JSON válido:',

            '{"highlights":[{"blockId":"3","text":"Frase completa literal","color":"yellow"}],"fields":[{"fieldId":"study-q1","value":"3-5 frases equilibradas..."},{"fieldId":"study-q2","value":"..."},{"fieldId":"study-q3","value":"..."}],"sabeAnswers":[{"noteId":"sabe-42-0","blockId":"42","body":"3-5 frases equilibradas"}]}',

            '',

            'Regras para fields (OBRIGATÓRIO — exatamente 3 — perguntas FIXAS do EBC):',

            `- study-q1: ${LFB_STUDY_QUESTIONS[0]}`,

            `- study-q2: ${LFB_STUDY_QUESTIONS[1]}`,

            `- study-q3: ${LFB_STUDY_QUESTIONS[2]}`,

            '',

            'Texto da história:',

            excerpt.slice(0, LFB_STORY_CHAR_LIMIT),

          ]

            .filter(Boolean)

            .join('\n'),

        },

        {

          role: 'user',

          content: `Prepare a história ${story.storyNumber}: grifos abundantes (6-10), respostas equilibradas (nem curtas nem longas demais), "Sabe responder?" e as 3 perguntas fixas do EBC.`,

        },

      ],

    }),

  });



  if (!response.ok) return null;



  const data = (await response.json()) as {

    choices?: Array<{ message?: { content?: string } }>;

  };

  const raw = data.choices?.[0]?.message?.content?.trim();

  if (!raw) return null;



  const parsed = JSON.parse(raw) as {

    highlights?: AutoPrepHighlight[];

    fields?: AutoPrepField[];

    sabeAnswers?: LfbSabeAnswer[];

  };



  let highlights = buildLfbStoryHighlights(
    (parsed.highlights ?? []).filter((item) => item.blockId && item.text),
    storyStructure,
  );

  const fields = (parsed.fields ?? [])
    .filter(
      (field) =>
        LFB_STUDY_FIELD_IDS.includes(field.fieldId as (typeof LFB_STUDY_FIELD_IDS)[number]) &&
        field.value?.trim(),
    )
    .map((field) => ({
      fieldId: field.fieldId,
      value: normalizeLfbAnswerText(field.value),
    }));

  if (fields.length < 3) return null;

  let sabeAnswers = (parsed.sabeAnswers ?? []).map((answer) => ({
    ...answer,
    body: answer.body ? normalizeLfbAnswerText(answer.body) : answer.body,
  }));

  if (sabeQuestions.length > 0) {

    const built = buildSabeNotesFromAnswers(sabeQuestions, sabeAnswers);

    if (built.length < sabeQuestions.length) {

      sabeAnswers = await requestMissingSabeAnswers(

        apiKey,

        story,

        sabeQuestions,

        sabeAnswers,

        excerpt,

      );

    }

  }



  const sabeNotes = buildSabeNotesFromAnswers(sabeQuestions, sabeAnswers);

  if (highlights.length < 6) {
    const extra = await requestLfbExtraHighlights(
      apiKey,
      story,
      excerpt,
      fields,
      sabeAnswers,
      storyStructure,
    );
    highlights = mergeLfbHighlights(highlights, extra);
    highlights = fillMissingLfbBodyHighlights(highlights, storyStructure, highlights.length);
  }

  return { highlights, fields: fields.slice(0, 3), sabeNotes };

}



export async function runLfbPrep(

  cacheDir: string,

  userDataDir: string,

  params: LfbPrepParams,

): Promise<LfbPrepResult> {

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {

    return { ok: false, error: 'Configure OPENAI_API_KEY no arquivo .env.' };

  }



  const filePath = await resolveCachedPubPath(cacheDir, LFB_PUB, LFB_ISSUE);

  if (!filePath) {

    return { ok: false, error: 'Baixe o livro lfb antes de preparar as lições.' };

  }



  const documentIds = [...new Set(params.documentIds)].filter((id) => id > 0);

  if (documentIds.length === 0) {

    return { ok: false, error: 'Nenhuma história selecionada.' };

  }



  const allHighlights: AutoPrepHighlight[] = [];

  const savedNotes: Array<{ noteId: string; body: string }> = [];

  let preparedDocuments = 0;



  for (const documentId of documentIds) {

    const html = await getDocumentHtml(filePath, documentId);

    const storyNumberMatch = html.replace(/<[^>]+>/g, ' ').match(/HISTÓRIA\s+(\d+)/i);

    const storyNumber = storyNumberMatch ? Number(storyNumberMatch[1]) : documentId;

    const titleMatch = html.replace(/<[^>]+>/g, ' ').match(/HISTÓRIA\s+\d+\s+(.+?)(?:\s+Jesus|\s+Na cidade|\s+No ano|$)/i);

    const story: LfbStory = {

      documentId,

      mepsDocumentId: 0,

      storyNumber,

      title: titleMatch?.[1]?.trim() || `História ${storyNumber}`,

      html,

      plainText: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),

    };



    let prep = await prepareSingleStory(apiKey, story, params.weekLabel);



    if (!prep) {

      const stories = await loadLfbStoriesFromCache(cacheDir, '', `histórias ${storyNumber}-${storyNumber}`);

      const fallbackStory = stories.find((item) => item.documentId === documentId) ?? story;

      prep = await prepareSingleStory(apiKey, fallbackStory, params.weekLabel);

    }



    if (!prep) {

      continue;

    }



    await replaceDocumentHighlights(
      userDataDir,
      LFB_PUB,
      LFB_ISSUE,
      documentId,
      prep.highlights.map((highlight) => ({
        id: crypto.randomUUID(),
        color: highlight.color,
        text: highlight.text,
        blockId: highlight.blockId,
        startOffset: (highlight as AutoPrepHighlight & { startOffset?: number }).startOffset ?? 0,
        endOffset:
          (highlight as AutoPrepHighlight & { endOffset?: number }).endOffset ?? highlight.text.length,
      })),
    );

    allHighlights.push(...prep.highlights);



    const studyNotes = prep.fields

      .filter((field) => isLfbStudyNoteId(field.fieldId) && field.value?.trim())

      .slice(0, 3)

      .map((field) => buildLfbStudyNote(field.fieldId, field.value.trim(), html));



    if (prep.sabeNotes.length > 0) {

      await replaceTaggedNotes(userDataDir, LFB_PUB, LFB_ISSUE, documentId, 'lfb-sabe', prep.sabeNotes);

    }



    if (studyNotes.length > 0) {

      await saveNotesBatch(userDataDir, LFB_PUB, LFB_ISSUE, documentId, studyNotes);

    }



    for (const note of [...prep.sabeNotes, ...studyNotes]) {

      savedNotes.push({ noteId: note.id, body: note.body });

    }



    preparedDocuments += 1;

  }



  if (preparedDocuments === 0) {

    return { ok: false, error: 'Não foi possível preparar as histórias selecionadas.' };

  }



  return {

    ok: true,

    highlights: allHighlights,

    notes: savedNotes,

    preparedDocuments,

  };

}



export { formatLfbStoriesPlainText, LFB_STUDY_QUESTIONS };

