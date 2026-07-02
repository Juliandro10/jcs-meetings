import path from 'node:path';
import os from 'node:os';
import { getDocumentHtml } from '../electron/jwpub-reader.ts';

const f = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/cache/jwpub/lfb_T_.jwpub');
const html = await getDocumentHtml(f, 115);
const re = /src="([^"]+)"/g;
let m;
let n = 0;
while ((m = re.exec(html)) && n < 5) {
  console.log(m[1]);
  n++;
}

// simulate broken parse
const sample = 'jcs-media://lfb/T//images/foo.jpg';
const url = new URL(sample);
const parts = url.pathname.split('/').filter(Boolean);
console.log('broken parse parts', parts);
