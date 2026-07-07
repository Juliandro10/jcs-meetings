import path from 'path';
import os from 'os';
import { getDocumentHtml, resolveCachedPubPath, listDocuments } from '../electron/jwpub-reader';
import { extractDocumentStructure } from '../electron/document-structure';
import { parseLessonRefs, buildStudentLessonBriefs } from '../electron/student-lesson-context';
import { parsePreachingTopics } from '../electron/preaching';
import type { ChairmanAssignment } from '../shared/chairman-prep-types';

const cacheDir = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/publications');

const assignments: ChairmanAssignment[] = [
  { id: 'a3', section: 'tesouros', partTitle: 'Leitura da Bíblia', durationMin: 4, assignees: ['Tiago'] },
  { id: 'a4', section: 'ministerio', partTitle: 'Iniciando conversas', durationMin: 3, assignees: ['R'] },
  { id: 'a5', section: 'ministerio', partTitle: 'Revisitas', durationMin: 4, assignees: ['L'] },
  { id: 'a6', section: 'ministerio', partTitle: 'Estudo bíblico', durationMin: 5, assignees: ['D'] },
];

async function main() {
  const mwbPath = await resolveCachedPubPath(cacheDir, 'mwb', '202607');
  console.log('mwb path:', mwbPath);
  const docs = await listDocuments(mwbPath!);
  console.log(
    'docs:',
    docs.map((d) => ({ id: d.documentId, title: d.title?.slice(0, 70) })),
  );

  let targetDocId = 1;
  for (const doc of docs) {
    const html = await getDocumentHtml(mwbPath!, doc.documentId);
    if (/Jer\.?\s*17|JEREMIAS\s*16|13.?19\s+DE\s+JULHO/i.test(html)) {
      console.log('MATCH doc', doc.documentId, doc.title);
      targetDocId = doc.documentId;
    }
  }

  const html = await getDocumentHtml(mwbPath!, targetDocId);
  const structure = extractDocumentStructure(html);

  console.log('\n--- Ministry/reading parts ---');
  for (const p of structure.parts.filter((x) => x.kind === 'ministry' || x.kind === 'reading')) {
    console.log(`[${p.kind}] ${p.title} block=${p.blockId}`);
    console.log('  text:', p.text.slice(0, 220).replace(/\n/g, ' '));
  }

  const briefs = await buildStudentLessonBriefs(cacheDir, structure, assignments);
  console.log('\n--- Briefs ---');
  for (const b of briefs) {
    console.log(JSON.stringify(b, null, 2));
  }

  const lmdPath = await resolveCachedPubPath(cacheDir, 'lmd', '');
  console.log('\nlmd path:', lmdPath);
  const lmdDocs = await listDocuments(lmdPath!);
  console.log('lmd docs (all titles):');
  for (const doc of lmdDocs.slice(0, 30)) {
    console.log(' ', doc.documentId, JSON.stringify(doc.title?.slice(0, 100)));
  }
  if (lmdDocs.length > 30) console.log(' ... total', lmdDocs.length);

  const lmdHtml = await getDocumentHtml(lmdPath!, 16);
  const parsed = parsePreachingTopics(lmdHtml);
  console.log('lmd topics count:', parsed.topics.length);
  for (const t of parsed.topics.slice(0, 6)) {
    console.log(' topic:', t.title, 'points:', t.points.length);
  }
  const lesson5 = parsed.topics.find((t) => /^5\./.test(t.title) || /lição\s+5/i.test(t.title));
  console.log('lesson5:', lesson5?.title);
  console.log('point5:', lesson5?.points[4]?.plainText?.slice(0, 120));

  for (const docId of [4, 5, 6, 7, 8]) {
    const lessonHtml = await getDocumentHtml(lmdPath!, docId);
    const lessonParsed = parsePreachingTopics(lessonHtml);
    const lmdDocsList = await listDocuments(lmdPath!);
    const docTitle = lmdDocsList.find((d) => d.documentId === docId)?.title;
    console.log('lmd lesson doc', docId, docTitle, 'topics', lessonParsed.topics.length);
    const topic = lessonParsed.topics[0];
    if (topic) {
      for (const pt of topic.points.slice(0, 8)) {
        console.log('  pt', pt.number, pt.plainText.slice(0, 100));
      }
    } else {
      const liCount = (lessonHtml.match(/<li>/gi) ?? []).length;
      const h2Count = (lessonHtml.match(/<h2/gi) ?? []).length;
      console.log('  no h2 topics; li=', liCount, 'h2=', h2Count);
    }
  }

  const lffDocs = await listDocuments(lffPath!);
  console.log('\nlff docs count', lffDocs.length);
  for (const doc of lffDocs.filter((d) => /^(1[89]|20|19)\b|Lição\s+19/i.test(d.title ?? ''))) {
    console.log(' lff', doc.documentId, doc.title?.slice(0, 70));
  }

  const lffPath = await resolveCachedPubPath(cacheDir, 'lff', '');

  console.log('\n--- Regex ---');
  for (const s of ['(*th* lição 5)', '(lmd lição 5 ponto 5)', '*lff* lição 19']) {
    console.log(s, '=>', parseLessonRefs(s));
  }
}

main().catch(console.error);
