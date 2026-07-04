import { JW_AI_GROUNDING_RULES, JW_CBS_STUDY_RULES, JW_LFB_HIGHLIGHT_RULES, JW_LFB_SABE_RULES } from './ai-prompts';

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

import { replaceTaggedNotes, saveHighlightsBatch, saveNotesBatch } from './user-prep-store';



const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const AUTO_PREP_MODEL = process.env.OPENAI_AUTO_PREP_MODEL?.trim() || 'gpt-4o';

const LFB_PUB = 'lfb';

const LFB_ISSUE = '';



const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'] as const;



type LfbSabeAnswer = {

  noteId?: string;

  blockId?: string;

  body?: string;

};



function refineStoryHighlights(

  highlights: AutoPrepHighlight[],

  storyStructure: ReturnType<typeof extractLfbStoryStructure>,

) {

  const blockById = new Map(storyStructure.blocks.map((block) => [block.blockId, block.text]));

  const bodyIds = new Set(storyStructure.bodyBlockIds);



  const resolved = highlights

    .map((highlight) => {

      const block = blockById.get(highlight.blockId);

      if (!block) return null;

      const located = resolveHighlightInBlock(block, highlight.text);

      if (!located) return null;

      const wordCount = located.text.trim().split(/\s+/).length;

      if (wordCount > 22 || wordCount < 3) return null;

      return {

        ...highlight,

        text: located.text,

        startOffset: located.startOffset,

        endOffset: located.endOffset,

      };

    })

    .filter((item): item is NonNullable<typeof item> => item !== null);



  const scored = [...resolved].sort((a, b) => {

    const aBody = bodyIds.has(a.blockId) ? 0 : 1;

    const bBody = bodyIds.has(b.blockId) ? 0 : 1;

    if (aBody !== bBody) return aBody - bBody;

    return b.text.length - a.text.length;

  });



  const byBlock = new Map<string, (typeof scored)[number]>();

  for (const highlight of scored) {

    if (!byBlock.has(highlight.blockId)) byBlock.set(highlight.blockId, highlight);

  }



  return [...byBlock.values()]

    .slice(0, 5)

    .map((highlight, index) => ({

      ...highlight,

      color: HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length],

    }));

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

      model: AUTO_PREP_MODEL,

      temperature: 0.25,

      response_format: { type: 'json_object' },

      messages: [

        {

          role: 'system',

          content: [

            'Complete respostas "Sabe responder?" da história lfb. APENAS JSON.',

            '{"sabeAnswers":[{"noteId":"sabe-42-0","body":"resposta curta"}]}',

            JW_AI_GROUNDING_RULES,

            JW_LFB_SABE_RULES,

            `História ${story.storyNumber} — ${story.title}`,

            'Perguntas pendentes:',

            ...missing.map((question) => `- ${question.noteId}: "${question.text}"`),

          ].join('\n'),

        },

        {

          role: 'user',

          content: excerpt.slice(0, 9000),

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

      model: AUTO_PREP_MODEL,

      temperature: 0.25,

      max_tokens: 4500,

      response_format: { type: 'json_object' },

      messages: [

        {

          role: 'system',

          content: [

            'Prepare o estudo bíblico de congregação DENTRO desta história do livro lfb.',

            JW_AI_GROUNDING_RULES,

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

            '{"highlights":[{"blockId":"3","text":"trecho EXATO curto","color":"yellow"}],"fields":[{"fieldId":"study-q1","value":"..."},{"fieldId":"study-q2","value":"..."},{"fieldId":"study-q3","value":"..."}],"sabeAnswers":[{"noteId":"sabe-42-0","blockId":"42","body":"resposta curta"}]}',

            '',

            'Regras para fields (OBRIGATÓRIO — exatamente 3 — perguntas FIXAS do EBC):',

            `- study-q1: ${LFB_STUDY_QUESTIONS[0]}`,

            `- study-q2: ${LFB_STUDY_QUESTIONS[1]}`,

            `- study-q3: ${LFB_STUDY_QUESTIONS[2]}`,

            '',

            'Texto da história:',

            excerpt.slice(0, 9000),

          ]

            .filter(Boolean)

            .join('\n'),

        },

        {

          role: 'user',

          content: `Prepare a história ${story.storyNumber}: grifos, respostas "Sabe responder?" (se houver) e as 3 perguntas fixas do EBC.`,

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



  const highlights = refineStoryHighlights(

    (parsed.highlights ?? []).filter((item) => item.blockId && item.text && item.color),

    storyStructure,

  );



  const fields = (parsed.fields ?? []).filter(

    (field) =>

      LFB_STUDY_FIELD_IDS.includes(field.fieldId as (typeof LFB_STUDY_FIELD_IDS)[number]) &&

      field.value?.trim(),

  );



  if (fields.length < 3) return null;



  let sabeAnswers = parsed.sabeAnswers ?? [];

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



    if (prep.highlights.length > 0) {

      await saveHighlightsBatch(

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

    }



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

