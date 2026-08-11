import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../electron/env';
import { getDocumentHtml, resolveCachedPubPath } from '../electron/jwpub-reader';
import {
  buildWcgPrepExcerpt,
  extractWcgChapterQuestions,
  parseWcgChapterStructure,
} from '../shared/wcg-chapter-parse';
import { resolveHighlightInBlock } from '../electron/document-structure';
import {
  JW_AI_GROUNDING_RULES,
  JW_WCG_CONDUCTOR_RULES,
  JW_WCG_HIGHLIGHT_RULES,
  JW_WCG_PREP_RULES,
  JW_WCG_QUESTION_RULES,
} from '../electron/ai-prompts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile({ appRoot: root });

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_WCG_PREP_MODEL?.trim() || 'gpt-4.1';

async function main() {
  const cacheDir = path.join(process.env.APPDATA ?? '', 'JCS Meetings', 'publications');
  const filePath = await resolveCachedPubPath(cacheDir, 'wcg', '');
  const html = await getDocumentHtml(filePath!, 9);
  const structure = parseWcgChapterStructure(html);
  const questions = extractWcgChapterQuestions(structure);
  const excerpt = buildWcgPrepExcerpt(structure);
  const blockById = new Map(structure.blocks.map((b) => [b.pid, b.text]));
  const questionList = questions.map((q) => `- ${q.id} | [p${q.blockId}] ${q.text}`).join('\n');

  const apiKey = process.env.OPENAI_API_KEY!.trim();
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.25,
      max_tokens: 12000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Prepare o estudo wcg. Devolva JSON com conductorNote, highlights, questionAnswers.',
            JW_AI_GROUNDING_RULES,
            JW_WCG_PREP_RULES,
            JW_WCG_CONDUCTOR_RULES,
            JW_WCG_QUESTION_RULES,
            JW_WCG_HIGHLIGHT_RULES,
            'Perguntas:',
            questionList,
            'JSON schema: {"conductorNote":"...","highlights":[{"blockId":"3","text":"...","color":"yellow"}],"questionAnswers":[{"noteId":"wcg-q-14","body":"..."}]}',
            excerpt.slice(0, 40000),
          ].join('\n'),
        },
        { role: 'user', content: 'Prepare o capítulo.' },
      ],
    }),
  });

  console.log('HTTP', response.status);
  if (!response.ok) {
    console.log(await response.text());
    return;
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  const parsed = JSON.parse(raw);
  console.log('conductor len', parsed.conductorNote?.length ?? 0);
  console.log('raw highlights', parsed.highlights?.length ?? 0);
  console.log('raw answers', parsed.questionAnswers?.length ?? 0);

  let resolved = 0;
  let missingBlock = 0;
  let noMatch = 0;
  for (const h of parsed.highlights ?? []) {
    let blockId = String(h.blockId ?? '').replace(/^p/i, '');
    if (!blockById.has(blockId)) {
      missingBlock++;
      continue;
    }
    const hit = resolveHighlightInBlock(blockById.get(blockId)!, h.text, {
      fullSentence: true,
      maxWords: 35,
      minWords: 3,
    });
    if (hit) resolved++;
    else noMatch++;
  }
  console.log('highlights resolved', resolved, 'missingBlock', missingBlock, 'noMatch', noMatch);

  const answerIds = new Set((parsed.questionAnswers ?? []).map((a: { noteId: string }) => a.noteId));
  const matched = questions.filter((q) => answerIds.has(q.id)).length;
  console.log('questions matched', matched, '/', questions.length, 'need', Math.ceil(questions.length * 0.7));

  if (noMatch > 0) {
    const sample = (parsed.highlights ?? []).find((h: { blockId: string; text: string }) => {
      const blockId = String(h.blockId).replace(/^p/i, '');
      return blockById.has(blockId) && !resolveHighlightInBlock(blockById.get(blockId)!, h.text, { fullSentence: true, maxWords: 35, minWords: 3 });
    });
    if (sample) {
      console.log('sample fail block', sample.blockId, 'text', sample.text.slice(0, 100));
      const bid = String(sample.blockId).replace(/^p/i, '');
      console.log('block text', blockById.get(bid)?.slice(0, 150));
    }
  }
}

main().catch(console.error);
