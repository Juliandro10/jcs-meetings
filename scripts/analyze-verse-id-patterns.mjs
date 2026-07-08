import os from 'node:os';
import path from 'node:path';
import { openJwpubBundle } from '../electron/jwpub-bundle.ts';
import { decryptContent } from '../electron/jwpub-crypto.ts';

const file = path.join(os.tmpdir(), 'jcs-nwtsty-probe', 'nwtsty_T_.jwpub');
const bundle = await openJwpubBundle(file);

function chapterHtml(book, chapter) {
  const enc = bundle.db.exec(
    `SELECT Content FROM BibleChapter WHERE BookNumber=${book} AND ChapterNumber=${chapter} LIMIT 1`,
  )[0]?.values?.[0]?.[0];
  return decryptContent(bundle.keyIv, enc);
}

function verseIds(html) {
  return [...html.matchAll(/<span id="(v[^"]+)"/g)].map((m) => m[1]);
}

function test(book, chapter, verse) {
  const html = chapterHtml(book, chapter);
  const prefix = `v${book}-${chapter}-${verse}-`;
  const matches = verseIds(html).filter((id) => id.startsWith(prefix));
  console.log(`${book}:${chapter}:${verse} -> ${matches.length} ids`, matches.slice(0, 4).join(', '));
}

// sample failing-prone refs from meeting pubs
for (const [b, c, v] of [
  [43, 3, 16],
  [40, 24, 14],
  [45, 8, 28],
  [19, 37, 11],
  [1, 1, 1],
  [66, 21, 4],
  [24, 29, 11],
  [23, 53, 11],
]) test(b, c, v);

// check alternate id patterns
const html = chapterHtml(43, 3);
const allIds = verseIds(html);
const unusual = allIds.filter((id) => !/^v\d+-\d+-\d+-\d+$/.test(id));
console.log('\nUnusual John 3 ids:', unusual.slice(0, 10));

// BibleVerse labels
const ch = bundle.db.exec('SELECT FirstVerseId, LastVerseId FROM BibleChapter WHERE BookNumber=43 AND ChapterNumber=3 LIMIT 1')[0].values[0];
const verses = bundle.db.exec(`SELECT BibleVerseId, Label FROM BibleVerse WHERE BibleVerseId BETWEEN ${ch[0]} AND ${ch[1]} ORDER BY BibleVerseId LIMIT 5`)[0].values;
console.log('\nBibleVerse labels sample:', verses);
