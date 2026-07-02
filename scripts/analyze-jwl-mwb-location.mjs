import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflate } from 'pako';

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');

const cacheDir = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/cache/jwpub');
const jwpub = path.join(cacheDir, 'mwb_T_202605.jwpub');
const prepDir = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/prep');

async function openJwpub(filePath) {
  const outer = await JSZip.loadAsync(fs.readFileSync(filePath));
  const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
  const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
  const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));
  const pub = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
  const parts = [String(pub[0]), String(pub[1]), String(pub[2])];
  if (pub[3] && pub[3] !== '0' && Number(pub[3]) !== 0) parts.push(String(pub[3]));
  const hash = createHash('sha256').update(parts.join('_')).digest();
  const keyIv = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR[i];
  return { db, keyIv, pub };
}

function decrypt(db, keyIv, docId) {
  const enc = Buffer.from(db.exec(`SELECT Content FROM Document WHERE DocumentId=${docId}`)[0].values[0][0]);
  const dec = createDecipheriv('aes-128-cbc', keyIv.subarray(0, 16), keyIv.subarray(16, 32));
  return inflate(Buffer.concat([dec.update(enc), dec.final()]), { to: 'string' });
}

const { db, keyIv, pub } = await openJwpub(jwpub);
console.log('Publication:', { mepsLanguage: pub[0], symbol: pub[1], issueTagNumber: pub[2], year: pub[3] });

const doc9 = db.exec('SELECT DocumentId, MepsDocumentId, Title FROM Document WHERE DocumentId=9')[0]?.values?.[0];
console.log('Document 9:', doc9);

const dated = db.exec('SELECT DocumentId, FirstDateOffset, LastDateOffset FROM DatedText WHERE DocumentId=9')[0]?.values?.[0];
console.log('DatedText doc9:', dated);

const pvi = db.exec(
  'SELECT PublicationViewItemId, ParentPublicationViewItemId, DefaultDocumentId, Title FROM PublicationViewItem LIMIT 10',
)[0];
console.log('PublicationViewItem sample:', pvi?.values?.slice(0, 5));

const pvid = db.exec(
  'SELECT DocumentId, PublicationViewItemId FROM PublicationViewItemDocument WHERE DocumentId=9',
)[0]?.values;
console.log('PublicationViewItemDocument doc9:', pvid);

const pubCols = db.exec('SELECT * FROM Publication LIMIT 1')[0]?.columns;
const pubRow = db.exec('SELECT * FROM Publication LIMIT 1')[0]?.values?.[0];
console.log('Publication cols:', pubCols);
console.log('Publication row:', pubRow);

const pvi11 = db.exec('SELECT * FROM PublicationViewItem WHERE PublicationViewItemId=11')[0]?.values?.[0];
console.log('PublicationViewItem 11:', pvi11);

const datedFull = db.exec('SELECT * FROM DatedText WHERE DocumentId=9')[0]?.values;
console.log('DatedText doc9 full:', datedFull);

const pvifCols = db.exec('SELECT * FROM PublicationViewItemField LIMIT 1')[0]?.columns;
console.log('PublicationViewItemField cols:', pvifCols);
const pvif = db.exec('SELECT * FROM PublicationViewItemField LIMIT 20')[0]?.values;
console.log('PublicationViewItemField rows:', pvif);

const dp = db.exec(
  'SELECT ParagraphIndex, BeginPosition, EndPosition FROM DocumentParagraph WHERE DocumentId=9 ORDER BY ParagraphIndex LIMIT 15',
)[0]?.values;
console.log('DocumentParagraph doc9 sample:', dp);

const html = decrypt(db, keyIv, 9);
const textareas = [...html.matchAll(/<textarea[^>]*>/gi)].map((m) => m[0]);
console.log('\ntextareas:', textareas);

const pids = [...new Set([...html.matchAll(/data-pid="(\d+)"/g)].map((m) => m[1]))].slice(0, 20);
console.log('data-pid sample:', pids);

for (const pid of ['5', '8', '12', '20', '22']) {
  const idx = html.indexOf(`data-pid="${pid}"`);
  console.log(`pid ${pid} exists:`, idx >= 0, idx >= 0 ? html.slice(idx, idx + 120).replace(/\s+/g, ' ') : '');
}

// Compare ParagraphIndex vs data-pid
const dpAll = db.exec('SELECT ParagraphIndex FROM DocumentParagraph WHERE DocumentId=9 ORDER BY ParagraphIndex')[0].values.map((v) => Number(v[0]));
const htmlPids = [...html.matchAll(/data-pid="(\d+)"/g)].map((m) => Number(m[1]));
console.log('\nParagraphIndex max', dpAll.at(-1), 'data-pid max', Math.max(...htmlPids));
for (const pid of [5, 6, 8, 12, 20, 22, 30]) {
  console.log(`pid ${pid}: in DocumentParagraph=${dpAll.includes(pid)}, in html=${htmlPids.includes(pid)}`);
}

// Inspect latest user export if exists
const exports = [
  path.join(os.homedir(), 'Downloads/JCSMeetingsBackup_2026-07-02.jwlibrary'),
  path.join(os.homedir(), 'Downloads/JCSMeetingsBackup_2026-07-03.jwlibrary'),
];
for (const exp of exports) {
  if (!fs.existsSync(exp)) continue;
  const zip = await JSZip.loadAsync(fs.readFileSync(exp));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const dbName = manifest.userDataBackup?.databaseName ?? 'userData.db';
  const udb = new SQL.Database(await zip.file(dbName).async('nodebuffer'));
  console.log('\n=== EXPORT', path.basename(exp), '===');
  const locs = udb.exec('SELECT * FROM Location')[0]?.values;
  console.log('Locations:', locs);
  const fields = udb.exec('SELECT LocationId, TextTag, substr(Value,1,50) FROM InputField')[0]?.values;
  console.log('InputFields:', fields);
  const marks = udb.exec(
    'SELECT um.LocationId, br.Identifier, br.StartToken, br.EndToken, um.StyleIndex FROM UserMark um JOIN BlockRange br ON br.UserMarkId=um.UserMarkId LIMIT 5',
  )[0]?.values;
  console.log('Marks:', marks);
}
