import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { createHash, createDecipheriv } from 'node:crypto';
import { inflate } from 'pako';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');
function derive(row) {
  const parts = [row[0], row[1], row[2]];
  if (row[3] && row[3] !== '0' && Number(row[3]) !== 0) parts.push(row[3]);
  const hash = createHash('sha256').update(parts.join('_')).digest();
  const keyIv = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR[i];
  return keyIv;
}
function decrypt(keyIv, enc) {
  const buf = Buffer.from(enc);
  const d = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  return inflate(Buffer.concat([d.update(buf), d.final()]), { to: 'string' });
}

const file = path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub', 'mwb_T_202605.jwpub');
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(file));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));
const row = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const keyIv = derive(row.map(String));
const doc = decrypt(keyIv, db.exec('SELECT Content FROM Document WHERE DocumentId=9')[0].values[0][0]);

const idx = doc.indexOf('w04');
console.log(doc.slice(idx - 200, idx + 500));

const pubLinks = [...doc.matchAll(/href="(jwpub:\/\/p[^"]+)"/gi)];
console.log('\npub links', pubLinks.map((m) => m[1]));

const hyper = db.exec('SELECT Link, Caption FROM Hyperlink LIMIT 5')[0]?.values;
console.log('\nHyperlink sample', hyper);

const allPubExtracts = db.exec("SELECT Link FROM Extract WHERE Link LIKE 'p/%' LIMIT 5")[0]?.values;
console.log('\nextract pub links sample', allPubExtracts);
