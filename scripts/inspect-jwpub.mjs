import fs from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { createDecipheriv, createHash } from 'crypto';
import { inflate } from 'pako';

const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');

async function openDb(jwpubPath) {
  const outer = await JSZip.loadAsync(fs.readFileSync(jwpubPath));
  const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
  const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
  const SQL = await initSqlJs();
  const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));
  return db;
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

const wFile = path.join(os.tmpdir(), 'jcs-test-cache', 'w_T_202604.jwpub');
const db = await openDb(wFile);
const docs = db.exec('SELECT DocumentId, Title FROM Document ORDER BY DocumentId')[0].values;
console.log('docs:', docs);

const html = decryptContent(db, 3);
console.log('len', html.length);
console.log('has textarea', html.includes('textarea'));
console.log('has userInput', html.includes('userInput'));
const m = html.match(/class="[^"]*"/g)?.slice(0, 30);
console.log('classes sample', m);
const pIdx = html.indexOf('Pergunta');
console.log('snippet', html.slice(pIdx, pIdx + 1200));
