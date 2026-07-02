import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const file = path.join(os.tmpdir(), 'jcs-img-test', 'mwb_T_202605.jwpub');

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

function decryptContent(encrypted) {
  const buf = Buffer.from(encrypted);
  const decipher = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);
  return inflate(decrypted, { to: 'string' });
}

const link = 'p/T:2004803/17-17';
const encrypted = db.exec(`SELECT Content FROM Extract WHERE Link='${link}'`)[0]?.values?.[0]?.[0];
const html = decryptContent(encrypted);
console.log('Extract HTML preview:', html.slice(0, 600));

const bc = db.exec('SELECT * FROM BibleCitation LIMIT 3');
console.log('\nBibleCitation cols:', bc[0]?.columns);
console.log('BibleCitation rows:', bc[0]?.values);
