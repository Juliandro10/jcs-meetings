import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const jwpub = path.join(os.tmpdir(), 'jcs-lmd-probe', 'lmd_T_.jwpub');

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(jwpub));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));

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

const row = db.exec('SELECT Content FROM Document WHERE DocumentId = 16 LIMIT 1')[0]?.values?.[0]?.[0];
const html = decrypt(row);
console.log(html.slice(0, 4000));
