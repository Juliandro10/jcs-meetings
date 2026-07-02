import fs from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { createDecipheriv, createHash } from 'crypto';
import { inflate } from 'pako';
import { loadPub } from 'meeting-schedules-parser/dist/node/index.js';

const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');

async function openDb(jwpubPath) {
  const outer = await JSZip.loadAsync(fs.readFileSync(jwpubPath));
  const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
  const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
  const SQL = await initSqlJs();
  return {
    db: new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer')),
    manifest,
  };
}

function decryptContent(db, docId) {
  const pub = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
  const s = pub.map(String).join('_');
  const h = createHash('sha256').update(s).digest();
  const keyIv = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) keyIv[i] = h[i] ^ XOR[i];
  const enc = Buffer.from(db.exec(`SELECT Content FROM Document WHERE DocumentId=${docId}`)[0].values[0][0]);
  const dec = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  return inflate(Buffer.concat([dec.update(enc), dec.final()]), { to: 'string' });
}

const mwbFile = path.join(os.tmpdir(), 'jcs-test-cache2', 'mwb_T_202605.jwpub');
const { db } = await openDb(mwbFile);
const docs = db.exec('SELECT DocumentId, Title FROM Document ORDER BY DocumentId')[0].values;
console.log('mwb docs count', docs.length);
console.log(docs.slice(0, 15));

const schedules = await loadPub(mwbFile);
const week = schedules.find((s) => s.mwb_week_date === '2026/06/29');
console.log('week schedule', week?.mwb_week_date_locale);

// try find doc by title match on tgw talk
for (const d of docs) {
  if (String(d[1]).includes('JEREMIAS') || String(d[1]).includes('29')) console.log('candidate', d);
}

const html = decryptContent(db, 9);
console.log('html9 len', html.length, 'gen-field', (html.match(/gen-field/g) || []).length);
