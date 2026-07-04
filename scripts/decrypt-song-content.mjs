import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';

const XOR_KEY = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');

function deriveKeyIv(db) {
  const row = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0]
    ?.values?.[0];
  const [lang, symbol, year, issue] = row.map(String);
  const parts = [lang, symbol, year];
  if (issue && issue !== '0' && Number(issue) !== 0) parts.push(issue);
  const hash = createHash('sha256').update(parts.join('_')).digest();
  const keyIv = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR_KEY[i];
  return keyIv;
}

function decryptContent(keyIv, encrypted) {
  const buf = Buffer.from(encrypted);
  const decipher = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);
  return inflate(decrypted, { to: 'string' });
}

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(root, 'jwpub-work/extracted/inner/sjj_T.db');
const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(dbPath));
const keyIv = deriveKeyIv(db);

for (const docId of [67, 1, 2]) {
  const row = db.exec(`SELECT Title, Content FROM Document WHERE DocumentId=${docId}`)[0]?.values?.[0];
  if (!row?.[1]) continue;
  const html = decryptContent(keyIv, row[1]);
  console.log(`\n=== Document ${docId}: ${row[0]} ===`);
  console.log('length', html.length);
  for (const m of html.matchAll(/jwpub:[^"'\s>]+|p\/T:[^"'\s>]+|digital|subImg|SubImg|htmlOver|viewMode/gi)) {
    console.log('hit', m[0].slice(0, 120));
  }
  console.log(html.slice(0, 1200).replace(/\s+/g, ' '));
}
