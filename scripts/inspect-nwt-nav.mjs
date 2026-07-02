import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { createHash } from 'node:crypto';
import { inflate } from 'pako';

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const XOR = Buffer.from('11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7', 'hex');

const nwt = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/cache/jwpub/nwt_T_.jwpub');
const outer = await JSZip.loadAsync(fs.readFileSync(nwt));
const manifest = JSON.parse(await outer.file('manifest.json').async('string'));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const db = new SQL.Database(await inner.file(manifest.publication.fileName).async('nodebuffer'));

const pub = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const parts = [String(pub[0]), String(pub[1]), String(pub[2])];
if (pub[3] && pub[3] !== '0') parts.push(String(pub[3]));
const hash = createHash('sha256').update(parts.join('_')).digest();
const keyIv = Buffer.alloc(32);
for (let i = 0; i < 32; i++) keyIv[i] = hash[i] ^ XOR[i];

console.log('Tables:', db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.map(v=>v[0]).filter(n=>n.includes('Publication')||n.includes('Document')||n.includes('Bible')));

const pvi = db.exec('SELECT PublicationViewItemId, ParentPublicationViewItemId, DefaultDocumentId, Title, Type FROM PublicationViewItem ORDER BY PublicationViewItemId LIMIT 30')[0];
console.log('\nPublicationViewItem (first 30):');
for (const row of pvi.values) console.log(row);

const allPvi = db.exec('SELECT PublicationViewItemId, ParentPublicationViewItemId, DefaultDocumentId, Title, Type FROM PublicationViewItem ORDER BY PublicationViewItemId')[0];
console.log('\nTotal PVI:', allPvi.values.length);

const roots = allPvi.values.filter(r => r[1] == null || r[1] === 0);
console.log('\nRoot items:');
for (const r of roots) console.log(r);
