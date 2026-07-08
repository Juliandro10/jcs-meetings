import os from 'node:os';
import path from 'node:path';
import { openJwpubBundle } from '../electron/jwpub-bundle.ts';

const file = path.join(os.tmpdir(), 'jcs-nwtsty-probe', 'nwtsty_T_.jwpub');
const bundle = await openJwpubBundle(file);
const names = Object.keys(bundle.inner.files).sort();
console.log('total files', names.length);
for (const n of names) {
  if (/\.css$|stylesheet|style/i.test(n)) console.log(n);
}
console.log('sample:', names.slice(0, 30).join('\n'));
