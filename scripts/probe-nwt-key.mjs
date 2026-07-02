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

const pub = db.exec('SELECT * FROM Publication LIMIT 1')[0];
console.log('Publication cols', pub.columns);
console.log('Publication row', pub.values[0]);

const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');
const row = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const hash = createHash('sha256').update(row.map(String).join('_')).digest();
const keyIv = Buffer.alloc(32);
for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR[i];
console.log('keyIv hex', keyIv.toString('hex'));

function tryDecrypt(label, encrypted) {
  const buf = Buffer.from(encrypted);
  try {
    const decipher = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
    const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);
    try {
      const text = inflate(decrypted, { to: 'string' });
      console.log(label, 'OK inflated', text.slice(0, 120));
      return;
    } catch {
      console.log(label, 'OK raw utf8', decrypted.toString('utf8').slice(0, 120));
      return;
    }
  } catch (e) {
    console.log(label, 'FAIL', e.message);
  }
}

const doc2 = db.exec('SELECT Content FROM Document WHERE DocumentId=2 LIMIT 1')[0]?.values?.[0]?.[0];
tryDecrypt('Document 2', doc2);

const ch = db.exec('SELECT Content FROM BibleChapter WHERE BookNumber=24 AND ChapterNumber=11 LIMIT 1')[0]?.values?.[0]?.[0];
tryDecrypt('BibleChapter 24:11', ch);

const verse = db.exec(
  `SELECT v.Content FROM BibleVerse v JOIN BibleChapter c ON v.BibleVerseId BETWEEN c.FirstVerseId AND c.LastVerseId WHERE c.BookNumber=24 AND c.ChapterNumber=11 AND v.Label=21 LIMIT 1`,
)[0]?.values?.[0]?.[0];
tryDecrypt('BibleVerse 24:11:21', verse);
