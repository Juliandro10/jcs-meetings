import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';

const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');

function derive(row) {
  const h = createHash('sha256').update(row.map(String).join('_')).digest();
  const k = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) k[i] = h[i] ^ XOR[i];
  return k;
}

const cache = path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub');
const files = fs.existsSync(cache) ? fs.readdirSync(cache).filter((f) => f.endsWith('.jwpub')) : [];
console.log('jwpub files', files);

async function inspect(file, docId) {
  const f = path.join(cache, file);
  if (!fs.existsSync(f)) return;
  const outer = await JSZip.loadAsync(fs.readFileSync(f));
  const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
  const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
  const cssFiles = Object.keys(inner.files).filter((n) => /\.css$/i.test(n));
  console.log('\n===', file, 'doc', docId, '===');
  console.log('css in zip:', cssFiles);

  const SQL = await initSqlJs();
  const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));
  const tables =
    db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]?.values?.map((r) => r[0]) ?? [];
  const cssTables = tables.filter((t) => /css|style/i.test(String(t)));
  console.log('css-related tables', cssTables);
  for (const t of cssTables) {
    const sample = db.exec(`SELECT * FROM ${t} LIMIT 1`)[0];
    console.log(' ', t, sample?.columns, sample?.values?.[0]?.slice?.(0, 3));
  }

  const pubRow = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0]
    .values[0];
  const key = derive(pubRow.map(String));
  const enc = db.exec(`SELECT Content FROM Document WHERE DocumentId=${docId}`)[0]?.values?.[0]?.[0];
  if (!enc) {
    console.log('no doc');
    return;
  }
  const buf = Buffer.from(enc);
  const d = createDecipheriv('aes-128-cbc', key.subarray(0, 16), key.subarray(16, 32));
  const html = inflate(Buffer.concat([d.update(buf), d.final()]), { to: 'string' });
  console.log('html len', html.length);
  console.log('has style tag', /<style/i.test(html));
  const styleMatch = html.match(/<style[^>]*>([\s\S]{0,500})/i);
  console.log('style preview', styleMatch?.[1]?.slice(0, 300));
  const imgs = [...html.matchAll(/<img[^>]+>/gi)].slice(0, 3);
  console.log(
    'sample imgs',
    imgs.map((m) => m[0]),
  );
}

for (const file of files) {
  const docId = file.startsWith('lfb') ? 115 : file.startsWith('nwt') ? 5 : 9;
  await inspect(file, docId);
}
