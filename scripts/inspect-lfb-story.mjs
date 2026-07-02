import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getDocumentHtml } from '../electron/jwpub-reader.ts';

const f = path.join(os.homedir(), 'AppData', 'Roaming', 'JCS Meetings', 'cache', 'jwpub', 'lfb_T_.jwpub');

for (const docId of [115, 116]) {
  const html = await getDocumentHtml(f, docId);
  console.log('\n=== Document', docId, '===');
  console.log('textareas', (html.match(/<textarea/gi) ?? []).length);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(text.slice(0, 500));
  console.log('...');
  console.log('questions?', text.match(/O que você|Que lições|Como colocar|pergunta/gi));
}
