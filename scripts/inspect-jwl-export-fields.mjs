import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';

const require = createRequire(import.meta.url);
const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');

const cacheDir = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/cache/jwpub');
const jwpub = path.join(cacheDir, 'mwb_T_202605.jwpub');

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(jwpub));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));

function decrypt(docId) {
  const pub = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
  const hash = createHash('sha256').update(pub.map(String).join('_')).digest();
  const keyIv = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR[i];
  const enc = Buffer.from(db.exec(`SELECT Content FROM Document WHERE DocumentId=${docId}`)[0].values[0][0]);
  const dec = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  return inflate(Buffer.concat([dec.update(enc), dec.final()]), { to: 'string' });
}

const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.map((v) => v[0]);
console.log('tables with Field or Paragraph:', tables.filter((t) => /field|paragraph|input/i.test(String(t))));

const dpCols = db.exec('SELECT * FROM DocumentParagraph LIMIT 1')[0]?.columns;
console.log('DocumentParagraph cols:', dpCols);
const dp = db.exec('SELECT * FROM DocumentParagraph WHERE DocumentId=9 ORDER BY ParagraphIndex LIMIT 20')[0]?.values;
console.log('DocumentParagraph doc9:', dp);

const pvif = db.exec('SELECT * FROM PublicationViewItemField LIMIT 5')[0];
console.log('PublicationViewItemField cols:', pvif?.columns);
console.log('PublicationViewItemField rows:', pvif?.values);

const html = decrypt(9);
const textareas = [...html.matchAll(/<textarea[^>]*>/gi)].map((m) => m[0]);
console.log('\ntextareas count', textareas.length);
console.log(textareas.slice(0, 5));

const pidBlocks = [...html.matchAll(/data-pid="(\d+)"/g)].map((m) => m[1]);
console.log('\ndata-pid values sample:', [...new Set(pidBlocks)].slice(0, 25));

for (const pid of ['8', '12', '20', '22', '30']) {
  const idx = html.indexOf(`data-pid="${pid}"`);
  if (idx >= 0) console.log(`\npid ${pid} snippet:`, html.slice(idx, idx + 200).replace(/\s+/g, ' '));
}

const pids = [...html.matchAll(/data-pid="(\d+)"/g)].map((m) => Number(m[1]));
const dpAll = db
  .exec('SELECT ParagraphIndex FROM DocumentParagraph WHERE DocumentId=9 ORDER BY ParagraphIndex')[0]
  .values.map((v) => Number(v[0]));
console.log('\nmax data-pid', Math.max(...pids), 'max ParagraphIndex', dpAll.at(-1));
for (const pid of [8, 12, 20, 22, 30]) console.log('pid', pid, 'has ParagraphIndex', dpAll.includes(pid));

const pvid = db.exec('SELECT DocumentId, PublicationViewItemId FROM PublicationViewItemDocument WHERE DocumentId=9 LIMIT 3')[0]?.values;
console.log('PublicationViewItemDocument doc9', pvid);
