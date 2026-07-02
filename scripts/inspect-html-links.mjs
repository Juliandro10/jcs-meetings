import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';
import initSqlJs from 'sql.js';
import { downloadJwpub } from '../electron/jw-download.ts';

const require = createRequire(import.meta.url);
const cache = path.join(os.tmpdir(), 'jcs-img-test');
await downloadJwpub({ pub: 'mwb', issue: '202605', lang: 'T', cacheDir: cache });
const file = path.join(cache, 'mwb_T_202605.jwpub');

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

const content = db.exec('SELECT Content FROM Document WHERE DocumentId=9')[0].values[0][0];
const dec = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
const html = inflate(Buffer.concat([dec.update(Buffer.from(content)), dec.final()]), { to: 'string' });

console.log('IMG samples:');
for (const m of [...html.matchAll(/<img[^>]+>/gi)].slice(0, 3)) {
  console.log(m[0].slice(0, 300));
}

console.log('\nLINK samples:');
for (const m of [...html.matchAll(/<a[^>]+>/gi)].slice(0, 8)) {
  console.log(m[0].slice(0, 350));
}

console.log('\nTables:');
const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values?.map((v) => v[0]);
console.log(tables?.join(', '));

const linkRows = db.exec('SELECT Link, Caption FROM Extract LIMIT 5');
console.log('\nExtract sample:', linkRows[0]?.values);

const pubMedia = db.exec('SELECT * FROM Publication LIMIT 1');
console.log('\nPublication cols:', pubMedia[0]?.columns);
console.log('Publication row:', pubMedia[0]?.values[0]);
