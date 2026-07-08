import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openJwpubBundle } from '../electron/jwpub-bundle.ts';

const file = path.join(os.tmpdir(), 'jcs-nwtsty-probe', 'nwtsty_T_.jwpub');
const bundle = await openJwpubBundle(file);
let css = '';
for (const name of Object.keys(bundle.inner.files).sort()) {
  if (name.endsWith('.css')) {
    const entry = bundle.inner.file(name);
    if (entry) css += (await entry.async('string')) + '\n';
  }
}
console.log('css len', css.length);
for (const needle of ['.m,', '.m ', '.fn,', '.fn ', '.tt,', 'span.m', 'footnotesource']) {
  const idx = css.indexOf(needle);
  console.log(needle, idx >= 0 ? css.slice(Math.max(0, idx - 40), idx + 180) : 'NOT FOUND');
}
fs.writeFileSync(path.join(os.tmpdir(), 'nwtsty-all.css'), css);
console.log('wrote', path.join(os.tmpdir(), 'nwtsty-all.css'));
