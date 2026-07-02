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
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));

const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');
const row = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const hash = createHash('sha256').update(row.map(String).join('_')).digest();
const keyIv = Buffer.alloc(32);
for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR[i];

const chapter = db.exec('SELECT FirstVerseId, LastVerseId FROM BibleChapter WHERE BookNumber=24 AND ChapterNumber=11')[0].values[0];
const verses = db.exec(`SELECT BibleVerseId, Label, Content FROM BibleVerse WHERE BibleVerseId BETWEEN ${chapter[0]} AND ${chapter[1]} ORDER BY BibleVerseId`)[0].values;
console.log('verse count', verses.length, 'labels', verses.map(v => v[1]).join(','));

const enc = verses.find(v => String(v[1]) === '21')?.[2] ?? verses[20]?.[2];
const buf = Buffer.from(enc);
const decipher = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
try {
  const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);
  console.log('raw first bytes', decrypted.slice(0, 20));
  try {
    console.log('inflated', inflate(decrypted, { to: 'string' }).slice(0, 200));
  } catch {
    console.log('as utf8', decrypted.toString('utf8').slice(0, 200));
  }
} catch (e) {
  console.log('decrypt fail', e.message);
}
