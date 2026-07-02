import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const file = path.join(os.tmpdir(), 'jcs-nwt', 'nwt_T_.jwpub');

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(file));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const dbBuf = await inner.file(manifest.publication.fileName).async('nodebuffer');
const db = new SQL.Database(dbBuf);

const tables = db
  .exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Bible%'")
  .flatMap((r) => r.values.map((v) => v[0]));
console.log('Bible tables:', tables);

for (const table of tables.slice(0, 6)) {
  const sample = db.exec(`SELECT * FROM ${table} LIMIT 1`)[0];
  console.log(`\n${table} cols:`, sample?.columns?.slice(0, 10));
}

const cols = db.exec('SELECT * FROM BibleBook LIMIT 1')[0].columns;
console.log('BibleBook cols:', cols);

const jer = db.exec("SELECT BibleBookId, BookDisplayTitle FROM BibleBook WHERE BibleBookId=24 LIMIT 1")[0]?.values?.[0];
console.log('Book 24:', jer);

const vcols = db.exec('SELECT * FROM BibleVerse LIMIT 1')[0].columns;
console.log('BibleVerse cols:', vcols);

const chCols = db.exec('SELECT * FROM BibleChapter LIMIT 1')[0].columns;
console.log('BibleChapter cols:', chCols);

const chapter = db.exec(
  'SELECT BibleChapterId, ChapterNumber, FirstVerseId, LastVerseId FROM BibleChapter WHERE BookNumber=24 AND ChapterNumber=11 LIMIT 1',
)[0]?.values?.[0];
console.log('Chapter 11:', chapter);

if (chapter) {
  const [, , firstId, lastId] = chapter;
  const verseRows = db.exec(
    `SELECT BibleVerseId, Label FROM BibleVerse WHERE BibleVerseId BETWEEN ${firstId} AND ${lastId} ORDER BY BibleVerseId LIMIT 25`,
  )[0]?.values;
  console.log('Verses in ch11:', verseRows);

  const verseRow = db.exec(
    `SELECT BibleVerseId, Label, Content FROM BibleVerse WHERE BibleVerseId BETWEEN ${firstId} AND ${lastId} AND CAST(Label AS TEXT)='21' LIMIT 1`,
  )[0]?.values?.[0] ?? db.exec(
    `SELECT BibleVerseId, Label, Content FROM BibleVerse WHERE BibleVerseId BETWEEN ${firstId} AND ${lastId} ORDER BY BibleVerseId LIMIT 1 OFFSET 20`,
  )[0]?.values?.[0];

  if (verseRow?.[2]) {
    const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');
    const row = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
    const hash = createHash('sha256').update(row.map(String).join('_')).digest();
    const keyIv = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR[i];
    const buf = Buffer.from(verseRow[2]);
    const decipher = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
    const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);
    const text = inflate(decrypted, { to: 'string' });
    console.log('Verse HTML:', text.slice(0, 300));
  }
}

