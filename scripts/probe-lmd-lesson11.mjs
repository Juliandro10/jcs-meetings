import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cacheDir = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/publications');

async function main() {
  const { resolveCachedPubPath, listDocuments, getDocumentHtml } = await import('../dist-electron/main.js').catch(
    () => null,
  );

  // Use compiled path via dynamic import of ts - run with node after build
  const jw = await import('../electron/jwpub-reader.ts');
  const { parsePreachingTopics } = await import('../electron/preaching.ts');

  const lmdPath = await jw.resolveCachedPubPath(cacheDir, 'lmd', '');
  if (!lmdPath) {
    console.log('lmd não baixado');
    return;
  }

  const docs = await jw.listDocuments(lmdPath);
  const lessonDoc = docs.find(
    (d) => /^11\b/.test(d.title ?? '') || /lição\s+0?11/i.test(d.title ?? ''),
  );

  if (!lessonDoc) {
    console.log('doc lição 11 não encontrado; títulos:', docs.map((d) => d.title).slice(0, 20));
    return;
  }

  console.log('doc', lessonDoc.documentId, lessonDoc.title);
  const html = await jw.getDocumentHtml(lmdPath, lessonDoc.documentId);
  const { topics } = parsePreachingTopics(html);
  for (const t of topics) {
    console.log('topic:', t.title);
    for (const p of t.points) {
      console.log(' ', p.number, p.plainText.slice(0, 140));
    }
  }

  const point3 = topics.flatMap((t) => t.points).find((p) => p.number === 3);
  console.log('\nPONTO 3:', point3?.plainText ?? '(não encontrado)');
}

main().catch(console.error);
