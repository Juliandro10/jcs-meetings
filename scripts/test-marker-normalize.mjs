import os from 'node:os';
import path from 'node:path';
import { openJwpubBundle } from '../electron/jwpub-bundle.ts';
import { decryptContent } from '../electron/jwpub-crypto.ts';

const MARGINAL = /<span\s+data-mid="\d+"\s+class="m">([^<]{1,4})<span\s+class="tt m"[^>]*><\/span><\/span>/gi;
const FOOTNOTE = /<span\s+data-fnid="\d+"\s+class="fn(?:\s+pr)?">([^<]{1,4})<span\s+(?:id="footnotesource\d+"\s+)?class="tt fn"[^>]*><\/span><\/span>/gi;
const EMPTY_TT = /<span\s+(?:id="footnotesource\d+"\s+)?class="tt (?:m|fn|vl|cl)"[^>]*><\/span>/gi;

function normalize(html) {
  let out = html.replace(MARGINAL, '<sup class="tnme-marker">$1</sup>');
  out = out.replace(FOOTNOTE, '<sup class="tnme-marker">$1</sup>');
  out = out.replace(EMPTY_TT, '');
  return out;
}

const file = path.join(os.tmpdir(), 'jcs-nwtsty-probe', 'nwtsty_T_.jwpub');
const bundle = await openJwpubBundle(file);
const enc = bundle.db.exec(
  'SELECT Content FROM BibleChapter WHERE BookNumber=23 AND ChapterNumber=30 LIMIT 1',
)[0]?.values?.[0]?.[0];
const html = decryptContent(bundle.keyIv, enc);
const out = normalize(html);
for (const needle of ['Egito', 'de mim', 'Faraó', 'Zoã', 'humilhação']) {
  const idx = out.indexOf(needle);
  console.log('\n---', needle, '---');
  console.log(out.slice(idx, idx + needle.length + 80));
}
console.log('\nremaining class="m":', (out.match(/class="m"/g) || []).length);
console.log('tnme-marker count:', (out.match(/tnme-marker/g) || []).length);
