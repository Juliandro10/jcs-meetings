import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { createHash, createDecipheriv } from 'node:crypto';
import { inflate } from 'pako';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const cacheDir = path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub');

// Inline test of fixed logic
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
function extractVerseHtml(chapterHtml, book, chapter, verse) {
  const idPrefix = `id="v${book}-${chapter}-${verse}-`;
  const startIdx = chapterHtml.indexOf(idPrefix);
  if (startIdx === -1) return null;
  const openTagEnd = chapterHtml.indexOf('>', startIdx);
  const nextVerseRe = new RegExp(`<span id="v${book}-${chapter}-\\d+-`, 'g');
  nextVerseRe.lastIndex = openTagEnd + 1;
  const nextMatch = nextVerseRe.exec(chapterHtml);
  const endIdx = nextMatch?.index ?? chapterHtml.length;
  let inner = chapterHtml.slice(openTagEnd + 1, endIdx).replace(/<\/span>\s*$/, '');
  inner = inner.replace(/^<span[^>]*class="vl"[^>]*>[\s\S]*?<\/span>/i, '');
  return inner.trim() || null;
}

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const nwtOuter = await JSZip.loadAsync(fs.readFileSync(path.join(cacheDir, 'nwt_T_.jwpub')));
const nwtInner = await JSZip.loadAsync(await nwtOuter.file('contents').async('nodebuffer'));
const nwtManifest = JSON.parse(await nwtOuter.file('manifest.json').async('string'));
const nwtDb = new SQL.Database(await nwtInner.file(nwtManifest.publication.fileName).async('nodebuffer'));
const nwtRow = nwtDb.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const nwtKey = derive(nwtRow.map(String));
const chEnc = nwtDb.exec('SELECT Content FROM BibleChapter WHERE BookNumber=24 AND ChapterNumber=11 LIMIT 1')[0].values[0][0];
const chapterHtml = decrypt(nwtKey, chEnc);
const v21 = extractVerseHtml(chapterHtml, 24, 11, 21);
console.log('v21 text preview:', v21?.replace(/<[^>]+>/g, ' ').slice(0, 180));

const mwbOuter = await JSZip.loadAsync(fs.readFileSync(path.join(cacheDir, 'mwb_T_202605.jwpub')));
const mwbInner = await JSZip.loadAsync(await mwbOuter.file('contents').async('nodebuffer'));
const mwbManifest = JSON.parse(await mwbOuter.file('manifest.json').async('string'));
const mwbDb = new SQL.Database(await mwbInner.file(mwbManifest.publication.fileName).async('nodebuffer'));
const mwbRow = mwbDb.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const mwbKey = derive(mwbRow.map(String));
const link = 'p/T:2004803/17-17';
const extract = mwbDb.exec(`SELECT Caption, Content FROM Extract WHERE Link='${link}' LIMIT 1`)[0]?.values?.[0];
console.log('extract found', !!extract, strip(extract?.[0]));
console.log('extract text', decrypt(mwbKey, extract[1]).replace(/<[^>]+>/g, ' ').slice(0, 180));

function strip(v) {
  return String(v ?? '').replace(/<[^>]+>/g, ' ').trim().slice(0, 80);
}
