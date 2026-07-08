import os from 'node:os';
import path from 'node:path';
import { openJwpubBundle } from '../electron/jwpub-bundle.ts';
import { decryptContent } from '../electron/jwpub-crypto.ts';

const file = path.join(os.tmpdir(), 'jcs-nwtsty-probe', 'nwtsty_T_.jwpub');
const bundle = await openJwpubBundle(file);

function analyze(book, chapter, verse) {
  const enc = bundle.db.exec(
    `SELECT Content FROM BibleChapter WHERE BookNumber=${book} AND ChapterNumber=${chapter} LIMIT 1`,
  )[0]?.values?.[0]?.[0];
  const html = decryptContent(bundle.keyIv, enc);
  const prefix = `v${book}-${chapter}-${verse}-`;
  const ids = [...html.matchAll(/id="(v[^"]+)"/g)]
    .map((m) => m[1])
    .filter((id) => id.startsWith(prefix));
  console.log(`\n${book}:${chapter}:${verse} — spans com prefixo "${prefix}": ${ids.length}`);
  console.log('  ids:', ids.slice(0, 6).join(', '));
}

for (const [b, c, v] of [
  [43, 3, 16],
  [40, 5, 3],
  [19, 23, 1],
  [24, 11, 21],
  [23, 30, 2],
]) {
  analyze(b, c, v);
}
