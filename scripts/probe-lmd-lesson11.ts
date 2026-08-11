import path from 'node:path';
import os from 'node:os';
import { getDocumentHtml, listDocuments, resolveCachedPubPath } from '../electron/jwpub-reader.ts';
import { parsePreachingTopics } from '../electron/preaching.ts';
import { parseLessonRefs } from '../electron/student-lesson-context.ts';

const cacheDir = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/publications');

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumberedParagraphPoints(body: string) {
  const points = [];
  const seen = new Set<number>();
  const pMatches = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  for (let index = 0; index < pMatches.length; index += 1) {
    const plainText = stripHtml(pMatches[index]![1]!);
    const numberMatch = plainText.match(/^(\d+)\.\s+/);
    if (!numberMatch) continue;
    const number = Number(numberMatch[1]);
    if (seen.has(number)) continue;
    let fullText = plainText;
    for (let next = index + 1; next < pMatches.length; next += 1) {
      const nextPlain = stripHtml(pMatches[next]![1]!);
      if (/^(\d+)\.\s+/.test(nextPlain)) break;
      if (nextPlain.trim()) fullText += ` ${nextPlain}`;
    }
    seen.add(number);
    points.push({ number, plainText: fullText });
  }
  return points.sort((a, b) => a.number - b.number);
}

function parseNumberedLessonPoints(html: string) {
  const bodyMatch = html.match(/<div class="bodyTxt">([\s\S]*?)<\/div>\s*(?:<\/article|<div class="pubRefs|$)/i);
  const body = bodyMatch?.[1] ?? html;
  return parseNumberedParagraphPoints(body);
}

async function main() {
  const lmdPath = await resolveCachedPubPath(cacheDir, 'lmd', '');
  if (!lmdPath) {
    console.log('lmd não baixado');
    return;
  }

  const docs = await listDocuments(lmdPath);
  console.log('docs:');
  for (const doc of docs) console.log(' ', doc.documentId, doc.title);

  let targetId: number | null = null;
  for (const doc of docs) {
    if (/^11\b/.test(doc.title ?? '') || /lição\s+0?11/i.test(doc.title ?? '')) {
      targetId = doc.documentId;
      console.log('match title', doc.documentId, doc.title);
      break;
    }
  }

  if (targetId == null) {
    for (const doc of docs.slice(0, 40)) {
      const html = await getDocumentHtml(lmdPath, doc.documentId);
      if (/LI[ÇC]ÃO\s*11\b/i.test(html)) {
        targetId = doc.documentId;
        console.log('match html', doc.documentId, doc.title);
        break;
      }
    }
  }

  if (targetId == null) {
    console.log('lição 11 não encontrada');
    return;
  }

  const html = await getDocumentHtml(lmdPath, targetId);
  console.log('has Nao fale demais:', /Não fale demais/i.test(html));
  const idx = html.search(/Não fale demais/i);
  if (idx >= 0) console.log('snippet:', html.slice(idx - 120, idx + 400).replace(/\s+/g, ' '));
  const { topics } = parsePreachingTopics(html);
  console.log('\nparsePreachingTopics:');
  for (const t of topics) {
    console.log(' topic:', t.title);
    for (const p of t.points) console.log('  ', p.number, p.plainText.slice(0, 140));
  }

  console.log('\nparseNumberedLessonPoints (fixed):');
  for (const p of parseNumberedLessonPoints(html)) {
    console.log(' ', p.number, p.plainText.slice(0, 140));
  }

  const ref = parseLessonRefs('lmd lição 11 ponto 3')[0];
  console.log('\nref', ref);
}

main().catch(console.error);
