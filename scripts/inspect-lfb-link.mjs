import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');
function derive(row) {
  const p = [row[0], row[1], row[2]];
  if (row[3] && row[3] !== '0' && Number(row[3]) !== 0) p.push(row[3]);
  const h = createHash('sha256').update(p.join('_')).digest();
  const k = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) k[i] = h[i] ^ XOR[i];
  return k;
}

const f = path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub', 'mwb_T_202605.jwpub');
if (!fs.existsSync(f)) {
  console.log('sem cache mwb');
  process.exit(0);
}

const SQL = await initSqlJs({ locateFile: (x) => require.resolve(`sql.js/dist/${x}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(f));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const m = JSON.parse(await outer.file('manifest.json').async('string'));
const db = new SQL.Database(await inner.file(m.publication.fileName).async('nodebuffer'));
const row = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const key = derive(row.map(String));
const enc = db.exec('SELECT Content FROM Document WHERE DocumentId=9')[0].values[0][0];
const d = createDecipheriv('aes-128-cbc', key.subarray(0, 16), key.subarray(16, 32));
const html = inflate(Buffer.concat([d.update(Buffer.from(enc)), d.final()]), { to: 'string' });

console.log('Links com lfb:');
for (const match of html.matchAll(/<a[^>]+href="(jwpub:[^"]+)"[^>]*>[\s\S]*?<\/a>/gi)) {
  const chunk = match[0].replace(/\s+/g, ' ');
  if (/lfb/i.test(chunk)) console.log(match[1], '|', chunk.slice(0, 180));
}

const idx = html.indexOf('lfb hist');
console.log('\nContexto p30:', html.slice(idx - 80, idx + 200).replace(/\s+/g, ' '));
