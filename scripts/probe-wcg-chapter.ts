import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadJwpub } from '../electron/jw-download';
import { isPubCached } from '../electron/jw-download';
import { getDocumentHtml, listDocuments } from '../electron/jwpub-reader';

const cacheDir = path.join(process.env.APPDATA ?? '', 'JCS Meetings', 'publications');

async function main() {
  if (!(await isPubCached(cacheDir, 'wcg', '', 'T'))) {
    console.log('Downloading wcg...');
    const result = await downloadJwpub({ pub: 'wcg', issue: '', lang: 'T', cacheDir });
    console.log('Download:', result);
  }

  const candidates = [
    'wcg_T_.jwpub',
    'wcg_T.jwpub',
  ];
  let jwpubPath: string | null = null;
  for (const name of candidates) {
    const p = path.join(cacheDir, name);
    try {
      await fs.access(p);
      jwpubPath = p;
      break;
    } catch {
      /* try next */
    }
  }
  if (!jwpubPath) {
    const files = await fs.readdir(cacheDir);
    jwpubPath = path.join(cacheDir, files.find((f) => f.startsWith('wcg_')) ?? '');
  }
  console.log('jwpub:', jwpubPath);

  const docs = await listDocuments(jwpubPath);
  console.log('Documents:', docs.length);
  for (const doc of docs.slice(0, 15)) {
    console.log(doc.documentId, doc.title);
  }

  const ch3 = docs.find((d) => /cap[ií]tulo\s*3/i.test(d.title) || /^3[\.\)]/.test(d.title));
  const target = ch3 ?? docs.find((d) => d.documentId === 3) ?? docs[2];
  if (!target) {
    console.log('No chapter found');
    return;
  }
  console.log('\nInspecting:', target.documentId, target.title);

  const html = await getDocumentHtml(jwpubPath, target.documentId);
  await fs.writeFile(path.join(process.env.TEMP ?? '.', 'wcg-chapter-probe.html'), html, 'utf8');
  console.log('HTML bytes:', html.length);

  const headings = [...html.matchAll(/<(h[1-6]|p)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 2 && t.length < 120);
  console.log('\nHeadings/sample blocks:');
  for (const h of headings.slice(0, 40)) {
    if (/narrativa|relato|b[ií]blia|considerar|an[aá]lise|medite|quadro|aprenda|imagem|saiba/i.test(h)) {
      console.log(' *', h);
    }
  }
}

main().catch(console.error);
