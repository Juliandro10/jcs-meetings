import { JW_AI_GROUNDING_RULES, JW_CBS_STUDY_RULES, JW_HIGHLIGHT_RULES } from './ai-prompts';
import { buildLfbStudyNote, isLfbStudyNoteId } from './lfb-study-notes';
import {
  extractLfbBlocks,
  formatLfbStoriesPlainText,
  LFB_STUDY_FIELD_IDS,
  LFB_STUDY_QUESTIONS,
  loadLfbStoriesFromCache,
  type LfbStory,
} from './lfb-reader';
import { getDocumentHtml, resolveCachedPubPath } from './jwpub-reader';
import type { AutoPrepField, AutoPrepHighlight, LfbPrepParams, LfbPrepResult } from './types';
import { saveHighlightsBatch, saveNotesBatch } from './user-prep-store';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const AUTO_PREP_MODEL = process.env.OPENAI_AUTO_PREP_MODEL?.trim() || 'gpt-4o';
const LFB_PUB = 'lfb';
const LFB_ISSUE = '';

const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'] as const;

function blockContainsText(blockText: string, needle: string) {
  const block = blockText.replace(/\s+/g, ' ').trim();
  const text = needle.replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (block.includes(text)) return true;
  const snippet = text.slice(0, Math.min(24, text.length));
  return snippet.length >= 10 && block.includes(snippet);
}

function refineStoryHighlights(
  highlights: AutoPrepHighlight[],
  blocks: Array<{ blockId: string; text: string }>,
) {
  const blockById = new Map(blocks.map((block) => [block.blockId, block.text]));

  const valid = highlights.filter((highlight) => {
    const block = blockById.get(highlight.blockId);
    if (!block) return false;
    if (!blockContainsText(block, highlight.text)) return false;
    return highlight.text.trim().split(/\s+/).length <= 22;
  });

  const byBlock = new Map<string, AutoPrepHighlight>();
  for (const highlight of valid) {
    if (!byBlock.has(highlight.blockId)) byBlock.set(highlight.blockId, highlight);
  }

  return [...byBlock.values()]
    .slice(0, 6)
    .map((highlight, index) => ({
      ...highlight,
      color: HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length],
    }));
}

async function prepareSingleStory(
  apiKey: string,
  story: LfbStory,
  weekLabel?: string,
): Promise<{ highlights: AutoPrepHighlight[]; fields: AutoPrepField[] } | null> {
  const blocks = extractLfbBlocks(story.html);
  const excerpt = blocks.map((block) => `[p${block.blockId}] ${block.text}`).join('\n\n');

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AUTO_PREP_MODEL,
      temperature: 0.25,
      max_tokens: 3500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Prepare o estudo bíblico de congregação DENTRO desta história do livro lfb.',
            JW_AI_GROUNDING_RULES,
            JW_CBS_STUDY_RULES,
            JW_HIGHLIGHT_RULES,
            weekLabel ? `Semana da reunião: ${weekLabel}.` : '',
            '',
            `História ${story.storyNumber} — ${story.title}`,
            '',
            'Devolva APENAS JSON válido:',
            '{"highlights":[{"blockId":"3","text":"trecho EXATO curto","color":"yellow"}],"fields":[{"fieldId":"study-q1","value":"resposta completa"},{"fieldId":"study-q2","value":"..."},{"fieldId":"study-q3","value":"..."}]}',
            '',
            'Regras para fields (OBRIGATÓRIO — exatamente 3):',
            `- study-q1: ${LFB_STUDY_QUESTIONS[0]}`,
            `- study-q2: ${LFB_STUDY_QUESTIONS[1]}`,
            `- study-q3: ${LFB_STUDY_QUESTIONS[2]}`,
            '- Respostas completas, prontas para ler no estudo.',
            '',
            'Regras para highlights:',
            '- 3 a 6 trechos-chave da história (1 por parágrafo).',
            '- "text" = trecho EXATO copiado do parágrafo.',
            '',
            'Texto da história:',
            excerpt.slice(0, 9000),
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          role: 'user',
          content: `Prepare a história ${story.storyNumber} com grifos e respostas às 3 perguntas oficiais do EBC.`,
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
  };

  const highlights = refineStoryHighlights(
    (parsed.highlights ?? []).filter((item) => item.blockId && item.text && item.color),
    blocks,
  );

  const fields = (parsed.fields ?? []).filter(
    (field) =>
      LFB_STUDY_FIELD_IDS.includes(field.fieldId as (typeof LFB_STUDY_FIELD_IDS)[number]) &&
      field.value?.trim(),
  );

  if (fields.length < 3) return null;

  return { highlights, fields: fields.slice(0, 3) };
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
          startOffset: 0,
          endOffset: highlight.text.length,
        })),
      );
      allHighlights.push(...prep.highlights);
    }

    const studyNotes = prep.fields
      .filter(
        (field) =>
          isLfbStudyNoteId(field.fieldId) &&
          field.value?.trim(),
      )
      .slice(0, 3)
      .map((field) => buildLfbStudyNote(field.fieldId, field.value.trim(), html));

    if (studyNotes.length > 0) {
      await saveNotesBatch(userDataDir, LFB_PUB, LFB_ISSUE, documentId, studyNotes);
      for (const note of studyNotes) {
        savedNotes.push({ noteId: note.id, body: note.body });
      }
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
