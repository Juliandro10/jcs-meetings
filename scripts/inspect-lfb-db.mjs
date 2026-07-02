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

const f = path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub', 'lfb_T_.jwpub');
const SQL = await initSqlJs({ locateFile: (x) => require.resolve(`sql.js/dist/${x}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(f));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const m = JSON.parse(await outer.file('manifest.json').async('string'));
const db = new SQL.Database(await inner.file(m.publication.fileName).async('nodebuffer'));

console.log('Publication:', db.exec('SELECT * FROM Publication LIMIT 1')[0]?.values?.[0]);

const docs = db.exec('SELECT DocumentId, Title, MepsDocumentId FROM Document ORDER BY DocumentId');
console.log('Doc count', docs[0]?.values?.length);
for (const row of (docs[0]?.values ?? []).filter((r) => String(r[1]).includes('98') || String(r[1]).includes('99') || Number(r[0]) > 95 && Number(r[0]) < 105)) {
  console.log(row);
}

const extract = db.exec("SELECT Link, Caption FROM Extract WHERE Link LIKE '%1102016109%' OR Caption LIKE '%98%' LIMIT 10")[0]?.values;
console.log('\nExtract samples:', extract);

const meps = db.exec('SELECT DocumentId, MepsDocumentId, Title FROM Document WHERE MepsDocumentId IN (1102016108, 1102016109)')[0]?.values;
console.log('\nMeps docs:', meps);
