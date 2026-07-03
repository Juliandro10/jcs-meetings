import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const cacheDir = path.join(os.tmpdir(), 'jcs-nwtsty-probe');
fs.mkdirSync(cacheDir, { recursive: true });
const file = path.join(cacheDir, 'nwtsty_T_.jwpub');

if (!fs.existsSync(file)) {
  const apiUrl =
    'https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?pub=nwtsty&issue=&fileformat=JWPUB&output=json&langwritten=T&txtCMSLang=T&alllangs=0';
  const data = JSON.parse(await (await fetch(apiUrl)).text());
  const f = data?.files?.T?.JWPUB?.[0]?.file;
  console.log('downloading', f?.url);
  const buf = Buffer.from(await (await fetch(f.url)).arrayBuffer());
  fs.writeFileSync(file, buf);
}

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(file));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const dbBuf = await inner.file(manifest.publication.fileName).async('nodebuffer');
const db = new SQL.Database(dbBuf);

const tables = db
  .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .flatMap((r) => r.values.map((v) => v[0]));
console.log('tables:', tables.filter((t) => /verse|comment|bible|extract/i.test(String(t))).join(', '));

for (const name of [
  'VerseCommentary',
  'VerseCommentaryMap',
  'BibleChapter',
  'BibleVerse',
  'Extract',
]) {
  if (!tables.includes(name)) continue;
  const sample = db.exec(`SELECT * FROM ${name} LIMIT 1`)[0];
  console.log(`\n${name} cols:`, sample?.columns?.join(', '));
}

// John 3:16 map
const mapCols = db.exec('SELECT * FROM VerseCommentaryMap LIMIT 1')[0]?.columns ?? [];
console.log('\nVerseCommentaryMap cols:', mapCols);

const john3 = db.exec(
  `SELECT * FROM VerseCommentaryMap WHERE BibleBookId = 43 AND ChapterNumber = 3 LIMIT 10`,
)[0];
console.log('John 3 maps:', john3?.values?.length, john3?.values?.slice(0, 3));

// find verse 16
const v16 = db.exec(
  `SELECT * FROM VerseCommentaryMap WHERE BibleBookId = 43 AND ChapterNumber = 3 AND VerseNumber = 16 LIMIT 1`,
)[0]?.values?.[0];
console.log('John 3:16 map row:', v16);

if (v16) {
  const idCol = mapCols.indexOf('VerseCommentaryId');
  const vcId = v16[idCol >= 0 ? idCol : 0];
  const vc = db.exec(`SELECT * FROM VerseCommentary WHERE VerseCommentaryId = ${vcId} LIMIT 1`)[0];
  console.log('VerseCommentary cols:', vc?.columns);
  console.log('VerseCommentary row preview:', vc?.values?.[0]?.slice(0, 3));
}

// count notes
const count = db.exec('SELECT COUNT(*) FROM VerseCommentaryMap')[0]?.values?.[0]?.[0];
console.log('\nTotal VerseCommentaryMap rows:', count);

// Genesis 1:1
const g11 = db.exec(
  `SELECT * FROM VerseCommentaryMap WHERE BibleBookId = 1 AND ChapterNumber = 1 AND VerseNumber = 1 LIMIT 1`,
)[0]?.values?.[0];
console.log('Gen 1:1 map:', g11);
