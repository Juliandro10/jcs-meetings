import path from 'node:path';
import os from 'node:os';
import { openJwpubBundle } from '../electron/jwpub-bundle.ts';
import { decryptContent } from '../electron/jwpub-crypto.ts';

function cleanVerseBlockHtml(block) {
  let html = block.replace(/<span[^>]*class="[^"]*\bvl\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
  html = html.replace(/<span id="v\d+-\d+-\d+-\d+"[^>]*>/gi, '');
  html = html.replace(/<\/span>/gi, '');
  html = html.replace(/<\/?p[^>]*>/gi, ' ');
  html = html.replace(/<\/?div[^>]*>/gi, ' ');
  return html.replace(/\s+/g, ' ').trim();
}

function extractVerseHtml(chapterHtml, book, chapter, verse) {
  const startRe = new RegExp(`<span id="v${book}-${chapter}-${verse}-\\d+"`);
  const startMatch = startRe.exec(chapterHtml);
  if (!startMatch) return null;

  const startIdx = startMatch.index;
  const anyPartRe = new RegExp(`<span id="v${book}-${chapter}-(\\d+)-\\d+"`, 'g');
  anyPartRe.lastIndex = startIdx + 1;

  let endIdx = chapterHtml.length;
  let nextPart;
  while ((nextPart = anyPartRe.exec(chapterHtml))) {
    if (Number(nextPart[1]) > verse) {
      endIdx = nextPart.index;
      break;
    }
  }

  return cleanVerseBlockHtml(chapterHtml.slice(startIdx, endIdx)) || null;
}

const nwt = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/cache/jwpub/nwt_T_.jwpub');
const bundle = await openJwpubBundle(nwt);
const encrypted = bundle.db.exec('SELECT Content FROM BibleChapter WHERE BookNumber = 24 AND ChapterNumber = 12 LIMIT 1')[0]
  ?.values?.[0]?.[0];
const chapterHtml = decryptContent(bundle.keyIv, encrypted);
const v5 = extractVerseHtml(chapterHtml, 24, 12, 5);
console.log('Jer 12:5:', v5);
console.log('length', v5?.length);
console.log('has cavalos', v5?.includes('cavalos'));
console.log('has Jordão', v5?.includes('Jordão'));
