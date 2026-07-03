import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const file = path.join(os.tmpdir(), 'jcs-nwtsty-probe', 'nwtsty_T_.jwpub');

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(file));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const dbBuf = await inner.file(manifest.publication.fileName).async('nodebuffer');
const db = new SQL.Database(dbBuf);

const pubRow = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0]
  .values[0];
const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');
const [lang, symbol, year, issue] = pubRow.map(String);
const parts = [lang, symbol, year];
if (issue && issue !== '0' && Number(issue) !== 0) parts.push(issue);
const hash = createHash('sha256').update(parts.join('_')).digest();
const keyIv = Buffer.alloc(32);
for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR[i];

function decrypt(buf) {
  const decipher = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(buf)), decipher.final()]);
  return inflate(decrypted, { to: 'string' });
}

// John 3:16
const chapter = db.exec(
  'SELECT FirstVerseId, LastVerseId FROM BibleChapter WHERE BookNumber = 43 AND ChapterNumber = 3 LIMIT 1',
)[0]?.values?.[0];
console.log('John 3 verse range:', chapter);

const verses = db.exec(
  `SELECT BibleVerseId, Label FROM BibleVerse WHERE BibleVerseId BETWEEN ${chapter[0]} AND ${chapter[1]} ORDER BY BibleVerseId`,
)[0]?.values;
console.log('verse labels:', verses?.map((v) => v[1]).join(', '));
function verseNum(labelHtml) {
  const m = String(labelHtml).match(/class="vl"[^>]*>\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

const v16 = verses?.find((v) => verseNum(v[1]) === 16);
console.log('Verse 16 id:', v16);

if (v16) {
  const maps = db.exec(
    `SELECT VerseCommentaryId FROM VerseCommentaryMap WHERE BibleVerseId = ${v16[0]}`,
  )[0]?.values;
  console.log('Commentary ids for 16:', maps);

  for (const [vcId] of maps ?? []) {
    const row = db.exec(`SELECT Label, CommentaryType, Content FROM VerseCommentary WHERE VerseCommentaryId = ${vcId} LIMIT 1`)[0]
      ?.values?.[0];
    if (row?.[2]) {
      const html = decrypt(row[2]);
      console.log('\nNote label:', row[0], 'type:', row[1]);
      console.log('Note HTML:', html.slice(0, 800));
    }
  }
}

// Check chapter HTML for study markers
const enc = db.exec(
  'SELECT Content FROM BibleChapter WHERE BookNumber = 43 AND ChapterNumber = 3 LIMIT 1',
)[0]?.values?.[0]?.[0];
if (enc) {
  const chHtml = decrypt(enc);
  const hasFoot = /footnote|study|fn|vc/i.test(chHtml);
  console.log('\nChapter has footnote markers:', hasFoot);
  const v16idx = chHtml.indexOf('v43-3-16');
  console.log('John 3:16 snippet:', chHtml.slice(Math.max(0, v16idx - 50), v16idx + 400));
}

// Gen 1:1
const g1ch = db.exec(
  'SELECT FirstVerseId, LastVerseId FROM BibleChapter WHERE BookNumber = 1 AND ChapterNumber = 1 LIMIT 1',
)[0]?.values?.[0];
const g1verses = db.exec(
  `SELECT BibleVerseId, Label FROM BibleVerse WHERE BibleVerseId BETWEEN ${g1ch[0]} AND ${g1ch[1]} ORDER BY BibleVerseId`,
)[0]?.values;
const g1v1 = g1verses?.find((v) => verseNum(v[1]) === 1);
console.log('\nGen 1:1 verse id:', g1v1);
if (g1v1) {
  const maps = db.exec(`SELECT VerseCommentaryId FROM VerseCommentaryMap WHERE BibleVerseId = ${g1v1[0]}`)[0]
    ?.values;
  console.log('Gen 1:1 commentary count:', maps?.length);
  if (maps?.[0]) {
    const row = db.exec(`SELECT Label, Content FROM VerseCommentary WHERE VerseCommentaryId = ${maps[0][0]}`)[0]?.values?.[0];
    console.log('Gen 1:1 note:', decrypt(row[1]).slice(0, 400));
  }
}
