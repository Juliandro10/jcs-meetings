import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { createHash, createDecipheriv } from 'node:crypto';
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

function decrypt(keyIv, enc) {
  const buf = Buffer.from(enc);
  const d = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  return inflate(Buffer.concat([d.update(buf), d.final()]), { to: 'string' });
}

const cacheCandidates = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub'),
  path.join(os.tmpdir(), 'jcs-img-test'),
  path.join(os.tmpdir(), 'jcs-nwt'),
];

let nwtPath = '';
for (const dir of cacheCandidates) {
  const p = path.join(dir, 'nwt_T_.jwpub');
  if (fs.existsSync(p)) {
    nwtPath = p;
    console.log('nwt at', p);
    break;
  }
}

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(nwtPath));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));
const row = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const keyIv = derive(row.map(String));

const enc = db.exec('SELECT Content FROM BibleChapter WHERE BookNumber=24 AND ChapterNumber=11 LIMIT 1')[0].values[0][0];
const chapterHtml = decrypt(keyIv, enc);

const idx = chapterHtml.indexOf('v24-11-21');
console.log('snippet around v24-11-21:', chapterHtml.slice(idx, idx + 800));

const badRegex = [...chapterHtml.matchAll(/<span id="v(\d+)-(\d+)-(\d+)-\d+" class="v">([\s\S]*?)<\/span>/gi)];
const v21bad = badRegex.find((m) => m[3] === '21');
console.log('\nbad regex capture for v21:', v21bad?.[4]?.slice(0, 200));

// Try BibleVerse table
const ch = db.exec('SELECT FirstVerseId, LastVerseId FROM BibleChapter WHERE BookNumber=24 AND ChapterNumber=11')[0].values[0];
const verses = db.exec(
  `SELECT BibleVerseId, Label, Content FROM BibleVerse WHERE BibleVerseId BETWEEN ${ch[0]} AND ${ch[1]} ORDER BY BibleVerseId`,
)[0].values;
const v21row = verses.find((v) => String(v[1]) === '21');
console.log('\nBibleVerse 21 label', v21row?.[1], 'content len', v21row?.[2]?.length);
if (v21row?.[2]) {
  try {
    console.log('verse decrypt', decrypt(keyIv, v21row[2]).slice(0, 300));
  } catch (e) {
    console.log('verse decrypt fail', e.message);
  }
}

// mwb extract
const mwbDirs = cacheCandidates.map((d) => path.join(d, 'mwb_T_202605.jwpub')).filter(fs.existsSync);
console.log('\nmwb files', mwbDirs);
if (mwbDirs[0]) {
  const mouter = await JSZip.loadAsync(fs.readFileSync(mwbDirs[0]));
  const minner = await JSZip.loadAsync(await mouter.file('contents').async('nodebuffer'));
  const mmanifest = JSON.parse(await mouter.file('manifest.json').async('string'));
  const mdb = new SQL.Database(await minner.file(mmanifest.publication.fileName).async('nodebuffer'));
  const mrow = mdb.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
  const mkey = derive(mrow.map(String));
  for (const link of ['p/T:2004803/17-17', 'p/T:2004803/17-17/']) {
    const r = mdb.exec(`SELECT Link, Caption FROM Extract WHERE Link='${link}' LIMIT 1`)[0]?.values?.[0];
    console.log('extract', link, r?.[0], strip(r?.[1]));
  }
  const enc2 = mdb.exec(`SELECT Content FROM Extract WHERE Link='p/T:2004803/17-17'`)[0]?.values?.[0]?.[0];
  if (enc2) console.log('extract html', decrypt(mkey, enc2).slice(0, 400));
}

function strip(v) {
  return String(v ?? '').replace(/<[^>]+>/g, ' ').slice(0, 80);
}

// inspect actual anchor in document 9
if (mwbDirs[0]) {
  const mouter = await JSZip.loadAsync(fs.readFileSync(mwbDirs[0]));
  const minner = await JSZip.loadAsync(await mouter.file('contents').async('nodebuffer'));
  const mmanifest = JSON.parse(await mouter.file('manifest.json').async('string'));
  const mdb = new SQL.Database(await minner.file(mmanifest.publication.fileName).async('nodebuffer'));
  const mrow = mdb.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
  const mkey = derive(mrow.map(String));
  const doc = decrypt(mkey, mdb.exec('SELECT Content FROM Document WHERE DocumentId=9')[0].values[0][0]);
  const anchors = [...doc.matchAll(/<a[^>]+href="(jwpub:[^"]+)"[^>]*>([^<]*)<\/a>/gi)];
  console.log('\nanchors in doc9:');
  for (const a of anchors.slice(0, 10)) console.log(a[1], '|', a[2]);
}
