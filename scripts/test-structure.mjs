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

const f = path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub', 'mwb_T_202605.jwpub');
const SQL = await initSqlJs({ locateFile: (x) => require.resolve(`sql.js/dist/${x}`) });
const outer = await JSZip.loadAsync(fs.readFileSync(f));
const inner = await JSZip.loadAsync(await outer.file('contents').async('nodebuffer'));
const m = JSON.parse(await outer.file('manifest.json').async('string'));
const db = new SQL.Database(await inner.file(m.publication.fileName).async('nodebuffer'));
const row = db.exec('SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1')[0].values[0];
const key = derive(row.map(String));
const enc = db.exec('SELECT Content FROM Document WHERE DocumentId=9')[0].values[0][0];
const buf = Buffer.from(enc);
const d = createDecipheriv('aes-128-cbc', key.subarray(0, 16), key.subarray(16, 32));
const html = inflate(Buffer.concat([d.update(buf), d.final()]), { to: 'string' });

console.log('Bible links:');
for (const match of html.matchAll(/jwpub:\/\/b\/[^"']+/g)) console.log(match[0]);

const { extractDocumentStructure } = await import('../electron/document-structure.ts');
const structure = extractDocumentStructure(html);

// manual trace
function stripHtml(value) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
const blocks = [];
const blockRe = /<(p|li|h[1-6])[^>]*\bdata-pid="(\d+)"[^>]*>([\s\S]*?)<\/\1>/gi;
let match;
while ((match = blockRe.exec(html)) !== null) {
  const text = stripHtml(match[3]);
  if (text.length >= 4) blocks.push({ blockId: match[2], text });
}
let section = '';
for (const block of blocks) {
  if (block.blockId === '14') {
    const upper = block.text.toUpperCase();
    const sectionSkip = ['TESOUROS DA PALAVRA', 'FAÇA SEU MELHOR NO MINISTÉRIO', 'NOSSA VIDA CRISTÃ', 'LEITURA DA BÍBLIA'].some(s => upper.includes(s));
    const isPart = /^\d+\.\s/.test(block.text) || block.text.toLowerCase().includes('joias espirituais') || block.text.toLowerCase().includes('necessidades locais') || block.text.toLowerCase().includes('estudo bíblico de congregação');
    console.log('manual p14', { sectionSkip, isPart, section });
  }
}
console.log('\nFields:', structure.fields);
console.log('\nParts:');
for (const part of structure.parts) {
  console.log(`- p${part.blockId} [${part.kind}] field=${part.fieldId ?? '-'} | ${part.title}`);
}
const b14 = structure.blocks.find((b) => b.blockId === '14');
console.log('p14 debug:', b14?.text, /joias espirituais/i.test(b14?.text ?? ''));
for (const b of structure.blocks) {
  if (/joias|tt20|tt25|^\d+\./i.test(b.text) || ['12','14','17','20','22','24'].includes(b.blockId)) {
    console.log(`p${b.blockId}: ${b.text.slice(0, 90)}`);
  }
}
