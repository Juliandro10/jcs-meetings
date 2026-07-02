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

const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');
const row = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const hash = createHash('sha256').update(row.map(String).join('_')).digest();
const keyIv = Buffer.alloc(32);
for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR[i];

function decrypt(encrypted) {
  const buf = Buffer.from(encrypted);
  const decipher = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);
  return inflate(decrypted, { to: 'string' });
}

const enc = db.exec('SELECT Content FROM BibleChapter WHERE BookNumber=24 AND ChapterNumber=11 LIMIT 1')[0]?.values?.[0]?.[0];
const html = decrypt(enc);
console.log('Chapter HTML len', html.length);
console.log(html.slice(0, 500));
const v21 = html.match(/<span[^>]*data-vid="24 11:21"[^>]*>[\s\S]*?<\/span>/i);
console.log('verse match', v21?.[0]?.slice(0, 200));
