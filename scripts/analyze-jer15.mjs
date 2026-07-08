import os from 'node:os';
import path from 'node:path';
import { openJwpubBundle } from '../electron/jwpub-bundle.ts';
import { decryptContent } from '../electron/jwpub-crypto.ts';

const file = path.join(os.tmpdir(), 'jcs-nwtsty-probe', 'nwtsty_T_.jwpub');
const bundle = await openJwpubBundle(file);
const enc = bundle.db.exec(
  'SELECT Content FROM BibleChapter WHERE BookNumber=24 AND ChapterNumber=15 LIMIT 1',
)[0]?.values?.[0]?.[0];
const html = decryptContent(bundle.keyIv, enc);

function analyzeVerse(verse) {
  const startRe = new RegExp(`<span id="v24-15-${verse}-\\d+"`);
  const startMatch = startRe.exec(html);
  if (!startMatch) {
    console.log(`\n${verse}: NOT FOUND`);
    return;
  }
  const startIdx = startMatch.index;
  const anyRe = new RegExp(`<span id="v24-15-(\\d+)-\\d+"`, 'g');
  anyRe.lastIndex = startMatch.index + startMatch[0].length;
  let endIdx = html.length;
  let m;
  while ((m = anyRe.exec(html))) {
    if (Number(m[1]) > verse) {
      endIdx = m.index;
      console.log(`\n${verse}: next verse ${m[1]} at ${m.index}, block len ${endIdx - startIdx}`);
      break;
    }
  }
  const block = html.slice(startIdx, endIdx);
  const ids = [...block.matchAll(/id="(v24-15-[^"]+)"/g)].map((x) => x[1]);
  console.log('  ids in block:', ids.join(', '));
  console.log('  text preview:', block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220));
}

for (const v of [16, 17, 18]) analyzeVerse(v);

// show raw around verse 16-17 boundary
const idx = html.indexOf('v24-15-16-');
console.log('\n--- raw snippet ---\n', html.slice(idx, idx + 1800));
