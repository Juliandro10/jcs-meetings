import path from 'node:path';
import os from 'node:os';
import { openJwpubBundle } from '../electron/jwpub-bundle.ts';
import { decryptContent } from '../electron/jwpub-crypto.ts';

const nwt = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/cache/jwpub/nwt_T_.jwpub');
const bundle = await openJwpubBundle(nwt);
const book = 24;
const chapter = 12;
const verse = 5;

const encrypted = bundle.db.exec(
  `SELECT Content FROM BibleChapter WHERE BookNumber = ${book} AND ChapterNumber = ${chapter} LIMIT 1`,
)[0]?.values?.[0]?.[0];

const chapterHtml = decryptContent(bundle.keyIv, encrypted);

const idPrefix = `id="v${book}-${chapter}-${verse}-`;
const startIdx = chapterHtml.indexOf(idPrefix);
console.log('startIdx', startIdx);
console.log('snippet at start:', chapterHtml.slice(startIdx, startIdx + 800));

const nextVerseRe = new RegExp(`<span id="v${book}-${chapter}-\\d+-`, 'g');
const openTagEnd = chapterHtml.indexOf('>', startIdx);
nextVerseRe.lastIndex = openTagEnd + 1;
let m;
while ((m = nextVerseRe.exec(chapterHtml))) {
  console.log('next match at', m.index, m[0], chapterHtml.slice(m.index, m.index + 80));
}

// find all verse ids in chapter
const all = [...chapterHtml.matchAll(/<span id="v24-12-(\d+)-/g)].map((x) => x[1]);
console.log('verse ids found:', all.join(', '));
