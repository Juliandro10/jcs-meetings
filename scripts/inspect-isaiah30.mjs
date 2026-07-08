import os from 'node:os';
import path from 'node:path';
import { openJwpubBundle } from '../electron/jwpub-bundle.ts';
import { decryptContent } from '../electron/jwpub-crypto.ts';

const file = path.join(os.tmpdir(), 'jcs-nwtsty-probe', 'nwtsty_T_.jwpub');
const bundle = await openJwpubBundle(file);
const enc = bundle.db.exec(
  'SELECT Content FROM BibleChapter WHERE BookNumber=23 AND ChapterNumber=30 LIMIT 1',
)[0]?.values?.[0]?.[0];
const html = decryptContent(bundle.keyIv, enc);
console.log('len', html.length);

for (const needle of ['Egito', 'de mim', 'Faraó', 'Zoã', 'humilhação']) {
  const idx = html.indexOf(needle);
  if (idx >= 0) {
    console.log('\n---', needle, '---');
    console.log(html.slice(Math.max(0, idx - 120), idx + needle.length + 180));
  }
}

const markerRe = /<(sup|span|a)[^>]{0,220}>/gi;
const seen = new Set();
for (const m of html.matchAll(markerRe)) {
  const tag = m[0];
  if (/tt|ts|fn|footnote|class="[a-z]"|vc|ref|note/i.test(tag) && !seen.has(tag)) {
    seen.add(tag);
    console.log('\nTAG:', tag);
  }
}
