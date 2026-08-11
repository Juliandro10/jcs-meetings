import path from 'node:path';
import { getDocumentHtml } from '../electron/jwpub-reader';
import {
  extractWcgChapterQuestions,
  parseWcgChapterStructure,
} from '../shared/wcg-chapter-parse';
import { resolveHighlightInBlock } from '../electron/document-structure';

async function main() {
  const jwpubPath = path.join(process.env.APPDATA ?? '', 'JCS Meetings', 'publications', 'wcg_T_.jwpub');
  const html = await getDocumentHtml(jwpubPath, 9);
  const structure = parseWcgChapterStructure(html);
  const questions = extractWcgChapterQuestions(structure);
  const blockById = new Map(structure.blocks.map((b) => [b.pid, b.text]));

  console.log('chapter', structure.chapterNumber, structure.title);
  console.log('blocks', structure.blocks.length, 'questions', questions.length);
  console.log('question ids:', questions.map((q) => q.id).join(', '));

  const narrative = structure.blocks.filter((b) => {
    const section = structure.sections.find((s) => s.blocks.some((x) => x.pid === b.pid));
    return section?.kind === 'narrative';
  });

  let resolved = 0;
  for (const block of narrative.slice(0, 8)) {
    const sentence = block.text.split(/(?<=[.!?])\s+/).find((s) => s.length > 40);
    if (!sentence) continue;
    const hit = resolveHighlightInBlock(block.text, sentence, { fullSentence: true, maxWords: 35, minWords: 3 });
    console.log('highlight test p' + block.pid, hit ? 'OK' : 'FAIL', sentence.slice(0, 60));
    if (hit) resolved += 1;
  }
  console.log('highlight resolution sample:', resolved, '/ 8');
}

main().catch(console.error);
