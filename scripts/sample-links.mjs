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
  const [lang, sym, year, issue] = row;
  const parts = [lang, sym, year];
  if (issue && issue !== '0' && Number(issue) !== 0) parts.push(issue);
  const hash = createHash('sha256').update(parts.join('_')).digest();
  const keyIv = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR[i];
  return keyIv;
}

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const file = path.join(os.tmpdir(), 'jcs-img-test', 'mwb_T_202605.jwpub');
const outer = await JSZip.loadAsync(fs.readFileSync(file));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));
const row = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const keyIv = derive(row);
const content = db.exec('SELECT Content FROM Document WHERE DocumentId=9')[0].values[0][0];
const buf = Buffer.from(content);
const d = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
const html = inflate(Buffer.concat([d.update(buf), d.final()]), { to: 'string' });

const links = [...html.matchAll(/href="(jwpub:[^"]+)"/gi)].map((m) => m[1]);
console.log('links', [...new Set(links)].slice(0, 15));

const imgs = [...html.matchAll(/src="([^"]+)"/gi)].map((m) => m[1]).filter((s) => s.includes('media'));
console.log('imgs', [...new Set(imgs)].slice(0, 5));
