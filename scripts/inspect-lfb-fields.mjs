import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { getDocumentHtml } from '../electron/jwpub-reader.ts';

const f = path.join(os.homedir(), 'AppData/Roaming/JCS Meetings/cache/jwpub/lfb_T_.jwpub');

for (const docId of [115, 116]) {
  const html = await getDocumentHtml(f, docId);
  const text = html.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
  const lines = text.split('\n').filter((l) => l.trim());
  console.log('\n=== doc', docId, '===');
  console.log('first lines:', lines.slice(0, 8));
  console.log('last lines:', lines.slice(-15));
  console.log('input count', (html.match(/<input/gi) ?? []).length);
  console.log('contenteditable', html.includes('contenteditable'));
  await fs.writeFile(path.join('scripts', `lfb-doc-${docId}.txt`), text.slice(0, 8000));
}
